import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';

interface Control {
  id: string;
  rule_key: string;
  client_id: string | null;
  branch_id: string | null;
  enabled: boolean;
  local_time: string;
  version: number;
}
interface Overview {
  rules: { key: string; name: string; description: string; routing: string; window: string }[];
  controls: Control[];
  companies: { id: string; name: string }[];
  branches: { id: string; clientId: string; name: string }[];
}
interface Preview {
  plan: { digest: string; controlId: string | null; enabled: boolean; scope: unknown };
  groups: { name: string; count: number; examples: { id: string; title: string }[] }[];
  note: string;
  asOf: string;
}
interface Run {
  actor_name?: string;
  id: string;
  rule_key: string;
  status: string;
  trigger_type: string;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  result: Record<string, number> | null;
  snapshot: { scope: { clientId?: string; branchId?: string } };
  retry_of: string | null;
}

@Component({
  selector: 'app-automation-control',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './automation-control.component.html',
  styleUrl: './automation-control.component.scss',
})
export class AutomationControlComponent implements OnInit, OnDestroy {
  readonly base = `${environment.apiBaseUrl}/api/v1/automation/control-center`;
  overview = signal<Overview | null>(null);
  preview = signal<Preview | null>(null);
  runs = signal<Run[]>([]);
  changes = signal<any[]>([]);
  error = signal('');
  message = signal('');
  busy = signal(false);
  previewing = signal(false);
  loading = signal(true);
  ruleKey = 'expiry';
  company = '';
  branch = '';
  enabled = true;
  localTime = '07:00';
  page = 1;
  total = 0;
  private subscriptions = new Subscription();
  private previewRequest?: Subscription;
  private overviewRequest?: Subscription;
  private historyRequest?: Subscription;
  private changesRequest?: Subscription;
  constructor(private http: HttpClient) {}
  ngOnInit() {
    this.refresh();
  }
  ngOnDestroy() {
    this.previewRequest?.unsubscribe();
    this.subscriptions.unsubscribe();
  }
  get rule() {
    return this.overview()?.rules.find((r) => r.key === this.ruleKey);
  }
  get branches() {
    return (this.overview()?.branches || []).filter((b) => b.clientId === this.company);
  }
  get exact() {
    return this.overview()?.controls.find(
      (c) =>
        c.rule_key === this.ruleKey &&
        (c.client_id || '') === this.company &&
        (c.branch_id || '') === this.branch,
    );
  }
  get dirty() {
    return (
      !this.exact || this.exact.enabled !== this.enabled || this.exact.local_time !== this.localTime
    );
  }
  get configured() {
    return (this.overview()?.controls || []).filter((c) => c.rule_key === this.ruleKey);
  }
  refresh(successMessage?: string) {
    this.overviewRequest?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.subscriptions.add(
      (this.overviewRequest = this.http.get<Overview>(this.base).subscribe({
        next: (r) => {
          this.overview.set(r);
          this.loading.set(false);
          this.syncSelection();
          if (successMessage) this.message.set(successMessage);
        },
        error: (e) => {
          this.loading.set(false);
          this.fail(e);
        },
      })),
    );
    this.history();
    this.loadChanges();
  }
  syncSelection() {
    const controls = this.overview()?.controls || [];
    const inherited =
      this.exact ||
      controls.find(
        (c) => c.rule_key === this.ruleKey && c.client_id === this.company && !c.branch_id,
      ) ||
      controls.find((c) => c.rule_key === this.ruleKey && !c.client_id);
    this.enabled = inherited?.enabled ?? true;
    this.localTime = inherited?.local_time || '07:00';
    this.invalidate();
  }
  companyChanged() {
    this.branch = '';
    this.syncSelection();
  }
  selectRule(key: string) {
    this.ruleKey = key;
    this.syncSelection();
  }
  invalidate() {
    this.previewRequest?.unsubscribe();
    this.previewing.set(false);
    this.preview.set(null);
    this.error.set('');
    this.message.set('');
  }
  scope() {
    return {
      ruleKey: this.ruleKey,
      ...(this.company ? { clientId: this.company } : {}),
      ...(this.branch ? { branchId: this.branch } : {}),
    };
  }
  showPreview() {
    this.previewRequest?.unsubscribe();
    this.previewing.set(true);
    this.preview.set(null);
    this.error.set('');
    this.previewRequest = this.http.post<Preview>(`${this.base}/preview`, this.scope()).subscribe({
      next: (r) => {
        this.preview.set(r);
        this.previewing.set(false);
      },
      error: (e) => {
        this.previewing.set(false);
        this.fail(e);
      },
    });
  }
  save() {
    this.busy.set(true);
    this.error.set('');
    this.subscriptions.add(
      this.http
        .post(`${this.base}/settings`, {
          ...this.scope(),
          enabled: this.enabled,
          localTime: this.localTime,
          version: this.exact?.version || 0,
        })
        .subscribe({
          next: () => {
            this.busy.set(false);
            this.refresh('Settings saved. Preview again before starting a manual run.');
          },
          error: (e) => {
            this.busy.set(false);
            this.fail(e);
          },
        }),
    );
  }
  inherit() {
    const control = this.exact;
    if (!control) return;
    this.busy.set(true);
    this.subscriptions.add(
      this.http
        .post(`${this.base}/settings/${control.id}/inherit`, { version: control.version })
        .subscribe({
          next: () => {
            this.busy.set(false);
            this.refresh();
          },
          error: (e) => {
            this.busy.set(false);
            this.fail(e);
          },
        }),
    );
  }
  run() {
    const preview = this.preview();
    if (!preview?.plan.controlId || this.dirty) return;
    this.execute(`${this.base}/runs`, {
      controlId: preview.plan.controlId,
      previewDigest: preview.plan.digest,
      requestId: crypto.randomUUID(),
    });
  }
  retry(run: Run) {
    this.execute(`${this.base}/runs/${run.id}/retry`, { requestId: crypto.randomUUID() });
  }
  private execute(url: string, body: unknown) {
    this.busy.set(true);
    this.error.set('');
    this.message.set('Automation is running. Its history will show the result.');
    this.subscriptions.add(
      this.http.post<Run>(url, body).subscribe({
        next: (r) => {
          this.busy.set(false);
          this.message.set(`Run ${this.statusLabel(r.status).toLowerCase()}.`);
          this.preview.set(null);
          this.page = 1;
          this.history();
        },
        error: (e) => {
          this.busy.set(false);
          this.message.set('');
          this.fail(e);
          this.history();
        },
      }),
    );
  }
  history() {
    this.historyRequest?.unsubscribe();
    this.subscriptions.add(
      (this.historyRequest = this.http
        .get<{ rows: Run[]; total: number }>(`${this.base}/runs`, { params: { page: this.page } })
        .subscribe({
          next: (r) => {
            this.runs.set(r.rows);
            this.total = r.total;
          },
          error: (e) => this.fail(e),
        })),
    );
  }
  loadChanges() {
    this.changesRequest?.unsubscribe();
    this.subscriptions.add(
      (this.changesRequest = this.http
        .get<any[]>(`${this.base}/changes`)
        .subscribe({ next: (r) => this.changes.set(r), error: (e) => this.fail(e) })),
    );
  }
  movePage(delta: number) {
    this.page += delta;
    this.history();
  }
  private fail(e: any) {
    const detail = e?.error?.message;
    this.error.set(
      Array.isArray(detail)
        ? detail.join('. ')
        : typeof detail === 'string'
          ? detail
          : 'Could not load or update automation. Please try again.',
    );
  }
  scopeLabel(client?: string | null, branch?: string | null) {
    const data = this.overview();
    const name = data?.companies.find((c) => c.id === client)?.name || 'Company';
    return branch
      ? `${name} · ${data?.branches.find((b) => b.id === branch)?.name || 'Branch'}`
      : client
        ? name
        : 'Default · all remaining companies and branches';
  }
  ruleName(key: string) {
    return this.overview()?.rules.find((r) => r.key === key)?.name || key;
  }
  statusLabel(status: string) {
    return (
      (
        {
          SUCCEEDED: 'Completed',
          PARTIAL: 'Partly completed',
          FAILED: 'Failed',
          INTERRUPTED: 'Interrupted',
          RUNNING: 'Running',
        } as Record<string, string>
      )[status] || status
    );
  }
  resultText(result: Record<string, number> | null) {
    const labels: Record<string, string> = {
      tasksCreated: 'new tasks',
      filingsCreated: 'new filings',
      alertsSent: 'reminders',
      remindersSent: 'task reminders',
      escalated: 'escalations',
      auditReminders: 'audit reminders',
      remindersSentCount: 'reminders',
      failures: 'failed items',
      totalOpenNc: 'open findings',
    };
    return (
      Object.entries(result || {})
        .filter(([k]) => labels[k])
        .map(([k, v]) => `${v} ${labels[k]}`)
        .join(' · ') || 'No new actions reported'
    );
  }
}

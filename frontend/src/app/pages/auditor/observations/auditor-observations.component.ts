import { AuditContextComponent } from '../audit-context.component';
import { auditOptionLabel } from '../audit-context';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { Subject, combineLatest, Subscription } from 'rxjs';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';
import { finalize, takeUntil } from 'rxjs/operators';

import { AuditorObservationsService } from '../../../core/auditor-observations.service';
import { AuditsService } from '../../../core/audits.service';
import { ToastService } from '../../../shared/toast/toast.service';

type ObservationAction = 'ACKNOWLEDGE' | 'RESOLVE' | 'VERIFY' | 'REOPEN';

@Component({
  standalone: true,
  selector: 'app-auditor-observations',
  imports: [AuditContextComponent, IconComponent, FormsModule, RouterModule],
  templateUrl: './auditor-observations.component.html',
  styleUrls: ['./auditor-observations.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditorObservationsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private listRequest?: Subscription;
  private focusedId = '';
  private editorVersion = 0;
  private listVersion = 0;
  private auditOptionsVersion = 0;
  recordScope: 'ACTUAL' | 'TEST' = 'ACTUAL';
  directAuditView = false;
  loadError = '';

  readonly auditOptionLabel = auditOptionLabel;
  contextFor(row: any): any {
    return this.audits.find(a => a.id === row?.auditId) || row?.audit || null;
  }
  get selectedAudit(): any {
    return this.selected ? this.contextFor(this.selected) : this.audits.find(a => a.id === this.filterAuditId);
  }
  loading = true;
  busy = false;

  audits: any[] = [];
  observations: any[] = [];
  categories: any[] = [];
  selected: any | null = null;

  filterAuditId = '';
  filterStatus = '';
  filterRisk = '';
  filterSearch = '';

  verificationNotes = '';
  branchResponseDraft = '';
  capaDraft = '';

  readonly statusOptions = ['', 'NEEDS_ACTION', 'OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  readonly riskOptions = ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  constructor(
    private readonly observationsApi: AuditorObservationsService,
    private readonly auditsApi: AuditsService,
    private readonly route: ActivatedRoute,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
    private readonly protectedFiles: ProtectedFileService,
  ) {}

  ngOnInit(): void {
    this.loadCategories();

    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([_, query]) => {
        this.filterAuditId = query.get('auditId') || '';
        this.recordScope = query.get('recordScope') === 'TEST' ? 'TEST' : 'ACTUAL';
        this.directAuditView = !!this.filterAuditId && !query.get('recordScope');
        this.focusedId = query.get('observationId') || '';
        this.filterStatus = query.get('status') || '';
        this.filterRisk = query.get('risk') || '';
        this.selected = null;
        this.loadAudits();
        this.loadObservations();
      });
  }

  ngOnDestroy(): void {
    this.listRequest?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get filteredRows(): any[] {
    const q = this.filterSearch.trim().toLowerCase();
    return this.observations.filter((row) => {
      if (this.filterStatus === 'NEEDS_ACTION') {
        if (!['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(this.statusKey(row.status))) return false;
      } else if (this.filterStatus && this.statusKey(row.status) !== this.filterStatus) return false;
      if (this.filterRisk && this.statusKey(row.risk) !== this.filterRisk) return false;
      if (!q) return true;
      const text = `${row.observation || ''} ${row.clause || ''} ${row.recommendation || ''}`.toLowerCase();
      return text.includes(q);
    }).sort((a,b) => {
      const priority: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (priority[this.statusKey(a.risk)] ?? 4) - (priority[this.statusKey(b.risk)] ?? 4) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
  }

  get openCount(): number {
    return this.observations.filter((o) => ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(this.statusKey(o.status))).length;
  }

  get verificationPendingCount(): number {
    return this.observations.filter((o) => this.statusKey(o.status) === 'RESOLVED').length;
  }

  get closedCount(): number {
    return this.observations.filter((o) => this.statusKey(o.status) === 'CLOSED').length;
  }

  get selectedAgeDays(): number {
    if (!this.selected?.createdAt) return 0;
    const created = new Date(this.selected.createdAt);
    if (Number.isNaN(created.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
  }

  get canAcknowledge(): boolean {
    return !this.actionGuardReason('ACKNOWLEDGE');
  }

  get canResolve(): boolean {
    return !this.actionGuardReason('RESOLVE');
  }

  get canVerifyClosure(): boolean {
    return !this.actionGuardReason('VERIFY');
  }

  get canReopen(): boolean {
    return !this.actionGuardReason('REOPEN');
  }

  get actionGuardrails(): Array<{ label: string; passed: boolean; detail: string }> {
    const items: Array<{ label: string; action: ObservationAction }> = [
      { label: 'Acknowledge', action: 'ACKNOWLEDGE' },
      { label: 'Mark Resolved', action: 'RESOLVE' },
      { label: 'Verify & Close', action: 'VERIFY' },
      { label: 'Reopen', action: 'REOPEN' },
    ];

    return items.map((item) => {
      const reason = this.actionGuardReason(item.action);
      return {
        label: item.label,
        passed: !reason,
        detail: reason || 'Ready',
      };
    });
  }

  trackObs(_: number, row: any): string {
    return String(row?.id || '');
  }

  applyFilters(): void {
    if (!this.filteredRows.some(row => row.id === this.selected?.id)) {
      this.selected = null;
      if (this.filteredRows.length) this.selectObservation(this.filteredRows[0]);
    }
    this.cdr.markForCheck();
  }

  changeRecordScope(): void {
    this.directAuditView = false;
    this.filterAuditId = ''; this.focusedId = '';
    this.verificationNotes = ''; this.branchResponseDraft = ''; this.capaDraft = '';
    this.editorVersion++;
    this.loadAudits();
    this.loadObservations();
  }

  changeAuditFilter(): void {
    this.directAuditView = false;
    this.loadObservations();
  }

  clearFilters(): void {
    this.filterStatus = '';
    this.filterRisk = '';
    this.filterSearch = '';
    this.applyFilters();
  }

  chooseStatus(status: string): void {
    this.filterStatus = status;
    this.applyFilters();
  }

  nextObservation(): void {
    const rows = this.filteredRows;
    if (!rows.length) return;
    const index = rows.findIndex(row => row.id === this.selected?.id);
    this.selectObservation(rows[(index + 1) % rows.length]);
  }

  selectObservation(row: any): void {
    this.editorVersion++;
    this.selected = row;
    this.verificationNotes = '';
    this.branchResponseDraft = row?.elaboration || '';
    this.capaDraft = row?.recommendation || '';
  }

  saveCapaDetails(): void {
    if (!this.selected || this.busy || this.loading || this.statusKey(this.selected.status) === 'CLOSED') return;
    const target = { ...this.selected };
    const auditId = this.filterAuditId;
    const listVersion = this.listVersion;
    const editorVersion = this.editorVersion;
    const responseDraft = this.branchResponseDraft;
    const capaDraft = this.capaDraft;
    const payload = {
      elaboration: responseDraft.trim() || null,
      recommendation: capaDraft.trim() || null,
    };
    this.busy = true;
    this.observationsApi
      .update(target.id, payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (response) => {
          this.toast.success('CAPA details saved');
          if (this.filterAuditId !== auditId || this.listVersion !== listVersion) return;
          // The update returns the saved observation. Merge its data without
          // reloading and resetting an unrelated or subsequently edited draft.
          const saved = { ...target, ...payload, ...(response?.id === target.id ? response : {}) };
          this.observations = this.observations.map(row => row.id === target.id ? saved : row);
          if (this.selected?.id === target.id) {
            this.selected = saved;
            if (this.editorVersion === editorVersion) {
              if (this.branchResponseDraft === responseDraft) this.branchResponseDraft = saved.elaboration || '';
              if (this.capaDraft === capaDraft) this.capaDraft = saved.recommendation || '';
            }
          }
          this.cdr.markForCheck();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to save CAPA details'),
      });
  }

  markAcknowledged(): void {
    const guard = this.actionGuardReason('ACKNOWLEDGE');
    if (guard) {
      this.toast.warning(guard);
      return;
    }
    this.updateStatus('ACKNOWLEDGED');
  }

  markResolved(): void {
    const guard = this.actionGuardReason('RESOLVE');
    if (guard) {
      this.toast.warning(guard);
      return;
    }
    this.updateStatus('RESOLVED');
  }

  verifyClosure(): void {
    if (!this.selected || this.busy) return;
    const guard = this.actionGuardReason('VERIFY');
    if (guard) {
      this.toast.warning(guard);
      return;
    }
    this.busy = true;
    this.observationsApi
      .verifyObservationClosure(this.selected.id, this.verificationNotes || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Observation verified and closed');
          this.refreshSelected();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to verify observation'),
      });
  }

  reopenSelected(): void {
    if (!this.selected || this.busy) return;
    const guard = this.actionGuardReason('REOPEN');
    if (guard) {
      this.toast.warning(guard);
      return;
    }
    this.busy = true;
    this.observationsApi
      .reopenObservation(this.selected.id, this.verificationNotes || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Observation reopened');
          this.refreshSelected();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to reopen observation'),
      });
  }

  exportPdf(): void {
    if (!this.filterAuditId) {
      this.toast.warning('Select an audit to export observations PDF');
      return;
    }
    const auditId = this.filterAuditId;
    const scope = this.directAuditView ? undefined : this.recordScope;
    this.observationsApi
      .exportAuditObservationsPdf(auditId, scope)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `observations-${scope || 'AUDIT'}-${auditId}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => this.toast.error('Failed to export observations PDF'),
      });
  }

  evidencePaths(row: any): string[] {
    const raw = row?.evidenceFilePaths;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((x) => String(x));
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((x) => String(x));
      } catch {
        return [raw];
      }
    }
    return [];
  }

  openEvidence(path: string): void {
    // Use the authenticated, ownership-checked endpoint; never a raw public link.
    if (/^https?:/i.test(path)) {
      try { if (new URL(path).origin !== window.location.origin) {
        this.toast.warning('External evidence links require review.'); return;
      } } catch { return; }
    }
    this.protectedFiles.open(path).pipe(takeUntil(this.destroy$)).subscribe({
      error: () => this.toast.error('Evidence could not be opened or access was denied'),
    });
  }

  ageClass(row: any): string {
    const age = this.ageDays(row);
    if (age > 30) return 'badge badge--bad';
    if (age > 14) return 'badge badge--warn';
    return 'badge badge--info';
  }

  ageDaysFor(row: any): number {
    return this.ageDays(row);
  }

  statusClass(status: string): string {
    const key = this.statusKey(status);
    if (key === 'CLOSED') return 'badge badge--good';
    if (key === 'RESOLVED') return 'badge badge--info';
    if (key === 'OPEN') return 'badge badge--warn';
    return 'badge badge--muted';
  }

  riskClass(risk: string): string {
    const key = this.statusKey(risk);
    if (key === 'CRITICAL') return 'badge badge--bad';
    if (key === 'HIGH') return 'badge badge--warn';
    if (key === 'MEDIUM') return 'badge badge--info';
    return 'badge badge--muted';
  }

  formatDate(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private updateStatus(status: string): void {
    if (!this.selected || this.busy) return;
    this.busy = true;
    this.observationsApi
      // Verification notes belong to verify/reopen actions. A status change
      // must not replace the saved Branch response, even with a stale copy.
      .update(this.selected.id, { status })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(`Status updated to ${status}`);
          this.refreshSelected();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to update status'),
      });
  }

  private refreshSelected(): void {
    const selectedId = this.selected?.id ? String(this.selected.id) : null;
    this.loadObservations(() => {
      if (!selectedId) return;
      const found = this.observations.find((o) => String(o.id) === selectedId);
      if (found) this.selectObservation(found);
    });
  }

  loadObservations(afterLoad?: () => void): void {
    this.listVersion++;
    this.listRequest?.unsubscribe();
    const retainId = this.focusedId || this.selected?.id;
    this.selected = null;
    this.observations = [];
    this.loadError = '';
    this.loading = true;
    this.listRequest = this.observationsApi
      .list(this.filterAuditId || undefined, this.directAuditView ? undefined : this.recordScope)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows: any) => {
          this.observations = Array.isArray(rows) ? rows : [];
          const focused = this.filteredRows.find(row => row.id === retainId);
          if (focused) this.selectObservation(focused);
          else if (!this.focusedId && this.filteredRows.length) this.selectObservation(this.filteredRows[0]);
          else if (this.focusedId) this.loadError = 'This observation is not available in your assigned audit scope.';
          this.focusedId = '';

          if (afterLoad) afterLoad();
        },
        error: (err) => {
          this.observations = [];
          this.selected = null;
          this.loadError = 'Observations could not be loaded. Retry before taking action.';
          this.toast.error(err?.error?.message || 'Failed to load observations');
        },
      });
  }

  private loadAudits(): void {
    const version = ++this.auditOptionsVersion;
    this.audits = [];
    this.auditsApi
      .auditorListAllAudits(this.recordScope)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          if (version !== this.auditOptionsVersion) return;
          this.audits = Array.isArray(res) ? res : (res?.data || []);
          this.cdr.markForCheck();
        },
        error: () => {
          if (version !== this.auditOptionsVersion) return;
          this.audits = [];
        },
      });
  }

  private loadCategories(): void {
    this.observationsApi
      .listCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.categories = Array.isArray(res) ? res : [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.categories = [];
        },
      });
  }

  private ageDays(row: any): number {
    const created = row?.createdAt ? new Date(row.createdAt) : null;
    if (!created || Number.isNaN(created.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
  }

  private statusKey(status: string | null | undefined): string {
    return String(status || '').toUpperCase();
  }

  private actionGuardReason(action: ObservationAction): string | null {
    if (this.loading || this.busy) return 'Wait for the current request to finish.';
    if (!this.selected) return 'Select an observation first.';

    const status = this.statusKey(this.selected.status) || 'OPEN';

    if (action === 'ACKNOWLEDGE') {
      if (status !== 'OPEN') return `Only OPEN observations can be acknowledged (current: ${status}).`;
      return null;
    }

    if (action === 'RESOLVE') {
      if (!['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(status)) {
        return `Only OPEN/ACKNOWLEDGED observations can be resolved (current: ${status}).`;
      }
      return null;
    }

    if (action === 'VERIFY') {
      if (status !== 'RESOLVED') return `Only RESOLVED observations can be verified (current: ${status}).`;
      if (this.verificationNotes.trim().length < 5) {
        return 'Add at least 5 characters in verification notes before closure.';
      }
      return null;
    }

    if (!['RESOLVED', 'CLOSED'].includes(status)) {
      return `Only RESOLVED/CLOSED observations can be reopened (current: ${status}).`;
    }
    if (this.verificationNotes.trim().length < 5) {
      return 'Add at least 5 characters in verification notes before reopening.';
    }
    return null;
  }
}

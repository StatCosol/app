import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { CloseArea, CloseBranch, CloseClient, CloseStage, MonthlyCloseResponse, MonthlyCloseService } from '../../core/monthly-close.service';

@Component({
  standalone: true,
  selector: 'app-monthly-close',
  imports: [CommonModule, FormsModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './monthly-close.component.html',
  styleUrl: './monthly-close.component.scss',
})
export class MonthlyCloseComponent implements OnInit {
  private readonly service = inject(MonthlyCloseService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  private branchRequest?: Subscription;
  readonly clients = signal<CloseClient[]>([]);
  readonly branches = signal<CloseBranch[]>([]);
  readonly data = signal<MonthlyCloseResponse | null>(null);
  readonly busy = signal(false);
  readonly optionsBusy = signal(true);
  readonly error = signal('');
  clientId = '';
  branchId = '';
  month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  search = '';
  onlyOutstanding = true;
  readonly stateLabels = { REVIEW: 'Needs action', RECORDED_CLEAR: 'Recorded checks clear', UNKNOWN: 'Needs checking', UNAVAILABLE: 'Check unavailable' };
  readonly portal = this.router.url.split('/')[1];

  ngOnInit() { this.loadClients(); }

  loadClients() {
    this.optionsBusy.set(true);
    this.error.set('');
    this.service.clients().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ clients }) => {
        this.clients.set(clients);
        this.optionsBusy.set(false);
        if (clients.length === 1) { this.clientId = clients[0].id; this.changeClient(); }
      },
      error: () => { this.optionsBusy.set(false); this.error.set('Could not load your companies. Please retry.'); },
    });
  }

  changeClient() {
    this.invalidate();
    this.branchRequest?.unsubscribe();
    this.branches.set([]);
    this.branchId = '';
    this.optionsBusy.set(false);
    if (!this.clientId) return;
    this.optionsBusy.set(true);
    this.branchRequest = this.service.branches(this.clientId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ branches }) => {
        this.branches.set(branches);
        this.optionsBusy.set(false);
        if (branches.length === 1) { this.branchId = branches[0].id; this.load(); }
      },
      error: () => { this.optionsBusy.set(false); this.error.set('Could not load branches. Choose the company again to retry.'); },
    });
  }

  invalidate() {
    this.request?.unsubscribe();
    this.data.set(null);
    this.busy.set(false);
    this.error.set('');
  }

  load() {
    this.invalidate();
    if (!this.clientId || !this.branchId || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(this.month)) {
      this.error.set('Choose a company, branch and valid reporting month.'); return;
    }
    this.busy.set(true);
    this.request = this.service.get(this.clientId, this.branchId, this.month).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => { this.data.set(data); this.busy.set(false); },
      error: () => { this.busy.set(false); this.error.set('Could not load this monthly review. Check your access and retry.'); },
    });
  }

  visibleIssues(stage: CloseStage) {
    const term = this.search.trim().toLowerCase();
    return stage.issues.filter((issue) => `${issue.title} ${issue.reason} ${issue.owner}`.toLowerCase().includes(term));
  }

  visibleStages() {
    return (this.data()?.stages ?? []).filter((stage) => !this.onlyOutstanding || stage.state !== 'RECORDED_CLEAR');
  }

  actionPath(area: CloseArea): string | null {
    if (this.portal === 'crm') {
      const routes: Partial<Record<CloseArea, string>> = {
        documents: `/crm/clients/${this.clientId}/documents`,
        payroll: `/crm/clients/${this.clientId}/payroll-status`, returns: '/crm/returns',
      };
      return routes[area] ?? null;
    }
    const branch = this.portal === 'branch';
    if (branch && area === 'returns') return null;
    const routes: Record<CloseArea, string> = {
      attendance: branch ? '/branch/attendance' : '/client/attendance',
      payroll: branch ? '/branch/payroll' : '/client/payroll',
      documents: branch ? '/branch/contractors' : `/client/contractors/branch/${this.branchId}`,
      returns: branch ? '/branch/uploads/yearly' : '/client/compliance/returns',
    };
    return routes[area];
  }
}

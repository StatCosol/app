import { IconComponent } from '../../shared/ui/icon/icon.component';
import { ContractorPayrollOversightComponent } from '../../shared/contractor-payroll/contractor-payroll-oversight.component';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { PayrollEngineApiService, SalaryStructure, StructureItem, StructureApprovalStatus } from '../payroll/payroll-engine-api.service';

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DRAFT';
type QueueRow = SalaryStructure & { clientName?: string | null };
type ApprovalMode = 'RUNS' | 'STRUCTURES';
type RunStatusFilter = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
type PayrollRunRow = {
  payrollCategory?: 'REGULAR' | 'INTERN';
  id: string;
  clientId: string;
  clientName?: string | null;
  periodYear: number;
  periodMonth: number;
  status: string;
  employeeCount: number;
  createdAt?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  approvalComments?: string | null;
};

@Component({
  selector: 'app-cco-payroll-approvals',
  standalone: true,
  imports: [IconComponent, FormsModule, ContractorPayrollOversightComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cco-payroll-approvals.component.html',
  styleUrls: ['./cco-payroll-approvals.component.scss'],
})
export class CcoPayrollApprovalsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private queueVersion = 0;
  private detailVersion = 0;
  private readonly completedRunStatuses = new Map<string, string>();
  private readonly completedStructureStatuses = new Map<string, StructureApprovalStatus>();
  private readonly base = `${environment.apiBaseUrl}/api/v1/payroll/engine`;
  private readonly payrollBase = `${environment.apiBaseUrl}/api/v1/payroll`;

  loading = true;
  runsLoading = true;
  acting = false;
  mode: ApprovalMode = 'RUNS';
  statusFilter: StatusFilter = 'PENDING';
  recordScope: 'ACTUAL' | 'TEST' = 'ACTUAL';
  statusOptions: StatusFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'DRAFT'];
  runStatusFilter: RunStatusFilter = 'SUBMITTED';
  runStatusOptions: RunStatusFilter[] = ['SUBMITTED', 'APPROVED', 'REJECTED', 'PROCESSED'];

  structures: QueueRow[] = [];
  runs: PayrollRunRow[] = [];
  selected: QueueRow | null = null;
  selectedRun: PayrollRunRow | null = null;
  selectedItems: StructureItem[] = [];
  itemsLoading = false;

  constructor(
    private readonly http: HttpClient,
    private readonly engineApi: PayrollEngineApiService,
    private readonly toast: ToastService,
    private readonly dialog: ConfirmDialogService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadRuns();
  }

  ngOnDestroy(): void {
    this.queueVersion++;
    this.detailVersion++;
    this.destroy$.next();
    this.destroy$.complete();
  }

  clientLabel(row: QueueRow): string {
    return row.clientName || 'Client name unavailable';
  }

  runClientLabel(row: PayrollRunRow): string {
    return (row.payrollCategory === 'INTERN' ? 'Intern · ' : '') + (row.clientName || 'Client name unavailable');
  }

  setMode(mode: ApprovalMode): void {
    this.mode = mode;
    if (mode === 'RUNS') {
      this.loadRuns();
    } else {
      this.load();
    }
  }

  refresh(): void {
    if (this.mode === 'RUNS') this.loadRuns();
    else this.load();
  }

  loadRuns(): void {
    const version = ++this.queueVersion;
    this.clearCompletedStatuses();
    const status = this.runStatusFilter;
    const current = () => version === this.queueVersion && this.mode === 'RUNS' && status === this.runStatusFilter;
    this.clearSelection();
    this.runs = [];
    this.runsLoading = true;
    this.loading = false;
    this.http
      .get<PayrollRunRow[]>(`${this.payrollBase}/runs`, {
        params: { status },
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (!current()) return;
          this.runsLoading = false;
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          if (!current()) return;
          this.runs = this.reconcileRunRows(rows || []);
        },
        error: (e) => {
          if (!current()) return;
          this.toast.error(e?.error?.message || 'Failed to load payroll run approvals');
          this.runs = [];
        },
      });
  }

  load(): void {
    const version = ++this.queueVersion;
    this.clearCompletedStatuses();
    const status = this.statusFilter;
    const recordScope = this.recordScope;
    const current = () => version === this.queueVersion && this.mode === 'STRUCTURES' && status === this.statusFilter && recordScope === this.recordScope;
    this.clearSelection();
    this.structures = [];
    this.runsLoading = false;
    this.loading = true;
    this.http
      .get<QueueRow[]>(`${this.base}/structures/approval-queue`, {
        params: { status, recordScope },
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (!current()) return;
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          if (!current()) return;
          this.structures = this.reconcileStructureRows(rows || []);
        },
        error: (e) => {
          if (!current()) return;
          this.toast.error(e?.error?.message || 'Failed to load approval queue');
          this.structures = [];
        },
      });
  }

  selectRow(row: QueueRow): void {
    const version = ++this.detailVersion;
    const queueVersion = this.queueVersion;
    const current = () => version === this.detailVersion && queueVersion === this.queueVersion && this.mode === 'STRUCTURES' && this.selected?.id === row.id;
    this.selected = row;
    this.selectedItems = [];
    this.itemsLoading = true;
    this.engineApi
      .listStructureItems(row.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (!current()) return;
          this.itemsLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (items) => {
          if (!current()) return;
          this.selectedItems = items || [];
        },
        error: () => {
          if (!current()) return;
          this.selectedItems = [];
        },
      });
  }

  selectRun(row: PayrollRunRow): void {
    this.detailVersion++;
    this.selectedRun = row;
  }

  private clearSelection(): void {
    this.detailVersion++;
    this.selected = null;
    this.selectedRun = null;
    this.selectedItems = [];
    this.itemsLoading = false;
  }

  private actionContextIsCurrent(): () => boolean {
    const mode = this.mode;
    const queueVersion = this.queueVersion;
    const detailVersion = this.detailVersion;
    const status = mode === 'RUNS' ? this.runStatusFilter : this.statusFilter;
    const recordScope = this.recordScope;
    return () => mode === this.mode && queueVersion === this.queueVersion && detailVersion === this.detailVersion &&
      status === (mode === 'RUNS' ? this.runStatusFilter : this.statusFilter) &&
      (mode === 'RUNS' || recordScope === this.recordScope);
  }

  private clearCompletedStatuses(): void {
    this.completedRunStatuses.clear();
    this.completedStructureStatuses.clear();
  }

  private reconcileRunRows(rows: PayrollRunRow[]): PayrollRunRow[] {
    return rows.map(row => this.completedRunStatuses.has(row.id)
      ? { ...row, status: this.completedRunStatuses.get(row.id)! } : row)
      .filter(row => !this.completedRunStatuses.has(row.id) || row.status === this.runStatusFilter);
  }

  private reconcileStructureRows(rows: QueueRow[]): QueueRow[] {
    return rows.map(row => this.completedStructureStatuses.has(row.id)
      ? { ...row, approvalStatus: this.completedStructureStatuses.get(row.id)! } : row)
      .filter(row => !this.completedStructureStatuses.has(row.id) || row.approvalStatus === this.statusFilter);
  }

  private completeRunReview(id: string, status: 'APPROVED' | 'REJECTED'): void {
    if (this.mode !== 'RUNS') return;
    // Retain this completion for an already-pending read in the same queue.
    // A subsequent fresh load starts a new snapshot and clears the overlay.
    this.completedRunStatuses.set(id, status);
    this.runs = this.reconcileRunRows(this.runs);
    if (this.selectedRun?.id === id) this.selectedRun = { ...this.selectedRun, status };
  }

  private completeStructureReview(id: string, status: 'APPROVED' | 'REJECTED'): void {
    if (this.mode !== 'STRUCTURES') return;
    this.completedStructureStatuses.set(id, status);
    this.structures = this.reconcileStructureRows(this.structures);
    if (this.selected?.id === id) this.selected = { ...this.selected, approvalStatus: status };
  }

  async approveRun(row: PayrollRunRow): Promise<void> {
    if (row.status !== 'SUBMITTED') return;
    const current = this.actionContextIsCurrent();
    const result = await this.dialog.prompt(
      'Approve Payroll Run',
      `Approve ${this.periodLabel(row)} payroll run for ${this.runClientLabel(row)}? Comments are optional.`,
      { placeholder: 'Comments', confirmText: 'Approve' },
    );
    if (!result.confirmed) return;
    this.acting = true;
    this.http
      .post(`${environment.apiBaseUrl}/api/v1/payroll/runs/${row.id}/approve`, {
        comments: (result.value || '').trim() || undefined,
      })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.acting = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success('Payroll run approved');
          this.completeRunReview(row.id, 'APPROVED');
          if (current()) this.loadRuns();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Run approval failed'),
      });
  }

  async rejectRun(row: PayrollRunRow): Promise<void> {
    if (row.status !== 'SUBMITTED') return;
    const current = this.actionContextIsCurrent();
    const result = await this.dialog.prompt(
      'Reject Payroll Run',
      `Reason for rejecting ${this.periodLabel(row)} payroll run for ${this.runClientLabel(row)}:`,
      { placeholder: 'Reason', confirmText: 'Reject' },
    );
    if (!result.confirmed) return;
    const reason = (result.value || '').trim();
    if (!reason) {
      this.toast.error('Rejection reason is required');
      return;
    }
    this.acting = true;
    this.http
      .post(`${environment.apiBaseUrl}/api/v1/payroll/runs/${row.id}/reject`, { reason })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.acting = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success('Payroll run rejected');
          this.completeRunReview(row.id, 'REJECTED');
          if (current()) this.loadRuns();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Run rejection failed'),
      });
  }

  async approve(row: QueueRow): Promise<void> {
    if (row.approvalStatus !== 'PENDING') return;
    const current = this.actionContextIsCurrent();
    const recordScope = this.recordScope;
    const ok = await this.dialog.confirm(
      'Approve Structure',
      `Approve "${row.name}" for ${this.clientLabel(row)}?`,
    );
    if (!ok) return;
    this.acting = true;
    this.engineApi
      .approveStructure(row.id)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.acting = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success('Structure approved');
          if (recordScope === this.recordScope) this.completeStructureReview(row.id, 'APPROVED');
          if (current()) this.load();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Approve failed'),
      });
  }

  async reject(row: QueueRow): Promise<void> {
    if (row.approvalStatus !== 'PENDING') return;
    const current = this.actionContextIsCurrent();
    const recordScope = this.recordScope;
    const result = await this.dialog.prompt(
      'Reject Structure',
      'Reason for rejection (required):',
      { placeholder: 'Reason', confirmText: 'Reject' },
    );
    if (!result.confirmed) return;
    const reason = (result.value || '').trim();
    if (!reason) {
      this.toast.error('Rejection reason is required');
      return;
    }
    this.acting = true;
    this.engineApi
      .rejectStructure(row.id, reason)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.acting = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success('Structure rejected');
          if (recordScope === this.recordScope) this.completeStructureReview(row.id, 'REJECTED');
          if (current()) this.load();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Reject failed'),
      });
  }

  badgeClass(s: StructureApprovalStatus): string {
    switch (s) {
      case 'PENDING': return 'badge badge-warn';
      case 'APPROVED': return 'badge badge-ok';
      case 'REJECTED': return 'badge badge-err';
      default: return 'badge badge-muted';
    }
  }

  runBadgeClass(s: string): string {
    switch ((s || '').toUpperCase()) {
      case 'SUBMITTED': return 'badge badge-warn';
      case 'APPROVED': return 'badge badge-ok';
      case 'REJECTED': return 'badge badge-err';
      default: return 'badge badge-muted';
    }
  }

  formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    return new Date(s).toLocaleDateString();
  }

  formatDateTime(s: string | null | undefined): string {
    if (!s) return '—';
    return new Date(s).toLocaleString();
  }

  periodLabel(row: Pick<PayrollRunRow, 'periodMonth' | 'periodYear'>): string {
    const d = new Date(Number(row.periodYear), Number(row.periodMonth) - 1, 1);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  scopeText(row: QueueRow): string {
    const parts: string[] = [row.scopeType];
    if (row.branchId) parts.push(`Branch: ${row.branchName || 'Name unavailable'}`);
    if (row.departmentId) parts.push(`Department: ${row.departmentName || 'Name unavailable'}`);
    if (row.gradeId) parts.push(`Grade: ${row.gradeName || 'Name unavailable'}`);
    if (row.employeeId) parts.push(`Employee: ${row.employeeName || 'Name unavailable'}`);
    return parts.join(' / ');
  }

  trackRow(_: number, r: QueueRow) {
    return r.id;
  }

  trackRun(_: number, r: PayrollRunRow) {
    return r.id;
  }
}

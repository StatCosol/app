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
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cco-payroll-approvals.component.html',
  styleUrls: ['./cco-payroll-approvals.component.scss'],
})
export class CcoPayrollApprovalsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly base = `${environment.apiBaseUrl}/api/v1/payroll/engine`;
  private readonly payrollBase = `${environment.apiBaseUrl}/api/v1/payroll`;

  loading = true;
  runsLoading = true;
  acting = false;
  mode: ApprovalMode = 'RUNS';
  statusFilter: StatusFilter = 'PENDING';
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
    this.destroy$.next();
    this.destroy$.complete();
  }

  clientLabel(row: QueueRow): string {
    return row.clientName || row.clientId.slice(0, 8);
  }

  runClientLabel(row: PayrollRunRow): string {
    return row.clientName || row.clientId.slice(0, 8);
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
    this.runsLoading = true;
    this.selectedRun = null;
    this.http
      .get<PayrollRunRow[]>(`${this.payrollBase}/runs`, {
        params: { status: this.runStatusFilter },
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.runsLoading = false;
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.runs = rows || [];
        },
        error: (e) => {
          this.toast.error(e?.error?.message || 'Failed to load payroll run approvals');
          this.runs = [];
        },
      });
  }

  load(): void {
    this.loading = true;
    this.selected = null;
    this.selectedItems = [];
    this.http
      .get<QueueRow[]>(`${this.base}/structures/approval-queue`, {
        params: { status: this.statusFilter },
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.structures = rows || [];
        },
        error: (e) => {
          this.toast.error(e?.error?.message || 'Failed to load approval queue');
          this.structures = [];
        },
      });
  }

  selectRow(row: QueueRow): void {
    this.selected = row;
    this.selectedItems = [];
    this.itemsLoading = true;
    this.engineApi
      .listStructureItems(row.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.itemsLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (items) => {
          this.selectedItems = items || [];
        },
        error: () => {
          this.selectedItems = [];
        },
      });
  }

  selectRun(row: PayrollRunRow): void {
    this.selectedRun = row;
  }

  async approveRun(row: PayrollRunRow): Promise<void> {
    if (row.status !== 'SUBMITTED') return;
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
          this.loadRuns();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Run approval failed'),
      });
  }

  async rejectRun(row: PayrollRunRow): Promise<void> {
    if (row.status !== 'SUBMITTED') return;
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
          this.loadRuns();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Run rejection failed'),
      });
  }

  async approve(row: QueueRow): Promise<void> {
    if (row.approvalStatus !== 'PENDING') return;
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
          this.load();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Approve failed'),
      });
  }

  async reject(row: QueueRow): Promise<void> {
    if (row.approvalStatus !== 'PENDING') return;
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
          this.load();
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
    if (row.branchId) parts.push(`branch=${row.branchId.slice(0, 8)}`);
    if (row.departmentId) parts.push(`dept=${row.departmentId.slice(0, 8)}`);
    if (row.gradeId) parts.push(`grade=${row.gradeId.slice(0, 8)}`);
    if (row.employeeId) parts.push(`emp=${row.employeeId.slice(0, 8)}`);
    return parts.join(' / ');
  }

  trackRow(_: number, r: QueueRow) {
    return r.id;
  }

  trackRun(_: number, r: PayrollRunRow) {
    return r.id;
  }
}

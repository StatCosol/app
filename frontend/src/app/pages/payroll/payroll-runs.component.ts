import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../shared/ui';
import { ToastService } from '../../shared/toast/toast.service';
import { PayrollApiService, PayrollClient } from './payroll-api.service';

interface PayrollRunItem {
  id: string;
  clientId?: string;
  clientName?: string;
  periodMonth: number;
  periodYear: number;
  status: string;
  employeeCount?: number;
  createdAt?: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  approvalComments?: string;
}

interface RunEmployeeRow {
  employeeId: string;
  empCode: string;
  employeeName: string;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
}

interface StepItem {
  key: string;
  label: string;
}

interface RunEvent {
  kind: 'SYSTEM' | 'IMPORT' | 'PROCESS' | 'SUBMIT' | 'APPROVE' | 'PUBLISH' | 'RERUN' | 'ROLLBACK';
  title: string;
  at: string;
  note?: string;
}

interface RunApprovalStatus {
  status?: string;
  submittedByUserId?: string | null;
  submittedAt?: string | null;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  approvalComments?: string | null;
  rejectedByUserId?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

interface ExceptionBucket {
  key: string;
  label: string;
  count: number;
}

interface GuardrailItem {
  key: 'IMPORT' | 'PROCESS' | 'SUBMIT' | 'APPROVE' | 'PUBLISH' | 'RERUN' | 'ROLLBACK';
  label: string;
  allowed: boolean;
  reason: string;
}

@Component({
  standalone: true,
  selector: 'app-payroll-runs',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './payroll-runs.component.html',
  styleUrls: ['./payroll-runs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollRunsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  runs: PayrollRunItem[] = [];
  filteredRuns: PayrollRunItem[] = [];
  selectedRun: PayrollRunItem | null = null;
  runEmployees: RunEmployeeRow[] = [];

  clients: PayrollClient[] = [];
  loadingRuns = false;
  loadingRunDetail = false;
  loadingClients = false;
  actionBusy = false;
  importBusy = false;
  loadingApprovalStatus = false;

  selectedClientId = '';
  selectedMonth = 0;
  selectedYear = 0;
  statusFilter = '';
  searchText = '';

  importFile: File | null = null;
  selectedExceptionBucketKey = 'ALL';
  showFullHistory = false;
  private readonly runEventHistory: Record<string, RunEvent[]> = {};
  private readonly runApprovalStatusByRunId: Record<string, RunApprovalStatus> = {};

  readonly statusOptions = ['', 'DRAFT', 'PROCESSED', 'SUBMITTED', 'APPROVED', 'REJECTED'];
  readonly monthOptions = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  readonly yearOptions = this.generateYearOptions();

  readonly processSteps: StepItem[] = [
    { key: 'input-freeze', label: 'Input Freeze' },
    { key: 'attendance-import', label: 'Attendance Import' },
    { key: 'arrears', label: 'Arrears' },
    { key: 'preview', label: 'Preview' },
    { key: 'approval', label: 'Approval' },
    { key: 'publish', label: 'Publish' },
  ];

  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
    private readonly toast: ToastService,
    private readonly payrollApi: PayrollApiService,
  ) {}

  ngOnInit(): void {
    this.loadClients();
    this.loadRuns();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadRuns(): void {
    this.loadingRuns = true;
    const params = this.runQueryParams();
    this.http
      .get<any>('/api/v1/payroll/runs', { params })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingRuns = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          const rows = this.toArray(res).map((row: any) => ({
            id: String(row?.id || ''),
            clientId: row?.clientId || row?.client_id || '',
            clientName: row?.clientName || row?.client_name || '-',
            periodMonth: Number(row?.periodMonth || row?.period_month || 0),
            periodYear: Number(row?.periodYear || row?.period_year || 0),
            status: String(row?.status || 'DRAFT').toUpperCase(),
            employeeCount: Number(row?.employeeCount || 0),
            createdAt: row?.createdAt || row?.created_at || null,
            submittedAt: row?.submittedAt || row?.submitted_at || null,
            approvedAt: row?.approvedAt || row?.approved_at || null,
            rejectedAt: row?.rejectedAt || row?.rejected_at || null,
            rejectionReason: row?.rejectionReason || row?.rejection_reason || null,
            approvalComments: row?.approvalComments || row?.approval_comments || null,
          }));
          this.runs = rows;
          this.filteredRuns = this.applyLocalSearch(rows);

          if (this.selectedRun) {
            const updated = this.filteredRuns.find((r) => r.id === this.selectedRun?.id);
            this.selectedRun = updated || (this.filteredRuns[0] || null);
          } else {
            this.selectedRun = this.filteredRuns[0] || null;
          }

          if (this.selectedRun) {
            this.loadRunWorkspaceData(this.selectedRun.id, false);
          } else {
            this.runEmployees = [];
          }
        },
        error: (err) => {
          this.runs = [];
          this.filteredRuns = [];
          this.selectedRun = null;
          this.runEmployees = [];
          this.toast.error(err?.error?.message || 'Failed to load payroll runs.');
        },
      });
  }

  loadClients(): void {
    this.loadingClients = true;
    this.payrollApi
      .getAssignedClients()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingClients = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.clients = rows || [];
        },
        error: () => {
          this.clients = [];
        },
      });
  }

  applyFilters(): void {
    this.loadRuns();
  }

  clearFilters(): void {
    this.selectedClientId = '';
    this.selectedMonth = 0;
    this.selectedYear = 0;
    this.statusFilter = '';
    this.searchText = '';
    this.loadRuns();
  }

  onSearchChange(): void {
    this.filteredRuns = this.applyLocalSearch(this.runs);
    if (this.selectedRun && !this.filteredRuns.find((r) => r.id === this.selectedRun?.id)) {
      this.selectedRun = this.filteredRuns[0] || null;
      if (this.selectedRun) {
        this.loadRunWorkspaceData(this.selectedRun.id, false);
      } else {
        this.runEmployees = [];
      }
    }
    this.cdr.markForCheck();
  }

  selectRun(run: PayrollRunItem): void {
    this.selectedRun = run;
    this.selectedExceptionBucketKey = 'ALL';
    this.showFullHistory = false;
    this.loadRunWorkspaceData(run.id, true);
  }

  processRun(run: PayrollRunItem): void {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'PROCESS');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    this.actionBusy = true;
    this.http
      .post(`/api/v1/payroll/runs/${run.id}/process`, {})
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addRunEvent(run.id, 'PROCESS', 'Run processed', 'Moved to processed stage');
          this.toast.success('Payroll run moved to processed stage.');
          this.loadRuns();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Could not process run.'),
      });
  }

  submitRun(run: PayrollRunItem): void {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'SUBMIT');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    this.actionBusy = true;
    this.http
      .post(`/api/v1/payroll/runs/${run.id}/submit`, {})
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addRunEvent(run.id, 'SUBMIT', 'Run submitted', 'Submitted for approval');
          this.toast.success('Payroll run submitted for approval.');
          this.loadRuns();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Could not submit run.'),
      });
  }

  approveRun(run: PayrollRunItem): void {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'APPROVE');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    this.actionBusy = true;
    this.http
      .post(`/api/v1/payroll/runs/${run.id}/approve`, {})
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addRunEvent(run.id, 'APPROVE', 'Run approved', 'Approved for publish');
          this.toast.success('Payroll run approved and payslips archived.');
          this.loadRuns();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Could not approve run.'),
      });
  }

  publishRun(run: PayrollRunItem): void {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'PUBLISH');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    const status = this.statusKey(run);
    if (status === 'APPROVED') {
      this.downloadPayslips(run);
      return;
    }
    if (status === 'SUBMITTED') {
      this.approveRun(run);
      return;
    }
    if (status === 'PROCESSED') {
      this.submitRun(run);
      return;
    }
    this.approveRun(run);
  }

  rerunRun(run: PayrollRunItem): void {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'RERUN');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    this.addRunEvent(run.id, 'RERUN', 'Rerun requested', 'Run sent for reprocessing');
    this.processRun(run);
  }

  rollbackRun(run: PayrollRunItem): void {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'ROLLBACK');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    this.actionBusy = true;
    this.http
      .post(`/api/v1/payroll/runs/${run.id}/revert`, {})
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addRunEvent(run.id, 'ROLLBACK', 'Run rolled back', 'Reverted to draft');
          this.toast.success('Payroll run reverted to draft.');
          this.loadRuns();
        },
        error: (err) =>
          this.toast.error(err?.error?.message || 'Could not revert payroll run.'),
      });
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.importFile = input?.files?.[0] || null;
  }

  uploadRunImport(): void {
    if (this.isConsoleBusy()) return;
    if (!this.selectedRun?.id || !this.importFile) {
      this.toast.info('Choose a file to import attendance/input data.');
      return;
    }
    const guard = this.actionGuardReason(this.selectedRun, 'IMPORT');
    if (guard) {
      this.toast.warning(`Import blocked: ${guard}`);
      return;
    }
    this.importBusy = true;
    const fd = new FormData();
    fd.append('file', this.importFile);
    this.http
      .post(`/api/v1/payroll/runs/${this.selectedRun.id}/employees/upload`, fd)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.importBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addRunEvent(this.selectedRun!.id, 'IMPORT', 'Import uploaded', 'Input file imported');
          this.toast.success('Run input file uploaded successfully.');
          this.importFile = null;
          this.loadRuns();
          if (this.selectedRun) {
            this.loadRunEmployees(this.selectedRun.id, false);
          }
        },
        error: (err) => this.toast.error(err?.error?.message || 'Could not upload import file.'),
      });
  }

  downloadPayslips(run: PayrollRunItem): void {
    this.http
      .get(`/api/v1/payroll/runs/${run.id}/payslips.zip`, { responseType: 'blob' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          this.addRunEvent(run.id, 'PUBLISH', 'Payslips downloaded', 'Published output downloaded as ZIP');
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `payslips-${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}.zip`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => this.toast.error('Could not download payslips ZIP.'),
      });
  }

  runStageIndex(run: PayrollRunItem | null): number {
    if (!run) return 0;
    const status = String(run.status || '').toUpperCase();
    if (status === 'APPROVED') return 6;
    if (status === 'SUBMITTED') return 5;
    if (status === 'PROCESSED') return 4;
    if (status === 'REJECTED') return 2;
    if ((run.employeeCount || 0) > 0) return 2;
    return 1;
  }

  stepClass(stepPosition: number): string {
    const stage = this.runStageIndex(this.selectedRun);
    if (stepPosition <= stage) return 'step-chip step-chip--done';
    if (stepPosition === stage + 1) return 'step-chip step-chip--active';
    return 'step-chip';
  }

  totalRuns(): number {
    return this.filteredRuns.length;
  }

  draftRuns(): number {
    return this.filteredRuns.filter((r) => this.statusKey(r) === 'DRAFT').length;
  }

  processedRuns(): number {
    return this.filteredRuns.filter((r) => this.statusKey(r) === 'PROCESSED').length;
  }

  submittedRuns(): number {
    return this.filteredRuns.filter((r) => this.statusKey(r) === 'SUBMITTED').length;
  }

  approvedRuns(): number {
    return this.filteredRuns.filter((r) => this.statusKey(r) === 'APPROVED').length;
  }

  selectedGrossTotal(): number {
    return this.runEmployees.reduce((sum, r) => sum + Number(r.grossEarnings || 0), 0);
  }

  selectedDeductionTotal(): number {
    return this.runEmployees.reduce((sum, r) => sum + Number(r.totalDeductions || 0), 0);
  }

  selectedNetTotal(): number {
    return this.runEmployees.reduce((sum, r) => sum + Number(r.netPay || 0), 0);
  }

  validationExceptions(): RunEmployeeRow[] {
    return this.runEmployees.filter((r) => {
      const gross = Number(r.grossEarnings || 0);
      const ded = Number(r.totalDeductions || 0);
      const net = Number(r.netPay || 0);
      if (net <= 0) return true;
      if (gross > 0 && ded / gross > 0.65) return true;
      if (ded > gross && gross > 0) return true;
      return false;
    });
  }

  exceptionBuckets(): ExceptionBucket[] {
    let negativeNet = 0;
    let highDeductionRatio = 0;
    let deductionExceedsGross = 0;
    for (const row of this.runEmployees) {
      const gross = Number(row.grossEarnings || 0);
      const ded = Number(row.totalDeductions || 0);
      const net = Number(row.netPay || 0);
      if (net <= 0) negativeNet += 1;
      if (gross > 0 && ded / gross > 0.65) highDeductionRatio += 1;
      if (gross > 0 && ded > gross) deductionExceedsGross += 1;
    }
    return [
      { key: 'ALL', label: 'All Exceptions', count: this.validationExceptions().length },
      { key: 'NEGATIVE_NET', label: 'Net <= 0', count: negativeNet },
      { key: 'HIGH_DED_RATIO', label: 'Deduction > 65%', count: highDeductionRatio },
      { key: 'DED_GT_GROSS', label: 'Deduction > Gross', count: deductionExceedsGross },
    ];
  }

  setExceptionBucket(key: string): void {
    this.selectedExceptionBucketKey = key || 'ALL';
  }

  isBucketActive(key: string): boolean {
    return this.selectedExceptionBucketKey === key;
  }

  bucketClass(bucket: ExceptionBucket): string {
    const base = 'bucket-card';
    const active = this.isBucketActive(bucket.key) ? ' bucket-card--active' : '';
    if (bucket.key === 'NEGATIVE_NET') return `${base}${active} bucket-card--danger`;
    if (bucket.key === 'HIGH_DED_RATIO') return `${base}${active} bucket-card--warn`;
    if (bucket.key === 'DED_GT_GROSS') return `${base}${active} bucket-card--bad`;
    return `${base}${active}`;
  }

  filteredValidationExceptions(): RunEmployeeRow[] {
    const list = this.validationExceptions();
    const key = this.selectedExceptionBucketKey;
    if (key === 'ALL') return list;
    return list.filter((row) => {
      const gross = Number(row.grossEarnings || 0);
      const ded = Number(row.totalDeductions || 0);
      const net = Number(row.netPay || 0);
      if (key === 'NEGATIVE_NET') return net <= 0;
      if (key === 'HIGH_DED_RATIO') return gross > 0 && ded / gross > 0.65;
      if (key === 'DED_GT_GROSS') return gross > 0 && ded > gross;
      return true;
    });
  }

  publishHistory(): RunEvent[] {
    const run = this.selectedRun;
    if (!run) return [];
    const events: RunEvent[] = [];
    if (run.createdAt) {
      events.push({ kind: 'SYSTEM', title: 'Run created', at: run.createdAt });
    }
    const approval = this.runApprovalStatusByRunId[run.id];
    if (approval?.submittedAt || run.submittedAt) {
      const note = approval?.submittedByUserId ? `Submitted by ${approval.submittedByUserId}` : undefined;
      events.push({
        kind: 'SUBMIT',
        title: 'Run submitted',
        at: String(approval?.submittedAt || run.submittedAt),
        note,
      });
    }
    if (approval?.approvedAt || run.approvedAt) {
      const notes: string[] = [];
      if (approval?.approvedByUserId) notes.push(`Approved by ${approval.approvedByUserId}`);
      if (approval?.approvalComments) notes.push(approval.approvalComments);
      if (run.approvalComments && !approval?.approvalComments) notes.push(run.approvalComments);
      events.push({
        kind: 'APPROVE',
        title: 'Run approved',
        at: String(approval?.approvedAt || run.approvedAt),
        note: notes.join(' | ') || undefined,
      });
    }
    if (approval?.rejectedAt || run.rejectedAt) {
      const reason = approval?.rejectionReason || run.rejectionReason;
      events.push({
        kind: 'SYSTEM',
        title: 'Run rejected',
        at: String(approval?.rejectedAt || run.rejectedAt),
        note: reason ? `Reason: ${reason}` : undefined,
      });
    }
    const local = this.runEventHistory[run.id] || [];
    const merged = [...events, ...local].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
    const deduped: RunEvent[] = [];
    const seen = new Set<string>();
    for (const ev of merged) {
      const key = `${ev.kind}|${ev.title}|${ev.at}|${ev.note || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(ev);
    }
    return deduped;
  }

  visiblePublishHistory(): RunEvent[] {
    const history = this.publishHistory();
    return this.showFullHistory ? history : history.slice(0, 5);
  }

  toggleHistory(): void {
    this.showFullHistory = !this.showFullHistory;
  }

  publishHistorySummary(): {
    total: number;
    approvals: number;
    publishes: number;
    rollbacks: number;
    rejects: number;
  } {
    const history = this.publishHistory();
    return {
      total: history.length,
      approvals: history.filter((x) => x.kind === 'APPROVE').length,
      publishes: history.filter((x) => x.kind === 'PUBLISH').length,
      rollbacks: history.filter((x) => x.kind === 'ROLLBACK').length,
      rejects: history.filter((x) => x.title === 'Run rejected').length,
    };
  }

  approvalStatusForSelectedRun(): RunApprovalStatus | null {
    const runId = this.selectedRun?.id;
    if (!runId) return null;
    return this.runApprovalStatusByRunId[runId] || null;
  }

  runGuardrails(run: PayrollRunItem | null): GuardrailItem[] {
    if (!run) return [];
    return [
      { key: 'IMPORT', label: 'Import Input', allowed: !this.actionGuardReason(run, 'IMPORT'), reason: this.actionGuardReason(run, 'IMPORT') || 'Ready' },
      { key: 'PROCESS', label: 'Process', allowed: !this.actionGuardReason(run, 'PROCESS'), reason: this.actionGuardReason(run, 'PROCESS') || 'Ready' },
      { key: 'SUBMIT', label: 'Submit', allowed: !this.actionGuardReason(run, 'SUBMIT'), reason: this.actionGuardReason(run, 'SUBMIT') || 'Ready' },
      { key: 'APPROVE', label: 'Approve', allowed: !this.actionGuardReason(run, 'APPROVE'), reason: this.actionGuardReason(run, 'APPROVE') || 'Ready' },
      { key: 'PUBLISH', label: 'Publish', allowed: !this.actionGuardReason(run, 'PUBLISH'), reason: this.actionGuardReason(run, 'PUBLISH') || 'Ready' },
      { key: 'RERUN', label: 'Rerun', allowed: !this.actionGuardReason(run, 'RERUN'), reason: this.actionGuardReason(run, 'RERUN') || 'Ready' },
      { key: 'ROLLBACK', label: 'Rollback', allowed: !this.actionGuardReason(run, 'ROLLBACK'), reason: this.actionGuardReason(run, 'ROLLBACK') || 'Ready' },
    ];
  }

  actionAllowed(run: PayrollRunItem | null, action: GuardrailItem['key']): boolean {
    return !this.actionGuardReason(run, action);
  }

  actionButtonDisabled(run: PayrollRunItem | null, action: GuardrailItem['key']): boolean {
    return this.isConsoleBusy() || !this.actionAllowed(run, action);
  }

  statusClass(status: string): string {
    const value = this.statusKey({ status } as PayrollRunItem);
    if (value === 'APPROVED') return 'status-pill status-pill--ok';
    if (value === 'PROCESSED' || value === 'SUBMITTED') return 'status-pill status-pill--info';
    if (value === 'REJECTED') return 'status-pill status-pill--bad';
    return 'status-pill';
  }

  monthLabel(month: number): string {
    return this.monthOptions[month - 1] || '-';
  }

  trackById(index: number, row: any): string {
    return String(row?.id ?? row?.employeeId ?? row?.empCode ?? index);
  }

  canProcess(run: PayrollRunItem | null): boolean {
    return this.actionAllowed(run, 'PROCESS');
  }

  canSubmit(run: PayrollRunItem | null): boolean {
    return this.actionAllowed(run, 'SUBMIT');
  }

  canApprove(run: PayrollRunItem | null): boolean {
    return this.actionAllowed(run, 'APPROVE');
  }

  isPublished(run: PayrollRunItem | null): boolean {
    return !!run && this.statusKey(run) === 'APPROVED';
  }

  canRerun(run: PayrollRunItem | null): boolean {
    return this.actionAllowed(run, 'RERUN');
  }

  canRollback(run: PayrollRunItem | null): boolean {
    return this.actionAllowed(run, 'ROLLBACK');
  }

  actionGuardReason(
    run: PayrollRunItem | null,
    action: GuardrailItem['key'],
  ): string | null {
    if (!run) return 'No run selected.';
    const status = this.statusKey(run);
    const hasEmployees = Number(run.employeeCount || 0) > 0;
    const requiresSelectedContext = ['SUBMIT', 'APPROVE', 'PUBLISH', 'RERUN'].includes(action);
    if (requiresSelectedContext && this.selectedRun?.id !== run.id) {
      return 'Open this run in detail workspace first.';
    }
    const exceptions = this.selectedRun?.id === run.id ? this.validationExceptions().length : 0;

    if (action === 'IMPORT') {
      if (status === 'APPROVED') return 'Published run is locked for import.';
      return null;
    }

    if (action === 'PROCESS') {
      if (!(status === 'DRAFT' || status === 'REJECTED' || status === 'IN_PROGRESS')) {
        return 'Only Draft/Rejected/In Progress runs can be processed.';
      }
      if (!hasEmployees) return 'Import employee inputs before processing.';
      return null;
    }

    if (action === 'SUBMIT') {
      if (status !== 'PROCESSED') return 'Only processed runs can be submitted.';
      if (exceptions > 0) return `Resolve ${exceptions} validation exception(s) before submit.`;
      return null;
    }

    if (action === 'APPROVE') {
      if (status !== 'SUBMITTED') return 'Only submitted runs can be approved.';
      if (exceptions > 0) return `Resolve ${exceptions} validation exception(s) before approval.`;
      return null;
    }

    if (action === 'PUBLISH') {
      if (status === 'APPROVED') return null;
      if (status === 'SUBMITTED') {
        if (exceptions > 0) return `Resolve ${exceptions} validation exception(s) before publish.`;
        return null;
      }
      if (status === 'PROCESSED') {
        if (exceptions > 0) return `Resolve ${exceptions} validation exception(s) before publish.`;
        return null;
      }
      return 'Process and submit run before publish.';
    }

    if (action === 'RERUN') {
      if (status === 'APPROVED') return 'Published run cannot be rerun.';
      if (!(status === 'DRAFT' || status === 'REJECTED' || status === 'IN_PROGRESS')) {
        return 'Only Draft/Rejected/In Progress runs can be rerun.';
      }
      if (!hasEmployees) return 'Import employee inputs before rerun.';
      return null;
    }

    if (action === 'ROLLBACK') {
      if (status !== 'REJECTED') return 'Only rejected runs can be rolled back.';
      return null;
    }

    return null;
  }

  private loadRunEmployees(runId: string, toastOnError: boolean): void {
    this.loadingRunDetail = true;
    this.http
      .get<any>(`/api/v1/payroll/runs/${runId}/employees`)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingRunDetail = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.runEmployees = this.toArray(res).map((row: any) => ({
            employeeId: String(row?.employeeId || row?.employee_id || ''),
            empCode: row?.empCode || row?.employeeCode || '-',
            employeeName: row?.employeeName || '-',
            grossEarnings: Number(row?.grossEarnings || 0),
            totalDeductions: Number(row?.totalDeductions || 0),
            netPay: Number(row?.netPay || 0),
          }));
        },
        error: () => {
          this.runEmployees = [];
          if (toastOnError) {
            this.toast.error('Could not load employee run preview.');
          }
        },
      });
  }

  private loadRunWorkspaceData(runId: string, toastOnError: boolean): void {
    this.loadRunEmployees(runId, toastOnError);
    this.loadApprovalStatus(runId, false);
  }

  private loadApprovalStatus(runId: string, toastOnError: boolean): void {
    this.loadingApprovalStatus = true;
    this.http
      .get<any>(`/api/v1/payroll/runs/${runId}/approval-status`)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingApprovalStatus = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          const row = res?.data || res || {};
          this.runApprovalStatusByRunId[runId] = {
            status: row?.status || null,
            submittedByUserId: row?.submittedByUserId || row?.submitted_by_user_id || null,
            submittedAt: row?.submittedAt || row?.submitted_at || null,
            approvedByUserId: row?.approvedByUserId || row?.approved_by_user_id || null,
            approvedAt: row?.approvedAt || row?.approved_at || null,
            approvalComments: row?.approvalComments || row?.approval_comments || null,
            rejectedByUserId: row?.rejectedByUserId || row?.rejected_by_user_id || null,
            rejectedAt: row?.rejectedAt || row?.rejected_at || null,
            rejectionReason: row?.rejectionReason || row?.rejection_reason || null,
          };
        },
        error: () => {
          delete this.runApprovalStatusByRunId[runId];
          if (toastOnError) {
            this.toast.error('Could not load approval status for this run.');
          }
        },
      });
  }

  private runQueryParams(): HttpParams {
    let params = new HttpParams();
    if (this.selectedClientId) params = params.set('clientId', this.selectedClientId);
    if (this.selectedYear) params = params.set('periodYear', String(this.selectedYear));
    if (this.selectedMonth) params = params.set('periodMonth', String(this.selectedMonth));
    if (this.statusFilter) params = params.set('status', this.statusFilter);
    return params;
  }

  private applyLocalSearch(rows: PayrollRunItem[]): PayrollRunItem[] {
    const q = this.searchText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const text = `${row.clientName || ''} ${row.status || ''} ${row.periodMonth}/${row.periodYear}`.toLowerCase();
      return text.includes(q);
    });
  }

  private toArray(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.rows)) return payload.rows;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }

  private statusKey(run: PayrollRunItem): string {
    return String(run.status || '').toUpperCase();
  }

  private generateYearOptions(): number[] {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }

  private addRunEvent(
    runId: string,
    kind: RunEvent['kind'],
    title: string,
    note?: string,
  ): void {
    const bucket = this.runEventHistory[runId] || [];
    bucket.push({
      kind,
      title,
      at: new Date().toISOString(),
      note,
    });
    this.runEventHistory[runId] = bucket;
  }

  private isConsoleBusy(): boolean {
    return (
      this.actionBusy ||
      this.importBusy ||
      this.loadingRuns ||
      this.loadingRunDetail
    );
  }
}

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
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../shared/ui';
import { ClientContextStripComponent } from '../../shared/ui/client-context-strip/client-context-strip.component';
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
  key: 'IMPORT' | 'PROCESS' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'PUBLISH' | 'RERUN' | 'ROLLBACK';
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
    ClientContextStripComponent,
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
  creatingRun = false;

  selectedClientId = '';
  routeScoped = false;
  selectedMonth = 0;
  selectedYear = 0;
  statusFilter = '';
  searchText = '';

  importFile: File | null = null;
  selectedExceptionBucketKey = 'ALL';
  showFullHistory = false;

  // Add Employee panel
  showAddEmployeePanel = false;
  addEmpSearch = '';
  addEmpAvailable: { employeeCode: string; name: string }[] = [];
  addEmpFiltered: { employeeCode: string; name: string }[] = [];
  addEmpSelected: Set<string> = new Set();
  addEmpBusy = false;
  addEmpLoading = false;
  addEmpFile: File | null = null;
  addEmpUploadBusy = false;
  addEmpParsedCodes: string[] = [];
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
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const routeClientId = this.route.snapshot.paramMap.get('clientId') || '';
    if (routeClientId) {
      this.selectedClientId = routeClientId;
      this.routeScoped = true;
    }
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

  createRun(): void {
    if (this.creatingRun) return;
    const clientId = this.selectedClientId;
    if (!clientId) {
      this.toast.error('No client selected.');
      return;
    }
    const now = new Date();
    const periodMonth = this.selectedMonth || now.getMonth() + 1;
    const periodYear = this.selectedYear || now.getFullYear();
    const monthName = this.monthOptions[periodMonth - 1] || '';

    if (!confirm(`Create a new payroll run for ${monthName} ${periodYear}?`)) return;

    this.creatingRun = true;
    this.http
      .post<any>('/api/v1/payroll/runs', { clientId, periodYear, periodMonth })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.creatingRun = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(`Payroll run created for ${monthName} ${periodYear}.`);
          this.selectedMonth = periodMonth;
          this.selectedYear = periodYear;
          this.loadRuns();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to create payroll run.');
        },
      });
  }

  processRun(run: PayrollRunItem): void {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'PROCESS');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    if (!confirm('Are you sure you want to process this payroll run?')) return;
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
    if (!confirm('Are you sure you want to submit this run for approval?')) return;
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
    if (!confirm('Are you sure you want to approve this payroll run?')) return;
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
    if (!confirm('Are you sure you want to rerun this payroll run? This will reprocess the data.')) return;
    this.addRunEvent(run.id, 'RERUN', 'Rerun requested', 'Run sent for reprocessing');
    this.processRun(run);
  }

  rejectRun(run: PayrollRunItem): void {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'REJECT');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    this.actionBusy = true;
    this.http
      .post(`/api/v1/payroll/runs/${run.id}/reject`, { reason })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addRunEvent(run.id, 'ROLLBACK', 'Run rejected', reason);
          this.toast.success('Payroll run rejected.');
          this.loadRuns();
        },
        error: (err) =>
          this.toast.error(err?.error?.message || 'Could not reject payroll run.'),
      });
  }

  rollbackRun(run: PayrollRunItem): void {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'ROLLBACK');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    if (!confirm('Are you sure you want to rollback this payroll run? This will revert it to draft.')) return;
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

  deleteRun(run: PayrollRunItem): void {
    if (this.isConsoleBusy()) return;
    if (!this.canDeleteRun(run)) {
      this.toast.warning('Only draft runs can be deleted.');
      return;
    }
    const period = `${this.monthLabel(run.periodMonth)} ${run.periodYear}`;
    if (!confirm(`Delete draft payroll run for ${run.clientName || 'client'} (${period})? This cannot be undone.`)) return;

    this.actionBusy = true;
    this.http
      .delete(`/api/v1/payroll/runs/${run.id}`)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Draft payroll run deleted.');
          if (this.selectedRun?.id === run.id) {
            this.selectedRun = null;
            this.runEmployees = [];
          }
          this.loadRuns();
        },
        error: (err) =>
          this.toast.error(err?.error?.message || 'Could not delete payroll run.'),
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
      .post(`/api/v1/payroll/runs/${this.selectedRun.id}/upload-attendance`, fd)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.importBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addRunEvent(this.selectedRun!.id, 'IMPORT', 'Attendance uploaded', 'Attendance data imported');
          this.toast.success('Attendance uploaded successfully.');
          this.importFile = null;
          this.loadRuns();
          if (this.selectedRun) {
            this.loadRunEmployees(this.selectedRun.id, false);
          }
        },
        error: (err) => this.toast.error(err?.error?.message || 'Could not upload import file.'),
      });
  }

  downloadAttendanceTemplate(): void {
    const headers = ['Employee Code', 'Employee Name', 'Working Days', 'Payable Days', 'OT Hours', 'Other Earnings', 'Arrears Attendance Bonus', 'Other Deductions'];
    // Pre-fill employee codes/names from the run's employee list
    const dataRows = this.runEmployees.map((emp) =>
      [emp.empCode || '', emp.employeeName || '', '', '', '', '', '', ''].join(','),
    );
    const csv = [headers.join(','), ...dataRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const run = this.selectedRun;
    a.download = run
      ? `attendance-template-${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}.csv`
      : 'attendance-template.csv';
    a.click();
    URL.revokeObjectURL(url);
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

  canDeleteRun(run: PayrollRunItem | null): boolean {
    if (!run) return false;
    return this.statusKey(run) === 'DRAFT';
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

    if (action === 'REJECT') {
      if (status !== 'SUBMITTED') return 'Only submitted runs can be rejected.';
      return null;
    }

    if (action === 'ROLLBACK') {
      if (status !== 'REJECTED' && status !== 'APPROVED') return 'Only rejected or approved runs can be rolled back.';
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

  // ── Add Employee to Run ─────────────────────────────────────────
  toggleAddEmployeePanel(): void {
    this.showAddEmployeePanel = !this.showAddEmployeePanel;
    if (this.showAddEmployeePanel && this.selectedRun) {
      this.loadAvailableEmployees();
    } else {
      this.addEmpAvailable = [];
      this.addEmpFiltered = [];
      this.addEmpSelected.clear();
      this.addEmpSearch = '';
    }
  }

  private loadAvailableEmployees(): void {
    if (!this.selectedRun) return;
    this.addEmpLoading = true;
    const clientId = this.selectedRun.clientId || '';
    this.http
      .get<any>(`/api/v1/payroll/employees`, { params: { clientId, status: 'active', limit: '500' } })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.addEmpLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          const all = (res?.data || res || []).map((e: any) => ({
            employeeCode: e.employeeCode || e.emp_code || '',
            name: e.name || e.employeeName || '',
          }));
          const inRun = new Set(this.runEmployees.map((r) => r.empCode));
          this.addEmpAvailable = all.filter((e: any) => !inRun.has(e.employeeCode));
          this.filterAddEmpList();
        },
        error: () => {
          this.toast.error('Could not load employees.');
          this.addEmpAvailable = [];
          this.addEmpFiltered = [];
        },
      });
  }

  filterAddEmpList(): void {
    const q = (this.addEmpSearch || '').toLowerCase();
    this.addEmpFiltered = q
      ? this.addEmpAvailable.filter(
          (e) =>
            e.employeeCode.toLowerCase().includes(q) ||
            e.name.toLowerCase().includes(q),
        )
      : [...this.addEmpAvailable];
  }

  toggleAddEmpSelect(code: string): void {
    if (this.addEmpSelected.has(code)) {
      this.addEmpSelected.delete(code);
    } else {
      this.addEmpSelected.add(code);
    }
  }

  onAddEmpFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addEmpFile = input?.files?.[0] || null;
    this.addEmpParsedCodes = [];
    if (!this.addEmpFile) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      // Skip header row if it contains non-code-like text
      const codes: string[] = [];
      for (const line of lines) {
        // Take first column (CSV)
        const col = line.split(',')[0].trim().replace(/^"|"$/g, '');
        if (!col) continue;
        // Skip obvious header rows
        if (/^(employee|emp|code|name|sr|sl|no)/i.test(col)) continue;
        codes.push(col);
      }
      this.addEmpParsedCodes = [...new Set(codes)];
      this.cdr.markForCheck();
    };
    reader.readAsText(this.addEmpFile);
  }

  uploadAddEmpFile(): void {
    if (!this.selectedRun || !this.addEmpParsedCodes.length) return;
    const codes = this.addEmpParsedCodes;
    if (!confirm(`Add ${codes.length} employee(s) from file to this payroll run and compute their payroll?`)) return;

    this.addEmpUploadBusy = true;
    this.http
      .post<any>(
        `/api/v1/payroll/runs/${this.selectedRun.id}/add-employees`,
        { employeeCodes: codes },
      )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.addEmpUploadBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          const added = res?.added?.length || 0;
          const skipped = res?.skipped?.length || 0;
          this.toast.success(`${added} employee(s) added from file${skipped ? `, ${skipped} skipped` : ''}.`);
          this.addEmpFile = null;
          this.addEmpParsedCodes = [];
          this.showAddEmployeePanel = false;
          this.addEmpSelected.clear();
          this.addEmpSearch = '';
          if (this.selectedRun) {
            this.loadRunWorkspaceData(this.selectedRun.id, true);
          }
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to add employees from file.');
        },
      });
  }

  confirmAddEmployees(): void {
    if (!this.selectedRun || !this.addEmpSelected.size) return;
    const codes = Array.from(this.addEmpSelected);
    if (!confirm(`Add ${codes.length} employee(s) to this payroll run and compute their payroll?`)) return;

    this.addEmpBusy = true;
    this.http
      .post<any>(
        `/api/v1/payroll/runs/${this.selectedRun.id}/add-employees`,
        { employeeCodes: codes },
      )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.addEmpBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          const added = res?.added?.length || 0;
          const skipped = res?.skipped?.length || 0;
          this.toast.success(`${added} employee(s) added${skipped ? `, ${skipped} skipped` : ''}.`);
          this.showAddEmployeePanel = false;
          this.addEmpSelected.clear();
          this.addEmpSearch = '';
          if (this.selectedRun) {
            this.loadRunWorkspaceData(this.selectedRun.id, true);
          }
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to add employees.');
        },
      });
  }
}

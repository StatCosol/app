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
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, firstValueFrom } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../shared/ui';
import { ClientContextStripComponent } from '../../shared/ui/client-context-strip/client-context-strip.component';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
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
  totalDays: number;
  daysPresent: number;
  lopDays: number;
  otHours: number;
  designation: string | null;
  uan: string | null;
  esic: string | null;
  monthlyGross: number;
  pfApplicable: boolean;
  esiApplicable: boolean;
  otherEarningsNote: string | null;
  otherDeductionsNote: string | null;
  components: Record<string, number>;
}

interface PayheetComponent {
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER' | 'INFO' | string;
  displayOrder: number;
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
  payheetComponents: PayheetComponent[] = [];

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
  // Dedicated month/year for "+ New Run" (independent of search filters above).
  // Defaults to the previous month — the typical payroll-cycle use case.
  newRunMonth = this.defaultNewRunMonth();
  newRunYear = this.defaultNewRunYear();
  statusFilter = '';
  searchText = '';

  importFile: File | null = null;
  selectedExceptionBucketKey = 'ALL';
  showFullHistory = false;

  // Leave validation panel
  leaveValidationLoading = false;
  leaveValidationLoaded = false;
  leaveValidationRows: Array<{
    empCode: string;
    employeeName: string;
    employeeId: string | null;
    attendanceLeave: number;
    essApprovedLeave: number;
    diff: number;
    status: 'OK' | 'MISMATCH' | 'MISSING_IN_SHEET' | 'EXTRA_IN_SHEET';
    essApplications: Array<{
      id: string;
      leaveType: string;
      fromDate: string;
      toDate: string;
      days: number;
      status: string;
    }>;
    resolveSource?: 'ESS' | 'SHEET';
    resolving?: boolean;
    resolved?: boolean;
    resolvedSource?: 'ESS' | 'SHEET';
  }> = [];
  leaveValidationError: string | null = null;
  resolvingLeaveEmpCode: string | null = null;

  // OT validation panel
  otValidationLoading = false;
  otValidationLoaded = false;
  otValidationRows: Array<{
    empCode: string;
    employeeName: string;
    employeeId: string | null;
    attendanceSheetOt: number;
    branchClientOt: number;
    essOt: number;
    maxDiff: number;
    status: 'OK' | 'MISMATCH';
    resolveSource?: 'BRANCH' | 'ESS' | 'SHEET';
    resolving?: boolean;
    resolved?: boolean;
    resolvedSource?: 'BRANCH' | 'ESS' | 'SHEET';
    resolvedOtHours?: number;
  }> = [];
  otValidationError: string | null = null;
  resolvingOtEmpCode: string | null = null;

  // Free-text search filters for the validation panels (name or code).
  leaveValidationSearch = '';
  otValidationSearch = '';

  // Bulk-resolve state for the validation panels.
  bulkLeaveSource: 'ESS' | 'SHEET' = 'ESS';
  bulkOtSource: 'BRANCH' | 'ESS' | 'SHEET' = 'BRANCH';
  bulkResolvingLeave = false;
  bulkResolvingOt = false;
  bulkResolveProgress = { done: 0, total: 0 };

  // Add Employee panel
  showAddEmployeePanel = false;
  addEmpSearch = '';
  addEmpAvailable: { employeeCode: string; name: string }[] = [];
  addEmpFiltered: { employeeCode: string; name: string }[] = [];
  addEmpSelected = new Set<string>();
  addEmpBusy = false;
  addEmpLoading = false;
  addEmpFile: File | null = null;
  addEmpUploadBusy = false;
  addEmpParsedCodes: string[] = [];

  // Inline per-employee edit
  editingEmpCode: string | null = null;
  // Inline per-employee calculation check
  checkingEmpCode: string | null = null;
  editEmpForm: {
    workingDays: number;
    payableDays: number;
    otHours: number;
    otherEarnings: number;
    arrearAttBonus: number;
    otherDeductions: number;
    otherEarningsNote: string;
    otherDeductionsNote: string;
  } = {
    workingDays: 0,
    payableDays: 0,
    otHours: 0,
    otherEarnings: 0,
    arrearAttBonus: 0,
    otherDeductions: 0,
    otherEarningsNote: '',
    otherDeductionsNote: '',
  };
  editEmpBusy = false;
  // Free-text search filter for the Preview Employees grid (matches name or code).
  runEmployeeSearch = '';
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
    private readonly dialog: ConfirmDialogService,
    private readonly payrollApi: PayrollApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
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
          this._guardCache.clear();

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

  async createRun(): Promise<void> {
    if (this.creatingRun) return;
    const clientId = this.selectedClientId;
    if (!clientId) {
      this.toast.error('No client selected.');
      return;
    }
    const periodMonth = Number(this.newRunMonth) || this.defaultNewRunMonth();
    const periodYear = Number(this.newRunYear) || this.defaultNewRunYear();
    if (periodMonth < 1 || periodMonth > 12) {
      this.toast.error('Pick a valid month for the new run.');
      return;
    }
    const monthName = this.monthOptions[periodMonth - 1] || '';

    const ok = await this.dialog.confirm(
      'Create Payroll Run',
      `Create a new payroll run for ${monthName} ${periodYear}?`,
      { confirmText: 'Create' },
    );
    if (!ok) return;

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
          // Sync search filters so the new run is immediately visible in the queue.
          this.selectedMonth = periodMonth;
          this.selectedYear = periodYear;
          this.loadRuns();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to create payroll run.');
        },
      });
  }

  async processRun(run: PayrollRunItem): Promise<void> {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'PROCESS');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    const ok = await this.dialog.confirm(
      'Process Payroll Run',
      'Are you sure you want to process this payroll run?',
      { confirmText: 'Process' },
    );
    if (!ok) return;
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

  async submitRun(run: PayrollRunItem): Promise<void> {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'SUBMIT');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    const ok = await this.dialog.confirm(
      'Submit Payroll Run',
      'Are you sure you want to submit this run for approval?',
      { confirmText: 'Submit' },
    );
    if (!ok) return;
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

  async approveRun(run: PayrollRunItem): Promise<void> {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'APPROVE');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    const ok = await this.dialog.confirm(
      'Approve Payroll Run',
      'Are you sure you want to approve this payroll run?',
      { confirmText: 'Approve' },
    );
    if (!ok) return;
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

  async rerunRun(run: PayrollRunItem): Promise<void> {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'RERUN');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    const ok = await this.dialog.confirm(
      'Rerun Payroll Run',
      'Are you sure you want to rerun this payroll run? This will reprocess the data.',
      { confirmText: 'Rerun' },
    );
    if (!ok) return;
    this.addRunEvent(run.id, 'RERUN', 'Rerun requested', 'Run sent for reprocessing');
    this.processRun(run);
  }

  async rejectRun(run: PayrollRunItem): Promise<void> {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'REJECT');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    const result = await this.dialog.prompt(
      'Reject Payroll Run',
      'Enter rejection reason:',
      { placeholder: 'Reason', confirmText: 'Reject' },
    );
    const reason = (result.value || '').trim();
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

  async rollbackRun(run: PayrollRunItem): Promise<void> {
    if (this.isConsoleBusy()) return;
    const guard = this.actionGuardReason(run, 'ROLLBACK');
    if (guard) {
      this.toast.warning(`Action blocked: ${guard}`);
      return;
    }
    const ok = await this.dialog.confirm(
      'Rollback Payroll Run',
      'Are you sure you want to rollback this payroll run? This will revert it to draft.',
      { confirmText: 'Rollback', variant: 'danger' },
    );
    if (!ok) return;
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

  async deleteRun(run: PayrollRunItem): Promise<void> {
    if (this.isConsoleBusy()) return;
    if (!this.canDeleteRun(run)) {
      this.toast.warning('Approved runs are locked and cannot be deleted.');
      return;
    }
    const period = `${this.monthLabel(run.periodMonth)} ${run.periodYear}`;
    const ok = await this.dialog.confirm(
      'Delete Payroll Run',
      `Delete payroll run for ${run.clientName || 'client'} (${period})? This will remove all computed payslips and cannot be undone.`,
      { confirmText: 'Delete', variant: 'danger' },
    );
    if (!ok) return;

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
          this.toast.success('Payroll run deleted.');
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
    const headers = ['Employee Code', 'Employee Name', 'Working Days', 'Payable Days', 'Approved Leave Days', 'PL Days', 'SL Days', 'OT Hours', 'Other Earnings', 'Arrears Attendance Bonus', 'Other Deductions'];
    // Pre-fill employee codes/names from the run's employee list
    const dataRows = this.runEmployees.map((emp) =>
      [emp.empCode || '', emp.employeeName || '', '', '', '', '', '', '', '', '', ''].join(','),
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

  // ── Leave Validation (Attendance vs ESS-approved) ──────────────────
  loadLeaveValidation(): void {
    if (!this.selectedRun?.id) return;
    this.leaveValidationLoading = true;
    this.leaveValidationError = null;
    this.http
      .get<{
        runId: string;
        periodYear: number;
        periodMonth: number;
        rows: PayrollRunsComponent['leaveValidationRows'];
      }>(`/api/v1/payroll/runs/${this.selectedRun.id}/leave-validation`)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.leaveValidationLoading = false;
          this.leaveValidationLoaded = true;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (resp) => {
          this.leaveValidationRows = (resp?.rows || []).map((r) => ({
            ...r,
            resolveSource: 'ESS' as const,
            resolving: false,
            resolved: false,
          }));
        },
        error: (err) => {
          this.leaveValidationError =
            err?.error?.message || 'Could not load leave validation.';
          this.leaveValidationRows = [];
        },
      });
  }

  resolveLeaveValidationRow(empCode: string): void {
    if (!this.selectedRun?.id) return;
    const row = this.leaveValidationRows.find((r) => r.empCode === empCode);
    if (!row) return;
    const source = row.resolveSource || 'ESS';
    row.resolving = true;
    this.resolvingLeaveEmpCode = empCode;
    this.http
      .post<{ empCode: string; updated: number; source: 'ESS' | 'SHEET' }>(
        `/api/v1/payroll/runs/${this.selectedRun.id}/leave-validation/${encodeURIComponent(empCode)}/resolve`,
        { source },
      )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          row.resolving = false;
          this.resolvingLeaveEmpCode = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (resp) => {
          row.resolved = true;
          row.resolvedSource = resp?.source || source;
          // Reflect the new authoritative value in the row so the user can
          // see what was applied (snap sheet → ESS, or accept sheet as truth).
          if (row.resolvedSource === 'ESS') {
            row.attendanceLeave = row.essApprovedLeave;
            row.diff = 0;
          }
          this.toast.success(
            `Resolved leave for ${empCode} (${row.resolvedSource}). Reprocess the run to refresh payslips.`,
          );
        },
        error: (err) =>
          this.toast.error(err?.error?.message || 'Could not resolve leave mismatch.'),
      });
  }

  leaveValidationStatusLabel(status: string): string {
    switch (status) {
      case 'MISSING_IN_SHEET':
        return 'Missing in attendance sheet';
      case 'EXTRA_IN_SHEET':
        return 'Extra in attendance sheet';
      case 'MISMATCH':
        return 'Days mismatch';
      default:
        return status;
    }
  }

  // ── OT Validation (Attendance sheet vs branch/client + ESS daily) ─────
  loadOtValidation(): void {
    if (!this.selectedRun?.id) return;
    this.otValidationLoading = true;
    this.otValidationError = null;
    this.http
      .get<{
        runId: string;
        rows: PayrollRunsComponent['otValidationRows'];
      }>(`/api/v1/payroll/runs/${this.selectedRun.id}/ot-validation`)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.otValidationLoading = false;
          this.otValidationLoaded = true;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (resp) => {
          this.otValidationRows = (resp?.rows || []).map((r) => ({
            ...r,
            resolveSource: 'BRANCH',
            resolving: false,
            resolved: false,
          }));
        },
        error: (err) => {
          this.otValidationError =
            err?.error?.message || 'Could not load OT validation.';
          this.otValidationRows = [];
        },
      });
  }

  resolveOtValidationRow(empCode: string): void {
    if (!this.selectedRun?.id) return;
    const row = this.otValidationRows.find((r) => r.empCode === empCode);
    if (!row) return;
    const source = row.resolveSource || 'BRANCH';
    row.resolving = true;
    this.resolvingOtEmpCode = empCode;
    this.http
      .post<{ empCode: string; otHours: number; source: string }>(
        `/api/v1/payroll/runs/${this.selectedRun.id}/ot-validation/${encodeURIComponent(empCode)}/resolve`,
        { source },
      )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          row.resolving = false;
          this.resolvingOtEmpCode = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (resp) => {
          row.resolved = true;
          row.resolvedSource = source;
          row.resolvedOtHours = resp?.otHours;
          // Reflect the chosen value in the sheet column so the row visually
          // converges to the picked source (handy when SHEET is chosen too).
          row.attendanceSheetOt = resp?.otHours ?? row.attendanceSheetOt;
          row.maxDiff = 0;
          this.toast.success(
            `OT for ${empCode} set to ${resp.otHours} hr (${source}). Recomputed.`,
          );
          // Backend auto-reprocesses this employee on resolve, so reload the
          // Preview Employees grid (and component values) so the new
          // OT_AMOUNT / ESI / Net Pay are visible without a page refresh.
          if (this.selectedRun) {
            this.loadRunWorkspaceData(this.selectedRun.id, true);
          }
        },
        error: (err) =>
          this.toast.error(err?.error?.message || 'Could not resolve OT mismatch.'),
      });
  }

  /**
   * Bulk-resolve every leave-validation row currently visible (after search
   * filter) whose status is not OK. Each row snaps the run's leave/payable
   * days to the ESS-approved value via the existing per-employee endpoint.
   */
  async resolveAllLeaveValidation(): Promise<void> {
    if (!this.selectedRun?.id || this.bulkResolvingLeave) return;
    const runId = this.selectedRun.id;
    const source = this.bulkLeaveSource;
    const targets = this.filteredLeaveValidationRows.filter(
      (r) => r.status !== 'OK' && !r.resolving && !r.resolved,
    );
    if (!targets.length) {
      this.toast.info('No leave mismatches to resolve in the current view.');
      return;
    }
    this.bulkResolvingLeave = true;
    this.bulkResolveProgress = { done: 0, total: targets.length };
    let ok = 0;
    let fail = 0;
    for (const row of targets) {
      row.resolveSource = source;
      row.resolving = true;
      this.cdr.markForCheck();
      try {
        await firstValueFrom(
          this.http.post(
            `/api/v1/payroll/runs/${runId}/leave-validation/${encodeURIComponent(row.empCode)}/resolve`,
            { source },
          ),
        );
        row.resolved = true;
        row.resolvedSource = source;
        if (source === 'ESS') {
          row.attendanceLeave = row.essApprovedLeave;
          row.diff = 0;
        }
        ok++;
      } catch {
        fail++;
      } finally {
        row.resolving = false;
        this.bulkResolveProgress.done++;
        this.cdr.markForCheck();
      }
    }
    this.bulkResolvingLeave = false;
    if (fail === 0) {
      this.toast.success(`Resolved ${ok} leave mismatch(es) using ${source}. Reprocess the run to refresh payslips.`);
    } else {
      this.toast.error(`Resolved ${ok}, failed ${fail}. See network log for details.`);
    }
  }

  /**
   * Bulk-resolve every OT-validation row currently visible (after search
   * filter) using the chosen source (BRANCH / ESS / SHEET). Each call
   * triggers a per-employee reprocess on the backend, so the Preview
   * Employees grid is reloaded once at the end.
   */
  async resolveAllOtValidation(): Promise<void> {
    if (!this.selectedRun?.id || this.bulkResolvingOt) return;
    const runId = this.selectedRun.id;
    const source = this.bulkOtSource;
    const targets = this.filteredOtValidationRows.filter(
      (r) => r.status === 'MISMATCH' && !r.resolving && !r.resolved,
    );
    if (!targets.length) {
      this.toast.info('No OT mismatches to resolve in the current view.');
      return;
    }
    this.bulkResolvingOt = true;
    this.bulkResolveProgress = { done: 0, total: targets.length };
    let ok = 0;
    let fail = 0;
    for (const row of targets) {
      row.resolveSource = source;
      row.resolving = true;
      this.cdr.markForCheck();
      try {
        const resp = await firstValueFrom(
          this.http.post<{ empCode: string; otHours: number; source: string }>(
            `/api/v1/payroll/runs/${runId}/ot-validation/${encodeURIComponent(row.empCode)}/resolve`,
            { source },
          ),
        );
        row.resolved = true;
        row.resolvedSource = source;
        row.resolvedOtHours = resp?.otHours;
        row.attendanceSheetOt = resp?.otHours ?? row.attendanceSheetOt;
        row.maxDiff = 0;
        ok++;
      } catch {
        fail++;
      } finally {
        row.resolving = false;
        this.bulkResolveProgress.done++;
        this.cdr.markForCheck();
      }
    }
    this.bulkResolvingOt = false;
    if (fail === 0) {
      this.toast.success(`Resolved ${ok} OT mismatch(es) using ${source}. Recomputed.`);
    } else {
      this.toast.error(`Resolved ${ok}, failed ${fail}. See network log for details.`);
    }
    if (this.selectedRun) {
      this.loadRunWorkspaceData(this.selectedRun.id, true);
    }
  }

  /** Count of rows in the current filtered Leave view that still need resolution. */
  get pendingLeaveCount(): number {
    return this.filteredLeaveValidationRows.filter(
      (r) => r.status !== 'OK' && !r.resolved,
    ).length;
  }

  /** Count of rows in the current filtered OT view that still need resolution. */
  get pendingOtCount(): number {
    return this.filteredOtValidationRows.filter(
      (r) => r.status === 'MISMATCH' && !r.resolved,
    ).length;
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
    // Backend `grossEarnings` already includes OT_AMOUNT (Gross = sum of all earnings).
    return this.runEmployees.reduce((sum, r) => sum + Number(r.grossEarnings || 0), 0);
  }

  selectedDeductionTotal(): number {
    return this.runEmployees.reduce((sum, r) => sum + Number(r.totalDeductions || 0), 0);
  }

  selectedNetTotal(): number {
    // Backend `netPay` already includes OT (Net = Gross-with-OT - Deductions).
    return this.runEmployees.reduce((sum, r) => sum + Number(r.netPay || 0), 0);
  }

  validationExceptions(): RunEmployeeRow[] {
    return this.runEmployees.filter((r) => {
      const gross = Number(r.grossEarnings || 0);
      const ded = Number(r.totalDeductions || 0);
      const net = Number(r.netPay || 0);
      // Employees with no earnings this cycle (e.g. no attendance uploaded)
      // are intentionally zero — don't flag them as exceptions or they'd
      // permanently block Submit/Approve.
      if (gross <= 0 && ded <= 0) return false;
      if (gross > 0 && net <= 0) return true;
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
      // Skip zero-pay employees (no attendance) so they don't inflate counts.
      if (gross <= 0 && ded <= 0) continue;
      if (gross > 0 && net <= 0) negativeNet += 1;
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
    // Approved runs are locked; everything else (Draft / Processed / Submitted / Rejected / In Progress) is deletable.
    return this.statusKey(run) !== 'APPROVED';
  }

  actionGuardReason(
    run: PayrollRunItem | null,
    action: GuardrailItem['key'],
  ): string | null {
    if (!run) return 'No run selected.';
    // L2: this method is called many times per row per change-detection pass
    // (every action button reads it for [disabled], [title], guardrail label,
    // and the wrapping *ngIf). Cache by run+selectedRun+exception count so
    // repeated lookups inside the same CD pass don't re-run the cascade.
    const status = this.statusKey(run);
    const exCount =
      this.selectedRun?.id === run.id ? this.validationExceptions().length : 0;
    const cacheKey = `${run.id}|${status}|${run.employeeCount || 0}|${this.selectedRun?.id || ''}|${exCount}|${action}`;
    const cached = this._guardCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const reason = this._actionGuardReasonImpl(run, action, status, exCount);
    this._guardCache.set(cacheKey, reason);
    return reason;
  }

  private readonly _guardCache = new Map<string, string | null>();

  private _actionGuardReasonImpl(
    run: PayrollRunItem,
    action: GuardrailItem['key'],
    status: string,
    _exceptions: number,
  ): string | null {
    const hasEmployees = Number(run.employeeCount || 0) > 0;
    const requiresSelectedContext = ['SUBMIT', 'APPROVE', 'PUBLISH', 'RERUN'].includes(action);
    if (requiresSelectedContext && this.selectedRun?.id !== run.id) {
      return 'Open this run in detail workspace first.';
    }

    if (action === 'IMPORT') {
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
      // Validation exceptions are advisory only — they appear in the
      // Exceptions panel but should not block Submit/Approve.
      return null;
    }

    if (action === 'APPROVE') {
      if (status !== 'SUBMITTED') return 'Only submitted runs can be approved.';
      return null;
    }

    if (action === 'PUBLISH') {
      if (status === 'APPROVED') return null;
      if (status === 'SUBMITTED' || status === 'PROCESSED') return null;
      return 'Process and submit run before publish.';
    }

    if (action === 'RERUN') {
      if (status === 'APPROVED') return 'Published run cannot be rerun.';
      // Allow rerun for any non-approved state. After PROCESSED users may add
      // employees / fix masters and rerun to recompute. SUBMITTED runs can also
      // be rerun (which moves them back to PROCESSED).
      if (
        !(
          status === 'DRAFT' ||
          status === 'REJECTED' ||
          status === 'IN_PROGRESS' ||
          status === 'PROCESSED' ||
          status === 'SUBMITTED'
        )
      ) {
        return 'This run cannot be rerun in its current state.';
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
          const compArr = Array.isArray(res?.components) ? res.components : [];
          this.payheetComponents = compArr
            .map((c: any) => ({
              code: String(c?.code || ''),
              name: String(c?.name || c?.code || ''),
              type: String(c?.type || c?.componentType || 'INFO'),
              displayOrder: Number(c?.displayOrder || c?.display_order || 0),
            }))
            .filter((c: PayheetComponent) => !!c.code)
            .sort(
              (a: PayheetComponent, b: PayheetComponent) =>
                a.displayOrder - b.displayOrder ||
                a.code.localeCompare(b.code),
            );
          this.runEmployees = this.toArray(res).map((row: any) => ({
            employeeId: String(row?.employeeId || row?.employee_id || ''),
            empCode: row?.empCode || row?.employeeCode || '-',
            employeeName: row?.employeeName || '-',
            grossEarnings: Number(row?.grossEarnings || 0),
            totalDeductions: Number(row?.totalDeductions || 0),
            netPay: Number(row?.netPay || 0),
            totalDays: Number(row?.totalDays || row?.total_days || 0),
            daysPresent: Number(row?.daysPresent || row?.days_present || 0),
            lopDays: Number(row?.lopDays || row?.lop_days || 0),
            otHours: Number(row?.otHours || row?.ot_hours || 0),
            designation: row?.designation ?? null,
            uan: row?.uan ?? null,
            esic: row?.esic ?? null,
            monthlyGross: Number(row?.monthlyGross || row?.monthly_gross || 0),
            pfApplicable: !!(row?.pfApplicable ?? row?.pf_applicable),
            esiApplicable: !!(row?.esiApplicable ?? row?.esi_applicable),
            otherEarningsNote: row?.otherEarningsNote ?? row?.other_earnings_note ?? null,
            otherDeductionsNote: row?.otherDeductionsNote ?? row?.other_deductions_note ?? null,
            components: (row?.components || {}) as Record<string, number>,
          }));
        },
        error: () => {
          this.runEmployees = [];
          this.payheetComponents = [];
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
    if (Array.isArray(payload?.employees)) return payload.employees;
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

  private defaultNewRunMonth(): number {
    const now = new Date();
    // Previous month (Jan → Dec roll-back handled by Date math).
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getMonth() + 1;
  }

  private defaultNewRunYear(): number {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear();
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
  openNewEmployeeForm(): void {
    // Open the client employee registration form in a new tab so the user
    // doesn't lose their place on the payroll run workspace.
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/client/employees/new']),
    );
    window.open(url, '_blank');
  }

  downloadPayheetCsv(): void {
    if (!this.runEmployees.length || !this.selectedRun) {
      this.toast.warning('No employees to export.');
      return;
    }
    const earn = this.earningComponents;
    const ded = this.deductionComponents;
    const er = this.employerComponents;
    // OT_AMOUNT is rendered in the grid as a dedicated column (between OT Hrs
    // and the dynamic earnings) and is also embedded inside `grossEarnings`
    // by the engine. Surface it in the CSV the same way without
    // double-counting: pull the raw OT_AMOUNT comp value, show it as its own
    // column, and skip it when emitting the dynamic earnings list.
    const earningsExcludingOt = earn.filter((c) => c.code !== 'OT_AMOUNT');
    const headers = [
      'Employee Code',
      'Employee Name',
      'Designation',
      'Actual Gross (Registration)',
      'PF Applicable',
      'ESI Applicable',
      'UAN',
      'ESIC',
      'Total Days',
      'Payable Days',
      'LOP Days',
      'OT Hrs',
      'OT Amount',
      ...earningsExcludingOt.map((c) => c.name),
      'Gross',
      ...ded.map((c) => c.name),
      'Total Deductions',
      'Net Pay',
      ...er.map((c) => c.name),
    ];
    const escape = (v: any): string => {
      const s = v === null || v === undefined ? '' : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    // All money values are rounded UP to the next whole rupee for the export.
    const money = (v: any): number => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.ceil(n) : 0;
    };
    const lines: string[] = [headers.map(escape).join(',')];
    for (const row of this.runEmployees) {
      const cells: any[] = [
        row.empCode,
        row.employeeName,
        row.designation ?? '',
        money(row.monthlyGross),
        row.pfApplicable ? 'Yes' : 'No',
        row.esiApplicable ? 'Yes' : 'No',
        row.uan ?? '',
        row.esic ?? '',
        row.totalDays,
        row.daysPresent,
        row.lopDays,
        row.otHours,
        money(this.componentValue(row, 'OT_AMOUNT')),
        ...earningsExcludingOt.map((c) => money(this.componentValue(row, c.code))),
        money(row.grossEarnings),
        ...ded.map((c) => money(this.componentValue(row, c.code))),
        money(row.totalDeductions),
        money(row.netPay),
        ...er.map((c) => money(this.componentValue(row, c.code))),
      ];
      lines.push(cells.map(escape).join(','));
    }
    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const period = `${this.selectedRun.periodYear}-${String(this.selectedRun.periodMonth).padStart(2, '0')}`;
    const client = (this.selectedRun.clientName || 'client').replace(/[^a-z0-9]+/gi, '_');
    a.href = url;
    a.download = `payheet_${client}_${period}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

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

  async uploadAddEmpFile(): Promise<void> {
    if (!this.selectedRun || !this.addEmpParsedCodes.length) return;
    const codes = this.addEmpParsedCodes;
    const ok = await this.dialog.confirm(
      'Add Employees From File',
      `Add ${codes.length} employee(s) from file to this payroll run and compute their payroll?`,
      { confirmText: 'Add' },
    );
    if (!ok) return;

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

  async confirmAddEmployees(): Promise<void> {
    if (!this.selectedRun || !this.addEmpSelected.size) return;
    const codes = Array.from(this.addEmpSelected);
    const ok = await this.dialog.confirm(
      'Add Employees',
      `Add ${codes.length} employee(s) to this payroll run and compute their payroll?`,
      { confirmText: 'Add' },
    );
    if (!ok) return;

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

  // ── Inline per-employee edit ────────────────────────────────────
  startEditEmployee(row: RunEmployeeRow): void {
    this.editingEmpCode = row.empCode;
    this.editEmpForm = {
      workingDays: Number(row.daysPresent || 0),
      payableDays: Number(row.daysPresent || 0),
      otHours: 0,
      otherEarnings: Number(row.components?.['OTHER_EARNINGS'] || 0),
      arrearAttBonus: Number(row.components?.['ARREAR_ATT_BONUS'] || 0),
      otherDeductions: Number(row.components?.['OTHER_DEDUCTIONS'] || 0),
      otherEarningsNote: row.otherEarningsNote || '',
      otherDeductionsNote: row.otherDeductionsNote || '',
    };
  }

  cancelEditEmployee(): void {
    this.editingEmpCode = null;
  }

  // ── Inline per-employee calculation check ───────────────────────
  toggleCheckEmployee(row: RunEmployeeRow): void {
    this.checkingEmpCode =
      this.checkingEmpCode === row.empCode ? null : row.empCode;
  }

  componentName(code: string): string {
    const c = this.payheetComponents.find((x) => x.code === code);
    return c?.name || code;
  }

  /** Returns the raw stored value for a code (no PF folding). */
  rawComponent(row: RunEmployeeRow, code: string): number {
    return Number(row?.components?.[code] || 0);
  }

  /** Sum of EARNING component raw values (excludes day/info codes). */
  sumEarnings(row: RunEmployeeRow): number {
    return this.earningComponents.reduce(
      (s, c) => s + this.rawComponent(row, c.code),
      0,
    );
  }

  /** Sum of DEDUCTION raw values including PF_ER_FROM_EMP fold. */
  sumDeductions(row: RunEmployeeRow): number {
    let total = 0;
    for (const c of this.deductionComponents) {
      total += this.componentValue(row, c.code);
    }
    return total;
  }

  /** All non-empty component codes for a row, sorted by category then code. */
  allComponentRows(
    row: RunEmployeeRow,
  ): { code: string; name: string; type: string; amount: number }[] {
    const out: { code: string; name: string; type: string; amount: number }[] = [];
    const seen = new Set<string>();
    const push = (code: string, type: string) => {
      if (seen.has(code)) return;
      seen.add(code);
      out.push({
        code,
        name: this.componentName(code),
        type,
        amount: this.rawComponent(row, code),
      });
    };
    for (const c of this.earningComponents) push(c.code, 'EARNING');
    for (const c of this.deductionComponents) push(c.code, 'DEDUCTION');
    push('PF_ER_FROM_EMP', 'DEDUCTION');
    for (const c of this.employerComponents) push(c.code, 'EMPLOYER');
    // Any other component values stored on the row but not in component list
    const codes = Object.keys(row.components || {});
    for (const code of codes) {
      if (seen.has(code)) continue;
      if (this.isDayOrInfoCode(code)) continue;
      push(code, 'INFO');
    }
    return out;
  }

  // ── Payheet column helpers ──────────────────────────────────────
  get earningComponents(): PayheetComponent[] {
    return this.payheetComponents.filter(
      (c) => c.type === 'EARNING' && !this.isDayOrInfoCode(c.code),
    );
  }  get deductionComponents(): PayheetComponent[] {
    return this.payheetComponents.filter(
      (c) => c.type === 'DEDUCTION' && c.code !== 'PF_ER_FROM_EMP',
    );
  }

  get employerComponents(): PayheetComponent[] {
    return this.payheetComponents.filter((c) => c.type === 'EMPLOYER');
  }

  private isDayOrInfoCode(code: string): boolean {
    return [
      'WORKED_DAYS',
      'PAYABLE_DAYS',
      'TOTAL_DAYS',
      'LOP_DAYS',
      'OT_HOURS',
    ].includes(code);
  }

  /** Filter Preview Employees rows by free-text (employee name or code, case-insensitive). */
  get filteredRunEmployees(): RunEmployeeRow[] {
    const q = (this.runEmployeeSearch || '').trim().toLowerCase();
    if (!q) return this.runEmployees;
    return this.runEmployees.filter(
      (r) =>
        (r.employeeName || '').toLowerCase().includes(q) ||
        (r.empCode || '').toLowerCase().includes(q),
    );
  }

  /** Filter Leave Validation rows by employee name or code. */
  get filteredLeaveValidationRows(): typeof this.leaveValidationRows {
    const q = (this.leaveValidationSearch || '').trim().toLowerCase();
    if (!q) return this.leaveValidationRows;
    return this.leaveValidationRows.filter(
      (r) =>
        (r.employeeName || '').toLowerCase().includes(q) ||
        (r.empCode || '').toLowerCase().includes(q),
    );
  }

  /** Filter OT Validation rows by employee name or code. */
  get filteredOtValidationRows(): typeof this.otValidationRows {
    const q = (this.otValidationSearch || '').trim().toLowerCase();
    if (!q) return this.otValidationRows;
    return this.otValidationRows.filter(
      (r) =>
        (r.employeeName || '').toLowerCase().includes(q) ||
        (r.empCode || '').toLowerCase().includes(q),
    );
  }

  componentValue(row: RunEmployeeRow, code: string): number {
    const base = Number(row.components?.[code] || 0);
    // For employees with monthly gross >= ₹25,000 the employer PF share is
    // recovered from the employee. Surface both contributions in the single
    // employee PF deduction column so reviewers see the full deduction.
    if (
      code === 'PF_EMP' ||
      code === 'PF' ||
      code === 'PF_EMPLOYEE' ||
      code === 'EPF_EMPLOYEE'
    ) {
      const erFromEmp = Number(row.components?.['PF_ER_FROM_EMP'] || 0);
      return base + erFromEmp;
    }
    // Hide the bookkeeping component itself in the deductions row — its
    // amount is already merged into the PF column above.
    if (code === 'PF_ER_FROM_EMP') {
      return 0;
    }
    // For employees whose employer PF share has been recovered from them
    // (gross >= ₹25,000), the employer PF column should display 0 since
    // both contributions are already shown in the employee PF deduction.
    if (code === 'PF_ER' || code === 'PF_EMPLOYER' || code === 'EPF_EMPLOYER') {
      const erFromEmp = Number(row.components?.['PF_ER_FROM_EMP'] || 0);
      if (erFromEmp > 0) return 0;
    }
    return base;
  }

  saveEmployeeEdit(row: RunEmployeeRow): void {
    if (!this.selectedRun || this.editEmpBusy) return;
    const f = this.editEmpForm;
    if (f.payableDays > f.workingDays) {
      this.toast.warning('Payable days cannot exceed working days.');
      return;
    }
    this.editEmpBusy = true;
    this.http
      .post<any>(
        `/api/v1/payroll/runs/${this.selectedRun.id}/employees/${encodeURIComponent(row.empCode)}/edit-inputs`,
        {
          // workingDays from the form represents this employee's payable
          // working days for the month; the engine derives LOP from
          // (run-level total days - payableDays). We send the same value as
          // workedDays (CSV "Working Days" column) since that's what the
          // engine pro-rates against.
          workedDays: f.workingDays,
          payableDays: f.payableDays,
          otHours: f.otHours || 0,
          otherEarnings: f.otherEarnings || 0,
          arrearAttBonus: f.arrearAttBonus || 0,
          otherDeductions: f.otherDeductions || 0,
          otherEarningsNote: (f.otherEarningsNote || '').trim() || null,
          otherDeductionsNote: (f.otherDeductionsNote || '').trim() || null,
        },
      )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.editEmpBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(`${row.empCode} updated and reprocessed.`);
          this.editingEmpCode = null;
          if (this.selectedRun) {
            this.loadRunWorkspaceData(this.selectedRun.id, true);
          }
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to update employee.');
        },
      });
  }
}

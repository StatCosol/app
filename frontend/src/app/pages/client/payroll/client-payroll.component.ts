import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { ClientPayrollService } from '../../../core/client-payroll.service';
import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

type InputStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'NEEDS_CLARIFICATION'
  | 'REJECTED'
  | 'COMPLETED'
  | 'CANCELLED';

interface PayrollInputItem {
  id: string;
  title: string;
  branchId: string | null;
  periodYear: number;
  periodMonth: number;
  status: InputStatus;
  filesCount: number;
  createdAt: string | null;
}

interface StatusHistoryItem {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  remarks: string | null;
  changedAt: string | null;
}

interface InputFileItem {
  id: string;
  fileName: string;
  createdAt: string | null;
  fileType: string | null;
  downloadUrl?: string | null;
}

interface BranchStatusRow {
  branchId: string;
  totalInputs: number;
  pendingInputs: number;
  approvalQueue: number;
  exceptions: number;
  completed: number;
  lastPeriod: string;
  latestInputId: string | null;
}

interface CycleHistoryRow {
  ymKey: string;
  periodLabel: string;
  total: number;
  pending: number;
  approvals: number;
  exceptions: number;
  completed: number;
}

@Component({
  standalone: true,
  selector: 'app-client-payroll',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    StatusBadgeComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './client-payroll.component.html',
  styleUrls: ['./client-payroll.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientPayrollComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = false;
  detailLoading = false;
  actionBusy = false;
  creatingInput = false;
  uploadingFile = false;

  inputs: PayrollInputItem[] = [];
  visibleInputs: PayrollInputItem[] = [];
  pendingInputs: PayrollInputItem[] = [];
  approvalQueue: PayrollInputItem[] = [];
  exceptionList: PayrollInputItem[] = [];
  branchStatusRows: BranchStatusRow[] = [];
  cycleHistoryRows: CycleHistoryRow[] = [];

  selectedInput: PayrollInputItem | null = null;
  statusHistory: StatusHistoryItem[] = [];
  inputFiles: InputFileItem[] = [];

  filters = {
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
    status: '',
    branchId: '',
    search: '',
  };

  readonly statusOptions = [
    { label: 'All Status', value: '' },
    { label: 'Draft', value: 'DRAFT' },
    { label: 'Submitted', value: 'SUBMITTED' },
    { label: 'Needs Clarification', value: 'NEEDS_CLARIFICATION' },
    { label: 'Rejected', value: 'REJECTED' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  readonly monthOptions = [
    { label: 'All Months', value: 0 },
    { label: 'January', value: 1 },
    { label: 'February', value: 2 },
    { label: 'March', value: 3 },
    { label: 'April', value: 4 },
    { label: 'May', value: 5 },
    { label: 'June', value: 6 },
    { label: 'July', value: 7 },
    { label: 'August', value: 8 },
    { label: 'September', value: 9 },
    { label: 'October', value: 10 },
    { label: 'November', value: 11 },
    { label: 'December', value: 12 },
  ];

  readonly yearOptions = this.buildYearOptions();

  summary = {
    total: 0,
    pending: 0,
    approvals: 0,
    exceptions: 0,
    completed: 0,
    branches: 0,
  };

  newInput = {
    title: '',
    branchId: '',
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
    notes: '',
  };
  newInputFile: File | null = null;
  inputError = '';

  detailRemarks = '';
  detailDocType = 'PAYROLL_INPUT';
  detailUploadFile: File | null = null;

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly payrollSvc: ClientPayrollService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadInputs();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadInputs(): void {
    this.loading = true;
    this.payrollSvc
      .listInputs()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.inputs = this.normalizeInputs(res);
          this.recomputeWorkspace();
          this.restoreSelectedInput();
        },
        error: (err) => {
          this.inputs = [];
          this.recomputeWorkspace();
          this.selectedInput = null;
          this.statusHistory = [];
          this.inputFiles = [];
          this.toast.error(err?.error?.message || 'Could not load payroll inputs.');
        },
      });
  }

  onFiltersChanged(): void {
    this.recomputeWorkspace();
  }

  clearFilters(): void {
    this.filters = {
      periodYear: new Date().getFullYear(),
      periodMonth: new Date().getMonth() + 1,
      status: '',
      branchId: '',
      search: '',
    };
    this.recomputeWorkspace();
  }

  createInput(): void {
    const title = this.newInput.title.trim();
    if (!title || !this.newInput.periodYear || !this.newInput.periodMonth) {
      this.inputError = 'Title, year and month are required.';
      return;
    }

    this.creatingInput = true;
    this.inputError = '';
    const payload: any = {
      title,
      periodYear: this.newInput.periodYear,
      periodMonth: this.newInput.periodMonth,
      notes: this.newInput.notes?.trim() || undefined,
      branchId: this.newInput.branchId?.trim() || undefined,
    };

    this.payrollSvc
      .createInput(payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.creatingInput = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (created: any) => {
          const createdId = String(created?.id || '');
          if (this.newInputFile && createdId) {
            this.uploadFileForInput(createdId, this.newInputFile, true);
          } else {
            this.toast.success('Payroll input created successfully.');
            this.resetCreateForm();
            this.loadInputs();
          }
        },
        error: (err) => {
          this.inputError = err?.error?.message || 'Could not create payroll input.';
          this.toast.error(this.inputError);
        },
      });
  }

  selectInput(row: PayrollInputItem): void {
    this.selectedInput = row;
    this.detailRemarks = '';
    this.detailUploadFile = null;
    this.loadInputDetail(row.id);
  }

  refreshSelectedInput(): void {
    if (!this.selectedInput?.id) return;
    this.loadInputDetail(this.selectedInput.id);
  }

  submitSelectedInput(): void {
    if (!this.selectedInput || !this.canSubmit(this.selectedInput)) return;
    this.changeStatus('SUBMITTED');
  }

  cancelSelectedInput(): void {
    if (!this.selectedInput || !this.canCancel(this.selectedInput)) return;
    this.changeStatus('CANCELLED');
  }

  uploadDetailAttachment(): void {
    if (!this.selectedInput?.id || !this.detailUploadFile) {
      return;
    }
    this.uploadFileForInput(this.selectedInput.id, this.detailUploadFile, false);
  }

  downloadInputFile(file: InputFileItem): void {
    const rawUrl = file.downloadUrl || this.payrollSvc.downloadInputFileUrl(file.id);
    window.open(rawUrl, '_blank');
  }

  onCreateFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newInputFile = input?.files?.[0] || null;
  }

  onDetailFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.detailUploadFile = input?.files?.[0] || null;
  }

  canSubmit(row: PayrollInputItem): boolean {
    return ['DRAFT', 'NEEDS_CLARIFICATION', 'REJECTED'].includes(this.statusKey(row.status));
  }

  canCancel(row: PayrollInputItem): boolean {
    return ['DRAFT', 'NEEDS_CLARIFICATION', 'REJECTED'].includes(this.statusKey(row.status));
  }

  toBranchLabel(branchId: string | null | undefined): string {
    const val = String(branchId || '').trim();
    return val ? val : 'Unmapped';
  }

  monthLabel(periodMonth: number): string {
    const opt = this.monthOptions.find((m) => m.value === periodMonth);
    return opt?.label || `M${periodMonth}`;
  }

  periodLabel(row: { periodYear: number; periodMonth: number }): string {
    return `${this.monthLabel(row.periodMonth)} ${row.periodYear}`;
  }

  openBranchLatest(row: BranchStatusRow): void {
    if (!row.latestInputId) return;
    const match = this.inputs.find((item) => item.id === row.latestInputId);
    if (match) this.selectInput(match);
  }

  trackById(_index: number, row: any): string {
    return String(row.id || row.branchId || row.ymKey || _index);
  }

  private loadInputDetail(inputId: string): void {
    this.detailLoading = true;
    forkJoin({
      history: this.payrollSvc.getStatusHistory(inputId).pipe(catchError(() => of([]))),
      files: this.payrollSvc.listInputFiles(inputId).pipe(catchError(() => of([]))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.detailLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ history, files }) => {
          this.statusHistory = this.normalizeHistory(history);
          this.inputFiles = this.normalizeFiles(files);
        },
        error: () => {
          this.statusHistory = [];
          this.inputFiles = [];
          this.toast.error('Could not load input details.');
        },
      });
  }

  private changeStatus(status: InputStatus): void {
    if (!this.selectedInput?.id || this.actionBusy) return;
    this.actionBusy = true;
    this.payrollSvc
      .updateInputStatus(this.selectedInput.id, {
        status,
        remarks: this.detailRemarks?.trim() || undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(`Input marked as ${status}.`);
          this.detailRemarks = '';
          this.loadInputs();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Could not update input status.');
        },
      });
  }

  private uploadFileForInput(inputId: string, file: File, fromCreate: boolean): void {
    this.uploadingFile = true;
    this.payrollSvc
      .uploadInputFile(inputId, file, {
        docType: this.detailDocType || 'PAYROLL_INPUT',
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.uploadingFile = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          if (fromCreate) {
            this.toast.success('Payroll input and attachment saved.');
            this.resetCreateForm();
            this.loadInputs();
            return;
          }
          this.toast.success('Attachment uploaded successfully.');
          this.detailUploadFile = null;
          this.refreshSelectedInput();
          this.loadInputs();
        },
        error: (err) => {
          const message = err?.error?.message || 'Could not upload file.';
          this.toast.error(message);
        },
      });
  }

  private restoreSelectedInput(): void {
    if (!this.selectedInput?.id) return;
    const found = this.inputs.find((row) => row.id === this.selectedInput?.id);
    this.selectedInput = found || null;
    if (this.selectedInput) {
      this.loadInputDetail(this.selectedInput.id);
    } else {
      this.statusHistory = [];
      this.inputFiles = [];
    }
  }

  private recomputeWorkspace(): void {
    this.visibleInputs = this.applyFilters(this.inputs);
    this.pendingInputs = this.visibleInputs.filter((row) =>
      ['DRAFT', 'NEEDS_CLARIFICATION', 'REJECTED'].includes(this.statusKey(row.status)),
    );
    this.approvalQueue = this.visibleInputs.filter((row) => this.statusKey(row.status) === 'SUBMITTED');
    this.exceptionList = this.visibleInputs.filter((row) =>
      ['NEEDS_CLARIFICATION', 'REJECTED'].includes(this.statusKey(row.status)),
    );
    this.branchStatusRows = this.buildBranchStatusRows(this.visibleInputs);
    this.cycleHistoryRows = this.buildCycleHistory(this.inputs);

    const uniqueBranches = new Set(
      this.visibleInputs.map((row) => this.toBranchLabel(row.branchId)),
    );
    this.summary = {
      total: this.visibleInputs.length,
      pending: this.pendingInputs.length,
      approvals: this.approvalQueue.length,
      exceptions: this.exceptionList.length,
      completed: this.visibleInputs.filter((row) => this.statusKey(row.status) === 'COMPLETED').length,
      branches: uniqueBranches.size,
    };
  }

  private applyFilters(rows: PayrollInputItem[]): PayrollInputItem[] {
    const text = this.filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (this.filters.periodYear && row.periodYear !== Number(this.filters.periodYear)) {
        return false;
      }
      if (Number(this.filters.periodMonth || 0) > 0 && row.periodMonth !== Number(this.filters.periodMonth)) {
        return false;
      }
      if (this.filters.status && this.statusKey(row.status) !== this.statusKey(this.filters.status)) {
        return false;
      }
      if (this.filters.branchId.trim()) {
        const branchFilter = this.filters.branchId.trim().toLowerCase();
        if (!String(row.branchId || '').toLowerCase().includes(branchFilter)) {
          return false;
        }
      }
      if (!text) return true;
      return (
        String(row.title || '').toLowerCase().includes(text) ||
        String(row.branchId || '').toLowerCase().includes(text) ||
        String(row.id || '').toLowerCase().includes(text)
      );
    });
  }

  private buildBranchStatusRows(rows: PayrollInputItem[]): BranchStatusRow[] {
    const map = new Map<string, BranchStatusRow>();
    for (const row of rows) {
      const key = this.toBranchLabel(row.branchId);
      const existing = map.get(key) || {
        branchId: key,
        totalInputs: 0,
        pendingInputs: 0,
        approvalQueue: 0,
        exceptions: 0,
        completed: 0,
        lastPeriod: this.periodLabel(row),
        latestInputId: row.id,
      };
      existing.totalInputs += 1;

      const status = this.statusKey(row.status);
      if (['DRAFT', 'NEEDS_CLARIFICATION', 'REJECTED'].includes(status)) {
        existing.pendingInputs += 1;
      }
      if (status === 'SUBMITTED') {
        existing.approvalQueue += 1;
      }
      if (['NEEDS_CLARIFICATION', 'REJECTED'].includes(status)) {
        existing.exceptions += 1;
      }
      if (status === 'COMPLETED') {
        existing.completed += 1;
      }

      const existingPeriodOrder = this.periodOrder(existing.lastPeriod);
      const rowPeriodOrder = row.periodYear * 100 + row.periodMonth;
      if (rowPeriodOrder >= existingPeriodOrder) {
        existing.lastPeriod = this.periodLabel(row);
      }

      if (!existing.latestInputId || this.compareCreatedAt(row, rows.find((x) => x.id === existing.latestInputId) || null) >= 0) {
        existing.latestInputId = row.id;
      }

      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.exceptions !== a.exceptions) return b.exceptions - a.exceptions;
      if (b.pendingInputs !== a.pendingInputs) return b.pendingInputs - a.pendingInputs;
      return a.branchId.localeCompare(b.branchId);
    });
  }

  private buildCycleHistory(rows: PayrollInputItem[]): CycleHistoryRow[] {
    const map = new Map<string, CycleHistoryRow>();
    for (const row of rows) {
      const ym = `${row.periodYear}-${String(row.periodMonth).padStart(2, '0')}`;
      const existing = map.get(ym) || {
        ymKey: ym,
        periodLabel: this.periodLabel(row),
        total: 0,
        pending: 0,
        approvals: 0,
        exceptions: 0,
        completed: 0,
      };
      existing.total += 1;
      const status = this.statusKey(row.status);
      if (['DRAFT', 'NEEDS_CLARIFICATION', 'REJECTED'].includes(status)) existing.pending += 1;
      if (status === 'SUBMITTED') existing.approvals += 1;
      if (['NEEDS_CLARIFICATION', 'REJECTED'].includes(status)) existing.exceptions += 1;
      if (status === 'COMPLETED') existing.completed += 1;
      map.set(ym, existing);
    }

    return Array.from(map.values())
      .sort((a, b) => (a.ymKey < b.ymKey ? 1 : -1))
      .slice(0, 12);
  }

  private compareCreatedAt(a: PayrollInputItem, b: PayrollInputItem | null): number {
    const ad = new Date(a.createdAt || 0).getTime();
    const bd = new Date(b?.createdAt || 0).getTime();
    return ad - bd;
  }

  private periodOrder(label: string): number {
    const [month, year] = String(label || '').split(' ');
    const y = Number(year || 0);
    const m = this.monthOptions.find((opt) => opt.label === month)?.value || 0;
    return y * 100 + Number(m);
  }

  private statusKey(status: unknown): string {
    return String(status || '').trim().toUpperCase();
  }

  private normalizeInputs(res: any): PayrollInputItem[] {
    const arr = Array.isArray(res) ? res : (res?.data || []);
    return (arr || [])
      .map((row: any) => ({
        id: String(row?.id || ''),
        title: String(row?.title || ''),
        branchId: row?.branchId || row?.branch_id || null,
        periodYear: Number(row?.periodYear || row?.period_year || 0),
        periodMonth: Number(row?.periodMonth || row?.period_month || 0),
        status: this.normalizeStatus(row?.status),
        filesCount: Number(row?.filesCount || row?.files_count || 0),
        createdAt: row?.createdAt || row?.created_at || null,
      }))
      .filter((row: PayrollInputItem) => !!row.id)
      .sort((a: PayrollInputItem, b: PayrollInputItem) => this.compareCreatedAt(b, a));
  }

  private normalizeHistory(res: any): StatusHistoryItem[] {
    const arr = Array.isArray(res) ? res : (res?.data || []);
    return (arr || [])
      .map((row: any) => ({
        id: String(row?.id || ''),
        fromStatus: row?.fromStatus || row?.from_status || null,
        toStatus: String(row?.toStatus || row?.to_status || ''),
        remarks: row?.remarks || null,
        changedAt: row?.changedAt || row?.changed_at || null,
      }))
      .sort((a: StatusHistoryItem, b: StatusHistoryItem) => {
        const at = new Date(a.changedAt || 0).getTime();
        const bt = new Date(b.changedAt || 0).getTime();
        return bt - at;
      });
  }

  private normalizeFiles(res: any): InputFileItem[] {
    const arr = Array.isArray(res) ? res : (res?.data || []);
    return (arr || [])
      .map((row: any) => ({
        id: String(row?.id || ''),
        fileName: String(row?.fileName || row?.name || 'Document'),
        createdAt: row?.createdAt || row?.created_at || null,
        fileType: row?.fileType || row?.file_type || null,
        downloadUrl: row?.downloadUrl || row?.download_url || null,
      }))
      .filter((row: InputFileItem) => !!row.id);
  }

  private normalizeStatus(status: unknown): InputStatus {
    const key = this.statusKey(status) as InputStatus;
    const supported: InputStatus[] = [
      'DRAFT',
      'SUBMITTED',
      'NEEDS_CLARIFICATION',
      'REJECTED',
      'COMPLETED',
      'CANCELLED',
    ];
    return supported.includes(key) ? key : 'DRAFT';
  }

  private buildYearOptions(): Array<{ label: string; value: number }> {
    const year = new Date().getFullYear();
    const values: Array<{ label: string; value: number }> = [];
    for (let y = year - 2; y <= year + 1; y += 1) {
      values.push({ label: String(y), value: y });
    }
    return values.reverse();
  }

  private resetCreateForm(): void {
    this.newInput = {
      title: '',
      branchId: '',
      periodYear: new Date().getFullYear(),
      periodMonth: new Date().getMonth() + 1,
      notes: '',
    };
    this.newInputFile = null;
    this.inputError = '';
  }
}

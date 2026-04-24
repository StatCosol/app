import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { AuthService } from '../../../core/auth.service';
import { CrmReturnsService } from '../../../core/crm-returns.service';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';
import { ReportsService } from '../../../core/reports.service';
import { ReturnsUploadService } from '../../../core/returns-upload.service';
import { ComplianceContextService } from '../../../core/services/compliance-context.service';
import { ReturnsAutomationService, FilingGenerationResult, OverdueAlertResult } from '../../../core/returns-automation.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ComplianceAdvancedFiltersComponent, FilterDropdownOption } from '../../../shared/components/compliance-advanced-filters/compliance-advanced-filters.component';
import { ComplianceTaskFilters } from '../../../core/models/returns.models';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

type FilingStatus = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'NOT_APPLICABLE';
type FilingWorkflow = 'PREPARED' | 'REVIEWED' | 'FILED' | 'ACKNOWLEDGED' | 'REJECTED' | 'N/A';

interface ReturnFiling {
  id: string;
  clientId?: string | null;
  clientName?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  lawType?: string | null;
  returnType?: string | null;
  periodYear?: number | null;
  periodMonth?: number | null;
  periodLabel?: string | null;
  dueDate?: string | null;
  filedDate?: string | null;
  status: FilingStatus;
  ackNumber?: string | null;
  ackFilePath?: string | null;
  challanFilePath?: string | null;
  createdByRole?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface TimelineEvent {
  type?: string;
  action?: string;
  title: string;
  timestamp: string;
  note?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
}

interface BranchPendingRow {
  branchId: string;
  clientName: string;
  total: number;
  pending: number;
  filed: number;
  acknowledged: number;
  rejected: number;
  overdue: number;
}

interface StatusAction {
  label: string;
  value: FilingStatus;
  variant: 'primary' | 'secondary' | 'danger';
}

interface ChecklistRow {
  label: string;
  done: boolean;
  note: string;
}

@Component({
  standalone: true,
  selector: 'app-crm-returns-filings',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    ActionButtonComponent,
    ComplianceAdvancedFiltersComponent,
  ],
  templateUrl: './crm-returns-filings.component.html',
  styleUrls: ['./crm-returns-filings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrmReturnsFilingsComponent implements OnInit, OnDestroy {
  @ViewChild('ackInput') ackInput!: ElementRef<HTMLInputElement>;
  @ViewChild('challanInput') challanInput!: ElementRef<HTMLInputElement>;
  @ViewChild('proofInput') proofInput!: ElementRef<HTMLInputElement>;

  private readonly destroy$ = new Subject<void>();
  private contextSub?: Subscription;

  selectedTaskIds: string[] = [];

  filings: ReturnFiling[] = [];
  filteredFilings: ReturnFiling[] = [];
  branchPendingRows: BranchPendingRow[] = [];
  selected: ReturnFiling | null = null;
  selectedTimeline: TimelineEvent[] = [];

  lawTypes: string[] = [];
  clientOptions: { id: string; name: string }[] = [];
  branchOptions: { id: string; name: string }[] = [];
  filterClientOptions: { id: string; name: string }[] = [];
  filterBranchOptions: { id: string; name: string }[] = [];

  loading = false;
  searchTerm = '';
  lawTypeFilter = '';
  clientFilter = '';
  branchFilter = '';
  statusFilter = '';
  pendingOnly = false;
  periodYearFilter = '';
  periodMonthFilter = '';

  selectedFilingIdForAck: string | null = null;
  selectedFilingIdForChallan: string | null = null;
  uploadingAck = false;
  uploadingChallan = false;
  uploadingProof = false;
  statusBusy = false;

  // --- Create form state ---
  showCreateForm = false;
  creating = false;
  returnTypes: { code: string; label: string; lawType: string }[] = [];
  newFiling = {
    clientId: '',
    branchId: '',
    returnType: '',
    lawType: '',
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
    periodLabel: '',
    dueDate: '',
  };

  yearOptions: number[] = [];
  monthOptions = [
    { value: 1, label: 'Jan' },
    { value: 2, label: 'Feb' },
    { value: 3, label: 'Mar' },
    { value: 4, label: 'Apr' },
    { value: 5, label: 'May' },
    { value: 6, label: 'Jun' },
    { value: 7, label: 'Jul' },
    { value: 8, label: 'Aug' },
    { value: 9, label: 'Sep' },
    { value: 10, label: 'Oct' },
    { value: 11, label: 'Nov' },
    { value: 12, label: 'Dec' },
  ];

  readonly statusActions: StatusAction[] = [
    { label: 'Set Prepared', value: 'PENDING', variant: 'secondary' },
    { label: 'Set Reviewed', value: 'IN_PROGRESS', variant: 'secondary' },
    { label: 'Set Filed', value: 'SUBMITTED', variant: 'secondary' },
    { label: 'Acknowledge', value: 'APPROVED', variant: 'primary' },
    { label: 'Reject', value: 'REJECTED', variant: 'danger' },
    { label: 'Not Applicable', value: 'NOT_APPLICABLE', variant: 'secondary' },
  ];

  // Automation panel
  showAutomationPanel = false;
  autoGenerating = false;
  autoRenewing = false;
  autoAlerting = false;
  lastAutoResult: FilingGenerationResult | null = null;
  lastRenewalResult: FilingGenerationResult | null = null;
  lastAlertResult: OverdueAlertResult | null = null;

  // Advanced filters
  advLawTypeOptions: FilterDropdownOption[] = [];
  exportingCsv = false;
  exportingXlsx = false;

  constructor(
    private readonly auth: AuthService,
    private readonly crmReturns: CrmReturnsService,
    private readonly crmClientsApi: CrmClientsApi,
    private readonly toast: ToastService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly dialog: ConfirmDialogService,
    private readonly returnsUpload: ReturnsUploadService,
    private readonly complianceContext: ComplianceContextService,
    private readonly returnsAutomation: ReturnsAutomationService,
    private readonly protectedFiles: ProtectedFileService,
  ) {
    const now = new Date().getFullYear();
    for (let year = now; year >= now - 4; year -= 1) {
      this.yearOptions.push(year);
    }
  }

  ngOnInit(): void {
    this.loadReturnTypes();
    this.loadClients();

    this.contextSub = this.complianceContext.state$.subscribe((ctx) => {
      if (ctx.clientId && ctx.clientId !== this.clientFilter) {
        this.clientFilter = ctx.clientId;
        this.onFilterClientChange();
      } else {
        this.loadFilings();
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/crm/dashboard']);
  }

  ngOnDestroy(): void {
    this.contextSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackById(index: number, item: any): string {
    return String(item?.id || item?.branchId || index);
  }

  loadFilings(): void {
    this.loading = true;
    const params: Record<string, string> = {};
    if (this.clientFilter) params['clientId'] = this.clientFilter;
    if (this.statusFilter) params['status'] = this.statusFilter;
    if (this.branchFilter) params['branchId'] = this.branchFilter;
    if (this.periodYearFilter) params['periodYear'] = this.periodYearFilter;
    if (this.periodMonthFilter) params['periodMonth'] = this.periodMonthFilter;
    if (this.lawTypeFilter) params['lawType'] = this.lawTypeFilter;

    this.crmReturns
      .listFilings(params)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.filings = (rows || []) as ReturnFiling[];
          this.rebuildDropdownOptions();
          this.applyFilters();
        },
        error: (err) => {
          this.filings = [];
          this.filteredFilings = [];
          this.selected = null;
          this.selectedTimeline = [];
          this.rebuildDropdownOptions();
          this.toast.error(err?.error?.message || 'Failed to load returns workspace');
        },
      });
  }

  loadReturnTypes(): void {
    this.crmReturns
      .getReturnTypes()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (types) => {
          this.returnTypes = types || [];
          this.cdr.markForCheck();
        },
        error: () => this.toast.error('Failed to load return types'),
      });
  }

  loadClients(): void {
    this.crmClientsApi.getAssignedClients().pipe(takeUntil(this.destroy$)).subscribe({
      next: (clients) => {
        const opts = (clients || []).map((c: any) => ({ id: c.id, name: c.clientName || c.name || 'Client' })).sort((a: any, b: any) => a.name.localeCompare(b.name));
        this.clientOptions = opts;
        this.filterClientOptions = opts;
        if (this.clientOptions.length === 1) {
          this.newFiling.clientId = this.clientOptions[0].id;
          this.loadBranchesForClient(this.clientOptions[0].id);
        }
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('Failed to load clients'),
    });
  }

  loadBranchesForClient(clientId: string): void {
    if (!clientId) {
      this.branchOptions = [];
      this.cdr.markForCheck();
      return;
    }
    this.crmClientsApi.getBranchesForClient(clientId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (branches) => {
        this.branchOptions = (branches || []).map((b: any) => ({ id: b.id, name: b.branchName || b.name || 'Branch' })).sort((a: any, b: any) => a.name.localeCompare(b.name));
        if (this.branchOptions.length === 1) {
          this.newFiling.branchId = this.branchOptions[0].id;
        }
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('Failed to load branches'),
    });
  }

  onClientChange(): void {
    this.newFiling.branchId = '';
    this.loadBranchesForClient(this.newFiling.clientId);
  }

  onFilterClientChange(): void {
    this.branchFilter = '';
    if (this.clientFilter) {
      this.crmClientsApi.getBranchesForClient(this.clientFilter).pipe(takeUntil(this.destroy$)).subscribe({
        next: (branches) => {
          this.filterBranchOptions = (branches || []).map((b: any) => ({ id: b.id, name: b.branchName || b.name || 'Branch' })).sort((a: any, b: any) => a.name.localeCompare(b.name));
          this.cdr.markForCheck();
          this.loadFilings();
        },
        error: () => {
          this.filterBranchOptions = [];
          this.toast.error('Failed to load branches');
          this.loadFilings();
        },
      });
    } else {
      this.filterBranchOptions = [];
      this.loadFilings();
    }
  }

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    if (this.showCreateForm) {
      // Pre-fill client if only one available
      if (this.clientOptions.length === 1) {
        this.newFiling.clientId = this.clientOptions[0].id;
      }
      if (this.branchOptions.length === 1) {
        this.newFiling.branchId = this.branchOptions[0].id;
      }
    }
  }

  onReturnTypeChange(): void {
    const chosen = this.returnTypes.find((t) => t.code === this.newFiling.returnType);
    if (chosen) {
      this.newFiling.lawType = chosen.lawType;
    }
  }

  createFiling(): void {
    if (!this.newFiling.clientId || !this.newFiling.returnType) {
      this.toast.info('Select client and return type');
      return;
    }
    const chosen = this.returnTypes.find((t) => t.code === this.newFiling.returnType);
    const payload: any = {
      clientId: this.newFiling.clientId,
      branchId: this.newFiling.branchId || undefined,
      returnType: chosen?.code || this.newFiling.returnType,
      lawType: chosen?.lawType || this.newFiling.lawType || 'GENERAL',
      periodYear: Number(this.newFiling.periodYear),
      periodMonth: this.newFiling.periodMonth ? Number(this.newFiling.periodMonth) : undefined,
      periodLabel: this.newFiling.periodLabel || undefined,
      dueDate: this.newFiling.dueDate || undefined,
    };
    this.creating = true;
    this.crmReturns
      .createFiling(payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.creating = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Return filing created');
          this.showCreateForm = false;
          this.resetNewFiling();
          this.loadFilings();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to create filing'),
      });
  }

  private resetNewFiling(): void {
    this.newFiling = {
      clientId: '',
      branchId: '',
      returnType: '',
      lawType: '',
      periodYear: new Date().getFullYear(),
      periodMonth: new Date().getMonth() + 1,
      periodLabel: '',
      dueDate: '',
    };
  }

  applyFilters(): void {
    const q = this.searchTerm.trim().toLowerCase();
    this.filteredFilings = this.filings.filter((row) => {
      if (this.lawTypeFilter && (row.lawType || '') !== this.lawTypeFilter) return false;
      if (this.clientFilter && (row.clientId || '') !== this.clientFilter) return false;
      if (this.branchFilter && (row.branchId || '') !== this.branchFilter) return false;
      if (this.statusFilter && row.status !== this.statusFilter) return false;
      if (this.pendingOnly && !['PENDING', 'IN_PROGRESS'].includes(row.status)) return false;
      if (this.periodYearFilter && String(row.periodYear || '') !== this.periodYearFilter) return false;
      if (this.periodMonthFilter && String(row.periodMonth || '') !== this.periodMonthFilter) return false;
      if (!q) return true;
      const text =
        `${row.returnType || ''} ${row.lawType || ''} ${row.status || ''} ${row.ackNumber || ''}`.toLowerCase();
      return text.includes(q);
    });

    this.rebuildBranchPendingRows();
    this.hydrateSelection(this.selected?.id);
  }

  selectFiling(row: ReturnFiling): void {
    this.selected = row;
    this.selectedTimeline = this.buildTimeline(row);
    this.fetchTimeline(row.id);
  }

  private fetchTimeline(filingId: string): void {
    this.crmReturns
      .getTimeline(filingId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (events) => {
          if (this.selected?.id !== filingId) return;
          this.selectedTimeline = (events || []).map((e: any) => ({
            type: e.type,
            action: e.action,
            title: this.formatTimelineTitle(e),
            timestamp: e.createdAt,
            note: e.remarks || null,
            actorName: e.actorName,
            actorRole: e.actorRole,
          }));
          if (!this.selectedTimeline.length) {
            this.selectedTimeline = this.buildTimeline(this.selected!);
          }
          this.cdr.markForCheck();
        },
        error: () => { /* keep local timeline on failure */ },
      });
  }

  private formatTimelineTitle(e: any): string {
    const actor = e.actorName || e.actorRole || '';
    const prefix = actor ? `${actor}: ` : '';
    const actionMap: Record<string, string> = {
      CREATED: 'Filing created',
      UPDATE: 'Filing updated',
      SOFT_DELETE: 'Filing deleted',
      DOCUMENT_UPLOADED: 'Document uploaded',
      RETURNED_FOR_CORRECTION: 'Returned for correction',
      REMINDER_SENT: 'Reminder sent',
      OWNER_CHANGED: 'Owner changed',
      SUBMITTED: 'Submitted for review',
      APPROVED: 'Approved / Acknowledged',
      REJECTED: 'Rejected',
      BULK_ACTION: 'Bulk action applied',
    };
    const label = actionMap[e.action] || e.action || 'Activity';
    return `${prefix}${label}`;
  }

  async moveStatus(nextStatus: FilingStatus): Promise<void> {
    if (!this.selected?.id || this.statusBusy) return;
    const target = this.selected;
    const guardReason = this.transitionGuardReason(target, nextStatus);
    if (guardReason) {
      this.toast.warning('Transition blocked', guardReason);
      return;
    }

    const workflowLabel = this.mapWorkflow(nextStatus);
    if (
      !(await this.dialog.confirm(
        'Update Filing Status',
        `Move filing to ${workflowLabel}?`,
        { confirmText: 'Update' },
      ))
    ) {
      return;
    }

    this.statusBusy = true;
    this.crmReturns
      .updateStatus(target.id, { status: nextStatus })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.statusBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(`Status updated to ${workflowLabel}`);
          this.loadAndReselect(target.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to update status'),
      });
  }

  openAckUpload(filingId: string): void {
    this.selectedFilingIdForAck = filingId;
    this.ackInput.nativeElement.value = '';
    this.ackInput.nativeElement.click();
  }

  async deleteFiling(row: ReturnFiling): Promise<void> {
    if (!row?.id || this.statusBusy) return;

    const result = await this.dialog.prompt(
      'Delete Filing',
      `Delete "${row.returnType || 'this filing'}"? This action can only be reversed by an admin.`,
      { placeholder: 'Reason for deletion (required)', confirmText: 'Delete' },
    );
    if (!result.confirmed) return;

    const reason = (result.value || '').trim();
    if (!reason) {
      this.toast.warning('Reason required', 'Please provide a reason for deleting this filing.');
      return;
    }

    this.statusBusy = true;
    this.crmReturns
      .deleteFiling(row.id, reason)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.statusBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Filing deleted');
          this.selected = null;
          this.loadFilings();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to delete filing'),
      });
  }

  async onAckFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.selectedFilingIdForAck) return;

    const result = await this.dialog.prompt(
      'ACK / ARN Number',
      'Capture acknowledgement number for filing audit trail',
      { placeholder: 'ACK / ARN / Receipt No.' },
    );
    if (!result.confirmed) {
      this.ackInput.nativeElement.value = '';
      return;
    }
    const ackNumber = (result.value || '').trim() || undefined;

    this.uploadingAck = true;
    const filingId = this.selectedFilingIdForAck;
    this.crmReturns
      .uploadAck(filingId, file, ackNumber)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.uploadingAck = false;
          this.ackInput.nativeElement.value = '';
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Acknowledgement uploaded');
          this.loadAndReselect(filingId);
        },
        error: (err) => this.toast.error(err?.error?.message || 'ACK upload failed'),
      });
  }

  openChallanUpload(filingId: string): void {
    this.selectedFilingIdForChallan = filingId;
    this.challanInput.nativeElement.value = '';
    this.challanInput.nativeElement.click();
  }

  onChallanFileSelected(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.selectedFilingIdForChallan) return;

    this.uploadingChallan = true;
    const filingId = this.selectedFilingIdForChallan;
    this.crmReturns
      .uploadChallan(filingId, file)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.uploadingChallan = false;
          this.challanInput.nativeElement.value = '';
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Challan uploaded');
          this.loadAndReselect(filingId);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Challan upload failed'),
      });
  }

  openFile(path: string | null | undefined): void {
    if (!path) return;
    this.protectedFiles
      .open(path)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: (err) => {
          this.toast.error(err?.error?.message || 'Unable to open file.');
        },
      });
  }

  exportCsv(): void {
    ReportsService.exportCsv(
      this.filteredFilings,
      [
        { key: 'clientName', label: 'Client' },
        { key: 'branchName', label: 'Branch' },
        { key: 'lawType', label: 'Law Type' },
        { key: 'returnType', label: 'Return Type' },
        { key: 'periodYear', label: 'Year' },
        { key: 'periodMonth', label: 'Month' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'status', label: 'Status' },
        { key: 'ackNumber', label: 'ACK Number' },
      ],
      'crm-returns-workspace.csv',
    );
  }

  exportServerCsv(): void {
    this.exportingCsv = true;
    const params: Record<string, string> = {};
    if (this.clientFilter) params['clientId'] = this.clientFilter;
    if (this.statusFilter) params['status'] = this.statusFilter;
    if (this.branchFilter) params['branchId'] = this.branchFilter;
    if (this.periodYearFilter) params['periodYear'] = this.periodYearFilter;
    if (this.periodMonthFilter) params['periodMonth'] = this.periodMonthFilter;
    if (this.lawTypeFilter) params['lawType'] = this.lawTypeFilter;

    this.crmReturns
      .exportCsv(params)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.exportingCsv = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'crm-returns-export.csv';
          a.click();
          URL.revokeObjectURL(a.href);
        },
        error: () => this.toast.error('Export failed'),
      });
  }

  exportServerXlsx(): void {
    this.exportingXlsx = true;
    const params: Record<string, string> = {};
    if (this.clientFilter) params['clientId'] = this.clientFilter;
    if (this.statusFilter) params['status'] = this.statusFilter;
    if (this.branchFilter) params['branchId'] = this.branchFilter;
    if (this.periodYearFilter) params['periodYear'] = this.periodYearFilter;
    if (this.periodMonthFilter) params['periodMonth'] = this.periodMonthFilter;
    if (this.lawTypeFilter) params['lawType'] = this.lawTypeFilter;

    this.crmReturns
      .exportXlsx(params)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.exportingXlsx = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'crm-returns-export.xlsx';
          a.click();
          URL.revokeObjectURL(a.href);
        },
        error: () => this.toast.error('Excel export failed'),
      });
  }

  onAdvancedFilterChange(f: ComplianceTaskFilters): void {
    this.periodYearFilter = f.periodYear ? String(f.periodYear) : '';
    this.periodMonthFilter = f.periodMonth ? String(f.periodMonth) : '';
    this.statusFilter = f.status || '';
    this.lawTypeFilter = f.lawType || '';
    this.pendingOnly = !!f.pendingOnly;
    this.loadFilings();
  }

  private rebuildDropdownOptions(): void {
    this.lawTypes = Array.from(new Set(this.filings.map((x) => x.lawType || '').filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
    this.advLawTypeOptions = this.lawTypes.map((l) => ({ value: l, label: l }));
  }

  get preparedCount(): number {
    return this.filings.filter((x) => x.status === 'PENDING').length;
  }

  get reviewedCount(): number {
    return this.filings.filter((x) => x.status === 'IN_PROGRESS').length;
  }

  get filedCount(): number {
    return this.filings.filter((x) => x.status === 'SUBMITTED').length;
  }

  get acknowledgedCount(): number {
    return this.filings.filter((x) => x.status === 'APPROVED').length;
  }

  get rejectedCount(): number {
    return this.filings.filter((x) => x.status === 'REJECTED').length;
  }

  get naCount(): number {
    return this.filings.filter((x) => x.status === 'NOT_APPLICABLE').length;
  }

  mapWorkflow(status: FilingStatus): FilingWorkflow {
    if (status === 'PENDING') return 'PREPARED';
    if (status === 'IN_PROGRESS') return 'REVIEWED';
    if (status === 'SUBMITTED') return 'FILED';
    if (status === 'APPROVED') return 'ACKNOWLEDGED';
    if (status === 'NOT_APPLICABLE') return 'N/A';
    return 'REJECTED';
  }

  sourceLabel(role: string | null | undefined): string {
    if (role === 'CRM') return 'CRM';
    if (role === 'CLIENT') return 'Client';
    if (role === 'BRANCH') return 'Branch';
    return '—';
  }

  sourceBadgeClass(role: string | null | undefined): string {
    if (role === 'CRM') return 'source-badge source-badge--crm';
    if (role === 'CLIENT') return 'source-badge source-badge--client';
    if (role === 'BRANCH') return 'source-badge source-badge--branch';
    return 'source-badge';
  }

  workflowClass(status: FilingStatus): string {
    const mapped = this.mapWorkflow(status);
    if (mapped === 'ACKNOWLEDGED') return 'wf wf--ok';
    if (mapped === 'FILED') return 'wf wf--filed';
    if (mapped === 'REVIEWED') return 'wf wf--review';
    if (mapped === 'REJECTED') return 'wf wf--bad';
    if (mapped === 'N/A') return 'wf wf--na';
    return 'wf wf--prep';
  }

  canMoveTo(nextStatus: FilingStatus, row: ReturnFiling): boolean {
    return !this.transitionGuardReason(row, nextStatus);
  }

  transitionGuardReason(row: ReturnFiling, nextStatus: FilingStatus): string | null {
    if (!row) return 'No filing selected.';
    if (row.status === nextStatus) return 'Already in this status.';

    const allowed: Record<FilingStatus, FilingStatus[]> = {
      PENDING: ['IN_PROGRESS', 'NOT_APPLICABLE'],
      IN_PROGRESS: ['PENDING', 'SUBMITTED', 'REJECTED', 'NOT_APPLICABLE'],
      SUBMITTED: ['IN_PROGRESS', 'APPROVED', 'REJECTED'],
      APPROVED: [],
      REJECTED: ['IN_PROGRESS'],
      NOT_APPLICABLE: ['PENDING'],
    };

    if (!allowed[row.status].includes(nextStatus)) {
      return `Transition not allowed from ${this.mapWorkflow(row.status)}.`;
    }

    if (nextStatus === 'SUBMITTED' && !row.challanFilePath) {
      return 'Upload challan proof before setting Filed.';
    }
    if (nextStatus === 'APPROVED') {
      if (!row.ackFilePath) return 'Upload ACK/ARN proof before Acknowledge.';
      if (!row.ackNumber) return 'Capture ACK/ARN number before Acknowledge.';
    }

    return null;
  }

  periodText(row: ReturnFiling): string {
    const year = row.periodYear ? String(row.periodYear) : '-';
    if (!row.periodMonth) return year;
    return `${year}-${String(row.periodMonth).padStart(2, '0')}`;
  }

  focusBranchPending(branchId: string): void {
    if (branchId === 'UNMAPPED') return;
    this.branchFilter = branchId;
    this.applyFilters();
  }

  branchLabel(branchId: string | null | undefined): string {
    if (!branchId) return '-';
    if (branchId === 'UNMAPPED') return 'Unmapped';
    const filing = this.filings.find((f) => f.branchId === branchId && f.branchName);
    return filing?.branchName || 'Branch';
  }

  dueHint(row: ReturnFiling): string {
    if (!row.dueDate) return 'No due date';
    const due = new Date(row.dueDate);
    if (Number.isNaN(due.getTime())) return 'Due date invalid';
    const today = this.startOfDay(new Date());
    const dueDay = this.startOfDay(due);
    const diff = Math.floor((dueDay.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return 'Due today';
    return `Due in ${diff}d`;
  }

  isOverdue(row: ReturnFiling): boolean {
    if (!row.dueDate) return false;
    if (row.status === 'APPROVED' || row.status === 'REJECTED' || row.status === 'NOT_APPLICABLE') return false;
    const due = new Date(row.dueDate);
    if (Number.isNaN(due.getTime())) return false;
    return this.startOfDay(due).getTime() < this.startOfDay(new Date()).getTime();
  }

  referenceCode(row: ReturnFiling): string {
    return `RET-${String(row.id || '').slice(0, 8).toUpperCase()}`;
  }

  filingAgeText(row: ReturnFiling): string {
    const created = row.createdAt ? new Date(row.createdAt) : null;
    if (!created || Number.isNaN(created.getTime())) return '-';
    const now = Date.now();
    const diff = Math.max(0, now - created.getTime());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  }

  detailChecklist(row: ReturnFiling): ChecklistRow[] {
    return [
      {
        label: 'Challan proof',
        done: !!row.challanFilePath,
        note: row.challanFilePath ? 'Uploaded' : 'Pending upload',
      },
      {
        label: 'ACK proof',
        done: !!row.ackFilePath,
        note: row.ackFilePath ? 'Uploaded' : 'Pending upload',
      },
      {
        label: 'ACK number',
        done: !!row.ackNumber,
        note: row.ackNumber || 'Capture ARN / receipt number',
      },
      {
        label: 'Filed date',
        done: !!row.filedDate,
        note: row.filedDate ? new Date(row.filedDate).toLocaleDateString('en-IN') : 'Not recorded',
      },
      {
        label: 'Ready for Acknowledge',
        done: row.status === 'APPROVED' || !this.transitionGuardReason(row, 'APPROVED'),
        note: row.status === 'APPROVED'
          ? 'Acknowledged'
          : this.transitionGuardReason(row, 'APPROVED') || 'All mandatory proofs available',
      },
    ];
  }

  private hydrateSelection(id?: string | null): void {
    if (!this.filteredFilings.length) {
      this.selected = null;
      this.selectedTimeline = [];
      return;
    }
    if (id) {
      const found = this.filteredFilings.find((f) => f.id === id);
      if (found) {
        this.selectFiling(found);
        return;
      }
    }
    this.selectFiling(this.filteredFilings[0]);
  }

  private loadAndReselect(id: string): void {
    this.loading = true;
    const params: Record<string, string> = {};
    if (this.clientFilter) params['clientId'] = this.clientFilter;
    if (this.statusFilter) params['status'] = this.statusFilter;
    if (this.branchFilter) params['branchId'] = this.branchFilter;
    if (this.periodYearFilter) params['periodYear'] = this.periodYearFilter;
    if (this.periodMonthFilter) params['periodMonth'] = this.periodMonthFilter;

    this.crmReturns
      .listFilings(params)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.filings = (rows || []) as ReturnFiling[];
          this.rebuildDropdownOptions();
          this.applyFilters();
          this.hydrateSelection(id);
        },
      });
  }

  private buildTimeline(row: ReturnFiling): TimelineEvent[] {
    const timeline: TimelineEvent[] = [];

    if (row.createdAt) {
      timeline.push({ title: 'Filing record created', timestamp: row.createdAt });
    }

    if (row.ackFilePath) {
      timeline.push({
        title: 'Acknowledgement uploaded',
        timestamp: row.updatedAt || row.createdAt || new Date().toISOString(),
        note: row.ackNumber ? `ACK No: ${row.ackNumber}` : null,
      });
    }

    if (row.challanFilePath) {
      timeline.push({
        title: 'Challan uploaded',
        timestamp: row.updatedAt || row.createdAt || new Date().toISOString(),
      });
    }

    if (row.filedDate) {
      timeline.push({
        title: 'Filed date recorded',
        timestamp: row.filedDate,
      });
    }

    timeline.push({
      title: `Workflow moved to ${this.mapWorkflow(row.status)}`,
      timestamp: row.updatedAt || row.createdAt || new Date().toISOString(),
      note: `Raw status: ${row.status}`,
    });

    return timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  private rebuildBranchPendingRows(): void {
    const map = new Map<string, BranchPendingRow>();

    for (const row of this.filteredFilings) {
      const branchKey = String(row.branchId || 'UNMAPPED');
      const clientLabel = row.clientName || 'Unknown Client';
      const key = `${row.clientId || ''}_${branchKey}`;
      const bucket = map.get(key) || {
        branchId: branchKey,
        clientName: clientLabel,
        total: 0,
        pending: 0,
        filed: 0,
        acknowledged: 0,
        rejected: 0,
        overdue: 0,
      };

      bucket.total += 1;
      if (row.status === 'PENDING' || row.status === 'IN_PROGRESS') bucket.pending += 1;
      if (row.status === 'SUBMITTED') bucket.filed += 1;
      if (row.status === 'APPROVED') bucket.acknowledged += 1;
      if (row.status === 'REJECTED') bucket.rejected += 1;
      if (this.isOverdue(row)) bucket.overdue += 1;

      map.set(key, bucket);
    }

    this.branchPendingRows = Array.from(map.values()).sort((a, b) => {
      if (b.pending !== a.pending) return b.pending - a.pending;
      if (b.overdue !== a.overdue) return b.overdue - a.overdue;
      return a.branchId.localeCompare(b.branchId);
    });
  }

  openProofUpload(): void {
    this.proofInput.nativeElement.value = '';
    this.proofInput.nativeElement.click();
  }

  onProofFileSelected(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingProof = true;
    this.returnsUpload
      .uploadProof(file)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.uploadingProof = false;
          this.proofInput.nativeElement.value = '';
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.toast.success(`Proof uploaded: ${res.originalName}`);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Proof upload failed'),
      });
  }

  // ── Selection helpers ──

  toggleTask(taskId: string, checked: boolean): void {
    if (checked) {
      if (!this.selectedTaskIds.includes(taskId)) {
        this.selectedTaskIds.push(taskId);
      }
      return;
    }
    this.selectedTaskIds = this.selectedTaskIds.filter((id) => id !== taskId);
  }

  toggleAllCurrent(checked: boolean): void {
    this.selectedTaskIds = checked ? this.filteredFilings.map((t) => t.id) : [];
  }

  isSelected(taskId: string): boolean {
    return this.selectedTaskIds.includes(taskId);
  }

  // ── Bulk actions ──

  bulkReadyForFiling(): void {
    const ids = [...this.selectedTaskIds];
    if (!ids.length) return;

    this.crmReturns
      .bulkReviewBranchInput(ids, {
        action: 'READY_FOR_FILING',
        remarks: 'Bulk reviewed by CRM',
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.selectedTaskIds = [];
          this.toast.success('Bulk ready for filing completed');
          this.loadFilings();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Bulk ready for filing failed'),
      });
  }

  bulkReturnToBranch(): void {
    const ids = [...this.selectedTaskIds];
    if (!ids.length) return;

    const remarks = prompt('Enter CRM remarks for bulk return to branch') || '';

    this.crmReturns
      .bulkReviewBranchInput(ids, {
        action: 'RETURNED_TO_BRANCH',
        remarks,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.selectedTaskIds = [];
          this.toast.success('Bulk return to branch completed');
          this.loadFilings();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Bulk return to branch failed'),
      });
  }

  bulkMarkFiled(): void {
    const ids = [...this.selectedTaskIds];
    if (!ids.length) return;

    const today = new Date().toISOString().slice(0, 10);

    this.crmReturns
      .bulkMarkFiled(ids, { filedOn: today })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.selectedTaskIds = [];
          this.toast.success('Bulk mark filed completed');
          this.loadFilings();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Bulk mark filed failed'),
      });
  }

  bulkVerify(): void {
    const ids = [...this.selectedTaskIds];
    if (!ids.length) return;

    this.crmReturns
      .bulkVerifyAndClose(ids)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.selectedTaskIds = [];
          this.toast.success('Bulk verify completed');
          this.loadFilings();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Bulk verify failed'),
      });
  }

  async bulkSendReminder(): Promise<void> {
    const ids = [...this.selectedTaskIds];
    if (!ids.length) return;

    const result = await this.dialog.prompt(
      'Send Bulk Reminder',
      `Send a reminder to ${ids.length} selected filing(s)?`,
      { placeholder: 'Optional message', confirmText: 'Send' },
    );
    if (!result.confirmed) return;

    const message = (result.value || '').trim() || undefined;
    this.crmReturns
      .sendBulkReminders(ids, message)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.selectedTaskIds = [];
          this.toast.success('Reminders sent');
          this.loadFilings();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Bulk reminder failed'),
      });
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  // ── Automation Panel ──────────────────────────────────

  toggleAutomationPanel(): void {
    this.showAutomationPanel = !this.showAutomationPanel;
  }

  runAutoGenerate(): void {
    this.autoGenerating = true;
    const now = new Date();
    this.returnsAutomation
      .generateFilings(now.getFullYear(), now.getMonth() + 1)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.autoGenerating = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.lastAutoResult = res;
          this.toast.success(
            `Generated ${res.filingsCreated} filings, ${res.tasksCreated} tasks (${res.skipped} skipped)`,
          );
          this.loadFilings();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Auto-generation failed'),
      });
  }

  runAutoRenewals(): void {
    this.autoRenewing = true;
    this.returnsAutomation
      .generateRenewals()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.autoRenewing = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.lastRenewalResult = res;
          this.toast.success(
            `Generated ${res.filingsCreated} renewal filings, ${res.tasksCreated} tasks`,
          );
          this.loadFilings();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Renewal generation failed'),
      });
  }

  runOverdueAlerts(): void {
    this.autoAlerting = true;
    this.returnsAutomation
      .sendOverdueAlerts()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.autoAlerting = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.lastAlertResult = res;
          this.toast.success(`Sent ${res.alertsSent} overdue alerts`);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Overdue alert failed'),
      });
  }
}

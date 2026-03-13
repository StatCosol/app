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
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { CrmReturnsService } from '../../../core/crm-returns.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

type FilingStatus = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
type FilingWorkflow = 'PREPARED' | 'REVIEWED' | 'FILED' | 'ACKNOWLEDGED' | 'REJECTED';

interface ReturnFiling {
  id: string;
  clientId?: string | null;
  branchId?: string | null;
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
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface TimelineEvent {
  title: string;
  timestamp: string;
  note?: string | null;
}

interface BranchPendingRow {
  branchId: string;
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
  ],
  templateUrl: './crm-returns-filings.component.html',
  styleUrls: ['./crm-returns-filings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrmReturnsFilingsComponent implements OnInit, OnDestroy {
  @ViewChild('ackInput') ackInput!: ElementRef<HTMLInputElement>;
  @ViewChild('challanInput') challanInput!: ElementRef<HTMLInputElement>;

  private readonly destroy$ = new Subject<void>();

  filings: ReturnFiling[] = [];
  filteredFilings: ReturnFiling[] = [];
  branchPendingRows: BranchPendingRow[] = [];
  selected: ReturnFiling | null = null;
  selectedTimeline: TimelineEvent[] = [];

  loading = false;
  searchTerm = '';
  lawTypeFilter = '';
  branchFilter = '';
  statusFilter = '';
  pendingOnly = false;
  periodYearFilter = '';
  periodMonthFilter = '';

  selectedFilingIdForAck: string | null = null;
  selectedFilingIdForChallan: string | null = null;
  uploadingAck = false;
  uploadingChallan = false;
  statusBusy = false;

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
  ];

  constructor(
    private readonly crmReturns: CrmReturnsService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    const now = new Date().getFullYear();
    for (let year = now; year >= now - 4; year -= 1) {
      this.yearOptions.push(year);
    }
  }

  ngOnInit(): void {
    this.loadFilings();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackById(index: number, item: any): string {
    return String(item?.id || item?.branchId || index);
  }

  loadFilings(): void {
    this.loading = true;
    const params: Record<string, string> = {};
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
          this.applyFilters();
        },
        error: (err) => {
          this.filings = [];
          this.filteredFilings = [];
          this.selected = null;
          this.selectedTimeline = [];
          this.toast.error(err?.error?.message || 'Failed to load returns workspace');
        },
      });
  }

  applyFilters(): void {
    const q = this.searchTerm.trim().toLowerCase();
    this.filteredFilings = this.filings.filter((row) => {
      if (this.lawTypeFilter && (row.lawType || '') !== this.lawTypeFilter) return false;
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
  }

  async moveStatus(nextStatus: FilingStatus): Promise<void> {
    if (!this.selected?.id || this.statusBusy) return;
    const target = this.selected;
    const guardReason = this.transitionGuardReason(target, nextStatus);
    if (guardReason) {
      this.toast.warning(`Transition blocked: ${guardReason}`);
      return;
    }

    const confirmed = window.confirm(`Move filing to ${nextStatus.replace('_', ' ')}?`);
    if (!confirmed) {
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
          this.toast.success(`Status updated to ${nextStatus}`);
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

  async onAckFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.selectedFilingIdForAck) return;

    const raw = window.prompt('Capture acknowledgement number for filing audit trail', '');
    if (raw === null) return;
    const ackNumber = raw.trim() || undefined;

    this.uploadingAck = true;
    const filingId = this.selectedFilingIdForAck;
    this.crmReturns
      .uploadAck(filingId, file, ackNumber)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.uploadingAck = false;
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
    const resolved = /^https?:\/\//i.test(path) ? path : new URL(path, window.location.origin).toString();
    window.open(resolved, '_blank');
  }

  exportCsv(): void {
    const columns = [
      { key: 'lawType', label: 'Law Type' },
      { key: 'returnType', label: 'Return Type' },
      { key: 'periodYear', label: 'Year' },
      { key: 'periodMonth', label: 'Month' },
      { key: 'dueDate', label: 'Due Date' },
      { key: 'status', label: 'Status' },
      { key: 'ackNumber', label: 'ACK Number' },
    ] as const;

    const escapeCell = (value: unknown): string => {
      const text = String(value ?? '');
      if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
      return text;
    };

    const header = columns.map((col) => escapeCell(col.label)).join(',');
    const rows = this.filteredFilings.map((row) =>
      columns.map((col) => escapeCell((row as unknown as Record<string, unknown>)[col.key])).join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'crm-returns-workspace.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  get lawTypes(): string[] {
    return Array.from(new Set(this.filings.map((x) => x.lawType || '').filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }

  get branches(): string[] {
    return Array.from(new Set(this.filings.map((x) => x.branchId || '').filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
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

  mapWorkflow(status: FilingStatus): FilingWorkflow {
    if (status === 'PENDING') return 'PREPARED';
    if (status === 'IN_PROGRESS') return 'REVIEWED';
    if (status === 'SUBMITTED') return 'FILED';
    if (status === 'APPROVED') return 'ACKNOWLEDGED';
    return 'REJECTED';
  }

  workflowClass(status: FilingStatus): string {
    const mapped = this.mapWorkflow(status);
    if (mapped === 'ACKNOWLEDGED') return 'wf wf--ok';
    if (mapped === 'FILED') return 'wf wf--filed';
    if (mapped === 'REVIEWED') return 'wf wf--review';
    if (mapped === 'REJECTED') return 'wf wf--bad';
    return 'wf wf--prep';
  }

  canMoveTo(nextStatus: FilingStatus, row: ReturnFiling): boolean {
    return !this.transitionGuardReason(row, nextStatus);
  }

  transitionGuardReason(row: ReturnFiling, nextStatus: FilingStatus): string | null {
    if (!row) return 'No filing selected.';
    if (row.status === nextStatus) return 'Already in this status.';

    const allowed: Record<FilingStatus, FilingStatus[]> = {
      PENDING: ['IN_PROGRESS'],
      IN_PROGRESS: ['PENDING', 'SUBMITTED', 'REJECTED'],
      SUBMITTED: ['IN_PROGRESS', 'APPROVED', 'REJECTED'],
      APPROVED: [],
      REJECTED: ['IN_PROGRESS'],
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

  branchLabel(branchId: string): string {
    return branchId === 'UNMAPPED' ? 'Unmapped' : branchId;
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
    if (row.status === 'APPROVED' || row.status === 'REJECTED') return false;
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
        done: !this.transitionGuardReason(row, 'APPROVED'),
        note: this.transitionGuardReason(row, 'APPROVED') || 'All mandatory proofs available',
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
      const key = String(row.branchId || 'UNMAPPED');
      const bucket = map.get(key) || {
        branchId: key,
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

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
}

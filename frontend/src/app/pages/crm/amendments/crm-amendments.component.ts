import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { finalize, takeUntil } from 'rxjs/operators';

import { CrmAmendmentStatus, CrmDueItemsService } from '../../../core/crm-due-items.service';
import { DueItemRow, DueItemStatus, DueKpis, DueTab } from '../../../shared/models/crm-due-items.model';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatCardComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

type SortMode = 'DUE_ASC' | 'DUE_DESC' | 'UPDATED_DESC';
type LocalEventKind = 'COMMENT' | 'RETURN' | 'ACTION';
type WorkflowStatus = Exclude<DueItemStatus, 'OVERDUE'>;

interface TimelineEvent {
  title: string;
  timestamp: string;
  note?: string;
  kind: LocalEventKind;
}

interface DetailChecklistItem {
  label: string;
  done: boolean;
  note: string;
}

interface BranchPendingRow {
  branchId: string;
  branchName: string;
  total: number;
  pending: number;
  completed: number;
  overdue: number;
}

interface AmendmentDetail {
  id: string;
  clientId: string;
  branchId: string | null;
  lawType: string | null;
  returnType: string | null;
  periodYear: number | null;
  periodMonth: number | null;
  periodLabel: string | null;
  dueDate: string | null;
  filedDate: string | null;
  status: WorkflowStatus;
  ackNumber: string | null;
  ackFilePath: string | null;
  challanFilePath: string | null;
  crmOwner: string | null;
  crmLastReminderAt: string | null;
  crmLastNote: string | null;
  crmLastNoteAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

@Component({
  selector: 'app-crm-amendments',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    StatCardComponent,
    StatusBadgeComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ActionButtonComponent,
  ],
  templateUrl: './crm-amendments.component.html',
  styleUrls: ['./crm-amendments.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrmAmendmentsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  tab: DueTab = 'OVERDUE';
  month = new Date().toISOString().slice(0, 7);
  clientId = '';
  branchId = '';
  q = '';
  sortMode: SortMode = 'DUE_ASC';

  kpis: DueKpis = { overdue: 0, dueSoon: 0, thisMonth: 0, completed: 0 };
  items: DueItemRow[] = [];
  viewItems: DueItemRow[] = [];
  branchPendingRows: BranchPendingRow[] = [];
  selectedItem: DueItemRow | null = null;
  selectedDetail: AmendmentDetail | null = null;
  selectedTimeline: TimelineEvent[] = [];

  localHistory: Record<string, TimelineEvent[]> = {};

  total = 0;
  page = 1;
  limit = 20;
  loading = false;
  detailLoading = false;
  actionBusy = false;

  readonly tabs: DueTab[] = ['OVERDUE', 'DUE_SOON', 'THIS_MONTH', 'COMPLETED'];

  constructor(
    private readonly svc: CrmDueItemsService,
    private readonly toast: ToastService,
    private readonly dialog: ConfirmDialogService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  goBack(): void {
    this.router.navigate(['/crm/dashboard']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setTab(t: DueTab): void {
    this.tab = t;
    this.page = 1;
    this.load();
  }

  load(pg = 1): void {
    this.page = pg;
    this.loading = true;
    const params: Record<string, any> = {
      month: this.month,
      tab: this.tab,
      category: 'AMENDMENT',
      page: this.page,
      limit: this.limit,
    };
    if (this.clientId.trim()) params['clientId'] = this.clientId.trim();
    if (this.branchId.trim()) params['branchId'] = this.branchId.trim();
    if (this.q) params['q'] = this.q;

    forkJoin([this.svc.getKpis({ month: this.month, category: 'AMENDMENT', clientId: this.clientId }), this.svc.list(params)])
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
      next: ([kpis, res]) => {
        this.kpis = kpis;
        this.items = res.items || [];
        this.total = res.total;
        this.applyView(this.selectedItem?.id || null);
      },
      error: () => {
        this.toast.error('Failed to load amendments.');
        this.cdr.markForCheck();
      },
    });
  }

  clearFilters(): void {
    this.month = new Date().toISOString().slice(0, 7);
    this.clientId = '';
    this.branchId = '';
    this.q = '';
    this.tab = 'OVERDUE';
    this.sortMode = 'DUE_ASC';
    this.page = 1;
    this.load();
  }

  selectItem(item: DueItemRow): void {
    if (this.selectedItem?.id !== item.id) {
      this.selectedDetail = null;
    }
    this.selectedItem = item;
    this.selectedTimeline = this.buildTimeline(item);
    this.loadDetail(item.id);
  }

  canMarkInProgress(item: DueItemRow): boolean {
    const status = this.normalizedStatus(item);
    return status === 'PENDING' || status === 'REJECTED';
  }

  canMarkSubmitted(item: DueItemRow): boolean {
    return this.normalizedStatus(item) === 'IN_PROGRESS';
  }

  canApprove(item: DueItemRow): boolean {
    return this.normalizedStatus(item) === 'SUBMITTED';
  }

  async markInProgress(item: DueItemRow): Promise<void> {
    if (this.actionBusy || !this.canMarkInProgress(item)) return;
    const confirmed = await this.dialog.confirm(
      'Move amendment to In Progress',
      `Start review for "${item.title}"?`,
      { confirmText: 'Start Review' },
    );
    if (!confirmed) return;
    this.updateWorkflowStatus(item, 'IN_PROGRESS', 'Moved to in-progress');
  }

  async markSubmitted(item: DueItemRow): Promise<void> {
    if (this.actionBusy || !this.canMarkSubmitted(item)) return;
    const confirmed = await this.dialog.confirm(
      'Mark amendment as submitted',
      `Mark "${item.title}" as submitted for final approval?`,
      { confirmText: 'Mark Submitted' },
    );
    if (!confirmed) return;
    this.updateWorkflowStatus(item, 'SUBMITTED', 'Marked as submitted');
  }

  async approve(item: DueItemRow): Promise<void> {
    if (this.actionBusy || !this.canApprove(item)) return;
    if (
      !(await this.dialog.confirm('Approve amendment', `Approve "${item.title}" for ${item.branchName}?`, {
        confirmText: 'Approve',
      }))
    ) {
      return;
    }
    this.updateWorkflowStatus(item, 'APPROVED', 'Amendment approved');
  }

  async reject(item: DueItemRow): Promise<void> {
    if (this.actionBusy) return;
    const result = await this.dialog.prompt('Reject amendment', 'Provide rejection remarks for audit trail.', {
      placeholder: 'Reason for rejection',
      confirmText: 'Reject',
    });
    const remarks = (result.value || '').trim();
    if (!result.confirmed) return;
    if (!remarks) {
      this.toast.error('Remarks are required for rejection.');
      return;
    }
    this.updateWorkflowStatus(item, 'REJECTED', 'Amendment rejected', remarks);
  }

  async returnForUpdate(item: DueItemRow): Promise<void> {
    if (this.actionBusy) return;
    const result = await this.dialog.prompt('Return amendment to branch', 'Request corrective update from branch.', {
      placeholder: 'Message to branch',
      defaultValue: 'Please revise amendment details and resubmit with corrected reference data.',
      confirmText: 'Send Request',
    });
    const message = (result.value || '').trim();
    if (!result.confirmed) return;
    if (!message) {
      this.toast.error('Message is required.');
      return;
    }

    this.actionBusy = true;
    this.svc
      .requestFromBranch(item.id, `Amendment returned: ${message}`, 'RETURN')
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addEvent(item.id, 'Returned to branch', message, 'RETURN');
          this.toast.success('Returned to branch.');
          this.load(this.page);
        },
        error: () => this.toast.error('Return request failed.'),
      });
  }

  async addComment(item: DueItemRow): Promise<void> {
    if (this.actionBusy) return;
    const result = await this.dialog.prompt('Add amendment comment', 'Capture follow-up comments for timeline.', {
      placeholder: 'Comment',
      confirmText: 'Add Comment',
    });
    const comment = (result.value || '').trim();
    if (!result.confirmed) return;
    if (!comment) {
      this.toast.error('Comment is required.');
      return;
    }

    this.actionBusy = true;
    this.svc
      .addAmendmentComment(item.id, comment)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addEvent(item.id, 'Comment added', comment, 'COMMENT');
          this.toast.success('Comment added.');
          this.loadDetail(item.id);
          this.cdr.markForCheck();
        },
        error: () => this.toast.error('Comment action failed.'),
      });
  }

  async sendReminder(item: DueItemRow): Promise<void> {
    if (this.actionBusy) return;
    const result = await this.dialog.prompt('Send amendment follow-up', 'Send reminder to branch for pending amendment.', {
      placeholder: 'Reminder message',
      defaultValue: 'Follow-up reminder: Please submit amendment response with supporting documents.',
      confirmText: 'Send Reminder',
    });
    const message = (result.value || '').trim();
    if (!result.confirmed) return;
    if (!message) {
      this.toast.error('Reminder message is required.');
      return;
    }

    this.actionBusy = true;
    this.svc
      .requestFromBranch(item.id, message, 'REMINDER')
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addEvent(item.id, 'Follow-up reminder sent', message, 'COMMENT');
          this.toast.success('Reminder sent.');
          this.loadDetail(item.id);
          this.load(this.page);
        },
        error: () => this.toast.error('Reminder failed.'),
      });
  }

  authorityReference(item: DueItemRow): string {
    return this.selectedDetail?.ackNumber || this.referenceFor(item);
  }

  authorityType(item: DueItemRow): string {
    const law = this.selectedDetail?.lawType || item.act || 'GENERAL';
    const retType = this.selectedDetail?.returnType || item.title || 'AMENDMENT';
    return `${law} / ${retType}`;
  }

  authorityOwner(item: DueItemRow): string {
    return this.selectedDetail?.crmOwner || item.ownerAssigned || 'Unassigned';
  }

  filingPeriod(item: DueItemRow): string {
    if (this.selectedDetail?.periodLabel) return this.selectedDetail.periodLabel;
    if (item.period) return item.period;
    const y = this.selectedDetail?.periodYear;
    const m = this.selectedDetail?.periodMonth;
    if (y && m) return `${y}-${String(m).padStart(2, '0')}`;
    if (y) return String(y);
    return '-';
  }

  hasPreviousPage(): boolean {
    return this.page > 1;
  }

  hasNextPage(): boolean {
    return this.page * this.limit < this.total;
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  goToPreviousPage(): void {
    if (!this.hasPreviousPage()) return;
    this.load(this.page - 1);
  }

  goToNextPage(): void {
    if (!this.hasNextPage()) return;
    this.load(this.page + 1);
  }

  referenceFor(item: DueItemRow): string {
    return `AMD-${item.id.slice(0, 8).toUpperCase()}`;
  }

  dueText(item: DueItemRow): string {
    if (!item.dueDate) return '-';
    const days = this.daysToDue(item);
    if (days === null) return '-';
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Due today';
    return `Due in ${days}d`;
  }

  dueClass(item: DueItemRow): string {
    const days = this.daysToDue(item);
    if (days === null) return 'due-chip';
    if (days < 0) return 'due-chip due-chip--danger';
    if (days <= 7) return 'due-chip due-chip--warn';
    return 'due-chip due-chip--ok';
  }

  get evidenceCount(): number {
    return this.viewItems.filter((x) => x.evidenceUrl !== null && x.evidenceUrl !== '').length;
  }

  get reminderSentCount(): number {
    return this.viewItems.filter((x) => {
      if (x.lastReminderAt) return true;
      const local = this.localHistory[x.id] || [];
      return local.some((e) => e.title.toLowerCase().includes('reminder'));
    }).length;
  }

  lastReminderFor(item: DueItemRow): string {
    if (this.selectedDetail?.id === item.id && this.selectedDetail.crmLastReminderAt) {
      return this.selectedDetail.crmLastReminderAt;
    }
    if (item.lastReminderAt) return item.lastReminderAt;
    const local = (this.localHistory[item.id] || [])
      .filter((e) => e.title.toLowerCase().includes('reminder'))
      .sort((a, b) => this.timeValue(b.timestamp) - this.timeValue(a.timestamp));
    return local[0]?.timestamp || '';
  }

  workflowSteps(item: DueItemRow): Array<{ label: string; state: 'done' | 'active' | 'bad' | 'todo' }> {
    const status = this.selectedDetail?.status || this.normalizedStatus(item);
    const steps = [
      { label: 'Requested', state: 'todo' as const },
      { label: 'Under Review', state: 'todo' as const },
      { label: 'Submitted', state: 'todo' as const },
      { label: 'Approved', state: 'todo' as const },
    ];
    if (status === 'REJECTED') {
      return steps.map((s, idx) => ({
        ...s,
        state: idx <= 1 ? 'done' : idx === 2 ? 'active' : 'bad',
      }));
    }
    if (status === 'APPROVED') {
      return steps.map((s) => ({ ...s, state: 'done' }));
    }
    if (status === 'SUBMITTED') {
      return steps.map((s, idx) => ({ ...s, state: idx <= 2 ? 'done' : 'active' }));
    }
    if (status === 'IN_PROGRESS') {
      return steps.map((s, idx) => ({ ...s, state: idx <= 1 ? 'done' : 'todo' }));
    }
    return steps.map((s, idx) => ({ ...s, state: idx === 0 ? 'active' : 'todo' }));
  }

  workflowStepClass(state: 'done' | 'active' | 'bad' | 'todo'): string {
    if (state === 'done') return 'step step--done';
    if (state === 'active') return 'step step--active';
    if (state === 'bad') return 'step step--bad';
    return 'step';
  }

  detailChecklist(item: DueItemRow): DetailChecklistItem[] {
    const authorityRef = this.authorityReference(item);
    return [
      {
        label: 'Supporting evidence',
        done: !!item.evidenceUrl || !!this.selectedDetail?.ackFilePath || !!this.selectedDetail?.challanFilePath,
        note:
          item.evidenceUrl || this.selectedDetail?.ackFilePath || this.selectedDetail?.challanFilePath
            ? 'Evidence attached'
            : 'Awaiting documents',
      },
      {
        label: 'Authority reference',
        done: authorityRef !== '-',
        note: authorityRef,
      },
      {
        label: 'Remarks captured',
        done: !!item.remarks || !!this.selectedDetail?.crmLastNote,
        note:
          item.remarks || this.selectedDetail?.crmLastNote
            ? 'Reviewer notes available'
            : 'No remarks yet',
      },
      {
        label: 'Branch follow-up',
        done: this.lastReminderFor(item) !== '',
        note: this.lastReminderFor(item)
          ? `Last: ${new Date(this.lastReminderFor(item)).toLocaleString('en-IN')}`
          : 'No follow-up reminder',
      },
      {
        label: 'Due date control',
        done: !!(this.selectedDetail?.dueDate || item.dueDate),
        note: (this.selectedDetail?.dueDate || item.dueDate) ? this.dueText(item) : 'Due date missing',
      },
    ];
  }

  trackById(index: number, item: any): string {
    return String(item?.id || item?.branchId || index);
  }

  focusBranchPending(branchId: string): void {
    if (!branchId) return;
    this.branchId = branchId;
    this.load(1);
  }

  branchLabel(row: BranchPendingRow): string {
    return row.branchName || 'Unmapped';
  }

  private loadDetail(itemId: string): void {
    this.detailLoading = true;
    this.svc
      .getAmendment(itemId)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
        finalize(() => {
          this.detailLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((detailRaw) => {
        const detail = this.normalizeDetail(detailRaw);
        this.selectedDetail = detail;
        if (this.selectedItem?.id === itemId) {
          this.selectedTimeline = this.buildTimeline(this.selectedItem);
        }
      });
  }

  private updateWorkflowStatus(
    item: DueItemRow,
    status: CrmAmendmentStatus,
    successMessage: string,
    reason?: string | null,
  ): void {
    this.actionBusy = true;
    this.svc
      .updateAmendmentStatus(item.id, status, reason || null)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          const note = reason?.trim() || `Status changed to ${status}`;
          this.addEvent(item.id, `Status moved to ${status}`, note, 'ACTION');
          this.toast.success(successMessage);
          this.load(this.page);
          this.loadDetail(item.id);
        },
        error: (err) => {
          this.toast.error(err?.error?.message || `Failed to move status to ${status}.`);
        },
      });
  }

  private normalizedStatus(item: DueItemRow): WorkflowStatus {
    if (item.status === 'OVERDUE') return 'PENDING';
    return item.status as WorkflowStatus;
  }

  private normalizeDetail(raw: any): AmendmentDetail | null {
    if (!raw || typeof raw !== 'object' || !raw.id) return null;
    const statusValue = String(raw.status || 'PENDING').toUpperCase();
    const status: WorkflowStatus =
      statusValue === 'IN_PROGRESS' ||
      statusValue === 'SUBMITTED' ||
      statusValue === 'APPROVED' ||
      statusValue === 'REJECTED'
        ? (statusValue as WorkflowStatus)
        : 'PENDING';

    return {
      id: String(raw.id),
      clientId: String(raw.clientId || ''),
      branchId: raw.branchId ? String(raw.branchId) : null,
      lawType: raw.lawType ? String(raw.lawType) : null,
      returnType: raw.returnType ? String(raw.returnType) : null,
      periodYear: Number.isFinite(Number(raw.periodYear)) ? Number(raw.periodYear) : null,
      periodMonth: Number.isFinite(Number(raw.periodMonth)) ? Number(raw.periodMonth) : null,
      periodLabel: raw.periodLabel ? String(raw.periodLabel) : null,
      dueDate: raw.dueDate ? String(raw.dueDate) : null,
      filedDate: raw.filedDate ? String(raw.filedDate) : null,
      status,
      ackNumber: raw.ackNumber ? String(raw.ackNumber) : null,
      ackFilePath: raw.ackFilePath ? String(raw.ackFilePath) : null,
      challanFilePath: raw.challanFilePath ? String(raw.challanFilePath) : null,
      crmOwner: raw.crmOwner ? String(raw.crmOwner) : null,
      crmLastReminderAt: raw.crmLastReminderAt ? String(raw.crmLastReminderAt) : null,
      crmLastNote: raw.crmLastNote ? String(raw.crmLastNote) : null,
      crmLastNoteAt: raw.crmLastNoteAt ? String(raw.crmLastNoteAt) : null,
      createdAt: raw.createdAt ? String(raw.createdAt) : null,
      updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
    };
  }

  private applyView(selectedId: string | null): void {
    const sorted = [...this.items];
    sorted.sort((a, b) => {
      if (this.sortMode === 'DUE_ASC') {
        return this.timeValue(a.dueDate) - this.timeValue(b.dueDate);
      }
      if (this.sortMode === 'DUE_DESC') {
        return this.timeValue(b.dueDate) - this.timeValue(a.dueDate);
      }
      return this.timeValue(b.lastUpdatedAt) - this.timeValue(a.lastUpdatedAt);
    });
    this.viewItems = sorted;
    this.rebuildBranchPendingRows();

    if (!this.viewItems.length) {
      this.selectedItem = null;
      this.selectedDetail = null;
      this.selectedTimeline = [];
      this.cdr.markForCheck();
      return;
    }

    if (selectedId) {
      const found = this.viewItems.find((row) => row.id === selectedId);
      if (found) {
        this.selectItem(found);
        this.cdr.markForCheck();
        return;
      }
    }
    this.selectItem(this.viewItems[0]);
    this.cdr.markForCheck();
  }

  private addEvent(itemId: string, title: string, note: string, kind: LocalEventKind): void {
    const current = this.localHistory[itemId] || [];
    this.localHistory[itemId] = [...current, { title, note, kind, timestamp: new Date().toISOString() }];
    if (this.selectedItem?.id === itemId) {
      this.selectedTimeline = this.buildTimeline(this.selectedItem);
    }
  }

  private buildTimeline(item: DueItemRow): TimelineEvent[] {
    const timeline: TimelineEvent[] = [];
    const detail = this.selectedDetail?.id === item.id ? this.selectedDetail : null;

    if (detail?.createdAt) {
      timeline.push({
        title: 'Amendment requested',
        timestamp: detail.createdAt,
        note: `Request created for ${item.branchName}`,
        kind: 'ACTION',
      });
    }

    if (detail?.dueDate || item.dueDate) {
      const dueAt = detail?.dueDate || item.dueDate;
      timeline.push({
        title: 'Amendment due date tracked',
        timestamp: dueAt || '',
        note: `Due date: ${new Date(dueAt || '').toLocaleDateString()}`,
        kind: 'ACTION',
      });
    }

    if (detail?.filedDate) {
      timeline.push({
        title: 'Submitted by branch',
        timestamp: detail.filedDate,
        note: 'Branch submission received for CRM review',
        kind: 'ACTION',
      });
    }

    if (item.remarks || detail?.crmLastNote) {
      timeline.push({
        title: 'Latest CRM remarks',
        timestamp: detail?.crmLastNoteAt || item.lastUpdatedAt || item.dueDate,
        note: detail?.crmLastNote || item.remarks || '',
        kind: 'ACTION',
      });
    }

    if (detail?.crmLastReminderAt || item.lastReminderAt) {
      timeline.push({
        title: 'Reminder sent to branch',
        timestamp: detail?.crmLastReminderAt || item.lastReminderAt || '',
        note: 'Follow-up reminder issued for pending amendment response',
        kind: 'COMMENT',
      });
    }

    if (item.evidenceUrl) {
      timeline.push({
        title: 'Supporting evidence available',
        timestamp: item.lastUpdatedAt || item.dueDate,
        note: 'Branch supporting files uploaded',
        kind: 'ACTION',
      });
    }

    if (detail?.crmOwner || item.ownerAssigned) {
      timeline.push({
        title: 'Owner assignment updated',
        timestamp: detail?.updatedAt || item.lastUpdatedAt || new Date().toISOString(),
        note: `Current owner: ${this.authorityOwner(item)}`,
        kind: 'ACTION',
      });
    }

    timeline.push({
      title: `Current status: ${detail?.status || item.status}`,
      timestamp: detail?.updatedAt || item.lastUpdatedAt || item.dueDate || new Date().toISOString(),
      kind: 'ACTION',
    });

    const local = this.localHistory[item.id] || [];
    return [...timeline, ...local]
      .filter((ev) => !!ev.timestamp)
      .sort((a, b) => this.timeValue(b.timestamp) - this.timeValue(a.timestamp));
  }

  private daysToDue(item: DueItemRow): number | null {
    if (!item.dueDate) return null;
    const due = new Date(item.dueDate);
    if (Number.isNaN(due.getTime())) return null;
    const now = new Date();
    const diff = due.getTime() - now.getTime();
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  }

  private timeValue(input?: string): number {
    if (!input) return 0;
    const value = new Date(input).getTime();
    return Number.isNaN(value) ? 0 : value;
  }

  private rebuildBranchPendingRows(): void {
    const map = new Map<string, BranchPendingRow>();
    for (const item of this.viewItems) {
      const key = String(item.branchId || 'UNMAPPED');
      const row = map.get(key) || {
        branchId: key,
        branchName: String(item.branchName || ''),
        total: 0,
        pending: 0,
        completed: 0,
        overdue: 0,
      };
      row.total += 1;
      if (item.status === 'APPROVED') {
        row.completed += 1;
      } else {
        row.pending += 1;
      }
      const days = this.daysToDue(item);
      if (days !== null && days < 0 && item.status !== 'APPROVED') {
        row.overdue += 1;
      }
      if (!row.branchName && item.branchName) {
        row.branchName = String(item.branchName);
      }
      map.set(key, row);
    }
    this.branchPendingRows = Array.from(map.values()).sort((a, b) => {
      if (b.pending !== a.pending) return b.pending - a.pending;
      if (b.overdue !== a.overdue) return b.overdue - a.overdue;
      return a.branchId.localeCompare(b.branchId);
    });
  }
}

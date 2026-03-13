import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { CrmDueItemsService } from '../../../core/crm-due-items.service';
import { DueItemRow, DueKpis, DueTab } from '../../../shared/models/crm-due-items.model';
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
type LocalEventKind = 'OWNER' | 'REMINDER' | 'RETURN' | 'ACTION';

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

@Component({
  selector: 'app-crm-renewals',
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
  templateUrl: './crm-renewals.component.html',
  styleUrls: ['./crm-renewals.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrmRenewalsComponent implements OnInit, OnDestroy {
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
  selectedTimeline: TimelineEvent[] = [];

  localHistory: Record<string, TimelineEvent[]> = {};

  total = 0;
  page = 1;
  limit = 20;
  loading = false;
  actionBusy = false;

  readonly tabs: DueTab[] = ['OVERDUE', 'DUE_SOON', 'THIS_MONTH', 'COMPLETED'];

  constructor(
    private readonly svc: CrmDueItemsService,
    private readonly toast: ToastService,
    private readonly dialog: ConfirmDialogService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
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
      category: 'RENEWAL',
      page: this.page,
      limit: this.limit,
    };
    if (this.clientId.trim()) params['clientId'] = this.clientId.trim();
    if (this.branchId.trim()) params['branchId'] = this.branchId.trim();
    if (this.q) params['q'] = this.q;

    forkJoin([this.svc.getKpis({ month: this.month, category: 'RENEWAL', clientId: this.clientId }), this.svc.list(params)])
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
        this.toast.error('Failed to load renewals.');
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
    this.selectedItem = item;
    this.selectedTimeline = this.buildTimeline(item);
  }

  async approve(item: DueItemRow): Promise<void> {
    if (this.actionBusy) return;
    if (!(await this.dialog.confirm('Approve renewal', `Approve "${item.title}" for ${item.branchName}?`, { confirmText: 'Approve' }))) {
      return;
    }

    this.actionBusy = true;
    this.svc
      .approve(item.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addEvent(item.id, 'Renewal approved', `Approved by CRM user for ${item.branchName}`, 'ACTION');
          this.toast.success('Renewal approved.');
          this.load(this.page);
        },
        error: () => this.toast.error('Approve failed.'),
      });
  }

  async reject(item: DueItemRow): Promise<void> {
    if (this.actionBusy) return;
    const result = await this.dialog.prompt('Reject renewal', 'Provide rejection remarks for audit trail.', {
      placeholder: 'Reason for rejection',
      confirmText: 'Reject',
    });
    const remarks = (result.value || '').trim();
    if (!result.confirmed) return;
    if (!remarks) {
      this.toast.error('Remarks are required for rejection.');
      return;
    }

    this.actionBusy = true;
    this.svc
      .reject(item.id, remarks)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addEvent(item.id, 'Renewal rejected', remarks, 'ACTION');
          this.toast.success('Renewal rejected.');
          this.load(this.page);
        },
        error: () => this.toast.error('Reject failed.'),
      });
  }

  async returnForUpdate(item: DueItemRow): Promise<void> {
    if (this.actionBusy) return;
    const result = await this.dialog.prompt('Return to branch', 'Ask branch to update renewal documents/details.', {
      placeholder: 'Message to branch',
      defaultValue: 'Please recheck documents and resubmit with corrections.',
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
      .requestFromBranch(item.id, `Renewal returned: ${message}`, 'RETURN')
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

  async assignOwner(item: DueItemRow): Promise<void> {
    if (this.actionBusy) return;
    const result = await this.dialog.prompt('Assign owner', 'Assign CRM owner for this renewal follow-up.', {
      placeholder: 'Owner name or user ID',
      defaultValue: item.ownerAssigned || '',
      confirmText: 'Assign',
    });
    const owner = (result.value || '').trim();
    if (!result.confirmed) return;
    if (!owner) {
      this.toast.error('Owner is required.');
      return;
    }

    this.actionBusy = true;
    this.svc
      .requestFromBranch(item.id, `Owner assigned: ${owner}`, 'OWNER', { owner })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.addEvent(item.id, 'Owner assigned', owner, 'OWNER');
          this.toast.success('Owner assigned.');
          this.load(this.page);
        },
        error: () => this.toast.error('Owner assignment failed.'),
      });
  }

  async sendReminder(item: DueItemRow): Promise<void> {
    if (this.actionBusy) return;
    const result = await this.dialog.prompt('Send follow-up reminder', 'Send reminder to branch for pending renewal.', {
      placeholder: 'Reminder message',
      defaultValue: 'Follow-up reminder: Please submit pending renewal updates today.',
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
          this.addEvent(item.id, 'Follow-up reminder sent', message, 'REMINDER');
          this.toast.success('Reminder sent.');
          this.load(this.page);
        },
        error: () => this.toast.error('Reminder failed.'),
      });
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

  ownerFor(item: DueItemRow): string {
    return item.ownerAssigned || '-';
  }

  lastReminderFor(item: DueItemRow): string {
    return item.lastReminderAt || '';
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

  get ownerAssignedCount(): number {
    return this.viewItems.filter((x) => !!x.ownerAssigned).length;
  }

  get reminderSentCount(): number {
    return this.viewItems.filter((x) => !!x.lastReminderAt).length;
  }

  referenceFor(item: DueItemRow): string {
    return `REN-${String(item.id || '').slice(0, 8).toUpperCase()}`;
  }

  workflowSteps(item: DueItemRow): Array<{ label: string; state: 'done' | 'active' | 'bad' | 'todo' }> {
    const status = item.status;
    const steps = [
      { label: 'Queued', state: 'todo' as const },
      { label: 'In Review', state: 'todo' as const },
      { label: 'Filed', state: 'todo' as const },
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
    if (state === 'done') return 'flow-step flow-step--done';
    if (state === 'active') return 'flow-step flow-step--active';
    if (state === 'bad') return 'flow-step flow-step--bad';
    return 'flow-step';
  }

  detailChecklist(item: DueItemRow): DetailChecklistItem[] {
    return [
      {
        label: 'Evidence uploaded',
        done: !!item.evidenceUrl,
        note: item.evidenceUrl ? 'Document available' : 'Pending branch upload',
      },
      {
        label: 'Remarks captured',
        done: !!item.remarks,
        note: item.remarks ? 'Reviewer context added' : 'No remarks yet',
      },
      {
        label: 'Owner assigned',
        done: !!item.ownerAssigned,
        note: item.ownerAssigned || 'Assign CRM owner',
      },
      {
        label: 'Follow-up sent',
        done: !!item.lastReminderAt,
        note: item.lastReminderAt
          ? `Last: ${new Date(item.lastReminderAt).toLocaleString('en-IN')}`
          : 'No reminder sent',
      },
      {
        label: 'Due date configured',
        done: !!item.dueDate,
        note: item.dueDate ? this.dueText(item) : 'Due date missing',
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
    return row.branchName || row.branchId || 'Unmapped';
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

    if (item.dueDate) {
      timeline.push({
        title: 'Renewal due date tracked',
        timestamp: item.dueDate,
        note: `Due date: ${new Date(item.dueDate).toLocaleDateString()}`,
        kind: 'ACTION',
      });
    }
    if (item.remarks) {
      timeline.push({
        title: 'Latest remarks',
        timestamp: item.lastUpdatedAt || item.dueDate,
        note: item.remarks,
        kind: 'ACTION',
      });
    }
    if (item.evidenceUrl) {
      timeline.push({
        title: 'Evidence available',
        timestamp: item.lastUpdatedAt || item.dueDate,
        note: 'Branch evidence uploaded for review',
        kind: 'ACTION',
      });
    }
    timeline.push({
      title: `Current status: ${item.status}`,
      timestamp: item.lastUpdatedAt || item.dueDate || new Date().toISOString(),
      kind: 'ACTION',
    });
    if (item.ownerAssigned) {
      timeline.push({
        title: 'Owner assigned',
        timestamp: item.lastUpdatedAt || new Date().toISOString(),
        note: item.ownerAssigned,
        kind: 'OWNER',
      });
    }
    if (item.lastReminderAt) {
      timeline.push({
        title: 'Follow-up reminder sent',
        timestamp: item.lastReminderAt,
        kind: 'REMINDER',
      });
    }

    const local = this.localHistory[item.id] || [];
    return [...timeline, ...local].sort((a, b) => this.timeValue(b.timestamp) - this.timeValue(a.timestamp));
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

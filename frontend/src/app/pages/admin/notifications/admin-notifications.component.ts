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

import { AdminThreadApiService } from '../../../core/admin-thread-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  ThreadDetail,
  ThreadListItem,
  ThreadRole,
  ThreadStatus,
} from '../../../shared/thread/models/thread.model';
import { ThreadInboxItem, ThreadMessage as SharedThreadMessage } from '../../../shared/components/thread/thread.model';
import { ThreadInboxListComponent } from '../../../shared/components/thread/thread-inbox-list.component';
import { ThreadMessagePanelComponent } from '../../../shared/components/thread/thread-message-panel.component';
import { ReplyComposerComponent } from '../../../shared/components/thread/reply-composer.component';
import { SlaPriorityStripComponent } from '../../../shared/components/thread/sla-priority-strip.component';
import { SharedTimelineComponent } from '../../../shared/components/timeline/shared-timeline.component';
import { TimelineEvent } from '../../../shared/components/timeline/timeline.model';
import { EntityHeaderStripComponent } from '../../../shared/components/workspace/entity-header-strip.component';
import { StatusChipComponent } from '../../../shared/components/status/status-chip.component';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';

type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type MutableStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

interface StatusActionOption {
  target: MutableStatus;
  label: string;
  variant: 'primary' | 'secondary' | 'danger';
}

interface StatusActionView extends StatusActionOption {
  blockedReason: string | null;
}

interface AdminTicketItem extends ThreadListItem {
  createdAt?: string;
  updatedAt?: string;
  assignedToName?: string;
  assignedToRole?: ThreadRole;
  slaAgeHours?: number;
}

@Component({
  selector: 'app-admin-notifications',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ActionButtonComponent,
    ThreadInboxListComponent,
    ThreadMessagePanelComponent,
    ReplyComposerComponent,
    SlaPriorityStripComponent,
    SharedTimelineComponent,
    EntityHeaderStripComponent,
    StatusChipComponent,
  ],
  templateUrl: './admin-notifications.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNotificationsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly slaBreachHours = 24;

  loading = true;
  loadingDetail = false;
  sending = false;
  updatingStatus = false;
  error: string | null = null;

  page = 1;
  limit = 20;
  total = 0;

  tickets: AdminTicketItem[] = [];
  filteredTickets: AdminTicketItem[] = [];
  selectedId = '';
  selectedThread: ThreadDetail | null = null;

  readonly statuses: Array<{ value: '' | ThreadStatus; label: string }> = [
    { value: '', label: 'All' },
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'RESPONDED', label: 'Responded' },
    { value: 'RESOLVED', label: 'Resolved' },
    { value: 'CLOSED', label: 'Closed' },
  ];

  readonly queryTypes: Array<{ value: '' | 'TECHNICAL' | 'COMPLIANCE' | 'AUDIT' | 'GENERAL'; label: string }> = [
    { value: '', label: 'All' },
    { value: 'TECHNICAL', label: 'Technical' },
    { value: 'COMPLIANCE', label: 'Compliance' },
    { value: 'AUDIT', label: 'Audit' },
    { value: 'GENERAL', label: 'General' },
  ];

  readonly roles: Array<{ value: 'ALL' | ThreadRole; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'CRM', label: 'CRM' },
    { value: 'CLIENT', label: 'Client' },
    { value: 'BRANCH', label: 'Branch' },
    { value: 'CONTRACTOR', label: 'Contractor' },
    { value: 'AUDITOR', label: 'Auditor' },
    { value: 'PAYDEK', label: 'Payroll' },
    { value: 'CCO', label: 'CCO' },
    { value: 'CEO', label: 'CEO' },
  ];

  readonly priorities: Array<{ value: 'ALL' | PriorityLevel; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
    { value: 'CRITICAL', label: 'Critical' },
  ];

  filters: {
    status: '' | ThreadStatus;
    queryType: '' | 'TECHNICAL' | 'COMPLIANCE' | 'AUDIT' | 'GENERAL';
    fromRole: 'ALL' | ThreadRole;
    priority: 'ALL' | PriorityLevel;
    unreadOnly: boolean;
    q: string;
  } = {
    status: '',
    queryType: '',
    fromRole: 'ALL',
    priority: 'ALL',
    unreadOnly: false,
    q: '',
  };

  constructor(
    private readonly api: AdminThreadApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadTickets();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get kpiTotal(): number {
    return this.total || this.tickets.length;
  }

  get kpiOpen(): number {
    return this.countByStatuses(['OPEN', 'RESPONDED']);
  }

  get kpiInProgress(): number {
    return this.countByStatuses(['IN_PROGRESS']);
  }

  get kpiResolved(): number {
    return this.countByStatuses(['RESOLVED', 'CLOSED']);
  }

  get kpiSlaBreached(): number {
    return this.tickets.filter((ticket) => {
      const status = String(ticket.status || '').toUpperCase() as ThreadStatus;
      if (status === 'RESOLVED' || status === 'CLOSED') return false;
      return (ticket.slaAgeHours || 0) >= this.slaBreachHours;
    }).length;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil((this.total || 0) / this.limit));
  }

  get canSendReply(): boolean {
    return !!this.selectedId && !this.sending && !this.isClosedState();
  }

  get selectedTicket(): AdminTicketItem | null {
    return this.tickets.find((ticket) => ticket.id === this.selectedId) || null;
  }

  get inboxItems(): ThreadInboxItem[] {
    return this.filteredTickets.map((ticket) => ({
      id: ticket.id,
      title: ticket.subject || '(No subject)',
      subtitle: `${this.roleLabel(ticket.fromRole)} | ${ticket.fromName || 'Unknown'}${ticket.clientName ? ` | ${ticket.clientName}` : ''}`,
      unreadCount: ticket.unread ? 1 : 0,
      priority: this.normalizePriority(ticket.priority),
      status: ticket.status,
      updatedAt: ticket.lastMessageAt || ticket.updatedAt || ticket.createdAt || null,
    }));
  }

  get statusActions(): StatusActionView[] {
    const currentStatus = this.selectedThread?.status as ThreadStatus | undefined;
    if (!currentStatus) return [];

    return this.getNextStatusActions(currentStatus).map((action) => ({
      ...action,
      blockedReason: this.getStatusTransitionBlocker(action.target),
    }));
  }

  get threadMessages(): SharedThreadMessage[] {
    const messages = this.selectedThread?.messages || [];
    return messages.map((message) => ({
      id: message.id,
      senderName: message.senderName || 'Unknown',
      senderRole: this.roleLabel(message.senderRole),
      body: message.message,
      createdAt: message.createdAt,
      isInternal: message.senderRole === 'ADMIN',
      attachments: (message.attachments || []).map((attachment) => ({
        name: attachment.name || null,
        url: attachment.url || null,
      })),
    }));
  }

  get threadTimelineEvents(): TimelineEvent[] {
    const messages = this.selectedThread?.messages || [];
    return messages.map((message) => ({
      id: message.id,
      title: 'Message posted',
      createdAt: message.createdAt,
      actorName: message.senderName || 'Unknown',
      actorRole: this.roleLabel(message.senderRole),
      comment: message.message,
      attachmentsCount: message.attachments?.length || 0,
    }));
  }

  loadTickets(): void {
    this.loading = true;
    this.error = null;

    this.api
      .list({
        page: this.page,
        limit: this.limit,
        status: this.filters.status || undefined,
        type: this.filters.queryType || undefined,
        q: this.filters.q?.trim() || undefined,
        unread: this.filters.unreadOnly || undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          const rows = (res?.items || []) as AdminTicketItem[];
          this.total = Number(res?.total || 0);
          this.tickets = rows.map((row) => ({
            ...row,
            slaAgeHours: this.computeSlaAgeHours(row),
          }));
          this.applyLocalFilters();

          if (this.selectedId) {
            const stillPresent = this.filteredTickets.some((ticket) => ticket.id === this.selectedId);
            if (!stillPresent) {
              this.selectedId = '';
              this.selectedThread = null;
            }
          }
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to load admin notification threads.';
          this.tickets = [];
          this.filteredTickets = [];
          this.total = 0;
        },
      });
  }

  applyLocalFilters(): void {
    const roleFilter = this.filters.fromRole;
    const priorityFilter = this.filters.priority;

    this.filteredTickets = this.tickets.filter((ticket) => {
      if (roleFilter !== 'ALL' && ticket.fromRole !== roleFilter) return false;
      const priority = this.normalizePriority(ticket.priority);
      if (priorityFilter !== 'ALL' && priority !== priorityFilter) return false;
      return true;
    });
    this.cdr.markForCheck();
  }

  clearFilters(): void {
    this.filters = {
      status: '',
      queryType: '',
      fromRole: 'ALL',
      priority: 'ALL',
      unreadOnly: false,
      q: '',
    };
    this.page = 1;
    this.loadTickets();
  }

  onServerFilterChanged(): void {
    this.page = 1;
    this.loadTickets();
  }

  onLocalFilterChanged(): void {
    this.applyLocalFilters();
  }

  openTicket(id: string): void {
    if (!id) return;
    this.selectedId = id;
    this.loadingDetail = true;
    this.selectedThread = null;

    this.api
      .read(id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingDetail = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (detail) => {
          this.selectedThread = detail;
          const row = this.tickets.find((ticket) => ticket.id === id);
          if (row) row.unread = false;
          this.applyLocalFilters();
        },
        error: () => {
          this.toast.error('Could not open thread detail.');
        },
      });
  }

  onInboxSelected(item: ThreadInboxItem): void {
    this.openTicket(item.id);
  }

  sendReply(messageText: string): void {
    const message = messageText.trim();
    if (!this.selectedId || !message || this.sending || this.isClosedState()) return;

    this.sending = true;
    this.api
      .reply(this.selectedId, message)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.sending = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Message added to thread.');
          this.openTicket(this.selectedId);
          this.loadTickets();
        },
        error: (err: any) => {
          this.toast.error(err?.error?.message || 'Could not send reply.');
        },
      });
  }

  setStatus(status: MutableStatus): void {
    if (!this.selectedId || this.updatingStatus) return;
    const blockedReason = this.getStatusTransitionBlocker(status);
    if (blockedReason) {
      this.toast.warning(blockedReason);
      return;
    }

    this.updatingStatus = true;
    this.api
      .setStatus(this.selectedId, status)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.updatingStatus = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(`Thread marked ${status.replace('_', ' ').toLowerCase()}.`);
          this.openTicket(this.selectedId);
          this.loadTickets();
        },
        error: (err: any) => {
          this.toast.error(err?.error?.message || 'Could not update thread status.');
        },
      });
  }

  prevPage(): void {
    if (this.page <= 1) return;
    this.page -= 1;
    this.loadTickets();
  }

  nextPage(): void {
    if (this.page >= this.totalPages) return;
    this.page += 1;
    this.loadTickets();
  }

  roleLabel(role: ThreadRole | undefined): string {
    if (!role) return '-';
    if (role === 'PAYDEK') return 'PAYROLL';
    return role;
  }

  trackByTicketId(_: number, row: AdminTicketItem): string {
    return row.id;
  }

  private countByStatuses(statuses: ThreadStatus[]): number {
    const set = new Set(statuses);
    return this.tickets.filter((ticket) => set.has(ticket.status as ThreadStatus)).length;
  }

  private computeSlaAgeHours(ticket: AdminTicketItem): number {
    const ref = ticket.lastMessageAt || ticket.updatedAt || ticket.createdAt;
    if (!ref) return 0;
    const ts = new Date(ref).getTime();
    if (Number.isNaN(ts)) return 0;
    const diffMs = Date.now() - ts;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  }

  private normalizePriority(priority: unknown): PriorityLevel {
    const p = String(priority || '')
      .toUpperCase()
      .trim();
    if (p === 'CRITICAL' || p === 'HIGH' || p === 'MEDIUM' || p === 'LOW') {
      return p;
    }
    return 'LOW';
  }

  private getNextStatusActions(status: ThreadStatus): StatusActionOption[] {
    const transitions: Record<ThreadStatus, StatusActionOption[]> = {
      OPEN: [
        { target: 'IN_PROGRESS', label: 'Mark In Progress', variant: 'secondary' },
      ],
      IN_PROGRESS: [
        { target: 'RESOLVED', label: 'Mark Resolved', variant: 'primary' },
      ],
      RESPONDED: [
        { target: 'IN_PROGRESS', label: 'Reopen Work', variant: 'secondary' },
        { target: 'RESOLVED', label: 'Mark Resolved', variant: 'primary' },
      ],
      RESOLVED: [
        { target: 'IN_PROGRESS', label: 'Reopen Work', variant: 'secondary' },
        { target: 'CLOSED', label: 'Close Thread', variant: 'danger' },
      ],
      CLOSED: [{ target: 'OPEN', label: 'Reopen Thread', variant: 'secondary' }],
    };
    return transitions[status] || [];
  }

  private getStatusTransitionBlocker(targetStatus: MutableStatus): string | null {
    const currentStatus = this.selectedThread?.status as ThreadStatus | undefined;
    if (!currentStatus) return 'Thread detail is not loaded.';
    if (currentStatus === targetStatus) {
      return `Thread is already ${this.formatStatusLabel(targetStatus)}.`;
    }

    const allowedTargets = new Set(
      this.getNextStatusActions(currentStatus).map((action) => action.target),
    );
    if (!allowedTargets.has(targetStatus)) {
      return `Invalid transition from ${this.formatStatusLabel(currentStatus)} to ${this.formatStatusLabel(targetStatus)}.`;
    }

    const hasAdminReply = (this.selectedThread?.messages || []).some(
      (message) =>
        message.senderRole === 'ADMIN' &&
        String(message.message || '').trim().length > 0,
    );

    if ((targetStatus === 'RESOLVED' || targetStatus === 'CLOSED') && !hasAdminReply) {
      return 'Add at least one admin reply before resolving or closing the thread.';
    }

    return null;
  }

  private formatStatusLabel(status: ThreadStatus): string {
    return status.replace('_', ' ').toLowerCase();
  }

  private isClosedStatus(status: string): boolean {
    const value = String(status || '').toUpperCase();
    return value === 'RESOLVED' || value === 'CLOSED';
  }

  isClosedState(): boolean {
    return this.isClosedStatus(this.selectedThread?.status || '');
  }
}


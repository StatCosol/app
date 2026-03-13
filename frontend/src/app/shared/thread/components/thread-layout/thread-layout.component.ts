import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadApi } from '../../services/thread-api.interface';
import { ThreadFilters, ThreadListItem, ThreadDetail } from '../../models/thread.model';
import { PageRes } from '../../../models/paging.model';
import { ThreadFiltersComponent } from '../thread-filters/thread-filters.component';
import { ComposerComponent } from '../composer/composer.component';
import { ThreadInboxListComponent } from '../../../components/thread/thread-inbox-list.component';
import { ThreadInboxItem, ThreadMessage as SharedThreadMessage } from '../../../components/thread/thread.model';
import { ThreadMessagePanelComponent } from '../../../components/thread/thread-message-panel.component';
import { SharedTimelineComponent } from '../../../components/timeline/shared-timeline.component';
import { TimelineEvent } from '../../../components/timeline/timeline.model';
import { StatusChipComponent } from '../../../components/status/status-chip.component';
import { PriorityChipComponent } from '../../../components/status/priority-chip.component';

@Component({
  selector: 'app-thread-layout',
  standalone: true,
  imports: [
    CommonModule,
    ThreadFiltersComponent,
    ThreadInboxListComponent,
    ThreadMessagePanelComponent,
    SharedTimelineComponent,
    StatusChipComponent,
    PriorityChipComponent,
    ComposerComponent,
  ],
  templateUrl: './thread-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThreadLayoutComponent {
  @Input() api!: ThreadApi;
  @Input() title = 'Inbox';
  @Input() canClose = true;
  @Input() canResolve = false;
  @Input() canReopen = true;

  /** Emitted when a compose action is sent and completed */
  @Output() replySent = new EventEmitter<void>();

  filters: ThreadFilters = { page: 1, limit: 20 };
  page?: PageRes<ThreadListItem>;
  selected?: ThreadDetail;
  selectedId?: string;

  loadingList = false;
  loadingThread = false;
  sending = false;

  // Mobile: show detail pane
  showDetail = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadList();
  }

  get inboxItems(): ThreadInboxItem[] {
    return (this.page?.items || []).map((item) => ({
      id: item.id,
      title: item.subject || '(No subject)',
      subtitle: `${item.fromRole}${item.fromName ? ` - ${item.fromName}` : ''}${item.clientName ? ` - ${item.clientName}` : ''}`,
      unreadCount: item.unread ? 1 : 0,
      priority: item.priority || 'LOW',
      status: item.status,
      updatedAt: item.lastMessageAt,
    }));
  }

  get selectedListItem(): ThreadListItem | null {
    return (this.page?.items || []).find((item) => item.id === this.selectedId) || null;
  }

  get selectedMessages(): SharedThreadMessage[] {
    const messages = this.selected?.messages || [];
    return messages.map((message) => ({
      id: message.id,
      senderName: message.senderName || message.senderRole,
      senderRole: message.senderRole,
      body: message.message,
      createdAt: message.createdAt,
      isInternal: message.senderRole === 'ADMIN',
      attachments: (message.attachments || []).map((attachment) => ({
        name: attachment.name || null,
        url: attachment.url || null,
      })),
    }));
  }

  get selectedTimeline(): TimelineEvent[] {
    const messages = this.selected?.messages || [];
    return messages.map((message) => ({
      id: message.id,
      title: 'Message posted',
      createdAt: message.createdAt,
      actorName: message.senderName || message.senderRole,
      actorRole: message.senderRole,
      comment: message.message,
      attachmentsCount: message.attachments?.length || 0,
    }));
  }

  get isOpen(): boolean {
    return !!this.selected && this.selected.status !== 'CLOSED' && this.selected.status !== 'RESOLVED';
  }

  get isClosed(): boolean {
    return this.selected?.status === 'CLOSED' || this.selected?.status === 'RESOLVED';
  }

  onFiltersChange(f: Partial<ThreadFilters>): void {
    this.filters = { ...this.filters, ...f, page: 1 };
    this.loadList();
  }

  loadList(): void {
    if (!this.api) return;
    this.loadingList = true;
    this.cdr.markForCheck();

    this.api.list(this.filters).subscribe({
      next: (res) => {
        this.page = res;
        this.loadingList = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.page = { items: [], total: 0, page: 1, limit: 20 };
        this.loadingList = false;
        this.cdr.markForCheck();
      },
    });
  }

  selectThread(item: ThreadListItem): void {
    this.selectedId = item.id;
    this.loadingThread = true;
    this.showDetail = true;
    this.cdr.markForCheck();

    this.api.read(item.id).subscribe({
      next: (t) => {
        this.selected = t;
        this.loadingThread = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.selected = undefined;
        this.loadingThread = false;
        this.cdr.markForCheck();
      },
    });
  }

  selectInboxItem(item: ThreadInboxItem): void {
    this.selectThread({ id: item.id } as ThreadListItem);
  }

  sendReply(payload: { message: string; files: File[] }): void {
    if (!this.selected || this.sending) return;
    this.sending = true;
    this.cdr.markForCheck();

    this.api.reply(this.selected.id, payload.message, payload.files).subscribe({
      next: () => {
        this.sending = false;
        this.selectThread({ id: this.selected!.id } as ThreadListItem);
        this.loadList();
        this.replySent.emit();
      },
      error: () => {
        this.sending = false;
        this.cdr.markForCheck();
      },
    });
  }

  closeThread(): void {
    if (!this.api.close || !this.selected) return;
    this.api.close(this.selected.id).subscribe({
      next: () => {
        this.selectThread({ id: this.selected!.id } as ThreadListItem);
        this.loadList();
      },
    });
  }

  resolveThread(): void {
    if (!this.api.resolve || !this.selected) return;
    this.api.resolve(this.selected.id).subscribe({
      next: () => {
        this.selectThread({ id: this.selected!.id } as ThreadListItem);
        this.loadList();
      },
    });
  }

  reopenThread(): void {
    if (!this.api.reopen || !this.selected) return;
    this.api.reopen(this.selected.id).subscribe({
      next: () => {
        this.selectThread({ id: this.selected!.id } as ThreadListItem);
        this.loadList();
      },
    });
  }

  goToPage(p: number): void {
    if (p < 1) return;
    this.filters = { ...this.filters, page: p };
    this.loadList();
  }

  backToList(): void {
    this.showDetail = false;
    this.cdr.markForCheck();
  }
}

import { finalize, Subscription, take } from 'rxjs';
import { IconComponent } from '../../../ui/icon/icon.component';
import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild } from '@angular/core';

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
  imports: [IconComponent,
    ThreadFiltersComponent,
    ThreadInboxListComponent,
    ThreadMessagePanelComponent,
    SharedTimelineComponent,
    StatusChipComponent,
    PriorityChipComponent,
    ComposerComponent
],
  templateUrl: './thread-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThreadLayoutComponent {
  @Input() api!: ThreadApi;
  @ViewChild(ComposerComponent) composer?: ComposerComponent;
  private drafts = new Map<string, { message: string; files: File[] }>();
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

  listError = '';
  threadError = '';
  replyError = '';
  statusError = '';
  statusUpdating = false;
  private listRequest?: Subscription;
  private threadRequest?: Subscription;
  private replyRequest?: Subscription;
  private statusRequest?: Subscription;

  loadingList = false;
  loadingThread = false;
  sending = false;

  // Mobile: show detail pane
  showDetail = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadList();
  }

  ngOnDestroy(): void { this.listRequest?.unsubscribe(); this.threadRequest?.unsubscribe(); this.replyRequest?.unsubscribe(); this.statusRequest?.unsubscribe(); }

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
    this.listRequest?.unsubscribe();
    this.listError = '';
    this.loadingList = true;
    this.cdr.markForCheck();

    this.listRequest = this.api.list(this.filters).subscribe({
      next: (res) => {
        this.page = res;
        this.loadingList = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.page = undefined;
        this.listError = 'Could not load notifications. Retry to continue.';
        this.loadingList = false;
        this.cdr.markForCheck();
      },
    });
  }

  selectThread(item: ThreadListItem): void {
    if (this.selectedId && this.composer) this.drafts.set(this.selectedId, { message: this.composer.message, files: [...this.composer.files] });
    if (this.composer) { const draft=this.drafts.get(item.id); this.composer.message=draft?.message || ''; this.composer.files=draft?.files || []; }
    this.threadRequest?.unsubscribe();
    this.selected = undefined;
    this.threadError = '';
    this.replyError = '';
    this.selectedId = item.id;
    this.loadingThread = true;
    this.showDetail = true;
    this.cdr.markForCheck();

    this.threadRequest = this.api.read(item.id).subscribe({
      next: (t) => {
        this.selected = t;
        this.loadingThread = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.selected = undefined;
        this.threadError = 'Could not open this notification. Select it again to retry.';
        this.loadingThread = false;
        this.cdr.markForCheck();
      },
    });
  }

  selectInboxItem(item: ThreadInboxItem): void {
    this.selectThread({ id: item.id } as ThreadListItem);
  }

  sendReply(payload: { message: string; files: File[] }): void {
    if (!this.selected || !this.isOpen || this.loadingThread || this.sending || this.statusUpdating) return;
    const threadId = this.selected.id;
    this.replyError = '';
    this.sending = true;
    this.cdr.markForCheck();

    this.replyRequest = this.api.reply(threadId, payload.message, payload.files).subscribe({
      next: () => {
        this.sending = false;
        this.drafts.delete(threadId);
        if (this.selectedId === threadId && this.composer) { this.composer.message=''; this.composer.files=[]; }
        if (this.selectedId === threadId) this.selectThread({ id: threadId } as ThreadListItem);
        this.loadList();
        this.replySent.emit();
      },
      error: () => {
        this.sending = false;
        this.replyError = 'Reply was not sent. Your draft is retained; try again.';
        this.cdr.markForCheck();
      },
    });
  }

  closeThread(): void {
    if (this.canClose && this.isOpen) this.changeStatus('close');
  }

  resolveThread(): void {
    if (this.canResolve && this.isOpen) this.changeStatus('resolve');
  }

  reopenThread(): void {
    if (this.canReopen && this.isClosed) this.changeStatus('reopen');
  }

  private changeStatus(action: 'close' | 'resolve' | 'reopen'): void {
    const operation = this.api[action];
    if (!operation || !this.selected || this.loadingThread || this.sending || this.statusUpdating) return;
    const { id, subject } = this.selected;
    this.statusError = '';
    this.statusUpdating = true;
    this.cdr.markForCheck();
    this.statusRequest = operation.call(this.api, id).pipe(
      take(1),
      finalize(() => {
        this.statusUpdating = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: () => {
        // A delayed response belongs to its original thread, even after navigation.
        if (this.selectedId === id) this.selectThread({ id } as ThreadListItem);
        this.loadList();
      },
      error: () => {
        this.statusError = `Could not confirm ${action} for “${subject || 'Untitled thread'}”. Your draft is retained. Check the thread and try again.`;
        this.cdr.markForCheck();
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

import { ChangeDetectorRef, Component, Input, OnInit } from '@angular/core';
import { catchError, finalize, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationsService } from '../../../core/notifications.service';

@Component({
  selector: 'app-notification-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inbox.component.html',
  styleUrls: ['./inbox.component.scss'],
})
export class InboxComponent implements OnInit {
  // When true, uses ADMIN all-threads endpoint instead of per-user inbox
  @Input() adminAll = false;
  // When true, shows threads created by the current user
  @Input() creatorView = false;
  threads: any[] = [];
  total = 0;

  status: 'all' | 'OPEN' | 'IN_PROGRESS' | 'RESPONDED' | 'RESOLVED' | 'CLOSED' = 'OPEN';
  page = 1;
  limit = 20;

  selectedThreadId?: string;
  thread: any = null;
  messages: any[] = [];
  replyText = '';

  loadingList = false;
  loadingThread = false;
  sending = false;
  closing = false;
  reopening = false;
  unreadOnly = false;
  errorMsg: string | null = null;

  constructor(private notifications: NotificationsService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadInbox();
  }

  loadInbox(): void {
    this.loadingList = true;
    this.errorMsg = null;
    const status = this.status === 'all' ? undefined : (this.status as any);

    const src$ = this.creatorView
      ? this.notifications.my({
          page: this.page,
          limit: this.limit,
          status,
          unreadOnly: this.unreadOnly ? 1 : 0,
        })
      : this.adminAll
      ? this.notifications.inboxAdminAll({
          page: this.page,
          limit: this.limit,
          status,
        })
      : this.notifications.inbox({
          page: this.page,
          limit: this.limit,
          status,
          unreadOnly: this.unreadOnly ? 1 : 0,
        });

    src$
      .pipe(
        catchError((err) => {
          console.error(err);
          this.errorMsg = err?.error?.message || 'Failed to load notifications';
          return of({ data: [], total: 0 });
        }),
        finalize(() => {
          this.loadingList = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe((res: any) => {
        this.threads = (res?.data || []).map((t: any) => ({
          ...t,
          id: t?.id?.toString?.() ?? t.id,
        }));
        this.total = res?.total || 0;
      });
  }

  openThread(threadId: string): void {
    this.selectedThreadId = threadId;
    this.loadingThread = true;
    this.notifications.getThread(threadId).subscribe({
      next: (res) => {
        this.thread = res?.thread;
        this.messages = res?.messages || [];
        this.loadingThread = false;

        this.cdr.detectChanges();
      },
      error: () => {
        this.thread = null;
        this.messages = [];
        this.loadingThread = false;

        this.cdr.detectChanges();
      },
    });
  }

  sendReply(): void {
    if (!this.selectedThreadId) return;
    if (!this.replyText.trim()) return;

    this.sending = true;
    const msg = this.replyText.trim();

    this.notifications.reply(this.selectedThreadId, msg).subscribe({
      next: () => {
        this.replyText = '';
        this.openThread(this.selectedThreadId!);
        this.sending = false;
      },
      error: () => {
        this.sending = false;
      },
    });
  }

  closeThread(): void {
    if (this.closing) return;
    if (!this.selectedThreadId) return;
    this.closing = true;

    this.notifications.close(this.selectedThreadId).subscribe({
      next: () => {
        this.closing = false;
        if (this.thread) {
          this.thread.status = 'CLOSED';
        }
        this.loadInbox();
        this.cdr.detectChanges();
      },
      error: () => this.closing = false,
    });
  }

  reopenThread(): void {
    if (this.reopening) return;
    if (!this.selectedThreadId) return;
    this.reopening = true;
    this.notifications.reopen(this.selectedThreadId).subscribe({
      next: () => {
        this.reopening = false;
        this.openThread(this.selectedThreadId!);
        this.loadInbox();
      },
      error: () => this.reopening = false,
    });
  }
}

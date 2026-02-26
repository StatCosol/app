import {
  Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationsService } from '../../../core/notifications.service';
import { AuthService } from '../../../core/auth.service';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
  read: boolean;
}

@Component({
  selector: 'app-branch-notifications',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Notifications</h1>
          <p class="page-subtitle">System alerts, compliance reminders, and updates</p>
        </div>
        <div class="flex items-center gap-3">
          <button (click)="markAllRead()" class="btn-secondary" [disabled]="unreadCount === 0">
            Mark all as read
          </button>
        </div>
      </div>

      <!-- Unread count -->
      <div *ngIf="unreadCount > 0" class="unread-banner">
        <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
        <span>You have <strong>{{ unreadCount }}</strong> unread notification{{ unreadCount > 1 ? 's' : '' }}</span>
      </div>

      <!-- Notification list -->
      <div class="notification-list">
        <div *ngFor="let n of notifications; trackBy: trackById"
             class="notification-item"
             [class.unread]="!n.read"
             (click)="markRead(n)">
          <div class="notif-dot" [ngClass]="{
            'bg-blue-500': n.type === 'info',
            'bg-amber-500': n.type === 'warning',
            'bg-red-500': n.type === 'error',
            'bg-emerald-500': n.type === 'success'
          }"></div>
          <div class="flex-1 min-w-0">
            <p class="notif-title">{{ n.title }}</p>
            <p class="notif-message">{{ n.message }}</p>
          </div>
          <span class="notif-time">{{ n.timestamp }}</span>
        </div>

        <div *ngIf="notifications.length === 0" class="empty-state">
          <svg class="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
          </svg>
          <p>No notifications</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container { max-width: 880px; margin: 0 auto; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
    .page-title { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
    .page-subtitle { font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
    .btn-secondary {
      padding: 0.5rem 1rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.8125rem;
      font-weight: 500; color: #334155; background: white; cursor: pointer; transition: all 0.15s;
      &:hover:not(:disabled) { border-color: #3b82f6; color: #3b82f6; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .unread-banner {
      display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem;
      background: #eff6ff; border: 1px solid #dbeafe; border-radius: 0.75rem;
      font-size: 0.8125rem; color: #1e40af; margin-bottom: 1rem;
    }
    .notification-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .notification-item {
      display: flex; align-items: flex-start; gap: 0.75rem; padding: 1rem 1.25rem;
      background: white; border-radius: 0.75rem; border: 1px solid #f1f5f9;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04); cursor: pointer; transition: all 0.15s;
      &:hover { border-color: #e2e8f0; }
    }
    .notification-item.unread { border-left: 3px solid #3b82f6; background: #fafbff; }
    .notif-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
    .notif-title { font-size: 0.875rem; font-weight: 600; color: #1e293b; }
    .notif-message { font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
    .notif-time { font-size: 0.6875rem; color: #94a3b8; white-space: nowrap; flex-shrink: 0; margin-top: 2px; }
    .empty-state { text-align: center; padding: 3rem 0; color: #94a3b8; font-size: 0.875rem; }
  `]
})
export class BranchNotificationsComponent implements OnInit {
  notifications: Notification[] = [];
  unreadCount = 0;
  loading = true;

  constructor(
    private cdr: ChangeDetectorRef,
    private notifSvc: NotificationsService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    const branchIds = this.auth.getBranchIds();
    const branchId = branchIds.length ? branchIds[0] : undefined;

    this.notifSvc.listInbox({ branchId, box: 'INBOX', limit: 50 }).subscribe({
      next: (rows) => {
        this.notifications = (rows || []).map((r: any): Notification => {
          const status = (r.status || '').toUpperCase();
          const queryType = (r.query_type || r.queryType || '').toUpperCase();
          let type: 'info' | 'warning' | 'error' | 'success' = 'info';
          if (queryType === 'COMPLIANCE') type = 'warning';
          else if (queryType === 'AUDIT') type = 'error';
          else if (status === 'CLOSED' || status === 'RESOLVED') type = 'success';

          const ts = r.created_at || r.createdAt;
          const timestamp = ts ? this.timeAgo(new Date(ts)) : '';

          return {
            id: r.id,
            title: r.subject || r.title || 'Notification',
            message: r.message || r.description || '',
            type,
            timestamp,
            read: !!r.read_at || status === 'READ' || status === 'CLOSED',
          };
        });
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  private timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }

  markRead(n: Notification): void {
    if (!n.read) {
      n.read = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      this.notifSvc.markRead(n.id).subscribe({
        error: () => { /* silently ignore mark-read failures */ }
      });
      this.cdr.markForCheck();
    }
  }

  markAllRead(): void {
    this.notifications.forEach(n => n.read = true);
    this.unreadCount = 0;
    this.cdr.markForCheck();
  }

  trackById(_: number, item: Notification): string { return item.id; }

}

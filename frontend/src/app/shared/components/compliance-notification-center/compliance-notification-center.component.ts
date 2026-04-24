import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';
import {
  ComplianceNotificationCenterService,
  ComplianceNotification,
} from '../../../core/compliance-notification-center.service';

@Component({
  selector: 'ui-compliance-notification-center',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ntf-center">
      <div class="ntf-header">
        <h3 class="ntf-title">Notifications</h3>
        <span *ngIf="unreadCount > 0" class="ntf-badge">{{ unreadCount }}</span>
      </div>

      <div *ngIf="loading" class="ntf-loading">Loading…</div>

      <div *ngIf="!loading && !notifications.length" class="ntf-empty">
        No notifications
      </div>

      <div *ngIf="!loading && notifications.length" class="ntf-list">
        <div
          *ngFor="let n of notifications; trackBy: trackById"
          class="ntf-item"
          [class.ntf-item--unread]="n.status === 'OPEN'"
          (click)="markRead(n)"
        >
          <div class="ntf-item-top">
            <span class="ntf-priority"
                  [class.ntf-priority--critical]="n.priority === 'CRITICAL'"
                  [class.ntf-priority--high]="n.priority === 'HIGH'"
                  [class.ntf-priority--medium]="n.priority === 'MEDIUM'"
                  [class.ntf-priority--low]="n.priority === 'LOW'">
              {{ n.priority }}
            </span>
            <span class="ntf-module">{{ n.module }}</span>
            <span class="ntf-time">{{ timeAgo(n.createdAt) }}</span>
          </div>
          <p class="ntf-item-title">{{ n.title }}</p>
          <p class="ntf-item-msg">{{ n.message }}</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ntf-center { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .ntf-header { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid #f1f5f9; }
    .ntf-title { font-weight: 700; font-size: 14px; color: #0f172a; margin: 0; }
    .ntf-badge { background: #ef4444; color: #fff; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 10px; }
    .ntf-loading, .ntf-empty { padding: 24px 16px; text-align: center; color: #94a3b8; font-size: 13px; }
    .ntf-list { max-height: 400px; overflow-y: auto; }
    .ntf-item { padding: 12px 16px; border-bottom: 1px solid #f8fafc; cursor: pointer; transition: background 0.15s; }
    .ntf-item:hover { background: #f8fafc; }
    .ntf-item--unread { background: #eff6ff; border-left: 3px solid #3b82f6; }
    .ntf-item-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .ntf-priority { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; text-transform: uppercase; }
    .ntf-priority--critical { background: #fef2f2; color: #b91c1c; }
    .ntf-priority--high { background: #fef3c7; color: #92400e; }
    .ntf-priority--medium { background: #f0f9ff; color: #1e40af; }
    .ntf-priority--low { background: #f0fdf4; color: #166534; }
    .ntf-module { font-size: 10px; color: #64748b; font-weight: 600; }
    .ntf-time { font-size: 10px; color: #94a3b8; margin-left: auto; }
    .ntf-item-title { font-size: 13px; font-weight: 600; color: #1e293b; margin: 0; }
    .ntf-item-msg { font-size: 12px; color: #64748b; margin: 2px 0 0; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `],
})
export class ComplianceNotificationCenterComponent implements OnInit, OnDestroy {
  notifications: ComplianceNotification[] = [];
  unreadCount = 0;
  loading = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private auth: AuthService,
    private notifService: ComplianceNotificationCenterService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackById(_: number, item: ComplianceNotification): string {
    return item.id;
  }

  loadNotifications(): void {
    const user = this.auth.getUser();
    if (!user) return;

    const role = user.role || 'CLIENT';
    const clientId = user.clientId;

    this.loading = true;
    this.notifService
      .getNotifications(role, clientId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
      )
      .subscribe({
        next: (items) => {
          this.notifications = items || [];
          this.unreadCount = this.notifications.filter(n => n.status === 'OPEN').length;
        },
      });
  }

  markRead(n: ComplianceNotification): void {
    if (n.status === 'READ') return;
    this.notifService.markRead(n.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        n.status = 'READ';
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.cdr.markForCheck();
      },
    });
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }
}

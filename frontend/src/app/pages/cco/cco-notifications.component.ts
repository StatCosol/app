import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent, ActionButtonComponent, StatusBadgeComponent } from '../../shared/ui';

@Component({
  selector: 'app-cco-notifications',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent, ActionButtonComponent, StatusBadgeComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Notifications (CCO)"
        description="High-priority system threads relevant to CCO"
        icon="bell">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading notifications..."></ui-loading-spinner>

      <div *ngIf="error" class="alert alert-error mb-4">{{ error }}</div>

      <ui-empty-state
        *ngIf="!loading && !error && items.length === 0"
        title="No notifications"
        description="High-priority system threads will appear here."
        icon="bell">
      </ui-empty-state>

      <div *ngIf="!loading && items.length > 0" class="space-y-3">
        <div *ngFor="let n of items" class="card flex items-center justify-between">
          <div>
            <p class="font-medium" [class.text-gray-500]="n.read">{{ n.subject || 'Notification' }}</p>
            <p class="text-sm text-gray-400">{{ n.createdAt | date:'medium' }}</p>
          </div>
          <ui-button
            *ngIf="!n.read"
            variant="secondary" size="sm"
            [disabled]="actionId === n.id"
            [loading]="actionId === n.id"
            (clicked)="markRead(n)">
            Mark Read
          </ui-button>
          <ui-status-badge *ngIf="n.read" variant="success" label="Read"></ui-status-badge>
        </div>
      </div>
    </div>
  `,
})
export class CcoNotificationsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  items: any[] = [];
  loading = true;
  error: string | null = null;
  actionId: number | null = null;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.http.get<any[]>('/api/v1/notifications/list').pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => { this.loading = false; this.items = data || []; this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.error = 'Failed to load notifications'; this.cdr.detectChanges(); },
    });
  }

  markRead(n: any): void {
    this.actionId = n.id;
    this.http.patch(`/api/v1/notifications/${n.id}/status`, { read: true }).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => { n.read = true; this.actionId = null; this.cdr.detectChanges(); },
      error: () => { this.error = 'Failed to mark as read'; this.actionId = null; this.cdr.detectChanges(); },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

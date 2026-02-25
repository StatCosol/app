import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { AdminApprovalsService } from '../../../core/admin-approvals.service';
import { PageHeaderComponent, StatusBadgeComponent, ActionButtonComponent, LoadingSpinnerComponent, EmptyStateComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-admin-approvals',
  imports: [CommonModule, PageHeaderComponent, StatusBadgeComponent, ActionButtonComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header 
        title="Approval Requests" 
        description="Review and manage system approval requests"
        icon="clipboard-check">
      </ui-page-header>
      
      <div class="flex gap-3 mb-6">
        <ui-button
          [variant]="filter === 'PENDING' ? 'primary' : 'outline'"
          (click)="filter = 'PENDING'; load()">
          Pending ({{ counts.pending }})
        </ui-button>
        <ui-button
          [variant]="filter === 'APPROVED' ? 'primary' : 'outline'"
          (click)="filter = 'APPROVED'; load()">
          Approved ({{ counts.approved }})
        </ui-button>
        <ui-button
          [variant]="filter === 'REJECTED' ? 'primary' : 'outline'"
          (click)="filter = 'REJECTED'; load()">
          Rejected ({{ counts.rejected }})
        </ui-button>
      </div>

      <ui-loading-spinner *ngIf="loading"></ui-loading-spinner>

      <div class="space-y-4" *ngIf="!loading">
        <div class="bg-white rounded-lg border border-gray-200 p-4" *ngFor="let req of requests">
          <div class="flex justify-between items-start mb-3 pb-3 border-b border-gray-200">
            <span class="text-sm font-bold text-gray-900">{{ req.requestType }}</span>
            <ui-status-badge [variant]="getBadgeVariant(req.status)">{{ req.status }}</ui-status-badge>
          </div>
          <div class="space-y-2 text-sm text-gray-700">
            <div><strong>Requester:</strong> {{ req.requesterName || 'Unknown' }}</div>
            <div><strong>Target:</strong> {{ req.targetEntityType }} ({{ req.targetEntityId }})</div>
            <div *ngIf="req.reason"><strong>Reason:</strong> {{ req.reason }}</div>
            <div><strong>Requested:</strong> {{ req.createdAt | date:'medium' }}</div>
          </div>
          <div class="flex gap-2 mt-3 pt-3 border-t border-gray-200" *ngIf="req.status === 'PENDING'">
            <ui-button variant="primary" size="sm" (click)="approve(req.id)" [disabled]="actionId === req.id">{{ actionId === req.id ? 'Processing...' : 'Approve' }}</ui-button>
            <ui-button variant="danger" size="sm" (click)="reject(req.id)" [disabled]="actionId === req.id">{{ actionId === req.id ? 'Processing...' : 'Reject' }}</ui-button>
          </div>
          <div class="mt-3 p-3 bg-gray-50 rounded text-sm" *ngIf="req.approverNotes">
            <strong>Notes:</strong> {{ req.approverNotes }}
          </div>
        </div>
        
        <ui-empty-state 
          *ngIf="requests.length === 0"
          [title]="'No ' + filter.toLowerCase() + ' requests'"
          icon="clipboard-check">
        </ui-empty-state>
      </div>
    </div>
  `
})
export class AdminApprovalsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  actionId: string | null = null;
  filter: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING';
  requests: any[] = [];
  counts = { pending: 0, approved: 0, rejected: 0 };

  constructor(private api: AdminApprovalsService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadCounts();
    this.load();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCounts() {
    this.api.getCounts().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.counts = res || this.counts;
        this.cdr.detectChanges();
      },
    });
  }

  load() {
    this.loading = true;
    this.api.list(this.filter).pipe(
      timeout(10000),
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.requests = res || [];
        this.cdr.detectChanges();
      },
      error: () => { this.cdr.detectChanges(); },
    });
  }

  approve(id: string) {
    if (this.actionId) return;
    const notes = prompt('Approval notes (optional):');
    this.actionId = id;
    this.api.approve(id, notes || '').pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.actionId = null;
        this.cdr.detectChanges();
        this.load();
        this.loadCounts();
      },
      error: () => { this.actionId = null; this.cdr.detectChanges(); },
    });
  }

  reject(id: string) {
    if (this.actionId) return;
    const notes = prompt('Rejection reason:');
    if (!notes) { return; }
    this.actionId = id;
    this.api.reject(id, notes).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.actionId = null;
        this.cdr.detectChanges();
        this.load();
        this.loadCounts();
      },
      error: () => { this.actionId = null; this.cdr.detectChanges(); },
    });
  }

  getBadgeVariant(status: string): 'success' | 'error' | 'warning' | 'info' | 'gray' | 'primary' {
    switch (status?.toUpperCase()) {
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'error';
      case 'PENDING': return 'warning';
      default: return 'gray';
    }
  }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';
import { PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent } from '../../shared/ui';
import { CeoApiService, CeoApproval } from '../../core/api/ceo.api';

@Component({
  selector: 'app-ceo-approvals',
  standalone: true,
  imports: [CommonModule, RouterModule, PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="CEO Approvals"
        description="List of client deletion approvals and actions"
        icon="check-circle">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading approvals..."></ui-loading-spinner>

      <div *ngIf="error" class="alert alert-error mb-4">{{ error }}</div>

      <ui-empty-state
        *ngIf="!loading && !error && approvals.length === 0"
        title="No pending approvals"
        description="Pending approval requests will appear here."
        icon="clipboard-check">
      </ui-empty-state>

      <div *ngIf="!loading && approvals.length > 0" class="card">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">ID</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Entity</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Requested By</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr *ngFor="let a of approvals" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm">{{ a.id }}</td>
              <td class="px-4 py-3 text-sm">{{ a.entityType }} #{{ a.entityId }}</td>
              <td class="px-4 py-3 text-sm">{{ a.requestedBy?.name || a.requestedBy?.email || '-' }}</td>
              <td class="px-4 py-3 text-sm">
                <span class="badge" [class.badge-warning]="a.status === 'PENDING'" [class.badge-success]="a.status === 'APPROVED'">
                  {{ a.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm space-x-2">
                <button *ngIf="a.status === 'PENDING'"
                  class="btn-primary-sm"
                  [disabled]="actionId === a.id"
                  (click)="approve(a.id)">
                  {{ actionId === a.id ? 'Processing...' : 'Approve' }}
                </button>
                <button *ngIf="a.status === 'PENDING'"
                  class="btn-secondary-sm"
                  [disabled]="actionId === a.id"
                  (click)="reject(a.id)">
                  Reject
                </button>
                <a [routerLink]="['/ceo/approvals', a.id]" class="btn-secondary-sm">View</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class CeoApprovalsComponent implements OnInit, OnDestroy {
  approvals: CeoApproval[] = [];
  loading = true;
  error: string | null = null;
  private destroy$ = new Subject<void>();
  actionId: number | null = null;

  constructor(private api: CeoApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.api.getApprovals().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => { this.loading = false; this.approvals = data || []; this.cdr.detectChanges(); },
      error: (err) => { this.loading = false; this.error = 'Failed to load approvals'; this.cdr.detectChanges(); },
    });
  }

  approve(id: number): void {
    this.actionId = id;
    this.api.approve(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.actionId = null; this.cdr.detectChanges(); this.load(); },
      error: () => { this.actionId = null; this.error = 'Approve failed'; this.cdr.detectChanges(); },
    });
  }

  reject(id: number): void {
    const remarks = prompt('Enter rejection remarks:');
    if (remarks === null) return;
    this.actionId = id;
    this.api.reject(id, remarks).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.actionId = null; this.cdr.detectChanges(); this.load(); },
      error: () => { this.actionId = null; this.error = 'Reject failed'; this.cdr.detectChanges(); },
    });
  }
}

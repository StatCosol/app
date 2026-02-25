import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';
import { CeoApiService, CeoApproval } from '../../../core/api/ceo.api';
import { PageHeaderComponent, LoadingSpinnerComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-approval-details',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent],
  template: `
    <main class="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <a (click)="goBack()" class="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mb-4 cursor-pointer">
        ← Back to Approvals
      </a>

      <ui-loading-spinner *ngIf="loading" text="Loading approval details..."></ui-loading-spinner>

      <div *ngIf="errorMsg" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
        {{ errorMsg }}
      </div>

      <div *ngIf="!loading && approval" class="space-y-6">
        <ui-page-header title="Approval Request" [subtitle]="'#' + approval.id"></ui-page-header>

        <!-- Details card -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p class="text-xs text-gray-500 uppercase font-medium">Entity Type</p>
              <p class="text-sm font-medium text-gray-900 mt-0.5">{{ approval.entityType || '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-500 uppercase font-medium">Status</p>
              <span class="mt-0.5 inline-block px-2 py-0.5 text-xs font-medium rounded-full"
                    [ngClass]="{
                      'bg-yellow-100 text-yellow-700': approval.status === 'PENDING',
                      'bg-green-100 text-green-700': approval.status === 'APPROVED',
                      'bg-red-100 text-red-700': approval.status === 'REJECTED',
                      'bg-gray-100 text-gray-700': !['PENDING','APPROVED','REJECTED'].includes(approval.status)
                    }">
                {{ approval.status }}
              </span>
            </div>
            <div>
              <p class="text-xs text-gray-500 uppercase font-medium">Requested By</p>
              <p class="text-sm font-medium text-gray-900 mt-0.5">
                {{ approval.requestedBy?.name || approval.requestedBy?.email || '—' }}
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 uppercase font-medium">Created</p>
              <p class="text-sm font-medium text-gray-900 mt-0.5">
                {{ approval.createdAt ? (approval.createdAt | date:'medium') : '—' }}
              </p>
            </div>
            <div *ngIf="approval.remarks" class="sm:col-span-2">
              <p class="text-xs text-gray-500 uppercase font-medium">Remarks</p>
              <p class="text-sm text-gray-700 mt-0.5">{{ approval.remarks }}</p>
            </div>
          </div>
        </div>

        <!-- Actions (only if PENDING) -->
        <div *ngIf="approval.status === 'PENDING'" class="bg-white rounded-lg border border-gray-200 p-6">
          <h3 class="text-base font-semibold text-gray-900 mb-4">Take Action</h3>

          <div *ngIf="actionMsg" class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
            {{ actionMsg }}
          </div>
          <div *ngIf="actionErr" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {{ actionErr }}
          </div>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Remarks (required for rejection)</label>
            <textarea [(ngModel)]="remarks" rows="3" placeholder="Optional remarks..."
                      class="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm"></textarea>
          </div>

          <div class="flex gap-3">
            <button (click)="onApprove()" [disabled]="submitting"
                    class="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium
                           hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {{ submitting ? 'Processing...' : 'Approve' }}
            </button>
            <button (click)="onReject()" [disabled]="submitting || !remarks.trim()"
                    class="bg-red-600 text-white px-5 py-2 rounded-lg text-sm font-medium
                           hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {{ submitting ? 'Processing...' : 'Reject' }}
            </button>
          </div>
        </div>
      </div>
    </main>
  `,
})
export class ApprovalDetailsComponent implements OnInit, OnDestroy {
  approval: CeoApproval | null = null;
  loading = true;
  errorMsg: string | null = null;
  remarks = '';
  submitting = false;
  actionMsg: string | null = null;
  actionErr: string | null = null;

  private approvalId = '';
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ceoApi: CeoApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.approvalId = this.route.snapshot.paramMap.get('id') ?? '';
    this.loadApproval();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadApproval(): void {
    if (!this.approvalId) {
      this.errorMsg = 'No approval ID provided.';
      this.loading = false;
      return;
    }
    this.loading = true;
    this.errorMsg = null;

    this.ceoApi.getApproval(this.approvalId).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        this.loading = false;
        this.approval = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err?.error?.message || 'Failed to load approval details.';
        this.cdr.detectChanges();
      },
    });
  }

  onApprove(): void {
    if (this.submitting) return;
    this.submitting = true;
    this.actionMsg = null;
    this.actionErr = null;

    this.ceoApi.approve(this.approvalId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.actionMsg = 'Approval granted successfully.';
        this.submitting = false;
        this.cdr.detectChanges();
        this.loadApproval();
      },
      error: (err) => {
        this.actionErr = err?.error?.message || 'Failed to approve.';
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }

  onReject(): void {
    if (this.submitting || !this.remarks.trim()) return;
    this.submitting = true;
    this.actionMsg = null;
    this.actionErr = null;

    this.ceoApi.reject(this.approvalId, this.remarks.trim()).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.actionMsg = 'Request rejected.';
        this.submitting = false;
        this.cdr.detectChanges();
        this.loadApproval();
      },
      error: (err) => {
        this.actionErr = err?.error?.message || 'Failed to reject.';
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/ceo/approvals']);
  }
}

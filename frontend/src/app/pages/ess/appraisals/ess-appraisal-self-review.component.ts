import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize, switchMap } from 'rxjs/operators';
import { EssApiService } from '../ess-api.service';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  selector: 'app-ess-appraisal-self-review',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (appraisal) {
<div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Performance Appraisal"
        [subtitle]="appraisal.cycle_name + ' | ' + appraisal.financial_year">
        <a routerLink="/ess/appraisals" class="btn-secondary">Back to List</a>
      </ui-page-header>

      <!-- Employee Info -->
      <div class="table-card mb-6">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">My Details</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span class="text-gray-500">Code:</span> <span class="font-medium ml-1">{{ appraisal.employee_code }}</span></div>
          <div><span class="text-gray-500">Name:</span> <span class="font-medium ml-1">{{ appraisal.employee_name }}</span></div>
          <div><span class="text-gray-500">Department:</span> <span class="font-medium ml-1">{{ appraisal.department || '—' }}</span></div>
          <div><span class="text-gray-500">Designation:</span> <span class="font-medium ml-1">{{ appraisal.designation || '—' }}</span></div>
          <div><span class="text-gray-500">DOJ:</span> <span class="font-medium ml-1">{{ appraisal.date_of_joining | date:'dd/MM/yyyy' }}</span></div>
          <div><span class="text-gray-500">Branch:</span> <span class="font-medium ml-1">{{ appraisal.branch_name || '—' }}</span></div>
          <div><span class="text-gray-500">Review Period:</span> <span class="font-medium ml-1">{{ appraisal.review_period_from | date:'dd/MM/yyyy' }} — {{ appraisal.review_period_to | date:'dd/MM/yyyy' }}</span></div>
          <div>
            <span class="text-gray-500">Status:</span>
            <span class="badge ml-1"
              [class.bg-amber-100]="appraisal.status === 'INITIATED' || appraisal.status === 'SENT_BACK'"
              [class.text-amber-800]="appraisal.status === 'INITIATED' || appraisal.status === 'SENT_BACK'"
              [class.bg-brand-100]="appraisal.status === 'SELF_SUBMITTED' || appraisal.status === 'MANAGER_REVIEWED' || appraisal.status === 'BRANCH_REVIEWED'"
              [class.text-brand-700]="appraisal.status === 'SELF_SUBMITTED' || appraisal.status === 'MANAGER_REVIEWED' || appraisal.status === 'BRANCH_REVIEWED'"
              [class.bg-emerald-100]="appraisal.status === 'CLIENT_APPROVED' || appraisal.status === 'LOCKED'"
              [class.text-emerald-700]="appraisal.status === 'CLIENT_APPROVED' || appraisal.status === 'LOCKED'">
              {{ appraisal.status?.replace('_', ' ') }}
            </span>
          </div>
        </div>
      </div>

      <!-- Self-Review Pending Banner -->
      @if (canSelfReview) {
<div class="bg-brand-50 border border-brand-200 rounded-xl px-5 py-4 mb-6 flex items-center gap-3">
        <svg class="text-brand-500 shrink-0" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p class="text-sm text-brand-800">Please rate yourself on each parameter below and submit your self-review.</p>
      </div>
}

      <!-- Rating Items Table -->
      <div class="table-card mb-6">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">Performance Rating</h3>
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Parameter</th>
                <th>Weightage (%)</th>
                <th>Self Rating</th>
                <th>My Remarks</th>
                <th>Manager</th>
                <th>Branch</th>
                <th>Final</th>
                <th>Weighted</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items; track item; let i = $index) {
<tr class="data-row">
                <td class="text-xs text-gray-400">{{ i + 1 }}</td>
                <td class="font-medium text-sm">{{ item.itemName || item.item_name }}</td>
                <td class="text-center">{{ item.weightage }}</td>
                <td class="text-center">
                  @if (canSelfReview) {
<input type="number" min="0" max="5" step="0.25"
                    [(ngModel)]="item.selfRating" [name]="'sr_' + item.id"
                    class="w-16 text-center border rounded px-1 py-0.5 text-sm focus:ring-2 focus:ring-brand-300 focus:border-brand-400" />
}
                  @if (!canSelfReview) {
<span class="font-medium">{{ item.selfRating ?? item.self_rating ?? '—' }}</span>
}
                </td>
                <td>
                  @if (canSelfReview) {
<input type="text"
                    [(ngModel)]="item.employeeRemarks" [name]="'er_' + item.id"
                    placeholder="Your remarks..." class="w-32 border rounded px-1 py-0.5 text-xs focus:ring-2 focus:ring-brand-300" />
}
                  @if (!canSelfReview) {
<span class="text-xs text-gray-500">{{ item.employeeRemarks ?? item.employee_remarks ?? '—' }}</span>
}
                </td>
                <td class="text-center text-gray-500">{{ item.managerRating ?? item.manager_rating ?? '—' }}</td>
                <td class="text-center text-gray-500">{{ item.branchRating ?? item.branch_rating ?? '—' }}</td>
                <td class="text-center font-semibold">{{ item.finalRating ?? item.final_rating ?? '—' }}</td>
                <td class="text-center text-brand-600 font-medium">{{ item.weightedScore ?? item.weighted_score ?? '—' }}</td>
              </tr>
}
            </tbody>
            <tfoot>
              @if (appraisal.total_score || appraisal.totalScore) {
<tr class="bg-gray-50 font-semibold">
                <td colspan="8" class="text-right">Total Score:</td>
                <td class="text-center text-brand-700">{{ appraisal.total_score ?? appraisal.totalScore ?? '—' }}</td>
              </tr>
}
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Submit Button -->
      @if (canSelfReview) {
<div class="flex items-center gap-3 mt-6">
        <button (click)="submitSelfReview()" [disabled]="submitting" class="btn-primary">
          {{ submitting ? 'Submitting...' : 'Submit Self-Review' }}
        </button>
        @if (successMsg) {
<span class="text-sm text-emerald-600 font-medium">{{ successMsg }}</span>
}
        @if (errorMsg) {
<span class="text-sm text-red-600 font-medium">{{ errorMsg }}</span>
}
      </div>
}

      <!-- Submitted Confirmation -->
      @if (!canSelfReview && appraisal.self_status === 'SUBMITTED') {
<div class="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 mt-4 flex items-center gap-3">
        <svg class="text-emerald-500 shrink-0" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm text-emerald-800">Your self-review has been submitted. Pending manager/branch review.</p>
      </div>
}

      <!-- Approval History -->
      @if (appraisal.approvals?.length) {
<div class="table-card mt-6">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">Approval History</h3>
        <div class="space-y-2">
          @for (a of appraisal.approvals; track a) {
<div class="flex items-center gap-3 text-sm border-b pb-2">
            <span class="badge bg-gray-100 text-gray-700">{{ a.approvalLevel ?? a.approval_level }}</span>
            <span class="font-medium">{{ a.action }}</span>
            <span class="text-xs text-gray-400">{{ (a.actionAt ?? a.action_at) | date:'dd/MM/yyyy HH:mm' }}</span>
            @if (a.remarks) {
<span class="text-xs text-gray-500">— {{ a.remarks }}</span>
}
          </div>
}
        </div>
      </div>
}

      <!-- Final Rating Section (shown after approval) -->
      @if (appraisal.final_rating_label || appraisal.finalRatingLabel) {
<div class="table-card mt-6">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">Final Rating</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span class="text-gray-500">Rating:</span> <span class="font-semibold text-brand-700 ml-1">{{ appraisal.final_rating_label ?? appraisal.finalRatingLabel }}</span></div>
          <div><span class="text-gray-500">Total Score:</span> <span class="font-semibold ml-1">{{ appraisal.total_score ?? appraisal.totalScore ?? '—' }}</span></div>
          @if (appraisal.recommendation) {
<div><span class="text-gray-500">Recommendation:</span> <span class="font-medium ml-1">{{ appraisal.recommendation }}</span></div>
}
          @if (appraisal.final_remarks ?? appraisal.finalRemarks) {
<div><span class="text-gray-500">Remarks:</span> <span class="text-gray-600 ml-1">{{ appraisal.final_remarks ?? appraisal.finalRemarks }}</span></div>
}
        </div>
      </div>
}
    </div>
}

    @if (!appraisal && !loading) {
<div class="flex items-center justify-center py-20 text-gray-400">Appraisal not found</div>
}
    @if (loading) {
<div class="flex items-center justify-center py-20"><div class="spinner"></div></div>
}
  `,
})
export class EssAppraisalSelfReviewComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  submitting = false;
  appraisal: any = null;
  items: any[] = [];
  successMsg = '';
  errorMsg = '';

  get canSelfReview(): boolean {
    return this.appraisal && ['INITIATED', 'SENT_BACK'].includes(this.appraisal.status) && this.appraisal.self_status !== 'SUBMITTED';
  }

  constructor(
    private api: EssApiService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.paramMap.pipe(
      switchMap(p => {
        this.loading = true;
        this.cdr.markForCheck();
        return this.api.getMyAppraisal(p.get('id')!);
      }),
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (a) => {
        this.appraisal = a;
        this.items = a.items ?? [];
      },
      error: () => { this.appraisal = null; },
    });
  }

  submitSelfReview() {
    if (!this.appraisal || !this.items.length) return;
    this.submitting = true;
    this.successMsg = '';
    this.errorMsg = '';
    this.cdr.markForCheck();

    const payload = this.items.map(i => ({
      itemId: i.id,
      rating: i.selfRating ?? i.self_rating ?? 0,
      remarks: i.employeeRemarks ?? i.employee_remarks ?? '',
    }));

    this.api.submitSelfReview(this.appraisal.id, payload).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.submitting = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (a) => {
        this.appraisal = a;
        this.items = a.items ?? [];
        this.successMsg = 'Self-review submitted successfully!';
      },
      error: (err) => {
        this.errorMsg = err?.error?.message || 'Failed to submit self-review';
      },
    });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}

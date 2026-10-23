import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, EMPTY, combineLatest } from 'rxjs';
import { takeUntil, finalize, switchMap, startWith, catchError } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { EmployeeAppraisal, EmployeeAppraisalItem } from '../../../core/models/appraisal.models';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  selector: 'app-client-appraisal-approve',
  standalone: true,
  imports: [IconComponent, CommonModule, FormsModule, RouterLink, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`.data-table { min-width: 860px; } .data-table th:nth-child(2), .data-table td:nth-child(2) { min-width: 240px; max-width: 420px; white-space: normal; overflow-wrap: anywhere; }`],
  styleUrls: ['../shared/client-theme.scss', './client-appraisal-theme.scss'],
  template: `
    @if (error) {
      <div role="alert" class="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p>{{ error }}</p>
        @if (!appraisal) { <button type="button" class="standard-action mt-2" (click)="retry()">Try again</button> }
        <a routerLink="/client/appraisals" class="standard-action ml-3">Back to appraisals</a>
      </div>
    }
    @if (appraisal) {
<div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        [title]="appraisal.employee_name + ' — Approval'"
        [subtitle]="appraisal.cycle_name + ' | ' + appraisal.financial_year + ' | Status: ' + appraisal.status.replace('_', ' ')">
        <a routerLink="/client/appraisals" class="appraisal-action">Back</a>
      </ui-page-header>

      <!-- Employee Info -->
      <div class="table-card mb-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span class="text-gray-500">Code:</span> <span class="font-medium ml-1">{{ appraisal.employee_code }}</span></div>
          <div><span class="text-gray-500">Branch:</span> <span class="font-medium ml-1">{{ appraisal.branch_name || '—' }}</span></div>
          <div><span class="text-gray-500">Department:</span> <span class="font-medium ml-1">{{ appraisal.department || '—' }}</span></div>
          <div><span class="text-gray-500">Designation:</span> <span class="font-medium ml-1">{{ appraisal.designation || '—' }}</span></div>
          <div><span class="text-gray-500">DOJ:</span> <span class="font-medium ml-1">{{ appraisal.date_of_joining | date:'dd/MM/yyyy' }}</span></div>
          <div><span class="text-gray-500">CTC:</span> <span class="font-medium ml-1">{{ (appraisal.ctc !== null && appraisal.ctc !== undefined) ? (appraisal.ctc | number:'1.0-0') : '-' }}</span></div>
          <div><span class="text-gray-500">Score:</span> <span class="font-semibold ml-1 text-brand-600">{{ appraisal.totalScore ?? '—' }}</span></div>
          <div><span class="text-gray-500">Rating:</span> <span class="font-semibold ml-1">{{ appraisal.finalRatingLabel ?? '—' }}</span></div>
        </div>
      </div>

      <!-- Rating Items (read-only) -->
      <div class="table-card mb-6">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">Performance Ratings</h3>
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Weightage</th>
                <th>Self</th>
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
                <td class="font-medium text-sm">{{ item.itemName }}</td>
                <td class="text-center">{{ item.weightage }}%</td>
                <td class="text-center text-gray-500">{{ item.selfRating ?? '—' }}</td>
                <td class="text-center">{{ item.managerRating ?? '—' }}</td>
                <td class="text-center">{{ item.branchRating ?? '—' }}</td>
                <td class="text-center font-semibold">{{ item.finalRating ?? '—' }}</td>
                <td class="text-center text-brand-600 font-medium">{{ item.weightedScore ?? '—' }}</td>
              </tr>
}
            </tbody>
            <tfoot>
              <tr class="bg-gray-50 font-semibold">
                <td colspan="7" class="text-right">Total Score:</td>
                <td class="text-center text-brand-700">{{ appraisal.totalScore ?? '—' }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Branch Recommendation -->
      <div class="table-card mb-6">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">Branch Recommendation</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span class="text-gray-500">Recommendation:</span> <span class="font-medium ml-1">{{ appraisal.recommendation || '—' }}</span></div>
          <div><span class="text-gray-500">Increment %:</span> <span class="font-medium ml-1">{{ appraisal.recommendedIncrementPercent ?? '—' }}</span></div>
          <div><span class="text-gray-500">New CTC:</span> <span class="font-medium ml-1">{{ appraisal.recommendedNewCtc ? (appraisal.recommendedNewCtc | number:'1.0-0') : '—' }}</span></div>
          <div><span class="text-gray-500">PIP Required:</span> <span class="font-medium ml-1" [class.text-red-600]="appraisal.pipRequired">{{ appraisal.pipRequired ? 'Yes' : 'No' }}</span></div>
        </div>
        @if (appraisal.finalRemarks) {
<div class="mt-2 text-sm"><span class="text-gray-500">Remarks:</span> <span class="ml-1">{{ appraisal.finalRemarks }}</span></div>
}
      </div>

      <!-- Client Action -->
      @if (canApprove) {
<div class="table-card mb-6">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">Your Decision</h3>
        <div class="mb-4">
          <label class="text-xs font-medium text-gray-600 block mb-1" for="client-remarks">Remarks</label>
          <textarea id="client-remarks" name="clientRemarks" [(ngModel)]="clientRemarks" rows="3" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optional remarks..."></textarea>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <button (click)="approve()" [disabled]="submitting" class="compact-action appraisal-action appraisal-action--primary" title="Approve" aria-label="Approve" data-action-label="Approve" data-action-icon="check-circle"><ui-icon name="check-circle" [size]="20" /></button>
          <button (click)="sendBack()" [disabled]="submitting" class="compact-action appraisal-action text-amber-600" title="Send Back" aria-label="Send Back" data-action-label="Send Back" data-action-icon="send"><ui-icon name="send" [size]="20" /></button>
          <button (click)="reject()" [disabled]="submitting" class="compact-action appraisal-action text-red-600" title="Reject" aria-label="Reject" data-action-label="Reject" data-action-icon="x-circle"><ui-icon name="x-circle" [size]="20" /></button>
          @if (appraisal.status === 'CLIENT_APPROVED') {
<button (click)="lock()" [disabled]="submitting" class="compact-action appraisal-action" title="Lock" aria-label="Lock" data-action-label="Lock" data-action-icon="cog"><ui-icon name="cog" [size]="20" /></button>
}
        </div>
      </div>
}

      <!-- Approval History -->
      @if (appraisal.approvals?.length) {
<div class="table-card mt-6">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">Approval History</h3>
        <div class="space-y-2">
          @for (a of appraisal.approvals; track a) {
<div class="flex flex-wrap items-center gap-3 text-sm border-b pb-2">
            <span class="badge bg-gray-100 text-gray-700">{{ a.approvalLevel }}</span>
            <span class="font-medium">{{ a.action }}</span>
            <span class="text-xs text-gray-400">{{ a.actionAt | date:'dd/MM/yyyy HH:mm' }}</span>
            @if (a.remarks) {
<span class="text-xs text-gray-500">— {{ a.remarks }}</span>
}
          </div>
}
        </div>
      </div>
}
    </div>
}

    @if (loading) {
<div class="flex items-center justify-center py-20"><div class="spinner"></div></div>
}
  `,
})
export class ClientAppraisalApproveComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  error = '';
  private reload$ = new Subject<void>();
  submitting = false;
  appraisal: EmployeeAppraisal | null = null;
  items: EmployeeAppraisalItem[] = [];
  clientRemarks = '';

  get canApprove() {
    return this.appraisal && ['BRANCH_REVIEWED', 'MANAGER_REVIEWED', 'CLIENT_APPROVED'].includes(this.appraisal.status);
  }

  constructor(
    private svc: PerformanceAppraisalService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    combineLatest([this.route.paramMap, this.reload$.pipe(startWith(undefined))]).pipe(
      switchMap(([p]) => {
        this.loading = true;
        this.error = '';
        this.appraisal = null;
        this.items = [];
        const id = p.get('id');
        if (!id) {
          this.loading = false;
          this.error = 'Appraisal not found.';
          this.cdr.markForCheck();
          return EMPTY;
        }
        return this.svc.getAppraisal(id).pipe(
          catchError(() => {
            this.error = 'Unable to load this appraisal. Check your access or try again.';
            return EMPTY;
          }),
          finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(a => {
      this.appraisal = a;
      this.items = a.items ?? [];
      this.cdr.markForCheck();
    });
  }

  retry(): void { this.reload$.next(); }

  approve() {
    if (!this.appraisal || this.submitting) return;
    this.error = '';
    this.submitting = true;
    this.svc.clientApprove(this.appraisal.id, { action: 'APPROVE', remarks: this.clientRemarks || undefined }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.submitting = false; this.cdr.markForCheck(); }),
    ).subscribe({ next: a => { this.appraisal = a; this.items = a.items ?? []; },
      error: () => { this.error = 'Unable to save the decision. Please try again.'; } });
  }

  sendBack() {
    if (!this.appraisal || this.submitting) return;
    this.error = '';
    this.submitting = true;
    this.svc.clientApprove(this.appraisal.id, { action: 'SEND_BACK', remarks: this.clientRemarks || undefined }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.submitting = false; this.cdr.markForCheck(); }),
    ).subscribe({ next: () => this.router.navigate(['/client/appraisals']),
      error: () => { this.error = 'Unable to save the decision. Please try again.'; } });
  }

  reject() {
    if (!this.appraisal || this.submitting) return;
    this.error = '';
    this.submitting = true;
    this.svc.clientApprove(this.appraisal.id, { action: 'REJECT', remarks: this.clientRemarks || undefined }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.submitting = false; this.cdr.markForCheck(); }),
    ).subscribe({ next: a => { this.appraisal = a; this.items = a.items ?? []; },
      error: () => { this.error = 'Unable to save the decision. Please try again.'; } });
  }

  lock() {
    if (!this.appraisal || this.submitting) return;
    this.error = '';
    this.submitting = true;
    this.svc.lockAppraisal(this.appraisal.id).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.submitting = false; this.cdr.markForCheck(); }),
    ).subscribe({ next: () => this.router.navigate(['/client/appraisals']),
      error: () => { this.error = 'Unable to save the decision. Please try again.'; } });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}

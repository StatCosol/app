import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize, switchMap } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { EmployeeAppraisal, EmployeeAppraisalItem } from '../../../core/models/appraisal.models';

@Component({
  selector: 'app-branch-appraisal-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container" *ngIf="appraisal">
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ appraisal.employee_name }} — Appraisal Review</h1>
          <p class="page-subtitle">{{ appraisal.cycle_name }} | {{ appraisal.financial_year }} | Status: {{ appraisal.status?.replace('_', ' ') }}</p>
        </div>
        <div class="flex items-center gap-3">
          <a routerLink="/branch/appraisals" class="btn-secondary">Back to List</a>
        </div>
      </div>

      <!-- Employee Info -->
      <div class="table-card mb-6">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">Employee Details</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span class="text-gray-500">Code:</span> <span class="font-medium ml-1">{{ appraisal.employee_code }}</span></div>
          <div><span class="text-gray-500">Department:</span> <span class="font-medium ml-1">{{ appraisal.department || '—' }}</span></div>
          <div><span class="text-gray-500">Designation:</span> <span class="font-medium ml-1">{{ appraisal.designation || '—' }}</span></div>
          <div><span class="text-gray-500">DOJ:</span> <span class="font-medium ml-1">{{ appraisal.date_of_joining | date:'dd/MM/yyyy' }}</span></div>
          <div><span class="text-gray-500">CTC:</span> <span class="font-medium ml-1">{{ appraisal.ctc | number:'1.0-0' }}</span></div>
          <div><span class="text-gray-500">Monthly Gross:</span> <span class="font-medium ml-1">{{ appraisal.monthly_gross | number:'1.0-0' }}</span></div>
          <div><span class="text-gray-500">Review Period:</span> <span class="font-medium ml-1">{{ appraisal.review_period_from | date:'dd/MM/yyyy' }} — {{ appraisal.review_period_to | date:'dd/MM/yyyy' }}</span></div>
        </div>
      </div>

      <!-- Rating Items -->
      <div class="table-card mb-6">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">Performance Rating</h3>
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Weightage (%)</th>
                <th>Self</th>
                <th>Manager</th>
                <th>Branch</th>
                <th>Final</th>
                <th>Weighted</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of items; let i = index" class="data-row">
                <td class="text-xs text-gray-400">{{ i + 1 }}</td>
                <td class="font-medium text-sm">{{ item.itemName }}</td>
                <td class="text-center">{{ item.weightage }}</td>
                <td class="text-center text-gray-500">{{ item.selfRating ?? '—' }}</td>
                <td class="text-center">
                  <input *ngIf="canManagerReview" type="number" min="0" max="5" step="0.25"
                    [(ngModel)]="item.managerRating" [name]="'mr_' + item.id"
                    class="w-16 text-center border rounded px-1 py-0.5 text-sm" />
                  <span *ngIf="!canManagerReview">{{ item.managerRating ?? '—' }}</span>
                </td>
                <td class="text-center">
                  <input *ngIf="canBranchReview" type="number" min="0" max="5" step="0.25"
                    [(ngModel)]="item.branchRating" [name]="'br_' + item.id"
                    class="w-16 text-center border rounded px-1 py-0.5 text-sm" />
                  <span *ngIf="!canBranchReview">{{ item.branchRating ?? '—' }}</span>
                </td>
                <td class="text-center font-semibold">{{ item.finalRating ?? '—' }}</td>
                <td class="text-center text-indigo-600 font-medium">{{ item.weightedScore ?? '—' }}</td>
                <td>
                  <input *ngIf="canManagerReview || canBranchReview" type="text"
                    [(ngModel)]="item.managerRemarks" [name]="'rmk_' + item.id"
                    placeholder="Remarks..." class="w-32 border rounded px-1 py-0.5 text-xs" />
                  <span *ngIf="!canManagerReview && !canBranchReview" class="text-xs text-gray-500">{{ item.managerRemarks || '—' }}</span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="bg-gray-50 font-semibold">
                <td colspan="7" class="text-right">Total Score:</td>
                <td class="text-center text-indigo-700">{{ appraisal.totalScore ?? '—' }}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Recommendation -->
      <div class="table-card mb-6" *ngIf="canManagerReview || canBranchReview">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">Recommendation</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="rec">Recommendation</label>
            <select id="rec" name="recommendation" [(ngModel)]="recommendation" class="filter-select">
              <option value="">Select...</option>
              <option value="CONFIRM">Confirm</option>
              <option value="INCREMENT">Increment</option>
              <option value="PROMOTION">Promotion</option>
              <option value="PIP">PIP</option>
              <option value="EXTEND_PROBATION">Extend Probation</option>
              <option value="NO_CHANGE">No Change</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="inc-pct">Increment %</label>
            <input id="inc-pct" name="incrementPercent" type="number" min="0" max="100" step="0.5" [(ngModel)]="incrementPercent" class="search-input" />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="new-ctc">New CTC</label>
            <input id="new-ctc" name="newCtc" type="number" min="0" [(ngModel)]="newCtc" class="search-input" />
          </div>
        </div>
        <div class="mt-4">
          <label class="text-xs font-medium text-gray-600 block mb-1" for="remarks">Remarks</label>
          <textarea id="remarks" name="remarks" [(ngModel)]="remarks" rows="3" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Final remarks..."></textarea>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-3 mt-6" *ngIf="canManagerReview || canBranchReview">
        <button (click)="submitReview()" [disabled]="submitting" class="btn-primary">
          {{ submitting ? 'Submitting...' : (canManagerReview ? 'Submit Manager Review' : 'Submit Branch Review') }}
        </button>
        <button (click)="sendBack()" [disabled]="submitting" class="btn-secondary text-red-600">Send Back</button>
      </div>

      <!-- Approval History -->
      <div class="table-card mt-6" *ngIf="appraisal.approvals?.length">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">Approval History</h3>
        <div class="space-y-2">
          <div *ngFor="let a of appraisal.approvals" class="flex items-center gap-3 text-sm border-b pb-2">
            <span class="badge bg-gray-100 text-gray-700">{{ a.approvalLevel }}</span>
            <span class="font-medium">{{ a.action }}</span>
            <span class="text-xs text-gray-400">{{ a.actionAt | date:'dd/MM/yyyy HH:mm' }}</span>
            <span class="text-xs text-gray-500" *ngIf="a.remarks">— {{ a.remarks }}</span>
          </div>
        </div>
      </div>
    </div>

    <div *ngIf="!appraisal && !loading" class="flex items-center justify-center py-20 text-gray-400">Appraisal not found</div>
    <div *ngIf="loading" class="flex items-center justify-center py-20"><div class="spinner"></div></div>
  `,
})
export class BranchAppraisalFormComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  submitting = false;
  appraisal: EmployeeAppraisal | null = null;
  items: EmployeeAppraisalItem[] = [];
  recommendation = '';
  incrementPercent: number | null = null;
  newCtc: number | null = null;
  remarks = '';

  get canManagerReview() {
    return this.appraisal && ['INITIATED', 'SELF_SUBMITTED', 'SENT_BACK'].includes(this.appraisal.status);
  }
  get canBranchReview() {
    return this.appraisal && ['MANAGER_REVIEWED', 'SENT_BACK'].includes(this.appraisal.status);
  }

  constructor(
    private svc: PerformanceAppraisalService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.paramMap.pipe(
      switchMap(p => {
        this.loading = true;
        return this.svc.getAppraisal(p.get('id')!);
      }),
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe(a => {
      this.appraisal = a;
      this.items = a.items ?? [];
      this.recommendation = a.recommendation ?? '';
      this.incrementPercent = a.recommendedIncrementPercent ?? null;
      this.newCtc = a.recommendedNewCtc ?? null;
      this.remarks = a.finalRemarks ?? '';
    });
  }

  submitReview() {
    if (!this.appraisal) return;
    this.submitting = true;
    const payload = {
      items: this.items.map(i => ({
        itemId: i.id,
        itemName: i.itemName,
        rating: this.canManagerReview ? i.managerRating : i.branchRating,
        remarks: i.managerRemarks,
      })),
      recommendation: this.recommendation || undefined,
      recommendedIncrementPercent: this.incrementPercent ?? undefined,
      recommendedNewCtc: this.newCtc ?? undefined,
      remarks: this.remarks || undefined,
    };

    const obs = this.canManagerReview
      ? this.svc.managerReview(this.appraisal.id, payload)
      : this.svc.branchReview(this.appraisal.id, payload);

    obs.pipe(takeUntil(this.destroy$), finalize(() => { this.submitting = false; this.cdr.markForCheck(); }))
      .subscribe(a => {
        this.appraisal = a;
        this.items = a.items ?? [];
      });
  }

  sendBack() {
    if (!this.appraisal || !this.remarks) return;
    this.submitting = true;
    this.svc.sendBack(this.appraisal.id, this.remarks).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.submitting = false; this.cdr.markForCheck(); }),
    ).subscribe(() => this.router.navigate(['/branch/appraisals']));
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}

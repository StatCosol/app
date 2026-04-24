import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize, switchMap } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { EmployeeAppraisal, EmployeeAppraisalItem } from '../../../core/models/appraisal.models';

@Component({
  selector: 'app-client-appraisal-approve',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container" *ngIf="appraisal">
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ appraisal.employee_name }} — Approval</h1>
          <p class="page-subtitle">{{ appraisal.cycle_name }} | {{ appraisal.financial_year }} | Status: {{ appraisal.status?.replace('_', ' ') }}</p>
        </div>
        <a routerLink="/client/appraisals" class="btn-secondary">Back</a>
      </div>

      <!-- Employee Info -->
      <div class="table-card mb-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span class="text-gray-500">Code:</span> <span class="font-medium ml-1">{{ appraisal.employee_code }}</span></div>
          <div><span class="text-gray-500">Branch:</span> <span class="font-medium ml-1">{{ appraisal.branch_name || '—' }}</span></div>
          <div><span class="text-gray-500">Department:</span> <span class="font-medium ml-1">{{ appraisal.department || '—' }}</span></div>
          <div><span class="text-gray-500">Designation:</span> <span class="font-medium ml-1">{{ appraisal.designation || '—' }}</span></div>
          <div><span class="text-gray-500">DOJ:</span> <span class="font-medium ml-1">{{ appraisal.date_of_joining | date:'dd/MM/yyyy' }}</span></div>
          <div><span class="text-gray-500">CTC:</span> <span class="font-medium ml-1">{{ appraisal.ctc | number:'1.0-0' }}</span></div>
          <div><span class="text-gray-500">Score:</span> <span class="font-semibold ml-1 text-indigo-600">{{ appraisal.totalScore ?? '—' }}</span></div>
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
              <tr *ngFor="let item of items; let i = index" class="data-row">
                <td class="text-xs text-gray-400">{{ i + 1 }}</td>
                <td class="font-medium text-sm">{{ item.itemName }}</td>
                <td class="text-center">{{ item.weightage }}%</td>
                <td class="text-center text-gray-500">{{ item.selfRating ?? '—' }}</td>
                <td class="text-center">{{ item.managerRating ?? '—' }}</td>
                <td class="text-center">{{ item.branchRating ?? '—' }}</td>
                <td class="text-center font-semibold">{{ item.finalRating ?? '—' }}</td>
                <td class="text-center text-indigo-600 font-medium">{{ item.weightedScore ?? '—' }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="bg-gray-50 font-semibold">
                <td colspan="7" class="text-right">Total Score:</td>
                <td class="text-center text-indigo-700">{{ appraisal.totalScore ?? '—' }}</td>
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
        <div class="mt-2 text-sm" *ngIf="appraisal.finalRemarks"><span class="text-gray-500">Remarks:</span> <span class="ml-1">{{ appraisal.finalRemarks }}</span></div>
      </div>

      <!-- Client Action -->
      <div class="table-card mb-6" *ngIf="canApprove">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">Your Decision</h3>
        <div class="mb-4">
          <label class="text-xs font-medium text-gray-600 block mb-1" for="client-remarks">Remarks</label>
          <textarea id="client-remarks" name="clientRemarks" [(ngModel)]="clientRemarks" rows="3" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optional remarks..."></textarea>
        </div>
        <div class="flex items-center gap-3">
          <button (click)="approve()" [disabled]="submitting" class="btn-primary">Approve</button>
          <button (click)="sendBack()" [disabled]="submitting" class="btn-secondary text-amber-600">Send Back</button>
          <button (click)="reject()" [disabled]="submitting" class="btn-secondary text-red-600">Reject</button>
          <button *ngIf="appraisal.status === 'CLIENT_APPROVED'" (click)="lock()" [disabled]="submitting" class="btn-secondary">Lock</button>
        </div>
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

    <div *ngIf="loading" class="flex items-center justify-center py-20"><div class="spinner"></div></div>
  `,
})
export class ClientAppraisalApproveComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
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
    this.route.paramMap.pipe(
      switchMap(p => { this.loading = true; return this.svc.getAppraisal(p.get('id')!); }),
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe(a => { this.appraisal = a; this.items = a.items ?? []; });
  }

  approve() {
    if (!this.appraisal) return;
    this.submitting = true;
    this.svc.clientApprove(this.appraisal.id, { action: 'APPROVE', remarks: this.clientRemarks || undefined }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.submitting = false; this.cdr.markForCheck(); }),
    ).subscribe(a => { this.appraisal = a; this.items = a.items ?? []; });
  }

  sendBack() {
    if (!this.appraisal) return;
    this.submitting = true;
    this.svc.clientApprove(this.appraisal.id, { action: 'SEND_BACK', remarks: this.clientRemarks || undefined }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.submitting = false; this.cdr.markForCheck(); }),
    ).subscribe(() => this.router.navigate(['/client/appraisals']));
  }

  reject() {
    if (!this.appraisal) return;
    this.submitting = true;
    this.svc.clientApprove(this.appraisal.id, { action: 'REJECT', remarks: this.clientRemarks || undefined }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.submitting = false; this.cdr.markForCheck(); }),
    ).subscribe(a => { this.appraisal = a; this.items = a.items ?? []; });
  }

  lock() {
    if (!this.appraisal) return;
    this.submitting = true;
    this.svc.lockAppraisal(this.appraisal.id).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.submitting = false; this.cdr.markForCheck(); }),
    ).subscribe(() => this.router.navigate(['/client/appraisals']));
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}

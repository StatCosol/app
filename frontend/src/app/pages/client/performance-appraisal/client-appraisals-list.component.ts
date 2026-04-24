import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { EmployeeAppraisal, AppraisalCycle, AppraisalPaginatedResult } from '../../../core/models/appraisal.models';

@Component({
  selector: 'app-client-appraisals-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">All Employee Appraisals</h1>
          <p class="page-subtitle">Review, approve, and track performance appraisals</p>
        </div>
        <div class="flex items-center gap-3">
          <a routerLink="/client/appraisal-dashboard" class="btn-secondary">Dashboard</a>
          <a routerLink="/client/appraisal-reports" class="btn-secondary">Reports</a>
        </div>
      </div>

      <!-- Filters -->
      <div class="table-card mb-6">
        <div class="flex flex-wrap items-end gap-4">
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="c-cycle">Cycle</label>
            <select id="c-cycle" name="cycleId" [(ngModel)]="cycleId" (ngModelChange)="load()" class="filter-select">
              <option value="">All Cycles</option>
              <option *ngFor="let c of cycles" [value]="c.id">{{ c.cycleName }} ({{ c.financialYear }})</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="c-status">Status</label>
            <select id="c-status" name="status" [(ngModel)]="status" (ngModelChange)="load()" class="filter-select">
              <option value="">All</option>
              <option value="INITIATED">Initiated</option>
              <option value="MANAGER_REVIEWED">Manager Reviewed</option>
              <option value="BRANCH_REVIEWED">Branch Reviewed</option>
              <option value="CLIENT_APPROVED">Approved</option>
              <option value="SENT_BACK">Sent Back</option>
              <option value="LOCKED">Locked</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="c-rec">Recommendation</label>
            <select id="c-rec" name="recommendation" [(ngModel)]="recommendation" (ngModelChange)="load()" class="filter-select">
              <option value="">All</option>
              <option value="INCREMENT">Increment</option>
              <option value="PROMOTION">Promotion</option>
              <option value="PIP">PIP</option>
              <option value="NO_CHANGE">No Change</option>
              <option value="CONFIRM">Confirm</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="c-search">Search</label>
            <input id="c-search" name="search" type="text" [(ngModel)]="search" (ngModelChange)="load()" placeholder="Name or code..." class="search-input" autocomplete="off" />
          </div>
        </div>
      </div>

      <div *ngIf="loading" class="flex items-center justify-center py-20"><div class="spinner"></div></div>

      <div *ngIf="!loading" class="table-card">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs text-gray-500">{{ total }} records</span>
          <div class="flex gap-2">
            <button [disabled]="page <= 1" (click)="page = page - 1; load()" class="btn-secondary text-xs">Prev</button>
            <span class="text-xs text-gray-500 self-center">Page {{ page }}</span>
            <button [disabled]="appraisals.length < pageSize" (click)="page = page + 1; load()" class="btn-secondary text-xs">Next</button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Employee</th>
                <th>Branch</th>
                <th>Department</th>
                <th>Score</th>
                <th>Rating</th>
                <th>Recommendation</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of appraisals; trackBy: trackById" class="data-row">
                <td class="text-xs font-mono text-gray-500">{{ a.employee_code }}</td>
                <td class="font-medium text-slate-800">{{ a.employee_name }}</td>
                <td class="text-sm text-gray-600">{{ a.branch_name || '—' }}</td>
                <td class="text-sm text-gray-600">{{ a.department || '—' }}</td>
                <td class="font-semibold" [class.text-emerald-600]="(a.totalScore ?? 0) >= 3.5" [class.text-amber-600]="(a.totalScore ?? 0) >= 2 && (a.totalScore ?? 0) < 3.5" [class.text-red-600]="(a.totalScore ?? 0) < 2 && a.totalScore">
                  {{ a.totalScore ?? '—' }}
                </td>
                <td><span class="badge bg-indigo-100 text-indigo-700">{{ a.finalRatingLabel || '—' }}</span></td>
                <td>
                  <span *ngIf="a.recommendation" class="badge"
                    [class.bg-emerald-100]="a.recommendation === 'INCREMENT' || a.recommendation === 'PROMOTION'"
                    [class.text-emerald-700]="a.recommendation === 'INCREMENT' || a.recommendation === 'PROMOTION'"
                    [class.bg-red-100]="a.recommendation === 'PIP'"
                    [class.text-red-700]="a.recommendation === 'PIP'"
                    [class.bg-gray-100]="a.recommendation === 'NO_CHANGE'"
                    [class.text-gray-600]="a.recommendation === 'NO_CHANGE'">
                    {{ a.recommendation?.replace(/_/g, ' ') }}
                  </span>
                  <span *ngIf="!a.recommendation" class="text-gray-400">—</span>
                </td>
                <td>
                  <span class="badge"
                    [class.bg-amber-100]="a.status === 'INITIATED' || a.status === 'SENT_BACK'"
                    [class.text-amber-800]="a.status === 'INITIATED' || a.status === 'SENT_BACK'"
                    [class.bg-blue-100]="a.status === 'MANAGER_REVIEWED' || a.status === 'BRANCH_REVIEWED'"
                    [class.text-blue-700]="a.status === 'MANAGER_REVIEWED' || a.status === 'BRANCH_REVIEWED'"
                    [class.bg-emerald-100]="a.status === 'CLIENT_APPROVED' || a.status === 'LOCKED'"
                    [class.text-emerald-700]="a.status === 'CLIENT_APPROVED' || a.status === 'LOCKED'"
                    [class.bg-red-100]="a.status === 'REJECTED'"
                    [class.text-red-700]="a.status === 'REJECTED'">
                    {{ a.status?.replace(/_/g, ' ') }}
                  </span>
                </td>
                <td>
                  <a [routerLink]="['/client/appraisals', a.id]" class="text-indigo-600 hover:text-indigo-800 text-xs font-medium">
                    {{ canApprove(a) ? 'Approve' : 'View' }}
                  </a>
                </td>
              </tr>
              <tr *ngIf="!appraisals.length">
                <td colspan="9" class="text-center text-sm text-gray-400 py-10">No appraisals found</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class ClientAppraisalsListComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  cycles: AppraisalCycle[] = [];
  appraisals: EmployeeAppraisal[] = [];
  total = 0;
  page = 1;
  pageSize = 50;
  cycleId = '';
  status = '';
  recommendation = '';
  search = '';

  constructor(private svc: PerformanceAppraisalService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.svc.getCycles().pipe(takeUntil(this.destroy$)).subscribe(c => { this.cycles = c; this.cdr.markForCheck(); });
    this.load();
  }

  load() {
    this.loading = true; this.cdr.markForCheck();
    const filter: any = { page: this.page, pageSize: this.pageSize };
    if (this.cycleId) filter.cycleId = this.cycleId;
    if (this.status) filter.status = this.status;
    if (this.recommendation) filter.recommendation = this.recommendation;
    if (this.search) filter.search = this.search;

    this.svc.getAppraisals(filter).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe(r => { this.appraisals = r.data; this.total = r.total; });
  }

  canApprove(a: EmployeeAppraisal) {
    return ['BRANCH_REVIEWED', 'MANAGER_REVIEWED'].includes(a.status);
  }

  trackById(_: number, item: any) { return item.id; }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}

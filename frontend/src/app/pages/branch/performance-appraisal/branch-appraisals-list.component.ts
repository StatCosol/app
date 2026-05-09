import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { EmployeeAppraisal, AppraisalCycle } from '../../../core/models/appraisal.models';

@Component({
  selector: 'app-branch-appraisals-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; }
    .page-title { font-size: 1.2rem; font-weight: 800; color: #111827; margin: 0; }
    .page-subtitle { font-size: 0.82rem; color: #6b7280; margin-top: 0.25rem; }
    .header-action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 36px;
      padding: 0 0.9rem;
      border-radius: 0.55rem;
      border: 1px solid #c7d2fe;
      background: linear-gradient(180deg, #eef2ff 0%, #e0e7ff 100%);
      color: #3730a3;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.01em;
      text-decoration: none;
      box-shadow: 0 1px 2px rgba(79, 70, 229, 0.12);
      transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
    }
    .header-action-btn:hover {
      background: linear-gradient(180deg, #e0e7ff 0%, #c7d2fe 100%);
      box-shadow: 0 4px 10px rgba(79, 70, 229, 0.18);
      transform: translateY(-1px);
    }
    .header-action-btn:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
    }
    .filter-select, .search-input { height: 36px; border: 1px solid #d1d5db; border-radius: 0.5rem; padding: 0 0.6rem; font-size: 0.825rem; color: #1e293b; background: #fff; min-width: 150px; }
    .filter-select:focus, .search-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }
    .spinner { width: 2rem; height: 2rem; border: 3px solid #e5e7eb; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.75s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .table-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.825rem; }
    .data-table th { padding: 0.5rem 0.75rem; text-align: left; font-weight: 600; color: #475569; background: #f8fafc; border-bottom: 1px solid #e5e7eb; white-space: nowrap; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; color: #1e293b; vertical-align: middle; }
    .data-row:hover td { background: #f8fafc; }
  `],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Employee Appraisals</h1>
          <p class="page-subtitle">Review and manage employee performance appraisals</p>
        </div>
        <a routerLink="/branch/appraisal-dashboard" class="header-action-btn">Dashboard</a>
      </div>

      <!-- Filters -->
      <div class="table-card mb-6">
        <div class="flex flex-wrap items-end gap-4">
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="cycle-filter">Cycle</label>
            <select id="cycle-filter" name="cycleFilter" [(ngModel)]="cycleId" (ngModelChange)="load()" class="filter-select">
              <option value="">All Cycles</option>
              <option *ngFor="let c of cycles" [value]="c.id">{{ c.cycleName }} ({{ c.financialYear }})</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="status-filter">Status</label>
            <select id="status-filter" name="statusFilter" [(ngModel)]="status" (ngModelChange)="load()" class="filter-select">
              <option value="">All</option>
              <option value="INITIATED">Initiated</option>
              <option value="MANAGER_REVIEWED">Manager Reviewed</option>
              <option value="BRANCH_REVIEWED">Branch Reviewed</option>
              <option value="CLIENT_APPROVED">Approved</option>
              <option value="SENT_BACK">Sent Back</option>
              <option value="LOCKED">Locked</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="search-filter">Search</label>
            <input id="search-filter" name="searchFilter" type="text" [(ngModel)]="search" (ngModelChange)="load()" placeholder="Name or code..." class="search-input" autocomplete="off" />
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
                <th>Department</th>
                <th>Designation</th>
                <th>Cycle</th>
                <th>Score</th>
                <th>Rating</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of appraisals; trackBy: trackById" class="data-row">
                <td class="text-xs font-mono text-gray-500">{{ a.employee_code }}</td>
                <td class="font-medium text-slate-800">{{ a.employee_name }}</td>
                <td class="text-sm text-gray-600">{{ a.department || '—' }}</td>
                <td class="text-sm text-gray-600">{{ a.designation || '—' }}</td>
                <td class="text-xs text-gray-500">{{ a.cycle_name }}</td>
                <td class="font-semibold" [class.text-emerald-600]="(a.totalScore ?? 0) >= 3.5" [class.text-amber-600]="(a.totalScore ?? 0) >= 2 && (a.totalScore ?? 0) < 3.5" [class.text-red-600]="(a.totalScore ?? 0) < 2 && a.totalScore">
                  {{ a.totalScore ?? '—' }}
                </td>
                <td><span class="badge bg-indigo-100 text-indigo-700">{{ a.finalRatingLabel || '—' }}</span></td>
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
                    {{ a.status.replace(/_/g, ' ') }}
                  </span>
                </td>
                <td>
                  <a [routerLink]="['/branch/appraisals', a.id]" class="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Review</a>
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
export class BranchAppraisalsListComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  cycles: AppraisalCycle[] = [];
  appraisals: EmployeeAppraisal[] = [];
  total = 0;
  page = 1;
  pageSize = 50;
  cycleId = '';
  status = '';
  search = '';

  constructor(
    private svc: PerformanceAppraisalService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.svc.getCycles().pipe(takeUntil(this.destroy$)).subscribe(c => { this.cycles = c; this.cdr.markForCheck(); });
    this.load();
  }

  load() {
    this.loading = true;
    this.cdr.markForCheck();
    const filter: any = { page: this.page, pageSize: this.pageSize };
    if (this.cycleId) filter.cycleId = this.cycleId;
    if (this.status) filter.status = this.status;
    if (this.search) filter.search = this.search;

    this.svc.getAppraisals(filter).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe(r => { this.appraisals = r.data; this.total = r.total; });
  }

  trackById(_: number, item: any) { return item.id; }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}

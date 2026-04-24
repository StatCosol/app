import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { AppraisalDashboard, AppraisalCycle } from '../../../core/models/appraisal.models';

@Component({
  selector: 'app-branch-appraisal-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Performance Appraisals</h1>
          <p class="page-subtitle">Branch appraisal overview and pending actions</p>
        </div>
        <div class="flex items-center gap-3">
          <a routerLink="/branch/appraisals" class="btn-secondary">View All Appraisals</a>
          <a routerLink="/branch/appraisal-cycles" class="btn-secondary">Cycles</a>
        </div>
      </div>

      <div *ngIf="loading" class="flex items-center justify-center py-20">
        <div class="spinner"></div>
      </div>

      <ng-container *ngIf="!loading && dashboard">
        <!-- Summary Cards -->
        <div class="summary-strip">
          <div class="summary-card">
            <span class="summary-value text-blue-600">{{ dashboard.summary.total }}</span>
            <span class="summary-label">Total</span>
          </div>
          <div class="summary-card">
            <span class="summary-value text-amber-600">{{ dashboard.summary.pending }}</span>
            <span class="summary-label">Pending</span>
          </div>
          <div class="summary-card">
            <span class="summary-value text-emerald-600">{{ dashboard.summary.client_approved }}</span>
            <span class="summary-label">Approved</span>
          </div>
          <div class="summary-card">
            <span class="summary-value text-red-500">{{ dashboard.summary.sent_back }}</span>
            <span class="summary-label">Sent Back</span>
          </div>
          <div class="summary-card">
            <span class="summary-value text-indigo-600">{{ dashboard.summary.avg_score || '—' }}</span>
            <span class="summary-label">Avg Score</span>
          </div>
          <div class="summary-card">
            <span class="summary-value text-purple-600">{{ dashboard.summary.pip_count }}</span>
            <span class="summary-label">PIP</span>
          </div>
        </div>

        <!-- Status Breakdown -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div class="table-card">
            <h3 class="text-sm font-semibold text-gray-900 mb-4">Status Breakdown</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="text-gray-500">Initiated</span><span class="font-medium">{{ dashboard.summary.initiated }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Manager Reviewed</span><span class="font-medium">{{ dashboard.summary.manager_reviewed }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Branch Reviewed</span><span class="font-medium">{{ dashboard.summary.branch_reviewed }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Client Approved</span><span class="font-medium">{{ dashboard.summary.client_approved }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Sent Back</span><span class="font-medium">{{ dashboard.summary.sent_back }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Closed/Locked</span><span class="font-medium">{{ dashboard.summary.closed }}</span></div>
            </div>
          </div>

          <div class="table-card">
            <h3 class="text-sm font-semibold text-gray-900 mb-4">Recommendations</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="text-gray-500">Increment</span><span class="font-medium text-emerald-600">{{ dashboard.summary.increment_recommended }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">Promotion</span><span class="font-medium text-blue-600">{{ dashboard.summary.promotion_recommended }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">PIP</span><span class="font-medium text-red-600">{{ dashboard.summary.pip_recommended }}</span></div>
            </div>
          </div>
        </div>

        <!-- Top Performers -->
        <div class="table-card mt-6" *ngIf="dashboard.topPerformers?.length">
          <h3 class="text-sm font-semibold text-gray-900 mb-4">Top Performers</h3>
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Code</th>
                  <th>Score</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let p of dashboard.topPerformers" class="data-row">
                  <td class="font-medium">{{ p.name }}</td>
                  <td class="text-xs text-gray-500 font-mono">{{ p.employee_code }}</td>
                  <td class="font-semibold text-emerald-600">{{ p.total_score }}</td>
                  <td><span class="badge bg-emerald-100 text-emerald-700">{{ p.final_rating_label || '—' }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Low Performers -->
        <div class="table-card mt-6" *ngIf="dashboard.lowPerformers?.length">
          <h3 class="text-sm font-semibold text-gray-900 mb-4">Low Performers / PIP Watch</h3>
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Code</th>
                  <th>Score</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let p of dashboard.lowPerformers" class="data-row">
                  <td class="font-medium">{{ p.name }}</td>
                  <td class="text-xs text-gray-500 font-mono">{{ p.employee_code }}</td>
                  <td class="font-semibold text-red-600">{{ p.total_score }}</td>
                  <td><span class="badge bg-red-100 text-red-700">{{ p.final_rating_label || '—' }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
    .page-title { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
    .page-subtitle { font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
    .btn-secondary {
      display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem;
      background: white; color: #374151; border: 1px solid #e2e8f0; border-radius: 0.5rem;
      font-size: 0.8125rem; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.2s;
    }
    .btn-secondary:hover { background: #f8fafc; border-color: #cbd5e1; }
    .summary-strip { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
    @media (max-width: 768px) { .summary-strip { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 480px) { .summary-strip { grid-template-columns: repeat(2, 1fr); } }
    .summary-card { background: white; border-radius: 0.75rem; padding: 1rem; text-align: center; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .summary-value { display: block; font-size: 1.5rem; font-weight: 800; }
    .summary-label { display: block; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.25rem; }
    .table-card { background: white; border-radius: 1rem; border: 1px solid #f1f5f9; box-shadow: 0 1px 4px rgba(0,0,0,0.04); padding: 1rem 1.25rem; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { text-align: left; padding: 0.75rem 1rem; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; background: #f8fafc; border-bottom: 2px solid #f1f5f9; }
    .data-table td { padding: 0.75rem 1rem; font-size: 0.8125rem; border-bottom: 1px solid #f8fafc; }
    .data-row:hover { background: #f8fafc; }
    .badge { display: inline-flex; padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; }
    .spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class BranchAppraisalDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  dashboard: AppraisalDashboard | null = null;

  constructor(
    private svc: PerformanceAppraisalService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.svc.getDashboard().pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe(d => { this.dashboard = d; });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}

import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { AppraisalDashboard } from '../../../core/models/appraisal.models';

@Component({
  selector: 'app-client-appraisal-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Performance Appraisals</h1>
          <p class="page-subtitle">Organization-wide appraisal overview and analytics</p>
        </div>
        <div class="flex items-center gap-3">
          <a routerLink="/client/appraisals" class="btn-secondary">All Appraisals</a>
          <a routerLink="/client/appraisal-cycles" class="btn-primary">Manage Cycles</a>
        </div>
      </div>

      <div *ngIf="loading" class="flex items-center justify-center py-20"><div class="spinner"></div></div>

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
            <span class="summary-value text-green-600">{{ dashboard.summary.increment_recommended }}</span>
            <span class="summary-label">Increments</span>
          </div>
          <div class="summary-card">
            <span class="summary-value text-purple-600">{{ dashboard.summary.promotion_recommended }}</span>
            <span class="summary-label">Promotions</span>
          </div>
          <div class="summary-card">
            <span class="summary-value text-red-600">{{ dashboard.summary.pip_count }}</span>
            <span class="summary-label">PIP</span>
          </div>
        </div>

        <!-- Branch Comparison -->
        <div class="table-card mt-6" *ngIf="dashboard.branchSummary.length">
          <h3 class="text-sm font-semibold text-gray-900 mb-4">Branch-wise Performance</h3>
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Total</th>
                  <th>Completed</th>
                  <th>Avg Score</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let b of dashboard.branchSummary" class="data-row">
                  <td class="font-medium">{{ b.branch_name || 'Unassigned' }}</td>
                  <td class="text-center">{{ b.total }}</td>
                  <td class="text-center text-emerald-600 font-medium">{{ b.completed }}</td>
                  <td class="text-center font-semibold" [class.text-emerald-600]="b.avg_score >= 3.5" [class.text-amber-600]="b.avg_score >= 2 && b.avg_score < 3.5" [class.text-red-600]="b.avg_score < 2">
                    {{ b.avg_score || '—' }}
                  </td>
                  <td>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                      <div class="bg-indigo-500 h-2 rounded-full" [style.width.%]="b.total ? (b.completed / b.total * 100) : 0"></div>
                    </div>
                    <span class="text-xs text-gray-400">{{ b.total ? (b.completed / b.total * 100 | number:'1.0-0') : 0 }}%</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <!-- Top Performers -->
          <div class="table-card" *ngIf="dashboard.topPerformers.length">
            <h3 class="text-sm font-semibold text-gray-900 mb-4">Top Performers</h3>
            <div class="space-y-2">
              <div *ngFor="let p of dashboard.topPerformers; let i = index" class="flex items-center justify-between text-sm border-b pb-2">
                <div>
                  <span class="text-gray-400 mr-2">#{{ i + 1 }}</span>
                  <span class="font-medium">{{ p.name }}</span>
                  <span class="text-xs text-gray-400 ml-1">({{ p.employee_code }})</span>
                  <span class="text-xs text-gray-400 ml-1">{{ p.branch_name }}</span>
                </div>
                <span class="font-semibold text-emerald-600">{{ p.total_score }}</span>
              </div>
            </div>
          </div>

          <!-- Low Performers -->
          <div class="table-card" *ngIf="dashboard.lowPerformers.length">
            <h3 class="text-sm font-semibold text-gray-900 mb-4">Low Performers / PIP Watch</h3>
            <div class="space-y-2">
              <div *ngFor="let p of dashboard.lowPerformers; let i = index" class="flex items-center justify-between text-sm border-b pb-2">
                <div>
                  <span class="text-gray-400 mr-2">#{{ i + 1 }}</span>
                  <span class="font-medium">{{ p.name }}</span>
                  <span class="text-xs text-gray-400 ml-1">({{ p.employee_code }})</span>
                  <span class="text-xs text-gray-400 ml-1">{{ p.branch_name }}</span>
                </div>
                <span class="font-semibold text-red-600">{{ p.total_score }}</span>
              </div>
            </div>
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
    .btn-primary {
      display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem;
      background: #4f46e5; color: white; border: none; border-radius: 0.5rem;
      font-size: 0.8125rem; font-weight: 600; cursor: pointer; text-decoration: none; transition: background 0.2s;
    }
    .btn-primary:hover { background: #4338ca; }
    .summary-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
    @media (min-width: 1024px) { .summary-strip { grid-template-columns: repeat(8, 1fr); } }
    @media (max-width: 768px) { .summary-strip { grid-template-columns: repeat(2, 1fr); } }
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
export class ClientAppraisalDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  dashboard: AppraisalDashboard | null = null;

  constructor(private svc: PerformanceAppraisalService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.svc.getDashboard().pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe(d => { this.dashboard = d; });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}

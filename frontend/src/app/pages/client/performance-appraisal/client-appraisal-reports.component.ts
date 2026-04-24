import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { AppraisalCycle } from '../../../core/models/appraisal.models';

@Component({
  selector: 'app-client-appraisal-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Appraisal Reports</h1>
          <p class="page-subtitle">Analytics and reports for performance appraisals</p>
        </div>
        <div class="flex items-center gap-3">
          <a routerLink="/client/appraisal-dashboard" class="btn-secondary">Dashboard</a>
          <button (click)="exportData()" class="btn-secondary">Export Data</button>
        </div>
      </div>

      <!-- Cycle Filter -->
      <div class="table-card mb-6">
        <div class="flex items-end gap-4">
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="r-cycle">Cycle</label>
            <select id="r-cycle" name="cycleId" [(ngModel)]="cycleId" (ngModelChange)="loadAll()" class="filter-select">
              <option value="">All Cycles</option>
              <option *ngFor="let c of cycles" [value]="c.id">{{ c.cycleName }} ({{ c.financialYear }})</option>
            </select>
          </div>
        </div>
      </div>

      <div *ngIf="loading" class="flex items-center justify-center py-20"><div class="spinner"></div></div>

      <ng-container *ngIf="!loading">
        <!-- Branch Summary -->
        <div class="table-card mb-6" *ngIf="branchData.length">
          <h3 class="text-sm font-semibold text-gray-900 mb-4">Branch-wise Summary</h3>
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Total</th>
                  <th>Completed</th>
                  <th>Pending</th>
                  <th>Avg Score</th>
                  <th>Increments</th>
                  <th>Promotions</th>
                  <th>PIP</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let b of branchData" class="data-row">
                  <td class="font-medium">{{ b.branch_name || 'Unassigned' }}</td>
                  <td class="text-center">{{ b.total }}</td>
                  <td class="text-center text-emerald-600">{{ b.completed }}</td>
                  <td class="text-center text-amber-600">{{ b.pending }}</td>
                  <td class="text-center font-semibold">{{ b.avg_score || '—' }}</td>
                  <td class="text-center">{{ b.increment_count }}</td>
                  <td class="text-center">{{ b.promotion_count }}</td>
                  <td class="text-center text-red-600">{{ b.pip_count }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Department Summary -->
        <div class="table-card mb-6" *ngIf="deptData.length">
          <h3 class="text-sm font-semibold text-gray-900 mb-4">Department-wise Summary</h3>
          <div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Total</th>
                  <th>Completed</th>
                  <th>Avg Score</th>
                  <th>Increments</th>
                  <th>Promotions</th>
                  <th>PIP</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let d of deptData" class="data-row">
                  <td class="font-medium">{{ d.department || 'Unassigned' }}</td>
                  <td class="text-center">{{ d.total }}</td>
                  <td class="text-center text-emerald-600">{{ d.completed }}</td>
                  <td class="text-center font-semibold">{{ d.avg_score || '—' }}</td>
                  <td class="text-center">{{ d.increment_count }}</td>
                  <td class="text-center">{{ d.promotion_count }}</td>
                  <td class="text-center text-red-600">{{ d.pip_count }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Recommendations Distribution -->
        <div class="table-card mb-6" *ngIf="recData.length">
          <h3 class="text-sm font-semibold text-gray-900 mb-4">Recommendation Distribution</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div *ngFor="let r of recData" class="border rounded-lg p-4 text-center">
              <div class="text-2xl font-bold" [class.text-emerald-600]="r.recommendation === 'INCREMENT' || r.recommendation === 'PROMOTION'" [class.text-red-600]="r.recommendation === 'PIP'" [class.text-gray-600]="r.recommendation === 'NO_CHANGE'">
                {{ r.count }}
              </div>
              <div class="text-xs text-gray-500 mt-1">{{ r.recommendation?.replace(/_/g, ' ') }}</div>
              <div class="text-xs text-gray-400">Avg Score: {{ r.avg_score || '—' }}</div>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `,
})
export class ClientAppraisalReportsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  cycles: AppraisalCycle[] = [];
  cycleId = '';
  branchData: any[] = [];
  deptData: any[] = [];
  recData: any[] = [];

  constructor(private svc: PerformanceAppraisalService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.svc.getCycles().pipe(takeUntil(this.destroy$)).subscribe(c => { this.cycles = c; this.cdr.markForCheck(); });
    this.loadAll();
  }

  loadAll() {
    this.loading = true; this.cdr.markForCheck();
    const cid = this.cycleId || undefined;
    let done = 0;
    const check = () => { done++; if (done >= 3) { this.loading = false; this.cdr.markForCheck(); } };

    this.svc.getBranchSummary(cid).pipe(takeUntil(this.destroy$)).subscribe(d => { this.branchData = d; check(); });
    this.svc.getDepartmentSummary(cid).pipe(takeUntil(this.destroy$)).subscribe(d => { this.deptData = d; check(); });
    this.svc.getRecommendations(cid).pipe(takeUntil(this.destroy$)).subscribe(d => { this.recData = d; check(); });
  }

  exportData() {
    this.svc.exportAppraisals(this.cycleId || undefined).pipe(takeUntil(this.destroy$)).subscribe(data => {
      const csv = this.toCSV(data);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'appraisal_export.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  private toCSV(data: any[]): string {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}

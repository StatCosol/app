import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { AppraisalCycle } from '../../../core/models/appraisal.models';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  selector: 'app-client-appraisal-reports',
  standalone: true,
  imports: [IconComponent, FormsModule, RouterLink, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../shared/client-theme.scss', './client-appraisal-theme.scss'],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Appraisal Reports"
        subtitle="Analytics and reports for performance appraisals">
        <a routerLink="/client/appraisal-dashboard" class="appraisal-action">Dashboard</a>
        <button [disabled]="loading || !!loadError || exporting" (click)="exportData()" class="compact-action appraisal-action" title="Export Data" aria-label="Export Data" data-action-label="Export Data" data-action-icon="download"><ui-icon name="download" [size]="20" /></button>
      </ui-page-header>

      @if (cyclesError) {
        <div role="alert" class="table-card mb-4 text-red-700">{{ cyclesError }} <button type="button" class="standard-action" (click)="loadCycles()">Retry cycles</button></div>
      }
      @if (exportError) { <div role="alert" class="table-card mb-4 text-red-700">{{ exportError }}</div> }
      <!-- Cycle Filter -->
      <div class="table-card mb-6">
        <div class="flex items-end gap-4">
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="r-cycle">Cycle</label>
            <select [disabled]="!!cyclesError" id="r-cycle" name="cycleId" [(ngModel)]="cycleId" (ngModelChange)="loadAll()" class="filter-select">
              <option value="">All Cycles</option>
              @for (c of cycles; track c) {
<option [value]="c.id">{{ c.cycleName }} ({{ c.financialYear }})</option>
}
            </select>
          </div>
        </div>
      </div>

      @if (loadError) {
        <div role="alert" class="table-card text-red-700">{{ loadError }} <button type="button" class="standard-action" (click)="loadAll()">Retry</button></div>
      }
      @if (!loading && !loadError && !branchData.length && !deptData.length && !recData.length) {
        <div class="table-card text-center py-10 text-gray-500">No appraisal results for the selected cycle.</div>
      }
      @if (loading) {
<div class="flex items-center justify-center py-20"><div class="spinner"></div></div>
}

      @if (!loading && !loadError) {

        <!-- Branch Summary -->
        @if (branchData.length) {
<div class="table-card mb-6">
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
                @for (b of branchData; track b) {
<tr class="data-row">
                  <td class="font-medium">{{ b.branch_name || 'Unassigned' }}</td>
                  <td class="text-center">{{ b.total }}</td>
                  <td class="text-center text-emerald-600">{{ b.completed }}</td>
                  <td class="text-center text-amber-600">{{ b.pending }}</td>
                  <td class="text-center font-semibold">{{ b.avg_score ?? '—' }}</td>
                  <td class="text-center">{{ b.increment_count }}</td>
                  <td class="text-center">{{ b.promotion_count }}</td>
                  <td class="text-center text-red-600">{{ b.pip_count }}</td>
                </tr>
}
              </tbody>
            </table>
          </div>
        </div>
}

        <!-- Department Summary -->
        @if (deptData.length) {
<div class="table-card mb-6">
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
                @for (d of deptData; track d) {
<tr class="data-row">
                  <td class="font-medium">{{ d.department || 'Unassigned' }}</td>
                  <td class="text-center">{{ d.total }}</td>
                  <td class="text-center text-emerald-600">{{ d.completed }}</td>
                  <td class="text-center font-semibold">{{ d.avg_score ?? '—' }}</td>
                  <td class="text-center">{{ d.increment_count }}</td>
                  <td class="text-center">{{ d.promotion_count }}</td>
                  <td class="text-center text-red-600">{{ d.pip_count }}</td>
                </tr>
}
              </tbody>
            </table>
          </div>
        </div>
}

        <!-- Recommendations Distribution -->
        @if (recData.length) {
<div class="table-card mb-6">
          <h3 class="text-sm font-semibold text-gray-900 mb-4">Recommendation Distribution</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            @for (r of recData; track r) {
<div class="border rounded-lg p-4 text-center">
              <div class="text-2xl font-bold" [class.text-emerald-600]="r.recommendation === 'INCREMENT' || r.recommendation === 'PROMOTION'" [class.text-red-600]="r.recommendation === 'PIP'" [class.text-gray-600]="r.recommendation === 'NO_CHANGE'">
                {{ r.count }}
              </div>
              <div class="text-xs text-gray-500 mt-1">{{ r.recommendation?.replace(/_/g, ' ') }}</div>
              <div class="text-xs text-gray-400">Avg Score: {{ r.avg_score ?? '—' }}</div>
            </div>
}
          </div>
        </div>
}

}
    </div>
  `,
})
export class ClientAppraisalReportsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  loadError = '';
  cyclesError = '';
  exportError = '';
  exporting = false;
  private loadVersion = 0;
  private cyclesVersion = 0;
  private exportVersion = 0;
  private destroyed = false;
  cycles: AppraisalCycle[] = [];
  cycleId = '';
  branchData: any[] = [];
  deptData: any[] = [];
  recData: any[] = [];

  constructor(private svc: PerformanceAppraisalService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadCycles();
    this.loadAll();
  }

  loadCycles() {
    const version = ++this.cyclesVersion;
    this.cyclesError = '';
    this.svc.getCycles().pipe(takeUntil(this.destroy$)).subscribe({
      next: cycles => { if (!this.destroyed && version === this.cyclesVersion) { this.cycles = cycles; this.cdr.markForCheck(); } },
      error: () => { if (!this.destroyed && version === this.cyclesVersion) { this.cycles = []; this.cyclesError = 'Appraisal cycles could not be loaded.'; this.cdr.markForCheck(); } },
    });
  }

  loadAll() {
    const version = ++this.loadVersion;
    const current = () => !this.destroyed && version === this.loadVersion;
    ++this.exportVersion;
    this.exporting = false;
    this.exportError = '';
    this.loadError = '';
    this.branchData = []; this.deptData = []; this.recData = [];
    this.loading = true; this.cdr.markForCheck();
    const cid = this.cycleId || undefined;
    forkJoin({branch: this.svc.getBranchSummary(cid), dept: this.svc.getDepartmentSummary(cid), rec: this.svc.getRecommendations(cid)}).pipe(
      takeUntil(this.destroy$),
      finalize(() => { if (current()) { this.loading = false; this.cdr.markForCheck(); } }),
    ).subscribe({
      next: data => { if (current()) { this.branchData = data.branch; this.deptData = data.dept; this.recData = data.rec; this.cdr.markForCheck(); } },
      error: () => { if (current()) { this.loadError = 'Appraisal reports could not be loaded. Retry before relying on summaries.'; this.cdr.markForCheck(); } },
    });
  }

  exportData() {
    if (this.destroyed || this.loading || this.loadError || this.exporting) return;
    const version = ++this.exportVersion, cycle = this.cycleId, load = this.loadVersion;
    const current = () => !this.destroyed && version === this.exportVersion && load === this.loadVersion && cycle === this.cycleId;
    this.exporting = true; this.exportError = ''; this.cdr.markForCheck();
    this.svc.exportAppraisals(cycle || undefined).pipe(
      takeUntil(this.destroy$),
      finalize(() => { if (!this.destroyed && version === this.exportVersion) { this.exporting = false; this.cdr.markForCheck(); } }),
    ).subscribe({
      next: data => {
        if (!current()) return;
        if (!data.length) { this.exportError = 'No appraisals to export for the selected cycle.'; return; }
        this.downloadRows(data);
      },
      error: () => { if (current()) { this.exportError = 'Appraisal export failed. Please try again.'; this.cdr.markForCheck(); } },
    });
  }

  private downloadRows(data: any[]) {
    const blob = new Blob([this.toCSV(data)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'appraisal_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  private toCSV(data: any[]): string {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  ngOnDestroy() { this.destroyed = true; this.destroy$.next(); this.destroy$.complete(); }
}

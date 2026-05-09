import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, takeUntil, finalize } from 'rxjs';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/ui/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import {
  CtcSummaryService,
  CtcConsolidated,
  MonthlyTrendRow,
} from '../../../core/ctc-summary.service';

@Component({
  standalone: true,
  selector: 'app-branch-ctc',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="p-6 space-y-5">
      <ui-page-header title="Branch CTC" subtitle="Monthly and yearly cost-to-company summary for your branch"></ui-page-header>

      <!-- Filters -->
      <div class="flex items-center gap-3">
        <select [(ngModel)]="selectedYear" (change)="load()" class="h-9 rounded border border-gray-300 px-3 text-sm">
          <option *ngFor="let y of years" [value]="y">{{ y }}</option>
        </select>
        <select [(ngModel)]="selectedMonth" (change)="load()" class="h-9 rounded border border-gray-300 px-3 text-sm">
          <option [value]="0">Full Year</option>
          <option *ngFor="let m of months; let i = index" [value]="i + 1">{{ m }}</option>
        </select>
      </div>

      <ui-loading-spinner *ngIf="loading" text="Loading CTC data..."></ui-loading-spinner>

      <ng-container *ngIf="!loading && summary && summary.totalEmployees > 0">
        <!-- KPI Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-2xl font-bold text-gray-900">{{ summary.totalEmployees }}</div>
            <div class="text-xs text-gray-500 mt-1">Total Employees</div>
          </div>
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-2xl font-bold text-blue-700">{{ fmt(summary.grossTotal) }}</div>
            <div class="text-xs text-gray-500 mt-1">Gross Wages</div>
          </div>
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-2xl font-bold text-indigo-700">{{ fmt(summary.employerCostTotal) }}</div>
            <div class="text-xs text-gray-500 mt-1">Employer Contributions</div>
          </div>
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-2xl font-bold text-orange-600">{{ fmt(summary.ptTotal) }}</div>
            <div class="text-xs text-gray-500 mt-1">Professional Tax</div>
          </div>
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-2xl font-bold text-green-700">{{ fmt(summary.monthlyCTC) }}</div>
            <div class="text-xs text-gray-500 mt-1">{{ selectedMonth ? 'Monthly' : 'Period' }} CTC</div>
          </div>
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-2xl font-bold text-emerald-700">{{ fmt(ytdCtc) }}</div>
            <div class="text-xs text-gray-500 mt-1">Year-to-Date CTC</div>
          </div>
        </div>

        <!-- Contribution Breakup -->
        <div class="bg-white rounded-lg border">
          <h3 class="text-sm font-semibold text-gray-800 p-4 pb-2">CTC Breakup</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 border-b">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Component</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Amount (₹)</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr><td class="px-4 py-2">Gross Wages</td><td class="px-4 py-2 text-right font-mono">{{ fmt(summary.grossTotal) }}</td></tr>
                <tr class="bg-blue-50"><td class="px-4 py-2 font-semibold" colspan="2">Employee Deductions</td></tr>
                <ng-container *ngIf="hasComponentBreakdown(summary)">
                  <tr><td class="px-4 py-2 pl-8">PF (Employee)</td><td class="px-4 py-2 text-right font-mono">{{ fmt(summary.pfEmployee) }}</td></tr>
                  <tr><td class="px-4 py-2 pl-8">ESI (Employee)</td><td class="px-4 py-2 text-right font-mono">{{ fmt(summary.esiEmployee) }}</td></tr>
                  <tr><td class="px-4 py-2 pl-8">Professional Tax</td><td class="px-4 py-2 text-right font-mono">{{ fmt(summary.ptTotal) }}</td></tr>
                </ng-container>
                <ng-container *ngIf="!hasComponentBreakdown(summary)">
                  <tr><td class="px-4 py-2 pl-8">Total Employee Deductions</td><td class="px-4 py-2 text-right font-mono">{{ fmt(summary.grossTotal - summary.netPayTotal) }}</td></tr>
                  <tr><td class="px-4 py-2 pl-8 text-xs text-gray-400 italic" colspan="2">PF / ESI / PT breakdown unavailable for this payroll run</td></tr>
                </ng-container>
                <tr><td class="px-4 py-2 font-semibold">Net Pay</td><td class="px-4 py-2 text-right font-mono font-semibold">{{ fmt(summary.netPayTotal) }}</td></tr>
                <tr class="bg-indigo-50"><td class="px-4 py-2 font-semibold" colspan="2">Employer Contributions</td></tr>
                <ng-container *ngIf="hasEmployerBreakdown(summary)">
                  <tr><td class="px-4 py-2 pl-8">PF (Employer)</td><td class="px-4 py-2 text-right font-mono">{{ fmt(summary.pfEmployer) }}</td></tr>
                  <tr><td class="px-4 py-2 pl-8">ESI (Employer)</td><td class="px-4 py-2 text-right font-mono">{{ fmt(summary.esiEmployer) }}</td></tr>
                  <tr><td class="px-4 py-2 pl-8">Bonus Provision</td><td class="px-4 py-2 text-right font-mono">{{ fmt(summary.bonusTotal) }}</td></tr>
                  <tr><td class="px-4 py-2 pl-8">Other Employer Cost</td><td class="px-4 py-2 text-right font-mono">{{ fmt(summary.otherEmployerCost) }}</td></tr>
                </ng-container>
                <ng-container *ngIf="!hasEmployerBreakdown(summary)">
                  <tr><td class="px-4 py-2 pl-8">Total Employer Contributions</td><td class="px-4 py-2 text-right font-mono">{{ fmt(summary.employerCostTotal) }}</td></tr>
                  <tr><td class="px-4 py-2 pl-8 text-xs text-gray-400 italic" colspan="2">PF (Employer) / ESI (Employer) / Bonus breakdown unavailable for this payroll run</td></tr>
                </ng-container>
                <tr><td class="px-4 py-2 font-semibold">Total Employer Cost</td><td class="px-4 py-2 text-right font-mono font-semibold">{{ fmt(summary.employerCostTotal) }}</td></tr>
                <tr class="bg-green-50 font-bold text-base">
                  <td class="px-4 py-3">Monthly CTC</td>
                  <td class="px-4 py-3 text-right font-mono">{{ fmt(summary.monthlyCTC) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Monthly Trend -->
        <div class="bg-white rounded-lg border" *ngIf="trend.length">
          <h3 class="text-sm font-semibold text-gray-800 p-4 pb-2">Month-wise Trend ({{ selectedYear }})</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 border-b">
                <tr>
                  <th class="text-left px-4 py-2 font-medium text-gray-600">Month</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Employees</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Gross</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Employer Cost</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">Net Pay</th>
                  <th class="text-right px-4 py-2 font-medium text-gray-600">CTC</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr *ngFor="let t of trend">
                  <td class="px-4 py-2">{{ months[+t.month - 1] }}</td>
                  <td class="px-4 py-2 text-right">{{ t.total_employees }}</td>
                  <td class="px-4 py-2 text-right font-mono">{{ fmt(t.gross_total) }}</td>
                  <td class="px-4 py-2 text-right font-mono">{{ fmt(t.employer_cost_total) }}</td>
                  <td class="px-4 py-2 text-right font-mono">{{ fmt(t.net_pay_total) }}</td>
                  <td class="px-4 py-2 text-right font-mono font-semibold">{{ fmt(t.monthly_ctc) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ng-container>

      <ui-empty-state *ngIf="!loading && (!summary || summary.totalEmployees === 0)"
        title="No payroll data"
        description="No finalized payroll runs found for this period.">
      </ui-empty-state>
    </div>
  `,
})
export class BranchCtcComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = false;

  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;
  years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  summary: CtcConsolidated | null = null;
  ytdCtc = 0;
  trend: MonthlyTrendRow[] = [];

  constructor(private ctcApi: CtcSummaryService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  load() {
    this.loading = true;
    const m = +this.selectedMonth || undefined;

    forkJoin({
      data: this.ctcApi.branchSummary(this.selectedYear, m),
      ytd: this.ctcApi.branchYtd(this.selectedYear),
      trend: this.ctcApi.branchTrend(this.selectedYear),
    })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: ({ data, ytd, trend }) => {
          this.summary = data.summary;
          this.ytdCtc = ytd.monthlyCTC;
          this.trend = trend;
          this.cdr.detectChanges();
        },
        error: () => {
          this.summary = null;
          this.trend = [];
          this.cdr.detectChanges();
        },
      });
  }

  fmt(v: number | string): string {
    const n = Number(v) || 0;
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  hasComponentBreakdown(s: CtcConsolidated): boolean {
    return (s.pfEmployee + s.esiEmployee + s.ptTotal) > 0;
  }

  hasEmployerBreakdown(s: CtcConsolidated): boolean {
    return (s.pfEmployer + s.esiEmployer + s.bonusTotal) > 0;
  }
}

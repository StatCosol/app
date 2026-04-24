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
  CtcBranchRow,
  MonthlyTrendRow,
} from '../../../core/ctc-summary.service';

@Component({
  standalone: true,
  selector: 'app-client-ctc-summary',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="p-6 space-y-5">
      <ui-page-header title="CTC Summary"
        subtitle="Consolidated cost-to-company across all branches — monthly and yearly view">
      </ui-page-header>

      <!-- Filters -->
      <div class="flex items-center gap-3 flex-wrap">
        <select [(ngModel)]="selectedYear" (change)="load()" class="h-9 rounded border border-gray-300 px-3 text-sm">
          <option *ngFor="let y of years" [value]="y">{{ y }}</option>
        </select>
        <select [(ngModel)]="selectedMonth" (change)="load()" class="h-9 rounded border border-gray-300 px-3 text-sm">
          <option [value]="0">Full Year</option>
          <option *ngFor="let m of monthNames; let i = index" [value]="i + 1">{{ m }}</option>
        </select>
      </div>

      <ui-loading-spinner *ngIf="loading" text="Loading CTC data..."></ui-loading-spinner>

      <ng-container *ngIf="!loading && consolidated && consolidated.totalEmployees > 0">
        <!-- Top KPI Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-2xl font-bold text-gray-900">{{ consolidated.totalEmployees }}</div>
            <div class="text-xs text-gray-500 mt-1">Total Employees</div>
          </div>
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-xl font-bold text-blue-700">{{ fmt(consolidated.grossTotal) }}</div>
            <div class="text-xs text-gray-500 mt-1">Gross Wages</div>
          </div>
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-xl font-bold text-violet-700">{{ fmt(consolidated.pfEmployer) }}</div>
            <div class="text-xs text-gray-500 mt-1">Employer PF</div>
          </div>
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-xl font-bold text-indigo-700">{{ fmt(consolidated.esiEmployer) }}</div>
            <div class="text-xs text-gray-500 mt-1">Employer ESI</div>
          </div>
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-xl font-bold text-orange-600">{{ fmt(consolidated.ptTotal) }}</div>
            <div class="text-xs text-gray-500 mt-1">PT</div>
          </div>
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-xl font-bold text-green-700">{{ fmt(consolidated.monthlyCTC) }}</div>
            <div class="text-xs text-gray-500 mt-1">{{ selectedMonth ? 'Monthly' : 'Period' }} CTC</div>
          </div>
          <div class="bg-white rounded-lg border p-4 text-center">
            <div class="text-xl font-bold text-emerald-700">{{ fmt(ytdCtc) }}</div>
            <div class="text-xs text-gray-500 mt-1">Year-to-Date CTC</div>
          </div>
        </div>

        <!-- Consolidated Breakup -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Employee Side -->
          <div class="bg-white rounded-lg border">
            <h3 class="text-sm font-semibold text-gray-800 p-4 pb-2">Employee Side</h3>
            <table class="w-full text-sm">
              <tbody class="divide-y">
                <tr><td class="px-4 py-2">Gross Salary</td><td class="px-4 py-2 text-right font-mono">{{ fmt(consolidated.grossTotal) }}</td></tr>
                <tr><td class="px-4 py-2">PF (Employee)</td><td class="px-4 py-2 text-right font-mono">{{ fmt(consolidated.pfEmployee) }}</td></tr>
                <tr><td class="px-4 py-2">ESI (Employee)</td><td class="px-4 py-2 text-right font-mono">{{ fmt(consolidated.esiEmployee) }}</td></tr>
                <tr><td class="px-4 py-2">PT Deduction</td><td class="px-4 py-2 text-right font-mono">{{ fmt(consolidated.ptTotal) }}</td></tr>
                <tr class="bg-gray-50 font-semibold"><td class="px-4 py-2">Net Pay</td><td class="px-4 py-2 text-right font-mono">{{ fmt(consolidated.netPayTotal) }}</td></tr>
              </tbody>
            </table>
          </div>
          <!-- Employer Side -->
          <div class="bg-white rounded-lg border">
            <h3 class="text-sm font-semibold text-gray-800 p-4 pb-2">Employer Side</h3>
            <table class="w-full text-sm">
              <tbody class="divide-y">
                <tr><td class="px-4 py-2">PF (Employer)</td><td class="px-4 py-2 text-right font-mono">{{ fmt(consolidated.pfEmployer) }}</td></tr>
                <tr><td class="px-4 py-2">ESI (Employer)</td><td class="px-4 py-2 text-right font-mono">{{ fmt(consolidated.esiEmployer) }}</td></tr>
                <tr><td class="px-4 py-2">Bonus Provision</td><td class="px-4 py-2 text-right font-mono">{{ fmt(consolidated.bonusTotal) }}</td></tr>
                <tr><td class="px-4 py-2">Other Employer Cost</td><td class="px-4 py-2 text-right font-mono">{{ fmt(consolidated.otherEmployerCost) }}</td></tr>
                <tr class="bg-indigo-50 font-semibold"><td class="px-4 py-2">Total Employer Cost</td><td class="px-4 py-2 text-right font-mono">{{ fmt(consolidated.employerCostTotal) }}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Final Totals -->
        <div class="bg-green-50 border border-green-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div class="text-sm text-green-800 font-medium">{{ selectedMonth ? 'Monthly' : 'Period' }} Total CTC</div>
            <div class="text-3xl font-bold text-green-900">{{ fmt(consolidated.monthlyCTC) }}</div>
          </div>
          <div>
            <div class="text-sm text-green-800 font-medium">Annual Total CTC (Projected)</div>
            <div class="text-3xl font-bold text-green-900">{{ fmt(consolidated.annualCTC) }}</div>
          </div>
          <div>
            <div class="text-sm text-green-800 font-medium">Year-to-Date CTC</div>
            <div class="text-3xl font-bold text-green-900">{{ fmt(ytdCtc) }}</div>
          </div>
        </div>

        <!-- Branch-wise Table -->
        <div class="bg-white rounded-lg border" *ngIf="branches.length">
          <h3 class="text-sm font-semibold text-gray-800 p-4 pb-2">Branch-wise CTC</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 border-b">
                <tr>
                  <th class="text-left px-3 py-2 font-medium text-gray-600">Branch</th>
                  <th class="text-right px-3 py-2 font-medium text-gray-600">Employees</th>
                  <th class="text-right px-3 py-2 font-medium text-gray-600">Gross Wages</th>
                  <th class="text-right px-3 py-2 font-medium text-gray-600">PF (ER)</th>
                  <th class="text-right px-3 py-2 font-medium text-gray-600">ESI (ER)</th>
                  <th class="text-right px-3 py-2 font-medium text-gray-600">PT</th>
                  <th class="text-right px-3 py-2 font-medium text-gray-600">Other ER Cost</th>
                  <th class="text-right px-3 py-2 font-medium text-gray-600 bg-green-50">Total CTC</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr *ngFor="let b of branches">
                  <td class="px-3 py-2 font-medium">{{ b.branch_name }}</td>
                  <td class="px-3 py-2 text-right">{{ b.total_employees }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ fmt(b.gross_total) }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ fmt(b.pf_employer) }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ fmt(b.esi_employer) }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ fmt(b.pt_total) }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ fmt(b.other_employer_cost) }}</td>
                  <td class="px-3 py-2 text-right font-mono font-bold bg-green-50">{{ fmt(b.monthly_ctc) }}</td>
                </tr>
              </tbody>
              <tfoot class="bg-gray-100 font-semibold border-t-2">
                <tr>
                  <td class="px-3 py-2">Total</td>
                  <td class="px-3 py-2 text-right">{{ consolidated.totalEmployees }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ fmt(consolidated.grossTotal) }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ fmt(consolidated.pfEmployer) }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ fmt(consolidated.esiEmployer) }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ fmt(consolidated.ptTotal) }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ fmt(consolidated.otherEmployerCost) }}</td>
                  <td class="px-3 py-2 text-right font-mono font-bold bg-green-50">{{ fmt(consolidated.monthlyCTC) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Monthly Trend -->
        <div class="bg-white rounded-lg border" *ngIf="trend.length">
          <h3 class="text-sm font-semibold text-gray-800 p-4 pb-2">Month-wise CTC Trend ({{ selectedYear }})</h3>
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
                  <td class="px-4 py-2">{{ monthNames[+t.month - 1] }}</td>
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

      <ui-empty-state *ngIf="!loading && (!consolidated || consolidated.totalEmployees === 0)"
        title="No payroll data"
        description="No finalized payroll runs found for this period.">
      </ui-empty-state>
    </div>
  `,
})
export class ClientCtcSummaryComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = false;

  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;
  years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  consolidated: CtcConsolidated | null = null;
  branches: CtcBranchRow[] = [];
  ytdCtc = 0;
  trend: MonthlyTrendRow[] = [];

  constructor(private ctcApi: CtcSummaryService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  load() {
    this.loading = true;
    const m = +this.selectedMonth || undefined;

    forkJoin({
      data: this.ctcApi.clientSummary(this.selectedYear, m),
      ytd: this.ctcApi.clientYtd(this.selectedYear),
      trend: this.ctcApi.clientTrend(this.selectedYear),
    })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: ({ data, ytd, trend }) => {
          this.consolidated = data.consolidated;
          this.branches = data.branches;
          this.ytdCtc = ytd.monthlyCTC;
          this.trend = trend;
          this.cdr.detectChanges();
        },
        error: () => {
          this.consolidated = null;
          this.branches = [];
          this.trend = [];
          this.cdr.detectChanges();
        },
      });
  }

  fmt(v: number | string): string {
    const n = Number(v) || 0;
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}

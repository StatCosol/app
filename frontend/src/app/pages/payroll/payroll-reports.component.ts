import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { PageHeaderComponent, ActionButtonComponent, EmptyStateComponent } from '../../shared/ui';
import { ToastService } from '../../shared/toast/toast.service';
import { environment } from '../../../environments/environment';
import { PayrollApiService, PayrollClient } from './payroll-api.service';

interface ReportCard {
  key: string;
  title: string;
  description: string;
  icon: string;
  endpoint: string;
  format: 'csv';
}

@Component({
  selector: 'app-payroll-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, ActionButtonComponent, EmptyStateComponent],
  template: `
    <div class="page">
      <ui-page-header
        title="Payroll Reports"
        description="Generate and download payroll reports for compliance and record-keeping.">
      </ui-page-header>

      <div class="bg-white rounded-2xl border border-gray-100 shadow-card p-4 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label class="block text-xs text-gray-600 mb-1">Client</label>
            <select [(ngModel)]="selectedClientId" class="input-sm w-full">
              <option value="">All Assigned Clients</option>
              <option *ngFor="let c of clients" [value]="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-600 mb-1">Year</label>
            <select [(ngModel)]="selectedYear" class="input-sm w-full">
              <option *ngFor="let y of yearOptions" [ngValue]="y">{{ y }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-600 mb-1">Month</label>
            <select [(ngModel)]="selectedMonth" class="input-sm w-full">
              <option [ngValue]="0">All months</option>
              <option *ngFor="let m of monthOptions" [ngValue]="m.value">{{ m.label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-600 mb-1">Financial Year</label>
            <input
              [(ngModel)]="selectedFinancialYear"
              class="input-sm w-full"
              placeholder="2025-26" />
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div *ngFor="let report of reports"
             class="bg-white rounded-2xl border border-gray-100 shadow-card p-6 flex flex-col gap-4"
             style="animation: fadeUp 0.4s ease-out both">

          <!-- Icon & Title -->
          <div class="flex items-start gap-4">
            <div class="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                 [ngClass]="{
                   'bg-blue-50 text-blue-600': report.key === 'bank-statement',
                   'bg-emerald-50 text-emerald-600': report.key === 'muster-roll',
                   'bg-amber-50 text-amber-600': report.key === 'cost-analysis',
                   'bg-purple-50 text-purple-600': report.key === 'form16'
                 }">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path *ngIf="report.icon === 'table'" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M3 10h18M3 14h18M9 4v16M15 4v16M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"/>
                <path *ngIf="report.icon === 'shield'" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                <path *ngIf="report.icon === 'calculator'" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                <path *ngIf="report.icon === 'document'" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-base font-semibold text-gray-900">{{ report.title }}</h3>
              <p class="text-sm text-gray-500 mt-1 leading-relaxed">{{ report.description }}</p>
            </div>
          </div>

          <!-- Actions -->
          <div class="mt-auto flex gap-3 pt-2">
            <ui-button variant="primary" size="sm"
                       [loading]="downloading[report.key]"
                       (clicked)="downloadReport(report)">
              Download
            </ui-button>
          </div>
        </div>
      </div>

      <ui-empty-state
        *ngIf="reports.length === 0"
        title="No Reports Available"
        description="Report types will appear here once configured.">
      </ui-empty-state>
    </div>
  `,
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
    .input-sm { border: 1px solid #d1d5db; border-radius: 0.5rem; padding: 0.375rem 0.75rem; font-size: 0.875rem; }
  `],
})
export class PayrollReportsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  clients: PayrollClient[] = [];
  selectedClientId = '';
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;
  selectedFinancialYear = this.currentFinancialYear();

  readonly yearOptions = this.buildYearOptions();
  readonly monthOptions = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  reports: ReportCard[] = [
    {
      key: 'bank-statement',
      title: 'Bank Statement',
      description: 'Salary disbursement bank statement with payable rows for selected period.',
      icon: 'table',
      endpoint: `${environment.apiBaseUrl}/api/v1/payroll/reports/bank-statement`,
      format: 'csv',
    },
    {
      key: 'muster-roll',
      title: 'Muster Roll',
      description: 'Attendance and payroll muster snapshot for compliance review.',
      icon: 'shield',
      endpoint: `${environment.apiBaseUrl}/api/v1/payroll/reports/muster-roll`,
      format: 'csv',
    },
    {
      key: 'cost-analysis',
      title: 'Cost Analysis',
      description: 'Branch and client-level cost distribution for the selected year.',
      icon: 'calculator',
      endpoint: `${environment.apiBaseUrl}/api/v1/payroll/reports/cost-analysis`,
      format: 'csv',
    },
    {
      key: 'form16',
      title: 'Form 16 / TDS Summary',
      description: 'Financial-year TDS summary extract for employee tax reporting.',
      icon: 'document',
      endpoint: `${environment.apiBaseUrl}/api/v1/payroll/reports/form16`,
      format: 'csv',
    },
  ];

  downloading: Record<string, boolean> = {};

  constructor(
    private http: HttpClient,
    private payrollApi: PayrollApiService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.payrollApi
      .getAssignedClients()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => {
          this.clients = rows || [];
        },
        error: () => {
          this.clients = [];
        },
      });
  }

  downloadReport(report: ReportCard): void {
    this.downloading[report.key] = true;

    this.http
      .get(report.endpoint, {
        params: this.buildQueryParams(report.key),
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.downloading[report.key] = false;
        }),
      )
      .subscribe({
        next: (response) => {
          const blob = response.body;
          if (!blob) {
            this.toast.error('Download Failed', `Empty response received for ${report.title}.`);
            return;
          }

          const fileName =
            this.extractFileName(response.headers.get('content-disposition')) ||
            `${report.key}-${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}.${report.format}`;

          const url = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = fileName;
          anchor.click();
          window.URL.revokeObjectURL(url);
          this.toast.success('Download Started', `${report.title} download started.`);
        },
        error: (err) => {
          this.toast.error('Download Failed', err?.error?.message || `Failed to download ${report.title}.`);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private buildQueryParams(reportKey: string): Record<string, string> {
    const params: Record<string, string> = {};

    if (this.selectedClientId) params['clientId'] = this.selectedClientId;

    if (reportKey === 'bank-statement' || reportKey === 'muster-roll') {
      params['year'] = String(this.selectedYear);
      if (this.selectedMonth > 0) params['month'] = String(this.selectedMonth);
      return params;
    }

    if (reportKey === 'cost-analysis') {
      params['year'] = String(this.selectedYear);
      return params;
    }

    if (reportKey === 'form16') {
      params['financialYear'] =
        this.selectedFinancialYear.trim() || this.currentFinancialYear();
      return params;
    }

    return params;
  }

  private extractFileName(disposition: string | null): string | null {
    if (!disposition) return null;
    const match = /filename="?([^"]+)"?/i.exec(disposition);
    return match?.[1] || null;
  }

  private buildYearOptions(): number[] {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }

  private currentFinancialYear(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    if (month >= 4) {
      return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
    }
    return `${year - 1}-${String(year % 100).padStart(2, '0')}`;
  }
}

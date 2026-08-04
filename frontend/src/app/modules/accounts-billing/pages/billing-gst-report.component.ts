import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BillingClient,
  BillingReportColumn,
  BillingReportResult,
  BillingReportType,
  INVOICE_STATUSES,
} from '../models/billing.models';
import { AccountsBillingService } from '../services/accounts-billing.service';

interface ReportOption {
  value: BillingReportType;
  label: string;
  description: string;
}

@Component({
  selector: 'app-billing-gst-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 space-y-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-blue-700">
            Accounts & Billing
          </p>
          <h1 class="text-2xl font-bold text-slate-800">Advanced Billing Reports</h1>
          <p class="text-sm text-slate-500 mt-1 max-w-3xl">
            Client-wise GST, invoice, collection and receivable reports with complete Excel exports.
          </p>
        </div>
        <button
          type="button"
          (click)="exportExcel()"
          [disabled]="loading || exporting || !report"
          class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
        >
          {{ exporting ? 'Preparing Excel...' : 'Download Excel' }}
        </button>
      </div>

      <section class="bg-white border rounded-xl shadow-sm p-5 space-y-4">
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label class="block">
            <span class="block text-xs font-medium text-slate-600 mb-1">Report</span>
            <select
              [(ngModel)]="reportType"
              (ngModelChange)="onReportTypeChange()"
              class="w-full px-3 py-2 border rounded-lg text-sm"
            >
              @for (option of reportOptions; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </label>
          <label class="block">
            <span class="block text-xs font-medium text-slate-600 mb-1">From Date</span>
            <input
              [(ngModel)]="fromDate"
              type="date"
              class="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </label>
          <label class="block">
            <span class="block text-xs font-medium text-slate-600 mb-1">To Date</span>
            <input
              [(ngModel)]="toDate"
              type="date"
              class="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </label>
          <label class="block">
            <span class="block text-xs font-medium text-slate-600 mb-1">Client</span>
            <select [(ngModel)]="clientId" class="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">All clients</option>
              @for (client of clients; track client.id) {
                <option [value]="client.id">{{ client.legalName }}</option>
              }
            </select>
          </label>
          <label class="block">
            <span class="block text-xs font-medium text-slate-600 mb-1">Invoice Status</span>
            <select [(ngModel)]="invoiceStatus" class="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">All applicable statuses</option>
              @for (status of invoiceStatuses; track status) {
                <option [value]="status">{{ status }}</option>
              }
            </select>
          </label>
          <label class="block">
            <span class="block text-xs font-medium text-slate-600 mb-1">SAC / HSN</span>
            <input
              [(ngModel)]="sacCode"
              placeholder="Filter code"
              class="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </label>
          <label class="block md:col-span-2">
            <span class="block text-xs font-medium text-slate-600 mb-1">Search</span>
            <input
              [(ngModel)]="search"
              (keyup.enter)="load()"
              placeholder="Invoice, client, GSTIN, description or SAC/HSN"
              class="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </label>
        </div>

        <div class="flex items-center gap-2 flex-wrap border-t pt-4">
          <button
            type="button"
            (click)="setThisMonth()"
            class="px-3 py-1.5 border rounded-lg text-xs hover:bg-slate-50"
          >
            This month
          </button>
          <button
            type="button"
            (click)="setLastMonth()"
            class="px-3 py-1.5 border rounded-lg text-xs hover:bg-slate-50"
          >
            Last month
          </button>
          <button
            type="button"
            (click)="setFinancialYear()"
            class="px-3 py-1.5 border rounded-lg text-xs hover:bg-slate-50"
          >
            This FY
          </button>
          <button
            type="button"
            (click)="clearOptionalFilters()"
            class="px-3 py-1.5 border rounded-lg text-xs hover:bg-slate-50"
          >
            Clear filters
          </button>
          <button
            type="button"
            (click)="load()"
            [disabled]="loading"
            class="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {{ loading ? 'Generating...' : 'Generate Report' }}
          </button>
        </div>

        <div class="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-900">
          <strong>{{ selectedOption.label }}:</strong> {{ selectedOption.description }}
          @if (reportType === 'GST_DETAIL') {
            <span class="block mt-1 text-xs text-blue-700">
              Proforma, draft and cancelled documents are excluded. Only issued Tax Invoices are
              included.
            </span>
          }
        </div>
      </section>

      @if (error) {
        <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {{ error }}
        </div>
      }

      @if (report && !loading) {
        <section class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          @for (card of summaryCards; track card.key) {
            <div class="bg-white rounded-xl border p-4 shadow-sm">
              <p class="text-xs text-slate-500">{{ card.label }}</p>
              <p class="text-lg font-bold text-slate-800 mt-1">{{ card.value }}</p>
            </div>
          }
        </section>

        <section class="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div class="flex items-center justify-between gap-3 px-4 py-3 border-b">
            <div>
              <h2 class="font-semibold text-slate-800">{{ report.title }}</h2>
              <p class="text-xs text-slate-500">
                {{ report.rows.length }} rows · generated {{ report.generatedAt | date: 'medium' }}
              </p>
            </div>
            <span class="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600"
              >Excel exports all filtered rows</span
            >
          </div>
          <div class="overflow-auto max-h-[65vh]">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 uppercase text-xs sticky top-0 z-10">
                <tr>
                  @for (column of report.columns; track column.key) {
                    <th
                      class="px-3 py-3 whitespace-nowrap"
                      [class.text-right]="isNumeric(column)"
                      [class.text-left]="!isNumeric(column)"
                    >
                      {{ column.label }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody class="divide-y">
                @for (row of report.rows; track $index) {
                  <tr class="hover:bg-slate-50">
                    @for (column of report.columns; track column.key) {
                      <td
                        class="px-3 py-2 align-top"
                        [class.text-right]="isNumeric(column)"
                        [class.font-mono]="
                          column.key === 'invoiceNumber' || column.key === 'sacHsn'
                        "
                        [class.max-w-md]="
                          column.key === 'invoiceDescription' || column.key === 'descriptions'
                        "
                      >
                        {{ displayValue(row[column.key], column) }}
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr>
                    <td
                      [attr.colspan]="report.columns.length"
                      class="px-4 py-10 text-center text-slate-400"
                    >
                      No records match the selected filters.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
})
export class BillingGstReportComponent implements OnInit {
  readonly reportOptions: ReportOption[] = [
    {
      value: 'GST_DETAIL',
      label: 'GST Invoice Detail',
      description:
        'Line-level taxable invoice register with GSTIN, description, SAC/HSN and tax split.',
    },
    {
      value: 'CLIENT_SUMMARY',
      label: 'Client-wise Summary',
      description:
        'Client totals for invoices, taxable value, GST, billing, collections and outstanding.',
    },
    {
      value: 'INVOICE_REGISTER',
      label: 'Invoice Register',
      description:
        'Complete invoice register including type, status, payment status, description and SAC/HSN.',
    },
    {
      value: 'OUTSTANDING',
      label: 'Pending & Aging',
      description:
        'Tax invoices with an outstanding balance, overdue days and receivable aging buckets.',
    },
    {
      value: 'PAID',
      label: 'Paid Invoices',
      description: 'Fully paid Tax Invoices with billed and collected values for reconciliation.',
    },
  ];
  readonly invoiceStatuses = INVOICE_STATUSES;

  reportType: BillingReportType = 'GST_DETAIL';
  fromDate = '';
  toDate = '';
  clientId = '';
  invoiceStatus = '';
  sacCode = '';
  search = '';
  clients: BillingClient[] = [];
  report: BillingReportResult | null = null;
  loading = false;
  exporting = false;
  error = '';

  constructor(
    private readonly svc: AccountsBillingService,
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.setFinancialYear(false);
    this.svc.getActiveClients().subscribe({
      next: (clients) => this.updateView(() => (this.clients = clients || [])),
      error: () => this.updateView(() => (this.clients = [])),
    });
    this.load();
  }

  get selectedOption(): ReportOption {
    return (
      this.reportOptions.find((option) => option.value === this.reportType) || this.reportOptions[0]
    );
  }

  get summaryCards(): Array<{ key: string; label: string; value: string }> {
    if (!this.report) return [];
    return Object.entries(this.report.summary)
      .slice(0, 6)
      .map(([key, value]) => ({
        key,
        label: this.humanize(key),
        value: key.toLowerCase().includes('count')
          ? this.number(value)
          : `₹${this.currency(value)}`,
      }));
  }

  onReportTypeChange(): void {
    this.invoiceStatus = '';
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.svc.getBillingReport(this.params()).subscribe({
      next: (report) =>
        this.updateView(() => {
          this.report = report;
          this.loading = false;
        }),
      error: (error) =>
        this.updateView(() => {
          this.report = null;
          this.loading = false;
          this.error = error?.error?.message || 'Could not generate the billing report.';
        }),
    });
  }

  exportExcel(): void {
    if (this.exporting) return;
    this.exporting = true;
    this.error = '';
    this.svc.downloadBillingReport(this.params()).subscribe({
      next: (response) => {
        const disposition = response.headers.get('content-disposition') || '';
        const fileName =
          disposition.match(/filename="?([^";]+)"?/i)?.[1] ||
          `${this.reportType.toLowerCase().replace(/_/g, '-')}.xlsx`;
        const url = URL.createObjectURL(response.body || new Blob());
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
        this.updateView(() => (this.exporting = false));
      },
      error: (error) =>
        this.updateView(() => {
          this.exporting = false;
          this.error = error?.error?.message || 'Could not download the Excel report.';
        }),
    });
  }

  setThisMonth(reload = true): void {
    const today = new Date();
    this.fromDate = this.iso(new Date(today.getFullYear(), today.getMonth(), 1));
    this.toDate = this.iso(today);
    if (reload) this.load();
  }

  setLastMonth(): void {
    const today = new Date();
    this.fromDate = this.iso(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    this.toDate = this.iso(new Date(today.getFullYear(), today.getMonth(), 0));
    this.load();
  }

  setFinancialYear(reload = true): void {
    const today = new Date();
    const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    this.fromDate = `${year}-04-01`;
    this.toDate = this.iso(today);
    if (reload) this.load();
  }

  clearOptionalFilters(): void {
    this.clientId = '';
    this.invoiceStatus = '';
    this.sacCode = '';
    this.search = '';
    this.load();
  }

  isNumeric(column: BillingReportColumn): boolean {
    return ['currency', 'number', 'percent'].includes(column.type || '');
  }

  displayValue(value: unknown, column: BillingReportColumn): string {
    if (value == null || value === '') return '—';
    if (column.type === 'currency') return `₹${this.currency(value)}`;
    if (column.type === 'percent') return `${this.number(value)}%`;
    if (column.type === 'number') return this.number(value);
    return String(value).replace(/_/g, ' ');
  }

  private params(): Record<string, string> {
    const params: Record<string, string> = { reportType: this.reportType };
    if (this.fromDate) params['fromDate'] = this.fromDate;
    if (this.toDate) params['toDate'] = this.toDate;
    if (this.clientId) params['clientId'] = this.clientId;
    if (this.invoiceStatus) params['invoiceStatus'] = this.invoiceStatus;
    if (this.sacCode.trim()) params['sacCode'] = this.sacCode.trim();
    if (this.search.trim()) params['search'] = this.search.trim();
    return params;
  }

  private updateView(update: () => void): void {
    this.zone.run(() => {
      update();
      this.cdr.markForCheck();
    });
  }

  private currency(value: unknown): string {
    return (+value! || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private number(value: unknown): string {
    return (+value! || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  private humanize(value: string): string {
    return value
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private iso(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

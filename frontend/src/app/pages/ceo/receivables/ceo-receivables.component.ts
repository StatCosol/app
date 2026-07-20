import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CeoReceivables, SalesService } from '../../../modules/sales/sales.service';

@Component({
  selector: 'app-ceo-receivables',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-5">
      <div>
        <h2 class="text-2xl font-bold text-gray-900">Accounts Receivable</h2>
        <p class="text-sm text-gray-500">Outstanding invoices and aging across all billing clients.</p>
      </div>

      @if (loading) {
<div class="text-center text-gray-500 py-8">Loading…</div>
}

      @if (!loading && data) {
<div class="space-y-5">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs uppercase text-gray-500">Open Invoices</div>
            <div class="text-2xl font-bold text-gray-900 mt-1">{{ data.totals.openInvoices }}</div>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs uppercase text-gray-500">Outstanding</div>
            <div class="text-2xl font-bold text-emerald-700 mt-1">₹ {{ data.totals.outstanding | number:'1.0-0' }}</div>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs uppercase text-gray-500">Overdue Amount</div>
            <div class="text-2xl font-bold text-red-600 mt-1">₹ {{ data.totals.overdueAmount | number:'1.0-0' }}</div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-gray-200">
          <div class="px-5 py-3 border-b font-semibold">Aging Buckets</div>
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th class="text-left px-4 py-2">Bucket</th>
                <th class="text-right px-4 py-2">Invoices</th>
                <th class="text-right px-4 py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              @for (b of data.buckets; track b) {
<tr class="border-t border-gray-100">
                <td class="px-4 py-2 font-medium" [class]="bucketColor(b.bucket)">{{ bucketLabel(b.bucket) }}</td>
                <td class="px-4 py-2 text-right">{{ b.invoiceCount }}</td>
                <td class="px-4 py-2 text-right">₹ {{ b.balance | number:'1.0-0' }}</td>
              </tr>
}
            </tbody>
          </table>
        </div>

        <div class="bg-white rounded-xl border border-gray-200">
          <div class="px-5 py-3 border-b font-semibold">Top 25 Clients by Outstanding</div>
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th class="text-left px-4 py-2">Client</th>
                <th class="text-right px-4 py-2">Invoices</th>
                <th class="text-right px-4 py-2">Outstanding</th>
                <th class="text-right px-4 py-2">Overdue</th>
              </tr>
            </thead>
            <tbody>
              @for (c of data.topClients; track c) {
<tr class="border-t border-gray-100">
                <td class="px-4 py-2 font-medium text-gray-900">{{ c.clientName || '—' }}</td>
                <td class="px-4 py-2 text-right">{{ c.invoiceCount }}</td>
                <td class="px-4 py-2 text-right text-emerald-700">₹ {{ c.outstanding | number:'1.0-0' }}</td>
                <td class="px-4 py-2 text-right text-red-600">₹ {{ c.overdue | number:'1.0-0' }}</td>
              </tr>
}
              @if (data.topClients.length === 0) {
<tr>
                <td colspan="4" class="px-4 py-6 text-center text-gray-500">No outstanding receivables.</td>
              </tr>
}
            </tbody>
          </table>
        </div>
      </div>
}
    </div>
  `,
})
export class CeoReceivablesComponent implements OnInit {
  loading = true;
  data: CeoReceivables | null = null;

  constructor(private svc: SalesService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.svc.ceoReceivables().subscribe({
      next: (r) => { this.data = r; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  bucketLabel(b: string): string {
    return ({
      CURRENT: 'Current (not yet due)',
      D_1_30: 'Overdue 1–30 days',
      D_31_60: 'Overdue 31–60 days',
      D_61_90: 'Overdue 61–90 days',
      D_90_PLUS: 'Overdue 90+ days',
      NO_DUE_DATE: 'No due date',
    } as Record<string, string>)[b] || b;
  }

  bucketColor(b: string): string {
    return ({
      CURRENT: 'text-emerald-700',
      D_1_30: 'text-amber-600',
      D_31_60: 'text-orange-600',
      D_61_90: 'text-red-600',
      D_90_PLUS: 'text-rose-700',
      NO_DUE_DATE: 'text-gray-600',
    } as Record<string, string>)[b] || 'text-gray-700';
  }
}

import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  CeoSalesSummary,
  SalesService,
} from '../../../modules/sales/sales.service';

@Component({
  selector: 'app-ceo-sales-summary',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Sales Pipeline</h2>
          <p class="text-sm text-gray-500">Read-only overview across all sales executives.</p>
        </div>
        <div class="flex gap-2">
          <a routerLink="/ceo/followups" class="px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg">View Follow-ups →</a>
          <a routerLink="/ceo/receivables" class="px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg">View Receivables →</a>
        </div>
      </div>

      @if (loading) {
<div class="text-center text-gray-500 py-8">Loading…</div>
}

      @if (!loading && summary) {
<div class="space-y-5">
        <!-- Headline KPIs -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs text-gray-500 uppercase">Open Leads</div>
            <div class="text-2xl font-bold text-emerald-700 mt-1">{{ summary.totals?.openCount ?? 0 }}</div>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs text-gray-500 uppercase">Pipeline Value</div>
            <div class="text-2xl font-bold text-emerald-700 mt-1">₹ {{ (summary.totals?.openValue ?? 0) | number:'1.0-0' }}</div>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs text-gray-500 uppercase">Won (lifetime)</div>
            <div class="text-2xl font-bold text-emerald-800 mt-1">{{ summary.totals?.wonCount ?? 0 }}</div>
            <div class="text-xs text-gray-500">₹ {{ (summary.totals?.wonValue ?? 0) | number:'1.0-0' }}</div>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs text-gray-500 uppercase">Lost (lifetime)</div>
            <div class="text-2xl font-bold text-rose-600 mt-1">{{ summary.totals?.lostCount ?? 0 }}</div>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs text-gray-500 uppercase">Win Rate</div>
            <div class="text-2xl font-bold text-blue-700 mt-1">{{ winRate() }}%</div>
          </div>
        </div>

        <!-- By stage -->
        <div class="bg-white rounded-xl border border-gray-200">
          <div class="px-5 py-3 border-b font-semibold">By Stage</div>
          <div class="table-wrap"><table class="w-full text-sm">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th class="text-left px-4 py-2">Stage</th>
                <th class="text-right px-4 py-2">Count</th>
                <th class="text-right px-4 py-2">Estimated Value</th>
              </tr>
            </thead>
            <tbody>
              @for (row of summary.byStage; track row) {
<tr class="border-t border-gray-100">
                <td class="px-4 py-2 font-medium">{{ row.stage }}</td>
                <td class="px-4 py-2 text-right">{{ row.count }}</td>
                <td class="px-4 py-2 text-right">₹ {{ row.value | number:'1.0-0' }}</td>
              </tr>
}
            </tbody>
          </table></div>
        </div>

        <!-- By owner -->
        <div class="bg-white rounded-xl border border-gray-200">
          <div class="px-5 py-3 border-b font-semibold">By Sales Executive</div>
          <div class="table-wrap"><table class="w-full text-sm">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th class="text-left px-4 py-2">Executive</th>
                <th class="text-right px-4 py-2">Open Leads</th>
                <th class="text-right px-4 py-2">Won</th>
                <th class="text-right px-4 py-2">Lost</th>
                <th class="text-right px-4 py-2">Open Value</th>
              </tr>
            </thead>
            <tbody>
              @for (row of summary.byOwner; track row) {
<tr class="border-t border-gray-100">
                <td class="px-4 py-2 font-medium">{{ row.ownerName || '—' }}</td>
                <td class="px-4 py-2 text-right">{{ row.open }}</td>
                <td class="px-4 py-2 text-right text-emerald-700">{{ row.won }}</td>
                <td class="px-4 py-2 text-right text-rose-600">{{ row.lost }}</td>
                <td class="px-4 py-2 text-right">₹ {{ row.openValue | number:'1.0-0' }}</td>
              </tr>
}
              @if (summary.byOwner.length === 0) {
<tr>
                <td colspan="5" class="px-4 py-6 text-center text-gray-500">No sales executives have leads yet.</td>
              </tr>
}
            </tbody>
          </table></div>
        </div>
      </div>
}
    </div>
  `,
})
export class CeoSalesSummaryComponent implements OnInit {
  loading = true;
  summary: CeoSalesSummary | null = null;

  constructor(private svc: SalesService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.svc.ceoSalesSummary().subscribe({
      next: (s) => { this.summary = s; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  winRate(): number {
    if (!this.summary?.totals) return 0;
    const w = this.summary.totals.wonCount;
    const l = this.summary.totals.lostCount;
    const denom = w + l;
    return denom > 0 ? Math.round((w / denom) * 100) : 0;
  }
}

import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CeoFollowupItem,
  CeoFollowupsResponse,
  SalesService,
} from '../../../modules/sales/sales.service';

interface BucketView {
  key: string;
  label: string;
  description: string;
  color: string;
  items: CeoFollowupItem[];
}

@Component({
  selector: 'app-ceo-sales-followups',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-5">
      <div>
        <h2 class="text-2xl font-bold text-gray-900">Sales Follow-ups (Risk View)</h2>
        <p class="text-sm text-gray-500">Leads that need attention from sales — overdue, stale, or untouched.</p>
      </div>

      <div *ngIf="loading" class="text-center text-gray-500 py-8">Loading…</div>

      <div *ngIf="!loading" class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div *ngFor="let b of buckets"
             class="bg-white rounded-xl border border-gray-200 p-4">
          <div class="text-xs uppercase font-semibold" [class]="b.color">{{ b.label }}</div>
          <div class="text-2xl font-bold text-gray-900 mt-1">{{ b.items.length }}</div>
          <div class="text-xs text-gray-500 mt-0.5">{{ b.description }}</div>
        </div>
      </div>

      <div *ngFor="let b of buckets" class="bg-white rounded-xl border border-gray-200">
        <div class="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <div class="font-semibold text-gray-900">{{ b.label }}</div>
            <div class="text-xs text-gray-500">{{ b.description }}</div>
          </div>
          <span class="text-xs font-medium" [class]="b.color">{{ b.items.length }} leads</span>
        </div>
        <div *ngIf="b.items.length === 0" class="p-6 text-center text-sm text-gray-500">No leads in this bucket.</div>
        <table *ngIf="b.items.length > 0" class="w-full text-sm">
          <thead class="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th class="text-left px-4 py-2">Company</th>
              <th class="text-left px-4 py-2">Owner</th>
              <th class="text-left px-4 py-2">Stage</th>
              <th class="text-left px-4 py-2">Next F/U</th>
              <th class="text-left px-4 py-2">Last Activity</th>
              <th class="text-right px-4 py-2">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let l of b.items" class="border-t border-gray-100">
              <td class="px-4 py-2 font-medium text-gray-900">
                {{ l.companyName }}
                <div class="text-xs text-gray-500">{{ l.contactName || l.contactPhone || '' }}</div>
              </td>
              <td class="px-4 py-2 text-gray-700">{{ l.ownerName || '—' }}</td>
              <td class="px-4 py-2"><span class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{{ l.stage }}</span></td>
              <td class="px-4 py-2 text-xs text-red-600">{{ l.nextFollowupAt ? (l.nextFollowupAt | date:'short') : '—' }}</td>
              <td class="px-4 py-2 text-xs text-gray-600">
                {{ l.lastActivityAt ? (l.lastActivityAt | date:'short') : '—' }}
                <span *ngIf="l.daysSinceActivity !== null && l.daysSinceActivity !== undefined" class="ml-1 text-gray-400">({{ l.daysSinceActivity }}d)</span>
              </td>
              <td class="px-4 py-2 text-right text-gray-700">₹ {{ l.estimatedValue | number:'1.0-0' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class CeoSalesFollowupsComponent implements OnInit {
  loading = true;
  buckets: BucketView[] = [];

  private bucketDefs: Omit<BucketView, 'items'>[] = [
    { key: 'OVERDUE_FOLLOWUP',  label: 'Overdue Follow-up',  description: 'Next follow-up date has passed.',                color: 'text-red-600' },
    { key: 'AWAITING_AGREEMENT',label: 'Awaiting Agreement', description: 'Proposal/Agreement sent but no activity in 7d.', color: 'text-orange-600' },
    { key: 'STALE',             label: 'Stale Leads',        description: 'No activity in over 14 days.',                   color: 'text-amber-600' },
    { key: 'NEVER_CONTACTED',   label: 'Never Contacted',    description: 'Created over 24h ago, no activity yet.',         color: 'text-purple-600' },
  ];

  constructor(private svc: SalesService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.svc.ceoFollowups().subscribe({
      next: (r: CeoFollowupsResponse) => {
        this.buckets = this.bucketDefs.map((d) => ({ ...d, items: r.buckets?.[d.key] || [] }));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }
}

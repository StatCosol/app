import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Lead, SalesService } from '../../modules/sales/sales.service';

@Component({
  selector: 'app-sales-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900">My Pipeline</h2>
        <a routerLink="/sales/leads/new"
           class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          New Lead
        </a>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div *ngFor="let kpi of kpis" class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div class="text-xs text-gray-500 uppercase tracking-wide">{{ kpi.label }}</div>
          <div class="text-2xl font-bold mt-1" [class]="kpi.color">{{ kpi.value }}</div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200">
        <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 class="font-semibold text-gray-900">Overdue Follow-ups</h3>
          <a routerLink="/sales/followups" class="text-sm text-emerald-600 hover:underline">View all →</a>
        </div>
        <div *ngIf="loading" class="p-6 text-center text-gray-500">Loading…</div>
        <div *ngIf="!loading && followups.length === 0" class="p-6 text-center text-gray-500">No overdue follow-ups. 🎉</div>
        <table *ngIf="!loading && followups.length > 0" class="w-full text-sm">
          <thead class="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th class="text-left px-4 py-2">Company</th>
              <th class="text-left px-4 py-2">Stage</th>
              <th class="text-left px-4 py-2">Follow-up Due</th>
              <th class="text-left px-4 py-2">Value</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let l of followups" class="border-t border-gray-100 hover:bg-gray-50">
              <td class="px-4 py-2 font-medium text-gray-900">{{ l.companyName }}</td>
              <td class="px-4 py-2"><span class="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">{{ l.stage }}</span></td>
              <td class="px-4 py-2 text-red-600">{{ l.nextFollowupAt | date:'medium' }}</td>
              <td class="px-4 py-2 text-gray-700">₹ {{ l.estimatedValue | number:'1.0-0' }}</td>
              <td class="px-4 py-2 text-right">
                <a [routerLink]="['/sales/leads', l.id]" class="text-emerald-600 hover:underline text-sm">Open</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class SalesDashboardComponent implements OnInit {
  loading = true;
  followups: Lead[] = [];
  allOpen: Lead[] = [];

  kpis: { label: string; value: string; color: string }[] = [];

  constructor(private svc: SalesService) {}

  ngOnInit(): void {
    this.svc.list({ bucket: 'open', limit: 500 }).subscribe({
      next: (r) => { this.allOpen = r.items; this.recomputeKpis(); },
    });
    this.svc.myFollowups().subscribe({
      next: (r) => { this.followups = r; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  private recomputeKpis(): void {
    const sumValue = this.allOpen.reduce((s, l) => s + Number(l.estimatedValue || 0), 0);
    const proposals = this.allOpen.filter((l) => l.stage === 'PROPOSAL_SENT' || l.stage === 'AGREEMENT_SENT' || l.stage === 'NEGOTIATION').length;
    const newLeads  = this.allOpen.filter((l) => l.stage === 'NEW').length;
    this.kpis = [
      { label: 'Open Leads',     value: String(this.allOpen.length),  color: 'text-emerald-700' },
      { label: 'Pipeline Value', value: '₹ ' + sumValue.toLocaleString('en-IN'), color: 'text-emerald-700' },
      { label: 'In Negotiation', value: String(proposals),             color: 'text-orange-600' },
      { label: 'New (untouched)', value: String(newLeads),             color: 'text-blue-600' },
    ];
  }
}

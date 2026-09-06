import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  Lead,
  LeadPriority,
  LeadStage,
  SalesService,
} from '../../modules/sales/sales.service';
import { PageHeaderComponent } from '../../shared/ui';

@Component({
  selector: 'app-sales-leads-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderComponent],
  template: `
    <div class="space-y-5">
      <ui-page-header title="Leads" subtitle="Pipeline of open, won, and archived opportunities">
        <a routerLink="/sales/leads/new"
           class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
          + New Lead
        </a>
      </ui-page-header>

      <!-- Filters -->
      <div class="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Bucket</label>
          <select [(ngModel)]="bucket" (change)="reload()" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Stage</label>
          <select [(ngModel)]="stage" (change)="reload()" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option [ngValue]="null">All stages</option>
            @for (s of stages; track s) {
<option [value]="s">{{ s }}</option>
}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Priority</label>
          <select [(ngModel)]="priority" (change)="reload()" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option [ngValue]="null">All</option>
            @for (p of priorities; track p) {
<option [value]="p">{{ p }}</option>
}
          </select>
        </div>
        <div class="flex-1 min-w-[12rem]">
          <label class="block text-xs font-medium text-gray-600 mb-1">Search company</label>
          <input [(ngModel)]="search" (keyup.enter)="reload()" placeholder="Search…"
                 class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <button (click)="reload()" class="px-3 py-1.5 text-sm font-medium text-white bg-gray-700 hover:bg-gray-800 rounded-lg">Apply</button>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        @if (loading) {
<div class="p-6 text-center text-gray-500">Loading…</div>
}
        @if (!loading && items.length === 0) {
<div class="p-10 text-center text-gray-500">No leads found.</div>
}
        @if (!loading && items.length > 0) {
<div class="table-wrap"><table class="w-full text-sm">
          <thead class="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th class="text-left px-4 py-2.5">Lead #</th>
              <th class="text-left px-4 py-2.5">Company</th>
              <th class="text-left px-4 py-2.5">Contact</th>
              <th class="text-left px-4 py-2.5">Stage</th>
              <th class="text-left px-4 py-2.5">Priority</th>
              <th class="text-right px-4 py-2.5">Value</th>
              <th class="text-left px-4 py-2.5">Next F/U</th>
              <th class="text-left px-4 py-2.5">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            @for (l of items; track l) {
<tr
                [routerLink]="['/sales/leads', l.id]"
                class="border-t border-gray-100 hover:bg-emerald-50/40 cursor-pointer">
              <td class="px-4 py-2.5 text-gray-700">{{ l.leadNo }}</td>
              <td class="px-4 py-2.5 font-medium text-gray-900">{{ l.companyName }}</td>
              <td class="px-4 py-2.5 text-gray-700">
                <div>{{ l.contactName || '—' }}</div>
                <div class="text-xs text-gray-500">{{ l.contactPhone || l.contactEmail }}</div>
              </td>
              <td class="px-4 py-2.5">
                <span class="text-xs px-2 py-0.5 rounded" [ngClass]="stageClass(l.stage)">{{ l.stage }}</span>
              </td>
              <td class="px-4 py-2.5">
                <span class="text-xs px-2 py-0.5 rounded" [ngClass]="priorityClass(l.priority)">{{ l.priority }}</span>
              </td>
              <td class="px-4 py-2.5 text-right text-gray-700">₹ {{ +l.estimatedValue | number:'1.0-0' }}</td>
              <td class="px-4 py-2.5 text-xs"
                  [class.text-red-600]="isOverdue(l.nextFollowupAt)">
                {{ l.nextFollowupAt ? (l.nextFollowupAt | date:'short') : '—' }}
              </td>
              <td class="px-4 py-2.5 text-xs text-gray-600">{{ l.lastActivityAt ? (l.lastActivityAt | date:'short') : '—' }}</td>
            </tr>
}
          </tbody>
        </table></div>
}
        @if (total > items.length) {
<div class="px-4 py-2 text-xs text-gray-500 border-t">
          Showing {{ items.length }} of {{ total }}.
        </div>
}
      </div>
    </div>
  `,
})
export class SalesLeadsListComponent implements OnInit {
  bucket: 'open' | 'won' | 'lost' | 'archived' | 'all' = 'open';
  stage: LeadStage | null = null;
  priority: LeadPriority | null = null;
  search = '';
  items: Lead[] = [];
  total = 0;
  loading = true;

  stages: LeadStage[] = ['NEW','CONTACTED','QUALIFIED','PROPOSAL_SENT','NEGOTIATION','AGREEMENT_SENT','WON','LOST','ON_HOLD'];
  priorities: LeadPriority[] = ['LOW','MEDIUM','HIGH','CRITICAL'];

  constructor(private svc: SalesService) {}

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.loading = true;
    this.svc.list({
      bucket: this.bucket,
      stage: this.stage ?? undefined,
      priority: this.priority ?? undefined,
      search: this.search || undefined,
      limit: 200,
    }).subscribe({
      next: (r) => { this.items = r.items; this.total = r.total; this.loading = false; },
      error: () => { this.loading = false; this.items = []; this.total = 0; },
    });
  }

  isOverdue(d: string | null): boolean {
    return !!d && new Date(d).getTime() <= Date.now();
  }

  stageClass(stage: LeadStage): string {
    const map: Record<LeadStage, string> = {
      NEW: 'bg-blue-50 text-blue-700',
      CONTACTED: 'bg-cyan-50 text-cyan-700',
      QUALIFIED: 'bg-violet-50 text-violet-700',
      PROPOSAL_SENT: 'bg-amber-50 text-amber-700',
      NEGOTIATION: 'bg-orange-50 text-orange-700',
      AGREEMENT_SENT: 'bg-yellow-50 text-yellow-700',
      WON: 'bg-emerald-100 text-emerald-800',
      LOST: 'bg-rose-50 text-rose-700',
      ON_HOLD: 'bg-gray-100 text-gray-700',
    };
    return map[stage];
  }

  priorityClass(p: LeadPriority): string {
    const map: Record<LeadPriority, string> = {
      LOW: 'bg-gray-100 text-gray-700',
      MEDIUM: 'bg-blue-50 text-blue-700',
      HIGH: 'bg-orange-50 text-orange-700',
      CRITICAL: 'bg-rose-100 text-rose-800',
    };
    return map[p];
  }
}

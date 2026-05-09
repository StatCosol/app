import { Component, OnInit , ChangeDetectionStrategy} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PfTeamApiService, HdTicket } from '../pf-team-api.service';

@Component({
  selector: 'app-pf-team-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div>
        <h1 class="text-2xl font-bold text-gray-900">PF &amp; ESI Helpdesk Dashboard</h1>
        <p class="mt-1 text-sm text-gray-500">Manage employee PF, ESI, and Payslip queries</p>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z"/></svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900">{{ totalTickets }}</p>
              <p class="text-xs text-gray-500">Total Tickets</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-amber-600">{{ openTickets }}</p>
              <p class="text-xs text-gray-500">Open</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17l-5.384-3.196a.75.75 0 010-1.299l5.384-3.196A.75.75 0 0112 8.1v7.8a.75.75 0 01-.58.77z"/></svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-indigo-600">{{ inProgressTickets }}</p>
              <p class="text-xs text-gray-500">In Progress</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-red-600">{{ slaBreachedTickets }}</p>
              <p class="text-xs text-gray-500">SLA Breached</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Category Breakdown + Client Breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <h2 class="text-base font-semibold text-gray-900 mb-4">By Category</h2>
          <div class="space-y-3">
            <div *ngFor="let cat of categoryStats" class="flex items-center justify-between">
              <span class="text-sm text-gray-700">{{ cat.label }}</span>
              <div class="flex items-center gap-2">
                <div class="w-32 bg-gray-100 rounded-full h-2">
                  <div class="h-2 rounded-full" [style.width.%]="cat.pct" [style.background]="cat.color"></div>
                </div>
                <span class="text-sm font-medium text-gray-900 w-8 text-right">{{ cat.count }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Client-wise Breakdown -->
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <h2 class="text-base font-semibold text-gray-900 mb-4">By Client</h2>
          <div *ngIf="clientStats.length === 0" class="text-sm text-gray-400 text-center py-4">No data</div>
          <div class="space-y-3 max-h-64 overflow-y-auto">
            <a *ngFor="let cs of clientStats"
               [routerLink]="'/pf-team/tickets'"
               [queryParams]="{ clientId: cs.clientId }"
               class="flex items-center justify-between group cursor-pointer">
              <span class="text-sm text-gray-700 group-hover:text-indigo-700 truncate max-w-[140px]">{{ cs.clientName }}</span>
              <div class="flex items-center gap-2">
                <div class="w-24 bg-gray-100 rounded-full h-2">
                  <div class="h-2 rounded-full bg-indigo-500" [style.width.%]="cs.pct"></div>
                </div>
                <span class="text-sm font-medium text-gray-900 w-8 text-right">{{ cs.total }}</span>
                <span *ngIf="cs.open > 0" class="text-xs text-amber-600 font-medium">({{ cs.open }} open)</span>
              </div>
            </a>
          </div>
        </div>

        <!-- Recent Open Tickets -->
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-semibold text-gray-900">Recent Open Tickets</h2>
            <a routerLink="/pf-team/tickets" class="text-sm text-indigo-600 hover:text-indigo-700 font-medium">View All →</a>
          </div>
          <div *ngIf="recentOpen.length === 0" class="text-sm text-gray-400 py-4 text-center">No open tickets</div>
          <div class="space-y-2">
            <a *ngFor="let t of recentOpen"
               [routerLink]="['/pf-team/tickets', t.id]"
               class="block p-3 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-900 truncate">{{ t.category }}<span *ngIf="t.subCategory"> / {{ t.subCategory }}</span></span>
                <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                      [class]="priorityClass(t.priority)">{{ t.priority }}</span>
              </div>
              <p class="text-xs text-gray-500 mt-1 truncate">{{ t.description }}</p>
              <p *ngIf="t.client?.clientName" class="text-xs text-indigo-500 mt-0.5">{{ t.client?.clientName }}</p>
            </a>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PfTeamDashboardComponent implements OnInit {
  totalTickets = 0;
  openTickets = 0;
  inProgressTickets = 0;
  slaBreachedTickets = 0;
  categoryStats: { label: string; count: number; pct: number; color: string }[] = [];
  clientStats: { clientId: string; clientName: string; total: number; open: number; pct: number }[] = [];
  recentOpen: HdTicket[] = [];

  private readonly catColors: Record<string, string> = {
    PF: '#6366f1',
    ESI: '#0ea5e9',
    PAYSLIP: '#f59e0b',
    OTHER: '#64748b',
  };

  constructor(private api: PfTeamApiService) {}

  ngOnInit(): void {
    this.api.listTickets().subscribe({
      next: (tickets) => {
        const now = Date.now();
        this.totalTickets = tickets.length;
        this.openTickets = tickets.filter((t) => t.status === 'OPEN').length;
        this.inProgressTickets = tickets.filter((t) => t.status === 'IN_PROGRESS').length;
        this.slaBreachedTickets = tickets.filter(
          (t) => t.slaDueAt && new Date(t.slaDueAt).getTime() < now && !['RESOLVED', 'CLOSED'].includes(t.status),
        ).length;

        // category breakdown
        const catMap = new Map<string, number>();
        for (const t of tickets) {
          const key = t.category || 'OTHER';
          catMap.set(key, (catMap.get(key) || 0) + 1);
        }
        const catMax = Math.max(...catMap.values(), 1);
        this.categoryStats = [...catMap.entries()].map(([label, count]) => ({
          label,
          count,
          pct: (count / catMax) * 100,
          color: this.catColors[label] || '#94a3b8',
        }));

        // client-wise breakdown
        const clientMap = new Map<string, { clientId: string; clientName: string; total: number; open: number }>();
        for (const t of tickets) {
          const cid = t.clientId;
          const cname = t.client?.clientName || cid?.substring(0, 8) || 'Unknown';
          if (!clientMap.has(cid)) {
            clientMap.set(cid, { clientId: cid, clientName: cname, total: 0, open: 0 });
          }
          const entry = clientMap.get(cid)!;
          entry.total++;
          if (t.status === 'OPEN') entry.open++;
        }
        const clientMax = Math.max(...[...clientMap.values()].map((c) => c.total), 1);
        this.clientStats = [...clientMap.values()]
          .sort((a, b) => b.total - a.total)
          .map((c) => ({ ...c, pct: (c.total / clientMax) * 100 }));

        // recent open
        this.recentOpen = tickets
          .filter((t) => t.status === 'OPEN')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);
      },
      error: () => {},
    });
  }

  priorityClass(p: string): string {
    return {
      CRITICAL: 'bg-red-100 text-red-700',
      HIGH: 'bg-orange-100 text-orange-700',
      NORMAL: 'bg-blue-100 text-blue-700',
      LOW: 'bg-gray-100 text-gray-600',
    }[p] || 'bg-gray-100 text-gray-600';
  }
}

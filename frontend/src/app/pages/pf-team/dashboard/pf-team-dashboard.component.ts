import { Component, OnInit, ChangeDetectionStrategy, signal, computed } from '@angular/core';

import { Router, RouterModule } from '@angular/router';
import { PfTeamApiService, HdTicket } from '../pf-team-api.service';
import {
  PageHeaderComponent,
  KpiTileComponent,
  ActionButtonComponent,
  IconComponent,
  ChartCardComponent,
  ChartCardDataset,
} from '../../../shared/ui';

interface CategoryStat {
  label: string;
  count: number;
  pct: number;
  color: string;
}

interface ClientStat {
  clientId: string;
  clientName: string;
  total: number;
  open: number;
  pct: number;
}

@Component({
  selector: 'app-pf-team-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterModule, PageHeaderComponent, KpiTileComponent, ActionButtonComponent, IconComponent, ChartCardComponent],
  template: `
    <div class="space-y-6">
      <ui-page-header
        title="PF & ESI Helpdesk Dashboard"
        subtitle="Manage employee PF, ESI, and Payslip queries">
        <ui-button variant="secondary" size="sm" [disabled]="loading()" (clicked)="reload()">
          <span class="flex items-center gap-1.5">
            <ui-icon name="refresh" [size]="14" />
            Refresh
          </span>
        </ui-button>
      </ui-page-header>

      @if (loading()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-card"></div>
          }
        </div>
        <div class="skeleton-table"></div>
      } @else if (error()) {
        <div class="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p class="text-sm text-red-700">{{ error() }}</p>
          <ui-button size="sm" variant="secondary" (clicked)="reload()">Retry</ui-button>
        </div>
      } @else {
        <!-- Stats -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ui-kpi-tile
            label="Total Tickets"
            [value]="totalTickets()"
            color="blue"
            (tileClick)="goToTickets()">
            <ui-icon slot="icon" name="clipboard" class="text-blue-600" />
          </ui-kpi-tile>
          <ui-kpi-tile
            label="Open"
            [value]="openTickets()"
            color="amber"
            valueColor="amber"
            (tileClick)="goToTickets()">
            <ui-icon slot="icon" name="clock" class="text-amber-600" />
          </ui-kpi-tile>
          <ui-kpi-tile
            label="In Progress"
            [value]="inProgressTickets()"
            color="violet"
            valueColor="violet"
            (tileClick)="goToTickets()">
            <ui-icon slot="icon" name="bolt" class="text-indigo-600" />
          </ui-kpi-tile>
          <ui-kpi-tile
            label="SLA Breached"
            [value]="slaBreachedTickets()"
            color="red"
            valueColor="red"
            (tileClick)="goToTickets()">
            <ui-icon slot="icon" name="exclamation-triangle" class="text-red-600" />
          </ui-kpi-tile>
        </div>

        <!-- Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ui-chart-card
            title="Tickets by Status"
            type="doughnut"
            [labels]="statusLabels"
            [datasets]="statusDatasets()"
            emptyMessage="No tickets yet" />
          <ui-chart-card
            title="Tickets by Category"
            type="bar"
            [showLegend]="false"
            [labels]="categoryLabels()"
            [datasets]="categoryDatasets()"
            emptyMessage="No tickets yet" />
        </div>

        <!-- Category / Client / Recent -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="bg-white rounded-xl border border-gray-200 p-6">
            <h2 class="text-base font-semibold text-gray-900 mb-4">By Category</h2>
            @if (categoryStats().length === 0) {
              <div class="text-sm text-gray-400 text-center py-4">No data</div>
            }
            <div class="space-y-3">
              @for (cat of categoryStats(); track cat.label) {
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-700">{{ cat.label }}</span>
                  <div class="flex items-center gap-2">
                    <div class="w-32 bg-gray-100 rounded-full h-2">
                      <div class="h-2 rounded-full" [style.width.%]="cat.pct" [style.background]="cat.color"></div>
                    </div>
                    <span class="text-sm font-medium text-gray-900 w-8 text-right">{{ cat.count }}</span>
                  </div>
                </div>
              }
            </div>
          </div>

          <div class="bg-white rounded-xl border border-gray-200 p-6">
            <h2 class="text-base font-semibold text-gray-900 mb-4">By Client</h2>
            @if (clientStats().length === 0) {
              <div class="text-sm text-gray-400 text-center py-4">No data</div>
            }
            <div class="space-y-3 max-h-64 overflow-y-auto">
              @for (cs of clientStats(); track cs.clientId) {
                <a
                  routerLink="/pf-team/tickets"
                  [queryParams]="{ clientId: cs.clientId }"
                  class="flex items-center justify-between group cursor-pointer">
                  <span class="text-sm text-gray-700 group-hover:text-indigo-700 truncate max-w-[140px]">{{ cs.clientName }}</span>
                  <div class="flex items-center gap-2">
                    <div class="w-24 bg-gray-100 rounded-full h-2">
                      <div class="h-2 rounded-full bg-indigo-500" [style.width.%]="cs.pct"></div>
                    </div>
                    <span class="text-sm font-medium text-gray-900 w-8 text-right">{{ cs.total }}</span>
                    @if (cs.open > 0) {
                      <span class="text-xs text-amber-600 font-medium">({{ cs.open }} open)</span>
                    }
                  </div>
                </a>
              }
            </div>
          </div>

          <div class="bg-white rounded-xl border border-gray-200 p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-base font-semibold text-gray-900">Recent Open Tickets</h2>
              <a routerLink="/pf-team/tickets" class="text-sm text-indigo-600 hover:text-indigo-700 font-medium">View All →</a>
            </div>
            @if (recentOpen().length === 0) {
              <div class="text-sm text-gray-400 py-4 text-center">No open tickets</div>
            }
            <div class="space-y-2">
              @for (t of recentOpen(); track t.id) {
                <a
                  [routerLink]="['/pf-team/tickets', t.id]"
                  class="block p-3 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-900 truncate">
                      {{ t.category }}@if (t.subCategory) {<span> / {{ t.subCategory }}</span>}
                    </span>
                    <span class="text-xs px-2 py-0.5 rounded-full font-medium" [class]="priorityClass(t.priority)">{{ t.priority }}</span>
                  </div>
                  <p class="text-xs text-gray-500 mt-1 truncate">{{ t.description }}</p>
                  @if (t.client?.clientName) {
                    <p class="text-xs text-indigo-500 mt-0.5">{{ t.client?.clientName }}</p>
                  }
                </a>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class PfTeamDashboardComponent implements OnInit {
  loading = signal(true);
  error = signal<string | null>(null);
  totalTickets = signal(0);
  openTickets = signal(0);
  inProgressTickets = signal(0);
  slaBreachedTickets = signal(0);
  categoryStats = signal<CategoryStat[]>([]);
  clientStats = signal<ClientStat[]>([]);
  recentOpen = signal<HdTicket[]>([]);
  statusCounts = signal<{ resolved: number; closed: number }>({ resolved: 0, closed: 0 });

  readonly statusLabels = ['Open', 'In Progress', 'Resolved', 'Closed'];
  statusDatasets = computed<ChartCardDataset[]>(() => [
    {
      data: [
        this.openTickets(),
        this.inProgressTickets(),
        this.statusCounts().resolved,
        this.statusCounts().closed,
      ],
      backgroundColor: ['#f59e0b', '#6366f1', '#10b981', '#64748b'],
    },
  ]);
  categoryLabels = computed(() => this.categoryStats().map((c) => c.label));
  categoryDatasets = computed<ChartCardDataset[]>(() => [
    {
      label: 'Tickets',
      data: this.categoryStats().map((c) => c.count),
      backgroundColor: this.categoryStats().map((c) => c.color),
    },
  ]);

  private readonly catColors: Record<string, string> = {
    PF: '#6366f1',
    ESI: '#0ea5e9',
    PAYSLIP: '#f59e0b',
    OTHER: '#64748b',
  };

  constructor(
    private api: PfTeamApiService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.listTickets().subscribe({
      next: (tickets) => {
        const now = Date.now();
        this.totalTickets.set(tickets.length);
        this.openTickets.set(tickets.filter((t) => t.status === 'OPEN').length);
        this.inProgressTickets.set(tickets.filter((t) => t.status === 'IN_PROGRESS').length);
        this.statusCounts.set({
          resolved: tickets.filter((t) => t.status === 'RESOLVED').length,
          closed: tickets.filter((t) => t.status === 'CLOSED').length,
        });
        this.slaBreachedTickets.set(
          tickets.filter(
            (t) =>
              t.slaDueAt &&
              new Date(t.slaDueAt).getTime() < now &&
              !['RESOLVED', 'CLOSED'].includes(t.status),
          ).length,
        );

        // category breakdown
        const catMap = new Map<string, number>();
        for (const t of tickets) {
          const key = t.category || 'OTHER';
          catMap.set(key, (catMap.get(key) || 0) + 1);
        }
        const catMax = Math.max(...catMap.values(), 1);
        this.categoryStats.set(
          [...catMap.entries()].map(([label, count]) => ({
            label,
            count,
            pct: (count / catMax) * 100,
            color: this.catColors[label] || '#94a3b8',
          })),
        );

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
        this.clientStats.set(
          [...clientMap.values()]
            .sort((a, b) => b.total - a.total)
            .map((c) => ({ ...c, pct: (c.total / clientMax) * 100 })),
        );

        // recent open
        this.recentOpen.set(
          tickets
            .filter((t) => t.status === 'OPEN')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5),
        );
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load helpdesk tickets. Please try again.');
        this.loading.set(false);
      },
    });
  }

  goToTickets(): void {
    this.router.navigate(['/pf-team/tickets']);
  }

  priorityClass(p: string): string {
    return (
      {
        CRITICAL: 'bg-red-100 text-red-700',
        HIGH: 'bg-orange-100 text-orange-700',
        NORMAL: 'bg-blue-100 text-blue-700',
        LOW: 'bg-gray-100 text-gray-600',
      }[p] || 'bg-gray-100 text-gray-600'
    );
  }
}

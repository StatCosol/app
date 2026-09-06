import { Component, OnInit, ChangeDetectionStrategy, signal, computed } from '@angular/core';

import { Router, RouterModule } from '@angular/router';
import { AccountsBillingService } from '../services/accounts-billing.service';
import { DashboardStats } from '../models/billing.models';
import {
  PageHeaderComponent,
  KpiTileComponent,
  ActionButtonComponent,
  IconComponent,
  ChartCardComponent,
  ChartCardDataset,
} from '../../../shared/ui';

@Component({
  selector: 'app-billing-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterModule,
    PageHeaderComponent,
    KpiTileComponent,
    ActionButtonComponent,
    IconComponent,
    ChartCardComponent
],
  template: `
    <div class="p-6 space-y-6">
      <ui-page-header
        title="Accounts & Billing"
        subtitle="Overview of invoices, payments and revenue">
        <ui-button variant="secondary" size="sm" [disabled]="loading()" (clicked)="reload()">
          <span class="flex items-center gap-1.5">
            <ui-icon name="refresh" [size]="14" />
            Refresh
          </span>
        </ui-button>
        <ui-button variant="primary" (clicked)="goTo('/accounts/invoices/new')">
          <span class="flex items-center gap-2">
            <ui-icon name="plus" [size]="16" />
            New Invoice
          </span>
        </ui-button>
      </ui-page-header>

      @if (loading()) {
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <div class="skeleton-card"></div>
          }
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-card"></div>
          }
        </div>
      } @else {
        @if (error()) {
          <div class="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p class="text-sm text-red-700">{{ error() }}</p>
            <ui-button size="sm" variant="secondary" (clicked)="reload()">Retry</ui-button>
          </div>
        }

        <!-- Invoice status KPIs -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <ui-kpi-tile
            label="Total Invoices"
            [value]="stats().totalInvoices"
            color="gray"
            (tileClick)="goTo('/accounts/invoices')">
            <ui-icon slot="icon" name="document" class="text-slate-500" />
          </ui-kpi-tile>
          <ui-kpi-tile
            label="Draft"
            [value]="stats().draftCount"
            color="amber"
            valueColor="amber"
            (tileClick)="goTo('/accounts/invoices')">
            <ui-icon slot="icon" name="clipboard" class="text-amber-600" />
          </ui-kpi-tile>
          <ui-kpi-tile
            label="Pending Payment"
            [value]="stats().pendingPaymentCount"
            color="amber"
            (tileClick)="goTo('/accounts/pending-payments')">
            <ui-icon slot="icon" name="clock" class="text-orange-600" />
          </ui-kpi-tile>
          <ui-kpi-tile
            label="Paid"
            [value]="stats().paidCount"
            color="green"
            valueColor="green"
            (tileClick)="goTo('/accounts/payments')">
            <ui-icon slot="icon" name="check-circle" class="text-green-600" />
          </ui-kpi-tile>
          <ui-kpi-tile
            label="Overdue"
            [value]="stats().overdueCount"
            color="red"
            valueColor="red"
            (tileClick)="goTo('/accounts/pending-payments')">
            <ui-icon slot="icon" name="exclamation-triangle" class="text-red-600" />
          </ui-kpi-tile>
        </div>

        <!-- Revenue Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl p-5 text-white shadow">
            <p class="text-sm opacity-80">Total Billed</p>
            <p class="text-3xl font-bold mt-1">₹{{ formatNum(stats().totalBilled) }}</p>
          </div>
          <div class="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-5 text-white shadow">
            <p class="text-sm opacity-80">Total Received</p>
            <p class="text-3xl font-bold mt-1">₹{{ formatNum(stats().totalReceived) }}</p>
          </div>
          <div class="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-5 text-white shadow">
            <p class="text-sm opacity-80">Outstanding</p>
            <p class="text-3xl font-bold mt-1">₹{{ formatNum(stats().totalOutstanding) }}</p>
          </div>
        </div>

        <!-- Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ui-chart-card
            title="Invoices by Status"
            type="doughnut"
            [labels]="['Draft', 'Pending Payment', 'Paid', 'Overdue']"
            [datasets]="statusDatasets()"
            emptyMessage="No invoices yet" />
          <ui-chart-card
            title="Revenue Overview"
            subtitle="Billed vs received vs outstanding (₹)"
            type="bar"
            [showLegend]="false"
            [labels]="['Billed', 'Received', 'Outstanding']"
            [datasets]="revenueDatasets()"
            emptyMessage="No revenue recorded yet" />
        </div>

        <!-- Quick Links -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          @for (link of quickLinks; track link.route) {
            <a
              [routerLink]="link.route"
              class="bg-white rounded-xl border p-4 hover:shadow-md transition flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center" [class]="link.bg">
                <ui-icon [name]="link.icon" [class]="link.fg" />
              </div>
              <div>
                <p class="text-sm font-semibold text-slate-700">{{ link.title }}</p>
                <p class="text-xs text-slate-400">{{ link.sub }}</p>
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class BillingDashboardComponent implements OnInit {
  loading = signal(true);
  error = signal<string | null>(null);
  stats = signal<DashboardStats>({
    totalInvoices: 0,
    draftCount: 0,
    approvedCount: 0,
    pendingPaymentCount: 0,
    paidCount: 0,
    overdueCount: 0,
    totalBilled: 0,
    totalReceived: 0,
    totalOutstanding: 0,
  } as DashboardStats);

  statusDatasets = computed<ChartCardDataset[]>(() => {
    const s = this.stats();
    return [
      {
        data: [s.draftCount, s.pendingPaymentCount, s.paidCount, s.overdueCount],
        backgroundColor: ['#f59e0b', '#f97316', '#10b981', '#ef4444'],
      },
    ];
  });

  revenueDatasets = computed<ChartCardDataset[]>(() => {
    const s = this.stats();
    return [
      {
        label: '₹',
        data: [+s.totalBilled || 0, +s.totalReceived || 0, +s.totalOutstanding || 0],
        backgroundColor: ['#3b82f6', '#10b981', '#f97316'],
      },
    ];
  });

  quickLinks = [
    { route: '/accounts/clients', icon: 'users', bg: 'bg-purple-100', fg: 'text-purple-600', title: 'Billing Clients', sub: 'Manage clients' },
    { route: '/accounts/invoices', icon: 'document', bg: 'bg-brand-100', fg: 'text-brand-600', title: 'All Invoices', sub: 'View & manage' },
    { route: '/accounts/payments', icon: 'banknotes', bg: 'bg-green-100', fg: 'text-green-600', title: 'Payments', sub: 'Track receipts' },
    { route: '/accounts/settings', icon: 'cog', bg: 'bg-slate-100', fg: 'text-slate-600', title: 'Settings', sub: 'Company profile' },
  ] as const;

  constructor(
    private svc: AccountsBillingService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getDashboardStats().subscribe({
      next: (s) => {
        if (s) this.stats.set(s);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load billing stats — showing zeros. Check your connection and retry.');
        this.loading.set(false);
      },
    });
  }

  goTo(route: string): void {
    this.router.navigate([route]);
  }

  formatNum(n: number | string | null | undefined): string {
    return (+(n as any) || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}

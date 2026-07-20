import { Component, OnInit, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Lead, SalesService } from '../../modules/sales/sales.service';
import {
  PageHeaderComponent,
  KpiTileComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  ActionButtonComponent,
  EmptyStateComponent,
  IconComponent,
  ChartCardComponent,
  ChartCardDataset,
} from '../../shared/ui';

@Component({
  selector: 'app-sales-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    PageHeaderComponent,
    KpiTileComponent,
    DataTableComponent,
    TableCellDirective,
    ActionButtonComponent,
    EmptyStateComponent,
    IconComponent,
    ChartCardComponent,
  ],
  template: `
    <div class="space-y-6">
      <ui-page-header
        title="My Pipeline"
        subtitle="Open leads, pipeline value and overdue follow-ups">
        <ui-button variant="secondary" size="sm" [disabled]="loading()" (clicked)="reload()">
          <span class="flex items-center gap-1.5">
            <ui-icon name="refresh" [size]="14" />
            Refresh
          </span>
        </ui-button>
        <ui-button variant="primary" (clicked)="goTo('/sales/leads/new')">
          <span class="flex items-center gap-2">
            <ui-icon name="plus" [size]="16" />
            New Lead
          </span>
        </ui-button>
      </ui-page-header>

      <!-- Loading skeleton -->
      @if (loading()) {
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-card"></div>
          }
        </div>
        <div class="skeleton-table"></div>
      } @else if (error()) {
        <ui-empty-state title="Unable to Load Pipeline" [description]="error()!">
          <ui-button slot="action" variant="secondary" (clicked)="reload()">Retry</ui-button>
        </ui-empty-state>
      } @else {
        <!-- KPI tiles -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ui-kpi-tile
            label="Open Leads"
            [value]="openLeads().length"
            color="emerald"
            (tileClick)="goTo('/sales/leads')">
            <ui-icon slot="icon" name="funnel" class="text-emerald-600" />
          </ui-kpi-tile>
          <ui-kpi-tile
            label="Pipeline Value"
            [value]="pipelineValue()"
            color="blue">
            <ui-icon slot="icon" name="currency-rupee" class="text-blue-600" />
          </ui-kpi-tile>
          <ui-kpi-tile
            label="In Negotiation"
            [value]="inNegotiation()"
            color="amber"
            (tileClick)="goTo('/sales/leads')">
            <ui-icon slot="icon" name="briefcase" class="text-amber-600" />
          </ui-kpi-tile>
          <ui-kpi-tile
            label="New (Untouched)"
            [value]="newLeads()"
            color="violet"
            (tileClick)="goTo('/sales/leads')">
            <ui-icon slot="icon" name="user-plus" class="text-violet-600" />
          </ui-kpi-tile>
        </div>

        <!-- Pipeline breakdown -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ui-chart-card
            title="Pipeline by Stage"
            subtitle="Open leads per stage"
            type="bar"
            [horizontal]="true"
            [showLegend]="false"
            [labels]="stageLabels()"
            [datasets]="stageDatasets()"
            emptyMessage="No open leads yet" />
          <ui-chart-card
            title="Pipeline Value by Stage"
            subtitle="Estimated value (₹) per stage"
            type="doughnut"
            [labels]="stageLabels()"
            [datasets]="stageValueDatasets()"
            emptyMessage="No pipeline value yet" />
        </div>

        <!-- Overdue follow-ups -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-gray-900">Overdue Follow-ups</h3>
            <a routerLink="/sales/followups" class="text-sm text-emerald-600 hover:underline">
              View all →
            </a>
          </div>
          <ui-data-table
            [columns]="followupColumns"
            [data]="followups()"
            exportFileName="overdue-followups"
            [clickable]="true"
            (rowClick)="openLead($event.row)"
            emptyMessage="No overdue follow-ups. You're all caught up.">
            <ng-template uiTableCell="companyName" let-row>
              <div class="font-medium text-gray-900">{{ row.companyName }}</div>
            </ng-template>
            <ng-template uiTableCell="stage" let-row>
              <span class="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                {{ row.stage }}
              </span>
            </ng-template>
            <ng-template uiTableCell="nextFollowupAt" let-row>
              <span class="text-sm text-red-600">{{ row.nextFollowupAt | date: 'medium' }}</span>
            </ng-template>
            <ng-template uiTableCell="estimatedValue" let-row>
              <span class="text-sm text-gray-700">₹ {{ row.estimatedValue | number: '1.0-0' }}</span>
            </ng-template>
            <ng-template uiTableCell="actions" let-row>
              <ui-button size="sm" variant="secondary" (clicked)="openLead(row)">Open</ui-button>
            </ng-template>
          </ui-data-table>
        </div>
      }
    </div>
  `,
})
export class SalesDashboardComponent implements OnInit {
  loading = signal(true);
  error = signal<string | null>(null);
  followups = signal<Lead[]>([]);
  openLeads = signal<Lead[]>([]);

  pipelineValue = computed(() => {
    const sum = this.openLeads().reduce((s, l) => s + Number(l.estimatedValue || 0), 0);
    return '₹ ' + sum.toLocaleString('en-IN');
  });
  inNegotiation = computed(
    () =>
      this.openLeads().filter(
        (l) => l.stage === 'PROPOSAL_SENT' || l.stage === 'AGREEMENT_SENT' || l.stage === 'NEGOTIATION',
      ).length,
  );
  newLeads = computed(() => this.openLeads().filter((l) => l.stage === 'NEW').length);

  private stageBuckets = computed(() => {
    const counts = new Map<string, { count: number; value: number }>();
    for (const l of this.openLeads()) {
      const stage = l.stage || 'UNKNOWN';
      const entry = counts.get(stage) ?? { count: 0, value: 0 };
      entry.count++;
      entry.value += Number(l.estimatedValue || 0);
      counts.set(stage, entry);
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  });

  stageLabels = computed(() => this.stageBuckets().map(([stage]) => stage.replace(/_/g, ' ')));
  stageDatasets = computed<ChartCardDataset[]>(() => [
    { label: 'Leads', data: this.stageBuckets().map(([, v]) => v.count) },
  ]);
  stageValueDatasets = computed<ChartCardDataset[]>(() => [
    { label: 'Value (₹)', data: this.stageBuckets().map(([, v]) => v.value) },
  ]);

  followupColumns: TableColumn[] = [
    { key: 'companyName', header: 'Company' },
    { key: 'stage', header: 'Stage' },
    { key: 'nextFollowupAt', header: 'Follow-up Due' },
    { key: 'estimatedValue', header: 'Value' },
    { key: 'actions', header: '' },
  ];

  constructor(
    private svc: SalesService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.list({ bucket: 'open', limit: 500 }).subscribe({
      next: (r) => this.openLeads.set(r.items),
      error: () => this.error.set('Could not load open leads. Please try again.'),
    });
    this.svc.myFollowups().subscribe({
      next: (r) => {
        this.followups.set(r);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load follow-ups. Please try again.');
        this.loading.set(false);
      },
    });
  }

  goTo(route: string): void {
    this.router.navigate([route]);
  }

  openLead(lead: Lead): void {
    this.router.navigate(['/sales/leads', lead.id]);
  }
}

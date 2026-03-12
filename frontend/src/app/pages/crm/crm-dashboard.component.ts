import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { DashboardService } from '../../core/dashboard.service';
import { CrmDueItemsService } from '../../core/crm-due-items.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../shared/ui';
import {
  ComplianceDueItem,
  CrmKpis,
  CrmLowCoverageResponse,
  CrmPendingDocumentsResponse,
  CrmQueriesResponse,
  PriorityItem,
  RiskClient,
  UpcomingAudit,
} from './crm-dashboard.dto';
import { DueKpis } from '../../shared/models/crm-due-items.model';

type DueTab = 'OVERDUE' | 'DUE_SOON' | 'THIS_MONTH';

interface ActionShortcut {
  label: string;
  route: string;
  query?: Record<string, string>;
}

interface TrendPoint {
  month: string;
  overdue: number;
  completed: number;
  thisMonth: number;
}

interface AgeingBucket {
  label: string;
  count: number;
  pct: number;
}

@Component({
  selector: 'app-crm-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './crm-dashboard.component.html',
  styleUrls: ['./crm-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrmDashboardComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = false;
  detailLoading = false;
  errorMsg = '';

  dueTab: DueTab = 'OVERDUE';

  kpis: CrmKpis = {
    assignedClientsCount: 0,
    compliancePct: 0,
    pendingReviewCount: 0,
    reuploadRequiredCount: 0,
    overdueCount: 0,
    expiring30Count: 0,
    openObservationsCount: 0,
    mcdPendingCount: 0,
  };

  dueItems: ComplianceDueItem[] = [];
  lowCoverage: CrmLowCoverageResponse['items'] = [];
  pendingDocs: CrmPendingDocumentsResponse['items'] = [];
  openQueries: CrmQueriesResponse['items'] = [];
  priorityItems: PriorityItem[] = [];
  riskClients: RiskClient[] = [];
  upcomingAudits: UpcomingAudit[] = [];

  renewalsCount = 0;
  amendmentsCount = 0;
  registrationsHintCount = 0;

  trend: TrendPoint[] = [];
  ageing: AgeingBucket[] = [];

  readonly shortcuts: ActionShortcut[] = [
    { label: 'Open Review Queue', route: '/crm/branch-docs-review' },
    { label: 'Returns Workspace', route: '/crm/returns' },
    { label: 'Renewals Queue', route: '/crm/registrations', query: { focus: 'RENEWAL' } },
    { label: 'Amendments Queue', route: '/crm/registrations', query: { focus: 'AMENDMENT' } },
    { label: 'Compliance Tracker', route: '/crm/compliance-tracker' },
    { label: 'Audit Management', route: '/crm/audits' },
  ];

  constructor(
    private readonly dashboardSvc: DashboardService,
    private readonly dueItemsSvc: CrmDueItemsService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAll(): void {
    this.loading = true;
    this.errorMsg = '';

    forkJoin({
      kpis: this.dashboardSvc.getCrmKpis().pipe(catchError(() => of(this.kpis))),
      due: this.dashboardSvc.getCrmDueCompliances({ tab: this.dueTab, limit: '20' }).pipe(
        catchError(() => of({ items: [] as ComplianceDueItem[] })),
      ),
      lowCoverage: this.dashboardSvc.getCrmLowCoverage({ limit: '12' }).pipe(
        catchError(() => of({ items: [] })),
      ),
      pendingDocs: this.dashboardSvc.getCrmPendingDocuments({ limit: '12' }).pipe(
        catchError(() => of({ items: [] })),
      ),
      queries: this.dashboardSvc.getCrmQueries({ status: 'UNREAD', limit: '8' }).pipe(
        catchError(() => of({ items: [] })),
      ),
      priority: this.dashboardSvc.getCrmPriorityToday(12).pipe(catchError(() => of({ items: [] }))),
      risk: this.dashboardSvc.getCrmTopRiskClients(8).pipe(catchError(() => of({ items: [] }))),
      audits: this.dashboardSvc.getCrmUpcomingAudits(15).pipe(catchError(() => of({ items: [] }))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ kpis, due, lowCoverage, pendingDocs, queries, priority, risk, audits }) => {
          this.kpis = kpis || this.kpis;
          this.dueItems = due?.items || [];
          this.lowCoverage = lowCoverage?.items || [];
          this.pendingDocs = pendingDocs?.items || [];
          this.openQueries = queries?.items || [];
          this.priorityItems = priority?.items || [];
          this.riskClients = risk?.items || [];
          this.upcomingAudits = audits?.items || [];

          this.computeAgeing();
          this.loadCrossWorkflowCounts();
          this.loadTrend();
        },
        error: (err) => {
          this.errorMsg = err?.error?.message || 'Failed to load CRM dashboard.';
          this.toast.error(this.errorMsg);
        },
      });
  }

  setDueTab(tab: DueTab): void {
    if (this.dueTab === tab) return;
    this.dueTab = tab;
    this.loadDueTab();
  }

  loadDueTab(): void {
    this.detailLoading = true;
    this.dashboardSvc
      .getCrmDueCompliances({ tab: this.dueTab, limit: '20' })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.detailLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.dueItems = res?.items || [];
        },
        error: () => {
          this.dueItems = [];
          this.toast.error('Unable to load due compliances tab.');
        },
      });
  }

  openShortcut(shortcut: ActionShortcut): void {
    this.router.navigate([shortcut.route], {
      queryParams: shortcut.query || undefined,
    });
  }

  openReviewQueue(): void {
    this.router.navigate(['/crm/branch-docs-review']);
  }

  openClientWorkspace(clientId: string): void {
    if (!clientId) return;
    this.router.navigate(['/crm/clients', clientId, 'overview']);
  }

  openComplianceTracker(tab?: string): void {
    this.router.navigate(['/crm/compliance-tracker'], {
      queryParams: tab ? { tab } : undefined,
    });
  }

  openWorkflowBoard(kind: 'RENEWAL' | 'AMENDMENT' | 'REGISTRATION'): void {
    if (kind === 'RENEWAL') {
      this.router.navigate(['/crm/registrations'], { queryParams: { focus: 'RENEWAL' } });
      return;
    }
    if (kind === 'AMENDMENT') {
      this.router.navigate(['/crm/registrations'], { queryParams: { focus: 'AMENDMENT' } });
      return;
    }
    this.router.navigate(['/crm/registrations'], { queryParams: { focus: 'REGISTRATION' } });
  }

  complianceCardClass(value: number): string {
    if (value >= 80) return 'kpi-card good';
    if (value >= 50) return 'kpi-card warn';
    return 'kpi-card bad';
  }

  trendOverdueWidth(row: TrendPoint): number {
    const max = Math.max(...this.trend.map((x) => x.overdue), 1);
    return Math.max(8, Math.round((row.overdue / max) * 100));
  }

  trendCompletedWidth(row: TrendPoint): number {
    const max = Math.max(...this.trend.map((x) => x.completed), 1);
    return Math.max(8, Math.round((row.completed / max) * 100));
  }

  trackById(_idx: number, row: any): string {
    return String(
      row?.id ||
        row?.clientId ||
        row?.queryId ||
        row?.refId ||
        row?.auditId ||
        row?.branchId ||
        _idx,
    );
  }

  private loadCrossWorkflowCounts(): void {
    const month = this.currentMonth();
    forkJoin({
      renewals: this.dueItemsSvc
        .list({ month, tab: 'OVERDUE', category: 'RENEWAL', page: 1, limit: 1 })
        .pipe(catchError(() => of({ total: 0 } as any))),
      amendments: this.dueItemsSvc
        .list({ month, tab: 'OVERDUE', category: 'AMENDMENT', page: 1, limit: 1 })
        .pipe(catchError(() => of({ total: 0 } as any))),
      registrationsHint: this.dashboardSvc
        .getCrmDueCompliances({ tab: 'OVERDUE', limit: '100' })
        .pipe(catchError(() => of({ items: [] as ComplianceDueItem[] }))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ renewals, amendments, registrationsHint }) => {
          this.renewalsCount = Number(renewals?.total || 0);
          this.amendmentsCount = Number(amendments?.total || 0);
          this.registrationsHintCount = (registrationsHint?.items || []).filter((item) =>
            String(item?.complianceItem || '')
              .toLowerCase()
              .includes('regist'),
          ).length;
          this.cdr.markForCheck();
        },
      });
  }

  private loadTrend(): void {
    const months = this.lastMonths(4);
    const calls = months.map((month) =>
      this.dueItemsSvc
        .getKpis({ month })
        .pipe(catchError(() => of({ overdue: 0, dueSoon: 0, thisMonth: 0, completed: 0 } as DueKpis))),
    );

    forkJoin(calls)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => {
          this.trend = rows.map((kpi, idx) => ({
            month: months[idx],
            overdue: Number(kpi?.overdue || 0),
            completed: Number(kpi?.completed || 0),
            thisMonth: Number(kpi?.thisMonth || 0),
          }));
          this.cdr.markForCheck();
        },
      });
  }

  private computeAgeing(): void {
    const buckets = { '0-3d': 0, '4-7d': 0, '8+d': 0 };
    for (const item of this.priorityItems || []) {
      const days = Number(item?.daysOverdue || 0);
      if (days <= 3) buckets['0-3d'] += 1;
      else if (days <= 7) buckets['4-7d'] += 1;
      else buckets['8+d'] += 1;
    }
    const total = Math.max(1, this.priorityItems.length);
    this.ageing = [
      { label: '0-3d', count: buckets['0-3d'], pct: Math.round((buckets['0-3d'] / total) * 100) },
      { label: '4-7d', count: buckets['4-7d'], pct: Math.round((buckets['4-7d'] / total) * 100) },
      { label: '8+d', count: buckets['8+d'], pct: Math.round((buckets['8+d'] / total) * 100) },
    ];
  }

  private currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private lastMonths(count: number): string[] {
    const out: string[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = count - 1; i >= 0; i -= 1) {
      const x = new Date(d);
      x.setMonth(d.getMonth() - i);
      out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }
}

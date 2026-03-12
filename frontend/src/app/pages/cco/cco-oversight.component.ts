import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { CcoDashboardService } from '../../core/cco-dashboard.service';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../shared/ui';

interface OversightTaskRow {
  id: string;
  clientId: string;
  branchId: string;
  crmId: string;
  crmName: string;
  ownerUserId: string;
  ownerName: string;
  client: string;
  branch: string;
  ageDays: number;
  lastActionNote: string;
  dueDate: string;
  status: string;
  escalatedAt: string;
}

interface DelayPatternRow {
  clientId: string;
  branchId: string;
  crmId: string;
  crmName: string;
  client: string;
  branch: string;
  repeatedCount: number;
  openCount: number;
  avgDelayDays: number;
  latestEscalation: string;
}

interface TopOverdueRow {
  client: string;
  branch: string;
  count: number;
}

interface CrmSnapshotRow {
  name: string;
  email: string;
  clientCount: number;
  overdueCount: number;
  status: string;
}

interface OversightTrendRow {
  month: string;
  totalTouched: number;
  escalatedCount: number;
  overdueCount: number;
  closedCount: number;
}

interface OversightGuardrail {
  key: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  title: string;
  detail: string;
  route: string;
}

@Component({
  selector: 'app-cco-oversight',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './cco-oversight.component.html',
  styleUrls: ['./cco-oversight.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CcoOversightComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  queueLoading = false;
  error: string | null = null;

  search = '';
  statusFilter = 'ALL';
  trendMonths = 6;

  dashboard: any = null;
  oversightRows: OversightTaskRow[] = [];
  filteredQueue: OversightTaskRow[] = [];
  delayPatterns: DelayPatternRow[] = [];
  trendRows: OversightTrendRow[] = [];
  topOverdueRows: TopOverdueRow[] = [];
  crmSnapshot: CrmSnapshotRow[] = [];

  constructor(
    private readonly ccoApi: CcoDashboardService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadOversight();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get riskSignalsCount(): number {
    const overdue = Number(this.dashboard?.overdueTasks || 0);
    const escalations = Number(this.dashboard?.escalations || 0);
    const repeated = this.delayPatterns.length;
    return overdue + escalations + repeated;
  }

  get repeatedDelayCount(): number {
    return this.delayPatterns.length;
  }

  get averageDelayDays(): number {
    if (!this.delayPatterns.length) return 0;
    const total = this.delayPatterns.reduce((sum, row) => sum + (row.avgDelayDays || 0), 0);
    return Number((total / this.delayPatterns.length).toFixed(1));
  }

  get queueOpenCount(): number {
    return this.oversightRows.filter((row) =>
      ['OVERDUE', 'PENDING', 'IN_PROGRESS', 'OPEN'].includes(this.normalizeStatus(row.status)),
    ).length;
  }

  get overdueEscalationCount(): number {
    return this.oversightRows.filter((row) => this.normalizeStatus(row.status) === 'OVERDUE').length;
  }

  get ownerlessEscalationCount(): number {
    return this.oversightRows.filter((row) => {
      const owner = String(row.ownerName || '').trim().toUpperCase();
      return !owner || owner === '-' || owner === 'UNASSIGNED';
    }).length;
  }

  get agedEscalationCount(): number {
    return this.oversightRows.filter((row) => Number(row.ageDays || 0) >= 10).length;
  }

  get repeatedCriticalCount(): number {
    return this.delayPatterns.filter((row) =>
      Number(row.repeatedCount || 0) >= 3 || Number(row.avgDelayDays || 0) >= 12,
    ).length;
  }

  get oversightGuardrails(): OversightGuardrail[] {
    const alerts: OversightGuardrail[] = [];
    if (this.overdueEscalationCount > 0) {
      alerts.push({
        key: 'overdue-escalations',
        severity: 'CRITICAL',
        title: 'Overdue escalations require action',
        detail: `${this.overdueEscalationCount} escalated items are currently overdue.`,
        route: '/cco/escalations',
      });
    }
    if (this.ownerlessEscalationCount > 0) {
      alerts.push({
        key: 'ownerless',
        severity: 'HIGH',
        title: 'Owner assignment gaps',
        detail: `${this.ownerlessEscalationCount} queue rows have no clear owner.`,
        route: '/cco/escalations',
      });
    }
    if (this.agedEscalationCount > 0) {
      alerts.push({
        key: 'aged',
        severity: 'HIGH',
        title: 'Aged escalations accumulating',
        detail: `${this.agedEscalationCount} escalations are 10+ days old.`,
        route: '/cco/oversight',
      });
    }
    if (this.repeatedCriticalCount > 0) {
      alerts.push({
        key: 'repeat-delays',
        severity: 'MEDIUM',
        title: 'Repeated delay clusters detected',
        detail: `${this.repeatedCriticalCount} client-branch clusters show repeated or severe delays.`,
        route: '/cco/crm-performance',
      });
    }
    return alerts;
  }

  onStatusFilterChange(): void {
    this.refreshQueue();
  }

  onTrendMonthsChange(value: string | number): void {
    const months = Number(value);
    this.trendMonths = Number.isFinite(months) ? months : 6;
    this.refreshTrends();
  }

  loadOversight(): void {
    this.loading = true;
    this.error = null;

    forkJoin({
      dashboard: this.ccoApi.getDashboard().pipe(catchError(() => of(null))),
      oversight: this.ccoApi
        .getOversight(this.getStatusParam())
        .pipe(catchError(() => of([] as any[]))),
      delays: this.ccoApi.getOversightDelays().pipe(catchError(() => of([] as any[]))),
      trends: this.ccoApi
        .getOversightTrends(this.trendMonths)
        .pipe(catchError(() => of([] as any[]))),
      crms: this.ccoApi.getCrmsUnderMe().pipe(catchError(() => of([] as any[]))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ dashboard, oversight, delays, trends, crms }) => {
          this.dashboard = dashboard || {};
          this.oversightRows = this.normalizeOversightRows(oversight);
          this.topOverdueRows = this.normalizeTopOverdue(dashboard?.topOverdue);
          this.crmSnapshot = this.normalizeCrmSnapshot(crms);
          this.delayPatterns = this.normalizeDelayPatterns(delays);
          if (!this.delayPatterns.length) {
            this.delayPatterns = this.buildDelayPatterns(this.oversightRows);
          }
          this.trendRows = this.normalizeTrendRows(trends);
          this.applyQueueFilters();
        },
        error: (err: any) => {
          this.error = err?.error?.message || 'Failed to load oversight exception center.';
          this.dashboard = {};
          this.oversightRows = [];
          this.filteredQueue = [];
          this.delayPatterns = [];
          this.trendRows = [];
          this.topOverdueRows = [];
          this.crmSnapshot = [];
        },
      });
  }

  applyQueueFilters(): void {
    const term = this.search.trim().toLowerCase();
    this.filteredQueue = this.oversightRows.filter((row) => {
      if (this.statusFilter !== 'ALL' && this.normalizeStatus(row.status) !== this.statusFilter) {
        return false;
      }
      if (!term) return true;
      return (
        (row.client || '').toLowerCase().includes(term) ||
        (row.branch || '').toLowerCase().includes(term) ||
        (row.crmName || '').toLowerCase().includes(term) ||
        (row.ownerName || '').toLowerCase().includes(term) ||
        (row.id || '').toLowerCase().includes(term)
      );
    });
    this.cdr.markForCheck();
  }

  private refreshQueue(): void {
    this.queueLoading = true;
    this.ccoApi
      .getOversight(this.getStatusParam())
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([] as any[])),
        finalize(() => {
          this.queueLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((rows) => {
        this.oversightRows = this.normalizeOversightRows(rows);
        if (!this.delayPatterns.length) {
          this.delayPatterns = this.buildDelayPatterns(this.oversightRows);
        }
        this.applyQueueFilters();
      });
  }

  private refreshTrends(): void {
    this.ccoApi
      .getOversightTrends(this.trendMonths)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([] as any[])),
      )
      .subscribe((rows) => {
        this.trendRows = this.normalizeTrendRows(rows);
        this.cdr.markForCheck();
      });
  }

  private normalizeOversightRows(rows: any[]): OversightTaskRow[] {
    return (Array.isArray(rows) ? rows : [])
      .map((row: any) => ({
        id: String(row?.id || ''),
        clientId: String(row?.clientId || ''),
        branchId: String(row?.branchId || ''),
        crmId: String(row?.crmId || ''),
        crmName: String(row?.crmName || '-'),
        ownerUserId: String(row?.ownerUserId || ''),
        ownerName: String(row?.ownerName || '-'),
        client: String(row?.client || 'Unknown Client'),
        branch: String(row?.branch || '-'),
        ageDays: Number(row?.ageDays || 0),
        lastActionNote: String(row?.lastActionNote || ''),
        dueDate: String(row?.dueDate || ''),
        status: String(row?.status || 'PENDING'),
        escalatedAt: String(row?.escalatedAt || ''),
      }))
      .filter((row) => !!row.id)
      .sort((a, b) => {
        const x = new Date(a.escalatedAt || a.dueDate || 0).getTime();
        const y = new Date(b.escalatedAt || b.dueDate || 0).getTime();
        return y - x;
      });
  }

  private normalizeDelayPatterns(rows: any): DelayPatternRow[] {
    return (Array.isArray(rows) ? rows : [])
      .map((row: any) => ({
        clientId: String(row?.clientId || ''),
        branchId: String(row?.branchId || ''),
        crmId: String(row?.crmId || ''),
        crmName: String(row?.crmName || '-'),
        client: String(row?.client || 'Unknown Client'),
        branch: String(row?.branch || '-'),
        repeatedCount: Number(row?.repeatedCount || 0),
        openCount: Number(row?.openCount || 0),
        avgDelayDays: Number(row?.avgDelayDays || 0),
        latestEscalation: String(row?.latestEscalation || ''),
      }))
      .filter((row) => row.repeatedCount > 0)
      .sort((a, b) => b.repeatedCount - a.repeatedCount || b.openCount - a.openCount);
  }

  private normalizeTrendRows(rows: any): OversightTrendRow[] {
    return (Array.isArray(rows) ? rows : [])
      .map((row: any) => ({
        month: String(row?.month || ''),
        totalTouched: Number(row?.totalTouched || 0),
        escalatedCount: Number(row?.escalatedCount || 0),
        overdueCount: Number(row?.overdueCount || 0),
        closedCount: Number(row?.closedCount || 0),
      }))
      .filter((row) => !!row.month)
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  private normalizeTopOverdue(rows: any): TopOverdueRow[] {
    return (Array.isArray(rows) ? rows : [])
      .map((row: any) => ({
        client: String(row?.client || 'Unknown Client'),
        branch: String(row?.branch || '-'),
        count: Number(row?.count || 0),
      }))
      .sort((a, b) => b.count - a.count);
  }

  private normalizeCrmSnapshot(rows: any): CrmSnapshotRow[] {
    return (Array.isArray(rows) ? rows : [])
      .map((row: any) => ({
        name: String(row?.name || 'Unknown CRM'),
        email: String(row?.email || '-'),
        clientCount: Number(row?.clientCount || 0),
        overdueCount: Number(row?.overdueCount || 0),
        status: String(row?.status || 'UNKNOWN'),
      }))
      .sort((a, b) => b.overdueCount - a.overdueCount);
  }

  private buildDelayPatterns(rows: OversightTaskRow[]): DelayPatternRow[] {
    const grouped = new Map<string, OversightTaskRow[]>();
    for (const row of rows) {
      const key = `${row.client}__${row.branch}`;
      const arr = grouped.get(key) || [];
      arr.push(row);
      grouped.set(key, arr);
    }

    const patterns: DelayPatternRow[] = [];
    for (const list of grouped.values()) {
      if (list.length < 2) continue;
      const latestEscalation = list
        .map((row) => row.escalatedAt)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
      patterns.push({
        clientId: '',
        branchId: '',
        crmId: '',
        crmName: '-',
        client: list[0].client,
        branch: list[0].branch,
        repeatedCount: list.length,
        openCount: list.filter((row) =>
          ['OVERDUE', 'PENDING', 'IN_PROGRESS', 'OPEN'].includes(this.normalizeStatus(row.status)),
        ).length,
        avgDelayDays:
          Number(
            (
              list.reduce((sum, row) => sum + Number(row.ageDays || 0), 0) /
              Math.max(1, list.length)
            ).toFixed(1),
          ) || 0,
        latestEscalation,
      });
    }
    return patterns.sort((a, b) => b.repeatedCount - a.repeatedCount);
  }

  private getStatusParam(): string | undefined {
    return this.statusFilter !== 'ALL' ? this.statusFilter : undefined;
  }

  private normalizeStatus(status: string): string {
    return String(status || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  guardrailClass(severity: OversightGuardrail['severity']): string {
    if (severity === 'CRITICAL') return 'guardrail guardrail-critical';
    if (severity === 'HIGH') return 'guardrail guardrail-high';
    return 'guardrail guardrail-medium';
  }
}

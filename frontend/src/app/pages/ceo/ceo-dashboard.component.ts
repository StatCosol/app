import { Component, OnInit, signal, computed, inject, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { timeout, finalize, catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CeoDashboardService, CeoSummary, CeoClientOverviewItem,
  CeoCcoCrmPerformanceItem, CeoGovernanceCompliance, CeoEscalationItem,
  CeoComplianceTrendItem, CeoBranchRankingItem, CeoAuditClosureTrendItem,
} from './ceo-dashboard.service';
import {
  PageHeaderComponent, ActionButtonComponent, LoadingSpinnerComponent,
  DataTableComponent, TableCellDirective, TableColumn, StatusBadgeComponent,
  EmptyStateComponent,
} from '../../shared/ui';

interface ExecutiveGuardrail {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  title: string;
  detail: string;
  route: '/ceo/approvals' | '/ceo/escalations' | '/ceo/oversight' | '/ceo/reports';
  actionLabel: string;
}

@Component({
  selector: 'app-ceo-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, PageHeaderComponent, ActionButtonComponent, LoadingSpinnerComponent,
    DataTableComponent, TableCellDirective, StatusBadgeComponent, EmptyStateComponent,
  ],
  templateUrl: './ceo-dashboard.component.html',
  styleUrls: ['./ceo-dashboard.component.scss'],
})
export class CeoDashboardComponent implements OnInit {
  private readonly dashboardService = inject(CeoDashboardService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  loading = signal(true);
  errorMsg = signal<string | null>(null);

  // Summary KPIs
  summary = signal<CeoSummary>({
    totalClients: 0, totalBranches: 0, teamSize: 0,
    activeAudits: 0, overdueCompliances: 0, pendingApprovals: 0,
    complianceScore30d: 0,
  });

  // Governance & compliance
  governance = signal<CeoGovernanceCompliance>({
    completedAudits: 0, pendingAudits: 0, criticalObservations: 0,
    compliantItems: 0, overdueItems: 0, dueSoonItems: 0,
    overallComplianceRate: 0, auditCompletionRate90d: 0,
  });

  // Client overview
  clientOverview = signal<CeoClientOverviewItem[]>([]);
  topOverdueClients = computed(() =>
    [...this.clientOverview()]
      .sort((a, b) => (b.overdueCount || 0) - (a.overdueCount || 0))
      .slice(0, 10),
  );

  // Team performance
  teamPerformance = signal<CeoCcoCrmPerformanceItem[]>([]);

  // Escalations
  escalations = signal<CeoEscalationItem[]>([]);

  // Compliance Trend (monthly)
  complianceTrend = signal<CeoComplianceTrendItem[]>([]);
  topRiskBranches = signal<CeoBranchRankingItem[]>([]);
  bottomRiskBranches = signal<CeoBranchRankingItem[]>([]);
  auditClosureTrend = signal<CeoAuditClosureTrendItem[]>([]);

  // Table column defs
  clientOverviewColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'clientCode', header: 'Code' },
    { key: 'branchCount', header: 'Branches', align: 'center' },
    { key: 'overdueCount', header: 'Overdue', align: 'center' },
    { key: 'activeAudits', header: 'Active Audits', align: 'center' },
    { key: 'crmName', header: 'CRM' },
  ];

  teamColumns: TableColumn[] = [
    { key: 'userName', header: 'Name', sortable: true },
    { key: 'roleCode', header: 'Role', align: 'center' },
    { key: 'clientCount', header: 'Clients', align: 'center' },
    { key: 'branchCount', header: 'Branches', align: 'center' },
    { key: 'overdueCount', header: 'Overdue', align: 'center' },
    { key: 'complianceScore', header: 'Score %', align: 'center' },
  ];

  escalationColumns: TableColumn[] = [
    { key: 'requestedByName', header: 'Requested By' },
    { key: 'requestType', header: 'Type' },
    { key: 'entityName', header: 'Entity' },
    { key: 'reason', header: 'Reason' },
    { key: 'status', header: 'Status', align: 'center' },
    { key: 'createdAt', header: 'Date' },
  ];

  branchRankingColumns: TableColumn[] = [
    { key: 'branchName', header: 'Branch' },
    { key: 'clientName', header: 'Client' },
    { key: 'complianceRate', header: 'Compliance %', align: 'center' },
    { key: 'overdueCount', header: 'Overdue', align: 'center' },
    { key: 'riskScore', header: 'Risk', align: 'center' },
  ];

  auditClosureColumns: TableColumn[] = [
    { key: 'month', header: 'Month' },
    { key: 'completedAudits', header: 'Closed', align: 'center' },
    { key: 'openAudits', header: 'Open', align: 'center' },
    { key: 'closureRate', header: 'Closure %', align: 'center' },
  ];

  constructor(
  ) {}

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loading.set(true);
    this.errorMsg.set(null);

    const defaults = {
      summary: this.summary(),
      governance: this.governance(),
    };

    forkJoin({
      summary: this.dashboardService.getSummary().pipe(catchError(() => of(defaults.summary))),
      governance: this.dashboardService.getGovernanceCompliance().pipe(catchError(() => of(defaults.governance))),
      clients: this.dashboardService.getClientOverview({ limit: 100 }).pipe(catchError(() => of({ items: [] }))),
      team: this.dashboardService.getCcoCrmPerformance().pipe(catchError(() => of({ items: [] }))),
      escalations: this.dashboardService.getRecentEscalations({ limit: 10, status: 'PENDING' }).pipe(catchError(() => of({ items: [] }))),
      trend: this.dashboardService.getComplianceTrend(12).pipe(catchError(() => of({ items: [] }))),
      branchRankings: this.dashboardService.getBranchRankings(undefined, 10).pipe(catchError(() => of({ month: null, topRisk: [], bottomRisk: [] }))),
      closureTrend: this.dashboardService.getAuditClosureTrend(12).pipe(catchError(() => of({ items: [] }))),
    }).pipe(
      takeUntilDestroyed(this.destroyRef),
      timeout(15000),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: ({ summary, governance, clients, team, escalations, trend, branchRankings, closureTrend }) => {
        this.summary.set(summary || defaults.summary);
        this.governance.set(governance || defaults.governance);
        this.clientOverview.set(clients?.items || []);
        this.teamPerformance.set(team?.items || []);
        this.escalations.set(escalations?.items || []);
        this.complianceTrend.set(trend?.items || []);
        this.topRiskBranches.set(branchRankings?.topRisk || []);
        this.bottomRiskBranches.set(branchRankings?.bottomRisk || []);
        this.auditClosureTrend.set(closureTrend?.items || []);

        if (!summary || !governance) {
          this.errorMsg.set('Some dashboard widgets could not be loaded. Partial data shown.');
        }
      },
      error: (err: any) => {
        this.errorMsg.set(err?.error?.message || 'Failed to load executive dashboard');
      },
    });
  }

  complianceColor = computed(() => {
    const rate = this.governance().overallComplianceRate;
    if (rate >= 80) return '#10b981';
    if (rate >= 60) return '#f59e0b';
    return '#ef4444';
  });

  auditCompletionColor = computed(() => {
    const rate = this.governance().auditCompletionRate90d;
    if (rate >= 80) return '#10b981';
    if (rate >= 60) return '#f59e0b';
    return '#ef4444';
  });

  goToApprovals() {
    this.router.navigate(['/ceo/approvals']);
  }

  goToEscalations() {
    this.router.navigate(['/ceo/escalations']);
  }

  goToOversight() {
    this.router.navigate(['/ceo/oversight']);
  }

  executiveGuardrails = computed<ExecutiveGuardrail[]>(() => {
    const alerts: ExecutiveGuardrail[] = [];
    const lowScoreTeam = this.teamPerformance().filter((row) => Number(row.complianceScore || 0) < 70).length;
    const highRiskClients = this.topOverdueClients().filter((row) => Number(row.overdueCount || 0) > 0).length;
    const openEscalations = this.escalations().filter((row) => String(row.status || '').toUpperCase() !== 'RESOLVED').length;
    const latestClosures = this.auditClosureTrend().slice(-3);
    const lowClosureMonths = latestClosures.filter((row) => Number(row.closureRate || 0) < 70).length;

    if (this.summary().pendingApprovals > 0) {
      alerts.push({
        severity: 'CRITICAL',
        title: 'Pending approval queue building up',
        detail: `${this.summary().pendingApprovals} approvals are pending executive decision.`,
        route: '/ceo/approvals',
        actionLabel: 'Open Approvals',
      });
    }
    if (openEscalations > 0) {
      alerts.push({
        severity: 'HIGH',
        title: 'Unresolved escalation pressure',
        detail: `${openEscalations} escalations are still unresolved.`,
        route: '/ceo/escalations',
        actionLabel: 'Open Escalations',
      });
    }
    if (highRiskClients > 0) {
      alerts.push({
        severity: 'HIGH',
        title: 'Risk clients need board attention',
        detail: `${highRiskClients} clients show overdue exposure in current ranking.`,
        route: '/ceo/oversight',
        actionLabel: 'Review Oversight',
      });
    }
    if (lowScoreTeam > 0 || lowClosureMonths > 0) {
      alerts.push({
        severity: 'MEDIUM',
        title: 'Delivery quality trend below target',
        detail: `${lowScoreTeam} team members are below 70% score, ${lowClosureMonths} recent months below 70% closure.`,
        route: '/ceo/reports',
        actionLabel: 'Open Reports',
      });
    }
    return alerts;
  });

  guardrailClass(severity: ExecutiveGuardrail['severity']): string {
    if (severity === 'CRITICAL') return 'border-red-200 bg-red-50';
    if (severity === 'HIGH') return 'border-orange-200 bg-orange-50';
    return 'border-amber-200 bg-amber-50';
  }

  openGuardrail(route: ExecutiveGuardrail['route']): void {
    this.router.navigate([route]);
  }

  /** Format month label (YYYY-MM → Mon YY) */
  formatMonth(month: string): string {
    const [y, m] = month.split('-');
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${names[+m - 1]} '${y.slice(2)}`;
  }

  /** Get bar height for compliance trend (max 100%) */
  getTrendBarHeight(rate: number): number {
    return Math.max(rate, 2); // minimum 2% so the bar is visible
  }

  getTrendColor(rate: number): string {
    if (rate >= 80) return '#10b981';
    if (rate >= 60) return '#f59e0b';
    return '#ef4444';
  }

  getRiskColor(score: number): string {
    if (score >= 60) return '#ef4444';
    if (score >= 30) return '#f59e0b';
    return '#10b981';
  }

  /** Export dashboard summary as CSV */
  exportCSV() {
    const rows: string[] = [];
    const s = this.summary();
    const g = this.governance();
    const trend = this.complianceTrend();
    const overdue = this.topOverdueClients();
    const team = this.teamPerformance();
    const topRisk = this.topRiskBranches();
    const bottomRisk = this.bottomRiskBranches();
    const closure = this.auditClosureTrend();

    // Header
    rows.push('Section,Metric,Value');

    // Summary KPIs
    rows.push(`Summary,Total Clients,${s.totalClients}`);
    rows.push(`Summary,Total Branches,${s.totalBranches}`);
    rows.push(`Summary,Team Size,${s.teamSize}`);
    rows.push(`Summary,Active Audits,${s.activeAudits}`);
    rows.push(`Summary,Overdue Compliances,${s.overdueCompliances}`);
    rows.push(`Summary,Pending Approvals,${s.pendingApprovals}`);
    rows.push(`Summary,Compliance Score (30d),${s.complianceScore30d}%`);

    // Governance
    rows.push(`Governance,Overall Compliance Rate,${g.overallComplianceRate}%`);
    rows.push(`Governance,Audit Completion Rate (90d),${g.auditCompletionRate90d}%`);
    rows.push(`Governance,Compliant Items,${g.compliantItems}`);
    rows.push(`Governance,Overdue Items,${g.overdueItems}`);
    rows.push(`Governance,Critical Observations,${g.criticalObservations}`);

    // Trend
    if (trend.length) {
      rows.push('');
      rows.push('Month,Compliance Rate,Overdue,Audits,Audit Score');
      for (const t of trend) {
        rows.push(`${t.month},${t.complianceRate}%,${t.overdueItems},${t.totalAudits},${t.avgAuditScore}`);
      }
    }

    // Top Overdue Clients
    if (overdue.length) {
      rows.push('');
      rows.push('Client,Code,Branches,Overdue,Active Audits,CRM');
      for (const c of overdue) {
        rows.push(`"${c.clientName}",${c.clientCode},${c.branchCount},${c.overdueCount},${c.activeAudits},"${c.crmName || ''}"`);
      }
    }

    // Team Performance
    if (team.length) {
      rows.push('');
      rows.push('Name,Role,Clients,Branches,Overdue,Score');
      for (const t of team) {
        rows.push(`"${t.userName}",${t.roleCode},${t.clientCount},${t.branchCount},${t.overdueCount},${t.complianceScore}%`);
      }
    }

    if (topRisk.length) {
      rows.push('');
      rows.push('Top Risk Branches');
      rows.push('Branch,Client,Compliance %,Overdue,Risk');
      for (const b of topRisk) {
        rows.push(`"${b.branchName}","${b.clientName}",${b.complianceRate}%,${b.overdueCount},${b.riskScore}%`);
      }
    }

    if (bottomRisk.length) {
      rows.push('');
      rows.push('Best Performing Branches');
      rows.push('Branch,Client,Compliance %,Overdue,Risk');
      for (const b of bottomRisk) {
        rows.push(`"${b.branchName}","${b.clientName}",${b.complianceRate}%,${b.overdueCount},${b.riskScore}%`);
      }
    }

    if (closure.length) {
      rows.push('');
      rows.push('Month,Closed Audits,Open Audits,Closure Rate');
      for (const t of closure) {
        rows.push(`${t.month},${t.completedAudits},${t.openAudits},${t.closureRate}%`);
      }
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    a.download = `CEO_Dashboard_${now.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

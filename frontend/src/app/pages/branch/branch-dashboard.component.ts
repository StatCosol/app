import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, Subscription, forkJoin, of } from 'rxjs';
import { finalize, takeUntil, catchError } from 'rxjs/operators';
import Chart from 'chart.js/auto';
import { DashboardService } from '../../core/dashboard.service';
import { AuthService } from '../../core/auth.service';
import { LegitxDashboardService } from '../../core/legitx-dashboard.service';
import {
  BranchComplianceDocService,
  BranchComplianceKpis,
  FullComplianceDashboard,
} from '../../core/branch-compliance-doc.service';
import { AiRiskScoreComponent } from '../../shared/ui/ai-risk-score/ai-risk-score.component';
import { BranchAuditKpiComponent } from '../../shared/ui/branch-audit-kpi/branch-audit-kpi.component';
import {
  PfEsiSummaryResponse,
  ContractorUploadSummaryResponse,
} from '../client/dashboard/client-dashboard.types';
import {
  LegitxDashboardResponse,
  LegitxQueueItem,
} from '../client/dashboard/legitx-dashboard.dto';

type ChartKey = 'complianceTrend' | 'complianceOps' | 'auditDonut' | 'payrollDonut' | 'employeeStatus' | 'docsBucket' | 'mcdTrend' | 'riskGauge';

@Component({
  standalone: true,
  selector: 'app-branch-dashboard',
  imports: [CommonModule, FormsModule, RouterLink, AiRiskScoreComponent, BranchAuditKpiComponent],
  templateUrl: './branch-dashboard.component.html',
  styleUrls: ['../client/shared/client-theme.scss', './branch-dashboard.component.scss'],
})
export class BranchDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('complianceTrendChart') complianceTrendChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('complianceOpsChart') complianceOpsChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('auditDonutChart') auditDonutChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('payrollDonutChart') payrollDonutChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('employeeStatusChart') employeeStatusChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('docsBucketChart') docsBucketChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('mcdTrendChart') mcdTrendChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('riskGaugeChart') riskGaugeChart?: ElementRef<HTMLCanvasElement>;

  loading = true;
  errorMsg = '';

  data: LegitxDashboardResponse | null = null;
  pfEsiSummary: PfEsiSummaryResponse | null = null;
  contractorSummary: ContractorUploadSummaryResponse | null = null;
  mcdKpis: BranchComplianceKpis | null = null;
  complianceDash: FullComplianceDashboard | null = null;

  showPfModal = false;
  showEsiModal = false;

  /** The branch user's primary branchId (from JWT) */
  branchId = '';
  auditKpiFrom = '';
  auditKpiTo = '';

  filters = {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  };

  months = [
    { value: 1, label: 'Jan' },
    { value: 2, label: 'Feb' },
    { value: 3, label: 'Mar' },
    { value: 4, label: 'Apr' },
    { value: 5, label: 'May' },
    { value: 6, label: 'Jun' },
    { value: 7, label: 'Jul' },
    { value: 8, label: 'Aug' },
    { value: 9, label: 'Sep' },
    { value: 10, label: 'Oct' },
    { value: 11, label: 'Nov' },
    { value: 12, label: 'Dec' },
  ];

  years = (() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
  })();

  readonly palette = {
    green: '#16a34a',
    amber: '#f59e0b',
    red: '#ef4444',
    blue: '#2563eb',
    gray: '#9ca3af',
  };

  private charts: Partial<Record<ChartKey, Chart>> = {};
  private viewReady = false;
  private loadSub?: Subscription;
  private readonly destroy$ = new Subject<void>();

  get pfSummary() {
    return this.pfEsiSummary?.pf ?? { registered: 0, notRegisteredApplicable: 0, pendingEmployees: [] };
  }

  get esiSummary() {
    return this.pfEsiSummary?.esi ?? { registered: 0, notRegisteredApplicable: 0, pendingEmployees: [] };
  }

  /** Risk level color */
  get riskColor(): string {
    if (!this.complianceDash) return this.palette.gray;
    const level = this.complianceDash.riskLevel;
    if (level === 'HIGH') return this.palette.red;
    if (level === 'MEDIUM') return this.palette.amber;
    return this.palette.green;
  }

  /** Risk level badge class */
  get riskBadgeClass(): string {
    if (!this.complianceDash) return 'bg-gray-100 text-gray-600';
    const level = this.complianceDash.riskLevel;
    if (level === 'HIGH') return 'bg-red-100 text-red-700';
    if (level === 'MEDIUM') return 'bg-amber-100 text-amber-700';
    return 'bg-green-100 text-green-700';
  }

  constructor(
    private dashboard: DashboardService,
    private legitx: LegitxDashboardService,
    private auth: AuthService,
    private complianceDocs: BranchComplianceDocService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const ids = this.auth.getBranchIds();
    this.branchId = ids.length ? String(ids[0]) : '';
    this.load();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.data) {
      this.renderAllCharts();
    }
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyCharts();
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.loading = true;
    this.errorMsg = '';

    const monthStr = `${this.filters.year}-${this.two(this.filters.month)}`;

    this.auditKpiFrom = monthStr;
    this.auditKpiTo = monthStr;

    this.loadSub = forkJoin({
      legitx: this.legitx.getSummary({
        month: this.filters.month,
        year: this.filters.year,
        branchId: this.branchId || undefined,
      }).pipe(catchError(() => of(null as LegitxDashboardResponse | null))),
      pfEsi: this.dashboard.getClientPfEsiSummary({ month: monthStr }).pipe(
        catchError(() => of(null as PfEsiSummaryResponse | null)),
      ),
      contractor: this.dashboard.getClientContractorUploadSummary({ month: monthStr }).pipe(
        catchError(() => of(null as ContractorUploadSummaryResponse | null)),
      ),
      mcdKpis: this.complianceDocs.getBranchKpis({
        branchId: this.branchId,
        year: this.filters.year,
        month: this.filters.month,
      }).pipe(catchError(() => of(null as BranchComplianceKpis | null))),
      complianceDash: this.branchId
        ? this.complianceDocs.getFullDashboard({
            branchId: this.branchId,
            year: this.filters.year,
          }).pipe(catchError(() => of(null as FullComplianceDashboard | null)))
        : of(null as FullComplianceDashboard | null),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
          if (this.viewReady) {
            setTimeout(() => this.renderAllCharts(), 0);
          }
        }),
      )
      .subscribe({
        next: (res) => {
          this.data = res.legitx;
          this.pfEsiSummary = res.pfEsi;
          this.contractorSummary = res.contractor;
          this.mcdKpis = res.mcdKpis;
          this.complianceDash = res.complianceDash;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.errorMsg = 'Failed to load branch dashboard data.';
          this.data = null;
          this.pfEsiSummary = null;
          this.contractorSummary = null;
          this.complianceDash = null;
          this.destroyCharts();
          this.cdr.markForCheck();
        },
      });
  }

  togglePfModal(): void {
    this.showPfModal = !this.showPfModal;
    this.cdr.markForCheck();
  }

  toggleEsiModal(): void {
    this.showEsiModal = !this.showEsiModal;
    this.cdr.markForCheck();
  }

  queueBadgeClass(item: LegitxQueueItem): string {
    const age = item.ageDays ?? 0;
    if (age >= 16) return 'badge-critical';
    if (age >= 8) return 'badge-warning';
    return 'badge-info';
  }

  two(n: number): string {
    return String(n).padStart(2, '0');
  }

  /* ═══════ Charts ═══════ */

  private renderAllCharts(): void {
    this.destroyCharts();
    if (this.data && this.viewReady) {
      this.renderComplianceTrend();
      this.renderComplianceOps();
      this.renderAuditDonut();
      this.renderPayrollDonut();
      this.renderEmployeeStatus();
      this.renderDocsBucket();
    }
    if (this.complianceDash && this.viewReady) {
      this.renderMcdTrend();
      this.renderRiskGauge();
    }
  }

  private renderComplianceTrend(): void {
    if (!this.complianceTrendChart || !this.data) return;
    const d = this.data.charts.complianceTrend;
    this.charts.complianceTrend = new Chart(this.complianceTrendChart.nativeElement, {
      type: 'line',
      data: {
        labels: d.labels,
        datasets: [
          { data: d.overall, label: 'Overall %', borderColor: this.palette.blue, backgroundColor: 'rgba(37,99,235,0.12)', tension: 0.35, fill: true },
          { data: d.branchAvg, label: 'Branch Avg %', borderColor: this.palette.green, backgroundColor: 'rgba(22,163,74,0.12)', tension: 0.35, fill: false },
          { data: d.contractorAvg, label: 'Contractor Avg %', borderColor: this.palette.amber, backgroundColor: 'rgba(245,158,11,0.12)', tension: 0.35, fill: false },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' }, tooltip: { intersect: false, mode: 'index' } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  private renderComplianceOps(): void {
    if (!this.complianceOpsChart || !this.data) return;
    const d = this.data.charts.complianceOps;
    this.charts.complianceOps = new Chart(this.complianceOpsChart.nativeElement, {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [
          { label: 'Done', data: d.done, backgroundColor: this.palette.green, stack: 's' },
          { label: 'Pending', data: d.pending, backgroundColor: this.palette.amber, stack: 's' },
          { label: 'Overdue', data: d.overdue, backgroundColor: this.palette.red, stack: 's' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true },
        },
      },
    });
  }

  private renderAuditDonut(): void {
    if (!this.auditDonutChart || !this.data) return;
    const a = this.data.charts.auditCompletion;
    this.charts.auditDonut = new Chart(this.auditDonutChart.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Pending', 'Overdue'],
        datasets: [{ data: [a.completed, a.pending, a.overdue], backgroundColor: [this.palette.green, this.palette.blue, this.palette.red] }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  private renderPayrollDonut(): void {
    if (!this.payrollDonutChart || !this.data) return;
    const p = this.data.charts.payrollExceptions;
    this.charts.payrollDonut = new Chart(this.payrollDonutChart.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Pending Queries', 'PF Pending', 'ESI Pending', 'Pending F&F', 'Completed F&F'],
        datasets: [{
          data: [p.pendingQueries, p.pfPendingEmployees, p.esiPendingEmployees, p.pendingFF, p.completedFF],
          backgroundColor: [this.palette.red, this.palette.amber, '#d97706', this.palette.blue, this.palette.green],
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  private renderEmployeeStatus(): void {
    if (!this.employeeStatusChart || !this.data) return;
    const e = this.data.charts.employeeStatus;
    this.charts.employeeStatus = new Chart(this.employeeStatusChart.nativeElement, {
      type: 'bar',
      data: {
        labels: e.labels,
        datasets: [
          { label: 'Active', data: e.active, backgroundColor: this.palette.blue, stack: 's' },
          { label: 'Joiners', data: e.joiners, backgroundColor: this.palette.green, stack: 's' },
          { label: 'Left', data: e.left, backgroundColor: this.palette.gray, stack: 's' },
          { label: 'Absconded', data: e.absconded, backgroundColor: this.palette.red, stack: 's' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true },
        },
      },
    });
  }

  private renderDocsBucket(): void {
    if (!this.docsBucketChart || !this.data) return;
    const d = this.data.charts.contractorDocsBuckets;
    this.charts.docsBucket = new Chart(this.docsBucketChart.nativeElement, {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [{ data: d.values, label: 'Contractors', backgroundColor: this.palette.blue }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true },
        },
      },
    });
  }

  /** MCD Compliance Trend — 12-month line chart */
  private renderMcdTrend(): void {
    if (!this.mcdTrendChart || !this.complianceDash?.trend) return;
    const trend = this.complianceDash.trend;
    const labels = trend.map(t => this.months[t.month - 1]?.label || `M${t.month}`);
    const data = trend.map(t => t.percent);

    this.charts.mcdTrend = new Chart(this.mcdTrendChart.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          label: 'Compliance %',
          borderColor: this.palette.blue,
          backgroundColor: 'rgba(37,99,235,0.10)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: data.map(v => v >= 80 ? this.palette.green : v >= 50 ? this.palette.amber : this.palette.red),
          pointRadius: 5,
          pointHoverRadius: 7,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.y}% compliance`,
            },
          },
        },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  /** Risk Gauge — doughnut styled as a semi-circle gauge */
  private renderRiskGauge(): void {
    if (!this.riskGaugeChart || !this.complianceDash) return;
    const score = this.complianceDash.riskScore;
    const remaining = 100 - score;

    const gaugeColor = score >= 70 ? this.palette.red : score >= 40 ? this.palette.amber : this.palette.green;

    this.charts.riskGauge = new Chart(this.riskGaugeChart.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Risk', 'Safe'],
        datasets: [{
          data: [score, remaining],
          backgroundColor: [gaugeColor, '#e5e7eb'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        rotation: -90,
        circumference: 180,
        cutout: '75%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.label === 'Risk' ? `Risk Score: ${score}/100` : `Safe: ${remaining}/100`,
            },
          },
        },
      },
    });
  }

  private destroyCharts(): void {
    Object.values(this.charts).forEach((c) => c?.destroy());
    this.charts = {};
  }
}

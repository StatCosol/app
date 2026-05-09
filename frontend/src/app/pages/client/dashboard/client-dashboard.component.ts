import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Chart from 'chart.js/auto';
import { RouterModule } from '@angular/router';
import { Subject, Subscription, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { LegitxDashboardService } from '../../../core/legitx-dashboard.service';
import { DashboardService } from '../../../core/dashboard.service';
import { PfEsiSummaryResponse, ContractorUploadSummaryResponse } from './client-dashboard.types';
import { forkJoin } from 'rxjs';
import {
  LegitxDashboardResponse,
  LegitxQueueItem,
  LegitxToggle,
} from './legitx-dashboard.dto';
import { AiRiskApi, AiRiskBranchResponse } from '../../../core/api/ai-risk.api';
import { AiRiskScoreComponent } from '../../../shared/ui/ai-risk-score/ai-risk-score.component';
import { BranchAuditKpiComponent } from '../../../shared/ui/branch-audit-kpi/branch-audit-kpi.component';
import {
  BranchComplianceDocService,
  LowestBranch,
  ComplianceTrendPoint,
} from '../../../core/branch-compliance-doc.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { ReturnsService } from '../../../core/returns.service';
import { ComplianceCalendarItem } from '../../../core/models/returns.models';
import { ComplianceCalendarWidgetComponent } from '../../../shared/components/compliance-calendar-widget/compliance-calendar-widget.component';
import { ComplianceNotificationCenterComponent } from '../../../shared/components/compliance-notification-center/compliance-notification-center.component';
// Skeleton loading handled via CSS (no spinner component needed)

type ChartKey =
  | 'complianceTrend'
  | 'complianceOps'
  | 'branchRank'
  | 'auditDonut'
  | 'payrollDonut'
  | 'employeeStatus'
  | 'docsBucket';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-client-dashboard',
  imports: [CommonModule, FormsModule, RouterModule, AiRiskScoreComponent, BranchAuditKpiComponent, ComplianceCalendarWidgetComponent, ComplianceNotificationCenterComponent],
  templateUrl: './client-dashboard.component.html',
  styleUrls: ['../shared/client-theme.scss', './client-dashboard.component.scss'],
})
export class ClientDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('complianceTrendChart') complianceTrendChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('complianceOpsChart') complianceOpsChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('branchRankChart') branchRankChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('auditDonutChart') auditDonutChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('payrollDonutChart') payrollDonutChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('employeeStatusChart') employeeStatusChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild('docsBucketChart') docsBucketChart?: ElementRef<HTMLCanvasElement>;

  // Panel ViewChild refs for scroll-to-detail
  @ViewChild('payrollDetails') payrollDetails?: ElementRef;
  @ViewChild('contractorPanel') contractorPanel?: ElementRef;
  @ViewChild('employeePanel') employeePanel?: ElementRef;
  @ViewChild('branchPanel') branchPanel?: ElementRef;
  @ViewChild('compliancePanel') compliancePanel?: ElementRef;
  @ViewChild('auditPanel') auditPanel?: ElementRef;
  @ViewChild('aiRiskPanel') aiRiskPanel?: ElementRef;

  loading = false;
  errorMsg = '';
  data: LegitxDashboardResponse | null = null;
  pfEsiSummary: PfEsiSummaryResponse | null = null;
  contractorSummary: ContractorUploadSummaryResponse | null = null;

  branches: Array<{ id: string | number; name?: string; branchName?: string }> = [];
  contractors: Array<{ id: string | number; name: string; branchId?: string | number }> = [];
  filteredContractorList: Array<{ id: string | number; name: string; branchId?: string | number }> = [];

  // ── Detail panel state ──
  activeDetail: string | null = null;
  showPfModal = false;
  showEsiModal = false;

  // ── AI Risk Assessment state ──
  branchRiskLoading = false;
  branchRiskError = '';
  branchRiskOverview: AiRiskBranchResponse[] = [];
  auditKpiFrom = '';
  auditKpiTo = '';

  // ── Compliance Intelligence ──
  lowestBranches: LowestBranch[] = [];
  companyTrend: ComplianceTrendPoint[] = [];

  // ── Registration Compliance ──
  regSummary: { total: number; active: number; expiringSoon: number; expired: number; scoreImpact: number } | null = null;
  regAlerts: any[] = [];

  // ── Company Compliance Intelligence ──
  companySummary: any = null;
  exportingPack = false;

  // ── Compliance Calendar ──
  calendarItems: ComplianceCalendarItem[] = [];

  filters = {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    branchId: 'ALL' as string | number,
    contractorId: 'ALL' as string | number,
    toggle: 'ALL' as LegitxToggle,
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

  private charts: Partial<Record<ChartKey, Chart>> = {};
  private viewReady = false;
  private loadSub?: Subscription;
  private riskSub?: Subscription;
  private readonly destroy$ = new Subject<void>();

  // Safe fallbacks so template accessors stay non-null/defined
  get pfSummary() {
    return this.pfEsiSummary?.pf ?? { registered: 0, notRegisteredApplicable: 0, pendingEmployees: [] };
  }

  get esiSummary() {
    return this.pfEsiSummary?.esi ?? { registered: 0, notRegisteredApplicable: 0, pendingEmployees: [] };
  }

  readonly palette = {
    green: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
    blue: '#3b82f6',
    indigo: '#6366f1',
    gray: '#94a3b8',
    teal: '#14b8a6',
    rose: '#f43f5e',
  };

  get selectedBranchId(): string {
    return this.filters.branchId !== 'ALL' ? String(this.filters.branchId) : '';
  }

  constructor(
    private legitx: LegitxDashboardService,
    private dashboard: DashboardService,
    private aiRisk: AiRiskApi,
    private complianceDocs: BranchComplianceDocService,
    private clientBranches: ClientBranchesService,
    private returnsService: ReturnsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadCalendar();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.data) {
      this.renderAllCharts();
    }
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
    this.riskSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyCharts();
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.loading = true;
    this.errorMsg = '';
    const monthStr = `${this.filters.year}-${this.two(this.filters.month)}`;
    const branchIdParam = this.filters.branchId === 'ALL' ? undefined : String(this.filters.branchId);

    this.loadSub = forkJoin({
      legitx: this.legitx.getSummary({
        month: this.filters.month,
        year: this.filters.year,
        branchId: this.filters.branchId,
        contractorId: this.filters.contractorId,
        toggle: this.filters.toggle,
      }),
      pfEsi: this.dashboard.getClientPfEsiSummary({ month: monthStr, branchId: branchIdParam }).pipe(
        catchError(() => of(null as PfEsiSummaryResponse | null)),
      ),
      contractor: this.dashboard.getClientContractorUploadSummary({ month: monthStr, branchId: branchIdParam }).pipe(
        catchError(() => of(null as ContractorUploadSummaryResponse | null)),
      ),
      lowestBranches: this.complianceDocs.getLowestBranches({ year: this.filters.year, limit: 10 }).pipe(
        catchError(() => of([] as LowestBranch[])),
      ),
      companyTrend: this.complianceDocs.getCompanyTrend({ year: this.filters.year }).pipe(
        catchError(() => of([] as ComplianceTrendPoint[])),
      ),
      regSummary: this.clientBranches.getRegistrationSummary(branchIdParam).pipe(
        catchError(() => of(null)),
      ),
      regAlerts: this.clientBranches.getRegistrationAlerts(branchIdParam).pipe(
        catchError(() => of([])),
      ),
      companySummary: this.clientBranches.getComplianceSummary(monthStr).pipe(
        catchError(() => of(null)),
      ),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
          // Defer chart render one tick so Angular can add canvases to the DOM
          if (this.data && this.viewReady) {
            setTimeout(() => this.renderAllCharts(), 0);
          }
        }),
      )
      .subscribe({
        next: (res) => {
          this.data = res.legitx;
          this.pfEsiSummary = res.pfEsi;
          this.contractorSummary = res.contractor;
          this.lowestBranches = res.lowestBranches || [];
          this.companyTrend = res.companyTrend || [];
          this.regSummary = res.regSummary;
          this.regAlerts = res.regAlerts || [];
          this.companySummary = res.companySummary;
          if (!res.pfEsi && !res.contractor) {
            this.errorMsg = 'Some dashboard widgets could not be loaded. Partial data shown.';
          }
          this.branches = res.legitx.meta?.branches ?? [];
          this.contractors = res.legitx.meta?.contractors ?? [];
          this.updateFilteredContractors();
          // Compute audit KPI date range (YYYY-MM format required by backend)
          const y = this.filters.year;
          const m = this.filters.month;
          this.auditKpiFrom = `${y}-${this.two(m)}`;
          this.auditKpiTo = `${y}-${this.two(m)}`;

          this.loadBranchRiskOverview();

          // Charts must be rendered AFTER loading=false so that *ngIf reveals canvases.
          // finalize() sets loading=false; we defer chart render to the next tick.
          this.cdr.markForCheck();
        },
        error: () => {
          this.errorMsg = 'Failed to load LegitX dashboard.';
          this.data = null;
          this.pfEsiSummary = null;
          this.contractorSummary = null;
          this.destroyCharts();
          this.cdr.markForCheck();
        },
      });
  }

  onBranchChange(): void {
    this.filters.contractorId = 'ALL';
    this.updateFilteredContractors();
    this.activeDetail = null;
    this.load();
  }

  onContractorChange(): void {
    this.load();
  }

  onToggleChange(toggle: LegitxToggle): void {
    this.filters.toggle = toggle;
    this.load();
  }

  filteredContractors(): Array<{ id: string | number; name: string; branchId?: string | number }> {
    return this.filteredContractorList;
  }

  private updateFilteredContractors(): void {
    if (this.filters.branchId === 'ALL') {
      this.filteredContractorList = this.contractors;
    } else {
      this.filteredContractorList = this.contractors.filter(
        (c) => String(c.branchId) === String(this.filters.branchId),
      );
    }
  }

  openDetail(detail: string): void {
    this.activeDetail = detail;
    setTimeout(() => this.scrollToDetail(detail), 50);
  }

  clearDetails(): void {
    this.activeDetail = null;
  }

  downloadExportPack(): void {
    const monthStr = `${this.filters.year}-${this.two(this.filters.month)}`;
    this.exportingPack = true;
    this.cdr.markForCheck();

    this.clientBranches.downloadExportPackXlsx(monthStr).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `compliance-report-${monthStr}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.exportingPack = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.exportingPack = false;
        this.cdr.markForCheck();
      },
    });
  }

  togglePfModal(): void {
    this.showPfModal = !this.showPfModal;
  }

  toggleEsiModal(): void {
    this.showEsiModal = !this.showEsiModal;
  }

  riskBadgeClass(level: string): string {
    switch (level?.toUpperCase()) {
      case 'LOW':      return 'badge-low';
      case 'MEDIUM':   return 'badge-medium';
      case 'HIGH':     return 'badge-high';
      case 'CRITICAL': return 'badge-critical';
      default:         return 'badge-low';
    }
  }

  queueBadgeClass(item: LegitxQueueItem): string {
    const age = item.ageDays ?? 0;
    if (age >= 16 || this.isCriticalType(item.type)) return 'badge-critical';
    if (age >= 8) return 'badge-warning';
    return 'badge-info';
  }

  two(n: number) {
    return String(n).padStart(2, '0');
  }

  private isCriticalType(type: string): boolean {
    const criticalTypes = ['SHOWCAUSE', 'INSPECTION_FAILED', 'LICENSE_EXPIRED', 'LOW_BRANCH_COMPLIANCE'];
    return criticalTypes.includes(type?.toUpperCase?.() || '');
  }

  private scrollToDetail(detail: string): void {
    const refMap: Record<string, ElementRef | undefined> = {
      PAYROLL: this.payrollDetails,
      CONTRACTORS: this.contractorPanel,
      EMPLOYEES: this.employeePanel,
      BRANCHES: this.branchPanel,
      COMPLIANCE: this.compliancePanel,
      AUDIT: this.auditPanel,
      RISK: this.aiRiskPanel,
    };
    const el = refMap[detail];
    if (el?.nativeElement) {
      el.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  private loadCalendar(): void {
    // clientId is resolved by backend from JWT; pass branchId filter if selected
    const branchId = this.filters.branchId === 'ALL' ? undefined : String(this.filters.branchId);
    this.returnsService.getComplianceCalendar('me', branchId)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([] as ComplianceCalendarItem[])),
      )
      .subscribe(items => {
        this.calendarItems = items || [];
        this.cdr.markForCheck();
      });
  }

  private loadBranchRiskOverview(): void {
    this.riskSub?.unsubscribe();
    if (this.filters.branchId !== 'ALL') {
      this.branchRiskOverview = [];
      return;
    }
    if (!this.branches.length) {
      this.branchRiskOverview = [];
      return;
    }
    this.branchRiskLoading = true;
    this.branchRiskError = '';

    const calls = this.branches.map(b =>
      this.aiRisk.getBranchRisk(String(b.id), this.filters.year, this.filters.month).pipe(
        catchError(() => of(null as AiRiskBranchResponse | null)),
      ),
    );

    this.riskSub = forkJoin(calls)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.branchRiskLoading = false; this.cdr.markForCheck(); }),
      )
      .subscribe({
        next: (results) => {
          this.branchRiskOverview = results
            .filter((r): r is AiRiskBranchResponse => r !== null)
            .map(r => ({
            ...r,
            mcdPercent: r.mcdPercent ?? r.inputs?.mcdPercent ?? 0,
            contractorUploadPercentage: r.contractorUploadPercentage ?? r.inputs?.contractorUploadPercentage ?? 0,
            auditNcCount: r.auditNcCount ?? ((r.inputs?.auditCriticalNC ?? 0) + (r.inputs?.auditHighNC ?? 0) + (r.inputs?.auditMediumNC ?? 0)),
          })).sort((a, b) => b.riskScore - a.riskScore);
          this.cdr.markForCheck();
        },
        error: () => {
          this.branchRiskError = 'Unable to load branch risk overview.';
          this.cdr.markForCheck();
        },
      });
  }

  private renderAllCharts(): void {
    if (!this.data || !this.viewReady) return;
    this.destroyCharts();
    this.renderComplianceTrend();
    this.renderComplianceOps();
    this.renderBranchRank();
    this.renderAuditDonut();
    this.renderPayrollDonut();
    this.renderEmployeeStatus();
    this.renderDocsBucket();
  }

  private renderComplianceTrend(): void {
    if (!this.complianceTrendChart || !this.data) return;
    const d = this.data.charts.complianceTrend;
    const ctx = this.complianceTrendChart.nativeElement.getContext('2d')!;
    const blueGradient = ctx.createLinearGradient(0, 0, 0, 300);
    blueGradient.addColorStop(0, 'rgba(59,130,246,0.25)');
    blueGradient.addColorStop(1, 'rgba(59,130,246,0.02)');
    this.charts.complianceTrend = new Chart(this.complianceTrendChart.nativeElement, {
      type: 'line',
      data: {
        labels: d.labels,
        datasets: [
          { data: d.overall, label: 'Overall %', borderColor: this.palette.blue, backgroundColor: blueGradient, tension: 0.4, fill: true, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#fff', pointBorderWidth: 2 },
          { data: d.branchAvg, label: 'Branch Avg %', borderColor: this.palette.green, backgroundColor: 'rgba(16,185,129,0.08)', tension: 0.4, fill: false, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderWidth: 2, borderDash: [6, 3] },
          { data: d.contractorAvg, label: 'Contractor Avg %', borderColor: this.palette.amber, backgroundColor: 'rgba(245,158,11,0.08)', tension: 0.4, fill: false, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderWidth: 2, borderDash: [6, 3] },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } } },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 12, cornerRadius: 8, displayColors: true, boxPadding: 4 },
        },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%`, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
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
          { label: 'Done', data: d.done, backgroundColor: this.palette.green, stack: 's', borderRadius: 4 },
          { label: 'Pending', data: d.pending, backgroundColor: this.palette.amber, stack: 's', borderRadius: 4 },
          { label: 'Overdue', data: d.overdue, backgroundColor: this.palette.red, stack: 's', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rectRounded', padding: 16, font: { size: 12 } } },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', padding: 12, cornerRadius: 8, boxPadding: 4 },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  private renderBranchRank(): void {
    if (!this.branchRankChart || !this.data) return;
    const d = this.data.charts.branchComplianceRanking;
    const barColors = d.values.map((v: number) => v >= 80 ? this.palette.green : v >= 50 ? this.palette.amber : this.palette.red);
    this.charts.branchRank = new Chart(this.branchRankChart.nativeElement, {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [{ data: d.values, label: 'Compliance %', backgroundColor: barColors, borderRadius: 6 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', padding: 12, cornerRadius: 8, callbacks: { label: (ctx) => `${ctx.parsed.x}%` } },
        },
        scales: {
          x: { min: 0, max: 100, ticks: { callback: (v) => `${v}%`, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } },
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
        datasets: [{
          data: [a.completed, a.pending, a.overdue],
          backgroundColor: [this.palette.green, this.palette.blue, this.palette.red],
          borderWidth: 0,
          spacing: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        animation: { animateRotate: true, duration: 800, easing: 'easeOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } } },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', padding: 12, cornerRadius: 8 },
        },
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
        datasets: [
          {
            data: [p.pendingQueries, p.pfPendingEmployees, p.esiPendingEmployees, p.pendingFF, p.completedFF],
            backgroundColor: [this.palette.rose, this.palette.amber, '#d97706', this.palette.indigo, this.palette.green],
            borderWidth: 0,
            spacing: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        animation: { animateRotate: true, duration: 800, easing: 'easeOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 } } },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', padding: 12, cornerRadius: 8 },
        },
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
          { label: 'Active', data: e.active, backgroundColor: this.palette.blue, stack: 's', borderRadius: 4 },
          { label: 'Joiners', data: e.joiners, backgroundColor: this.palette.green, stack: 's', borderRadius: 4 },
          { label: 'Left', data: e.left, backgroundColor: this.palette.gray, stack: 's', borderRadius: 4 },
          { label: 'Absconded', data: e.absconded, backgroundColor: this.palette.red, stack: 's', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rectRounded', padding: 16, font: { size: 12 } } },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', padding: 12, cornerRadius: 8, boxPadding: 4 },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
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
        datasets: [{ data: d.values, label: 'Contractors', backgroundColor: this.palette.indigo, borderRadius: 6, barPercentage: 0.7 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', padding: 12, cornerRadius: 8 },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  private destroyCharts(): void {
    Object.values(this.charts).forEach((c) => c?.destroy());
    this.charts = {};
  }
}

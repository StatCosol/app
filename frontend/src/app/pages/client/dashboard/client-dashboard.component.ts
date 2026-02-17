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
import Chart from 'chart.js/auto';
import { RouterModule } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { LegitxDashboardService } from '../../../core/legitx-dashboard.service';
import {
  LegitxDashboardResponse,
  LegitxQueueItem,
  LegitxToggle,
} from './legitx-dashboard.dto';
import { LoadingSpinnerComponent } from '../../../shared/ui';

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
  selector: 'app-client-dashboard',
  imports: [CommonModule, FormsModule, RouterModule, LoadingSpinnerComponent],
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

  loading = false;
  errorMsg = '';
  data: LegitxDashboardResponse | null = null;

  branches: Array<{ id: string | number; name: string }> = [];
  contractors: Array<{ id: string | number; name: string; branchId?: string | number }> = [];

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
  private readonly destroy$ = new Subject<void>();

  readonly palette = {
    green: '#16a34a',
    amber: '#f59e0b',
    red: '#ef4444',
    blue: '#2563eb',
    gray: '#9ca3af',
  };

  constructor(
    private legitx: LegitxDashboardService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
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
    this.loadSub = this.legitx
      .getSummary({
        month: this.filters.month,
        year: this.filters.year,
        branchId: this.filters.branchId,
        contractorId: this.filters.contractorId,
        toggle: this.filters.toggle,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.data = res;
          this.branches = res.meta?.branches ?? [];
          this.contractors = res.meta?.contractors ?? [];
          if (this.viewReady) {
            this.renderAllCharts();
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.errorMsg = 'Failed to load LegitX dashboard.';
          this.data = null;
          this.destroyCharts();
          this.cdr.markForCheck();
        },
      });
  }

  onBranchChange(): void {
    if (this.filters.branchId === 'ALL') {
      this.filters.contractorId = 'ALL';
    }
    this.load();
  }

  onContractorChange(): void {
    this.load();
  }

  onToggleChange(toggle: LegitxToggle): void {
    this.filters.toggle = toggle;
    this.load();
  }

  filteredContractors() {
    if (this.filters.branchId === 'ALL') return this.contractors;
    return this.contractors.filter((c) => String(c.branchId) === String(this.filters.branchId));
  }

  queueBadgeClass(item: LegitxQueueItem): string {
    const age = item.ageDays ?? 0;
    if (age >= 16 || this.isCriticalType(item.type)) return 'badge-critical';
    if (age >= 8) return 'badge-warning';
    return 'badge-info';
  }

  private isCriticalType(type: string): boolean {
    const criticalTypes = ['SHOWCAUSE', 'INSPECTION_FAILED', 'LICENSE_EXPIRED', 'LOW_BRANCH_COMPLIANCE'];
    return criticalTypes.includes(type?.toUpperCase?.() || '');
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
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { intersect: false, mode: 'index' },
        },
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

  private renderBranchRank(): void {
    if (!this.branchRankChart || !this.data) return;
    const d = this.data.charts.branchComplianceRanking;
    this.charts.branchRank = new Chart(this.branchRankChart.nativeElement, {
      type: 'bar',
      data: {
        labels: d.labels,
        datasets: [{ data: d.values, label: 'Compliance %', backgroundColor: this.palette.blue }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
          y: { grid: { display: false } },
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
        datasets: [
          {
            data: [p.pendingQueries, p.pfPendingEmployees, p.esiPendingEmployees, p.pendingFF, p.completedFF],
            backgroundColor: [this.palette.red, this.palette.amber, '#d97706', this.palette.blue, this.palette.green],
          },
        ],
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

  private destroyCharts(): void {
    Object.values(this.charts).forEach((c) => c?.destroy());
    this.charts = {};
  }
}

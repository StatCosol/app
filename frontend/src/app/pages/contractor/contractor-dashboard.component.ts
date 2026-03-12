import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { timeout, finalize, takeUntil, catchError } from 'rxjs/operators';
import { Subject, forkJoin, of } from 'rxjs';
import { DashboardService } from '../../core/dashboard.service';
import { ComplianceService } from '../../core/compliance.service';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
  EmptyStateComponent,
} from '../../shared/ui';

interface UpcomingTask {
  id: string | number;
  complianceName: string;
  branchName: string;
  dueDate: string | null;
  daysUntilDue: number;
  dueLabel: string;
}

interface ScoreTrendPoint {
  month: string;
  score: number;
  ncPoints: number;
  uploadedPercent: number;
  rejectedCount: number;
  missingCount: number;
  auditRiskPoints: number;
}

interface ContractorTaskListItem {
  id: string | number;
  title: string;
  branchName: string;
  clientName: string;
  dueDate: string | null;
  status: string;
}

interface DashboardGuardrail {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  title: string;
  detail: string;
  statusFilter: string;
}

interface BranchStatusRow {
  branchName: string;
  total: number;
  pending: number;
  rejected: number;
  overdue: number;
  approved: number;
}

@Component({
  selector: 'app-contractor-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  templateUrl: './contractor-dashboard.component.html',
  styleUrls: ['./shared/contractor-theme.scss', './contractor-dashboard.component.scss'],
})
export class ContractorDashboardComponent implements OnInit, OnDestroy {
  data: any = null;
  loading = false;
  errorMsg: string | null = null;
  private destroy$ = new Subject<void>();

  tasks: ContractorTaskListItem[] = [];
  reuploads: any[] = [];

  upcomingTasks: UpcomingTask[] = [];
  scoreTrend: ScoreTrendPoint[] = [];
  pendingUploadsPreview: ContractorTaskListItem[] = [];
  rejectedItemsPreview: ContractorTaskListItem[] = [];
  expiringLicensesPreview: ContractorTaskListItem[] = [];
  workerOnboardingPendingPreview: ContractorTaskListItem[] = [];
  branchStatusBoard: BranchStatusRow[] = [];
  mappedBranches: string[] = [];
  mappedClient = '-';
  totalRequiredDocs = 0;
  pendingUploadsCount = 0;
  rejectedDocsCount = 0;
  expiringLicenseCount = 0;
  workerOnboardingPendingCount = 0;

  // Compliance progress ring
  readonly circumference = 2 * Math.PI * 52; // r=52
  compliancePct = 0;

  get strokeOffset(): number {
    return this.circumference - (this.compliancePct / 100) * this.circumference;
  }

  get dueTodayCount(): number {
    return this.tasks.filter((t) => this.daysToDue(t.dueDate) === 0).length;
  }

  get overdueCount(): number {
    return this.tasks.filter((t) => this.isOverdueTask(t)).length;
  }

  get inProgressCount(): number {
    return this.tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  }

  get awaitingApprovalCount(): number {
    return this.tasks.filter((t) => t.status === 'SUBMITTED').length;
  }

  get dashboardGuardrails(): DashboardGuardrail[] {
    const alerts: DashboardGuardrail[] = [];
    if (this.overdueCount > 0) {
      alerts.push({
        severity: 'CRITICAL',
        title: 'Overdue task backlog',
        detail: `${this.overdueCount} tasks are overdue and require immediate upload/reply action.`,
        statusFilter: 'OVERDUE',
      });
    }
    if (this.rejectedDocsCount > 0) {
      alerts.push({
        severity: 'HIGH',
        title: 'Rejected documents pending correction',
        detail: `${this.rejectedDocsCount} items were rejected and need reupload with fixes.`,
        statusFilter: 'REJECTED',
      });
    }
    if (this.expiringLicenseCount > 0) {
      alerts.push({
        severity: 'HIGH',
        title: 'License expiry risk',
        detail: `${this.expiringLicenseCount} license-linked tasks are due within 45 days.`,
        statusFilter: 'PENDING',
      });
    }
    if (this.workerOnboardingPendingCount > 0) {
      alerts.push({
        severity: 'MEDIUM',
        title: 'Worker onboarding queue open',
        detail: `${this.workerOnboardingPendingCount} onboarding-related tasks are still open.`,
        statusFilter: 'IN_PROGRESS',
      });
    }
    if (!this.mappedBranches.length) {
      alerts.push({
        severity: 'MEDIUM',
        title: 'Branch mapping not found',
        detail: 'No active branch mapping is available for this contractor account.',
        statusFilter: '',
      });
    }
    return alerts;
  }

  overdueColumns: TableColumn[] = [
    { key: 'complianceName', header: 'Compliance', sortable: true },
    { key: 'branchName', header: 'Branch' },
    { key: 'dueDate', header: 'Due Date', width: '150px' },
    { key: 'status', header: 'Status', width: '120px' },
  ];

  constructor(
    private dash: DashboardService,
    private compliance: ComplianceService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.errorMsg = null;

    // Compute last 6 months range for trend
    const now = new Date();
    const fromMonth = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const from = `${fromMonth.getFullYear()}-${String(fromMonth.getMonth() + 1).padStart(2, '0')}`;
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    forkJoin({
      dashboard: this.dash.contractor().pipe(timeout(10000)),
      trend: this.dash.contractorScoreTrend(from, to).pipe(
        catchError(() => of([] as ScoreTrendPoint[])),
      ),
      tasks: this.compliance.getContractorTasks({}).pipe(
        catchError(() => of({ data: [] as any[] })),
      ),
      reuploads: this.compliance.contractorGetReuploadRequests({}).pipe(
        catchError(() => of({ data: [] as any[] })),
      ),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.loading = false;
          this.data = res.dashboard || null;
          this.scoreTrend = res.trend || [];
          this.tasks = this.toArray(res.tasks).map((row: any) =>
            this.normalizeTask(row),
          );
          this.reuploads = this.toArray(res.reuploads);
          this.computeOperationalWidgets();
          this.buildUpcomingTasks();
          this.computeCompliancePct();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.loading = false;
          this.errorMsg = err?.error?.message || 'Failed to load dashboard';
          this.cdr.detectChanges();
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  retry(): void {
    this.ngOnInit();
  }

  get overdueTableData(): any[] {
    return this.tasks
      .filter((t: ContractorTaskListItem) => this.isOverdueTask(t))
      .map((t: ContractorTaskListItem) => ({
        id: t.id,
        complianceName: t.title,
        branchName: t.branchName,
        dueDate: t.dueDate,
        status: t.status || 'OVERDUE',
      }));
  }

  goToTasks(filter: string): void {
    if (filter) {
      this.router.navigate(['/contractor/tasks'], { queryParams: { status: filter } });
    } else {
      this.router.navigate(['/contractor/tasks']);
    }
  }

  openTask(t: any): void {
    this.router.navigate(['/contractor/tasks', t.id]);
  }

  private buildUpcomingTasks(): void {
    if (!this.tasks.length) {
      this.upcomingTasks = [];
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mapped = this.tasks
      .filter(
        (t: ContractorTaskListItem) =>
          t.status !== 'APPROVED' && t.status !== 'SUBMITTED' && !!t.dueDate,
      )
      .map((t: ContractorTaskListItem) => {
        const due = new Date(String(t.dueDate));
        const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: t.id,
          complianceName: t.title,
          branchName: t.branchName || '-',
          dueDate: t.dueDate,
          daysUntilDue: diff,
          dueLabel:
            diff < 0
              ? `${Math.abs(diff)}d overdue`
              : diff === 0
                ? 'Due today'
                : `${diff}d left`,
        };
      })
      .sort((a: UpcomingTask, b: UpcomingTask) => a.daysUntilDue - b.daysUntilDue);

    // Deduplicate by id
    const seen = new Set<string>();
    this.upcomingTasks = mapped.filter((t: UpcomingTask) => {
      const key = String(t.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  }

  private computeCompliancePct(): void {
    if (!this.tasks.length) {
      this.compliancePct = 0;
      return;
    }
    const approved = this.tasks.filter((t) => t.status === 'APPROVED').length;
    this.compliancePct = Math.round((approved / this.tasks.length) * 100);
  }

  getScoreColor(score: number): string {
    if (score >= 85) return 'bg-green-500';
    if (score >= 70) return 'bg-amber-500';
    return 'bg-red-500';
  }

  getScoreTextColor(score: number): string {
    if (score >= 85) return 'text-green-700';
    if (score >= 70) return 'text-amber-700';
    return 'text-red-700';
  }

  formatMonth(month: string): string {
    const [y, m] = month.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
  }

  private computeOperationalWidgets(): void {
    this.mappedClient = this.data?.clientId || this.tasks.find((t) => t.clientName !== '-')?.clientName || '-';
    this.mappedBranches = Array.from(
      new Set(this.tasks.map((t) => t.branchName).filter((b) => !!b && b !== '-')),
    );
    this.totalRequiredDocs = this.tasks.length;

    const pendingUploads = this.tasks.filter((t) =>
      ['PENDING', 'IN_PROGRESS', 'REJECTED', 'OVERDUE'].includes(t.status),
    );
    this.pendingUploadsCount = pendingUploads.length;
    this.pendingUploadsPreview = pendingUploads.slice(0, 6);

    const rejectedItems = this.tasks.filter((t) => t.status === 'REJECTED');
    this.rejectedDocsCount = rejectedItems.length;
    this.rejectedItemsPreview = rejectedItems.slice(0, 6);

    const expiringLicenses = this.tasks
      .filter((t) => this.looksLikeLicenseTask(t.title))
      .filter((t) => this.daysToDue(t.dueDate) >= 0 && this.daysToDue(t.dueDate) <= 45);
    this.expiringLicenseCount = expiringLicenses.length;
    this.expiringLicensesPreview = expiringLicenses.slice(0, 6);

    const workerOnboardingPending = this.tasks
      .filter((t) => this.looksLikeOnboardingTask(t.title))
      .filter((t) => ['PENDING', 'IN_PROGRESS', 'REJECTED', 'OVERDUE'].includes(t.status));
    this.workerOnboardingPendingCount = workerOnboardingPending.length;
    this.workerOnboardingPendingPreview = workerOnboardingPending.slice(0, 6);

    this.branchStatusBoard = this.buildBranchStatusBoard(this.tasks).slice(0, 8);
  }

  private normalizeTask(task: any): ContractorTaskListItem {
    return {
      id: task?.id || '',
      title:
        task?.compliance?.complianceName ||
        task?.compliance?.title ||
        task?.complianceTitle ||
        'Compliance Task',
      branchName: task?.branch?.branchName || task?.branchName || '-',
      clientName: task?.client?.clientName || task?.clientName || '-',
      dueDate: task?.dueDate || task?.due_date || null,
      status: String(task?.status || 'PENDING').toUpperCase(),
    };
  }

  private toArray(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }

  private isOverdueTask(task: ContractorTaskListItem): boolean {
    if (task.status === 'OVERDUE') return true;
    const days = this.daysToDue(task.dueDate);
    return days < 0 && task.status !== 'APPROVED' && task.status !== 'SUBMITTED';
  }

  private daysToDue(dueDate: string | null): number {
    if (!dueDate) return Number.MAX_SAFE_INTEGER;
    const due = new Date(dueDate);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  private looksLikeLicenseTask(title: string): boolean {
    const value = String(title || '').toLowerCase();
    return value.includes('license') || value.includes('licence') || value.includes('registration') || value.includes('renewal');
  }

  private looksLikeOnboardingTask(title: string): boolean {
    const value = String(title || '').toLowerCase();
    return value.includes('onboard') || value.includes('joining') || value.includes('new employee') || value.includes('worker');
  }

  private buildBranchStatusBoard(tasks: ContractorTaskListItem[]): BranchStatusRow[] {
    const grouped = new Map<string, BranchStatusRow>();
    for (const task of tasks) {
      const key = task.branchName || '-';
      if (!grouped.has(key)) {
        grouped.set(key, {
          branchName: key,
          total: 0,
          pending: 0,
          rejected: 0,
          overdue: 0,
          approved: 0,
        });
      }
      const row = grouped.get(key)!;
      row.total += 1;
      if (['PENDING', 'IN_PROGRESS'].includes(task.status)) row.pending += 1;
      if (task.status === 'REJECTED') row.rejected += 1;
      if (task.status === 'OVERDUE' || this.isOverdueTask(task)) row.overdue += 1;
      if (task.status === 'APPROVED' || task.status === 'SUBMITTED') row.approved += 1;
    }

    return Array.from(grouped.values()).sort(
      (a, b) => b.overdue - a.overdue || b.pending - a.pending || b.total - a.total,
    );
  }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef , ChangeDetectionStrategy} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, Subject, of } from 'rxjs';
import { timeout, takeUntil, catchError } from 'rxjs/operators';

import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import {
  AdminStatsDto,
  AdminDashboardSummaryDto,
  TaskStatusDto,
  LoadRowDto,
  AttentionItemDto,
  AssignmentSummaryDto,
  RiskAlertsDto,
  AuditSummaryDto,
} from './dashboard/admin-dashboard.dto';
import { ToastService } from '../../shared/toast/toast.service';
import { LowestBranchesComponent } from '../../shared/compliance/lowest-branches.component';
import { RiskRankingComponent } from '../../shared/compliance/risk-ranking.component';
import {
  LoadingSpinnerComponent,
  EmptyStateComponent,
  ActionButtonComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
  FormSelectComponent,
  FormInputComponent,
  SelectOption,
} from '../../shared/ui';

type Range = '7d' | '30d' | '90d';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    FormSelectComponent,
    FormInputComponent,
    LowestBranchesComponent,
    RiskRankingComponent,
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss'],
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  dateRange: Range = '30d';

  clientId: string | null = null;
  stateCode: string | null = null;
  from: string | null = null;
  to: string | null = null;

  clients: Array<{ id: string; name: string }> = [];
  states: string[] = [];

  // Cached select options (avoid recreating arrays every CD cycle → NG0103)
  cachedClientOptions: SelectOption[] = [{ value: null, label: 'All Clients' }];
  cachedStateOptions: SelectOption[] = [
    { value: null, label: 'All States' },
  ];

  loading = true;
  errorMsg = '';
  sendingDigest = false;
  sendingAlerts = false;

  summary: AdminDashboardSummaryDto | null = null;
  stats: AdminStatsDto | null = null;
  taskStatus: TaskStatusDto | null = null;
  slaTrend: number[] = [];

  crmLoad: LoadRowDto[] = [];
  auditorLoad: LoadRowDto[] = [];
  attention: AttentionItemDto[] = [];

  // Governance Layer state
  assignmentSummary: AssignmentSummaryDto | null = null;
  riskAlerts: RiskAlertsDto | null = null;
  auditSummary: AuditSummaryDto[] = [];

  auditSummaryColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'status', header: 'Status', sortable: true, width: '120px', align: 'center' },
    { key: 'overdueCount', header: 'Overdue', sortable: true, width: '100px', align: 'center' },
    { key: 'lastAuditDate', header: 'Last Audit', sortable: true, width: '130px' },
    { key: 'nextDueDate', header: 'Next Due', sortable: true, width: '130px' },
  ];

  // Table column definitions
  escalationColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'issueType', header: 'Issue Type', sortable: true, width: '120px' },
    { key: 'reason', header: 'Reason', sortable: false },
    { key: 'ownerName', header: 'Owner', sortable: true, width: '150px' },
    { key: 'daysDelayed', header: 'Delayed', sortable: true, width: '100px', align: 'center' },
    { key: 'lastUpdated', header: 'Updated', sortable: true, width: '120px' },
    { key: 'escActions', header: 'Actions', sortable: false, width: '160px', align: 'right' },
  ];

  assignmentColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'assignmentType', header: 'Role', sortable: true, width: '120px' },
    { key: 'assignedTo', header: 'Assigned To', sortable: true },
    { key: 'rotationDueOn', header: 'Rotation Due', sortable: true, width: '130px' },
    { key: 'asgStatus', header: 'Status', sortable: true, width: '140px', align: 'center' },
    { key: 'asgActions', header: '', sortable: false, width: '100px', align: 'right' },
  ];

  // Select options — return cached arrays to avoid NG0103
  get clientOptions(): SelectOption[] {
    return this.cachedClientOptions;
  }

  get stateOptions(): SelectOption[] {
    return this.cachedStateOptions;
  }

  private rebuildClientOptions(): void {
    this.cachedClientOptions = [
      { value: null, label: 'All Clients' },
      ...this.clients.map(c => ({ value: c.id, label: c.name })),
    ];
  }

  constructor(
    private router: Router,
    private dash: AdminDashboardService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadClients();
    this.loadStates();
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setRange(r: Range) {
    this.dateRange = r;
    this.loadAll();
  }

  loadAll(): void {
    this.loading = true;
    this.errorMsg = '';

    const summaryParams = this.buildSummaryParams();

    forkJoin({
      summary: this.dash.getSummary(summaryParams).pipe(timeout(8000), catchError(() => of(null as AdminDashboardSummaryDto | null))),
      stats: this.dash.getStats(this.dateRange).pipe(timeout(8000), catchError(() => of(null as AdminStatsDto | null))),
      taskStatus: this.dash.getTaskStatus(this.dateRange).pipe(timeout(8000), catchError(() => of(null as TaskStatusDto | null))),
      trend: this.dash.getSlaTrend(this.dateRange).pipe(timeout(8000), catchError(() => of({ values: [] as number[] }))),
      crmLoad: this.dash.getCrmLoad().pipe(timeout(8000), catchError(() => of([] as LoadRowDto[]))),
      auditorLoad: this.dash.getAuditorLoad().pipe(timeout(8000), catchError(() => of([] as LoadRowDto[]))),
      attention: this.dash.getAttention(this.dateRange).pipe(timeout(8000), catchError(() => of([] as AttentionItemDto[]))),
      assignmentSummary: this.dash.getAssignmentSummary().pipe(timeout(8000), catchError(() => of(null as AssignmentSummaryDto | null))),
      riskAlerts: this.dash.getRiskAlerts().pipe(timeout(8000), catchError(() => of(null as RiskAlertsDto | null))),
      auditSummary: this.dash.getAuditSummary().pipe(timeout(8000), catchError(() => of([] as AuditSummaryDto[]))),
    })
    .pipe(
      takeUntil(this.destroy$),
    )
    .subscribe({
      next: (res) => {
        this.summary = res.summary
          ? {
              ...res.summary,
              slaHealth: res.summary.slaHealth ?? { status: 'GREEN', scorePct: 0 },
              escalations: res.summary.escalations ?? [],
              assignmentsAttention: res.summary.assignmentsAttention ?? [],
              systemHealth: res.summary.systemHealth ?? {
                inactiveUsers15d: 0,
                unassignedClients: 0,
                failedNotifications7d: 0,
                failedJobs24h: 0,
              },
            }
          : null;
        this.stats = res.stats ?? null;
        this.taskStatus = res.taskStatus ?? null;
        this.slaTrend = res.trend?.values ?? [];
        this.crmLoad = res.crmLoad ?? [];
        this.auditorLoad = res.auditorLoad ?? [];
        this.attention = res.attention ?? [];
        this.assignmentSummary = res.assignmentSummary ?? null;
        this.riskAlerts = res.riskAlerts ?? null;
        this.auditSummary = res.auditSummary ?? [];
        if (!res.summary || !res.stats || !res.taskStatus) {
          this.errorMsg = 'Some dashboard widgets could not be loaded. Partial data shown.';
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.errorMsg = 'Failed to load live dashboard data.';
        this.summary = null;
        this.stats = null;
        this.taskStatus = null;
        this.slaTrend = [];
        this.crmLoad = [];
        this.auditorLoad = [];
        this.attention = [];
        this.assignmentSummary = null;
        this.riskAlerts = null;
        this.auditSummary = [];
        this.cdr.markForCheck();
      }
    });
  }

  get completionPct(): number {
    if (!this.taskStatus) return 0;
    const total = this.taskStatus.completed + this.taskStatus.pending + this.taskStatus.overdue;
    return total ? Math.round((this.taskStatus.completed / total) * 100) : 0;
  }

  donutDash(value: number): string {
    const c = 251.2;
    const dash = ((value || 0) / 100) * c;
    return `${dash} ${c - dash}`;
  }

  loadScore(row: LoadRowDto): number {
    if (!row) return 0;
    const score = row.openItems * 10 + row.overdue * 25 + row.slaBreaches * 30 + row.clientsAssigned * 8;
    return Math.min(100, score);
  }

  applyFilters(): void {
    this.loadAll();
  }

  resetFilters(): void {
    this.clientId = null;
    this.stateCode = null;
    this.from = null;
    this.to = null;
    this.loadAll();
  }

  sendDigestNow(): void {
    if (this.sendingDigest) return;
    this.sendingDigest = true;
    this.dash.sendDigestNow().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.sendingDigest = false; this.toast.success('Digest sent successfully'); },
      error: () => { this.sendingDigest = false; this.toast.error('Failed to send digest'); },
    });
  }

  sendCriticalAlertsNow(): void {
    if (this.sendingAlerts) return;
    this.sendingAlerts = true;
    this.dash.sendCriticalAlertsNow().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.sendingAlerts = false; this.toast.success('Critical alerts sent'); },
      error: () => { this.sendingAlerts = false; this.toast.error('Failed to send critical alerts'); },
    });
  }

  private buildSummaryParams(): Record<string, string> {
    const params: Record<string, string> = {};
    if (this.clientId) params['clientId'] = this.clientId;
    if (this.stateCode) params['stateCode'] = this.stateCode;
    if (this.from) params['from'] = this.from;
    if (this.to) params['to'] = this.to;
    return params;
  }

  private loadClients(): void {
    this.dash.getClientsMinimal().pipe(takeUntil(this.destroy$)).subscribe({
      next: (rows) => {
        this.clients = rows ?? [];
        this.rebuildClientOptions();
        this.cdr.markForCheck();
      },
      error: () => {
        this.clients = [];
        this.rebuildClientOptions();
        this.cdr.markForCheck();
      }
    });
  }

  private loadStates(): void {
    this.dash.getAvailableStates().pipe(takeUntil(this.destroy$)).subscribe({
      next: (states) => {
        this.states = states ?? [];
        this.cachedStateOptions = [
          { value: null, label: 'All States' },
          ...this.states.map(s => ({ value: s, label: s })),
        ];
        this.cdr.markForCheck();
      },
      error: () => {
        this.states = [];
        this.cachedStateOptions = [{ value: null, label: 'All States' }];
        this.cdr.markForCheck();
      },
    });
  }

  toneForLoad(score: number): 'good' | 'warn' | 'bad' {
    if (score >= 75) return 'bad';
    if (score >= 45) return 'warn';
    return 'good';
  }

  openCoverage(row: { client_id: string; branch_id: string }): void {
    if (!row?.client_id) return;
    this.router.navigate(['/admin/clients', row.client_id, 'compliances'], {
      queryParams: { branchId: row.branch_id },
    });
  }

  openAudit(row: { audit_id: string; client_id: string; branch_id: string }): void {
    this.router.navigate(['/admin/reports'], {
      queryParams: {
        clientId: row.client_id,
        branchId: row.branch_id,
        auditId: row.audit_id,
        focus: 'audit',
      },
    });
  }

  openAssignment(row: { clientId: string; id: string }): void {
    this.router.navigate(['/admin/assignments'], {
      queryParams: { clientId: row.clientId, assignmentId: row.id },
    });
  }

  severityClass(s: AttentionItemDto['severity']): string {
    return s === 'High' ? 'sev-high' : s === 'Medium' ? 'sev-med' : 'sev-low';
  }

  go(route?: string) {
    if (!route) return;
    this.router.navigateByUrl(route);
  }

  openTask(item: AttentionItemDto) {
    this.router.navigate(['/admin/assignments'], { queryParams: { taskId: item.taskId } });
  }
}

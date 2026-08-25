import { Component, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subject, Subscription } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { ClientComplianceService } from '../../../core/client-compliance.service';
import { LegitxComplianceFacade } from './legitx-compliance.facade';
import { ToastService } from '../../../shared/toast/toast.service';
import { AuthService } from '../../../core/auth.service';
import {
  PageHeaderComponent,
  StatusBadgeComponent,
  DataTableComponent,
  TableColumn,
  FormSelectComponent,
  EmptyStateComponent,
} from '../../../shared/ui';

type ActiveTab = 'branches' | 'tasks' | 'returns' | 'contractors' | 'audit';

@Component({
  standalone: true,
  selector: 'app-client-compliance-status',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    StatusBadgeComponent,
    PageHeaderComponent,
    DataTableComponent,
    FormSelectComponent,
    EmptyStateComponent,
  ],
  templateUrl: './client-compliance-status.component.html',
  styleUrls: ['../shared/client-theme.scss', './client-compliance-status.component.scss'],
})
export class ClientComplianceStatusComponent implements OnInit, OnDestroy {
  error = '';
  private tasksSub?: Subscription;
  private tabSub?: Subscription;
  private allSub?: Subscription;
  private metaSub?: Subscription;
  private readonly destroy$ = new Subject<void>();
  loading = true;
  month = new Date().getMonth() + 1;
  year = new Date().getFullYear();
  selectedBranchId = '';
  activeTab: ActiveTab = 'branches';
  taskCategory = '';
  taskStatus = '';
  taskLimit = 100;
  isBranchPortal = false;
  pageTitle = 'Compliance Status';
  pageDescription = 'Company compliance health report - live, auto-calculated';
  currentBranchLabel = 'Assigned Branch';
  complianceAreaRoute = '/client/compliance/mcd';
  calendarRoute = '/client/calendar';
  contractorsRoute = '/client/contractors';
  registrationsRoute = '/client/compliance/registrations';
  auditsRoute = '/client/audits';
  actionItemsRoute = '/client/reminders';
  detailTabs: Array<{ key: ActiveTab; label: string }> = [];

  summary: any = null;
  branchMeta: any[] = [];
  branchOptions: { value: string; label: string }[] = [];
  branchRows: any[] = [];
  tasks: any[] = [];
  contractorData: any = null;
  auditData: any = null;
  returnsData: any = null;
  overview: any = null;

  branchColumns: TableColumn[] = [
    { key: 'branchName', header: 'Branch', sortable: true },
    { key: 'stateCode', header: 'State', sortable: true },
    { key: 'compliancePct', header: 'Compliance %', sortable: true, align: 'center' },
    { key: 'approved', header: 'Approved', sortable: true, align: 'center' },
    { key: 'pending', header: 'Pending', sortable: true, align: 'center' },
    { key: 'overdue', header: 'Overdue', sortable: true, align: 'center' },
    { key: 'riskLevel', header: 'Risk', sortable: true, align: 'center' },
  ];

  taskColumns: TableColumn[] = [
    { key: 'title', header: 'Compliance', sortable: true },
    { key: 'branchName', header: 'Branch', sortable: true },
    { key: 'lawName', header: 'Law', sortable: true },
    { key: 'frequency', header: 'Frequency', sortable: true },
    { key: 'dueDate', header: 'Due Date', sortable: true },
    { key: 'status', header: 'Status', sortable: true, align: 'center' },
    { key: 'delayDays', header: 'Delay', sortable: true, align: 'center' },
  ];

  returnsColumns: TableColumn[] = [
    { key: 'branch_name', header: 'Branch', sortable: true },
    { key: 'law_type', header: 'Return Type', sortable: true },
    { key: 'period_label', header: 'Period', sortable: true },
    { key: 'due_date', header: 'Due Date', sortable: true },
    { key: 'status', header: 'Status', sortable: true, align: 'center' },
    { key: 'delay_days', header: 'Delay', sortable: true, align: 'center' },
  ];

  contractorColumns: TableColumn[] = [
    { key: 'contractorName', header: 'Contractor', sortable: true },
    { key: 'branchName', header: 'Branch', sortable: true },
    { key: 'compliancePct', header: 'Compliance %', sortable: true, align: 'center' },
    { key: 'approvedDocuments', header: 'Approved', sortable: true, align: 'center' },
    { key: 'pendingDocuments', header: 'Pending', sortable: true, align: 'center' },
    { key: 'rejectedDocuments', header: 'Rejected', sortable: true, align: 'center' },
  ];

  monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2000, i).toLocaleString('en', { month: 'long' }),
  }));

  yearOptions = (() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1].map((y) => ({
      value: String(y),
      label: String(y),
    }));
  })();

  categoryOptions = [
    { value: '', label: 'All Categories' },
    { value: 'FACTORY_ACT', label: 'Factory Act' },
    { value: 'SHOPS_ESTABLISHMENTS', label: 'Shops & Establishments' },
    { value: 'LABOUR_CODE', label: 'Labour Code' },
    { value: 'PF', label: 'PF' },
    { value: 'ESI', label: 'ESI' },
    { value: 'PT', label: 'Professional Tax' },
    { value: 'LWF', label: 'LWF' },
    { value: 'CLRA', label: 'CLRA' },
  ];

  // Static options — must NOT be inline arrays in template (new refs every CD cycle → NG0103)
  readonly taskStatusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'OVERDUE', label: 'Overdue' },
  ];
  readonly taskLimitOptions = [
    { value: 50, label: '50 rows' },
    { value: 100, label: '100 rows' },
    { value: 200, label: '200 rows' },
    { value: 500, label: '500 rows' },
  ];

  constructor(
    private api: ClientComplianceService,
    private facade: LegitxComplianceFacade,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private route: ActivatedRoute,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.isBranchPortal = this.route.snapshot.data['portal'] === 'branch';
    if (this.isBranchPortal) {
      const user = this.auth.getUser();
      this.selectedBranchId = this.auth.getBranchIds()[0] || '';
      this.currentBranchLabel = user?.branchName || user?.branch?.name || 'Assigned Branch';
      this.pageTitle = 'Monthly Compliance Dashboard';
      this.pageDescription = 'Registrations, renewals, returns and monthly compliance for your branch';
      this.complianceAreaRoute = '/branch/compliance/monthly';
      this.calendarRoute = '/branch/calendar';
      this.contractorsRoute = '/branch/contractors';
      this.registrationsRoute = '/branch/registrations';
      this.auditsRoute = '/branch/audits/observations';
      this.actionItemsRoute = '/branch/compliance-items';
      this.activeTab = 'tasks';
    }
    this.detailTabs = this.isBranchPortal
      ? [
          { key: 'tasks', label: 'MCD Tasks' },
          { key: 'returns', label: 'Returns & Filings' },
          { key: 'contractors', label: 'Contractors' },
          { key: 'audit', label: 'Audit Impact' },
        ]
      : [
          { key: 'branches', label: 'Branches' },
          { key: 'tasks', label: 'MCD Tasks' },
          { key: 'returns', label: 'Returns & Filings' },
          { key: 'contractors', label: 'Contractors' },
          { key: 'audit', label: 'Audit Impact' },
        ];
    this.loadBranchMeta();
  }

  ngOnDestroy(): void {
    this.tasksSub?.unsubscribe();
    this.tabSub?.unsubscribe();
    this.allSub?.unsubscribe();
    this.metaSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBranchMeta(): void {
    this.metaSub?.unsubscribe();
    this.metaSub = this.api
      .getBranches()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.branchMeta = res?.data || res || [];
          const scopedBranches = this.isBranchPortal
            ? this.branchMeta.filter((b: any) => b.id === this.selectedBranchId)
            : this.branchMeta;
          if (this.isBranchPortal && scopedBranches[0]) {
            this.currentBranchLabel = scopedBranches[0].branchName || scopedBranches[0].name;
          }
          this.branchOptions = this.isBranchPortal
            ? scopedBranches.map((b: any) => ({ value: b.id, label: b.branchName || b.name }))
            : [
                { value: '', label: 'All Branches' },
                ...this.branchMeta.map((b: any) => ({ value: b.id, label: b.branchName || b.name })),
              ];
          this.cdr.markForCheck();
          this.loadAll();
        },
        error: () => {
          this.branchMeta = [];
          this.branchOptions = this.isBranchPortal
            ? [{ value: this.selectedBranchId, label: this.currentBranchLabel }]
            : [{ value: '', label: 'All Branches' }];
          this.loadAll();
        },
      });
  }

  loadAll(): void {
    this.allSub?.unsubscribe();
    this.loading = true;
    this.error = '';
    const bid = this.selectedBranchId || undefined;

    this.allSub = forkJoin({
      overview: this.api.getComplianceStatusOverview(this.month, this.year, bid),
      branches: this.api.getComplianceStatusBranches(this.month, this.year, bid),
    })
      .pipe(
        takeUntil(this.destroy$),
        timeout(15000),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.overview = res.overview;
          this.summary = res.overview?.summary || null;
          this.branchRows = res.branches || [];
          this.loading = false;
          this.cdr.markForCheck();
          this.loadTabData();
        },
        error: () => {
          this.loading = false;
          this.summary = null;
          this.overview = null;
          this.branchRows = [];
          this.error = 'Unable to load compliance summary.';
          this.cdr.markForCheck();
        },
      });
  }

  get trendPoints(): string {
    const rows = this.overview?.trend || [];
    if (!rows.length) return '';
    return rows
      .map((row: any, index: number) => {
        const x = rows.length === 1 ? 50 : (index / (rows.length - 1)) * 100;
        const y = 94 - Math.max(0, Math.min(100, Number(row.score) || 0)) * 0.82;
        return `${x},${y}`;
      })
      .join(' ');
  }

  get upcomingItems(): any[] {
    return (this.overview?.upcoming || []).slice(0, 5);
  }

  get criticalActionItems(): any[] {
    return (this.overview?.actionItems || []).slice(0, 5);
  }

  get auditRingStyle(): Record<string, string> {
    const audit = this.overview?.audit;
    const open = Number(audit?.openObservations) || 0;
    const verified = Number(audit?.completedAudits) || 0;
    const reverify = Number(audit?.reverifyPending) || 0;
    const total = Math.max(open + verified + reverify, 1);
    const openEnd = (open / total) * 100;
    const verifiedEnd = openEnd + (verified / total) * 100;
    return {
      background: `conic-gradient(#ef476f 0 ${openEnd}%, #12b981 ${openEnd}% ${verifiedEnd}%, #4f6bed ${verifiedEnd}% 100%)`,
    };
  }

  monthLabel(month: number): string {
    return new Date(2000, Math.max(0, month - 1), 1).toLocaleString('en', { month: 'short' });
  }

  daysText(item: any): string {
    const dueDate = item?.dueDate || item?.expiryDate;
    if (!dueDate) return '';
    const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Due today';
    return `${days}d left`;
  }

  deadlineClass(item: any): string {
    const dueDate = item?.dueDate || item?.expiryDate;
    if (!dueDate) return 'deadline-neutral';
    const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'deadline-danger';
    if (days <= 7) return 'deadline-warning';
    return 'deadline-safe';
  }

  loadTabData(): void {
    this.tabSub?.unsubscribe();
    this.tasksSub?.unsubscribe();
    const bid = this.selectedBranchId || undefined;
    this.error = '';

    switch (this.activeTab) {
      case 'tasks':
        this.tasksSub = this.api
          .getComplianceStatusTasks(this.month, this.year, {
            branchId: bid,
            category: this.taskCategory || undefined,
            status: this.taskStatus || undefined,
            limit: this.taskLimit,
          })
          .pipe(takeUntil(this.destroy$), timeout(10000))
          .subscribe({
            next: (res: any) => {
              this.tasks = res || [];
              this.cdr.markForCheck();
            },
            error: () => {
              this.tasks = [];
              this.error = 'Unable to load tasks. Please retry.';
              this.cdr.markForCheck();
            },
          });
        break;

      case 'returns':
        this.tabSub = this.api
          .getComplianceStatusReturns(this.month, this.year, bid)
          .pipe(takeUntil(this.destroy$), timeout(10000))
          .subscribe({
            next: (res: any) => {
              this.returnsData = res;
              this.cdr.markForCheck();
            },
            error: () => {
              this.returnsData = null;
              this.error = 'Unable to load returns data.';
              this.cdr.markForCheck();
            },
          });
        break;

      case 'contractors':
        this.tabSub = this.api
          .getComplianceStatusContractors(this.month, this.year, bid)
          .pipe(takeUntil(this.destroy$), timeout(10000))
          .subscribe({
            next: (res: any) => {
              this.contractorData = res;
              this.cdr.markForCheck();
            },
            error: () => {
              this.contractorData = null;
              this.error = 'Unable to load contractor data.';
              this.cdr.markForCheck();
            },
          });
        break;

      case 'audit':
        this.tabSub = this.api
          .getComplianceStatusAudit(this.month, this.year, bid)
          .pipe(takeUntil(this.destroy$), timeout(10000))
          .subscribe({
            next: (res: any) => {
              this.auditData = res;
              this.cdr.markForCheck();
            },
            error: () => {
              this.auditData = null;
              this.error = 'Unable to load audit data.';
              this.cdr.markForCheck();
            },
          });
        break;
    }
  }

  onFilterChange(): void {
    this.loadAll();
  }

  drillIntoBranch(branch: any): void {
    this.selectedBranchId = branch.branchId || branch.id || '';
    this.activeTab = 'tasks' as ActiveTab;
    this.loadAll();
  }

  onTabChange(tab: string): void {
    this.activeTab = tab as ActiveTab;
    this.loadTabData();
  }

  tabCount(tab: ActiveTab): number | undefined {
    switch (tab) {
      case 'branches': return this.branchRows.length;
      case 'tasks': return this.tasks.length;
      case 'returns': return this.returnsData?.data?.length || 0;
      default: return undefined;
    }
  }

  onCategoryChange(): void {
    this.loadTabData();
  }

  onTaskStatusChange(): void {
    this.loadTabData();
  }

  onTaskLimitChange(): void {
    if (this.taskLimit < 0) this.taskLimit = 0;
    if (this.taskLimit > 500) this.taskLimit = 500;
    this.loadTabData();
  }

  riskClass(risk: string): string {
    switch (risk) {
      case 'CRITICAL':
        return 'risk-critical';
      case 'HIGH':
        return 'risk-high';
      case 'MEDIUM':
        return 'risk-medium';
      case 'LOW':
        return 'risk-low';
      default:
        return '';
    }
  }

  pctBarWidth(pct: number): string {
    return `${Math.min(100, Math.max(0, pct))}%`;
  }

  pctBarColor(pct: number): string {
    if (pct >= 85) return 'bg-green-500';
    if (pct >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  /* ═══════ Defensive camelCase / snake_case helpers ═══════ */
  private pick<T = any>(row: any, ...keys: string[]): T | undefined {
    for (const k of keys) {
      if (row && row[k] !== undefined && row[k] !== null) return row[k];
    }
    return undefined;
  }

  getBranchId(row: any): string {
    return this.pick<string>(row, 'branchId', 'branch_id', 'id') || '';
  }

  getBranchName(row: any): string {
    return this.pick<string>(row, 'branchName', 'branch_name', 'name') || '-';
  }

  getClientName(row: any): string {
    return this.pick<string>(row, 'clientName', 'client_name') || '-';
  }

  getCompliancePct(row: any): number {
    return Number(this.pick(row, 'compliancePct', 'compliance_pct', 'pct') || 0);
  }

  clampPct(pct: number): number {
    const n = Number(pct || 0);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  pctBadgeClass(pct: number): string {
    const p = this.clampPct(pct);
    if (p < 50) return 'bg-red-100 text-red-800';
    if (p < 70) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  }

  barColorClass(pct: number): string {
    const p = this.clampPct(pct);
    if (p < 50) return 'bg-red-500';
    if (p < 70) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  get summaryRiskColor(): string {
    if (!this.summary) return 'gray';
    switch (this.summary.riskLevel) {
      case 'CRITICAL':
        return 'error';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      case 'LOW':
        return 'success';
      default:
        return 'gray';
    }
  }
}

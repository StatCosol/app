import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { ClientBranchesService } from '../../../core/client-branches.service';
import { ClientComplianceService } from '../../../core/client-compliance.service';
import { ClientAuditsService } from '../../../core/client-audits.service';
import { ClientContractorsService } from '../../../core/client-contractors.service';
import { ReturnsService } from '../../../core/returns.service';
import { ReportsService } from '../../../core/reports.service';
import { AuthService } from '../../../core/auth.service';
import {
  Employee,
  ClientEmployeesService,
} from '../employees/client-employees.service';
import {
  SafetyDocument,
  SafetyDocumentsApi,
} from '../../../core/api/safety-documents.api';
import { ToastService } from '../../../shared/toast/toast.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

type WorkspaceTab =
  | 'compliance'
  | 'uploads'
  | 'returns'
  | 'registrations'
  | 'safety'
  | 'audits'
  | 'employees'
  | 'contractors';

interface PendingPanelItem {
  label: string;
  count: number;
  tab: WorkspaceTab;
}

interface MonthTrendRow {
  month: string;
  completion: number;
  risk: number;
}

@Component({
  standalone: true,
  selector: 'app-branch-detail',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ActionButtonComponent,
  ],
  templateUrl: './branch-detail.component.html',
  styleUrls: ['./branch-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BranchDetailComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  branchId = '';
  branch: any | null = null;
  loading = false;
  isMasterUser = false;

  workspaceMonth = this.currentMonth();
  activeTab: WorkspaceTab = 'compliance';

  readonly tabs: Array<{ key: WorkspaceTab; label: string }> = [
    { key: 'compliance', label: 'Compliance' },
    { key: 'uploads', label: 'Uploads' },
    { key: 'returns', label: 'Returns' },
    { key: 'registrations', label: 'Registrations' },
    { key: 'safety', label: 'Safety' },
    { key: 'audits', label: 'Audits' },
    { key: 'employees', label: 'On-Role Employees' },
    { key: 'contractors', label: 'Contract Employees' },
  ];

  tabLoading: Record<WorkspaceTab, boolean> = {
    compliance: false,
    uploads: false,
    returns: false,
    registrations: false,
    safety: false,
    audits: false,
    employees: false,
    contractors: false,
  };

  tabLoaded: Record<WorkspaceTab, boolean> = {
    compliance: false,
    uploads: false,
    returns: false,
    registrations: false,
    safety: false,
    audits: false,
    employees: false,
    contractors: false,
  };

  riskScore = 0;
  completionScore = 0;
  pendingPanel: PendingPanelItem[] = [];
  trendRows: MonthTrendRow[] = [];
  sidePanelLoading = false;
  dashboardSnapshot: any = null;

  complianceSummary: any = null;
  complianceTasks: any[] = [];
  complianceReturns: any = null;
  complianceAudit: any = null;
  complianceCards = { applicable: 0, completed: 0, pending: 0, overdue: 0 };

  uploads: any[] = [];
  uploadCategory = 'COMPLIANCE_MONTHLY';
  uploadDocType = '';
  uploadYear = new Date().getFullYear();
  uploadMonth = new Date().getMonth() + 1;
  selectedUploadFile: File | null = null;
  uploadBusy = false;
  uploadError = '';
  reuploadTarget: any | null = null;
  reuploadFile: File | null = null;
  reuploadBusy = false;

  returns: any[] = [];
  registrations: any[] = [];
  safetyDocs: SafetyDocument[] = [];
  audits: any[] = [];
  employees: Employee[] = [];
  totalEmployees = 0;
  contractors: any[] = [];
  contractorBranchView: any = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly branchSvc: ClientBranchesService,
    private readonly complianceSvc: ClientComplianceService,
    private readonly returnsSvc: ReturnsService,
    private readonly safetyApi: SafetyDocumentsApi,
    private readonly auditsSvc: ClientAuditsService,
    private readonly employeesSvc: ClientEmployeesService,
    private readonly contractorsSvc: ClientContractorsService,
    private readonly protectedFiles: ProtectedFileService,
  ) {
    this.isMasterUser = this.auth.isMasterUser();
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const nextId = params.get('branchId') || params.get('id') || '';
      if (!nextId) {
        this.router.navigate(['/client/branches']);
        return;
      }
      if (nextId === this.branchId) {
        return;
      }
      this.branchId = nextId;
      this.resetWorkspace();
      this.loadBranchHeader();
      this.loadSidePanels();
      this.loadTabData('compliance', true);
      this.preloadSecondaryTabs();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setTab(tab: WorkspaceTab): void {
    this.activeTab = tab;
    this.loadTabData(tab);
  }

  onMonthChange(): void {
    this.loadSidePanels();
    this.loadTabData(this.activeTab, true);
    this.preloadSecondaryTabs(true);
  }

  refreshActiveTab(): void {
    this.loadTabData(this.activeTab, true);
  }

  goBack(): void {
    this.router.navigate(['/client/branches']);
  }

  exportWorkspaceSummary(): void {
    const rows = [
      { metric: 'Branch Name', value: this.branch?.branchName || '-' },
      { metric: 'Branch Code', value: this.branch?.branchCode || this.branchId },
      { metric: 'Workspace Month', value: this.workspaceMonth },
      { metric: 'Risk Score', value: this.riskScore },
      { metric: 'Completion %', value: this.completionScore },
      { metric: 'Compliance Pending', value: this.pendingCountFor('compliance') },
      { metric: 'Uploads Pending', value: this.pendingCountFor('uploads') },
      { metric: 'Returns Pending', value: this.pendingCountFor('returns') },
      { metric: 'Registrations Pending', value: this.pendingCountFor('registrations') },
      { metric: 'Safety Pending', value: this.pendingCountFor('safety') },
      { metric: 'Audits Pending', value: this.pendingCountFor('audits') },
      { metric: 'Employees Pending', value: this.pendingCountFor('employees') },
      { metric: 'Contractors At Risk', value: this.pendingCountFor('contractors') },
    ];
    ReportsService.exportCsv(
      rows,
      [
        { key: 'metric', label: 'Metric' },
        { key: 'value', label: 'Value' },
      ],
      `client-branch-workspace-${this.branchId}-${this.workspaceMonth}.csv`,
    );
  }

  jumpToPending(item: PendingPanelItem): void {
    this.setTab(item.tab);
  }

  trackById(index: number, row: any): string {
    return String(row?.id ?? row?.taskId ?? row?.code ?? index);
  }

  openPath(path?: string | null): void {
    if (!path) return;
    this.protectedFiles
      .open(path)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: (err) => {
          this.toast.error(err?.error?.message || 'Unable to open file.');
        },
      });
  }

  documentPath(row: any): string {
    return row?.filePath || row?.fileUrl || row?.path || row?.downloadUrl || row?.evidenceUrl || '';
  }

  onUploadFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedUploadFile = input?.files?.[0] || null;
  }

  uploadDocument(): void {
    if (!this.selectedUploadFile || !this.uploadDocType.trim()) {
      this.uploadError = 'Document type and file are required.';
      this.cdr.markForCheck();
      return;
    }

    this.uploadBusy = true;
    this.uploadError = '';
    this.branchSvc
      .uploadDocument(this.branchId, this.selectedUploadFile, {
        category: this.uploadCategory,
        docType: this.uploadDocType.trim(),
        periodYear: this.uploadCategory === 'COMPLIANCE_MONTHLY' ? this.uploadYear : undefined,
        periodMonth: this.uploadCategory === 'COMPLIANCE_MONTHLY' ? this.uploadMonth : undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.uploadBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.selectedUploadFile = null;
          this.uploadDocType = '';
          this.toast.success('Document uploaded.');
          this.loadTabData('uploads', true);
          this.loadBranchHeader();
        },
        error: (err) => {
          this.uploadError = err?.error?.message || 'Upload failed';
          this.toast.error(this.uploadError);
        },
      });
  }

  chooseReupload(row: any): void {
    this.reuploadTarget = row;
    this.reuploadFile = null;
  }

  onReuploadFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.reuploadFile = input?.files?.[0] || null;
  }

  cancelReupload(): void {
    this.reuploadTarget = null;
    this.reuploadFile = null;
  }

  doReupload(): void {
    if (!this.reuploadTarget?.id || !this.reuploadFile) return;
    this.reuploadBusy = true;
    this.branchSvc
      .reuploadDocument(String(this.reuploadTarget.id), this.reuploadFile)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.reuploadBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Re-upload submitted.');
          this.cancelReupload();
          this.loadTabData('uploads', true);
        },
        error: () => this.toast.error('Re-upload failed.'),
      });
  }

  returnsStatusCount(statuses: string[]): number {
    return this.returns.filter((r) => statuses.includes(String(r?.status || '').toUpperCase())).length;
  }

  safetyExpiredCount(): number {
    const now = Date.now();
    return this.safetyDocs.filter((d) => d.validTo && new Date(d.validTo).getTime() < now).length;
  }

  safetyExpiringSoonCount(days = 30): number {
    const now = Date.now();
    const max = now + days * 24 * 60 * 60 * 1000;
    return this.safetyDocs.filter((d) => {
      if (!d.validTo) return false;
      const time = new Date(d.validTo).getTime();
      return time >= now && time <= max;
    }).length;
  }

  employeesActiveCount(): number {
    return this.employees.filter((e) => !!e.isActive).length;
  }

  employeesPendingApprovalCount(): number {
    return this.employees.filter((e) => String(e.approvalStatus || '').toUpperCase() !== 'APPROVED').length;
  }

  contractorAtRiskCount(): number {
    return this.contractors.filter((c) => this.contractorUploadPercent(c) < 75).length;
  }

  contractorUploadPercent(row: any): number {
    const direct = Number(row?.uploadPercent ?? row?.documentsUploadPercent);
    if (!Number.isNaN(direct) && direct >= 0) return Math.min(100, direct);
    const uploaded = Number(row?.uploadedCount ?? row?.uploadedDocs ?? 0);
    const required = Number(row?.requiredCount ?? row?.totalRequired ?? 0);
    if (!required) return 0;
    return Math.round((uploaded / required) * 100);
  }

  registrationExpiringSoonCount(days = 30): number {
    const now = Date.now();
    const max = now + days * 24 * 60 * 60 * 1000;
    return this.registrations.filter((r) => {
      const date = this.registrationExpiry(r);
      if (!date) return false;
      const time = new Date(date).getTime();
      return time >= now && time <= max;
    }).length;
  }

  registrationExpiredCount(): number {
    const now = Date.now();
    return this.registrations.filter((r) => {
      const date = this.registrationExpiry(r);
      if (!date) return false;
      const time = new Date(date).getTime();
      return !Number.isNaN(time) && time < now;
    }).length;
  }

  registrationExpiry(row: any): string | null {
    return row?.expiryDate || row?.expiry_date || row?.validTo || row?.valid_to || null;
  }

  pendingCountFor(tab: WorkspaceTab): number {
    return this.pendingPanel.find((p) => p.tab === tab)?.count || 0;
  }

  totalPendingCount(): number {
    return this.pendingPanel.reduce((sum, item) => sum + Number(item.count || 0), 0);
  }

  overdueHotspotsCount(): number {
    const complianceOverdue = this.complianceCards.overdue || this.countByStatus(this.complianceTasks, ['OVERDUE']);
    const returnsOverdue = this.countByStatus(this.returns, ['OVERDUE']);
    const registrationExpired = this.registrationExpiredCount();
    const safetyExpired = this.safetyExpiredCount();
    const auditsOverdue = this.countByStatus(this.audits, ['OVERDUE']);
    return complianceOverdue + returnsOverdue + registrationExpired + safetyExpired + auditsOverdue;
  }

  monthLabel(monthValue: string): string {
    if (!monthValue || monthValue.length < 7) return monthValue;
    const [y, m] = monthValue.split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  riskBand(): string {
    if (this.riskScore >= 75) return 'High';
    if (this.riskScore >= 45) return 'Medium';
    return 'Low';
  }

  riskBandClass(): string {
    if (this.riskScore >= 75) return 'risk-badge risk-badge--high';
    if (this.riskScore >= 45) return 'risk-badge risk-badge--medium';
    return 'risk-badge risk-badge--low';
  }

  openComplianceModule(): void {
    this.router.navigate(['/client/compliance/status'], { queryParams: { branchId: this.branchId } });
  }

  openReturnsModule(): void {
    this.router.navigate(['/client/compliance/returns'], { queryParams: { branchId: this.branchId } });
  }

  openRegistrationsModule(): void {
    this.router.navigate(['/client/compliance/registrations'], { queryParams: { branchId: this.branchId } });
  }

  openSafetyModule(): void {
    this.router.navigate(['/client/safety'], { queryParams: { branchId: this.branchId } });
  }

  openAuditsModule(): void {
    this.router.navigate(['/client/audits'], { queryParams: { branchId: this.branchId } });
  }

  openEmployeesModule(): void {
    this.router.navigate(['/client/employees'], { queryParams: { branchId: this.branchId } });
  }

  openContractorsModule(): void {
    this.router.navigate(['/client/contractors/branch', this.branchId], { queryParams: { month: this.workspaceMonth } });
  }

  private loadBranchHeader(): void {
    this.loading = true;
    this.branchSvc
      .getById(this.branchId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.branch = res || null;
        },
        error: () => {
          this.branch = null;
          this.toast.error('Failed to load branch details.');
        },
      });
  }

  private loadSidePanels(): void {
    this.sidePanelLoading = true;
    forkJoin({
      risk: this.branchSvc.getRiskScore(this.workspaceMonth, this.branchId).pipe(catchError(() => of(null))),
      completion: this.branchSvc.getComplianceCompletion(this.workspaceMonth, this.branchId).pipe(catchError(() => of(null))),
      trend: this.branchSvc.getComplianceCompletionTrend(this.branchId, 6).pipe(catchError(() => of([]))),
      dashboard: this.branchSvc.getDashboard(this.branchId, this.workspaceMonth).pipe(catchError(() => of(null))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.sidePanelLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe(({ risk, completion, trend, dashboard }) => {
        this.dashboardSnapshot = dashboard;

        const riskFromApi = this.extractNumber(risk, ['riskScore', 'score', 'overallRisk', 'risk']);
        const riskFromDashboard = this.extractNumber(dashboard, ['vendorScorePercent', 'riskScore']);
        this.riskScore = this.safePercent(riskFromApi ?? riskFromDashboard ?? 0);

        const completionFromApi = this.extractNumber(completion, ['completionPercent', 'completionPct', 'percent']);
        const completionFromDashboard = this.extractNumber(dashboard, ['documentsUploadPercent']);
        this.completionScore = this.safePercent(completionFromApi ?? completionFromDashboard ?? 0);

        const rows = this.toArray(trend)
          .map((row: any) => ({
            month: String(row?.month || row?.period || row?.label || ''),
            completion: this.safePercent(
              this.extractNumber(row, ['completionPercent', 'completionPct', 'completion']) ?? 0,
            ),
            risk: this.safePercent(this.extractNumber(row, ['riskScore', 'risk']) ?? this.riskScore),
          }))
          .filter((row: MonthTrendRow) => !!row.month)
          .slice(-6);

        this.trendRows = rows.length
          ? rows
          : [
              {
                month: this.workspaceMonth,
                completion: this.completionScore,
                risk: this.riskScore,
              },
            ];

        this.rebuildPendingPanel();
      });
  }

  private loadTabData(tab: WorkspaceTab, force = false): void {
    if (!force && this.tabLoaded[tab]) return;
    if (this.tabLoading[tab]) return;

    switch (tab) {
      case 'compliance':
        this.loadCompliance();
        break;
      case 'uploads':
        this.loadUploads();
        break;
      case 'returns':
        this.loadReturns();
        break;
      case 'registrations':
        this.loadRegistrations();
        break;
      case 'safety':
        this.loadSafety();
        break;
      case 'audits':
        this.loadAudits();
        break;
      case 'employees':
        this.loadEmployees();
        break;
      case 'contractors':
        this.loadContractors();
        break;
    }
  }

  private preloadSecondaryTabs(force = false): void {
    for (const tab of this.tabs.map((t) => t.key)) {
      if (tab === this.activeTab) continue;
      this.loadTabData(tab, force);
    }
  }

  private loadCompliance(): void {
    this.tabLoading.compliance = true;
    const { year, month } = this.monthParts(this.workspaceMonth);

    forkJoin({
      summary: this.complianceSvc
        .getComplianceStatusSummary(month, year, this.branchId)
        .pipe(catchError(() => of(null))),
      tasks: this.complianceSvc
        .getComplianceStatusTasks(month, year, {
          branchId: this.branchId,
          limit: 12,
          offset: 0,
        })
        .pipe(catchError(() => of([]))),
      returns: this.complianceSvc
        .getComplianceStatusReturns(month, year, this.branchId)
        .pipe(catchError(() => of(null))),
      audit: this.complianceSvc
        .getComplianceStatusAudit(month, year, this.branchId)
        .pipe(catchError(() => of(null))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.tabLoading.compliance = false;
          this.tabLoaded.compliance = true;
          this.cdr.markForCheck();
        }),
      )
      .subscribe(({ summary, tasks, returns, audit }) => {
        this.complianceSummary = summary;
        this.complianceTasks = this.toArray(tasks?.items || tasks?.data || tasks);
        this.complianceReturns = returns;
        this.complianceAudit = audit;

        this.complianceCards.applicable = this.extractNumber(summary, ['applicable', 'totalApplicable', 'total']) ?? 0;
        this.complianceCards.completed = this.extractNumber(summary, ['completed', 'closed', 'done']) ?? 0;
        this.complianceCards.pending = this.extractNumber(summary, ['pending', 'open']) ?? 0;
        this.complianceCards.overdue = this.extractNumber(summary, ['overdue', 'delayed']) ?? 0;

        this.rebuildPendingPanel();
      });
  }

  private loadUploads(): void {
    this.tabLoading.uploads = true;
    this.branchSvc
      .listDocuments(this.branchId, {})
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([])),
        finalize(() => {
          this.tabLoading.uploads = false;
          this.tabLoaded.uploads = true;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((res: any) => {
        this.uploads = this.toArray(res);
        this.rebuildPendingPanel();
      });
  }

  private loadReturns(): void {
    this.tabLoading.returns = true;
    const { year, month } = this.monthParts(this.workspaceMonth);
    this.returnsSvc
      .listFilings({
        branchId: this.branchId,
        periodYear: year,
        periodMonth: month,
      })
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([])),
        finalize(() => {
          this.tabLoading.returns = false;
          this.tabLoaded.returns = true;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((res: any) => {
        this.returns = this.toArray(res?.data || res);
        this.rebuildPendingPanel();
      });
  }

  private loadRegistrations(): void {
    this.tabLoading.registrations = true;
    this.branchSvc
      .listRegistrations(this.branchId)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([])),
        finalize(() => {
          this.tabLoading.registrations = false;
          this.tabLoaded.registrations = true;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((res: any) => {
        this.registrations = this.toArray(res?.data || res);
        this.rebuildPendingPanel();
      });
  }

  private loadSafety(): void {
    this.tabLoading.safety = true;
    this.safetyApi
      .listForClient({ branchId: this.branchId })
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([])),
        finalize(() => {
          this.tabLoading.safety = false;
          this.tabLoaded.safety = true;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((rows) => {
        this.safetyDocs = rows || [];
        this.rebuildPendingPanel();
      });
  }

  private loadAudits(): void {
    this.tabLoading.audits = true;
    const year = this.monthParts(this.workspaceMonth).year;
    this.auditsSvc
      .list({ year })
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([])),
        finalize(() => {
          this.tabLoading.audits = false;
          this.tabLoaded.audits = true;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((res: any) => {
        const rows = this.toArray(res?.data || res);
        this.audits = rows.filter((row) => this.matchBranch(row));
        this.rebuildPendingPanel();
      });
  }

  private loadEmployees(): void {
    this.tabLoading.employees = true;
    this.employeesSvc
      .list({ branchId: this.branchId, limit: 20, offset: 0 })
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of({ data: [], total: 0 })),
        finalize(() => {
          this.tabLoading.employees = false;
          this.tabLoaded.employees = true;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((res) => {
        this.employees = res?.data || [];
        this.totalEmployees = Number(res?.total || 0);
        this.rebuildPendingPanel();
      });
  }

  private loadContractors(): void {
    this.tabLoading.contractors = true;
    forkJoin({
      rows: this.contractorsSvc
        .getContractors({ branchId: this.branchId, month: this.workspaceMonth })
        .pipe(catchError(() => of([]))),
      branchView: this.contractorsSvc
        .getBranchDashboard(this.branchId, this.workspaceMonth)
        .pipe(catchError(() => of(null))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.tabLoading.contractors = false;
          this.tabLoaded.contractors = true;
          this.cdr.markForCheck();
        }),
      )
      .subscribe(({ rows, branchView }) => {
        this.contractors = this.toArray(rows?.data || rows);
        this.contractorBranchView = branchView;
        this.rebuildPendingPanel();
      });
  }

  private rebuildPendingPanel(): void {
    const compliancePendingFromCards = this.complianceCards.pending + this.complianceCards.overdue;
    const compliancePendingFromTasks = this.countByStatus(this.complianceTasks, [
      'PENDING',
      'OPEN',
      'OVERDUE',
      'IN_PROGRESS',
    ]);
    const compliancePending =
      compliancePendingFromCards > 0 ? compliancePendingFromCards : compliancePendingFromTasks;

    const uploadsPendingFromRows = this.countByStatus(this.uploads, ['UPLOADED', 'UNDER_REVIEW', 'REJECTED']);
    const uploadsPendingFromDashboard =
      (this.extractNumber(this.dashboardSnapshot?.documentStats, ['underReview']) ?? 0) +
      (this.extractNumber(this.dashboardSnapshot?.documentStats, ['uploaded']) ?? 0) +
      (this.extractNumber(this.dashboardSnapshot?.documentStats, ['rejected']) ?? 0);
    const uploadsPending = uploadsPendingFromRows > 0 ? uploadsPendingFromRows : uploadsPendingFromDashboard;

    const returnsPending = this.countByStatus(this.returns, ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'REJECTED']);
    const registrationsPending = this.countNonTerminal(this.registrations, ['APPROVED', 'ACTIVE', 'COMPLETED']);
    const safetyPending = this.safetyExpiringSoonCount() + this.safetyExpiredCount();
    const auditsPending = this.countByStatus(this.audits, ['PLANNED', 'IN_PROGRESS', 'OPEN']);
    const employeesPending = this.employeesPendingApprovalCount();
    const contractorsAtRisk = this.contractorAtRiskCount();

    this.pendingPanel = [
      { label: 'Compliance Pending', count: compliancePending, tab: 'compliance' },
      { label: 'Uploads Pending', count: uploadsPending, tab: 'uploads' },
      { label: 'Returns Pending', count: returnsPending, tab: 'returns' },
      { label: 'Registrations Pending', count: registrationsPending, tab: 'registrations' },
      { label: 'Safety Exceptions', count: safetyPending, tab: 'safety' },
      { label: 'Audits Open', count: auditsPending, tab: 'audits' },
      { label: 'Employee Approvals', count: employeesPending, tab: 'employees' },
      { label: 'Contractors At Risk', count: contractorsAtRisk, tab: 'contractors' },
    ];
  }

  private matchBranch(row: any): boolean {
    const keys = [row?.branchId, row?.branch_id, row?.branch?.id];
    const hasBranchField = keys.some((v) => v !== undefined && v !== null && v !== '');
    if (!hasBranchField) return true;
    return keys.some((v) => String(v) === String(this.branchId));
  }

  private countByStatus(rows: any[], statuses: string[]): number {
    const wanted = statuses.map((s) => s.toUpperCase());
    return rows.filter((row) => wanted.includes(String(row?.status || row?.windowStatus || '').toUpperCase())).length;
  }

  private countNonTerminal(rows: any[], terminal: string[]): number {
    const terminalSet = terminal.map((x) => x.toUpperCase());
    return rows.filter((row) => !terminalSet.includes(String(row?.status || '').toUpperCase())).length;
  }

  private extractNumber(source: any, keys: string[]): number | null {
    if (!source) return null;
    for (const key of keys) {
      const value = source?.[key];
      const num = Number(value);
      if (!Number.isNaN(num)) return num;
    }
    return null;
  }

  private safePercent(value: number): number {
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private monthParts(value: string): { year: number; month: number } {
    const [yearStr, monthStr] = String(value || '').split('-');
    const year = Number(yearStr) || new Date().getFullYear();
    const month = Number(monthStr) || new Date().getMonth() + 1;
    return { year, month };
  }

  private toArray(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.rows)) return payload.rows;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }

  private resetWorkspace(): void {
    this.branch = null;
    this.riskScore = 0;
    this.completionScore = 0;
    this.dashboardSnapshot = null;
    this.pendingPanel = [];
    this.trendRows = [];

    this.complianceSummary = null;
    this.complianceTasks = [];
    this.complianceReturns = null;
    this.complianceAudit = null;
    this.complianceCards = { applicable: 0, completed: 0, pending: 0, overdue: 0 };

    this.uploads = [];
    this.returns = [];
    this.registrations = [];
    this.safetyDocs = [];
    this.audits = [];
    this.employees = [];
    this.totalEmployees = 0;
    this.contractors = [];
    this.contractorBranchView = null;
    this.reuploadTarget = null;
    this.reuploadFile = null;
    this.uploadError = '';

    this.tabLoaded = {
      compliance: false,
      uploads: false,
      returns: false,
      registrations: false,
      safety: false,
      audits: false,
      employees: false,
      contractors: false,
    };
  }
}

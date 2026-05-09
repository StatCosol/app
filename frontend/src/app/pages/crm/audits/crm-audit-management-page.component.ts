import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { environment } from '../../../../environments/environment';
import { AuditsService } from '../../../core/audits.service';
import { CrmClientsApi, BranchDto } from '../../../core/api/crm-clients.api';
import { CrmComplianceTrackerApi } from '../../../core/api/crm-compliance-tracker.api';
import { ClientDto } from '../../../core/api/cco-clients.api';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

type AuditStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type AuditFrequency =
  | 'MONTHLY'
  | 'BI_MONTHLY'
  | 'QUARTERLY'
  | 'HALF_YEARLY'
  | 'YEARLY';

interface AuditRow {
  id: string;
  auditCode: string;
  clientId: string;
  branchId?: string | null;
  branchName?: string | null;
  branch?: { id?: string; branchName?: string | null };
  contractorUserId?: string | null;
  frequency: AuditFrequency;
  auditType: string;
  periodYear: number;
  periodCode: string;
  assignedAuditorId: string;
  status: AuditStatus;
  score?: number | null;
  dueDate?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  client?: { id?: string; clientName?: string | null };
  contractorUser?: { id?: string; name?: string | null };
  assignedAuditor?: { id?: string; name?: string | null };
}

interface AuditorOption {
  id: string;
  name: string;
  email?: string | null;
}

interface ClosureSummary {
  auditId: string;
  auditCode: string;
  criticalOpen: number;
  majorOpen: number;
  minorOpen: number;
  totalObservations: number;
  closedObservations: number;
  closurePct: number;
}

interface CalendarRow {
  dateKey: string;
  dateLabel: string;
  planned: number;
  inProgress: number;
  completed: number;
  total: number;
}

interface ReadinessItem {
  label: string;
  ok: boolean;
  hint: string;
}

interface ReadinessResponse {
  checklist?: ReadinessItem[];
}

interface ReportStatusResponse {
  stage?: 'NOT_STARTED' | 'DRAFT' | 'FINAL';
  status?: string | null;
  updatedAt?: string | null;
}

interface ContractorOption {
  id: string;
  name: string;
  email: string;
}

interface ScheduleModel {
  clientId: string;
  branchId: string;
  contractorUserId: string;
  frequency: AuditFrequency;
  auditType: string;
  periodYear: number;
  periodCode: string;
  assignedAuditorId: string;
  dueDate: string;
  notes: string;
}

@Component({
  selector: 'app-crm-audit-management-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    ActionButtonComponent,
  ],
  templateUrl: './crm-audit-management-page.component.html',
  styleUrls: ['./crm-audit-management-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrmAuditManagementPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly baseUrl = environment.apiBaseUrl;

  loading = true;
  listBusy = false;
  detailBusy = false;
  actionBusy = false;

  clients: ClientDto[] = [];
  auditors: AuditorOption[] = [];
  branchesByClient: Record<string, BranchDto[]> = {};
  contractorsByClient: Record<string, ContractorOption[]> = {};

  audits: AuditRow[] = [];
  filteredAudits: AuditRow[] = [];
  selectedAudit: AuditRow | null = null;
  selectedDetail: AuditRow | null = null;
  closuresByAuditId: Record<string, ClosureSummary> = {};

  calendarMonth = this.currentMonth();
  calendarRows: CalendarRow[] = [];

  search = '';
  statusFilter = '';
  clientFilter = '';
  yearFilter = '';
  typeFilter = '';

  showScheduleModal = false;
  scheduleSaving = false;
  scheduleMode: 'CREATE' | 'ASSIGN' = 'CREATE';
  scheduleAuditId: string | null = null;
  scheduleModel: ScheduleModel = this.defaultScheduleModel();
  latestReadiness: ReadinessResponse | null = null;
  latestReportStatus: ReportStatusResponse | null = null;
  autoGenerating = false;
  governanceBusy = false;

  readonly statusOptions = [
    { value: '', label: 'All statuses' },
    { value: 'PLANNED', label: 'Planned' },
    { value: 'IN_PROGRESS', label: 'In progress' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'CORRECTION_PENDING', label: 'Correction Pending' },
    { value: 'REVERIFICATION_PENDING', label: 'Reverification Pending' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'CLOSED', label: 'Closed' },
  ];

  readonly frequencyOptions: { value: AuditFrequency; label: string }[] = [
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'BI_MONTHLY', label: 'Bi-monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'HALF_YEARLY', label: 'Half-yearly' },
    { value: 'YEARLY', label: 'Yearly' },
  ];

  readonly auditTypes = [
    { value: 'CONTRACTOR', label: 'Contractor Audit' },
    { value: 'FACTORY', label: 'Factory Audit' },
    { value: 'SHOPS_ESTABLISHMENT', label: 'Branch Compliance Audit' },
    { value: 'LABOUR_EMPLOYMENT', label: 'Labour Law Audit' },
    { value: 'FSSAI', label: 'FSSAI Audit' },
    { value: 'HR', label: 'HR Audit' },
    { value: 'PAYROLL', label: 'Payroll Audit' },
    { value: 'GAP', label: 'Other Audit' },
  ];

  constructor(
    private readonly auditsService: AuditsService,
    private readonly crmClientsApi: CrmClientsApi,
    private readonly trackerApi: CrmComplianceTrackerApi,
    private readonly http: HttpClient,
    private readonly toast: ToastService,
    private readonly dialog: ConfirmDialogService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadInitialData();
  }

  goBack(): void {
    this.router.navigate(['/crm/dashboard']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get totalCount(): number {
    return this.filteredAudits.length;
  }

  get plannedCount(): number {
    return this.filteredAudits.filter((x) => x.status === 'PLANNED').length;
  }

  get inProgressCount(): number {
    return this.filteredAudits.filter((x) => x.status === 'IN_PROGRESS').length;
  }

  get completedCount(): number {
    return this.filteredAudits.filter((x) => x.status === 'COMPLETED').length;
  }

  get overdueCount(): number {
    const now = Date.now();
    return this.filteredAudits.filter((x) => {
      if (!x.dueDate) return false;
      if (x.status === 'COMPLETED' || x.status === 'CANCELLED') return false;
      const due = new Date(x.dueDate).getTime();
      return !Number.isNaN(due) && due < now;
    }).length;
  }

  get completionPct(): number {
    if (!this.totalCount) return 0;
    return Math.round((this.completedCount / this.totalCount) * 100);
  }

  get readyCount(): number {
    return this.filteredAudits.filter((row) => this.isAuditReady(row)).length;
  }

  get reportSubmittedCount(): number {
    return this.filteredAudits.filter((row) => row.status === 'COMPLETED').length;
  }

  get capaOpenCount(): number {
    return this.filteredAudits.reduce((sum, row) => {
      const closure = this.closuresByAuditId[row.id];
      if (!closure) return sum;
      return sum + Number(closure.criticalOpen || 0) + Number(closure.majorOpen || 0) + Number(closure.minorOpen || 0);
    }, 0);
  }

  get currentAudit(): AuditRow | null {
    return this.selectedDetail || this.selectedAudit;
  }

  get currentClosure(): ClosureSummary | null {
    const auditId = this.currentAudit?.id;
    if (!auditId) return null;
    return this.closuresByAuditId[auditId] || null;
  }

  get reportPhase(): string {
    const stage = this.latestReportStatus?.stage;
    if (stage === 'FINAL') return 'Submitted';
    if (stage === 'DRAFT') return 'Draft in progress';
    const status = this.currentAudit?.status;
    if (status === 'CANCELLED') return 'Cancelled';
    return 'Not started';
  }

  get reportPhaseClass(): string {
    const stage = this.latestReportStatus?.stage;
    if (stage === 'FINAL') return 'phase phase--done';
    if (stage === 'DRAFT') return 'phase phase--work';
    const status = this.currentAudit?.status;
    if (status === 'CANCELLED') return 'phase phase--muted';
    return 'phase phase--todo';
  }

  get readinessChecklist(): ReadinessItem[] {
    if (this.latestReadiness?.checklist?.length) return this.latestReadiness.checklist;
    const audit = this.currentAudit;
    const closure = this.currentClosure;
    if (!audit) return [];
    return [
      {
        label: 'Client scope linked',
        ok: !!audit.clientId,
        hint: audit.clientId ? 'Client mapping available' : 'Client scope missing',
      },
      {
        label: 'Period configured',
        ok: !!audit.periodYear && !!audit.periodCode,
        hint:
          audit.periodYear && audit.periodCode
            ? `${audit.periodCode}`
            : 'Period year/code missing',
      },
      {
        label: 'Auditor assigned',
        ok: !!audit.assignedAuditorId || !!audit.assignedAuditor?.id,
        hint: this.auditAuditorName(audit) || 'Assignment required',
      },
      {
        label: 'Schedule locked',
        ok: !!audit.dueDate,
        hint: audit.dueDate ? this.formatDate(audit.dueDate) : 'Due date not set',
      },
      {
        label: 'Execution started',
        ok: audit.status === 'IN_PROGRESS' || audit.status === 'COMPLETED',
        hint:
          audit.status === 'PLANNED'
            ? 'Audit not started'
            : `Current status: ${audit.status.replace('_', ' ')}`,
      },
      {
        label: 'CAPA tracking present',
        ok: !!closure && Number(closure.totalObservations || 0) > 0,
        hint:
          closure && closure.totalObservations > 0
            ? `${closure.totalObservations} observations`
            : 'No observations linked yet',
      },
    ];
  }

  get readinessCompletedCount(): number {
    return this.readinessChecklist.filter((item) => item.ok).length;
  }

  get readinessPct(): number {
    const total = this.readinessChecklist.length;
    if (!total) return 0;
    return Math.round((this.readinessCompletedCount / total) * 100);
  }

  get modalBranches(): BranchDto[] {
    const clientId = this.scheduleModel.clientId;
    if (!clientId) return [];
    return this.branchesByClient[clientId] || [];
  }

  get isAssignMode(): boolean {
    return this.scheduleMode === 'ASSIGN';
  }

  trackAudit(_: number, row: AuditRow): string {
    return row.id;
  }

  trackCalendar(_: number, row: CalendarRow): string {
    return row.dateKey;
  }

  applyFilters(): void {
    const q = this.search.trim().toLowerCase();
    const year = this.yearFilter.trim();
    this.filteredAudits = this.audits
      .filter((row) => {
        if (this.statusFilter && row.status !== this.statusFilter) return false;
        if (this.clientFilter && row.clientId !== this.clientFilter) return false;
        if (year && String(row.periodYear) !== year) return false;
        if (this.typeFilter && row.auditType !== this.typeFilter) return false;
        if (!q) return true;
        const text = [
          row.auditCode,
          this.auditClientName(row),
          this.auditAuditorName(row),
          row.auditType,
          row.periodCode,
        ]
          .join(' ')
          .toLowerCase();
        return text.includes(q);
      })
      .sort((a, b) => {
        const dueDiff = this.timeValue(a.dueDate) - this.timeValue(b.dueDate);
        if (dueDiff !== 0) return dueDiff;
        return this.timeValue(b.createdAt) - this.timeValue(a.createdAt);
      });

    this.hydrateSelection(this.selectedAudit?.id || null);
    this.rebuildCalendar();
  }

  clearFilters(): void {
    this.search = '';
    this.statusFilter = '';
    this.clientFilter = '';
    this.yearFilter = '';
    this.typeFilter = '';
    this.applyFilters();
  }

  selectAudit(row: AuditRow): void {
    this.selectedAudit = row;
    if (this.selectedDetail?.id === row.id) {
      this.cdr.markForCheck();
      return;
    }
    this.loadAuditDetail(row.id);
  }

  getNextStatuses(status: AuditStatus): { label: string; value: AuditStatus; variant: 'primary' | 'danger' }[] {
    // CRM is a scheduler, not an executor. Only Cancel is allowed here.
    // Auditors start/complete audits from the AuditXpert (Auditor) portal.
    const map: Record<
      AuditStatus,
      { label: string; value: AuditStatus; variant: 'primary' | 'danger' }[]
    > = {
      PLANNED: [
        { label: 'Cancel', value: 'CANCELLED', variant: 'danger' },
      ],
      IN_PROGRESS: [],
      COMPLETED: [],
      CANCELLED: [],
    };
    return map[status] || [];
  }

  async changeStatus(audit: AuditRow, newStatus: AuditStatus): Promise<void> {
    if (this.actionBusy) return;
    const label = newStatus === 'IN_PROGRESS' ? 'start' : newStatus === 'COMPLETED' ? 'complete' : 'cancel';
    const confirmed = await this.dialog.confirm(
      'Update Audit Status',
      `Do you want to ${label} ${audit.auditCode}?`,
      {
        confirmText: label.charAt(0).toUpperCase() + label.slice(1),
        variant: newStatus === 'CANCELLED' ? 'danger' : 'default',
      },
    );
    if (!confirmed) return;

    this.actionBusy = true;
    this.auditsService
      .crmUpdateStatus(audit.id, newStatus)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(`Audit moved to ${newStatus.replace('_', ' ')}`);
          this.refreshWorkspace(audit.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to update status'),
      });
  }

  async openScheduleModal(base?: AuditRow): Promise<void> {
    this.scheduleModel = this.defaultScheduleModel();
    this.scheduleMode = base ? 'ASSIGN' : 'CREATE';
    this.scheduleAuditId = base?.id || null;
    if (base) {
      this.scheduleModel = {
        ...this.scheduleModel,
        clientId: base.clientId,
        branchId: base.branchId || '',
        frequency: base.frequency || 'MONTHLY',
        auditType: base.auditType || 'CONTRACTOR',
        periodYear: base.periodYear || new Date().getFullYear(),
        periodCode: base.periodCode || this.defaultPeriodCode(),
        assignedAuditorId: base.assignedAuditorId || '',
      };
    }
    this.showScheduleModal = true;
    if (this.scheduleModel.clientId) {
      this.loadBranchesForClient(this.scheduleModel.clientId);
      this.loadContractorsForClient(this.scheduleModel.clientId);
    }
  }

  closeScheduleModal(): void {
    if (this.scheduleSaving) return;
    this.showScheduleModal = false;
    this.scheduleMode = 'CREATE';
    this.scheduleAuditId = null;
  }

  onScheduleClientChange(): void {
    this.scheduleModel.branchId = '';
    this.scheduleModel.contractorUserId = '';
    if (this.scheduleModel.clientId) {
      this.loadBranchesForClient(this.scheduleModel.clientId);
      this.loadContractorsForClient(this.scheduleModel.clientId);
    }
  }

  get modalContractors(): ContractorOption[] {
    const clientId = this.scheduleModel.clientId;
    if (!clientId) return [];
    return this.contractorsByClient[clientId] || [];
  }

  saveSchedule(): void {
    if (this.scheduleSaving) return;
    if (this.scheduleMode === 'ASSIGN') {
      if (!this.scheduleModel.assignedAuditorId) {
        this.toast.error('Auditor is required.');
        return;
      }
      if (!this.scheduleModel.dueDate) {
        this.toast.error('Due date is required.');
        return;
      }
    } else if (
      !this.scheduleModel.clientId ||
      !this.scheduleModel.assignedAuditorId ||
      !this.scheduleModel.periodCode ||
      !this.scheduleModel.dueDate
    ) {
      this.toast.error('Client, auditor, period code, and due date are required.');
      return;
    }

    const periodYear = Number(this.scheduleModel.periodYear);
    if (!Number.isFinite(periodYear) || periodYear < 2000 || periodYear > 2100) {
      this.toast.error('Period year must be between 2000 and 2100.');
      return;
    }

    const payload: Record<string, any> = {
      clientId: this.scheduleModel.clientId,
      frequency: this.scheduleModel.frequency,
      auditType: this.scheduleModel.auditType,
      periodYear,
      periodCode: this.scheduleModel.periodCode.trim(),
      assignedAuditorId: this.scheduleModel.assignedAuditorId,
    };
    if (this.scheduleModel.branchId) payload['branchId'] = this.scheduleModel.branchId;
    if (this.scheduleModel.contractorUserId) payload['contractorUserId'] = this.scheduleModel.contractorUserId;
    if (this.scheduleModel.dueDate) payload['dueDate'] = this.scheduleModel.dueDate;
    if (this.scheduleModel.notes.trim()) payload['notes'] = this.scheduleModel.notes.trim();

    this.scheduleSaving = true;
    if (this.scheduleMode === 'ASSIGN' && this.scheduleAuditId) {
      this.auditsService
        .crmAssignAuditor(this.scheduleAuditId, {
          assignedAuditorId: this.scheduleModel.assignedAuditorId,
          dueDate: this.scheduleModel.dueDate || null,
          notes: this.scheduleModel.notes.trim() || null,
        })
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => {
            this.scheduleSaving = false;
            this.cdr.markForCheck();
          }),
        )
        .subscribe({
          next: () => {
            this.toast.success('Auditor assignment updated.');
            this.showScheduleModal = false;
            this.refreshWorkspace(this.scheduleAuditId);
          },
          error: (err) => this.toast.error(err?.error?.message || 'Unable to update assignment'),
        });
      return;
    }

    this.auditsService
      .crmCreateAudit(payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.scheduleSaving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.toast.success(`Audit scheduled: ${res?.auditCode || 'success'}`);
          this.showScheduleModal = false;
          this.refreshWorkspace(res?.id || null);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Unable to schedule audit'),
      });
  }

  setCalendarMonth(value: string): void {
    this.calendarMonth = value || this.currentMonth();
    this.rebuildCalendar();
  }

  autoGenerateSchedules(): void {
    if (this.autoGenerating) return;
    this.autoGenerating = true;
    this.cdr.markForCheck();

    this.auditsService.autoGenerateSchedules()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.autoGenerating = false; this.cdr.markForCheck(); }),
      )
      .subscribe({
        next: (res) => {
          const created = res?.created ?? 0;
          const skipped = res?.skipped ?? 0;
          this.toast.success(`Auto-generated ${created} schedules (${skipped} skipped).`);
          this.loadInitialData();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Auto-generation failed'),
      });
  }

  auditClientName(row: AuditRow): string {
    return row.client?.clientName || this.clients.find((c) => c.id === row.clientId)?.clientName || '-';
  }

  auditAuditorName(row: AuditRow): string {
    return row.assignedAuditor?.name || this.auditors.find((a) => a.id === row.assignedAuditorId)?.name || '-';
  }

  formatDate(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString();
  }

  shortId(input?: string | null): string {
    if (!input) return '-';
    return input.slice(0, 8).toUpperCase();
  }

  auditReadinessLabel(row: AuditRow): string {
    return this.isAuditReady(row) ? 'Ready' : 'Needs prep';
  }

  auditReadinessClass(row: AuditRow): string {
    return this.isAuditReady(row) ? 'readiness-chip readiness-chip--ok' : 'readiness-chip readiness-chip--warn';
  }

  auditReportLabel(row: AuditRow): string {
    if (row.status === 'COMPLETED') return 'Submitted';
    if (row.status === 'IN_PROGRESS') return 'Draft';
    if (row.status === 'CANCELLED') return 'Cancelled';
    return 'Not started';
  }

  auditReportClass(row: AuditRow): string {
    if (row.status === 'COMPLETED') return 'report-chip report-chip--ok';
    if (row.status === 'IN_PROGRESS') return 'report-chip report-chip--work';
    if (row.status === 'CANCELLED') return 'report-chip report-chip--muted';
    return 'report-chip report-chip--todo';
  }

  private loadInitialData(): void {
    this.loading = true;
    forkJoin({
      clients: this.crmClientsApi.getAssignedClients().pipe(catchError(() => of([] as ClientDto[]))),
      auditors: this.http
        .get<AuditorOption[]>(`${this.baseUrl}/api/v1/crm/users/auditors`)
        .pipe(catchError(() => of([] as AuditorOption[]))),
      audits: this.auditsService
        .crmListAudits({ pageSize: 250 })
        .pipe(catchError(() => of({ data: [] as AuditRow[] }))),
      closures: this.trackerApi.getAuditClosures().pipe(catchError(() => of({ data: [] }))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ clients, auditors, audits, closures }) => {
          this.clients = clients || [];
          this.auditors = auditors || [];
          this.audits = (audits?.data || []) as AuditRow[];
          this.closuresByAuditId = this.toClosureMap(closures?.data || []);
          this.applyFilters();
        },
      });
  }

  refreshWorkspace(preferredAuditId: string | null): void {
    this.listBusy = true;
    forkJoin({
      audits: this.auditsService.crmListAudits({ pageSize: 250 }),
      closures: this.trackerApi.getAuditClosures(),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.listBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ audits, closures }) => {
          this.audits = (audits?.data || []) as AuditRow[];
          this.closuresByAuditId = this.toClosureMap(closures?.data || []);
          this.applyFilters();
          if (preferredAuditId) {
            const found = this.filteredAudits.find((x) => x.id === preferredAuditId);
            if (found) this.selectAudit(found);
          }
        },
        error: () => this.toast.error('Failed to refresh audits'),
      });
  }

  private hydrateSelection(id: string | null): void {
    if (!this.filteredAudits.length) {
      this.selectedAudit = null;
      this.selectedDetail = null;
      this.latestReadiness = null;
      this.latestReportStatus = null;
      return;
    }
    if (id) {
      const found = this.filteredAudits.find((x) => x.id === id);
      if (found) {
        this.selectedAudit = found;
        if (this.selectedDetail?.id !== found.id) {
          this.loadAuditDetail(found.id);
        }
        return;
      }
    }
    this.selectAudit(this.filteredAudits[0]);
  }

  private loadAuditDetail(auditId: string): void {
    this.detailBusy = true;
    this.auditsService
      .crmGetAudit(auditId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.detailBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (row) => {
          this.selectedDetail = (row || null) as AuditRow | null;
          this.loadAuditInsights(auditId);
        },
        error: () => {
          this.selectedDetail = this.selectedAudit;
          this.loadAuditInsights(auditId);
        },
      });
  }

  private loadAuditInsights(auditId: string): void {
    forkJoin({
      readiness: this.auditsService
        .crmGetReadiness(auditId)
        .pipe(catchError(() => of(null))),
      reportStatus: this.auditsService
        .crmGetReportStatus(auditId)
        .pipe(catchError(() => of(null))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ readiness, reportStatus }) => {
        this.latestReadiness = readiness as ReadinessResponse | null;
        this.latestReportStatus = reportStatus as ReportStatusResponse | null;
        this.cdr.markForCheck();
      });
  }

  private loadBranchesForClient(clientId: string): void {
    if (!clientId || this.branchesByClient[clientId]) return;
    this.crmClientsApi
      .getBranchesForClient(clientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => {
          this.branchesByClient[clientId] = rows || [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.branchesByClient[clientId] = [];
          this.cdr.markForCheck();
        },
      });
  }

  private loadContractorsForClient(clientId: string): void {
    if (!clientId || this.contractorsByClient[clientId]) return;
    this.http
      .get<ContractorOption[]>(`${this.baseUrl}/api/v1/crm/users/contractors`, {
        params: { clientId },
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => {
          this.contractorsByClient[clientId] = rows || [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.contractorsByClient[clientId] = [];
          this.cdr.markForCheck();
        },
      });
  }

  private rebuildCalendar(): void {
    const map = new Map<string, CalendarRow>();
    for (const row of this.filteredAudits) {
      if (!row.dueDate || !row.dueDate.startsWith(this.calendarMonth)) continue;
      const key = row.dueDate.slice(0, 10);
      const found = map.get(key) || {
        dateKey: key,
        dateLabel: this.formatDate(key),
        planned: 0,
        inProgress: 0,
        completed: 0,
        total: 0,
      };
      if (row.status === 'PLANNED') found.planned += 1;
      if (row.status === 'IN_PROGRESS') found.inProgress += 1;
      if (row.status === 'COMPLETED') found.completed += 1;
      found.total += 1;
      map.set(key, found);
    }

    this.calendarRows = Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }

  private toClosureMap(rows: any[]): Record<string, ClosureSummary> {
    const map: Record<string, ClosureSummary> = {};
    for (const raw of rows || []) {
      const normalized: ClosureSummary = {
        auditId: String(raw?.auditId || ''),
        auditCode: String(raw?.auditCode || ''),
        criticalOpen: Number(raw?.criticalOpen || 0),
        majorOpen: Number(raw?.majorOpen || 0),
        minorOpen: Number(raw?.minorOpen || 0),
        totalObservations: Number(raw?.totalObservations || 0),
        closedObservations: Number(raw?.closedObservations || 0),
        closurePct: Number(raw?.closurePct || 0),
      };
      if (normalized.auditId) map[normalized.auditId] = normalized;
    }
    return map;
  }

  private defaultScheduleModel(): ScheduleModel {
    return {
      clientId: '',
      branchId: '',
      contractorUserId: '',
      frequency: 'MONTHLY',
      auditType: 'CONTRACTOR',
      periodYear: new Date().getFullYear(),
      periodCode: this.defaultPeriodCode(),
      assignedAuditorId: '',
      dueDate: '',
      notes: '',
    };
  }

  private defaultPeriodCode(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  }

  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private isAuditReady(row: AuditRow): boolean {
    return !!(
      row.clientId &&
      row.periodYear &&
      row.periodCode &&
      (row.assignedAuditorId || row.assignedAuditor?.id) &&
      row.dueDate
    );
  }

  private timeValue(input?: string | null): number {
    if (!input) return Number.MAX_SAFE_INTEGER;
    const value = new Date(input).getTime();
    return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
  }

  approveReport(): void {
    const id = this.currentAudit?.id;
    if (!id || this.governanceBusy) return;
    this.governanceBusy = true;
    this.auditsService.crmApproveReport(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Report approved');
        this.governanceBusy = false;
        this.loadAuditInsights(id);
        this.cdr.markForCheck();
      },
      error: (e: any) => {
        this.toast.error(e?.error?.message || 'Failed to approve report');
        this.governanceBusy = false;
        this.cdr.markForCheck();
      },
    });
  }

  publishReport(): void {
    const id = this.currentAudit?.id;
    if (!id || this.governanceBusy) return;
    this.governanceBusy = true;
    this.auditsService.crmPublishReport(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Report published');
        this.governanceBusy = false;
        this.loadAuditInsights(id);
        this.cdr.markForCheck();
      },
      error: (e: any) => {
        this.toast.error(e?.error?.message || 'Failed to publish report');
        this.governanceBusy = false;
        this.cdr.markForCheck();
      },
    });
  }

  sendBackReport(): void {
    const id = this.currentAudit?.id;
    if (!id || this.governanceBusy) return;
    const reason = window.prompt('Reason for sending back (optional):') ?? '';
    this.governanceBusy = true;
    this.auditsService.crmSendBackReport(id, reason).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Report sent back to auditor');
        this.governanceBusy = false;
        this.loadAuditInsights(id);
        this.cdr.markForCheck();
      },
      error: (e: any) => {
        this.toast.error(e?.error?.message || 'Failed to send back report');
        this.governanceBusy = false;
        this.cdr.markForCheck();
      },
    });
  }

  holdReport(): void {
    const id = this.currentAudit?.id;
    if (!id || this.governanceBusy) return;
    const notes = window.prompt('Hold notes (optional):') ?? '';
    this.governanceBusy = true;
    this.auditsService.crmHoldReport(id, notes).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Report placed on hold');
        this.governanceBusy = false;
        this.loadAuditInsights(id);
        this.cdr.markForCheck();
      },
      error: (e: any) => {
        this.toast.error(e?.error?.message || 'Failed to hold report');
        this.governanceBusy = false;
        this.cdr.markForCheck();
      },
    });
  }
}

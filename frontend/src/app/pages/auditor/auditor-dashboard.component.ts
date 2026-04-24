import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { timeout, finalize, takeUntil } from 'rxjs/operators';
import { Subject, Subscription } from 'rxjs';
import { DashboardService } from '../../core/dashboard.service';
import { AuditsService } from '../../core/audits.service';
import { AuditorObservationsService } from '../../core/auditor-observations.service';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  StatusBadgeComponent,
  ActionButtonComponent,
  FormInputComponent,
  FormSelectComponent,
} from '../../shared/ui';
import {
  AuditorFilters,
  AuditorAuditItem,
  AuditorObservationPending,
  AuditorEvidencePending,
  AuditorReportPending,
  AuditorActivityItem,
} from './auditor-dashboard.dto';

@Component({
  selector: 'app-auditor-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    DataTableComponent,
    TableCellDirective,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    ActionButtonComponent,
    FormInputComponent,
    FormSelectComponent,
  ],
  templateUrl: './auditor-dashboard.component.html',
  styleUrls: ['./auditor-dashboard.component.scss'],
})
export class AuditorDashboardComponent implements OnInit, OnDestroy {
  loading = true;
  errorMsg: string | null = null;

  private destroy$ = new Subject<void>();
  private summarySub?: Subscription;
  private auditsSub?: Subscription;
  private obsSub?: Subscription;
  private evidenceSub?: Subscription;
  private activitySub?: Subscription;

  // Filters
  filter: AuditorFilters = {
    clientId: null,
    auditType: null,
    fromDate: null,
    toDate: null,
  };

  // Reference data for filters
  clients: Array<{ id: string; name: string }> = [];

  // Select options
  clientOptions: Array<{ value: string | null; label: string }> = [
    { value: null, label: 'All Clients' },
  ];

  auditTypeOptions = [
    { value: null, label: 'All Types' },
    { value: 'CONTRACTOR', label: 'Contractor Audit' },
    { value: 'FACTORY', label: 'Factory Audit' },
    { value: 'SHOPS_ESTABLISHMENT', label: 'Branch Compliance Audit' },
    { value: 'LABOUR_EMPLOYMENT', label: 'Labour Law Audit' },
    { value: 'FSSAI', label: 'FSSAI Audit' },
    { value: 'HR', label: 'HR Audit' },
    { value: 'PAYROLL', label: 'Payroll Audit' },
    { value: 'GAP', label: 'Other Audit' },
  ];

  // Summary KPIs (from new AuditXpert dashboard API)
  summary: any = this.normalizeSummary({});

  // Active tab for My Audits
  auditTab: 'ACTIVE' | 'OVERDUE' | 'DUE_SOON' | 'COMPLETED' = 'ACTIVE';

  // Data tables
  myAudits: AuditorAuditItem[] = [];
  upcomingAudits: any[] = [];
  recentSubmitted: any[] = [];
  observations: AuditorObservationPending[] = [];
  evidence: AuditorEvidencePending[] = [];
  reports: AuditorReportPending[] = [];
  recentActivities: AuditorActivityItem[] = [];

  // Table column definitions
  auditColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'branchName', header: 'Branch', sortable: true },
    { key: 'auditName', header: 'Audit Name', sortable: true },
    { key: 'dueDate', header: 'Due Date', sortable: true },
    { key: 'status', header: 'Status', align: 'center' },
    { key: 'progressPct', header: 'Progress %', align: 'center' },
    { key: 'actions', header: 'Actions', align: 'center' },
  ];

  observationColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true, width: '14%' },
    { key: 'branchName', header: 'Branch', sortable: true, width: '12%' },
    { key: 'title', header: 'Observation Title', sortable: true, width: '22%' },
    { key: 'risk', header: 'Risk', align: 'center', width: '8%' },
    { key: 'ageingDays', header: 'Ageing Days', align: 'center', width: '10%' },
    { key: 'owner', header: 'Owner', width: '12%' },
    { key: 'status', header: 'Status', align: 'center', width: '8%' },
    { key: 'actions', header: 'Actions', align: 'center', width: '14%' },
  ];

  evidenceColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'branchName', header: 'Branch', sortable: true },
    { key: 'evidenceName', header: 'Required Evidence', sortable: true },
    { key: 'requestedOn', header: 'Requested On' },
    { key: 'pendingDays', header: 'Pending Days', align: 'center' },
    { key: 'status', header: 'Status', align: 'center' },
    { key: 'actions', header: 'Actions', align: 'center' },
  ];

  constructor(
    private dashboardService: DashboardService,
    private auditsService: AuditsService,
    private observationsService: AuditorObservationsService,
    private toast: ToastService,
    private router: Router,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadReferenceData();
    this.loadAllData();
  }

  ngOnDestroy(): void {
    this.summarySub?.unsubscribe();
    this.auditsSub?.unsubscribe();
    this.obsSub?.unsubscribe();
    this.evidenceSub?.unsubscribe();
    this.activitySub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Load clients for filter dropdowns (assigned only) */
  loadReferenceData(): void {
    this.http.get<any[]>(`${environment.apiBaseUrl}/api/v1/auditor/clients/assigned`).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (data) => {
        this.clients = (data || []).map((c: any) => ({ id: c.id, name: c.clientName || c.name }));
        this.clientOptions = [
          { value: null, label: 'All Clients' },
          ...this.clients.map(c => ({ value: c.id, label: c.name })),
        ];
        this.cdr.markForCheck();
      },
      error: () => {
        this.clients = [];
        this.cdr.markForCheck();
      },
    });
  }

  /** Load all dashboard data */
  loadAllData(): void {
    this.loadSummary();
    this.loadUpcomingAudits();
    this.loadRecentSubmitted();
    this.loadMyAudits();
    this.loadObservations();
    this.loadEvidence();
    this.loadRecentActivities();
  }

  /** Load summary KPIs from AuditXpert dashboard API */
  loadSummary(): void {
    this.summarySub?.unsubscribe();
    this.loading = true;
    this.errorMsg = null;
    this.cdr.markForCheck();

    this.summarySub = this.auditsService.auditorDashboardSummary().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: (data) => {
        this.loading = false;
        this.summary = this.normalizeSummary(data);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err?.error?.message || 'Failed to load dashboard summary';
        this.cdr.markForCheck();
      },
    });
  }

  /** Load audits based on active tab */
  loadMyAudits(): void {
    this.auditsSub?.unsubscribe();
    const params = { ...this.buildFilterParams(), tab: this.auditTab };
    this.auditsSub = this.dashboardService.getAuditorAudits(params).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (response) => {
        this.myAudits = response.items;
        this.cdr.markForCheck();
      },
      error: () => {
        this.toast.error('Failed to load audits');
        this.cdr.markForCheck();
      },
    });
  }

  /** Load upcoming audits from AuditXpert API */
  loadUpcomingAudits(): void {
    this.auditsService.auditorUpcomingAudits().pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (data) => {
        this.upcomingAudits = data || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.upcomingAudits = [];
        this.cdr.markForCheck();
      },
    });
  }

  /** Load recent submitted from AuditXpert API */
  loadRecentSubmitted(): void {
    this.auditsService.auditorRecentSubmitted().pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (data) => {
        this.recentSubmitted = data || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.recentSubmitted = [];
        this.cdr.markForCheck();
      },
    });
  }

  /** Load observations pending closure */
  loadObservations(): void {
    this.obsSub?.unsubscribe();
    const params = { ...this.buildFilterParams(), status: 'OPEN' };
    this.obsSub = this.dashboardService.getAuditorObservations(params).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (response) => {
        this.observations = response.items;
        this.cdr.markForCheck();
      },
      error: () => {
        this.toast.error('Failed to load observations');
        this.cdr.markForCheck();
      },
    });
  }

  /** Load evidence pending */
  loadEvidence(): void {
    this.evidenceSub?.unsubscribe();
    const params = this.buildFilterParams();
    this.evidenceSub = this.dashboardService.getAuditorEvidence(params).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (response) => {
        this.evidence = response.items;
        this.cdr.markForCheck();
      },
      error: () => {
        this.toast.error('Failed to load evidence');
        this.cdr.markForCheck();
      },
    });
  }

  /** Load recent activity timeline */
  loadRecentActivities(): void {
    this.activitySub?.unsubscribe();
    this.activitySub = this.dashboardService.getAuditorActivity().pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (response) => {
        this.recentActivities = response.items;
        this.cdr.markForCheck();
      },
      error: () => {
        // Fail silently for optional timeline
        this.cdr.markForCheck();
      },
    });
  }

  /** Build query params from filters */
  private buildFilterParams(): Record<string, string> {
    const params: Record<string, string> = {};
    if (this.filter.clientId) params['clientId'] = this.filter.clientId;
    if (this.filter.auditType) params['auditType'] = this.filter.auditType;
    if (this.filter.fromDate) params['fromDate'] = this.filter.fromDate;
    if (this.filter.toDate) params['toDate'] = this.filter.toDate;
    return params;
  }

  /** Apply filters */
  applyFilters(): void {
    this.loadAllData();
  }

  /** Reset filters */
  resetFilters(): void {
    this.filter = {
      clientId: null,
      auditType: null,
      fromDate: null,
      toDate: null,
    };
    this.loadAllData();
  }

  /** Set active tab for My Audits */
  setAuditTab(tab: 'ACTIVE' | 'OVERDUE' | 'DUE_SOON' | 'COMPLETED'): void {
    this.auditTab = tab;
    this.loadMyAudits();
  }

  /** Open audit for execution */
  openAudit(audit: any): void {
    const id = audit.auditId || audit.id;
    if (id) this.router.navigate(['/auditor/audits', id, 'workspace']);
  }

  /** Follow-up on observation */
  followUpObservation(obs: AuditorObservationPending): void {
    this.observationsService.update(obs.observationId, { status: 'FOLLOW_UP' }).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
    ).subscribe({
      next: () => {
        this.toast.success('Follow-up sent for: ' + obs.title);
        this.loadObservations();
      },
      error: () => this.toast.error('Failed to send follow-up'),
    });
  }

  /** Update observation status */
  updateObservation(obs: AuditorObservationPending): void {
    this.router.navigate(['/auditor/observations'], { queryParams: { observationId: obs.observationId } });
  }

  /** Close observation */
  closeObservation(obs: AuditorObservationPending): void {
    if (!confirm(`Close observation "${obs.title}"? This action cannot be undone.`)) return;
    this.observationsService.update(obs.observationId, { status: 'CLOSED' }).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
    ).subscribe({
      next: () => {
        this.toast.success('Observation closed: ' + obs.title);
        this.loadObservations();
        this.loadSummary();
      },
      error: () => this.toast.error('Failed to close observation'),
    });
  }

  /** Remind for pending evidence */
  remindEvidence(ev: AuditorEvidencePending): void {
    this.http.post(`${environment.apiBaseUrl}/api/v1/auditor/dashboard/evidence/${ev.id}/remind`, {}).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
    ).subscribe({
      next: () => this.toast.success('Reminder sent for: ' + ev.evidenceName),
      error: () => this.toast.error('Failed to send reminder'),
    });
  }

  /** Mark evidence as not required */
  markNotRequired(ev: AuditorEvidencePending): void {
    if (!confirm(`Mark "${ev.evidenceName}" as not required?`)) return;
    this.http.patch(`${environment.apiBaseUrl}/api/v1/auditor/dashboard/evidence/${ev.id}/status`, { status: 'NOT_REQUIRED' }).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
    ).subscribe({
      next: () => {
        this.toast.success('Marked not required: ' + ev.evidenceName);
        this.loadEvidence();
        this.loadSummary();
      },
      error: () => this.toast.error('Failed to update evidence status'),
    });
  }

  // KPI Card Drill-down Handlers
  drillAssignedAudits() {
    this.router.navigate(['/auditor/audits']);
  }

  drillPending() {
    this.router.navigate(['/auditor/audits'], { queryParams: { status: 'PLANNED' } });
  }

  drillInProgress() {
    this.router.navigate(['/auditor/audits'], { queryParams: { status: 'IN_PROGRESS' } });
  }

  drillSubmitted() {
    this.router.navigate(['/auditor/audits'], { queryParams: { status: 'SUBMITTED' } });
  }

  drillReverification() {
    this.router.navigate(['/auditor/observations']);
  }

  drillClosed() {
    this.router.navigate(['/auditor/audits'], { queryParams: { status: 'CLOSED' } });
  }

  drillOverdueAudits() {
    this.router.navigate(['/auditor/audits'], {
      queryParams: { tab: 'OVERDUE' }
    });
  }

  drillDueSoon() {
    this.router.navigate(['/auditor/audits'], {
      queryParams: { tab: 'DUE_SOON' }
    });
  }

  drillObservationsOpen() {
    this.router.navigate(['/auditor/observations'], {
      queryParams: { status: 'OPEN' }
    });
  }

  drillHighRiskOpen() {
    this.router.navigate(['/auditor/observations'], {
      queryParams: { risk: 'HIGH', status: 'OPEN' }
    });
  }

  drillReportsPending() {
    this.router.navigate(['/auditor/reports'], {
      queryParams: { status: 'PENDING_SUBMISSION' }
    });
  }

  private normalizeSummary(data: any): any {
    const totalAssigned = Number(data?.totalAssigned ?? data?.assignedAuditsCount ?? 0);
    const reverificationPending = Number(
      data?.reverificationPending ?? data?.overdueAuditsCount ?? 0,
    );
    const submitted = Number(data?.submitted ?? 0);

    return {
      totalAssigned,
      pending: Number(data?.pending ?? 0),
      inProgress: Number(data?.inProgress ?? 0),
      submitted,
      reverificationPending,
      closed: Number(data?.closed ?? 0),
      assignedAuditsCount: totalAssigned,
      overdueAuditsCount: reverificationPending,
      reportsPendingCount: Number(data?.reportsPendingCount ?? submitted),
    };
  }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { timeout, finalize, takeUntil } from 'rxjs/operators';
import { Subject, Subscription } from 'rxjs';
import { DashboardService } from '../../core/dashboard.service';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  StatCardComponent,
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
  AuditorSummary,
  AuditorAuditItem,
  AuditorObservationPending,
  AuditorEvidencePending,
  AuditorReportPending,
  AuditorActivityItem,
} from './auditor-dashboard.dto';

@Component({
  selector: 'app-auditor-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    StatCardComponent,
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
  get clientOptions() {
    return [
      { value: null, label: 'All Clients' },
      ...this.clients.map(c => ({ value: c.id, label: c.name }))
    ];
  }

  auditTypeOptions = [
    { value: null, label: 'All Types' },
    { value: 'STATUTORY', label: 'Statutory' },
    { value: 'INTERNAL', label: 'Internal' },
    { value: 'CLIENT_SPECIFIC', label: 'Client Specific' }
  ];

  // Summary KPIs
  summary: AuditorSummary = {
    assignedAuditsCount: 0,
    overdueAuditsCount: 0,
    dueSoonAuditsCount: 0,
    observationsOpenCount: 0,
    highRiskOpenCount: 0,
    reportsPendingCount: 0,
  };

  // Active tab for My Audits
  auditTab: 'ACTIVE' | 'OVERDUE' | 'DUE_SOON' | 'COMPLETED' = 'ACTIVE';

  // Data tables
  myAudits: AuditorAuditItem[] = [];
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
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'branchName', header: 'Branch', sortable: true },
    { key: 'title', header: 'Observation Title', sortable: true },
    { key: 'risk', header: 'Risk', align: 'center' },
    { key: 'ageingDays', header: 'Ageing Days', align: 'center' },
    { key: 'owner', header: 'Owner' },
    { key: 'status', header: 'Status', align: 'center' },
    { key: 'actions', header: 'Actions', align: 'center' },
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
    private toast: ToastService,
    private router: Router,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
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
        this.cdr.detectChanges();
      },
      error: () => { this.clients = []; this.cdr.detectChanges(); },
    });
  }

  /** Load all dashboard data */
  loadAllData(): void {
    this.loadSummary();
    this.loadMyAudits();
    this.loadObservations();
    this.loadEvidence();
    this.loadRecentActivities();
  }

  /** Load summary KPIs */
  loadSummary(): void {
    this.summarySub?.unsubscribe();
    this.loading = true;
    this.errorMsg = null;

    const params = this.buildFilterParams();
    this.summarySub = this.dashboardService.getAuditorSummary(params).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        this.loading = false;
        this.summary = data;
        this.cdr.detectChanges();
      },
      error: (_err) => {
        this.loading = false;
        this.errorMsg = _err?.error?.message || 'Failed to load dashboard summary';
        this.cdr.detectChanges();
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
        this.cdr.detectChanges();
      },
      error: (_err) => {
        this.toast.error('Failed to load audits');
        this.cdr.detectChanges();
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
        this.cdr.detectChanges();
      },
      error: (_err) => {
        this.toast.error('Failed to load observations');
        this.cdr.detectChanges();
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
        this.cdr.detectChanges();
      },
      error: (_err) => {
        this.toast.error('Failed to load evidence');
        this.cdr.detectChanges();
      },
    });
  }

  /** Load recent activity timeline */
  loadRecentActivities(): void {
    this.activitySub?.unsubscribe();
    this.activitySub = this.dashboardService.getAuditorActivity().pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (response) => {
        this.recentActivities = response.items;
        this.cdr.detectChanges();
      },
      error: (_err) => {
        // Fail silently for optional timeline
        this.cdr.detectChanges();
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
  openAudit(audit: AuditorAuditItem): void {
    this.router.navigate(['/auditor/audits', audit.auditId]);
  }

  /** Follow-up on observation */
  followUpObservation(obs: AuditorObservationPending): void {
    // TODO: Send follow-up notification
    this.toast.info('Follow-up sent for: ' + obs.title);
  }

  /** Update observation status */
  updateObservation(obs: AuditorObservationPending): void {
    this.router.navigate(['/auditor/observations', obs.observationId]);
  }

  /** Close observation */
  closeObservation(obs: AuditorObservationPending): void {
    // TODO: Open close confirmation modal
    this.toast.info('Close observation: ' + obs.title);
  }

  /** Remind for pending evidence */
  remindEvidence(ev: AuditorEvidencePending): void {
    // TODO: Send reminder notification
    this.toast.info('Reminder sent for: ' + ev.evidenceName);
  }

  /** Mark evidence as not required */
  markNotRequired(ev: AuditorEvidencePending): void {
    // TODO: Update evidence status
    this.toast.info('Marked not required: ' + ev.evidenceName);
  }

  // KPI Card Drill-down Handlers
  drillAssignedAudits() {
    this.router.navigate(['/auditor/audits'], {
      queryParams: { tab: 'ACTIVE' }
    });
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
}

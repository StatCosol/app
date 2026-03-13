import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Subject } from 'rxjs';
import { takeUntil, timeout, finalize } from 'rxjs/operators';
import { AuditsService } from '../../core/audits.service';
import { CrmClientsApi } from '../../core/api/crm-clients.api';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  PageHeaderComponent,
  ActionButtonComponent,
  StatusBadgeComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
} from '../../shared/ui';

@Component({
  selector: 'app-crm-audits',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
    DataTableComponent,
    TableCellDirective,
  ],
  templateUrl: './crm-audits.component.html',
  styleUrls: ['./crm-audits.component.scss'],
})
export class CrmAuditsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  activeTab: 'list' | 'create' = 'list';

  // ─── Create Form ───────────────────────────────────
  model: any = {
    clientId: '',
    branchId: '',
    contractorUserId: '',
    frequency: 'MONTHLY',
    auditType: 'CONTRACTOR',
    periodYear: new Date().getFullYear(),
    periodCode: '',
    assignedAuditorId: '',
    dueDate: '',
    notes: '',
  };

  message: string | null = null;
  error: string | null = null;
  submitting = false;

  // ─── List View ─────────────────────────────────────
  audits: any[] = [];
  listLoading = true;
  statusUpdating = false;
  listFilters = { status: '', clientId: '', year: '' };

  readonly auditColumns: TableColumn[] = [
    { key: 'auditCode', header: 'Code' },
    { key: 'clientName', header: 'Client' },
    { key: 'auditType', header: 'Type' },
    { key: 'period', header: 'Period' },
    { key: 'auditorName', header: 'Auditor' },
    { key: 'status', header: 'Status' },
    { key: 'score', header: 'Score' },
    { key: 'actions', header: 'Actions', align: 'right' },
  ];

  // ─── Dropdowns ─────────────────────────────────────
  clients: any[] = [];
  branches: any[] = [];
  contractors: any[] = [];
  auditors: any[] = [];

  frequencies = [
    { label: 'Monthly', value: 'MONTHLY' },
    { label: 'Quarterly', value: 'QUARTERLY' },
    { label: 'Half-yearly', value: 'HALF_YEARLY' },
    { label: 'Yearly', value: 'YEARLY' },
  ];

  auditTypes = [
    { label: 'Contractor', value: 'CONTRACTOR' },
    { label: 'Factory', value: 'FACTORY' },
    { label: 'Shops & Establishment', value: 'SHOPS_ESTABLISHMENT' },
    { label: 'Labour & Employment', value: 'LABOUR_EMPLOYMENT' },
    { label: 'FSSAI', value: 'FSSAI' },
    { label: 'HR', value: 'HR' },
    { label: 'Payroll', value: 'PAYROLL' },
    { label: 'GAP', value: 'GAP' },
  ];

  statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Planned', value: 'PLANNED' },
    { label: 'In Progress', value: 'IN_PROGRESS' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  get clientFilterOptions() {
    return [
      { value: '', label: 'All Clients' },
      ...this.clients.map((c) => ({ value: c.id, label: c.clientName || c.name })),
    ];
  }

  constructor(
    private auditsService: AuditsService,
    private crmClientsApi: CrmClientsApi,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
  ) {}

  private readonly baseUrl = environment.apiBaseUrl || '';

  ngOnInit(): void {
    this.loadDropdowns();
    this.loadAudits();
  }

  // ─── Dropdowns ─────────────────────────────────────
  loadDropdowns(): void {
    this.crmClientsApi.getAssignedClients().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.clients = data || [];
        this.cdr.detectChanges();
      },
      error: () => this.cdr.detectChanges(),
    });

    this.http.get<any[]>(`${this.baseUrl}/api/v1/crm/users/auditors`).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
      next: (data) => {
        this.auditors = data || [];
        this.cdr.detectChanges();
      },
      error: () => this.cdr.detectChanges(),
    });
  }

  onClientChange(): void {
    this.contractors = [];
    this.branches = [];
    this.model.contractorUserId = '';
    this.model.branchId = '';

    if (this.model.clientId) {
      this.crmClientsApi.getBranchesForClient(this.model.clientId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (data) => { this.branches = data || []; this.cdr.detectChanges(); },
        error: () => this.cdr.detectChanges(),
      });

      this.http.get<any[]>(`${this.baseUrl}/api/v1/crm/users/contractors`).pipe(takeUntil(this.destroy$), timeout(10000)).subscribe({
        next: (data) => { this.contractors = data || []; this.cdr.detectChanges(); },
        error: () => this.cdr.detectChanges(),
      });
    }
  }

  // ─── Create ────────────────────────────────────────
  submit(): void {
    if (this.submitting) return;
    this.message = null;
    this.error = null;
    this.submitting = true;

    const payload: any = {
      clientId: this.model.clientId,
      frequency: this.model.frequency,
      auditType: this.model.auditType,
      periodYear: Number(this.model.periodYear),
      periodCode: String(this.model.periodCode || '').trim(),
      assignedAuditorId: this.model.assignedAuditorId,
    };
    if (this.model.contractorUserId) payload.contractorUserId = this.model.contractorUserId;
    if (this.model.branchId) payload.branchId = this.model.branchId;
    if (this.model.dueDate) payload.dueDate = this.model.dueDate;
    if (this.model.notes) payload.notes = this.model.notes;

    this.auditsService.crmCreateAudit(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.toast.success(`Audit created — ${res?.auditCode ?? res?.id ?? ''}`);
        this.submitting = false;
        this.activeTab = 'list';
        this.loadAudits();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to create audit';
        this.toast.error(this.error!);
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }

  // ─── List ──────────────────────────────────────────
  loadAudits(): void {
    this.listLoading = true;
    this.auditsService.crmListAudits(this.listFilters).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.listLoading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.audits = (res?.data || []).map((a: any) => ({
          ...a,
          clientName: a.client?.clientName || '—',
          auditorName: a.assignedAuditor?.name || '—',
          contractorName: a.contractorUser?.name || null,
        }));
        this.cdr.detectChanges();
      },
      error: () => { this.audits = []; this.cdr.detectChanges(); },
    });
  }

  // ─── Status Transitions ────────────────────────────
  getNextStatuses(status: string): { label: string; value: string; variant: 'primary' | 'danger' }[] {
    const map: Record<string, { label: string; value: string; variant: 'primary' | 'danger' }[]> = {
      PLANNED: [
        { label: 'Start', value: 'IN_PROGRESS', variant: 'primary' },
        { label: 'Cancel', value: 'CANCELLED', variant: 'danger' },
      ],
      IN_PROGRESS: [
        { label: 'Complete', value: 'COMPLETED', variant: 'primary' },
        { label: 'Cancel', value: 'CANCELLED', variant: 'danger' },
      ],
    };
    return map[status] || [];
  }

  async changeStatus(audit: any, newStatus: string) {
    if (this.statusUpdating) return;
    const actionLabel = newStatus === 'CANCELLED' ? 'cancel' : newStatus === 'COMPLETED' ? 'complete' : 'start';
    const confirmed = await this.dialog.confirm(
      `${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} Audit`,
      `Are you sure you want to ${actionLabel} audit ${audit.auditCode || ''}?`,
      { variant: newStatus === 'CANCELLED' ? 'danger' : 'default', confirmText: actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1) },
    );
    if (!confirmed) return;

    this.statusUpdating = true;
    this.auditsService.crmUpdateStatus(audit.id, newStatus).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.statusUpdating = false;
        audit.status = res.status;
        audit.score = res.score;
        this.toast.success(`Audit ${actionLabel}ed`);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.statusUpdating = false;
        this.toast.error(err?.error?.message || `Failed to ${actionLabel} audit`);
        this.cdr.detectChanges();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

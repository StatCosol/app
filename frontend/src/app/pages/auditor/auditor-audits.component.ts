import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuditsService } from '../../core/audits.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  ActionButtonComponent,
  DataTableComponent,
  EmptyStateComponent,
  FormInputComponent,
  FormSelectComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
  TableCellDirective,
  type SelectOption,
  type TableColumn,
} from '../../shared/ui';

type AuditorScheduleAudit = {
  id: string;
  auditCode?: string | null;
  clientId?: string | null;
  clientName: string;
  auditType?: string | null;
  auditTypeLabel: string;
  branchId?: string | null;
  branchName: string;
  contractorUserId?: string | null;
  contractorName: string;
  dueDate?: string | null;
  createdAt?: string | null;
  status?: string | null;
};

@Component({
  selector: 'app-auditor-audits',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    FormSelectComponent,
    FormInputComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    EmptyStateComponent,
  ],
  templateUrl: './auditor-audits.component.html',
})
export class AuditorAuditsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly allAuditTypeOptions: SelectOption[] = [
    { value: 'CONTRACTOR', label: 'Contractor Audit' },
    { value: 'FACTORY', label: 'Factory Audit' },
    { value: 'SHOPS_ESTABLISHMENT', label: 'Branch Compliance Audit' },
    { value: 'LABOUR_EMPLOYMENT', label: 'Labour Law Audit' },
    { value: 'FSSAI', label: 'FSSAI Audit' },
    { value: 'HR', label: 'HR Audit' },
    { value: 'PAYROLL', label: 'Payroll Audit' },
    { value: 'GAP', label: 'Other Audit' },
  ];

  loading = false;

  filters = {
    clientId: '',
    auditType: '',
    status: '',
    search: '',
  };

  audits: AuditorScheduleAudit[] = [];
  clientOptions: SelectOption[] = [{ value: '', label: 'All Clients' }];
  auditTypeOptions: SelectOption[] = [];
  statusOptions: SelectOption[] = [
    { value: '', label: 'All Statuses' },
    { value: 'PLANNED', label: 'Planned' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'CORRECTION_PENDING', label: 'Correction Pending' },
    { value: 'REVERIFICATION_PENDING', label: 'Reverification Pending' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'CLOSED', label: 'Closed' },
  ];
  filteredAudits: AuditorScheduleAudit[] = [];

  auditColumns: TableColumn[] = [
    { key: 'auditCode', header: 'Schedule ID' },
    { key: 'clientName', header: 'Client' },
    { key: 'auditTypeLabel', header: 'Audit Type' },
    { key: 'branchName', header: 'Branch / Unit' },
    { key: 'contractorName', header: 'Contractor' },
    { key: 'scheduledDate', header: 'Scheduled Date' },
    { key: 'status', header: 'Status' },
    { key: 'action', header: 'Action' },
  ];

  constructor(
    private readonly auditsService: AuditsService,
    private readonly toast: ToastService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.auditTypeOptions = [
      { value: '', label: 'All Audit Types' },
      ...this.allAuditTypeOptions,
    ];
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.auditsService
      .auditorListAudits({ pageSize: 200 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const data = Array.isArray(res) ? res : res?.data || res?.items || [];
          this.audits = data.map((audit: any) => ({
            id: String(audit.id),
            auditCode: audit.auditCode || null,
            clientId: audit.clientId || audit.client?.id || null,
            clientName: audit.client?.clientName || audit.clientName || '-',
            auditType: audit.auditType || null,
            auditTypeLabel: this.formatAuditType(audit.auditType),
            branchId: audit.branchId || audit.branch?.id || null,
            branchName: audit.branch?.branchName || audit.branchName || '-',
            contractorUserId: audit.contractorUserId || audit.contractorUser?.id || null,
            contractorName: audit.contractorUser?.name || audit.contractorName || '-',
            dueDate: audit.dueDate || null,
            createdAt: audit.createdAt || null,
            status: audit.status || 'SCHEDULED',
          }));
          this.loading = false;
          this.pruneSelections();
          this.recomputeViewModel();
        },
        error: () => {
          this.toast.error('Failed to load scheduled audits');
          this.loading = false;
        },
      });
  }

  onClientChange(): void {
    this.recomputeViewModel();
  }

  onAuditTypeChange(): void {
    this.recomputeViewModel();
  }

  onStatusChange(): void {
    this.recomputeViewModel();
  }

  onSearchChange(): void {
    this.recomputeViewModel();
  }

  openWorkspace(audit: AuditorScheduleAudit): void {
    this.router.navigate(['/auditor/audits', audit.id, 'workspace']);
  }

  /** Open workspace from an audit schedule (auto-creates audit if needed) */
  openFromSchedule(scheduleId: string): void {
    this.loading = true;
    this.auditsService.openAuditWorkspaceFromSchedule(scheduleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.loading = false;
          if (res?.auditId) {
            this.router.navigate(['/auditor/audits', res.auditId, 'workspace']);
          }
        },
        error: (err) => {
          this.loading = false;
          this.toast.error(err?.error?.message || 'Unable to open workspace');
        },
      });
  }

  clear(): void {
    this.filters = {
      clientId: '',
      auditType: '',
      status: '',
      search: '',
    };
    this.recomputeViewModel();
  }

  formatDate(value?: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private recomputeViewModel(): void {
    const clientScopedAudits = this.getClientScopedAudits();
    const clientAndTypeScopedAudits = this.getClientAndTypeScopedAudits(clientScopedAudits);

    this.clientOptions = [
      { value: '', label: 'All Clients' },
      ...this.uniqueOptions(
        this.audits.map((audit) => ({
          value: String(audit.clientId || ''),
          label: audit.clientName || 'Unknown Client',
        })),
      ),
    ];

    this.filteredAudits = clientAndTypeScopedAudits.filter((audit) => {
      if (this.filters.status && String(audit.status || '').toUpperCase() !== this.filters.status) {
        return false;
      }
      if (this.filters.search.trim()) {
        const q = this.filters.search.trim().toLowerCase();
        const haystack = [
          audit.auditCode,
          audit.clientName,
          audit.auditTypeLabel,
          audit.branchName,
          audit.contractorName,
          audit.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  private getClientScopedAudits(): AuditorScheduleAudit[] {
    if (!this.filters.clientId) return this.audits;
    return this.audits.filter((audit) => String(audit.clientId || '') === this.filters.clientId);
  }

  private getClientAndTypeScopedAudits(
    clientScopedAudits: AuditorScheduleAudit[],
  ): AuditorScheduleAudit[] {
    return clientScopedAudits.filter((audit) => {
      if (this.filters.auditType && String(audit.auditType || '') !== this.filters.auditType) {
        return false;
      }
      return true;
    });
  }

  private formatAuditType(value: unknown): string {
    const key = String(value || '').toUpperCase();
    const labels: Record<string, string> = {
      CONTRACTOR: 'Contractor Audit',
      FACTORY: 'Factory Audit',
      SHOPS_ESTABLISHMENT: 'Branch Compliance Audit',
      LABOUR_EMPLOYMENT: 'Labour Law Audit',
      FSSAI: 'FSSAI Audit',
      HR: 'HR Audit',
      PAYROLL: 'Payroll Audit',
      GAP: 'Other Audit',
    };
    return labels[key] || (key ? `${key.replace(/_/g, ' ')} Audit` : 'Scheduled Audit');
  }

  private uniqueOptions(options: SelectOption[]): SelectOption[] {
    const seen = new Set<string>();
    return options.filter((option) => {
      const key = `${option.value}::${option.label}`;
      if (!option.value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private pruneSelections(): void {
    const clientScopedAudits = this.getClientScopedAudits();
    if (this.filters.clientId && !clientScopedAudits.length) {
      this.clear();
      return;
    }

    const clientAndTypeScopedAudits = this.getClientAndTypeScopedAudits(clientScopedAudits);
    if (this.filters.auditType && !clientAndTypeScopedAudits.length) {
      this.filters.auditType = '';
    }
  }
}

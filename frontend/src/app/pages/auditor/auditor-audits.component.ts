import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';
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
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.auditTypeOptions = [
      { value: '', label: 'All Audit Types' },
      ...this.allAuditTypeOptions,
    ];
    this.applyFiltersFromQueryParams();
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.auditsService
      .auditorListAudits({ pageSize: 200 })
      .pipe(
        timeout(15000),
        takeUntil(this.destroy$),
        finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
      )
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
          this.cdr.markForCheck();
        },
        error: () => {
          this.toast.error('Failed to load scheduled audits');
          // loading reset by finalize
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

  get totalAssignedCount(): number {
    return this.audits.length;
  }

  get readyForAuditorCount(): number {
    return this.audits.filter((audit) =>
      ['PLANNED', 'IN_PROGRESS', 'REVERIFICATION_PENDING'].includes(this.statusKey(audit.status)),
    ).length;
  }

  get waitingForStakeholderCount(): number {
    return this.audits.filter(
      (audit) => this.statusKey(audit.status) === 'CORRECTION_PENDING',
    ).length;
  }

  get submittedOrClosedCount(): number {
    return this.audits.filter((audit) =>
      ['SUBMITTED', 'COMPLETED', 'CLOSED'].includes(this.statusKey(audit.status)),
    ).length;
  }

  get hasActiveFilters(): boolean {
    return !!(
      this.filters.clientId ||
      this.filters.auditType ||
      this.filters.status ||
      this.filters.search.trim()
    );
  }

  get activeFilterSummary(): string {
    if (!this.hasActiveFilters) {
      return 'Showing every audit assigned to you.';
    }

    const parts: string[] = [];
    if (this.filters.clientId) {
      const client = this.clientOptions.find((option) => option.value === this.filters.clientId);
      parts.push(client?.label || 'selected client');
    }
    if (this.filters.auditType) {
      const type = this.auditTypeOptions.find((option) => option.value === this.filters.auditType);
      parts.push(type?.label || 'selected audit type');
    }
    if (this.filters.status) {
      parts.push(this.formatLabel(this.filters.status));
    }
    if (this.filters.search.trim()) {
      parts.push(`matching "${this.filters.search.trim()}"`);
    }

    return `Filtered by ${parts.join(', ')}.`;
  }

  getWorkspaceActionLabel(audit: AuditorScheduleAudit): string {
    const status = this.statusKey(audit.status);
    if (status === 'PLANNED') return 'Start Review';
    if (status === 'IN_PROGRESS') return 'Continue Review';
    if (status === 'REVERIFICATION_PENDING') return 'Review Corrections';
    if (status === 'CORRECTION_PENDING') return 'Check Status';
    if (status === 'SUBMITTED') return 'View Submission';
    return 'Open Workspace';
  }

  getAuditNextStep(audit: AuditorScheduleAudit): string {
    const status = this.statusKey(audit.status);
    if (status === 'PLANNED') {
      return 'Next step: open the workspace and begin document review.';
    }
    if (status === 'IN_PROGRESS') {
      return 'Next step: finish pending reviews, findings, and final checks.';
    }
    if (status === 'REVERIFICATION_PENDING') {
      return 'Next step: review corrected uploads before re-submitting the audit.';
    }
    if (status === 'CORRECTION_PENDING') {
      return 'Next step: wait for corrected files, then return for reverification.';
    }
    if (status === 'SUBMITTED') {
      return 'Next step: waiting for CRM review unless corrections are requested.';
    }
    if (status === 'COMPLETED' || status === 'CLOSED') {
      return 'Next step: review the submission history or report if needed.';
    }
    return 'Next step: open the workspace for details.';
  }

  /** Open workspace from an audit schedule (auto-creates audit if needed) */
  openFromSchedule(scheduleId: string): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.auditsService.openAuditWorkspaceFromSchedule(scheduleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.loading = false;
          this.cdr.markForCheck();
          if (res?.auditId) {
            this.router.navigate(['/auditor/audits', res.auditId, 'workspace']);
          }
        },
        error: (err) => {
          this.loading = false;
          this.cdr.markForCheck();
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

  private applyFiltersFromQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const clientId = params.get('clientId') || '';
    const auditType = params.get('auditType') || '';
    const status = this.statusKey(params.get('status'));
    const search = params.get('search') || '';

    this.filters = {
      clientId,
      auditType,
      status: this.statusOptions.some((option) => option.value === status) ? status : '',
      search,
    };
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

  private formatLabel(value: string | null | undefined): string {
    const key = this.statusKey(value);
    if (!key) return '-';
    return key
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private statusKey(value: string | null | undefined): string {
    return String(value || '').trim().toUpperCase();
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

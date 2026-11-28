import { ActionIconPipe } from '../../shared/ui/action-icon.pipe';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';
import { AuditsService } from '../../core/audits.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  FormInputComponent,
  FormSelectComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
  type SelectOption,
} from '../../shared/ui';

type AuditorScheduleAudit = {
  id: string;
  auditCode?: string | null;
  periodCode?: string | null;
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
  imports: [ActionIconPipe,
    FormsModule,
    PageHeaderComponent,
    FormSelectComponent,
    FormInputComponent,
    ActionButtonComponent,
    StatusBadgeComponent,
    EmptyStateComponent
],
  templateUrl: './auditor-audits.component.html',
  styles: [`.client-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr)); gap:1rem; } .client-card { min-width:0; overflow-wrap:anywhere; }`],
})
export class AuditorAuditsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly allAuditTypeOptions: SelectOption[] = [
    { value: 'CONTRACTOR', label: 'Contractor Audit' },
    { value: 'FACTORY', label: 'Factory Audit' },
    { value: 'SAFETY', label: 'Safety Audit' },
    { value: 'TRANSPORT', label: 'Transport Audit' },
    { value: 'WAREHOUSE', label: 'Warehouse Audit' },
    { value: 'E_MARKETING', label: 'E-marketing Audit' },
    { value: 'OTHER', label: 'Other Audit' },
    { value: 'SHOPS_ESTABLISHMENT', label: 'Shops & Establishments Audit' },
    { value: 'LABOUR_EMPLOYMENT', label: 'Labour Law Audit' },
    { value: 'FSSAI', label: 'FSSAI Audit' },
    { value: 'HR', label: 'HR Audit' },
    { value: 'PAYROLL', label: 'Payroll Audit' },
    { value: 'GAP', label: 'Gap Audit' },
  ];

  loading = false;
  recordScope: 'ACTUAL' | 'TEST' = 'ACTUAL';
  private loadVersion = 0;

  filters = {
    clientId: '',
    branchId: '',
    contractorUserId: '',
    periodCode: '',
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
  loadError = false;

  get selectedClientName(): string {
    return this.audits.find(a => this.clientKey(a) === this.filters.clientId)?.clientName || 'Selected client';
  }

  get selectedBranchName(): string {
    return this.branchOptions.find(b => b.value === this.filters.branchId)?.label || 'Selected branch';
  }

  get activeDetailFilterCount(): number {
    return [this.filters.contractorUserId, this.filters.periodCode, this.filters.auditType, this.filters.status, this.filters.search.trim()].filter(Boolean).length;
  }

  get clientGroups() {
    const groups = new Map<string, AuditorScheduleAudit[]>();
    for (const audit of this.filteredAudits) {
      const key = this.clientKey(audit);
      groups.set(key, [...(groups.get(key) || []), audit]);
    }
    return Array.from(groups, ([id, audits]) => ({
      id, name: audits[0].clientName, count: audits.length,
      branches: new Set(audits.map(a => a.branchId).filter(Boolean)).size,
      contractors: new Set(audits.map(a => a.contractorUserId).filter(Boolean)).size,
      pending: audits.filter(a => ['PLANNED', 'IN_PROGRESS', 'REVERIFICATION_PENDING'].includes(this.statusKey(a.status))).length,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  get branchOptions(): SelectOption[] {
    return [{value: '', label: 'Choose an assigned branch'}, ...this.uniqueOptions(this.getClientScopedAudits().map(a => ({value: a.branchId || '__UNSPECIFIED__', label: a.branchName})))];
  }

  get branchGroups() {
    const groups = new Map<string, AuditorScheduleAudit[]>();
    for (const audit of this.filteredAudits) {
      const key = audit.branchId || '__UNSPECIFIED__';
      groups.set(key, [...(groups.get(key) || []), audit]);
    }
    return Array.from(groups, ([id, audits]) => ({id, name: audits[0].branchName, count: audits.length,
      contractors: new Set(audits.map(a => a.contractorUserId).filter(Boolean)).size,
    })).sort((a,b) => a.name.localeCompare(b.name));
  }

  selectBranch(id: string): void {
    this.filters.branchId = id;
    this.onBranchChange();
  }

  get contractorOptions(): SelectOption[] {
    const rows = this.getClientScopedAudits().filter(a => !this.filters.branchId || (a.branchId || '__UNSPECIFIED__') === this.filters.branchId);
    return [{value: '', label: 'All assigned contractors'}, ...this.uniqueOptions(rows.filter(a => !!a.contractorUserId).map(a => ({value: a.contractorUserId!, label: a.contractorName})))];
  }

  get periodOptions(): SelectOption[] {
    return [{value: '', label: 'All assigned periods'}, ...this.uniqueOptions(this.getClientScopedAudits().map(a => ({value: a.periodCode || '__UNSPECIFIED__', label: a.periodCode || 'Period not specified'}))).sort((a,b) => b.value.localeCompare(a.value))];
  }


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
    const version = ++this.loadVersion;
    const scope = this.recordScope;
    const isCurrent = () => version === this.loadVersion && scope === this.recordScope;
    this.loadError = false;
    this.audits = [];
    this.recomputeViewModel();
    this.loading = true;
    this.cdr.markForCheck();
    this.auditsService
      .auditorListAllAudits(scope)
      .pipe(
        timeout(15000),
        takeUntil(this.destroy$),
        finalize(() => { if (isCurrent()) { this.loading = false; this.cdr.markForCheck(); } }),
      )
      .subscribe({
        next: (res) => {
          if (!isCurrent()) return;
          const data = res;
          this.audits = data.map((audit: any) => ({
            id: String(audit.id),
            auditCode: audit.auditCode || null,
            periodCode: audit.periodCode || null,
            clientId: audit.clientId || audit.client?.id || null,
            clientName: audit.client?.clientName || audit.clientName || '-',
            auditType: audit.auditType || null,
            auditTypeLabel: this.formatAuditType(audit.auditType),
            branchId: audit.branchId || audit.branch?.id || null,
            branchName: audit.branch?.branchName || audit.branchName || 'Branch not specified',
            contractorUserId: audit.contractorUserId || audit.contractorUser?.id || null,
            contractorName: audit.contractorUser?.name || audit.contractorName || (audit.auditType === 'CONTRACTOR' ? 'Contractor not specified' : 'Not a contractor audit'),
            dueDate: audit.dueDate || null,
            createdAt: audit.createdAt || null,
            status: audit.status || 'SCHEDULED',
          }));
          this.loading = false;

          this.recomputeViewModel();
          this.cdr.markForCheck();
        },
        error: () => {
          if (!isCurrent()) return;
          this.loadError = true;
          this.toast.error('Failed to load scheduled audits');
          // loading reset by finalize
        },
      });
  }

  onRecordScopeChange(): void {
    this.filters.clientId = '';
    this.clear();
    this.load();
  }

  onClientChange(): void {
    this.filters.branchId = '';
    this.filters.contractorUserId = '';
    this.filters.periodCode = '';
    this.recomputeViewModel();
    this.saveSelection();
  }

  selectClient(id: string): void {
    this.filters.clientId = id;
    this.onClientChange();
  }

  backToClients(): void {
    this.filters.clientId = '';
    this.clear();
  }

  onBranchChange(): void {
    this.filters.contractorUserId = '';
    this.onSearchChange();
  }

  onAuditTypeChange(): void {
    this.recomputeViewModel();
    this.saveSelection();
  }

  onStatusChange(): void {
    this.recomputeViewModel();
    this.saveSelection();
  }

  onSearchChange(): void {
    this.recomputeViewModel();
    this.saveSelection();
  }

  openWorkspace(audit: AuditorScheduleAudit): void {
    this.router.navigate(['/auditor/audits', audit.id, 'workspace'], {queryParams: {
      recordScope: this.recordScope,
      returnClientId: this.clientKey(audit),
      returnBranchId: this.filters.branchId || null,
      returnContractorUserId: this.filters.contractorUserId || null,
      returnPeriodCode: this.filters.periodCode || null,
      returnAuditType: this.filters.auditType || null,
      returnStatus: this.filters.status || null,
      returnSearch: this.filters.search || null,
      tab: audit.auditType === 'CONTRACTOR' ? 'documents' : 'checklist',
    }});
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
      this.filters.branchId || this.filters.contractorUserId || this.filters.periodCode ||
      this.filters.auditType ||
      this.filters.status ||
      this.filters.search.trim()
    );
  }

  get activeFilterSummary(): string {
    if (!this.hasActiveFilters) {
      return this.recordScope === 'TEST'
        ? 'Showing test audits assigned to you. These do not contribute to actual workload counts.'
        : 'Showing actual audits assigned to you. Test evidence is kept separately.';
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
      clientId: this.filters.clientId,
      branchId: '',
      contractorUserId: '',
      periodCode: '',
      auditType: '',
      status: '',
      search: '',
    };
    this.recomputeViewModel();
    this.saveSelection();
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
      if (this.filters.branchId && (audit.branchId || '__UNSPECIFIED__') !== this.filters.branchId) return false;
      if (this.filters.contractorUserId && audit.contractorUserId !== this.filters.contractorUserId) return false;
      if (this.filters.periodCode && (audit.periodCode || '__UNSPECIFIED__') !== this.filters.periodCode) return false;
      if (this.filters.status && this.statusKey(audit.status) !== this.filters.status) {
        return false;
      }
      if (this.filters.search.trim()) {
        const q = this.filters.search.trim().toLowerCase();
        const haystack = [
          audit.auditCode,
          audit.periodCode,
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
    this.recordScope = params.get('recordScope') === 'TEST' ? 'TEST' : 'ACTUAL';
    const clientId = params.get('clientId') || '';
    const auditType = params.get('auditType') || '';
    const status = this.statusKey(params.get('status'));
    const search = params.get('search') || '';

    this.filters = {
      clientId,
      branchId: params.get('branchId') || '',
      contractorUserId: params.get('contractorUserId') || '',
      periodCode: params.get('periodCode') || '',
      auditType,
      status: this.statusOptions.some((option) => option.value === status) ? status : '',
      search,
    };
  }

  private getClientScopedAudits(): AuditorScheduleAudit[] {
    if (!this.filters.clientId) return this.audits;
    return this.audits.filter((audit) => this.clientKey(audit) === this.filters.clientId);
  }

  private clientKey(audit: AuditorScheduleAudit): string {
    return audit.clientId || `unassigned-${audit.id}`;
  }

  private saveSelection(): void {
    void this.router.navigate([], {relativeTo: this.route, replaceUrl: true, queryParams: {
      recordScope: this.recordScope === 'TEST' ? 'TEST' : null,
      ...Object.fromEntries(Object.entries(this.filters).map(([key, value]) => [key, value || null])),
    }});
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
      SAFETY: 'Safety Audit',
      TRANSPORT: 'Transport Audit',
      WAREHOUSE: 'Warehouse Audit',
      E_MARKETING: 'E-marketing Audit',
      OTHER: 'Other Audit',
      SHOPS_ESTABLISHMENT: 'Shops & Establishments Audit',
      LABOUR_EMPLOYMENT: 'Labour Law Audit',
      FSSAI: 'FSSAI Audit',
      HR: 'HR Audit',
      PAYROLL: 'Payroll Audit',
      GAP: 'Gap Audit',
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
    const key = String(value || '').trim().toUpperCase();
    return ['ASSIGNED', 'NOT_STARTED', 'SCHEDULED'].includes(key) ? 'PLANNED' : key;
  }

  private uniqueOptions(options: SelectOption[]): SelectOption[] {
    const seen = new Set<string>();
    return options.filter((option) => {
      const key = option.value;
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

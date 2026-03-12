import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { AuthService } from '../../../core/auth.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { HelpdeskService } from '../../../core/helpdesk.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { environment } from '../../../../environments/environment';

type RegistrationStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';
type RequestAction = 'APPLY' | 'AMEND' | 'RENEW' | 'CLOSE';

interface RegistrationRow {
  id: string;
  type: string;
  registrationNumber: string | null;
  authority: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  documentUrl: string | null;
  renewalDocumentUrl: string | null;
  renewedOn: string | null;
  remarks: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  computedStatus: RegistrationStatus;
  daysRemaining: number;
}

interface RegistrationRequest {
  id: string;
  ticketRef: string;
  action: RequestAction;
  registrationId: string | null;
  registrationType: string;
  authority: string;
  referenceNumber: string;
  targetExpiryDate: string;
  notes: string;
  status: string;
  priority: string;
  assignedToUserId: string | null;
  slaDueAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface RegistrationAlertRow {
  id: string;
  registrationId: string;
  branchId: string;
  alertType: string;
  priority: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string | null;
}

interface RequestWizardModel {
  action: RequestAction;
  registrationId: string;
  registrationType: string;
  authority: string;
  referenceNumber: string;
  targetExpiryDate: string;
  notes: string;
  documents: {
    authorityForm: boolean;
    previousLicense: boolean;
    identityProof: boolean;
    amendmentProof: boolean;
  };
}

interface TimelineEvent {
  id: string;
  title: string;
  createdAt: string;
  statusTo?: string | null;
  comment?: string | null;
}

@Component({
  selector: 'app-branch-registrations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './branch-registrations.component.html',
  styleUrls: ['./branch-registrations.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BranchRegistrationsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly baseUrl = environment.apiBaseUrl || '';

  loading = true;
  requestSaving = false;
  branchId = '';

  registrations: RegistrationRow[] = [];
  filteredRegistrations: RegistrationRow[] = [];
  selectedRegistration: RegistrationRow | null = null;

  requests: RegistrationRequest[] = [];
  alerts: RegistrationAlertRow[] = [];
  selectedRequests: RegistrationRequest[] = [];
  selectedTimeline: TimelineEvent[] = [];

  statusFilter: 'ALL' | RegistrationStatus = 'ALL';
  typeFilter = 'ALL';
  requestActionFilter: 'ALL' | RequestAction = 'ALL';
  searchTerm = '';

  requestModalOpen = false;
  wizardStep = 1;
  requestModel: RequestWizardModel = this.emptyRequestModel();

  readonly statusTabs: Array<'ALL' | RegistrationStatus> = [
    'ALL',
    'ACTIVE',
    'EXPIRING_SOON',
    'EXPIRED',
  ];

  readonly actions: RequestAction[] = ['APPLY', 'AMEND', 'RENEW', 'CLOSE'];
  readonly requestActionTabs: Array<'ALL' | RequestAction> = [
    'ALL',
    'APPLY',
    'AMEND',
    'RENEW',
    'CLOSE',
  ];

  constructor(
    private readonly auth: AuthService,
    private readonly branchesService: ClientBranchesService,
    private readonly helpdeskService: HelpdeskService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const branchIds = this.auth.getBranchIds();
    this.branchId = branchIds.length ? String(branchIds[0]) : '';
    this.loadWorkspace();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get activeCount(): number {
    return this.registrations.filter((r) => r.computedStatus === 'ACTIVE').length;
  }

  get expiringCount(): number {
    return this.registrations.filter((r) => r.computedStatus === 'EXPIRING_SOON').length;
  }

  get expiredCount(): number {
    return this.registrations.filter((r) => r.computedStatus === 'EXPIRED').length;
  }

  get totalCount(): number {
    return this.registrations.length;
  }

  get openRequestCount(): number {
    return this.requests.filter((r) => ['OPEN', 'IN_PROGRESS', 'AWAITING_CLIENT'].includes(r.status)).length;
  }

  get closedRequestCount(): number {
    return this.requests.filter((r) => ['RESOLVED', 'CLOSED'].includes(r.status)).length;
  }

  get alertCount(): number {
    return this.alerts.length;
  }

  get highPriorityAlertCount(): number {
    return this.alerts.filter((a) => ['HIGH', 'CRITICAL'].includes(a.priority)).length;
  }

  get typeOptions(): string[] {
    return Array.from(new Set(this.registrations.map((r) => r.type).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }

  get typeTabs(): string[] {
    return ['ALL', ...this.typeOptions];
  }

  get amendmentRequestCount(): number {
    return this.requests.filter((r) => r.action === 'AMEND').length;
  }

  get closureRequestCount(): number {
    return this.requests.filter((r) => r.action === 'CLOSE').length;
  }

  get renewalRequestCount(): number {
    return this.requests.filter((r) => r.action === 'RENEW').length;
  }

  get visibleSelectedRequests(): RegistrationRequest[] {
    if (this.requestActionFilter === 'ALL') return this.selectedRequests;
    return this.selectedRequests.filter((r) => r.action === this.requestActionFilter);
  }

  get selectedAmendmentRequests(): RegistrationRequest[] {
    return this.selectedRequests.filter((r) => r.action === 'AMEND');
  }

  get selectedClosureRequests(): RegistrationRequest[] {
    return this.selectedRequests.filter((r) => r.action === 'CLOSE');
  }

  get latestClosureRequest(): RegistrationRequest | null {
    return this.selectedClosureRequests.length ? this.selectedClosureRequests[0] : null;
  }

  get latestAmendmentRequest(): RegistrationRequest | null {
    return this.selectedAmendmentRequests.length ? this.selectedAmendmentRequests[0] : null;
  }

  get selectedAlerts(): RegistrationAlertRow[] {
    const regId = this.selectedRegistration?.id;
    if (!regId) return [];
    return this.alerts
      .filter((a) => a.registrationId === regId)
      .sort((a, b) => this.timeValue(b.createdAt) - this.timeValue(a.createdAt));
  }

  get closureStageLabel(): string {
    return this.requestStageLabel(this.latestClosureRequest?.status || '');
  }

  get expiringTrackerRows(): RegistrationRow[] {
    return this.registrations
      .filter((row) => row.expiryDate && row.daysRemaining >= 0)
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 6);
  }

  get overdueTrackerRows(): RegistrationRow[] {
    return this.registrations
      .filter((row) => row.expiryDate && row.daysRemaining < 0)
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 6);
  }

  trackRegistration(_: number, row: RegistrationRow): string {
    return row.id;
  }

  trackRequest(_: number, row: RegistrationRequest): string {
    return row.id;
  }

  trackAlert(_: number, row: RegistrationAlertRow): string {
    return row.id;
  }

  setStatusFilter(tab: 'ALL' | RegistrationStatus): void {
    this.statusFilter = tab;
    this.applyFilters();
  }

  setTypeTab(tab: string): void {
    this.typeFilter = tab;
    this.applyFilters();
  }

  setRequestActionFilter(tab: 'ALL' | RequestAction): void {
    this.requestActionFilter = tab;
    this.cdr.markForCheck();
  }

  applyFilters(): void {
    const q = this.searchTerm.trim().toLowerCase();
    this.filteredRegistrations = this.registrations.filter((row) => {
      if (this.statusFilter !== 'ALL' && row.computedStatus !== this.statusFilter) return false;
      if (this.typeFilter !== 'ALL' && row.type !== this.typeFilter) return false;
      if (!q) return true;
      const text = `${row.type} ${row.registrationNumber || ''} ${row.authority || ''}`.toLowerCase();
      return text.includes(q);
    });

    this.hydrateSelection(this.selectedRegistration?.id || null);
    this.cdr.markForCheck();
  }

  clearFilters(): void {
    this.statusFilter = 'ALL';
    this.typeFilter = 'ALL';
    this.requestActionFilter = 'ALL';
    this.searchTerm = '';
    this.applyFilters();
  }

  selectRegistration(row: RegistrationRow): void {
    this.selectedRegistration = row;
    this.selectedRequests = this.requests.filter((req) => req.registrationId === row.id);
    this.selectedTimeline = this.buildTimeline(row, this.selectedRequests);
  }

  openRenewalFromAlert(alert: RegistrationAlertRow): void {
    const reg = this.registrations.find((r) => r.id === alert.registrationId);
    if (reg) {
      this.selectRegistration(reg);
      this.openRequestModal('RENEW');
      return;
    }
    this.toast.error('Registration record not found for this alert.');
  }

  openRequestModal(action: RequestAction): void {
    this.requestModel = this.emptyRequestModel();
    this.requestModel.action = action;

    if (this.selectedRegistration) {
      this.requestModel.registrationId = this.selectedRegistration.id;
      this.requestModel.registrationType = this.selectedRegistration.type || '';
      this.requestModel.authority = this.selectedRegistration.authority || '';
      this.requestModel.referenceNumber = this.selectedRegistration.registrationNumber || '';
      this.requestModel.targetExpiryDate = this.selectedRegistration.expiryDate
        ? this.selectedRegistration.expiryDate.slice(0, 10)
        : '';
    }

    if (action === 'APPLY') {
      this.requestModel.registrationId = '';
      this.requestModel.referenceNumber = '';
      this.requestModel.targetExpiryDate = '';
    }

    this.wizardStep = 1;
    this.requestModalOpen = true;
  }

  closeRequestModal(): void {
    if (this.requestSaving) return;
    this.requestModalOpen = false;
    this.wizardStep = 1;
  }

  nextStep(): void {
    if (this.wizardStep === 1) {
      if (!this.requestModel.action) {
        this.toast.error('Select request type.');
        return;
      }
      if (this.requestModel.action !== 'APPLY' && !this.requestModel.registrationId) {
        this.toast.error('Select a registration for this action.');
        return;
      }
      if (this.requestModel.action === 'APPLY' && !this.requestModel.registrationType.trim()) {
        this.toast.error('Provide registration type for apply request.');
        return;
      }
    }

    if (this.wizardStep === 2) {
      if (!this.requestModel.authority.trim()) {
        this.toast.error('Authority is required.');
        return;
      }
      if (!this.requestModel.notes.trim()) {
        this.toast.error('Provide request details for review.');
        return;
      }
    }

    this.wizardStep = Math.min(3, this.wizardStep + 1);
  }

  previousStep(): void {
    this.wizardStep = Math.max(1, this.wizardStep - 1);
  }

  onRequestRegistrationChange(registrationId: string): void {
    if (!registrationId) return;
    const row = this.registrations.find((x) => x.id === registrationId);
    if (!row) return;
    this.requestModel.registrationType = row.type || this.requestModel.registrationType;
    this.requestModel.authority = row.authority || this.requestModel.authority;
    this.requestModel.referenceNumber = row.registrationNumber || this.requestModel.referenceNumber;
    this.requestModel.targetExpiryDate = row.expiryDate ? row.expiryDate.slice(0, 10) : this.requestModel.targetExpiryDate;
  }

  submitRequest(): void {
    if (this.requestSaving) return;
    if (!this.branchId) {
      this.toast.error('No branch scope found for current user.');
      return;
    }

    const payload = {
      category: 'COMPLIANCE',
      subCategory: `REGISTRATION_${this.requestModel.action}`,
      branchId: this.branchId,
      priority: this.computePriority(),
      description: this.buildRequestDescription(),
    };

    this.requestSaving = true;
    this.helpdeskService
      .createTicket(payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.requestSaving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Registration request submitted to CRM.');
          this.requestModalOpen = false;
          this.wizardStep = 1;
          this.loadRequests(this.selectedRegistration?.id || null);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Unable to submit request'),
      });
  }

  openFile(pathOrUrl: string | null | undefined): void {
    if (!pathOrUrl) return;
    const resolved = this.resolveFileUrl(pathOrUrl);
    window.open(resolved, '_blank');
  }

  exportSelectedSummary(): void {
    const reg = this.selectedRegistration;
    if (!reg) return;

    const rows: Array<[string, string]> = [
      ['Registration Type', reg.type || '-'],
      ['Registration Number', reg.registrationNumber || '-'],
      ['Authority', reg.authority || '-'],
      ['Issued Date', this.formatDate(reg.issuedDate)],
      ['Expiry Date', this.formatDate(reg.expiryDate)],
      ['Status', this.statusLabel(reg.computedStatus)],
      ['Days Remaining', this.daysText(reg)],
      ['Document Completion %', String(this.documentCompletion(reg))],
      ['Open Requests', String(this.selectedRequests.length)],
      ['Closure Requests', String(this.selectedClosureRequests.length)],
      ['Amendment Requests', String(this.selectedAmendmentRequests.length)],
      ['Linked Alerts', String(this.selectedAlerts.length)],
    ];

    for (const req of this.selectedRequests) {
      rows.push([
        `${req.ticketRef} (${req.action})`,
        [
          `Status=${req.status}`,
          `Priority=${req.priority}`,
          `Age=${this.requestAgeLabel(req)}`,
          `SLA=${this.requestSlaText(req)}`,
          `Authority=${req.authority || '-'}`,
          `Reference=${req.referenceNumber || '-'}`,
        ].join(' | '),
      ]);
    }

    const csv = ['"Field","Value"']
      .concat(rows.map(([k, v]) => `"${k.replace(/"/g, '""')}","${String(v).replace(/"/g, '""')}"`))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `branch-registration-${(reg.registrationNumber || reg.id).replace(/[^a-zA-Z0-9-_]/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  statusLabel(status: RegistrationStatus): string {
    if (status === 'EXPIRING_SOON') return 'Expiring Soon';
    if (status === 'EXPIRED') return 'Expired';
    return 'Active';
  }

  statusClass(status: RegistrationStatus): string {
    if (status === 'EXPIRED') return 'status status--expired';
    if (status === 'EXPIRING_SOON') return 'status status--expiring';
    return 'status status--active';
  }

  requestStatusClass(status: string): string {
    if (status === 'RESOLVED' || status === 'CLOSED') return 'status status--active';
    if (status === 'IN_PROGRESS' || status === 'AWAITING_CLIENT') return 'status status--expiring';
    return 'status status--expired';
  }

  requestStatusText(status: string): string {
    return String(status || '').replace(/_/g, ' ') || 'OPEN';
  }

  requestStageLabel(status: string): string {
    const key = String(status || '').toUpperCase();
    if (key === 'OPEN') return 'Raised';
    if (key === 'IN_PROGRESS') return 'Under Review';
    if (key === 'AWAITING_CLIENT') return 'Awaiting Branch Input';
    if (key === 'RESOLVED') return 'Resolved';
    if (key === 'CLOSED') return 'Closed';
    return 'Open';
  }

  requestAgeDays(req: RegistrationRequest): number | null {
    const start = req.createdAt || req.updatedAt;
    if (!start) return null;
    const ageMs = Date.now() - new Date(start).getTime();
    if (Number.isNaN(ageMs)) return null;
    return Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)));
  }

  requestAgeLabel(req: RegistrationRequest): string {
    const days = this.requestAgeDays(req);
    if (days === null) return '-';
    if (days === 0) return 'today';
    return `${days}d`;
  }

  requestSlaText(req: RegistrationRequest): string {
    if (!req.slaDueAt) return 'No SLA';
    const due = new Date(req.slaDueAt);
    if (Number.isNaN(due.getTime())) return 'No SLA';
    const diffDays = Math.ceil((due.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'due today';
    return `${diffDays}d left`;
  }

  requestSlaClass(req: RegistrationRequest): string {
    if (!req.slaDueAt) return 'pill';
    const due = new Date(req.slaDueAt);
    if (Number.isNaN(due.getTime())) return 'pill';
    const diffDays = Math.ceil((due.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return 'pill pill--bad';
    if (diffDays <= 2) return 'pill pill--warn';
    return 'pill pill--ok';
  }

  alertPriorityClass(alert: RegistrationAlertRow): string {
    const p = String(alert.priority || '').toUpperCase();
    if (p === 'CRITICAL') return 'pill pill--bad';
    if (p === 'HIGH') return 'pill pill--warn';
    if (p === 'MEDIUM') return 'pill pill--ok';
    return 'pill';
  }

  alertTypeText(alertType: string): string {
    const key = String(alertType || '').toUpperCase();
    if (key === 'EXPIRED') return 'Expired';
    if (key === '7_DAY') return '7-day warning';
    if (key === '30_DAY') return '30-day warning';
    if (key === '60_DAY') return '60-day watch';
    return key || 'Alert';
  }

  daysText(row: RegistrationRow): string {
    if (!row.expiryDate) return 'No expiry';
    if (row.daysRemaining < 0) return `${Math.abs(row.daysRemaining)}d overdue`;
    if (row.daysRemaining === 0) return 'Due today';
    return `${row.daysRemaining}d left`;
  }

  documentChecklist(row: RegistrationRow): Array<{ label: string; done: boolean }> {
    return [
      { label: 'Registration number', done: !!(row.registrationNumber || '').trim() },
      { label: 'Authority details', done: !!(row.authority || '').trim() },
      { label: 'Issued and expiry dates', done: !!row.issuedDate && !!row.expiryDate },
      { label: 'Primary document uploaded', done: !!row.documentUrl },
      { label: 'Renewal document uploaded', done: !!row.renewalDocumentUrl },
    ];
  }

  documentCompletion(row: RegistrationRow): number {
    const list = this.documentChecklist(row);
    const completed = list.filter((x) => x.done).length;
    return list.length ? Math.round((completed / list.length) * 100) : 0;
  }

  private loadWorkspace(): void {
    if (!this.branchId) {
      this.loading = false;
      this.toast.error('Branch mapping not available for current user.');
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    forkJoin({
      registrations: this.branchesService.listRegistrations(this.branchId),
      tickets: this.helpdeskService.listTickets({ branchId: this.branchId, category: 'COMPLIANCE' }),
      alerts: this.branchesService.getRegistrationAlerts(this.branchId),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ registrations, tickets, alerts }) => {
          this.registrations = (registrations || []).map((row: any) => this.mapRegistration(row));
          this.requests = this.extractRegistrationRequests(tickets || []);
          this.alerts = (alerts || []).map((row: any) => this.mapAlert(row));
          this.requestActionFilter = 'ALL';
          this.applyFilters();
        },
        error: (err) => {
          this.registrations = [];
          this.filteredRegistrations = [];
          this.requests = [];
          this.selectedRegistration = null;
          this.selectedRequests = [];
          this.alerts = [];
          this.selectedTimeline = [];
          this.toast.error(err?.error?.message || 'Failed to load registrations workspace');
        },
      });
  }

  private loadRequests(preferredRegistrationId: string | null): void {
    if (!this.branchId) return;
    this.helpdeskService
      .listTickets({ branchId: this.branchId, category: 'COMPLIANCE' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tickets) => {
          this.requests = this.extractRegistrationRequests(tickets || []);
          this.hydrateSelection(preferredRegistrationId || this.selectedRegistration?.id || null);
          this.cdr.markForCheck();
        },
      });
  }

  private hydrateSelection(id: string | null): void {
    if (!this.filteredRegistrations.length) {
      this.selectedRegistration = null;
      this.selectedRequests = [];
      this.selectedTimeline = [];
      return;
    }

    if (id) {
      const found = this.filteredRegistrations.find((x) => x.id === id);
      if (found) {
        this.selectRegistration(found);
        return;
      }
    }

    this.selectRegistration(this.filteredRegistrations[0]);
  }

  private mapRegistration(raw: any): RegistrationRow {
    const status = (raw?.computedStatus || 'ACTIVE') as RegistrationStatus;
    const days = Number(raw?.daysRemaining || 0);
    return {
      id: String(raw?.id || ''),
      type: String(raw?.type || '-'),
      registrationNumber: raw?.registrationNumber ?? null,
      authority: raw?.authority ?? null,
      issuedDate: raw?.issuedDate ? new Date(raw.issuedDate).toISOString() : null,
      expiryDate: raw?.expiryDate ? new Date(raw.expiryDate).toISOString() : null,
      documentUrl: raw?.documentUrl ?? raw?.documentPath ?? null,
      renewalDocumentUrl: raw?.renewalDocumentUrl ?? null,
      renewedOn: raw?.renewedOn ? new Date(raw.renewedOn).toISOString() : null,
      remarks: raw?.remarks ?? null,
      createdAt: raw?.createdAt ? new Date(raw.createdAt).toISOString() : null,
      updatedAt: raw?.updatedAt ? new Date(raw.updatedAt).toISOString() : null,
      computedStatus: status,
      daysRemaining: days,
    };
  }

  private extractRegistrationRequests(tickets: any[]): RegistrationRequest[] {
    const out: RegistrationRequest[] = [];
    for (const t of tickets || []) {
      const action = this.extractActionFromTicket(t);
      if (!action) continue;
      const description = String(t?.description || '');
      out.push({
        id: String(t?.id || ''),
        ticketRef: `HD-${String(t?.id || '').slice(0, 8).toUpperCase()}`,
        action,
        registrationId: this.extractField(description, 'Registration ID'),
        registrationType: this.extractField(description, 'Registration Type'),
        authority: this.extractField(description, 'Authority'),
        referenceNumber: this.extractField(description, 'Reference Number'),
        targetExpiryDate: this.extractField(description, 'Target Expiry Date'),
        notes: this.extractField(description, 'Notes'),
        status: String(t?.status || 'OPEN'),
        priority: String(t?.priority || 'NORMAL'),
        assignedToUserId: t?.assignedToUserId ?? t?.assigned_to_user_id ?? null,
        slaDueAt: t?.slaDueAt ? new Date(t.slaDueAt).toISOString() : null,
        createdAt: t?.createdAt ? new Date(t.createdAt).toISOString() : null,
        updatedAt: t?.updatedAt ? new Date(t.updatedAt).toISOString() : null,
      });
    }

    return out.sort((a, b) => this.timeValue(b.createdAt) - this.timeValue(a.createdAt));
  }

  private extractActionFromTicket(ticket: any): RequestAction | null {
    const sub = String(ticket?.subCategory || '').toUpperCase();
    const matchSub = sub.match(/REGISTRATION_(APPLY|AMEND|RENEW|CLOSE)/);
    if (matchSub) return matchSub[1] as RequestAction;

    const description = String(ticket?.description || '');
    const marker = description.match(/Action:\s*(APPLY|AMEND|RENEW|CLOSE)/i);
    if (marker) return marker[1].toUpperCase() as RequestAction;
    return null;
  }

  private buildTimeline(
    row: RegistrationRow,
    linkedRequests: RegistrationRequest[],
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    if (row.createdAt) {
      events.push({
        id: `${row.id}-created`,
        title: 'Registration record created',
        createdAt: row.createdAt,
      });
    }
    if (row.issuedDate) {
      events.push({
        id: `${row.id}-issued`,
        title: 'Issued date recorded',
        createdAt: row.issuedDate,
        comment: this.formatDate(row.issuedDate),
      });
    }
    if (row.renewedOn) {
      events.push({
        id: `${row.id}-renewed`,
        title: 'Last renewal recorded',
        createdAt: row.renewedOn,
        statusTo: 'RENEWED',
      });
    }
    if (row.updatedAt) {
      events.push({
        id: `${row.id}-updated`,
        title: 'Record updated',
        createdAt: row.updatedAt,
      });
    }

    for (const req of linkedRequests) {
      events.push({
        id: req.id,
        title: `${req.action} request - ${this.requestStatusText(req.status)}`,
        createdAt: req.createdAt || req.updatedAt || new Date().toISOString(),
        comment: [
          req.ticketRef,
          `Priority: ${req.priority}`,
          `Stage: ${this.requestStageLabel(req.status)}`,
          `Age: ${this.requestAgeLabel(req)}`,
          `SLA: ${this.requestSlaText(req)}`,
          `Reference: ${req.referenceNumber || '-'}`,
        ].join(' | '),
        statusTo: req.status,
      });
    }

    const linkedAlerts = this.alerts.filter((a) => a.registrationId === row.id);
    for (const alert of linkedAlerts) {
      events.push({
        id: `alert-${alert.id}`,
        title: `Renewal alert - ${this.alertTypeText(alert.alertType)}`,
        createdAt: alert.createdAt || new Date().toISOString(),
        comment: `${alert.title} | Priority: ${alert.priority}`,
        statusTo: alert.alertType,
      });
    }

    return events.sort((a, b) => this.timeValue(b.createdAt) - this.timeValue(a.createdAt));
  }

  private computePriority(): string {
    if (this.requestModel.action === 'RENEW') {
      const reg = this.registrations.find((x) => x.id === this.requestModel.registrationId);
      if (reg?.computedStatus === 'EXPIRED') return 'HIGH';
      if (reg?.computedStatus === 'EXPIRING_SOON') return 'HIGH';
      return 'NORMAL';
    }
    if (this.requestModel.action === 'CLOSE') return 'NORMAL';
    if (this.requestModel.action === 'AMEND') return 'NORMAL';
    return 'NORMAL';
  }

  private buildRequestDescription(): string {
    const docs = [
      this.requestModel.documents.authorityForm ? 'Authority Form' : '',
      this.requestModel.documents.previousLicense ? 'Previous License' : '',
      this.requestModel.documents.identityProof ? 'Identity Proof' : '',
      this.requestModel.documents.amendmentProof ? 'Amendment Proof' : '',
    ]
      .filter(Boolean)
      .join(', ');

    return [
      '[REGISTRATION_REQUEST]',
      `Action: ${this.requestModel.action}`,
      `Registration ID: ${this.requestModel.registrationId || 'NEW'}`,
      `Registration Type: ${this.requestModel.registrationType || '-'}`,
      `Authority: ${this.requestModel.authority || '-'}`,
      `Reference Number: ${this.requestModel.referenceNumber || '-'}`,
      `Target Expiry Date: ${this.requestModel.targetExpiryDate || '-'}`,
      `Documents: ${docs || '-'}`,
      `Notes: ${this.requestModel.notes || '-'}`,
    ].join('\n');
  }

  private extractField(description: string, field: string): string {
    const regex = new RegExp(`${field}:\\s*(.*)`, 'i');
    const match = description.match(regex);
    return match?.[1]?.trim() || '';
  }

  private formatDate(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private resolveFileUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const clean = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${this.baseUrl}${clean}`;
  }

  private timeValue(input?: string | null): number {
    if (!input) return 0;
    const value = new Date(input).getTime();
    return Number.isNaN(value) ? 0 : value;
  }

  private mapAlert(raw: any): RegistrationAlertRow {
    return {
      id: String(raw?.id || ''),
      registrationId: String(raw?.registrationId || ''),
      branchId: String(raw?.branchId || ''),
      alertType: String(raw?.alertType || 'ALERT'),
      priority: String(raw?.priority || 'LOW').toUpperCase(),
      title: String(raw?.title || 'Registration alert'),
      message: String(raw?.message || ''),
      isRead: !!raw?.isRead,
      createdAt: raw?.createdAt ? new Date(raw.createdAt).toISOString() : null,
    };
  }

  private emptyRequestModel(): RequestWizardModel {
    return {
      action: 'APPLY',
      registrationId: '',
      registrationType: '',
      authority: '',
      referenceNumber: '',
      targetExpiryDate: '',
      notes: '',
      documents: {
        authorityForm: false,
        previousLicense: false,
        identityProof: false,
        amendmentProof: false,
      },
    };
  }
}

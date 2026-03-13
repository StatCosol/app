import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, combineLatest, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { AuditsService } from '../../core/audits.service';
import {
  AuditorAuditService,
  AuditorDocRow,
  ReuploadRequest,
} from '../../core/auditor-audit.service';
import { AuditorObservationsService } from '../../core/auditor-observations.service';
import { ToastService } from '../../shared/toast/toast.service';

interface ChecklistItem {
  label: string;
  done: boolean;
}

interface ProgressStep {
  label: string;
  done: boolean;
  active: boolean;
}

interface StatusAction {
  label: string;
  status: string;
  disabled?: boolean;
  reason?: string;
}

interface RiskBreakdown {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
}

interface GuardrailItem {
  label: string;
  passed: boolean;
  detail: string;
}

@Component({
  standalone: true,
  selector: 'app-auditor-audit-workspace',
  imports: [CommonModule, FormsModule],
  templateUrl: './auditor-audit-workspace.component.html',
  styleUrls: ['./auditor-audit-workspace.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditorAuditWorkspaceComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  loadingAudit = false;
  loadingEvidence = false;
  loadingObservations = false;
  busy = false;

  auditId: string | null = null;
  audit: any | null = null;
  assignedAudits: any[] = [];

  evidenceRows: AuditorDocRow[] = [];
  evidenceSearch = '';
  selectedEvidence: AuditorDocRow | null = null;
  showReuploadModal = false;
  reuploadRemarks = '';

  observations: any[] = [];
  categories: any[] = [];
  observationForm = {
    categoryId: '',
    observation: '',
    consequences: '',
    complianceRequirements: '',
    elaboration: '',
    clause: '',
    recommendation: '',
    risk: 'MEDIUM',
  };

  requests: ReuploadRequest[] = [];
  statusNote = '';
  reportStage: 'DRAFT' | 'FINAL' | null = null;
  reportUpdatedAt: string | null = null;

  readonly riskOptions = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auditsApi: AuditsService,
    private readonly auditApi: AuditorAuditService,
    private readonly observationsApi: AuditorObservationsService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([params, query]) => {
        const paramAuditId = params.get('auditId');
        const queryAuditId = query.get('auditId');
        const nextAuditId = paramAuditId || queryAuditId || null;
        this.initializeForAudit(nextAuditId);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasAuditContext(): boolean {
    return !!this.auditId;
  }

  get filteredEvidenceRows(): AuditorDocRow[] {
    const q = this.evidenceSearch.trim().toLowerCase();
    if (!q) return this.evidenceRows;
    return this.evidenceRows.filter((row) => {
      const text = `${row.fileName} ${row.task?.compliance?.title || ''} ${row.task?.status || ''}`.toLowerCase();
      return text.includes(q);
    });
  }

  get checklist(): ChecklistItem[] {
    return [
      { label: 'Audit scope loaded', done: !!this.audit },
      { label: 'Evidence tray populated', done: this.evidenceRows.length > 0 },
      { label: 'Observation draft logged', done: this.observations.length > 0 },
      { label: 'Severity score calculated', done: this.audit?.score !== null && this.audit?.score !== undefined },
      { label: 'Report draft finalized', done: this.isReportFinalized },
      { label: 'Audit marked completed', done: this.statusKey(this.audit?.status) === 'COMPLETED' },
    ];
  }

  get progressSteps(): ProgressStep[] {
    const status = this.statusKey(this.audit?.status);
    const draftReady = this.reportStage === 'DRAFT' || this.reportStage === 'FINAL';
    return [
      { label: 'Planned', done: ['PLANNED', 'IN_PROGRESS', 'COMPLETED'].includes(status), active: status === 'PLANNED' },
      { label: 'Fieldwork', done: ['IN_PROGRESS', 'COMPLETED'].includes(status), active: status === 'IN_PROGRESS' },
      { label: 'Report Draft', done: draftReady, active: status === 'IN_PROGRESS' && draftReady },
      { label: 'Finalized', done: status === 'COMPLETED', active: status === 'COMPLETED' },
    ];
  }

  get openObservationsCount(): number {
    return this.observations.filter((o) => !['CLOSED', 'RESOLVED'].includes(this.statusKey(o.status))).length;
  }

  get highRiskCount(): number {
    return this.observations.filter((o) => ['CRITICAL', 'HIGH'].includes(this.statusKey(o.risk))).length;
  }

  get riskBreakdown(): RiskBreakdown {
    return this.observations.reduce(
      (acc, o) => {
        const risk = this.statusKey(o.risk) || 'LOW';
        if (risk === 'CRITICAL') acc.CRITICAL += 1;
        else if (risk === 'HIGH') acc.HIGH += 1;
        else if (risk === 'MEDIUM') acc.MEDIUM += 1;
        else acc.LOW += 1;
        return acc;
      },
      { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as RiskBreakdown,
    );
  }

  get canSubmitObservation(): boolean {
    return !!this.auditId && this.observationForm.observation.trim().length >= 5;
  }

  get canRequestReupload(): boolean {
    return !!this.selectedEvidence && this.reuploadRemarks.trim().length >= 5;
  }

  get isReportFinalized(): boolean {
    return this.reportStage === 'FINAL';
  }

  get canCompleteAudit(): boolean {
    return this.openObservationsCount === 0 && this.isReportFinalized && this.hasScore;
  }

  get hasScore(): boolean {
    return this.audit?.score !== null && this.audit?.score !== undefined;
  }

  get statusGuardrails(): GuardrailItem[] {
    return [
      {
        label: 'Scope Loaded',
        passed: !!this.audit,
        detail: this.audit ? `Audit ${this.audit.auditCode || this.audit.id}` : 'Audit context is missing',
      },
      {
        label: 'Evidence Readiness',
        passed: this.evidenceRows.length > 0,
        detail: this.evidenceRows.length
          ? `${this.evidenceRows.length} evidence files in tray`
          : 'No evidence uploaded in this scope',
      },
      {
        label: 'Observation Closure',
        passed: this.openObservationsCount === 0,
        detail:
          this.openObservationsCount === 0
            ? 'All observations are resolved/closed'
            : `${this.openObservationsCount} observations still open`,
      },
      {
        label: 'Report Finalization',
        passed: this.isReportFinalized,
        detail: this.isReportFinalized
          ? `Final report available (${this.formatDate(this.reportUpdatedAt)})`
          : 'Finalize report draft in Report Builder',
      },
      {
        label: 'Severity Score',
        passed: this.hasScore,
        detail: this.hasScore ? `Score ${this.audit?.score}` : 'Severity score not calculated',
      },
    ];
  }

  get nextStatusActions(): StatusAction[] {
    const status = this.statusKey(this.audit?.status);
    if (status === 'PLANNED') {
      const reason = this.actionGuardReason('IN_PROGRESS');
      return [
        {
          label: 'Start Fieldwork',
          status: 'IN_PROGRESS',
          disabled: !!reason,
          reason: reason || undefined,
        },
      ];
    }
    if (status === 'IN_PROGRESS') {
      const reason = this.actionGuardReason('COMPLETED');
      return [
        {
          label: 'Mark Completed',
          status: 'COMPLETED',
          disabled: !!reason,
          reason: reason || undefined,
        },
      ];
    }
    return [];
  }

  get reportStageText(): string {
    if (!this.reportStage) return 'Not Started';
    return this.reportStage === 'FINAL' ? 'Final' : 'Draft';
  }

  trackAudit(_: number, row: any): string {
    return String(row?.id || '');
  }

  trackEvidence(_: number, row: AuditorDocRow): string {
    return String(row.id);
  }

  trackObservation(_: number, row: any): string {
    return String(row?.id || '');
  }

  openAuditWorkspace(row: any): void {
    if (!row?.id) return;
    this.router.navigate(['/auditor/audits', row.id, 'workspace']);
  }

  refreshCockpit(): void {
    if (!this.auditId) return;
    this.loadCockpit(this.auditId);
  }

  openReportBuilder(): void {
    if (!this.auditId) return;
    this.router.navigate(['/auditor/reports', this.auditId, 'builder']);
  }

  updateAuditStatus(nextStatus: string): void {
    if (!this.auditId || !nextStatus || this.busy) return;
    const reason = this.actionGuardReason(nextStatus);
    if (reason) {
      this.toast.warning(reason);
      return;
    }

    this.busy = true;
    this.auditsApi
      .auditorUpdateStatus(this.auditId, nextStatus, this.statusNote || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(`Audit status moved to ${nextStatus}`);
          this.statusNote = '';
          this.refreshCockpit();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to update audit status'),
      });
  }

  calculateScore(): void {
    if (!this.auditId || this.busy) return;
    this.busy = true;
    this.auditsApi
      .auditorCalculateScore(this.auditId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res: any) => {
          if (this.audit) {
            this.audit.score = Number(res?.score ?? this.audit.score ?? 0);
          }
          this.toast.success(`Score calculated: ${res?.score ?? '-'}`);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to calculate score'),
      });
  }

  submitObservation(): void {
    if (!this.canSubmitObservation || this.busy || !this.auditId) return;
    this.busy = true;
    this.observationsApi
      .create({
        auditId: this.auditId,
        categoryId: this.observationForm.categoryId || undefined,
        observation: this.observationForm.observation.trim(),
        consequences: this.observationForm.consequences.trim() || undefined,
        complianceRequirements: this.observationForm.complianceRequirements.trim() || undefined,
        elaboration: this.observationForm.elaboration.trim() || undefined,
        clause: this.observationForm.clause.trim() || undefined,
        recommendation: this.observationForm.recommendation.trim() || undefined,
        risk: this.observationForm.risk,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Observation added');
          this.observationForm = {
            categoryId: '',
            observation: '',
            consequences: '',
            complianceRequirements: '',
            elaboration: '',
            clause: '',
            recommendation: '',
            risk: 'MEDIUM',
          };
          this.loadObservations();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to add observation'),
      });
  }

  openReuploadModal(row: AuditorDocRow): void {
    this.selectedEvidence = row;
    this.reuploadRemarks = '';
    this.showReuploadModal = true;
  }

  closeReuploadModal(): void {
    this.showReuploadModal = false;
    this.selectedEvidence = null;
    this.reuploadRemarks = '';
  }

  submitReuploadRequest(): void {
    if (!this.selectedEvidence || !this.canRequestReupload || this.busy) return;
    const taskId = this.selectedEvidence.task?.id;
    if (!taskId) {
      this.toast.error('Task mapping missing for selected evidence');
      return;
    }

    this.busy = true;
    this.auditApi
      .createReuploadRequests(String(taskId), [
        {
          docId: String(this.selectedEvidence.id),
          remarks: this.reuploadRemarks.trim(),
        },
      ])
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Reupload request created');
          this.closeReuploadModal();
          this.loadReuploadRequests();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to create reupload request'),
      });
  }

  evidenceStatus(row: AuditorDocRow): string {
    return this.statusKey(row?.task?.status || 'PENDING_REVIEW');
  }

  riskClass(risk: string | null | undefined): string {
    const key = this.statusKey(risk);
    if (key === 'CRITICAL') return 'badge badge--bad';
    if (key === 'HIGH') return 'badge badge--warn';
    if (key === 'MEDIUM') return 'badge badge--info';
    return 'badge badge--muted';
  }

  statusClass(status: string | null | undefined): string {
    const key = this.statusKey(status);
    if (key === 'COMPLETED' || key === 'CLOSED' || key === 'RESOLVED') return 'badge badge--good';
    if (key === 'IN_PROGRESS' || key === 'ACKNOWLEDGED') return 'badge badge--info';
    if (key === 'REJECTED' || key === 'CANCELLED') return 'badge badge--bad';
    return 'badge badge--warn';
  }

  formatDate(input?: string | Date | null): string {
    if (!input) return '-';
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  getDownloadUrl(doc: AuditorDocRow): string {
    return this.auditApi.downloadDoc(doc.id);
  }

  openReuploadRequestCount(docId: number | string): number {
    return this.requests.filter(
      (r) => Number(r.documentId) === Number(docId) && this.statusKey(r.status) === 'OPEN',
    ).length;
  }

  private initializeForAudit(auditId: string | null): void {
    this.auditId = auditId;
    this.audit = null;
    this.assignedAudits = [];
    this.evidenceRows = [];
    this.observations = [];
    this.requests = [];
    this.reportStage = null;
    this.reportUpdatedAt = null;
    this.loading = true;

    this.loadCategories();

    if (!auditId) {
      this.loadAuditSelector();
      return;
    }
    this.loadCockpit(auditId);
  }

  private loadAuditSelector(): void {
    this.auditsApi
      .auditorListAudits({ pageSize: 50 })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.assignedAudits = Array.isArray(res) ? res : (res?.data || []);
        },
        error: (err) => {
          this.assignedAudits = [];
          this.toast.error(err?.error?.message || 'Failed to load assigned audits');
        },
      });
  }

  private loadCockpit(auditId: string): void {
    this.loadingAudit = true;
    this.auditsApi
      .auditorGetAudit(auditId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingAudit = false;
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (audit) => {
          this.audit = audit || null;
          this.loadReportStatus();
          this.loadEvidence();
          this.loadObservations();
        },
        error: (err) => {
          this.audit = null;
          this.toast.error(err?.error?.message || 'Failed to load audit details');
        },
      });
  }

  private loadEvidence(): void {
    if (!this.audit) return;
    this.loadingEvidence = true;
    const filters: {
      clientId: string;
      month?: string;
      year?: string;
    } = {
      clientId: String(this.audit.clientId),
    };

    const monthlyPeriod = this.parseMonthlyPeriod(this.audit.periodCode);
    if (monthlyPeriod) {
      filters['month'] = String(monthlyPeriod.month);
      filters['year'] = String(monthlyPeriod.year);
    }

    this.auditApi
      .listDocs(filters)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingEvidence = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          const docs = res?.data || [];
          this.evidenceRows = docs.filter((d) => {
            const taskClientId = d.task?.clientId || d.task?.client_id;
            if (taskClientId && String(taskClientId) !== String(this.audit?.clientId)) {
              return false;
            }
            if (this.audit?.branchId) {
              const taskBranchId = d.task?.branchId || d.task?.branch_id;
              if (taskBranchId && String(taskBranchId) !== String(this.audit.branchId)) {
                return false;
              }
            }
            return true;
          });
          this.loadReuploadRequests();
        },
        error: () => {
          this.evidenceRows = [];
          this.requests = [];
        },
      });
  }

  private loadObservations(): void {
    if (!this.auditId) return;
    this.loadingObservations = true;
    this.observationsApi
      .list(this.auditId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingObservations = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows: any) => {
          this.observations = Array.isArray(rows) ? rows : [];
        },
        error: () => {
          this.observations = [];
        },
      });
  }

  private loadCategories(): void {
    if (this.categories.length) return;
    this.observationsApi
      .listCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows: any) => {
          this.categories = Array.isArray(rows) ? rows : [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.categories = [];
        },
      });
  }

  private loadReuploadRequests(): void {
    if (!this.audit || !this.evidenceRows.length) {
      this.requests = [];
      return;
    }
    const evidenceIds = new Set(this.evidenceRows.map((row) => Number(row.id)));
    this.auditApi
      .listReuploadRequests({ status: 'OPEN' })
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of({ data: [] as ReuploadRequest[] })),
      )
      .subscribe((res) => {
        const rows = res?.data || [];
        this.requests = rows.filter((r) => evidenceIds.has(Number(r.documentId)));
        this.cdr.markForCheck();
      });
  }

  private loadReportStatus(): void {
    if (!this.auditId) {
      this.reportStage = null;
      this.reportUpdatedAt = null;
      return;
    }

    this.auditsApi
      .auditorGetReport(this.auditId)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
      )
      .subscribe((report) => {
        if (!report) {
          this.reportStage = null;
          this.reportUpdatedAt = null;
          this.cdr.markForCheck();
          return;
        }

        const stage = String(report.stage || '').toUpperCase();
        this.reportStage = stage === 'FINAL' ? 'FINAL' : stage === 'DRAFT' ? 'DRAFT' : null;
        this.reportUpdatedAt = report.updatedAt || null;
        this.cdr.markForCheck();
      });
  }

  private parseMonthlyPeriod(periodCode?: string | null): { year: number; month: number } | null {
    if (!periodCode) return null;
    const match = /^(\d{4})-(\d{2})$/.exec(String(periodCode));
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]) };
  }

  private statusKey(value: string | null | undefined): string {
    return String(value || '').toUpperCase();
  }

  private actionGuardReason(nextStatus: string): string | null {
    const status = this.statusKey(this.audit?.status);
    const next = this.statusKey(nextStatus);
    if (next === 'IN_PROGRESS') {
      if (status !== 'PLANNED') return `Current status ${status} cannot move to ${next}.`;
      if (!this.audit) return 'Audit scope is not loaded.';
      if (!this.evidenceRows.length) return 'Add evidence before starting fieldwork.';
      return null;
    }

    if (next === 'COMPLETED') {
      if (status !== 'IN_PROGRESS') return `Current status ${status} cannot move to ${next}.`;
      if (!this.isReportFinalized) return 'Finalize report before completing audit.';
      if (this.openObservationsCount > 0) return 'Close all open observations before completion.';
      if (!this.hasScore) return 'Calculate severity score before completion.';
      return null;
    }

    return null;
  }
}

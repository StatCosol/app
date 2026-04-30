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
import { environment } from '../../../environments/environment';
import { Subject, combineLatest, of, forkJoin } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { AuditsService } from '../../core/audits.service';
import {
  AiApiService,
  AuditObservation as AiAuditObservation,
} from '../../core/ai-api.service';
import {
  AuditorAuditService,
  AuditorDocRow,
} from '../../core/auditor-audit.service';
import { AuditorObservationsService } from '../../core/auditor-observations.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ClientContextStripComponent } from '../../shared/ui';
import { ProtectedFileService } from '../../shared/files/services/protected-file.service';

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

type WorkspaceTabKey =
  | 'info'
  | 'documents'
  | 'checklist'
  | 'history'
  | 'submit'
  | 'corrected';

interface WorkspaceTabItem {
  key: WorkspaceTabKey;
  label: string;
  meta: string;
  show?: boolean;
  attention?: boolean;
}

@Component({
  standalone: true,
  selector: 'app-auditor-audit-workspace',
  imports: [CommonModule, FormsModule, ClientContextStripComponent],
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
  aiDrafting = false;
  busy = false;

  auditId: string | null = null;
  audit: any | null = null;
  assignedAudits: any[] = [];

  evidenceRows: AuditorDocRow[] = [];
  evidenceSearch = '';

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

  statusNote = '';
  reportStage: 'DRAFT' | 'FINAL' | null = null;
  reportUpdatedAt: string | null = null;
  aiDraft: AiAuditObservation | null = null;

  // ─── Document Review (AuditXpert) ──────────────
  branchDocuments: any[] = [];
  contractorDocuments: any[] = [];
  auditDocuments: any[] = [];
  loadingDocs = false;
  reviewingDocId: string | null = null;
  docRemarks: Record<string, string> = {};
  correctedRemarks: Record<string, string> = {};
  // Branch filter for the contractor documents review table.
  // 'ALL' = show every branch; otherwise only docs whose branchId matches.
  contractorDocBranchFilter: string = 'ALL';

  // ─── Workspace Tabs ───────────────────────────
  activeTab: WorkspaceTabKey = 'documents';
  auditInfo: any = null;
  loadingInfo = false;
  submissionHistory: any[] = [];
  loadingHistory = false;
  nonCompliances: any[] = [];
  ncSummary: any = {};
  loadingNc = false;
  finalRemark = '';

  // ─── Checklist ─────────────────────────────────
  checklistItems: any[] = [];
  checklistSummary: any = {};
  loadingChecklist = false;
  newChecklistLabel = '';
  addingChecklistItem = false;
  private checklistAutoGenAttempted = false;

  // ─── Upload Lock ────────────────────────────────
  uploadLockFrom: string = '';
  uploadLockUntil: string = '';
  uploadLockLoading = false;
  uploadLockSaving = false;

  readonly riskOptions = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auditsApi: AuditsService,
    private readonly aiApi: AiApiService,
    private readonly auditApi: AuditorAuditService,
    private readonly observationsApi: AuditorObservationsService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
    private readonly protectedFiles: ProtectedFileService,
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

  get workspaceTabs(): WorkspaceTabItem[] {
    const tabs: WorkspaceTabItem[] = [
      {
        key: 'documents',
        label: '1. Review Documents',
        meta: this.pendingReviewCount > 0
          ? `${this.pendingReviewCount} pending`
          : `${this.reviewedDocumentCount} reviewed`,
        attention: this.pendingReviewCount > 0,
      },
      {
        key: 'corrected',
        label: '2. Review Corrections',
        meta: this.correctedPendingReviewCount > 0
          ? `${this.correctedPendingReviewCount} waiting`
          : `${this.unresolvedCorrectionCount} open`,
        show:
          this.statusKey(this.audit?.status) === 'CORRECTION_PENDING' ||
          this.statusKey(this.audit?.status) === 'REVERIFICATION_PENDING' ||
          this.nonCompliances.length > 0,
        attention: this.correctedPendingReviewCount > 0,
      },
      {
        key: 'checklist',
        label: '3. Checklist',
        meta: `${this.checklistSummary.pending || 0} pending`,
      },
      {
        key: 'submit',
        label: '4. Finish Audit',
        meta: this.canSubmitReviewRound ? 'Ready' : 'Blocked',
        attention: !this.canSubmitReviewRound,
      },
      {
        key: 'info',
        label: 'Overview',
        meta: this.formatLabel(this.audit?.status),
      },
      {
        key: 'history',
        label: 'Review History',
        meta: `${this.submissionHistory.length} rounds`,
      },
    ];

    return tabs.filter((tab) => tab.show !== false);
  }

  get reviewedDocumentCount(): number {
    return this.compliedCount + this.nonCompliedCount;
  }

  get currentFocus(): { title: string; detail: string; tab: WorkspaceTabKey; button: string } {
    if (this.pendingReviewCount > 0) {
      return {
        title: 'Review uploaded documents',
        detail: `${this.pendingReviewCount} document(s) still need an approve or reject decision.`,
        tab: 'documents',
        button: 'Open document review',
      };
    }

    if (this.correctedPendingReviewCount > 0) {
      return {
        title: 'Reverify corrected uploads',
        detail: `${this.correctedPendingReviewCount} corrected document(s) are ready for review.`,
        tab: 'corrected',
        button: 'Open corrections',
      };
    }

    if (this.unresolvedCorrectionCount > 0) {
      return {
        title: 'Wait for stakeholder corrections',
        detail: `${this.unresolvedCorrectionCount} rejected item(s) are still waiting for a corrected upload.`,
        tab: 'corrected',
        button: 'View correction queue',
      };
    }

    if (!this.hasScore) {
      return {
        title: 'Calculate the severity score',
        detail: 'All document reviews are complete. Calculate the score before final submission.',
        tab: 'submit',
        button: 'Open finish audit',
      };
    }

    return {
      title: 'Audit is ready for final review',
      detail: 'You can add a final remark and submit the audit now.',
      tab: 'submit',
      button: 'Open finish audit',
    };
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

  get completedProgressStepCount(): number {
    return this.progressSteps.filter((step) => step.done).length;
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

  get canGenerateAiDraft(): boolean {
    return !!this.auditId && !!this.audit?.clientId && this.observationForm.observation.trim().length >= 10;
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

  get aiDraftConfidence(): number | null {
    if (this.aiDraft?.confidenceScore === null || this.aiDraft?.confidenceScore === undefined) {
      return null;
    }
    const value = Number(this.aiDraft.confidenceScore);
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.min(100, Math.round(value)));
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

  // ─── Tab switching ─────────────────────────────
  switchTab(tab: typeof this.activeTab): void {
    this.activeTab = tab;
    if (tab === 'info') this.loadAuditInfo();
    if (tab === 'history') this.loadSubmissionHistory();
    if (tab === 'corrected') this.loadNonCompliances();
    if (tab === 'checklist') this.loadChecklist();
    if (tab === 'documents') this.loadAuditDocuments();
    this.cdr.markForCheck();
  }

  jumpToTab(tab: WorkspaceTabKey): void {
    this.switchTab(tab);
  }

  loadAuditInfo(): void {
    if (!this.auditId || this.loadingInfo) return;
    this.loadingInfo = true;
    this.auditsApi.auditorGetAuditInfo(this.auditId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loadingInfo = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (data) => { this.auditInfo = data; },
      error: () => this.toast.error('Failed to load audit info'),
    });
  }

  loadSubmissionHistory(): void {
    if (!this.auditId || this.loadingHistory) return;
    this.loadingHistory = true;
    this.auditsApi.auditorGetSubmissionHistory(this.auditId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loadingHistory = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (data: any) => { this.submissionHistory = data?.submissions || []; },
      error: () => this.toast.error('Failed to load submission history'),
    });
  }

  loadNonCompliances(): void {
    if (!this.auditId || this.loadingNc) return;
    this.loadingNc = true;
    this.auditsApi.auditorGetNonCompliances(this.auditId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loadingNc = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res: any) => { this.nonCompliances = res?.items || []; this.ncSummary = res?.summary || {}; },
      error: () => this.toast.error('Failed to load non-compliances'),
    });
  }

  submitAuditWithRemark(): void {
    if (!this.auditId || this.busy) return;
    if (!this.canSubmitReviewRound) {
      this.toast.warning(this.submitReviewGuardMessage || 'Complete all document reviews before submission.');
      return;
    }
    this.busy = true;
    this.auditsApi.auditorSubmitAuditWithRemark(this.auditId, this.finalRemark || undefined).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.busy = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res: any) => {
        if (res.openNonCompliances > 0) {
          this.toast.warning(`Audit submitted with ${res.openNonCompliances} non-compliances pending correction`);
        } else {
          this.toast.success('Audit submitted successfully! Score: ' + (res.score ?? '-'));
        }
        this.finalRemark = '';
        // Sync new score immediately before cockpit refresh
        if (res.score !== undefined) {
          if (this.audit) this.audit.score = res.score;
          if (this.auditInfo) this.auditInfo = { ...this.auditInfo, score: res.score };
        }
        this.refreshCockpit();
      },
      error: (err) => this.toast.error(err?.error?.message || 'Failed to submit audit'),
    });
  }

  forceCompleteAudit(): void {
    if (!this.auditId || this.busy) return;
    if (!confirm('Finalize this audit? Pending documents and non-compliances will be overridden. This cannot be undone.')) return;
    this.busy = true;
    this.auditsApi.auditorForceCompleteAudit(this.auditId, this.finalRemark || undefined).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.busy = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res: any) => {
        this.toast.success('Audit finalized. ' + (res.message || ''));
        this.finalRemark = '';
        this.refreshCockpit();
      },
      error: (err) => this.toast.error(err?.error?.message || 'Failed to finalize audit'),
    });
  }

  loadUploadLock(): void {
    if (!this.auditId) return;
    this.uploadLockLoading = true;
    this.auditsApi.auditorGetUploadLock(this.auditId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.uploadLockLoading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res: any) => {
        this.uploadLockFrom = res?.uploadLockFrom ?? '';
        this.uploadLockUntil = res?.uploadLockUntil ?? '';
      },
      error: () => {},
    });
  }

  saveUploadLock(): void {
    if (!this.auditId || this.uploadLockSaving) return;
    if (!this.uploadLockFrom || !this.uploadLockUntil) {
      this.toast.warning('Please set both lock start and end dates.');
      return;
    }
    if (this.uploadLockFrom > this.uploadLockUntil) {
      this.toast.warning('Lock start must be on or before lock end date.');
      return;
    }
    this.uploadLockSaving = true;
    this.auditsApi.auditorSetUploadLock(this.auditId, this.uploadLockFrom, this.uploadLockUntil).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.uploadLockSaving = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: () => this.toast.success('Upload lock window saved.'),
      error: (err) => this.toast.error(err?.error?.message || 'Failed to save lock'),
    });
  }

  clearUploadLock(): void {
    if (!this.auditId || this.uploadLockSaving) return;
    this.uploadLockSaving = true;
    this.auditsApi.auditorSetUploadLock(this.auditId, null, null).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.uploadLockSaving = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: () => {
        this.uploadLockFrom = '';
        this.uploadLockUntil = '';
        this.toast.success('Upload lock cleared.');
      },
      error: (err) => this.toast.error(err?.error?.message || 'Failed to clear lock'),
    });
  }

  goBack(): void {
    this.router.navigate(['/auditor/audits']);
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
          const newScore = Number(res?.score ?? 0);
          if (this.audit) {
            this.audit.score = newScore;
          }
          if (this.auditInfo) {
            this.auditInfo = { ...this.auditInfo, score: newScore };
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
          this.aiDraft = null;
          this.loadObservations();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to add observation'),
      });
  }

  generateAiDraft(): void {
    if (!this.canGenerateAiDraft || this.busy || this.aiDrafting || !this.auditId || !this.audit?.clientId) {
      return;
    }

    this.aiDrafting = true;
    this.aiApi
      .generateAuditObservation({
        auditId: this.auditId,
        clientId: String(this.audit.clientId),
        branchId: this.audit.branchId ? String(this.audit.branchId) : undefined,
        findingDescription: this.observationForm.observation.trim(),
        applicableState: this.audit?.branch?.stateCode || undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.aiDrafting = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (draft) => {
          this.aiDraft = draft;
          this.applyAiDraftToForm(draft);
          this.toast.success('AI draft applied to the observation form');
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to generate AI draft');
        },
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
    if (['COMPLETED', 'CLOSED', 'RESOLVED', 'COMPLIED', 'APPROVED', 'ACCEPTED', 'SUBMITTED'].includes(key)) {
      return 'badge badge--good';
    }
    if (['IN_PROGRESS', 'ACKNOWLEDGED', 'REVERIFICATION_PENDING'].includes(key)) {
      return 'badge badge--info';
    }
    if (['REJECTED', 'CANCELLED', 'NON_COMPLIED'].includes(key)) {
      return 'badge badge--bad';
    }
    if (key === 'NOT_APPLICABLE') return 'badge badge--muted';
    return 'badge badge--warn';
  }

  formatLabel(value: string | null | undefined): string {
    const key = this.statusKey(value);
    if (!key) return '-';
    return key
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
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
    return `${environment.apiBaseUrl}/api/v1/files/download?p=${encodeURIComponent(doc.filePath)}`;
  }

  openEvidenceFile(url: string, fileName?: string | null, mode: 'open' | 'download' = 'open'): void {
    const action$ =
      mode === 'download'
        ? this.protectedFiles.download(url, fileName || null)
        : this.protectedFiles.open(url, fileName || null);
    action$.pipe(takeUntil(this.destroy$)).subscribe({
      error: (err) => {
        this.toast.error(err?.error?.message || 'Unable to open file.');
      },
    });
  }

  // ─── Document Review Methods (AuditXpert) ──────
  get compliedCount(): number {
    return this.auditDocuments.filter((d) => d.status === 'APPROVED').length;
  }

  /**
   * Distinct branches present in the contractor documents list, used to
   * populate the branch filter dropdown above the review table. Only includes
   * branches that actually appear in the loaded docs.
   */
  get contractorDocBranchOptions(): { id: string; name: string; count: number }[] {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const d of this.contractorDocuments || []) {
      const id = d?.branchId || '__NO_BRANCH__';
      const name = d?.branchName || (d?.branchId ? 'Unknown branch' : 'No branch');
      const ex = map.get(id);
      if (ex) ex.count += 1;
      else map.set(id, { id, name, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Contractor documents filtered by the selected branch. When the filter is
   * 'ALL', returns the full list. Used by the template to render the review
   * table per branch instead of dumping every branch's docs together.
   */
  get filteredContractorDocuments(): any[] {
    if (!this.contractorDocBranchFilter || this.contractorDocBranchFilter === 'ALL') {
      return this.contractorDocuments;
    }
    if (this.contractorDocBranchFilter === '__NO_BRANCH__') {
      return this.contractorDocuments.filter((d) => !d?.branchId);
    }
    return this.contractorDocuments.filter(
      (d) => d?.branchId === this.contractorDocBranchFilter,
    );
  }

  get nonCompliedCount(): number {
    return this.auditDocuments.filter((d) => d.status === 'REJECTED').length;
  }

  get pendingReviewCount(): number {
    return this.auditDocuments.filter(
      (d) => !['APPROVED', 'REJECTED'].includes(d.status),
    ).length;
  }

  get unresolvedCorrectionCount(): number {
    return this.nonCompliances.filter(
      (nc) => !['ACCEPTED', 'CLOSED'].includes(this.statusKey(nc.status)),
    ).length;
  }

  get correctedPendingReviewCount(): number {
    return this.nonCompliances.filter((nc) =>
      ['REUPLOADED', 'REVERIFICATION_PENDING'].includes(this.statusKey(nc.status)),
    ).length;
  }

  get canSubmitReviewRound(): boolean {
    return this.pendingReviewCount === 0 && this.unresolvedCorrectionCount === 0;
  }

  get submitReviewGuardMessage(): string | null {
    if (this.pendingReviewCount > 0) {
      return `${this.pendingReviewCount} uploaded document(s) still need an auditor decision.`;
    }
    if (this.correctedPendingReviewCount > 0) {
      return `${this.correctedPendingReviewCount} corrected submission(s) still need reverification.`;
    }
    if (this.unresolvedCorrectionCount > 0) {
      return `${this.unresolvedCorrectionCount} rejection item(s) are still awaiting stakeholder correction.`;
    }
    return null;
  }

  get docCompliancePercent(): number {
    const total = this.auditDocuments.length;
    if (!total) return 0;
    return Math.round((this.compliedCount / total) * 100);
  }

  getDocDownloadUrl(doc: any): string {
    return `${environment.apiBaseUrl}/api/v1/files/download?p=${encodeURIComponent(doc.filePath)}`;
  }

  getCorrectedFileUrl(nc: any): string | null {
    const filePath = nc?.correctedFilePath;
    if (!filePath) return null;
    return `${environment.apiBaseUrl}/api/v1/files/download?p=${encodeURIComponent(filePath)}`;
  }

  reviewDocument(doc: any, decision: 'COMPLIED' | 'NON_COMPLIED'): void {
    if (!this.auditId || this.reviewingDocId) return;
    const remarks = (this.docRemarks[doc.id] || '').trim();
    if (decision === 'NON_COMPLIED' && remarks.length < 5) {
      this.toast.warning('Add at least 5 characters in remarks before rejecting a document.');
      return;
    }
    this.reviewingDocId = doc.id;
    const sourceTable = doc.sourceTable || 'contractor_documents';

    this.auditsApi
      .auditorReviewDocument(this.auditId, doc.id, decision, remarks, sourceTable)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.reviewingDocId = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(
            decision === 'COMPLIED'
              ? 'Document approved'
              : 'Document rejected. Stakeholder can upload a corrected file for reverification.',
          );
          this.loadAuditDocuments();
          this.loadNonCompliances();
          this.loadChecklist();
          this.loadObservations();
        },
        error: (err) =>
          this.toast.error(err?.error?.message || 'Failed to review document'),
      });
  }

  reviewCorrectedDocument(nc: any, decision: 'COMPLIED' | 'NON_COMPLIED'): void {
    if (this.busy) return;
    const remarks = (this.correctedRemarks[nc.id] || '').trim();
    if (decision === 'NON_COMPLIED' && remarks.length < 5) {
      this.toast.warning('Add at least 5 characters in remarks before rejecting a corrected document.');
      return;
    }

    this.busy = true;
    this.auditsApi
      .auditorReviewCorrectedDoc(String(nc.id), decision, remarks || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(
            decision === 'COMPLIED'
              ? 'Corrected document approved'
              : 'Corrected document rejected with remarks',
          );
          delete this.correctedRemarks[nc.id];
          this.loadAuditDocuments();
          this.loadNonCompliances();
          this.refreshCockpit();
        },
        error: (err) =>
          this.toast.error(err?.error?.message || 'Failed to review corrected document'),
      });
  }

  submitAudit(): void {
    if (!this.auditId || this.busy) return;
    this.busy = true;
    this.auditsApi
      .auditorSubmitAudit(this.auditId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.toast.success(
            `Audit submitted! Score: ${res?.score ?? '-'}/100`,
          );
          this.refreshCockpit();
        },
        error: (err) =>
          this.toast.error(err?.error?.message || 'Failed to submit audit'),
      });
  }

  reopenForReaudit(): void {
    if (!this.auditId || this.busy) return;
    this.busy = true;
    this.auditsApi
      .auditorReopenAudit(this.auditId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Audit reopened for re-audit');
          this.refreshCockpit();
        },
        error: (err) =>
          this.toast.error(err?.error?.message || 'Failed to reopen audit'),
      });
  }

  // ─── Checklist Methods ─────────────────────────
  loadChecklist(): void {
    if (!this.auditId) return;
    this.loadingChecklist = true;
    this.auditsApi.auditorGetChecklist(this.auditId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.loadingChecklist = false; this.cdr.markForCheck(); }),
      )
      .subscribe({
        next: (res: any) => {
          this.checklistItems = res?.items || [];
          this.checklistSummary = res?.summary || {};
          // Auto-generate checklist on first load when empty
          if (this.checklistItems.length === 0 && !this.checklistAutoGenAttempted
              && this.statusKey(this.audit?.status) !== 'COMPLETED'
              && this.statusKey(this.audit?.status) !== 'CLOSED') {
            this.checklistAutoGenAttempted = true;
            this.autoGenerateChecklist();
          }
        },
        error: () => { this.checklistItems = []; },
      });
  }

  private autoGenerateChecklist(): void {
    if (!this.auditId) return;
    this.auditsApi.auditorGenerateChecklist(this.auditId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          if (res?.created > 0) {
            this.toast.success(`Checklist auto-generated: ${res.created} items`);
            this.loadChecklist();
          }
        },
        error: () => { /* silently ignore — audit type may have no default checklist */ },
      });
  }

  generateChecklist(): void {
    if (!this.auditId) return;
    this.loadingChecklist = true;
    this.auditsApi.auditorGenerateChecklist(this.auditId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.loadingChecklist = false; this.cdr.markForCheck(); }),
      )
      .subscribe({
        next: (res: any) => {
          this.toast.success(`Generated ${res?.created || 0} checklist items`);
          this.loadChecklist();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to generate checklist'),
      });
  }

  addChecklistItem(): void {
    if (!this.auditId || !this.newChecklistLabel.trim()) return;
    this.addingChecklistItem = true;
    this.auditsApi.auditorAddChecklistItem(this.auditId, { itemLabel: this.newChecklistLabel.trim() })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.addingChecklistItem = false; this.cdr.markForCheck(); }),
      )
      .subscribe({
        next: () => {
          this.newChecklistLabel = '';
          this.loadChecklist();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to add item'),
      });
  }

  updateChecklistStatus(item: any, status: string): void {
    if (!this.auditId) return;
    this.auditsApi.auditorUpdateChecklistItem(this.auditId, item.id, { status })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.loadChecklist(); },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to update'),
      });
  }

  deleteChecklistItem(item: any): void {
    if (!this.auditId) return;
    this.auditsApi.auditorDeleteChecklistItem(this.auditId, item.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.loadChecklist(); },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to delete'),
      });
  }

  markAllPendingNA(): void {
    if (!this.auditId) return;
    const pendingItems = this.checklistItems.filter((i: any) => i.status === 'PENDING');
    if (!pendingItems.length) return;
    const calls = pendingItems.map((item: any) =>
      this.auditsApi.auditorUpdateChecklistItem(this.auditId!, item.id, { status: 'NOT_APPLICABLE' })
    );
    forkJoin(calls).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.loadChecklist(); },
      error: (err) => this.toast.error(err?.error?.message || 'Failed to update'),
    });
  }

  private loadAuditDocuments(): void {
    if (!this.auditId) return;
    this.loadingDocs = true;
    this.auditsApi
      .auditorListAuditDocuments(this.auditId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingDocs = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.branchDocuments = res?.branchDocuments || [];
          this.contractorDocuments = res?.contractorDocuments || [];
          // Combined list for scoring counts
          this.auditDocuments = [...this.branchDocuments, ...this.contractorDocuments];
        },
        error: () => {
          this.branchDocuments = [];
          this.contractorDocuments = [];
          this.auditDocuments = [];
        },
      });
  }

  private initializeForAudit(auditId: string | null): void {
    this.auditId = auditId;
    this.audit = null;
    this.assignedAudits = [];
    this.evidenceRows = [];
    this.observations = [];
    this.nonCompliances = [];
    this.ncSummary = {};
    this.auditInfo = null;
    this.submissionHistory = [];
    this.reportStage = null;
    this.reportUpdatedAt = null;
    this.aiDraft = null;
    this.checklistAutoGenAttempted = false;
    this.uploadLockFrom = '';
    this.uploadLockUntil = '';
    this.loading = true;

    this.loadCategories();

    if (!auditId) {
      this.loadAuditSelector();
      return;
    }
    this.loadCockpit(auditId);
    this.loadUploadLock();
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
          this.loadAuditDocuments();
          this.loadNonCompliances();
          this.loadChecklist();
          this.loadAuditInfo();
          this.loadSubmissionHistory();
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
        },
        error: () => {
          this.evidenceRows = [];
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

  private applyAiDraftToForm(draft: AiAuditObservation): void {
    this.observationForm = {
      ...this.observationForm,
      observation: draft.observationTitle?.trim() || this.observationForm.observation,
      consequences: draft.consequence?.trim() || '',
      complianceRequirements: this.buildAiComplianceRequirements(draft),
      elaboration: draft.observationText?.trim() || '',
      clause: draft.sectionReference?.trim() || '',
      recommendation: draft.correctiveAction?.trim() || '',
      risk: this.normalizeRisk(draft.riskRating),
    };
  }

  private buildAiComplianceRequirements(draft: AiAuditObservation): string {
    const parts = [draft.sectionReference, draft.stateSpecificRules]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value);
    return parts.join('\n\n');
  }

  private normalizeRisk(risk: string | null | undefined): string {
    const key = this.statusKey(risk);
    return this.riskOptions.includes(key) ? key : this.observationForm.risk;
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

  statusKey(value: string | null | undefined): string {
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

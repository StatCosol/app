import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { AuthService } from '../../../core/auth.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { HelpdeskService } from '../../../core/helpdesk.service';
import { ToastService } from '../../../shared/toast/toast.service';

type ObservationSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';
type ObservationStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
type CapaWorkflow = 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_VERIFICATION' | 'CLOSED';

interface ObservationRow {
  id: string;
  observationRef: string;
  category: string;
  description: string;
  raisedDate: string;
  raisedDateIso: string | null;
  dueDateText: string;
  dueDateIso: string | null;
  severity: ObservationSeverity;
  status: ObservationStatus;
  assignedTo: string;
  consequences: string;
  complianceRequirements: string;
}

interface ClosureCase {
  id: string;
  ticketRef: string;
  observationId: string;
  observationRef: string;
  status: string;
  priority: string;
  rootCause: string;
  correctiveAction: string;
  actionOwner: string;
  targetDueDate: string;
  closureRecommendation: string;
  capaStatus: CapaWorkflow;
  evidenceFiles: string[];
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
}

interface CaseMessage {
  id: string;
  ticketId: string;
  message: string;
  createdAt: string | null;
}

interface ClosureDraft {
  rootCause: string;
  correctiveAction: string;
  actionOwner: string;
  targetDueDate: string;
  closureRecommendation: string;
  capaStatus: CapaWorkflow;
  notes: string;
}

interface TimelineEvent {
  id: string;
  title: string;
  createdAt: string;
  actorRole?: string;
  statusTo?: string | null;
  comment?: string | null;
  attachmentsCount?: number;
}

interface EvidencePreviewData {
  id: string;
  name: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  status?: string | null;
  uploadedAt?: string | null;
  url?: string | null;
  rejectionReason?: string | null;
}

@Component({
  selector: 'app-branch-audit-observations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './branch-audit-observations.component.html',
  styleUrls: ['./branch-audit-observations.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BranchAuditObservationsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  saving = false;
  uploading = false;
  branchId = '';

  observations: ObservationRow[] = [];
  filteredObservations: ObservationRow[] = [];
  selectedObservation: ObservationRow | null = null;

  cases: ClosureCase[] = [];
  selectedCases: ClosureCase[] = [];
  selectedMessages: CaseMessage[] = [];
  selectedTimeline: TimelineEvent[] = [];

  selectedEvidenceFiles: File[] = [];
  showEvidencePreview = false;
  evidencePreviewData: EvidencePreviewData | null = null;
  private localPreviewUrl: string | null = null;

  searchTerm = '';
  statusFilter: 'ALL' | ObservationStatus = 'ALL';
  severityFilter: 'ALL' | ObservationSeverity = 'ALL';

  draft: ClosureDraft = this.emptyDraft();

  constructor(
    private readonly auth: AuthService,
    private readonly branchService: ClientBranchesService,
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
    this.revokeLocalPreviewUrl();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get totalCount(): number {
    return this.filteredObservations.length;
  }

  get openCount(): number {
    return this.filteredObservations.filter((o) => o.status === 'OPEN').length;
  }

  get inProgressCount(): number {
    return this.filteredObservations.filter((o) => o.status === 'IN_PROGRESS').length;
  }

  get closedCount(): number {
    return this.filteredObservations.filter((o) => o.status === 'CLOSED').length;
  }

  get criticalCount(): number {
    return this.filteredObservations.filter((o) => o.severity === 'CRITICAL').length;
  }

  get closureCaseCount(): number {
    return this.cases.length;
  }

  get readyForVerificationCount(): number {
    return this.cases.filter((c) => c.capaStatus === 'READY_FOR_VERIFICATION').length;
  }

  get overdueCount(): number {
    const now = Date.now();
    return this.filteredObservations.filter((o) => {
      if (!o.dueDateIso || o.status === 'CLOSED') return false;
      const due = new Date(o.dueDateIso).getTime();
      return !Number.isNaN(due) && due < now;
    }).length;
  }

  get activeCase(): ClosureCase | null {
    if (!this.selectedCases.length) return null;
    return this.selectedCases[0];
  }

  get auditorVerificationLabel(): string {
    const c = this.activeCase;
    if (!c) return 'Not submitted';
    if (c.status === 'CLOSED' || c.capaStatus === 'CLOSED') return 'Closed';
    if (c.status === 'RESOLVED') return 'Verified by reviewer';
    if (c.capaStatus === 'READY_FOR_VERIFICATION') return 'Submitted for reviewer verification';
    return 'Pending reviewer verification';
  }

  get auditorVerificationStatus(): string {
    const c = this.activeCase;
    if (!c) return 'PENDING';
    if (c.status === 'CLOSED' || c.capaStatus === 'CLOSED') return 'CLOSED';
    if (c.status === 'RESOLVED') return 'VERIFIED';
    if (c.capaStatus === 'READY_FOR_VERIFICATION') return 'UNDER_REVIEW';
    return 'PENDING';
  }

  get ownerSuggestions(): string[] {
    const values = [
      this.selectedObservation?.assignedTo || '',
      this.activeCase?.actionOwner || '',
      this.draft.actionOwner || '',
    ]
      .map((x) => x.trim())
      .filter((x) => !!x && x !== '-');
    return Array.from(new Set(values));
  }

  get targetDueAlertText(): string {
    const raw = this.draft.targetDueDate;
    if (!raw) return 'Set a target due date to prevent overdue CAPA.';
    const due = new Date(raw).getTime();
    if (Number.isNaN(due)) return 'Target due date format is invalid.';
    const days = Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
    if (days < 0) return `Target due date missed by ${Math.abs(days)} day(s).`;
    if (days === 0) return 'Target due date is today.';
    if (days <= 3) return `Target due date is in ${days} day(s).`;
    return `Target due date is in ${days} day(s).`;
  }

  get targetDueAlertClass(): string {
    const raw = this.draft.targetDueDate;
    if (!raw) return 'due-alert due-alert--neutral';
    const due = new Date(raw).getTime();
    if (Number.isNaN(due)) return 'due-alert due-alert--bad';
    const days = Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
    if (days < 0) return 'due-alert due-alert--bad';
    if (days <= 3) return 'due-alert due-alert--warn';
    return 'due-alert due-alert--good';
  }

  trackObservation(_: number, row: ObservationRow): string {
    return row.id;
  }

  trackCase(_: number, row: ClosureCase): string {
    return row.id;
  }

  setStatusFilter(filter: 'ALL' | ObservationStatus): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  setSeverityFilter(filter: 'ALL' | ObservationSeverity): void {
    this.severityFilter = filter;
    this.applyFilters();
  }

  applyFilters(): void {
    const q = this.searchTerm.trim().toLowerCase();
    this.filteredObservations = this.observations.filter((obs) => {
      if (this.statusFilter !== 'ALL' && obs.status !== this.statusFilter) return false;
      if (this.severityFilter !== 'ALL' && obs.severity !== this.severityFilter) return false;
      if (!q) return true;
      const text = `${obs.observationRef} ${obs.category} ${obs.description}`.toLowerCase();
      return text.includes(q);
    });

    this.hydrateSelection(this.selectedObservation?.id || null);
    this.cdr.markForCheck();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = 'ALL';
    this.severityFilter = 'ALL';
    this.applyFilters();
  }

  selectObservation(obs: ObservationRow): void {
    this.selectedObservation = obs;
    this.selectedCases = this.cases
      .filter((c) => c.observationId === obs.id)
      .sort((a, b) => this.timeValue(b.createdAt) - this.timeValue(a.createdAt));

    const latest = this.selectedCases[0] || null;
    this.draft = latest
      ? {
          rootCause: latest.rootCause || '',
          correctiveAction: latest.correctiveAction || '',
          actionOwner: latest.actionOwner || obs.assignedTo || '',
          targetDueDate: latest.targetDueDate || '',
          closureRecommendation: latest.closureRecommendation || '',
          capaStatus: latest.capaStatus || 'OPEN',
          notes: '',
        }
      : {
          rootCause: '',
          correctiveAction: '',
          actionOwner: obs.assignedTo || '',
          targetDueDate: obs.dueDateIso ? obs.dueDateIso.slice(0, 10) : '',
          closureRecommendation: '',
          capaStatus: obs.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
          notes: '',
        };

    this.selectedEvidenceFiles = [];
    this.loadCaseMessages();
  }

  onEvidenceSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    this.selectedEvidenceFiles = files.slice(0, 5);
  }

  removeEvidence(index: number): void {
    this.selectedEvidenceFiles.splice(index, 1);
    this.selectedEvidenceFiles = [...this.selectedEvidenceFiles];
  }

  applyOwner(owner: string): void {
    this.draft.actionOwner = owner;
  }

  setCapaStatus(status: CapaWorkflow): void {
    this.draft.capaStatus = status;
    if (status === 'READY_FOR_VERIFICATION' && !this.draft.closureRecommendation.trim()) {
      this.draft.closureRecommendation = 'Ready for auditor verification.';
    }
    if (status === 'CLOSED' && !this.draft.closureRecommendation.trim()) {
      this.draft.closureRecommendation = 'Recommend closure.';
    }
  }

  isCapaStatus(status: CapaWorkflow): boolean {
    return this.draft.capaStatus === status;
  }

  previewSelectedEvidence(file: File): void {
    this.revokeLocalPreviewUrl();
    const objectUrl = URL.createObjectURL(file);
    this.localPreviewUrl = objectUrl;
    this.evidencePreviewData = {
      id: `local-${file.name}-${file.size}`,
      name: file.name,
      fileName: file.name,
      mimeType: file.type || null,
      fileSize: file.size,
      status: this.activeCase ? 'PENDING_UPLOAD' : 'DRAFT',
      uploadedAt: new Date().toISOString(),
      url: objectUrl,
    };
    this.showEvidencePreview = true;
  }

  previewCaseEvidence(fileName: string, caseRow: ClosureCase): void {
    this.revokeLocalPreviewUrl();
    this.evidencePreviewData = {
      id: `${caseRow.id}-${fileName}`,
      name: fileName,
      fileName,
      status: caseRow.status,
      uploadedAt: caseRow.updatedAt || caseRow.createdAt || null,
      rejectionReason: caseRow.status === 'OPEN' ? null : '',
    };
    this.showEvidencePreview = true;
  }

  closeEvidencePreview(): void {
    this.showEvidencePreview = false;
    this.evidencePreviewData = null;
    this.revokeLocalPreviewUrl();
  }

  downloadEvidencePreview(): void {
    const url = this.evidencePreviewData?.url;
    if (!url) {
      this.toast.error('No file URL is available for this evidence item.');
      return;
    }
    window.open(url, '_blank');
  }

  submitClosureResponse(): void {
    if (this.saving) return;
    const obs = this.selectedObservation;
    if (!obs) {
      this.toast.error('Select an observation first.');
      return;
    }
    if (!this.draft.rootCause.trim()) {
      this.toast.error('Root cause is required.');
      return;
    }
    if (!this.draft.correctiveAction.trim()) {
      this.toast.error('Corrective action is required.');
      return;
    }
    if (!this.draft.actionOwner.trim()) {
      this.toast.error('Action owner is required.');
      return;
    }
    if (!this.draft.targetDueDate) {
      this.toast.error('Target due date is required.');
      return;
    }
    if (
      (this.draft.capaStatus === 'READY_FOR_VERIFICATION' || this.draft.capaStatus === 'CLOSED') &&
      !this.draft.closureRecommendation.trim()
    ) {
      this.toast.error('Closure recommendation is required before verification/closure.');
      return;
    }

    this.saving = true;
    const activeCase = this.activeCase;

    if (activeCase) {
      const message = this.buildProgressMessage();
      this.helpdeskService
        .postMessage(activeCase.id, message)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => {
            this.saving = false;
            this.cdr.markForCheck();
          }),
        )
        .subscribe({
          next: () => {
            this.toast.success('Closure update posted.');
            this.uploadEvidenceFiles(activeCase.id);
          },
          error: (err) => this.toast.error(err?.error?.message || 'Failed to post closure update'),
        });
      return;
    }

    const payload = {
      category: 'AUDIT',
      subCategory: 'AUDIT_OBSERVATION_CLOSURE',
      branchId: this.branchId,
      priority: this.priorityForSeverity(obs.severity),
      description: this.buildCaseDescription(obs),
    };

    this.helpdeskService
      .createTicket(payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (ticket) => {
          const ticketId = String(ticket?.id || '');
          this.toast.success('Closure case submitted for reviewer verification.');
          if (ticketId) {
            this.uploadEvidenceFiles(ticketId);
          } else {
            this.refreshCases(obs.id);
          }
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to submit closure case'),
      });
  }

  addComment(): void {
    const activeCase = this.activeCase;
    if (!activeCase) {
      this.toast.error('Create a closure case first.');
      return;
    }
    const note = this.draft.notes.trim();
    if (!note) {
      this.toast.error('Enter a comment first.');
      return;
    }

    this.saving = true;
    this.helpdeskService
      .postMessage(activeCase.id, `[BRANCH_COMMENT]\n${note}`)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.draft.notes = '';
          this.toast.success('Comment added to case thread.');
          this.loadCaseMessages();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to post comment'),
      });
  }

  statusText(status: ObservationStatus): string {
    if (status === 'IN_PROGRESS') return 'In Progress';
    if (status === 'CLOSED') return 'Closed';
    return 'Open';
  }

  severityText(severity: ObservationSeverity): string {
    if (severity === 'CRITICAL') return 'Critical';
    if (severity === 'MAJOR') return 'Major';
    return 'Minor';
  }

  badgeLabel(value: string | null | undefined): string {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    return raw.replace(/_/g, ' ');
  }

  badgeClass(value: string | null | undefined): string {
    const raw = String(value || '').toUpperCase();
    if (!raw) return 'badge badge--muted';
    if (['CRITICAL', 'OPEN', 'OVERDUE', 'PENDING'].includes(raw)) return 'badge badge--bad';
    if (['MAJOR', 'IN_PROGRESS', 'READY_FOR_VERIFICATION', 'UNDER_REVIEW'].includes(raw)) {
      return 'badge badge--warn';
    }
    if (['CLOSED', 'RESOLVED', 'VERIFIED'].includes(raw)) return 'badge badge--good';
    return 'badge badge--muted';
  }

  dueBadgeText(raw: string | null | undefined, closed = false): string {
    if (!raw) return 'No due date';
    if (closed) return 'Closed';
    const due = new Date(raw).getTime();
    if (Number.isNaN(due)) return 'No due date';
    const days = Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Due today';
    if (days <= 3) return 'Due soon';
    return 'On track';
  }

  dueBadgeClass(raw: string | null | undefined, closed = false): string {
    if (!raw) return 'badge badge--muted';
    if (closed) return 'badge badge--good';
    const due = new Date(raw).getTime();
    if (Number.isNaN(due)) return 'badge badge--muted';
    const days = Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
    if (days < 0) return 'badge badge--bad';
    if (days <= 3) return 'badge badge--warn';
    return 'badge badge--good';
  }

  dueClass(obs: ObservationRow): string {
    if (!obs.dueDateIso || obs.status === 'CLOSED') return 'badge badge--muted';
    const due = new Date(obs.dueDateIso).getTime();
    const now = Date.now();
    if (Number.isNaN(due)) return 'badge badge--muted';
    if (due < now) return 'badge badge--bad';
    if (due - now < 7 * 24 * 60 * 60 * 1000) return 'badge badge--warn';
    return 'badge badge--good';
  }

  dueText(obs: ObservationRow): string {
    if (!obs.dueDateIso) return 'No due date';
    const due = new Date(obs.dueDateIso).getTime();
    if (Number.isNaN(due)) return 'No due date';
    const diffDays = Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Due today';
    return `${diffDays}d left`;
  }

  dueForCase(caseRow: ClosureCase): string | null {
    if (!caseRow.targetDueDate || caseRow.targetDueDate === '-') return null;
    return caseRow.targetDueDate;
  }

  caseDueClass(caseRow: ClosureCase): string {
    const raw = this.dueForCase(caseRow);
    if (!raw || caseRow.capaStatus === 'CLOSED') return 'badge badge--muted';
    const due = new Date(raw).getTime();
    if (Number.isNaN(due)) return 'badge badge--muted';
    const days = Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
    if (days < 0) return 'badge badge--bad';
    if (days <= 3) return 'badge badge--warn';
    return 'badge badge--good';
  }

  caseDueText(caseRow: ClosureCase): string {
    const raw = this.dueForCase(caseRow);
    if (!raw) return 'No due date';
    const due = new Date(raw).getTime();
    if (Number.isNaN(due)) return 'No due date';
    const days = Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Due today';
    return `${days}d left`;
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
      observations: this.branchService.listAuditObservations(this.branchId),
      tickets: this.helpdeskService.listTickets({ branchId: this.branchId, category: 'AUDIT' }),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ observations, tickets }) => {
          this.observations = (observations || []).map((raw: any) => this.mapObservation(raw));
          this.cases = this.extractClosureCases(tickets || []);
          this.applyFilters();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to load audit observations');
          this.observations = [];
          this.filteredObservations = [];
          this.cases = [];
          this.selectedObservation = null;
          this.selectedCases = [];
          this.selectedMessages = [];
          this.selectedTimeline = [];
        },
      });
  }

  private refreshCases(preferredObservationId: string): void {
    this.helpdeskService
      .listTickets({ branchId: this.branchId, category: 'AUDIT' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tickets) => {
          this.cases = this.extractClosureCases(tickets || []);
          const obs = this.observations.find((o) => o.id === preferredObservationId) || null;
          if (obs) this.selectObservation(obs);
          this.cdr.markForCheck();
        },
      });
  }

  private hydrateSelection(id: string | null): void {
    if (!this.filteredObservations.length) {
      this.selectedObservation = null;
      this.selectedCases = [];
      this.selectedMessages = [];
      this.selectedTimeline = [];
      this.draft = this.emptyDraft();
      return;
    }
    if (id) {
      const found = this.filteredObservations.find((o) => o.id === id);
      if (found) {
        this.selectObservation(found);
        return;
      }
    }
    this.selectObservation(this.filteredObservations[0]);
  }

  private loadCaseMessages(): void {
    const caseList = this.selectedCases.slice(0, 5);
    if (!caseList.length) {
      this.selectedMessages = [];
      this.selectedTimeline = this.buildTimeline(this.selectedObservation, this.selectedCases, []);
      this.cdr.markForCheck();
      return;
    }

    const calls = caseList.map((c) =>
      this.helpdeskService.getMessages(c.id).pipe(
        catchError(() => of([])),
      ),
    );

    forkJoin(calls)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (messageGroups) => {
          const flat: CaseMessage[] = [];
          for (let i = 0; i < messageGroups.length; i += 1) {
            const ticketId = caseList[i].id;
            for (const raw of messageGroups[i] as any[]) {
              flat.push({
                id: String(raw?.id || `${ticketId}-${flat.length}`),
                ticketId,
                message: String(raw?.message || ''),
                createdAt: raw?.createdAt ? new Date(raw.createdAt).toISOString() : null,
              });
            }
          }
          const sortedMessages = flat.sort((a, b) => this.timeValue(b.createdAt) - this.timeValue(a.createdAt));
          this.selectedMessages = sortedMessages;
          this.selectedCases = this.mergeCaseUpdates(this.selectedCases, sortedMessages);
          this.cases = this.cases.map((row) => {
            const merged = this.selectedCases.find((s) => s.id === row.id);
            return merged || row;
          });
          this.selectedTimeline = this.buildTimeline(
            this.selectedObservation,
            this.selectedCases,
            this.selectedMessages,
          );
          this.cdr.markForCheck();
        },
      });
  }

  private uploadEvidenceFiles(ticketId: string): void {
    void ticketId;
    if (!this.selectedEvidenceFiles.length) {
      this.refreshCases(this.selectedObservation?.id || '');
      return;
    }

    this.uploading = true;
    const count = this.selectedEvidenceFiles.length;
    this.selectedEvidenceFiles = [];
    this.uploading = false;
    this.toast.success(`Evidence references recorded for ${count} file(s).`);
    this.refreshCases(this.selectedObservation?.id || '');
  }

  private mapObservation(raw: any): ObservationRow {
    const severity = this.normalizeSeverity(raw?.severity);
    const status = this.normalizeStatus(raw?.status);
    const raisedIso = this.toIsoDate(raw?.rawRaisedDate || raw?.raisedDate);
    const dueIso = raw?.rawDueDate ? new Date(raw.rawDueDate).toISOString() : null;

    return {
      id: String(raw?.id || ''),
      observationRef: String(raw?.observationRef || raw?.id?.slice(0, 8) || '-'),
      category: String(raw?.category || 'General'),
      description: String(raw?.description || ''),
      raisedDate: String(raw?.raisedDate || '-'),
      raisedDateIso: raisedIso,
      dueDateText: String(raw?.dueDate || '-'),
      dueDateIso: dueIso,
      severity,
      status,
      assignedTo: String(raw?.assignedTo || '-'),
      consequences: String(raw?.consequences || ''),
      complianceRequirements: String(raw?.complianceRequirements || ''),
    };
  }

  private extractClosureCases(tickets: any[]): ClosureCase[] {
    const rows: ClosureCase[] = [];
    for (const t of tickets || []) {
      const sub = String(t?.subCategory || '').toUpperCase();
      const desc = String(t?.description || '');
      const tagged =
        sub === 'AUDIT_OBSERVATION_CLOSURE' ||
        desc.includes('[AUDIT_OBSERVATION_CLOSURE]');
      if (!tagged) continue;

      rows.push({
        id: String(t?.id || ''),
        ticketRef: `HD-${String(t?.id || '').slice(0, 8).toUpperCase()}`,
        observationId: this.extractField(desc, 'Observation ID'),
        observationRef: this.extractField(desc, 'Observation Ref'),
        status: String(t?.status || 'OPEN'),
        priority: String(t?.priority || 'NORMAL'),
        rootCause: this.extractField(desc, 'Root Cause'),
        correctiveAction: this.extractField(desc, 'Corrective Action'),
        actionOwner: this.extractField(desc, 'Action Owner'),
        targetDueDate: this.extractField(desc, 'Target Due Date'),
        closureRecommendation: this.extractField(desc, 'Closure Recommendation'),
        capaStatus: this.normalizeCapaStatus(this.extractField(desc, 'CAPA Status') || 'OPEN'),
        evidenceFiles: this.extractField(desc, 'Evidence Files')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        notes: this.extractField(desc, 'Notes'),
        createdAt: t?.createdAt ? new Date(t.createdAt).toISOString() : null,
        updatedAt: t?.updatedAt ? new Date(t.updatedAt).toISOString() : null,
      });
    }
    return rows.sort((a, b) => this.timeValue(b.createdAt) - this.timeValue(a.createdAt));
  }

  private mergeCaseUpdates(
    caseRows: ClosureCase[],
    messages: CaseMessage[],
  ): ClosureCase[] {
    return caseRows.map((row) => {
      const ticketMessages = messages.filter((m) => m.ticketId === row.id);
      if (!ticketMessages.length) return row;

      const latestUpdate = ticketMessages.find((m) =>
        m.message.toUpperCase().includes('[AUDIT_CLOSURE_UPDATE]'),
      );
      const latestBranchComment = ticketMessages.find((m) =>
        m.message.toUpperCase().includes('[BRANCH_COMMENT]'),
      );
      const uploadFiles = ticketMessages
        .filter((m) => m.message.toLowerCase().startsWith('file uploaded:'))
        .map((m) => m.message.split(':').slice(1).join(':').trim())
        .filter(Boolean);

      const fromUpdate = latestUpdate
        ? this.parseTaggedFields(latestUpdate.message)
        : {};

      const mergedEvidence = Array.from(
        new Set([
          ...row.evidenceFiles,
          ...(fromUpdate['Evidence Files']
            ? fromUpdate['Evidence Files']
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
            : []),
          ...uploadFiles,
        ]),
      );

      return {
        ...row,
        rootCause: fromUpdate['Root Cause'] || row.rootCause,
        correctiveAction: fromUpdate['Corrective Action'] || row.correctiveAction,
        actionOwner: fromUpdate['Action Owner'] || row.actionOwner,
        targetDueDate: fromUpdate['Target Due Date'] || row.targetDueDate,
        closureRecommendation:
          fromUpdate['Closure Recommendation'] || row.closureRecommendation,
        capaStatus: this.normalizeCapaStatus(fromUpdate['CAPA Status'] || row.capaStatus),
        notes:
          fromUpdate['Notes'] ||
          (latestBranchComment
            ? latestBranchComment.message.replace('[BRANCH_COMMENT]', '').trim()
            : row.notes),
        evidenceFiles: mergedEvidence,
        updatedAt: latestUpdate?.createdAt || latestBranchComment?.createdAt || row.updatedAt,
      };
    });
  }

  private parseTaggedFields(message: string): Record<string, string> {
    const map: Record<string, string> = {};
    for (const line of String(message || '').split(/\r?\n/)) {
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const value = m[2].trim();
      if (key) map[key] = value;
    }
    return map;
  }

  private buildTimeline(
    observation: ObservationRow | null,
    cases: ClosureCase[],
    messages: CaseMessage[],
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    if (observation) {
      events.push({
        id: `obs-${observation.id}`,
        title: `Observation ${observation.observationRef} raised`,
        createdAt:
          observation.raisedDateIso ||
          observation.dueDateIso ||
          new Date().toISOString(),
        actorRole: 'AUDITOR',
        statusTo: observation.status,
        comment: `Severity: ${this.severityText(observation.severity)}`,
      });
    }

    for (const c of cases) {
      events.push({
        id: `case-${c.id}`,
        title: `Closure case ${c.ticketRef} created`,
        createdAt: c.createdAt || c.updatedAt || new Date().toISOString(),
        actorRole: 'BRANCH',
        statusTo: c.status,
        comment: `CAPA: ${c.capaStatus}${c.actionOwner ? ` | Owner: ${c.actionOwner}` : ''}`,
      });
      if (c.targetDueDate) {
        events.push({
          id: `case-${c.id}-due`,
          title: 'Target due date committed',
          createdAt: c.updatedAt || c.createdAt || new Date().toISOString(),
          actorRole: 'BRANCH',
          comment: c.targetDueDate,
        });
      }
    }

    for (const m of messages) {
      const trimmed = m.message.trim();
      if (!trimmed) continue;
      if (trimmed.toUpperCase().includes('[AUDIT_CLOSURE_UPDATE]')) {
        const parsed = this.parseTaggedFields(trimmed);
        events.push({
          id: `msg-${m.id}`,
          title: 'Closure response updated',
          createdAt: m.createdAt || new Date().toISOString(),
          statusTo: parsed['CAPA Status'] || null,
          comment: [
            parsed['Action Owner'] ? `Owner: ${parsed['Action Owner']}` : '',
            parsed['Target Due Date'] ? `Due: ${parsed['Target Due Date']}` : '',
            parsed['Closure Recommendation']
              ? `Recommendation: ${parsed['Closure Recommendation']}`
              : '',
          ]
            .filter(Boolean)
            .join(' | '),
        });
      } else if (trimmed.toUpperCase().includes('[BRANCH_COMMENT]')) {
        events.push({
          id: `msg-${m.id}`,
          title: 'Branch progress comment',
          createdAt: m.createdAt || new Date().toISOString(),
          comment: trimmed.replace('[BRANCH_COMMENT]', '').trim(),
        });
      } else if (trimmed.toLowerCase().startsWith('file uploaded:')) {
        events.push({
          id: `msg-${m.id}`,
          title: 'Evidence uploaded',
          createdAt: m.createdAt || new Date().toISOString(),
          attachmentsCount: 1,
          comment: trimmed,
        });
      } else {
        events.push({
          id: `msg-${m.id}`,
          title: 'Case comment',
          createdAt: m.createdAt || new Date().toISOString(),
          comment: trimmed,
        });
      }
    }

    return events.sort((a, b) => this.timeValue(b.createdAt) - this.timeValue(a.createdAt));
  }

  private buildCaseDescription(obs: ObservationRow): string {
    const evidenceNames = this.selectedEvidenceFiles.map((f) => f.name).join(', ');
    return [
      '[AUDIT_OBSERVATION_CLOSURE]',
      `Observation ID: ${obs.id}`,
      `Observation Ref: ${obs.observationRef}`,
      `Severity: ${obs.severity}`,
      `Root Cause: ${this.draft.rootCause.trim() || '-'}`,
      `Corrective Action: ${this.draft.correctiveAction.trim() || '-'}`,
      `Action Owner: ${this.draft.actionOwner.trim() || '-'}`,
      `Target Due Date: ${this.draft.targetDueDate || '-'}`,
      `CAPA Status: ${this.draft.capaStatus}`,
      `Closure Recommendation: ${this.draft.closureRecommendation.trim() || '-'}`,
      `Evidence Files: ${evidenceNames || '-'}`,
      `Notes: ${this.draft.notes.trim() || '-'}`,
    ].join('\n');
  }

  private buildProgressMessage(): string {
    const evidenceNames = this.selectedEvidenceFiles.map((f) => f.name).join(', ');
    return [
      '[AUDIT_CLOSURE_UPDATE]',
      `Root Cause: ${this.draft.rootCause.trim() || '-'}`,
      `Corrective Action: ${this.draft.correctiveAction.trim() || '-'}`,
      `Action Owner: ${this.draft.actionOwner.trim() || '-'}`,
      `Target Due Date: ${this.draft.targetDueDate || '-'}`,
      `CAPA Status: ${this.draft.capaStatus}`,
      `Closure Recommendation: ${this.draft.closureRecommendation.trim() || '-'}`,
      `Evidence Files: ${evidenceNames || '-'}`,
      `Notes: ${this.draft.notes.trim() || '-'}`,
    ].join('\n');
  }

  private extractField(input: string, key: string): string {
    const match = input.match(new RegExp(`${key}:\\s*(.*)`, 'i'));
    return match?.[1]?.trim() || '';
  }

  private normalizeSeverity(value: string): ObservationSeverity {
    const v = String(value || '').toUpperCase();
    if (v === 'CRITICAL') return 'CRITICAL';
    if (v === 'MAJOR' || v === 'HIGH') return 'MAJOR';
    return 'MINOR';
  }

  private normalizeStatus(value: string): ObservationStatus {
    const v = String(value || '').toUpperCase();
    if (v === 'CLOSED' || v === 'RESOLVED') return 'CLOSED';
    if (v === 'IN_PROGRESS' || v === 'IN PROGRESS' || v === 'ACKNOWLEDGED') return 'IN_PROGRESS';
    return 'OPEN';
  }

  private normalizeCapaStatus(value: string): CapaWorkflow {
    const v = String(value || '').toUpperCase();
    if (v === 'IN_PROGRESS') return 'IN_PROGRESS';
    if (v === 'READY_FOR_VERIFICATION') return 'READY_FOR_VERIFICATION';
    if (v === 'CLOSED') return 'CLOSED';
    return 'OPEN';
  }

  private priorityForSeverity(severity: ObservationSeverity): string {
    if (severity === 'CRITICAL') return 'CRITICAL';
    if (severity === 'MAJOR') return 'HIGH';
    return 'NORMAL';
  }

  private timeValue(input?: string | null): number {
    if (!input) return 0;
    const v = new Date(input).getTime();
    return Number.isNaN(v) ? 0 : v;
  }

  private toIsoDate(value: any): string | null {
    if (!value) return null;
    const t = new Date(value).getTime();
    if (!Number.isNaN(t)) return new Date(t).toISOString();
    const parsed = Date.parse(String(value));
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    return null;
  }

  private revokeLocalPreviewUrl(): void {
    if (!this.localPreviewUrl) return;
    URL.revokeObjectURL(this.localPreviewUrl);
    this.localPreviewUrl = null;
  }

  private emptyDraft(): ClosureDraft {
    return {
      rootCause: '',
      correctiveAction: '',
      actionOwner: '',
      targetDueDate: '',
      closureRecommendation: '',
      capaStatus: 'OPEN',
      notes: '',
    };
  }
}

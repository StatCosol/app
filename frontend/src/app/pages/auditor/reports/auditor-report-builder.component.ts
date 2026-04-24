import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subject, forkJoin } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import {
  AuditorReportDraft,
  AuditorReportVersion,
  AuditsService,
} from '../../../core/audits.service';
import { AuditorObservationsService } from '../../../core/auditor-observations.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ClientContextStripComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-auditor-report-builder',
  imports: [CommonModule, FormsModule, RouterModule, ClientContextStripComponent],
  templateUrl: './auditor-report-builder.component.html',
  styleUrls: ['./auditor-report-builder.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditorReportBuilderComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  saving = false;
  exporting = false;
  auditId = '';

  audit: any | null = null;
  observations: any[] = [];
  draft: AuditorReportDraft | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly auditsApi: AuditsService,
    private readonly observationsApi: AuditorObservationsService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.auditId = this.route.snapshot.paramMap.get('auditId') || '';
    if (!this.auditId) {
      this.loading = false;
      this.toast.error('Missing audit id for report builder');
      return;
    }
    this.loadBuilder();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get canEdit(): boolean {
    return !!this.draft && this.draft.stage === 'DRAFT';
  }

  get selectedCount(): number {
    if (!this.draft) return 0;
    return this.draft.selectedObservationIds.length;
  }

  get finalLockedText(): string {
    if (!this.draft) return '-';
    return this.draft.stage === 'FINAL'
      ? `Finalized on ${this.formatDate(this.draft.finalizedAt)}`
      : 'Draft mode';
  }

  get canExportFinal(): boolean {
    return !!this.draft && this.draft.stage === 'FINAL';
  }

  get canReopen(): boolean {
    return !!this.draft && this.draft.stage === 'FINAL';
  }

  get reportGuardrails(): Array<{ label: string; passed: boolean; detail: string }> {
    if (!this.draft) return [];
    return [
      {
        label: 'Executive Summary',
        passed: this.draft.executiveSummary.trim().length >= 20,
        detail:
          this.draft.executiveSummary.trim().length >= 20
            ? 'Summary coverage looks sufficient'
            : 'Add at least 20 characters in executive summary',
      },
      {
        label: 'Scope',
        passed: this.draft.scope.trim().length >= 10,
        detail:
          this.draft.scope.trim().length >= 10
            ? 'Scope section captured'
            : 'Add at least 10 characters in scope',
      },
      {
        label: 'Methodology',
        passed: this.draft.methodology.trim().length >= 10,
        detail:
          this.draft.methodology.trim().length >= 10
            ? 'Methodology captured'
            : 'Add at least 10 characters in methodology',
      },
      {
        label: 'Findings',
        passed: this.draft.findings.trim().length >= 20,
        detail:
          this.draft.findings.trim().length >= 20
            ? 'Findings section ready'
            : 'Add at least 20 characters in findings',
      },
      {
        label: 'Recommendations',
        passed: this.draft.recommendations.trim().length >= 20,
        detail:
          this.draft.recommendations.trim().length >= 20
            ? 'Recommendations section ready'
            : 'Add at least 20 characters in recommendations',
      },
      {
        label: 'Observation Selection',
        passed: this.selectedCount > 0,
        detail: this.selectedCount > 0 ? `${this.selectedCount} observations selected` : 'Select at least one observation',
      },
    ];
  }

  get canFinalize(): boolean {
    return this.canEdit && this.reportGuardrails.every((item) => item.passed);
  }

  get finalizeGuardReason(): string {
    if (!this.draft) return 'Report draft unavailable';
    if (!this.canEdit) return 'Report is already finalized';
    const firstBlocker = this.reportGuardrails.find((item) => !item.passed);
    return firstBlocker ? firstBlocker.detail : '';
  }

  get reportTimeline(): Array<{ label: string; at: string | null; detail: string }> {
    if (!this.draft) return [];
    return [
      {
        label: 'Draft Saved',
        at: this.draft.updatedAt,
        detail: this.draft.updatedAt ? `Last draft update (${this.draft.version})` : 'Draft not saved yet',
      },
      {
        label: 'Finalized',
        at: this.draft.finalizedAt,
        detail: this.draft.finalizedAt ? 'Report locked and published' : 'Not finalized',
      },
    ];
  }

  isSelected(obs: any): boolean {
    if (!this.draft) return false;
    return this.draft.selectedObservationIds.includes(String(obs.id));
  }

  toggleObservation(obs: any): void {
    if (!this.draft || !this.canEdit) return;
    const id = String(obs.id);
    if (this.draft.selectedObservationIds.includes(id)) {
      this.draft.selectedObservationIds = this.draft.selectedObservationIds.filter((x) => x !== id);
    } else {
      this.draft.selectedObservationIds = [...this.draft.selectedObservationIds, id];
    }
  }

  switchVersion(version: AuditorReportVersion): void {
    if (!this.draft || !this.canEdit) return;
    this.draft.version = version;
  }

  importSelectedObservations(): void {
    if (!this.draft || !this.canEdit) return;
    const selected = this.observations.filter((o) =>
      this.draft!.selectedObservationIds.includes(String(o.id)),
    );
    if (!selected.length) {
      this.toast.warning('Select observations to import');
      return;
    }

    const findings = selected
      .map((o, idx) => `${idx + 1}. ${o.observation || '-'} (Risk: ${o.risk || 'LOW'})`)
      .join('\n');
    const recommendations = selected
      .map((o, idx) => `${idx + 1}. ${o.recommendation || 'No recommendation captured'}`)
      .join('\n');

    this.draft.findings = findings;
    this.draft.recommendations = recommendations;
  }

  saveDraft(): void {
    if (!this.draft || this.saving || !this.canEdit) return;
    this.saving = true;
    this.auditsApi
      .auditorSaveReport(this.auditId, {
        version: this.draft.version,
        executiveSummary: this.draft.executiveSummary,
        scope: this.draft.scope,
        methodology: this.draft.methodology,
        findings: this.draft.findings,
        recommendations: this.draft.recommendations,
        selectedObservationIds: this.draft.selectedObservationIds,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (draft) => {
          this.draft = this.normalizeReport(draft, this.observations);
          this.toast.success('Report draft saved');
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to save draft'),
      });
  }

  finalizeDraft(): void {
    if (!this.draft || this.saving || !this.canEdit) return;
    if (!this.canFinalize) {
      this.toast.warning(this.finalizeGuardReason || 'Complete all required sections before finalizing');
      return;
    }
    this.saving = true;
    this.auditsApi
      .auditorFinalizeReport(this.auditId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (draft) => {
          this.draft = this.normalizeReport(draft, this.observations);
          this.toast.success('Report finalized and locked');
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to finalize report'),
      });
  }

  reopenDraft(): void {
    if (!this.canReopen || this.saving) return;
    this.saving = true;
    this.auditsApi
      .auditorReopenReport(this.auditId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (draft) => {
          this.draft = this.normalizeReport(draft, this.observations);
          this.toast.info('Report moved back to draft');
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to reopen report'),
      });
  }

  exportFinalPdf(): void {
    if (!this.auditId || this.exporting || !this.canExportFinal) return;
    this.exporting = true;
    this.auditsApi
      .auditorExportReportPdf(this.auditId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.exporting = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `audit-report-${this.auditId}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: (err) =>
          this.toast.error(err?.error?.message || 'Failed to export final report PDF'),
      });
  }

  formatDate(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private loadBuilder(): void {
    this.loading = true;
    forkJoin({
      audit: this.auditsApi.auditorGetAudit(this.auditId),
      observations: this.observationsApi.list(this.auditId),
      report: this.auditsApi.auditorGetReport(this.auditId),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ audit, observations, report }) => {
          this.audit = audit || null;
          this.observations = Array.isArray(observations) ? observations : [];
          this.draft = this.normalizeReport(report, this.observations);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to load report builder'),
      });
  }

  private normalizeReport(
    report: AuditorReportDraft | null | undefined,
    observations: any[],
  ): AuditorReportDraft {
    const selected = Array.isArray(report?.selectedObservationIds)
      ? report!.selectedObservationIds.map((x) => String(x))
      : [];
    const defaultIds = observations.map((o) => String(o.id));

    return {
      reportId: report?.reportId || null,
      auditId: report?.auditId || this.auditId,
      stage: report?.stage === 'FINAL' ? 'FINAL' : 'DRAFT',
      version: report?.version === 'CLIENT' ? 'CLIENT' : 'INTERNAL',
      executiveSummary: report?.executiveSummary || '',
      scope: report?.scope || '',
      methodology: report?.methodology || '',
      findings: report?.findings || '',
      recommendations: report?.recommendations || '',
      selectedObservationIds: selected.length ? selected : defaultIds,
      updatedAt: report?.updatedAt || null,
      finalizedAt: report?.finalizedAt || null,
    };
  }
}

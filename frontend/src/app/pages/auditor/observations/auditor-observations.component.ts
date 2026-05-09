import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, combineLatest } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { AuditorObservationsService } from '../../../core/auditor-observations.service';
import { AuditsService } from '../../../core/audits.service';
import { ToastService } from '../../../shared/toast/toast.service';

type ObservationAction = 'ACKNOWLEDGE' | 'RESOLVE' | 'VERIFY' | 'REOPEN';

@Component({
  standalone: true,
  selector: 'app-auditor-observations',
  imports: [CommonModule, FormsModule],
  templateUrl: './auditor-observations.component.html',
  styleUrls: ['./auditor-observations.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditorObservationsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  busy = false;

  audits: any[] = [];
  observations: any[] = [];
  categories: any[] = [];
  selected: any | null = null;

  filterAuditId = '';
  filterStatus = '';
  filterRisk = '';
  filterSearch = '';

  verificationNotes = '';
  branchResponseDraft = '';
  capaDraft = '';

  readonly statusOptions = ['', 'OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  readonly riskOptions = ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  constructor(
    private readonly observationsApi: AuditorObservationsService,
    private readonly auditsApi: AuditsService,
    private readonly route: ActivatedRoute,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadCategories();
    this.loadAudits();

    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([_, query]) => {
        this.filterAuditId = query.get('auditId') || '';
        this.loadObservations();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get filteredRows(): any[] {
    const q = this.filterSearch.trim().toLowerCase();
    return this.observations.filter((row) => {
      if (this.filterStatus && this.statusKey(row.status) !== this.filterStatus) return false;
      if (this.filterRisk && this.statusKey(row.risk) !== this.filterRisk) return false;
      if (!q) return true;
      const text = `${row.observation || ''} ${row.clause || ''} ${row.recommendation || ''}`.toLowerCase();
      return text.includes(q);
    });
  }

  get openCount(): number {
    return this.observations.filter((o) => ['OPEN', 'ACKNOWLEDGED'].includes(this.statusKey(o.status))).length;
  }

  get verificationPendingCount(): number {
    return this.observations.filter((o) => this.statusKey(o.status) === 'RESOLVED').length;
  }

  get closedCount(): number {
    return this.observations.filter((o) => this.statusKey(o.status) === 'CLOSED').length;
  }

  get selectedAgeDays(): number {
    if (!this.selected?.createdAt) return 0;
    const created = new Date(this.selected.createdAt);
    if (Number.isNaN(created.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
  }

  get canAcknowledge(): boolean {
    return !this.actionGuardReason('ACKNOWLEDGE');
  }

  get canResolve(): boolean {
    return !this.actionGuardReason('RESOLVE');
  }

  get canVerifyClosure(): boolean {
    return !this.actionGuardReason('VERIFY');
  }

  get canReopen(): boolean {
    return !this.actionGuardReason('REOPEN');
  }

  get actionGuardrails(): Array<{ label: string; passed: boolean; detail: string }> {
    const items: Array<{ label: string; action: ObservationAction }> = [
      { label: 'Acknowledge', action: 'ACKNOWLEDGE' },
      { label: 'Mark Resolved', action: 'RESOLVE' },
      { label: 'Verify & Close', action: 'VERIFY' },
      { label: 'Reopen', action: 'REOPEN' },
    ];

    return items.map((item) => {
      const reason = this.actionGuardReason(item.action);
      return {
        label: item.label,
        passed: !reason,
        detail: reason || 'Ready',
      };
    });
  }

  trackObs(_: number, row: any): string {
    return String(row?.id || '');
  }

  applyFilters(): void {
    this.cdr.markForCheck();
  }

  clearFilters(): void {
    this.filterStatus = '';
    this.filterRisk = '';
    this.filterSearch = '';
  }

  selectObservation(row: any): void {
    this.selected = row;
    this.verificationNotes = '';
    this.branchResponseDraft = row?.elaboration || '';
    this.capaDraft = row?.recommendation || '';
  }

  saveCapaDetails(): void {
    if (!this.selected || this.busy) return;
    this.busy = true;
    this.observationsApi
      .update(this.selected.id, {
        elaboration: this.branchResponseDraft.trim() || null,
        recommendation: this.capaDraft.trim() || null,
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
          this.toast.success('CAPA details saved');
          this.refreshSelected();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to save CAPA details'),
      });
  }

  markAcknowledged(): void {
    const guard = this.actionGuardReason('ACKNOWLEDGE');
    if (guard) {
      this.toast.warning(guard);
      return;
    }
    this.updateStatus('ACKNOWLEDGED');
  }

  markResolved(): void {
    const guard = this.actionGuardReason('RESOLVE');
    if (guard) {
      this.toast.warning(guard);
      return;
    }
    this.updateStatus('RESOLVED');
  }

  verifyClosure(): void {
    if (!this.selected || this.busy) return;
    const guard = this.actionGuardReason('VERIFY');
    if (guard) {
      this.toast.warning(guard);
      return;
    }
    this.busy = true;
    this.observationsApi
      .verifyObservationClosure(this.selected.id, this.verificationNotes || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Observation verified and closed');
          this.refreshSelected();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to verify observation'),
      });
  }

  reopenSelected(): void {
    if (!this.selected || this.busy) return;
    const guard = this.actionGuardReason('REOPEN');
    if (guard) {
      this.toast.warning(guard);
      return;
    }
    this.busy = true;
    this.observationsApi
      .reopenObservation(this.selected.id, this.verificationNotes || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Observation reopened');
          this.refreshSelected();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to reopen observation'),
      });
  }

  exportPdf(): void {
    if (!this.filterAuditId) {
      this.toast.warning('Select an audit to export observations PDF');
      return;
    }
    this.observationsApi
      .exportAuditObservationsPdf(this.filterAuditId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `observations-${this.filterAuditId}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => this.toast.error('Failed to export observations PDF'),
      });
  }

  evidencePaths(row: any): string[] {
    const raw = row?.evidenceFilePaths;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((x) => String(x));
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((x) => String(x));
      } catch {
        return [raw];
      }
    }
    return [];
  }

  evidenceUrl(path: string): string {
    const value = String(path || '');
    if (!value) return '#';
    if (/^https?:\/\//i.test(value)) return value;
    const base = (window as any)?.location?.origin || '';
    const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
    return `${base}/${normalized}`;
  }

  ageClass(row: any): string {
    const age = this.ageDays(row);
    if (age > 30) return 'badge badge--bad';
    if (age > 14) return 'badge badge--warn';
    return 'badge badge--info';
  }

  ageDaysFor(row: any): number {
    return this.ageDays(row);
  }

  statusClass(status: string): string {
    const key = this.statusKey(status);
    if (key === 'CLOSED') return 'badge badge--good';
    if (key === 'RESOLVED') return 'badge badge--info';
    if (key === 'OPEN') return 'badge badge--warn';
    return 'badge badge--muted';
  }

  riskClass(risk: string): string {
    const key = this.statusKey(risk);
    if (key === 'CRITICAL') return 'badge badge--bad';
    if (key === 'HIGH') return 'badge badge--warn';
    if (key === 'MEDIUM') return 'badge badge--info';
    return 'badge badge--muted';
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

  private updateStatus(status: string): void {
    if (!this.selected || this.busy) return;
    this.busy = true;
    this.observationsApi
      .update(this.selected.id, {
        status,
        elaboration: this.verificationNotes.trim() || this.selected.elaboration || null,
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
          this.toast.success(`Status updated to ${status}`);
          this.refreshSelected();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to update status'),
      });
  }

  private refreshSelected(): void {
    const selectedId = this.selected?.id ? String(this.selected.id) : null;
    this.loadObservations(() => {
      if (!selectedId) return;
      const found = this.observations.find((o) => String(o.id) === selectedId);
      if (found) this.selectObservation(found);
    });
  }

  loadObservations(afterLoad?: () => void): void {
    this.loading = true;
    this.observationsApi
      .list(this.filterAuditId || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows: any) => {
          this.observations = Array.isArray(rows) ? rows : [];
          if (!this.selected && this.observations.length) {
            this.selectObservation(this.observations[0]);
          }
          if (afterLoad) afterLoad();
        },
        error: (err) => {
          this.observations = [];
          this.toast.error(err?.error?.message || 'Failed to load observations');
        },
      });
  }

  private loadAudits(): void {
    this.auditsApi
      .auditorListAudits({ pageSize: 100 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.audits = Array.isArray(res) ? res : (res?.data || []);
          this.cdr.markForCheck();
        },
        error: () => {
          this.audits = [];
        },
      });
  }

  private loadCategories(): void {
    this.observationsApi
      .listCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.categories = Array.isArray(res) ? res : [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.categories = [];
        },
      });
  }

  private ageDays(row: any): number {
    const created = row?.createdAt ? new Date(row.createdAt) : null;
    if (!created || Number.isNaN(created.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
  }

  private statusKey(status: string | null | undefined): string {
    return String(status || '').toUpperCase();
  }

  private actionGuardReason(action: ObservationAction): string | null {
    if (!this.selected) return 'Select an observation first.';

    const status = this.statusKey(this.selected.status) || 'OPEN';

    if (action === 'ACKNOWLEDGE') {
      if (status !== 'OPEN') return `Only OPEN observations can be acknowledged (current: ${status}).`;
      return null;
    }

    if (action === 'RESOLVE') {
      if (!['OPEN', 'ACKNOWLEDGED'].includes(status)) {
        return `Only OPEN/ACKNOWLEDGED observations can be resolved (current: ${status}).`;
      }
      return null;
    }

    if (action === 'VERIFY') {
      if (status !== 'RESOLVED') return `Only RESOLVED observations can be verified (current: ${status}).`;
      if (this.verificationNotes.trim().length < 5) {
        return 'Add at least 5 characters in verification notes before closure.';
      }
      return null;
    }

    if (!['RESOLVED', 'CLOSED'].includes(status)) {
      return `Only RESOLVED/CLOSED observations can be reopened (current: ${status}).`;
    }
    if (this.verificationNotes.trim().length < 5) {
      return 'Add at least 5 characters in verification notes before reopening.';
    }
    return null;
  }
}

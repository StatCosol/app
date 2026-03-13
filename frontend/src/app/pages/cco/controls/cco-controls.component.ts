import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { CcoControlsService } from '../../../core/cco-controls.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  CcoControlsPayload,
  EscalationThreshold,
  ReminderRule,
  SlaRule,
} from '../../../shared/models/cco-controls.model';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

type ControlType = 'SLA' | 'THRESHOLD' | 'REMINDER';
type Effectiveness = 'NOT_REVIEWED' | 'EFFECTIVE' | 'NEEDS_IMPROVEMENT' | 'NOT_EFFECTIVE';

interface ReviewEvent {
  at: string;
  by: string;
  action: string;
  note: string;
}

interface ControlMeta {
  owner: string;
  evidence: string;
  evidenceLink: string;
  designEffectiveness: Effectiveness;
  operatingEffectiveness: Effectiveness;
  reviewHistory: ReviewEvent[];
}

interface ControlRegisterRow {
  key: string;
  id: string;
  type: ControlType;
  name: string;
  scope: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  isActive: boolean;
  updatedAt: string;
}

@Component({
  selector: 'app-cco-controls',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ActionButtonComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './cco-controls.component.html',
})
export class CcoControlsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly storageKey = 'cco-controls-register-meta-v1';

  loading = false;
  savingBase = false;
  savingMeta = false;
  error: string | null = null;

  // source data
  slaRules: SlaRule[] = [];
  thresholds: EscalationThreshold[] = [];
  reminders: ReminderRule[] = [];

  // register view data
  controls: ControlRegisterRow[] = [];
  filteredControls: ControlRegisterRow[] = [];
  selected: ControlRegisterRow | null = null;

  // filters
  search = '';
  typeFilter: 'ALL' | ControlType = 'ALL';
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL';
  severityFilter: 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'ALL';

  // base editor forms
  slaForm: SlaRule = this.defaultSla();
  thresholdForm: EscalationThreshold = this.defaultThreshold();
  reminderForm: ReminderRule = this.defaultReminder();

  // metadata editor
  meta: ControlMeta = this.defaultMeta();
  reviewNote = '';

  // quick KPI
  kpiTotal = 0;
  kpiActive = 0;
  kpiHighRisk = 0;
  kpiNeedsReview = 0;
  kpiCriticalAttention = 0;

  private metaStore: Record<string, ControlMeta> = {};

  constructor(
    private readonly api: CcoControlsService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.metaStore = this.readMetaStore();
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error = null;

    this.api
      .getAll()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (data: CcoControlsPayload) => {
          this.slaRules = data.slaRules || [];
          this.thresholds = data.thresholds || [];
          this.reminders = data.reminders || [];

          this.rebuildRegister();
          this.applyFilters();

          if (!this.selected && this.filteredControls.length) {
            this.selectControl(this.filteredControls[0]);
          } else if (this.selected) {
            const ref = this.controls.find((row) => row.key === this.selected!.key);
            if (ref) this.selectControl(ref);
          }
        },
        error: () => {
          this.error = 'Failed to load controls register.';
          this.slaRules = [];
          this.thresholds = [];
          this.reminders = [];
          this.controls = [];
          this.filteredControls = [];
          this.selected = null;
        },
      });
  }

  addControl(type: ControlType): void {
    if (type === 'SLA') {
      this.slaForm = this.defaultSla();
      const pseudo: ControlRegisterRow = {
        key: 'SLA:NEW',
        id: '',
        type: 'SLA',
        name: 'New SLA Rule',
        scope: 'Global',
        severity: 'MEDIUM',
        isActive: true,
        updatedAt: new Date().toISOString(),
      };
      this.selected = pseudo;
      this.meta = this.defaultMeta();
      return;
    }
    if (type === 'THRESHOLD') {
      this.thresholdForm = this.defaultThreshold();
      const pseudo: ControlRegisterRow = {
        key: 'THRESHOLD:NEW',
        id: '',
        type: 'THRESHOLD',
        name: 'New Threshold Rule',
        scope: 'Global',
        severity: 'MEDIUM',
        isActive: true,
        updatedAt: new Date().toISOString(),
      };
      this.selected = pseudo;
      this.meta = this.defaultMeta();
      return;
    }
    this.reminderForm = this.defaultReminder();
    const pseudo: ControlRegisterRow = {
      key: 'REMINDER:NEW',
      id: '',
      type: 'REMINDER',
      name: 'New Reminder Rule',
      scope: 'Global',
      severity: 'LOW',
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
    this.selected = pseudo;
    this.meta = this.defaultMeta();
  }

  applyFilters(): void {
    const q = this.search.trim().toLowerCase();
    this.filteredControls = this.controls.filter((row) => {
      if (this.typeFilter !== 'ALL' && row.type !== this.typeFilter) return false;
      if (this.statusFilter === 'ACTIVE' && !row.isActive) return false;
      if (this.statusFilter === 'INACTIVE' && row.isActive) return false;
      if (this.severityFilter !== 'ALL' && row.severity !== this.severityFilter) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.scope.toLowerCase().includes(q) ||
        row.type.toLowerCase().includes(q)
      );
    });
    this.computeKpis();

    if (this.selected && !this.filteredControls.some((row) => row.key === this.selected!.key)) {
      this.selected = null;
    }
  }

  selectControl(row: ControlRegisterRow): void {
    this.selected = row;
    this.meta = this.cloneMeta(this.metaStore[row.key] || this.defaultMeta());
    this.reviewNote = '';
    this.loadBaseForm(row);
  }

  saveBaseRule(): void {
    if (!this.selected || this.savingBase) return;
    const baseIssues = this.baseValidationIssues;
    if (baseIssues.length) {
      this.toast.warning('Validation required', baseIssues[0]);
      return;
    }
    const type = this.selected.type;
    this.savingBase = true;

    if (type === 'SLA') {
      const payload: SlaRule = {
        ...this.slaForm,
        id: this.selected.id || undefined,
        isActive: this.selected.isActive,
      };
      this.api
        .saveSla(payload)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => (this.savingBase = false)),
        )
        .subscribe({
          next: () => {
            this.toast.success('SLA control saved.');
            this.load();
          },
          error: () => this.toast.error('Failed to save SLA control.'),
        });
      return;
    }

    if (type === 'THRESHOLD') {
      const payload: EscalationThreshold = {
        ...this.thresholdForm,
        id: this.selected.id || undefined,
        isActive: this.selected.isActive,
      };
      this.api
        .saveThreshold(payload)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => (this.savingBase = false)),
        )
        .subscribe({
          next: () => {
            this.toast.success('Threshold control saved.');
            this.load();
          },
          error: () => this.toast.error('Failed to save threshold control.'),
        });
      return;
    }

    const payload: ReminderRule = {
      ...this.reminderForm,
      id: this.selected.id || undefined,
      isActive: this.selected.isActive,
    };
    this.api
      .saveReminder(payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.savingBase = false)),
      )
      .subscribe({
        next: () => {
          this.toast.success('Reminder control saved.');
          this.load();
        },
        error: () => this.toast.error('Failed to save reminder control.'),
      });
  }

  toggleSelectedStatus(): void {
    if (!this.selected) return;
    const next = !this.selected.isActive;
    const type = this.selected.type;
    const id = this.selected.id;
    if (!id) {
      this.selected.isActive = next;
      return;
    }

    if (type === 'SLA') {
      this.api
        .toggleSla(id, next)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.selected!.isActive = next;
            this.toast.success(`Control marked ${next ? 'active' : 'inactive'}.`);
            this.rebuildRegister();
            this.applyFilters();
          },
          error: () => this.toast.error('Failed to update control status.'),
        });
      return;
    }

    if (type === 'THRESHOLD') {
      this.api
        .toggleThreshold(id, next)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.selected!.isActive = next;
            this.toast.success(`Control marked ${next ? 'active' : 'inactive'}.`);
            this.rebuildRegister();
            this.applyFilters();
          },
          error: () => this.toast.error('Failed to update control status.'),
        });
      return;
    }

    this.api
      .toggleReminder(id, next)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.selected!.isActive = next;
          this.toast.success(`Control marked ${next ? 'active' : 'inactive'}.`);
          this.rebuildRegister();
          this.applyFilters();
        },
        error: () => this.toast.error('Failed to update control status.'),
      });
  }

  saveMeta(): void {
    if (!this.selected || this.savingMeta) return;
    const metaIssues = this.metaValidationIssues;
    if (metaIssues.length) {
      this.toast.warning('Metadata validation required', metaIssues[0]);
      return;
    }
    this.savingMeta = true;

    const note = this.reviewNote.trim() || 'Control metadata updated';
    const nextMeta = this.cloneMeta(this.meta);
    nextMeta.reviewHistory = [
      {
        at: new Date().toISOString(),
        by: 'CCO',
        action: 'UPDATED',
        note,
      },
      ...(nextMeta.reviewHistory || []),
    ].slice(0, 25);

    this.metaStore[this.selected.key] = nextMeta;
    this.writeMetaStore(this.metaStore);
    this.meta = this.cloneMeta(nextMeta);
    this.reviewNote = '';
    this.savingMeta = false;
    this.computeKpis();
    this.toast.success('Control register metadata saved.');
  }

  get selectedHistory(): ReviewEvent[] {
    if (!this.selected) return [];
    const events: ReviewEvent[] = [];

    const sourceRule = this.getSourceRule(this.selected);
    if (sourceRule?.createdAt) {
      events.push({
        at: sourceRule.createdAt,
        by: 'SYSTEM',
        action: 'CREATED',
        note: 'Control rule created',
      });
    }
    if (sourceRule?.updatedAt && sourceRule.updatedAt !== sourceRule.createdAt) {
      events.push({
        at: sourceRule.updatedAt,
        by: 'SYSTEM',
        action: 'RULE_UPDATED',
        note: 'Control rule updated',
      });
    }

    const metaEvents = this.meta.reviewHistory || [];
    events.push(...metaEvents);

    return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }

  get baseValidationIssues(): string[] {
    if (!this.selected) return [];
    return this.getBaseValidationIssues(this.selected.type);
  }

  get metaValidationIssues(): string[] {
    return this.getMetaValidationIssues();
  }

  get guardrailIssues(): string[] {
    return [...this.baseValidationIssues, ...this.metaValidationIssues];
  }

  severityClass(severity: string): string {
    if (severity === 'CRITICAL') return 'bg-red-100 text-red-700';
    if (severity === 'HIGH') return 'bg-orange-100 text-orange-700';
    if (severity === 'MEDIUM') return 'bg-amber-100 text-amber-700';
    return 'bg-green-100 text-green-700';
  }

  effectClass(effect: Effectiveness): string {
    if (effect === 'EFFECTIVE') return 'bg-emerald-100 text-emerald-700';
    if (effect === 'NEEDS_IMPROVEMENT') return 'bg-amber-100 text-amber-700';
    if (effect === 'NOT_EFFECTIVE') return 'bg-red-100 text-red-700';
    return 'bg-slate-100 text-slate-700';
  }

  trackByKey(_: number, row: ControlRegisterRow): string {
    return row.key;
  }

  onReminderRolesChange(value: string): void {
    this.reminderForm.notifyRoles = String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => !!item);
  }

  // --------------------
  // internal helpers
  // --------------------

  private rebuildRegister(): void {
    const slaRows = this.slaRules.map((rule) => this.toRegisterRowFromSla(rule));
    const thresholdRows = this.thresholds.map((rule) => this.toRegisterRowFromThreshold(rule));
    const reminderRows = this.reminders.map((rule) => this.toRegisterRowFromReminder(rule));
    this.controls = [...slaRows, ...thresholdRows, ...reminderRows].sort(
      (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
    );
  }

  private loadBaseForm(row: ControlRegisterRow): void {
    if (row.type === 'SLA') {
      const source = this.slaRules.find((item) => item.id === row.id);
      this.slaForm = source ? { ...source } : this.defaultSla();
      return;
    }
    if (row.type === 'THRESHOLD') {
      const source = this.thresholds.find((item) => item.id === row.id);
      this.thresholdForm = source ? { ...source } : this.defaultThreshold();
      return;
    }
    const source = this.reminders.find((item) => item.id === row.id);
    this.reminderForm = source ? { ...source } : this.defaultReminder();
  }

  private computeKpis(): void {
    this.kpiTotal = this.controls.length;
    this.kpiActive = this.controls.filter((row) => row.isActive).length;
    this.kpiHighRisk = this.controls.filter(
      (row) => row.severity === 'HIGH' || row.severity === 'CRITICAL',
    ).length;
    this.kpiNeedsReview = this.controls.filter((row) => {
      const meta = this.metaStore[row.key];
      if (!meta) return true;
      return (
        meta.designEffectiveness === 'NOT_REVIEWED' ||
        meta.operatingEffectiveness === 'NOT_REVIEWED'
      );
    }).length;
    this.kpiCriticalAttention = this.controls.filter((row) => {
      if (row.severity !== 'HIGH' && row.severity !== 'CRITICAL') return false;
      const meta = this.metaStore[row.key];
      if (!meta) return true;
      const noOwner = !String(meta.owner || '').trim();
      const noEvidence = !String(meta.evidence || '').trim();
      const ineffective =
        meta.designEffectiveness === 'NOT_EFFECTIVE' ||
        meta.operatingEffectiveness === 'NOT_EFFECTIVE';
      return noOwner || noEvidence || ineffective;
    }).length;
  }

  private toRegisterRowFromSla(rule: SlaRule): ControlRegisterRow {
    const scope = (rule.scope || '').trim() || 'Global';
    const severity = this.priorityToSeverity(rule.priority);
    const id = String(rule.id || '');
    return {
      key: `SLA:${id}`,
      id,
      type: 'SLA',
      name: `SLA Control - ${scope}`,
      scope,
      severity,
      isActive: !!rule.isActive,
      updatedAt: String(rule.updatedAt || rule.createdAt || new Date().toISOString()),
    };
  }

  private toRegisterRowFromThreshold(rule: EscalationThreshold): ControlRegisterRow {
    const typeLabel = String(rule.type || '')
      .toUpperCase()
      .replace(/_/g, ' ')
      .trim();
    const id = String(rule.id || '');
    return {
      key: `THRESHOLD:${id}`,
      id,
      type: 'THRESHOLD',
      name: `Threshold Control - ${typeLabel || 'Rule'}`,
      scope: 'Global',
      severity: this.normalizeSeverity(rule.severity),
      isActive: !!rule.isActive,
      updatedAt: String(rule.updatedAt || rule.createdAt || new Date().toISOString()),
    };
  }

  private toRegisterRowFromReminder(rule: ReminderRule): ControlRegisterRow {
    const scope = (rule.scope || '').trim() || 'Global';
    const id = String(rule.id || '');
    return {
      key: `REMINDER:${id}`,
      id,
      type: 'REMINDER',
      name: `Reminder Control - ${scope}`,
      scope,
      severity: 'LOW',
      isActive: !!rule.isActive,
      updatedAt: String(rule.updatedAt || rule.createdAt || new Date().toISOString()),
    };
  }

  private getSourceRule(
    row: ControlRegisterRow,
  ): (SlaRule | EscalationThreshold | ReminderRule) | null {
    if (row.type === 'SLA') return this.slaRules.find((r) => r.id === row.id) || null;
    if (row.type === 'THRESHOLD') return this.thresholds.find((r) => r.id === row.id) || null;
    return this.reminders.find((r) => r.id === row.id) || null;
  }

  private priorityToSeverity(priority: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const value = String(priority || '').toUpperCase();
    if (value === 'HIGH') return 'HIGH';
    if (value === 'LOW') return 'LOW';
    if (value === 'CRITICAL') return 'CRITICAL';
    return 'MEDIUM';
  }

  private normalizeSeverity(value: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const s = String(value || '').toUpperCase();
    if (s === 'LOW' || s === 'MEDIUM' || s === 'HIGH' || s === 'CRITICAL') return s;
    return 'MEDIUM';
  }

  private defaultSla(): SlaRule {
    return {
      scope: '',
      priority: 'NORMAL',
      targetHours: 48,
      escalationLevel1Hours: 24,
      escalationLevel2Hours: 48,
      isActive: true,
    };
  }

  private defaultThreshold(): EscalationThreshold {
    return {
      type: 'OVERDUE_COUNT',
      value: 5,
      windowDays: 30,
      severity: 'MEDIUM',
      isActive: true,
    };
  }

  private defaultReminder(): ReminderRule {
    return {
      scope: '',
      daysBeforeDue: 7,
      notifyRoles: ['CRM'],
      isActive: true,
    };
  }

  private defaultMeta(): ControlMeta {
    return {
      owner: 'CCO Office',
      evidence: '',
      evidenceLink: '',
      designEffectiveness: 'NOT_REVIEWED',
      operatingEffectiveness: 'NOT_REVIEWED',
      reviewHistory: [],
    };
  }

  private cloneMeta(meta: ControlMeta): ControlMeta {
    return {
      owner: meta.owner || 'CCO Office',
      evidence: meta.evidence || '',
      evidenceLink: meta.evidenceLink || '',
      designEffectiveness: meta.designEffectiveness || 'NOT_REVIEWED',
      operatingEffectiveness: meta.operatingEffectiveness || 'NOT_REVIEWED',
      reviewHistory: Array.isArray(meta.reviewHistory) ? [...meta.reviewHistory] : [],
    };
  }

  private getBaseValidationIssues(type: ControlType): string[] {
    const issues: string[] = [];
    if (type === 'SLA') {
      const target = Number(this.slaForm.targetHours || 0);
      const l1 = Number(this.slaForm.escalationLevel1Hours || 0);
      const l2 = Number(this.slaForm.escalationLevel2Hours || 0);
      if (!Number.isFinite(target) || target <= 0) {
        issues.push('SLA target hours must be greater than zero.');
      }
      if (!Number.isFinite(l1) || l1 <= 0) {
        issues.push('Escalation level 1 hours must be greater than zero.');
      }
      if (!Number.isFinite(l2) || l2 <= 0) {
        issues.push('Escalation level 2 hours must be greater than zero.');
      }
      if (Number.isFinite(l1) && Number.isFinite(l2) && l2 <= l1) {
        issues.push('Escalation level 2 must be greater than level 1.');
      }
      return issues;
    }

    if (type === 'THRESHOLD') {
      const value = Number(this.thresholdForm.value || 0);
      const windowDays = Number(this.thresholdForm.windowDays || 0);
      if (!Number.isFinite(value) || value <= 0) {
        issues.push('Threshold value must be greater than zero.');
      }
      if (!Number.isFinite(windowDays) || windowDays <= 0) {
        issues.push('Threshold window days must be greater than zero.');
      }
      return issues;
    }

    const daysBeforeDue = Number(this.reminderForm.daysBeforeDue);
    if (!Number.isFinite(daysBeforeDue) || daysBeforeDue < 0) {
      issues.push('Reminder days before due must be zero or greater.');
    }
    if (!(this.reminderForm.notifyRoles || []).length) {
      issues.push('Reminder roles are required.');
    }
    return issues;
  }

  private getMetaValidationIssues(): string[] {
    if (!this.selected) return [];
    const issues: string[] = [];
    const owner = String(this.meta.owner || '').trim();
    const evidence = String(this.meta.evidence || '').trim();
    const evidenceLink = String(this.meta.evidenceLink || '').trim();
    const note = String(this.reviewNote || '').trim();

    if (!owner) {
      issues.push('Control owner is required.');
    }

    if (this.selected.isActive && (this.selected.severity === 'HIGH' || this.selected.severity === 'CRITICAL') && !evidence) {
      issues.push('Evidence is required for active high/critical controls.');
    }

    if (evidenceLink && !this.isValidHttpUrl(evidenceLink)) {
      issues.push('Evidence link must start with http:// or https://');
    }

    if (
      (this.meta.designEffectiveness === 'NOT_EFFECTIVE' ||
        this.meta.operatingEffectiveness === 'NOT_EFFECTIVE') &&
      note.length < 8
    ) {
      issues.push('Add a review note (at least 8 characters) when effectiveness is not effective.');
    }
    return issues;
  }

  private isValidHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(String(value || '').trim());
  }

  private readMetaStore(): Record<string, ControlMeta> {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed;
    } catch {
      return {};
    }
  }

  private writeMetaStore(value: Record<string, ControlMeta>): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(value));
    } catch {
      // best effort only
    }
  }
}

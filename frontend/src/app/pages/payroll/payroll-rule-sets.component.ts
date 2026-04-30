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

import {
  PayrollEngineApiService,
  RuleParameter,
  RuleSet,
} from './payroll-engine-api.service';
import { PayrollApiService, PayrollClient } from './payroll-api.service';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from '../../shared/toast/toast.service';
import { ClientContextStripComponent } from '../../shared/ui/client-context-strip/client-context-strip.component';

interface RuleSetFormModel {
  name: string;
  branchId: string;
  effectiveFrom: string;
  effectiveTo: string;
}

interface ParameterFormModel {
  key: string;
  valueNum: number | null;
  valueText: string;
  unit: string;
  notes: string;
}

interface ComparisonRow {
  key: string;
  baseNum: number | null;
  baseText: string | null;
  baseUnit: string | null;
  targetNum: number | null;
  targetText: string | null;
  targetUnit: string | null;
  state: 'UNCHANGED' | 'UPDATED' | 'ADDED' | 'REMOVED';
}

type CompareStateFilter = 'ALL' | 'UPDATED' | 'ADDED' | 'REMOVED' | 'UNCHANGED';

interface GuardrailCheck {
  label: string;
  passed: boolean;
  detail: string;
}

@Component({
  selector: 'app-payroll-rule-sets',
  standalone: true,
  imports: [CommonModule, FormsModule, ClientContextStripComponent],
  templateUrl: './payroll-rule-sets.component.html',
  styleUrls: ['./payroll-rule-sets.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollRuleSetsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  loadingParams = false;
  saving = false;

  clients: PayrollClient[] = [];
  selectedClientId = '';

  ruleSets: RuleSet[] = [];
  selectedRuleSet: RuleSet | null = null;
  params: RuleParameter[] = [];

  searchTerm = '';
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ACTIVE';

  showRuleSetModal = false;
  editingRuleSet: RuleSet | null = null;
  ruleSetForm: RuleSetFormModel = this.defaultRuleSetForm();

  showParamModal = false;
  editingParam: RuleParameter | null = null;
  paramForm: ParameterFormModel = this.defaultParamForm();

  showCompareModal = false;
  compareTargetId = '';
  compareLoading = false;
  compareStateFilter: CompareStateFilter = 'ALL';
  compareRows: ComparisonRow[] = [];

  readonly quickParamKeys = [
    'PF_EMP_RATE',
    'PF_ER_RATE',
    'ESI_EMP_RATE',
    'ESI_ER_RATE',
    'PT_MIN_WAGE_CUTOFF',
    'BONUS_ELIGIBILITY_CEILING',
    'GRATUITY_RATE',
  ];

  constructor(
    private readonly engineApi: PayrollEngineApiService,
    private readonly payrollApi: PayrollApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const routeClientId = this.route.snapshot.paramMap.get('clientId') || '';
    if (routeClientId) {
      this.selectedClientId = routeClientId;
      this.onClientChange();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get activeCount(): number {
    return this.ruleSets.filter((r) => r.isActive).length;
  }

  get versionCount(): number {
    return this.versionHistory.length;
  }

  get parameterCount(): number {
    return this.params.length;
  }

  get filteredRuleSets(): RuleSet[] {
    const q = this.searchTerm.trim().toLowerCase();
    return this.ruleSets.filter((r) => {
      if (this.statusFilter === 'ACTIVE' && !r.isActive) return false;
      if (this.statusFilter === 'INACTIVE' && r.isActive) return false;
      if (!q) return true;
      const text = `${r.name} ${r.branchId || ''} ${this.formatDate(r.effectiveFrom)}`.toLowerCase();
      return text.includes(q);
    });
  }

  get versionHistory(): RuleSet[] {
    if (!this.selectedRuleSet) return [];
    const selected = this.selectedRuleSet;
    return this.ruleSets
      .filter(
        (r) =>
          r.name.trim().toLowerCase() === selected.name.trim().toLowerCase() &&
          (r.branchId || '') === (selected.branchId || ''),
      )
      .sort((a, b) => this.timeValue(b.effectiveFrom) - this.timeValue(a.effectiveFrom));
  }

  get compareCandidates(): RuleSet[] {
    if (!this.selectedRuleSet) return [];
    return this.versionHistory.filter((r) => r.id !== this.selectedRuleSet?.id);
  }

  get comparisonSummary(): { updated: number; added: number; removed: number } {
    return {
      updated: this.compareRows.filter((r) => r.state === 'UPDATED').length,
      added: this.compareRows.filter((r) => r.state === 'ADDED').length,
      removed: this.compareRows.filter((r) => r.state === 'REMOVED').length,
    };
  }

  get filteredCompareRows(): ComparisonRow[] {
    if (this.compareStateFilter === 'ALL') return this.compareRows;
    return this.compareRows.filter((row) => row.state === this.compareStateFilter);
  }

  get unchangedCompareCount(): number {
    return this.compareRows.filter((r) => r.state === 'UNCHANGED').length;
  }

  get selectedGuardrailChecks(): GuardrailCheck[] {
    if (!this.selectedRuleSet) return [];

    const selected = this.selectedRuleSet;
    const future = this.isFutureVersion(selected);
    const expired = this.isExpiredVersion(selected);
    const hasParams = this.params.length > 0;
    const hasAltVersion = this.versionHistory.length > 1;
    const branchScope = selected.branchId ? `Branch ${selected.branchId}` : 'Global';

    return [
      {
        label: 'Activation Window',
        passed: !future && !expired,
        detail: future
          ? `Effective from ${this.formatDate(selected.effectiveFrom)} (future)`
          : expired
            ? `Version expired on ${this.formatDate(selected.effectiveTo)}`
            : 'Within current date window',
      },
      {
        label: 'Parameter Readiness',
        passed: hasParams,
        detail: hasParams ? `${this.params.length} parameters configured` : 'No parameters configured',
      },
      {
        label: 'Scope Mapping',
        passed: true,
        detail: branchScope,
      },
      {
        label: 'Version Compare Ready',
        passed: hasAltVersion,
        detail: hasAltVersion ? `${this.versionHistory.length - 1} alternate versions available` : 'No alternate versions available',
      },
    ];
  }

  trackRuleSet(_: number, row: RuleSet): string {
    return row.id;
  }

  trackParam(_: number, row: RuleParameter): string {
    return row.id;
  }

  trackVersion(_: number, row: RuleSet): string {
    return row.id;
  }

  trackCompare(_: number, row: ComparisonRow): string {
    return row.key;
  }

  loadClients(): void {
    this.loading = true;
    this.payrollApi
      .getAssignedClients()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.clients = rows || [];
          if (this.clients.length && !this.selectedClientId) {
            this.selectedClientId = this.clients[0].id;
            this.onClientChange();
          }
        },
        error: () => this.toast.error('Failed to load payroll clients'),
      });
  }

  onClientChange(): void {
    this.ruleSets = [];
    this.selectedRuleSet = null;
    this.params = [];
    this.searchTerm = '';
    this.statusFilter = 'ACTIVE';

    if (!this.selectedClientId) {
      this.cdr.markForCheck();
      return;
    }

    this.reloadRuleSets();
  }

  selectRuleSet(ruleSet: RuleSet): void {
    this.selectedRuleSet = ruleSet;
    this.compareStateFilter = 'ALL';
    this.loadParameters(ruleSet.id);
  }

  openCreateRuleSet(): void {
    this.editingRuleSet = null;
    this.ruleSetForm = this.defaultRuleSetForm();
    this.showRuleSetModal = true;
  }

  openEditRuleSet(ruleSet: RuleSet): void {
    this.editingRuleSet = ruleSet;
    this.ruleSetForm = {
      name: ruleSet.name,
      branchId: ruleSet.branchId || '',
      effectiveFrom: ruleSet.effectiveFrom?.slice(0, 10) || '',
      effectiveTo: ruleSet.effectiveTo?.slice(0, 10) || '',
    };
    this.showRuleSetModal = true;
  }

  saveRuleSet(): void {
    if (!this.selectedClientId) {
      this.toast.error('Select a client first');
      return;
    }
    if (!this.ruleSetForm.name.trim() || !this.ruleSetForm.effectiveFrom) {
      this.toast.error('Rule set name and effective from are required');
      return;
    }
    if (
      this.ruleSetForm.effectiveTo &&
      this.timeValue(this.ruleSetForm.effectiveTo) < this.timeValue(this.ruleSetForm.effectiveFrom)
    ) {
      this.toast.error('Effective To cannot be before Effective From');
      return;
    }

    this.saving = true;
    const payload: Partial<RuleSet> = {
      clientId: this.selectedClientId,
      name: this.ruleSetForm.name.trim(),
      branchId: this.ruleSetForm.branchId.trim() || null,
      effectiveFrom: this.ruleSetForm.effectiveFrom,
      effectiveTo: this.ruleSetForm.effectiveTo || null,
    };

    const req$ = this.editingRuleSet
      ? this.engineApi.updateRuleSet(this.editingRuleSet.id, payload)
      : this.engineApi.createRuleSet(payload);

    req$
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (saved) => {
          this.showRuleSetModal = false;
          this.toast.success(this.editingRuleSet ? 'Rule set updated' : 'Rule set created');
          this.reloadRuleSets(String(saved?.id || this.editingRuleSet?.id || ''));
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to save rule set'),
      });
  }

  deleteRuleSet(ruleSet: RuleSet): void {
    const ok = window.confirm(
      `Delete "${ruleSet.name}"? This disables the version and keeps audit history.`,
    );
    if (!ok) return;
    this.engineApi
      .deleteRuleSet(ruleSet.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Rule set deleted');
          this.reloadRuleSets();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to delete rule set'),
      });
  }

  activateVersion(ruleSet: RuleSet): void {
    if (!this.selectedClientId) return;
    const guardReason = this.ruleSetActivationReason(
      ruleSet,
      this.selectedRuleSet?.id === ruleSet.id,
    );
    if (guardReason) {
      this.toast.error(guardReason);
      return;
    }

    const siblings = this.ruleSets.filter(
      (r) =>
        r.name.trim().toLowerCase() === ruleSet.name.trim().toLowerCase() &&
        (r.branchId || '') === (ruleSet.branchId || ''),
    );

    const updates = siblings
      .filter((r) => r.id !== ruleSet.id && r.isActive)
      .map((r) => this.engineApi.updateRuleSet(r.id, { isActive: false }));

    if (!ruleSet.isActive) {
      updates.push(this.engineApi.updateRuleSet(ruleSet.id, { isActive: true }));
    }

    if (!updates.length) {
      this.toast.success('Selected version is already active');
      return;
    }

    const deactivateCount = updates.length - 1;
    const confirmText =
      deactivateCount > 0
        ? `Activate "${ruleSet.name}" and deactivate ${deactivateCount} active sibling version(s)?`
        : `Activate "${ruleSet.name}" as the current version?`;

    const ok = window.confirm(confirmText);
    if (!ok) return;
    this.saving = true;
    forkJoin(updates)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Rule set version activated');
          this.reloadRuleSets(ruleSet.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to activate version'),
      });
  }

  loadParameters(ruleSetId: string): void {
    this.loadingParams = true;
    this.engineApi
      .listParameters(ruleSetId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingParams = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.params = (rows || []).sort((a, b) => a.key.localeCompare(b.key));
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to load rule set parameters'),
      });
  }

  openCreateParam(): void {
    if (!this.selectedRuleSet) {
      this.toast.error('Select a rule set first');
      return;
    }
    this.editingParam = null;
    this.paramForm = this.defaultParamForm();
    this.showParamModal = true;
  }

  openEditParam(param: RuleParameter): void {
    this.editingParam = param;
    this.paramForm = {
      key: param.key,
      valueNum: param.valueNum,
      valueText: param.valueText || '',
      unit: param.unit || '',
      notes: param.notes || '',
    };
    this.showParamModal = true;
  }

  applyQuickParam(key: string): void {
    this.paramForm.key = key;
  }

  saveParam(): void {
    if (!this.selectedRuleSet) return;
    if (!this.paramForm.key.trim()) {
      this.toast.error('Parameter key is required');
      return;
    }

    this.saving = true;
    const payload: Partial<RuleParameter> = {
      key: this.paramForm.key.trim().toUpperCase(),
      valueNum: this.paramForm.valueNum,
      valueText: this.paramForm.valueText.trim() || null,
      unit: this.paramForm.unit.trim() || null,
      notes: this.paramForm.notes.trim() || null,
    };

    const req$ = this.editingParam
      ? this.engineApi.updateParameter(this.selectedRuleSet.id, this.editingParam.id, payload)
      : this.engineApi.createParameter(this.selectedRuleSet.id, payload);

    req$
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.showParamModal = false;
          this.toast.success(this.editingParam ? 'Parameter updated' : 'Parameter added');
          this.loadParameters(this.selectedRuleSet!.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to save parameter'),
      });
  }

  deleteParam(param: RuleParameter): void {
    if (!this.selectedRuleSet) return;
    const ok = window.confirm(`Delete parameter "${param.key}"?`);
    if (!ok) return;
    this.engineApi
      .deleteParameter(this.selectedRuleSet!.id, param.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Parameter deleted');
          this.loadParameters(this.selectedRuleSet!.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to delete parameter'),
      });
  }

  openCompareModal(): void {
    if (!this.selectedRuleSet) {
      this.toast.error('Select a base rule set first');
      return;
    }
    const firstCandidate = this.compareCandidates[0] || null;
    if (!firstCandidate) {
      this.toast.error('No alternate version available for comparison');
      return;
    }

    this.compareTargetId = firstCandidate.id;
    this.compareStateFilter = 'ALL';
    this.compareRows = [];
    this.showCompareModal = true;
    this.runComparison();
  }

  runComparison(): void {
    if (!this.selectedRuleSet || !this.compareTargetId) return;

    this.compareLoading = true;
    forkJoin({
      base: this.engineApi
        .listParameters(this.selectedRuleSet.id)
        .pipe(catchError(() => of([] as RuleParameter[]))),
      target: this.engineApi
        .listParameters(this.compareTargetId)
        .pipe(catchError(() => of([] as RuleParameter[]))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.compareLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ base, target }) => {
          this.compareRows = this.buildComparisonRows(base || [], target || []);
        },
        error: () => this.toast.error('Failed to compare rule set versions'),
      });
  }

  comparisonClass(state: ComparisonRow['state']): string {
    if (state === 'ADDED') return 'badge badge--good';
    if (state === 'REMOVED') return 'badge badge--bad';
    if (state === 'UPDATED') return 'badge badge--warn';
    return 'badge badge--muted';
  }

  ruleSetStatusClass(active: boolean): string {
    return active ? 'badge badge--good' : 'badge badge--muted';
  }

  canActivateRuleSet(ruleSet: RuleSet, includeParamCheck = false): boolean {
    return !this.ruleSetActivationReason(ruleSet, includeParamCheck);
  }

  ruleSetActivationReason(ruleSet: RuleSet, includeParamCheck = false): string | null {
    if (ruleSet.isActive) return 'Version is already active.';
    if (this.isFutureVersion(ruleSet)) {
      return `Cannot activate before effective date ${this.formatDate(ruleSet.effectiveFrom)}.`;
    }
    if (this.isExpiredVersion(ruleSet)) {
      return `Cannot activate expired version (ended ${this.formatDate(ruleSet.effectiveTo)}).`;
    }
    if (
      includeParamCheck &&
      this.selectedRuleSet?.id === ruleSet.id &&
      this.params.length === 0
    ) {
      return 'Add at least one parameter before activation.';
    }
    return null;
  }

  versionWindowClass(ruleSet: RuleSet): string {
    if (this.isFutureVersion(ruleSet)) return 'badge badge--info';
    if (this.isExpiredVersion(ruleSet)) return 'badge badge--bad';
    return 'badge badge--good';
  }

  versionWindowLabel(ruleSet: RuleSet): string {
    if (this.isFutureVersion(ruleSet)) return 'Future';
    if (this.isExpiredVersion(ruleSet)) return 'Expired';
    return 'Current Window';
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

  private reloadRuleSets(preferredId?: string): void {
    if (!this.selectedClientId) return;
    this.loading = true;

    this.engineApi
      .listRuleSets(this.selectedClientId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.ruleSets = (rows || []).sort(
            (a, b) => this.timeValue(b.effectiveFrom) - this.timeValue(a.effectiveFrom),
          );

          const selectedId = preferredId || this.selectedRuleSet?.id || '';
          const found = this.ruleSets.find((r) => r.id === selectedId) || this.filteredRuleSets[0] || null;
          this.selectedRuleSet = found;

          if (this.selectedRuleSet) {
            this.loadParameters(this.selectedRuleSet.id);
          } else {
            this.params = [];
          }
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to load rule sets'),
      });
  }

  private buildComparisonRows(base: RuleParameter[], target: RuleParameter[]): ComparisonRow[] {
    const baseMap = new Map(base.map((p) => [p.key, p]));
    const targetMap = new Map(target.map((p) => [p.key, p]));
    const keys = Array.from(new Set([...baseMap.keys(), ...targetMap.keys()])).sort((a, b) => a.localeCompare(b));

    return keys.map((key) => {
      const b = baseMap.get(key) || null;
      const t = targetMap.get(key) || null;

      let state: ComparisonRow['state'] = 'UNCHANGED';
      if (!b && t) state = 'ADDED';
      else if (b && !t) state = 'REMOVED';
      else if (b && t) {
        const changed =
          (b.valueNum ?? null) !== (t.valueNum ?? null) ||
          (b.valueText || null) !== (t.valueText || null) ||
          (b.unit || null) !== (t.unit || null);
        state = changed ? 'UPDATED' : 'UNCHANGED';
      }

      return {
        key,
        baseNum: b?.valueNum ?? null,
        baseText: b?.valueText ?? null,
        baseUnit: b?.unit ?? null,
        targetNum: t?.valueNum ?? null,
        targetText: t?.valueText ?? null,
        targetUnit: t?.unit ?? null,
        state,
      };
    });
  }

  private defaultRuleSetForm(): RuleSetFormModel {
    return {
      name: '',
      branchId: '',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
    };
  }

  private defaultParamForm(): ParameterFormModel {
    return {
      key: '',
      valueNum: null,
      valueText: '',
      unit: '',
      notes: '',
    };
  }

  private timeValue(input?: string | null): number {
    if (!input) return 0;
    const value = new Date(input).getTime();
    return Number.isNaN(value) ? 0 : value;
  }

  private todayStartValue(): number {
    const dt = new Date();
    dt.setHours(0, 0, 0, 0);
    return dt.getTime();
  }

  private isFutureVersion(ruleSet: RuleSet): boolean {
    return this.timeValue(ruleSet.effectiveFrom) > this.todayStartValue();
  }

  private isExpiredVersion(ruleSet: RuleSet): boolean {
    return !!ruleSet.effectiveTo && this.timeValue(ruleSet.effectiveTo) < this.todayStartValue();
  }
}

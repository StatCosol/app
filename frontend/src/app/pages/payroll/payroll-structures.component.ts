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
  RuleSet,
  SalaryStructure,
  StructureItem,
} from './payroll-engine-api.service';
import { PayrollApiService, PayrollClient } from './payroll-api.service';
import {
  PayrollComponent as SetupComponent,
  PayrollSetupApiService,
} from './payroll-setup-api.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';

const SCOPE_OPTIONS = [
  'TENANT',
  'BRANCH',
  'DEPARTMENT',
  'GRADE',
  'EMPLOYEE',
] as const;

const CALC_METHOD_OPTIONS = [
  'FIXED',
  'PERCENT',
  'FORMULA',
  'SLAB',
  'BALANCING',
] as const;

type ScopeType = (typeof SCOPE_OPTIONS)[number];
type CalcMethod = (typeof CALC_METHOD_OPTIONS)[number];
type CompareStateFilter = 'ALL' | 'CHANGED' | 'ADDED' | 'REMOVED' | 'SAME';

interface StructureFormModel {
  name: string;
  scopeType: ScopeType;
  branchId: string;
  departmentId: string;
  gradeId: string;
  employeeId: string;
  effectiveFrom: string;
  effectiveTo: string;
  ruleSetId: string;
}

interface ItemFormModel {
  componentId: string;
  calcMethod: CalcMethod;
  fixedAmount: number | null;
  percentage: number | null;
  percentageBase: string;
  formula: string;
  minAmount: number | null;
  maxAmount: number | null;
  roundingMode: string;
  priority: number;
  enabled: boolean;
}

interface GuardrailCheck {
  label: string;
  passed: boolean;
  detail: string;
}

@Component({
  selector: 'app-payroll-structures',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payroll-structures.component.html',
  styleUrls: ['./payroll-structures.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollStructuresComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  loadingItems = false;
  saving = false;
  previewLoading = false;

  clients: PayrollClient[] = [];
  selectedClientId = '';

  structures: SalaryStructure[] = [];
  items: StructureItem[] = [];
  selectedStructure: SalaryStructure | null = null;

  components: SetupComponent[] = [];
  ruleSets: RuleSet[] = [];

  structureSearch = '';
  structureStatusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL';
  structureScopeFilter: 'ALL' | ScopeType = 'ALL';

  showStructureModal = false;
  showItemModal = false;
  editingStructure: SalaryStructure | null = null;
  editingItem: StructureItem | null = null;
  compareVersionId = '';
  compareStateFilter: CompareStateFilter = 'ALL';
  compareLoading = false;
  compareItems: StructureItem[] = [];

  structureForm: StructureFormModel = this.defaultStructureForm();
  itemForm: ItemFormModel = this.defaultItemForm();

  previewForm: {
    grossAmount: number | null;
    asOfDate: string;
    branchId: string;
    employeeId: string;
  } = {
    grossAmount: 25000,
    asOfDate: new Date().toISOString().slice(0, 10),
    branchId: '',
    employeeId: '',
  };
  previewRows: Array<{ component: string; amount: number }> = [];
  previewTotal = 0;

  readonly scopeOptions = SCOPE_OPTIONS;
  readonly calcMethodOptions = CALC_METHOD_OPTIONS;
  readonly percentageBaseOptions = ['BASIC', 'GROSS', 'CTC', 'PF_WAGE', 'ESI_WAGE'];
  readonly roundingOptions = ['NONE', 'ROUND', 'FLOOR', 'CEIL'];
  readonly operatorTokens = ['+', '-', '*', '/', '(', ')'];
  readonly functionTokens = ['MIN(', 'MAX(', 'ROUND(', 'FLOOR(', 'CEIL('];

  constructor(
    private readonly engineApi: PayrollEngineApiService,
    private readonly payrollApi: PayrollApiService,
    private readonly setupApi: PayrollSetupApiService,
    private readonly toast: ToastService,
    private readonly confirm: ConfirmDialogService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadClients();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get activeStructureCount(): number {
    return this.structures.filter((s) => s.isActive).length;
  }

  get currentVersionCount(): number {
    if (!this.selectedStructure) return 0;
    return this.versionHistory.length;
  }

  get mappedComponentCount(): number {
    return this.items.filter((item) => item.enabled).length;
  }

  get filteredStructures(): SalaryStructure[] {
    const q = this.structureSearch.trim().toLowerCase();
    return this.structures.filter((s) => {
      if (this.structureStatusFilter === 'ACTIVE' && !s.isActive) return false;
      if (this.structureStatusFilter === 'INACTIVE' && s.isActive) return false;
      if (this.structureScopeFilter !== 'ALL' && s.scopeType !== this.structureScopeFilter) return false;
      if (!q) return true;
      const text = `${s.name} ${s.scopeType} ${this.formatDate(s.effectiveFrom)}`.toLowerCase();
      return text.includes(q);
    });
  }

  get versionHistory(): SalaryStructure[] {
    if (!this.selectedStructure) return [];
    const selected = this.selectedStructure;
    return this.structures
      .filter((s) => this.isSameVersionGroup(s, selected))
      .sort((a, b) => this.timeValue(b.effectiveFrom) - this.timeValue(a.effectiveFrom));
  }

  get compareCandidates(): SalaryStructure[] {
    if (!this.selectedStructure) return [];
    return this.versionHistory.filter((s) => s.id !== this.selectedStructure?.id);
  }

  get comparisonRows(): Array<{
    componentId: string;
    componentName: string;
    selectedItem: StructureItem | null;
    comparedItem: StructureItem | null;
    status: 'SAME' | 'CHANGED' | 'ADDED' | 'REMOVED';
  }> {
    const selectedByComponent = new Map(this.items.map((item) => [String(item.componentId), item]));
    const compareByComponent = new Map(this.compareItems.map((item) => [String(item.componentId), item]));
    const allComponentIds = new Set<string>([
      ...Array.from(selectedByComponent.keys()),
      ...Array.from(compareByComponent.keys()),
    ]);

    return Array.from(allComponentIds)
      .map((componentId) => {
        const selectedItem = selectedByComponent.get(componentId) ?? null;
        const comparedItem = compareByComponent.get(componentId) ?? null;
        let status: 'SAME' | 'CHANGED' | 'ADDED' | 'REMOVED' = 'SAME';

        if (selectedItem && !comparedItem) status = 'ADDED';
        else if (!selectedItem && comparedItem) status = 'REMOVED';
        else if (selectedItem && comparedItem) {
          status =
            this.structureItemFingerprint(selectedItem) === this.structureItemFingerprint(comparedItem)
              ? 'SAME'
              : 'CHANGED';
        }

        return {
          componentId,
          componentName: this.getComponentName(componentId),
          selectedItem,
          comparedItem,
          status,
        };
      })
      .sort((a, b) => a.componentName.localeCompare(b.componentName));
  }

  get filteredComparisonRows(): Array<{
    componentId: string;
    componentName: string;
    selectedItem: StructureItem | null;
    comparedItem: StructureItem | null;
    status: 'SAME' | 'CHANGED' | 'ADDED' | 'REMOVED';
  }> {
    if (this.compareStateFilter === 'ALL') return this.comparisonRows;
    return this.comparisonRows.filter((row) => row.status === this.compareStateFilter);
  }

  get comparisonSummary(): { changed: number; added: number; removed: number; same: number } {
    return {
      changed: this.comparisonRows.filter((r) => r.status === 'CHANGED').length,
      added: this.comparisonRows.filter((r) => r.status === 'ADDED').length,
      removed: this.comparisonRows.filter((r) => r.status === 'REMOVED').length,
      same: this.comparisonRows.filter((r) => r.status === 'SAME').length,
    };
  }

  get selectedGuardrailChecks(): GuardrailCheck[] {
    if (!this.selectedStructure) return [];

    const selected = this.selectedStructure;
    const future = this.isFutureVersion(selected);
    const expired = this.isExpiredVersion(selected);
    const enabledItems = this.items.filter((item) => item.enabled).length;
    const hasRuleSet = !!selected.ruleSetId;
    const hasAltVersion = this.versionHistory.length > 1;

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
        label: 'Enabled Mappings',
        passed: enabledItems > 0,
        detail: enabledItems > 0 ? `${enabledItems} enabled mapping items` : 'No enabled mapping items',
      },
      {
        label: 'Rule Set Linkage',
        passed: hasRuleSet,
        detail: hasRuleSet ? this.selectedRuleSetName : 'No linked rule set (optional)',
      },
      {
        label: 'Version Compare Ready',
        passed: hasAltVersion,
        detail: hasAltVersion ? `${this.versionHistory.length - 1} prior/alternate versions available` : 'No alternate versions available',
      },
    ];
  }

  get selectedRuleSetName(): string {
    if (!this.selectedStructure?.ruleSetId) return '-';
    return this.ruleSets.find((r) => r.id === this.selectedStructure?.ruleSetId)?.name || this.selectedStructure.ruleSetId;
  }

  get ruleSetOptions(): Array<{ value: string; label: string }> {
    return this.ruleSets.map((r) => ({ value: r.id, label: r.name }));
  }

  get componentOptions(): Array<{ value: string; label: string }> {
    return this.components.map((c) => ({
      value: String(c.id),
      label: `${c.code || 'COMP'} - ${c.name || c.id}`,
    }));
  }

  trackStructure(_: number, row: SalaryStructure): string {
    return row.id;
  }

  trackItem(_: number, row: StructureItem): string {
    return row.id;
  }

  trackVersion(_: number, row: SalaryStructure): string {
    return row.id;
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
    if (!this.selectedClientId) return;
    this.loading = true;

    this.selectedStructure = null;
    this.items = [];
    this.previewRows = [];
    this.previewTotal = 0;

    forkJoin({
      structures: this.engineApi
        .listStructures(this.selectedClientId)
        .pipe(catchError(() => of([] as SalaryStructure[]))),
      components: this.setupApi
        .listComponents(this.selectedClientId)
        .pipe(catchError(() => of([] as SetupComponent[]))),
      ruleSets: this.engineApi
        .listRuleSets(this.selectedClientId)
        .pipe(catchError(() => of([] as RuleSet[]))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ structures, components, ruleSets }) => {
          this.structures = (structures || []).sort(
            (a, b) => this.timeValue(b.effectiveFrom) - this.timeValue(a.effectiveFrom),
          );
          this.components = components || [];
          this.ruleSets = ruleSets || [];

          if (this.filteredStructures.length) {
            this.selectStructure(this.filteredStructures[0]);
          }
        },
        error: () => this.toast.error('Failed to load structures workspace'),
      });
  }

  selectStructure(structure: SalaryStructure): void {
    this.selectedStructure = structure;
    this.compareVersionId = '';
    this.compareStateFilter = 'ALL';
    this.compareItems = [];
    this.loadItems(structure.id);
  }

  openCreateStructure(): void {
    this.editingStructure = null;
    this.structureForm = this.defaultStructureForm();
    if (this.ruleSets.length && !this.structureForm.ruleSetId) {
      this.structureForm.ruleSetId = this.ruleSets[0].id;
    }
    this.showStructureModal = true;
  }

  openEditStructure(structure: SalaryStructure): void {
    this.editingStructure = structure;
    this.structureForm = {
      name: structure.name,
      scopeType: structure.scopeType,
      branchId: structure.branchId || '',
      departmentId: structure.departmentId || '',
      gradeId: structure.gradeId || '',
      employeeId: structure.employeeId || '',
      effectiveFrom: structure.effectiveFrom?.slice(0, 10) || '',
      effectiveTo: structure.effectiveTo?.slice(0, 10) || '',
      ruleSetId: structure.ruleSetId || '',
    };
    this.showStructureModal = true;
  }

  saveStructure(): void {
    if (!this.selectedClientId) {
      this.toast.error('Select a client first');
      return;
    }
    if (!this.structureForm.name.trim() || !this.structureForm.effectiveFrom) {
      this.toast.error('Structure name and effective from are required');
      return;
    }
    const missingScopeTarget = this.requiredScopeTargetField(this.structureForm.scopeType);
    if (missingScopeTarget && !this.structureForm[missingScopeTarget].trim()) {
      this.toast.error(`${this.scopeTargetLabel(this.structureForm.scopeType)} is required for this scope`);
      return;
    }

    if (
      this.structureForm.effectiveTo &&
      this.timeValue(this.structureForm.effectiveTo) < this.timeValue(this.structureForm.effectiveFrom)
    ) {
      this.toast.error('Effective To cannot be before Effective From');
      return;
    }
    if (!this.structureForm.ruleSetId) {
      this.toast.error('Linked rule set is required');
      return;
    }

    this.saving = true;
    const payload: Partial<SalaryStructure> = {
      clientId: this.selectedClientId,
      name: this.structureForm.name.trim(),
      scopeType: this.structureForm.scopeType,
      branchId: this.structureForm.scopeType === 'BRANCH' ? this.structureForm.branchId.trim() : null,
      departmentId:
        this.structureForm.scopeType === 'DEPARTMENT' ? this.structureForm.departmentId.trim() : null,
      gradeId: this.structureForm.scopeType === 'GRADE' ? this.structureForm.gradeId.trim() : null,
      employeeId: this.structureForm.scopeType === 'EMPLOYEE' ? this.structureForm.employeeId.trim() : null,
      effectiveFrom: this.structureForm.effectiveFrom,
      effectiveTo: this.structureForm.effectiveTo || null,
      ruleSetId: this.structureForm.ruleSetId,
    };

    const req$ = this.editingStructure
      ? this.engineApi.updateStructure(this.editingStructure.id, payload)
      : this.engineApi.createStructure(payload);

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
          this.showStructureModal = false;
          this.toast.success(this.editingStructure ? 'Structure updated' : 'Structure created');
          this.refreshStructures(String(saved?.id || this.editingStructure?.id || ''));
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to save structure'),
      });
  }

  deleteStructure(structure: SalaryStructure): void {
    this.confirm
      .confirm(
        'Delete Structure',
        `Delete "${structure.name}"? Existing mappings will be disabled for this version.`,
        { confirmText: 'Delete', variant: 'danger' },
      )
      .then((ok) => {
        if (!ok) return;
        this.engineApi
          .deleteStructure(structure.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.toast.success('Structure deleted');
              this.refreshStructures();
            },
            error: (err) => this.toast.error(err?.error?.message || 'Failed to delete structure'),
          });
      });
  }

  activateStructure(structure: SalaryStructure): void {
    const guardReason = this.activateGuardReason(
      structure,
      this.selectedStructure?.id === structure.id,
    );
    if (guardReason) {
      this.toast.error(guardReason);
      return;
    }

    this.confirm
      .confirm(
        'Activate Structure Version',
        `Make "${structure.name}" effective and deactivate other versions in this scope group?`,
        { confirmText: 'Activate' },
      )
      .then((ok) => {
        if (!ok) return;

        const versionGroup = this.structures.filter((row) => this.isSameVersionGroup(row, structure));
        const deactivateReqs = versionGroup
          .filter((row) => row.id !== structure.id && row.isActive)
          .map((row) => this.engineApi.updateStructure(row.id, { isActive: false }));
        const activateReq$ = this.engineApi.updateStructure(structure.id, { isActive: true });

        this.saving = true;
        forkJoin([...deactivateReqs, activateReq$])
          .pipe(
            takeUntil(this.destroy$),
            finalize(() => {
              this.saving = false;
              this.cdr.markForCheck();
            }),
          )
          .subscribe({
            next: () => {
              this.toast.success('Structure version activated');
              this.refreshStructures(structure.id);
            },
            error: (err) => this.toast.error(err?.error?.message || 'Failed to activate structure version'),
          });
      });
  }

  loadItems(structureId: string): void {
    this.loadingItems = true;
    this.engineApi
      .listStructureItems(structureId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingItems = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.items = (rows || []).sort((a, b) => Number(a.priority) - Number(b.priority));
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to load structure items'),
      });
  }

  openCreateItem(): void {
    if (!this.selectedStructure) {
      this.toast.error('Select a structure first');
      return;
    }
    this.editingItem = null;
    this.itemForm = this.defaultItemForm();
    this.showItemModal = true;
  }

  openEditItem(item: StructureItem): void {
    this.editingItem = item;
    this.itemForm = {
      componentId: String(item.componentId || ''),
      calcMethod: item.calcMethod,
      fixedAmount: item.fixedAmount,
      percentage: item.percentage,
      percentageBase: item.percentageBase || 'BASIC',
      formula: item.formula || '',
      minAmount: item.minAmount,
      maxAmount: item.maxAmount,
      roundingMode: item.roundingMode || 'ROUND',
      priority: item.priority || 10,
      enabled: item.enabled,
    };
    this.showItemModal = true;
  }

  onCalcMethodChange(): void {
    this.itemForm.fixedAmount = null;
    this.itemForm.percentage = null;
    this.itemForm.percentageBase = 'BASIC';
    this.itemForm.formula = '';
  }

  insertFormulaToken(token: string): void {
    this.itemForm.formula = `${this.itemForm.formula || ''}${token}`;
  }

  insertComponentToken(componentId: string): void {
    const code = this.getComponentCode(componentId) || this.getComponentName(componentId);
    const token = code.replace(/\s+/g, '_').toUpperCase();
    this.itemForm.formula = `${this.itemForm.formula || ''}${token}`;
  }

  saveItem(): void {
    if (!this.selectedStructure) return;
    if (!this.itemForm.componentId) {
      this.toast.error('Component is required');
      return;
    }

    if (this.itemForm.calcMethod === 'FIXED' && this.itemForm.fixedAmount === null) {
      this.toast.error('Fixed amount is required for FIXED method');
      return;
    }
    if (this.itemForm.calcMethod === 'PERCENT' && this.itemForm.percentage === null) {
      this.toast.error('Percentage is required for PERCENT method');
      return;
    }
    if (this.itemForm.calcMethod === 'FORMULA' && !this.itemForm.formula.trim()) {
      this.toast.error('Formula is required for FORMULA method');
      return;
    }

    this.saving = true;
    const payload: Partial<StructureItem> = {
      componentId: this.itemForm.componentId,
      calcMethod: this.itemForm.calcMethod,
      fixedAmount: this.itemForm.calcMethod === 'FIXED' ? this.itemForm.fixedAmount : null,
      percentage: this.itemForm.calcMethod === 'PERCENT' ? this.itemForm.percentage : null,
      percentageBase: this.itemForm.calcMethod === 'PERCENT' ? this.itemForm.percentageBase : null,
      formula: this.itemForm.calcMethod === 'FORMULA' ? this.itemForm.formula.trim() : null,
      minAmount: this.itemForm.minAmount,
      maxAmount: this.itemForm.maxAmount,
      roundingMode: this.itemForm.roundingMode,
      priority: this.itemForm.priority,
      enabled: this.itemForm.enabled,
    };

    const structureId = this.selectedStructure.id;
    const req$ = this.editingItem
      ? this.engineApi.updateStructureItem(structureId, this.editingItem.id, payload)
      : this.engineApi.createStructureItem(structureId, payload);

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
          this.showItemModal = false;
          this.toast.success(this.editingItem ? 'Structure item updated' : 'Structure item added');
          this.loadItems(structureId);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to save structure item'),
      });
  }

  deleteItem(item: StructureItem): void {
    if (!this.selectedStructure) return;
    const name = this.getComponentName(item.componentId);
    this.confirm
      .confirm(
        'Delete Mapping Item',
        `Delete mapping for ${name}?`,
        { confirmText: 'Delete', variant: 'danger' },
      )
      .then((ok) => {
        if (!ok) return;
        this.engineApi
          .deleteStructureItem(this.selectedStructure!.id, item.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.toast.success('Structure item deleted');
              this.loadItems(this.selectedStructure!.id);
            },
            error: (err) => this.toast.error(err?.error?.message || 'Failed to delete item'),
          });
      });
  }

  runPreview(): void {
    if (!this.selectedClientId) {
      this.toast.error('Select a client first');
      return;
    }
    if (!this.previewForm.grossAmount || this.previewForm.grossAmount <= 0) {
      this.toast.error('Enter a valid gross amount');
      return;
    }
    if (!this.previewForm.asOfDate) {
      this.toast.error('Select an as-of date for preview');
      return;
    }

    this.previewLoading = true;
    this.engineApi
      .previewEmployee({
        clientId: this.selectedClientId,
        branchId: this.previewForm.branchId || undefined,
        employeeId: this.previewForm.employeeId || undefined,
        grossAmount: Number(this.previewForm.grossAmount),
        asOfDate: this.previewForm.asOfDate,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.previewLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (result) => {
          const rows = Object.entries(result || {}).map(([component, amount]) => ({
            component,
            amount: Number(amount || 0),
          }));
          this.previewRows = rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
          this.previewTotal = this.previewRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Preview calculation failed'),
      });
  }

  onScopeTypeChange(): void {
    const nextScope = this.structureForm.scopeType;
    if (nextScope !== 'BRANCH') this.structureForm.branchId = '';
    if (nextScope !== 'DEPARTMENT') this.structureForm.departmentId = '';
    if (nextScope !== 'GRADE') this.structureForm.gradeId = '';
    if (nextScope !== 'EMPLOYEE') this.structureForm.employeeId = '';
  }

  loadCompareVersion(versionId: string): void {
    this.compareVersionId = versionId;
    this.compareItems = [];
    this.compareStateFilter = 'ALL';
    if (!versionId) return;
    this.compareLoading = true;
    this.engineApi
      .listStructureItems(versionId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.compareLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.compareItems = (rows || []).sort((a, b) => Number(a.priority) - Number(b.priority));
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to load comparison version'),
      });
  }

  clearCompareVersion(): void {
    this.compareVersionId = '';
    this.compareStateFilter = 'ALL';
    this.compareItems = [];
  }

  canActivateStructure(structure: SalaryStructure, includeMappingCheck = false): boolean {
    return !this.activateGuardReason(structure, includeMappingCheck);
  }

  activateGuardReason(structure: SalaryStructure, includeMappingCheck = false): string | null {
    if (structure.isActive) return 'Version is already active.';
    if (this.isFutureVersion(structure)) {
      return `Cannot activate before effective date ${this.formatDate(structure.effectiveFrom)}.`;
    }
    if (this.isExpiredVersion(structure)) {
      return `Cannot activate expired version (ended ${this.formatDate(structure.effectiveTo)}).`;
    }
    if (
      includeMappingCheck &&
      this.selectedStructure?.id === structure.id &&
      !this.items.some((item) => item.enabled)
    ) {
      return 'Add at least one enabled mapping item before activation.';
    }
    return null;
  }

  versionWindowClass(structure: SalaryStructure): string {
    if (this.isFutureVersion(structure)) return 'badge badge--info';
    if (this.isExpiredVersion(structure)) return 'badge badge--bad';
    return 'badge badge--good';
  }

  versionWindowLabel(structure: SalaryStructure): string {
    if (this.isFutureVersion(structure)) return 'Future';
    if (this.isExpiredVersion(structure)) return 'Expired';
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

  formatAmount(value: number | null | undefined): string {
    const n = Number(value || 0);
    return `INR ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }

  structureStatusClass(isActive: boolean): string {
    return isActive ? 'badge badge--good' : 'badge badge--muted';
  }

  itemMethodClass(method: CalcMethod): string {
    if (method === 'FORMULA') return 'badge badge--warn';
    if (method === 'PERCENT') return 'badge badge--info';
    if (method === 'FIXED') return 'badge badge--good';
    if (method === 'BALANCING') return 'badge badge--muted';
    return 'badge badge--bad';
  }

  compareStatusClass(status: 'SAME' | 'CHANGED' | 'ADDED' | 'REMOVED'): string {
    if (status === 'SAME') return 'badge badge--muted';
    if (status === 'CHANGED') return 'badge badge--warn';
    if (status === 'ADDED') return 'badge badge--good';
    return 'badge badge--bad';
  }

  scopeTargetLabel(scopeType: ScopeType): string {
    if (scopeType === 'BRANCH') return 'Branch ID';
    if (scopeType === 'DEPARTMENT') return 'Department ID';
    if (scopeType === 'GRADE') return 'Grade ID';
    if (scopeType === 'EMPLOYEE') return 'Employee ID';
    return 'Scope Target';
  }

  scopeContextText(structure: SalaryStructure): string {
    if (structure.scopeType === 'BRANCH') return structure.branchId || '-';
    if (structure.scopeType === 'DEPARTMENT') return structure.departmentId || '-';
    if (structure.scopeType === 'GRADE') return structure.gradeId || '-';
    if (structure.scopeType === 'EMPLOYEE') return structure.employeeId || '-';
    return 'Tenant';
  }

  getComponentName(componentId: string): string {
    const comp = this.components.find((c) => String(c.id) === String(componentId));
    return comp?.name || componentId;
  }

  getComponentCode(componentId: string): string {
    const comp = this.components.find((c) => String(c.id) === String(componentId));
    return comp?.code || '';
  }

  itemValueText(item: StructureItem): string {
    switch (item.calcMethod) {
      case 'FIXED':
        return this.formatAmount(item.fixedAmount);
      case 'PERCENT':
        return `${item.percentage || 0}% of ${item.percentageBase || 'BASIC'}`;
      case 'FORMULA':
        return item.formula || '-';
      case 'BALANCING':
        return 'Auto balancing';
      case 'SLAB':
        return 'Slab based';
      default:
        return '-';
    }
  }

  private refreshStructures(preferredId?: string): void {
    if (!this.selectedClientId) return;
    this.engineApi
      .listStructures(this.selectedClientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => {
          this.structures = (rows || []).sort(
            (a, b) => this.timeValue(b.effectiveFrom) - this.timeValue(a.effectiveFrom),
          );

          if (preferredId) {
            const found = this.structures.find((s) => s.id === preferredId);
            if (found) {
              this.selectStructure(found);
              this.cdr.markForCheck();
              return;
            }
          }

          if (this.selectedStructure) {
            const stillExists = this.structures.find((s) => s.id === this.selectedStructure?.id);
            if (stillExists) {
              this.selectStructure(stillExists);
            } else if (this.filteredStructures.length) {
              this.selectStructure(this.filteredStructures[0]);
            } else {
              this.selectedStructure = null;
              this.items = [];
            }
          }

          this.cdr.markForCheck();
        },
        error: () => this.toast.error('Failed to reload structures'),
      });
  }

  private defaultStructureForm(): StructureFormModel {
    return {
      name: '',
      scopeType: 'TENANT',
      branchId: '',
      departmentId: '',
      gradeId: '',
      employeeId: '',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
      ruleSetId: '',
    };
  }

  private defaultItemForm(): ItemFormModel {
    return {
      componentId: '',
      calcMethod: 'FIXED',
      fixedAmount: null,
      percentage: null,
      percentageBase: 'BASIC',
      formula: '',
      minAmount: null,
      maxAmount: null,
      roundingMode: 'ROUND',
      priority: 10,
      enabled: true,
    };
  }

  private timeValue(input?: string | null): number {
    if (!input) return 0;
    const value = new Date(input).getTime();
    return Number.isNaN(value) ? 0 : value;
  }

  private requiredScopeTargetField(scopeType: ScopeType): keyof StructureFormModel | null {
    if (scopeType === 'BRANCH') return 'branchId';
    if (scopeType === 'DEPARTMENT') return 'departmentId';
    if (scopeType === 'GRADE') return 'gradeId';
    if (scopeType === 'EMPLOYEE') return 'employeeId';
    return null;
  }

  private structureItemFingerprint(item: StructureItem): string {
    return JSON.stringify({
      calcMethod: item.calcMethod,
      fixedAmount: item.fixedAmount ?? null,
      percentage: item.percentage ?? null,
      percentageBase: item.percentageBase ?? null,
      formula: item.formula ?? null,
      minAmount: item.minAmount ?? null,
      maxAmount: item.maxAmount ?? null,
      roundingMode: item.roundingMode ?? null,
      priority: item.priority ?? null,
      enabled: item.enabled ?? true,
    });
  }

  private isSameVersionGroup(a: SalaryStructure, b: SalaryStructure): boolean {
    return (
      a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
      a.scopeType === b.scopeType &&
      String(a.branchId || '') === String(b.branchId || '') &&
      String(a.departmentId || '') === String(b.departmentId || '') &&
      String(a.gradeId || '') === String(b.gradeId || '') &&
      String(a.employeeId || '') === String(b.employeeId || '')
    );
  }

  private todayStartValue(): number {
    const dt = new Date();
    dt.setHours(0, 0, 0, 0);
    return dt.getTime();
  }

  private isFutureVersion(structure: SalaryStructure): boolean {
    return this.timeValue(structure.effectiveFrom) > this.todayStartValue();
  }

  private isExpiredVersion(structure: SalaryStructure): boolean {
    return !!structure.effectiveTo && this.timeValue(structure.effectiveTo) < this.todayStartValue();
  }
}


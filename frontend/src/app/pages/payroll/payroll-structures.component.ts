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
import { ClientMasterDataService, MasterItem } from '../client/master-data/client-master-data.service';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ClientContextStripComponent } from '../../shared/ui/client-context-strip/client-context-strip.component';
import { PageHeaderComponent } from '../../shared/ui';
import {
  FormulaBuilderComponent,
  FormulaNode,
} from './formula-builder/formula-builder.component';

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

interface SlabRow {
  from: number | null;
  to: number | null;
  amount: number | null;
  percent: number | null;
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
  slabs: SlabRow[];
}

interface GuardrailCheck {
  label: string;
  passed: boolean;
  detail: string;
}

@Component({
  selector: 'app-payroll-structures',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ClientContextStripComponent,
    FormulaBuilderComponent,
    PageHeaderComponent,
  ],
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

  // Lookup data for dropdowns
  branchOptions: { id: string; branchName: string }[] = [];
  departmentOptions: MasterItem[] = [];
  gradeOptions: MasterItem[] = [];
  employeeOptions: { id: string; label: string }[] = [];

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
  previewEarnings: Array<{ component: string; amount: number }> = [];
  previewDeductions: Array<{ component: string; amount: number }> = [];
  previewEmployer: Array<{ component: string; amount: number }> = [];
  previewNetPay = 0;
  previewTotalEarnings = 0;
  previewTotalDeductions = 0;
  previewTotal = 0;

  // Phase 2D — per-component live preview (inside item modal)
  livePreviewInputsText = 'GROSS=25000\nBASIC=12500\nHRA=5000';
  livePreviewBusy = false;
  livePreviewError: string | null = null;
  livePreviewResult: {
    value: number;
    rawValue: number;
    baseAmount?: number;
    resolvedInputs: Record<string, number>;
  } | null = null;

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
    private readonly masterDataSvc: ClientMasterDataService,
    private readonly toast: ToastService,
    private readonly dialog: ConfirmDialogService,
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

  get activeStructureCount(): number {
    return this.structures.filter((s) => s.isActive).length;
  }

  get inactiveStructureCount(): number {
    return this.structures.filter((s) => !s.isActive).length;
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
      label: `${c.code || 'COMP'} - ${c.name || '(Unnamed)'}`,
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

    // Load lookup data for dropdowns
    this.payrollApi.getOptionBranches(this.selectedClientId)
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(b => { this.branchOptions = b || []; this.cdr.markForCheck(); });
    this.masterDataSvc.listDepartments(this.selectedClientId)
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(d => { this.departmentOptions = d || []; this.cdr.markForCheck(); });
    this.masterDataSvc.listGrades(this.selectedClientId)
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(g => { this.gradeOptions = g || []; this.cdr.markForCheck(); });
    this.payrollApi.getEmployees({ clientId: this.selectedClientId, limit: 500 })
      .pipe(takeUntil(this.destroy$), catchError(() => of({ data: [], total: 0 })))
      .subscribe(res => {
        this.employeeOptions = (res?.data || []).map(e => ({
          id: e.id,
          label: `${e.employeeCode || ''} – ${e.name || ''}`.trim(),
        }));
        this.cdr.markForCheck();
      });

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

  async deleteStructure(structure: SalaryStructure): Promise<void> {
    if (structure.isActive) {
      this.toast.error('Active structure cannot be deleted. Activate another version first.');
      return;
    }
    const ok = await this.dialog.confirm(
      'Delete Structure',
      `Delete "${structure.name}" permanently? Its mapped items for this inactive version will also be removed.`,
      { confirmText: 'Delete', variant: 'danger' },
    );
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
  }

  async cleanupInactiveStructures(): Promise<void> {
    const inactive = this.structures.filter((row) => !row.isActive);
    if (!inactive.length) {
      this.toast.success('No inactive structures to remove');
      return;
    }

    const ok = await this.dialog.confirm(
      'Delete Inactive Structures',
      `Delete ${inactive.length} inactive structure(s)? Active structure(s) will be kept.`,
      { confirmText: 'Delete', variant: 'danger' },
    );
    if (!ok) return;

    this.saving = true;
    const deleteReqs = inactive.map((row) =>
      this.engineApi.deleteStructure(row.id).pipe(
        catchError((err) => of({ __error: err, __id: row.id })),
      ),
    );

    forkJoin(deleteReqs)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (results) => {
          const failed = results.filter((r: any) => !!r?.__error).length;
          if (failed > 0) {
            this.toast.error(`${failed} structure(s) could not be deleted`);
          } else {
            this.toast.success('Inactive structures removed');
          }
          this.refreshStructures();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to clean up inactive structures'),
      });
  }

  canDeleteStructure(structure: SalaryStructure): boolean {
    return !structure.isActive;
  }

  async activateStructure(structure: SalaryStructure): Promise<void> {
    const guardReason = this.activateGuardReason(
      structure,
      this.selectedStructure?.id === structure.id,
    );
    if (guardReason) {
      this.toast.error(guardReason);
      return;
    }

    const ok = await this.dialog.confirm(
      'Activate Structure',
      `Make "${structure.name}" effective and deactivate other versions in this scope group?`,
      { confirmText: 'Activate' },
    );
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
  }

  // ── Approval workflow (Phase 2B) ──────────────────────────
  async submitForApproval(structure: SalaryStructure): Promise<void> {
    const ok = await this.dialog.confirm(
      'Submit Structure',
      `Submit "${structure.name}" for approval?`,
      { confirmText: 'Submit' },
    );
    if (!ok) return;
    this.saving = true;
    this.engineApi
      .submitStructure(structure.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Submitted for approval');
          this.refreshStructures(structure.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Submit failed'),
      });
  }

  async approveStructure(structure: SalaryStructure): Promise<void> {
    const ok = await this.dialog.confirm(
      'Approve Structure',
      `Approve "${structure.name}"? It will become eligible for activation.`,
      { confirmText: 'Approve' },
    );
    if (!ok) return;
    this.saving = true;
    this.engineApi
      .approveStructure(structure.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Structure approved');
          this.refreshStructures(structure.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Approval failed'),
      });
  }

  async rejectStructure(structure: SalaryStructure): Promise<void> {
    const result = await this.dialog.prompt(
      'Reject Structure',
      'Rejection reason (required):',
      { placeholder: 'Reason', confirmText: 'Reject' },
    );
    const reason = (result.value || '').trim();
    if (!reason) {
      this.toast.error('Rejection reason is required');
      return;
    }
    this.saving = true;
    this.engineApi
      .rejectStructure(structure.id, reason)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Structure rejected');
          this.refreshStructures(structure.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Reject failed'),
      });
  }

  async withdrawStructure(structure: SalaryStructure): Promise<void> {
    const ok = await this.dialog.confirm(
      'Withdraw Structure',
      `Withdraw submission of "${structure.name}" back to DRAFT?`,
      { confirmText: 'Withdraw' },
    );
    if (!ok) return;
    this.saving = true;
    this.engineApi
      .withdrawStructure(structure.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Submission withdrawn');
          this.refreshStructures(structure.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Withdraw failed'),
      });
  }

  approvalStatusClass(status: SalaryStructure['approvalStatus']): string {
    switch (status) {
      case 'APPROVED': return 'badge badge--good';
      case 'PENDING':  return 'badge badge--warn';
      case 'REJECTED': return 'badge badge--bad';
      default:         return 'badge badge--muted';
    }
  }

  canSubmit(s: SalaryStructure): boolean {
    return s.approvalStatus === 'DRAFT' || s.approvalStatus === 'REJECTED';
  }
  canApprove(s: SalaryStructure): boolean { return s.approvalStatus === 'PENDING'; }
  canReject(s: SalaryStructure): boolean { return s.approvalStatus === 'PENDING'; }
  canWithdraw(s: SalaryStructure): boolean { return s.approvalStatus === 'PENDING'; }

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
    const rawSlabs = (item.slabRef && Array.isArray((item.slabRef as any).slabs))
      ? ((item.slabRef as any).slabs as Array<any>)
      : [];
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
      slabs: rawSlabs.map((s) => ({
        from: s?.from ?? null,
        to: s?.to ?? null,
        amount: s?.amount ?? null,
        percent: s?.percent ?? null,
      })),
    };
    this.showItemModal = true;
  }

  onCalcMethodChange(): void {
    this.itemForm.fixedAmount = null;
    this.itemForm.percentage = null;
    this.itemForm.percentageBase = 'BASIC';
    this.itemForm.formula = '';
    if (this.itemForm.calcMethod === 'SLAB' && !this.itemForm.slabs.length) {
      this.addSlab();
    } else if (this.itemForm.calcMethod !== 'SLAB') {
      this.itemForm.slabs = [];
    }
  }

  // ── Slab editor (Phase 2C) ─────────────────────────────────
  addSlab(): void {
    const last = this.itemForm.slabs[this.itemForm.slabs.length - 1];
    const nextFrom = last && Number(last.to) > 0 ? Number(last.to) + 1 : 0;
    this.itemForm.slabs = [
      ...this.itemForm.slabs,
      { from: nextFrom, to: null, amount: null, percent: null },
    ];
  }

  removeSlab(idx: number): void {
    this.itemForm.slabs = this.itemForm.slabs.filter((_, i) => i !== idx);
  }

  moveSlab(idx: number, delta: -1 | 1): void {
    const next = idx + delta;
    if (next < 0 || next >= this.itemForm.slabs.length) return;
    const arr = [...this.itemForm.slabs];
    const tmp = arr[idx];
    arr[idx] = arr[next];
    arr[next] = tmp;
    this.itemForm.slabs = arr;
  }

  trackSlab(idx: number): number { return idx; }

  private validateSlabs(): string | null {
    const slabs = this.itemForm.slabs;
    if (!slabs.length) return 'Add at least one slab row';
    let prevTo = -Infinity;
    for (let i = 0; i < slabs.length; i++) {
      const s = slabs[i];
      const from = Number(s.from);
      const to = s.to == null || s.to === ('' as any) ? Infinity : Number(s.to);
      if (Number.isNaN(from) || from < 0) return `Row ${i + 1}: invalid "from"`;
      if (Number.isNaN(to) || to < from) return `Row ${i + 1}: "to" must be >= "from"`;
      if (from <= prevTo) return `Row ${i + 1}: ranges must not overlap (from > previous to)`;
      const hasAmount = s.amount != null && !Number.isNaN(Number(s.amount));
      const hasPercent = s.percent != null && !Number.isNaN(Number(s.percent));
      if (!hasAmount && !hasPercent) return `Row ${i + 1}: amount or percent is required`;
      if (hasAmount && hasPercent) return `Row ${i + 1}: set either amount OR percent, not both`;
      prevTo = to === Infinity ? Number.MAX_SAFE_INTEGER : to;
    }
    return null;
  }

  insertFormulaToken(token: string): void {
    this.itemForm.formula = `${this.itemForm.formula || ''}${token}`;
  }

  insertComponentToken(componentId: string): void {
    const code = this.getComponentCode(componentId) || this.getComponentName(componentId);
    const token = code.replace(/\s+/g, '_').toUpperCase();
    this.itemForm.formula = `${this.itemForm.formula || ''}${token}`;
  }

  // ── Visual Formula Builder (no-code tree) ───────────────────────────
  showVisualBuilder = false;
  visualFormulaNode: FormulaNode | null = null;
  visualBuilderError: string | null = null;
  visualBuilderVariables: string[] = [
    'GROSS',
    'BASIC',
    'HRA',
    'CONVEYANCE',
    'SPECIAL',
    'CTC',
    'PF_WAGE',
    'ESI_WAGE',
    'MIN_WAGE',
    'WORKED_DAYS',
    'PAYABLE_DAYS',
    'LOP_DAYS',
    'PRESENT_DAYS',
    'OT_HOURS',
  ];

  toggleVisualBuilder(): void {
    this.showVisualBuilder = !this.showVisualBuilder;
    if (this.showVisualBuilder && !this.visualFormulaNode) {
      this.visualFormulaNode = { type: 'FIXED', value: null };
    }
    this.cdr.markForCheck();
  }

  onVisualFormulaChange(node: FormulaNode | null): void {
    this.visualFormulaNode = node;
    this.visualBuilderError = null;
    if (!node) {
      return;
    }
    this.engineApi
      .serializeFormula(node)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.itemForm.formula = res.formulaText;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.visualBuilderError =
            err?.error?.message || err?.message || 'Invalid formula tree';
          this.cdr.markForCheck();
        },
      });
  }

  // ── Phase 2D: Live preview for the item being edited ─────────────────
  /**
   * Parse "GROSS=25000\nBASIC=12500" or comma/whitespace separated KEY=VAL pairs
   * into a numeric variable map for the preview API.
   */
  private parseLiveInputs(): Record<string, number> {
    const out: Record<string, number> = {};
    const text = (this.livePreviewInputsText || '').trim();
    if (!text) return out;
    const tokens = text.split(/[\s,;]+/).filter(Boolean);
    for (const tk of tokens) {
      const m = tk.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(-?\d+(?:\.\d+)?)$/);
      if (m) {
        out[m[1].toUpperCase()] = Number(m[2]);
      }
    }
    return out;
  }

  runLivePreview(): void {
    if (!this.selectedStructure) return;
    this.livePreviewError = null;
    this.livePreviewResult = null;

    if (this.itemForm.calcMethod === 'SLAB') {
      const slabErr = this.validateSlabs();
      if (slabErr) {
        this.livePreviewError = slabErr;
        this.cdr.markForCheck();
        return;
      }
    }

    const inputs = this.parseLiveInputs();
    let slabRef: Record<string, unknown> | null = null;
    if (this.itemForm.calcMethod === 'SLAB') {
      slabRef = {
        slabs: this.itemForm.slabs.map((s) => {
          const to = s.to == null || (s.to as unknown as string) === ''
            ? Number.MAX_SAFE_INTEGER
            : Number(s.to);
          const row: Record<string, number> = { from: Number(s.from), to };
          if (s.amount != null && (s.amount as unknown as string) !== '') {
            row['amount'] = Number(s.amount);
          }
          if (s.percent != null && (s.percent as unknown as string) !== '') {
            row['percent'] = Number(s.percent);
          }
          return row;
        }),
      };
    }

    this.livePreviewBusy = true;
    this.cdr.markForCheck();

    this.engineApi
      .previewComponent({
        clientId: this.selectedStructure.clientId,
        calcMethod: this.itemForm.calcMethod,
        fixedAmount: this.itemForm.fixedAmount ?? null,
        percentage: this.itemForm.percentage ?? null,
        percentageBase: (this.itemForm.percentageBase as any) ?? 'BASIC',
        formula: this.itemForm.formula || null,
        slabRef,
        minAmount: this.itemForm.minAmount ?? null,
        maxAmount: this.itemForm.maxAmount ?? null,
        roundingMode: this.itemForm.roundingMode || 'NEAREST_RUPEE',
        inputs,
      })
      .subscribe({
        next: (res) => {
          this.livePreviewBusy = false;
          if (res.error) {
            this.livePreviewError = res.error;
            this.livePreviewResult = null;
          } else {
            this.livePreviewResult = res;
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.livePreviewBusy = false;
          this.livePreviewError =
            err?.error?.message || err?.message || 'Preview failed';
          this.cdr.markForCheck();
        },
      });
  }

  livePreviewInputKeys(): string[] {
    return this.livePreviewResult
      ? Object.keys(this.livePreviewResult.resolvedInputs)
      : [];
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
    if (this.itemForm.calcMethod === 'SLAB') {
      const err = this.validateSlabs();
      if (err) {
        this.toast.error(err);
        return;
      }
    }

    this.saving = true;
    const slabPayload = this.itemForm.calcMethod === 'SLAB'
      ? {
          slabs: this.itemForm.slabs.map((s) => {
            const out: any = { from: Number(s.from) || 0 };
            if (s.to != null && (s.to as any) !== '') out.to = Number(s.to);
            else out.to = Number.MAX_SAFE_INTEGER;
            if (s.amount != null && (s.amount as any) !== '') out.amount = Number(s.amount);
            if (s.percent != null && (s.percent as any) !== '') out.percent = Number(s.percent);
            return out;
          }),
        }
      : null;
    const payload: Partial<StructureItem> = {
      componentId: this.itemForm.componentId,
      calcMethod: this.itemForm.calcMethod,
      fixedAmount: this.itemForm.calcMethod === 'FIXED' ? this.itemForm.fixedAmount : null,
      percentage: this.itemForm.calcMethod === 'PERCENT' ? this.itemForm.percentage : null,
      percentageBase: this.itemForm.calcMethod === 'PERCENT' ? this.itemForm.percentageBase : null,
      formula: this.itemForm.calcMethod === 'FORMULA' ? this.itemForm.formula.trim() : null,
      slabRef: slabPayload,
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

  async deleteItem(item: StructureItem): Promise<void> {
    if (!this.selectedStructure) return;
    const name = this.getComponentName(item.componentId);
    const ok = await this.dialog.confirm(
      'Delete Mapping',
      `Delete mapping for ${name}?`,
      { confirmText: 'Delete', variant: 'danger' },
    );
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
          const entries = Object.entries(result || {});

          // Hidden intermediate/info keys
          const hiddenKeys = new Set([
            'ACTUAL_GROSS', 'PF_WAGE', 'PF_WAGES', 'ESI_WAGE', 'ESI_WAGES',
            'GROSS', 'PF_EPS', 'PF_DIFF',
          ]);
          // Deduction keys (employee-side)
          const deductionKeys = new Set(['PF_EMP', 'ESI_EMP', 'PT', 'LWF_EMP', 'PF_ER_FROM_EMP']);
          // Employer contribution keys
          const employerKeys = new Set(['PF_ER', 'ESI_ER', 'LWF_ER']);

          const earnings: Array<{ component: string; amount: number }> = [];
          const deductions: Array<{ component: string; amount: number }> = [];
          const employer: Array<{ component: string; amount: number }> = [];
          let netPay = 0;

          for (const [key, val] of entries) {
            const amount = Number(val || 0);
            if (key === 'NET_PAY') {
              netPay = amount;
              continue;
            }
            if (hiddenKeys.has(key)) continue;
            if (deductionKeys.has(key)) {
              if (amount !== 0) deductions.push({ component: key, amount });
            } else if (employerKeys.has(key)) {
              if (amount !== 0) employer.push({ component: key, amount });
            } else {
              earnings.push({ component: key, amount });
            }
          }

          this.previewEarnings = earnings.sort((a, b) => b.amount - a.amount);
          this.previewDeductions = deductions.sort((a, b) => b.amount - a.amount);
          this.previewEmployer = employer.sort((a, b) => b.amount - a.amount);
          this.previewNetPay = netPay;
          this.previewTotalEarnings = earnings.reduce((s, r) => s + r.amount, 0);
          this.previewTotalDeductions = deductions.reduce((s, r) => s + r.amount, 0);

          // Also keep flat rows for backward compat
          this.previewRows = [...earnings, ...deductions, ...employer];
          this.previewTotal = netPay;
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
    if (structure.approvalStatus !== 'APPROVED') {
      return `Structure must be APPROVED before activation (current: ${structure.approvalStatus}).`;
    }
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
      case 'SLAB': {
        const slabs = (item.slabRef && Array.isArray((item.slabRef as any).slabs))
          ? ((item.slabRef as any).slabs as Array<any>)
          : [];
        return slabs.length ? `${slabs.length} slab(s)` : 'Slab based';
      }
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
      slabs: [],
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

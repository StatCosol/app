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
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import {
  PayrollEngineApiService,
  ClientStructure,
  StructureComponent,
  StatutoryConfig,
  CreateClientStructurePayload,
  CalculatePayrollResult,
} from './payroll-engine-api.service';
import { PayrollApiService, PayrollClient } from './payroll-api.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ClientContextStripComponent } from '../../shared/ui/client-context-strip/client-context-strip.component';

/* ── Default form helpers ──────────────────────────────────────────────────── */

type ComponentForm = {
  code: string;
  name: string;
  label: string;
  type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  calculationMethod: 'FIXED' | 'PERCENTAGE' | 'FORMULA' | 'BALANCING' | 'CONDITIONAL_FIXED';
  displayOrder: number;
  fixedValue: number | null;
  percentageValue: number | null;
  basedOn: string;
  formula: string;
  roundRule: string;
  taxable: boolean;
  statutory: boolean;
  isVisibleInPayslip: boolean;
  isActive: boolean;
};

type StatConfigForm = {
  stateCode: string;
  minimumWage: number | null;
  warnIfGrossBelowMinWage: boolean;
  enablePt: boolean;
  enablePf: boolean;
  enableEsi: boolean;
  pfEmployeeRate: number;
  pfWageCap: number;
  pfApplyIfGrossAbove: number | null;
  esiEmployeeRate: number;
  esiEmployerRate: number;
  esiGrossCeiling: number;
  carryForwardLeave: boolean;
  monthlyPaidLeaveAccrual: number;
  attendanceBonusAmount: number | null;
  attendanceBonusIfLopLte: number | null;
};

function blankComponent(order: number): ComponentForm {
  return {
    code: '', name: '', label: '',
    type: 'EARNING', calculationMethod: 'PERCENTAGE', displayOrder: order,
    fixedValue: null, percentageValue: null, basedOn: 'GROSS', formula: '',
    roundRule: 'ROUND', taxable: true, statutory: false,
    isVisibleInPayslip: true, isActive: true,
  };
}

function blankStatConfig(): StatConfigForm {
  return {
    stateCode: '', minimumWage: null, warnIfGrossBelowMinWage: true,
    enablePt: true, enablePf: true, enableEsi: true,
    pfEmployeeRate: 12, pfWageCap: 15000, pfApplyIfGrossAbove: null,
    esiEmployeeRate: 0.75, esiEmployerRate: 3.25, esiGrossCeiling: 21000,
    carryForwardLeave: true, monthlyPaidLeaveAccrual: 1.5,
    attendanceBonusAmount: null, attendanceBonusIfLopLte: null,
  };
}

const COMPONENT_TYPES = ['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION'] as const;
const CALC_METHODS = ['FIXED', 'PERCENTAGE', 'FORMULA', 'BALANCING', 'CONDITIONAL_FIXED'] as const;
const ROUND_RULES = ['NONE', 'ROUND', 'ROUND_UP', 'ROUND_DOWN'] as const;
const BASE_OPTIONS = ['GROSS', 'BASIC', 'CTC', 'PF_WAGE', 'ESI_WAGE', 'EARNINGS_SUM'] as const;

const INDIAN_STATES = [
  { code: 'AP', name: 'Andhra Pradesh' }, { code: 'AR', name: 'Arunachal Pradesh' },
  { code: 'AS', name: 'Assam' }, { code: 'BR', name: 'Bihar' },
  { code: 'CT', name: 'Chhattisgarh' }, { code: 'GA', name: 'Goa' },
  { code: 'GJ', name: 'Gujarat' }, { code: 'HR', name: 'Haryana' },
  { code: 'HP', name: 'Himachal Pradesh' }, { code: 'JH', name: 'Jharkhand' },
  { code: 'KA', name: 'Karnataka' }, { code: 'KL', name: 'Kerala' },
  { code: 'MP', name: 'Madhya Pradesh' }, { code: 'MH', name: 'Maharashtra' },
  { code: 'MN', name: 'Manipur' }, { code: 'ML', name: 'Meghalaya' },
  { code: 'MZ', name: 'Mizoram' }, { code: 'NL', name: 'Nagaland' },
  { code: 'OD', name: 'Odisha' }, { code: 'PB', name: 'Punjab' },
  { code: 'RJ', name: 'Rajasthan' }, { code: 'SK', name: 'Sikkim' },
  { code: 'TN', name: 'Tamil Nadu' }, { code: 'TS', name: 'Telangana' },
  { code: 'TR', name: 'Tripura' }, { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'UK', name: 'Uttarakhand' }, { code: 'WB', name: 'West Bengal' },
  { code: 'DL', name: 'Delhi' },
];

@Component({
  selector: 'app-client-payroll-config',
  standalone: true,
  imports: [CommonModule, FormsModule, ClientContextStripComponent],
  templateUrl: './client-payroll-config.component.html',
  styleUrls: ['./client-payroll-config.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientPayrollConfigComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  /* ── State ───────────────────────────────────────────────────────────────── */
  loading = true;
  saving = false;

  clients: PayrollClient[] = [];
  selectedClientId = '';
  structures: ClientStructure[] = [];
  selectedStructure: ClientStructure | null = null;

  // View mode
  view: 'list' | 'form' | 'detail' = 'list';

  // Form
  structureForm = {
    name: '', code: '', effectiveFrom: '', effectiveTo: '', isActive: true, isDefault: false,
  };
  componentForms: ComponentForm[] = [];
  statConfigForms: StatConfigForm[] = [];

  // Preview
  previewForm = { gross: 25000, lopDays: 0, stateCode: 'TS', month: new Date().getMonth() + 1, year: new Date().getFullYear() };
  previewResult: CalculatePayrollResult | null = null;
  previewLoading = false;

  // Version clone modal
  showVersionModal = false;
  versionEffectiveFrom = '';

  // Component modal
  showCompModal = false;
  editingCompIdx = -1;
  compForm: ComponentForm = blankComponent(1);

  // Statutory modal
  showStatModal = false;
  editingStatIdx = -1;
  statForm: StatConfigForm = blankStatConfig();

  // Constants for template
  readonly componentTypes = COMPONENT_TYPES;
  readonly calcMethods = CALC_METHODS;
  readonly roundRules = ROUND_RULES;
  readonly baseOptions = BASE_OPTIONS;
  readonly indianStates = INDIAN_STATES;

  constructor(
    private engineApi: PayrollEngineApiService,
    private payrollApi: PayrollApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const routeClientId = this.route.snapshot.paramMap.get('clientId') || '';
    if (routeClientId) this.selectedClientId = routeClientId;
    this.loadClients();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /* ── Data loading ────────────────────────────────────────────────────────── */

  loadClients(): void {
    this.payrollApi.getAssignedClients()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => {
          this.clients = list ?? [];
          if (this.selectedClientId) this.loadStructures();
          else { this.loading = false; this.cdr.markForCheck(); }
        },
        error: () => {
          this.toast.error('Failed to load clients');
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  onClientChange(): void {
    this.selectedStructure = null;
    this.view = 'list';
    if (this.selectedClientId) this.loadStructures();
    else {
      this.structures = [];
      this.cdr.markForCheck();
    }
  }

  loadStructures(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.engineApi.listClientStructures(this.selectedClientId)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (data) => {
          const normalized = (data ?? []).filter((s) => !!s.isActive);
          if (normalized.length) {
            this.structures = normalized;
            return;
          }

          // Fallback: legacy payroll-engine clients may have active structures/rules
          // in pay_salary_structures/pay_rule_sets but not in payroll_client_structures.
          this.loadLegacyStructures();
        },
        error: () => { this.toast.error('Failed to load structures'); },
      });
  }

  private loadLegacyStructures(): void {
    forkJoin({
      structures: this.engineApi.listStructures(this.selectedClientId).pipe(catchError(() => of([]))),
      ruleSets: this.engineApi.listRuleSets(this.selectedClientId).pipe(catchError(() => of([]))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ structures, ruleSets }) => {
        const ruleById = new Map((ruleSets || []).map((r) => [r.id, r]));

        const activeStructures = (structures || []).filter((s) => !!s.isActive);

        const mapped: ClientStructure[] = activeStructures.map((s, idx) => {
          const rs = ruleById.get(s.ruleSetId);
          return {
            id: `legacy-${s.id}`,
            clientId: s.clientId,
            name: s.name,
            code: `LEGACY_${s.scopeType}_${idx + 1}`,
            version: 1,
            effectiveFrom: s.effectiveFrom,
            effectiveTo: s.effectiveTo,
            isActive: !!s.isActive,
            isDefault: s.scopeType === 'TENANT' && !!s.isActive,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            components: [],
            statutoryConfigs: [],
            legacySource: 'pay_salary_structures',
            legacyStructureId: s.id,
            legacyRuleSetId: rs?.id || s.ruleSetId,
          };
        });

        this.structures = mapped;
        if (!mapped.length) {
          this.toast.info('No active structures found for this client in either new or legacy payroll configuration.');
        }
        this.cdr.markForCheck();
      });
  }

  /* ── List helpers ────────────────────────────────────────────────────────── */

  get activeCount(): number { return this.structures.filter(s => s.isActive).length; }
  get defaultStructureName(): string {
    const d = this.structures.find(s => s.isDefault);
    return d ? d.name : 'None';
  }

  selectStructure(s: ClientStructure): void {
    if (s.legacySource) {
      this.selectedStructure = s;
      this.view = 'detail';
      this.previewResult = null;
      this.toast.info('Showing legacy structure in read-only mode. Create a new structure to manage it in this module.');
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();
    this.engineApi.getClientStructure(s.id)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (full) => {
          this.selectedStructure = full;
          this.view = 'detail';
          this.previewResult = null;
        },
        error: () => { this.toast.error('Failed to load structure details'); },
      });
  }

  /* ── Create new structure ────────────────────────────────────────────────── */

  openCreateForm(): void {
    this.structureForm = { name: '', code: '', effectiveFrom: '', effectiveTo: '', isActive: true, isDefault: false };
    this.componentForms = [blankComponent(1)];
    this.statConfigForms = [blankStatConfig()];
    this.view = 'form';
    this.cdr.markForCheck();
  }

  /* ── Component management ────────────────────────────────────────────────── */

  openCompModal(idx?: number): void {
    if (idx !== undefined) {
      this.editingCompIdx = idx;
      this.compForm = { ...this.componentForms[idx] };
    } else {
      this.editingCompIdx = -1;
      this.compForm = blankComponent(this.componentForms.length + 1);
    }
    this.showCompModal = true;
    this.cdr.markForCheck();
  }

  saveComp(): void {
    if (this.editingCompIdx >= 0) {
      this.componentForms[this.editingCompIdx] = { ...this.compForm };
    } else {
      this.componentForms.push({ ...this.compForm });
    }
    this.showCompModal = false;
    this.cdr.markForCheck();
  }

  removeComp(idx: number): void {
    this.componentForms.splice(idx, 1);
    this.componentForms.forEach((c, i) => c.displayOrder = i + 1);
    this.cdr.markForCheck();
  }

  moveComp(idx: number, dir: -1 | 1): void {
    const target = idx + dir;
    if (target < 0 || target >= this.componentForms.length) return;
    const tmp = this.componentForms[idx];
    this.componentForms[idx] = this.componentForms[target];
    this.componentForms[target] = tmp;
    this.componentForms.forEach((c, i) => c.displayOrder = i + 1);
    this.cdr.markForCheck();
  }

  /* ── Statutory config management ─────────────────────────────────────────── */

  openStatModal(idx?: number): void {
    if (idx !== undefined) {
      this.editingStatIdx = idx;
      this.statForm = { ...this.statConfigForms[idx] };
    } else {
      this.editingStatIdx = -1;
      this.statForm = blankStatConfig();
    }
    this.showStatModal = true;
    this.cdr.markForCheck();
  }

  saveStat(): void {
    if (this.editingStatIdx >= 0) {
      this.statConfigForms[this.editingStatIdx] = { ...this.statForm };
    } else {
      this.statConfigForms.push({ ...this.statForm });
    }
    this.showStatModal = false;
    this.cdr.markForCheck();
  }

  removeStat(idx: number): void {
    this.statConfigForms.splice(idx, 1);
    this.cdr.markForCheck();
  }

  getStateName(code: string): string {
    return INDIAN_STATES.find(s => s.code === code)?.name ?? code;
  }

  /* ── Save structure ──────────────────────────────────────────────────────── */

  saveStructure(): void {
    const f = this.structureForm;
    if (!f.name || !f.code || !f.effectiveFrom || !this.componentForms.length) {
      this.toast.error('Fill required fields: Name, Code, Effective From, and at least one component');
      return;
    }

    this.saving = true;
    this.cdr.markForCheck();

    const payload: CreateClientStructurePayload = {
      clientId: this.selectedClientId,
      name: f.name,
      code: f.code,
      effectiveFrom: f.effectiveFrom,
      effectiveTo: f.effectiveTo || undefined,
      isActive: f.isActive,
      isDefault: f.isDefault,
      components: this.componentForms.map(c => ({
        code: c.code, name: c.name, label: c.label,
        type: c.type, calculationMethod: c.calculationMethod,
        displayOrder: c.displayOrder,
        fixedValue: c.fixedValue ?? undefined,
        percentageValue: c.percentageValue ?? undefined,
        basedOn: c.basedOn || undefined,
        formula: c.formula || undefined,
        roundRule: c.roundRule,
        taxable: c.taxable, statutory: c.statutory,
        isVisibleInPayslip: c.isVisibleInPayslip,
        isActive: c.isActive,
      })),
      statutoryConfigs: this.statConfigForms.map(s => ({
        stateCode: s.stateCode,
        minimumWage: s.minimumWage ?? undefined,
        warnIfGrossBelowMinWage: s.warnIfGrossBelowMinWage,
        enablePt: s.enablePt, enablePf: s.enablePf, enableEsi: s.enableEsi,
        pfEmployeeRate: s.pfEmployeeRate, pfWageCap: s.pfWageCap,
        pfApplyIfGrossAbove: s.pfApplyIfGrossAbove ?? undefined,
        esiEmployeeRate: s.esiEmployeeRate, esiEmployerRate: s.esiEmployerRate,
        esiGrossCeiling: s.esiGrossCeiling,
        carryForwardLeave: s.carryForwardLeave,
        monthlyPaidLeaveAccrual: s.monthlyPaidLeaveAccrual,
        attendanceBonusAmount: s.attendanceBonusAmount ?? undefined,
        attendanceBonusIfLopLte: s.attendanceBonusIfLopLte ?? undefined,
      })),
    };

    this.engineApi.createClientStructure(payload)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success('Structure created successfully');
          this.view = 'list';
          this.loadStructures();
        },
        error: () => { this.toast.error('Failed to create structure'); },
      });
  }

  /* ── Version clone ───────────────────────────────────────────────────────── */

  openVersionModal(): void {
    this.versionEffectiveFrom = '';
    this.showVersionModal = true;
    this.cdr.markForCheck();
  }

  cloneVersion(): void {
    if (!this.selectedStructure || !this.versionEffectiveFrom) return;
    if (this.selectedStructure.legacySource) {
      this.toast.info('Legacy structures cannot be cloned from this view. Create a new structure first.');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();

    this.engineApi.createNextVersion(this.selectedStructure.id, this.versionEffectiveFrom)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (newVer) => {
          this.toast.success(`Version ${newVer.version} created`);
          this.showVersionModal = false;
          this.loadStructures();
          this.selectStructure(newVer);
        },
        error: () => { this.toast.error('Failed to create new version'); },
      });
  }

  /* ── Toggle active/default ───────────────────────────────────────────────── */

  toggleActive(): void {
    if (!this.selectedStructure) return;
    if (this.selectedStructure.legacySource) {
      this.toast.info('Legacy structures are read-only in this module.');
      return;
    }
    const newVal = !this.selectedStructure.isActive;
    this.engineApi.updateClientStructure(this.selectedStructure.id, { isActive: newVal } as any)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.selectedStructure!.isActive = newVal;
          this.toast.success(newVal ? 'Structure activated' : 'Structure deactivated');
          this.cdr.markForCheck();
        },
        error: () => { this.toast.error('Failed to update'); },
      });
  }

  /* ── Payroll preview/calculate ───────────────────────────────────────────── */

  calculate(): void {
    if (!this.selectedStructure) return;
    if (this.selectedStructure.legacySource) {
      this.toast.info('Payroll preview is available for new client structures only.');
      return;
    }
    this.previewLoading = true;
    this.previewResult = null;
    this.cdr.markForCheck();

    this.engineApi.calculatePayroll(this.selectedStructure.id, this.previewForm)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.previewLoading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (res) => { this.previewResult = res; },
        error: () => { this.toast.error('Calculation failed'); },
      });
  }

  /* ── Navigation ──────────────────────────────────────────────────────────── */

  backToList(): void {
    this.view = 'list';
    this.selectedStructure = null;
    this.previewResult = null;
    this.cdr.markForCheck();
  }

  /* ── Preview helpers ────────────────────────────────────────────────────── */

  isEarning(key: string): boolean {
    if (!this.selectedStructure) return false;
    const comp = this.selectedStructure.components.find(c => c.code === key);
    return comp ? comp.componentType === 'EARNING' : false;
  }

  isDeduction(key: string): boolean {
    if (!this.selectedStructure) return false;
    const comp = this.selectedStructure.components.find(c => c.code === key);
    if (comp) return comp.componentType === 'DEDUCTION';
    // Statutory deductions (PF, PT, ESI) won't match components
    const dedKeys = ['PF', 'PT', 'ESI_EMPLOYEE', 'ESI'];
    return dedKeys.some(d => key.toUpperCase().includes(d));
  }

  trackComp(_: number, c: StructureComponent): string { return c.id; }
  trackStat(_: number, s: StatutoryConfig): string { return s.id; }
  trackStructure(_: number, s: ClientStructure): string { return s.id; }
}

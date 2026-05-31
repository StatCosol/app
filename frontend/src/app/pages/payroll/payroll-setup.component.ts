import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import {
  ComponentRule,
  PayrollClientSetup,
  PayrollComponent,
  PayrollSetupApiService,
} from './payroll-setup-api.service';
import { PayrollApiService, PayrollClient } from './payroll-api.service';
import {
  PayrollEngineApiService,
  ClientStructure,
  CalculatePayrollResult,
  SalaryStructure,
  StructureItem,
} from './payroll-engine-api.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ClientContextStripComponent } from '../../shared/ui/client-context-strip/client-context-strip.component';
import { LeaveManagementService } from '../client/leave-management.service';
import {
  FormulaBuilderComponent,
  FormulaNode,
} from './formula-builder/formula-builder.component';

type SetupTab =
  | 'statutory'
  | 'pay-cycle'
  | 'leave-policy'
  | 'attendance'
  | 'deductions'
  | 'rules-preview';

interface PayrollSetupViewModel extends PayrollClientSetup {
  updatedAt?: string;
}

interface LocalSetupAddon {
  effectiveFrom: string;
  cycleStartDay: number;
  payoutDay: number;
  lockDay: number;
  arrearMode: 'CURRENT' | 'NEXT';

  leaveAccrualPerMonth: number;
  maxCarryForward: number;
  allowCarryForward: boolean;
  lopMode: 'PRORATED' | 'FULL_DAY';

  attendanceSource: 'MANUAL' | 'BIOMETRIC' | 'INTEGRATION';
  attendanceCutoffDay: number;
  graceMinutes: number;
  autoLockAttendance: boolean;
  syncEnabled: boolean;

  enableLoanRecovery: boolean;
  enableAdvanceRecovery: boolean;
  defaultDeductionCapPct: number;
  recoveryOrder: string;
}

@Component({
  selector: 'app-payroll-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, ClientContextStripComponent, FormulaBuilderComponent],
  templateUrl: './payroll-setup.component.html',
  styleUrls: ['./payroll-setup.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollSetupComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  selectedClientId = '';
  /** True when this component was opened from a client-scoped route
   * (`/payroll/clients/:clientId/setup`). In that case the dropdown is
   * suppressed because the workspace strip already pins the active client. */
  isClientScoped = false;
  clients: PayrollClient[] = [];

  activeTab: SetupTab = 'statutory';
  readonly tabs: Array<{ key: SetupTab; label: string }> = [
    { key: 'statutory', label: 'Statutory Config' },
    { key: 'pay-cycle', label: 'Pay Cycle' },
    { key: 'leave-policy', label: 'Leave / Pay Policy' },
    { key: 'attendance', label: 'Attendance Config' },
    { key: 'deductions', label: 'Deductions / Recovery' },
    { key: 'rules-preview', label: 'Salary Rules & Live Preview' },
  ];

  setup: PayrollSetupViewModel = this.defaultSetup();
  addon: LocalSetupAddon = this.defaultAddon();

  sectionMessages: Record<SetupTab, { text: string; error: boolean }> = {
    statutory: { text: '', error: false },
    'pay-cycle': { text: '', error: false },
    'leave-policy': { text: '', error: false },
    attendance: { text: '', error: false },
    deductions: { text: '', error: false },
    'rules-preview': { text: '', error: false },
  };

  savingSection: Record<SetupTab, boolean> = {
    statutory: false,
    'pay-cycle': false,
    'leave-policy': false,
    attendance: false,
    deductions: false,
    'rules-preview': false,
  };

  sectionValidation: Record<SetupTab, string[]> = {
    statutory: [],
    'pay-cycle': [],
    'leave-policy': [],
    attendance: [],
    deductions: [],
    'rules-preview': [],
  };

  sectionSnapshots: Record<SetupTab, string> = {
    statutory: '',
    'pay-cycle': '',
    'leave-policy': '',
    attendance: '',
    deductions: '',
    'rules-preview': '',
  };

  readonly payCycleOptions = ['MONTHLY', 'WEEKLY', 'BIWEEKLY'];
  readonly attendanceSources = ['MANUAL', 'BIOMETRIC', 'INTEGRATION'] as const;
  readonly lopModes = ['PRORATED', 'FULL_DAY'] as const;

  // EL Accrual
  elAccrualYear = new Date().getFullYear();
  elAccrualMonth = new Date().getMonth() + 1;
  elAccruing = false;
  elAccrualResult = '';
  elAccrualError = false;
  readonly months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' }, { value: 4, label: 'April' },
    { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];

  // Components and deduction rules
  loadingComponents = false;
  components: PayrollComponent[] = [];
  componentSearch = '';
  selectedComponent: PayrollComponent | null = null;

  loadingRules = false;
  rules: ComponentRule[] = [];

  showCompModal = false;
  editingComp = false;
  savingComp = false;
  compFormError = '';
  compForm: Partial<PayrollComponent> = {};

  showRuleModal = false;
  savingRule = false;
  ruleFormError = '';
  ruleForm: Partial<ComponentRule> = {};

  readonly compTypeOptions = ['EARNING', 'DEDUCTION', 'EMPLOYER', 'INFO'];
  readonly ruleTypeOptions = ['FIXED', 'PERCENTAGE', 'SLAB', 'FORMULA'];

  // ── Inline Formula editor (writes to pay_salary_structure_items) ────────
  // Active TENANT-scoped salary structure for the client (lazy-loaded once).
  private activeStructure: SalaryStructure | null = null;
  private structureItems: StructureItem[] = [];
  /** Map of componentId -> formula summary text shown inline in the table. */
  componentFormulaMap: Record<string, string> = {};

  showFormulaModal = false;
  savingFormula = false;
  formulaError = '';
  formulaTargetComponent: PayrollComponent | null = null;
  formulaForm: {
    itemId: string | null;
    calcMethod: 'FIXED' | 'PERCENT' | 'FORMULA';
    fixedAmount: number | null;
    percentage: number | null;
    percentageBase: string;
    formula: string;
    formulaJson: FormulaNode | null;
    roundingMode: 'NONE' | 'ROUND' | 'ROUND_UP' | 'ROUND_DOWN';
    minAmount: number | null;
    maxAmount: number | null;
    enabled: boolean;
  } = this.blankFormulaForm();
  readonly formulaCalcMethods = ['FIXED', 'PERCENT', 'FORMULA'] as const;
  readonly formulaBaseOptions = ['BASIC', 'GROSS', 'CTC', 'PF_WAGE', 'ESI_WAGE', 'EARNINGS_SUM'] as const;
  readonly formulaRoundOptions = ['NONE', 'ROUND', 'ROUND_UP', 'ROUND_DOWN'] as const;

  // Templates + Versions (Phase 2A)
  formulaTemplates: Array<{ id: string; name: string; clientId: string | null; componentId: string | null; formulaJson: any; }> = [];
  selectedTemplateId = '';
  savingTemplate = false;
  structureVersions: Array<{ id: string; versionNo: number; reason: string | null; createdAt: string; itemsSnapshot: any[] }> = [];
  loadingVersions = false;

  private blankFormulaForm() {
    return {
      itemId: null,
      calcMethod: 'FORMULA' as 'FIXED' | 'PERCENT' | 'FORMULA',
      fixedAmount: null,
      percentage: null,
      percentageBase: 'BASIC',
      formula: '',
      formulaJson: null as FormulaNode | null,
      roundingMode: 'ROUND' as 'NONE' | 'ROUND' | 'ROUND_UP' | 'ROUND_DOWN',
      minAmount: null,
      maxAmount: null,
      enabled: true,
    };
  }

  // ── Salary Rules & Live Preview tab ──────────────────────────────────────
  loadingRulesPreview = false;
  clientStructures: ClientStructure[] = [];
  selectedStructureId = '';
  stateSlabsLoading = false;
  stateSlabs: Array<{
    source: string;
    stateCode: string;
    componentCode: string;
    slabs: Array<{
      fromAmount: number;
      toAmount: number | null;
      valueAmount: number | null;
      valuePercent: number | null;
    }>;
  }> = [];
  preview = {
    gross: 25000,
    lopDays: 0,
    stateCode: 'TS',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  };
  previewResult: CalculatePayrollResult | null = null;
  previewLoading = false;
  readonly indianStates: Array<{ code: string; name: string }> = [
    { code: 'AP', name: 'Andhra Pradesh' }, { code: 'AS', name: 'Assam' },
    { code: 'BR', name: 'Bihar' }, { code: 'CG', name: 'Chhattisgarh' },
    { code: 'DL', name: 'Delhi' }, { code: 'GA', name: 'Goa' },
    { code: 'GJ', name: 'Gujarat' }, { code: 'HR', name: 'Haryana' },
    { code: 'HP', name: 'Himachal Pradesh' }, { code: 'JH', name: 'Jharkhand' },
    { code: 'JK', name: 'Jammu & Kashmir' }, { code: 'KA', name: 'Karnataka' },
    { code: 'KL', name: 'Kerala' }, { code: 'MP', name: 'Madhya Pradesh' },
    { code: 'MH', name: 'Maharashtra' }, { code: 'MN', name: 'Manipur' },
    { code: 'ML', name: 'Meghalaya' }, { code: 'MZ', name: 'Mizoram' },
    { code: 'NL', name: 'Nagaland' }, { code: 'OD', name: 'Odisha' },
    { code: 'PB', name: 'Punjab' }, { code: 'RJ', name: 'Rajasthan' },
    { code: 'SK', name: 'Sikkim' }, { code: 'TN', name: 'Tamil Nadu' },
    { code: 'TS', name: 'Telangana' }, { code: 'TR', name: 'Tripura' },
    { code: 'UP', name: 'Uttar Pradesh' }, { code: 'UK', name: 'Uttarakhand' },
    { code: 'WB', name: 'West Bengal' },
  ];

  constructor(
    private readonly setupApi: PayrollSetupApiService,
    private readonly payrollApi: PayrollApiService,
    private readonly engineApi: PayrollEngineApiService,
    private readonly leaveMgmtSvc: LeaveManagementService,
    private readonly toast: ToastService,
    private readonly dialog: ConfirmDialogService,
    private readonly cdr: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const routeClientId = this.route.snapshot.paramMap.get('clientId') || '';
    if (routeClientId) {
      this.isClientScoped = true;
      this.selectedClientId = routeClientId;
      // No need to load the full client list — the workspace strip pins the
      // active client and the dropdown is hidden in this mode.
      this.onClientChange();
    } else {
      // No client in route -> load assigned clients and auto-select first.
      this.loadClients();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get filteredComponents(): PayrollComponent[] {
    const q = this.componentSearch.trim().toLowerCase();
    if (!q) return this.components;
    return this.components.filter((c) => {
      const text = `${c.code} ${c.name} ${c.componentType}`.toLowerCase();
      return text.includes(q);
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

  onClientChange(): void {
    if (!this.selectedClientId) return;

    this.loading = true;
    this.clearMessages();
    this.setup = this.defaultSetup();
    this.addon = this.defaultAddon();
    this.resetSectionSnapshots();
    this.clearValidationIssues();
    this.components = [];
    this.selectedComponent = null;
    this.rules = [];

    this.setupApi
      .getSetup(this.selectedClientId)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of({ clientId: this.selectedClientId, exists: false })),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((raw) => {
        this.setup = this.mapSetup(raw);
        this.addon = this.mapAddon(raw);
        this.clearValidationIssues();
        this.refreshSectionSnapshots();
        this.loadComponents();
        this.loadRulesPreview();
      });
  }

  isSectionDirty(tab: SetupTab): boolean {
    return this.captureSectionSnapshot(tab) !== this.sectionSnapshots[tab];
  }

  sectionIssueCount(tab: SetupTab): number {
    return this.sectionValidation[tab].length;
  }

  sectionContext(tab: SetupTab): string {
    const status = this.isSectionDirty(tab) ? 'Unsaved changes' : 'Saved';
    const issueCount = this.sectionIssueCount(tab);
    const issueText = issueCount ? ` · ${issueCount} issue${issueCount > 1 ? 's' : ''}` : '';
    return `Effective ${this.formatDate(this.addon.effectiveFrom)} · Last update ${this.formatDate(this.setup.updatedAt)} · ${status}${issueText}`;
  }

  saveStatutory(): void {
    if (!this.selectedClientId) return;
    const errors = this.validateStatutory();
    this.setValidationIssues('statutory', errors);
    if (errors.length) {
      this.setSectionMessage('statutory', errors[0], true);
      this.toast.error(errors[0]);
      return;
    }

    this.savingSection.statutory = true;
    const payload: Partial<PayrollClientSetup> = {
      pfEnabled: this.setup.pfEnabled,
      esiEnabled: this.setup.esiEnabled,
      ptEnabled: this.setup.ptEnabled,
      lwfEnabled: this.setup.lwfEnabled,
      pfEmployerRate: this.setup.pfEmployerRate,
      pfEmployeeRate: this.setup.pfEmployeeRate,
      esiEmployerRate: this.setup.esiEmployerRate,
      esiEmployeeRate: this.setup.esiEmployeeRate,
      pfWageCeiling: this.setup.pfWageCeiling,
      pfGrossThreshold: this.setup.pfGrossThreshold,
      esiWageCeiling: this.setup.esiWageCeiling,
    };

    this.setupApi
      .saveSetup(this.selectedClientId, payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingSection.statutory = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (saved) => {
          this.setup = this.mapSetup(saved || this.setup);
          this.addon = this.mapAddon(saved || this.setup);
          this.setValidationIssues('statutory', []);
          this.refreshSectionSnapshots();
          this.setSectionMessage('statutory', 'Statutory configuration saved.');
          this.toast.success('Statutory configuration saved');
        },
        error: (err) => {
          const msg = err?.error?.message || 'Unable to save statutory configuration';
          this.setSectionMessage('statutory', msg, true);
          this.toast.error(msg);
        },
      });
  }

  savePayCycle(): void {
    if (!this.selectedClientId) return;
    const errors = this.validatePayCycle();
    this.setValidationIssues('pay-cycle', errors);
    if (errors.length) {
      this.setSectionMessage('pay-cycle', errors[0], true);
      this.toast.error(errors[0]);
      return;
    }

    this.savingSection['pay-cycle'] = true;
    this.setupApi
      .saveSetup(this.selectedClientId, {
        payCycle: this.setup.payCycle,
        effectiveFrom: this.addon.effectiveFrom || undefined,
        cycleStartDay: this.addon.cycleStartDay,
        payoutDay: this.addon.payoutDay,
        lockDay: this.addon.lockDay,
        arrearMode: this.addon.arrearMode,
        wageBasisDays: this.setup.wageBasisDays,
        otMultiplier: this.setup.otMultiplier as any,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingSection['pay-cycle'] = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (saved) => {
          this.setup = this.mapSetup(saved || this.setup);
          this.addon = this.mapAddon(saved || this.setup);
          this.setValidationIssues('pay-cycle', []);
          this.refreshSectionSnapshots();
          this.setSectionMessage('pay-cycle', 'Pay cycle settings saved.');
          this.toast.success('Pay cycle settings saved');
        },
        error: (err) => {
          const msg = err?.error?.message || 'Unable to save pay cycle settings';
          this.setSectionMessage('pay-cycle', msg, true);
          this.toast.error(msg);
        },
      });
  }

  saveLeavePolicy(): void {
    if (!this.selectedClientId) return;
    const errors = this.validateLeavePolicy();
    this.setValidationIssues('leave-policy', errors);
    if (errors.length) {
      this.setSectionMessage('leave-policy', errors[0], true);
      this.toast.error(errors[0]);
      return;
    }

    this.savingSection['leave-policy'] = true;
    this.setupApi
      .saveSetup(this.selectedClientId, {
        leaveAccrualPerMonth: this.addon.leaveAccrualPerMonth,
        maxCarryForward: this.addon.maxCarryForward,
        allowCarryForward: this.addon.allowCarryForward,
        lopMode: this.addon.lopMode,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingSection['leave-policy'] = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (saved) => {
          this.setup = this.mapSetup(saved || this.setup);
          this.addon = this.mapAddon(saved || this.setup);
          this.setValidationIssues('leave-policy', []);
          this.refreshSectionSnapshots();
          this.setSectionMessage('leave-policy', 'Leave and pay policy saved.');
          this.toast.success('Leave policy saved');
        },
        error: (err) => {
          const msg = err?.error?.message || 'Unable to save leave/pay policy';
          this.setSectionMessage('leave-policy', msg, true);
          this.toast.error(msg);
        },
      });
  }

  accrueEL(): void {
    if (!this.selectedClientId) {
      this.toast.error('Select a client first');
      return;
    }
    this.elAccruing = true;
    this.elAccrualResult = '';
    this.elAccrualError = false;
    this.leaveMgmtSvc
      .accrueEL(this.elAccrualYear, this.elAccrualMonth)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.elAccruing = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.elAccrualResult = res?.message || `Accrued: ${res?.accrued}, Skipped: ${res?.skipped}, Already done: ${res?.alreadyAccrued}`;
          this.elAccrualError = false;
          this.toast.success(this.elAccrualResult);
        },
        error: (err) => {
          this.elAccrualResult = err?.error?.message || 'EL accrual failed';
          this.elAccrualError = true;
          this.toast.error(this.elAccrualResult);
        },
      });
  }

  saveAttendanceConfig(): void {
    if (!this.selectedClientId) return;
    const errors = this.validateAttendance();
    this.setValidationIssues('attendance', errors);
    if (errors.length) {
      this.setSectionMessage('attendance', errors[0], true);
      this.toast.error(errors[0]);
      return;
    }

    this.savingSection.attendance = true;
    this.setupApi
      .saveSetup(this.selectedClientId, {
        attendanceSource: this.addon.attendanceSource,
        attendanceCutoffDay: this.addon.attendanceCutoffDay,
        graceMinutes: this.addon.graceMinutes,
        autoLockAttendance: this.addon.autoLockAttendance,
        syncEnabled: this.addon.syncEnabled,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingSection.attendance = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (saved) => {
          this.setup = this.mapSetup(saved || this.setup);
          this.addon = this.mapAddon(saved || this.setup);
          this.setValidationIssues('attendance', []);
          this.refreshSectionSnapshots();
          this.setSectionMessage('attendance', 'Attendance configuration saved.');
          this.toast.success('Attendance config saved');
        },
        error: (err) => {
          const msg = err?.error?.message || 'Unable to save attendance configuration';
          this.setSectionMessage('attendance', msg, true);
          this.toast.error(msg);
        },
      });
  }

  saveDeductionsConfig(): void {
    if (!this.selectedClientId) return;
    const errors = this.validateDeductions();
    this.setValidationIssues('deductions', errors);
    if (errors.length) {
      this.setSectionMessage('deductions', errors[0], true);
      this.toast.error(errors[0]);
      return;
    }

    this.savingSection.deductions = true;
    this.setupApi
      .saveSetup(this.selectedClientId, {
        enableLoanRecovery: this.addon.enableLoanRecovery,
        enableAdvanceRecovery: this.addon.enableAdvanceRecovery,
        defaultDeductionCapPct: this.addon.defaultDeductionCapPct,
        recoveryOrder: this.addon.recoveryOrder.trim(),
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingSection.deductions = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (saved) => {
          this.setup = this.mapSetup(saved || this.setup);
          this.addon = this.mapAddon(saved || this.setup);
          this.setValidationIssues('deductions', []);
          this.refreshSectionSnapshots();
          this.setSectionMessage('deductions', 'Deduction/recovery preferences saved.');
          this.toast.success('Deductions preferences saved');
        },
        error: (err) => {
          const msg = err?.error?.message || 'Unable to save deduction/recovery preferences';
          this.setSectionMessage('deductions', msg, true);
          this.toast.error(msg);
        },
      });
  }

  // Components and rules ------------------------------------------------------

  loadComponents(): void {
    if (!this.selectedClientId) return;
    this.loadingComponents = true;

    this.setupApi
      .listComponents(this.selectedClientId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingComponents = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.components = rows || [];
          // Lazy-load active structure so the formula column populates.
          this.loadActiveStructureFormulas(true);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to load payroll components'),
      });
  }

  openCompForm(component?: PayrollComponent): void {
    this.compFormError = '';
    if (component) {
      this.editingComp = true;
      this.compForm = { ...component };
    } else {
      this.editingComp = false;
      this.compForm = {
        code: '',
        name: '',
        componentType: 'EARNING',
        displayOrder: this.components.length + 1,
        affectsPfWage: false,
        affectsEsiWage: false,
        isTaxable: false,
        isRequired: false,
      };
    }
    this.showCompModal = true;
  }

  saveComp(): void {
    if (!this.selectedClientId) return;
    if (!this.compForm.code?.trim() || !this.compForm.name?.trim()) {
      this.compFormError = 'Code and Name are required';
      return;
    }

    this.savingComp = true;
    const req$ = this.editingComp
      ? this.setupApi.updateComponent(
          this.selectedClientId,
          String(this.compForm.id),
          this.compForm,
        )
      : this.setupApi.createComponent(this.selectedClientId, this.compForm);

    req$
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingComp = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.showCompModal = false;
          this.toast.success(this.editingComp ? 'Component updated' : 'Component created');
          this.loadComponents();
        },
        error: (err) => {
          const msg = err?.error?.message || 'Failed to save component';
          this.compFormError = msg;
          this.toast.error(msg);
        },
      });
  }

  async deleteComp(component: PayrollComponent): Promise<void> {
    if (!this.selectedClientId) return;
    const ok = await this.dialog.confirm(
      'Delete Component',
      `Delete component "${component.name}"?`,
      { confirmText: 'Delete', variant: 'danger' },
    );
    if (!ok) return;

    this.setupApi
      .deleteComponent(this.selectedClientId, component.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Component deleted');
          if (this.selectedComponent?.id === component.id) {
            this.selectedComponent = null;
            this.rules = [];
          }
          this.loadComponents();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to delete component'),
      });
  }

  openRules(component: PayrollComponent): void {
    this.selectedComponent = component;
    this.loadRules();
  }

  loadRules(): void {
    if (!this.selectedClientId || !this.selectedComponent) return;
    this.loadingRules = true;

    this.setupApi
      .listRules(this.selectedClientId, this.selectedComponent.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingRules = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.rules = rows || [];
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to load component rules'),
      });
  }

  openRuleForm(): void {
    if (!this.selectedComponent) {
      this.toast.error('Select a component first');
      return;
    }
    this.ruleFormError = '';
    this.ruleForm = {
      ruleType: 'FIXED',
      priority: 0,
      fixedAmount: null,
      percentage: null,
      baseComponent: '',
      formula: '',
    };
    this.showRuleModal = true;
  }

  saveRule(): void {
    if (!this.selectedClientId || !this.selectedComponent) return;
    if (!this.ruleForm.ruleType) {
      this.ruleFormError = 'Rule type is required';
      return;
    }
    if (this.ruleForm.ruleType === 'FIXED' && this.ruleForm.fixedAmount === null) {
      this.ruleFormError = 'Fixed amount is required for FIXED rule';
      return;
    }
    if (this.ruleForm.ruleType === 'PERCENTAGE' && (this.ruleForm.percentage === null || !this.ruleForm.baseComponent)) {
      this.ruleFormError = 'Percentage and Base Component are required';
      return;
    }

    this.savingRule = true;
    this.setupApi
      .createRule(this.selectedClientId, this.selectedComponent.id, this.ruleForm)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingRule = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.showRuleModal = false;
          this.toast.success('Rule added');
          this.loadRules();
        },
        error: (err) => {
          this.ruleFormError = err?.error?.message || 'Failed to save rule';
          this.toast.error(this.ruleFormError);
        },
      });
  }

  async deleteRule(rule: ComponentRule): Promise<void> {
    if (!this.selectedClientId || !this.selectedComponent) return;
    const ok = await this.dialog.confirm(
      'Delete Rule',
      'Delete this rule?',
      { confirmText: 'Delete', variant: 'danger' },
    );
    if (!ok) return;

    this.setupApi
      .deleteRule(this.selectedClientId, this.selectedComponent.id, rule.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Rule deleted');
          this.loadRules();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to delete rule'),
      });
  }

  // ── Inline Formula editor (active salary structure items) ────────────────

  /**
   * Load (and cache) the active TENANT-scoped salary structure for the
   * current client and build a `componentId -> summary` map for inline
   * display in the Component & Rule Management table.
   */
  loadActiveStructureFormulas(force = false): void {
    if (!this.selectedClientId) return;
    if (!force && this.activeStructure) return;

    this.engineApi
      .listStructures(this.selectedClientId)
      .pipe(takeUntil(this.destroy$), catchError(() => of([] as SalaryStructure[])))
      .subscribe((rows) => {
        const tenant = (rows || []).find(
          (s) => s.isActive && s.scopeType === 'TENANT',
        ) || (rows || []).find((s) => s.isActive) || null;
        this.activeStructure = tenant;
        if (!tenant) {
          this.structureItems = [];
          this.componentFormulaMap = {};
          this.cdr.markForCheck();
          return;
        }
        this.engineApi
          .listStructureItems(tenant.id)
          .pipe(takeUntil(this.destroy$), catchError(() => of([] as StructureItem[])))
          .subscribe((items) => {
            this.structureItems = items || [];
            const map: Record<string, string> = {};
            for (const it of this.structureItems) {
              map[it.componentId] = this.formatStructureItem(it);
            }
            this.componentFormulaMap = map;
            this.cdr.markForCheck();
          });
      });
  }

  formatStructureItem(it: StructureItem): string {
    if (!it.enabled) return '(disabled)';
    switch (it.calcMethod) {
      case 'FIXED':
        return `= ${it.fixedAmount ?? 0}`;
      case 'PERCENT':
        return `= ${it.percentage ?? 0}% of ${it.percentageBase || 'BASIC'}`;
      case 'FORMULA':
        return it.formula ? `= ${it.formula}` : '(empty formula)';
      case 'BALANCING':
        return '= balancing';
      case 'SLAB':
        return '= slab';
      default:
        return '';
    }
  }

  /** Open the inline Formula editor for the selected component. */
  openFormulaEditor(component: PayrollComponent): void {
    this.formulaError = '';
    this.formulaTargetComponent = component;

    if (!this.activeStructure) {
      // Try to load now; user can retry once it arrives.
      this.loadActiveStructureFormulas(true);
      this.toast.error(
        'No active salary structure loaded yet — try again in a moment, or create one in Builder.',
      );
      return;
    }

    const existing = this.structureItems.find((i) => i.componentId === component.id);
    this.formulaForm = existing
      ? {
          itemId: existing.id,
          calcMethod: (existing.calcMethod === 'FIXED' || existing.calcMethod === 'PERCENT' || existing.calcMethod === 'FORMULA')
            ? existing.calcMethod
            : 'FORMULA',
          fixedAmount: existing.fixedAmount,
          percentage: existing.percentage,
          percentageBase: existing.percentageBase || 'BASIC',
          formula: existing.formula || '',
          formulaJson: (existing.formulaJson as FormulaNode | null) || null,
          roundingMode: (existing.roundingMode as any) || 'ROUND',
          minAmount: existing.minAmount,
          maxAmount: existing.maxAmount,
          enabled: existing.enabled,
        }
      : this.blankFormulaForm();

    this.showFormulaModal = true;
    this.selectedTemplateId = '';
    this.loadFormulaTemplates(component.id);
    this.loadStructureVersions();
  }

  /** Load templates filtered by client + component. */
  private loadFormulaTemplates(componentId: string): void {
    this.formulaTemplates = [];
    this.engineApi
      .listFormulaTemplates(this.selectedClientId, componentId)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([] as any[])),
      )
      .subscribe((list) => {
        this.formulaTemplates = list || [];
        this.cdr.markForCheck();
      });
  }

  applySelectedTemplate(): void {
    const tpl = this.formulaTemplates.find((t) => t.id === this.selectedTemplateId);
    if (!tpl) return;
    this.formulaForm.formulaJson = tpl.formulaJson as FormulaNode;
    this.formulaForm.calcMethod = 'FORMULA';
    this.toast.success(`Loaded template "${tpl.name}"`);
  }

  async saveAsTemplate(): Promise<void> {
    if (!this.formulaForm.formulaJson || !this.formulaTargetComponent) return;
    const result = await this.dialog.prompt(
      'Save Formula Template',
      'Template name:',
      {
        defaultValue: `${this.formulaTargetComponent.code} formula`,
        placeholder: 'Template name',
        confirmText: 'Save',
      },
    );
    const name = (result.value || '').trim();
    if (!name?.trim()) return;
    this.savingTemplate = true;
    this.engineApi
      .createFormulaTemplate({
        name,
        clientId: this.selectedClientId || null,
        componentId: this.formulaTargetComponent.id,
        formulaJson: this.formulaForm.formulaJson,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingTemplate = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (saved) => {
          this.toast.success(`Template "${saved.name}" saved`);
          if (this.formulaTargetComponent) {
            this.loadFormulaTemplates(this.formulaTargetComponent.id);
          }
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to save template');
        },
      });
  }

  toggleVersions(): void {
    if (this.structureVersions.length || this.loadingVersions) return;
    this.loadStructureVersions();
  }

  private loadStructureVersions(): void {
    if (!this.activeStructure) return;
    this.loadingVersions = true;
    this.engineApi
      .listStructureVersions(this.activeStructure.id)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([] as any[])),
        finalize(() => {
          this.loadingVersions = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((list) => {
        this.structureVersions = list || [];
      });
  }

  saveFormula(): void {
    if (!this.activeStructure || !this.formulaTargetComponent) return;

    // Basic validation
    if (this.formulaForm.calcMethod === 'FIXED' && this.formulaForm.fixedAmount == null) {
      this.formulaError = 'Fixed amount is required';
      return;
    }
    if (this.formulaForm.calcMethod === 'PERCENT'
        && (this.formulaForm.percentage == null || !this.formulaForm.percentageBase)) {
      this.formulaError = 'Percentage and Base are required';
      return;
    }
    if (this.formulaForm.calcMethod === 'FORMULA'
        && !this.formulaForm.formulaJson
        && !this.formulaForm.formula?.trim()) {
      this.formulaError = 'Formula is required';
      return;
    }

    const structureId = this.activeStructure.id;
    const body: Partial<StructureItem> = {
      componentId: this.formulaTargetComponent.id,
      calcMethod: this.formulaForm.calcMethod,
      fixedAmount: this.formulaForm.calcMethod === 'FIXED' ? this.formulaForm.fixedAmount : null,
      percentage: this.formulaForm.calcMethod === 'PERCENT' ? this.formulaForm.percentage : null,
      percentageBase: this.formulaForm.calcMethod === 'PERCENT' ? this.formulaForm.percentageBase : null,
      formula: this.formulaForm.calcMethod === 'FORMULA' ? (this.formulaForm.formula || '').trim() || null : null,
      formulaJson: this.formulaForm.calcMethod === 'FORMULA' ? this.formulaForm.formulaJson : null,
      roundingMode: this.formulaForm.roundingMode,
      minAmount: this.formulaForm.minAmount,
      maxAmount: this.formulaForm.maxAmount,
      enabled: this.formulaForm.enabled,
    };

    this.savingFormula = true;
    const req$ = this.formulaForm.itemId
      ? this.engineApi.updateStructureItem(structureId, this.formulaForm.itemId, body)
      : this.engineApi.createStructureItem(structureId, body);

    req$
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.savingFormula = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Formula saved — applies to next payroll run');
          this.showFormulaModal = false;
          this.formulaTargetComponent = null;
          this.loadActiveStructureFormulas(true);
          this.structureVersions = []; // force reload next open
        },
        error: (err) => {
          this.formulaError = err?.error?.message || 'Failed to save formula';
          this.toast.error(this.formulaError);
        },
      });
  }

  // Helpers -------------------------------------------------------------------

  ruleSummary(rule: ComponentRule): string {
    if (rule.ruleType === 'FIXED') return `Fixed: ${rule.fixedAmount ?? 0}`;
    if (rule.ruleType === 'PERCENTAGE') return `Percent: ${rule.percentage ?? 0}% of ${rule.baseComponent || '-'}`;
    if (rule.ruleType === 'FORMULA') return `Formula: ${rule.formula || '-'}`;
    if (rule.ruleType === 'SLAB') return `Slabs: ${rule.slabs?.length || 0}`;
    return '-';
  }

  private loadClients(): void {
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

  private mapSetup(raw: any): PayrollSetupViewModel {
    const defaults = this.defaultSetup();
    return {
      clientId: String(raw?.clientId || this.selectedClientId || ''),
      pfEnabled: this.boolOrDefault(raw?.pfEnabled ?? raw?.pf_enabled, defaults.pfEnabled),
      esiEnabled: this.boolOrDefault(raw?.esiEnabled ?? raw?.esi_enabled, defaults.esiEnabled),
      ptEnabled: this.boolOrDefault(raw?.ptEnabled ?? raw?.pt_enabled, defaults.ptEnabled),
      lwfEnabled: this.boolOrDefault(raw?.lwfEnabled ?? raw?.lwf_enabled, defaults.lwfEnabled),
      pfEmployerRate: this.numberOrDefault(raw?.pfEmployerRate ?? raw?.pf_employer_rate, defaults.pfEmployerRate),
      pfEmployeeRate: this.numberOrDefault(raw?.pfEmployeeRate ?? raw?.pf_employee_rate, defaults.pfEmployeeRate),
      esiEmployerRate: this.numberOrDefault(raw?.esiEmployerRate ?? raw?.esi_employer_rate, defaults.esiEmployerRate),
      esiEmployeeRate: this.numberOrDefault(raw?.esiEmployeeRate ?? raw?.esi_employee_rate, defaults.esiEmployeeRate),
      pfWageCeiling: this.numberOrDefault(raw?.pfWageCeiling ?? raw?.pf_wage_ceiling, defaults.pfWageCeiling),
      pfGrossThreshold: this.numberOrDefault(raw?.pfGrossThreshold ?? raw?.pf_gross_threshold, defaults.pfGrossThreshold),
      esiWageCeiling: this.numberOrDefault(raw?.esiWageCeiling ?? raw?.esi_wage_ceiling, defaults.esiWageCeiling),
      payCycle: String(raw?.payCycle ?? raw?.pay_cycle ?? defaults.payCycle),
      effectiveFrom: String(raw?.effectiveFrom ?? raw?.effective_from ?? defaults.effectiveFrom),
      cycleStartDay: this.numberOrDefault(raw?.cycleStartDay ?? raw?.cycle_start_day, defaults.cycleStartDay),
      payoutDay: this.numberOrDefault(raw?.payoutDay ?? raw?.payout_day, defaults.payoutDay),
      lockDay: this.numberOrDefault(raw?.lockDay ?? raw?.lock_day, defaults.lockDay),
      arrearMode: String(raw?.arrearMode ?? raw?.arrear_mode ?? defaults.arrearMode) as 'CURRENT' | 'NEXT',
      leaveAccrualPerMonth: this.numberOrDefault(
        raw?.leaveAccrualPerMonth ?? raw?.leave_accrual_per_month,
        defaults.leaveAccrualPerMonth,
      ),
      maxCarryForward: this.numberOrDefault(raw?.maxCarryForward ?? raw?.max_carry_forward, defaults.maxCarryForward),
      allowCarryForward: this.boolOrDefault(
        raw?.allowCarryForward ?? raw?.allow_carry_forward,
        defaults.allowCarryForward,
      ),
      lopMode: String(raw?.lopMode ?? raw?.lop_mode ?? defaults.lopMode) as 'PRORATED' | 'FULL_DAY',
      attendanceSource: String(
        raw?.attendanceSource ?? raw?.attendance_source ?? defaults.attendanceSource,
      ) as 'MANUAL' | 'BIOMETRIC' | 'INTEGRATION',
      attendanceCutoffDay: this.numberOrDefault(
        raw?.attendanceCutoffDay ?? raw?.attendance_cutoff_day,
        defaults.attendanceCutoffDay,
      ),
      graceMinutes: this.numberOrDefault(raw?.graceMinutes ?? raw?.grace_minutes, defaults.graceMinutes),
      autoLockAttendance: this.boolOrDefault(
        raw?.autoLockAttendance ?? raw?.auto_lock_attendance,
        defaults.autoLockAttendance,
      ),
      syncEnabled: this.boolOrDefault(raw?.syncEnabled ?? raw?.sync_enabled, defaults.syncEnabled),
      enableLoanRecovery: this.boolOrDefault(
        raw?.enableLoanRecovery ?? raw?.enable_loan_recovery,
        defaults.enableLoanRecovery,
      ),
      enableAdvanceRecovery: this.boolOrDefault(
        raw?.enableAdvanceRecovery ?? raw?.enable_advance_recovery,
        defaults.enableAdvanceRecovery,
      ),
      defaultDeductionCapPct: this.numberOrDefault(
        raw?.defaultDeductionCapPct ?? raw?.default_deduction_cap_pct,
        defaults.defaultDeductionCapPct,
      ),
      recoveryOrder: String(raw?.recoveryOrder ?? raw?.recovery_order ?? defaults.recoveryOrder),
      wageBasisDays: (String(
        raw?.wageBasisDays ?? raw?.wage_basis_days ?? defaults.wageBasisDays,
      ) as 'FIXED_26' | 'CALENDAR_DAYS' | 'WORKING_DAYS'),
      otMultiplier: this.numberOrDefault(raw?.otMultiplier ?? raw?.ot_multiplier, defaults.otMultiplier),
      updatedAt: raw?.updatedAt || raw?.updated_at || '',
    };
  }

  private mapAddon(raw: any): LocalSetupAddon {
    const mapped = this.mapSetup(raw);
    return {
      effectiveFrom: mapped.effectiveFrom,
      cycleStartDay: mapped.cycleStartDay,
      payoutDay: mapped.payoutDay,
      lockDay: mapped.lockDay,
      arrearMode: mapped.arrearMode,
      leaveAccrualPerMonth: mapped.leaveAccrualPerMonth,
      maxCarryForward: mapped.maxCarryForward,
      allowCarryForward: mapped.allowCarryForward,
      lopMode: mapped.lopMode,
      attendanceSource: mapped.attendanceSource,
      attendanceCutoffDay: mapped.attendanceCutoffDay,
      graceMinutes: mapped.graceMinutes,
      autoLockAttendance: mapped.autoLockAttendance,
      syncEnabled: mapped.syncEnabled,
      enableLoanRecovery: mapped.enableLoanRecovery,
      enableAdvanceRecovery: mapped.enableAdvanceRecovery,
      defaultDeductionCapPct: mapped.defaultDeductionCapPct,
      recoveryOrder: mapped.recoveryOrder,
    };
  }

  private validateStatutory(): string[] {
    const errors: string[] = [];
    if (this.setup.pfEmployerRate < 0 || this.setup.pfEmployerRate > 100) errors.push('PF employer rate must be between 0 and 100');
    if (this.setup.pfEmployeeRate < 0 || this.setup.pfEmployeeRate > 100) errors.push('PF employee rate must be between 0 and 100');
    if (this.setup.esiEmployerRate < 0 || this.setup.esiEmployerRate > 100) errors.push('ESI employer rate must be between 0 and 100');
    if (this.setup.esiEmployeeRate < 0 || this.setup.esiEmployeeRate > 100) errors.push('ESI employee rate must be between 0 and 100');
    if (this.setup.pfWageCeiling <= 0) errors.push('PF wage ceiling must be positive');
    if (this.setup.esiWageCeiling <= 0) errors.push('ESI wage ceiling must be positive');
    return errors;
  }

  private validatePayCycle(): string[] {
    const errors: string[] = [];
    if (!this.payCycleOptions.includes(this.setup.payCycle)) errors.push('Select a valid pay cycle');
    if (this.addon.cycleStartDay < 1 || this.addon.cycleStartDay > 31) errors.push('Cycle start day must be between 1 and 31');
    if (this.addon.payoutDay < 1 || this.addon.payoutDay > 31) errors.push('Payout day must be between 1 and 31');
    if (this.addon.lockDay < 1 || this.addon.lockDay > 31) errors.push('Payroll lock day must be between 1 and 31');
    return errors;
  }

  private validateLeavePolicy(): string[] {
    const errors: string[] = [];
    if (this.addon.leaveAccrualPerMonth < 0 || this.addon.leaveAccrualPerMonth > 5) errors.push('Leave accrual per month should be between 0 and 5');
    if (this.addon.maxCarryForward < 0 || this.addon.maxCarryForward > 120) errors.push('Max carry forward should be between 0 and 120');
    return errors;
  }

  private validateAttendance(): string[] {
    const errors: string[] = [];
    if (this.addon.attendanceCutoffDay < 1 || this.addon.attendanceCutoffDay > 31) errors.push('Attendance cutoff day must be between 1 and 31');
    if (this.addon.graceMinutes < 0 || this.addon.graceMinutes > 180) errors.push('Grace minutes should be between 0 and 180');
    return errors;
  }

  private validateDeductions(): string[] {
    const errors: string[] = [];
    if (this.addon.defaultDeductionCapPct < 0 || this.addon.defaultDeductionCapPct > 100) {
      errors.push('Default deduction cap must be between 0 and 100');
    }
    if (!this.addon.recoveryOrder.trim()) {
      errors.push('Recovery order must be provided');
    }
    return errors;
  }

  private setSectionMessage(tab: SetupTab, text: string, error = false): void {
    this.sectionMessages[tab] = { text, error };
  }

  private clearMessages(): void {
    this.tabs.forEach((tab) => {
      this.sectionMessages[tab.key] = { text: '', error: false };
    });
  }

  private setValidationIssues(tab: SetupTab, issues: string[]): void {
    this.sectionValidation[tab] = issues;
  }

  private clearValidationIssues(): void {
    this.tabs.forEach((tab) => {
      this.sectionValidation[tab.key] = [];
    });
  }

  private resetSectionSnapshots(): void {
    this.tabs.forEach((tab) => {
      this.sectionSnapshots[tab.key] = '';
    });
  }

  private refreshSectionSnapshots(): void {
    this.tabs.forEach((tab) => {
      this.sectionSnapshots[tab.key] = this.captureSectionSnapshot(tab.key);
    });
  }

  private captureSectionSnapshot(tab: SetupTab): string {
    if (tab === 'statutory') {
      return JSON.stringify({
        pfEnabled: this.setup.pfEnabled,
        esiEnabled: this.setup.esiEnabled,
        ptEnabled: this.setup.ptEnabled,
        lwfEnabled: this.setup.lwfEnabled,
        pfEmployerRate: this.setup.pfEmployerRate,
        pfEmployeeRate: this.setup.pfEmployeeRate,
        esiEmployerRate: this.setup.esiEmployerRate,
        esiEmployeeRate: this.setup.esiEmployeeRate,
        pfWageCeiling: this.setup.pfWageCeiling,
        pfGrossThreshold: this.setup.pfGrossThreshold,
        esiWageCeiling: this.setup.esiWageCeiling,
      });
    }

    if (tab === 'pay-cycle') {
      return JSON.stringify({
        payCycle: this.setup.payCycle,
        effectiveFrom: this.addon.effectiveFrom,
        cycleStartDay: this.addon.cycleStartDay,
        payoutDay: this.addon.payoutDay,
        lockDay: this.addon.lockDay,
        arrearMode: this.addon.arrearMode,
      });
    }

    if (tab === 'leave-policy') {
      return JSON.stringify({
        leaveAccrualPerMonth: this.addon.leaveAccrualPerMonth,
        maxCarryForward: this.addon.maxCarryForward,
        allowCarryForward: this.addon.allowCarryForward,
        lopMode: this.addon.lopMode,
      });
    }

    if (tab === 'attendance') {
      return JSON.stringify({
        attendanceSource: this.addon.attendanceSource,
        attendanceCutoffDay: this.addon.attendanceCutoffDay,
        graceMinutes: this.addon.graceMinutes,
        autoLockAttendance: this.addon.autoLockAttendance,
        syncEnabled: this.addon.syncEnabled,
      });
    }

    return JSON.stringify({
      enableLoanRecovery: this.addon.enableLoanRecovery,
      enableAdvanceRecovery: this.addon.enableAdvanceRecovery,
      defaultDeductionCapPct: this.addon.defaultDeductionCapPct,
      recoveryOrder: this.addon.recoveryOrder,
    });
  }

  private defaultSetup(): PayrollSetupViewModel {
    return {
      clientId: '',
      pfEnabled: true,
      esiEnabled: true,
      ptEnabled: false,
      lwfEnabled: false,
      pfEmployerRate: 12,
      pfEmployeeRate: 12,
      esiEmployerRate: 3.25,
      esiEmployeeRate: 0.75,
      pfWageCeiling: 15000,
      pfGrossThreshold: 0,
      esiWageCeiling: 21000,
      payCycle: 'MONTHLY',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      cycleStartDay: 1,
      payoutDay: 1,
      lockDay: 26,
      arrearMode: 'CURRENT',
      leaveAccrualPerMonth: 1.5,
      maxCarryForward: 30,
      allowCarryForward: true,
      lopMode: 'PRORATED',
      attendanceSource: 'MANUAL',
      attendanceCutoffDay: 25,
      graceMinutes: 10,
      autoLockAttendance: true,
      syncEnabled: false,
      enableLoanRecovery: true,
      enableAdvanceRecovery: true,
      defaultDeductionCapPct: 50,
      recoveryOrder: 'STATUTORY > LOAN > ADVANCE > OTHER',
      wageBasisDays: 'FIXED_26',
      otMultiplier: 2,
      updatedAt: '',
    };
  }

  private defaultAddon(): LocalSetupAddon {
    return {
      effectiveFrom: new Date().toISOString().slice(0, 10),
      cycleStartDay: 1,
      payoutDay: 1,
      lockDay: 26,
      arrearMode: 'CURRENT',

      leaveAccrualPerMonth: 1.5,
      maxCarryForward: 30,
      allowCarryForward: true,
      lopMode: 'PRORATED',

      attendanceSource: 'MANUAL',
      attendanceCutoffDay: 25,
      graceMinutes: 10,
      autoLockAttendance: true,
      syncEnabled: false,

      enableLoanRecovery: true,
      enableAdvanceRecovery: true,
      defaultDeductionCapPct: 50,
      recoveryOrder: 'STATUTORY > LOAN > ADVANCE > OTHER',
    };
  }

  private numberOrDefault(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isNaN(n) ? fallback : n;
  }

  private boolOrDefault(value: unknown, fallback: boolean): boolean {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (!v) return fallback;
      if (['1', 'true', 'yes', 'y'].includes(v)) return true;
      if (['0', 'false', 'no', 'n'].includes(v)) return false;
    }
    return fallback;
  }

  // ─── Salary Rules & Live Preview ─────────────────────────────────────────
  loadRulesPreview(): void {
    if (!this.selectedClientId) return;
    this.loadingRulesPreview = true;
    this.previewResult = null;
    this.engineApi
      .listClientStructures(this.selectedClientId)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([])),
        finalize(() => {
          this.loadingRulesPreview = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((rows) => {
        this.clientStructures = (rows || []).filter((s) => s.isActive);
        const def =
          this.clientStructures.find((s) => s.isDefault) ||
          this.clientStructures[0];
        if (def) {
          this.selectedStructureId = def.id;
          // Adopt the structure's first state code if present
          const sc = def.statutoryConfigs?.[0]?.stateCode;
          if (sc) this.preview.stateCode = sc;
        } else {
          this.selectedStructureId = '';
        }
        this.loadStateSlabs();
      });
  }

  loadStateSlabs(): void {
    if (!this.selectedClientId || !this.preview.stateCode) {
      this.stateSlabs = [];
      return;
    }
    this.stateSlabsLoading = true;
    // Use HttpClient via engineApi.listClientStructures? We need a custom call.
    // Reuse PayrollEngineApiService dynamic GET via fetch through HttpClient:
    this.engineApi
      .listStateSlabs(this.selectedClientId, this.preview.stateCode)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([])),
        finalize(() => {
          this.stateSlabsLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((rows) => {
        this.stateSlabs = (rows as any[]) || [];
      });
  }

  get selectedStructure(): ClientStructure | null {
    return (
      this.clientStructures.find((s) => s.id === this.selectedStructureId) ||
      null
    );
  }

  onStructureSelect(): void {
    this.previewResult = null;
    const st = this.selectedStructure;
    const sc = st?.statutoryConfigs?.[0]?.stateCode;
    if (sc) {
      this.preview.stateCode = sc;
      this.loadStateSlabs();
    }
    this.cdr.markForCheck();
  }

  onStateChange(): void {
    this.previewResult = null;
    this.loadStateSlabs();
  }

  runPreview(): void {
    if (!this.selectedStructureId) {
      this.toast.error('Select a salary structure first');
      return;
    }
    this.previewLoading = true;
    this.previewResult = null;
    this.engineApi
      .calculatePayroll(this.selectedStructureId, {
        gross: Number(this.preview.gross) || 0,
        lopDays: Number(this.preview.lopDays) || 0,
        stateCode: this.preview.stateCode,
        month: Number(this.preview.month) || 1,
        year: Number(this.preview.year) || new Date().getFullYear(),
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.previewLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.previewResult = res;
        },
        error: (err) => {
          this.toast.error(
            err?.error?.message || 'Live preview calculation failed',
          );
        },
      });
  }

  formatMoney(n: number | null | undefined): string {
    if (n == null || Number.isNaN(Number(n))) return '-';
    return Number(n).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  }

  componentValuePreview(c: {
    calculationMethod: string;
    fixedValue: number | null;
    percentageValue: number | null;
    basedOn: string | null;
    formula: string | null;
  }): string {
    switch (c.calculationMethod) {
      case 'FIXED':
        return `Fixed ${this.formatMoney(c.fixedValue)}`;
      case 'PERCENTAGE':
        return `${c.percentageValue ?? 0}% of ${c.basedOn || 'GROSS'}`;
      case 'FORMULA':
      case 'CONDITIONAL_FIXED':
        return c.formula || '(no formula)';
      case 'BALANCING':
        return 'Balancing component (gross − all earnings)';
      default:
        return '-';
    }
  }

  previewValueRows(): Array<{ code: string; amount: number }> {
    if (!this.previewResult) return [];
    return Object.entries(this.previewResult.values || {}).map(([k, v]) => ({
      code: k,
      amount: Number(v) || 0,
    }));
  }

  goToStructureBuilder(): void {
    this.router.navigate([
      '/payroll/clients',
      this.selectedClientId,
      'structures',
    ]);
  }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  PayrollSetupApiService,
  PayrollClientSetup,
  PayrollComponent as PComp,
  ComponentRule,
} from './payroll-setup-api.service';
import { PayrollApiService, PayrollClient } from './payroll-api.service';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableColumn,
  TableCellDirective,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  StatusBadgeComponent,
  ActionButtonComponent,
  ModalComponent,
  FormInputComponent,
  FormSelectComponent,
} from '../../shared/ui';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-payroll-setup',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    DataTableComponent,
    TableCellDirective,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    ActionButtonComponent,
    ModalComponent,
    FormInputComponent,
    FormSelectComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Client Payroll Setup"
        description="Configure payroll components, rules, and statutory settings per client"
        icon="settings">
      </ui-page-header>

      <!-- Client Selector -->
      <div class="client-bar">
        <ui-form-select
          label="Select Client"
          [options]="clientOptions"
          [(ngModel)]="selectedClientId"
          (ngModelChange)="onClientChange()">
        </ui-form-select>
      </div>

      <ui-loading-spinner *ngIf="loading" text="Loading..." size="lg"></ui-loading-spinner>

      <ng-container *ngIf="!loading && selectedClientId">
        <!-- Tabs -->
        <div class="tabs">
          <button
            *ngFor="let t of tabs"
            class="tab"
            [class.active]="activeTab === t.key"
            (click)="activeTab = t.key">
            {{ t.label }}
          </button>
        </div>

        <!-- Statutory Settings Tab -->
        <div *ngIf="activeTab === 'settings'" class="card">
          <h3 class="card-title">Statutory Settings</h3>
          <div class="form-grid">
            <div class="toggle-row">
              <label><input type="checkbox" [(ngModel)]="setup.pfEnabled"> PF Enabled</label>
              <label><input type="checkbox" [(ngModel)]="setup.esiEnabled"> ESI Enabled</label>
              <label><input type="checkbox" [(ngModel)]="setup.ptEnabled"> PT Enabled</label>
              <label><input type="checkbox" [(ngModel)]="setup.lwfEnabled"> LWF Enabled</label>
            </div>
            <ui-form-input label="PF Employer Rate (%)" type="number" [(ngModel)]="setup.pfEmployerRate"></ui-form-input>
            <ui-form-input label="PF Employee Rate (%)" type="number" [(ngModel)]="setup.pfEmployeeRate"></ui-form-input>
            <ui-form-input label="ESI Employer Rate (%)" type="number" [(ngModel)]="setup.esiEmployerRate"></ui-form-input>
            <ui-form-input label="ESI Employee Rate (%)" type="number" [(ngModel)]="setup.esiEmployeeRate"></ui-form-input>
            <ui-form-input label="PF Wage Ceiling" type="number" [(ngModel)]="setup.pfWageCeiling"></ui-form-input>
            <ui-form-input label="ESI Wage Ceiling" type="number" [(ngModel)]="setup.esiWageCeiling"></ui-form-input>
            <ui-form-select label="Pay Cycle" [options]="payCycleOptions" [(ngModel)]="setup.payCycle"></ui-form-select>
          </div>
          <div class="form-actions">
            <ui-button
              variant="primary"
              [disabled]="savingSetup"
              [loading]="savingSetup"
              (clicked)="saveSettings()">
              Save Settings
            </ui-button>
          </div>
          <div *ngIf="setupMsg" class="msg" [class.error]="setupError">{{ setupMsg }}</div>
        </div>

        <!-- Components Tab -->
        <div *ngIf="activeTab === 'components'">
          <div class="flex justify-between items-center mb-3">
            <h3 class="card-title">Payroll Components</h3>
            <ui-button variant="primary" (clicked)="openCompForm()">+ Add Component</ui-button>
          </div>

          <ui-data-table
            [columns]="compColumns"
            [data]="components"
            [loading]="loadingComps"
            emptyMessage="No components configured.">

            <ng-template uiTableCell="name" let-row>
              <div class="font-semibold">{{ row.name }}</div>
              <div class="text-xs text-gray-500">{{ row.code }}</div>
            </ng-template>

            <ng-template uiTableCell="type" let-row>
              <ui-status-badge [status]="row.componentType"></ui-status-badge>
            </ng-template>

            <ng-template uiTableCell="flags" let-row>
              <span *ngIf="row.affectsPfWage" class="flag">PF</span>
              <span *ngIf="row.affectsEsiWage" class="flag">ESI</span>
              <span *ngIf="row.isTaxable" class="flag tax">Tax</span>
              <span *ngIf="row.isRequired" class="flag req">Req</span>
            </ng-template>

            <ng-template uiTableCell="actions" let-row>
              <div class="flex gap-2">
                <button class="text-xs text-blue-600 hover:underline" (click)="openCompForm(row)">Edit</button>
                <button class="text-xs text-blue-600 hover:underline" (click)="showRules(row)">Rules</button>
                <button class="text-xs text-red-600 hover:underline" (click)="deleteComp(row)">Del</button>
              </div>
            </ng-template>
          </ui-data-table>
        </div>

        <!-- Rules Panel -->
        <div *ngIf="activeTab === 'rules' && selectedComp" class="card">
          <div class="flex justify-between items-center mb-3">
            <h3 class="card-title">Rules: {{ selectedComp.name }} ({{ selectedComp.code }})</h3>
            <div class="flex gap-2">
              <ui-button variant="secondary" (clicked)="activeTab = 'components'">Back</ui-button>
              <ui-button variant="primary" (clicked)="openRuleForm()">+ Add Rule</ui-button>
            </div>
          </div>

          <ui-loading-spinner *ngIf="loadingRules" text="Loading rules..."></ui-loading-spinner>

          <div *ngFor="let rule of rules" class="rule-card">
            <div class="rule-header">
              <span class="font-semibold">{{ rule.ruleType }}</span>
              <span *ngIf="rule.ruleType === 'FIXED'"> = {{ rule.fixedAmount }}</span>
              <span *ngIf="rule.ruleType === 'PERCENTAGE'"> = {{ rule.percentage }}% of {{ rule.baseComponent }}</span>
              <span *ngIf="rule.ruleType === 'SLAB'"> ({{ rule.slabs?.length || 0 }} slabs)</span>
              <button class="text-xs text-red-600 hover:underline ml-4" (click)="deleteRule(rule)">Delete</button>
            </div>
            <div *ngIf="rule.slabs?.length" class="slabs-table">
              <div class="slab-row header">
                <span>From</span><span>To</span><span>%</span><span>Fixed</span>
              </div>
              <div *ngFor="let s of rule.slabs" class="slab-row">
                <span>{{ s.fromAmount }}</span>
                <span>{{ s.toAmount ?? '∞' }}</span>
                <span>{{ s.slabPct ?? '-' }}</span>
                <span>{{ s.slabFixed ?? '-' }}</span>
              </div>
            </div>
          </div>

          <ui-empty-state
            *ngIf="!loadingRules && rules.length === 0"
            title="No Rules"
            description="Add a rule to define how this component is calculated.">
          </ui-empty-state>
        </div>
      </ng-container>

      <!-- Component Form Modal -->
      <ui-modal *ngIf="showCompModal" [title]="editingComp ? 'Edit Component' : 'Add Component'" (closed)="showCompModal = false">
        <div class="form-grid">
          <ui-form-input label="Code *" [(ngModel)]="compForm.code" [disabled]="editingComp"></ui-form-input>
          <ui-form-input label="Name *" [(ngModel)]="compForm.name"></ui-form-input>
          <ui-form-select label="Type *" [options]="compTypeOptions" [(ngModel)]="compForm.componentType"></ui-form-select>
          <ui-form-input label="Display Order" type="number" [(ngModel)]="compForm.displayOrder"></ui-form-input>
          <div class="toggle-row col-span-2">
            <label><input type="checkbox" [(ngModel)]="compForm.affectsPfWage"> Affects PF Wage</label>
            <label><input type="checkbox" [(ngModel)]="compForm.affectsEsiWage"> Affects ESI Wage</label>
            <label><input type="checkbox" [(ngModel)]="compForm.isTaxable"> Taxable</label>
            <label><input type="checkbox" [(ngModel)]="compForm.isRequired"> Required</label>
          </div>
        </div>
        <div *ngIf="compFormError" class="form-error">{{ compFormError }}</div>
        <div class="form-actions">
          <ui-button variant="secondary" (clicked)="showCompModal = false">Cancel</ui-button>
          <ui-button
            variant="primary"
            [disabled]="savingComp"
            [loading]="savingComp"
            (clicked)="saveComp()">
            Save
          </ui-button>
        </div>
      </ui-modal>

      <!-- Rule Form Modal -->
      <ui-modal *ngIf="showRuleModal" title="Add Rule" (closed)="showRuleModal = false">
        <div class="form-grid">
          <ui-form-select label="Rule Type *" [options]="ruleTypeOptions" [(ngModel)]="ruleForm.ruleType"></ui-form-select>
          <ui-form-input label="Priority" type="number" [(ngModel)]="ruleForm.priority"></ui-form-input>
          <ui-form-input *ngIf="ruleForm.ruleType === 'FIXED'" label="Fixed Amount" type="number" [(ngModel)]="ruleForm.fixedAmount"></ui-form-input>
          <ui-form-input *ngIf="ruleForm.ruleType === 'PERCENTAGE'" label="Base Component Code" [(ngModel)]="ruleForm.baseComponent"></ui-form-input>
          <ui-form-input *ngIf="ruleForm.ruleType === 'PERCENTAGE'" label="Percentage" type="number" [(ngModel)]="ruleForm.percentage"></ui-form-input>
        </div>
        <div *ngIf="ruleFormError" class="form-error">{{ ruleFormError }}</div>
        <div class="form-actions">
          <ui-button variant="secondary" (clicked)="showRuleModal = false">Cancel</ui-button>
          <ui-button
            variant="primary"
            [disabled]="savingRule"
            [loading]="savingRule"
            (clicked)="saveRule()">
            Save Rule
          </ui-button>
        </div>
      </ui-modal>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
      .client-bar { margin-bottom: 1.5rem; max-width: 400px; }
      .tabs { display: flex; gap: 0; border-bottom: 2px solid #e5e7eb; margin-bottom: 1rem; }
      .tab { padding: 0.5rem 1.25rem; font-size: 0.875rem; font-weight: 500; color: #6b7280; border-bottom: 2px solid transparent; cursor: pointer; margin-bottom: -2px; background: none; border-top: none; border-left: none; border-right: none; }
      .tab.active { color: #4f46e5; border-bottom-color: #4f46e5; }
      .card { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.25rem; margin-bottom: 1rem; }
      .card-title { font-size: 1rem; font-weight: 600; margin: 0 0 1rem; }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
      .toggle-row { display: flex; gap: 1.5rem; flex-wrap: wrap; }
      .toggle-row label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; }
      .col-span-2 { grid-column: span 2; }
      .form-actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1rem; }
      .form-error { color: #dc2626; font-size: 0.85rem; margin: 0.5rem 0; }
      .msg { font-size: 0.85rem; color: #059669; margin-top: 0.75rem; }
      .msg.error { color: #dc2626; }
      .flag { display: inline-block; padding: 0.1rem 0.4rem; font-size: 0.7rem; border-radius: 4px; background: #eef2ff; color: #4f46e5; margin-right: 0.25rem; }
      .flag.tax { background: #fef2f2; color: #dc2626; }
      .flag.req { background: #f0fdf4; color: #16a34a; }
      .rule-card { border: 1px solid #e5e7eb; border-radius: 0.375rem; padding: 0.75rem; margin-bottom: 0.5rem; }
      .rule-header { font-size: 0.875rem; }
      .slabs-table { margin-top: 0.5rem; font-size: 0.8rem; }
      .slab-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 0.5rem; padding: 0.25rem 0; border-bottom: 1px solid #f3f4f6; }
      .slab-row.header { font-weight: 600; border-bottom-color: #d1d5db; }
      @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } .col-span-2 { grid-column: span 1; } }
    `,
  ],
})
export class PayrollSetupComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  clients: PayrollClient[] = [];
  clientOptions: { label: string; value: string }[] = [];
  selectedClientId = '';
  loading = false;

  activeTab = 'settings';
  tabs = [
    { key: 'settings', label: 'Statutory Settings' },
    { key: 'components', label: 'Components' },
  ];

  // Setup
  setup: any = {};
  savingSetup = false;
  setupMsg = '';
  setupError = false;

  payCycleOptions = [
    { label: 'Monthly', value: 'MONTHLY' },
    { label: 'Weekly', value: 'WEEKLY' },
    { label: 'Bi-Weekly', value: 'BIWEEKLY' },
  ];

  // Components
  components: PComp[] = [];
  loadingComps = false;
  showCompModal = false;
  editingComp = false;
  compForm: any = {};
  compFormError = '';
  savingComp = false;
  selectedComp: PComp | null = null;

  compColumns: TableColumn[] = [
    { key: 'name', header: 'Component', sortable: true },
    { key: 'type', header: 'Type', width: '120px' },
    { key: 'flags', header: 'Flags', width: '180px' },
    { key: 'actions', header: '', width: '160px', align: 'center' },
  ];

  compTypeOptions = [
    { label: 'Earning', value: 'EARNING' },
    { label: 'Deduction', value: 'DEDUCTION' },
    { label: 'Employer', value: 'EMPLOYER' },
    { label: 'Info', value: 'INFO' },
  ];

  // Rules
  rules: ComponentRule[] = [];
  loadingRules = false;
  showRuleModal = false;
  ruleForm: any = {};
  ruleFormError = '';
  savingRule = false;

  ruleTypeOptions = [
    { label: 'Fixed', value: 'FIXED' },
    { label: 'Percentage', value: 'PERCENTAGE' },
    { label: 'Slab', value: 'SLAB' },
    { label: 'Formula', value: 'FORMULA' },
  ];

  constructor(
    private setupApi: PayrollSetupApiService,
    private payrollApi: PayrollApiService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.payrollApi.getAssignedClients().pipe(takeUntil(this.destroy$)).subscribe({
      next: (list) => {
        this.clients = list;
        this.clientOptions = [
          { label: '-- Select --', value: '' },
          ...list.map((c) => ({ label: c.name || c.clientCode || c.id, value: c.id })),
        ];
        this.cdr.detectChanges();
      },
      error: (e) => {
        console.error('PayrollSetup error loading clients:', e);
        this.toast.error(e?.error?.message || 'Unable to load clients');
        this.cdr.detectChanges();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onClientChange() {
    if (!this.selectedClientId) return;
    this.loading = true;
    this.setupApi.getSetup(this.selectedClientId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.setup = {
          pfEnabled: res.pfEnabled ?? res.pf_enabled ?? true,
          esiEnabled: res.esiEnabled ?? res.esi_enabled ?? true,
          ptEnabled: res.ptEnabled ?? res.pt_enabled ?? false,
          lwfEnabled: res.lwfEnabled ?? res.lwf_enabled ?? false,
          pfEmployerRate: res.pfEmployerRate ?? res.pf_employer_rate ?? 12,
          pfEmployeeRate: res.pfEmployeeRate ?? res.pf_employee_rate ?? 12,
          esiEmployerRate: res.esiEmployerRate ?? res.esi_employer_rate ?? 3.25,
          esiEmployeeRate: res.esiEmployeeRate ?? res.esi_employee_rate ?? 0.75,
          pfWageCeiling: res.pfWageCeiling ?? res.pf_wage_ceiling ?? 15000,
          esiWageCeiling: res.esiWageCeiling ?? res.esi_wage_ceiling ?? 21000,
          payCycle: res.payCycle ?? res.pay_cycle ?? 'MONTHLY',
        };
        this.loadComponents();
      },
      error: () => {
        this.loading = false;
        this.setup = {
          pfEnabled: true, esiEnabled: true, ptEnabled: false, lwfEnabled: false,
          pfEmployerRate: 12, pfEmployeeRate: 12,
          esiEmployerRate: 3.25, esiEmployeeRate: 0.75,
          pfWageCeiling: 15000, esiWageCeiling: 21000, payCycle: 'MONTHLY',
        };
        this.loadComponents();
      },
    });
  }

  saveSettings() {
    this.savingSetup = true;
    this.setupMsg = '';
    this.setupApi.saveSetup(this.selectedClientId, this.setup).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.savingSetup = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => { this.savingSetup = false; this.setupMsg = 'Settings saved'; this.setupError = false; },
      error: (e) => { this.savingSetup = false; this.setupMsg = e?.error?.message || 'Save failed'; this.setupError = true; },
    });
  }

  loadComponents() {
    this.loadingComps = true;
    this.setupApi.listComponents(this.selectedClientId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loadingComps = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (list) => { this.loadingComps = false; this.components = list; },
      error: (e) => {
        this.loadingComps = false;
        this.components = [];
        const msg = e?.error?.message || 'Failed to load components';
        this.toast.error(msg);
      },
    });
  }

  openCompForm(comp?: PComp) {
    this.compFormError = '';
    if (comp) {
      this.editingComp = true;
      this.compForm = { ...comp };
    } else {
      this.editingComp = false;
      this.compForm = { componentType: 'EARNING', displayOrder: this.components.length };
    }
    this.showCompModal = true;
  }

  saveComp() {
    if (!this.compForm.code?.trim() || !this.compForm.name?.trim()) {
      this.compFormError = 'Code and Name are required';
      return;
    }
    this.savingComp = true;
    const obs = this.editingComp
      ? this.setupApi.updateComponent(this.selectedClientId, this.compForm.id, this.compForm)
      : this.setupApi.createComponent(this.selectedClientId, this.compForm);
    obs.pipe(takeUntil(this.destroy$), finalize(() => { this.savingComp = false; this.cdr.detectChanges(); })).subscribe({
      next: () => { this.savingComp = false; this.showCompModal = false; this.loadComponents(); },
      error: (e) => {
        this.savingComp = false;
        this.compFormError = e?.error?.message || 'Save failed';
        this.toast.error(this.compFormError);
      },
    });
  }

  deleteComp(comp: PComp) {
    if (!confirm(`Delete component "${comp.name}"?`)) return;
    this.setupApi.deleteComponent(this.selectedClientId, comp.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.loadComponents(),
      error: (e) => alert(e?.error?.message || 'Delete failed'),
    });
  }

  showRules(comp: PComp) {
    this.selectedComp = comp;
    this.activeTab = 'rules';
    this.loadRules();
  }

  loadRules() {
    if (!this.selectedComp) return;
    this.loadingRules = true;
    this.setupApi.listRules(this.selectedClientId, this.selectedComp.id).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loadingRules = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (list) => { this.loadingRules = false; this.rules = list; },
      error: (e) => {
        this.loadingRules = false;
        this.rules = [];
        this.toast.error(e?.error?.message || 'Failed to load rules');
      },
    });
  }

  openRuleForm() {
    this.ruleFormError = '';
    this.ruleForm = { ruleType: 'FIXED', priority: 0 };
    this.showRuleModal = true;
  }

  saveRule() {
    if (!this.ruleForm.ruleType) { this.ruleFormError = 'Rule type is required'; return; }
    if (!this.selectedComp) return;
    this.savingRule = true;
    this.setupApi.createRule(this.selectedClientId, this.selectedComp.id, this.ruleForm).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.savingRule = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => { this.savingRule = false; this.showRuleModal = false; this.loadRules(); },
      error: (e) => { this.savingRule = false; this.ruleFormError = e?.error?.message || 'Save failed'; },
    });
  }

  deleteRule(rule: ComponentRule) {
    if (!this.selectedComp || !confirm('Delete this rule?')) return;
    this.setupApi.deleteRule(this.selectedClientId, this.selectedComp.id, rule.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.loadRules(),
      error: (e) => alert(e?.error?.message || 'Delete failed'),
    });
  }
}

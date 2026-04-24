import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApplicabilityConfigService } from '../../../core/admin-applicability-config.service';
import {
  PageHeaderComponent,
  ActionButtonComponent,
  FormInputComponent,
  FormSelectComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-engine-config',
  standalone: true,
  imports: [
    CommonModule, FormsModule, PageHeaderComponent, ActionButtonComponent,
    FormInputComponent, FormSelectComponent, LoadingSpinnerComponent,
    EmptyStateComponent, StatusBadgeComponent,
  ],
  template: `
    <div class="p-6 max-w-7xl mx-auto">
      <ui-page-header title="Applicability Engine Configuration"
                      subtitle="Manage compliance items, packages, and rules that feed the Applicability Engine">
      </ui-page-header>

      <!-- Tabs -->
      <div class="flex gap-1 mb-6 border-b border-slate-200">
        @for (t of tabs; track t.key) {
          <button (click)="activeTab = t.key"
                  [class]="activeTab === t.key
                    ? 'px-4 py-2.5 text-sm font-semibold text-indigo-600 border-b-2 border-indigo-600 -mb-px'
                    : 'px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700'">
            {{ t.label }}
            @if (t.key === 'items') { <span class="ml-1.5 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{{ complianceItems.length }}</span> }
            @if (t.key === 'packages') { <span class="ml-1.5 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{{ packages.length }}</span> }
            @if (t.key === 'rules') { <span class="ml-1.5 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{{ rules.length }}</span> }
          </button>
        }
      </div>

      @if (loading) {
        <ui-loading-spinner />
      } @else {

        <!-- ═══════════ COMPLIANCE ITEMS TAB ═══════════ -->
        @if (activeTab === 'items') {
          <!-- Add Form -->
          <div class="bg-white border border-slate-200 rounded-lg p-5 mb-6">
            <h3 class="text-sm font-semibold text-slate-700 mb-4">{{ editingItem ? 'Edit Compliance Item' : 'Add Compliance Item' }}</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ui-form-input label="Code" [(ngModel)]="itemForm.code" placeholder="e.g. PF_MONTHLY" />
              <ui-form-input label="Name" [(ngModel)]="itemForm.name" placeholder="e.g. PF Monthly Return" />
              <ui-form-select label="Category" [(ngModel)]="itemForm.category" [options]="categoryOptions" />
              <ui-form-input label="State Code" [(ngModel)]="itemForm.stateCode" placeholder="e.g. MH (or blank for all)" />
              <ui-form-select label="Frequency" [(ngModel)]="itemForm.frequency" [options]="frequencyOptions" />
              <ui-form-select label="Applies To" [(ngModel)]="itemForm.appliesTo" [options]="appliesToOptions" />
            </div>
            <div class="flex gap-2 mt-4">
              <ui-button variant="primary" (click)="saveItem()">{{ editingItem ? 'Update' : 'Add Item' }}</ui-button>
              @if (editingItem) {
                <ui-button variant="secondary" (click)="cancelEditItem()">Cancel</ui-button>
              }
            </div>
          </div>

          <!-- Bulk Upload -->
          <div class="bg-white border border-slate-200 rounded-lg p-5 mb-6">
            <h3 class="text-sm font-semibold text-slate-700 mb-4">Bulk Upload (Excel)</h3>
            <div class="flex flex-wrap items-center gap-3">
              <button (click)="downloadTemplate()"
                      class="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3"/></svg>
                Download Template
              </button>
              <input #fileInput type="file" accept=".xlsx,.xls" (change)="onBulkFileSelected($event)" class="text-sm text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-sm file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50" />
              <button (click)="uploadBulkFile()" [disabled]="!bulkFile || bulkUploading"
                      class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                      [class]="!bulkFile || bulkUploading ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'">
                @if (bulkUploading) { <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Uploading... }
                @else { Upload }
              </button>
            </div>
            @if (bulkResult) {
              <div class="mt-4 p-3 rounded-lg border text-sm" [class]="bulkResult.errors.length ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'">
                <p class="font-semibold text-slate-700">
                  Inserted: <span class="text-emerald-600">{{ bulkResult.inserted }}</span> &nbsp;|&nbsp;
                  Skipped (duplicates): <span class="text-amber-600">{{ bulkResult.skipped }}</span>
                  @if (bulkResult.errors.length) { &nbsp;|&nbsp; Errors: <span class="text-red-600">{{ bulkResult.errors.length }}</span> }
                </p>
                @if (bulkResult.errors.length) {
                  <ul class="mt-2 space-y-0.5 text-red-600">
                    @for (e of bulkResult.errors; track e.row) {
                      <li>Row {{ e.row }}: {{ e.reason }}</li>
                    }
                  </ul>
                }
              </div>
            }
          </div>

          <!-- Items Table -->
          @if (complianceItems.length === 0) {
            <ui-empty-state message="No compliance items configured yet" />
          } @else {
            <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-slate-50 text-left text-slate-600 border-b">
                    <th class="px-4 py-3 font-semibold">Code</th>
                    <th class="px-4 py-3 font-semibold">Name</th>
                    <th class="px-4 py-3 font-semibold">Category</th>
                    <th class="px-4 py-3 font-semibold">State</th>
                    <th class="px-4 py-3 font-semibold">Frequency</th>
                    <th class="px-4 py-3 font-semibold">Applies To</th>
                    <th class="px-4 py-3 font-semibold">Status</th>
                    <th class="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of complianceItems; track item.id) {
                    <tr class="border-b border-slate-100 hover:bg-slate-50">
                      <td class="px-4 py-3 font-mono text-xs text-indigo-600">{{ item.code }}</td>
                      <td class="px-4 py-3 text-slate-700">{{ item.name }}</td>
                      <td class="px-4 py-3 text-slate-500">{{ item.category }}</td>
                      <td class="px-4 py-3 text-slate-500">{{ item.stateCode || 'ALL' }}</td>
                      <td class="px-4 py-3 text-slate-500">{{ item.frequency }}</td>
                      <td class="px-4 py-3 text-slate-500">{{ item.appliesTo }}</td>
                      <td class="px-4 py-3">
                        <ui-status-badge [status]="item.isActive ? 'Active' : 'Inactive'" />
                      </td>
                      <td class="px-4 py-3 text-right">
                        <div class="flex justify-end gap-2">
                          <ui-button variant="outline" size="sm" (click)="editItem(item)">Edit</ui-button>
                          <ui-button variant="danger" size="sm" (click)="deleteItem(item)">Delete</ui-button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        <!-- ═══════════ PACKAGES TAB ═══════════ -->
        @if (activeTab === 'packages') {
          <!-- Add Package Form -->
          <div class="bg-white border border-slate-200 rounded-lg p-5 mb-6">
            <h3 class="text-sm font-semibold text-slate-700 mb-4">{{ editingPackage ? 'Edit Package' : 'Add Package' }}</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ui-form-input label="Code" [(ngModel)]="packageForm.code" placeholder="e.g. DEFAULT_INDIA" />
              <ui-form-input label="Name" [(ngModel)]="packageForm.name" placeholder="e.g. Default India Package" />
              <ui-form-input label="State Code" [(ngModel)]="packageForm.stateCode" placeholder="Optional" />
              <ui-form-input label="Applies To" [(ngModel)]="packageForm.appliesTo" placeholder="Optional" />
            </div>
            <div class="flex gap-2 mt-4">
              <ui-button variant="primary" (click)="savePackage()">{{ editingPackage ? 'Update' : 'Add Package' }}</ui-button>
              @if (editingPackage) {
                <ui-button variant="secondary" (click)="cancelEditPackage()">Cancel</ui-button>
              }
            </div>
          </div>

          <!-- Package Cards -->
          @if (packages.length === 0) {
            <ui-empty-state message="No packages configured yet" />
          } @else {
            @for (pkg of packages; track pkg.id) {
              <div class="bg-white border border-slate-200 rounded-lg mb-4">
                <!-- Package Header -->
                <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div>
                    <span class="font-semibold text-slate-700">{{ pkg.name }}</span>
                    <span class="ml-2 font-mono text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{{ pkg.code }}</span>
                    <ui-status-badge class="ml-2" [status]="pkg.isActive ? 'Active' : 'Inactive'" />
                  </div>
                  <div class="flex gap-2">
                    <ui-button variant="outline" size="sm" (click)="editPackage(pkg)">Edit</ui-button>
                    <ui-button variant="primary" size="sm" (click)="togglePackageExpand(pkg.id)">
                      {{ expandedPackage === pkg.id ? 'Hide Items' : 'Manage Items' }}
                    </ui-button>
                  </div>
                </div>

                <!-- Package Items -->
                @if (expandedPackage === pkg.id) {
                  <div class="px-5 py-4">
                    <!-- Add Item to Package -->
                    <div class="flex items-end gap-3 mb-4">
                      <div class="flex-1">
                        <ui-form-select label="Add Compliance Item to Package"
                                        [(ngModel)]="selectedComplianceForPackage"
                                        [options]="availableItemsForPackage[pkg.id] || []" />
                      </div>
                      <ui-button variant="primary" size="sm" (click)="addItemToPackage(pkg.id)"
                                 [disabled]="!selectedComplianceForPackage">Add</ui-button>
                      <ui-button variant="outline" size="sm" (click)="addAllItemsToPackage(pkg.id)">Add All</ui-button>
                    </div>

                    <!-- Package Items List -->
                    @if (packageItems[pkg.id]?.length) {
                      <div class="border border-slate-200 rounded overflow-hidden">
                        <table class="w-full text-sm">
                          <thead>
                            <tr class="bg-slate-50 text-left text-slate-600 border-b">
                              <th class="px-3 py-2 font-semibold">Code</th>
                              <th class="px-3 py-2 font-semibold">Name</th>
                              <th class="px-3 py-2 font-semibold">Category</th>
                              <th class="px-3 py-2 font-semibold text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (pi of packageItems[pkg.id]; track pi.id) {
                              <tr class="border-b border-slate-50 hover:bg-slate-50">
                                <td class="px-3 py-2 font-mono text-xs text-indigo-600">{{ pi.compliance?.code }}</td>
                                <td class="px-3 py-2 text-slate-700">{{ pi.compliance?.name }}</td>
                                <td class="px-3 py-2 text-slate-500">{{ pi.compliance?.category }}</td>
                                <td class="px-3 py-2 text-right">
                                  <ui-button variant="danger" size="sm" (click)="removeItemFromPackage(pkg.id, pi.id)">Remove</ui-button>
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    } @else {
                      <p class="text-sm text-slate-400 py-3">No compliance items in this package</p>
                    }

                    <!-- Package Rules -->
                    <div class="mt-6 pt-4 border-t border-slate-200">
                      <h4 class="text-sm font-semibold text-slate-700 mb-3">Package Rules</h4>
                      <div class="flex items-end gap-3 mb-3">
                        <div class="flex-1">
                          <ui-form-select label="Add Rule to Package"
                                          [(ngModel)]="selectedRuleForPackage"
                                          [options]="availableRulesForPackage[pkg.id] || []" />
                        </div>
                        <ui-button variant="primary" size="sm" (click)="addRuleToPackage(pkg.id)"
                                   [disabled]="!selectedRuleForPackage">Add</ui-button>
                        <ui-button variant="outline" size="sm" (click)="addAllRulesToPackage(pkg.id)">Add All</ui-button>
                      </div>

                      @if (packageRules[pkg.id]?.length) {
                        <div class="border border-slate-200 rounded overflow-hidden">
                          <table class="w-full text-sm">
                            <thead>
                              <tr class="bg-slate-50 text-left text-slate-600 border-b">
                                <th class="px-3 py-2 font-semibold">Rule</th>
                                <th class="px-3 py-2 font-semibold">Effect</th>
                                <th class="px-3 py-2 font-semibold">Target</th>
                                <th class="px-3 py-2 font-semibold">Priority</th>
                                <th class="px-3 py-2 font-semibold text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              @for (pr of packageRules[pkg.id]; track pr.id) {
                                <tr class="border-b border-slate-50 hover:bg-slate-50">
                                  <td class="px-3 py-2 text-slate-700">{{ pr.rule?.name }}</td>
                                  <td class="px-3 py-2">
                                    <span [class]="pr.rule?.effect === 'ENABLE' ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'">
                                      {{ pr.rule?.effect }}
                                    </span>
                                  </td>
                                  <td class="px-3 py-2 font-mono text-xs text-slate-500">{{ pr.rule?.targetCompliance?.code }}</td>
                                  <td class="px-3 py-2 text-slate-500">{{ pr.rule?.priority }}</td>
                                  <td class="px-3 py-2 text-right">
                                    <ui-button variant="danger" size="sm" (click)="removeRuleFromPackage(pkg.id, pr.id)">Remove</ui-button>
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      } @else {
                        <p class="text-sm text-slate-400 py-3">No rules linked to this package</p>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          }
        }

        <!-- ═══════════ RULES TAB ═══════════ -->
        @if (activeTab === 'rules') {
          <!-- Add Rule Form -->
          <div class="bg-white border border-slate-200 rounded-lg p-5 mb-6">
            <h3 class="text-sm font-semibold text-slate-700 mb-4">{{ editingRule ? 'Edit Rule' : 'Add Rule' }}</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ui-form-input label="Rule Name" [(ngModel)]="ruleForm.name" placeholder="e.g. Enable PF if > 20 employees" />
              <ui-form-select label="Target Compliance" [(ngModel)]="ruleForm.targetComplianceId" [options]="complianceSelectOptions" />
              <ui-form-select label="Effect" [(ngModel)]="ruleForm.effect" [options]="effectOptions" />
              <ui-form-input label="Priority" type="number" [(ngModel)]="ruleForm.priority" placeholder="100" />
              <ui-form-input label="State Code" [(ngModel)]="ruleForm.stateCode" placeholder="Optional (blank = all states)" />
            </div>

            <!-- Conditions JSON -->
            <div class="mt-4">
              <label class="block text-sm font-medium text-slate-700 mb-1" for="ec-conditions-json-str">Conditions (JSON)</label>
              <textarea autocomplete="off" id="ec-conditions-json-str" name="conditionsJsonStr" [(ngModel)]="ruleForm.conditionsJsonStr"
                        rows="4"
                        class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder='{"all": [{"field": "employee_total", "op": ">=", "value": 20}]}'></textarea>
              <p class="text-xs text-slate-400 mt-1">
                Operators: ==, !=, &gt;, &gt;=, &lt;, &lt;=, in, not_in, exists.
                Combinators: {{ '{' }}"all": [...]{{ '}' }} (AND), {{ '{' }}"any": [...]{{ '}' }} (OR).
                Fields reference unit facts: employee_total, contract_workers_total, is_hazardous, establishment_type, etc.
              </p>
            </div>

            <div class="flex gap-2 mt-4">
              <ui-button variant="primary" (click)="saveRule()">{{ editingRule ? 'Update' : 'Add Rule' }}</ui-button>
              @if (editingRule) {
                <ui-button variant="secondary" (click)="cancelEditRule()">Cancel</ui-button>
              }
            </div>
          </div>

          <!-- Rules Table -->
          @if (rules.length === 0) {
            <ui-empty-state message="No rules configured yet" />
          } @else {
            <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-slate-50 text-left text-slate-600 border-b">
                    <th class="px-4 py-3 font-semibold">Priority</th>
                    <th class="px-4 py-3 font-semibold">Rule Name</th>
                    <th class="px-4 py-3 font-semibold">Effect</th>
                    <th class="px-4 py-3 font-semibold">Target Compliance</th>
                    <th class="px-4 py-3 font-semibold">State</th>
                    <th class="px-4 py-3 font-semibold">Status</th>
                    <th class="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (rule of rules; track rule.id) {
                    <tr class="border-b border-slate-100 hover:bg-slate-50">
                      <td class="px-4 py-3 text-slate-500 font-mono text-xs">{{ rule.priority }}</td>
                      <td class="px-4 py-3 text-slate-700 font-medium">{{ rule.name }}</td>
                      <td class="px-4 py-3">
                        <span [class]="rule.effect === 'ENABLE' ? 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800' : 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800'">
                          {{ rule.effect }}
                        </span>
                      </td>
                      <td class="px-4 py-3 font-mono text-xs text-indigo-600">{{ rule.targetCompliance?.code || rule.targetComplianceId }}</td>
                      <td class="px-4 py-3 text-slate-500">{{ rule.stateCode || 'ALL' }}</td>
                      <td class="px-4 py-3">
                        <ui-status-badge [status]="rule.isActive ? 'Active' : 'Inactive'" />
                      </td>
                      <td class="px-4 py-3 text-right">
                        <div class="flex justify-end gap-2">
                          <ui-button variant="outline" size="sm" (click)="editRule(rule)">Edit</ui-button>
                          <ui-button variant="danger" size="sm" (click)="deleteRule(rule)">Delete</ui-button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      }
    </div>
  `,
})
export class EngineConfigComponent implements OnInit {
  private readonly api = inject(AdminApplicabilityConfigService);
  private readonly confirm = inject(ConfirmDialogService);

  tabs = [
    { key: 'items', label: 'Compliance Items' },
    { key: 'packages', label: 'Packages' },
    { key: 'rules', label: 'Rules' },
  ];
  activeTab = 'items';
  loading = true;

  // Data
  complianceItems: any[] = [];
  packages: any[] = [];
  rules: any[] = [];
  packageItems: Record<string, any[]> = {};
  packageRules: Record<string, any[]> = {};

  // Forms
  itemForm = this.emptyItemForm();
  editingItem: any = null;
  packageForm = this.emptyPackageForm();
  editingPackage: any = null;
  ruleForm = this.emptyRuleForm();
  editingRule: any = null;

  // Package expand
  expandedPackage: string | null = null;
  selectedComplianceForPackage = '';
  selectedRuleForPackage = '';

  // Bulk upload
  bulkFile: File | null = null;
  bulkUploading = false;
  bulkResult: { inserted: number; skipped: number; errors: { row: number; reason: string }[] } | null = null;

  // Select options
  categoryOptions = [
    { value: 'LABOUR_CODE', label: 'Labour Code' },
    { value: 'STATE_RULE', label: 'State Rule' },
    { value: 'SAFETY', label: 'Safety' },
    { value: 'SPECIAL_ACT', label: 'Special Act' },
    { value: 'LICENSE', label: 'License' },
    { value: 'RETURN', label: 'Return' },
  ];
  frequencyOptions = [
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'HALF_YEARLY', label: 'Half Yearly' },
    { value: 'ANNUAL', label: 'Annual' },
    { value: 'EVENT_BASED', label: 'Event Based' },
    { value: 'ON_DEMAND', label: 'On Demand' },
  ];
  appliesToOptions = [
    { value: 'BOTH', label: 'Both' },
    { value: 'FACTORY', label: 'Factory' },
    { value: 'ESTABLISHMENT', label: 'Establishment' },
  ];
  effectOptions = [
    { value: 'ENABLE', label: 'Enable' },
    { value: 'DISABLE', label: 'Disable' },
  ];

  // Cached select options (rebuilt when data changes, NOT on every render)
  complianceSelectOptions: any[] = [];
  availableItemsForPackage: Record<string, any[]> = {};
  availableRulesForPackage: Record<string, any[]> = {};

  private rebuildComplianceSelectOptions() {
    this.complianceSelectOptions = this.complianceItems
      .filter(i => i.isActive)
      .map(i => ({ value: i.id, label: i.code + ' — ' + i.name }));
  }

  private rebuildAvailableItemsForPackage(packageId: string) {
    const linked = new Set((this.packageItems[packageId] || []).map((pi: any) => pi.complianceId));
    this.availableItemsForPackage[packageId] = this.complianceItems
      .filter(i => i.isActive && !linked.has(i.id))
      .map(i => ({ value: i.id, label: i.code + ' — ' + i.name }));
  }

  private rebuildAvailableRulesForPackage(packageId: string) {
    const linked = new Set((this.packageRules[packageId] || []).map((pr: any) => pr.ruleId));
    this.availableRulesForPackage[packageId] = this.rules
      .filter(r => r.isActive && !linked.has(r.id))
      .map(r => ({ value: r.id, label: r.name }));
  }

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loading = true;
    let done = 0;
    const check = () => { if (++done >= 3) this.loading = false; };

    this.api.listComplianceItems().subscribe({
      next: (items) => { this.complianceItems = items; this.rebuildComplianceSelectOptions(); check(); },
      error: () => check(),
    });
    this.api.listPackages().subscribe({
      next: (pkgs) => { this.packages = pkgs; check(); },
      error: () => check(),
    });
    this.api.listRules().subscribe({
      next: (rules) => { this.rules = rules; check(); },
      error: () => check(),
    });
  }

  // ─── Compliance Items ───
  emptyItemForm() {
    return { code: '', name: '', category: 'LABOUR_CODE', stateCode: '', frequency: 'MONTHLY', appliesTo: 'BOTH' };
  }

  saveItem() {
    if (!this.itemForm.code || !this.itemForm.name) return;
    const payload = { ...this.itemForm, stateCode: this.itemForm.stateCode || null };

    const obs = this.editingItem
      ? this.api.updateComplianceItem(this.editingItem.id, payload)
      : this.api.createComplianceItem(payload);

    obs.subscribe({
      next: () => {
        this.itemForm = this.emptyItemForm();
        this.editingItem = null;
        this.api.listComplianceItems().subscribe(items => { this.complianceItems = items; this.rebuildComplianceSelectOptions(); });
      },
      error: (e: any) => alert(e?.error?.message || 'Error saving item'),
    });
  }

  editItem(item: any) {
    this.editingItem = item;
    this.itemForm = {
      code: item.code,
      name: item.name,
      category: item.category,
      stateCode: item.stateCode || '',
      frequency: item.frequency,
      appliesTo: item.appliesTo,
    };
  }

  cancelEditItem() {
    this.editingItem = null;
    this.itemForm = this.emptyItemForm();
  }

  deleteItem(item: any) {
    this.confirm.confirm('Deactivate Compliance Item', 'Are you sure you want to deactivate "' + item.code + '"?')
      .then((confirmed: boolean) => {
        if (!confirmed) return;
        this.api.deleteComplianceItem(item.id).subscribe(() => {
          this.api.listComplianceItems().subscribe(items => { this.complianceItems = items; this.rebuildComplianceSelectOptions(); });
        });
      });
  }

  onBulkFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.bulkFile = input.files?.[0] || null;
    this.bulkResult = null;
  }

  uploadBulkFile() {
    if (!this.bulkFile) return;
    this.bulkUploading = true;
    this.bulkResult = null;
    this.api.bulkUploadComplianceItems(this.bulkFile).subscribe({
      next: (result: any) => {
        this.bulkResult = result;
        this.bulkUploading = false;
        this.bulkFile = null;
        this.api.listComplianceItems().subscribe(items => { this.complianceItems = items; this.rebuildComplianceSelectOptions(); });
      },
      error: (err: any) => {
        this.bulkResult = { inserted: 0, skipped: 0, errors: [{ row: 0, reason: err.error?.message || 'Upload failed' }] };
        this.bulkUploading = false;
      },
    });
  }

  downloadTemplate() {
    this.api.downloadComplianceTemplate().subscribe((blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'engine-compliance-items-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ─── Packages ───
  emptyPackageForm() {
    return { code: '', name: '', stateCode: '', appliesTo: '' };
  }

  savePackage() {
    if (!this.packageForm.code || !this.packageForm.name) return;
    const payload = {
      ...this.packageForm,
      stateCode: this.packageForm.stateCode || null,
      appliesTo: this.packageForm.appliesTo || null,
    };

    const obs = this.editingPackage
      ? this.api.updatePackage(this.editingPackage.id, payload)
      : this.api.createPackage(payload);

    obs.subscribe({
      next: () => {
        this.packageForm = this.emptyPackageForm();
        this.editingPackage = null;
        this.api.listPackages().subscribe(pkgs => this.packages = pkgs);
      },
      error: (e: any) => alert(e?.error?.message || 'Error saving package'),
    });
  }

  editPackage(pkg: any) {
    this.editingPackage = pkg;
    this.packageForm = {
      code: pkg.code,
      name: pkg.name,
      stateCode: pkg.stateCode || '',
      appliesTo: pkg.appliesTo || '',
    };
  }

  cancelEditPackage() {
    this.editingPackage = null;
    this.packageForm = this.emptyPackageForm();
  }

  togglePackageExpand(packageId: string) {
    if (this.expandedPackage === packageId) {
      this.expandedPackage = null;
      return;
    }
    this.expandedPackage = packageId;
    this.loadPackageDetails(packageId);
  }

  loadPackageDetails(packageId: string) {
    this.api.listPackageItems(packageId).subscribe(items => {
      this.packageItems[packageId] = items;
      this.rebuildAvailableItemsForPackage(packageId);
    });
    this.api.listPackageRules(packageId).subscribe(rules => {
      this.packageRules[packageId] = rules;
      this.rebuildAvailableRulesForPackage(packageId);
    });
  }



  addItemToPackage(packageId: string) {
    if (!this.selectedComplianceForPackage) return;
    this.api.addPackageItem(packageId, this.selectedComplianceForPackage).subscribe({
      next: () => {
        this.selectedComplianceForPackage = '';
        this.loadPackageDetails(packageId);
      },
      error: (e: any) => alert(e?.error?.message || 'Error adding item'),
    });
  }

  addAllItemsToPackage(packageId: string) {
    const available = this.availableItemsForPackage[packageId] || [];
    if (available.length === 0) return;
    const ids = available.map((i: any) => i.value);
    this.api.bulkAddPackageItems(packageId, ids).subscribe({
      next: () => this.loadPackageDetails(packageId),
      error: (e: any) => alert(e?.error?.message || 'Error adding items'),
    });
  }

  removeItemFromPackage(packageId: string, linkId: string) {
    this.api.removePackageItem(packageId, linkId).subscribe(() => this.loadPackageDetails(packageId));
  }



  addRuleToPackage(packageId: string) {
    if (!this.selectedRuleForPackage) return;
    this.api.addPackageRule(packageId, this.selectedRuleForPackage).subscribe({
      next: () => {
        this.selectedRuleForPackage = '';
        this.loadPackageDetails(packageId);
      },
      error: (e: any) => alert(e?.error?.message || 'Error adding rule'),
    });
  }

  addAllRulesToPackage(packageId: string) {
    const available = this.availableRulesForPackage[packageId] || [];
    if (available.length === 0) return;
    const ids = available.map((r: any) => r.value);
    this.api.bulkAddPackageRules(packageId, ids).subscribe({
      next: () => this.loadPackageDetails(packageId),
      error: (e: any) => alert(e?.error?.message || 'Error adding rules'),
    });
  }

  removeRuleFromPackage(packageId: string, linkId: string) {
    this.api.removePackageRule(packageId, linkId).subscribe(() => this.loadPackageDetails(packageId));
  }

  // ─── Rules ───
  emptyRuleForm() {
    return { name: '', stateCode: '', priority: 100, targetComplianceId: '', effect: 'ENABLE', conditionsJsonStr: '' };
  }

  saveRule() {
    if (!this.ruleForm.name || !this.ruleForm.targetComplianceId) return;

    let conditionsJson: any;
    try {
      conditionsJson = JSON.parse(this.ruleForm.conditionsJsonStr);
    } catch {
      alert('Invalid JSON in conditions field');
      return;
    }

    const payload = {
      name: this.ruleForm.name,
      stateCode: this.ruleForm.stateCode || null,
      priority: Number(this.ruleForm.priority) || 100,
      targetComplianceId: this.ruleForm.targetComplianceId,
      effect: this.ruleForm.effect,
      conditionsJson,
    };

    const obs = this.editingRule
      ? this.api.updateRule(this.editingRule.id, payload)
      : this.api.createRule(payload);

    obs.subscribe({
      next: () => {
        this.ruleForm = this.emptyRuleForm();
        this.editingRule = null;
        this.api.listRules().subscribe(rules => this.rules = rules);
      },
      error: (e: any) => alert(e?.error?.message || 'Error saving rule'),
    });
  }

  editRule(rule: any) {
    this.editingRule = rule;
    this.ruleForm = {
      name: rule.name,
      stateCode: rule.stateCode || '',
      priority: rule.priority,
      targetComplianceId: rule.targetComplianceId,
      effect: rule.effect,
      conditionsJsonStr: JSON.stringify(rule.conditionsJson, null, 2),
    };
  }

  cancelEditRule() {
    this.editingRule = null;
    this.ruleForm = this.emptyRuleForm();
  }

  deleteRule(rule: any) {
    this.confirm.confirm('Deactivate Rule', 'Are you sure you want to deactivate rule "' + rule.name + '"?')
      .then((confirmed: boolean) => {
        if (!confirmed) return;
        this.api.deleteRule(rule.id).subscribe(() => {
          this.api.listRules().subscribe(rules => this.rules = rules);
        });
      });
  }
}

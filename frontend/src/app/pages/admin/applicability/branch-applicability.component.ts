import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from '../../../shared/toast/toast.service';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import {
  UnitsApiService,
  UnitFactsDto,
  ApplicableCompliance,
  RecomputeResult,
} from '../../../core/api/units-api.service';
import {
  PageHeaderComponent,
  ActionButtonComponent,
  LoadingSpinnerComponent,
  ModalComponent,
} from '../../../shared/ui';
import { STATE_SELECT_OPTIONS } from '../../../shared/utils/indian-states';

/** Known special act codes from seed data */
const SPECIAL_ACT_OPTIONS = [
  { code: 'BEEDI_CIGAR', name: 'Beedi and Cigar Workers Act' },
  { code: 'PLANTATION', name: 'Plantations Labour Act' },
  { code: 'MINES', name: 'Mines Act' },
  { code: 'MOTOR_TRANS', name: 'Motor Transport Workers Act' },
];

/** Default package code from seed data */
const _DEFAULT_PACKAGE_ID_KEY = 'DEFAULT_INDIA';

@Component({
  selector: 'app-branch-applicability',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    ModalComponent,
  ],
  template: `
    <div class="p-6 max-w-7xl mx-auto space-y-6">
      <ui-page-header title="Compliance Applicability" subtitle="Configure branch facts and manage applicable compliances">
        <div class="flex gap-3">
          <ui-button
            variant="secondary"
            (clicked)="goBack()"
          >← Back</ui-button>
          <ui-button
            variant="secondary"
            [loading]="recomputing"
            (clicked)="recompute()"
          >Recompute</ui-button>
          <ui-button
            variant="primary"
            [loading]="saving"
            (clicked)="saveAll()"
          >Save All</ui-button>
        </div>
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading"></ui-loading-spinner>

      <ng-container *ngIf="!loading">
        <!-- Branch Facts Form -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-gray-900">Branch Facts</h3>
              <p class="text-sm text-gray-500 mt-0.5">These facts drive automatic compliance applicability</p>
            </div>
            <ui-button
              variant="primary"
              size="sm"
              [loading]="savingFacts"
              (clicked)="saveFacts()"
            >Save Facts</ui-button>
          </div>
          <div class="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <!-- State Code -->
            <div>
              <label for="ba-state" class="block text-sm font-medium text-gray-700 mb-1.5">State</label>
              <select id="ba-state" name="stateCode" [(ngModel)]="factsForm.stateCode" class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
                <option value="">Select State</option>
                <option *ngFor="let s of stateOptions" [value]="s.value">{{ s.label }}</option>
              </select>
            </div>
            <!-- Establishment Type -->
            <div>
              <label for="ba-estab-type" class="block text-sm font-medium text-gray-700 mb-1.5">Establishment Type</label>
              <select id="ba-estab-type" name="establishmentType" [(ngModel)]="factsForm.establishmentType" class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
                <option value="FACTORY">Factory</option>
                <option value="ESTABLISHMENT">Establishment</option>
                <option value="BOTH">Both</option>
              </select>
            </div>
            <!-- Hazardous -->
            <div>
              <label for="ba-hazardous" class="block text-sm font-medium text-gray-700 mb-1.5">Hazardous</label>
              <select id="ba-hazardous" name="isHazardous" [(ngModel)]="factsForm.isHazardous" class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
                <option [ngValue]="false">Non-Hazardous</option>
                <option [ngValue]="true">Hazardous</option>
              </select>
            </div>
            <!-- Headcounts -->
            <div>
              <label for="ba-emp-total" class="block text-sm font-medium text-gray-700 mb-1.5">Total Employees</label>
              <input autocomplete="off" type="number" id="ba-emp-total" name="employeeTotal" [(ngModel)]="factsForm.employeeTotal" min="0" class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" />
            </div>
            <div>
              <label for="ba-emp-male" class="block text-sm font-medium text-gray-700 mb-1.5">Male Employees</label>
              <input autocomplete="off" type="number" id="ba-emp-male" name="employeeMale" [(ngModel)]="factsForm.employeeMale" min="0" class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" />
            </div>
            <div>
              <label for="ba-emp-female" class="block text-sm font-medium text-gray-700 mb-1.5">Female Employees</label>
              <input autocomplete="off" type="number" id="ba-emp-female" name="employeeFemale" [(ngModel)]="factsForm.employeeFemale" min="0" class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" />
            </div>
            <div>
              <label for="ba-contract-workers" class="block text-sm font-medium text-gray-700 mb-1.5">Contract Workers</label>
              <input autocomplete="off" type="number" id="ba-contract-workers" name="contractWorkersTotal" [(ngModel)]="factsForm.contractWorkersTotal" min="0" class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" />
            </div>
            <div>
              <label for="ba-contractors" class="block text-sm font-medium text-gray-700 mb-1.5">Total Contractors</label>
              <input autocomplete="off" type="number" id="ba-contractors" name="contractorsCount" [(ngModel)]="factsForm.contractorsCount" min="0" class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" />
            </div>
            <div>
              <label for="ba-industry" class="block text-sm font-medium text-gray-700 mb-1.5">Industry Category</label>
              <input autocomplete="off" type="text" id="ba-industry" name="industryCategory" [(ngModel)]="factsForm.industryCategory" placeholder="e.g. Chemicals, IT, Manufacturing" class="w-full rounded-lg border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" />
            </div>
            <!-- Toggle fields -->
            <div class="flex items-center gap-3">
              <input autocomplete="off" type="checkbox" name="isBocwProject" [(ngModel)]="factsForm.isBocwProject" id="bocw" class="h-4 w-4 text-blue-600 rounded border-gray-300" />
              <label for="bocw" class="text-sm text-gray-700">BOCW Project</label>
            </div>
            <div class="flex items-center gap-3">
              <input autocomplete="off" type="checkbox" name="hasCanteen" [(ngModel)]="factsForm.hasCanteen" id="canteen" class="h-4 w-4 text-blue-600 rounded border-gray-300" />
              <label for="canteen" class="text-sm text-gray-700">Has Canteen</label>
            </div>
            <div class="flex items-center gap-3">
              <input autocomplete="off" type="checkbox" name="hasCreche" [(ngModel)]="factsForm.hasCreche" id="creche" class="h-4 w-4 text-blue-600 rounded border-gray-300" />
              <label for="creche" class="text-sm text-gray-700">Has Creche</label>
            </div>
          </div>
        </div>

        <!-- Recompute Summary Banner -->
        <div *ngIf="recomputeResult" class="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span class="font-semibold text-green-800">Recomputed:</span>
            <span class="text-green-700 ml-2">{{ recomputeResult.applicable }} applicable out of {{ recomputeResult.computed }} compliances</span>
          </div>
        </div>

        <!-- Special Acts Section -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100">
            <h3 class="text-lg font-semibold text-gray-900">Special Acts</h3>
            <p class="text-sm text-gray-500 mt-0.5">Select special acts applicable to this branch.</p>
          </div>
          <div class="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div *ngFor="let act of specialActOptions"
              class="flex items-center gap-3 p-3 rounded-lg border transition-colors"
              [class.border-blue-200]="isSpecialActSelected(act.code)"
              [class.bg-blue-50]="isSpecialActSelected(act.code)"
              [class.border-gray-200]="!isSpecialActSelected(act.code)"
            >
              <input
                type="checkbox"
                [checked]="isSpecialActSelected(act.code)"
                (change)="toggleSpecialAct(act.code, $event)"
                class="h-4 w-4 text-blue-600 rounded border-gray-300"
              />
              <div class="flex-1 min-w-0">
                <span class="text-sm font-medium text-gray-900 block truncate">{{ act.name }}</span>
                <span class="text-xs text-gray-500">{{ act.code }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Applicable Compliances (grouped by category) -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-gray-900">Applicable Compliances</h3>
              <p class="text-sm text-gray-500 mt-0.5">Auto-computed items are locked. Override any item with a mandatory reason.</p>
            </div>
            <div class="flex items-center gap-4 text-sm">
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full bg-green-500"></span> Applicable
              </span>
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full bg-gray-300"></span> Not Applicable
              </span>
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Overridden
              </span>
            </div>
          </div>
          <div *ngIf="loadingApplicable" class="p-8 text-center text-gray-400">Loading applicability...</div>
          <div *ngIf="!loadingApplicable" class="max-h-[600px] overflow-y-auto">
            <div *ngFor="let group of applicabilityGroups" class="border-b border-gray-100 last:border-b-0">
              <div class="px-6 py-3 bg-gray-50 flex items-center justify-between cursor-pointer" (click)="toggleGroupExpand(group.key)">
                <div class="flex items-center gap-2">
                  <svg class="w-4 h-4 text-gray-400 transition-transform" [class.rotate-90]="expandedGroups[group.key]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                  <span class="text-sm font-semibold text-gray-700">{{ group.label }}</span>
                  <span class="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{{ group.items.length }}</span>
                </div>
                <span class="text-xs text-gray-500">{{ countApplicable(group.items) }} applicable</span>
              </div>
              <div *ngIf="expandedGroups[group.key]" class="divide-y divide-gray-50">
                <div *ngFor="let item of group.items" class="px-6 py-3 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                  <!-- Status indicator -->
                  <span class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    [class.bg-green-500]="item.isApplicable && item.source !== 'OVERRIDE'"
                    [class.bg-gray-300]="!item.isApplicable && item.source !== 'OVERRIDE'"
                    [class.bg-amber-500]="item.source === 'OVERRIDE'"
                  ></span>
                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <span class="text-sm font-medium text-gray-900">{{ item.compliance.name }}</span>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-xs text-gray-500">{{ item.compliance.code }}</span>
                      <span class="text-xs text-gray-400">&middot;</span>
                      <span class="text-xs text-gray-500">{{ item.compliance.frequency }}</span>
                    </div>
                  </div>
                  <!-- Source badge -->
                  <span class="text-xs px-2 py-0.5 rounded-full"
                    [class.bg-blue-100]="item.source === 'AUTO'"
                    [class.text-blue-700]="item.source === 'AUTO'"
                    [class.bg-teal-100]="item.source === 'SPECIAL_SELECTED'"
                    [class.text-teal-700]="item.source === 'SPECIAL_SELECTED'"
                    [class.bg-amber-100]="item.source === 'OVERRIDE'"
                    [class.text-amber-700]="item.source === 'OVERRIDE'"
                  >{{ item.source }}</span>
                  <!-- Lock icon for AUTO items -->
                  <svg *ngIf="item.source === 'AUTO'" class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                  <!-- Override button -->
                  <button
                    (click)="openOverrideModal(item)"
                    class="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  >Override</button>
                </div>
              </div>
            </div>
            <div *ngIf="applicabilityGroups.length === 0" class="p-8 text-center text-gray-400">
              No applicability data. Click <strong>Recompute</strong> to evaluate rules.
            </div>
          </div>
        </div>

        <!-- Pending Overrides Summary -->
        <div *ngIf="pendingOverrides.length > 0" class="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h4 class="text-sm font-semibold text-amber-800 mb-2">Pending Overrides ({{ pendingOverrides.length }})</h4>
          <div class="space-y-1">
            <div *ngFor="let ov of pendingOverrides" class="text-sm text-amber-700 flex items-center gap-2">
              <span>{{ getComplianceName(ov.complianceId) }}</span>
              <span class="text-amber-500">&rarr;</span>
              <span *ngIf="ov.isApplicable" class="text-green-700 font-medium">Force Enable</span>
              <span *ngIf="!ov.isApplicable" class="text-red-700 font-medium">Force Disable</span>
              <span class="text-amber-500 text-xs">({{ ov.reason }})</span>
            </div>
          </div>
        </div>
      </ng-container>

      <!-- Override Modal -->
      <ui-modal *ngIf="overrideModal" title="Override Compliance" (closed)="overrideModal = null">
        <div class="space-y-4">
          <div>
            <span class="block text-sm font-medium text-gray-700 mb-1">Compliance</span>
            <p class="text-sm text-gray-900 font-medium">{{ overrideModal.compliance.name }}</p>
            <p class="text-xs text-gray-500">{{ overrideModal.compliance.code }}</p>
          </div>
          <div>
            <label for="ba-override-action" class="block text-sm font-medium text-gray-700 mb-1.5">Action</label>
            <select id="ba-override-action" name="overrideAction" [(ngModel)]="overrideAction" class="w-full rounded-lg border-gray-300 shadow-sm text-sm">
              <option value="ENABLE">Force Enable (make applicable)</option>
              <option value="DISABLE">Force Disable (make not applicable)</option>
            </select>
          </div>
          <div>
            <label for="ba-override-reason" class="block text-sm font-medium text-gray-700 mb-1.5">Reason (mandatory, min 5 chars)</label>
            <textarea autocomplete="off" id="ba-override-reason" name="overrideReason" [(ngModel)]="overrideReason" rows="3" placeholder="Explain why this override is needed..."
              class="w-full rounded-lg border-gray-300 shadow-sm text-sm"></textarea>
          </div>
          <div class="flex justify-end gap-3">
            <button (click)="overrideModal = null" class="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button (click)="addOverride()" [disabled]="!overrideReason || overrideReason.trim().length < 5"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
              Add Override
            </button>
          </div>
        </div>
      </ui-modal>
    </div>
  `,
})
export class BranchApplicabilityComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  branchId = '';
  loading = true;
  packageId = ''; // resolved from backend on first recompute

  /* Facts */
  factsForm: UnitFactsDto = {
    stateCode: '', establishmentType: 'ESTABLISHMENT', isHazardous: false,
    employeeTotal: 0, employeeMale: 0, employeeFemale: 0,
    contractWorkersTotal: 0, contractorsCount: 0,
    industryCategory: '', isBocwProject: false, hasCanteen: false, hasCreche: false,
  };
  savingFacts = false;

  /* Special Acts */
  specialActOptions = SPECIAL_ACT_OPTIONS;
  selectedSpecialActCodes: string[] = [];

  /* Applicability */
  applicableItems: ApplicableCompliance[] = [];
  applicabilityGroups: { key: string; label: string; items: ApplicableCompliance[] }[] = [];
  expandedGroups: Record<string, boolean> = {};
  loadingApplicable = false;
  recomputing = false;
  recomputeResult: RecomputeResult | null = null;

  /* Overrides */
  overrideModal: ApplicableCompliance | null = null;
  overrideAction = 'ENABLE';
  overrideReason = '';
  pendingOverrides: { complianceId: string; isApplicable: boolean; reason: string }[] = [];
  saving = false;

  stateOptions = STATE_SELECT_OPTIONS;

  private categoryLabels: Record<string, string> = {
    LABOUR_CODE: 'Labour Codes',
    STATE_RULE: 'State Rules',
    SAFETY: 'Safety',
    SPECIAL_ACT: 'Special Acts',
    LICENSE: 'Licenses',
    RETURN: 'Returns',
  };

  private readonly toast = inject(ToastService);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private unitsApi: UnitsApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.branchId = params['branchId'] || params['id'] || '';
      if (this.branchId) this.loadAll();
    });
  }

  goBack(): void {
    this.router.navigate(['/admin/applicability']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadAll(): void {
    this.loading = true;
    this.loadFacts();
    this.loadApplicable();
  }

  private loadFacts(): void {
    this.unitsApi.getFacts(this.branchId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (facts) => {
        if (facts) {
          this.factsForm = {
            stateCode: facts.stateCode || '',
            establishmentType: facts.establishmentType || 'ESTABLISHMENT',
            isHazardous: facts.isHazardous ?? false,
            employeeTotal: facts.employeeTotal ?? 0,
            employeeMale: facts.employeeMale ?? 0,
            employeeFemale: facts.employeeFemale ?? 0,
            contractWorkersTotal: facts.contractWorkersTotal ?? 0,
            contractorsCount: facts.contractorsCount ?? 0,
            industryCategory: facts.industryCategory || '',
            isBocwProject: facts.isBocwProject ?? false,
            hasCanteen: facts.hasCanteen ?? false,
            hasCreche: facts.hasCreche ?? false,
          };
        }
      },
      error: (err) => this.toast.error('Load Error', err?.error?.message || 'Failed to load branch facts'),
    });
  }

  loadApplicable(): void {
    this.loadingApplicable = true;
    this.unitsApi.getApplicable(this.branchId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loadingApplicable = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (items) => {
        this.applicableItems = items;
        this.buildGroups(items);

        // Populate selected special acts from existing SPECIAL_SELECTED items
        this.selectedSpecialActCodes = items
          .filter(i => i.source === 'SPECIAL_SELECTED' && i.isApplicable)
          .map(i => i.compliance?.code)
          .filter(Boolean);
      },
      error: (err) => this.toast.error('Load Error', err?.error?.message || 'Failed to load applicability data'),
    });
  }

  private buildGroups(items: ApplicableCompliance[]): void {
    const grouped: Record<string, ApplicableCompliance[]> = {};
    for (const item of items) {
      const cat = item.compliance?.category || 'OTHER';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }
    this.applicabilityGroups = Object.entries(grouped).map(([key, groupItems]) => ({
      key,
      label: this.categoryLabels[key] || key,
      items: groupItems.sort((a, b) =>
        (a.compliance?.name || '').localeCompare(b.compliance?.name || ''),
      ),
    }));
    // Auto-expand first group
    if (this.applicabilityGroups.length > 0 && Object.keys(this.expandedGroups).length === 0) {
      this.expandedGroups[this.applicabilityGroups[0].key] = true;
    }
  }

  /* ── Actions ── */

  saveFacts(): void {
    this.savingFacts = true;
    this.unitsApi.upsertFacts(this.branchId, this.factsForm).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.savingFacts = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => this.toast.success('Saved', 'Branch facts saved successfully'),
      error: (err) => this.toast.error('Save Error', err?.error?.message || 'Failed to save branch facts'),
    });
  }

  recompute(): void {
    if (!this.packageId) {
      // Need to resolve the default package ID first
      this.resolvePackageAndRecompute();
      return;
    }
    this.doRecompute();
  }

  private resolvePackageAndRecompute(): void {
    // Save facts first, then recompute — the backend will use the default package
    this.savingFacts = true;
    this.unitsApi.upsertFacts(this.branchId, this.factsForm).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.savingFacts = false; }),
    ).subscribe({
      next: () => {
        this.packageId = 'DEFAULT_INDIA';
        this.doRecompute();
      },
    });
  }

  private doRecompute(): void {
    this.recomputing = true;
    this.recomputeResult = null;
    this.unitsApi.recompute(this.branchId, this.packageId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.recomputing = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.recomputeResult = res;
        this.toast.success('Recomputed', `${res.applicable} applicable out of ${res.computed} compliances`);
        this.loadApplicable();
      },
      error: (err) => this.toast.error('Recompute Error', err?.error?.message || 'Failed to recompute applicability'),
    });
  }

  /* ── Special Acts ── */

  isSpecialActSelected(code: string): boolean {
    return this.selectedSpecialActCodes.includes(code);
  }

  toggleSpecialAct(code: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.selectedSpecialActCodes.includes(code)) {
        this.selectedSpecialActCodes.push(code);
      }
    } else {
      this.selectedSpecialActCodes = this.selectedSpecialActCodes.filter(c => c !== code);
    }
  }

  /* ── Override flow ── */

  openOverrideModal(item: ApplicableCompliance): void {
    this.overrideModal = item;
    this.overrideAction = item.isApplicable ? 'DISABLE' : 'ENABLE';
    this.overrideReason = '';
  }

  addOverride(): void {
    if (!this.overrideModal || !this.overrideReason || this.overrideReason.trim().length < 5) return;
    this.pendingOverrides = this.pendingOverrides.filter(
      (o) => o.complianceId !== this.overrideModal!.complianceId,
    );
    this.pendingOverrides.push({
      complianceId: this.overrideModal.complianceId,
      isApplicable: this.overrideAction === 'ENABLE',
      reason: this.overrideReason.trim(),
    });
    this.overrideModal = null;
    this.cdr.detectChanges();
  }

  /* ── Save All (recompute + special acts + overrides) ── */

  saveAll(): void {
    this.saving = true;
    // Save facts first
    this.unitsApi.upsertFacts(this.branchId, this.factsForm).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => {
        const dto = {
          packageId: this.packageId || 'DEFAULT_INDIA',
          selectedSpecialActCodes: this.selectedSpecialActCodes,
          overrides: this.pendingOverrides,
        };
        this.unitsApi.saveApplicable(this.branchId, dto).pipe(
          takeUntil(this.destroy$),
          finalize(() => { this.saving = false; this.cdr.detectChanges(); }),
        ).subscribe({
          next: () => {
            this.pendingOverrides = [];
            this.toast.success('Saved', 'All changes saved successfully');
            this.loadApplicable();
          },
          error: (err) => this.toast.error('Save Error', err?.error?.message || 'Failed to save applicability'),
        });
      },
      error: (err) => {
        this.saving = false;
        this.cdr.detectChanges();
        this.toast.error('Save Error', err?.error?.message || 'Failed to save branch facts');
      },
    });
  }

  /* ── Helpers ── */

  toggleGroupExpand(key: string): void {
    this.expandedGroups[key] = !this.expandedGroups[key];
  }

  countApplicable(items: ApplicableCompliance[]): number {
    return items.filter((i) => i.isApplicable).length;
  }

  getComplianceName(complianceId: string): string {
    const found = this.applicableItems.find((i) => i.complianceId === complianceId);
    return found?.compliance?.name || complianceId;
  }
}

import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ClientContextStripComponent } from '../../shared/ui/client-context-strip/client-context-strip.component';
import { FormsModule } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, finalize, map, switchMap, takeUntil, tap, timeout } from 'rxjs/operators';
import { PayrollApiService, PayrollClient } from './payroll-api.service';
import { PayrollRegistersService, RegisterRecordRow, BranchTemplateInfo } from './payroll-registers.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableColumn,
  TableCellDirective,
  SelectOption,
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  StatusBadgeComponent,
} from '../../shared/ui';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATE_NAMES: Record<string, string> = {
  AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar',
  CG: 'Chhattisgarh', GA: 'Goa', GJ: 'Gujarat', HR: 'Haryana',
  HP: 'Himachal Pradesh', JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala',
  MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur', ML: 'Meghalaya',
  MZ: 'Mizoram', NL: 'Nagaland', OD: 'Odisha', PB: 'Punjab',
  RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu', TS: 'Telangana',
  TR: 'Tripura', UK: 'Uttarakhand', UP: 'Uttar Pradesh', WB: 'West Bengal',
  DL: 'Delhi', JK: 'Jammu & Kashmir', LA: 'Ladakh',
  AN: 'Andaman & Nicobar', CH: 'Chandigarh', DD: 'Dadra & Nagar Haveli',
  DN: 'Daman & Diu', LD: 'Lakshadweep', PY: 'Puducherry',
};

@Component({
  selector: 'app-payroll-registers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    DataTableComponent,
    TableCellDirective,
    ActionButtonComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
    StatusBadgeComponent,
    ClientContextStripComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Statutory Registers"
        subtitle="Generate, download, approve, and manage statutory registers for this client">
        <ui-client-context-strip [inline]="true" paramKey="clientId"></ui-client-context-strip>
        <div slot="actions" class="flex items-center gap-3">
          <ui-button variant="secondary" [disabled]="loading" (clicked)="reload()">
            Refresh
          </ui-button>
        </div>
      </ui-page-header>

      <!-- ═══════ Generate & Download Panel ═══════ -->
      <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
        <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Generate &amp; Download Registers
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <!-- Branch -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Branch</label>
            <select class="w-full rounded-lg border-gray-300 shadow-sm text-sm py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500"
              [(ngModel)]="genBranchId" (ngModelChange)="onBranchChange()">
              <option value="">-- Select Branch --</option>
              <option *ngFor="let b of genBranches" [value]="b.id">
                {{ b.branchName }} ({{ b.branchType }}) — {{ stateName(b.stateCode) }}
              </option>
            </select>
          </div>
          <!-- Month -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Month</label>
            <select class="w-full rounded-lg border-gray-300 shadow-sm text-sm py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500"
              [(ngModel)]="selMonth" (ngModelChange)="onPeriodChange()">
              <option [ngValue]="null">-- Select Month --</option>
              <option *ngFor="let m of months" [ngValue]="m.value">{{ m.label }}</option>
            </select>
          </div>
          <!-- Year -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Year</label>
            <select class="w-full rounded-lg border-gray-300 shadow-sm text-sm py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500"
              [(ngModel)]="selYear" (ngModelChange)="onPeriodChange()">
              <option [ngValue]="null">-- Select Year --</option>
              <option *ngFor="let y of years" [ngValue]="y">{{ y }}</option>
            </select>
          </div>
          <!-- Generate -->
          <div>
            <button
              class="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
              [disabled]="!canGenerate || generating"
              (click)="generateRegisters()">
              <svg *ngIf="!generating" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              <svg *ngIf="generating" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"></circle>
                <path fill="currentColor" class="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              {{ generating ? 'Generating...' : 'Generate All' }}
            </button>
          </div>
        </div>

        <!-- Matched payroll run info -->
        <div *ngIf="matchedRun" class="mt-3 text-xs text-gray-500">
          Payroll Run: <span class="font-medium text-gray-700">{{ matchedRun.label }}</span>
        </div>
        <div *ngIf="genBranchId && selMonth && selYear && !matchedRun && !generating" class="mt-3 text-xs text-amber-600">
          No payroll run found for {{ monthName(selMonth) }} {{ selYear }}. Please process payroll first.
        </div>

        <!-- Applicable templates preview -->
        <div *ngIf="branchTemplateInfo" class="mt-4 border border-gray-100 rounded-lg bg-gray-50 p-4">
          <p class="text-sm font-medium text-gray-700 mb-2">
            Applicable registers for <span class="font-semibold">{{ branchTemplateInfo.branchName }}</span>
            <span class="text-xs text-gray-500 ml-1">({{ branchTemplateInfo.branchType }} — {{ branchTemplateInfo.establishmentCategory }})</span>
            <span class="ml-2 inline-flex items-center rounded-full bg-indigo-100 text-indigo-800 px-2.5 py-0.5 text-xs font-semibold">
              {{ stateName(branchTemplateInfo.stateCode) }}
            </span>
          </p>
          <div class="flex flex-wrap gap-2">
            <span *ngFor="let t of branchTemplateInfo.templates"
              class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
              [class]="t.establishmentType === 'COMMON' ? 'bg-blue-100 text-blue-800' :
                        t.establishmentType === 'FACTORY' ? 'bg-orange-100 text-orange-800' :
                        'bg-green-100 text-green-800'">
              {{ t.title }}
            </span>
          </div>
        </div>

        <!-- Result feedback -->
        <div *ngIf="genResult" class="mt-4 p-3 rounded-lg text-sm"
          [class]="genResultError ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'">
          {{ genResult }}
        </div>
      </div>

      <!-- ═══════ Download & Filter Bar ═══════ -->
      <div class="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
        <div class="flex flex-wrap items-end gap-4">
          <div class="flex-1 min-w-[180px]">
            <label class="block text-sm font-medium text-gray-700 mb-1">Filter by Act</label>
            <select class="w-full rounded-lg border-gray-300 shadow-sm text-sm py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500"
              [(ngModel)]="filterAct" (ngModelChange)="onActChange()">
              <option value="">All Acts</option>
              <option *ngFor="let a of filteredActs" [value]="a.value">{{ a.label }}</option>
            </select>
          </div>
          <div class="flex-1 min-w-[180px]">
            <label class="block text-sm font-medium text-gray-700 mb-1">Filter by Register Type</label>
            <select class="w-full rounded-lg border-gray-300 shadow-sm text-sm py-2 px-3 border focus:ring-indigo-500 focus:border-indigo-500"
              [(ngModel)]="filterRegisterType" (ngModelChange)="reload()">
              <option value="">{{ filterAct ? 'All under this Act' : 'All Registers' }}</option>
              <option *ngFor="let rt of filteredRegisterTypes" [value]="rt.value">{{ rt.label }}</option>
            </select>
          </div>
          <div class="flex gap-2">
            <button
              class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
              [disabled]="downloading || rows.length === 0"
              (click)="downloadAll()">
              <svg *ngIf="!downloading" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <svg *ngIf="downloading" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"></circle>
                <path fill="currentColor" class="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              {{ downloading ? 'Preparing ZIP...' : 'Download All as ZIP' }}
            </button>
          </div>
        </div>
      </div>

      <div *ngIf="error" class="mb-6">
        <ui-empty-state
          title="Error Loading Registers"
          [description]="error">
        </ui-empty-state>
      </div>

      <ui-loading-spinner *ngIf="loading" text="Loading registers..." size="lg"></ui-loading-spinner>

      <ui-empty-state
        *ngIf="!loading && !error && rows.length === 0"
        title="No Registers Found"
        description="No statutory registers match the selected filters. Select a branch, month, and year above to generate registers.">
      </ui-empty-state>

      <ui-data-table
        *ngIf="!loading && !error && rows.length > 0"
        [columns]="columns"
        [data]="rows"
        [loading]="loading"
        emptyMessage="No records found.">

        <ng-template uiTableCell="title" let-row>
          <div class="font-semibold text-gray-900">{{ row.title }}</div>
          <div *ngIf="row.registerType" class="text-xs text-gray-500">{{ row.registerType }}</div>
        </ng-template>

        <ng-template uiTableCell="registerType" let-row>
          <span *ngIf="row.registerType"
            class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
            [class]="registerTypeBadge(row.registerType)">
            {{ registerTypeLabel(row.registerType) }}
          </span>
          <span *ngIf="!row.registerType" class="text-xs text-gray-400">—</span>
        </ng-template>

        <ng-template uiTableCell="state" let-row>
          <span *ngIf="row.stateCode"
            class="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-0.5 text-xs font-medium">
            {{ stateName(row.stateCode) }}
          </span>
          <span *ngIf="!row.stateCode" class="text-xs text-gray-400">—</span>
        </ng-template>

        <ng-template uiTableCell="period" let-row>
          <span class="text-sm text-gray-700">{{ monthName(row.periodMonth) }} {{ row.periodYear }}</span>
        </ng-template>

        <ng-template uiTableCell="status" let-row>
          <ui-status-badge [status]="row.approvalStatus || 'PENDING'"></ui-status-badge>
        </ng-template>

        <ng-template uiTableCell="actions" let-row>
          <div class="flex items-center gap-2">
            <button
              class="inline-flex items-center gap-1 rounded-md bg-white border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition"
              (click)="download(row)">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
            <ui-button
              *ngIf="row.approvalStatus !== 'APPROVED'"
              size="sm" variant="primary" (clicked)="approve(row)">
              Approve
            </ui-button>
            <ui-button
              *ngIf="row.approvalStatus !== 'REJECTED'"
              size="sm" variant="danger" (clicked)="reject(row)">
              Reject
            </ui-button>
          </div>
        </ng-template>
      </ui-data-table>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollRegistersComponent implements OnInit, OnDestroy {
  clients: PayrollClient[] = [];
  rows: RegisterRecordRow[] = [];
  loading = false;
  error = '';
  clientOptions: SelectOption[] = [{ value: null, label: 'All Clients' }];

  private reload$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  // ── Generate panel state ──
  allRuns: any[] = [];
  genBranches: { id: string; branchName: string; branchType: string; stateCode: string }[] = [];
  genBranchId = '';
  selMonth: number | null = null;
  selYear: number | null = null;
  matchedRun: { id: string; label: string } | null = null;
  generating = false;
  genResult = '';
  genResultError = false;
  branchTemplateInfo: BranchTemplateInfo | null = null;
  downloading = false;

  // ── Filter state ──
  filterAct = '';
  filterRegisterType = '';

  // ── Dropdown data ──
  months = MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }));
  years: number[] = [];

  acts = [
    { value: 'CODE_ON_WAGES', label: 'Code on Wages / Minimum Wages Act' },
    { value: 'FACTORIES_ACT', label: 'Factories Act' },
    { value: 'SHOPS_ESTABLISHMENTS', label: 'Shops & Establishments Act' },
    { value: 'SOCIAL_SECURITY', label: 'Social Security Code (PF / ESI / Gratuity)' },
    { value: 'GRATUITY', label: 'Payment of Gratuity Act' },
    { value: 'STATE_TAX', label: 'Professional Tax Act' },
    { value: 'BONUS_ACT', label: 'Payment of Bonus Act' },
    { value: 'CLRA', label: 'Contract Labour (Regulation & Abolition) Act' },
    { value: 'MATERNITY_BENEFIT', label: 'Maternity Benefit Act' },
    { value: 'EQUAL_REMUNERATION', label: 'Equal Remuneration Act' },
    { value: 'EC', label: "Employees' Compensation Act" },
    { value: 'POSH', label: 'POSH Act (Sexual Harassment at Workplace)' },
    { value: 'LWF', label: 'Labour Welfare Fund' },
  ];

  registerTypes: { value: string; label: string; act: string; portalType: 'PAYROLL' | 'BRANCH' }[] = [
    // ── Code on Wages / Minimum Wages Act / Payment of Wages Act (PAYROLL-LINKED) ──
    { value: 'WAGE_REGISTER', label: 'Wage Register (Form D)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'MUSTER_ROLL', label: 'Muster Roll (Form F)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'OVERTIME_REGISTER', label: 'Overtime Register (Form IX)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'LEAVE_REGISTER', label: 'Leave with Wages Register (Form 15)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'DEDUCTION_REGISTER', label: 'Register of Deductions (Form E)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'FINE_REGISTER', label: 'Register of Fines (Form C)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'ADVANCE_REGISTER', label: 'Register of Advances (Form C)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'DAMAGE_LOSS_REGISTER', label: 'Register of Damage / Loss', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'WAGE_SLIP_REGISTER', label: 'Wage Slip Register', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'ANNUAL_RETURN_WAGES', label: 'Annual Return (Form III / Form 28)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'MINIMUM_WAGE_ABSTRACT', label: 'Minimum Wages Abstract (Notice)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'COMB_EMPLOYEE_REGISTER', label: 'Employee Register (Form A – Combined)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'COMB_MUSTER_ROLL', label: 'Muster Roll (Form C – Combined)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    { value: 'COMB_FINE_DED_ADV_OT', label: 'Fines / Deductions / Advances / OT Register (Form E)', act: 'CODE_ON_WAGES', portalType: 'PAYROLL' },
    // ── Factories Act: Payroll-Linked (auto-generated from payroll data) ──
    { value: 'ADULT_WORKER_REGISTER', label: 'Register of Adult Workers', act: 'FACTORIES_ACT', portalType: 'PAYROLL' },
    { value: 'LEAVE_BOOK', label: 'Leave Book / Worker Leave Record', act: 'FACTORIES_ACT', portalType: 'PAYROLL' },
    // ── Factories Act: Event/Manual (route to Branch/Client/CRM for upload) ──
    { value: 'NOTICE_PERIODS_OF_WORK', label: 'Notice of Periods of Work', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'CHILD_WORKER_REGISTER', label: 'Register of Child/Adolescent Workers', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'COMPENSATORY_HOLIDAY_REGISTER', label: 'Compensatory Holiday Register', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'ACCIDENT_REGISTER', label: 'Accident Register', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'INSPECTION_BOOK', label: 'Inspection Book', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'DANGEROUS_OCCURRENCE_REGISTER', label: 'Dangerous Occurrence Register', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'PRESSURE_VESSEL_REGISTER', label: 'Pressure Vessel Examination Register', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'LIFTING_MACHINE_REGISTER', label: 'Lifting Machine / Tackle Register', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'HOIST_LIFT_REGISTER', label: 'Hoist / Lift Register', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'MEDICAL_EXAMINATION_REGISTER', label: 'Medical Examination Register', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'HUMIDITY_REGISTER', label: 'Humidity Register', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'WHITEWASHING_RECORD', label: 'Whitewashing / Painting Record', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'HAZARDOUS_PROCESS_REGISTER', label: 'Hazardous Process Register', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    { value: 'DANGEROUS_OPERATION_REGISTER', label: 'Dangerous Operation Register', act: 'FACTORIES_ACT', portalType: 'BRANCH' },
    // ── Shops & Establishments Act (Payroll-Linked) ──
    { value: 'SHOPS_WAGE_REGISTER', label: 'Wage Register', act: 'SHOPS_ESTABLISHMENTS', portalType: 'PAYROLL' },
    { value: 'SHOPS_LEAVE_REGISTER', label: 'Leave Register', act: 'SHOPS_ESTABLISHMENTS', portalType: 'PAYROLL' },
    { value: 'SHOPS_WORK_HOURS_REGISTER', label: 'Working Hours / Overtime Register', act: 'SHOPS_ESTABLISHMENTS', portalType: 'PAYROLL' },
    // ── Shops & Establishments Act (Event/Manual - Branch) ──
    { value: 'EMPLOYEE_REGISTER', label: 'Employee Register (Form A)', act: 'SHOPS_ESTABLISHMENTS', portalType: 'BRANCH' },
    { value: 'SHOPS_EMPLOYMENT_CARD', label: 'Employment Card / Service Record', act: 'SHOPS_ESTABLISHMENTS', portalType: 'BRANCH' },
    { value: 'SHOPS_HOLIDAY_REGISTER', label: 'Weekly / Compensatory Holiday Register', act: 'SHOPS_ESTABLISHMENTS', portalType: 'BRANCH' },
    { value: 'SHOPS_ANNUAL_RETURN', label: 'Annual Return (Shops Act)', act: 'SHOPS_ESTABLISHMENTS', portalType: 'BRANCH' },
    { value: 'SHOPS_NOTICE_DISPLAY', label: 'Display of Notices & Abstracts', act: 'SHOPS_ESTABLISHMENTS', portalType: 'BRANCH' },
    // ── Social Security Code (Payroll-Linked) ──
    { value: 'PF_REGISTER', label: 'PF Contribution Register', act: 'SOCIAL_SECURITY', portalType: 'PAYROLL' },
    { value: 'ESI_REGISTER', label: 'ESI Contribution Register', act: 'SOCIAL_SECURITY', portalType: 'PAYROLL' },
    { value: 'GRATUITY_REGISTER', label: 'Gratuity Register', act: 'SOCIAL_SECURITY', portalType: 'PAYROLL' },
    { value: 'ECR', label: 'PF ECR', act: 'SOCIAL_SECURITY', portalType: 'PAYROLL' },
    { value: 'ESI', label: 'ESI Contribution', act: 'SOCIAL_SECURITY', portalType: 'PAYROLL' },
    { value: 'PF_CHALLAN_REGISTER', label: 'PF Payment / Challan Register', act: 'SOCIAL_SECURITY', portalType: 'PAYROLL' },
    { value: 'ESI_CHALLAN_REGISTER', label: 'ESI Payment / Challan Register', act: 'SOCIAL_SECURITY', portalType: 'PAYROLL' },
    // ── Social Security Code (Event/Manual - Branch) ──
    { value: 'PF_NOMINATION_REGISTER', label: 'PF Nomination Register (Form 2)', act: 'SOCIAL_SECURITY', portalType: 'BRANCH' },
    { value: 'ESI_ACCIDENT_REGISTER', label: 'ESI Accident / Sickness Register', act: 'SOCIAL_SECURITY', portalType: 'BRANCH' },
    { value: 'GRATUITY_NOMINATION_REGISTER', label: 'Gratuity Nomination Register (Form F)', act: 'SOCIAL_SECURITY', portalType: 'BRANCH' },
    { value: 'PF_DECLARATION_REGISTER', label: 'PF Declaration Register (Form 11)', act: 'SOCIAL_SECURITY', portalType: 'BRANCH' },
    { value: 'PF_ECR_REGISTER', label: 'ECR Filing History Register', act: 'SOCIAL_SECURITY', portalType: 'BRANCH' },
    { value: 'PF_INSPECTION_LOG', label: 'PF Inspection / Query Log', act: 'SOCIAL_SECURITY', portalType: 'BRANCH' },
    { value: 'ESI_CLAIMS_REGISTER', label: 'ESI Claim Support Register', act: 'SOCIAL_SECURITY', portalType: 'BRANCH' },
    // ── Payment of Gratuity Act (Payroll-Linked) ──
    { value: 'GRAT_COMPUTATION_REGISTER', label: 'Gratuity Computation Register', act: 'GRATUITY', portalType: 'PAYROLL' },
    { value: 'GRAT_PAYMENT_REGISTER', label: 'Gratuity Payment Register', act: 'GRATUITY', portalType: 'PAYROLL' },
    // ── Payment of Gratuity Act (Event/Manual - Branch) ──
    { value: 'GRAT_NOMINATION', label: 'Gratuity Nomination (Form F)', act: 'GRATUITY', portalType: 'BRANCH' },
    { value: 'GRAT_ELIGIBILITY_TRACKER', label: 'Gratuity Eligibility Tracker', act: 'GRATUITY', portalType: 'BRANCH' },
    { value: 'GRAT_NOTICE_OPENING', label: 'Gratuity Notice of Opening (Form A)', act: 'GRATUITY', portalType: 'BRANCH' },
    // ── Professional Tax (Payroll-Linked) ──
    { value: 'PT_REGISTER', label: 'Professional Tax Register', act: 'STATE_TAX', portalType: 'PAYROLL' },
    { value: 'PT_RETURN_REGISTER', label: 'PT Monthly / Annual Return', act: 'STATE_TAX', portalType: 'PAYROLL' },
    // ── Payment of Bonus Act (Payroll-Linked) ──
    { value: 'BONUS_REGISTER', label: 'Bonus Register (Form A)', act: 'BONUS_ACT', portalType: 'PAYROLL' },
    { value: 'BONUS_COMPUTATION_SHEET', label: 'Allocable Surplus Computation (Form B)', act: 'BONUS_ACT', portalType: 'PAYROLL' },
    { value: 'BONUS_SET_ON_OFF', label: 'Set-On / Set-Off Register (Form C)', act: 'BONUS_ACT', portalType: 'PAYROLL' },
    { value: 'BONUS_ANNUAL_RETURN', label: 'Annual Return (Form D)', act: 'BONUS_ACT', portalType: 'PAYROLL' },
    // ── Contract Labour (Regulation & Abolition) Act (Payroll-Linked) ──
    { value: 'CONTRACT_MUSTER_ROLL', label: 'Muster Roll (Form XVI - Contract Labour)', act: 'CLRA', portalType: 'PAYROLL' },
    { value: 'CONTRACT_WAGE_REGISTER', label: 'Wage Register (Form XVII - Contract Labour)', act: 'CLRA', portalType: 'PAYROLL' },
    { value: 'CONTRACT_DEDUCTION_REGISTER', label: 'Deduction Register (Contract Labour)', act: 'CLRA', portalType: 'PAYROLL' },
    { value: 'CONTRACT_OVERTIME_REGISTER', label: 'Overtime Register (Contract Labour)', act: 'CLRA', portalType: 'PAYROLL' },
    { value: 'CLRA_WAGE_CUM_MUSTER', label: 'Wage-cum-Muster Roll (Form XVIII)', act: 'CLRA', portalType: 'PAYROLL' },
    { value: 'CLRA_WAGE_SLIP', label: 'Wage Slip (Form XIX - Contract Labour)', act: 'CLRA', portalType: 'PAYROLL' },
    // ── Contract Labour (Regulation & Abolition) Act (Event/Manual - Branch) ──
    { value: 'CONTRACTOR_REGISTER', label: 'Register of Contractors (Form XII)', act: 'CLRA', portalType: 'BRANCH' },
    { value: 'CONTRACT_WORKMEN_REGISTER', label: 'Register of Contract Workmen (Form XIII)', act: 'CLRA', portalType: 'BRANCH' },
    { value: 'CONTRACT_EMPLOYMENT_CARD', label: 'Employment Card (Form XIV)', act: 'CLRA', portalType: 'BRANCH' },
    { value: 'CLRA_SERVICE_CERT', label: 'Service Certificate (Form XV)', act: 'CLRA', portalType: 'BRANCH' },
    { value: 'CONTRACT_ANNUAL_RETURN', label: 'Annual Return (CLRA - Form XXV)', act: 'CLRA', portalType: 'BRANCH' },
    // ── Maternity Benefit Act (Event/Manual - Branch) ──
    { value: 'MATERNITY_REGISTER', label: 'Maternity Benefit Register (Form L)', act: 'MATERNITY_BENEFIT', portalType: 'BRANCH' },
    { value: 'MATERNITY_LEAVE_REGISTER', label: 'Maternity Leave Register', act: 'MATERNITY_BENEFIT', portalType: 'BRANCH' },
    { value: 'MATERNITY_PAYMENT_REGISTER', label: 'Maternity Payment Register', act: 'MATERNITY_BENEFIT', portalType: 'BRANCH' },
    { value: 'MATERNITY_DISMISSAL_REGISTER', label: 'Dismissal / Discharge Register', act: 'MATERNITY_BENEFIT', portalType: 'BRANCH' },
    { value: 'MATERNITY_ANNUAL_RETURN', label: 'Annual Return (Maternity - Form R)', act: 'MATERNITY_BENEFIT', portalType: 'BRANCH' },
    { value: 'MATERNITY_MEDICAL_DOCS', label: 'Maternity Medical Document Log', act: 'MATERNITY_BENEFIT', portalType: 'BRANCH' },
    { value: 'MATERNITY_NURSING_RECORD', label: 'Nursing Break / Creche Record', act: 'MATERNITY_BENEFIT', portalType: 'BRANCH' },
    // ── Equal Remuneration Act (Event/Manual - Branch) ──
    { value: 'EQUAL_REMUNERATION_REGISTER', label: 'Equal Remuneration Register (Form D)', act: 'EQUAL_REMUNERATION', portalType: 'BRANCH' },
    { value: 'EQUAL_REMUNERATION_RETURN', label: 'Annual Return (ER Act)', act: 'EQUAL_REMUNERATION', portalType: 'BRANCH' },
    // ── Employees' Compensation Act (Event/Manual - Branch) ──
    { value: 'EC_ACCIDENT_REGISTER', label: "Accident Register (Employees' Compensation Act)", act: 'EC', portalType: 'BRANCH' },
    { value: 'EC_COMP_CASE_TRACKER', label: 'Compensation Case Tracker', act: 'EC', portalType: 'BRANCH' },
    { value: 'EC_INSURER_LOG', label: 'Insurer Intimation Log', act: 'EC', portalType: 'BRANCH' },
    { value: 'EC_NOTICE_LOG', label: 'Notice Received / Sent Register', act: 'EC', portalType: 'BRANCH' },
    // ── POSH Act (Sexual Harassment at Workplace) (Event/Manual - Branch) ──
    { value: 'POSH_COMPLAINT_REGISTER', label: 'Complaint Register (POSH)', act: 'POSH', portalType: 'BRANCH' },
    { value: 'POSH_INQUIRY_REGISTER', label: 'Inquiry Proceedings Register (POSH)', act: 'POSH', portalType: 'BRANCH' },
    { value: 'POSH_ACTION_REGISTER', label: 'Recommendation / Action Taken Register', act: 'POSH', portalType: 'BRANCH' },
    { value: 'POSH_ANNUAL_REPORT', label: 'Annual Report Tracker (POSH)', act: 'POSH', portalType: 'BRANCH' },
    { value: 'POSH_ICC_REGISTER', label: 'ICC Member / Tenure Register', act: 'POSH', portalType: 'BRANCH' },
    // ── Labour Welfare Fund (Payroll-Linked) ──
    { value: 'LWF_REGISTER', label: 'Labour Welfare Fund Register', act: 'LWF', portalType: 'PAYROLL' },
    { value: 'LWF_CONTRIBUTION_REGISTER', label: 'LWF Contribution / Challan Register', act: 'LWF', portalType: 'PAYROLL' },
  ];

  get filteredRegisterTypes() {
    // Show only PAYROLL-type registers in the Payroll Portal
    let filtered = this.registerTypes.filter(rt => rt.portalType === 'PAYROLL');
    if (!this.filterAct) return filtered;
    return filtered.filter(rt => rt.act === this.filterAct);
  }

  get filteredActs() {
    // Show only acts that have PAYROLL-type registers
    const payrollActs = new Set(this.registerTypes.filter(rt => rt.portalType === 'PAYROLL').map(rt => rt.act));
    return this.acts.filter(act => payrollActs.has(act.value));
  }

  columns: TableColumn[] = [
    { key: 'title', header: 'Title', sortable: true },
    { key: 'registerType', header: 'Type', sortable: true, width: '160px' },
    { key: 'state', header: 'State', sortable: true, width: '140px' },
    { key: 'period', header: 'Period', sortable: true, width: '140px' },
    { key: 'status', header: 'Status', sortable: true, width: '120px' },
    { key: 'actions', header: 'Actions', sortable: false, width: '260px', align: 'center' },
  ];

  q: { clientId: string | null; category: string; periodYear: number | null; periodMonth: number | null; registerType: string } = {
    clientId: null,
    category: '',
    periodYear: null,
    periodMonth: null,
    registerType: '',
  };

  get canGenerate(): boolean {
    return !!this.genBranchId && !!this.matchedRun;
  }

  constructor(
    private payrollApi: PayrollApiService,
    private api: PayrollRegistersService,
    private cdr: ChangeDetectorRef,
    private dialog: ConfirmDialogService,
    private route: ActivatedRoute,
  ) {}

  private initialLoadDone = false;

  ngOnInit(): void {
    // Build year list
    const currentYear = new Date().getFullYear();
    this.years = [];
    for (let y = currentYear + 1; y >= currentYear - 3; y--) this.years.push(y);

    const routeClientId = this.route.snapshot.paramMap.get('clientId') || '';
    if (routeClientId) this.q.clientId = routeClientId;

    this.payrollApi.getAssignedClients().pipe(takeUntil(this.destroy$)).subscribe({
      next: (list) => {
        this.clients = list || [];
        this.clientOptions = [
          { value: null, label: 'All Clients' },
          ...this.clients.map((c) => ({ value: c.id, label: c.name })),
        ];
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.error = `Unable to load clients. ${e?.error?.message || ''}`;
        this.cdr.markForCheck();
      },
    });

    // Load branches filtered by client
    if (routeClientId) {
      this.payrollApi.getOptionBranches(routeClientId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (branches) => {
          this.genBranches = (branches || []).map((b: any) => ({
            id: b.id,
            branchName: b.branchName || b.branchname || b.name || '',
            branchType: b.branchType || b.branchtype || b.type || '',
            stateCode: b.stateCode || b.statecode || '',
          }));
          this.cdr.markForCheck();
        },
      });
    }

    // Load runs for matching
    this.api.getPayrollRuns(routeClientId || undefined).pipe(takeUntil(this.destroy$)).subscribe({
      next: (runs) => {
        this.allRuns = runs || [];
        this.cdr.markForCheck();
      },
    });

    // Subject-driven reload for user filter changes
    this.reload$
      .pipe(
        debounceTime(150),
        tap(() => {
          if (!this.initialLoadDone) return;
          this.loading = true; this.error = '';
          this.cdr.markForCheck();
        }),
        switchMap(() => {
          if (!this.initialLoadDone) return of(null);
          return this.fetchRegisters$();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (rows) => {
          if (rows !== null) {
            this.rows = rows || [];
            this.loading = false;
            this.cdr.detectChanges();
          }
        },
        error: () => {
          this.loading = false;
          this.rows = [];
          this.cdr.detectChanges();
        },
      });

    // Direct initial load
    this.loading = true;
    this.fetchRegisters$().pipe(takeUntil(this.destroy$)).subscribe({
      next: (rows) => {
        this.rows = rows || [];
        this.loading = false;
        this.cdr.detectChanges();
        setTimeout(() => { this.initialLoadDone = true; });
      },
      error: () => {
        this.loading = false;
        this.rows = [];
        this.cdr.detectChanges();
        setTimeout(() => { this.initialLoadDone = true; });
      },
    });
  }

  private fetchRegisters$() {
    return this.api
      .listRegisters({
        clientId: this.q.clientId ?? undefined,
        branchId: this.genBranchId || undefined,
        periodYear: this.selYear ?? this.q.periodYear ?? undefined,
        periodMonth: this.selMonth ?? this.q.periodMonth ?? undefined,
        registerType: this.filterRegisterType || undefined,
      })
      .pipe(
        map((rows) => {
          // Client-side act filter: when an act is selected but no specific registerType,
          // filter rows to only those whose registerType belongs to the selected act
          if (this.filterAct && !this.filterRegisterType) {
            const actTypes = new Set(this.registerTypes.filter(rt => rt.act === this.filterAct).map(rt => rt.value));
            return (rows || []).filter(r => actTypes.has(r.registerType || ''));
          }
          return rows;
        }),
        timeout(10000),
        catchError((e) => {
          this.error = e?.error?.message || `Unable to load registers. ${e?.message || ''}`;
          this.cdr.markForCheck();
          return of([] as RegisterRecordRow[]);
        }),
        finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
      );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.reload$.complete();
  }

  onActChange(): void {
    // Reset register type when act changes, since old selection may not belong to new act
    this.filterRegisterType = '';
    this.reload();
  }

  reload(): void {
    this.reload$.next();
  }

  /* ── Generate panel methods ── */

  onBranchChange(): void {
    this.genResult = '';
    this.branchTemplateInfo = null;
    if (this.genBranchId) {
      this.api.getApplicableTemplates(this.genBranchId).pipe(
        takeUntil(this.destroy$),
        catchError(() => of(null)),
      ).subscribe((info) => {
        this.branchTemplateInfo = info;
        this.cdr.markForCheck();
      });
    }
    this.matchRun();
    this.reload();
  }

  onPeriodChange(): void {
    this.genResult = '';
    this.matchRun();
    this.reload();
  }

  private matchRun(): void {
    this.matchedRun = null;
    if (!this.selMonth || !this.selYear) return;
    const match = this.allRuns.find(
      (r) =>
        Number(r.periodMonth) === this.selMonth &&
        Number(r.periodYear) === this.selYear &&
        (r.status === 'APPROVED' || r.status === 'PROCESSED' || r.status === 'COMPLETED' || r.status === 'DRAFT'),
    );
    if (match) {
      this.matchedRun = {
        id: match.id,
        label: `${match.clientName || ''} — ${String(match.periodMonth).padStart(2, '0')}/${match.periodYear} (${match.status})`,
      };
    }
    this.cdr.markForCheck();
  }

  generateRegisters(): void {
    if (!this.matchedRun || !this.genBranchId) return;
    this.generating = true;
    this.genResult = '';
    this.genResultError = false;
    this.cdr.markForCheck();

    this.api.generateAllRegisters(this.matchedRun.id, this.genBranchId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.generating = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res) => {
        const g = res?.generated?.length ?? 0;
        const s = res?.skipped?.length ?? 0;
        const parts: string[] = [];
        if (g > 0) parts.push(`${g} register(s) generated successfully`);
        if (s > 0) parts.push(`${s} skipped (already exist)`);
        this.genResult = parts.join('. ') || 'Done.';
        this.genResultError = false;
        this.cdr.markForCheck();
        // Refresh list
        this.loading = true;
        this.fetchRegisters$().pipe(takeUntil(this.destroy$)).subscribe({
          next: (rows) => { this.rows = rows || []; this.loading = false; this.cdr.detectChanges(); },
          error: () => { this.loading = false; this.cdr.detectChanges(); },
        });
      },
      error: (e) => {
        this.genResult = e?.error?.message || 'Generation failed. Check the payroll run and branch.';
        this.genResultError = true;
        this.cdr.markForCheck();
      },
    });
  }

  /* ── Downloads ── */

  download(r: RegisterRecordRow): void {
    this.api.downloadRegister(r.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => this.api.saveBlob(blob, r.fileName || `${r.registerType || r.category}_${r.id}.xlsx`),
      error: (e) => { this.error = e?.error?.message || 'Download failed'; this.cdr.markForCheck(); },
    });
  }

  downloadAll(): void {
    this.downloading = true;
    this.cdr.markForCheck();
    this.api.downloadRegistersPack({
      clientId: this.q.clientId ?? undefined,
      branchId: this.genBranchId || undefined,
      periodYear: this.selYear ?? undefined,
      periodMonth: this.selMonth ?? undefined,
      registerType: this.filterRegisterType || undefined,
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.downloading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (blob) => {
        const period = this.selMonth && this.selYear ? `${this.selYear}-${String(this.selMonth).padStart(2, '0')}` : 'all';
        this.api.saveBlob(blob, `registers_${period}.zip`);
      },
      error: (e) => {
        this.error = e?.error?.message || 'Download pack failed';
        this.cdr.markForCheck();
      },
    });
  }

  /* ── Approval ── */

  approve(r: RegisterRecordRow): void {
    if (!confirm('Are you sure you want to approve this register?')) return;
    this.api.approveRegister(r.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.reload(),
      error: (e) => { this.error = e?.error?.message || 'Approve failed'; },
    });
  }

  async reject(r: RegisterRecordRow): Promise<void> {
    const result = await this.dialog.prompt('Reject Register', 'Rejection reason (optional):', { placeholder: 'Reason' });
    if (!result.confirmed) return;
    const reason = result.value ?? '';
    this.api.rejectRegister(r.id, reason).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.reload(),
      error: (e) => { this.error = e?.error?.message || 'Reject failed'; },
    });
  }

  /* ── Helpers ── */

  monthName(m: number | null | undefined): string {
    if (!m || m < 1 || m > 12) return '—';
    return MONTH_NAMES[m - 1];
  }

  registerTypeLabel(type: string): string {
    return this.registerTypes.find((rt) => rt.value === type)?.label || type?.replace(/_/g, ' ') || '—';
  }

  registerTypeBadge(type: string): string {
    if (type?.includes('PF') || type === 'ECR') return 'bg-purple-100 text-purple-800';
    if (type?.includes('ESI')) return 'bg-teal-100 text-teal-800';
    if (type?.includes('WAGE') || type?.includes('MUSTER') || type?.includes('WAGE_SLIP')) return 'bg-orange-100 text-orange-800';
    if (type?.includes('BONUS')) return 'bg-yellow-100 text-yellow-800';
    if (type?.includes('PT')) return 'bg-pink-100 text-pink-800';
    if (type?.includes('LEAVE')) return 'bg-green-100 text-green-800';
    if (type?.includes('OVERTIME')) return 'bg-red-100 text-red-800';
    if (type?.includes('DEDUCTION')) return 'bg-indigo-100 text-indigo-800';
    if (type?.includes('MATERNITY')) return 'bg-rose-100 text-rose-800';
    if (type?.includes('GRATUITY')) return 'bg-amber-100 text-amber-800';
    if (type?.includes('CONTRACT')) return 'bg-cyan-100 text-cyan-800';
    if (type?.includes('EMPLOYEE') || type?.includes('ADULT_WORKER') || type?.includes('EMPLOYMENT_CARD')) return 'bg-blue-100 text-blue-800';
    if (type?.includes('ACCIDENT') || type?.includes('DANGEROUS')) return 'bg-red-100 text-red-800';
    if (type?.includes('FINE') || type?.includes('ADVANCE') || type?.includes('DAMAGE_LOSS')) return 'bg-slate-100 text-slate-800';
    if (type?.includes('EQUAL_REMUNERATION')) return 'bg-violet-100 text-violet-800';
    if (type?.includes('CHILD_WORKER') || type?.includes('MEDICAL_EXAM')) return 'bg-amber-100 text-amber-800';
    if (type?.includes('PRESSURE_VESSEL') || type?.includes('LIFTING_MACHINE') || type?.includes('HOIST_LIFT')) return 'bg-orange-100 text-orange-800';
    if (type?.includes('HUMIDITY') || type?.includes('WHITEWASH') || type?.includes('HAZARDOUS')) return 'bg-yellow-100 text-yellow-800';
    if (type?.includes('INSPECTION') || type?.includes('NOTICE_PERIOD') || type?.includes('COMPENSATORY')) return 'bg-sky-100 text-sky-800';
    if (type?.includes('SHOPS_')) return 'bg-lime-100 text-lime-800';
    if (type?.includes('ANNUAL_RETURN') || type?.includes('RETURN')) return 'bg-stone-100 text-stone-800';
    if (type?.includes('NOMINATION') || type?.startsWith('GRAT_')) return 'bg-fuchsia-100 text-fuchsia-800';
    if (type?.includes('ABSTRACT') || type?.includes('DISPLAY') || type?.includes('NOTICE_LOG')) return 'bg-sky-100 text-sky-800';
    if (type?.includes('COMPUTATION') || type?.includes('SET_ON')) return 'bg-yellow-100 text-yellow-800';
    if (type?.includes('DISMISSAL')) return 'bg-red-100 text-red-800';
    if (type?.includes('POSH_')) return 'bg-pink-100 text-pink-800';
    if (type?.includes('EC_')) return 'bg-red-100 text-red-800';
    if (type?.includes('LWF_')) return 'bg-emerald-100 text-emerald-800';
    if (type?.includes('COMB_')) return 'bg-orange-100 text-orange-800';
    if (type?.includes('CLRA_') || type?.includes('SERVICE_CERT')) return 'bg-cyan-100 text-cyan-800';
    if (type?.includes('CHALLAN') || type?.includes('ECR_') || type?.includes('DECLARATION')) return 'bg-purple-100 text-purple-800';
    return 'bg-gray-100 text-gray-800';
  }

  stateName(code: string | null | undefined): string {
    if (!code) return '—';
    return STATE_NAMES[code.toUpperCase()] || code;
  }

  clientName(clientId: string): string {
    return this.clients.find((c) => c.id === clientId)?.name || '—';
  }
}

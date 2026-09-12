import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  ContractorEmployee,
  ContractorEmployeesApiService,
  CreateEmployeeDto,
  SkillCategory,
} from '../../../core/contractor-employees-api.service';
import {
  ContractorBranchItem,
  ContractorProfileApiService,
} from '../../../core/contractor-profile-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { describeApiError } from '../../../shared/utils/api-error.util';
import {
  SKILL_CATEGORIES,
  skillCategoryLabel,
} from '../shared/skill-category';
import * as XLSX from 'xlsx';
import { downloadBlob } from '../../../shared/utils/download-blob';

interface EmployeeForm {
  name: string;
  gender: string;
  dateOfBirth: string;
  fatherName: string;
  phone: string;
  email: string;
  designation: string;
  department: string;
  dateOfJoining: string;
  punchCode: string;
  bankAccount: string;
  aadhaar: string;
  pan: string;
  uan: string;
  esic: string;
  pfApplicable: boolean;
  esiApplicable: boolean;
  branchId: string;
  skillCategory: SkillCategory | '';
  monthlySalary: number | null;
  dailyWage: number | null;
}

function emptyForm(): EmployeeForm {
  return {
    name: '',
    gender: '',
    dateOfBirth: '',
    fatherName: '',
    phone: '',
    email: '',
    designation: '',
    department: '',
    dateOfJoining: '',
    punchCode: '',
    bankAccount: '',
    aadhaar: '',
    pan: '',
    uan: '',
    esic: '',
    pfApplicable: false,
    esiApplicable: false,
    branchId: '',
    skillCategory: '',
    monthlySalary: null,
    dailyWage: null,
  };
}

interface BulkPreviewRow {
  index: number;
  raw: Record<string, any>;
  dto: CreateEmployeeDto;
  errors: string[];
}

@Component({
  selector: 'app-contractor-employees-page',
  host: { class: 'bs-surface' },
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ui-page-header
        title="Workforce Roster"
        subtitle="Manage contractor employees — add workers, track gender headcount, and maintain records."
      ></ui-page-header>

      <!-- KPI bar -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button type="button" (click)="showWorkers('active')" class="workforce-metric bg-white rounded-xl border border-gray-100 p-4 shadow-sm" aria-label="View active workers">
          <p class="text-xs text-gray-500 font-medium mb-1">Active Workers</p>
          <p class="text-2xl font-bold text-gray-900">{{ totalActive }}</p>
        </button>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p class="text-xs text-gray-500 font-medium mb-1">Male</p>
          <p class="text-2xl font-bold text-brand-600">{{ maleCount }}</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p class="text-xs text-gray-500 font-medium mb-1">Female</p>
          <p class="text-2xl font-bold text-rose-500">{{ femaleCount }}</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p class="text-xs text-gray-500 font-medium mb-1">Inactive</p>
          <p class="text-2xl font-bold text-gray-400">{{ inactiveCount }}</p>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="workforce-toolbar flex flex-wrap gap-3 items-center justify-between">
        <div class="flex gap-2 flex-wrap items-center">
          <!-- Branch filter -->
          @if (availableBranches.length > 1) {
<select
           
            [(ngModel)]="selectedBranchId"
            (change)="onBranchChange()"
            class="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
          >
            <option value="">All Branches</option>
            @for (b of availableBranches; track b) {
<option [value]="b.id">{{ b.name || b.branchName }}</option>
}
          </select>
}
          <!-- Search -->
          <div class="relative">
            <svg class="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
            </svg>
            <input
              type="text"
              [(ngModel)]="searchTerm"
              (input)="applyFilters()"
              placeholder="Search by name or employee ID…"
              class="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:border-rose-400 w-52"
            />
          </div>
          <!-- Status filter -->
          <div class="btn-group" role="group" aria-label="Worker status filter">
            <button type="button" class="btn btn-outline-primary" [class.active]="statusFilter === 'active'" [attr.aria-pressed]="statusFilter === 'active'" (click)="statusFilter = 'active'; applyFilters()">Active</button>
            <button type="button" class="btn btn-outline-primary" [class.active]="statusFilter === 'inactive'" [attr.aria-pressed]="statusFilter === 'inactive'" (click)="statusFilter = 'inactive'; applyFilters()">Inactive</button>
            <button type="button" class="btn btn-outline-primary" [class.active]="statusFilter === 'all'" [attr.aria-pressed]="statusFilter === 'all'" (click)="statusFilter = 'all'; applyFilters()">All</button>
          </div>
        </div>
        <div class="flex gap-2 flex-wrap items-center">
          <button
            type="button"
            (click)="downloadWorkers()"
            [disabled]="loading || downloading || !!errorMsg || filteredRows.length === 0"
            title="Download the workers matching the current branch, status and search filters as Excel"
            class="btn btn-primary"
          >
            {{ downloading ? 'Preparing download…' : 'Download Workers' }}
          </button>
          <button
            (click)="openBulkUpload()"
            class="btn btn-outline-primary"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12"/>
            </svg>
            Bulk Upload
          </button>
          <button
            (click)="openAdd()"
            class="btn btn-outline-primary"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Add Employee
          </button>
        </div>
      </div>

      <!-- Loading -->
      @if (loading) {
<ui-loading-spinner text="Loading employees…"></ui-loading-spinner>
}

      <!-- Error -->
      @if (!loading && errorMsg) {
<div class="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        {{ errorMsg }}
      </div>
}

      <!-- Empty -->
      @if (!loading && !errorMsg && filteredRows.length === 0) {
<ui-empty-state
       
        title="No employees found"
        description="Add contractor workers to build your workforce roster."
      ></ui-empty-state>
}

      <!-- Table -->
      @if (!loading && filteredRows.length > 0) {
<div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-hover min-w-full divide-y divide-gray-100">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                @if (availableBranches.length >= 1) {
<th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Branch</th>
}
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Gender</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Designation</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Skill</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Monthly Salary</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Dept</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">PF</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">ESI</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[130px]">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (emp of filteredRows; track emp) {
<tr class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3">
                  <div class="font-medium text-sm text-gray-900">{{ emp.name }}</div>
                  <div class="text-xs text-gray-500 font-mono mt-0.5">Employee ID: {{ emp.employeeCode || 'Not assigned' }}</div>
                  @if (emp.phone) {
<div class="text-xs text-gray-400 mt-0.5">{{ emp.phone }}</div>
}
                </td>
                @if (availableBranches.length >= 1) {
<td class="px-4 py-3 text-sm text-gray-500">{{ branchName(emp.branchId) || '—' }}</td>
}
                <td class="px-4 py-3 text-sm text-gray-600">
                  @if (emp.gender) {
<span [class]="genderClass(emp.gender)" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium">
                    {{ emp.gender | uppercase }}
                  </span>
}
                  @if (!emp.gender) {
<span class="text-gray-300 text-xs">—</span>
}
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ emp.designation || '—' }}</td>
                <td class="px-4 py-3 text-sm">
                  @if (emp.skillCategory) {
<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                    {{ skillLabel(emp.skillCategory) }}
                  </span>
}
                  @if (!emp.skillCategory) {
<span class="text-gray-300 text-xs">—</span>
}
                </td>
                <td class="px-4 py-3 text-sm text-right tabular-nums text-gray-700">
                  @if (emp.monthlySalary !== null && emp.monthlySalary !== undefined) {
<span>₹ {{ emp.monthlySalary | number:'1.0-0' }}</span>
}
                  @if (emp.monthlySalary === null || emp.monthlySalary === undefined) {
<span class="text-gray-300">—</span>
}
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ emp.department || '—' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ emp.dateOfJoining ? (emp.dateOfJoining | date:'dd MMM yy') : '—' }}</td>
                <td class="px-4 py-3 text-center">
                  <span [class]="emp.pfApplicable ? 'text-green-600' : 'text-gray-300'" class="text-sm font-bold">
                    {{ emp.pfApplicable ? '✓' : '–' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-center">
                  <span [class]="emp.esiApplicable ? 'text-green-600' : 'text-gray-300'" class="text-sm font-bold">
                    {{ emp.esiApplicable ? '✓' : '–' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-center">
                  <span [class]="statusBadgeClass(emp)"
                        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border">
                    {{ statusLabel(emp) }}
                  </span>
                  @if (!emp.isActive && emp.dateOfExit) {
<div class="text-[10px] text-gray-400 mt-0.5">
                    Exited {{ emp.dateOfExit | date:'dd MMM yy' }}
                  </div>
}
                  @if (!emp.isActive && emp.exitReason) {
<div class="text-[10px] text-gray-400 italic" [title]="emp.exitReason">
                    {{ emp.exitReason | slice:0:24 }}{{ (emp.exitReason.length > 24) ? '…' : '' }}
                  </div>
}
                </td>
                <td class="px-4 py-3 text-right min-w-[130px] align-middle">
                  <div class="flex flex-wrap items-center justify-end gap-1.5">
                    @if (emp.status === 'PENDING_DELETE') {

                      <span class="inline-flex min-w-[96px] items-center justify-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                        Pending approval
                      </span>
                      <button
                        (click)="openEdit(emp)"
                        class="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100"
                      >Edit</button>
                    
} @else {

                      @if (!emp.isActive) {
<button
                       
                        (click)="doReactivate(emp)"
                        [disabled]="saving"
                        class="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                      >Reactivate</button>
}

                    <button
                      (click)="openEdit(emp)"
                        class="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100"
                    >Edit</button>

                    @if (emp.isActive) {
<button
                     
                      (click)="confirmDeactivate(emp)"
                        [disabled]="saving"
                        class="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50"
                    >Deactivate</button>
}

                    <button
                      (click)="requestDelete(emp)"
                        [disabled]="saving"
                        class="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                      >Delete</button>
                    
}

                    
                  </div>
                </td>
              </tr>
}
            </tbody>
          </table>
        </div>
        <div class="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
          Showing {{ filteredRows.length }} of {{ allRows.length }} records
        </div>
      </div>
}
    </div>

    <!-- ── Add / Edit Drawer ────────────────────────────────────────────── -->
    @if (drawerOpen) {
<div class="fixed inset-0 z-50 flex justify-end" (click)="closeDrawer()">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
      <div
        class="relative w-full max-w-lg bg-white h-full shadow-2xl overflow-y-auto flex flex-col"
        (click)="$event.stopPropagation()"
      >
        <!-- Drawer header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 class="text-base font-semibold text-gray-900">{{ editingId ? 'Edit Employee' : 'Add New Employee' }}</h2>
          <button (click)="closeDrawer()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Form -->
        <form (ngSubmit)="saveEmployee()" #empForm="ngForm" class="flex-1 px-6 py-5 space-y-5" novalidate>

          <!-- Branch (shown whenever branches are loaded) -->
          @if (availableBranches.length >= 1) {
<div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Branch <span class="text-red-500">*</span></label>
            <select
              [(ngModel)]="form.branchId"
              name="branchId"
              required
              [disabled]="!!editingId"
              class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">Select branch…</option>
              @for (b of availableBranches; track b) {
<option [value]="b.id">{{ b.name || b.branchName }}</option>
}
            </select>
            <!-- The control used to be editable here and did nothing: the API
                 strips tenancy fields on update, so a "moved" worker stayed put
                 and the drawer still showed the new branch. -->
            @if (editingId) {
<p class="mt-1 text-xs text-gray-500">Branch is fixed at registration and cannot be changed from this form.</p>
}
          </div>
}

          <!-- Section: Basic Info -->
          <div>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Basic Information</h3>
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Full Name <span class="text-red-500">*</span></label>
                <input
                  type="text"
                  [(ngModel)]="form.name"
                  name="name"
                  required
                  minlength="2"
                  placeholder="e.g. Ravi Kumar"
                  class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  [class.border-red-400]="empForm.submitted && !form.name"
                />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select
                    [(ngModel)]="form.gender"
                    name="gender"
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  >
                    <option value="">Select…</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    [(ngModel)]="form.dateOfBirth"
                    name="dateOfBirth"
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Father's Name</label>
                <input
                  type="text"
                  [(ngModel)]="form.fatherName"
                  name="fatherName"
                  placeholder="e.g. Suresh Kumar"
                  class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                />
              </div>
            </div>
          </div>

          <!-- Section: Contact -->
          <div>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Contact Details</h3>
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    [(ngModel)]="form.phone"
                    name="phone"
                    placeholder="+919876543210"
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    [(ngModel)]="form.email"
                    name="email"
                    placeholder="worker@example.com"
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Section: Employment -->
          <div>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Employment</h3>
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                  <input
                    type="text"
                    [(ngModel)]="form.designation"
                    name="designation"
                    placeholder="e.g. Helper"
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <input
                    type="text"
                    [(ngModel)]="form.department"
                    name="department"
                    placeholder="e.g. Production"
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Date of Joining</label>
                <input
                  type="date"
                  [(ngModel)]="form.dateOfJoining"
                  name="dateOfJoining"
                  class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Biometric Punch ID</label>
                <input
                  type="text"
                  [(ngModel)]="form.punchCode"
                  name="punchCode"
                  placeholder="e.g. 1047"
                  class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                />
                <p class="mt-1 text-xs text-gray-500">
                  The User ID the biometric machine created when this worker was enrolled.
                  Punches carry this number, and it is what posts their attendance to this
                  contractor. Must be unique across all workers and employees.
                </p>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    Skill Category <span class="text-red-500">*</span>
                  </label>
                  <select
                    [(ngModel)]="form.skillCategory"
                    name="skillCategory"
                    required
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  >
                    <option value="">Select skill…</option>
                    @for (s of skillOptions; track s) {
<option [value]="s.value">{{ s.label }}</option>
}
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Monthly Salary (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    [(ngModel)]="form.monthlySalary"
                    name="monthlySalary"
                    placeholder="e.g. 12000"
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  />
                </div>
              </div>
              <div class="flex items-center gap-6">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    [(ngModel)]="form.pfApplicable"
                    name="pfApplicable"
                    class="rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span class="text-sm text-gray-700">PF Applicable</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    [(ngModel)]="form.esiApplicable"
                    name="esiApplicable"
                    class="rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span class="text-sm text-gray-700">ESI Applicable</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Section: Identity -->
          <div>
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Identity and bank details</h3>
            <div class="mb-3">
              <label for="contract-bank-account" class="block text-sm font-medium text-gray-700 mb-1">Bank account number <span *ngIf="!editingId" class="text-red-500">*</span></label>
              <input id="contract-bank-account" type="text" inputmode="numeric" autocomplete="off" [(ngModel)]="form.bankAccount" name="bankAccount" [required]="!editingId" maxlength="40" class="w-full rounded-lg border-gray-300 text-sm" />
            </div>
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Aadhaar <span *ngIf="!editingId" class="text-red-500">*</span></label>
                  <input
                    type="text"
                    [(ngModel)]="form.aadhaar"
                    name="aadhaar"
                    [required]="!editingId"
                    maxlength="16"
                    placeholder="12-digit number"
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">PAN <span *ngIf="!editingId" class="text-red-500">*</span></label>
                  <input
                    type="text"
                    [(ngModel)]="form.pan"
                    name="pan"
                    [required]="!editingId"
                    maxlength="10"
                    placeholder="ABCDE1234F"
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm uppercase"
                  />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">UAN</label>
                  <input
                    type="text"
                    [(ngModel)]="form.uan"
                    name="uan"
                    placeholder="12-digit UAN"
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">ESIC No.</label>
                  <input
                    type="text"
                    [(ngModel)]="form.esic"
                    name="esic"
                    placeholder="ESIC number"
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Error -->
          @if (formError) {
<div class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {{ formError }}
          </div>
}

          <!-- Actions -->
          <div class="flex gap-3 pt-2 pb-4">
            <button
              type="submit"
              [disabled]="saving || !form.name.trim()"
              class="flex-1 inline-flex justify-center items-center gap-2 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              @if (saving) {
<span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
}
              {{ saving ? 'Saving…' : editingId ? 'Update Employee' : 'Add Employee' }}
            </button>
            <button
              type="button"
              (click)="closeDrawer()"
              class="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
}

    <!-- ── Bulk Upload Modal ───────────────────────────────────────── -->
    @if (bulkOpen) {
<div class="fixed inset-0 z-50 flex items-center justify-center px-4" (click)="closeBulk()">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" (click)="$event.stopPropagation()">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-semibold text-gray-900">Bulk Upload Employees</h2>
          <button (click)="closeBulk()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <p class="text-sm text-gray-600 mb-3">
          Upload an Excel/CSV file. Required columns: <strong>name</strong>, <strong>skillCategory</strong>
          (UNSKILLED / SEMI_SKILLED / SKILLED / HIGHLY_SKILLED).
          Required identity fields: aadhaar, pan, bankAccount. Store these cells as text to preserve digits and leading zeros.
          Optional: gender, dateOfBirth, fatherName, phone, email, designation, department,
          dateOfJoining, monthlySalary, dailyWage, uan, esic, pfApplicable, esiApplicable, branchId, stateCode.
        </p>

        <div class="flex flex-wrap gap-3 items-center mb-4">
          <button type="button" (click)="downloadTemplate()" class="text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200">
            ⬇ Download Template
          </button>
          <label class="text-xs text-gray-600">
            Default Branch:
            <select [(ngModel)]="bulkBranchId" (ngModelChange)="revalidateBulkBranch()" [disabled]="bulkUploading" class="ml-2 text-xs border border-gray-200 rounded px-2 py-1">
              <option value="">(use row branchId)</option>
              @for (b of availableBranches; track b) {
<option [value]="b.id">{{ b.name || b.branchName }}</option>
}
            </select>
          </label>
          <input #bulkFile type="file" accept=".xlsx,.xls,.csv" (change)="onBulkFile($event)" class="text-xs" />
        </div>

        @if (bulkPreview.length > 0) {
<div class="border border-gray-100 rounded-lg overflow-hidden mb-4">
          <div class="px-4 py-2 bg-gray-50 text-xs font-medium text-gray-600 flex justify-between">
            <span>Preview — {{ bulkPreview.length }} row(s)</span>
            <span [class]="bulkErrorCount > 0 ? 'text-red-600' : 'text-green-600'">
              {{ bulkErrorCount }} error(s)
            </span>
          </div>
          <div class="max-h-64 overflow-y-auto">
            <table class="min-w-full text-xs">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="px-2 py-1.5 text-left">#</th>
                  <th class="px-2 py-1.5 text-left">Name</th>
                  <th class="px-2 py-1.5 text-left">Skill</th>
                  <th class="px-2 py-1.5 text-right">Salary</th>
                  <th class="px-2 py-1.5 text-left">Branch</th>
                  <th class="px-2 py-1.5 text-left">Issues</th>
                </tr>
              </thead>
              <tbody>
                @for (r of bulkPreview; track r) {
<tr [class.bg-red-50]="r.errors.length > 0" class="border-t border-gray-100">
                  <td class="px-2 py-1.5 text-gray-400">{{ r.index + 1 }}</td>
                  <td class="px-2 py-1.5">{{ r.dto.name || '—' }}</td>
                  <td class="px-2 py-1.5">{{ r.dto.skillCategory || '—' }}</td>
                  <td class="px-2 py-1.5 text-right tabular-nums">{{ r.dto.monthlySalary ?? '—' }}</td>
                  <td class="px-2 py-1.5">{{ branchName(r.dto.branchId || bulkBranchId) || '(default)' }}</td>
                  <td class="px-2 py-1.5 text-red-600">{{ r.errors.join('; ') || '—' }}</td>
                </tr>
}
              </tbody>
            </table>
          </div>
        </div>
}

        @if (bulkResult) {
<div class="text-sm rounded-lg p-3 mb-4"
             [class.bg-green-50]="bulkResult.failed === 0"
             [class.bg-amber-50]="bulkResult.failed > 0">
          <strong>Created:</strong> {{ bulkResult.created }} ·
          <strong>Failed:</strong> {{ bulkResult.failed }}
          @if (bulkResult.failed > 0) {
<ul class="mt-2 list-disc pl-5 text-xs text-red-700">
            @for (r of bulkResult.results; track r) {
<li>
              @if (!r.ok) {
<span>Row {{ r.index + 1 }}: {{ r.error }}</span>
}
            </li>
}
          </ul>
}
        </div>
}

        <div class="flex gap-3">
          <button
            type="button"
            (click)="submitBulk()"
            [disabled]="bulkPreview.length === 0 || bulkUploading || bulkValidCount === 0"
            class="flex-1 inline-flex justify-center items-center gap-2 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg"
          >
            @if (bulkUploading) {
<span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
}
            {{ bulkUploading ? 'Uploading…' : 'Upload ' + bulkValidCount + ' valid row(s)' }}
          </button>
          <button type="button" (click)="closeBulk()" class="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
            Close
          </button>
        </div>
      </div>
    </div>
}

    <!-- ── Deactivate Confirm Modal ──────────────────────────────────────── -->
    @if (deactivateTarget) {
<div class="fixed inset-0 z-50 flex items-center justify-center px-4" (click)="deactivateTarget = null">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" (click)="$event.stopPropagation()">
        <h2 class="text-base font-semibold text-gray-900 mb-2">Deactivate Employee</h2>
        <p class="text-sm text-gray-600 mb-4">
          Mark <strong>{{ deactivateTarget.name }}</strong> as inactive. Enter reason if applicable.
        </p>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">Exit Reason (optional)</label>
          <input
            type="text"
            [(ngModel)]="exitReason"
            placeholder="e.g. Contract ended"
            class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
          />
        </div>
        <div class="flex gap-3">
          <button
            (click)="doDeactivate()"
            [disabled]="saving"
            class="flex-1 inline-flex justify-center items-center gap-2 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            @if (saving) {
<span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
}
            {{ saving ? 'Deactivating…' : 'Confirm Deactivate' }}
          </button>
          <button
            type="button"
            (click)="deactivateTarget = null"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >Cancel</button>
        </div>
      </div>
    </div>
}
  `,
})
export class ContractorEmployeesPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  allRows: ContractorEmployee[] = [];
  filteredRows: ContractorEmployee[] = [];

  loading = false;
  saving = false;
  downloading = false;
  errorMsg: string | null = null;
  formError: string | null = null;

  searchTerm = '';
  statusFilter: 'active' | 'inactive' | 'all' = 'active';
  selectedBranchId = '';
  availableBranches: ContractorBranchItem[] = [];

  drawerOpen = false;
  editingId: string | null = null;
  form: EmployeeForm = emptyForm();

  deactivateTarget: ContractorEmployee | null = null;
  exitReason = '';

  // ── Bulk upload state ─────────────────────────────────
  readonly skillOptions = SKILL_CATEGORIES;
  bulkOpen = false;
  bulkBranchId = '';
  bulkPreview: BulkPreviewRow[] = [];
  bulkUploading = false;
  bulkResult: { created: number; failed: number; results: any[] } | null = null;

  get bulkErrorCount(): number {
    return this.bulkPreview.filter((r) => r.errors.length > 0).length;
  }
  get bulkValidCount(): number {
    return this.bulkPreview.filter((r) => r.errors.length === 0).length;
  }

  get totalActive(): number {
    return this.allRows.filter((e) => e.isActive).length;
  }
  get maleCount(): number {
    return this.allRows.filter(
      (e) => e.isActive && e.gender && ['m', 'male'].includes(e.gender.toLowerCase()),
    ).length;
  }
  get femaleCount(): number {
    return this.allRows.filter(
      (e) => e.isActive && e.gender && ['f', 'female'].includes(e.gender.toLowerCase()),
    ).length;
  }
  get inactiveCount(): number {
    return this.allRows.filter((e) => !e.isActive).length;
  }

  constructor(
    private api: ContractorEmployeesApiService,
    private profileApi: ContractorProfileApiService,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadBranches();
  }

  loadBranches(): void {
    this.profileApi.getContractorBranches().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.availableBranches = res.branches || [];
        // Auto-select if only one branch
        if (this.availableBranches.length === 1) {
          this.selectedBranchId = this.availableBranches[0].id;
        }
        this.load();
        this.cdr.markForCheck();
      },
      error: () => {
        this.load();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onBranchChange(): void {
    this.load();
  }

  branchName(branchId: string | null): string {
    if (!branchId) return '';
    const b = this.availableBranches.find((x) => x.id === branchId);
    return b ? (b.name || b.branchName || '') : '';
  }

  load(): void {
    this.loading = true;
    this.errorMsg = null;
    this.api
      .list({ branchId: this.selectedBranchId || undefined })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.allRows = res.data || [];
          this.applyFilters();
        },
        error: (err: any) => {
          this.errorMsg = describeApiError(err, 'Failed to load employees.');
        },
      });
  }

  applyFilters(): void {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredRows = this.allRows.filter((e) => {
      if (this.statusFilter === 'active' && !e.isActive) return false;
      if (this.statusFilter === 'inactive' && e.isActive) return false;
      if (term && ![e.name, e.employeeCode].some(value => value?.toLowerCase().includes(term))) return false;
      return true;
    });
    this.cdr.markForCheck();
  }

  showWorkers(status: 'active' | 'inactive' | 'all'): void {
    this.statusFilter = status;
    this.searchTerm = '';
    this.applyFilters();
  }

  async downloadWorkers(): Promise<void> {
    if (this.loading || this.downloading || this.errorMsg || !this.filteredRows.length) return;
    this.downloading = true;
    try {
      const rows = this.filteredRows.map((emp) => ({
        'Worker Name': emp.name,
        'Contract Employee ID': emp.employeeCode || '',
        'Punch Code': emp.punchCode || '',
        Branch: this.branchName(emp.branchId),
        Gender: emp.gender || '',
        Phone: emp.phone || '',
        Designation: emp.designation || '',
        Skill: emp.skillCategory ? this.skillLabel(emp.skillCategory) : '',
        'Monthly Salary': emp.monthlySalary ?? '',
        Department: emp.department || '',
        'Date of Joining': emp.dateOfJoining || '',
        'PF Applicable': emp.pfApplicable ? 'Yes' : 'No',
        'ESI Applicable': emp.esiApplicable ? 'Yes' : 'No',
        Status: this.statusLabel(emp),
        'Date of Exit': emp.dateOfExit || '',
        'Exit Reason': emp.exitReason || '',
      }));
      // XLSX stores strings as text cells, preserving codes and avoiding CSV formula interpretation.
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet['!autofilter'] = { ref: sheet['!ref']! };
      sheet['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 22 }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Workers');
      const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      await downloadBlob(
        new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `contractor-workers-${this.statusFilter}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch {
      this.toast.error('Download failed', 'Could not download the worker list. Please retry.');
    } finally {
      this.downloading = false;
      this.cdr.markForCheck();
    }
  }

  openAdd(): void {
    this.editingId = null;
    this.form = emptyForm();
    // Pre-select branch from the current filter or the only available branch
    this.form.branchId = this.selectedBranchId || (this.availableBranches.length === 1 ? this.availableBranches[0].id : '');
    this.formError = null;
    this.drawerOpen = true;
    this.cdr.markForCheck();
  }

  openEdit(emp: ContractorEmployee): void {
    this.editingId = emp.id;
    this.form = {
      name: emp.name || '',
      branchId: emp.branchId || '',
      gender: emp.gender || '',
      dateOfBirth: emp.dateOfBirth || '',
      fatherName: emp.fatherName || '',
      phone: emp.phone || '',
      email: emp.email || '',
      designation: emp.designation || '',
      department: emp.department || '',
      dateOfJoining: emp.dateOfJoining || '',
      punchCode: emp.punchCode || '',
      bankAccount: emp.bankAccount || '',
      aadhaar: emp.aadhaar || '',
      pan: emp.pan || '',
      uan: emp.uan || '',
      esic: emp.esic || '',
      pfApplicable: emp.pfApplicable ?? false,
      esiApplicable: emp.esiApplicable ?? false,
      skillCategory: emp.skillCategory || '',
      monthlySalary: emp.monthlySalary ?? null,
      dailyWage: emp.dailyWage ?? null,
    };
    this.formError = null;
    this.drawerOpen = true;
    this.cdr.markForCheck();
  }

  closeDrawer(): void {
    this.drawerOpen = false;
    this.editingId = null;
    this.form = emptyForm();
    this.cdr.markForCheck();
  }

  saveEmployee(): void {
    if (!this.form.name.trim()) {
      this.formError = 'Name is required.';
      return;
    }
    // Checked before `saving` latches: returning after setting it left the
    // Save button disabled with no way back but closing the drawer.
    if (!this.editingId && this.availableBranches.length >= 1 && !this.form.branchId) {
      this.formError = 'Please select a branch.';
      return;
    }
    // Identity numbers are read off a card and typed in groups — "1234 5678
    // 9012" is the natural way to enter an Aadhaar, and at 14 characters the
    // server rejected it against a 12-wide column. The spaces are formatting,
    // not data, so they come out here rather than becoming a refusal.
    const compact = (v: string | null | undefined): string | null => {
      const out = (v ?? '').replace(/\s+/g, '');
      return out ? out : null;
    };
    const bankAccount = compact(this.form.bankAccount);
    const aadhaar = compact(this.form.aadhaar);
    const pan = compact(this.form.pan)?.toUpperCase() ?? null;
    const uan = compact(this.form.uan);
    const esic = compact(this.form.esic);
    const phone = compact(this.form.phone);

    // These mirror the DTO's column widths. Without them the only feedback was
    // a 400 whose body named the field, in a form that showed the raw array.
    const tooLong =
      (!this.editingId && (!aadhaar || !pan || !bankAccount) && 'Aadhaar, PAN and bank account number are required.') ||
      (bankAccount && !/^[0-9]{1,40}$/.test(bankAccount) && 'Bank account number must contain only digits (maximum 40).') ||
      (aadhaar && !/^\d{12}$/.test(aadhaar) && 'Aadhaar must be 12 digits.') ||
      (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) && 'PAN must use the format ABCDE1234F.') ||
      (uan && uan.length > 20 && 'UAN cannot be longer than 20 characters.') ||
      (esic && esic.length > 30 && 'ESIC number cannot be longer than 30 characters.') ||
      (phone && phone.length > 15 && 'Phone cannot be longer than 15 characters.') ||
      null;
    if (tooLong) {
      this.formError = tooLong;
      return;
    }

    this.formError = null;
    this.saving = true;

    const dto: CreateEmployeeDto = {
      name: this.form.name.trim(),
      gender: this.form.gender || null,
      dateOfBirth: this.form.dateOfBirth || null,
      fatherName: this.form.fatherName || null,
      phone,
      email: this.form.email || null,
      designation: this.form.designation || null,
      department: this.form.department || null,
      dateOfJoining: this.form.dateOfJoining || null,
      punchCode: this.form.punchCode ? String(this.form.punchCode).trim() : null,
      bankAccount,
      aadhaar,
      pan,
      uan,
      esic,
      pfApplicable: this.form.pfApplicable,
      esiApplicable: this.form.esiApplicable,
      skillCategory: this.form.skillCategory || null,
      monthlySalary:
        this.form.monthlySalary == null || (this.form.monthlySalary as any) === ''
          ? null
          : Number(this.form.monthlySalary),
      dailyWage:
        this.form.dailyWage == null || (this.form.dailyWage as any) === ''
          ? null
          : Number(this.form.dailyWage),
    };

    // Create only. The update DTO does not declare branchId, because the
    // service strips tenancy fields before they reach the row — sending it on
    // an edit would be a 400 for a change the API was never going to make.
    if (!this.editingId) {
      dto.branchId = this.form.branchId || undefined;
    }

    const req$ = this.editingId
      ? this.api.update(this.editingId, dto)
      : this.api.create(dto);

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
          if (this.editingId) {
            const idx = this.allRows.findIndex((e) => e.id === this.editingId);
            if (idx >= 0) this.allRows = this.allRows.map((e, i) => (i === idx ? saved : e));
            this.toast.success('Updated', `${saved.name} updated successfully.`);
          } else {
            this.allRows = [saved, ...this.allRows];
            this.toast.success('Added', `${saved.name} added to roster.`);
          }
          this.applyFilters();
          this.closeDrawer();
        },
        error: (err: any) => {
          // The pipe answers 400 with an ARRAY of per-field complaints, so the
          // raw value rendered as a comma-mashed wall and the refusal read as
          // "something went wrong" — which is how a payload mismatch stayed
          // invisible here. describeApiError names the fields instead.
          this.formError = describeApiError(err, 'Could not save employee.');
        },
      });
  }

  confirmDeactivate(emp: ContractorEmployee): void {
    this.deactivateTarget = emp;
    this.exitReason = '';
    this.cdr.markForCheck();
  }

  doDeactivate(): void {
    if (!this.deactivateTarget) return;
    this.saving = true;
    const empId = this.deactivateTarget.id;
    const empName = this.deactivateTarget.name;
    this.api
      .deactivate(empId, this.exitReason || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.deactivateTarget = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (updated) => {
          this.allRows = this.allRows.map((e) => (e.id === empId ? updated : e));
          this.applyFilters();
          this.toast.success('Deactivated', `${empName} has been marked inactive.`);
        },
        error: (err: any) => {
          this.toast.error('Error', describeApiError(err, 'Could not deactivate employee.'));
        },
      });
  }

  genderClass(gender: string): string {
    const g = (gender || '').toLowerCase();
    if (g === 'm' || g === 'male') return 'bg-brand-50 text-brand-700';
    if (g === 'f' || g === 'female') return 'bg-rose-50 text-rose-700';
    return 'bg-gray-50 text-gray-500';
  }

  skillLabel(value: string | null): string {
    return skillCategoryLabel(value);
  }

  statusLabel(emp: ContractorEmployee): string {
    if (emp.status === 'PENDING_DELETE') return 'Delete pending';
    if (emp.isActive) return 'Active';
    if (emp.status === 'LEFT') return 'Left';
    if (emp.status === 'INACTIVE') return 'Inactive';
    return 'Inactive';
  }

  statusBadgeClass(emp: ContractorEmployee): string {
    if (emp.status === 'PENDING_DELETE') return 'bg-red-50 text-red-700 border-red-200';
    if (emp.isActive) return 'bg-green-50 text-green-700 border-green-200';
    if (emp.status === 'LEFT') return 'bg-amber-50 text-amber-800 border-amber-200';
    return 'bg-gray-100 text-gray-500 border-gray-200';
  }

  doReactivate(emp: ContractorEmployee): void {
    if (this.saving) return;
    this.saving = true;
    const empId = emp.id;
    const empName = emp.name;
    this.api
      .reactivate(empId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (updated) => {
          this.allRows = this.allRows.map((e) => (e.id === empId ? updated : e));
          this.applyFilters();
          this.toast.success('Reactivated', `${empName} marked active again.`);
        },
        error: (err: any) => {
          this.toast.error('Error', describeApiError(err, 'Could not reactivate employee.'));
        },
      });
  }

  // ────────────────────────── Bulk Upload ──────────────────────────
  async requestDelete(emp: ContractorEmployee): Promise<void> {
    if (this.saving || emp.status === 'PENDING_DELETE') return;
    const result = await this.dialog.prompt(
      'Request Worker Deletion',
      `Send ${emp.name} deletion request to BranchDesk for approval?`,
      {
        defaultValue: 'Worker no longer engaged',
        placeholder: 'Reason',
        confirmText: 'Send Request',
      },
    );
    const reason = result.value?.trim();
    if (!result.confirmed || !reason) return;

    this.saving = true;
    this.api
      .requestDelete(emp.id, reason)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.allRows = this.allRows.map((row) =>
            row.id === emp.id ? { ...row, status: 'PENDING_DELETE' } : row,
          );
          this.applyFilters();
          this.toast.success(
            'Delete request sent',
            'BranchDesk approval is required before deletion.',
          );
        },
        error: (err: any) => {
          if (err?.status === 409) {
            this.allRows = this.allRows.map((row) =>
              row.id === emp.id ? { ...row, status: 'PENDING_DELETE' } : row,
            );
            this.applyFilters();
            this.load();
            this.toast.warning(
              'Delete request already pending',
              'BranchDesk approval is required before deletion.',
            );
            return;
          }
          this.toast.error('Error', describeApiError(err, 'Could not send delete request.'));
        },
      });
  }

  openBulkUpload(): void {
    this.bulkOpen = true;
    this.bulkPreview = [];
    this.bulkResult = null;
    this.bulkBranchId =
      this.selectedBranchId ||
      (this.availableBranches.length === 1
        ? this.availableBranches[0].id
        : '');
    this.cdr.markForCheck();
  }

  closeBulk(): void {
    this.bulkOpen = false;
    this.bulkPreview = [];
    this.bulkResult = null;
    this.bulkUploading = false;
    this.cdr.markForCheck();
  }

  downloadTemplate(): void {
    const headers = [
      'name',
      'skillCategory',
      'monthlySalary',
      'gender',
      'dateOfBirth',
      'fatherName',
      'phone',
      'email',
      'designation',
      'department',
      'dateOfJoining',
      'dailyWage',
      'bankAccount',
      'aadhaar',
      'pan',
      'uan',
      'esic',
      'pfApplicable',
      'esiApplicable',
      'stateCode',
      'branchId',
    ];
    const sample = {
      name: 'Ravi Kumar',
      skillCategory: 'SKILLED',
      monthlySalary: 15000,
      gender: 'M',
      dateOfBirth: '1990-05-12',
      fatherName: 'Suresh Kumar',
      phone: '+919876543210',
      email: 'ravi@example.com',
      designation: 'Helper',
      department: 'Production',
      dateOfJoining: '2025-01-15',
      dailyWage: 600,
      bankAccount: '',
      aadhaar: '',
      pan: '',
      uan: '',
      esic: '',
      pfApplicable: true,
      esiApplicable: true,
      stateCode: 'KA',
      branchId: this.bulkBranchId || this.selectedBranchId || '',
    };
    const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'contractor-employees-template.xlsx');
  }

  onBulkFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        // Preserve CSV tokens as text; binary Excel cells retain their original types.
        const wb = XLSX.read(data, { type: 'array', raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
          defval: null,
          raw: true,
        });
        this.bulkPreview = this.validateBulkRows(rows);
        this.bulkResult = null;
        this.cdr.markForCheck();
      } catch (err: any) {
        this.toast.error('Parse error', err?.message || 'Could not read file.');
      }
    };
    reader.readAsArrayBuffer(file);
    // Allow re-selecting the same file later
    input.value = '';
  }

  revalidateBulkBranch(): void {
    this.bulkPreview = this.validateBulkRows(this.bulkPreview.map(row => row.raw));
    this.bulkResult = null;
  }

  private validateBulkRows(rows: Record<string, any>[]): BulkPreviewRow[] {
    const allowedSkills = SKILL_CATEGORIES.map((s) => s.value);
    return rows.map((raw, index) => {
      const errors: string[] = [];
      const name = String(raw['name'] ?? '').trim();
      if (!name) errors.push('Name required');

      const skillRaw = String(raw['skillCategory'] ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
      const skill = allowedSkills.includes(skillRaw as any)
        ? (skillRaw as SkillCategory)
        : null;
      if (!skill) errors.push('skillCategory invalid');

      const salaryNum = raw['monthlySalary'] == null || raw['monthlySalary'] === ''
        ? null
        : Number(raw['monthlySalary']);
      if (salaryNum != null && (!Number.isFinite(salaryNum) || salaryNum < 0)) {
        errors.push('monthlySalary invalid');
      }
      const dailyWageNum = raw['dailyWage'] == null || raw['dailyWage'] === ''
        ? null
        : Number(raw['dailyWage']);
      if (dailyWageNum != null && (!Number.isFinite(dailyWageNum) || dailyWageNum < 0)) {
        errors.push('dailyWage invalid');
      }

      // The server validates each row now, so anything it rejects has to show
      // in this preview too — otherwise a row reads as fine here and comes back
      // failed with no way to see why before uploading.
      const email = raw['email'] ? String(raw['email']).trim() : null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('email invalid');
      }
      if (raw['gender'] && String(raw['gender']).length > 10) {
        errors.push('gender too long');
      }

      const dto: CreateEmployeeDto = {
        name,
        skillCategory: skill,
        monthlySalary: salaryNum,
        dailyWage: dailyWageNum,
        gender: raw['gender'] ? String(raw['gender']) : null,
        dateOfBirth: raw['dateOfBirth'] ? String(raw['dateOfBirth']) : null,
        fatherName: raw['fatherName'] ? String(raw['fatherName']) : null,
        phone: raw['phone'] ? String(raw['phone']) : null,
        email,
        designation: raw['designation'] ? String(raw['designation']) : null,
        department: raw['department'] ? String(raw['department']) : null,
        dateOfJoining: raw['dateOfJoining'] ? String(raw['dateOfJoining']) : null,
        bankAccount: raw['bankAccount'] == null ? null : String(raw['bankAccount']).replace(/\s+/g, ''),
        aadhaar: raw['aadhaar'] == null ? null : String(raw['aadhaar']).replace(/\s+/g, ''),
        pan: raw['pan'] ? String(raw['pan']).replace(/\s+/g, '').toUpperCase() : null,
        uan: raw['uan'] ? String(raw['uan']) : null,
        esic: raw['esic'] ? String(raw['esic']) : null,
        pfApplicable: this.toBool(raw['pfApplicable']),
        esiApplicable: this.toBool(raw['esiApplicable']),
        stateCode: raw['stateCode'] ? String(raw['stateCode']).toUpperCase() : null,
        branchId: raw['branchId'] ? String(raw['branchId']) : undefined,
      };
      const rowBranch = String(raw['branchId'] ?? '').trim();
      dto.branchId = rowBranch || this.bulkBranchId || undefined;
      if (!dto.branchId) errors.push('Choose a branch or supply branchId in the row');
      else if (!this.availableBranches.some(b => b.id === dto.branchId)) errors.push('Branch is not assigned to you');
      if (this.bulkBranchId && rowBranch && rowBranch !== this.bulkBranchId)
        errors.push('Row branch differs from the selected upload branch');
      if (!dto.aadhaar || !/^\d{12}$/.test(dto.aadhaar)) errors.push('Aadhaar is required and must contain 12 digits');
      if (!dto.pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(dto.pan)) errors.push('PAN is required (ABCDE1234F)');
      if (!dto.bankAccount || !/^[0-9]{1,40}$/.test(dto.bankAccount)) errors.push('Bank account number is required (digits only, maximum 40)');
      if (typeof raw['bankAccount'] === 'number') errors.push('Store bankAccount as text in Excel to preserve all digits and leading zeros');
      return { index, raw, dto, errors };
    });
  }

  private toBool(v: any): boolean {
    if (v === true || v === 1) return true;
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === 'y' || s === '1';
  }

  submitBulk(): void {
    if (this.bulkUploading) return;
    this.revalidateBulkBranch();
    const valid = this.bulkPreview
      .filter((r) => r.errors.length === 0)
      .map((r) => r.dto);
    if (valid.length === 0) {
      this.toast.error('Nothing to upload', 'All rows have validation errors.');
      return;
    }
    this.bulkUploading = true;
    this.api
      .bulkUpload(valid, this.bulkBranchId || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.bulkUploading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.bulkResult = res;
          if (res.created > 0) {
            this.toast.success(
              'Uploaded',
              `${res.created} employee(s) added` +
                (res.failed > 0 ? `, ${res.failed} failed.` : '.'),
            );
            this.load();
          }
          if (res.failed > 0 && res.created === 0) {
            this.toast.error('Upload failed', `${res.failed} row(s) rejected by server.`);
          }
        },
        error: (err: any) => {
          this.toast.error(
            'Upload error',
            describeApiError(err, 'Server error.'),
          );
        },
      });
  }
}

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
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import {
  SKILL_CATEGORIES,
  skillCategoryLabel,
} from '../shared/skill-category';
import * as XLSX from 'xlsx';

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
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p class="text-xs text-gray-500 font-medium mb-1">Total Workers</p>
          <p class="text-2xl font-bold text-gray-900">{{ totalActive }}</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p class="text-xs text-gray-500 font-medium mb-1">Male</p>
          <p class="text-2xl font-bold text-blue-600">{{ maleCount }}</p>
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
      <div class="flex flex-wrap gap-3 items-center justify-between">
        <div class="flex gap-2 flex-wrap items-center">
          <!-- Branch filter -->
          <select
            *ngIf="availableBranches.length > 1"
            [(ngModel)]="selectedBranchId"
            (change)="onBranchChange()"
            class="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
          >
            <option value="">All Branches</option>
            <option *ngFor="let b of availableBranches" [value]="b.id">{{ b.name || b.branchName }}</option>
          </select>
          <!-- Search -->
          <div class="relative">
            <svg class="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
            </svg>
            <input
              type="text"
              [(ngModel)]="searchTerm"
              (input)="applyFilters()"
              placeholder="Search by name…"
              class="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:border-rose-400 w-52"
            />
          </div>
          <!-- Status filter -->
          <select
            [(ngModel)]="statusFilter"
            (change)="applyFilters()"
            class="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
        <div class="flex gap-2 items-center">
          <button
            (click)="openBulkUpload()"
            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12"/>
            </svg>
            Bulk Upload
          </button>
          <button
            (click)="openAdd()"
            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Add Employee
          </button>
        </div>
      </div>

      <!-- Loading -->
      <ui-loading-spinner *ngIf="loading" text="Loading employees…"></ui-loading-spinner>

      <!-- Error -->
      <div *ngIf="!loading && errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        {{ errorMsg }}
      </div>

      <!-- Empty -->
      <ui-empty-state
        *ngIf="!loading && !errorMsg && filteredRows.length === 0"
        title="No employees found"
        description="Add contractor workers to build your workforce roster."
      ></ui-empty-state>

      <!-- Table -->
      <div *ngIf="!loading && filteredRows.length > 0" class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-100">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th *ngIf="availableBranches.length >= 1" class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Branch</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Gender</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Designation</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Skill</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Monthly Salary</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Dept</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">PF</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">ESI</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr *ngFor="let emp of filteredRows" class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3">
                  <div class="font-medium text-sm text-gray-900">{{ emp.name }}</div>
                  <div *ngIf="emp.phone" class="text-xs text-gray-400 mt-0.5">{{ emp.phone }}</div>
                </td>
                <td *ngIf="availableBranches.length >= 1" class="px-4 py-3 text-sm text-gray-500">{{ branchName(emp.branchId) || '—' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600">
                  <span *ngIf="emp.gender" [class]="genderClass(emp.gender)" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium">
                    {{ emp.gender | uppercase }}
                  </span>
                  <span *ngIf="!emp.gender" class="text-gray-300 text-xs">—</span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ emp.designation || '—' }}</td>
                <td class="px-4 py-3 text-sm">
                  <span *ngIf="emp.skillCategory" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                    {{ skillLabel(emp.skillCategory) }}
                  </span>
                  <span *ngIf="!emp.skillCategory" class="text-gray-300 text-xs">—</span>
                </td>
                <td class="px-4 py-3 text-sm text-right tabular-nums text-gray-700">
                  <span *ngIf="emp.monthlySalary !== null && emp.monthlySalary !== undefined">₹ {{ emp.monthlySalary | number:'1.0-0' }}</span>
                  <span *ngIf="emp.monthlySalary === null || emp.monthlySalary === undefined" class="text-gray-300">—</span>
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
                  <div *ngIf="!emp.isActive && emp.dateOfExit" class="text-[10px] text-gray-400 mt-0.5">
                    Exited {{ emp.dateOfExit | date:'dd MMM yy' }}
                  </div>
                  <div *ngIf="!emp.isActive && emp.exitReason" class="text-[10px] text-gray-400 italic" [title]="emp.exitReason">
                    {{ emp.exitReason | slice:0:24 }}{{ (emp.exitReason.length > 24) ? '…' : '' }}
                  </div>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      (click)="openEdit(emp)"
                      class="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                    >Edit</button>
                    <button
                      *ngIf="emp.isActive"
                      (click)="confirmDeactivate(emp)"
                      class="text-xs font-medium text-red-500 hover:text-red-700 hover:underline"
                    >Deactivate</button>
                    <button
                      *ngIf="!emp.isActive"
                      (click)="doReactivate(emp)"
                      [disabled]="saving"
                      class="text-xs font-medium text-emerald-600 hover:text-emerald-800 hover:underline disabled:opacity-50"
                    >Reactivate</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
          Showing {{ filteredRows.length }} of {{ allRows.length }} records
        </div>
      </div>
    </div>

    <!-- ── Add / Edit Drawer ────────────────────────────────────────────── -->
    <div *ngIf="drawerOpen" class="fixed inset-0 z-50 flex justify-end" (click)="closeDrawer()">
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
          <div *ngIf="availableBranches.length >= 1">
            <label class="block text-sm font-medium text-gray-700 mb-1">Branch <span class="text-red-500">*</span></label>
            <select
              [(ngModel)]="form.branchId"
              name="branchId"
              required
              class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
            >
              <option value="">Select branch…</option>
              <option *ngFor="let b of availableBranches" [value]="b.id">{{ b.name || b.branchName }}</option>
            </select>
          </div>

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
                    <option *ngFor="let s of skillOptions" [value]="s.value">{{ s.label }}</option>
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
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Statutory Identity</h3>
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Aadhaar</label>
                  <input
                    type="text"
                    [(ngModel)]="form.aadhaar"
                    name="aadhaar"
                    maxlength="12"
                    placeholder="12-digit number"
                    class="w-full rounded-lg border-gray-300 focus:ring-rose-500 focus:border-rose-500 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">PAN</label>
                  <input
                    type="text"
                    [(ngModel)]="form.pan"
                    name="pan"
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
          <div *ngIf="formError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {{ formError }}
          </div>

          <!-- Actions -->
          <div class="flex gap-3 pt-2 pb-4">
            <button
              type="submit"
              [disabled]="saving || !form.name.trim()"
              class="flex-1 inline-flex justify-center items-center gap-2 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <span *ngIf="saving" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
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

    <!-- ── Bulk Upload Modal ───────────────────────────────────────── -->
    <div *ngIf="bulkOpen" class="fixed inset-0 z-50 flex items-center justify-center px-4" (click)="closeBulk()">
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
          Optional: gender, dateOfBirth, fatherName, phone, email, designation, department,
          dateOfJoining, monthlySalary, dailyWage, aadhaar, pan, uan, esic, pfApplicable, esiApplicable, branchId, stateCode.
        </p>

        <div class="flex flex-wrap gap-3 items-center mb-4">
          <button type="button" (click)="downloadTemplate()" class="text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200">
            ⬇ Download Template
          </button>
          <label class="text-xs text-gray-600">
            Default Branch:
            <select [(ngModel)]="bulkBranchId" class="ml-2 text-xs border border-gray-200 rounded px-2 py-1">
              <option value="">(use row branchId)</option>
              <option *ngFor="let b of availableBranches" [value]="b.id">{{ b.name || b.branchName }}</option>
            </select>
          </label>
          <input #bulkFile type="file" accept=".xlsx,.xls,.csv" (change)="onBulkFile($event)" class="text-xs" />
        </div>

        <div *ngIf="bulkPreview.length > 0" class="border border-gray-100 rounded-lg overflow-hidden mb-4">
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
                <tr *ngFor="let r of bulkPreview" [class.bg-red-50]="r.errors.length > 0" class="border-t border-gray-100">
                  <td class="px-2 py-1.5 text-gray-400">{{ r.index + 1 }}</td>
                  <td class="px-2 py-1.5">{{ r.dto.name || '—' }}</td>
                  <td class="px-2 py-1.5">{{ r.dto.skillCategory || '—' }}</td>
                  <td class="px-2 py-1.5 text-right tabular-nums">{{ r.dto.monthlySalary ?? '—' }}</td>
                  <td class="px-2 py-1.5">{{ branchName(r.dto.branchId || bulkBranchId) || '(default)' }}</td>
                  <td class="px-2 py-1.5 text-red-600">{{ r.errors.join('; ') || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div *ngIf="bulkResult" class="text-sm rounded-lg p-3 mb-4"
             [class.bg-green-50]="bulkResult.failed === 0"
             [class.bg-amber-50]="bulkResult.failed > 0">
          <strong>Created:</strong> {{ bulkResult.created }} ·
          <strong>Failed:</strong> {{ bulkResult.failed }}
          <ul *ngIf="bulkResult.failed > 0" class="mt-2 list-disc pl-5 text-xs text-red-700">
            <li *ngFor="let r of bulkResult.results">
              <span *ngIf="!r.ok">Row {{ r.index + 1 }}: {{ r.error }}</span>
            </li>
          </ul>
        </div>

        <div class="flex gap-3">
          <button
            type="button"
            (click)="submitBulk()"
            [disabled]="bulkPreview.length === 0 || bulkUploading || bulkValidCount === 0"
            class="flex-1 inline-flex justify-center items-center gap-2 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg"
          >
            <span *ngIf="bulkUploading" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ bulkUploading ? 'Uploading…' : 'Upload ' + bulkValidCount + ' valid row(s)' }}
          </button>
          <button type="button" (click)="closeBulk()" class="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- ── Deactivate Confirm Modal ──────────────────────────────────────── -->
    <div *ngIf="deactivateTarget" class="fixed inset-0 z-50 flex items-center justify-center px-4" (click)="deactivateTarget = null">
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
            <span *ngIf="saving" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
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
  `,
})
export class ContractorEmployeesPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  allRows: ContractorEmployee[] = [];
  filteredRows: ContractorEmployee[] = [];

  loading = false;
  saving = false;
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
          this.errorMsg = err?.error?.message || 'Failed to load employees.';
        },
      });
  }

  applyFilters(): void {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredRows = this.allRows.filter((e) => {
      if (this.statusFilter === 'active' && !e.isActive) return false;
      if (this.statusFilter === 'inactive' && e.isActive) return false;
      if (term && !e.name.toLowerCase().includes(term)) return false;
      return true;
    });
    this.cdr.markForCheck();
  }

  openAdd(): void {
    this.editingId = null;
    this.form = emptyForm();
    // Pre-select branch from the current filter or the only available branch
    this.form.branchId = this.selectedBranchId || (this.availableBranches.length >= 1 ? this.availableBranches[0].id : '');
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
    this.formError = null;
    this.saving = true;

    if (this.availableBranches.length >= 1 && !this.form.branchId) {
      this.formError = 'Please select a branch.';
      return;
    }

    const dto: CreateEmployeeDto = {
      name: this.form.name.trim(),
      branchId: this.form.branchId || undefined,
      gender: this.form.gender || null,
      dateOfBirth: this.form.dateOfBirth || null,
      fatherName: this.form.fatherName || null,
      phone: this.form.phone || null,
      email: this.form.email || null,
      designation: this.form.designation || null,
      department: this.form.department || null,
      dateOfJoining: this.form.dateOfJoining || null,
      aadhaar: this.form.aadhaar || null,
      pan: this.form.pan ? this.form.pan.toUpperCase() : null,
      uan: this.form.uan || null,
      esic: this.form.esic || null,
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
          this.formError = err?.error?.message || 'Could not save employee.';
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
          this.toast.error('Error', err?.error?.message || 'Could not deactivate employee.');
        },
      });
  }

  genderClass(gender: string): string {
    const g = (gender || '').toLowerCase();
    if (g === 'm' || g === 'male') return 'bg-blue-50 text-blue-700';
    if (g === 'f' || g === 'female') return 'bg-rose-50 text-rose-700';
    return 'bg-gray-50 text-gray-500';
  }

  skillLabel(value: string | null): string {
    return skillCategoryLabel(value);
  }

  statusLabel(emp: ContractorEmployee): string {
    if (emp.isActive) return 'Active';
    if (emp.status === 'LEFT') return 'Left';
    if (emp.status === 'INACTIVE') return 'Inactive';
    return 'Inactive';
  }

  statusBadgeClass(emp: ContractorEmployee): string {
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
          this.toast.error('Error', err?.error?.message || 'Could not reactivate employee.');
        },
      });
  }

  // ────────────────────────── Bulk Upload ──────────────────────────
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
      aadhaar: '',
      pan: '',
      uan: '',
      esic: '',
      pfApplicable: true,
      esiApplicable: true,
      stateCode: 'KA',
      branchId: '',
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
        const wb = XLSX.read(data, { type: 'array' });
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

      const dto: CreateEmployeeDto = {
        name,
        skillCategory: skill,
        monthlySalary: salaryNum,
        dailyWage: dailyWageNum,
        gender: raw['gender'] ? String(raw['gender']) : null,
        dateOfBirth: raw['dateOfBirth'] ? String(raw['dateOfBirth']) : null,
        fatherName: raw['fatherName'] ? String(raw['fatherName']) : null,
        phone: raw['phone'] ? String(raw['phone']) : null,
        email: raw['email'] ? String(raw['email']) : null,
        designation: raw['designation'] ? String(raw['designation']) : null,
        department: raw['department'] ? String(raw['department']) : null,
        dateOfJoining: raw['dateOfJoining'] ? String(raw['dateOfJoining']) : null,
        aadhaar: raw['aadhaar'] ? String(raw['aadhaar']) : null,
        pan: raw['pan'] ? String(raw['pan']).toUpperCase() : null,
        uan: raw['uan'] ? String(raw['uan']) : null,
        esic: raw['esic'] ? String(raw['esic']) : null,
        pfApplicable: this.toBool(raw['pfApplicable']),
        esiApplicable: this.toBool(raw['esiApplicable']),
        stateCode: raw['stateCode'] ? String(raw['stateCode']).toUpperCase() : null,
        branchId: raw['branchId'] ? String(raw['branchId']) : undefined,
      };
      return { index, raw, dto, errors };
    });
  }

  private toBool(v: any): boolean {
    if (v === true || v === 1) return true;
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === 'y' || s === '1';
  }

  submitBulk(): void {
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
            err?.error?.message || err?.message || 'Server error.',
          );
        },
      });
  }
}

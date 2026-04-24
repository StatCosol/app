import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { ClientEmployeesService, Employee } from '../../client/employees/client-employees.service';
import { AuthService } from '../../../core/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-branch-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Employees</h1>
          <p class="page-subtitle">Manage employee registrations for this branch</p>
        </div>
        <div class="flex items-center gap-3">
          <label for="emp-search" class="sr-only">Search employees</label>
          <input autocomplete="off" id="emp-search" name="searchQuery" type="text" [(ngModel)]="searchQuery" (ngModelChange)="onSearch()" placeholder="Search employees..." class="search-input" />
          <label for="emp-status-filter" class="sr-only">Status filter</label>
          <select id="emp-status-filter" name="statusFilter" [(ngModel)]="statusFilter" (ngModelChange)="onSearch()" class="filter-select">
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <button (click)="showImportDialog = !showImportDialog" class="btn-secondary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            Import Excel
          </button>
          <button (click)="downloadEmployees()" class="btn-secondary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Download List
          </button>
          <button [disabled]="downloadingLetters" (click)="downloadAppointmentLetters()" class="btn-secondary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            {{ downloadingLetters ? 'Generating...' : 'Appointment Letters' }}
          </button>
          <button (click)="registerEmployee()" class="btn-primary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
            Register Employee
          </button>
        </div>
      </div>

      <!-- Bulk Import Dialog -->
      <div *ngIf="showImportDialog" class="import-dialog">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-900">Bulk Import Employees from Excel</h3>
          <button (click)="showImportDialog = false" class="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <p class="text-xs text-gray-500 mb-3">Download the template, fill in employee details, then upload the file.</p>
        <div class="flex items-end gap-3 flex-wrap">
          <button (click)="downloadTemplate()" class="btn-secondary text-xs">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Download Template
          </button>
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1" for="branch-emp-file">Excel File (.xlsx, .xls, .csv)</label>
            <input id="branch-emp-file" type="file" (change)="onImportFileChange($event)" accept=".xlsx,.xls,.csv"
              class="text-xs border border-gray-300 rounded-lg p-1.5 bg-white" />
          </div>
          <button [disabled]="!importFile || importing" (click)="bulkImport()" class="btn-primary text-xs">
            {{ importing ? 'Importing...' : 'Upload & Import' }}
          </button>
        </div>
        <div *ngIf="importResult" class="mt-3 text-xs rounded-lg p-3" [class.bg-green-50]="!importHasError" [class.text-green-700]="!importHasError" [class.bg-red-50]="importHasError" [class.text-red-700]="importHasError">
          {{ importResult }}
        </div>
        <div *ngIf="importErrors.length" class="mt-2 text-xs text-red-600 max-h-32 overflow-y-auto">
          <div *ngFor="let e of importErrors" class="py-0.5">• {{ e }}</div>
        </div>
      </div>

      <!-- Summary cards -->
      <div class="summary-strip">
        <div class="summary-card">
          <span class="summary-value text-blue-600">{{ total }}</span>
          <span class="summary-label">Total Employees</span>
        </div>
        <div class="summary-card">
          <span class="summary-value text-emerald-600">{{ activeCount }}</span>
          <span class="summary-label">Active</span>
        </div>
        <div class="summary-card">
          <span class="summary-value text-gray-500">{{ total - activeCount }}</span>
          <span class="summary-label">Inactive</span>
        </div>
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="flex items-center justify-center py-20">
        <div class="spinner"></div>
      </div>

      <!-- Employee table -->
      <div *ngIf="!loading" class="table-card">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Employee Name</th>
                <th>Gender</th>
                <th>Phone</th>
                <th>Designation</th>
                <th>Date of Joining</th>
                <th>Status</th>
                <th>Approval</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let emp of employees; trackBy: trackById" class="data-row">
                <td class="text-slate-500 font-mono text-xs">{{ emp.employeeCode || '—' }}</td>
                <td class="font-medium text-slate-800">
                  <a [routerLink]="['/branch/employees', emp.id]" class="hover:text-indigo-600 cursor-pointer">
                    {{ emp.name }}
                  </a>
                </td>
                <td>
                  <span class="badge" [class.bg-blue-100]="emp.gender === 'Male'" [class.text-blue-700]="emp.gender === 'Male'"
                        [class.bg-pink-100]="emp.gender === 'Female'" [class.text-pink-700]="emp.gender === 'Female'"
                        [class.bg-gray-100]="!emp.gender" [class.text-gray-500]="!emp.gender">
                    {{ emp.gender || '—' }}
                  </span>
                </td>
                <td class="text-slate-600">{{ emp.phone || '—' }}</td>
                <td class="text-slate-600">{{ emp.designation || '—' }}</td>
                <td class="text-slate-500 text-xs">{{ emp.dateOfJoining ? (emp.dateOfJoining | date:'dd/MM/yyyy') : '—' }}</td>
                <td>
                  <span class="badge" [class.bg-emerald-100]="emp.isActive" [class.text-emerald-700]="emp.isActive"
                        [class.bg-red-100]="!emp.isActive" [class.text-red-700]="!emp.isActive">
                    {{ emp.isActive ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td>
                  <span class="badge"
                    [class.bg-amber-100]="emp.approvalStatus === 'PENDING'" [class.text-amber-800]="emp.approvalStatus === 'PENDING'"
                    [class.bg-emerald-100]="emp.approvalStatus === 'APPROVED'" [class.text-emerald-700]="emp.approvalStatus === 'APPROVED'"
                    [class.bg-red-100]="emp.approvalStatus === 'REJECTED'" [class.text-red-700]="emp.approvalStatus === 'REJECTED'">
                    {{ emp.approvalStatus || 'APPROVED' }}
                  </span>
                </td>
                <td>
                  <button (click)="editEmployee(emp.id)" class="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Edit</button>
                </td>
              </tr>
              <tr *ngIf="employees.length === 0">
                <td colspan="9" class="text-center text-slate-400 py-12">
                  <svg class="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
                  </svg>
                  No employees found. Click "Register Employee" to add one.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div *ngIf="err" class="mt-3 text-sm text-red-600">{{ err }}</div>
    </div>
  `,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
    .page-title { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
    .page-subtitle { font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
    .search-input {
      padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.8125rem; width: 220px;
      &:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
    }
    .filter-select {
      padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.8125rem; background: white; cursor: pointer;
    }
    .btn-primary {
      display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem;
      background: #4f46e5; color: white; border: none; border-radius: 0.5rem; font-size: 0.8125rem; font-weight: 600;
      cursor: pointer; transition: background 0.2s;
      &:hover { background: #4338ca; }
    }
    .btn-secondary {
      display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem;
      background: white; color: #374151; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.8125rem; font-weight: 600;
      cursor: pointer; transition: all 0.2s;
      &:hover { background: #f8fafc; border-color: #cbd5e1; }
    }
    .import-dialog {
      background: white; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 1rem 1.25rem;
      margin-bottom: 1rem; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .summary-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
    @media (max-width: 768px) { .summary-strip { grid-template-columns: repeat(2, 1fr); } }
    .summary-card { background: white; border-radius: 0.75rem; padding: 1rem; text-align: center; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .summary-value { display: block; font-size: 1.5rem; font-weight: 800; }
    .summary-label { display: block; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.25rem; }
    .table-card { background: white; border-radius: 1rem; border: 1px solid #f1f5f9; box-shadow: 0 1px 4px rgba(0,0,0,0.04); overflow: hidden; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { text-align: left; padding: 0.75rem 1rem; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; background: #f8fafc; border-bottom: 2px solid #f1f5f9; }
    .data-table td { padding: 0.75rem 1rem; font-size: 0.8125rem; border-bottom: 1px solid #f8fafc; }
    .data-row:hover { background: #f8fafc; }
    .badge { display: inline-flex; padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; }
    .spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class BranchEmployeesComponent implements OnInit, OnDestroy {
  loading = true;
  searchQuery = '';
  statusFilter = '';
  employees: Employee[] = [];
  total = 0;
  activeCount = 0;
  err = '';
  showImportDialog = false;
  importFile: File | null = null;
  importing = false;
  importResult = '';
  importHasError = false;
  importErrors: string[] = [];
  downloadingLetters = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private cdr: ChangeDetectorRef,
    private empService: ClientEmployeesService,
    private authService: AuthService,
    private router: Router,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.loadEmployees();
  }

  loadEmployees(): void {
    this.loading = true;
    this.err = '';
    const branchId = this.authService.getBranchIds()?.[0] || undefined;
    this.empService.list({
      branchId,
      isActive: this.statusFilter || undefined,
      search: this.searchQuery?.trim() || undefined,
      limit: 500,
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res) => {
        this.employees = res.data;
        this.total = res.total;
        this.activeCount = res.data.filter(e => e.isActive).length;
      },
      error: (e) => {
        this.err = e?.error?.message || 'Failed to load employees';
      },
    });
  }

  onSearch(): void {
    this.loadEmployees();
  }

  registerEmployee(): void {
    this.router.navigate(['/branch/employees/new']);
  }

  editEmployee(id: string): void {
    this.router.navigate(['/branch/employees', id, 'edit']);
  }

  trackById(_: number, emp: Employee): string { return emp.id; }

  // ── Bulk Import ───────────────────────────────────────
  onImportFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.importFile = input.files?.[0] ?? null;
  }

  downloadTemplate(): void {
    this.http.get(`${environment.apiBaseUrl}/api/v1/client/employees/bulk-import/template`, {
      responseType: 'blob',
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'employee_import_template.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => { this.importResult = 'Failed to download template'; this.importHasError = true; this.cdr.markForCheck(); },
    });
  }

  bulkImport(): void {
    if (!this.importFile) return;
    this.importing = true;
    this.importResult = '';
    this.importErrors = [];
    const fd = new FormData();
    fd.append('file', this.importFile);
    this.http.post<any>(`${environment.apiBaseUrl}/api/v1/client/employees/bulk-import`, fd).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.importing = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res) => {
        const imported = res?.imported ?? 0;
        const updated = res?.updated ?? 0;
        const skipped = res?.skipped ?? 0;
        const errors = Array.isArray(res?.errors) ? res.errors : [];
        const parts: string[] = [];
        if (imported) parts.push(`${imported} new`);
        if (updated) parts.push(`${updated} updated`);
        if (skipped) parts.push(`${skipped} skipped`);
        if (errors.length) parts.push(`${errors.length} error(s)`);
        this.importResult = parts.length ? parts.join(', ') : 'No records processed';
        this.importHasError = imported === 0 && updated === 0 && errors.length > 0;
        this.importErrors = errors.map((e: any) => typeof e === 'string' ? e : (e?.message || JSON.stringify(e)));
        this.importFile = null;
        if (res?.warnings?.length) {
          this.importErrors = [...this.importErrors, ...res.warnings];
        }
        this.loadEmployees();
      },
      error: (e) => {
        this.importResult = e?.error?.message || 'Import failed';
        this.importHasError = true;
        this.importErrors = Array.isArray(e?.error?.errors)
          ? e.error.errors.map((err: any) => typeof err === 'string' ? err : (err?.message || JSON.stringify(err)))
          : [];
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  downloadEmployees(): void {
    const params = new URLSearchParams();
    if (this.searchQuery) params.set('search', this.searchQuery);
    if (this.statusFilter) params.set('isActive', this.statusFilter);
    const branchId = this.authService.getBranchIds()?.[0];
    if (branchId) params.set('branchId', branchId);
    const qs = params.toString();
    this.http.get(`${environment.apiBaseUrl}/api/v1/client/employees/export${qs ? '?' + qs : ''}`, {
      responseType: 'blob',
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'employees.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => { this.importResult = 'Failed to download'; this.importHasError = true; this.cdr.markForCheck(); },
    });
  }

  downloadAppointmentLetters(): void {
    this.downloadingLetters = true;
    this.empService.downloadAppointmentLettersBulk('docx').pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.downloadingLetters = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Appointment_Letters.zip';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => { this.importResult = 'Failed to download appointment letters'; this.importHasError = true; this.cdr.markForCheck(); },
    });
  }
}

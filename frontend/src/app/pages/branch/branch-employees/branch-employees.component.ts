import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { ClientEmployeesService, Employee } from '../../client/employees/client-employees.service';
import { AuthService } from '../../../core/auth.service';

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
          <input type="text" [(ngModel)]="searchQuery" (ngModelChange)="onSearch()" placeholder="Search employees..." class="search-input" />
          <select [(ngModel)]="statusFilter" (ngModelChange)="onSearch()" class="filter-select">
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <button (click)="registerEmployee()" class="btn-primary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
            Register Employee
          </button>
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
                    {{ emp.firstName }} {{ emp.lastName || '' }}
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
                <td class="text-slate-500 text-xs">{{ emp.dateOfJoining || '—' }}</td>
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
  private readonly destroy$ = new Subject<void>();

  constructor(
    private cdr: ChangeDetectorRef,
    private empService: ClientEmployeesService,
    private authService: AuthService,
    private router: Router,
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { ClientEmployeesService, Employee } from './client-employees.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableColumn,
  TableCellDirective,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  StatusBadgeComponent,
  ActionButtonComponent,
  FormInputComponent,
  FormSelectComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-client-employees',
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
    FormInputComponent,
    FormSelectComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Employee Master"
        description="Register and manage employees"
        icon="users">
        <div class="flex gap-2">
          <ui-button variant="secondary" (clicked)="showImportDialog = true">Import Employees</ui-button>
          <ui-button variant="primary" (clicked)="addEmployee()">+ Register Employee</ui-button>
        </div>
      </ui-page-header>

      <!-- Bulk Import Dialog -->
      <div *ngIf="showImportDialog" class="bg-white border border-gray-200 rounded-xl p-5 mb-4 shadow-sm">
        <h3 class="text-base font-semibold text-gray-900 mb-3">Bulk Import Employees</h3>
        <p class="text-sm text-gray-600 mb-3">Upload an Excel/CSV file with employee data. Download the template first to see the required format.</p>
        <div class="flex items-end gap-3 flex-wrap">
          <ui-button variant="secondary" (clicked)="downloadTemplate()">Download Template</ui-button>
          <div class="form-field">
            <label class="form-label">File</label>
            <input type="file" (change)="onImportFileSelected($event)" accept=".xlsx,.xls,.csv"
              class="text-sm border border-gray-300 rounded-lg p-2 bg-white" />
          </div>
          <ui-button variant="primary" [disabled]="!importFile || importing" (clicked)="bulkImport()">
            {{ importing ? 'Importing...' : 'Upload & Import' }}
          </ui-button>
          <ui-button variant="secondary" (clicked)="showImportDialog = false">Cancel</ui-button>
        </div>
        <div *ngIf="importMsg" class="text-sm mt-2" [class.text-green-600]="!importError" [class.text-red-600]="importError">{{ importMsg }}</div>
      </div>

      <!-- Filters -->
      <div class="filter-bar">
        <ui-form-input
          label="Search"
          placeholder="Name or code..."
          [(ngModel)]="searchTerm"
          (ngModelChange)="onSearch()">
        </ui-form-input>
        <ui-form-select
          label="Status"
          [options]="statusOptions"
          [(ngModel)]="activeFilter"
          (ngModelChange)="load()">
        </ui-form-select>
        <ui-form-select
          label="Approval"
          [options]="approvalOptions"
          [(ngModel)]="approvalFilter"
          (ngModelChange)="load()">
        </ui-form-select>
      </div>

      <!-- Loading -->
      <ui-loading-spinner *ngIf="loading" text="Loading employees..." size="lg"></ui-loading-spinner>

      <!-- Error -->
      <div *ngIf="error && !loading"
           class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>{{ error }}</span>
        </div>
        <button (click)="load()" class="text-red-800 font-semibold hover:underline ml-4">Retry</button>
      </div>

      <!-- Empty State -->
      <ui-empty-state
        *ngIf="!loading && !error && employees.length === 0"
        title="No Employees"
        description="No employees registered yet. Click '+ Register Employee' to start.">
      </ui-empty-state>

      <!-- Total Badge -->
      <div *ngIf="!loading && !error && employees.length > 0" class="total-badge">
        {{ total }} employee{{ total !== 1 ? 's' : '' }}
      </div>

      <!-- Employee Table -->
      <ui-data-table
        *ngIf="!loading && !error && employees.length > 0"
        [columns]="columns"
        [data]="employees"
        [loading]="loading"
        emptyMessage="No employees found.">

        <ng-template uiTableCell="name" let-row>
          <button class="name-link" (click)="viewEmployee(row)">
            <div class="font-semibold text-gray-900">{{ row.firstName }} {{ row.lastName || '' }}</div>
            <div class="text-xs text-gray-500 mt-0.5 font-mono">{{ row.employeeCode }}</div>
          </button>
        </ng-template>

        <ng-template uiTableCell="designation" let-row>
          {{ row.designation || '-' }}
          <div *ngIf="row.department" class="text-xs text-gray-500">{{ row.department }}</div>
        </ng-template>

        <ng-template uiTableCell="state" let-row>
          <span class="state-badge" *ngIf="row.stateCode">{{ row.stateCode }}</span>
          <span *ngIf="!row.stateCode" class="text-gray-400">-</span>
        </ng-template>

        <ng-template uiTableCell="ids" let-row>
          <div *ngIf="row.uan" class="text-xs">UAN: {{ row.uan }}</div>
          <div *ngIf="row.esic" class="text-xs">ESIC: {{ row.esic }}</div>
          <div *ngIf="row.pan" class="text-xs">PAN: {{ row.pan }}</div>
          <div *ngIf="!row.uan && !row.esic && !row.pan" class="text-xs text-gray-400">-</div>
        </ng-template>

        <ng-template uiTableCell="status" let-row>
          <ui-status-badge [status]="row.isActive ? 'ACTIVE' : 'INACTIVE'"></ui-status-badge>
        </ng-template>

        <ng-template uiTableCell="approval" let-row>
          <span class="approval-badge" [class]="'approval-' + (row.approvalStatus || 'APPROVED').toLowerCase()">
            {{ row.approvalStatus || 'APPROVED' }}
          </span>
        </ng-template>

        <ng-template uiTableCell="actions" let-row>
          <div class="flex gap-2">
            <button class="text-xs text-blue-600 hover:underline" (click)="viewEmployee(row)">View</button>
            <button class="text-xs text-blue-600 hover:underline" (click)="editEmployee(row)">Edit</button>
            <button
              *ngIf="row.approvalStatus === 'PENDING'"
              class="text-xs text-green-600 hover:underline font-semibold"
              (click)="approveEmployee(row)">
              Approve
            </button>
            <button
              *ngIf="row.approvalStatus === 'PENDING'"
              class="text-xs text-red-600 hover:underline"
              (click)="rejectEmployee(row)">
              Reject
            </button>
            <button
              *ngIf="row.isActive && row.approvalStatus !== 'PENDING'"
              class="text-xs text-red-600 hover:underline"
              (click)="confirmDeactivate(row)">
              Deactivate
            </button>
          </div>
        </ng-template>
      </ui-data-table>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
      .filter-bar { display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1rem; flex-wrap: wrap; }
      .total-badge { font-size: 0.8rem; color: #6b7280; margin-bottom: 0.5rem; }
      .name-link {
        text-align: left;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        transition: opacity 0.2s;
      }
      .name-link:hover { opacity: 0.7; }
      .name-link .font-semibold { color: #4f46e5; }
      .state-badge {
        display: inline-block;
        padding: 0.1rem 0.5rem;
        font-size: 0.7rem;
        font-weight: 600;
        border-radius: 4px;
        background: #eef2ff;
        color: #4f46e5;
      }
      .approval-badge {
        display: inline-flex;
        padding: 0.125rem 0.5rem;
        border-radius: 999px;
        font-size: 0.6875rem;
        font-weight: 600;
      }
      .approval-pending { background: #fef3c7; color: #92400e; }
      .approval-approved { background: #d1fae5; color: #065f46; }
      .approval-rejected { background: #fee2e2; color: #991b1b; }
      @media (max-width: 640px) { .filter-bar { flex-direction: column; } }
    `,
  ],
})
export class ClientEmployeesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  employees: Employee[] = [];
  total = 0;
  loading = false;
  error = '';
  searchTerm = '';
  activeFilter = '';

  columns: TableColumn[] = [
    { key: 'name', header: 'Employee', sortable: true },
    { key: 'designation', header: 'Designation', sortable: true },
    { key: 'state', header: 'State', width: '80px', align: 'center' },
    { key: 'ids', header: 'IDs', width: '180px' },
    { key: 'status', header: 'Status', width: '100px', align: 'center' },
    { key: 'approval', header: 'Approval', width: '110px', align: 'center' },
    { key: 'actions', header: '', width: '200px', align: 'center' },
  ];

  statusOptions = [
    { label: 'All', value: '' },
    { label: 'Active', value: 'true' },
    { label: 'Inactive', value: 'false' },
  ];

  approvalOptions = [
    { label: 'All', value: '' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Approved', value: 'APPROVED' },
    { label: 'Rejected', value: 'REJECTED' },
  ];

  approvalFilter = '';

  private searchTimeout: any;

  // Bulk Import
  showImportDialog = false;
  importFile: File | null = null;
  importing = false;
  importMsg = '';
  importError = false;

  constructor(
    private svc: ClientEmployeesService,
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();
    this.svc
      .list({
        search: this.searchTerm || undefined,
        isActive: this.activeFilter || undefined,
        approvalStatus: this.approvalFilter || undefined,
      })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res) => {
          this.employees = res.data;
          this.total = res.total;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (e) => {
          this.loading = false;
          this.error = e?.error?.message || e?.message || 'Failed to load employees';
          this.cdr.detectChanges();
        },
      });
  }

  onSearch(): void {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.load(), 400);
  }

  addEmployee(): void {
    this.router.navigate(['/client/employees/new']);
  }

  viewEmployee(emp: Employee): void {
    this.router.navigate(['/client/employees', emp.id]);
  }

  editEmployee(emp: Employee): void {
    this.router.navigate(['/client/employees', emp.id, 'edit']);
  }

  async confirmDeactivate(emp: Employee): Promise<void> {
    if (!(await this.dialog.confirm('Deactivate Employee', `Deactivate ${emp.firstName} ${emp.lastName || ''}?`, { variant: 'danger', confirmText: 'Deactivate' }))) return;
    this.svc.deactivate(emp.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.load(),
      error: (e) => this.toast.error(e?.error?.message || 'Failed to deactivate'),
    });
  }

  async approveEmployee(emp: Employee): Promise<void> {
    if (!(await this.dialog.confirm('Approve Employee', `Approve registration of ${emp.firstName} ${emp.lastName || ''}?`, { confirmText: 'Approve' }))) return;
    this.svc.approve(emp.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Employee approved'); this.load(); },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to approve'),
    });
  }

  async rejectEmployee(emp: Employee): Promise<void> {
    if (!(await this.dialog.confirm('Reject Employee', `Reject registration of ${emp.firstName} ${emp.lastName || ''}? The employee will be deactivated.`, { variant: 'danger', confirmText: 'Reject' }))) return;
    this.svc.reject(emp.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Employee rejected'); this.load(); },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to reject'),
    });
  }

  // ── Bulk Import ───────────────────────────────────────
  onImportFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.importFile = target.files && target.files.length ? target.files[0] : null;
  }

  downloadTemplate(): void {
    this.http.get(`${environment.apiBaseUrl}/api/v1/client/employees/bulk-import/template`, {
      responseType: 'blob',
    }).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'employee_import_template.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Failed to download template'),
    });
  }

  bulkImport(): void {
    if (!this.importFile) return;
    this.importing = true;
    this.importMsg = '';
    const fd = new FormData();
    fd.append('file', this.importFile);
    this.http.post<any>(`${environment.apiBaseUrl}/api/v1/client/employees/bulk-import`, fd).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.importing = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.importMsg = `Imported ${res?.imported ?? 0} employees` + (res?.errors?.length ? ` (${res.errors.length} errors)` : '');
        this.importError = false;
        this.importFile = null;
        this.toast.success(this.importMsg);
        this.load();
      },
      error: (e) => {
        this.importMsg = e?.error?.message || 'Import failed';
        this.importError = true;
      },
    });
  }
}

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
          <ui-button variant="secondary" (clicked)="downloadEmployees()">Download List</ui-button>
          <ui-button variant="secondary" (clicked)="downloadAppointmentLetters()" [disabled]="downloadingLetters">{{ downloadingLetters ? 'Generating...' : 'Appointment Letters' }}</ui-button>
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
            <label class="form-label" for="ce-file">File</label>
            <input id="ce-file" type="file" (change)="onImportFileSelected($event)" accept=".xlsx,.xls,.csv"
              class="text-sm border border-gray-300 rounded-lg p-2 bg-white" />
          </div>
          <ui-button variant="primary" [disabled]="!importFile || importing" (clicked)="bulkImport()">
            {{ importing ? 'Importing...' : 'Upload & Import' }}
          </ui-button>
          <ui-button variant="secondary" (clicked)="showImportDialog = false">Cancel</ui-button>
        </div>
        <div *ngIf="importMsg" class="text-sm mt-2" [class.text-green-600]="!importError" [class.text-red-600]="importError">{{ importMsg }}</div>
        <div *ngIf="lastImportBatchId && lastImportNewCount > 0" class="flex items-center gap-3 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div class="text-sm text-amber-800 flex-1">
            Wrong upload? You can revert and delete the {{ lastImportNewCount }} newly added
            employee(s) from this import. (Updated existing employees are not reverted.)
          </div>
          <ui-button variant="danger" [disabled]="reverting" (clicked)="revertLastImport()">
            {{ reverting ? 'Reverting...' : 'Revert this Import' }}
          </ui-button>
        </div>
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
          label="Employment"
          [options]="employmentOptions"
          [(ngModel)]="employmentFilter"
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
        {{ total }} {{ currentListLabel.toLowerCase() }}{{ total !== 1 ? 's' : '' }}
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
            <div class="font-semibold text-gray-900">{{ row.name }}</div>
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
          <ui-status-badge [status]="row.dateOfExit ? 'EXITED' : (row.isActive ? 'ACTIVE' : 'INACTIVE')"></ui-status-badge>
          <div *ngIf="row.dateOfExit" class="text-[10px] text-gray-400 mt-1">
            {{ row.dateOfExit | date:'dd/MM/yyyy' }}
          </div>
        </ng-template>

        <ng-template uiTableCell="approval" let-row>
          <span class="approval-badge" [class]="'approval-' + (row.approvalStatus || 'APPROVED').toLowerCase()">
            {{ row.approvalStatus || 'APPROVED' }}
          </span>
        </ng-template>

        <ng-template uiTableCell="actions" let-row>
          <div class="employee-actions">
            <button class="employee-action text-blue-600 hover:underline" title="View employee" (click)="$event.stopPropagation(); viewEmployee(row)">View</button>
            <button class="employee-action text-blue-600 hover:underline" title="Edit employee" (click)="$event.stopPropagation(); editEmployee(row)">Edit</button>
            <button
              *ngIf="row.approvalStatus === 'PENDING'"
              class="employee-action text-green-600 hover:underline font-semibold"
              title="Approve employee"
              (click)="$event.stopPropagation(); approveEmployee(row)">
              Approve
            </button>
            <button
              *ngIf="row.approvalStatus === 'PENDING'"
              class="employee-action text-red-600 hover:underline"
              title="Reject employee"
              (click)="$event.stopPropagation(); rejectEmployee(row)">
              Reject
            </button>
            <button
              *ngIf="row.isActive && !row.dateOfExit && row.approvalStatus !== 'PENDING'"
              class="employee-action text-red-600 hover:underline"
              title="Mark employee exit"
              (click)="$event.stopPropagation(); confirmDeactivate(row)">
              Mark Exit
            </button>
          </div>
        </ng-template>
      </ui-data-table>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
      :host ::ng-deep table { table-layout: auto !important; }
      .filter-bar { display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1rem; flex-wrap: wrap; }
      .total-badge { font-size: 0.8rem; color: #6b7280; margin-bottom: 0.5rem; }
      :host ::ng-deep tbody td:last-child {
        overflow: hidden !important;
        text-overflow: clip !important;
        white-space: normal !important;
      }
      .employee-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 0.25rem 0.625rem;
        width: 100%;
        min-width: 0;
      }
      .employee-action {
        font-size: 0.75rem;
        line-height: 1rem;
        white-space: nowrap;
      }
      .name-link {
        display: block;
        width: 100%;
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
  employmentFilter = 'ACTIVE';

  columns: TableColumn[] = [
    { key: 'name', header: 'Employee', sortable: true, width: '220px' },
    { key: 'designation', header: 'Designation', sortable: true, width: '180px' },
    { key: 'state', header: 'State', width: '70px', align: 'center' },
    { key: 'ids', header: 'IDs', width: '160px' },
    { key: 'status', header: 'Status', width: '90px', align: 'center' },
    { key: 'approval', header: 'Approval', width: '110px', align: 'center' },
    { key: 'actions', header: 'Actions', width: '230px', align: 'center' },
  ];

  employmentOptions = [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Exited', value: 'EXITED' },
    { label: 'Inactive', value: 'INACTIVE' },
    { label: 'All', value: '' },
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
  lastImportBatchId: string | null = null;
  lastImportNewCount = 0;
  reverting = false;
  downloadingLetters = false;

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
        employmentStatus: this.employmentFilter || undefined,
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
    const dateResult = await this.dialog.prompt('Mark Employee Exit', `Enter exit date for ${emp.name}:`, {
      placeholder: 'YYYY-MM-DD',
      defaultValue: this.todayIsoDate(),
      confirmText: 'Next',
    });
    if (!dateResult.confirmed) return;
    const dateOfExit = (dateResult.value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfExit)) {
      this.toast.error('Exit date must be in YYYY-MM-DD format');
      return;
    }

    const result = await this.dialog.prompt('Exit Reason', `Enter reason for exiting ${emp.name}:`, {
      placeholder: 'e.g. Resignation, Termination, Contract End',
      confirmText: 'Confirm Exit',
    });
    if (!result.confirmed || !result.value?.trim()) {
      if (result.confirmed) this.toast.error('Exit reason is required');
      return;
    }
    this.svc.markExit(emp.id, { dateOfExit, exitReason: result.value.trim() }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Employee exit marked'); this.load(); },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to mark exit'),
    });
  }

  private todayIsoDate(): string {
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
  }

  async approveEmployee(emp: Employee): Promise<void> {
    const ok = await this.dialog.confirm(
      'Approve Registration',
      `Approve registration of ${emp.name}?`,
      { confirmText: 'Approve' },
    );
    if (!ok) return;
    this.svc.approve(emp.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Employee approved'); this.load(); },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to approve'),
    });
  }

  async rejectEmployee(emp: Employee): Promise<void> {
    const ok = await this.dialog.confirm(
      'Reject Registration',
      `Reject registration of ${emp.name}? The employee will be deactivated.`,
      { variant: 'danger', confirmText: 'Reject' },
    );
    if (!ok) return;
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
    this.lastImportBatchId = null;
    this.lastImportNewCount = 0;
    const fd = new FormData();
    fd.append('file', this.importFile);
    this.http.post<any>(`${environment.apiBaseUrl}/api/v1/client/employees/bulk-import`, fd).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.importing = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        const parts: string[] = [];
        if (res?.imported) parts.push(`${res.imported} new`);
        if (res?.updated) parts.push(`${res.updated} updated`);
        if (res?.skipped) parts.push(`${res.skipped} skipped`);
        if (res?.errors?.length) parts.push(`${res.errors.length} errors`);
        this.importMsg = parts.length ? parts.join(', ') : 'No records processed';
        this.importError = false;
        this.importFile = null;
        this.lastImportBatchId = res?.batchId || null;
        this.lastImportNewCount = Number(res?.imported || 0);
        this.toast.success(this.importMsg);
        if (res?.warnings?.length) {
          this.toast.warning(res.warnings.join(' | '));
        }
        this.load();
      },
      error: (e) => {
        this.importMsg = e?.error?.message || 'Import failed';
        this.importError = true;
      },
    });
  }

  revertLastImport(): void {
    if (!this.lastImportBatchId || this.reverting) return;
    const batchId = this.lastImportBatchId;
    const count = this.lastImportNewCount;
    void (async () => {
      const ok = await this.dialog.confirm(
        'Revert bulk import?',
        `This will permanently delete the ${count} employee(s) that were newly created in the last bulk upload. Existing employees that were updated will NOT be reverted. Continue?`,
        { variant: 'danger', confirmText: 'Yes, revert' },
      );
      if (!ok) return;
      this.reverting = true;
      this.cdr.detectChanges();
      this.http.delete<any>(`${environment.apiBaseUrl}/api/v1/client/employees/bulk-import/${batchId}/revert`).pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.reverting = false; this.cdr.detectChanges(); }),
      ).subscribe({
        next: (res) => {
          this.toast.success(`Reverted: ${res?.deleted ?? 0} employee(s) deleted.`);
          this.lastImportBatchId = null;
          this.lastImportNewCount = 0;
          this.importMsg = '';
          this.load();
        },
        error: (e) => {
          this.toast.error(e?.error?.message || 'Revert failed');
        },
      });
    })();
  }

  downloadEmployees(): void {
    const params = new URLSearchParams();
    if (this.searchTerm) params.set('search', this.searchTerm);
    if (this.employmentFilter) params.set('employmentStatus', this.employmentFilter);
    if (this.approvalFilter) params.set('approvalStatus', this.approvalFilter);
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
      error: () => this.toast.error('Failed to download employee list'),
    });
  }

  downloadAppointmentLetters(): void {
    this.downloadingLetters = true;
    this.svc.downloadAppointmentLettersBulk('docx').pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.downloadingLetters = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Appointment_Letters.zip';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Failed to download appointment letters'),
    });
  }

  get currentListLabel(): string {
    if (this.employmentFilter === 'EXITED') return 'Exited employee';
    if (this.employmentFilter === 'INACTIVE') return 'Inactive employee';
    if (this.employmentFilter === 'ACTIVE') return 'Active employee';
    return 'Employee';
  }
}

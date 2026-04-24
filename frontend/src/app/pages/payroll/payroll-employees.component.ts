import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  FormInputComponent,
} from '../../shared/ui';
import { ToastService } from '../../shared/toast/toast.service';
import { ClientContextStripComponent } from '../../shared/ui/client-context-strip/client-context-strip.component';
import { environment } from '../../../environments/environment';

interface PayrollEmployee {
  id: string;
  employeeCode?: string;
  name: string;
  designation?: string;
  department?: string;
  clientName?: string;
  netPay?: number;
  status?: string;
}

@Component({
  selector: 'app-payroll-employees',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    DataTableComponent,
    TableCellDirective,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    FormInputComponent,
    ClientContextStripComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Payroll Employees"
        description="Browse and manage employees for payroll processing.">
        <ui-client-context-strip [inline]="true" paramKey="clientId"></ui-client-context-strip>
      </ui-page-header>

      <!-- Search -->
      <div class="mb-6">
        <ui-form-input
          type="search"
          placeholder="Search employees by name, code or department..."
          [(ngModel)]="searchTerm"
          (ngModelChange)="onSearch($event)">
        </ui-form-input>
      </div>

      <!-- Loading -->
      <ui-loading-spinner *ngIf="loading" text="Loading employees..." size="lg"></ui-loading-spinner>

      <!-- Error -->
      <ui-empty-state
        *ngIf="error && !loading"
        title="Unable to Load Employees"
        [description]="error">
      </ui-empty-state>

      <!-- Empty -->
      <ui-empty-state
        *ngIf="!loading && !error && filteredEmployees.length === 0 && employees.length === 0"
        title="No Employees Found"
        description="No employees have been added to payroll yet.">
      </ui-empty-state>

      <!-- No search results -->
      <ui-empty-state
        *ngIf="!loading && !error && employees.length > 0 && filteredEmployees.length === 0"
        title="No Matching Employees"
        description="Try adjusting your search term.">
      </ui-empty-state>

      <!-- Table -->
      <ui-data-table
        *ngIf="!loading && !error && filteredEmployees.length > 0"
        [columns]="columns"
        [data]="filteredEmployees"
        [loading]="loading"
        [clickable]="true"
        emptyMessage="No employees found."
        (rowClick)="onRowClick($event)">

        <ng-template uiTableCell="name" let-row>
          <div class="font-semibold text-gray-900">{{ row.name }}</div>
          <div *ngIf="row.employeeCode" class="text-xs text-gray-500 mt-0.5">{{ row.employeeCode }}</div>
        </ng-template>

        <ng-template uiTableCell="netPay" let-row>
          <span *ngIf="row.netPay !== null && row.netPay !== undefined" class="font-medium tabular-nums">
            {{ row.netPay | number:'1.0-0' }}
          </span>
          <span *ngIf="row.netPay === null || row.netPay === undefined" class="text-gray-400">&mdash;</span>
        </ng-template>

        <ng-template uiTableCell="status" let-row>
          <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold"
                [ngClass]="{
                  'bg-emerald-50 text-emerald-700': row.status === 'ACTIVE',
                  'bg-gray-100 text-gray-600': row.status !== 'ACTIVE'
                }">
            {{ row.status || 'ACTIVE' }}
          </span>
        </ng-template>
      </ui-data-table>
    </div>
  `,
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
  `],
})
export class PayrollEmployeesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  employees: PayrollEmployee[] = [];
  filteredEmployees: PayrollEmployee[] = [];
  loading = false;
  error = '';
  searchTerm = '';

  columns: TableColumn[] = [
    { key: 'name', header: 'Employee', sortable: true },
    { key: 'designation', header: 'Designation' },
    { key: 'department', header: 'Department' },
    { key: 'clientName', header: 'Client' },
    { key: 'netPay', header: 'Net Pay', align: 'right' },
    { key: 'status', header: 'Status', align: 'center', width: '120px' },
  ];

  private clientId = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // clientId lives on the parent route segment (:clientId), traverse up to find it
    this.clientId =
      this.route.snapshot.paramMap.get('clientId') ||
      this.route.snapshot.parent?.paramMap.get('clientId') ||
      '';
    this.loadEmployees();
  }

  loadEmployees(): void {
    this.loading = true;
    this.error = '';

    let url = `${environment.apiBaseUrl}/api/v1/payroll/employees`;
    if (this.clientId) {
      url += `?clientId=${encodeURIComponent(this.clientId)}`;
    }

    this.http.get<any>(url).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        // Backend returns paginated { data, total, page, limit } or plain array
        const arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        this.employees = arr;
        this.applyFilter();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load employees.';
        this.employees = [];
        this.filteredEmployees = [];
        this.toast.error('Load Failed', this.error);
        this.cdr.detectChanges();
      },
    });
  }

  onSearch(value: string): void {
    this.searchTerm = value ?? '';
    this.applyFilter();
  }

  applyFilter(): void {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) {
      this.filteredEmployees = [...this.employees];
      return;
    }
    this.filteredEmployees = this.employees.filter((emp) =>
      (emp.name || '').toLowerCase().includes(term) ||
      (emp.employeeCode || '').toLowerCase().includes(term) ||
      (emp.department || '').toLowerCase().includes(term) ||
      (emp.designation || '').toLowerCase().includes(term) ||
      (emp.clientName || '').toLowerCase().includes(term)
    );
  }

  onRowClick(event: { row: PayrollEmployee; index: number }): void {
    if (event.row?.id) {
      if (this.clientId) {
        this.router.navigate(['/payroll/clients', this.clientId, 'employees', event.row.id]);
      } else {
        this.router.navigate(['/payroll/clients']);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

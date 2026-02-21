import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { ClientEmployeesService, Employee } from './client-employees.service';
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
        <ui-button variant="primary" (clicked)="addEmployee()">+ Register Employee</ui-button>
      </ui-page-header>

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

        <ng-template uiTableCell="actions" let-row>
          <div class="flex gap-2">
            <button class="text-xs text-blue-600 hover:underline" (click)="viewEmployee(row)">View</button>
            <button class="text-xs text-blue-600 hover:underline" (click)="editEmployee(row)">Edit</button>
            <button
              *ngIf="row.isActive"
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
      .page { max-width: 1200px; margin: 0 auto; padding: 1rem; }
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
      @media (max-width: 640px) { .filter-bar { flex-direction: column; } }
    `,
  ],
})
export class ClientEmployeesComponent implements OnInit {
  employees: Employee[] = [];
  total = 0;
  loading = true;
  error = '';
  searchTerm = '';
  activeFilter = '';

  columns: TableColumn[] = [
    { key: 'name', header: 'Employee', sortable: true },
    { key: 'designation', header: 'Designation', sortable: true },
    { key: 'state', header: 'State', width: '80px', align: 'center' },
    { key: 'ids', header: 'IDs', width: '180px' },
    { key: 'status', header: 'Status', width: '100px', align: 'center' },
    { key: 'actions', header: '', width: '160px', align: 'center' },
  ];

  statusOptions = [
    { label: 'All', value: '' },
    { label: 'Active', value: 'true' },
    { label: 'Inactive', value: 'false' },
  ];

  private searchTimeout: any;

  constructor(
    private svc: ClientEmployeesService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();
    this.svc
      .list({
        search: this.searchTerm || undefined,
        isActive: this.activeFilter || undefined,
      })
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res) => {
          this.employees = res.data;
          this.total = res.total;
        },
        error: (e) => {
          this.error = e?.error?.message || e?.message || 'Failed to load employees';
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

  confirmDeactivate(emp: Employee): void {
    if (!confirm(`Deactivate ${emp.firstName} ${emp.lastName || ''}?`)) return;
    this.svc.deactivate(emp.id).subscribe({
      next: () => this.load(),
      error: (e) => alert(e?.error?.message || 'Failed to deactivate'),
    });
  }
}

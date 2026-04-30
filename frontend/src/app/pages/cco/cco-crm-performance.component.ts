import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import {
  PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent,
  StatusBadgeComponent, DataTableComponent, TableCellDirective, TableColumn,
  FormSelectComponent, SelectOption, ActionButtonComponent,
} from '../../shared/ui';
import { CcoCrmsService } from '../../core/cco-crms.service';
import { ReportsService } from '../../core/reports.service';

@Component({
  selector: 'app-cco-crm-performance',
  standalone: true,
  imports: [
    CommonModule, FormsModule, PageHeaderComponent, EmptyStateComponent,
    LoadingSpinnerComponent, StatusBadgeComponent, DataTableComponent,
    TableCellDirective, FormSelectComponent, ActionButtonComponent,
  ],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="CRM Performance"
        description="Monitor CRM team performance and compliance metrics"
        icon="chart-bar">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading performance data..."></ui-loading-spinner>

      <div *ngIf="error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{{ error }}</div>

      <ng-container *ngIf="!loading">
        <!-- KPI Strip -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div class="bg-white border border-gray-200 rounded-xl p-4">
            <div class="text-xs text-gray-500 font-medium uppercase">Total CRMs</div>
            <div class="text-2xl font-bold text-gray-900 mt-1">{{ allCrms.length }}</div>
          </div>
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div class="text-xs text-blue-600 font-medium uppercase">Avg Compliance</div>
            <div class="text-2xl font-bold text-blue-700 mt-1">{{ avgCompliance }}%</div>
          </div>
          <div class="bg-red-50 border border-red-200 rounded-xl p-4">
            <div class="text-xs text-red-600 font-medium uppercase">Total Overdue</div>
            <div class="text-2xl font-bold text-red-700 mt-1">{{ totalOverdue }}</div>
          </div>
          <div class="bg-green-50 border border-green-200 rounded-xl p-4">
            <div class="text-xs text-green-600 font-medium uppercase">Active CRMs</div>
            <div class="text-2xl font-bold text-green-700 mt-1">{{ activeCrms }}</div>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="flex flex-wrap items-center gap-3 mb-6">
          <div class="relative w-56">
            <input autocomplete="off" id="ccp-search-term" name="searchTerm" type="text" [(ngModel)]="searchTerm" (ngModelChange)="applyFilter()"
              placeholder="Search CRM name..."
              class="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            <svg class="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <ui-form-select label="Status" [options]="statusOptions" [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()" class="w-44"></ui-form-select>
          <button (click)="exportCsv()" class="ml-auto inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Export
          </button>
          <span class="text-sm text-gray-500">{{ filteredCrms.length }} CRM{{ filteredCrms.length !== 1 ? 's' : '' }}</span>
        </div>

        <!-- DataTable -->
        <div class="card" *ngIf="filteredCrms.length > 0">
          <ui-data-table [columns]="columns" [data]="filteredCrms">
            <ng-template uiTableCell="name" let-row>
              <span class="font-medium text-gray-900">{{ row.name }}</span>
            </ng-template>
            <ng-template uiTableCell="complianceRate" let-row>
              <div class="flex items-center gap-2">
                <div class="flex-1 bg-gray-200 rounded-full h-2 max-w-[80px]">
                  <div class="h-2 rounded-full" [class]="getBarClass(row.complianceRate ?? 0)"
                    [style.width.%]="row.complianceRate ?? 0"></div>
                </div>
                <span class="text-sm">{{ row.complianceRate ?? 0 }}%</span>
              </div>
            </ng-template>
            <ng-template uiTableCell="overdueCount" let-row>
              <span [class.text-red-600]="row.overdueCount > 0" [class.font-semibold]="row.overdueCount > 0">
                {{ row.overdueCount ?? 0 }}
              </span>
            </ng-template>
            <ng-template uiTableCell="status" let-row>
              <ui-status-badge [status]="row.status"></ui-status-badge>
            </ng-template>
            <ng-template uiTableCell="actions" let-row>
              <ui-button variant="secondary" size="sm" (clicked)="viewCrm(row)">View</ui-button>
            </ng-template>
          </ui-data-table>
        </div>

        <ui-empty-state
          *ngIf="filteredCrms.length === 0"
          title="No performance data"
          description="CRM performance metrics will appear here."
          icon="chart-bar">
        </ui-empty-state>
      </ng-container>
    </div>
  `,
})
export class CcoCrmPerformanceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  allCrms: any[] = [];
  filteredCrms: any[] = [];
  loading = true;
  error: string | null = null;
  searchTerm = '';
  statusFilter = '';

  columns: TableColumn[] = [
    { key: 'name', header: 'CRM Name', sortable: true },
    { key: 'clientCount', header: 'Clients', sortable: true, width: '90px', align: 'center' },
    { key: 'complianceRate', header: 'Compliance %', width: '180px' },
    { key: 'overdueCount', header: 'Overdue', sortable: true, width: '90px', align: 'center' },
    { key: 'status', header: 'Status', width: '120px', align: 'center' },
    { key: 'actions', header: '', width: '80px', align: 'right' },
  ];

  readonly statusOptions: SelectOption[] = [
    { value: '', label: 'All Statuses' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
  ];

  constructor(private ccoCrmsService: CcoCrmsService, private cdr: ChangeDetectorRef, private router: Router) {}

  ngOnInit(): void {
    this.loading = true;
    this.ccoCrmsService.list().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => { this.loading = false; this.allCrms = data || []; this.applyFilter(); this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.error = 'Failed to load CRM data'; this.allCrms = []; this.filteredCrms = []; this.cdr.detectChanges(); },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  applyFilter(): void {
    let result = [...this.allCrms];
    if (this.statusFilter) {
      result = result.filter(c => c.status === this.statusFilter);
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(c => (c.name || '').toLowerCase().includes(term));
    }
    this.filteredCrms = result;
  }

  get avgCompliance(): number {
    if (this.allCrms.length === 0) return 0;
    const total = this.allCrms.reduce((sum, c) => sum + (c.complianceRate ?? 0), 0);
    return Math.round(total / this.allCrms.length);
  }

  get totalOverdue(): number {
    return this.allCrms.reduce((sum, c) => sum + (c.overdueCount ?? 0), 0);
  }

  get activeCrms(): number {
    return this.allCrms.filter(c => c.status === 'ACTIVE').length;
  }

  getBarClass(rate: number): string {
    if (rate >= 80) return 'bg-green-500';
    if (rate >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  }

  viewCrm(crm: any): void {
    this.router.navigate(['/cco/crm-performance'], { queryParams: { crmId: crm.id } });
  }

  exportCsv(): void {
    ReportsService.exportCsv(this.filteredCrms, [
      { key: 'name', label: 'Name' },
      { key: 'clientCount', label: 'Clients' },
      { key: 'complianceRate', label: 'Compliance Rate %' },
      { key: 'overdueCount', label: 'Overdue' },
      { key: 'status', label: 'Status' },
    ], 'cco-crm-performance.csv');
  }
}
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { ReportsService } from '../../core/reports.service';
import { takeUntil, finalize, timeout } from 'rxjs/operators';
import {
  PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent,
  DataTableComponent, TableCellDirective, TableColumn,
  StatusBadgeComponent, ActionButtonComponent,
  FormSelectComponent, SelectOption,
} from '../../shared/ui';
import { CeoApiService, CeoEscalation } from '../../core/api/ceo.api';

@Component({
  selector: 'app-ceo-escalations',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, PageHeaderComponent, EmptyStateComponent,
    LoadingSpinnerComponent, DataTableComponent, TableCellDirective,
    StatusBadgeComponent, ActionButtonComponent, FormSelectComponent,
  ],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Escalations Inbox"
        description="Escalated issues requiring CEO attention"
        icon="exclamation">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading escalations..."></ui-loading-spinner>

      <div *ngIf="error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-center justify-between">
        <span>{{ error }}</span>
        <button (click)="ngOnInit()" class="text-red-800 font-semibold hover:underline ml-4">Retry</button>
      </div>

      <ng-container *ngIf="!loading && !error">
        <!-- KPI Strip -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div class="bg-white border border-gray-200 rounded-xl p-4">
            <div class="text-xs text-gray-500 font-medium uppercase">Total</div>
            <div class="text-2xl font-bold text-gray-900 mt-1">{{ allItems.length }}</div>
          </div>
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div class="text-xs text-amber-600 font-medium uppercase">Open</div>
            <div class="text-2xl font-bold text-amber-700 mt-1">{{ countByStatus('OPEN') }}</div>
          </div>
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div class="text-xs text-blue-600 font-medium uppercase">In Progress</div>
            <div class="text-2xl font-bold text-blue-700 mt-1">{{ countByStatus('IN_PROGRESS') }}</div>
          </div>
          <div class="bg-green-50 border border-green-200 rounded-xl p-4">
            <div class="text-xs text-green-600 font-medium uppercase">Resolved</div>
            <div class="text-2xl font-bold text-green-700 mt-1">{{ countByStatus('RESOLVED') }}</div>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="flex flex-wrap items-center gap-3 mb-6">
          <div class="relative w-56">
            <input type="text" [(ngModel)]="searchTerm" (ngModelChange)="applyFilter()"
              placeholder="Search subject..."
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
          <span class="text-sm text-gray-500">{{ filteredItems.length }} escalation{{ filteredItems.length !== 1 ? 's' : '' }}</span>
        </div>

        <div *ngIf="filteredItems.length > 0" class="card">
          <ui-data-table [columns]="columns" [data]="filteredItems">
            <ng-template uiTableCell="status" let-row>
              <ui-status-badge [status]="row.status"></ui-status-badge>
            </ng-template>
            <ng-template uiTableCell="priority" let-row>
              <span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                [ngClass]="{
                  'bg-red-100 text-red-700': row.priority === 'HIGH' || row.priority === 'CRITICAL',
                  'bg-amber-100 text-amber-700': row.priority === 'MEDIUM',
                  'bg-gray-100 text-gray-600': row.priority === 'LOW' || !row.priority
                }">
                {{ row.priority || 'LOW' }}
              </span>
            </ng-template>
            <ng-template uiTableCell="createdAt" let-row>
              {{ row.createdAt | date:'mediumDate' }}
            </ng-template>
            <ng-template uiTableCell="actions" let-row>
              <ui-button variant="secondary" size="sm" [routerLink]="['/ceo/escalations', row.id]">
                View
              </ui-button>
            </ng-template>
          </ui-data-table>
        </div>

        <ui-empty-state
          *ngIf="filteredItems.length === 0"
          title="No escalations"
          description="Escalated issues requiring CEO attention will appear here."
          icon="exclamation-circle">
        </ui-empty-state>
      </ng-container>
    </div>
  `,
})
export class CeoEscalationsComponent implements OnInit, OnDestroy {
  allItems: CeoEscalation[] = [];
  filteredItems: CeoEscalation[] = [];
  loading = true;
  error: string | null = null;
  searchTerm = '';
  statusFilter = '';
  private destroy$ = new Subject<void>();

  columns: TableColumn[] = [
    { key: 'id', header: 'ID', width: '80px' },
    { key: 'subject', header: 'Subject', sortable: true },
    { key: 'priority', header: 'Priority', width: '100px', align: 'center' },
    { key: 'status', header: 'Status', align: 'center', width: '120px' },
    { key: 'createdAt', header: 'Created', width: '140px' },
    { key: 'actions', header: '', width: '100px', align: 'center' },
  ];

  readonly statusOptions: SelectOption[] = [
    { value: '', label: 'All Statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'RESOLVED', label: 'Resolved' },
    { value: 'CLOSED', label: 'Closed' },
  ];

  constructor(private api: CeoApiService, private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    this.loading = true;
    this.api.getEscalations().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.loading = false;
        this.allItems = res?.items || [];
        this.applyFilter();
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.error = 'Failed to load escalations'; this.cdr.detectChanges(); },
    });
  }

  applyFilter(): void {
    let result = [...this.allItems];
    if (this.statusFilter) {
      result = result.filter(e => e.status === this.statusFilter);
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(e => (e.subject || '').toLowerCase().includes(term));
    }
    this.filteredItems = result;
  }

  countByStatus(status: string): number {
    return this.allItems.filter(e => e.status === status).length;
  }

  exportCsv(): void {
    ReportsService.exportCsv(this.filteredItems, [
      { key: 'id', label: 'ID' },
      { key: 'subject', label: 'Subject' },
      { key: 'status', label: 'Status' },
      { key: 'createdAt', label: 'Created At' },
    ], 'ceo-escalations.csv');
  }
}
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';
import {
  PageHeaderComponent, EmptyStateComponent, LoadingSpinnerComponent,
  DataTableComponent, TableCellDirective, TableColumn,
  StatusBadgeComponent, ActionButtonComponent,
  FormSelectComponent, SelectOption,
} from '../../shared/ui';
import { CeoApiService, CeoApproval } from '../../core/api/ceo.api';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-ceo-approvals',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, PageHeaderComponent, EmptyStateComponent,
    LoadingSpinnerComponent, DataTableComponent, TableCellDirective,
    StatusBadgeComponent, ActionButtonComponent, FormSelectComponent,
  ],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="CEO Approvals"
        description="Review and act on pending approval requests"
        icon="check-circle">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading approvals..."></ui-loading-spinner>

      <div *ngIf="error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{{ error }}</div>

      <ng-container *ngIf="!loading">
        <!-- KPI Strip -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div class="bg-white border border-gray-200 rounded-xl p-4">
            <div class="text-xs text-gray-500 font-medium uppercase">Total</div>
            <div class="text-2xl font-bold text-gray-900 mt-1">{{ allApprovals.length }}</div>
          </div>
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div class="text-xs text-amber-600 font-medium uppercase">Pending</div>
            <div class="text-2xl font-bold text-amber-700 mt-1">{{ countByStatus('PENDING') }}</div>
          </div>
          <div class="bg-green-50 border border-green-200 rounded-xl p-4">
            <div class="text-xs text-green-600 font-medium uppercase">Approved</div>
            <div class="text-2xl font-bold text-green-700 mt-1">{{ countByStatus('APPROVED') }}</div>
          </div>
          <div class="bg-red-50 border border-red-200 rounded-xl p-4">
            <div class="text-xs text-red-600 font-medium uppercase">Rejected</div>
            <div class="text-2xl font-bold text-red-700 mt-1">{{ countByStatus('REJECTED') }}</div>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="flex flex-wrap items-center gap-3 mb-6">
          <div class="relative w-56">
            <input type="text" [(ngModel)]="searchTerm" (ngModelChange)="applyFilter()"
              placeholder="Search entity, requester..."
              class="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            <svg class="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <ui-form-select label="Status" [options]="statusOptions" [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()" class="w-44"></ui-form-select>
          <span class="ml-auto text-sm text-gray-500">{{ filteredApprovals.length }} request{{ filteredApprovals.length !== 1 ? 's' : '' }}</span>
        </div>

        <!-- DataTable -->
        <div *ngIf="filteredApprovals.length > 0" class="card">
          <ui-data-table [columns]="columns" [data]="filteredApprovals">
            <ng-template uiTableCell="entity" let-row>
              {{ row.entityLabel || (row.entityType + ' #' + row.entityId) }}
            </ng-template>
            <ng-template uiTableCell="requestedBy" let-row>
              {{ row.requestedBy?.name || row.requestedBy?.email || '—' }}
            </ng-template>
            <ng-template uiTableCell="status" let-row>
              <ui-status-badge [status]="row.status"></ui-status-badge>
            </ng-template>
            <ng-template uiTableCell="actions" let-row>
              <div class="flex gap-2 justify-end" *ngIf="row.status === 'PENDING'; else noActions">
                <ui-button variant="primary" size="sm" [disabled]="actionId === row.id" (clicked)="approve(row.id)">
                  {{ actionId === row.id ? '...' : 'Approve' }}
                </ui-button>
                <ui-button variant="secondary" size="sm" [disabled]="actionId === row.id" (clicked)="reject(row.id)">
                  Reject
                </ui-button>
              </div>
              <ng-template #noActions>
                <span class="text-gray-400">—</span>
              </ng-template>
            </ng-template>
          </ui-data-table>
        </div>

        <ui-empty-state
          *ngIf="filteredApprovals.length === 0"
          title="No pending approvals"
          description="Pending approval requests will appear here."
          icon="clipboard-check">
        </ui-empty-state>
      </ng-container>
    </div>
  `,
})
export class CeoApprovalsComponent implements OnInit, OnDestroy {
  allApprovals: CeoApproval[] = [];
  filteredApprovals: CeoApproval[] = [];
  loading = true;
  error: string | null = null;
  searchTerm = '';
  statusFilter = '';
  actionId: number | null = null;
  private destroy$ = new Subject<void>();

  columns: TableColumn[] = [
    { key: 'id', header: 'ID', width: '80px' },
    { key: 'entity', header: 'Entity', sortable: true },
    { key: 'requestedBy', header: 'Requested By', sortable: true },
    { key: 'status', header: 'Status', align: 'center', width: '120px' },
    { key: 'actions', header: '', width: '180px', align: 'right' },
  ];

  readonly statusOptions: SelectOption[] = [
    { value: '', label: 'All Statuses' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
  ];

  constructor(private api: CeoApiService, private cdr: ChangeDetectorRef, private dialog: ConfirmDialogService) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.api.getApprovals().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        this.loading = false;
        this.allApprovals = data || [];
        this.applyFilter();
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.error = 'Failed to load approvals'; this.cdr.detectChanges(); },
    });
  }

  applyFilter(): void {
    let result = [...this.allApprovals];
    if (this.statusFilter) {
      result = result.filter(a => a.status === this.statusFilter);
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(a =>
        (a.entityLabel || '').toLowerCase().includes(term) ||
        (a.entityType || '').toLowerCase().includes(term) ||
        (a.requestedBy?.name || '').toLowerCase().includes(term) ||
        (a.requestedBy?.email || '').toLowerCase().includes(term)
      );
    }
    this.filteredApprovals = result;
  }

  countByStatus(status: string): number {
    return this.allApprovals.filter(a => a.status === status).length;
  }

  approve(id: number): void {
    this.actionId = id;
    this.api.approve(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.actionId = null; this.cdr.detectChanges(); this.load(); },
      error: () => { this.actionId = null; this.error = 'Approve failed'; this.cdr.detectChanges(); },
    });
  }

  async reject(id: number): Promise<void> {
    const result = await this.dialog.prompt('Reject', 'Enter rejection remarks:', { placeholder: 'Remarks' });
    if (!result.confirmed || result.value === null) return;
    this.actionId = id;
    this.api.reject(id, result.value || '').pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.actionId = null; this.cdr.detectChanges(); this.load(); },
      error: () => { this.actionId = null; this.error = 'Reject failed'; this.cdr.detectChanges(); },
    });
  }
}

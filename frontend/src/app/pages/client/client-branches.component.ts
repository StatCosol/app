import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableCellDirective,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  StatusBadgeComponent,
} from '../../shared/ui';
import type { TableColumn } from '../../shared/ui';

interface Branch {
  id: number;
  branchName: string;
  state: string;
  city: string;
  branchType: string;
  status: string;
  [key: string]: any;
}

@Component({
  selector: 'app-client-branches',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    DataTableComponent,
    TableCellDirective,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Branches"
        description="Organization structure — view and manage your registered branches">
      </ui-page-header>

      <!-- Loading -->
      <ui-loading-spinner *ngIf="loading" text="Loading branches..." size="lg"></ui-loading-spinner>

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
        *ngIf="!loading && !error && branches.length === 0"
        title="No Branches"
        description="No branches have been registered for your organisation yet.">
      </ui-empty-state>

      <!-- Total Badge -->
      <div *ngIf="!loading && !error && branches.length > 0" class="total-badge">
        {{ branches.length }} branch{{ branches.length !== 1 ? 'es' : '' }}
      </div>

      <!-- Branches Table -->
      <ui-data-table
        *ngIf="!loading && !error && branches.length > 0"
        [columns]="columns"
        [data]="branches"
        [loading]="loading"
        [clickable]="true"
        (rowClick)="onRowClick($event)"
        emptyMessage="No branches found.">

        <ng-template uiTableCell="branchName" let-row>
          <span class="font-semibold text-gray-900">{{ row.branchName }}</span>
        </ng-template>

        <ng-template uiTableCell="state" let-row>
          {{ row.state || '-' }}
        </ng-template>

        <ng-template uiTableCell="city" let-row>
          {{ row.city || '-' }}
        </ng-template>

        <ng-template uiTableCell="branchType" let-row>
          {{ row.branchType || '-' }}
        </ng-template>

        <ng-template uiTableCell="status" let-row>
          <ui-status-badge [status]="row.status"></ui-status-badge>
        </ng-template>
      </ui-data-table>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
      .total-badge { font-size: 0.8rem; color: #6b7280; margin-bottom: 0.5rem; }
    `,
  ],
})
export class ClientBranchesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  branches: Branch[] = [];
  loading = false;
  error = '';

  columns: TableColumn[] = [
    { key: 'branchName', header: 'Branch Name', sortable: true },
    { key: 'state', header: 'State', sortable: true },
    { key: 'city', header: 'City', sortable: true },
    { key: 'branchType', header: 'Type', width: '140px' },
    { key: 'status', header: 'Status', width: '120px', align: 'center' },
  ];

  constructor(
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
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

    this.http
      .get<any>(`${environment.apiBaseUrl}/api/v1/client/branches`)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.branches = Array.isArray(res) ? res : res?.data ?? [];
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (e) => {
          this.loading = false;
          this.error = e?.error?.message || e?.message || 'Failed to load branches';
          this.toast.error('Error', this.error);
          this.cdr.detectChanges();
        },
      });
  }

  onRowClick(event: { row: Branch; index: number }): void {
    this.router.navigate(['/client/branches', event.row.id]);
  }
}

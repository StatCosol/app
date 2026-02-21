import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, finalize, switchMap, takeUntil, tap, timeout } from 'rxjs/operators';
import { PayrollApiService, PayrollClient } from './payroll-api.service';
import { PayrollRegistersService, RegisterRecordRow } from './payroll-registers.service';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableColumn,
  TableCellDirective,
  FormSelectComponent,
  FormInputComponent,
  SelectOption,
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  StatusBadgeComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-payroll-registers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    DataTableComponent,
    TableCellDirective,
    FormSelectComponent,
    FormInputComponent,
    ActionButtonComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
    StatusBadgeComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Payroll Registers & Records"
        subtitle="Access, approve, and download payroll registers">
        <div slot="actions" class="flex items-center gap-3">
          <ui-button variant="secondary" [disabled]="loading" (clicked)="reload()">
            Refresh
          </ui-button>
        </div>
      </ui-page-header>

      <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ui-form-select
            label="Client"
            [options]="clientOptions"
            [(ngModel)]="q.clientId"
            (ngModelChange)="reload()"
            placeholder="All Clients">
          </ui-form-select>

          <ui-form-input
            label="Category"
            [(ngModel)]="q.category"
            (ngModelChange)="reload()"
            placeholder="PAYSLIP / WAGES / PF">
          </ui-form-input>

          <ui-form-input
            label="Year"
            type="number"
            [(ngModel)]="q.periodYear"
            (ngModelChange)="reload()">
          </ui-form-input>

          <ui-form-input
            label="Month"
            type="number"
            [(ngModel)]="q.periodMonth"
            (ngModelChange)="reload()"
            placeholder="1-12">
          </ui-form-input>
        </div>
      </div>

      <div *ngIf="error" class="mb-6">
        <ui-empty-state
          title="Error Loading Registers"
          [description]="error">
        </ui-empty-state>
      </div>

      <ui-loading-spinner *ngIf="loading" text="Loading registers..." size="lg"></ui-loading-spinner>

      <ui-empty-state
        *ngIf="!loading && !error && rows.length === 0"
        title="No Records Found"
        description="No payroll registers match the selected filters.">
      </ui-empty-state>

      <ui-data-table
        *ngIf="!loading && !error && rows.length > 0"
        [columns]="columns"
        [data]="rows"
        [loading]="loading"
        emptyMessage="No records found.">

        <ng-template uiTableCell="title" let-row>
          <div class="font-semibold text-gray-900">{{ row.title }}</div>
          <div *ngIf="row.registerType" class="text-xs text-gray-500">{{ row.registerType }}</div>
        </ng-template>

        <ng-template uiTableCell="category" let-row>
          <span class="text-sm text-gray-700">{{ row.category }}</span>
        </ng-template>

        <ng-template uiTableCell="period" let-row>
          <span class="text-sm text-gray-700">{{ two(row.periodMonth) }}/{{ row.periodYear }}</span>
        </ng-template>

        <ng-template uiTableCell="client" let-row>
          <div class="font-medium text-gray-900">{{ row.clientName || clientName(row.clientId) }}</div>
        </ng-template>

        <ng-template uiTableCell="status" let-row>
          <ui-status-badge [status]="row.approvalStatus || 'PENDING'"></ui-status-badge>
        </ng-template>

        <ng-template uiTableCell="actions" let-row>
          <div class="flex items-center gap-2">
            <ui-button size="sm" variant="secondary" (clicked)="download(row)">
              Download
            </ui-button>
            <ui-button
              *ngIf="row.approvalStatus !== 'APPROVED'"
              size="sm" variant="primary" (clicked)="approve(row)">
              Approve
            </ui-button>
            <ui-button
              *ngIf="row.approvalStatus !== 'REJECTED'"
              size="sm" variant="danger" (clicked)="reject(row)">
              Reject
            </ui-button>
          </div>
        </ng-template>
      </ui-data-table>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1200px; margin: 0 auto; padding: 1rem; }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollRegistersComponent implements OnInit, OnDestroy {
  clients: PayrollClient[] = [];
  rows: RegisterRecordRow[] = [];
  loading = false;
  error = '';
  clientOptions: SelectOption[] = [{ value: null, label: 'All Clients' }];

  private reload$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  columns: TableColumn[] = [
    { key: 'title', header: 'Title', sortable: true },
    { key: 'category', header: 'Category', sortable: true, width: '120px' },
    { key: 'period', header: 'Period', sortable: true, width: '100px' },
    { key: 'client', header: 'Client', sortable: true },
    { key: 'status', header: 'Status', sortable: true, width: '120px' },
    { key: 'actions', header: 'Actions', sortable: false, width: '260px', align: 'center' },
  ];

  q: { clientId: string | null; category: string; periodYear: number | null; periodMonth: number | null } = {
    clientId: null,
    category: '',
    periodYear: null,
    periodMonth: null,
  };

  constructor(private payrollApi: PayrollApiService, private api: PayrollRegistersService) {}

  ngOnInit(): void {
    this.payrollApi.getAssignedClients().subscribe({
      next: (list) => {
        this.clients = list || [];
        this.clientOptions = [
          { value: null, label: 'All Clients' },
          ...this.clients.map((c) => ({ value: c.id, label: c.name })),
        ];
      },
      error: (e) => {
        this.error = `Unable to load clients. ${e?.error?.message || ''}`;
      },
    });

    this.reload$
      .pipe(
        debounceTime(150),
        tap(() => { this.loading = true; this.error = ''; }),
        switchMap(() =>
          this.api
            .listRegisters({
              clientId: this.q.clientId ?? undefined,
              category: this.q.category?.trim() || undefined,
              periodYear: this.q.periodYear ?? undefined,
              periodMonth: this.q.periodMonth ?? undefined,
            })
            .pipe(
              timeout(10000),
              catchError((e) => {
                this.error = e?.error?.message || `Unable to load registers. ${e?.message || ''}`;
                return of([] as RegisterRecordRow[]);
              }),
              finalize(() => { this.loading = false; }),
            ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((rows) => {
        this.rows = rows || [];
      });

    this.reload();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.reload$.complete();
  }

  reload(): void {
    this.reload$.next();
  }

  download(r: RegisterRecordRow): void {
    this.api.downloadRegister(r.id).subscribe({
      next: (blob) => this.api.saveBlob(blob, r.fileName || `${r.category}_${r.id}`),
      error: (e) => { this.error = e?.error?.message || 'Download failed'; },
    });
  }

  approve(r: RegisterRecordRow): void {
    this.api.approveRegister(r.id).subscribe({
      next: () => this.reload(),
      error: (e) => { this.error = e?.error?.message || 'Approve failed'; },
    });
  }

  reject(r: RegisterRecordRow): void {
    const reason = prompt('Rejection reason (optional):') ?? '';
    this.api.rejectRegister(r.id, reason).subscribe({
      next: () => this.reload(),
      error: (e) => { this.error = e?.error?.message || 'Reject failed'; },
    });
  }

  clientName(clientId: string): string {
    return this.clients.find((c) => c.id === clientId)?.name || clientId;
  }

  two(n: any): string {
    const v = Number(n ?? 0);
    return String(v).padStart(2, '0');
  }
}

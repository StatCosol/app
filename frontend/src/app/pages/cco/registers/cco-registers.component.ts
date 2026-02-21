import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { finalize, timeout, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
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
} from '../../../shared/ui';

type RegisterRow = {
  id: string;
  clientId: string;
  clientName: string | null;
  title: string;
  category: string;
  registerType: string | null;
  periodYear: number | null;
  periodMonth: number | null;
  fileName: string | null;
  approvalStatus: string;
  approvedAt: string | null;
};

type PayrollClient = { id: string; clientName: string; clientCode: string };

@Component({
  selector: 'app-cco-registers',
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
        title="Payroll Registers"
        subtitle="View and download payroll registers across all clients">
        <div slot="actions" class="flex items-center gap-3">
          <ui-button variant="secondary" [disabled]="loading" (clicked)="reload()">
            Refresh
          </ui-button>
        </div>
      </ui-page-header>

      <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
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

      <ui-loading-spinner *ngIf="loading" text="Loading registers..." size="lg"></ui-loading-spinner>

      <div *ngIf="error" class="mb-6">
        <ui-empty-state title="Error" [description]="error"></ui-empty-state>
      </div>

      <ui-empty-state
        *ngIf="!loading && !error && rows.length === 0"
        title="No Registers Found"
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
          <ui-button size="sm" variant="secondary" (clicked)="download(row)">
            Download
          </ui-button>
        </ng-template>
      </ui-data-table>
    </div>
  `,
  styles: [`
    .page { max-width: 1200px; margin: 0 auto; padding: 1rem; }
  `],
})
export class CcoRegistersComponent implements OnInit {
  clients: PayrollClient[] = [];
  rows: RegisterRow[] = [];
  loading = false;
  error = '';

  columns: TableColumn[] = [
    { key: 'title', header: 'Title', sortable: true },
    { key: 'category', header: 'Category', sortable: true, width: '120px' },
    { key: 'period', header: 'Period', sortable: true, width: '100px' },
    { key: 'client', header: 'Client', sortable: true },
    { key: 'status', header: 'Status', sortable: true, width: '120px' },
    { key: 'actions', header: 'Download', sortable: false, width: '120px', align: 'center' },
  ];

  get clientOptions(): SelectOption[] {
    return [
      { value: null, label: 'All Clients' },
      ...this.clients.map(c => ({ value: c.id, label: c.clientName })),
    ];
  }

  q = {
    clientId: null as string | null,
    category: '',
    periodYear: null as number | null,
    periodMonth: null as number | null,
  };

  private base = `${environment.apiBaseUrl}/api/payroll`;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.http.get<any>(`${this.base}/clients`).subscribe({
      next: (list) => { this.clients = list || []; this.cdr.detectChanges(); },
      error: () => { this.clients = []; },
    });
    this.reload();
  }

  reload(): void {
    this.loading = true;
    this.error = '';
    let p = new HttpParams();
    if (this.q.clientId) p = p.set('clientId', this.q.clientId);
    if (this.q.category?.trim()) p = p.set('category', this.q.category.trim());
    if (this.q.periodYear) p = p.set('periodYear', String(this.q.periodYear));
    if (this.q.periodMonth) p = p.set('periodMonth', String(this.q.periodMonth));

    this.http.get<any>(`${this.base}/registers`, { params: p }).pipe(
      timeout(10000),
      map((res) => {
        const arr = Array.isArray(res) ? res : (res?.data ?? res?.rows ?? []);
        return (arr || []).map((r: any) => ({
          id: r.id,
          clientId: r.clientId ?? '',
          clientName: r.clientName ?? null,
          title: r.title ?? '',
          category: r.category ?? '',
          registerType: r.registerType ?? null,
          periodYear: r.periodYear ?? null,
          periodMonth: r.periodMonth ?? null,
          fileName: r.fileName ?? null,
          approvalStatus: r.approvalStatus ?? 'PENDING',
          approvedAt: r.approvedAt ?? null,
        })) as RegisterRow[];
      }),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (rows) => { this.rows = rows; this.cdr.detectChanges(); },
      error: (e) => { this.error = e?.error?.message || 'Failed to load registers'; this.cdr.detectChanges(); },
    });
  }

  download(r: RegisterRow): void {
    this.http.get(`${this.base}/registers/${r.id}/download`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = r.fileName || `register_${r.id}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (e) => {
        this.error = e?.error?.message || 'Download failed';
        this.cdr.detectChanges();
      },
    });
  }

  clientName(clientId: string): string {
    return this.clients.find(c => c.id === clientId)?.clientName || clientId;
  }

  two(n: any): string {
    return String(Number(n ?? 0)).padStart(2, '0');
  }
}

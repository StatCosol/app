import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { finalize, timeout } from 'rxjs/operators';
import { PayrollApiService, PayrollClient } from './payroll-api.service';
import { PageHeaderComponent, DataTableComponent, TableColumn, TableCellDirective, LoadingSpinnerComponent, EmptyStateComponent, StatusBadgeComponent } from '../../shared/ui';

@Component({
  selector: 'app-payroll-clients',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, DataTableComponent, TableCellDirective, LoadingSpinnerComponent, EmptyStateComponent, StatusBadgeComponent],
  template: `
    <div class="page">
      <ui-page-header
        title="Assigned Clients"
        description="Clients assigned to your payroll processing"
        icon="users">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading clients..." size="lg"></ui-loading-spinner>

      <ui-empty-state
        *ngIf="error && !loading"
        title="Unable to Load Clients"
        [description]="error">
      </ui-empty-state>

      <ui-empty-state
        *ngIf="!loading && !error && clients.length === 0"
        title="No Assigned Clients"
        description="No clients have been assigned to you yet.">
      </ui-empty-state>

      <ui-data-table
        *ngIf="!loading && !error && clients.length > 0"
        [columns]="columns"
        [data]="clients"
        [loading]="loading"
        emptyMessage="No assigned clients found.">
        
        <ng-template uiTableCell="name" let-row>
          <div class="font-semibold text-gray-900">{{ row.name }}</div>
          <div *ngIf="row.clientCode" class="text-xs text-gray-500 mt-0.5">Code: {{ row.clientCode }}</div>
        </ng-template>

        <ng-template uiTableCell="status" let-row>
          <ui-status-badge [status]="row.status || 'ACTIVE'"></ui-status-badge>
        </ng-template>
      </ui-data-table>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1100px; margin: 0 auto; padding: 1rem; }
    `,
  ],
})
export class PayrollClientsComponent implements OnInit {
  clients: PayrollClient[] = [];
  loading = true;
  error = '';

  columns: TableColumn[] = [
    { key: 'name', header: 'Client', sortable: true },
    { key: 'status', header: 'Status', sortable: true, width: '150px', align: 'center' },
  ];

  constructor(
    private payrollApi: PayrollApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('PayrollClients ngOnInit - loading clients');
    this.loading = true;
    this.cdr.detectChanges();
    this.payrollApi.getAssignedClients().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (list) => {
        console.log('PayrollClients loaded:', list);
        this.clients = list || [];
        this.cdr.detectChanges();
      },
      error: (e) => {
        console.error('PayrollClients error:', e);
        this.error = `Unable to load clients. ${e?.error?.message || e?.message || ''}`;
        this.cdr.detectChanges();
      },
    });
  }
}

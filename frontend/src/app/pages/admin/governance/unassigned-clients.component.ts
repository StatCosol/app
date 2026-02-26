import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { AdminDashboardService } from '../dashboard/admin-dashboard.service';
import { UnassignedClientDto } from '../dashboard/admin-dashboard.dto';
import {
  StatCardComponent,
  LoadingSpinnerComponent,
  ActionButtonComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
} from '../../../shared/ui';

@Component({
  selector: 'app-unassigned-clients',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    StatCardComponent,
    LoadingSpinnerComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
  ],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Unassigned Clients Report</h1>
          <p class="text-sm text-gray-500 mt-1">Clients missing at least one key assignment (CRM, Payroll, or Master User).</p>
        </div>
        <ui-button variant="secondary" [routerLink]="['/admin/dashboard']">
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            Back to Dashboard
          </span>
        </ui-button>
      </div>

      <div *ngIf="loading" class="flex items-center justify-center py-12">
        <ui-loading-spinner text="Loading unassigned clients..."></ui-loading-spinner>
      </div>

      <!-- Summary KPI -->
      <div *ngIf="!loading" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <ui-stat-card
          label="Total Gaps"
          [value]="clients.length"
          description="Clients with gaps"
          [color]="clients.length > 0 ? 'error' : 'success'">
        </ui-stat-card>

        <ui-stat-card
          label="No CRM"
          [value]="noCrmCount"
          description="Missing CRM"
          [color]="noCrmCount > 0 ? 'error' : 'success'">
        </ui-stat-card>

        <ui-stat-card
          label="No Payroll"
          [value]="noPayrollCount"
          description="Missing payroll user"
          [color]="noPayrollCount > 0 ? 'warning' : 'success'">
        </ui-stat-card>

        <ui-stat-card
          label="No Master User"
          [value]="noMasterCount"
          description="Missing master user"
          [color]="noMasterCount > 0 ? 'warning' : 'success'">
        </ui-stat-card>
      </div>

      <!-- Data Table -->
      <div *ngIf="!loading" class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <ui-data-table
          [columns]="columns"
          [data]="clients"
          emptyMessage="All clients have complete assignments — no gaps detected.">

          <ng-template uiTableCell="clientName" let-row>
            <a [routerLink]="['/admin/clients', row.clientId]" class="font-medium text-statco-blue hover:underline">
              {{ row.clientName }}
            </a>
          </ng-template>

          <ng-template uiTableCell="branchCount" let-row>
            <span [class]="row.branchCount === 0 ? 'text-red-600 font-semibold' : 'text-gray-700'">
              {{ row.branchCount }}
            </span>
          </ng-template>

          <ng-template uiTableCell="hasCrm" let-row>
            <span *ngIf="row.hasCrm" class="inline-flex items-center text-green-600">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            </span>
            <span *ngIf="!row.hasCrm" class="inline-flex items-center text-red-500 font-semibold">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
            </span>
          </ng-template>

          <ng-template uiTableCell="hasPayrollUser" let-row>
            <span *ngIf="row.hasPayrollUser" class="inline-flex items-center text-green-600">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            </span>
            <span *ngIf="!row.hasPayrollUser" class="inline-flex items-center text-red-500 font-semibold">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
            </span>
          </ng-template>

          <ng-template uiTableCell="hasMasterUser" let-row>
            <span *ngIf="row.hasMasterUser" class="inline-flex items-center text-green-600">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            </span>
            <span *ngIf="!row.hasMasterUser" class="inline-flex items-center text-red-500 font-semibold">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
            </span>
          </ng-template>
        </ui-data-table>
      </div>
    </div>
  `,
})
export class UnassignedClientsComponent implements OnInit {
  loading = true;
  clients: UnassignedClientDto[] = [];

  columns: TableColumn[] = [
    { key: 'clientName', header: 'Client Name', sortable: true },
    { key: 'branchCount', header: 'Branches', sortable: true, width: '100px', align: 'center' },
    { key: 'hasCrm', header: 'CRM Assigned?', sortable: true, width: '130px', align: 'center' },
    { key: 'hasPayrollUser', header: 'Payroll User?', sortable: true, width: '130px', align: 'center' },
    { key: 'hasMasterUser', header: 'Master User?', sortable: true, width: '130px', align: 'center' },
  ];

  get noCrmCount(): number {
    return this.clients.filter(c => !c.hasCrm).length;
  }

  get noPayrollCount(): number {
    return this.clients.filter(c => !c.hasPayrollUser).length;
  }

  get noMasterCount(): number {
    return this.clients.filter(c => !c.hasMasterUser).length;
  }

  constructor(
    private dash: AdminDashboardService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.dash.getUnassignedClients()
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (rows) => { this.clients = rows; },
        error: () => { this.clients = []; },
      });
  }
}

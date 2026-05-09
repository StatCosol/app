import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { CrmService } from '../../../core/crm.service';
import {
  ClientContextStripComponent,
  DataTableComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  TableCellDirective,
  TableColumn,
} from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-crm-contractor-computation',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ClientContextStripComponent,
    LoadingSpinnerComponent,
    DataTableComponent,
    TableCellDirective,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Contractor Computation"
        description="Review MCD wage matching, gross, statutory deductions, and net salary"
        icon="calculator">
        <ui-client-context-strip [inline]="true"></ui-client-context-strip>
      </ui-page-header>

      <div class="filters">
        <label *ngIf="!lockedClientId">
          <span>Client</span>
          <select [(ngModel)]="clientId" (ngModelChange)="load()">
            <option value="">Select client</option>
            <option *ngFor="let c of clients" [value]="c.id">{{ c.clientName }}</option>
          </select>
        </label>
        <label>
          <span>Period</span>
          <input type="month" [(ngModel)]="periodMonth" (ngModelChange)="load()" />
        </label>
        <label>
          <span>Status</span>
          <select [(ngModel)]="matchStatus" (ngModelChange)="load()">
            <option value="">All</option>
            <option value="MISMATCH">Mismatch</option>
            <option value="NO_QUOTATION">No quotation</option>
            <option value="MATCHED">Matched</option>
          </select>
        </label>
      </div>

      <ui-loading-spinner *ngIf="loading" text="Loading computation rows..."></ui-loading-spinner>

      <div *ngIf="!loading && !clientId" class="empty">
        Select a client to view contractor computation.
      </div>

      <div *ngIf="!loading && clientId" class="summary">
        <div><strong>{{ rows.length }}</strong><span>Rows</span></div>
        <div><strong>{{ mismatchCount }}</strong><span>Mismatches</span></div>
        <div><strong>{{ noQuoteCount }}</strong><span>No quotation</span></div>
      </div>

      <ui-data-table
        *ngIf="!loading && clientId"
        [columns]="columns"
        [data]="rows"
        [loading]="loading"
        emptyMessage="No contractor computation rows found.">
        <ng-template uiTableCell="employeeName" let-row>
          <div class="employee">{{ row.employeeName }}</div>
          <div class="muted">{{ row.employeeCode || '-' }}</div>
        </ng-template>
        <ng-template uiTableCell="contractorName" let-row>
          <div>{{ row.contractorName || '-' }}</div>
          <div class="muted">{{ row.branchName || 'All branches' }}</div>
        </ng-template>
        <ng-template uiTableCell="status" let-row>
          <span class="status" [class.ok]="row.matchStatus === 'MATCHED'" [class.bad]="row.matchStatus !== 'MATCHED'">
            {{ row.matchStatus }}
          </span>
          <div *ngIf="row.mismatchReason" class="reason">{{ row.mismatchReason }}</div>
        </ng-template>
        <ng-template uiTableCell="wage" let-row>
          <div>Quote: {{ money(row.quotationDailyWage) }}</div>
          <div>MCD: {{ money(row.mcdDailyWage) }}</div>
        </ng-template>
        <ng-template uiTableCell="computed" let-row>
          <div>Basic {{ money(row.basicWage) }}</div>
          <div>Gross {{ money(row.grossWage) }}</div>
          <div>Net {{ money(row.netSalary) }}</div>
        </ng-template>
        <ng-template uiTableCell="deductions" let-row>
          <div>PF Wage {{ money(row.pfWage) }}</div>
          <div>PF Employee {{ money(row.pfDeduction) }}</div>
          <div>PF Employer {{ money(row.pfEmployerContribution) }}</div>
          <div>ESI {{ money(row.esiDeduction) }}</div>
          <div>PT {{ money(row.ptDeduction) }}</div>
        </ng-template>
      </ui-data-table>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1280px; margin: 0 auto; padding: 1.5rem; }
      .filters { display: flex; flex-wrap: wrap; gap: 1rem; margin: 1rem 0; align-items: end; }
      label { display: grid; gap: 0.35rem; color: #374151; font-size: 0.85rem; font-weight: 700; }
      select, input { min-width: 190px; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.55rem 0.7rem; background: #fff; }
      .summary { display: flex; gap: 0.75rem; margin: 0.75rem 0 1rem; }
      .summary div { border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.65rem 0.85rem; background: #fff; min-width: 110px; }
      .summary strong { display: block; color: #111827; font-size: 1.1rem; }
      .summary span, .muted { color: #6b7280; font-size: 0.75rem; }
      .employee { font-weight: 700; color: #111827; }
      .status { display: inline-flex; border-radius: 999px; padding: 0.15rem 0.55rem; font-size: 0.68rem; font-weight: 800; background: #fee2e2; color: #991b1b; }
      .status.ok { background: #d1fae5; color: #065f46; }
      .status.bad { background: #fee2e2; color: #991b1b; }
      .reason { margin-top: 0.25rem; max-width: 260px; color: #b45309; font-size: 0.72rem; white-space: normal; }
      .empty { padding: 1rem; border: 1px dashed #d1d5db; border-radius: 8px; color: #6b7280; }
    `,
  ],
})
export class CrmContractorComputationComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private readonly baseUrl = environment.apiBaseUrl || '';

  clients: any[] = [];
  rows: any[] = [];
  loading = false;
  clientId = '';
  lockedClientId = '';
  periodMonth = '';
  matchStatus = '';

  columns: TableColumn[] = [
    { key: 'periodMonth', header: 'Period', width: '90px' },
    { key: 'contractorName', header: 'Contractor', width: '180px' },
    { key: 'employeeName', header: 'Employee', width: '180px' },
    { key: 'skillCategory', header: 'Skill', width: '120px' },
    { key: 'daysWorked', header: 'Days', width: '70px', align: 'center' },
    { key: 'wage', header: 'Daily Wage', width: '130px' },
    { key: 'computed', header: 'Computed Salary', width: '150px' },
    { key: 'deductions', header: 'Deductions', width: '160px' },
    { key: 'status', header: 'Status', width: '220px' },
  ];

  constructor(
    private http: HttpClient,
    private crm: CrmService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.lockedClientId = this.route.snapshot.paramMap.get('clientId') || '';
    this.clientId = this.lockedClientId;
    this.periodMonth = new Date().toISOString().slice(0, 7);
    this.crm.getAssignedClientsCached().pipe(takeUntil(this.destroy$)).subscribe((clients: any) => {
      this.clients = clients || [];
      if (!this.clientId && this.clients.length === 1) this.clientId = this.clients[0].id;
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get mismatchCount(): number {
    return this.rows.filter((r) => r.matchStatus === 'MISMATCH').length;
  }

  get noQuoteCount(): number {
    return this.rows.filter((r) => r.matchStatus === 'NO_QUOTATION').length;
  }

  load(): void {
    if (!this.clientId) {
      this.rows = [];
      return;
    }
    const params: Record<string, string> = { clientId: this.clientId };
    if (this.periodMonth) params['periodMonth'] = this.periodMonth;
    if (this.matchStatus) params['matchStatus'] = this.matchStatus;
    this.loading = true;
    this.http
      .get<any>(`${this.baseUrl}/api/v1/crm/contractor-computation/mcd-computations`, { params })
      .pipe(finalize(() => (this.loading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (res) => (this.rows = res?.data || []),
        error: () => (this.rows = []),
      });
  }

  money(value: unknown): string {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-';
  }
}

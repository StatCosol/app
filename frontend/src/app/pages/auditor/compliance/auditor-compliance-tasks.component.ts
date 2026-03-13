import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  StatCardComponent,
  StatusBadgeComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  ActionButtonComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
} from '../../../shared/ui';

@Component({
  selector: 'app-auditor-compliance-tasks',
  standalone: true,
  imports: [
    CommonModule, RouterModule, FormsModule,
    PageHeaderComponent, StatCardComponent, StatusBadgeComponent,
    LoadingSpinnerComponent, EmptyStateComponent, ActionButtonComponent,
    DataTableComponent, TableCellDirective,
  ],
  templateUrl: './auditor-compliance-tasks.component.html',
})
export class AuditorComplianceTasksComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  tasks: any[] = [];

  readonly columns: TableColumn[] = [
    { key: 'taskName', header: 'Compliance Task' },
    { key: 'client', header: 'Client' },
    { key: 'branch', header: 'Branch' },
    { key: 'type', header: 'Type' },
    { key: 'frequency', header: 'Frequency' },
    { key: 'dueDate', header: 'Due Date' },
    { key: 'status', header: 'Status' },
    { key: 'action', header: 'Action' },
  ];
  total = 0;
  page = 1;
  limit = 50;

  // Filters
  status = '';
  q = '';

  // KPIs
  kpiTotal = 0;
  kpiSubmitted = 0;
  kpiInReview = 0;
  kpiApproved = 0;
  kpiRejected = 0;

  readonly statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'IN_REVIEW', label: 'In Review' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'PENDING', label: 'Pending' },
  ] as const;

  constructor(
    private api: ComplianceApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
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
    this.api.auditorGetTasks({
      status: this.status || undefined,
      q: this.q || undefined,
      page: this.page,
      limit: this.limit,
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.tasks = Array.isArray(res) ? res : (res?.items || res?.data || []);
        this.total = res?.total || this.tasks.length;
        this.computeKpis();
        this.cdr.detectChanges();
      },
      error: () => {
        this.tasks = [];
        this.total = 0;
        this.toast.error('Failed to load auditor tasks.');
        this.cdr.detectChanges();
      },
    });
  }

  /* ═══════ KPI computation ═══════ */

  private computeKpis(): void {
    this.kpiTotal = this.tasks.length;
    this.kpiSubmitted = this.tasks.filter(t => this.statusText(t) === 'SUBMITTED').length;
    this.kpiInReview = this.tasks.filter(t => this.statusText(t) === 'IN_REVIEW').length;
    this.kpiApproved = this.tasks.filter(t => this.statusText(t) === 'APPROVED').length;
    this.kpiRejected = this.tasks.filter(t => this.statusText(t) === 'REJECTED').length;
  }

  /* ═══════ Defensive camelCase / snake_case helpers ═══════ */

  private pick<T = any>(row: any, ...keys: string[]): T | undefined {
    for (const k of keys) {
      if (row && row[k] !== undefined && row[k] !== null) return row[k];
    }
    return undefined;
  }

  id(row: any): string {
    return this.pick(row, 'id', 'taskId', 'task_id') || '';
  }

  taskName(row: any): string {
    return this.pick(row, 'taskName', 'task_name', 'name', 'complianceName', 'compliance_name') || '-';
  }

  statusText(row: any): string {
    return this.pick(row, 'status') || '-';
  }

  due(row: any): string {
    return this.pick(row, 'dueDate', 'due_date') || '-';
  }

  clientName(row: any): string {
    return this.pick(row, 'clientName', 'client_name', 'client') || '-';
  }

  branchName(row: any): string {
    return this.pick(row, 'branchName', 'branch_name', 'branch') || '-';
  }

  complianceType(row: any): string {
    return this.pick(row, 'complianceType', 'compliance_type', 'type', 'category') || '-';
  }

  frequency(row: any): string {
    return this.pick(row, 'frequency', 'periodType', 'period_type') || '-';
  }

  clearFilters(): void {
    this.status = '';
    this.q = '';
    this.page = 1;
    this.load();
  }
}

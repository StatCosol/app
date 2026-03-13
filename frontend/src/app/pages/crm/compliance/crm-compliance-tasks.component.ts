import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

import { ComplianceApiService } from '../../../shared/services/compliance-api.service';
import { ComplianceTaskDto, Paged } from '../../../shared/models/compliance.models';
import {
  PageHeaderComponent,
  StatusBadgeComponent,
  LoadingSpinnerComponent,
  ActionButtonComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
} from '../../../shared/ui';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../shared/toast/toast.service';

@Component({
  selector: 'app-crm-compliance-tasks',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoadingSpinnerComponent,
    ActionButtonComponent,
    DataTableComponent,
    TableCellDirective,
  ],
  templateUrl: './crm-compliance-tasks.component.html',
})
export class CrmComplianceTasksComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  error: string | null = null;

  // KPIs
  kpis: {
    total: number; pending: number; inProgress: number; submitted: number;
    approved: number; rejected: number; overdue: number; dueToday: number; dueSoon: number;
  } | null = null;

  // Filters
  clientId = '';
  branchId = '';
  status = '';
  q = '';
  monthKey = '';

  // Paging
  page = 1;
  limit = 20;
  total = 0;

  tasks: ComplianceTaskDto[] = [];

  readonly taskColumns: TableColumn[] = [
    { key: 'select', header: '', width: '40px' },
    { key: 'taskName', header: 'Task' },
    { key: 'clientId', header: 'Client' },
    { key: 'branch', header: 'Branch' },
    { key: 'dueDate', header: 'Due Date' },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: 'Actions', align: 'right' },
  ];

  // Bulk selection
  selectedIds = new Set<string | number>();
  allSelected = false;

  constructor(
    private api: ComplianceApiService,
    private dialog: ConfirmDialogService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadKpis();
    this.load();
  }

  loadKpis(): void {
    this.api.crmTaskKpis()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => { this.kpis = data; },
        error: () => { this.toast.error('Failed to load task KPIs.'); },
      });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.selectedIds.clear();
    this.allSelected = false;

    this.api
      .crmGetTasks({
        clientId: this.clientId || undefined,
        branchId: this.branchId || undefined,
        status: this.status || undefined,
        monthKey: this.monthKey || undefined,
        q: this.q || undefined,
        page: this.page,
        limit: this.limit,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: (res: Paged<ComplianceTaskDto>) => {
          this.tasks = res.items || [];
          this.total = res.total || 0;
        },
        error: (err) => {
          this.error =
            err?.error?.message ||
            err?.message ||
            'Failed to load CRM compliance tasks.';
        },
      });
  }

  resetFilters(): void {
    this.clientId = '';
    this.branchId = '';
    this.status = '';
    this.q = '';
    this.monthKey = '';
    this.page = 1;
    this.load();
  }

  applyFilters(): void {
    this.page = 1;
    this.load();
  }

  filterByStatus(st: string): void {
    this.status = st;
    this.page = 1;
    this.load();
  }

  nextPage(): void {
    if (this.page * this.limit >= this.total) return;
    this.page += 1;
    this.load();
  }

  prevPage(): void {
    if (this.page <= 1) return;
    this.page -= 1;
    this.load();
  }

  canReview(status: string): boolean {
    return status === 'SUBMITTED' || status === 'IN_REVIEW';
  }

  // SLA helpers
  daysUntilDue(dueDate: string): number {
    if (!dueDate) return 999;
    const due = new Date(dueDate);
    const now = new Date();
    return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  slaClass(dueDate: string, status: string): string {
    if (status === 'APPROVED') return '';
    const days = this.daysUntilDue(dueDate);
    if (days < 0) return 'text-red-600 font-semibold';
    if (days <= 3) return 'text-amber-600 font-medium';
    return 'text-gray-600';
  }

  slaLabel(dueDate: string, status: string): string {
    if (status === 'APPROVED') return '';
    const days = this.daysUntilDue(dueDate);
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Due today';
    if (days <= 3) return `${days}d left`;
    return '';
  }

  // Bulk selection  
  toggleSelectAll(): void {
    this.allSelected = !this.allSelected;
    if (this.allSelected) {
      this.tasks.filter(t => this.canReview(t.status)).forEach(t => this.selectedIds.add(t.id));
    } else {
      this.selectedIds.clear();
    }
  }

  toggleSelect(id: string | number): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.allSelected = this.tasks.filter(t => this.canReview(t.status)).every(t => this.selectedIds.has(t.id));
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  async bulkApprove(): Promise<void> {
    if (!this.selectedIds.size) return;
    const result = await this.dialog.prompt(
      'Bulk Approve',
      `Approve ${this.selectedIds.size} selected tasks? Add optional remarks:`,
      { placeholder: 'Remarks (optional)' },
    );
    if (!result.confirmed) return;

    this.api.crmBulkApprove(Array.from(this.selectedIds).map(Number), result.value || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.toast.success(`Approved: ${res.approved}, Failed: ${res.failed}`);
          this.loadKpis();
          this.load();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Bulk approve failed'),
      });
  }

  async bulkReject(): Promise<void> {
    if (!this.selectedIds.size) return;
    const result = await this.dialog.prompt(
      'Bulk Reject',
      `Reject ${this.selectedIds.size} selected tasks? Provide reason:`,
      { placeholder: 'Reason for rejection (required)' },
    );
    if (!result.confirmed) return;
    const remarks = (result.value || '').trim();
    if (remarks.length < 5) {
      this.toast.error('Remarks required (minimum 5 characters)');
      return;
    }

    this.api.crmBulkReject(Array.from(this.selectedIds).map(Number), remarks)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.toast.success(`Rejected: ${res.rejected}, Failed: ${res.failed}`);
          this.loadKpis();
          this.load();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Bulk reject failed'),
      });
  }

  async approve(task: ComplianceTaskDto): Promise<void> {
    const result = await this.dialog.prompt(
      'Approve Task',
      'Remarks (optional):',
      { placeholder: 'Enter remarks' },
    );
    if (!result.confirmed) return;
    const remarks = result.value || undefined;

    this.api.crmApproveTask(String(task.id), remarks)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Task approved successfully');
          this.loadKpis();
          this.load();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Approve failed');
        },
      });
  }

  async reject(task: ComplianceTaskDto): Promise<void> {
    const result = await this.dialog.prompt(
      'Reject Task',
      'Rejection reason (required, min 5 chars):',
      { placeholder: 'Reason for rejection' },
    );
    if (!result.confirmed) return;
    const remarks = (result.value || '').trim();
    if (remarks.length < 5) {
      this.toast.error('Remarks required (minimum 5 characters)');
      return;
    }

    this.api.crmRejectTask(String(task.id), remarks)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Task rejected');
          this.loadKpis();
          this.load();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Reject failed');
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

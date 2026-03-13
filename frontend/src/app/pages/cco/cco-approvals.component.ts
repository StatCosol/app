import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { CcoApprovalsService } from '../../core/cco-approvals.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  PageHeaderComponent, StatusBadgeComponent, ActionButtonComponent,
  DataTableComponent, TableCellDirective, LoadingSpinnerComponent, TableColumn,
  FormSelectComponent, SelectOption,
} from '../../shared/ui';

@Component({
  selector: 'app-cco-approvals',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent, ActionButtonComponent, DataTableComponent, TableCellDirective, LoadingSpinnerComponent, FormSelectComponent],
  templateUrl: './cco-approvals.component.html',
})
export class CcoApprovalsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  requests: any[] = [];
  filteredRequests: any[] = [];
  loading = true;
  error: string | null = null;
  actionId: number | null = null;
  searchTerm = '';
  statusFilter = '';

  columns: TableColumn[] = [
    { key: 'id', header: 'Request ID' },
    { key: 'crmName', header: 'CRM Name' },
    { key: 'email', header: 'Email' },
    { key: 'requestedBy', header: 'Requested By' },
    { key: 'requestedAt', header: 'Requested At' },
    { key: 'reason', header: 'Reason' },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: 'Actions', align: 'right' },
  ];

  readonly statusOptions: SelectOption[] = [
    { value: '', label: 'All Statuses' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
  ];

  constructor(private approvals: CcoApprovalsService, private toast: ToastService, private cdr: ChangeDetectorRef, private dialog: ConfirmDialogService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.approvals.list().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.loading = false;
        this.requests = res || [];
        this.applyFilter();
        this.cdr.detectChanges();
      },
      error: (e) => {
        this.loading = false;
        this.error = e?.error?.message || 'Failed to load requests';
        this.cdr.detectChanges();
      },
    });
  }

  async approve(id: number): Promise<void> {
    if (!(await this.dialog.confirm('Approve Request', 'Approve this CRM deletion request?'))) return;
    this.actionId = id;
    this.approvals.approve(id).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => { this.actionId = null; this.cdr.detectChanges(); this.load(); },
      error: (e) => { this.actionId = null; this.toast.error(e?.error?.message || 'Failed to approve'); this.cdr.detectChanges(); },
    });
  }

  async reject(id: number): Promise<void> {
    const result = await this.dialog.prompt('Reject', 'Enter rejection remarks (required):', { placeholder: 'Remarks' });
    if (!result.confirmed || !result.value?.trim()) return;
    this.actionId = id;
    this.approvals.reject(id, result.value.trim()).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => { this.actionId = null; this.cdr.detectChanges(); this.load(); },
      error: (e) => { this.actionId = null; this.toast.error(e?.error?.message || 'Failed to reject'); this.cdr.detectChanges(); },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  applyFilter(): void {
    let result = [...this.requests];
    if (this.statusFilter) {
      result = result.filter(r => r.status === this.statusFilter);
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(r =>
        (r.crmName || '').toLowerCase().includes(term) ||
        (r.email || '').toLowerCase().includes(term) ||
        (r.reason || '').toLowerCase().includes(term)
      );
    }
    this.filteredRequests = result;
  }

  get kpiCounts() {
    return {
      total: this.requests.length,
      pending: this.requests.filter(r => r.status === 'PENDING').length,
      approved: this.requests.filter(r => r.status === 'APPROVED').length,
      rejected: this.requests.filter(r => r.status === 'REJECTED').length,
    };
  }
}

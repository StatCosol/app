import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { CcoApprovalsService } from '../../core/cco-approvals.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  PageHeaderComponent, StatusBadgeComponent, ActionButtonComponent,
  DataTableComponent, TableCellDirective, LoadingSpinnerComponent, TableColumn,
} from '../../shared/ui';

@Component({
  selector: 'app-cco-approvals',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, StatusBadgeComponent, ActionButtonComponent, DataTableComponent, TableCellDirective, LoadingSpinnerComponent],
  templateUrl: './cco-approvals.component.html',
})
export class CcoApprovalsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  requests: any[] = [];
  loading = true;
  error: string | null = null;
  actionId: number | null = null;

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

  constructor(private approvals: CcoApprovalsService, private toast: ToastService, private cdr: ChangeDetectorRef) {}

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
        this.cdr.detectChanges();
      },
      error: (e) => {
        this.loading = false;
        this.error = e?.error?.message || 'Failed to load requests';
        this.cdr.detectChanges();
      },
    });
  }

  approve(id: number): void {
    if (!confirm('Approve this CRM deletion request?')) return;
    this.actionId = id;
    this.approvals.approve(id).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => { this.actionId = null; this.cdr.detectChanges(); this.load(); },
      error: (e) => { this.actionId = null; this.toast.error(e?.error?.message || 'Failed to approve'); this.cdr.detectChanges(); },
    });
  }

  reject(id: number): void {
    const remarks = prompt('Enter rejection remarks (required):') || '';
    if (!remarks.trim()) return;
    this.actionId = id;
    this.approvals.reject(id, remarks.trim()).pipe(
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
}

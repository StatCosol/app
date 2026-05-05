import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { PayrollEngineApiService, SalaryStructure, StructureItem, StructureApprovalStatus } from '../payroll/payroll-engine-api.service';

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DRAFT';
type QueueRow = SalaryStructure & { clientName?: string | null };

@Component({
  selector: 'app-cco-payroll-approvals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cco-payroll-approvals.component.html',
  styleUrls: ['./cco-payroll-approvals.component.scss'],
})
export class CcoPayrollApprovalsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly base = `${environment.apiBaseUrl}/api/v1/payroll/engine`;

  loading = true;
  acting = false;
  statusFilter: StatusFilter = 'PENDING';
  statusOptions: StatusFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'DRAFT'];

  structures: QueueRow[] = [];
  selected: QueueRow | null = null;
  selectedItems: StructureItem[] = [];
  itemsLoading = false;

  constructor(
    private readonly http: HttpClient,
    private readonly engineApi: PayrollEngineApiService,
    private readonly toast: ToastService,
    private readonly dialog: ConfirmDialogService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  clientLabel(row: QueueRow): string {
    return row.clientName || row.clientId.slice(0, 8);
  }

  load(): void {
    this.loading = true;
    this.selected = null;
    this.selectedItems = [];
    this.http
      .get<QueueRow[]>(`${this.base}/structures/approval-queue`, {
        params: { status: this.statusFilter },
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.structures = rows || [];
        },
        error: (e) => {
          this.toast.error(e?.error?.message || 'Failed to load approval queue');
          this.structures = [];
        },
      });
  }

  selectRow(row: QueueRow): void {
    this.selected = row;
    this.selectedItems = [];
    this.itemsLoading = true;
    this.engineApi
      .listStructureItems(row.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.itemsLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (items) => {
          this.selectedItems = items || [];
        },
        error: () => {
          this.selectedItems = [];
        },
      });
  }

  async approve(row: QueueRow): Promise<void> {
    if (row.approvalStatus !== 'PENDING') return;
    const ok = await this.dialog.confirm(
      'Approve Structure',
      `Approve "${row.name}" for ${this.clientLabel(row)}?`,
    );
    if (!ok) return;
    this.acting = true;
    this.engineApi
      .approveStructure(row.id)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.acting = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success('Structure approved');
          this.load();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Approve failed'),
      });
  }

  async reject(row: QueueRow): Promise<void> {
    if (row.approvalStatus !== 'PENDING') return;
    const reason = window.prompt('Reason for rejection (required):', '');
    if (reason === null) return;
    if (!reason.trim()) {
      this.toast.error('Rejection reason is required');
      return;
    }
    this.acting = true;
    this.engineApi
      .rejectStructure(row.id, reason.trim())
      .pipe(takeUntil(this.destroy$), finalize(() => { this.acting = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.toast.success('Structure rejected');
          this.load();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Reject failed'),
      });
  }

  badgeClass(s: StructureApprovalStatus): string {
    switch (s) {
      case 'PENDING': return 'badge badge-warn';
      case 'APPROVED': return 'badge badge-ok';
      case 'REJECTED': return 'badge badge-err';
      default: return 'badge badge-muted';
    }
  }

  formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    return new Date(s).toLocaleDateString();
  }

  formatDateTime(s: string | null | undefined): string {
    if (!s) return '—';
    return new Date(s).toLocaleString();
  }

  scopeText(row: QueueRow): string {
    const parts: string[] = [row.scopeType];
    if (row.branchId) parts.push(`branch=${row.branchId.slice(0, 8)}`);
    if (row.departmentId) parts.push(`dept=${row.departmentId.slice(0, 8)}`);
    if (row.gradeId) parts.push(`grade=${row.gradeId.slice(0, 8)}`);
    if (row.employeeId) parts.push(`emp=${row.employeeId.slice(0, 8)}`);
    return parts.join(' / ');
  }

  trackRow(_: number, r: QueueRow) {
    return r.id;
  }
}

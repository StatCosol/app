import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { AdminUsersApi, UserDto } from '../../../core/api/admin-users.api';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  PageHeaderComponent, StatCardComponent, StatusBadgeComponent,
  LoadingSpinnerComponent, EmptyStateComponent, ActionButtonComponent,
  DataTableComponent, TableCellDirective, TableColumn,
} from '../../../shared/ui';

type EscType = 'OVERDUE_COMPLIANCE' | 'REPEAT_DEFAULTS' | 'CRITICAL_AUDITS' | 'SLA_BREACHED_QUERIES' | '';

@Component({
  selector: 'app-cco-escalations',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    PageHeaderComponent, StatCardComponent, StatusBadgeComponent,
    LoadingSpinnerComponent, EmptyStateComponent, ActionButtonComponent,
    DataTableComponent, TableCellDirective,
  ],
  templateUrl: './cco-escalations.component.html',
})
export class CcoEscalationsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  items: any[] = [];
  filtered: any[] = [];

  readonly columns: TableColumn[] = [
    { key: 'type', header: 'Type' },
    { key: 'clientBranch', header: 'Client / Branch' },
    { key: 'title', header: 'Title' },
    { key: 'severity', header: 'Severity', align: 'center' },
    { key: 'ageDays', header: 'Age (days)', align: 'center' },
    { key: 'status', header: 'Status', align: 'center' },
    { key: 'actions', header: 'Actions', align: 'right' },
  ];

  tab: EscType = '';
  statusFilter = '';

  // KPIs
  kpiTotal = 0;
  kpiOpen = 0;
  kpiInProgress = 0;
  kpiCritical = 0;

  // Assign modal
  showAssignModal = false;
  assignTarget: any = null;
  assignRole: 'CRM' | 'AUDITOR' = 'CRM';
  assigneeId = '';
  allUsers: UserDto[] = [];

  get filteredUsers(): UserDto[] {
    return this.allUsers.filter(u => u.roleCode === this.assignRole);
  }

  // Notify modal
  showNotifyModal = false;
  notifyTarget: any = null;
  notifyMessage = '';

  constructor(
    private api: ClientBranchesService,
    private usersApi: AdminUsersApi,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
    forkJoin({
      crms: this.usersApi.getCcoCrmUsers(),
      auditors: this.usersApi.getCcoAuditorUsers(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ crms, auditors }) => {
        this.allUsers = [...(crms || []), ...(auditors || [])];
        this.cdr.detectChanges();
      },
      error: () => {
        this.allUsers = [];
        this.cdr.detectChanges();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    const params: any = {};
    if (this.statusFilter) params.status = this.statusFilter;

    this.api.getEscalations(params).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res: any) => {
        this.items = res?.items || res?.data || res || [];
        this.computeKpis();
        this.applyTabFilter();
        this.cdr.detectChanges();
      },
      error: () => {
        this.items = [];
        this.filtered = [];
        this.cdr.detectChanges();
      },
    });
  }

  private computeKpis(): void {
    this.kpiTotal = this.items.length;
    this.kpiOpen = this.items.filter(i => i.status === 'OPEN').length;
    this.kpiInProgress = this.items.filter(i => i.status === 'IN_PROGRESS').length;
    this.kpiCritical = this.items.filter(i => i.severity === 'CRITICAL').length;
  }

  setTab(t: EscType): void {
    this.tab = t;
    this.applyTabFilter();
  }

  applyTabFilter(): void {
    this.filtered = this.tab ? this.items.filter(i => i.type === this.tab) : this.items;
  }

  updateStatus(item: any, status: string): void {
    this.api.updateEscalation(item.id, { status }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Status updated.'); this.load(); },
      error: () => this.toast.error('Failed to update status.'),
    });
  }

  openAssignModal(item: any): void {
    this.assignTarget = item;
    this.assigneeId = '';
    this.showAssignModal = true;
  }

  confirmAssign(): void {
    if (!this.assignTarget || !this.assigneeId.trim()) return;
    this.api.updateEscalation(this.assignTarget.id, {
      assigneeRole: this.assignRole,
      assigneeId: this.assigneeId.trim(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Assigned.');
        this.showAssignModal = false;
        this.load();
      },
      error: () => this.toast.error('Assignment failed.'),
    });
  }

  openNotifyModal(item: any): void {
    this.notifyTarget = item;
    this.notifyMessage = '';
    this.showNotifyModal = true;
  }

  sendNotification(): void {
    if (!this.notifyTarget || !this.notifyMessage.trim()) return;
    this.api.updateEscalation(this.notifyTarget.id, {
      action: 'notify',
      message: this.notifyMessage.trim(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Notification sent.');
        this.showNotifyModal = false;
      },
      error: () => this.toast.error('Failed to send notification.'),
    });
  }

  async closeEscalation(item: any): Promise<void> {
    const ok = await this.dialog.confirm('Close Escalation', `Close "${item.title}"? This cannot be undone.`);
    if (!ok) return;
    this.updateStatus(item, 'CLOSED');
  }

  severityColor(sev: string): string {
    switch (sev) {
      case 'CRITICAL': return 'bg-red-100 text-red-700';
      case 'HIGH': return 'bg-orange-100 text-orange-700';
      case 'MEDIUM': return 'bg-amber-100 text-amber-700';
      default: return 'bg-green-100 text-green-700';
    }
  }

  readonly tabOptions: { value: EscType; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'OVERDUE_COMPLIANCE', label: 'Overdue' },
    { value: 'REPEAT_DEFAULTS', label: 'Repeat Defaults' },
    { value: 'CRITICAL_AUDITS', label: 'Critical Audits' },
    { value: 'SLA_BREACHED_QUERIES', label: 'SLA Breached' },
  ];
}

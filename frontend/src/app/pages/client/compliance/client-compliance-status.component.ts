import { Component, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subject, Subscription } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { ClientComplianceService } from '../../../core/client-compliance.service';
import {
  PageHeaderComponent,
  StatusBadgeComponent,
  DataTableComponent,
  TableColumn,
  FormSelectComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
} from '../../../shared/ui';

type ActiveTab = 'branches' | 'tasks' | 'returns' | 'contractors' | 'audit';

@Component({
  standalone: true,
  selector: 'app-client-compliance-status',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    StatusBadgeComponent,
    PageHeaderComponent,
    DataTableComponent,
    FormSelectComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
  ],
  templateUrl: './client-compliance-status.component.html',
  styleUrls: ['../shared/client-theme.scss', './client-compliance-status.component.scss'],
})
export class ClientComplianceStatusComponent implements OnInit, OnDestroy {
  error = '';
  private tasksSub?: Subscription;
  private tabSub?: Subscription;
  private allSub?: Subscription;
  private metaSub?: Subscription;
  private readonly destroy$ = new Subject<void>();
  loading = false;
  month = new Date().getMonth() + 1;
  year = new Date().getFullYear();
  selectedBranchId = '';
  activeTab: ActiveTab = 'branches';
  taskCategory = '';
  taskStatus = '';
  taskLimit = 100;

  summary: any = null;
  branchMeta: any[] = [];
  branchOptions: { value: string; label: string }[] = [];
  branchRows: any[] = [];
  tasks: any[] = [];
  contractorData: any = null;
  auditData: any = null;
  returnsData: any = null;

  branchColumns: TableColumn[] = [
    { key: 'branchName', header: 'Branch', sortable: true },
    { key: 'stateCode', header: 'State', sortable: true },
    { key: 'compliancePct', header: 'Compliance %', sortable: true, align: 'center' },
    { key: 'approved', header: 'Approved', sortable: true, align: 'center' },
    { key: 'pending', header: 'Pending', sortable: true, align: 'center' },
    { key: 'overdue', header: 'Overdue', sortable: true, align: 'center' },
    { key: 'riskLevel', header: 'Risk', sortable: true, align: 'center' },
  ];

  taskColumns: TableColumn[] = [
    { key: 'title', header: 'Compliance', sortable: true },
    { key: 'branchName', header: 'Branch', sortable: true },
    { key: 'lawName', header: 'Law', sortable: true },
    { key: 'frequency', header: 'Frequency', sortable: true },
    { key: 'dueDate', header: 'Due Date', sortable: true },
    { key: 'status', header: 'Status', sortable: true, align: 'center' },
    { key: 'delayDays', header: 'Delay', sortable: true, align: 'center' },
  ];

  returnsColumns: TableColumn[] = [
    { key: 'branch_name', header: 'Branch', sortable: true },
    { key: 'law_type', header: 'Return Type', sortable: true },
    { key: 'period_label', header: 'Period', sortable: true },
    { key: 'due_date', header: 'Due Date', sortable: true },
    { key: 'status', header: 'Status', sortable: true, align: 'center' },
    { key: 'delay_days', header: 'Delay', sortable: true, align: 'center' },
  ];

  contractorColumns: TableColumn[] = [
    { key: 'contractorName', header: 'Contractor', sortable: true },
    { key: 'branchName', header: 'Branch', sortable: true },
    { key: 'compliancePct', header: 'Compliance %', sortable: true, align: 'center' },
    { key: 'approvedDocuments', header: 'Approved', sortable: true, align: 'center' },
    { key: 'pendingDocuments', header: 'Pending', sortable: true, align: 'center' },
    { key: 'rejectedDocuments', header: 'Rejected', sortable: true, align: 'center' },
  ];

  monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2000, i).toLocaleString('en', { month: 'long' }),
  }));

  categoryOptions = [
    { value: '', label: 'All Categories' },
    { value: 'FACTORY_ACT', label: 'Factory Act' },
    { value: 'SHOPS_ESTABLISHMENTS', label: 'Shops & Establishments' },
    { value: 'LABOUR_CODE', label: 'Labour Code' },
    { value: 'PF', label: 'PF' },
    { value: 'ESI', label: 'ESI' },
    { value: 'PT', label: 'Professional Tax' },
    { value: 'LWF', label: 'LWF' },
    { value: 'CLRA', label: 'CLRA' },
  ];

  constructor(private api: ClientComplianceService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadBranchMeta();
  }

  ngOnDestroy(): void {
    this.tasksSub?.unsubscribe();
    this.tabSub?.unsubscribe();
    this.allSub?.unsubscribe();
    this.metaSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBranchMeta(): void {
    this.metaSub?.unsubscribe();
    this.metaSub = this.api.getBranches()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.branchMeta = res?.data || res || [];
          this.branchOptions = [
            { value: '', label: 'All Branches' },
            ...this.branchMeta.map((b: any) => ({ value: b.id, label: b.branchName || b.name })),
          ];
          this.cdr.detectChanges();
          this.loadAll();
        },
        error: () => {
          this.branchMeta = [];
          this.branchOptions = [{ value: '', label: 'All Branches' }];
          this.loadAll();
        },
      });
  }

  loadAll(): void {
    this.allSub?.unsubscribe();
    this.loading = true;
    this.error = '';
    const bid = this.selectedBranchId || undefined;

    this.allSub = forkJoin({
      summary: this.api.getComplianceStatusSummary(this.month, this.year, bid),
      branches: this.api.getComplianceStatusBranches(this.month, this.year, bid),
    })
      .pipe(
        takeUntil(this.destroy$),
        timeout(15000),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.summary = res.summary;
          this.branchRows = res.branches || [];
          this.cdr.detectChanges();
          this.loadTabData();
        },
        error: () => {
          this.summary = null;
          this.branchRows = [];
          this.error = 'Unable to load compliance summary.';
          this.cdr.detectChanges();
        },
      });
  }

  loadTabData(): void {
    this.tabSub?.unsubscribe();
    this.tasksSub?.unsubscribe();
    const bid = this.selectedBranchId || undefined;
    this.error = '';

    switch (this.activeTab) {
      case 'tasks':
        this.tasksSub = this.api
          .getComplianceStatusTasks(this.month, this.year, {
            branchId: bid,
            category: this.taskCategory || undefined,
            status: this.taskStatus || undefined,
            limit: this.taskLimit,
          })
          .pipe(takeUntil(this.destroy$), timeout(10000))
          .subscribe({
            next: (res: any) => { this.tasks = res || []; this.cdr.detectChanges(); },
            error: () => { this.tasks = []; this.error = 'Unable to load tasks. Please retry.'; this.cdr.detectChanges(); },
          });
        break;

      case 'returns':
        this.tabSub = this.api
          .getComplianceStatusReturns(this.month, this.year, bid)
          .pipe(takeUntil(this.destroy$), timeout(10000))
          .subscribe({
            next: (res: any) => { this.returnsData = res; this.cdr.detectChanges(); },
            error: () => { this.returnsData = null; this.error = 'Unable to load returns data.'; this.cdr.detectChanges(); },
          });
        break;

      case 'contractors':
        this.tabSub = this.api
          .getComplianceStatusContractors(this.month, this.year, bid)
          .pipe(takeUntil(this.destroy$), timeout(10000))
          .subscribe({
            next: (res: any) => { this.contractorData = res; this.cdr.detectChanges(); },
            error: () => { this.contractorData = null; this.error = 'Unable to load contractor data.'; this.cdr.detectChanges(); },
          });
        break;

      case 'audit':
        this.tabSub = this.api
          .getComplianceStatusAudit(this.month, this.year, bid)
          .pipe(takeUntil(this.destroy$), timeout(10000))
          .subscribe({
            next: (res: any) => { this.auditData = res; this.cdr.detectChanges(); },
            error: () => { this.auditData = null; this.error = 'Unable to load audit data.'; this.cdr.detectChanges(); },
          });
        break;
    }
  }

  onFilterChange(): void {
    this.loadAll();
  }

  onTabChange(tab: string): void {
    this.activeTab = tab as ActiveTab;
    this.loadTabData();
  }

  onCategoryChange(): void {
    this.loadTabData();
  }

  onTaskStatusChange(): void {
    this.loadTabData();
  }

  onTaskLimitChange(): void {
    if (this.taskLimit < 0) this.taskLimit = 0;
    if (this.taskLimit > 500) this.taskLimit = 500;
    this.loadTabData();
  }

  riskClass(risk: string): string {
    switch (risk) {
      case 'CRITICAL': return 'risk-critical';
      case 'HIGH': return 'risk-high';
      case 'MEDIUM': return 'risk-medium';
      case 'LOW': return 'risk-low';
      default: return '';
    }
  }

  pctBarWidth(pct: number): string {
    return `${Math.min(100, Math.max(0, pct))}%`;
  }

  pctBarColor(pct: number): string {
    if (pct >= 85) return 'bg-green-500';
    if (pct >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  get summaryRiskColor(): string {
    if (!this.summary) return 'gray';
    switch (this.summary.riskLevel) {
      case 'CRITICAL': return 'error';
      case 'HIGH': return 'warning';
      case 'MEDIUM': return 'info';
      case 'LOW': return 'success';
      default: return 'gray';
    }
  }
}

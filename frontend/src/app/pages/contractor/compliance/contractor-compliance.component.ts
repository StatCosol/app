import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { ComplianceService } from '../../../core/compliance.service';
import { ReportsService } from '../../../core/reports.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  FormSelectComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-contractor-compliance',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    FormSelectComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './contractor-compliance.component.html',
  styleUrls: ['../shared/contractor-theme.scss', './contractor-compliance.component.scss'],
})
export class ContractorComplianceComponent implements OnInit, OnDestroy {
  tasks: any[] = [];
  allTasks: any[] = [];
  filters: any = { status: '', year: '', month: '' };
  searchTerm = '';

  viewTab: 'MY' | 'SUBMITTED' | 'OVERDUE' = 'MY';

  selectedId?: string;
  uploadFile?: File;
  loading = false;
  private destroy$ = new Subject<void>();

  tabItems: { key: 'MY' | 'SUBMITTED' | 'OVERDUE'; label: string; count?: number }[] = [
    { key: 'MY', label: 'My Tasks' },
    { key: 'SUBMITTED', label: 'Submitted' },
    { key: 'OVERDUE', label: 'Overdue' },
  ];

  taskColumns: TableColumn[] = [
    { key: 'complianceName', header: 'Compliance', sortable: true },
    { key: 'branchName', header: 'Branch', sortable: true },
    { key: 'dueDate', header: 'Due Date', width: '120px', sortable: true },
    { key: 'status', header: 'Status', width: '120px' },
    { key: 'evidence', header: 'Evidence', width: '240px' },
    { key: 'actions', header: 'Actions', width: '180px', align: 'right' },
  ];

  statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'OVERDUE', label: 'Overdue' },
  ];

  yearOptions = (() => {
    const current = new Date().getFullYear();
    return [
      { value: '', label: 'All Years' },
      { value: String(current - 1), label: String(current - 1) },
      { value: String(current), label: String(current) },
      { value: String(current + 1), label: String(current + 1) },
    ];
  })();

  monthOptions = [
    { value: '', label: 'All Months' },
    ...Array.from({ length: 12 }, (_, i) => ({
      value: String(i + 1),
      label: new Date(2000, i).toLocaleString('en', { month: 'long' }),
    })),
  ];

  constructor(
    private compliance: ComplianceService,
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
    this.compliance
      .contractorListTasks(this.filters)
      .pipe(
        takeUntil(this.destroy$),
        timeout(10000),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.loading = false;
          const rawTasks = res?.data || [];
          this.allTasks = rawTasks.map((t: any) => ({
            ...t,
            complianceName: t.compliance?.complianceName || t.complianceId,
            branchName: t.branch?.branchName || t.branchId || '-',
          }));
          this.updateTabCounts();
          this.applySearch();
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.allTasks = [];
          this.tasks = [];
          this.cdr.detectChanges();
        },
      });
  }

  setTab(tab: 'MY' | 'SUBMITTED' | 'OVERDUE'): void {
    this.viewTab = tab;
    if (tab === 'MY') {
      this.filters.status = '';
    } else if (tab === 'SUBMITTED') {
      this.filters.status = 'SUBMITTED';
    } else {
      this.filters.status = 'OVERDUE';
    }
    this.load();
  }

  start(id: string | number) {
    this.compliance.contractorStart(String(id)).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.cdr.detectChanges();
        this.load();
      },
      error: (e) => {
        this.toast.error(e?.error?.message || 'Failed to start task');
        this.cdr.detectChanges();
      },
    });
  }

  submit(id: string | number) {
    this.compliance.contractorSubmit(String(id)).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.cdr.detectChanges();
        this.load();
      },
      error: (e) => {
        this.toast.error(e?.error?.message || 'Submit failed');
        this.cdr.detectChanges();
      },
    });
  }

  pickFile(evt: any, taskId: string | number) {
    const f = evt?.target?.files?.[0];
    if (!f) return;
    this.uploadFile = f;
    this.selectedId = String(taskId);
  }

  upload(taskId: string | number) {
    if (!this.uploadFile) return;
    this.compliance.contractorUploadEvidence(String(taskId), this.uploadFile).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.uploadFile = undefined;
        this.selectedId = undefined;
        this.cdr.detectChanges();
        this.load();
      },
      error: (e) => {
        this.toast.error(e?.error?.message || 'Upload failed');
        this.cdr.detectChanges();
      },
    });
  }

  private updateTabCounts(): void {
    const submitted = this.allTasks.filter((t: any) => t.status === 'SUBMITTED').length;
    const overdue = this.allTasks.filter((t: any) => t.status === 'OVERDUE').length;
    this.tabItems = [
      { key: 'MY', label: 'My Tasks', count: this.allTasks.length },
      { key: 'SUBMITTED', label: 'Submitted', count: submitted },
      { key: 'OVERDUE', label: 'Overdue', count: overdue },
    ];
  }

  applySearch(): void {
    const term = this.searchTerm.toLowerCase();
    if (!term) {
      this.tasks = [...this.allTasks];
    } else {
      this.tasks = this.allTasks.filter(t =>
        (t.complianceName || '').toLowerCase().includes(term) ||
        (t.branchName || '').toLowerCase().includes(term)
      );
    }
  }

  exportCsv(): void {
    ReportsService.exportCsv(this.tasks, [
      { key: 'complianceName', label: 'Compliance' },
      { key: 'branchName', label: 'Branch' },
      { key: 'status', label: 'Status' },
      { key: 'dueDate', label: 'Due Date' },
    ], 'contractor-compliance.csv');
  }
}
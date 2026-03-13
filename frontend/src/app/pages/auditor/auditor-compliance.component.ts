import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { ComplianceService } from '../../core/compliance.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  PageHeaderComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
  ActionButtonComponent,
  FormInputComponent,
  FormSelectComponent,
  EmptyStateComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-auditor-compliance',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    ActionButtonComponent,
    FormInputComponent,
    FormSelectComponent,
    EmptyStateComponent,
  ],
  templateUrl: './auditor-compliance.component.html',
  styleUrls: ['./auditor-compliance.component.scss'],
})
export class AuditorComplianceComponent implements OnInit, OnDestroy {
  tasks: any[] = [];
  filters: any = {
    clientId: '',
    branchId: '',
    status: '',
    year: '',
    month: '',
  };
  selectedTask: any = null;
  detail: any = null;
  sharing = false;
  loading = true;

  private destroy$ = new Subject<void>();

  // Reference data
  clients: Array<{ id: string; name: string }> = [];
  branches: Array<{ id: string; name: string }> = [];
  clientNameMap: Record<string, string> = {};

  // Cached filter options — updated when clients/branches change (getters create new arrays every CD cycle → NG0103)
  clientFilterOptions: Array<{ value: any; label: string }> = [{ value: '', label: 'All Clients' }];
  branchFilterOptions: Array<{ value: any; label: string }> = [{ value: '', label: 'All Branches' }];

  private rebuildClientFilterOptions(): void {
    this.clientFilterOptions = [{ value: '', label: 'All Clients' }, ...this.clients.map(c => ({ value: c.id, label: c.name }))];
  }
  private rebuildBranchFilterOptions(): void {
    this.branchFilterOptions = [{ value: '', label: 'All Branches' }, ...this.branches.map(b => ({ value: b.id, label: b.name }))];
  }

  // Static options — must NOT be inline arrays in template (new refs every CD cycle → NG0103)
  readonly statusFilterOptions = [
    { value: '', label: 'All Status' },
    { value: 'PENDING', label: 'PENDING' },
    { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
    { value: 'SUBMITTED', label: 'SUBMITTED' },
    { value: 'APPROVED', label: 'APPROVED' },
    { value: 'REJECTED', label: 'REJECTED' },
    { value: 'OVERDUE', label: 'OVERDUE' },
  ];

  // Table column definitions
  taskColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client' },
    { key: 'compliance', header: 'Compliance' },
    { key: 'branch', header: 'Branch' },
    { key: 'dueDate', header: 'Due' },
    { key: 'status', header: 'Status' },
    { key: 'contractor', header: 'Contractor' },
    { key: 'actions', header: 'Action', align: 'right' as const },
  ];

  constructor(
    private compliance: ComplianceService,
    private route: ActivatedRoute,
    private router: Router,
    private toast: ToastService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private dialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.loadClients();
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const clientId = params.get('clientId') || '';
      const year = params.get('year') || '';
      const month = params.get('month') || '';

      if (clientId || year || month) {
        this.filters.clientId = clientId;
        this.filters.year = year;
        this.filters.month = month;
      }

      this.load();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClients(): void {
    this.http.get<any[]>('/api/v1/auditor/clients/assigned').pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.clients = (data || []).map((c: any) => ({ id: c.id, name: c.clientName || c.name || 'Unknown' }));
        this.clientNameMap = {};
        this.clients.forEach(c => this.clientNameMap[c.id] = c.name);
        this.rebuildClientFilterOptions();
        this.cdr.markForCheck();
      },
      error: () => { this.clients = []; this.rebuildClientFilterOptions(); this.cdr.markForCheck(); },
    });
  }

  onClientChange(): void {
    this.filters.branchId = '';
    this.branches = [];
    this.rebuildBranchFilterOptions();
    if (this.filters.clientId) {
      this.http.get<any[]>(`/api/v1/auditor/clients/${this.filters.clientId}/branches`).pipe(takeUntil(this.destroy$)).subscribe({
        next: (data) => {
          this.branches = (data || []).map((b: any) => ({ id: b.id, name: b.branchName || 'Unknown' }));
          this.rebuildBranchFilterOptions();
          this.cdr.markForCheck();
        },
        error: () => { this.branches = []; this.rebuildBranchFilterOptions(); this.cdr.markForCheck(); },
      });
    }
  }

  load(): void {
    this.loading = true;
    this.compliance.auditorListTasks(this.filters).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res) => {
        this.loading = false;
        this.tasks = (res?.data || []).map((t: any) => ({
          ...t,
          clientName: t.client?.clientName || this.clientNameMap[t.clientId] || 'Unknown',
        }));
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.tasks = [];
        this.cdr.markForCheck();
      },
    });
  }

  open(task: any): void {
    this.selectedTask = task;
    this.compliance.auditorTaskDetail(task.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => { this.detail = res; this.cdr.markForCheck(); },
      error: () => { this.detail = null; this.cdr.markForCheck(); },
    });
  }

  async shareReport(): Promise<void> {
    if (!this.selectedTask || this.sharing) return;
    const result = await this.dialog.prompt('Audit Report', 'Audit report / findings (required)', { placeholder: 'Report findings' });
    if (!result.confirmed || !result.value?.trim()) return;
    const notes = result.value.trim();
    this.sharing = true;
    this.compliance.auditorShareReport(this.selectedTask.id, notes.trim()).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.sharing = false;
        this.toast.success('Audit report sent to CRM');
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.sharing = false;
        this.toast.error(e?.error?.message || 'Failed to send report');
        this.cdr.markForCheck();
      },
    });
  }

  clearFilters(): void {
    this.filters = {
      clientId: '',
      branchId: '',
      status: '',
      year: '',
      month: '',
    };
    this.router.navigate([], { queryParams: {} });
    this.load();
  }
}

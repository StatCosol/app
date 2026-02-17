import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { finalize, timeout } from 'rxjs/operators';
import { ComplianceService } from '../../core/compliance.service';
import { ToastService } from '../../shared/toast/toast.service';
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
export class AuditorComplianceComponent {
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
  loading = false;

  // Reference data
  clients: Array<{ id: string; name: string }> = [];
  branches: Array<{ id: string; name: string }> = [];
  clientNameMap: Record<string, string> = {};

  get clientFilterOptions() {
    return [{ value: '', label: 'All Clients' }, ...this.clients.map(c => ({ value: c.id, label: c.name }))];
  }
  get branchFilterOptions() {
    return [{ value: '', label: 'All Branches' }, ...this.branches.map(b => ({ value: b.id, label: b.name }))];
  }

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
  ) {}

  ngOnInit(): void {
    this.loadClients();
    this.route.queryParamMap.subscribe((params) => {
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

  loadClients(): void {
    this.http.get<any[]>('/api/auditor/clients/assigned').subscribe({
      next: (data) => {
        this.clients = (data || []).map((c: any) => ({ id: c.id, name: c.clientName || c.name || 'Unknown' }));
        this.clientNameMap = {};
        this.clients.forEach(c => this.clientNameMap[c.id] = c.name);
        this.cdr.detectChanges();
      },
      error: () => { this.clients = []; this.cdr.detectChanges(); },
    });
  }

  onClientChange(): void {
    this.filters.branchId = '';
    this.branches = [];
    if (this.filters.clientId) {
      this.http.get<any[]>(`/api/auditor/clients/${this.filters.clientId}/branches`).subscribe({
        next: (data) => {
          this.branches = (data || []).map((b: any) => ({ id: b.id, name: b.branchName || 'Unknown' }));
          this.cdr.detectChanges();
        },
        error: () => { this.branches = []; this.cdr.detectChanges(); },
      });
    }
  }

  load(): void {
    this.loading = true;
    this.compliance.auditorListTasks(this.filters).pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.tasks = (res?.data || []).map((t: any) => ({
          ...t,
          clientName: t.client?.clientName || this.clientNameMap[t.clientId] || 'Unknown',
        }));
        this.cdr.detectChanges();
      },
      error: () => {
        this.tasks = [];
        this.cdr.detectChanges();
      },
    });
  }

  open(task: any): void {
    this.selectedTask = task;
    this.compliance.auditorTaskDetail(task.id).subscribe({
      next: (res) => { this.detail = res; this.cdr.detectChanges(); },
      error: () => { this.detail = null; this.cdr.detectChanges(); },
    });
  }

  shareReport(): void {
    if (!this.selectedTask || this.sharing) return;
    const notes = prompt('Audit report / findings (required)') || '';
    if (!notes.trim()) return;
    this.sharing = true;
    this.compliance.auditorShareReport(this.selectedTask.id, notes.trim()).subscribe({
      next: () => {
        this.sharing = false;
        this.toast.success('Audit report sent to CRM');
        this.cdr.detectChanges();
      },
      error: (e) => {
        this.sharing = false;
        this.toast.error(e?.error?.message || 'Failed to send report');
        this.cdr.detectChanges();
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

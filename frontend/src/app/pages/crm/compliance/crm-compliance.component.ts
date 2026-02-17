import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef } from '@angular/core';
import { catchError, finalize, of } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ComplianceService } from '../../../core/compliance.service';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  selector: 'app-crm-compliance',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  templateUrl: './crm-compliance.component.html',
  styleUrls: ['./crm-compliance.component.scss'],
})
export class CrmComplianceComponent {
  tasks: any[] = [];
  clients: any[] = [];
  branches: any[] = [];
  loading = false;
  errorMsg: string | null = null;
  filters: any = {
    clientId: '',
    branchId: '',
    status: '',
    year: '',
    month: '',
  };
  selectedTask: any = null;
  detail: any = null;
  actionInProgress = false;

  constructor(
    private compliance: ComplianceService,
    private cdr: ChangeDetectorRef,
    private crmClientsApi: CrmClientsApi
  ) {}

  ngOnInit(): void {
    this.loadClients();
    this.load();
  }

  loadClients(): void {
    this.crmClientsApi.getAssignedClients().subscribe({
      next: (data) => {
        this.clients = data || [];
      },
      error: (err) => console.error('Failed to load clients', err),
    });
  }

  onClientChange(): void {
    this.filters.branchId = '';
    this.branches = [];
    if (this.filters.clientId) {
      this.crmClientsApi.getBranchesForClient(this.filters.clientId).subscribe({
        next: (data) => {
          this.branches = data || [];
        },
        error: (err) => console.error('Failed to load branches', err),
      });
    }
  }

  load(): void {
    this.loading = true;
    this.errorMsg = null;
    this.compliance.crmListTasks(this.filters)
      .pipe(
        catchError((err) => {
          console.error(err);
          this.errorMsg = err?.error?.message || 'Failed to load tasks';
          return of({ data: [] });
        }),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe((res: any) => {
        this.tasks = res?.data || [];
      });
  }

  open(task: any): void {
    this.selectedTask = task;
    this.compliance.crmTaskDetail(task.id).subscribe({
      next: (res) => (this.detail = res),
      error: () => (this.detail = null),
    });
  }

  approve(): void {
    if (this.actionInProgress) return;
    const remarks = prompt('Remarks (optional)') || '';
    this.actionInProgress = true;
    this.compliance.crmApprove(this.selectedTask.id, remarks).subscribe({
      next: () => {
        this.actionInProgress = false;
        this.load();
        this.open(this.selectedTask);
      },
      error: () => { this.actionInProgress = false; },
    });
  }

  reject(): void {
    if (this.actionInProgress) return;
    const remarks = prompt('Reason (required)') || '';
    if (!remarks.trim()) return;
    this.actionInProgress = true;
    this.compliance
      .crmReject(this.selectedTask.id, remarks.trim())
      .subscribe({
        next: () => {
          this.actionInProgress = false;
          this.load();
          this.open(this.selectedTask);
        },
        error: () => { this.actionInProgress = false; },
      });
  }
}

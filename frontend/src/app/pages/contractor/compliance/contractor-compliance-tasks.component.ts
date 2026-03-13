import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { DataTableComponent, TableCellDirective, TableColumn } from '../../../shared/ui';

@Component({
  selector: 'app-contractor-compliance-tasks',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DataTableComponent, TableCellDirective],
  templateUrl: './contractor-compliance-tasks.component.html',
})
export class ContractorComplianceTasksComponent implements OnInit {
  loading = false;
  tasks: any[] = [];

  readonly columns: TableColumn[] = [
    { key: 'task', header: 'Task' },
    { key: 'due', header: 'Due' },
    { key: 'status', header: 'Status' },
    { key: 'action', header: 'Action' },
  ];

  status = '';
  q = '';

  constructor(private api: ComplianceApiService, private toast: ToastService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.api.contractorGetTasks({
      status: this.status || undefined,
      q: this.q || undefined,
    }).subscribe({
      next: (res: any) => {
        this.tasks = Array.isArray(res) ? res : (res?.items || res?.data || []);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.error('Failed to load contractor tasks.');
      },
    });
  }

  /* ═══════ Defensive camelCase / snake_case helpers ═══════ */

  private pick<T = any>(row: any, ...keys: string[]): T | undefined {
    for (const k of keys) {
      if (row && row[k] !== undefined && row[k] !== null) return row[k];
    }
    return undefined;
  }

  id(row: any): string {
    return this.pick(row, 'id', 'taskId', 'task_id') || '';
  }

  taskName(row: any): string {
    return this.pick(row, 'taskName', 'task_name', 'name', 'complianceName', 'compliance_name') || '-';
  }

  statusText(row: any): string {
    return this.pick(row, 'status') || '-';
  }

  due(row: any): string {
    return this.pick(row, 'dueDate', 'due_date') || '-';
  }
}

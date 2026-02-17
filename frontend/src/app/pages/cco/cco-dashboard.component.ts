import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { timeout, finalize } from 'rxjs/operators';
import { CcoDashboardService } from '../../core/cco-dashboard.service';
import {
  PageHeaderComponent, StatCardComponent, ActionButtonComponent, StatusBadgeComponent,
  DataTableComponent, TableCellDirective, TableColumn, LoadingSpinnerComponent,
} from '../../shared/ui';

interface CcoDashboardData {
  pendingApprovals: number;
  totalCrms: number;
  overdueTasks: number;
  escalations: number;
  topOverdue: Array<{ client: string; branch: string; count: number }>;
  crmsMostOverdue: Array<{ crm: string; overdue: number }>;
}

@Component({
  selector: 'app-cco-dashboard',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, StatCardComponent, ActionButtonComponent, StatusBadgeComponent, DataTableComponent, TableCellDirective, LoadingSpinnerComponent],
  templateUrl: './cco-dashboard.component.html',
})
export class CcoDashboardComponent implements OnInit {
  data: CcoDashboardData = {
    pendingApprovals: 0,
    totalCrms: 0,
    overdueTasks: 0,
    escalations: 0,
    topOverdue: [],
    crmsMostOverdue: [],
  };

  loading = true;

  overdueColumns: TableColumn[] = [
    { key: 'client', header: 'Client' },
    { key: 'branch', header: 'Branch' },
    { key: 'count', header: 'Overdue', align: 'right' },
  ];

  crmOverdueColumns: TableColumn[] = [
    { key: 'crm', header: 'CRM' },
    { key: 'overdue', header: 'Overdue Count', align: 'right' },
  ];

  constructor(private dash: CcoDashboardService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    this.dash.getDashboard().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.data = res || this.data;
        this.cdr.detectChanges();
      },
      error: () => { this.cdr.detectChanges(); },
    });
  }
}

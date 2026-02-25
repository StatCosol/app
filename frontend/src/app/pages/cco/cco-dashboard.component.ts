import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { timeout, finalize, takeUntil } from 'rxjs/operators';
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
export class CcoDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  data: CcoDashboardData = {
    pendingApprovals: 0,
    totalCrms: 0,
    overdueTasks: 0,
    escalations: 0,
    topOverdue: [],
    crmsMostOverdue: [],
  };

  loading = true;
  errorMsg = '';

  overdueColumns: TableColumn[] = [
    { key: 'client', header: 'Client' },
    { key: 'branch', header: 'Branch' },
    { key: 'count', header: 'Overdue', align: 'right' },
  ];

  crmOverdueColumns: TableColumn[] = [
    { key: 'crm', header: 'CRM' },
    { key: 'overdue', header: 'Overdue Count', align: 'right' },
  ];

  constructor(private dash: CcoDashboardService, private cdr: ChangeDetectorRef, private router: Router) {}

  ngOnInit(): void {
    this.loading = true;
    this.dash.getDashboard().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.loading = false;
        this.data = res || this.data;
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.errorMsg = 'Failed to load dashboard. Please try again.'; this.cdr.detectChanges(); },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  reload(): void {
    this.errorMsg = '';
    this.ngOnInit();
  }

  goToApprovals(): void {
    this.router.navigate(['/cco/approvals']);
  }

  goToOverdueList(): void {
    this.router.navigate(['/cco/overdue']);
  }
}

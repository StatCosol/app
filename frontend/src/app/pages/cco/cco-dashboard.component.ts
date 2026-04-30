import { Component, OnInit, OnDestroy, ChangeDetectorRef , ChangeDetectionStrategy} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { timeout, finalize, takeUntil, catchError } from 'rxjs/operators';
import { CcoDashboardService } from '../../core/cco-dashboard.service';
import { ReportsService } from '../../core/reports.service';
import {
  PageHeaderComponent, ActionButtonComponent, StatusBadgeComponent,
  DataTableComponent, TableCellDirective, TableColumn, LoadingSpinnerComponent,
  EmptyStateComponent,
} from '../../shared/ui';

interface CcoDashboardData {
  pendingApprovals: number;
  totalCrms: number;
  overdueTasks: number;
  escalations: number;
  topOverdue: Array<{ client: string; branch: string; count: number }>;
  crmsMostOverdue: Array<{ crm: string; overdue: number }>;
}

interface CrmInfo {
  name: string;
  email: string;
  status: string;
  clientCount: number;
  overdueCount: number;
  lastLogin: string;
}

interface OversightItem {
  id: string;
  client: string;
  branch: string;
  dueDate: string;
  status: string;
  escalatedAt: string;
}

@Component({
  selector: 'app-cco-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, PageHeaderComponent, ActionButtonComponent, StatusBadgeComponent,
    DataTableComponent, TableCellDirective, LoadingSpinnerComponent, EmptyStateComponent,
  ],
  templateUrl: './cco-dashboard.component.html',
  styleUrls: ['./cco-dashboard.component.scss'],
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

  crms: CrmInfo[] = [];
  filteredCrms: CrmInfo[] = [];
  oversight: OversightItem[] = [];
  filteredOversight: OversightItem[] = [];
  loading = true;
  errorMsg = '';
  searchTerm = '';

  overdueColumns: TableColumn[] = [
    { key: 'client', header: 'Client' },
    { key: 'branch', header: 'Branch' },
    { key: 'count', header: 'Overdue', align: 'right' },
  ];

  crmOverdueColumns: TableColumn[] = [
    { key: 'crm', header: 'CRM' },
    { key: 'overdue', header: 'Overdue Count', align: 'right' },
  ];

  crmColumns: TableColumn[] = [
    { key: 'name', header: 'CRM Name', sortable: true },
    { key: 'status', header: 'Status', align: 'center' },
    { key: 'clientCount', header: 'Clients', align: 'center' },
    { key: 'overdueCount', header: 'Overdue', align: 'center' },
    { key: 'lastLogin', header: 'Last Login' },
  ];

  oversightColumns: TableColumn[] = [
    { key: 'client', header: 'Client', sortable: true },
    { key: 'branch', header: 'Branch' },
    { key: 'dueDate', header: 'Due Date' },
    { key: 'status', header: 'Status', align: 'center' },
  ];

  constructor(private dash: CcoDashboardService, private cdr: ChangeDetectorRef, private router: Router) {}

  ngOnInit(): void {
    this.loading = true;
    this.errorMsg = '';

    forkJoin({
      dashboard: this.dash.getDashboard().pipe(catchError(() => of(this.data))),
      crms: this.dash.getCrmsUnderMe().pipe(catchError(() => of([]))),
      oversight: this.dash.getOversight().pipe(catchError(() => of([]))),
    }).pipe(
      takeUntil(this.destroy$),
      timeout(15000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: ({ dashboard, crms, oversight }) => {
        this.loading = false;
        this.data = dashboard || this.data;
        this.crms = crms || [];
        this.oversight = (oversight || []).slice(0, 10);
        this.filteredCrms = [...this.crms];
        this.filteredOversight = [...this.oversight];
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.errorMsg = 'Failed to load dashboard. Please try again.';
        this.cdr.detectChanges();
      },
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
    this.router.navigate(['/cco/oversight']);
  }

  goToCrms(): void {
    this.router.navigate(['/cco/crms-under-me']);
  }

  applySearch(): void {
    const term = this.searchTerm.toLowerCase();
    if (!term) {
      this.filteredCrms = [...this.crms];
      this.filteredOversight = [...this.oversight];
    } else {
      this.filteredCrms = this.crms.filter(c =>
        c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term)
      );
      this.filteredOversight = this.oversight.filter(o =>
        o.client.toLowerCase().includes(term) || o.branch.toLowerCase().includes(term)
      );
    }
  }

  exportCsv(): void {
    ReportsService.exportCsv(this.oversight, [
      { key: 'client', label: 'Client' },
      { key: 'branch', label: 'Branch' },
      { key: 'dueDate', label: 'Due Date' },
      { key: 'status', label: 'Status' },
      { key: 'escalatedAt', label: 'Escalated At' },
    ], 'cco-dashboard-oversight.csv');
  }
}
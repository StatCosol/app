import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, of, Subject } from 'rxjs';
import { timeout, finalize, catchError, takeUntil } from 'rxjs/operators';
import { PayrollApiService, PayrollSummary, PayrollClient } from './payroll-api.service';
import { PayrollRunsService, PayrollRunSummary } from './payroll-runs.service';
import {
  PageHeaderComponent,
  EmptyStateComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
  StatusBadgeComponent,
  ActionButtonComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-payroll-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    PageHeaderComponent,
    EmptyStateComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    ActionButtonComponent,
  ],
  templateUrl: './payroll-dashboard.component.html',
  styleUrls: ['./payroll-dashboard.component.scss'],
})
export class PayrollDashboardComponent implements OnInit, OnDestroy {
  summary: PayrollSummary | null = null;
  clients: PayrollClient[] = [];
  recentRuns: PayrollRunSummary[] = [];
  error = '';
  loading = false;
  private readonly destroy$ = new Subject<void>();

  runColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'period', header: 'Period', sortable: true, width: '120px' },
    { key: 'employeeCount', header: 'Employees', sortable: true, width: '110px', align: 'center' },
    { key: 'status', header: 'Status', sortable: true, width: '130px', align: 'center' },
    { key: 'actions', header: '', sortable: false, width: '100px', align: 'center' },
  ];

  // KPI tiles definition
  get kpiTiles() {
    const s = this.summary;
    return [
      { label: 'Assigned Clients', value: s?.assignedClients ?? this.clients.length, icon: 'clients', color: 'blue', route: '/payroll/clients' },
      { label: 'Total Employees', value: s?.totalEmployees ?? 0, icon: 'employees', color: 'indigo', route: '/payroll/employees' },
      { label: 'Active Employees', value: s?.activeEmployees ?? 0, icon: 'active', color: 'green', route: '/payroll/employees' },
      { label: 'Joiners (Month)', value: s?.joinersThisMonth ?? 0, icon: 'joiners', color: 'emerald', route: '/payroll/employees' },
      { label: 'Leavers (Month)', value: s?.leaversThisMonth ?? 0, icon: 'leavers', color: 'red', route: '/payroll/employees' },
      { label: 'Exited', value: s?.exitedEmployees ?? 0, icon: 'exited', color: 'gray', route: '/payroll/employees' },
      { label: 'Active Runs', value: this.activeRunsCount, icon: 'runs', color: 'amber', route: '/payroll/runs' },
      { label: 'Pending Runs', value: s?.pendingRuns ?? 0, icon: 'pending', color: 'orange', route: '/payroll/runs' },
      { label: 'Completed', value: s?.completedThisMonth ?? 0, icon: 'completed', color: 'green', route: '/payroll/runs', detail: 'This month' },
      { label: 'PF Pending', value: s?.pfPending ?? 0, icon: 'pf', color: 'rose', route: '/payroll/pf-esi' },
      { label: 'ESI Pending', value: s?.esiPending ?? 0, icon: 'esi', color: 'pink', route: '/payroll/pf-esi' },
      { label: 'Registers', value: 'View', icon: 'registers', color: 'blue', route: '/payroll/registers' },
    ];
  }

  get activeRunsCount(): number {
    return this.recentRuns.filter(r => r.status === 'PROCESSING' || r.status === 'DRAFT').length;
  }

  constructor(
    private payrollApi: PayrollApiService,
    private runsService: PayrollRunsService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.cdr.detectChanges();

    forkJoin({
      summary: this.payrollApi.getSummary().pipe(timeout(10000), catchError(() => of({
        assignedClients: 0, totalEmployees: 0, activeEmployees: 0, exitedEmployees: 0,
        pendingRuns: 0, completedThisMonth: 0, totalRuns: 0, pfPending: 0, esiPending: 0,
        joinersThisMonth: 0, leaversThisMonth: 0,
      } as PayrollSummary))),
      clients: this.payrollApi.getAssignedClients().pipe(timeout(10000), catchError(() => of([] as PayrollClient[]))),
      runs: this.runsService.listRuns({}).pipe(timeout(10000), catchError(() => of([] as PayrollRunSummary[]))),
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.loading = false;
        this.summary = res.summary;
        this.clients = res.clients;
        this.recentRuns = (res.runs || []).slice(0, 10);
        this.cdr.detectChanges();
      },
      error: (e) => {
        this.loading = false;
        this.error = e?.status === 403
          ? 'Payroll APIs are not yet enabled for your role.'
          : `Unable to load payroll data. ${e?.error?.message || e?.message || ''}`;
        this.cdr.detectChanges();
      },
    });
  }

  formatPeriod(row: PayrollRunSummary): string {
    const m = String(row.periodMonth ?? 0).padStart(2, '0');
    return `${m}/${row.periodYear}`;
  }

  openRun(row: PayrollRunSummary): void {
    this.router.navigate(['/payroll/runs'], { queryParams: { runId: row.id } });
  }

  goTo(route: string): void {
    this.router.navigateByUrl(route);
  }

  getKpiIconColor(color: string): string {
    const map: Record<string, string> = {
      blue: '#3b82f6', indigo: '#6366f1', green: '#10b981', emerald: '#059669',
      red: '#ef4444', gray: '#64748b', amber: '#f59e0b', orange: '#f97316',
      rose: '#f43f5e', pink: '#ec4899',
    };
    return map[color] || '#64748b';
  }

  getKpiBgColor(color: string): string {
    const map: Record<string, string> = {
      blue: '#dbeafe', indigo: '#e0e7ff', green: '#d1fae5', emerald: '#d1fae5',
      red: '#fee2e2', gray: '#f1f5f9', amber: '#fef3c7', orange: '#ffedd5',
      rose: '#ffe4e6', pink: '#fce7f3',
    };
    return map[color] || '#f1f5f9';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

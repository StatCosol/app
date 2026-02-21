import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { timeout, finalize, catchError } from 'rxjs/operators';
import { PayrollApiService, PayrollSummary, PayrollClient } from './payroll-api.service';
import { PayrollRunsService, PayrollRunSummary } from './payroll-runs.service';
import {
  PageHeaderComponent,
  StatCardComponent,
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
    StatCardComponent,
    EmptyStateComponent,
    DataTableComponent,
    TableCellDirective,
    StatusBadgeComponent,
    ActionButtonComponent,
  ],
  templateUrl: './payroll-dashboard.component.html',
  styleUrls: ['./payroll-dashboard.component.scss'],
})
export class PayrollDashboardComponent implements OnInit {
  summary: PayrollSummary | null = null;
  clients: PayrollClient[] = [];
  recentRuns: PayrollRunSummary[] = [];
  error = '';
  loading = true;

  runColumns: TableColumn[] = [
    { key: 'clientName', header: 'Client', sortable: true },
    { key: 'period', header: 'Period', sortable: true, width: '120px' },
    { key: 'employeeCount', header: 'Employees', sortable: true, width: '110px', align: 'center' },
    { key: 'status', header: 'Status', sortable: true, width: '130px', align: 'center' },
    { key: 'actions', header: '', sortable: false, width: '100px', align: 'center' },
  ];

  get activeRunsCount(): number {
    return this.recentRuns.filter(r => r.status === 'PROCESSING' || r.status === 'DRAFT').length;
  }

  get totalEmployees(): number {
    return this.recentRuns.reduce((sum, r) => sum + (r.employeeCount ?? 0), 0);
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
      summary: this.payrollApi.getSummary().pipe(timeout(10000), catchError(() => of({ assignedClients: 0, pendingRuns: 0, completedThisMonth: 0 } as PayrollSummary))),
      clients: this.payrollApi.getAssignedClients().pipe(timeout(10000), catchError(() => of([] as PayrollClient[]))),
      runs: this.runsService.listRuns({}).pipe(timeout(10000), catchError(() => of([] as PayrollRunSummary[]))),
    }).pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.summary = res.summary;
        this.clients = res.clients;
        this.recentRuns = (res.runs || []).slice(0, 10);
        this.cdr.detectChanges();
      },
      error: (e) => {
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
}

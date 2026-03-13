import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, Observable, of, Subject } from 'rxjs';
import { timeout, catchError, finalize, takeUntil } from 'rxjs/operators';
import { ReportsService } from '../../core/reports.service';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { CrmClientsApi } from '../../core/api/crm-clients.api';
import { PageHeaderComponent, LoadingSpinnerComponent, StatusBadgeComponent, ActionButtonComponent } from '../../shared/ui';

@Component({
  selector: 'app-crm-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, StatusBadgeComponent, ActionButtonComponent],
  templateUrl: './crm-reports.component.html',
  styleUrls: ['./crm-reports.component.scss'],
})
export class CrmReportsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  filters = {
    clientId: '',
    branchId: '',
    from: '',
    to: '',
    status: '',
  };

  statusOptions: string[] = [
    'PENDING',
    'IN_PROGRESS',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'OVERDUE',
  ];

  clients: any[] = [];
  branches: any[] = [];
  loading = true;
  summary: any | null = null;
  overdue: any[] = [];
  contractorPerf: any[] = [];
  error: string | null = null;

  constructor(private reports: ReportsService, private auth: AuthService, private crmClientsApi: CrmClientsApi, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadClients();
    this.load();
  }

  loadClients(): void {
    this.crmClientsApi.getAssignedClients().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.clients = data || [];
        this.cdr.detectChanges();
      },
      error: () => { this.cdr.detectChanges(); },
    });
  }

  onClientChange(): void {
    this.filters.branchId = '';
    this.branches = [];
    if (this.filters.clientId) {
      this.crmClientsApi.getBranchesForClient(this.filters.clientId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (data) => {
          this.branches = data || [];
          this.cdr.detectChanges();
        },
        error: () => { this.cdr.detectChanges(); },
      });
    }
  }

  apply(): void {
    this.load();
  }

  reset(): void {
    this.filters = {
      clientId: '',
      branchId: '',
      from: '',
      to: '',
      status: '',
    };
    this.load();
  }

  get summaryEntries(): { key: string; value: number }[] {
    const src = (this.summary && this.summary.byStatus) || {};
    return Object.keys(src).map((k) => ({ key: k, value: (src as any)[k] }));
  }

  downloadOverdueExcel(): void {
    const params = new URLSearchParams();
    if (this.filters.clientId) params.set('clientId', this.filters.clientId);
    if (this.filters.branchId) params.set('branchId', this.filters.branchId);
    if (this.filters.from) params.set('from', this.filters.from);
    if (this.filters.to) params.set('to', this.filters.to);
    if (this.filters.status) params.set('status', this.filters.status);

    const url = `${environment.apiBaseUrl}/api/v1/reports/overdue/export?${params.toString()}`;
    window.open(this.auth.authenticateUrl(url), '_blank');
  }

  private load(): void {
    this.loading = true;
    this.error = null;

    const params: any = {
      clientId: this.filters.clientId || undefined,
      branchId: this.filters.branchId || undefined,
      from: this.filters.from || undefined,
      to: this.filters.to || undefined,
      status: this.filters.status || undefined,
    };

    const guard = <T>(obs: Observable<T>, fallback: T): Observable<T> =>
      obs.pipe(timeout(10000), catchError(() => of(fallback)));

    forkJoin({
      summary: guard(this.reports.summary(params), null as any),
      overdue: guard(this.reports.overdue(params), []),
      contractorPerf: guard(this.reports.contractorPerf(params), []),
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.loading = false;
        this.summary = res.summary;
        this.overdue = res.overdue || [];
        this.contractorPerf = res.contractorPerf || [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.error = 'Unable to load reports. Please try again.';
        this.summary = null;
        this.overdue = [];
        this.contractorPerf = [];
        this.cdr.detectChanges();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

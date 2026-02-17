import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { timeout, finalize } from 'rxjs/operators';
import { PayrollApiService, PayrollSummary } from './payroll-api.service';
import { PageHeaderComponent, StatCardComponent, LoadingSpinnerComponent, EmptyStateComponent } from '../../shared/ui';

@Component({
  selector: 'app-payroll-dashboard',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, StatCardComponent, LoadingSpinnerComponent, EmptyStateComponent],
  templateUrl: './payroll-dashboard.component.html',
})
export class PayrollDashboardComponent implements OnInit {
  summary: PayrollSummary | null = null;
  error = '';
  loading = true;

  constructor(
    private payrollApi: PayrollApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('PayrollDashboard ngOnInit - loading summary');
    this.loading = true;
    this.cdr.detectChanges();
    this.payrollApi.getSummary().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (s) => {
        console.log('PayrollDashboard summary loaded:', s);
        this.summary = s;
      },
      error: (e) => {
        console.error('PayrollDashboard error:', e);
        this.error = e?.status === 403 ? 'Payroll APIs are not yet enabled for PAYROLL role.' : `Unable to load payroll summary. ${e?.error?.message || e?.message || ''}`;
      },
    });
  }
}

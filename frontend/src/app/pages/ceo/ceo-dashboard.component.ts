import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, timeout, finalize } from 'rxjs/operators';
import { CeoDashboardService, CeoDashboardData } from './ceo-dashboard.service';
import {
  PageHeaderComponent, StatCardComponent, ActionButtonComponent, LoadingSpinnerComponent,
} from '../../shared/ui';

@Component({
  selector: 'app-ceo-dashboard',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, StatCardComponent, ActionButtonComponent, LoadingSpinnerComponent],
  templateUrl: './ceo-dashboard.component.html',
})
export class CeoDashboardComponent implements OnInit, OnDestroy {
  pendingApprovals: CeoDashboardData['pendingApprovals'] = 0;
  escalations: CeoDashboardData['escalations'] = 0;
  compliancePending: CeoDashboardData['compliancePending'] = 0;
  overdue: CeoDashboardData['overdue'] = 0;
  loading = true;
  errorMsg: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(private dashboardService: CeoDashboardService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loading = true;
    this.errorMsg = null;
    this.dashboardService.getDashboardData().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        this.loading = false;
        this.pendingApprovals = data.pendingApprovals;
        this.escalations = data.escalations;
        this.compliancePending = data.compliancePending;
        this.overdue = data.overdue;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err?.error?.message || 'Failed to load dashboard';
        this.cdr.detectChanges();
      },
    });
  }

  goToApprovals() {
    this.router.navigate(['/ceo/approvals']);
  }
  goToEscalations() {
    this.router.navigate(['/ceo/escalations']);
  }
}

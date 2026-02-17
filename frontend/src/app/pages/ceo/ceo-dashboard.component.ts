import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { timeout, finalize } from 'rxjs/operators';
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
export class CeoDashboardComponent implements OnInit {
  pendingApprovals: CeoDashboardData['pendingApprovals'] = 0;
  escalations: CeoDashboardData['escalations'] = 0;
  compliancePending: CeoDashboardData['compliancePending'] = 0;
  overdue: CeoDashboardData['overdue'] = 0;
  loading = true;
  errorMsg: string | null = null;

  constructor(private dashboardService: CeoDashboardService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loading = true;
    this.errorMsg = null;
    this.dashboardService.getDashboardData().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        this.pendingApprovals = data.pendingApprovals;
        this.escalations = data.escalations;
        this.compliancePending = data.compliancePending;
        this.overdue = data.overdue;
        this.cdr.detectChanges();
      },
      error: (err) => {
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

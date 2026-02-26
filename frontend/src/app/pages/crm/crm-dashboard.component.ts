import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DashboardService } from '../../core/dashboard.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  PageHeaderComponent,
  StatCardComponent,
  LoadingSpinnerComponent,
  StatusBadgeComponent,
} from '../../shared/ui';
import { Subject } from 'rxjs';
import { takeUntil, timeout, retry } from 'rxjs/operators';
import { CrmKpis, PriorityItem, RiskClient, UpcomingAudit } from './crm-dashboard.dto';
import { LowestBranchesComponent } from '../../shared/compliance/lowest-branches.component';
import { RiskRankingComponent } from '../../shared/compliance/risk-ranking.component';

@Component({
  selector: 'app-crm-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    StatCardComponent,
    LoadingSpinnerComponent,
    StatusBadgeComponent,
    LowestBranchesComponent,
    RiskRankingComponent,
  ],
  templateUrl: './crm-dashboard.component.html',
  styleUrls: ['./crm-dashboard.component.scss'],
})
export class CrmDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  errorMsg: string | null = null;

  /* ═══════ KPI Cards (Row 1) ═══════ */
  kpis: CrmKpis = {
    assignedClientsCount: 0,
    compliancePct: 0,
    pendingReviewCount: 0,
    reuploadRequiredCount: 0,
    overdueCount: 0,
    expiring30Count: 0,
    openObservationsCount: 0,
    mcdPendingCount: 0,
  };

  /* ═══════ Priority Today (Row 2) ═══════ */
  priorityItems: PriorityItem[] = [];
  priorityLoading = false;

  /* ═══════ Top Risk Clients (Row 3) ═══════ */
  riskClients: RiskClient[] = [];
  riskLoading = false;

  /* ═══════ Upcoming Audits (Row 4) ═══════ */
  upcomingAudits: UpcomingAudit[] = [];
  auditsLoading = false;
  auditDays = 15;

  constructor(
    private dashboardService: DashboardService,
    private toast: ToastService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loadKpis();
    this.loadPriorityToday();
    this.loadTopRiskClients();
    this.loadUpcomingAudits();
  }

  /* ─── KPIs ─── */
  loadKpis(): void {
    this.loading = true;
    this.errorMsg = null;
    this.dashboardService.getCrmKpis().pipe(
      takeUntil(this.destroy$), timeout(10000), retry(1),
    ).subscribe({
      next: (data) => { this.kpis = data; this.loading = false; this.cdr.detectChanges(); },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err?.error?.message || 'Failed to load KPIs';
        this.cdr.detectChanges();
      },
    });
  }

  /* ─── Priority Today ─── */
  loadPriorityToday(): void {
    this.priorityLoading = true;
    this.dashboardService.getCrmPriorityToday(20).pipe(
      takeUntil(this.destroy$), timeout(10000), retry(1),
    ).subscribe({
      next: (res) => { this.priorityItems = res.items; this.priorityLoading = false; this.cdr.detectChanges(); },
      error: () => { this.priorityLoading = false; this.toast.error('Failed to load priority list'); this.cdr.detectChanges(); },
    });
  }

  /* ─── Top Risk Clients ─── */
  loadTopRiskClients(): void {
    this.riskLoading = true;
    this.dashboardService.getCrmTopRiskClients(10).pipe(
      takeUntil(this.destroy$), timeout(10000), retry(1),
    ).subscribe({
      next: (res) => { this.riskClients = res.items; this.riskLoading = false; this.cdr.detectChanges(); },
      error: () => { this.riskLoading = false; this.toast.error('Failed to load risk clients'); this.cdr.detectChanges(); },
    });
  }

  /* ─── Upcoming Audits ─── */
  loadUpcomingAudits(): void {
    this.auditsLoading = true;
    this.dashboardService.getCrmUpcomingAudits(this.auditDays).pipe(
      takeUntil(this.destroy$), timeout(10000), retry(1),
    ).subscribe({
      next: (res) => { this.upcomingAudits = res.items; this.auditsLoading = false; this.cdr.detectChanges(); },
      error: () => { this.auditsLoading = false; this.toast.error('Failed to load audits'); this.cdr.detectChanges(); },
    });
  }

  toggleAuditDays(): void {
    this.auditDays = this.auditDays === 15 ? 7 : 15;
    this.loadUpcomingAudits();
  }

  /* ─── Deep-link helpers ─── */
  openTracker(tab?: string, filters?: Record<string, string>): void {
    this.router.navigate(['/crm/compliance-tracker'], { queryParams: { tab, ...filters } });
  }

  openClientWorkspace(clientId: string): void {
    this.router.navigate(['/crm/clients', clientId, 'overview']);
  }

  itemTypeLabel(t: string): string {
    switch (t) {
      case 'OVERDUE_TASK': return 'Overdue Task';
      case 'EXPIRED_DOC': return 'Expired Document';
      case 'HIGH_RISK_OBS': return 'High-Risk Observation';
      default: return t;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

import {
  Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { LegitxDashboardService } from '../../../core/legitx-dashboard.service';
import { DashboardService } from '../../../core/dashboard.service';
import { AuthService } from '../../../core/auth.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { TaskCenterService, TaskSummary, SystemTask } from '../../../core/task-center.service';

@Component({
  selector: 'app-branch-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './branch-dashboard.component.html',
  styleUrls: ['./branch-dashboard.component.scss'],
})
export class BranchDashboardComponent implements OnInit, OnDestroy {
  loading = true;
  branchId = '';
  currentMonth = '';
  branchName = 'Branch';

  // KPI Row 1
  employeeTotal = 0;
  employeeMale = 0;
  employeeFemale = 0;
  contractorTotal = 0;
  contractorMale = 0;
  contractorFemale = 0;
  pfPending = 0;
  esicPending = 0;

  // KPI Row 2 - Compliance Status
  compliancePercent = 0;
  documentUploadPercent = 0;
  openObservations = 0;
  auditScore = 0;

  // PF/ESI detail
  pfRegistered = 0;
  pfNotRegistered = 0;
  pfPendingEmployees: any[] = [];
  esiRegistered = 0;
  esiNotRegistered = 0;
  esiPendingEmployees: any[] = [];

  // Expiry tracker
  expiryItems: ExpiryItem[] = [];

  // Quick actions pending
  pendingActions: PendingAction[] = [];

  // Vendor scores
  vendorScorePercent = 0;
  topVendors: VendorScore[] = [];
  bottomVendors: VendorScore[] = [];

  // Task Center
  taskSummary: TaskSummary = { open: 0, overdue: 0, dueSoon: 0, total: 0 };
  pendingTasks: SystemTask[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private cdr: ChangeDetectorRef,
    private legitxService: LegitxDashboardService,
    private dashboardService: DashboardService,
    private authService: AuthService,
    private branchesService: ClientBranchesService,
    private taskCenterService: TaskCenterService,
  ) {}

  ngOnInit(): void {
    const branchIds = this.authService.getBranchIds();
    this.branchId = branchIds?.[0] || '';
    const user = this.authService.getUser();
    this.branchName = user?.branchName || user?.branch?.name || 'Branch';

    const now = new Date();
    this.currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    this.loadDashboard();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDashboard(): void {
    this.loading = true;
    this.cdr.markForCheck();

    const [year, month] = this.currentMonth.split('-');

    // Load task center data in parallel
    const user = this.authService.getUser();
    this.taskCenterService.getMySummary({
      role: 'BRANCH',
      userId: user?.userId || user?.id,
      branchId: this.branchId || undefined,
    }).pipe(takeUntil(this.destroy$), catchError(() => of({ open: 0, overdue: 0, dueSoon: 0, total: 0 })))
      .subscribe(summary => {
        this.taskSummary = summary;
        this.cdr.markForCheck();
      });

    this.taskCenterService.getMyItems({
      role: 'BRANCH',
      userId: user?.userId || user?.id,
      branchId: this.branchId || undefined,
      status: 'OPEN',
    }).pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(tasks => {
        this.pendingTasks = tasks.slice(0, 10);
        this.cdr.markForCheck();
      });

    forkJoin({
      legitx: this.legitxService.getSummary({
        month: +month,
        year: +year,
        branchId: this.branchId || undefined,
      }).pipe(catchError(() => of(null as any))),
      pfEsi: this.dashboardService.getClientPfEsiSummary({
        month: this.currentMonth,
        branchId: this.branchId || undefined,
      }).pipe(catchError(() => of(null as any))),
      contractor: this.dashboardService.getClientContractorUploadSummary({
        month: this.currentMonth,
        branchId: this.branchId || undefined,
      }).pipe(catchError(() => of(null as any))),
      branchDash: this.branchId
        ? this.branchesService.getDashboard(this.branchId, this.currentMonth).pipe(catchError(() => of(null)))
        : of(null),
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: ({ legitx, pfEsi, contractor, branchDash }) => {
        const kpis = legitx?.kpis;

        // Employee headcount
        this.employeeTotal = kpis?.employees?.total || 0;
        this.employeeMale = kpis?.employees?.male || 0;
        this.employeeFemale = kpis?.employees?.female || 0;

        // Contractor headcount
        this.contractorTotal = kpis?.contractors?.total || 0;
        this.contractorMale = kpis?.contractors?.male || 0;
        this.contractorFemale = kpis?.contractors?.female || 0;

        // PF/ESI from pf-esi-summary
        this.pfRegistered = pfEsi?.pf?.registered || 0;
        this.pfNotRegistered = pfEsi?.pf?.notRegisteredApplicable || 0;
        this.pfPending = this.pfNotRegistered;
        this.pfPendingEmployees = pfEsi?.pf?.pendingEmployees || [];

        this.esiRegistered = pfEsi?.esi?.registered || 0;
        this.esiNotRegistered = pfEsi?.esi?.notRegisteredApplicable || 0;
        this.esicPending = this.esiNotRegistered;
        this.esiPendingEmployees = pfEsi?.esi?.pendingEmployees || [];

        // Compliance
        this.compliancePercent = kpis?.compliance?.overallPercent || 0;
        this.documentUploadPercent = contractor?.overallPercent || 0;
        this.auditScore = kpis?.audits?.overallAuditScore || 0;
        this.openObservations = (kpis?.audits?.pending || 0) + (kpis?.audits?.overdue || 0);

        // Vendor scores from branch dashboard API
        if (branchDash) {
          this.vendorScorePercent = branchDash.vendorScorePercent || 0;
          this.topVendors = branchDash.contractors?.top10HighScoreVendors || [];
          this.bottomVendors = branchDash.contractors?.top10LowScoreVendors || [];
        }

        // Build expiry tracker from registration data
        this.buildExpiryTracker();

        // Build pending actions
        this.buildPendingActions(legitx);

        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Active': return 'badge-active';
      case 'Expiring Soon': return 'badge-expiring';
      case 'Expired': return 'badge-expired';
      default: return 'badge-active';
    }
  }

  getComplianceColor(): string {
    if (this.compliancePercent >= 80) return '#10b981';
    if (this.compliancePercent >= 60) return '#f59e0b';
    return '#ef4444';
  }

  getUploadColor(): string {
    if (this.documentUploadPercent >= 80) return '#10b981';
    if (this.documentUploadPercent >= 60) return '#f59e0b';
    return '#ef4444';
  }

  onMonthChange(): void {
    this.loadDashboard();
  }

  getVendorScoreColor(score: number): string {
    if (score >= 85) return '#10b981';
    if (score >= 70) return '#f59e0b';
    return '#ef4444';
  }

  getVendorScoreBg(score: number): string {
    if (score >= 85) return 'bg-emerald-100 text-emerald-700';
    if (score >= 70) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  }

  private buildExpiryTracker(): void {
    // Build from PF/ESI pending + any available registration data
    const items: ExpiryItem[] = [];

    if (this.pfPendingEmployees.length > 0) {
      items.push({
        type: 'PF Registration',
        detail: `${this.pfPendingEmployees.length} employees pending`,
        dueDate: 'Immediate',
        status: 'Expired',
        count: this.pfPendingEmployees.length,
      });
    }

    if (this.esiPendingEmployees.length > 0) {
      items.push({
        type: 'ESIC Registration',
        detail: `${this.esiPendingEmployees.length} employees pending`,
        dueDate: 'Immediate',
        status: 'Expired',
        count: this.esiPendingEmployees.length,
      });
    }

    this.expiryItems = items;
  }

  private buildPendingActions(legitx: any): void {
    const actions: PendingAction[] = [];
    const queues = legitx?.queues;

    if (this.pfPending > 0) {
      actions.push({ label: 'Complete PF registrations', count: this.pfPending, severity: 'high', route: '/branch/employees' });
    }
    if (this.esicPending > 0) {
      actions.push({ label: 'Complete ESIC registrations', count: this.esicPending, severity: 'high', route: '/branch/employees' });
    }
    if (this.openObservations > 0) {
      actions.push({ label: 'Resolve audit observations', count: this.openObservations, severity: 'medium', route: '/branch/audits/observations' });
    }
    if (queues?.critical?.length > 0) {
      actions.push({ label: 'Address critical compliance items', count: queues.critical.length, severity: 'high', route: '/branch/monthly-compliance' });
    }
    if (queues?.pending?.length > 0) {
      actions.push({ label: 'Complete pending uploads', count: queues.pending.length, severity: 'low', route: '/branch/documents' });
    }

    this.pendingActions = actions;
  }
}

interface ExpiryItem {
  type: string;
  detail: string;
  dueDate: string;
  status: 'Active' | 'Expiring Soon' | 'Expired';
  count: number;
}

interface PendingAction {
  label: string;
  count: number;
  severity: 'high' | 'medium' | 'low';
  route: string;
}

interface VendorScore {
  contractorUserId: string;
  contractorName: string;
  requiredCount: number;
  uploadedCount: number;
  rejectedCount: number;
  expiredCount: number;
  missingCount: number;
  score: number;
}

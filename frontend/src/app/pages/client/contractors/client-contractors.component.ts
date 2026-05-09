import { Component, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { ClientContractorsService } from '../../../core/client-contractors.service';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-client-contractors',
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  templateUrl: './client-contractors.component.html',
  styleUrls: ['./client-contractors.component.scss'],
})
export class ClientContractorsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loadingBranches = false;
  loadingContractors = false;

  contractors: any[] = [];
  branches: any[] = [];

  branchId = '';
  contractorId: string | null = null;

  month: string = this.currentMonth();
  fromMonth = '';
  toMonth = '';

  overview: any = null;
  branchView: any = null;
  trend: any[] = [];

  refreshTimer: any;

  /** Skeleton placeholder slots */
  readonly skeletonSlots = [1, 2, 3, 4];

  /** Cached computed lists for the template (avoids NG0103) */
  top5: any[] = [];
  bottom5: any[] = [];

  constructor(private api: ClientContractorsService, private cdr: ChangeDetectorRef, private router: Router) {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    this.fromMonth = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}`;
    this.toMonth = this.month;
  }

  ngOnInit() {
    this.loadBranches();
    this.refreshAll();
    this.refreshTimer = setInterval(() => {
      this.refreshAll();
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  loadBranches() {
    this.loadingBranches = true;
    this.api
      .getBranches()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingBranches = false;
          this.cdr.markForCheck();
        }),
        timeout(10000),
      )
      .subscribe({
        next: (res: any) => {
          this.branches = res?.data || res || [];
          this.loadingBranches = false;
          this.cdr.markForCheck();
          this.refreshAll();
        },
        error: () => {
          this.loadingBranches = false;
          this.branches = [];
          this.cdr.markForCheck();
        },
      });
  }

  refreshAll() {
    this.loadOverview();
    this.loadContractors();
    if (this.branchId) {
      this.loadBranchView();
    } else {
      this.branchView = null;
    }
    if (this.contractorId) {
      this.loadTrend();
    }
  }

  onBranchChange() {
    if (this.branchId) {
      this.router.navigate(['/client/contractors/branch', this.branchId], { queryParams: { month: this.month } });
    } else {
      this.contractorId = null;
      this.refreshAll();
    }
  }

  onMonthChange() {
    this.refreshAll();
  }

  loadContractors() {
    this.loadingContractors = true;
    this.api
      .getContractors({ branchId: this.branchId || undefined, month: this.month })
      .pipe(
        takeUntil(this.destroy$),
        timeout(10000),
        finalize(() => {
          this.loadingContractors = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.contractors = res || [];
          this.loadingContractors = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingContractors = false;
          this.contractors = [];
          this.cdr.markForCheck();
        },
      });
  }

  loadOverview() {
    this.api
      .getDashboard(this.month)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.overview = res;
          this.rebuildRankings();
        },
        error: () => {
          this.overview = null;
          this.rebuildRankings();
        },
      });
  }

  loadBranchView() {
    if (!this.branchId) {
      this.branchView = null;
      return;
    }
    this.api
      .getBranchDashboard(this.branchId, this.month)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res: any) => (this.branchView = res),
        error: () => (this.branchView = null),
      });
  }

  loadTrend() {
    if (!this.contractorId) {
      this.trend = [];
      return;
    }
    this.api
      .getContractorTrend(this.contractorId, this.fromMonth, this.toMonth)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res: any) => (this.trend = res || []),
        error: () => (this.trend = []),
      });
  }

  uploadPercentDisplay(p?: number) {
    if (p === null || p === undefined || isNaN(p)) return '0%';
    return `${Math.max(0, Math.min(100, Math.round(p)))}%`;
  }

  docCount(c: any) {
    return c?.monthDocCount ?? c?.totalDocs ?? c?.documentCount ?? 0;
  }

  approvedCount(c: any) {
    return c?.monthApprovedCount ?? c?.approvedDocs ?? 0;
  }

  rejectedCount(c: any) {
    return c?.monthRejectedCount ?? c?.rejectedDocs ?? 0;
  }

  pendingCount(c: any) {
    const monthly = c?.monthPendingCount;
    if (monthly !== undefined && monthly !== null) return monthly;
    const pr = c?.pendingReviewDocs ?? 0;
    const up = c?.uploadedDocs ?? 0;
    return pr + up;
  }

  ncPoints(c: any) {
    return c?.monthNcPoints ?? c?.ncPoints ?? 0;
  }

  auditRiskPoints(c: any) {
    return c?.auditRiskPoints ?? 0;
  }

  // ─── Helper methods for redesigned template ───────────────────

  /** Rebuild cached top5/bottom5 from overview data */
  private rebuildRankings(): void {
    this.top5 = (this.overview?.top10Highest || []).slice(0, 5);
    this.bottom5 = (this.overview?.top10Lowest || []).slice(0, 5);
  }

  /** Whether we have any ranked contractor data */
  hasContractorData(): boolean {
    return !!this.overview?.top10Highest?.length || !!this.overview?.top10Lowest?.length;
  }

  /** Get selected branch name for display */
  getSelectedBranchName(): string {
    if (!this.branchId) return 'All Branches';
    const b = this.branches.find((br: any) => String(br.id) === String(this.branchId));
    return b?.branchName || b?.name || 'Branch';
  }

  // ─── Color helpers: Score-based (>80 green, 60-80 orange, <60 red) ───

  getScoreColor(score?: number): string {
    const s = score ?? 0;
    if (s >= 80) return 'text-green-600';
    if (s >= 60) return 'text-amber-600';
    return 'text-red-600';
  }

  getScoreBg(score?: number): string {
    const s = score ?? 0;
    if (s >= 80) return 'bg-green-50';
    if (s >= 60) return 'bg-amber-50';
    return 'bg-red-50';
  }

  getScoreIconColor(score?: number): string {
    const s = score ?? 0;
    if (s >= 80) return 'text-green-600';
    if (s >= 60) return 'text-amber-600';
    return 'text-red-600';
  }

  getScoreBarColor(score?: number): string {
    const s = score ?? 0;
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-amber-500';
    return 'bg-red-500';
  }

  // ─── Color helpers: Risk-based (≤2 green, 2-5 orange, >5 red) ───

  getRiskColor(risk?: number): string {
    const r = risk ?? 0;
    if (r <= 2) return 'text-green-600';
    if (r <= 5) return 'text-amber-600';
    return 'text-red-600';
  }

  getRiskBg(risk?: number): string {
    const r = risk ?? 0;
    if (r <= 2) return 'bg-green-50';
    if (r <= 5) return 'bg-amber-50';
    return 'bg-red-50';
  }

  getRiskIconColor(risk?: number): string {
    const r = risk ?? 0;
    if (r <= 2) return 'text-green-600';
    if (r <= 5) return 'text-amber-600';
    return 'text-red-600';
  }

  getRiskDotColor(risk?: number): string {
    const r = risk ?? 0;
    if (r <= 2) return 'bg-green-500';
    if (r <= 5) return 'bg-amber-500';
    return 'bg-red-500';
  }
}

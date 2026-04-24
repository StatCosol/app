import { Component, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, combineLatest } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { ClientContractorsService } from '../../../core/client-contractors.service';
import { StatusBadgeComponent, LoadingSpinnerComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-client-contractors-branch',
  imports: [CommonModule, FormsModule, StatusBadgeComponent, LoadingSpinnerComponent],
  templateUrl: './client-contractors-branch.component.html',
  styleUrls: ['./client-contractors.component.scss'],
})
export class ClientContractorsBranchComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  branchId = '';
  branchName = '';

  month: string = this.currentMonth();
  fromMonth = '';
  toMonth = '';

  branchView: any = null;
  contractors: any[] = [];
  trend: any[] = [];

  selectedContractor: any = null;
  contractorId: string | null = null;

  loadingBranch = false;
  loadingContractors = false;
  loadingTrend = false;

  refreshTimer: any;

  constructor(
    private readonly route: ActivatedRoute,
    public readonly router: Router,
    private readonly api: ClientContractorsService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    this.fromMonth = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}`;
    this.toMonth = this.month;
  }

  ngOnInit(): void {
    combineLatest([
      this.route.paramMap,
      this.route.queryParamMap,
    ]).pipe(takeUntil(this.destroy$)).subscribe(([p, qp]) => {
      this.branchId = p.get('branchId') || '';
      if (!this.branchId) {
        this.router.navigate(['/client/contractors']);
        return;
      }
      const qMonth = qp.get('month');
      this.month = qMonth || this.month;
      this.fromMonth = this.month;
      this.toMonth = this.month;
      this.refreshAll();
    });

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

  refreshAll() {
    if (!this.branchId) return;
    this.loadBranchView();
    this.loadContractors();
    if (this.contractorId) {
      this.loadTrend();
    }
  }

  loadBranchView() {
    this.loadingBranch = true;
    this.api
      .getBranchDashboard(this.branchId, this.month)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingBranch = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.branchView = res;
          this.branchName = res?.branchName || '';
          this.loadingBranch = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loadingBranch = false;
          this.branchView = null;
          this.cdr.detectChanges();
        },
      });
  }

  loadContractors() {
    this.loadingContractors = true;
    this.api
      .getContractors({ branchId: this.branchId, month: this.month })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingContractors = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.contractors = res || [];
          this.loadingContractors = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loadingContractors = false;
          this.contractors = [];
          this.cdr.detectChanges();
        },
      });
  }

  selectContractor(c: any) {
    this.selectedContractor = c;
    this.contractorId = c?.id ?? null;
    this.fromMonth = this.month;
    this.toMonth = this.month;
    this.loadTrend();
  }

  backToList() {
    this.selectedContractor = null;
    this.contractorId = null;
    this.trend = [];
  }

  loadTrend() {
    if (!this.contractorId) {
      this.trend = [];
      return;
    }
    this.loadingTrend = true;
    this.api
      .getContractorTrend(this.contractorId, this.fromMonth, this.toMonth)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingTrend = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.trend = res || [];
          this.loadingTrend = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loadingTrend = false;
          this.trend = [];
          this.cdr.detectChanges();
        },
      });
  }

  onMonthChange() {
    this.refreshAll();
  }

  uploadPercentDisplay(p?: number) {
    if (p === null || p === undefined || isNaN(p)) return '0%';
    return `${Math.max(0, Math.min(100, Math.round(p)))}%`;
  }

  docCount(c: any) {
    return c?.monthDocCount ?? c?.totalDocs ?? 0;
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
}
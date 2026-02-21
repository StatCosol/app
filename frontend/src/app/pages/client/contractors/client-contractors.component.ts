import { Component, ChangeDetectorRef, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs/operators';
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
        finalize(() => {
          this.loadingBranches = false;
          this.cdr.detectChanges();
        }),
        timeout(10000),
      )
      .subscribe({
        next: (res: any) => {
          this.branches = res?.data || res || [];
          this.refreshAll();
        },
        error: () => {
          this.branches = [];
          this.cdr.detectChanges();
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
        timeout(10000),
        finalize(() => {
          this.loadingContractors = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.contractors = res || [];
          this.cdr.detectChanges();
        },
        error: () => {
          this.contractors = [];
          this.cdr.detectChanges();
        },
      });
  }

  loadOverview() {
    this.api
      .getDashboard(this.month)
      .pipe(
        finalize(() => {
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res: any) => (this.overview = res),
        error: () => (this.overview = null),
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
        finalize(() => {
          this.cdr.detectChanges();
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
        finalize(() => {
          this.cdr.detectChanges();
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
}

import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { PerformanceAppraisalService } from '../../../core/services/performance-appraisal.service';
import { AppraisalCycle } from '../../../core/models/appraisal.models';

@Component({
  selector: 'app-branch-appraisal-cycles',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Appraisal Cycles</h1>
          <p class="page-subtitle">View active and past appraisal cycles</p>
        </div>
        <a routerLink="/branch/appraisal-dashboard" class="btn-secondary">Dashboard</a>
      </div>

      <div *ngIf="loading" class="flex items-center justify-center py-20"><div class="spinner"></div></div>

      <div *ngIf="!loading" class="table-card">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Cycle Name</th>
                <th>Financial Year</th>
                <th>Type</th>
                <th>Review Period</th>
                <th>Status</th>
                <th>Eligible</th>
                <th>Completed</th>
                <th>Pending</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of cycles; trackBy: trackById" class="data-row">
                <td class="text-xs font-mono text-gray-500">{{ c.cycleCode }}</td>
                <td class="font-medium text-slate-800">{{ c.cycleName }}</td>
                <td>{{ c.financialYear }}</td>
                <td><span class="badge bg-indigo-100 text-indigo-700">{{ c.appraisalType?.replace(/_/g, ' ') }}</span></td>
                <td class="text-xs text-gray-500">{{ c.reviewPeriodFrom | date:'dd/MM/yyyy' }} — {{ c.reviewPeriodTo | date:'dd/MM/yyyy' }}</td>
                <td>
                  <span class="badge"
                    [class.bg-gray-100]="c.status === 'DRAFT'" [class.text-gray-600]="c.status === 'DRAFT'"
                    [class.bg-emerald-100]="c.status === 'ACTIVE'" [class.text-emerald-700]="c.status === 'ACTIVE'"
                    [class.bg-red-100]="c.status === 'CLOSED'" [class.text-red-700]="c.status === 'CLOSED'">
                    {{ c.status }}
                  </span>
                </td>
                <td class="text-center">{{ c.eligibleCount ?? 0 }}</td>
                <td class="text-center text-emerald-600 font-medium">{{ c.completedCount ?? 0 }}</td>
                <td class="text-center text-amber-600 font-medium">{{ c.pendingCount ?? 0 }}</td>
              </tr>
              <tr *ngIf="!cycles.length">
                <td colspan="9" class="text-center text-sm text-gray-400 py-10">No cycles found</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class BranchAppraisalCyclesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  cycles: AppraisalCycle[] = [];

  constructor(private svc: PerformanceAppraisalService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.svc.getCycles().pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe(c => { this.cycles = c; });
  }

  trackById(_: number, item: any) { return item.id; }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}

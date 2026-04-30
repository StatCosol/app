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
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; }
    .page-title { font-size: 1.2rem; font-weight: 800; color: #111827; margin: 0; }
    .page-subtitle { font-size: 0.82rem; color: #6b7280; margin-top: 0.25rem; }
    .spinner { width: 2rem; height: 2rem; border: 3px solid #e5e7eb; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.75s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .table-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.825rem; }
    .data-table th { padding: 0.5rem 0.75rem; text-align: left; font-weight: 600; color: #475569; background: #f8fafc; border-bottom: 1px solid #e5e7eb; white-space: nowrap; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; color: #1e293b; vertical-align: middle; }
    .data-row:hover td { background: #f8fafc; }
  `],
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
                <td><span class="badge bg-indigo-100 text-indigo-700">{{ c.appraisalType.replace(/_/g, ' ') }}</span></td>
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

import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DashboardService } from '../../../core/dashboard.service';
import { AuthService } from '../../../core/auth.service';

@Component({
  selector: 'app-branch-contractors',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Contractors</h1>
          <p class="page-subtitle">Contractor-wise document upload status &amp; compliance</p>
        </div>
        <div class="flex items-center gap-3">
          <input type="month" [(ngModel)]="currentMonth" (change)="loadData()" class="month-picker" />
        </div>
      </div>

      <!-- Overall upload % card -->
      <div class="overall-card">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-full flex items-center justify-center" [style.background]="getUploadBg()">
            <span class="text-xl font-bold" [style.color]="getUploadColor()">{{ overallPercent | number:'1.0-0' }}%</span>
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-800">Overall Document Upload Compliance</p>
            <p class="text-xs text-slate-500 mt-0.5">Across all contractors for this branch</p>
          </div>
        </div>
      </div>

      <div *ngIf="loading" class="flex items-center justify-center py-16">
        <div class="spinner"></div>
      </div>

      <!-- Contractor Table -->
      <div *ngIf="!loading" class="table-card">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Contractor Name</th>
                <th>Upload %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of contractors; let i = index" class="data-row">
                <td class="text-slate-400">{{ i + 1 }}</td>
                <td class="font-medium text-slate-800">{{ c.name || c.contractorName || '—' }}</td>
                <td>
                  <div class="flex items-center gap-2">
                    <div class="progress-bar-sm">
                      <div class="progress-fill-sm" [style.width.%]="c.percent || 0" [style.background]="getBarColor(c.percent)"></div>
                    </div>
                    <span class="text-xs font-semibold" [style.color]="getBarColor(c.percent)">{{ c.percent | number:'1.0-0' }}%</span>
                  </div>
                </td>
                <td>
                  <span class="badge"
                    [class.bg-emerald-100]="c.percent >= 80" [class.text-emerald-700]="c.percent >= 80"
                    [class.bg-amber-100]="c.percent >= 50 && c.percent < 80" [class.text-amber-700]="c.percent >= 50 && c.percent < 80"
                    [class.bg-red-100]="c.percent < 50" [class.text-red-700]="c.percent < 50">
                    {{ c.percent >= 80 ? 'Compliant' : c.percent >= 50 ? 'Partial' : 'Non-Compliant' }}
                  </span>
                </td>
              </tr>
              <tr *ngIf="contractors.length === 0">
                <td colspan="4" class="text-center text-slate-400 py-12">No contractor data available</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
    .page-title { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
    .page-subtitle { font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
    .month-picker { padding: 0.375rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.8125rem; color: #334155; background: white; cursor: pointer; }
    .overall-card { background: white; border-radius: 1rem; padding: 1.25rem; border: 1px solid #f1f5f9; box-shadow: 0 1px 4px rgba(0,0,0,0.04); margin-bottom: 1.25rem; }
    .table-card { background: white; border-radius: 1rem; border: 1px solid #f1f5f9; box-shadow: 0 1px 4px rgba(0,0,0,0.04); overflow: hidden; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { text-align: left; padding: 0.75rem 1rem; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; background: #f8fafc; border-bottom: 2px solid #f1f5f9; }
    .data-table td { padding: 0.75rem 1rem; font-size: 0.8125rem; border-bottom: 1px solid #f8fafc; }
    .data-row:hover { background: #f8fafc; }
    .badge { display: inline-flex; padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; }
    .progress-bar-sm { width: 80px; height: 6px; background: #f1f5f9; border-radius: 999px; overflow: hidden; }
    .progress-fill-sm { height: 100%; border-radius: 999px; transition: width 0.4s; }
    .spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class BranchContractorsComponent implements OnInit, OnDestroy {
  loading = true;
  currentMonth = '';
  overallPercent = 0;
  contractors: any[] = [];
  private readonly destroy$ = new Subject<void>();

  constructor(
    private cdr: ChangeDetectorRef,
    private dashboardService: DashboardService,
    private authService: AuthService,
  ) {
    const now = new Date();
    this.currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.cdr.markForCheck();
    const branchIds = this.authService.getBranchIds();
    const branchId = branchIds?.[0] || '';

    this.dashboardService.getClientContractorUploadSummary({
      month: this.currentMonth,
      branchId: branchId || undefined,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (resp: any) => {
        this.overallPercent = resp?.overallPercent || 0;
        this.contractors = (resp?.contractors || []).map((c: any) => ({
          ...c,
          percent: c.uploadPercent ?? c.percent ?? 0,
        }));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  getUploadColor(): string {
    if (this.overallPercent >= 80) return '#10b981';
    if (this.overallPercent >= 60) return '#f59e0b';
    return '#ef4444';
  }

  getUploadBg(): string {
    if (this.overallPercent >= 80) return '#d1fae5';
    if (this.overallPercent >= 60) return '#fef3c7';
    return '#fee2e2';
  }

  getBarColor(pct: number): string {
    if (pct >= 80) return '#10b981';
    if (pct >= 50) return '#f59e0b';
    return '#ef4444';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

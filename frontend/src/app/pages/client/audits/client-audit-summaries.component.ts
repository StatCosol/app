import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Subject, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { AuditsService } from '../../../core/audits.service';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-client-audit-summaries',
  standalone: true,
  imports: [
    CommonModule,
    LoadingSpinnerComponent,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page-header
      title="Audit Summaries"
      subtitle="Branch-level audit compliance overview"
    ></ui-page-header>

    <div class="p-6">
      <ui-loading-spinner *ngIf="loading"></ui-loading-spinner>

      <div *ngIf="!loading && summaries.length === 0">
        <ui-empty-state
          message="No audit data available."
          icon="document"
        ></ui-empty-state>
      </div>

      <div
        *ngIf="!loading && summaries.length > 0"
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <div
          *ngFor="let s of summaries"
          class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow"
        >
          <h3 class="text-base font-semibold text-slate-800 mb-3">
            {{ s.branch_name || 'Unknown Branch' }}
          </h3>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span class="text-slate-500 text-xs">Total Audits</span>
              <p class="font-bold text-slate-800">{{ s.total_audits }}</p>
            </div>
            <div>
              <span class="text-slate-500 text-xs">Completed</span>
              <p class="font-bold text-emerald-600">{{ s.completed }}</p>
            </div>
            <div>
              <span class="text-slate-500 text-xs">In Progress</span>
              <p class="font-bold text-amber-600">{{ s.in_progress }}</p>
            </div>
            <div>
              <span class="text-slate-500 text-xs">Avg Score</span>
              <p class="font-bold text-indigo-600">
                {{
                  s.avg_score !== null && s.avg_score !== undefined
                    ? s.avg_score + '%'
                    : '-'
                }}
              </p>
            </div>
          </div>
          <div *ngIf="s.last_audit_date" class="mt-3 pt-3 border-t border-slate-100">
            <span class="text-xs text-slate-400">
              Last audit: {{ s.last_audit_date | date: 'mediumDate' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ClientAuditSummariesComponent implements OnInit, OnDestroy {
  loading = true;
  summaries: any[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    private auditsService: AuditsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.auditsService
      .clientGetAuditSummaries()
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe((data) => {
        this.summaries = data;
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

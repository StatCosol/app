import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Subject, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { ClientVisibilityService } from '../../../core/client-visibility.service';
import {
  LoadingSpinnerComponent,
  PageHeaderComponent,
  EmptyStateComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-client-returns-summary',
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page-header title="Returns Summary" subtitle="Filing status overview by law type"></ui-page-header>

    <div class="p-6">
      <ui-loading-spinner *ngIf="loading"></ui-loading-spinner>

      <div *ngIf="!loading && summary.length === 0">
        <ui-empty-state message="No return filings data available." icon="document"></ui-empty-state>
      </div>

      <div *ngIf="!loading && summary.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div *ngFor="let s of summary"
             class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 class="text-base font-semibold text-slate-800 mb-3">{{ s.law_type || 'Other' }}</h3>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div>
              <span class="text-xs text-slate-500">Total</span>
              <p class="text-lg font-bold text-slate-800">{{ s.total }}</p>
            </div>
            <div>
              <span class="text-xs text-emerald-500">Filed</span>
              <p class="text-lg font-bold text-emerald-600">{{ s.filed }}</p>
            </div>
            <div>
              <span class="text-xs text-amber-500">Pending</span>
              <p class="text-lg font-bold text-amber-600">{{ s.pending }}</p>
            </div>
          </div>
          <div class="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <span class="text-xs text-blue-500">In Progress</span>
              <p class="text-lg font-bold text-blue-600">{{ s.in_progress }}</p>
            </div>
            <div>
              <span class="text-xs text-red-500">Rejected</span>
              <p class="text-lg font-bold text-red-600">{{ s.rejected }}</p>
            </div>
            <div>
              <span class="text-xs text-red-500">Overdue</span>
              <p class="text-lg font-bold text-red-600">{{ s.overdue }}</p>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="mt-3">
            <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full transition-all"
                   [style.width.%]="s.total > 0 ? (s.filed / s.total * 100) : 0"></div>
            </div>
            <p class="text-xs text-slate-500 mt-1">{{ s.total > 0 ? ((s.filed / s.total * 100) | number:'1.0-0') : 0 }}% filed</p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ClientReturnsSummaryComponent implements OnInit, OnDestroy {
  loading = true;
  summary: any[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    private visibilityService: ClientVisibilityService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.visibilityService.getReturnsSummary()
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(data => {
        this.summary = data;
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

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
  selector: 'app-crm-audit-monitoring',
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
      title="Audit Monitoring"
      subtitle="Client audit summaries across your portfolio"
    ></ui-page-header>

    <div class="p-6">
      <ui-loading-spinner *ngIf="loading"></ui-loading-spinner>

      <div *ngIf="!loading && summaries.length === 0">
        <ui-empty-state
          message="No audit data available."
          icon="clipboard"
        ></ui-empty-state>
      </div>

      <div *ngIf="!loading && summaries.length > 0" class="space-y-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-center">
            <span class="text-xs text-slate-500 uppercase">Clients</span>
            <p class="text-2xl font-bold text-slate-800">{{ summaries.length }}</p>
          </div>
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-center">
            <span class="text-xs text-slate-500 uppercase">Total Audits</span>
            <p class="text-2xl font-bold text-slate-800">{{ totalAudits }}</p>
          </div>
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-center">
            <span class="text-xs text-slate-500 uppercase">Completed</span>
            <p class="text-2xl font-bold text-emerald-600">{{ totalCompleted }}</p>
          </div>
          <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-center">
            <span class="text-xs text-slate-500 uppercase">Avg Score</span>
            <p class="text-2xl font-bold text-indigo-600">{{ overallAvgScore }}%</p>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th class="px-6 py-3 text-left">Client</th>
                <th class="px-6 py-3 text-center">Total</th>
                <th class="px-6 py-3 text-center">Completed</th>
                <th class="px-6 py-3 text-center">In Progress</th>
                <th class="px-6 py-3 text-center">Scheduled</th>
                <th class="px-6 py-3 text-center">Avg Score</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let s of summaries"
                class="border-b border-slate-100 hover:bg-slate-50"
              >
                <td class="px-6 py-3 font-medium text-slate-800">
                  {{ s.client_name }}
                </td>
                <td class="px-6 py-3 text-center">{{ s.total_audits }}</td>
                <td class="px-6 py-3 text-center text-emerald-600 font-medium">
                  {{ s.completed }}
                </td>
                <td class="px-6 py-3 text-center text-amber-600 font-medium">
                  {{ s.in_progress }}
                </td>
                <td class="px-6 py-3 text-center text-blue-600 font-medium">
                  {{ s.scheduled }}
                </td>
                <td class="px-6 py-3 text-center font-bold">
                  {{
                    s.avg_score !== null && s.avg_score !== undefined
                      ? s.avg_score + '%'
                      : '-'
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class CrmAuditMonitoringComponent implements OnInit, OnDestroy {
  loading = true;
  summaries: any[] = [];
  totalAudits = 0;
  totalCompleted = 0;
  overallAvgScore = 0;
  private destroy$ = new Subject<void>();

  constructor(
    private auditsService: AuditsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.auditsService
      .crmGetAuditSummaries()
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe((data) => {
        this.summaries = data;
        this.totalAudits = data.reduce(
          (sum: number, s: any) => sum + (s.total_audits || 0),
          0,
        );
        this.totalCompleted = data.reduce(
          (sum: number, s: any) => sum + (s.completed || 0),
          0,
        );
        const scores = data
          .filter((s: any) => s.avg_score !== null && s.avg_score !== undefined)
          .map((s: any) => s.avg_score);
        this.overallAvgScore = scores.length
          ? Math.round(
              scores.reduce((a: number, b: number) => a + b, 0) /
                  scores.length,
            )
          : 0;
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

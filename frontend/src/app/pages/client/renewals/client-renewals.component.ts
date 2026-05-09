import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { ClientVisibilityService } from '../../../core/client-visibility.service';
import { ExpiryTasksService } from '../../../core/expiry-tasks.service';
import {
  LoadingSpinnerComponent,
  PageHeaderComponent,
  EmptyStateComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-client-renewals',
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page-header title="Renewals & Expiry" subtitle="Upcoming registration and license renewals"></ui-page-header>

    <div class="p-6 space-y-6">
      <ui-loading-spinner *ngIf="loading"></ui-loading-spinner>

      <!-- KPI Row -->
      <div *ngIf="!loading && kpi" class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-center">
          <span class="text-xs text-slate-500 uppercase">Total Expiry Tasks</span>
          <p class="text-2xl font-bold text-slate-800">{{ kpi.total }}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-red-200 p-4 text-center">
          <span class="text-xs text-red-500 uppercase">Overdue</span>
          <p class="text-2xl font-bold text-red-600">{{ kpi.overdue }}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-amber-200 p-4 text-center">
          <span class="text-xs text-amber-500 uppercase">Expiring Soon</span>
          <p class="text-2xl font-bold text-amber-600">{{ kpi.expiring_30d }}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-emerald-200 p-4 text-center">
          <span class="text-xs text-emerald-500 uppercase">Completed</span>
          <p class="text-2xl font-bold text-emerald-600">{{ kpi.completed }}</p>
        </div>
      </div>

      <!-- Renewals List -->
      <div *ngIf="!loading && renewals.length === 0">
        <ui-empty-state message="No upcoming renewals in the next 90 days." icon="calendar"></ui-empty-state>
      </div>

      <div *ngIf="!loading && renewals.length > 0" class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-200">
          <h3 class="text-base font-semibold text-slate-800">Upcoming Renewals (90 days)</h3>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th class="px-6 py-3 text-left">Registration</th>
              <th class="px-6 py-3 text-left">Branch</th>
              <th class="px-6 py-3 text-left">Expiry Date</th>
              <th class="px-6 py-3 text-left">Days Left</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of renewals" class="border-b border-slate-100 hover:bg-slate-50">
              <td class="px-6 py-3 font-medium text-slate-800">{{ r.registration_name }}</td>
              <td class="px-6 py-3">{{ r.branch_name }}</td>
              <td class="px-6 py-3">{{ r.expiry_date | date:'mediumDate' }}</td>
              <td class="px-6 py-3">
                <span [class]="r.days_left <= 7 ? 'text-red-600 font-bold' : r.days_left <= 30 ? 'text-amber-600 font-medium' : 'text-slate-600'">
                  {{ r.days_left }}d
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ClientRenewalsComponent implements OnInit, OnDestroy {
  loading = true;
  renewals: any[] = [];
  kpi: any = null;
  private destroy$ = new Subject<void>();

  constructor(
    private visibilityService: ClientVisibilityService,
    private expiryService: ExpiryTasksService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    forkJoin({
      renewals: this.visibilityService.getRenewals().pipe(catchError(() => of([]))),
      kpi: this.expiryService.clientKpi().pipe(catchError(() => of(null))),
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe(({ renewals, kpi }) => {
      this.renewals = renewals;
      this.kpi = kpi;
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

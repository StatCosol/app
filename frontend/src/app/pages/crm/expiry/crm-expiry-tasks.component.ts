import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Subject, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { ExpiryTasksService } from '../../../core/expiry-tasks.service';
import {
  LoadingSpinnerComponent,
  PageHeaderComponent,
  EmptyStateComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-crm-expiry-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, PageHeaderComponent, EmptyStateComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page-header title="Expiry & Renewals" subtitle="Track registration and license expiry tasks"></ui-page-header>

    <div class="p-6 space-y-6">
      <ui-loading-spinner *ngIf="loading"></ui-loading-spinner>

      <!-- KPI Cards -->
      <div *ngIf="!loading && kpi" class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-center">
          <span class="text-xs text-slate-500 uppercase">Total Tasks</span>
          <p class="text-2xl font-bold text-slate-800">{{ kpi.total }}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-red-200 p-4 text-center">
          <span class="text-xs text-red-500 uppercase">Overdue</span>
          <p class="text-2xl font-bold text-red-600">{{ kpi.overdue }}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-amber-200 p-4 text-center">
          <span class="text-xs text-amber-500 uppercase">Expiring (7d)</span>
          <p class="text-2xl font-bold text-amber-600">{{ kpi.expiring_7d }}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-emerald-200 p-4 text-center">
          <span class="text-xs text-emerald-500 uppercase">Completed</span>
          <p class="text-2xl font-bold text-emerald-600">{{ kpi.completed }}</p>
        </div>
      </div>

      <!-- Filters -->
      <div *ngIf="!loading" class="flex flex-wrap gap-3">
        <select [(ngModel)]="statusFilter" (ngModelChange)="loadTasks()" class="rounded-lg border-slate-300 text-sm">
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="OVERDUE">Overdue</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      <!-- Task List -->
      <div *ngIf="!loading && tasks.length === 0">
        <ui-empty-state message="No expiry tasks found." icon="calendar"></ui-empty-state>
      </div>

      <div *ngIf="!loading && tasks.length > 0" class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th class="px-6 py-3 text-left">Registration</th>
              <th class="px-6 py-3 text-left">Client</th>
              <th class="px-6 py-3 text-left">Branch</th>
              <th class="px-6 py-3 text-left">Expiry Date</th>
              <th class="px-6 py-3 text-left">Days Left</th>
              <th class="px-6 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of tasks" class="border-b border-slate-100 hover:bg-slate-50">
              <td class="px-6 py-3 font-medium text-slate-800">{{ t.registration_name }}</td>
              <td class="px-6 py-3">{{ t.client_name }}</td>
              <td class="px-6 py-3">{{ t.branch_name }}</td>
              <td class="px-6 py-3">{{ t.expiry_date | date:'mediumDate' }}</td>
              <td class="px-6 py-3">
                <span [class]="getDaysClass(t.days_before_expiry)">
                  {{ t.days_before_expiry }}d
                </span>
              </td>
              <td class="px-6 py-3"><ui-status-badge [status]="t.status"></ui-status-badge></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class CrmExpiryTasksComponent implements OnInit, OnDestroy {
  loading = true;
  tasks: any[] = [];
  kpi: any = null;
  statusFilter = '';
  private destroy$ = new Subject<void>();

  constructor(
    private expiryService: ExpiryTasksService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.loadKpi();
    this.loadTasks();
  }

  loadKpi() {
    this.expiryService.crmKpi()
      .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
      .subscribe(kpi => {
        this.kpi = kpi;
        this.cdr.markForCheck();
      });
  }

  loadTasks() {
    this.loading = true;
    this.expiryService.crmList({ status: this.statusFilter || undefined })
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(tasks => {
        this.tasks = tasks;
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  getDaysClass(days: number): string {
    if (days <= 7) return 'text-red-600 font-bold';
    if (days <= 15) return 'text-amber-600 font-medium';
    return 'text-slate-600';
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ClientVisibilityService } from '../../../core/client-visibility.service';
import { environment } from '../../../../environments/environment';
import {
  LoadingSpinnerComponent,
  PageHeaderComponent,
  EmptyStateComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-client-compliance-reminders',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page-header title="Compliance Reminders" subtitle="Upcoming compliance deadlines across all branches"></ui-page-header>

    <div class="p-6">
      <!-- Branch filter -->
      <div class="mb-4">
        <select aria-label="Branch" [(ngModel)]="selectedBranchId" (ngModelChange)="loadReminders()"
                class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          <option value="">All Branches</option>
          @for (b of branches; track b) {
<option [value]="b.id">{{ b.branchName || b.name || 'Branch' }}</option>
}
        </select>
      </div>

      @if (branchLoadError) {
        <div role="alert" class="mb-4 p-4 rounded-lg bg-orange-50 text-orange-900">
          <p>{{ branchLoadError }}</p>
          <button type="button" class="btn btn-secondary mt-2" (click)="loadBranches()">Retry branches</button>
        </div>
      }
      @if (loadError) {
        <div role="alert" class="mb-4 p-4 rounded-lg bg-orange-50 text-orange-900">
          <p>{{ loadError }}</p>
          <button type="button" class="btn btn-secondary mt-2" (click)="loadReminders()">Retry reminders</button>
        </div>
      }
      @if (loading) {
<ui-loading-spinner></ui-loading-spinner>
}

      @if (!loading && !loadError && reminders.length === 0) {
<div>
        <ui-empty-state title="No upcoming compliance reminders." description="No reminders were returned for the selected branch in the next 30 days."></ui-empty-state>
      </div>
}

      @if (!loading && reminders.length > 0) {
<div class="space-y-3">
        @for (r of reminders; track r) {
<div
             class="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4"
             [class.border-red-200]="r.days_left <= 7"
             [class.border-amber-200]="r.days_left > 7 && r.days_left <= 15"
             [class.border-slate-200]="r.days_left > 15">
          <!-- Icon -->
          <div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
               [class.bg-red-100]="r.days_left <= 7"
               [class.bg-amber-100]="r.days_left > 7 && r.days_left <= 15"
               [class.bg-slate-100]="r.days_left > 15">
            <svg class="w-5 h-5" [class.text-red-600]="r.days_left <= 7" [class.text-amber-600]="r.days_left > 7 && r.days_left <= 15" [class.text-slate-600]="r.days_left > 15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              @if (r.reminder_type === 'RETURN_DUE') {
<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z"/>
}
              @if (r.reminder_type === 'REGISTRATION_EXPIRY') {
<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
}
            </svg>
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    [class]="r.reminder_type === 'RETURN_DUE' ? 'bg-brand-100 text-brand-800' : 'bg-orange-100 text-orange-800'">
                {{ r.reminder_type === 'RETURN_DUE' ? 'Return' : 'Registration' }}
              </span>
              @if (r.status) {
<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {{ r.status }}
              </span>
}
            </div>
            <p class="text-sm font-semibold text-slate-800 truncate">{{ r.title }}</p>
            <p class="text-xs text-slate-500">{{ r.branch_name }} · Due {{ r.due_date | date:'mediumDate' }}</p>
          </div>

          <!-- Days Badge -->
          <div class="flex-shrink-0">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold"
                  [class.bg-red-100]="r.days_left <= 7" [class.text-red-700]="r.days_left <= 7"
                  [class.bg-amber-100]="r.days_left > 7 && r.days_left <= 15" [class.text-amber-700]="r.days_left > 7 && r.days_left <= 15"
                  [class.bg-slate-100]="r.days_left > 15" [class.text-slate-700]="r.days_left > 15">
              {{ r.days_left }}d left
            </span>
          </div>
        </div>
}
      </div>
}
    </div>
  `,
})
export class ClientComplianceRemindersComponent implements OnInit, OnDestroy {
  loading = true;
  reminders: any[] = [];
  branches: any[] = [];
  selectedBranchId = '';
  loadError = '';
  branchLoadError = '';
  private reminderRequest?: Subscription;
  private branchRequest?: Subscription;
  private destroy$ = new Subject<void>();

  constructor(
    private visibilityService: ClientVisibilityService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.loadBranches();
    this.loadReminders();
  }

  loadBranches() {
    this.branchRequest?.unsubscribe();
    this.branchLoadError = '';
    this.branchRequest = this.http.get<any[]>(`${environment.apiBaseUrl}/api/v1/client/branches`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.branches = data || [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.branchLoadError = 'Branches could not be loaded. Retry to refresh the branch selector.';
          this.cdr.markForCheck();
        },
      });
  }

  loadReminders() {
    this.reminderRequest?.unsubscribe();
    this.loadError = '';
    this.reminders = [];
    this.loading = true;
    this.cdr.markForCheck();
    this.reminderRequest = this.visibilityService.getReminders(30, this.selectedBranchId || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.reminders = data || [];
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadError = 'Compliance reminders could not be loaded. Retry before relying on these deadlines.';
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  ngOnDestroy() {
    this.reminderRequest?.unsubscribe();
    this.branchRequest?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }
}

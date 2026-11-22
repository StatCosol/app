import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-time-office-automation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="bg-white border rounded-xl p-5">
      <h2 class="text-xl font-semibold">Automatic attendance follow-ups</h2>
      <p class="my-3">
        Employees receive an in-app reminder at 9:00 a.m. IST the next morning. If attendance
        remains uncorrected 24 hours after the reminder, the system notifies the active branch users
        assigned to that employee’s branch.
      </p>
      <p class="text-sm text-gray-600">
        Checks run every 15 minutes. Overnight shifts wait until the shift, grace period and a
        two-hour processing allowance finish. Approved leave, holidays and recorded non-working days
        are excluded. Replies alone do not count as an attendance correction.
      </p>
      @if (error) {
        <p role="alert" class="text-red-700 my-3">{{ error }}</p>
      }
      @if (message) {
        <p role="status" class="text-green-700 my-3">{{ message }}</p>
      }
      @if (loading) {
        <p role="status">Loading settings…</p>
      }
      @if (data) {
        <form (ngSubmit)="save()" class="my-5">
          <label class="flex gap-3 items-center"
            ><input
              type="checkbox"
              name="enabled"
              [(ngModel)]="enabled"
              [disabled]="!canEdit || saving || loading"
            />Enable automatic reminders and escalations</label
          >
          <fieldset class="my-4" [disabled]="!canEdit || saving || loading">
            <legend class="font-semibold">Default weekly offs for this company</legend>
            <div class="flex gap-4 flex-wrap mt-2">
              @for (day of days; track $index) {
                <label class="flex gap-2 items-center"
                  ><input
                    type="checkbox"
                    [name]="'day' + $index"
                    [ngModel]="offs.includes($index)"
                    (ngModelChange)="toggle($index, $event)"
                  />{{ day }}</label
                >
              }
            </div>
          </fieldset>
          <p class="text-sm text-gray-600">
            For branch-specific or rotating weekly offs, record WEEK_OFF in attendance before the
            next morning. The selected default offs apply only when no attendance record exists.
          </p>
          @if (canEdit) {
            <button class="bg-blue-900 text-white rounded px-4 py-2 mt-3" [disabled]="saving || loading">
              {{ saving ? 'Saving…' : 'Save settings' }}
            </button>
          } @else {
            <p class="text-sm mt-3">Only the Time Office Manager can change these settings.</p>
          }
        </form>
        <p>
          Status: <strong>{{ data.enabled ? 'Enabled' : 'Paused' }}</strong> · Attendance dates from
          {{ data.starts_on }} · Last check:
          {{ data.last_run_at ? (data.last_run_at | date: 'medium') : 'Waiting for first check' }}
        </p>
        @if (data.last_error) {
          <p role="alert" class="text-red-700">{{ data.last_error }}</p>
        }
        <div class="flex flex-wrap gap-6 my-4">
          <span
            >Awaiting correction: <strong>{{ data.awaiting_correction }}</strong></span
          ><span
            >Escalated: <strong>{{ data.escalated }}</strong></span
          ><span
            >Delivery issues: <strong>{{ data.delivery_issues }}</strong></span
          >
        </div>
        <button class="border rounded px-3 py-2" (click)="load()" [disabled]="saving || loading">
          Refresh status
        </button>
        @if (data.issues?.length) {
          <h3 class="font-semibold mt-5">Delivery issues (latest 50)</h3>
          @for (issue of data.issues; track $index) {
            <p class="border-b py-3">
              {{ issue.name }} · {{ issue.employee_code }} · {{ issue.attendance_date }}<br /><span
                class="text-red-700"
                >{{ issue.last_error }}</span
              >
            </p>
          }
        }
      }
    </section>
  `,
})
export class TimeOfficeAutomationComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly destroy$ = new Subject<void>();
  readonly canEdit = inject(AuthService).getRoleCode() === 'TIME_OFFICE_MANAGER';
  private readonly url = `${environment.apiBaseUrl}/api/v1/client/attendance/time-office/automation`;
  readonly days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  data: any = null;
  enabled = true;
  offs: number[] = [];
  loading = false;
  saving = false;
  error = '';
  message = '';
  ngOnInit() {
    this.load();
  }
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
  toggle(day: number, on: boolean) {
    this.offs = on ? [...this.offs, day] : this.offs.filter((d) => d !== day);
  }
  load() {
    this.loading = true;
    this.error = '';
    this.http
      .get<any>(this.url)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.apply(data);
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.error = 'Unable to load automatic follow-up settings.';
        },
      });
  }
  private apply(data: any) {
    this.data = data;
    this.enabled = data.enabled;
    this.offs = [...data.weekly_off_days];
  }
  save() {
    if (!this.canEdit || this.saving || this.loading) return;
    this.saving = true;
    this.error = '';
    this.message = '';
    this.http
      .put<any>(this.url, { enabled: this.enabled, weeklyOffDays: this.offs })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.apply(data);
          this.saving = false;
          this.message = 'Automatic follow-up settings saved.';
        },
        error: () => {
          this.saving = false;
          this.error = 'Settings were not saved. Please retry.';
        },
      });
  }
}

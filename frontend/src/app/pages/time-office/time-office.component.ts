import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { TimeOfficeNotificationsComponent } from '../../shared/time-office-notifications.component';

interface OfficeData {
  date?: string;
  rows: Record<string, any>[];
  branches: { id: string; name: string }[];
  summary: Record<string, number>;
  total: number;
  pageSize: number;
}

@Component({
  selector: 'app-time-office',
  standalone: true,
  imports: [CommonModule, FormsModule, TimeOfficeNotificationsComponent],
  templateUrl: './time-office.component.html',
  styleUrl: './time-office.component.scss',
})
export class TimeOfficeComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly user = this.auth.getUser();
  private readonly http = inject(HttpClient);
  private request?: Subscription;
  readonly today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  date = this.today;
  branch = '';
  search = '';
  hours = 9;
  issue = '';
  view = 'attendance';
  page = 1;
  loading = false;
  error = '';
  sending = '';
  notice = '';
  data: OfficeData = { rows: [], branches: [], summary: {}, total: 0, pageSize: 50 };
  readonly tabs = [
    { id: 'attendance', label: 'Attendance' },
    { id: 'leaves', label: 'Leaves' },
    { id: 'coff', label: 'Comp-off' },
    { id: 'notifications', label: 'Notifications & escalations' },
  ];
  readonly labels: Record<string, string> = {
    employees: 'Employees',
    notMarked: 'Attendance not marked',
    shortHours: 'Below review hours',
    incomplete: 'Incomplete punches',
    onLeave: 'On leave',
    absent: 'Marked absent',
    applications: 'Leave applications',
    approved: 'Approved',
    pending: 'Pending',
    availableDays: 'Available comp-off days',
    usedDays: 'Used comp-off days',
  };
  get cards() {
    return Object.entries(this.data.summary).map(([key, value]) => ({
      label: this.labels[key] || key,
      value,
    }));
  }
  get pages() {
    return Math.max(1, Math.ceil(this.data.total / this.data.pageSize));
  }
  ngOnInit() {
    this.load();
  }
  ngOnDestroy() {
    this.request?.unsubscribe();
  }
  switchView(view: string) {
    this.view = view;
    this.issue = '';
    this.notice = '';
    if (view !== 'notifications') this.load();
  }
  followUp(row: Record<string, any>, target: 'EMPLOYEE' | 'BRANCH') {
    if (this.sending || !this.data.date) return;
    this.sending = row['id'];
    this.error = '';
    this.notice = '';
    this.http
      .post<{ sent: number; existing: number; recipients: string[] }>(
        `${environment.apiBaseUrl}/api/v1/client/attendance/time-office/follow-up`,
        {
          employeeId: row['id'],
          date: this.data.date,
          target,
        },
      )
      .subscribe({
        next: (result) => {
          this.sending = '';
          this.notice = result.sent
            ? `In-app notification sent to ${result.recipients.join(', ')}. Follow replies in Notifications & escalations.`
            : 'A notification already exists for this employee, date and recipient. No duplicate was sent.';
        },
        error: (error) => {
          this.sending = '';
          this.error =
            typeof error.error?.message === 'string'
              ? error.error.message
              : 'Notification was not sent. Please retry.';
        },
      });
  }
  load(reset = true) {
    if (reset) this.page = 1;
    this.request?.unsubscribe();
    this.loading = true;
    this.error = '';
    this.data = { ...this.data, rows: [], summary: {}, total: 0 };
    this.request = this.http
      .get<OfficeData>(`${environment.apiBaseUrl}/api/v1/client/attendance/time-office`, {
        params: {
          date: this.date,
          branch: this.branch,
          search: this.search,
          hours: String(this.hours),
          issue: this.issue,
          view: this.view,
          page: String(this.page),
        },
      })
      .subscribe({
        next: (data) => {
          this.data = data;
          this.loading = false;
        },
        error: (error) => {
          this.loading = false;
          this.error =
            error.status === 403
              ? 'Access is unavailable. Ask Admin to check your company assignment and Employee Attendance service access.'
              : typeof error.error?.message === 'string'
                ? error.error.message
                : 'Unable to load records. Please try again.';
        },
      });
  }
  turnPage(step: number) {
    this.page += step;
    this.load(false);
  }
  label(value: any) {
    return String(value ?? '—').replace(/_/g, ' ');
  }
  exportPage() {
    const columns =
      this.view === 'attendance'
        ? [
            'employee_code',
            'name',
            'branch',
            'status',
            'check_in',
            'check_out',
            'worked_hours',
            'short_hours',
            'incomplete',
            'approval_status',
          ]
        : this.view === 'leaves'
          ? [
              'employee_code',
              'name',
              'branch',
              'leave_type',
              'from_date',
              'to_date',
              'total_days',
              'status',
            ]
          : ['employee_code', 'name', 'branch', 'accrued', 'used', 'lapsed', 'available'];
    const quote = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const csv = [columns, ...this.data.rows.map((row) => columns.map((key) => row[key]))]
      .map((row) => row.map(quote).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `time-office-${this.view}-${this.data.date}-page-${this.page}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

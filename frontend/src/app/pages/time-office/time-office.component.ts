import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { TimeOfficeNotificationsComponent } from '../../shared/time-office-notifications.component';
import { TimeOfficeAutomationComponent } from './time-office-automation.component';
import { PageHeaderComponent, StatCardComponent, IconComponent } from '../../shared/ui';
import { StatcoWordmarkComponent } from '../../shared/components/statco-wordmark/statco-wordmark.component';
import { ResponsiveNavigationDirective } from '../../shared/directives/responsive-navigation.directive';

interface OfficeData {
  date?: string;
  workforce?: string;
  contractor?: string;
  rows: Record<string, any>[];
  branches: { id: string; name: string }[];
  contractors?: { id: string; name: string }[];
  summary: Record<string, number>;
  total: number;
  pageSize: number;
}

@Component({
  selector: 'app-time-office',
  standalone: true,
  host: { class: 'workspace-ui' },
  imports: [
    CommonModule,
    FormsModule,
    TimeOfficeNotificationsComponent,
    TimeOfficeAutomationComponent,
    PageHeaderComponent, StatCardComponent, IconComponent, StatcoWordmarkComponent,
    ResponsiveNavigationDirective,
  ],
  templateUrl: './time-office.component.html',
  styleUrl: './time-office.component.scss',
})
export class TimeOfficeComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  user = this.auth.getUser();
  clientLogoUrl = '';
  private readonly cdr = inject(ChangeDetectorRef);
  private profileRequest?: Subscription;
  private readonly http = inject(HttpClient);
  private request?: Subscription;
  readonly today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  date = this.today;
  branch = '';
  workforce = 'ALL';
  contractor = '';
  mobileOpen = false;
  search = '';
  hours = 9;
  issue = '';
  view = 'attendance';
  page = 1;
  loading = false;
  error = '';
  sending = '';
  notice = '';
  private loadedFilters = '';
  data: OfficeData = { rows: [], branches: [], summary: {}, total: 0, pageSize: 50 };
  readonly tabs = [
    { id: 'attendance', label: 'Attendance', icon: 'clock' },
    { id: 'leaves', label: 'Leaves', icon: 'calendar' },
    { id: 'coff', label: 'Comp-off', icon: 'clipboard' },
    { id: 'notifications', label: 'Notifications & escalations', icon: 'envelope' },
    { id: 'automation', label: 'Automatic follow-ups', icon: 'bolt' },
  ];
  readonly labels: Record<string, string> = {
    employees: 'Employees',
    workers: 'Total workforce',
    contractorWorkers: 'Contractor workers',
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
  get workforceLabel() {
    if (this.view !== 'attendance' || this.data.workforce === 'EMPLOYEE') return 'Client employees';
    return this.data.contractor || this.data.workforce === 'CONTRACTOR' ? 'Contractor workers' : 'Employees and contractor workers';
  }
  get pageTitle() {
    return this.view === 'attendance' ? 'Workforce attendance' : this.tabs.find(t => t.id === this.view)?.label || 'Time Office';
  }
  get pagePurpose() {
    return ({ attendance: 'Review employee and contractor attendance by branch and date. Follow up on missing or incomplete employee punches.',
      leaves: 'Review client employee leave applications for the selected month.',
      coff: 'Review client employee comp-off balances as of the selected date.',
      notifications: 'Track attendance reminders, replies and branch escalations.',
      automation: 'Manage automatic employee attendance reminders and review delivery issues.',
    } as Record<string, string>)[this.view];
  }
  private filters() {
    return { date: this.date, branch: this.branch, search: this.search, hours: String(this.hours),
      issue: this.issue, view: this.view, workforce: this.view === 'attendance' ? this.workforce : 'EMPLOYEE',
      contractor: this.view === 'attendance' ? this.contractor : '' };
  }
  get filtersPending() { return !!this.loadedFilters && this.loadedFilters !== JSON.stringify(this.filters()); }
  changeWorkforce() { this.contractor = ''; this.load(); }
  changeBranch() { this.contractor = ''; this.load(); }
  ngOnInit() {
    this.refreshBranding();
    this.profileRequest = this.auth.fetchMe().subscribe({
      next: () => { this.refreshBranding(); this.cdr.markForCheck(); },
      // A profile refresh failure must not prevent attendance review.
      error: () => {},
    });
    this.load();
  }
  private refreshBranding() {
    this.user = this.auth.getUser();
    const logo = this.user?.clientLogoUrl || this.user?.client?.logoUrl;
    this.clientLogoUrl = logo ? this.auth.authenticateUrl(logo) : '';
  }
  ngOnDestroy() {
    this.request?.unsubscribe();
    this.profileRequest?.unsubscribe();
  }
  switchView(view: string) {
    this.request?.unsubscribe();
    this.loading = false;
    this.mobileOpen = false;
    this.view = view;
    this.issue = '';
    this.notice = '';
    if (!['notifications', 'automation'].includes(view)) this.load();
  }
  followUp(row: Record<string, any>, target: 'EMPLOYEE' | 'BRANCH') {
    if (this.sending || !this.data.date || this.filtersPending || row['worker_type'] === 'CONTRACTOR') return;
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
    this.notice = '';
    this.data = { ...this.data, date: undefined, rows: [], summary: {}, total: 0 };
    const filters = this.filters();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date) || this.date > this.today || !Number.isFinite(this.hours) || this.hours <= 0 || this.hours > 24) {
      this.loading = false;
      this.error = 'Choose a valid review date and review hours between 0 and 24.';
      return;
    }
    this.request = this.http
      .get<OfficeData>(`${environment.apiBaseUrl}/api/v1/client/attendance/time-office`, {
        params: {
          ...filters,
          page: String(this.page),
        },
      })
      .subscribe({
        next: (data) => {
          this.data = data;
          this.loadedFilters = JSON.stringify(filters);
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
    if (this.loading || this.filtersPending) return;
    this.page += step;
    this.load(false);
  }
  label(value: any) {
    return String(value ?? '—').replace(/_/g, ' ');
  }
  exportPage() {
    if (this.loading || this.filtersPending || !this.data.rows.length) return;
    const columns =
      this.view === 'attendance'
        ? [
            'employee_code',
            'name',
            'branch',
            'worker_type',
            'contractor_name',
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

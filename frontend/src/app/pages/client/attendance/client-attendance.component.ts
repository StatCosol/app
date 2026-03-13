import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { ToastService } from '../../../shared/toast/toast.service';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { ClientPayrollService } from '../../../core/client-payroll.service';
import {
  AttendanceMismatch,
  AttendanceRecord,
  ClientAttendanceService,
} from './client-attendance.service';

interface AttendanceSummaryRow {
  employeeId: string;
  employeeCode: string;
  totalDays: number;
  daysPresent: number;
  halfDays: number;
  daysAbsent: number;
  daysOnLeave: number;
  holidays: number;
  weekOffs: number;
  effectivePresent: number;
  lopDays: number;
}

interface AttendanceIssue {
  key: string;
  employeeId: string;
  employeeCode: string;
  date: string;
  issue: string;
  detail: string;
  severity: 'HIGH' | 'MEDIUM';
  resolved: boolean;
  resolutionNote?: string;
}

@Component({
  selector: 'app-client-attendance',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Attendance Review & Payroll Handoff"
        subtitle="Validate monthly attendance, review mismatches and LOP preview, then handoff to payroll.">
        <ui-button variant="secondary" [disabled]="loading" (clicked)="loadWorkspace()">Refresh</ui-button>
      </ui-page-header>

      <section class="card mb-4">
        <div class="section-title">Month Selection</div>
        <div class="toolbar">
          <label>
            <span>Attendance Month</span>
            <input type="month" [(ngModel)]="selectedMonth" />
          </label>
          <label>
            <span>Branch ID (optional)</span>
            <input type="text" [(ngModel)]="branchId" placeholder="Filter by branch id" />
          </label>
          <div class="actions">
            <ui-button variant="primary" [disabled]="loading" (clicked)="loadWorkspace()">Load</ui-button>
          </div>
        </div>
      </section>

      <ui-loading-spinner *ngIf="loading" text="Loading attendance workspace..." size="lg"></ui-loading-spinner>

      <ng-container *ngIf="!loading">
        <section class="summary-grid mb-4">
          <article class="summary-card">
            <h4>Import Summary</h4>
            <div>{{ records.length }}</div>
            <p>Daily attendance rows</p>
          </article>
          <article class="summary-card">
            <h4>Employees Covered</h4>
            <div>{{ summaryRows.length }}</div>
            <p>Monthly summary rows</p>
          </article>
          <article class="summary-card">
            <h4>Mismatches</h4>
            <div>{{ mismatches.length }}</div>
            <p>Check-in/out and worked-hour gaps</p>
          </article>
          <article class="summary-card">
            <h4>LOP Employees</h4>
            <div>{{ lopRows.length }}</div>
            <p>Employees with LOP days</p>
          </article>
          <article class="summary-card">
            <h4>Invalid Rows</h4>
            <div>{{ invalidRecordCount }}</div>
            <p>Rows missing employee/date/status</p>
          </article>
        </section>

        <section class="grid-layout mb-4">
          <article class="card">
            <div class="section-head">
              <h3>Mismatch Resolution Queue</h3>
              <div class="head-actions">
                <span>{{ visibleMismatches.length }} shown / {{ mismatches.length }} total</span>
                <label class="toggle">
                  <input type="checkbox" [(ngModel)]="showUnresolvedOnly" />
                  <span>Unresolved only</span>
                </label>
                <ui-button
                  size="sm"
                  variant="ghost"
                  [disabled]="unresolvedMismatchCount === 0"
                  (clicked)="resolveAllMismatches()">
                  Resolve All
                </ui-button>
              </div>
            </div>

            <ui-empty-state
              *ngIf="!visibleMismatches.length"
              title="No mismatches"
              description="No attendance mismatches found for the selected filter.">
            </ui-empty-state>

            <div class="table-wrap" *ngIf="visibleMismatches.length">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Severity</th>
                    <th>Issue</th>
                    <th>Detail</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let row of visibleMismatches; trackBy: trackByKey">
                    <td>{{ row.employeeCode || row.employeeId }}</td>
                    <td>{{ row.date }}</td>
                    <td>
                      <span class="severity" [class.high]="row.severity === 'HIGH'">{{ row.severity }}</span>
                    </td>
                    <td>{{ row.issue }}</td>
                    <td>{{ row.detail }}</td>
                    <td>
                      <span class="state-chip" [class.resolved]="row.resolved">
                        {{ row.resolved ? 'RESOLVED' : 'OPEN' }}
                      </span>
                    </td>
                    <td>
                      <ui-button
                        size="sm"
                        [variant]="row.resolved ? 'secondary' : 'primary'"
                        (clicked)="toggleMismatchResolved(row)">
                        {{ row.resolved ? 'Reopen' : 'Resolve' }}
                      </ui-button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article class="card">
            <div class="section-head">
              <h3>LOP Preview</h3>
              <span>{{ lopRows.length }} employee(s)</span>
            </div>
            <ui-empty-state
              *ngIf="!lopRows.length"
              title="No LOP impact"
              description="No LOP days for the selected month.">
            </ui-empty-state>
            <div class="table-wrap" *ngIf="lopRows.length">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Present</th>
                    <th>Leave</th>
                    <th>Week Off</th>
                    <th>Holiday</th>
                    <th>LOP Days</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let row of lopRows; trackBy: trackBySummary">
                    <td>{{ row.employeeCode || row.employeeId }}</td>
                    <td>{{ row.daysPresent + (row.halfDays * 0.5) }}</td>
                    <td>{{ row.daysOnLeave }}</td>
                    <td>{{ row.weekOffs }}</td>
                    <td>{{ row.holidays }}</td>
                    <td class="lop">{{ row.lopDays }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section class="card action-footer">
          <div>
            <h3>Payroll Handoff</h3>
            <p>Approve attendance review and push monthly input to payroll workflow.</p>
            <small *ngIf="unresolvedMismatchCount > 0" class="error">
              Resolve {{ unresolvedMismatchCount }} open mismatch(es) before approval.
            </small>
            <small *ngIf="handoffMessage" [class.error]="handoffError">{{ handoffMessage }}</small>
          </div>
          <div class="actions">
            <ui-button
              variant="secondary"
              [disabled]="approving || handoffBusy || unresolvedMismatchCount > 0"
              [loading]="approving"
              (clicked)="approveAttendance()">
              Approve Attendance
            </ui-button>
            <ui-button
              variant="primary"
              [disabled]="!attendanceApproved || handoffBusy || approving"
              [loading]="handoffBusy"
              (clicked)="sendToPayroll()">
              Send to Payroll
            </ui-button>
          </div>
        </section>

        <section class="card mt-4">
          <div class="section-head">
            <h3>Handoff History (Selected Month)</h3>
            <span>{{ handoffHistory.length }} item(s)</span>
          </div>
          <ui-empty-state
            *ngIf="!handoffHistory.length"
            title="No handoff history"
            description="No attendance payroll handoffs found for this month.">
          </ui-empty-state>
          <div class="table-wrap" *ngIf="handoffHistory.length">
            <table>
              <thead>
                <tr>
                  <th>Input ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Files</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of handoffHistory; trackBy: trackByHandoff">
                  <td>{{ item.id }}</td>
                  <td>{{ item.title }}</td>
                  <td>
                    <span class="state-chip" [class.resolved]="item.status === 'SUBMITTED' || item.status === 'APPROVED'">
                      {{ item.status }}
                    </span>
                  </td>
                  <td>{{ item.filesCount }}</td>
                  <td>{{ item.createdAt | date:'dd MMM yyyy, hh:mm a' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </ng-container>
    </div>
  `,
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 1rem; box-shadow: 0 6px 20px rgba(15, 23, 42, .04); }
    .section-title { font-size: .95rem; font-weight: 700; color: #111827; margin-bottom: .6rem; }
    .toolbar { display: grid; grid-template-columns: 240px 1fr auto; gap: .7rem; align-items: end; }
    label { display: flex; flex-direction: column; gap: .35rem; }
    label > span { color: #4b5563; font-size: .78rem; font-weight: 600; }
    input { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: .5rem .65rem; font-size: .84rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .75rem; }
    .summary-card { background: linear-gradient(180deg, #fff 0%, #f8fafc 100%); border: 1px solid #e5e7eb; border-radius: 12px; padding: .75rem; }
    .summary-card h4 { margin: 0 0 .3rem; color: #6b7280; font-size: .76rem; text-transform: uppercase; letter-spacing: .02em; }
    .summary-card div { color: #111827; font-size: 1.28rem; font-weight: 700; line-height: 1.1; }
    .summary-card p { margin: .3rem 0 0; color: #6b7280; font-size: .74rem; }
    .grid-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .section-head { display: flex; justify-content: space-between; gap: .5rem; align-items: center; margin-bottom: .6rem; }
    .section-head h3 { margin: 0; font-size: 1rem; font-weight: 700; color: #111827; }
    .section-head span { font-size: .78rem; color: #6b7280; }
    .head-actions { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
    .toggle { display: inline-flex; align-items: center; gap: .3rem; font-size: .74rem; color: #4b5563; }
    .toggle input { width: auto; margin: 0; }
    .table-wrap { overflow: auto; }
    table { width: 100%; min-width: 520px; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e5e7eb; text-align: left; padding: .55rem .5rem; font-size: .8rem; color: #1f2937; }
    th { color: #6b7280; text-transform: uppercase; letter-spacing: .02em; font-size: .72rem; font-weight: 700; white-space: nowrap; }
    .lop { color: #b91c1c; font-weight: 700; }
    .severity { border: 1px solid #fdba74; color: #9a3412; background: #fff7ed; border-radius: 999px; font-size: .69rem; padding: .1rem .45rem; font-weight: 700; }
    .severity.high { border-color: #fca5a5; color: #991b1b; background: #fef2f2; }
    .state-chip { border: 1px solid #d1d5db; color: #4b5563; background: #f9fafb; border-radius: 999px; font-size: .69rem; padding: .1rem .45rem; font-weight: 700; }
    .state-chip.resolved { border-color: #86efac; color: #166534; background: #f0fdf4; }
    .mt-4 { margin-top: 1rem; }
    .action-footer { display: flex; justify-content: space-between; align-items: center; gap: .9rem; flex-wrap: wrap; }
    .action-footer h3 { margin: 0 0 .2rem; font-size: .95rem; color: #111827; }
    .action-footer p { margin: 0; font-size: .8rem; color: #6b7280; }
    small { color: #047857; font-size: .75rem; }
    small.error { color: #b91c1c; }
    .actions { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    @media (max-width: 980px) {
      .toolbar, .grid-layout, .summary-grid { grid-template-columns: 1fr; }
      .action-footer { align-items: flex-start; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientAttendanceComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  selectedMonth = this.defaultMonth();
  branchId = '';

  loading = false;
  approving = false;
  handoffBusy = false;
  showUnresolvedOnly = true;

  attendanceApproved = false;
  handoffMessage = '';
  handoffError = false;

  records: AttendanceRecord[] = [];
  summaryRows: AttendanceSummaryRow[] = [];
  mismatches: AttendanceIssue[] = [];
  lopRows: AttendanceSummaryRow[] = [];
  handoffHistory: Array<{
    id: string;
    title: string;
    status: string;
    filesCount: number;
    createdAt: string;
  }> = [];

  constructor(
    private readonly attendanceSvc: ClientAttendanceService,
    private readonly payrollSvc: ClientPayrollService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadWorkspace();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadWorkspace(): void {
    const { year, month, from, to } = this.monthRange(this.selectedMonth);
    this.loading = true;
    this.attendanceApproved = false;
    this.handoffMessage = '';
    this.handoffError = false;
    this.handoffHistory = [];

    forkJoin({
      records: this.attendanceSvc.list({
        from,
        to,
        branchId: this.branchId.trim() || undefined,
      }).pipe(catchError(() => of([]))),
      summary: this.attendanceSvc
        .summary(year, month, this.branchId.trim() || undefined)
        .pipe(catchError(() => of([]))),
      mismatches: this.attendanceSvc
        .mismatches(year, month, this.branchId.trim() || undefined)
        .pipe(catchError(() => of([]))),
      lopPreview: this.attendanceSvc
        .lopPreview(year, month, this.branchId.trim() || undefined)
        .pipe(catchError(() => of([]))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ records, summary, mismatches, lopPreview }) => {
          this.records = records || [];
          this.summaryRows = this.normalizeSummary(summary || []);
          this.mismatches = this.normalizeMismatches(mismatches || []);
          if (!this.mismatches.length) {
            // Fallback to client-side mismatch derivation if API response is empty/unavailable.
            this.mismatches = this.buildMismatches(this.records);
          }
          this.lopRows = this.normalizeSummary(lopPreview || []);
          if (!this.lopRows.length) {
            // Fallback to summary-derived LOP when preview API response is empty/unavailable.
            this.lopRows = this.summaryRows
              .filter((row) => Number(row.lopDays || 0) > 0)
              .sort((a, b) => Number(b.lopDays || 0) - Number(a.lopDays || 0));
          }
          this.loadHandoffHistory(year, month);
        },
        error: (err) => {
          this.records = [];
          this.summaryRows = [];
          this.mismatches = [];
          this.lopRows = [];
          this.handoffHistory = [];
          this.toast.error(err?.error?.message || 'Could not load attendance workspace.');
        },
      });
  }

  approveAttendance(): void {
    if (this.approving || this.handoffBusy) return;
    if (this.unresolvedMismatchCount > 0) {
      this.handoffMessage = `Resolve ${this.unresolvedMismatchCount} open mismatch(es) before approval.`;
      this.handoffError = true;
      this.toast.error(this.handoffMessage);
      return;
    }
    this.approving = true;
    this.handoffMessage = '';
    this.handoffError = false;

    setTimeout(() => {
      this.approving = false;
      this.attendanceApproved = true;
      this.handoffMessage = 'Attendance review approved. You can now handoff to payroll.';
      this.toast.success('Attendance review approved for payroll handoff.');
      this.cdr.markForCheck();
    }, 300);
  }

  sendToPayroll(): void {
    if (!this.attendanceApproved || this.handoffBusy) return;
    const { year, month } = this.monthRange(this.selectedMonth);
    const monthText = `${this.monthName(month)} ${year}`;
    const remarks = [
      `Attendance handoff for ${monthText}`,
      `Mismatches: ${this.mismatches.length}`,
      `LOP employees: ${this.lopRows.length}`,
      this.branchId.trim() ? `Branch: ${this.branchId.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    this.handoffBusy = true;
    this.payrollSvc
      .createInput({
        title: `Attendance Handoff - ${monthText}`,
        periodYear: year,
        periodMonth: month,
        branchId: this.branchId.trim() || undefined,
        notes: remarks,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.handoffBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (created: any) => {
          const inputId = String(created?.id || '');
          if (!inputId) {
            this.handoffMessage = 'Attendance handoff created but input id missing in response.';
            this.handoffError = true;
            return;
          }
          this.payrollSvc
            .updateInputStatus(inputId, {
              status: 'SUBMITTED',
              remarks: `Auto-submitted from Attendance workspace. ${remarks}`,
            })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.handoffMessage = 'Attendance sent to payroll successfully.';
                this.handoffError = false;
                this.toast.success('Attendance has been submitted to payroll.');
                this.loadHandoffHistory(year, month);
              },
              error: (err) => {
                this.handoffMessage =
                  err?.error?.message ||
                  'Payroll input created, but auto-submit failed. Please submit manually from Payroll page.';
                this.handoffError = true;
                this.toast.error(this.handoffMessage);
                this.loadHandoffHistory(year, month);
              },
            });
        },
        error: (err) => {
          this.handoffMessage = err?.error?.message || 'Could not send attendance to payroll.';
          this.handoffError = true;
          this.toast.error(this.handoffMessage);
        },
      });
  }

  trackBySummary(_index: number, row: AttendanceSummaryRow): string {
    return row.employeeId || row.employeeCode || String(_index);
  }

  trackByKey(_index: number, row: AttendanceIssue): string {
    return row.key || String(_index);
  }

  trackByHandoff(_index: number, row: { id: string }): string {
    return row.id || String(_index);
  }

  toggleMismatchResolved(issue: AttendanceIssue): void {
    issue.resolved = !issue.resolved;
    this.cdr.markForCheck();
  }

  resolveAllMismatches(): void {
    this.mismatches.forEach((row) => {
      row.resolved = true;
    });
    this.cdr.markForCheck();
  }

  get visibleMismatches(): AttendanceIssue[] {
    if (!this.showUnresolvedOnly) return this.mismatches;
    return this.mismatches.filter((row) => !row.resolved);
  }

  get unresolvedMismatchCount(): number {
    return this.mismatches.filter((row) => !row.resolved).length;
  }

  get invalidRecordCount(): number {
    return this.records.filter((row) => {
      const hasEmployee = String(row.employeeId || '').trim().length > 0;
      const hasDate = String(row.date || '').trim().length > 0;
      const hasStatus = String(row.status || '').trim().length > 0;
      return !(hasEmployee && hasDate && hasStatus);
    }).length;
  }

  private normalizeSummary(rows: any[]): AttendanceSummaryRow[] {
    return (rows || []).map((row) => ({
      employeeId: String(row?.employeeId || row?.employee_id || ''),
      employeeCode: String(row?.employeeCode || row?.employee_code || ''),
      totalDays: Number(row?.totalDays || row?.total_days || 0),
      daysPresent: Number(row?.daysPresent || row?.present || 0),
      halfDays: Number(row?.halfDays || row?.half_day || 0),
      daysAbsent: Number(row?.daysAbsent || row?.absent || 0),
      daysOnLeave: Number(row?.daysOnLeave || row?.onLeave || 0),
      holidays: Number(row?.holidays || row?.holiday || 0),
      weekOffs: Number(row?.weekOffs || row?.weekOff || 0),
      effectivePresent: Number(row?.effectivePresent || 0),
      lopDays: Number(row?.lopDays || 0),
    }));
  }

  private normalizeMismatches(rows: AttendanceMismatch[]): AttendanceIssue[] {
    return (rows || []).map((row) => ({
      key: String(row?.key || ''),
      employeeId: String(row?.employeeId || ''),
      employeeCode: String(row?.employeeCode || ''),
      date: String(row?.date || ''),
      issue: String(row?.issue || 'Mismatch'),
      detail: String(row?.detail || ''),
      severity: row?.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
      resolved: !!row?.resolved,
    }));
  }

  private buildMismatches(rows: AttendanceRecord[]): AttendanceIssue[] {
    const out: AttendanceIssue[] = [];
    for (const row of rows) {
      const status = String(row.status || '').toUpperCase();
      const checkInMissing = !String(row.checkIn || '').trim();
      const checkOutMissing = !String(row.checkOut || '').trim();
      const workedHours = Number(row.workedHours || 0);

      if ((status === 'PRESENT' || status === 'HALF_DAY') && (checkInMissing || checkOutMissing)) {
        out.push({
          key: `${row.id}-clock`,
          employeeId: row.employeeId,
          employeeCode: row.employeeCode,
          date: row.date,
          issue: 'Missing Check Time',
          detail: `Check-in: ${row.checkIn || '-'}, Check-out: ${row.checkOut || '-'}`,
          severity: 'HIGH',
          resolved: false,
        });
      }

      if (status === 'PRESENT' && workedHours <= 0) {
        out.push({
          key: `${row.id}-hours`,
          employeeId: row.employeeId,
          employeeCode: row.employeeCode,
          date: row.date,
          issue: 'Invalid Worked Hours',
          detail: `Worked hours is ${row.workedHours ?? 0}`,
          severity: 'MEDIUM',
          resolved: false,
        });
      }
    }
    return out;
  }

  private loadHandoffHistory(year: number, month: number): void {
    this.payrollSvc
      .listInputs({
        periodYear: year,
        periodMonth: month,
        branchId: this.branchId.trim() || undefined,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const rows = Array.isArray(res) ? res : res?.data || [];
          this.handoffHistory = rows
            .filter((item: any) => String(item?.title || '').toLowerCase().includes('attendance handoff'))
            .map((item: any) => ({
              id: String(item?.id || ''),
              title: String(item?.title || ''),
              status: String(item?.status || 'DRAFT'),
              filesCount: Number(item?.filesCount || 0),
              createdAt: String(item?.createdAt || ''),
            }))
            .sort(
              (a: { createdAt: string }, b: { createdAt: string }) =>
                String(b.createdAt).localeCompare(String(a.createdAt)),
            );
          this.cdr.markForCheck();
        },
        error: () => {
          this.handoffHistory = [];
          this.cdr.markForCheck();
        },
      });
  }

  private monthRange(monthValue: string): { year: number; month: number; from: string; to: string } {
    const [yRaw, mRaw] = String(monthValue || '').split('-');
    const year = Number(yRaw || new Date().getFullYear());
    const month = Number(mRaw || new Date().getMonth() + 1);
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { year, month, from, to };
  }

  private monthName(month: number): string {
    const names = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return names[Math.max(0, Math.min(11, month - 1))];
  }

  private defaultMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}

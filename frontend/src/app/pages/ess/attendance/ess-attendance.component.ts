import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import {
  EssApiService,
  EssAttendanceRecord,
  EssAttendanceSummary,
  EssHoliday,
} from '../ess-api.service';
import { ToastService } from '../../../shared/toast/toast.service';

interface CalendarDay {
  date: string;
  day: number;
  weekday: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  remarks: string | null;
}

interface StatusLegendItem {
  code: string;
  label: string;
  cssClass: string;
}

@Component({
  selector: 'app-ess-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6 max-w-6xl mx-auto">
      <div class="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Attendance + Holidays</h1>
          <p class="text-sm text-gray-500">Self-attendance visibility with holiday calendar and discrepancy note</p>
        </div>
        <div class="flex items-end gap-2">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Month</label>
            <input type="month" [(ngModel)]="selectedMonth" class="input-sm" />
          </div>
          <button class="btn-secondary" [disabled]="loading" (click)="load()">{{ loading ? 'Loading...' : 'Refresh' }}</button>
        </div>
      </div>

      <div *ngIf="error" class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{{ error }}</div>

      <div class="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div class="card stat">
          <div class="lbl">Worked Days</div>
          <div class="val text-green-600">{{ summary?.workedDays ?? 0 }}</div>
        </div>
        <div class="card stat">
          <div class="lbl">Present</div>
          <div class="val">{{ summary?.present ?? 0 }}</div>
        </div>
        <div class="card stat">
          <div class="lbl">Absent</div>
          <div class="val text-red-600">{{ summary?.absent ?? 0 }}</div>
        </div>
        <div class="card stat">
          <div class="lbl">Leave / Half Day</div>
          <div class="val text-amber-600">{{ (summary?.onLeave ?? 0) + (summary?.halfDay ?? 0) }}</div>
        </div>
        <div class="card stat">
          <div class="lbl">Present Rate</div>
          <div class="val text-blue-600">{{ presentRate }}%</div>
        </div>
        <div class="card stat">
          <div class="lbl">Unmarked / Incomplete</div>
          <div class="val text-orange-600">{{ unmarkedCount + incompletePunchCount }}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div class="xl:col-span-2 card p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-semibold text-gray-900">Attendance Calendar</h2>
            <div class="text-xs text-gray-500">{{ selectedMonth }}</div>
          </div>

          <div class="flex flex-wrap gap-2 mb-3">
            <span
              *ngFor="let item of legend"
              class="inline-flex items-center gap-1 text-[11px] rounded-full border px-2 py-0.5 text-gray-700">
              <span class="status-dot" [ngClass]="item.cssClass"></span>{{ item.code }} - {{ item.label }}
            </span>
          </div>

          <div class="grid grid-cols-7 gap-2 mb-2 text-[11px] font-semibold uppercase text-gray-500 px-1">
            <div *ngFor="let wd of weekdays">{{ wd }}</div>
          </div>

          <div class="grid grid-cols-7 gap-2">
            <div *ngFor="let day of calendarDays" class="day-cell" [ngClass]="statusClass(day.status)">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold">{{ day.day }}</span>
                <span class="text-[10px] status-pill">{{ statusShort(day.status) }}</span>
              </div>
              <div class="text-[10px] mt-2 text-gray-600 truncate" *ngIf="day.checkIn || day.checkOut">
                {{ day.checkIn || '--' }} - {{ day.checkOut || '--' }}
              </div>
              <div class="text-[10px] mt-1 text-gray-500 truncate" *ngIf="day.remarks">{{ day.remarks }}</div>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <div class="card p-4">
            <h2 class="text-base font-semibold text-gray-900 mb-3">Holiday List</h2>
            <div *ngIf="!holidays.length" class="text-sm text-gray-500">No holidays marked for this month.</div>
            <div *ngFor="let h of holidays" class="holiday-row">
              <div>
                <div class="font-medium text-sm text-gray-900">{{ h.label || (h.status === 'WEEK_OFF' ? 'Weekly Off' : 'Holiday') }}</div>
                <div class="text-xs text-gray-500">{{ h.date | date:'EEE, d MMM y' }}</div>
              </div>
              <span class="tag" [ngClass]="h.status === 'WEEK_OFF' ? 'tag-weekoff' : 'tag-holiday'">{{ h.status }}</span>
            </div>
          </div>

          <div class="card p-4">
            <h2 class="text-base font-semibold text-gray-900 mb-2">Discrepancy / Contact HR</h2>
            <p class="text-xs text-gray-500 mb-2">Raise a note if attendance status is incorrect.</p>
            <textarea
              [(ngModel)]="discrepancyNote"
              rows="4"
              maxlength="500"
              class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Describe date(s) and correction needed..."
            ></textarea>
            <div class="space-y-1 mt-2" *ngIf="discrepancyGuardrails.length">
              <div
                *ngFor="let issue of discrepancyGuardrails"
                class="text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-700 px-2 py-1">
                {{ issue }}
              </div>
            </div>
            <div class="flex justify-between items-center mt-2">
              <span class="text-xs text-gray-400">{{ discrepancyNote.length }}/500</span>
              <button class="btn-primary" [disabled]="!canRaiseDiscrepancy" (click)="raiseDiscrepancy()">Raise Note</button>
            </div>
          </div>

          <div class="card p-4">
            <h2 class="text-base font-semibold text-gray-900 mb-2">Quality Signals</h2>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="rounded-md border border-orange-200 bg-orange-50 text-orange-700 px-2 py-1">
                Unmarked days: {{ unmarkedCount }}
              </div>
              <div class="rounded-md border border-amber-200 bg-amber-50 text-amber-700 px-2 py-1">
                Incomplete punches: {{ incompletePunchCount }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
      .stat { padding: 14px 16px; }
      .lbl { font-size: 12px; color: #6b7280; }
      .val { font-size: 24px; font-weight: 700; color: #111827; margin-top: 2px; }
      .input-sm { border: 1px solid #d1d5db; border-radius: 0.5rem; padding: 0.375rem 0.75rem; font-size: 0.875rem; min-width: 140px; }
      .btn-primary { background: #1d4ed8; color: #fff; border: none; border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 600; }
      .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      .btn-secondary { background: #f9fafb; color: #374151; border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 600; }
      .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
      .day-cell { border: 1px solid #f1f5f9; border-radius: 10px; min-height: 72px; padding: 8px; background: #fff; }
      .day-cell.state-present { background: #f0fdf4; border-color: #bbf7d0; }
      .day-cell.state-absent { background: #fef2f2; border-color: #fecaca; }
      .day-cell.state-half_day, .day-cell.state-on_leave { background: #fffbeb; border-color: #fde68a; }
      .day-cell.state-holiday, .day-cell.state-week_off { background: #eff6ff; border-color: #bfdbfe; }
      .status-pill { border-radius: 9999px; padding: 2px 6px; background: #f3f4f6; color: #374151; }
      .holiday-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid #f3f4f6; padding: 10px 0; }
      .holiday-row:first-of-type { border-top: 0; }
      .tag { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; }
      .tag-holiday { background: #dbeafe; color: #1e40af; }
      .tag-weekoff { background: #f3e8ff; color: #6b21a8; }
      .status-dot { width: 8px; height: 8px; border-radius: 9999px; display: inline-block; border: 1px solid #d1d5db; }
      .status-dot.state-present { background: #16a34a; border-color: #16a34a; }
      .status-dot.state-absent { background: #dc2626; border-color: #dc2626; }
      .status-dot.state-half_day, .status-dot.state-on_leave { background: #d97706; border-color: #d97706; }
      .status-dot.state-holiday, .status-dot.state-week_off { background: #2563eb; border-color: #2563eb; }
    `,
  ],
})
export class EssAttendanceComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  selectedMonth = new Date().toISOString().slice(0, 7);
  loading = false;
  error = '';

  summary: EssAttendanceSummary | null = null;
  holidays: EssHoliday[] = [];
  records: EssAttendanceRecord[] = [];
  calendarDays: CalendarDay[] = [];
  weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  legend: StatusLegendItem[] = [
    { code: 'P', label: 'Present', cssClass: 'state-present' },
    { code: 'A', label: 'Absent', cssClass: 'state-absent' },
    { code: 'HD', label: 'Half Day', cssClass: 'state-half_day' },
    { code: 'L', label: 'Leave', cssClass: 'state-on_leave' },
    { code: 'H', label: 'Holiday', cssClass: 'state-holiday' },
    { code: 'WO', label: 'Week Off', cssClass: 'state-week_off' },
  ];

  discrepancyNote = '';

  constructor(
    private readonly api: EssApiService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get unmarkedCount(): number {
    return this.calendarDays.filter((day) => String(day.status || '').toUpperCase() === 'UNMARKED').length;
  }

  get incompletePunchCount(): number {
    return this.records.filter((record) => {
      const hasIn = !!String(record.checkIn || '').trim();
      const hasOut = !!String(record.checkOut || '').trim();
      return (hasIn && !hasOut) || (!hasIn && hasOut);
    }).length;
  }

  get presentRate(): number {
    const considered = (this.summary?.present || 0) + (this.summary?.absent || 0) + (this.summary?.halfDay || 0);
    if (!considered) return 0;
    return Number((((this.summary?.present || 0) / considered) * 100).toFixed(1));
  }

  get discrepancyGuardrails(): string[] {
    const issues: string[] = [];
    const note = this.discrepancyNote.trim();
    if (this.isFutureMonth(this.selectedMonth)) {
      issues.push('Future month discrepancy note is not allowed.');
    }
    if (!note) {
      issues.push('Enter discrepancy details before raising a note.');
    } else {
      if (note.length < 12) {
        issues.push('Discrepancy note should be at least 12 characters.');
      }
      if (!/\d/.test(note)) {
        issues.push('Include at least one date/day reference in the discrepancy note.');
      }
    }
    return issues;
  }

  get canRaiseDiscrepancy(): boolean {
    return this.discrepancyGuardrails.length === 0;
  }

  load(): void {
    if (this.isFutureMonth(this.selectedMonth)) {
      this.error = 'Future month cannot be selected for attendance review.';
      this.summary = null;
      this.holidays = [];
      this.records = [];
      this.calendarDays = [];
      return;
    }

    this.loading = true;
    this.error = '';

    forkJoin({
      attendance: this.api.getAttendance(this.selectedMonth).pipe(catchError(() => of({ month: this.selectedMonth, daysInMonth: 31, records: [] }))),
      summary: this.api.getAttendanceSummary(this.selectedMonth).pipe(catchError(() => of(null))),
      holidays: this.api.getHolidays(this.selectedMonth).pipe(catchError(() => of({ month: this.selectedMonth, items: [] }))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
        }),
      )
      .subscribe({
        next: ({ attendance, summary, holidays }) => {
          this.summary = summary as EssAttendanceSummary | null;
          this.holidays = holidays?.items || [];
          this.records = attendance?.records || [];
          this.buildCalendar(attendance?.daysInMonth || this.daysInSelectedMonth());
        },
        error: () => {
          this.error = 'Unable to load attendance data.';
          this.summary = null;
          this.holidays = [];
          this.records = [];
          this.calendarDays = [];
        },
      });
  }

  statusClass(status: string): string {
    return `state-${String(status || 'UNKNOWN').toLowerCase()}`;
  }

  statusShort(status: string): string {
    const s = String(status || '').toUpperCase();
    if (s === 'PRESENT') return 'P';
    if (s === 'ABSENT') return 'A';
    if (s === 'HALF_DAY') return 'HD';
    if (s === 'ON_LEAVE') return 'L';
    if (s === 'HOLIDAY') return 'H';
    if (s === 'WEEK_OFF') return 'WO';
    return '--';
  }

  raiseDiscrepancy(): void {
    if (!this.canRaiseDiscrepancy) {
      this.toast.error(this.discrepancyGuardrails[0] || 'Unable to raise discrepancy note.');
      return;
    }

    const note = this.discrepancyNote.trim();
    const subject = encodeURIComponent(`Attendance discrepancy (${this.selectedMonth})`);
    const body = encodeURIComponent(note);
    window.location.href = `mailto:hr@company.com?subject=${subject}&body=${body}`;
    this.toast.success('Discrepancy note prepared for HR.');
    this.discrepancyNote = '';
  }

  private buildCalendar(daysInMonth: number): void {
    const [year, month] = this.selectedMonth.split('-').map((v) => parseInt(v, 10));
    const recordMap = new Map<string, EssAttendanceRecord>();
    for (const rec of this.records) {
      recordMap.set(rec.date, rec);
    }

    const days: CalendarDay[] = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(Date.UTC(year, month - 1, day));
      const date = d.toISOString().slice(0, 10);
      const rec = recordMap.get(date);
      days.push({
        date,
        day,
        weekday: this.weekdays[d.getUTCDay()],
        status: rec?.status || 'UNMARKED',
        checkIn: rec?.checkIn || null,
        checkOut: rec?.checkOut || null,
        remarks: rec?.remarks || null,
      });
    }
    this.calendarDays = days;
  }

  private daysInSelectedMonth(): number {
    const [year, month] = this.selectedMonth.split('-').map((v) => parseInt(v, 10));
    return new Date(year, month, 0).getDate();
  }

  private isFutureMonth(month: string): boolean {
    if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return false;
    const selected = new Date(`${month}-01T00:00:00`);
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return selected.getTime() > currentMonth.getTime();
  }
}

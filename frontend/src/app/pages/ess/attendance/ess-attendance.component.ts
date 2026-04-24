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
  TodayAttendance,
  CheckInOutPayload,
  OvertimeSummary,
  CompOffBalance,
  CompOffEntry,
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

type CaptureMethod = 'MANUAL' | 'BIOMETRIC' | 'FACE' | 'GEOLOCATION';

@Component({
  selector: 'app-ess-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6 max-w-6xl mx-auto">
      <div class="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Attendance</h1>
          <p class="text-sm text-gray-500">Mark your daily attendance and view monthly records</p>
        </div>
        <div class="flex items-end gap-2">
          <div>
            <label for="att-month" class="block text-xs text-gray-500 mb-1">Month</label>
            <input autocomplete="off" type="month" id="att-month" name="selectedMonth" [(ngModel)]="selectedMonth" class="input-sm" />
          </div>
          <button class="btn-secondary" [disabled]="loading" (click)="load()">{{ loading ? 'Loading...' : 'Refresh' }}</button>
        </div>
      </div>

      <div *ngIf="error" class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{{ error }}</div>

      <!-- ── Check-In / Check-Out Panel ── -->
      <div class="checkin-panel">
        <div class="checkin-left">
          <div class="checkin-status-row">
            <div class="checkin-date-block">
              <div class="text-xs text-gray-500 uppercase tracking-wider">Today</div>
              <div class="text-lg font-bold text-gray-900">{{ todayFormatted }}</div>
            </div>
            <div class="checkin-live-time">
              <span class="live-dot"></span>
              <span class="text-2xl font-mono font-bold text-gray-900">{{ liveTime }}</span>
            </div>
          </div>

          <div class="checkin-times">
            <div class="time-box" [class.done]="todayRecord?.checkIn">
              <div class="time-label">Check-In</div>
              <div class="time-val">{{ todayRecord?.checkIn || '--:--' }}</div>
            </div>
            <div class="time-arrow">&rarr;</div>
            <div class="time-box" [class.done]="todayRecord?.checkOut">
              <div class="time-label">Check-Out</div>
              <div class="time-val">{{ todayRecord?.checkOut || '--:--' }}</div>
            </div>
            <div class="time-box worked" *ngIf="todayRecord?.checkIn && todayRecord?.checkOut">
              <div class="time-label">Worked</div>
              <div class="time-val">{{ todayWorkedDisplay }}</div>
            </div>
          </div>
        </div>

        <div class="checkin-right">
          <!-- Capture Method Selector -->
          <div class="capture-method-section">
            <label class="text-xs text-gray-500 font-medium mb-1 block">Capture Method</label>
            <div class="capture-options">
              <label *ngFor="let opt of captureOptions" class="capture-opt"
                     [class.active]="selectedCapture === opt.value"
                     [class.disabled]="opt.comingSoon">
                <input type="radio" name="captureMethod" [value]="opt.value"
                       [(ngModel)]="selectedCapture" [disabled]="opt.comingSoon" class="sr-only" />
                <span class="capture-icon" [innerHTML]="opt.icon"></span>
                <span class="capture-label">{{ opt.label }}</span>
                <span class="capture-badge" *ngIf="opt.comingSoon">Soon</span>
              </label>
            </div>
          </div>

          <div class="checkin-actions">
            <button class="btn-checkin"
                    [disabled]="checkingIn || !!todayRecord?.checkIn"
                    (click)="doCheckIn()">
              <span *ngIf="checkingIn">Checking In...</span>
              <span *ngIf="!checkingIn && !todayRecord?.checkIn">Check In</span>
              <span *ngIf="!checkingIn && todayRecord?.checkIn">Checked In ✓</span>
            </button>
            <button class="btn-checkout"
                    [disabled]="checkingOut || !todayRecord?.checkIn || !!todayRecord?.checkOut"
                    (click)="doCheckOut()">
              <span *ngIf="checkingOut">Checking Out...</span>
              <span *ngIf="!checkingOut && !todayRecord?.checkOut">Check Out</span>
              <span *ngIf="!checkingOut && todayRecord?.checkOut">Checked Out ✓</span>
            </button>
          </div>

          <div class="geo-info" *ngIf="geoStatus">
            <span class="geo-icon">📍</span>
            <span class="text-[11px] text-gray-500">{{ geoStatus }}</span>
          </div>
        </div>
      </div>

      <!-- ── Summary Cards ── -->
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

      <!-- ── Overtime & Comp-Off Panel ── -->
      <div *ngIf="otSummary || coffBalance" class="ot-panel">
        <div class="ot-header">
          <h2 class="text-base font-semibold text-gray-900">Overtime &amp; Comp-Off</h2>
          <span class="ot-eligibility-badge" [ngClass]="otSummary?.otEligibility === 'COMP_OFF' ? 'badge-coff' : 'badge-ot'">
            {{ otSummary?.otEligibility === 'COMP_OFF' ? 'C/Off Eligible' : 'OT Pay Eligible' }}
          </span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <div class="ot-stat">
            <div class="ot-stat-label">Total OT Hours</div>
            <div class="ot-stat-value text-blue-600">{{ otSummary?.totalOtHours ?? '0.00' }}</div>
          </div>
          <div class="ot-stat" *ngIf="otSummary?.otEligibility === 'COMP_OFF'">
            <div class="ot-stat-label">C/Off Accrued (Month)</div>
            <div class="ot-stat-value text-green-600">{{ otSummary?.coffOtHours ?? '0.00' }}h</div>
          </div>
          <div class="ot-stat" *ngIf="otSummary?.otEligibility === 'OT_PAY'">
            <div class="ot-stat-label">Paid OT Hours</div>
            <div class="ot-stat-value text-green-600">{{ otSummary?.paidOtHours ?? '0.00' }}</div>
          </div>
          <div class="ot-stat">
            <div class="ot-stat-label">Short Days</div>
            <div class="ot-stat-value text-amber-600">{{ otSummary?.shortDays ?? 0 }}</div>
          </div>
          <div class="ot-stat">
            <div class="ot-stat-label">Reasons Pending</div>
            <div class="ot-stat-value text-red-600">{{ otSummary?.shortDaysPending ?? 0 }}</div>
          </div>
        </div>

        <div *ngIf="coffBalance" class="mt-3 flex flex-wrap items-center gap-4">
          <div class="coff-balance-row">
            <span class="coff-lbl">C/Off Balance:</span>
            <span class="coff-val text-green-700">{{ coffBalance.available }} day(s)</span>
            <span class="text-xs text-gray-400">(Accrued: {{ coffBalance.accrued }} | Used: {{ coffBalance.used }} | Lapsed: {{ coffBalance.lapsed }})</span>
          </div>
          <button class="btn-secondary text-xs" (click)="loadCoffLedger()">
            {{ showCoffLedger ? 'Hide Ledger' : 'View Ledger' }}
          </button>
        </div>

        <div *ngIf="showCoffLedger && coffLedger.length" class="mt-3 overflow-x-auto">
          <table class="coff-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let entry of coffLedger">
                <td>{{ entry.entryDate | date:'d MMM y' }}</td>
                <td>
                  <span class="tag" [ngClass]="entry.entryType === 'ACCRUAL' ? 'tag-accrual' : entry.entryType === 'USED' ? 'tag-used' : 'tag-lapsed'">
                    {{ entry.entryType }}
                  </span>
                </td>
                <td>{{ entry.days }}</td>
                <td class="text-xs text-gray-600">{{ entry.reason || '-' }}</td>
                <td class="text-xs text-gray-500">{{ entry.remarks || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Short Work Reason Modal ── -->
      <div *ngIf="showShortReasonModal" class="modal-overlay" (click)="showShortReasonModal = false">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-bold text-gray-900 mb-2">Short Work Day</h3>
          <p class="text-sm text-gray-600 mb-3">You worked less than 9 hours today. Please provide a reason.</p>
          <textarea autocomplete="off"
            id="short-reason"
            name="shortReasonText"
            [(ngModel)]="shortReasonText"
            rows="3"
            maxlength="500"
            class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Enter reason for short work day..."
          ></textarea>
          <div class="flex justify-end gap-2 mt-3">
            <button class="btn-secondary" (click)="showShortReasonModal = false">Later</button>
            <button class="btn-primary" [disabled]="submittingReason || shortReasonText.trim().length < 5" (click)="submitShortReason()">
              {{ submittingReason ? 'Submitting...' : 'Submit Reason' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ── Calendar + Sidebar ── -->
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
            <textarea autocomplete="off"
              id="att-discrepancy"
              name="discrepancyNote"
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

      /* ── Check-In Panel ── */
      .checkin-panel {
        background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
        border-radius: 16px; padding: 24px; display: flex; gap: 24px;
        flex-wrap: wrap; color: #fff;
      }
      .checkin-left { flex: 1; min-width: 260px; }
      .checkin-right { flex: 1; min-width: 260px; display: flex; flex-direction: column; gap: 16px; }
      .checkin-status-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
      .checkin-date-block .text-xs { color: #94a3b8; }
      .checkin-date-block .text-lg { color: #f1f5f9; }
      .checkin-live-time { display: flex; align-items: center; gap: 8px; }
      .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: pulse 2s infinite; }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      .checkin-times { display: flex; align-items: center; gap: 12px; }
      .time-box { background: rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 16px; text-align: center; min-width: 90px; }
      .time-box.done { background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); }
      .time-box.worked { background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); }
      .time-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
      .time-val { font-size: 18px; font-weight: 700; color: #f1f5f9; margin-top: 2px; }
      .time-arrow { font-size: 18px; color: #64748b; }

      /* ── Capture Method ── */
      .capture-method-section label.text-xs { color: #94a3b8; }
      .capture-options { display: flex; gap: 8px; flex-wrap: wrap; }
      .capture-opt {
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        padding: 8px 12px; border-radius: 10px; cursor: pointer;
        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
        transition: all 0.2s; min-width: 70px; position: relative;
      }
      .capture-opt:hover:not(.disabled) { background: rgba(255,255,255,0.12); }
      .capture-opt.active { background: rgba(99,102,241,0.2); border-color: #6366f1; }
      .capture-opt.disabled { opacity: 0.4; cursor: not-allowed; }
      .capture-icon { font-size: 20px; line-height: 1; }
      .capture-label { font-size: 10px; color: #cbd5e1; font-weight: 600; }
      .capture-badge {
        position: absolute; top: -4px; right: -4px;
        background: #f59e0b; color: #000; font-size: 8px; font-weight: 700;
        padding: 1px 5px; border-radius: 6px; text-transform: uppercase;
      }

      /* ── Buttons ── */
      .checkin-actions { display: flex; gap: 10px; }
      .btn-checkin {
        flex: 1; padding: 12px; border: none; border-radius: 10px; font-weight: 700; font-size: 14px;
        background: #22c55e; color: #fff; cursor: pointer; transition: all 0.2s;
      }
      .btn-checkin:hover:not(:disabled) { background: #16a34a; }
      .btn-checkin:disabled { opacity: 0.5; cursor: not-allowed; background: #4ade80; }
      .btn-checkout {
        flex: 1; padding: 12px; border: none; border-radius: 10px; font-weight: 700; font-size: 14px;
        background: #ef4444; color: #fff; cursor: pointer; transition: all 0.2s;
      }
      .btn-checkout:hover:not(:disabled) { background: #dc2626; }
      .btn-checkout:disabled { opacity: 0.5; cursor: not-allowed; background: #f87171; }

      .geo-info { display: flex; align-items: center; gap: 4px; }
      .geo-icon { font-size: 14px; }

      /* ── OT / Comp-Off Panel ── */
      .ot-panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 20px; }
      .ot-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
      .ot-eligibility-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; }
      .badge-coff { background: #dcfce7; color: #15803d; }
      .badge-ot { background: #dbeafe; color: #1e40af; }
      .ot-stat { background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 10px; padding: 10px 14px; }
      .ot-stat-label { font-size: 11px; color: #6b7280; }
      .ot-stat-value { font-size: 22px; font-weight: 700; margin-top: 2px; }
      .coff-balance-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .coff-lbl { font-size: 13px; font-weight: 600; color: #374151; }
      .coff-val { font-size: 16px; font-weight: 700; }
      .coff-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .coff-table th { text-align: left; padding: 6px 10px; background: #f9fafb; color: #6b7280; font-weight: 600; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
      .coff-table td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; }
      .tag-accrual { background: #dcfce7; color: #15803d; }
      .tag-used { background: #fef3c7; color: #92400e; }
      .tag-lapsed { background: #fee2e2; color: #991b1b; }

      /* ── Modal ── */
      .modal-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex;
        align-items: center; justify-content: center; z-index: 1000;
      }
      .modal-box {
        background: #fff; border-radius: 16px; padding: 24px; max-width: 440px;
        width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      }
    `,
  ],
})
export class EssAttendanceComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private clockInterval: any;

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

  // Check-in/out
  todayRecord: TodayAttendance | null = null;
  checkingIn = false;
  checkingOut = false;
  liveTime = '';
  todayFormatted = '';
  geoStatus = '';
  selectedCapture: CaptureMethod = 'MANUAL';
  currentLat: number | null = null;
  currentLng: number | null = null;

  captureOptions: { value: CaptureMethod; label: string; icon: string; comingSoon: boolean }[] = [
    { value: 'MANUAL', label: 'Manual', icon: '✋', comingSoon: false },
    { value: 'GEOLOCATION', label: 'Location', icon: '📍', comingSoon: false },
    { value: 'BIOMETRIC', label: 'Biometric', icon: '🔒', comingSoon: true },
    { value: 'FACE', label: 'Face ID', icon: '🤳', comingSoon: true },
  ];

  // Overtime / Comp-Off
  otSummary: OvertimeSummary | null = null;
  coffBalance: CompOffBalance | null = null;
  coffLedger: CompOffEntry[] = [];
  showShortReasonModal = false;
  shortReasonText = '';
  shortReasonDate = '';
  submittingReason = false;
  showCoffLedger = false;

  constructor(
    private readonly api: EssApiService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
    this.loadTodayStatus();
    this.load();
    this.loadOvertimeData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.clockInterval) clearInterval(this.clockInterval);
  }

  get todayWorkedDisplay(): string {
    if (!this.todayRecord?.checkIn || !this.todayRecord?.checkOut) return '--';
    const inParts = String(this.todayRecord.checkIn).split(':').map(Number);
    const outParts = String(this.todayRecord.checkOut).split(':').map(Number);
    const mins = (outParts[0] * 60 + outParts[1]) - (inParts[0] * 60 + inParts[1]);
    if (mins <= 0) return '--';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
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

  loadTodayStatus(): void {
    this.api.getTodayAttendance().pipe(
      takeUntil(this.destroy$),
      catchError(() => of(null)),
    ).subscribe((rec) => {
      this.todayRecord = rec;
    });
  }

  doCheckIn(): void {
    this.checkingIn = true;
    this.resolveLocation().then(() => {
      const payload: CheckInOutPayload = {
        captureMethod: this.selectedCapture,
        latitude: this.currentLat ?? undefined,
        longitude: this.currentLng ?? undefined,
        deviceInfo: navigator.userAgent,
      };
      this.api.checkIn(payload).pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.checkingIn = false; }),
      ).subscribe({
        next: (res) => {
          this.toast.success('Checked in at ' + res.checkIn);
          this.loadTodayStatus();
          this.load();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Check-in failed');
        },
      });
    });
  }

  doCheckOut(): void {
    this.checkingOut = true;
    this.resolveLocation().then(() => {
      const payload: CheckInOutPayload = {
        captureMethod: this.selectedCapture,
        latitude: this.currentLat ?? undefined,
        longitude: this.currentLng ?? undefined,
        deviceInfo: navigator.userAgent,
      };
      this.api.checkOut(payload).pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.checkingOut = false; }),
      ).subscribe({
        next: (res) => {
          let msg = 'Checked out at ' + res.checkOut;
          if (res.overtimeHours && parseFloat(res.overtimeHours) > 0) {
            msg += ` | OT: ${res.overtimeHours}h`;
            if (res.overtimeType === 'COFF' && res.coffAccrued > 0) {
              msg += ` → ${res.coffAccrued} C/Off day(s) credited`;
            }
          }
          this.toast.success(msg);
          if (res.isShortDay) {
            this.shortReasonDate = res.date;
            this.showShortReasonModal = true;
          }
          this.loadTodayStatus();
          this.load();
          this.loadOvertimeData();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Check-out failed');
        },
      });
    });
  }

  submitShortReason(): void {
    if (!this.shortReasonText.trim() || this.shortReasonText.trim().length < 5) {
      this.toast.error('Please provide a valid reason (at least 5 characters)');
      return;
    }
    this.submittingReason = true;
    this.api.submitShortWorkReason({ date: this.shortReasonDate, reason: this.shortReasonText.trim() }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.submittingReason = false; }),
    ).subscribe({
      next: () => {
        this.toast.success('Short work reason submitted');
        this.showShortReasonModal = false;
        this.shortReasonText = '';
        this.loadOvertimeData();
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'Failed to submit reason');
      },
    });
  }

  loadOvertimeData(): void {
    this.api.getOvertimeSummary(this.selectedMonth).pipe(
      takeUntil(this.destroy$),
      catchError(() => of(null)),
    ).subscribe((res) => { this.otSummary = res; });

    this.api.getCompOffBalance().pipe(
      takeUntil(this.destroy$),
      catchError(() => of(null)),
    ).subscribe((res) => { this.coffBalance = res; });
  }

  loadCoffLedger(): void {
    this.showCoffLedger = !this.showCoffLedger;
    if (this.showCoffLedger && !this.coffLedger.length) {
      this.api.getCompOffLedger().pipe(
        takeUntil(this.destroy$),
        catchError(() => of([])),
      ).subscribe((res) => { this.coffLedger = res; });
    }
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

  private updateClock(): void {
    const now = new Date();
    this.liveTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    this.todayFormatted = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  }

  private resolveLocation(): Promise<void> {
    if (this.selectedCapture !== 'GEOLOCATION') {
      this.geoStatus = '';
      return Promise.resolve();
    }
    if (!navigator.geolocation) {
      this.geoStatus = 'Geolocation not supported';
      return Promise.resolve();
    }
    this.geoStatus = 'Acquiring location...';
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.currentLat = pos.coords.latitude;
          this.currentLng = pos.coords.longitude;
          this.geoStatus = `Location: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
          resolve();
        },
        () => {
          this.geoStatus = 'Location access denied';
          this.currentLat = null;
          this.currentLng = null;
          resolve();
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }

  private buildCalendar(daysInMonth: number): void {
    const [year, month] = this.selectedMonth.split('-').map((v) => parseInt(v, 10));
    const recordMap = new Map<string, EssAttendanceRecord>();
    for (const rec of this.records) {
      const key = String(rec.date || '').slice(0, 10);
      recordMap.set(key, rec);
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

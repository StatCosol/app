import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../shared/toast/toast.service';

type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'HALF_DAY'
  | 'ON_LEAVE'
  | 'HOLIDAY'
  | 'WEEK_OFF';

interface EmployeeRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation?: string;
  status: AttendanceStatus;
  checkIn: string;
  checkOut: string;
  workedHours: number;
  overtimeHours: number;
  remarks: string;
  existingId?: string;
  dirty: boolean;
}

interface ApiEmployee {
  id: string;
  employeeCode: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  designation?: string;
  isActive?: boolean;
}

interface ApiAttendanceRecord {
  id: string;
  employeeId: string;
  status: AttendanceStatus;
  checkIn?: string | null;
  checkOut?: string | null;
  workedHours?: string | number | null;
  overtimeHours?: string | number | null;
  remarks?: string | null;
}

const STANDARD_HOURS = 9;

@Component({
  selector: 'app-branch-mark-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="head">
        <div>
          <h1>Mark Daily Attendance</h1>
          <p>
            Set in-time and out-time for each employee. OT auto-calculates when
            worked hours exceed {{ STANDARD_HOURS }} hours. Mark Absent if the
            employee did not report.
          </p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn ghost" (click)="load()" [disabled]="loading">
            Refresh
          </button>
          <button
            type="button"
            class="btn primary"
            (click)="saveAll()"
            [disabled]="saving || !dirtyCount"
          >
            {{ saving ? 'Saving…' : 'Save ' + (dirtyCount ? '(' + dirtyCount + ')' : '') }}
          </button>
        </div>
      </header>

      <section class="card toolbar">
        <label>
          <span>Date</span>
          <input
            type="date"
            name="selectedDate"
            [(ngModel)]="selectedDate"
            (change)="load()"
            [max]="todayStr"
          />
        </label>
        <label>
          <span>Search</span>
          <input
            type="text"
            name="search"
            placeholder="Name or code"
            [(ngModel)]="search"
          />
        </label>
        <label>
          <span>Default Status (new rows)</span>
          <select name="defaultStatus" [(ngModel)]="defaultStatus">
            <option value="PRESENT">Present</option>
            <option value="ABSENT">Absent</option>
            <option value="WEEK_OFF">Week Off</option>
            <option value="HOLIDAY">Holiday</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button type="button" class="btn ghost" (click)="markAllPresent()" [disabled]="!rows.length">
            Mark All Present
          </button>
          <button type="button" class="btn ghost" (click)="markAllAbsent()" [disabled]="!rows.length">
            Mark All Absent
          </button>
        </div>
      </section>

      <section class="stats">
        <div class="stat"><span class="k">Total</span><span class="v">{{ rows.length }}</span></div>
        <div class="stat"><span class="k">Present</span><span class="v">{{ countBy('PRESENT') }}</span></div>
        <div class="stat"><span class="k">Absent</span><span class="v">{{ countBy('ABSENT') }}</span></div>
        <div class="stat"><span class="k">OT Hours</span><span class="v">{{ totalOt | number:'1.0-2' }}</span></div>
        <div class="stat"><span class="k">Pending Save</span><span class="v">{{ dirtyCount }}</span></div>
      </section>

      <div *ngIf="loading" class="muted center">Loading employees…</div>

      <ng-container *ngIf="!loading">
        <div *ngIf="!rows.length" class="empty">
          No active employees found for this branch.
        </div>

        <section *ngIf="rows.length" class="card no-pad">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>In Time</th>
                  <th>Out Time</th>
                  <th>Worked</th>
                  <th>OT</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let r of filteredRows(); trackBy: trackById"
                  [class.dirty]="r.dirty"
                  [class.absent]="r.status === 'ABSENT'"
                >
                  <td class="mono">{{ r.employeeCode }}</td>
                  <td>
                    <div class="emp">
                      <strong>{{ r.employeeName }}</strong>
                      <small *ngIf="r.designation">{{ r.designation }}</small>
                    </div>
                  </td>
                  <td>
                    <select
                      [(ngModel)]="r.status"
                      (ngModelChange)="onStatusChange(r)"
                      [name]="'st-' + r.employeeId"
                    >
                      <option value="PRESENT">Present</option>
                      <option value="ABSENT">Absent</option>
                      <option value="HALF_DAY">Half Day</option>
                      <option value="ON_LEAVE">On Leave</option>
                      <option value="WEEK_OFF">Week Off</option>
                      <option value="HOLIDAY">Holiday</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="time"
                      [(ngModel)]="r.checkIn"
                      (ngModelChange)="onTimeChange(r)"
                      [disabled]="!hasTimes(r)"
                      [name]="'in-' + r.employeeId"
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      [(ngModel)]="r.checkOut"
                      (ngModelChange)="onTimeChange(r)"
                      [disabled]="!hasTimes(r)"
                      [name]="'out-' + r.employeeId"
                    />
                  </td>
                  <td class="num">{{ r.workedHours ? (r.workedHours | number:'1.0-2') : '-' }}</td>
                  <td class="num ot">
                    <span [class.warn]="r.overtimeHours > 0">
                      {{ r.overtimeHours ? (r.overtimeHours | number:'1.0-2') : '-' }}
                    </span>
                  </td>
                  <td>
                    <input
                      type="text"
                      [(ngModel)]="r.remarks"
                      (ngModelChange)="markDirty(r)"
                      placeholder="Optional"
                      [name]="'rm-' + r.employeeId"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </ng-container>
    </div>
  `,
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; padding: 16px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 12px; }
    .head h1 { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; }
    .head p { margin: 4px 0 0; font-size: 12px; color: #64748b; max-width: 720px; }
    .head-actions { display: flex; gap: 8px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.04); margin-bottom: 12px; }
    .no-pad { padding: 0; overflow: hidden; }
    .toolbar { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
    .toolbar label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #64748b; font-weight: 600; }
    .toolbar input, .toolbar select { border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; font-size: 13px; min-width: 160px; background: #fff; }
    .toolbar-actions { display: flex; gap: 8px; margin-left: auto; }
    .btn { border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 12px; font-size: 13px; cursor: pointer; background: #fff; color: #0f172a; }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .btn.primary { background: #0f172a; color: #fff; border-color: #0f172a; }
    .btn.ghost { background: #f8fafc; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .stat { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; display: flex; flex-direction: column; }
    .stat .k { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .stat .v { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 2px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th { background: #f8fafc; text-align: left; padding: 10px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; font-weight: 600; }
    tbody td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tbody tr.dirty td { background: #fffbeb; }
    tbody tr.absent td { background: #fef2f2; }
    tbody tr.dirty.absent td { background: #fee2e2; }
    .mono { font-family: monospace; color: #475569; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .ot .warn { color: #b45309; font-weight: 700; }
    .emp strong { display: block; color: #0f172a; }
    .emp small { color: #64748b; font-size: 11px; }
    tbody input, tbody select { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 8px; font-size: 13px; width: 100%; max-width: 180px; background: #fff; }
    tbody input:disabled { background: #f1f5f9; color: #94a3b8; }
    .muted.center { text-align: center; padding: 24px; color: #64748b; }
    .empty { border: 1px dashed #d1d5db; border-radius: 10px; padding: 24px; color: #6b7280; text-align: center; background: #fff; }
  `],
})
export class BranchMarkAttendanceComponent implements OnInit, OnDestroy {
  readonly STANDARD_HOURS = STANDARD_HOURS;

  private destroy$ = new Subject<void>();
  private base = `${environment.apiBaseUrl}/api/v1/client`;

  loading = false;
  saving = false;
  selectedDate = this.todayIso();
  todayStr = this.todayIso();
  search = '';
  defaultStatus: AttendanceStatus = 'PRESENT';
  rows: EmployeeRow[] = [];

  constructor(
    private readonly http: HttpClient,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackById = (_: number, r: EmployeeRow) => r.employeeId;

  get dirtyCount(): number {
    return this.rows.filter((r) => r.dirty).length;
  }

  get totalOt(): number {
    return this.rows.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
  }

  countBy(status: AttendanceStatus): number {
    return this.rows.filter((r) => r.status === status).length;
  }

  hasTimes(r: EmployeeRow): boolean {
    return r.status === 'PRESENT' || r.status === 'HALF_DAY';
  }

  filteredRows(): EmployeeRow[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.rows;
    return this.rows.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeCode.toLowerCase().includes(q),
    );
  }

  load(): void {
    this.loading = true;
    this.cdr.markForCheck();

    const empParams = new HttpParams()
      .set('isActive', 'true')
      .set('limit', '1000');
    const attParams = new HttpParams()
      .set('from', this.selectedDate)
      .set('to', this.selectedDate);

    forkJoin({
      employees: this.http
        .get<any>(`${this.base}/employees`, { params: empParams })
        .pipe(catchError(() => of({ data: [] }))),
      attendance: this.http
        .get<any>(`${this.base}/attendance`, { params: attParams })
        .pipe(catchError(() => of([]))),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe(({ employees, attendance }) => {
        const empList: ApiEmployee[] = Array.isArray(employees)
          ? employees
          : employees?.data ?? [];
        const attList: ApiAttendanceRecord[] = Array.isArray(attendance)
          ? attendance
          : attendance?.data ?? [];

        const byEmp = new Map<string, ApiAttendanceRecord>();
        attList.forEach((a) => byEmp.set(a.employeeId, a));

        this.rows = empList
          .filter((e) => e.isActive !== false)
          .map((e) => {
            const ex = byEmp.get(e.id);
            const status = (ex?.status || this.defaultStatus) as AttendanceStatus;
            const checkIn = this.normalizeTime(ex?.checkIn);
            const checkOut = this.normalizeTime(ex?.checkOut);
            const worked = Number(ex?.workedHours ?? 0) || 0;
            const ot = Number(ex?.overtimeHours ?? 0) || 0;
            return {
              employeeId: e.id,
              employeeCode: e.employeeCode,
              employeeName:
                e.fullName ||
                [e.firstName, e.lastName].filter(Boolean).join(' ') ||
                e.employeeCode,
              designation: e.designation,
              status,
              checkIn,
              checkOut,
              workedHours: worked,
              overtimeHours: ot,
              remarks: ex?.remarks ?? '',
              existingId: ex?.id,
              dirty: false,
            } as EmployeeRow;
          })
          .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
      });
  }

  onStatusChange(r: EmployeeRow): void {
    if (!this.hasTimes(r)) {
      r.checkIn = '';
      r.checkOut = '';
      r.workedHours = 0;
      r.overtimeHours = 0;
    }
    this.markDirty(r);
  }

  onTimeChange(r: EmployeeRow): void {
    this.recompute(r);
    this.markDirty(r);
  }

  markDirty(r: EmployeeRow): void {
    r.dirty = true;
    this.cdr.markForCheck();
  }

  markAllPresent(): void {
    this.rows.forEach((r) => {
      r.status = 'PRESENT';
      r.dirty = true;
    });
    this.cdr.markForCheck();
  }

  markAllAbsent(): void {
    this.rows.forEach((r) => {
      r.status = 'ABSENT';
      r.checkIn = '';
      r.checkOut = '';
      r.workedHours = 0;
      r.overtimeHours = 0;
      r.dirty = true;
    });
    this.cdr.markForCheck();
  }

  saveAll(): void {
    const dirty = this.rows.filter((r) => r.dirty);
    if (!dirty.length) return;

    this.saving = true;
    this.cdr.markForCheck();

    const entries = dirty.map((r) => ({
      employeeId: r.employeeId,
      status: r.status,
      checkIn: this.hasTimes(r) ? r.checkIn || undefined : undefined,
      checkOut: this.hasTimes(r) ? r.checkOut || undefined : undefined,
      workedHours: this.hasTimes(r) ? Number(r.workedHours.toFixed(2)) : 0,
      overtimeHours: this.hasTimes(r) ? Number(r.overtimeHours.toFixed(2)) : 0,
      remarks: r.remarks || undefined,
    }));

    this.http
      .post<any>(`${this.base}/attendance/bulk`, {
        date: this.selectedDate,
        entries,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          dirty.forEach((r) => (r.dirty = false));
          this.toast.success(
            `Saved attendance for ${dirty.length} employee(s).`,
          );
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.toast.error(
            err?.error?.message || 'Failed to save attendance.',
          );
        },
      });
  }

  private recompute(r: EmployeeRow): void {
    const minutes = this.diffMinutes(r.checkIn, r.checkOut);
    if (minutes <= 0) {
      r.workedHours = 0;
      r.overtimeHours = 0;
      return;
    }
    const hours = minutes / 60;
    r.workedHours = Math.round(hours * 100) / 100;
    r.overtimeHours = Math.max(0, Math.round((hours - STANDARD_HOURS) * 100) / 100);
  }

  private diffMinutes(start: string, end: string): number {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
    let diff = eh * 60 + em - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60; // overnight shift
    return diff;
  }

  private normalizeTime(t?: string | null): string {
    if (!t) return '';
    // Accept "HH:mm" or "HH:mm:ss"
    const m = /^(\d{2}):(\d{2})/.exec(t);
    return m ? `${m[1]}:${m[2]}` : '';
  }

  private todayIso(): string {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
}

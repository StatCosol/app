import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  ClientMobileAttendanceService,
  FailedScanRow,
  FailedScanStats,
  TopFailedScanSubjectRow,
} from '../../client/mobile-attendance/client-mobile-attendance.service';

type SubjectFilter = 'ALL' | 'EMPLOYEE' | 'CONTRACTOR';

// Mirror of backend reason taxonomy in face_failed_scan_logs.reason.
const REASONS: { value: string; label: string }[] = [
  { value: '', label: 'Any reason' },
  { value: 'FACE_MISMATCH', label: 'Face mismatch' },
  { value: 'LIVENESS_FAIL', label: 'Liveness fail' },
  { value: 'MULTI_FACE', label: 'Multiple faces' },
  { value: 'MASK_DETECTED', label: 'Mask detected' },
  { value: 'GEOFENCE_OUTSIDE', label: 'Outside geofence' },
  { value: 'MOCK_LOCATION', label: 'Mock location' },
  { value: 'ROOTED_DEVICE', label: 'Rooted device' },
  { value: 'EMPLOYEE_INACTIVE', label: 'Employee inactive' },
  { value: 'EMPLOYEE_EXITED', label: 'Employee exited' },
  { value: 'COOLDOWN_ACTIVE', label: 'Cooldown active' },
  { value: 'CROSS_SOURCE_CONFLICT', label: 'Cross-source conflict' },
  { value: 'CLOCK_SKEW', label: 'Clock skew' },
  { value: 'INVALID_TIME', label: 'Invalid time' },
  { value: 'QUALITY_LOW', label: 'Low quality' },
  { value: 'OTHER', label: 'Other' },
];

@Component({
  selector: 'app-branch-face-failures',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page-header
      title="Face Attendance Failures"
      subtitle="Rejected face-attendance scans for in-house employees and contractor workers in your branch"
    ></ui-page-header>

    <div class="p-4 md:p-6 space-y-4">
      <div *ngIf="stats" class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div class="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <div class="text-xs font-medium text-gray-500">Total</div>
          <div class="text-2xl font-semibold text-gray-900">{{ stats.total }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <div class="text-xs font-medium text-sky-600">Employees</div>
          <div class="text-2xl font-semibold text-sky-700">{{ stats.bySubject.employee }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <div class="text-xs font-medium text-violet-600">Contractors</div>
          <div class="text-2xl font-semibold text-violet-700">{{ stats.bySubject.contractor }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-3 shadow-sm col-span-2 md:col-span-1">
          <div class="text-xs font-medium text-gray-500">Top reason</div>
          <div class="text-sm font-semibold text-rose-700 truncate" [title]="topReason()?.reason">
            {{ topReason()?.reason || '—' }}
          </div>
          <div class="text-xs text-gray-500">{{ topReason()?.count || 0 }} hits</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-3 shadow-sm col-span-2 md:col-span-1">
          <div class="text-xs font-medium text-gray-500">Top branch</div>
          <div class="text-sm font-semibold text-indigo-700 truncate" [title]="topBranch()?.branchName || ''">
            {{ topBranch()?.branchName || '—' }}
          </div>
          <div class="text-xs text-gray-500">{{ topBranch()?.count || 0 }} hits</div>
        </div>
      </div>

      <div *ngIf="stats && (stats.byReason.length || stats.byBranch.length || topSubjects.length)"
           class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div class="px-4 py-2 border-b border-gray-100 text-xs font-semibold uppercase text-gray-500">
            Top reasons
          </div>
          <ul class="divide-y divide-gray-100">
            <li *ngFor="let r of topReasons()" class="flex items-center justify-between px-4 py-2 text-sm">
              <span class="text-gray-700 truncate pr-2" [title]="r.reason">{{ r.reason }}</span>
              <span class="text-rose-700 font-medium text-xs">{{ r.count }}</span>
            </li>
            <li *ngIf="!stats.byReason.length" class="px-4 py-3 text-xs text-gray-400 text-center">
              No data
            </li>
          </ul>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div class="px-4 py-2 border-b border-gray-100 text-xs font-semibold uppercase text-gray-500">
            Top branches
          </div>
          <ul class="divide-y divide-gray-100">
            <li *ngFor="let b of topBranches()" class="flex items-center justify-between px-4 py-2 text-sm">
              <span class="text-gray-700 truncate pr-2" [title]="b.branchName || ''">
                {{ b.branchName || '(unassigned)' }}
              </span>
              <span class="text-indigo-700 font-medium text-xs">{{ b.count }}</span>
            </li>
            <li *ngIf="!stats.byBranch.length" class="px-4 py-3 text-xs text-gray-400 text-center">
              No data
            </li>
          </ul>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div class="px-4 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
            <span class="text-xs font-semibold uppercase text-gray-500">Top offenders</span>
            <label class="text-[10px] text-gray-500 flex items-center gap-1">
              ≥
              <input type="number" min="0" max="999" step="1"
                     [(ngModel)]="minCount" name="minCount"
                     (change)="reloadTopSubjects()"
                     class="w-12 px-1 py-0.5 text-xs border border-gray-200 rounded">
              hits
            </label>
          </div>
          <ul class="divide-y divide-gray-100">
            <li *ngFor="let s of topSubjects"
                class="flex items-center justify-between px-4 py-2 text-sm">
              <button type="button"
                      class="text-left truncate pr-2 text-gray-700 hover:text-blue-700"
                      [title]="subjectLabel(s)"
                      (click)="focusOnSubject(s)">
                <div class="truncate">{{ subjectLabel(s) }}</div>
                <div class="text-xs text-gray-500">
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded"
                        [class.bg-sky-100]="s.subjectType === 'EMPLOYEE'"
                        [class.text-sky-700]="s.subjectType === 'EMPLOYEE'"
                        [class.bg-violet-100]="s.subjectType === 'CONTRACTOR'"
                        [class.text-violet-700]="s.subjectType === 'CONTRACTOR'">
                    {{ s.subjectType }}
                  </span>
                  <span *ngIf="s.subjectType === 'CONTRACTOR' && s.contractorName"
                        class="ml-1">· {{ s.contractorName }}</span>
                  <span *ngIf="s.subjectType === 'EMPLOYEE' && s.employeeCode"
                        class="ml-1">· {{ s.employeeCode }}</span>
                </div>
              </button>
              <span class="text-rose-700 font-medium text-xs whitespace-nowrap">{{ s.count }}</span>
            </li>
            <li *ngIf="!topSubjects.length" class="px-4 py-3 text-xs text-gray-400 text-center">
              No data
            </li>
          </ul>
        </div>
      </div>

      <div *ngIf="stats && hasHourly()" class="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs font-semibold uppercase text-gray-500">Failures by hour of day</div>
          <div class="text-xs text-gray-400">Peak: {{ peakHourLabel() }}</div>
        </div>
        <div class="flex items-end gap-0.5 h-20">
          <div *ngFor="let h of stats.byHour"
               class="flex-1 bg-rose-500/70 hover:bg-rose-600 rounded-sm transition-colors"
               [style.height.%]="barPct(h.count)"
               [title]="hourLabel(h.hour) + ': ' + h.count"></div>
        </div>
        <div class="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>

      <div *ngIf="stats && topDevices().length"
           class="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div class="px-4 py-2 border-b border-gray-100 text-xs font-semibold uppercase text-gray-500">
          Top devices by failure count
        </div>
        <ul class="divide-y divide-gray-100">
          <li *ngFor="let d of topDevices()"
              class="flex items-center justify-between px-4 py-2 text-sm">
            <span class="text-gray-700 truncate pr-2" [title]="deviceLabel(d)">
              {{ deviceLabel(d) }}
            </span>
            <span class="text-rose-700 font-medium text-xs whitespace-nowrap">{{ d.count }}</span>
          </li>
        </ul>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label for="subj" class="block text-xs font-medium text-gray-600 mb-1">Subject</label>
          <select id="subj" name="subject" [(ngModel)]="subject"
                  (change)="load()" class="ui-input">
            <option value="ALL">All</option>
            <option value="EMPLOYEE">Employees only</option>
            <option value="CONTRACTOR">Contractors only</option>
          </select>
        </div>

        <div>
          <label for="reason" class="block text-xs font-medium text-gray-600 mb-1">Reason</label>
          <select id="reason" name="reason" [(ngModel)]="reason"
                  (change)="load()" class="ui-input">
            <option *ngFor="let r of reasons" [value]="r.value">{{ r.label }}</option>
          </select>
        </div>

        <div>
          <label for="from" class="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input id="from" name="from" type="date" [(ngModel)]="from"
                 (change)="load()" class="ui-input">
        </div>
        <div>
          <label for="to" class="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input id="to" name="to" type="date" [(ngModel)]="to"
                 (change)="load()" class="ui-input">
        </div>

        <div class="flex items-end">
          <button type="button" class="ui-btn-secondary w-full"
                  [disabled]="loading" (click)="load()">
            Refresh
          </button>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div *ngIf="focusLabel" class="px-4 py-2 border-b border-blue-100 bg-blue-50 flex items-center justify-between">
          <span class="text-xs text-blue-800">
            Filtered to <span class="font-semibold">{{ focusLabel }}</span>
          </span>
          <button type="button" class="text-xs font-medium text-blue-700 hover:text-blue-900"
                  (click)="clearFocus()">Clear filter</button>
        </div>
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 class="font-semibold text-gray-900">
            Failures
            <span *ngIf="rows.length" class="ml-2 text-xs font-normal text-gray-500">
              ({{ rows.length }})
            </span>
          </h3>
          <button type="button" class="ui-btn-secondary text-xs"
                  [disabled]="exporting || loading" (click)="exportCsv()">
            {{ exporting ? 'Exporting…' : 'Export CSV' }}
          </button>
        </div>

        <div *ngIf="loading" class="py-10 flex justify-center">
          <ui-loading-spinner></ui-loading-spinner>
        </div>

        <ng-container *ngIf="!loading">
          <div *ngIf="!rows.length">
            <ui-empty-state
              title="No failures found"
              description="No face-attendance rejections match the current filters in your branch."
            ></ui-empty-state>
          </div>

          <div *ngIf="rows.length" class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-xs font-medium text-gray-600 uppercase">
                <tr>
                  <th class="px-4 py-2">Attempted</th>
                  <th class="px-4 py-2">Subject</th>
                  <th class="px-4 py-2">Name</th>
                  <th class="px-4 py-2">Contractor</th>
                  <th class="px-4 py-2">Reason</th>
                  <th class="px-4 py-2">Detail</th>
                  <th class="px-4 py-2">Match</th>
                  <th class="px-4 py-2">Liveness</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr *ngFor="let r of rows" class="hover:bg-gray-50">
                  <td class="px-4 py-2 whitespace-nowrap">
                    {{ r.attemptedAt | date:'dd MMM yyyy, HH:mm' }}
                  </td>
                  <td class="px-4 py-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          [class.bg-sky-100]="subjectOf(r) === 'EMPLOYEE'"
                          [class.text-sky-700]="subjectOf(r) === 'EMPLOYEE'"
                          [class.bg-violet-100]="subjectOf(r) === 'CONTRACTOR'"
                          [class.text-violet-700]="subjectOf(r) === 'CONTRACTOR'"
                          [class.bg-gray-100]="subjectOf(r) === 'UNKNOWN'"
                          [class.text-gray-700]="subjectOf(r) === 'UNKNOWN'">
                      {{ subjectOf(r) }}
                    </span>
                  </td>
                  <td class="px-4 py-2">
                    <button type="button" class="text-left hover:text-blue-700"
                            [disabled]="!r.employeeId && !r.contractorEmployeeId"
                            [class.cursor-default]="!r.employeeId && !r.contractorEmployeeId"
                            (click)="focusOn(r)"
                            title="Filter to this person">
                      <div>{{ r.employeeName || r.contractorEmployeeName || '—' }}</div>
                      <div *ngIf="r.employeeCode" class="text-xs text-gray-500">
                        {{ r.employeeCode }}
                      </div>
                    </button>
                  </td>
                  <td class="px-4 py-2 text-xs text-gray-600">
                    {{ r.contractorName || '—' }}
                  </td>
                  <td class="px-4 py-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-xs font-medium">
                      {{ r.reason }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-xs text-gray-600">
                    {{ r.reasonDetail || '—' }}
                  </td>
                  <td class="px-4 py-2 text-xs text-gray-600">{{ fmtScore(r.matchScore) }}</td>
                  <td class="px-4 py-2 text-xs text-gray-600">{{ fmtScore(r.livenessScore) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ng-container>
      </div>
    </div>
  `,
})
export class BranchFaceFailuresComponent implements OnInit {
  readonly reasons = REASONS;

  rows: FailedScanRow[] = [];
  stats: FailedScanStats | null = null;
  topSubjects: TopFailedScanSubjectRow[] = [];
  minCount = 5;
  subject: SubjectFilter = 'ALL';
  reason = '';
  from = '';
  to = '';
  loading = false;
  exporting = false;
  focusEmployeeId: string | null = null;
  focusContractorId: string | null = null;
  focusLabel = '';

  constructor(
    private svc: ClientMobileAttendanceService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    this.to = this.toIsoDate(today);
    this.from = this.toIsoDate(weekAgo);
    this.load();
  }

  load(): void {
    this.loading = true;
    const from = this.from ? `${this.from}T00:00:00.000Z` : undefined;
    const to = this.to ? `${this.to}T23:59:59.999Z` : undefined;
    const subjectType =
      this.subject === 'EMPLOYEE' || this.subject === 'CONTRACTOR'
        ? this.subject
        : undefined;
    this.svc
      .failedScanStats({ from, to, subjectType })
      .subscribe({
        next: (s) => (this.stats = s),
        error: () => {
          /* non-fatal; chips simply stay blank */
        },
      });
    this.svc
      .topFailedScanSubjects({ from, to, subjectType, limit: 10, minCount: this.minCount })
      .subscribe({
        next: (s) => (this.topSubjects = s),
        error: () => (this.topSubjects = []),
      });
    this.svc
      .listFailedScans({
        from,
        to,
        reason: this.reason || undefined,
        subjectType,
        employeeId: this.focusEmployeeId || undefined,
        contractorEmployeeId: this.focusContractorId || undefined,
        limit: 500,
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (rows) => {
          this.rows = rows;
        },
        error: () => this.toast.error('Failed to load face failures'),
      });
  }

  topReason(): { reason: string; count: number } | null {
    return this.stats?.byReason?.[0] ?? null;
  }

  topReasons(): Array<{ reason: string; count: number }> {
    return this.stats?.byReason?.slice(0, 5) ?? [];
  }

  topBranches(): Array<{ branchName: string | null; count: number }> {
    return this.stats?.byBranch?.slice(0, 5) ?? [];
  }

  hasHourly(): boolean {
    return (this.stats?.byHour ?? []).some((h) => h.count > 0);
  }

  topDevices(): Array<{ deviceId: string | null; deviceLabel: string | null; count: number }> {
    return (this.stats?.byDevice ?? []).slice(0, 5);
  }

  deviceLabel(d: { deviceId: string | null; deviceLabel: string | null }): string {
    if (d.deviceLabel) return d.deviceLabel;
    if (d.deviceId) return d.deviceId.slice(0, 8) + '…';
    return '(unknown device)';
  }

  private maxHourCount(): number {
    let m = 0;
    for (const h of this.stats?.byHour ?? []) if (h.count > m) m = h.count;
    return m || 1;
  }

  barPct(count: number): number {
    return Math.max(2, Math.round((count / this.maxHourCount()) * 100));
  }

  hourLabel(h: number): string {
    return `${`${h}`.padStart(2, '0')}:00`;
  }

  peakHourLabel(): string {
    const arr = this.stats?.byHour ?? [];
    if (!arr.length) return '—';
    let best = arr[0];
    for (const h of arr) if (h.count > best.count) best = h;
    if (!best.count) return '—';
    return `${this.hourLabel(best.hour)} (${best.count})`;
  }

  subjectLabel(s: TopFailedScanSubjectRow): string {
    if (s.subjectType === 'EMPLOYEE') {
      return s.employeeName || s.employeeCode || 'Employee';
    }
    return s.contractorEmployeeName || 'Contractor worker';
  }

  reloadTopSubjects(): void {
    const from = this.from ? `${this.from}T00:00:00.000Z` : undefined;
    const to = this.to ? `${this.to}T23:59:59.999Z` : undefined;
    const subjectType =
      this.subject === 'EMPLOYEE' || this.subject === 'CONTRACTOR'
        ? this.subject
        : undefined;
    this.svc
      .topFailedScanSubjects({ from, to, subjectType, limit: 10, minCount: this.minCount })
      .subscribe({
        next: (s) => (this.topSubjects = s),
        error: () => (this.topSubjects = []),
      });
  }

  focusOnSubject(s: TopFailedScanSubjectRow): void {
    if (s.subjectType === 'EMPLOYEE' && s.employeeId) {
      this.focusEmployeeId = s.employeeId;
      this.focusContractorId = null;
      this.focusLabel = this.subjectLabel(s);
    } else if (s.subjectType === 'CONTRACTOR' && s.contractorEmployeeId) {
      this.focusContractorId = s.contractorEmployeeId;
      this.focusEmployeeId = null;
      this.focusLabel = this.subjectLabel(s);
    } else {
      return;
    }
    this.load();
  }

  focusOn(r: FailedScanRow): void {
    if (r.employeeId) {
      this.focusEmployeeId = r.employeeId;
      this.focusContractorId = null;
      this.focusLabel =
        r.employeeName || r.employeeCode || 'Selected employee';
    } else if (r.contractorEmployeeId) {
      this.focusContractorId = r.contractorEmployeeId;
      this.focusEmployeeId = null;
      this.focusLabel =
        r.contractorEmployeeName || 'Selected contractor worker';
    } else {
      return;
    }
    this.load();
  }

  clearFocus(): void {
    if (!this.focusEmployeeId && !this.focusContractorId) return;
    this.focusEmployeeId = null;
    this.focusContractorId = null;
    this.focusLabel = '';
    this.load();
  }

  topBranch(): { branchName: string | null; count: number } | null {
    return this.stats?.byBranch?.[0] ?? null;
  }

  exportCsv(): void {
    this.exporting = true;
    const from = this.from ? `${this.from}T00:00:00.000Z` : undefined;
    const to = this.to ? `${this.to}T23:59:59.999Z` : undefined;
    const subjectType =
      this.subject === 'EMPLOYEE' || this.subject === 'CONTRACTOR'
        ? this.subject
        : undefined;
    this.svc
      .exportFailedScansCsv({
        from,
        to,
        reason: this.reason || undefined,
        subjectType,
        employeeId: this.focusEmployeeId || undefined,
        contractorEmployeeId: this.focusContractorId || undefined,
      })
      .pipe(finalize(() => (this.exporting = false)))
      .subscribe({
        next: (blob) => {
          const stamp = new Date().toISOString().slice(0, 10);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `face-failed-scans-${stamp}.csv`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        },
        error: () => this.toast.error('Failed to export CSV'),
      });
  }

  subjectOf(r: FailedScanRow): 'EMPLOYEE' | 'CONTRACTOR' | 'UNKNOWN' {
    if (r.employeeId) return 'EMPLOYEE';
    if (r.contractorEmployeeId) return 'CONTRACTOR';
    return 'UNKNOWN';
  }

  fmtScore(v: string | null): string {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (Number.isNaN(n)) return v;
    return `${(n * 100).toFixed(0)}%`;
  }

  private toIsoDate(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
}

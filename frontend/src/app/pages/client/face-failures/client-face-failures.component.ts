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
} from '../mobile-attendance/client-mobile-attendance.service';

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
  selector: 'app-client-face-failures',
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
      subtitle="Audit rejected face-attendance scans for in-house employees and contractor workers"
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
              description="No face-attendance rejections match the current filters."
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
                    <div>{{ r.employeeName || r.contractorEmployeeName || '—' }}</div>
                    <div *ngIf="r.employeeCode" class="text-xs text-gray-500">
                      {{ r.employeeCode }}
                    </div>
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
export class ClientFaceFailuresComponent implements OnInit {
  readonly reasons = REASONS;

  rows: FailedScanRow[] = [];
  stats: FailedScanStats | null = null;
  subject: SubjectFilter = 'ALL';
  reason = '';
  from = '';
  to = '';
  loading = false;
  exporting = false;

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
      .listFailedScans({
        from,
        to,
        reason: this.reason || undefined,
        subjectType,
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

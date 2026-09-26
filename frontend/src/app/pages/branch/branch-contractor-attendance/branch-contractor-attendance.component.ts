import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';
import { downloadBlob } from '../../../shared/utils/download-blob';
import {
  ClientMobileAttendanceService,
  ContractorForBranchRow,
  ContractorPunchRow,
} from '../../client/mobile-attendance/client-mobile-attendance.service';

@Component({
  selector: 'app-branch-contractor-attendance',
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
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
    <ui-page-header
      title="Contractor Attendance"
      subtitle="View ConTrack face-attendance punches for contractor employees in your branch"
    ></ui-page-header>

    <div class="space-y-4">
      <div
        class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-3"
      >
        <div class="md:col-span-2">
          <label for="ctr" class="block text-xs font-medium text-gray-600 mb-1">Contractor</label>
          <select
            id="ctr"
            name="contractorUserId"
            [(ngModel)]="contractorUserId"
            (change)="loadPunches()"
            class="ui-input"
          >
            <option value="">-- Select a contractor --</option>
            @for (c of contractors; track c) {
<option [value]="c.contractorUserId">
              {{ c.contractorName || c.contractorEmail || '(unnamed)' }} - {{ c.employeeCount }} emp
            </option>
}
          </select>
          @if (!loadingContractors && contractors.length === 0) {
<p
           
            class="mt-1 text-xs text-gray-500"
          >
            No contractors with active employees in your branch.
          </p>
}
        </div>

        <div>
          <label for="from" class="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input
            id="from"
            name="from"
            type="date"
            [(ngModel)]="from"
            (change)="loadPunches()"
            class="ui-input"
          />
        </div>
        <div>
          <label for="to" class="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input
            id="to"
            name="to"
            type="date"
            [(ngModel)]="to"
            (change)="loadPunches()"
            class="ui-input"
          />
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 class="font-semibold text-gray-900">
            Attendance
            @if (attendanceRows.length) {
<span class="ml-2 text-xs font-normal text-gray-500">
              ({{ attendanceRows.length }})
            </span>
}
          </h3>
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="text-sm font-medium text-brand-600 hover:text-brand-700 disabled:text-gray-400"
              [disabled]="loadingPunches || exporting || !contractorUserId"
              (click)="downloadAttendance()"
            >
              {{ exporting ? 'Preparing...' : 'Download Excel' }}
            </button>
            <button
              type="button"
              class="text-sm text-brand-600 hover:text-brand-700 disabled:text-gray-400"
              [disabled]="loadingPunches"
              (click)="loadPunches()"
            >
              Refresh
            </button>
          </div>
        </div>

        @if (loadingPunches) {
<div class="py-10 flex justify-center">
          <ui-loading-spinner></ui-loading-spinner>
        </div>
}

        @if (!loadingPunches) {

          @if (!contractorUserId) {
<div>
            <ui-empty-state
              title="Select a contractor"
              description="Choose a contractor above to view its employees' face-attendance punches in your branch."
            ></ui-empty-state>
          </div>
}

          @if (contractorUserId && !attendanceRows.length) {
<div>
            <ui-empty-state
              title="No attendance found"
              description="No ConTrack punches for this contractor in the selected window."
            ></ui-empty-state>
          </div>
}

          @if (contractorUserId && attendanceRows.length) {
<div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-xs font-medium text-gray-600 uppercase">
                <tr>
                  <th class="px-4 py-2">Date</th>
                  <th class="px-4 py-2">Employee</th>
                  <th class="px-4 py-2">In Time</th>
                  <th class="px-4 py-2">Out Time</th>
                  <th class="px-4 py-2">Hours</th>
                  <th class="px-4 py-2">Punches</th>
                  <th class="px-4 py-2">Source</th>
                  <th class="px-4 py-2">Match</th>
                  <th class="px-4 py-2">Liveness</th>
                  <th class="px-4 py-2">Photo</th>
                  <th class="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (r of attendanceRows; track r) {
<tr class="hover:bg-gray-50">
                  <td class="px-4 py-2 whitespace-nowrap">{{ r.date | date: 'dd MMM yyyy' }}</td>
                  <td class="px-4 py-2">
                    <div>{{ r.contractorEmployeeName || 'Unknown employee' }}</div>
                    @if (r.employeeCode) {
                      <div class="text-xs text-gray-500 font-mono">{{ r.employeeCode }}</div>
                    }
                  </td>
                  <td class="px-4 py-2 whitespace-nowrap">
                    {{ r.inTime ? (r.inTime | date: 'HH:mm') : '-' }}
                  </td>
                  <td class="px-4 py-2 whitespace-nowrap">
                    {{ r.outTime ? (r.outTime | date: 'HH:mm') : '-' }}
                  </td>
                  <td class="px-4 py-2 whitespace-nowrap">{{ r.hours }}</td>
                  <td class="px-4 py-2">
                    <span
                      class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      [class.bg-emerald-100]="r.outTime"
                      [class.text-emerald-700]="r.outTime"
                      [class.bg-amber-100]="!r.outTime"
                      [class.text-amber-700]="!r.outTime"
                    >
                      {{ r.punchCount }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-xs text-gray-600">{{ sourceLabel(r.source) }}</td>
                  <td class="px-4 py-2 text-xs text-gray-600">{{ fmtScore(r.matchScore) }}</td>
                  <td class="px-4 py-2 text-xs text-gray-600">{{ fmtScore(r.livenessScore) }}</td>
                  <td class="px-4 py-2">
                    @if (r.photoUrl) {
                      <button
                        type="button"
                        class="text-brand-600 hover:text-brand-700 text-xs"
                        (click)="viewPunchPhoto(r)"
                      >View</button>
                    }
                    @if (!r.photoUrl) {
                      <span class="text-xs text-gray-400">-</span>
                    }
                  </td>
                  <td class="px-4 py-2 text-right whitespace-nowrap">
                    @if (r.editable) {
                      <button
                        type="button"
                        class="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:text-gray-400"
                        [disabled]="actionBusyId === r.rowKey"
                        (click)="editRow(r)"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        class="ml-3 text-xs font-medium text-red-600 hover:text-red-700 disabled:text-gray-400"
                        [disabled]="actionBusyId === r.rowKey"
                        (click)="deleteRow(r)"
                      >
                        Delete
                      </button>
                    } @else {
                      <span
                        class="text-xs text-gray-400"
                        title="Face and device punches are reviewed in FaceDesk, not edited here"
                        >Recorded</span
                      >
                    }
                  </td>
                </tr>
}
              </tbody>
            </table>
          </div>
}
        
}
      </div>
    </div>
    </div>
  `,
})
export class BranchContractorAttendanceComponent implements OnInit {
  contractors: ContractorForBranchRow[] = [];
  punches: ContractorPunchRow[] = [];
  attendanceRows: ContractorAttendanceRow[] = [];
  contractorUserId = '';
  from = '';
  to = '';
  loadingContractors = false;
  loadingPunches = false;
  actionBusyId = '';
  exporting = false;

  constructor(
    private svc: ClientMobileAttendanceService,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
    private protectedFile: ProtectedFileService,
  ) {}

  ngOnInit(): void {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    this.to = this.toIsoDate(today);
    this.from = this.toIsoDate(weekAgo);
    this.loadContractors();
  }

  loadContractors(): void {
    this.loadingContractors = true;
    this.svc
      .listContractorsForBranch()
      .pipe(
        finalize(() => {
          this.loadingContractors = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.contractors = rows;
          this.cdr.markForCheck();
        },
        error: () => {
          this.toast.error('Failed to load contractors');
          this.cdr.markForCheck();
        },
      });
  }

  loadPunches(): void {
    if (!this.contractorUserId) {
      this.punches = [];
      this.attendanceRows = [];
      this.cdr.markForCheck();
      return;
    }
    this.loadingPunches = true;
    this.svc
      .listContractorPunches({
        contractorUserId: this.contractorUserId,
        from: this.from ? `${this.from}T00:00:00.000Z` : undefined,
        to: this.to ? `${this.to}T23:59:59.999Z` : undefined,
        limit: 500,
      })
      .pipe(
        finalize(() => {
          this.loadingPunches = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.punches = rows;
          this.attendanceRows = this.toAttendanceRows(rows);
          this.cdr.markForCheck();
        },
        error: () => {
          this.toast.error('Failed to load punches');
          this.cdr.markForCheck();
        },
      });
  }

  sourceLabel(source: string | null | undefined): string {
    switch (source) {
      case 'FACE':
        return 'Face';
      case 'MANUAL':
        return 'Manual';
      case 'DEVICE':
        return 'Device';
      default:
        return '-';
    }
  }

  fmtScore(v: string | null): string {
    if (v === null || v === undefined || v === '') return '-';
    const n = Number(v);
    if (Number.isNaN(n)) return v;
    return `${(n * 100).toFixed(0)}%`;
  }

  viewPunchPhoto(row: ContractorAttendanceRow): void {
    if (!row.photoUrl) return;
    this.protectedFile.open(row.photoUrl, 'contractor-punch.jpg').subscribe({
      error: () => this.toast.error('Could not open photo'),
    });
  }

  downloadAttendance(): void {
    if (!this.contractorUserId || this.exporting) return;
    this.exporting = true;
    this.svc
      .exportContractorAttendance({
        contractorUserId: this.contractorUserId,
        from: this.from ? `${this.from}T00:00:00.000Z` : undefined,
        to: this.to ? `${this.to}T23:59:59.999Z` : undefined,
      })
      .pipe(
        finalize(() => {
          this.exporting = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (blob) => {
          const contractor = this.contractors.find(
            (c) => c.contractorUserId === this.contractorUserId,
          );
          const contractorName =
            contractor?.contractorName || contractor?.contractorEmail || 'contractor';
          const fileName = `contractor-attendance-${this.safeFilePart(contractorName)}-${this.from || 'from'}-to-${this.to || 'to'}.xlsx`;
          void downloadBlob(blob, fileName)
            .then(() => this.toast.success('Attendance download started'))
            .catch(() => this.toast.error('Could not save attendance download'));
        },
        error: () => {
          this.toast.error('Could not download attendance');
        },
      });
  }

  async editRow(row: ContractorAttendanceRow): Promise<void> {
    if (!row.editable) {
      this.toast.error('Only manually-entered punches can be edited');
      return;
    }
    const inResult = await this.dialog.prompt(
      'Edit In Time',
      `Enter in time for ${row.contractorEmployeeName || 'contractor employee'} (${this.localDayKey(row.date)}):`,
      {
        defaultValue: this.timeValue(row.inTime),
        placeholder: 'HH:mm',
        confirmText: 'Next',
      },
    );
    if (!inResult.confirmed) return;
    const inTime = (inResult.value || '').trim();
    if (!this.isTimeValue(inTime)) {
      this.toast.error('Enter in time as HH:mm');
      return;
    }

    const outResult = await this.dialog.prompt(
      'Edit Out Time',
      'Enter out time as HH:mm, or leave blank if there is no checkout punch:',
      {
        defaultValue: this.timeValue(row.outTime),
        placeholder: 'HH:mm',
        confirmText: 'Save',
      },
    );
    if (!outResult.confirmed) return;
    const outTime = (outResult.value || '').trim();
    if (outTime && !this.isTimeValue(outTime)) {
      this.toast.error('Enter out time as HH:mm');
      return;
    }

    const calls = [
      this.svc.updateContractorPunch(row.inPunchId, {
        punchTime: this.localDateTimeToIso(row.date, inTime),
        direction: 'IN',
      }),
    ];

    if (outTime) {
      const payload = {
        punchTime: this.localDateTimeToIso(row.date, outTime),
        direction: 'OUT' as const,
      };
      calls.push(
        row.outPunchId
          ? this.svc.updateContractorPunch(row.outPunchId, payload)
          : this.svc.createContractorPunch({
              contractorEmployeeId: row.contractorEmployeeId,
              ...payload,
            }),
      );
    }

    this.actionBusyId = row.rowKey;
    forkJoin(calls)
      .pipe(
        finalize(() => {
          this.actionBusyId = '';
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Contractor attendance updated');
          this.loadPunches();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to update attendance');
        },
      });
  }

  async deleteRow(row: ContractorAttendanceRow): Promise<void> {
    if (!row.editable) {
      this.toast.error('Only manually-entered punches can be deleted');
      return;
    }
    const ok = await this.dialog.confirm(
      'Delete Contractor Attendance',
      `Delete ${row.punchCount} attendance punch${row.punchCount === 1 ? '' : 'es'} for ${row.contractorEmployeeName || 'this contractor employee'} on ${this.localDayKey(row.date)}?`,
      { variant: 'danger', confirmText: 'Delete' },
    );
    if (!ok) return;

    this.actionBusyId = row.rowKey;
    forkJoin(row.punchIds.map((id) => this.svc.deleteContractorPunch(id)))
      .pipe(
        finalize(() => {
          this.actionBusyId = '';
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Contractor attendance deleted');
          this.loadPunches();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Failed to delete attendance');
        },
      });
  }

  private toIsoDate(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  private toAttendanceRows(rows: ContractorPunchRow[]): ContractorAttendanceRow[] {
    const groups = new Map<string, ContractorPunchRow[]>();
    for (const p of rows) {
      const key = `${p.contractorEmployeeId}|${this.localDayKey(p.punchTime)}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(p);
      groups.set(key, bucket);
    }

    return Array.from(groups.values())
      .map((group) => {
        const sorted = [...group].sort(
          (a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime(),
        );
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const inPunch = sorted.find((p) => p.direction === 'IN') ?? first;
        const outPunch =
          [...sorted].reverse().find((p) => p.direction === 'OUT') ??
          (sorted.length > 1 ? last : null);
        const inTime = inPunch?.punchTime ?? null;
        const outTime = outPunch?.punchTime ?? null;
        const rowKey = `${first.contractorEmployeeId}|${this.localDayKey(first.punchTime)}`;
        return {
          rowKey,
          date: first.punchTime,
          contractorEmployeeId: first.contractorEmployeeId,
          contractorEmployeeName: first.contractorEmployeeName,
          employeeCode: first.employeeCode ?? null,
          // The check read `row.source && row.source !== 'MANUAL'`, and the
          // endpoint sent no source, so face punches could be edited and
          // deleted. A row is editable only if every punch in it is manual.
          editable: sorted.every((p) => p.source === 'MANUAL'),
          inTime,
          outTime,
          inPunchId: inPunch.id,
          outPunchId: outPunch?.id ?? null,
          punchIds: sorted.map((p) => p.id),
          hours: this.hoursBetween(inTime, outTime),
          punchCount: sorted.length,
          source: last.source,
          matchScore: last.matchScore,
          livenessScore: last.livenessScore,
          photoUrl: last.photoUrl,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime() ||
          (a.contractorEmployeeName ?? '').localeCompare(b.contractorEmployeeName ?? ''),
      );
  }

  private localDayKey(iso: string): string {
    const d = new Date(iso);
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  private hoursBetween(start: string | null, end: string | null): string {
    if (!start || !end) return '-';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return '-';
    return (ms / 36e5).toFixed(2);
  }

  private safeFilePart(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'contractor';
  }

  private timeValue(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const h = `${d.getHours()}`.padStart(2, '0');
    const m = `${d.getMinutes()}`.padStart(2, '0');
    return `${h}:${m}`;
  }

  private isTimeValue(value: string): boolean {
    if (!/^\d{2}:\d{2}$/.test(value)) return false;
    const [h, m] = value.split(':').map(Number);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  }

  private localDateTimeToIso(dateIso: string, time: string): string {
    const date = this.localDayKey(dateIso);
    const [h, m] = time.split(':').map(Number);
    const [y, month, day] = date.split('-').map(Number);
    return new Date(y, month - 1, day, h, m, 0, 0).toISOString();
  }
}

interface ContractorAttendanceRow {
  rowKey: string;
  date: string;
  contractorEmployeeId: string;
  contractorEmployeeName: string | null;
  employeeCode: string | null;
  editable: boolean;
  inTime: string | null;
  outTime: string | null;
  inPunchId: string;
  outPunchId: string | null;
  punchIds: string[];
  hours: string;
  punchCount: number;
  source: string;
  matchScore: string | null;
  livenessScore: string | null;
  photoUrl: string | null;
}

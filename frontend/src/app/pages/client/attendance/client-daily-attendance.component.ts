import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
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
import {
  ClientAttendanceService,
  DailyAttendanceRecord,
  ApprovalStats,
} from './client-attendance.service';
import { ClientBranchesService } from '../../../core/client-branches.service';

interface BranchOption {
  value: string;
  label: string;
}

type StatusFilter = '' | 'PENDING' | 'APPROVED' | 'REJECTED';

const ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'HALF_DAY',
  'ON_LEAVE',
  'HOLIDAY',
  'WEEK_OFF',
] as const;

@Component({
  selector: 'app-client-daily-attendance',
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
        title="Daily Attendance"
        subtitle="View, edit and approve employee attendance. Only approved records are sent to payroll.">
        <ui-button variant="secondary" [disabled]="loading" (clicked)="load()">Refresh</ui-button>
      </ui-page-header>

      <!-- Filters -->
      <section class="card mb">
        <div class="toolbar">
          <label>
            <span>Date</span>
            <input autocomplete="off" id="da-date" name="selectedDate"
              type="date" [(ngModel)]="selectedDate" (change)="load()" />
          </label>
          <label>
            <span>Branch</span>
            <select id="da-branch" name="branchId" [(ngModel)]="branchId" (ngModelChange)="load()">
              <option *ngFor="let b of branchOptions" [value]="b.value">{{ b.label }}</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select id="da-approval-filter" name="statusFilter" [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()">
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>
          <div class="toolbar-actions">
            <ui-button size="sm" variant="primary" [disabled]="loading" (clicked)="load()">Load</ui-button>
          </div>
        </div>
      </section>

      <!-- Stats cards -->
      <section class="stats-grid mb">
        <article class="stat-card">
          <div class="stat-k">Total</div>
          <div class="stat-v">{{ stats.total }}</div>
        </article>
        <article class="stat-card pending">
          <div class="stat-k">Pending</div>
          <div class="stat-v">{{ stats.pending }}</div>
        </article>
        <article class="stat-card approved">
          <div class="stat-k">Approved</div>
          <div class="stat-v">{{ stats.approved }}</div>
        </article>
        <article class="stat-card rejected">
          <div class="stat-k">Rejected</div>
          <div class="stat-v">{{ stats.rejected }}</div>
        </article>
      </section>

      <ui-loading-spinner *ngIf="loading" text="Loading attendance..." size="lg"></ui-loading-spinner>

      <ng-container *ngIf="!loading">
        <!-- Bulk actions -->
        <section class="card mb" *ngIf="selectedIds.size > 0">
          <div class="bulk-bar">
            <span>{{ selectedIds.size }} record(s) selected</span>
            <ui-button size="sm" variant="primary" [disabled]="actionBusy" [loading]="actionBusy && actionType==='approve'" (clicked)="bulkApprove()">
              Approve Selected
            </ui-button>
            <ui-button size="sm" variant="danger" [disabled]="actionBusy" [loading]="actionBusy && actionType==='reject'" (clicked)="bulkReject()">
              Reject Selected
            </ui-button>
            <ui-button size="sm" variant="ghost" [disabled]="actionBusy" (clicked)="clearSelection()">
              Clear
            </ui-button>
          </div>
        </section>

        <!-- Select-all pending shortcut -->
        <section class="card mb" *ngIf="pendingRecords.length > 0 && selectedIds.size === 0">
          <div class="bulk-bar">
            <span>{{ pendingRecords.length }} pending record(s)</span>
            <ui-button size="sm" variant="secondary" (clicked)="selectAllPending()">
              Select All Pending
            </ui-button>
            <ui-button size="sm" variant="primary" [disabled]="actionBusy" [loading]="actionBusy && actionType==='approveAll'" (clicked)="approveAllPending()">
              Approve All Pending
            </ui-button>
          </div>
        </section>

        <!-- Data table -->
        <section class="card">
          <div class="section-head">
            <h3>Attendance Records</h3>
            <span class="muted">{{ filteredRecords.length }} of {{ records.length }} records</span>
          </div>

          <ui-empty-state
            *ngIf="!filteredRecords.length"
            title="No attendance records"
            description="No employee attendance found for the selected date and filters.">
          </ui-empty-state>

          <div class="table-wrap" *ngIf="filteredRecords.length">
            <table>
              <thead>
                <tr>
                  <th class="col-check">
                    <input type="checkbox" [checked]="allFilteredSelected" (change)="toggleSelectAll($event)" />
                  </th>
                  <th>Employee</th>
                  <th>Code</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Hours</th>
                  <th>OT</th>
                  <th>Source</th>
                  <th>Approval</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of filteredRecords; trackBy: trackById"
                    [class.row-pending]="row.approvalStatus === 'PENDING'"
                    [class.row-rejected]="row.approvalStatus === 'REJECTED'">
                  <td class="col-check">
                    <input type="checkbox" [checked]="selectedIds.has(row.id)" (change)="toggleSelect(row.id)" />
                  </td>
                  <td class="emp-name">{{ row.employeeName || '-' }}</td>
                  <td>{{ row.employeeCode }}</td>
                  <td>{{ row.branchName || '-' }}</td>
                  <td>
                    <span class="att-chip" [attr.data-status]="row.status">{{ row.status }}</span>
                  </td>
                  <td>{{ row.checkIn || '-' }}</td>
                  <td>{{ row.checkOut || '-' }}</td>
                  <td>{{ row.workedHours || '-' }}</td>
                  <td>{{ row.overtimeHours && +row.overtimeHours > 0 ? row.overtimeHours : '-' }}</td>
                  <td>
                    <span class="source-chip" [class.self]="row.selfMarked">
                      {{ row.selfMarked ? 'Self' : row.source }}
                    </span>
                  </td>
                  <td>
                    <span class="approval-chip" [attr.data-approval]="row.approvalStatus">
                      {{ row.approvalStatus }}
                    </span>
                  </td>
                  <td class="actions-cell">
                    <ui-button size="sm" variant="ghost" (clicked)="openEdit(row)">Edit</ui-button>
                    <ui-button size="sm" variant="primary"
                      *ngIf="row.approvalStatus !== 'APPROVED'"
                      [disabled]="actionBusy"
                      (clicked)="approveSingle(row.id)">
                      Approve
                    </ui-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Edit modal -->
        <div class="modal-overlay" *ngIf="editRow" (click)="closeEdit()">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <h3>Edit Attendance</h3>
            <p class="muted">{{ editRow.employeeName }} ({{ editRow.employeeCode }}) — {{ editRow.date }}</p>

            <label>
              <span>Status</span>
              <select id="da-edit-status" name="editStatus" [(ngModel)]="editForm.status">
                <option *ngFor="let s of attendanceStatuses" [value]="s">{{ s }}</option>
              </select>
            </label>

            <div class="form-row">
              <label>
                <span>Check In</span>
                <input autocomplete="off" id="da-edit-checkin" name="editCheckIn" type="time" [(ngModel)]="editForm.checkIn" />
              </label>
              <label>
                <span>Check Out</span>
                <input autocomplete="off" id="da-edit-checkout" name="editCheckOut" type="time" [(ngModel)]="editForm.checkOut" />
              </label>
            </div>

            <div class="form-row">
              <label>
                <span>Worked Hours</span>
                <input autocomplete="off" id="da-edit-worked" name="editWorked" type="number" step="0.25" min="0" max="24" [(ngModel)]="editForm.workedHours" />
              </label>
              <label>
                <span>OT Hours</span>
                <input autocomplete="off" id="da-edit-ot" name="editOT" type="number" step="0.25" min="0" max="24" [(ngModel)]="editForm.overtimeHours" />
              </label>
            </div>

            <label>
              <span>Remarks</span>
              <textarea autocomplete="off" id="da-edit-remarks" name="editRemarks" rows="2" [(ngModel)]="editForm.remarks" placeholder="Optional remarks"></textarea>
            </label>

            <div class="modal-actions">
              <ui-button variant="secondary" [disabled]="editBusy" (clicked)="closeEdit()">Cancel</ui-button>
              <ui-button variant="primary" [disabled]="editBusy" [loading]="editBusy" (clicked)="saveEdit()">Save</ui-button>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `,
  styles: [
    `
      .page { max-width: 1400px; margin: 0 auto; padding: 1rem; }
      .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 1rem; box-shadow: 0 6px 20px rgba(15, 23, 42, .04); }
      .mb { margin-bottom: .85rem; }
      .toolbar { display: grid; grid-template-columns: 200px 220px 160px auto; gap: .65rem; align-items: end; }
      .toolbar-actions { display: flex; align-items: end; }
      label { display: flex; flex-direction: column; gap: .35rem; }
      label > span { color: #4b5563; font-size: .78rem; font-weight: 600; }
      input, select, textarea { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: .5rem .65rem; font-size: .84rem; }
      .stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .65rem; }
      .stat-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: .55rem .7rem; background: #f8fafc; }
      .stat-k { color: #6b7280; font-size: .72rem; font-weight: 700; text-transform: uppercase; }
      .stat-v { color: #111827; font-size: 1.2rem; font-weight: 700; line-height: 1.1; margin-top: .15rem; }
      .stat-card.pending { border-color: #fcd34d; background: #fffbeb; }
      .stat-card.pending .stat-v { color: #92400e; }
      .stat-card.approved { border-color: #86efac; background: #f0fdf4; }
      .stat-card.approved .stat-v { color: #166534; }
      .stat-card.rejected { border-color: #fca5a5; background: #fef2f2; }
      .stat-card.rejected .stat-v { color: #991b1b; }
      .section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .6rem; }
      .section-head h3 { margin: 0; font-size: 1rem; font-weight: 700; color: #111827; }
      .muted { color: #6b7280; font-size: .78rem; }
      .bulk-bar { display: flex; align-items: center; gap: .55rem; flex-wrap: wrap; }
      .bulk-bar span { font-weight: 600; color: #111827; font-size: .84rem; }
      .table-wrap { overflow: auto; }
      table { width: 100%; min-width: 1000px; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #e5e7eb; text-align: left; padding: .5rem .45rem; font-size: .8rem; color: #1f2937; }
      th { color: #6b7280; text-transform: uppercase; letter-spacing: .02em; font-size: .7rem; font-weight: 700; white-space: nowrap; }
      .col-check { width: 36px; text-align: center; }
      .col-check input { width: auto; margin: 0; }
      .emp-name { font-weight: 600; color: #111827; white-space: nowrap; }
      .att-chip { border: 1px solid #d1d5db; background: #f9fafb; color: #374151; border-radius: 999px; font-size: .68rem; font-weight: 700; padding: .1rem .5rem; white-space: nowrap; }
      .att-chip[data-status=PRESENT] { border-color: #86efac; color: #166534; background: #f0fdf4; }
      .att-chip[data-status=ABSENT] { border-color: #fca5a5; color: #991b1b; background: #fef2f2; }
      .att-chip[data-status=HALF_DAY] { border-color: #fcd34d; color: #92400e; background: #fffbeb; }
      .att-chip[data-status=ON_LEAVE] { border-color: #93c5fd; color: #1e40af; background: #eff6ff; }
      .att-chip[data-status=HOLIDAY] { border-color: #c4b5fd; color: #5b21b6; background: #f5f3ff; }
      .att-chip[data-status=WEEK_OFF] { border-color: #d1d5db; color: #6b7280; background: #f3f4f6; }
      .source-chip { font-size: .7rem; font-weight: 600; color: #4b5563; }
      .source-chip.self { color: #0369a1; }
      .approval-chip { border: 1px solid #d1d5db; background: #f9fafb; color: #374151; border-radius: 999px; font-size: .68rem; font-weight: 700; padding: .1rem .5rem; white-space: nowrap; }
      .approval-chip[data-approval=PENDING] { border-color: #fcd34d; color: #92400e; background: #fffbeb; }
      .approval-chip[data-approval=APPROVED] { border-color: #86efac; color: #166534; background: #f0fdf4; }
      .approval-chip[data-approval=REJECTED] { border-color: #fca5a5; color: #991b1b; background: #fef2f2; }
      .row-pending { background: #fffbeb; }
      .row-rejected { background: #fef2f2; }
      .actions-cell { white-space: nowrap; display: flex; gap: .3rem; }
      .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
      .modal-card { background: #fff; border-radius: 16px; padding: 1.2rem; width: 480px; max-width: 95vw; max-height: 90vh; overflow: auto; box-shadow: 0 12px 40px rgba(0,0,0,.15); }
      .modal-card h3 { margin: 0 0 .3rem; font-size: 1rem; color: #111827; }
      .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
      .modal-actions { display: flex; justify-content: flex-end; gap: .45rem; margin-top: .75rem; }
      @media (max-width: 768px) {
        .toolbar, .stats-grid, .form-row { grid-template-columns: 1fr; }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientDailyAttendanceComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly attendanceStatuses = ATTENDANCE_STATUSES;

  selectedDate = this.todayStr();
  branchId = '';
  statusFilter: StatusFilter = '';

  loading = false;
  actionBusy = false;
  actionType = '';
  editBusy = false;

  branchOptions: BranchOption[] = [{ value: '', label: 'All Branches' }];
  records: DailyAttendanceRecord[] = [];
  filteredRecords: DailyAttendanceRecord[] = [];
  stats: ApprovalStats = { total: 0, pending: 0, approved: 0, rejected: 0 };

  selectedIds = new Set<string>();

  editRow: DailyAttendanceRecord | null = null;
  editForm = { status: 'PRESENT', checkIn: '', checkOut: '', workedHours: 0, overtimeHours: 0, remarks: '' };

  constructor(
    private readonly svc: ClientAttendanceService,
    private readonly branchSvc: ClientBranchesService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadBranches();
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBranches(): void {
    this.branchSvc
      .list()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const branches = Array.isArray(res) ? res : res?.data || [];
          this.branchOptions = [
            { value: '', label: 'All Branches' },
            ...branches.map((b: any) => ({
              value: b.id,
              label: b.branchName || b.branchname || b.name || b.id,
            })),
          ];
          this.cdr.markForCheck();
        },
        error: () => {},
      });
  }

  load(): void {
    this.loading = true;
    this.selectedIds.clear();

    const bid = this.branchId || undefined;

    forkJoin({
      records: this.svc.listDaily(this.selectedDate, bid).pipe(catchError(() => of([]))),
      stats: this.svc.getApprovalStats(this.selectedDate, bid).pipe(
        catchError(() => of({ total: 0, pending: 0, approved: 0, rejected: 0 })),
      ),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ records, stats }) => {
          this.records = records;
          this.stats = stats;
          this.applyFilter();
        },
      });
  }

  applyFilter(): void {
    if (!this.statusFilter) {
      this.filteredRecords = [...this.records];
    } else {
      this.filteredRecords = this.records.filter(
        (r) => r.approvalStatus === this.statusFilter,
      );
    }
    this.cdr.markForCheck();
  }

  get pendingRecords(): DailyAttendanceRecord[] {
    return this.records.filter((r) => r.approvalStatus === 'PENDING');
  }

  get allFilteredSelected(): boolean {
    return (
      this.filteredRecords.length > 0 &&
      this.filteredRecords.every((r) => this.selectedIds.has(r.id))
    );
  }

  toggleSelect(id: string): void {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    this.cdr.markForCheck();
  }

  toggleSelectAll(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) {
      this.filteredRecords.forEach((r) => this.selectedIds.add(r.id));
    } else {
      this.filteredRecords.forEach((r) => this.selectedIds.delete(r.id));
    }
    this.cdr.markForCheck();
  }

  selectAllPending(): void {
    this.pendingRecords.forEach((r) => this.selectedIds.add(r.id));
    this.cdr.markForCheck();
  }

  clearSelection(): void {
    this.selectedIds.clear();
    this.cdr.markForCheck();
  }

  bulkApprove(): void {
    const ids = [...this.selectedIds];
    if (!ids.length) return;
    this.actionBusy = true;
    this.actionType = 'approve';
    this.svc
      .approveRecords(ids)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.actionType = '';
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.toast.success(`${res.approved} record(s) approved.`);
          this.selectedIds.clear();
          this.load();
        },
        error: () => this.toast.error('Failed to approve records.'),
      });
  }

  bulkReject(): void {
    const ids = [...this.selectedIds];
    if (!ids.length) return;
    this.actionBusy = true;
    this.actionType = 'reject';
    this.svc
      .rejectRecords(ids)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.actionType = '';
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.toast.success(`${res.rejected} record(s) rejected.`);
          this.selectedIds.clear();
          this.load();
        },
        error: () => this.toast.error('Failed to reject records.'),
      });
  }

  approveAllPending(): void {
    const ids = this.pendingRecords.map((r) => r.id);
    if (!ids.length) return;
    this.actionBusy = true;
    this.actionType = 'approveAll';
    this.svc
      .approveRecords(ids)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.actionType = '';
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.toast.success(`${res.approved} record(s) approved.`);
          this.load();
        },
        error: () => this.toast.error('Failed to approve records.'),
      });
  }

  approveSingle(id: string): void {
    this.actionBusy = true;
    this.actionType = 'approve';
    this.svc
      .approveRecords([id])
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.actionType = '';
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Record approved.');
          this.load();
        },
        error: () => this.toast.error('Failed to approve.'),
      });
  }

  // ── Edit ───────────────────────────────────────────────
  openEdit(row: DailyAttendanceRecord): void {
    this.editRow = row;
    this.editForm = {
      status: row.status || 'PRESENT',
      checkIn: row.checkIn || '',
      checkOut: row.checkOut || '',
      workedHours: Number(row.workedHours || 0),
      overtimeHours: Number(row.overtimeHours || 0),
      remarks: row.remarks || '',
    };
    this.cdr.markForCheck();
  }

  closeEdit(): void {
    this.editRow = null;
    this.cdr.markForCheck();
  }

  saveEdit(): void {
    if (!this.editRow) return;
    this.editBusy = true;
    this.svc
      .editRecord(this.editRow.id, {
        status: this.editForm.status,
        checkIn: this.editForm.checkIn || undefined,
        checkOut: this.editForm.checkOut || undefined,
        workedHours: this.editForm.workedHours,
        overtimeHours: this.editForm.overtimeHours,
        remarks: this.editForm.remarks || undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.editBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Attendance record updated.');
          this.closeEdit();
          this.load();
        },
        error: () => this.toast.error('Failed to update record.'),
      });
  }

  trackById(_index: number, row: DailyAttendanceRecord): string {
    return row.id;
  }

  private todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

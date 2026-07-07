import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  DuplicateAlert,
  FaceDeskDashboard,
  FaceDeskService,
  FaceDeskSettings,
  PendingEnrollmentRow,
  ReviewItem,
} from './facedesk.service';

type Tab =
  | 'dashboard'
  | 'pending'
  | 'duplicates'
  | 'review'
  | 'reports'
  | 'settings';

/**
 * FaceDesk V2 admin console. Attendance capture and camera-based enrollment
 * run on the kiosk device (V2 kiosk app); this portal is the admin control
 * surface: dashboard, exception review, reports, payroll sync and thresholds.
 */
@Component({
  standalone: true,
  selector: 'app-facedesk',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="FaceDesk — Smart Attendance"
        description="Admin console for the FaceDesk kiosk: monitor attendance, resolve exceptions, run reports and sync payroll. Face capture happens on the kiosk device.">
      </ui-page-header>

      <div class="tab-bar">
        <button class="tab-btn" [class.active]="tab === 'dashboard'" (click)="switch('dashboard')">Dashboard</button>
        <button class="tab-btn" [class.active]="tab === 'pending'" (click)="switch('pending')">Pending Enrollment</button>
        <button class="tab-btn" [class.active]="tab === 'duplicates'" (click)="switch('duplicates')">
          Duplicate Alerts
          <span *ngIf="cards && cards.duplicateAlertsPending > 0" class="badge">{{ cards.duplicateAlertsPending }}</span>
        </button>
        <button class="tab-btn" [class.active]="tab === 'review'" (click)="switch('review')">
          Review Queue
          <span *ngIf="cards && cards.reviewQueuePending > 0" class="badge">{{ cards.reviewQueuePending }}</span>
        </button>
        <button class="tab-btn" [class.active]="tab === 'reports'" (click)="switch('reports')">Reports</button>
        <button class="tab-btn" [class.active]="tab === 'settings'" (click)="switch('settings')">Settings</button>
      </div>

      <!-- DASHBOARD -->
      <ng-container *ngIf="tab === 'dashboard'">
        <ui-loading-spinner *ngIf="loading" text="Loading dashboard..." size="lg"></ui-loading-spinner>
        <div *ngIf="!loading && cards" class="cards">
          <div class="card"><div class="num">{{ cards.totalEmployees }}</div><div class="lbl">Total Employees</div></div>
          <div class="card"><div class="num text-green-700">{{ cards.enrolledEmployees }}</div><div class="lbl">Enrolled</div></div>
          <div class="card"><div class="num text-amber-700">{{ cards.pendingEnrollment }}</div><div class="lbl">Pending Enrollment</div></div>
          <div class="card"><div class="num text-green-700">{{ cards.todayPresent }}</div><div class="lbl">Today Present</div></div>
          <div class="card"><div class="num text-red-600">{{ cards.todayAbsent }}</div><div class="lbl">Today Absent</div></div>
          <div class="card"><div class="num">{{ cards.failedAttemptsToday }}</div><div class="lbl">Failed Today</div></div>
          <div class="card"><div class="num text-amber-700">{{ cards.duplicateAlertsPending }}</div><div class="lbl">Duplicate Alerts</div></div>
          <div class="card"><div class="num text-amber-700">{{ cards.reviewQueuePending }}</div><div class="lbl">Review Queue</div></div>
          <div class="card"><div class="num text-green-700">{{ cards.devicesOnline }}</div><div class="lbl">Devices Online</div></div>
          <div class="card"><div class="num text-gray-500">{{ cards.devicesOffline }}</div><div class="lbl">Devices Offline</div></div>
        </div>
        <p *ngIf="!loading && cards" class="text-xs text-gray-500 mt-3">
          Last sync: {{ cards.lastSyncTime ? (cards.lastSyncTime | date: 'dd MMM yyyy, HH:mm') : '—' }}
        </p>
      </ng-container>

      <!-- PENDING ENROLLMENT -->
      <ng-container *ngIf="tab === 'pending'">
        <p class="text-sm text-gray-600 mb-3">Employees not yet enrolled. Enrollment is captured on the kiosk device in enrollment mode.</p>
        <ui-loading-spinner *ngIf="loading" text="Loading..." size="lg"></ui-loading-spinner>
        <ui-empty-state *ngIf="!loading && pending.length === 0" title="All enrolled" description="No employees are pending enrollment."></ui-empty-state>
        <table *ngIf="!loading && pending.length > 0" class="tbl">
          <thead><tr><th>Code</th><th>Employee</th><th>Status</th></tr></thead>
          <tbody>
            <tr *ngFor="let r of pending">
              <td class="mono">{{ r.employeeCode }}</td>
              <td>{{ r.employeeName || r.name }}</td>
              <td><span class="pill amber">{{ r.status || r.enrollmentStatus || 'PENDING' }}</span></td>
            </tr>
          </tbody>
        </table>
      </ng-container>

      <!-- DUPLICATE ALERTS -->
      <ng-container *ngIf="tab === 'duplicates'">
        <ui-loading-spinner *ngIf="loading" text="Loading..." size="lg"></ui-loading-spinner>
        <ui-empty-state *ngIf="!loading && duplicates.length === 0" title="No duplicate alerts" description="No pending duplicate-face alerts."></ui-empty-state>
        <table *ngIf="!loading && duplicates.length > 0" class="tbl">
          <thead><tr><th>New Employee</th><th>Matched</th><th>Similarity</th><th>When</th><th class="right">Actions</th></tr></thead>
          <tbody>
            <tr *ngFor="let a of duplicates">
              <td class="mono">{{ a.newEmployeeId }}</td>
              <td class="mono">{{ a.matchedEmployeeId }}</td>
              <td>{{ (+a.similarityScore).toFixed(3) }}</td>
              <td>{{ a.createdAt | date: 'dd MMM, HH:mm' }}</td>
              <td class="right nowrap">
                <button class="link green" (click)="dupeAction(a, 'APPROVE')">Approve</button>
                <button class="link red" (click)="dupeAction(a, 'REJECT')">Reject</button>
                <button class="link gray" (click)="dupeAction(a, 'FALSE_ALERT')">False</button>
              </td>
            </tr>
          </tbody>
        </table>
      </ng-container>

      <!-- REVIEW QUEUE -->
      <ng-container *ngIf="tab === 'review'">
        <ui-loading-spinner *ngIf="loading" text="Loading..." size="lg"></ui-loading-spinner>
        <ui-empty-state *ngIf="!loading && review.length === 0" title="Nothing to review" description="No pending review items."></ui-empty-state>
        <table *ngIf="!loading && review.length > 0" class="tbl">
          <thead><tr><th>Issue</th><th>Employee</th><th>Confidence</th><th>Note</th><th>When</th><th class="right">Actions</th></tr></thead>
          <tbody>
            <tr *ngFor="let r of review">
              <td><span class="pill amber">{{ r.issueType }}</span></td>
              <td class="mono">{{ r.employeeId || '—' }}</td>
              <td>{{ r.confidenceScore ? (+r.confidenceScore).toFixed(3) : '—' }}</td>
              <td class="text-xs text-gray-600">{{ r.adminRemarks || '—' }}</td>
              <td>{{ r.createdAt | date: 'dd MMM, HH:mm' }}</td>
              <td class="right nowrap">
                <button class="link green" (click)="reviewAction(r, 'APPROVE')">Approve</button>
                <button class="link red" (click)="reviewAction(r, 'REJECT')">Reject</button>
              </td>
            </tr>
          </tbody>
        </table>
      </ng-container>

      <!-- REPORTS -->
      <ng-container *ngIf="tab === 'reports'">
        <div class="flex flex-wrap items-end gap-2 mb-3">
          <label class="text-sm">From <input type="date" [(ngModel)]="from" class="inp"></label>
          <label class="text-sm">To <input type="date" [(ngModel)]="to" class="inp"></label>
          <select [(ngModel)]="reportKind" class="inp">
            <option value="daily">Daily attendance</option>
            <option value="employee">Employee-wise</option>
            <option value="branch">Branch-wise</option>
            <option value="late">Late coming</option>
            <option value="early">Early going</option>
            <option value="absent">Absent</option>
            <option value="failed">Failed attempts</option>
            <option value="duplicates">Duplicates</option>
            <option value="pending-enrollment">Pending enrollment</option>
            <option value="device-sync">Device sync</option>
            <option value="payroll-export">Payroll export</option>
          </select>
          <button class="btn" (click)="runReport()">Run</button>
          <button class="btn primary" (click)="syncPayroll()">Sync to Payroll</button>
        </div>
        <ui-loading-spinner *ngIf="loading" text="Running report..." size="lg"></ui-loading-spinner>
        <ui-empty-state *ngIf="!loading && reportRows.length === 0" title="No data" description="Run a report to see results."></ui-empty-state>
        <div *ngIf="!loading && reportRows.length > 0" class="overflow-auto">
          <table class="tbl">
            <thead><tr><th *ngFor="let c of reportCols">{{ c }}</th></tr></thead>
            <tbody>
              <tr *ngFor="let row of reportRows">
                <td *ngFor="let c of reportCols" class="text-xs">{{ fmt(row[c]) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="text-xs text-gray-500 mt-2">{{ reportRows.length }} rows</p>
        </div>
      </ng-container>

      <!-- SETTINGS -->
      <ng-container *ngIf="tab === 'settings'">
        <ui-loading-spinner *ngIf="loading" text="Loading settings..." size="lg"></ui-loading-spinner>
        <div *ngIf="!loading && settings" class="settings">
          <label>Match confidence (%)<input type="number" [(ngModel)]="settings.matchConfidencePct" class="inp"></label>
          <label>Retry confidence (%)<input type="number" [(ngModel)]="settings.retryConfidencePct" class="inp"></label>
          <label>Duplicate threshold (%)<input type="number" [(ngModel)]="settings.duplicatePct" class="inp"></label>
          <label>Min face samples<input type="number" [(ngModel)]="settings.minFaceSamples" class="inp"></label>
          <label>Frames per capture<input type="number" [(ngModel)]="settings.frameCaptureCount" class="inp"></label>
          <label class="chk"><input type="checkbox" [(ngModel)]="settings.livenessRequired"> Liveness required</label>
          <label class="chk"><input type="checkbox" [(ngModel)]="settings.offlineSyncEnabled"> Offline sync enabled</label>
          <p class="text-xs text-gray-500 col-span-2">
            Percentages map to the model's calibrated cosine thresholds (accept ≈ {{ settings.acceptCosine }},
            retry ≈ {{ settings.retryCosine }}). Tune per site.
          </p>
          <div class="col-span-2"><button class="btn primary" (click)="saveSettings()">Save settings</button></div>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .page { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }
    .tab-bar { display: flex; gap: 0; border-bottom: 1px solid #e5e7eb; margin: 0 0 1.25rem; flex-wrap: wrap; }
    .tab-btn { padding: 0.625rem 1rem; font-size: 0.875rem; font-weight: 500; color: #6b7280; background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer; }
    .tab-btn:hover { color: #111827; }
    .tab-btn.active { color: #4f46e5; border-bottom-color: #4f46e5; }
    .badge { margin-left: 4px; background: #fef3c7; color: #92400e; border-radius: 9999px; padding: 0 6px; font-size: 0.7rem; font-weight: 600; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.75rem; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
    .card .num { font-size: 1.75rem; font-weight: 700; color: #111827; }
    .card .lbl { font-size: 0.75rem; color: #6b7280; margin-top: 2px; }
    .tbl { width: 100%; font-size: 0.875rem; background: #fff; border: 1px solid #e5e7eb; border-radius: 0.5rem; border-collapse: collapse; }
    .tbl th { text-align: left; padding: 0.5rem 0.75rem; background: #f9fafb; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151; }
    .tbl td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f3f4f6; }
    .mono { font-family: monospace; font-size: 0.75rem; }
    .right { text-align: right; } .nowrap { white-space: nowrap; }
    .pill { display: inline-flex; padding: 0.1rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 600; }
    .pill.amber { background: #fef3c7; color: #92400e; }
    .link { font-size: 0.75rem; margin-left: 0.6rem; background: none; border: none; cursor: pointer; }
    .link.green { color: #047857; } .link.red { color: #dc2626; } .link.gray { color: #6b7280; }
    .btn { padding: 0.4rem 0.9rem; border: 1px solid #d1d5db; border-radius: 0.5rem; background: #fff; font-size: 0.875rem; cursor: pointer; }
    .btn.primary { background: #4f46e5; color: #fff; border-color: #4f46e5; }
    .inp { display: block; padding: 0.4rem 0.6rem; border: 1px solid #d1d5db; border-radius: 0.5rem; font-size: 0.875rem; }
    .settings { display: grid; grid-template-columns: repeat(2, minmax(200px, 320px)); gap: 1rem; background: #fff; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1.25rem; }
    .settings label { font-size: 0.8125rem; color: #374151; }
    .settings label.chk { display: flex; align-items: center; gap: 0.5rem; }
    .col-span-2 { grid-column: span 2; }
  `],
})
export class FaceDeskComponent implements OnInit {
  tab: Tab = 'dashboard';
  loading = false;

  cards: FaceDeskDashboard | null = null;
  pending: PendingEnrollmentRow[] = [];
  duplicates: DuplicateAlert[] = [];
  review: ReviewItem[] = [];
  settings: FaceDeskSettings | null = null;

  reportKind = 'daily';
  from = '';
  to = '';
  reportRows: Record<string, unknown>[] = [];
  reportCols: string[] = [];

  constructor(
    private svc: FaceDeskService,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  switch(t: Tab): void {
    this.tab = t;
    if (t === 'dashboard') this.loadDashboard();
    if (t === 'pending') this.load(this.svc.pendingEnrollment(), (r) => (this.pending = r));
    if (t === 'duplicates') this.load(this.svc.duplicateAlerts(), (r) => (this.duplicates = r));
    if (t === 'review') this.load(this.svc.reviewQueue(), (r) => (this.review = r));
    if (t === 'settings') this.load(this.svc.getSettings(), (r) => (this.settings = r));
  }

  private load<T>(obs: Observable<T>, assign: (r: T) => void): void {
    this.loading = true;
    obs.subscribe({
      next: (r: T) => { assign(r); this.loading = false; this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.toast.error('Failed to load'); this.cdr.detectChanges(); },
    });
  }

  loadDashboard(): void {
    this.load(this.svc.dashboard(), (r: FaceDeskDashboard) => (this.cards = r));
  }

  async dupeAction(a: DuplicateAlert, action: 'APPROVE' | 'REJECT' | 'FALSE_ALERT'): Promise<void> {
    const ok = await this.dialog.confirm(
      'Duplicate Alert',
      `${action} this duplicate alert?`,
      action === 'REJECT' ? { variant: 'danger', confirmText: 'Reject' } : { confirmText: action },
    );
    if (!ok) return;
    this.svc.actOnDuplicate(a.alertId, action).subscribe({
      next: () => { this.toast.success('Done'); this.switch('duplicates'); },
      error: (e) => this.toast.error(e?.error?.message || 'Action failed'),
    });
  }

  async reviewAction(r: ReviewItem, action: 'APPROVE' | 'REJECT'): Promise<void> {
    const ok = await this.dialog.confirm(
      'Review Item',
      `${action} this ${r.issueType} item?`,
      action === 'REJECT' ? { variant: 'danger', confirmText: 'Reject' } : { confirmText: action },
    );
    if (!ok) return;
    this.svc.actOnReview(r.reviewId, action).subscribe({
      next: () => { this.toast.success('Done'); this.switch('review'); },
      error: (e) => this.toast.error(e?.error?.message || 'Action failed'),
    });
  }

  runReport(): void {
    this.loading = true;
    this.svc.report(this.reportKind, this.from || undefined, this.to || undefined).subscribe({
      next: (rows) => {
        this.reportRows = rows ?? [];
        this.reportCols = rows && rows.length ? Object.keys(rows[0]) : [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.toast.error('Report failed'); this.cdr.detectChanges(); },
    });
  }

  async syncPayroll(): Promise<void> {
    const ok = await this.dialog.confirm(
      'Sync to Payroll',
      'Push approved attendance to payroll for the selected range?',
      { confirmText: 'Sync' },
    );
    if (!ok) return;
    this.svc.pushToPayroll(this.from || undefined, this.to || undefined).subscribe({
      next: (r) => this.toast.success(`Pushed ${r.pushed} of ${r.received} punches to payroll`),
      error: (e) => this.toast.error(e?.error?.message || 'Payroll sync failed'),
    });
  }

  saveSettings(): void {
    if (!this.settings) return;
    this.svc.updateSettings(this.settings).subscribe({
      next: (r) => { this.settings = r; this.toast.success('Settings saved'); },
      error: (e) => this.toast.error(e?.error?.message || 'Save failed'),
    });
  }

  fmt(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) {
      return new Date(v).toLocaleString();
    }
    return String(v);
  }
}

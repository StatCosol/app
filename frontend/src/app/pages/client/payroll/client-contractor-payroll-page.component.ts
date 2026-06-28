import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  ContractorPayrollApiService,
  PayrollSheet,
  PayrollSheetRow,
  WageBreakupRow,
} from '../../../core/contractor-payroll-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { LoadingSpinnerComponent } from '../../../shared/ui';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

@Component({
  selector: 'app-client-contractor-payroll-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1 class="page-title">Contractor Payroll Approval</h1>
        <p class="page-subtitle">Review, approve or reject contractor wage sheets submitted by branch desk</p>
      </div>

      <!-- Filters -->
      <div class="filter-bar">
        <select [(ngModel)]="selectedMonth" (ngModelChange)="reload()" class="filter-select">
          <option *ngFor="let m of months; let i = index" [value]="i + 1">{{ m }}</option>
        </select>
        <select [(ngModel)]="selectedYear" (ngModelChange)="reload()" class="filter-select">
          <option *ngFor="let y of years" [value]="y">{{ y }}</option>
        </select>
      </div>

      <div *ngIf="loading" class="flex justify-center py-12"><ui-loading-spinner /></div>

      <ng-container *ngIf="!loading">

        <div *ngIf="!sheet" class="empty-card">
          No wage sheet submitted for {{ monthLabel }}. Branch desk must generate and submit first.
        </div>

        <ng-container *ngIf="sheet">
          <!-- Status bar -->
          <div class="status-card">
            <div class="status-left">
              <span class="badge badge-{{ sheet.status.toLowerCase() }}">{{ sheet.status }}</span>
              <span class="period-label">{{ monthLabel }}</span>
            </div>
            <div class="actions" *ngIf="sheet.status === 'SUBMITTED'">
              <button class="btn btn-success" (click)="openApprove()" [disabled]="reviewing">Approve</button>
              <button class="btn btn-danger" (click)="openReject()" [disabled]="reviewing">Reject</button>
              <button class="btn btn-outline" (click)="exportSheet()">⬇ Export Excel</button>
            </div>
            <div class="actions" *ngIf="sheet.status !== 'SUBMITTED'">
              <button class="btn btn-outline" (click)="exportSheet()">⬇ Export Excel</button>
            </div>
          </div>

          <div *ngIf="sheet.status === 'REJECTED' && sheet.reviewNote" class="reject-banner">
            <strong>Rejection reason:</strong> {{ sheet.reviewNote }}
          </div>

          <!-- Wage Breakup reference -->
          <div *ngIf="breakupRows.length" class="card" style="margin-bottom:16px">
            <div class="card-title">Approved Wage Breakup (uploaded by principal employer)</div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr>
                  <th>Employee</th><th class="r">Gross</th><th class="r">Basic</th>
                  <th class="r">DA</th><th class="r">HRA</th><th class="r">Special</th>
                  <th class="r">Other</th><th class="r">Basic+DA (PF basis)</th>
                </tr></thead>
                <tbody>
                  <tr *ngFor="let r of breakupRows">
                    <td>{{ r.employeeName }}</td>
                    <td class="r">{{ r.monthlyGross | number:'1.2-2' }}</td>
                    <td class="r">{{ r.basic | number:'1.2-2' }}</td>
                    <td class="r">{{ r.da | number:'1.2-2' }}</td>
                    <td class="r">{{ r.hra | number:'1.2-2' }}</td>
                    <td class="r">{{ r.specialAllowance | number:'1.2-2' }}</td>
                    <td class="r">{{ r.otherAllowances | number:'1.2-2' }}</td>
                    <td class="r bold">{{ (r.basic + r.da) | number:'1.2-2' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Wage sheet rows -->
          <div class="card">
            <div class="card-title" style="margin-bottom:12px">Wage Calculation — {{ monthLabel }}</div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr>
                  <th>Employee</th><th>Designation</th>
                  <th class="r">Monthly Gross</th><th class="r">Days</th><th class="r">Earned Gross</th>
                  <th class="r">PF Basis</th><th class="r">PF (Emp)</th><th class="r">PF (Emplr)</th>
                  <th class="r">ESI (Emp)</th><th class="r">ESI (Emplr)</th>
                  <th class="r">Net Pay</th><th class="r">CTC</th><th>Att. Source</th>
                </tr></thead>
                <tbody>
                  <tr *ngFor="let r of rows">
                    <td>{{ r.employeeName }}</td>
                    <td>{{ r.designation || '—' }}</td>
                    <td class="r">{{ r.monthlyGross | number:'1.0-0' }}</td>
                    <td class="r">{{ r.workedDays }}</td>
                    <td class="r">{{ r.earnedGross | number:'1.2-2' }}</td>
                    <td class="r">{{ r.pfBasis | number:'1.2-2' }}</td>
                    <td class="r">{{ r.pfEmployee | number:'1.2-2' }}</td>
                    <td class="r">{{ r.pfEmployer | number:'1.2-2' }}</td>
                    <td class="r">{{ r.esiEmployee | number:'1.2-2' }}</td>
                    <td class="r">{{ r.esiEmployer | number:'1.2-2' }}</td>
                    <td class="r bold">{{ r.netPay | number:'1.2-2' }}</td>
                    <td class="r bold">{{ r.ctc | number:'1.2-2' }}</td>
                    <td><span class="src-badge src-{{ r.attendanceSource.toLowerCase() }}">{{ r.attendanceSource }}</span></td>
                  </tr>
                  <tr *ngIf="rows.length" class="totals-row">
                    <td colspan="4"><strong>TOTAL</strong></td>
                    <td class="r bold">{{ sum('earnedGross') | number:'1.2-2' }}</td>
                    <td class="r bold">{{ sum('pfBasis') | number:'1.2-2' }}</td>
                    <td class="r bold">{{ sum('pfEmployee') | number:'1.2-2' }}</td>
                    <td class="r bold">{{ sum('pfEmployer') | number:'1.2-2' }}</td>
                    <td class="r bold">{{ sum('esiEmployee') | number:'1.2-2' }}</td>
                    <td class="r bold">{{ sum('esiEmployer') | number:'1.2-2' }}</td>
                    <td class="r bold">{{ sum('netPay') | number:'1.2-2' }}</td>
                    <td class="r bold">{{ sum('ctc') | number:'1.2-2' }}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Approve confirm inline -->
          <div *ngIf="approveMode" class="review-panel">
            <p><strong>Approve</strong> the {{ monthLabel }} wage sheet?</p>
            <textarea [(ngModel)]="reviewNote" rows="2" placeholder="Optional approval note" class="note-input"></textarea>
            <div class="review-actions">
              <button class="btn btn-success" (click)="confirmApprove()" [disabled]="reviewing">
                {{ reviewing ? 'Approving…' : 'Confirm Approve' }}
              </button>
              <button class="btn btn-outline" (click)="approveMode = false">Cancel</button>
            </div>
          </div>

          <div *ngIf="rejectMode" class="review-panel reject">
            <p><strong>Reject</strong> the {{ monthLabel }} wage sheet — provide a reason:</p>
            <textarea [(ngModel)]="reviewNote" rows="3" placeholder="Rejection reason (required)" class="note-input"></textarea>
            <div class="review-actions">
              <button class="btn btn-danger" (click)="confirmReject()" [disabled]="reviewing || !reviewNote.trim()">
                {{ reviewing ? 'Rejecting…' : 'Confirm Reject' }}
              </button>
              <button class="btn btn-outline" (click)="rejectMode = false">Cancel</button>
            </div>
          </div>

        </ng-container>

      </ng-container>
    </div>
  `,
  styles: [`
    .page-container { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .page-header { margin-bottom: 20px; }
    .page-title { font-size: 22px; font-weight: 700; }
    .page-subtitle { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
    .filter-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .filter-select { border: 1px solid var(--border); border-radius: 6px; padding: 7px 12px; background: var(--bg); color: var(--text); font-size: 13px; }
    .empty-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 40px; text-align: center; color: var(--text-muted); font-size: 14px; }
    .status-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .status-left { display: flex; align-items: center; gap: 12px; }
    .period-label { font-size: 14px; font-weight: 600; }
    .badge { padding: 3px 12px; border-radius: 12px; font-size: 11px; font-weight: 700; }
    .badge-draft { background: #e3f2fd; color: #1565c0; }
    .badge-submitted { background: #fff3e0; color: #e65100; }
    .badge-approved { background: #e8f5e9; color: #2e7d32; }
    .badge-rejected { background: #fce4ec; color: #c62828; }
    .actions { display: flex; gap: 8px; }
    .reject-banner { background: #fce4ec; color: #c62828; border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; }
    .card-title { font-size: 14px; font-weight: 600; }
    .table-wrap { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .data-table th, .data-table td { padding: 7px 9px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    .data-table th { background: var(--bg); font-weight: 600; text-align: left; }
    .data-table .r { text-align: right; }
    .data-table .bold { font-weight: 600; }
    .totals-row { background: var(--bg); }
    .src-badge { padding: 1px 7px; border-radius: 8px; font-size: 10px; font-weight: 700; }
    .src-upload { background: #e3f2fd; color: #1565c0; }
    .src-kiosk { background: #f3e5f5; color: #6a1b9a; }
    .src-mixed { background: #fff8e1; color: #f57f17; }
    .src-none { background: #f5f5f5; color: #757575; }
    .review-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; margin-top: 16px; }
    .review-panel.reject { border-color: #ef9a9a; }
    .review-panel p { font-size: 14px; margin-bottom: 10px; }
    .note-input { width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 13px; background: var(--bg); color: var(--text); resize: vertical; box-sizing: border-box; }
    .review-actions { display: flex; gap: 8px; margin-top: 10px; }
    .btn { padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-success { background: #2e7d32; color: #fff; }
    .btn-danger { background: #c62828; color: #fff; }
    .flex { display: flex; }
    .justify-center { justify-content: center; }
    .py-12 { padding: 48px 0; }
  `],
})
export class ClientContractorPayrollPageComponent implements OnInit, OnDestroy {
  months = MONTHS;
  years: number[] = [];
  selectedMonth = new Date().getMonth() + 1;
  selectedYear = new Date().getFullYear();

  sheet: PayrollSheet | null = null;
  rows: PayrollSheetRow[] = [];
  breakupRows: WageBreakupRow[] = [];

  loading = false;
  reviewing = false;
  approveMode = false;
  rejectMode = false;
  reviewNote = '';

  private destroy$ = new Subject<void>();

  constructor(
    private api: ContractorPayrollApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {
    const now = new Date();
    for (let y = now.getFullYear(); y >= 2022; y--) this.years.push(y);
  }

  ngOnInit(): void { this.reload(); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  get monthLabel(): string { return `${MONTHS[this.selectedMonth - 1]} ${this.selectedYear}`; }

  sum(field: keyof PayrollSheetRow): number {
    return this.rows.reduce((s, r) => s + (r[field] as number), 0);
  }

  reload(): void {
    this.loading = true;
    this.approveMode = false;
    this.rejectMode = false;
    this.reviewNote = '';
    this.cdr.markForCheck();

    this.api
      .getSheet(this.selectedMonth, this.selectedYear)
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }), takeUntil(this.destroy$))
      .subscribe({
        next: ({ sheet, rows }) => { this.sheet = sheet; this.rows = rows; this.cdr.markForCheck(); },
        error: () => this.toast.error('Failed to load wage sheet'),
      });

    this.api
      .getWageBreakup(this.selectedMonth, this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: (r) => { this.breakupRows = r; this.cdr.markForCheck(); } });
  }

  openApprove(): void { this.approveMode = true; this.rejectMode = false; this.reviewNote = ''; }
  openReject(): void { this.rejectMode = true; this.approveMode = false; this.reviewNote = ''; }

  confirmApprove(): void {
    if (!this.sheet) return;
    this.reviewing = true;
    this.cdr.markForCheck();
    this.api
      .approveSheet(this.sheet.id, this.reviewNote || undefined)
      .pipe(finalize(() => { this.reviewing = false; this.cdr.markForCheck(); }), takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.sheet = s;
          this.approveMode = false;
          this.toast.success('Wage sheet approved');
          this.cdr.markForCheck();
        },
        error: (err) => this.toast.error(err?.error?.message ?? 'Approval failed'),
      });
  }

  confirmReject(): void {
    if (!this.sheet || !this.reviewNote.trim()) return;
    this.reviewing = true;
    this.cdr.markForCheck();
    this.api
      .rejectSheet(this.sheet.id, this.reviewNote.trim())
      .pipe(finalize(() => { this.reviewing = false; this.cdr.markForCheck(); }), takeUntil(this.destroy$))
      .subscribe({
        next: (s) => {
          this.sheet = s;
          this.rejectMode = false;
          this.toast.success('Wage sheet rejected — branch desk notified');
          this.cdr.markForCheck();
        },
        error: (err) => this.toast.error(err?.error?.message ?? 'Rejection failed'),
      });
  }

  exportSheet(): void {
    if (this.sheet) this.api.exportSheet(this.sheet.id);
  }
}

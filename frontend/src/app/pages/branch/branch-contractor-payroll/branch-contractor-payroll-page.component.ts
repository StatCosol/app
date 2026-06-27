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
import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { LoadingSpinnerComponent } from '../../../shared/ui';
import { FileDropzoneComponent } from '../../contractor/shared/file-dropzone.component';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

@Component({
  selector: 'app-branch-contractor-payroll-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, FileDropzoneComponent],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Contractor Wage Sheet</h1>
          <p class="page-subtitle">Upload wage breakup, attendance, generate and submit for client approval</p>
        </div>
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

      <div *ngIf="loading" class="flex justify-center py-12"><app-loading-spinner /></div>

      <ng-container *ngIf="!loading">

        <!-- Wage Breakup upload -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Step 1 — Approved Wage Breakup</span>
            <button class="btn btn-sm btn-outline" (click)="downloadBreakupTemplate()" [disabled]="dlBreakup">
              {{ dlBreakup ? 'Downloading…' : '⬇ Template' }}
            </button>
          </div>
          <p class="hint">Download template, fill Basic / DA / HRA / Special / Other per employee, upload below.</p>
          <app-file-dropzone accept=".xlsx,.xls" label="Drop wage breakup Excel here"
            (filesChange)="onBreakupFile($event[0])" />
          <div *ngIf="breakupResult" class="upload-ok">✓ Breakup uploaded for {{ breakupResult.rowsProcessed }} employees</div>
          <div *ngIf="breakupRows.length" class="mini-table-wrap">
            <table class="mini-table">
              <thead><tr>
                <th>Employee</th><th class="r">Gross</th><th class="r">Basic</th>
                <th class="r">DA</th><th class="r">HRA</th><th class="r">Special</th><th class="r">Other</th>
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
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Attendance upload -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Step 2 — Attendance</span>
            <button class="btn btn-sm btn-outline" (click)="downloadAttTemplate()" [disabled]="dlAtt">
              {{ dlAtt ? 'Downloading…' : '⬇ Template' }}
            </button>
          </div>
          <p class="hint">Download template, mark P / A / H per day, upload below. Or attendance auto-syncs from kiosk.</p>
          <app-file-dropzone accept=".xlsx,.xls" label="Drop attendance Excel here"
            (filesChange)="onAttFile($event[0])" />
          <div *ngIf="attResult" class="upload-ok">✓ {{ attResult.rowsProcessed }} attendance records uploaded</div>
        </div>

        <!-- Wage sheet -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Step 3 — Wage Sheet — {{ monthLabel }}</span>
            <div class="flex gap-2">
              <button class="btn btn-sm btn-primary" (click)="generateSheet()" [disabled]="generating || sheet?.status === 'APPROVED'">
                {{ generating ? 'Generating…' : sheet ? '↻ Refresh' : '+ Generate' }}
              </button>
              <button *ngIf="sheet" class="btn btn-sm btn-outline" (click)="exportSheet()">⬇ Export</button>
            </div>
          </div>

          <ng-container *ngIf="sheet">
            <div class="status-row">
              <span class="badge badge-{{ sheet.status.toLowerCase() }}">{{ sheet.status }}</span>
              <span *ngIf="sheet.status === 'REJECTED' && sheet.reviewNote" class="reject-note">
                Rejected: {{ sheet.reviewNote }}
              </span>
            </div>

            <div class="table-wrap">
              <table class="wage-table">
                <thead><tr>
                  <th>Employee</th><th>Designation</th>
                  <th class="r">Gross</th><th class="r">Days</th><th class="r">Earned</th>
                  <th class="r">PF(Emp)</th><th class="r">PF(Emplr)</th>
                  <th class="r">ESI(Emp)</th><th class="r">ESI(Emplr)</th>
                  <th class="r">Net Pay</th><th class="r">CTC</th><th>Source</th>
                </tr></thead>
                <tbody>
                  <tr *ngFor="let r of rows">
                    <td>{{ r.employeeName }}</td>
                    <td>{{ r.designation || '—' }}</td>
                    <td class="r">{{ r.monthlyGross | number:'1.0-0' }}</td>
                    <td class="r">{{ r.workedDays }}</td>
                    <td class="r">{{ r.earnedGross | number:'1.2-2' }}</td>
                    <td class="r">{{ r.pfEmployee | number:'1.2-2' }}</td>
                    <td class="r">{{ r.pfEmployer | number:'1.2-2' }}</td>
                    <td class="r">{{ r.esiEmployee | number:'1.2-2' }}</td>
                    <td class="r">{{ r.esiEmployer | number:'1.2-2' }}</td>
                    <td class="r bold">{{ r.netPay | number:'1.2-2' }}</td>
                    <td class="r bold">{{ r.ctc | number:'1.2-2' }}</td>
                    <td><span class="src-{{ r.attendanceSource.toLowerCase() }}">{{ r.attendanceSource }}</span></td>
                  </tr>
                  <tr *ngIf="rows.length" class="totals">
                    <td colspan="4"><strong>TOTAL</strong></td>
                    <td class="r bold">{{ sum('earnedGross') | number:'1.2-2' }}</td>
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

            <!-- Submit button -->
            <div class="submit-row" *ngIf="sheet.status === 'DRAFT' || sheet.status === 'REJECTED'">
              <button class="btn btn-primary" (click)="submitSheet()" [disabled]="submitting">
                {{ submitting ? 'Submitting…' : 'Submit for Client Approval' }}
              </button>
            </div>
            <div class="submitted-note" *ngIf="sheet.status === 'SUBMITTED'">
              Sheet submitted — awaiting client review.
            </div>
            <div class="approved-note" *ngIf="sheet.status === 'APPROVED'">
              ✓ Approved by client.
            </div>
          </ng-container>

          <div *ngIf="!sheet" class="empty">
            No wage sheet yet. Complete steps 1 & 2, then click Generate.
          </div>
        </div>

      </ng-container>
    </div>
  `,
  styles: [`
    .page-container { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .page-header { margin-bottom: 20px; }
    .page-title { font-size: 22px; font-weight: 700; color: var(--text); }
    .page-subtitle { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
    .filter-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .filter-select { border: 1px solid var(--border); border-radius: 6px; padding: 7px 12px; background: var(--bg); color: var(--text); font-size: 13px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .card-title { font-size: 14px; font-weight: 600; }
    .hint { font-size: 12px; color: var(--text-muted); margin-bottom: 10px; }
    .upload-ok { margin-top: 8px; padding: 7px 10px; background: #e8f5e9; color: #2e7d32; border-radius: 6px; font-size: 12px; }
    .mini-table-wrap { overflow-x: auto; margin-top: 12px; }
    .mini-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .mini-table th, .mini-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    .mini-table th { background: var(--bg); font-weight: 600; }
    .mini-table .r { text-align: right; }
    .status-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; }
    .badge-draft { background: #e3f2fd; color: #1565c0; }
    .badge-submitted { background: #fff3e0; color: #e65100; }
    .badge-approved { background: #e8f5e9; color: #2e7d32; }
    .badge-rejected { background: #fce4ec; color: #c62828; }
    .reject-note { font-size: 12px; color: #c62828; }
    .table-wrap { overflow-x: auto; }
    .wage-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .wage-table th, .wage-table td { padding: 7px 9px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    .wage-table th { background: var(--bg); font-weight: 600; text-align: left; }
    .wage-table .r { text-align: right; }
    .wage-table .bold { font-weight: 600; }
    .totals { background: var(--bg); }
    [class^="src-"] { padding: 1px 7px; border-radius: 8px; font-size: 10px; font-weight: 700; }
    .src-upload { background: #e3f2fd; color: #1565c0; }
    .src-kiosk { background: #f3e5f5; color: #6a1b9a; }
    .src-mixed { background: #fff8e1; color: #f57f17; }
    .src-none { background: #f5f5f5; color: #757575; }
    .submit-row { margin-top: 16px; display: flex; justify-content: flex-end; }
    .submitted-note { margin-top: 12px; font-size: 13px; color: #e65100; }
    .approved-note { margin-top: 12px; font-size: 13px; color: #2e7d32; font-weight: 600; }
    .empty { text-align: center; padding: 32px; color: var(--text-muted); font-size: 13px; }
    .btn { padding: 7px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 500; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: var(--primary, #1976d2); color: #fff; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-sm { padding: 5px 10px; font-size: 12px; }
    .flex { display: flex; }
    .gap-2 { gap: 8px; }
    .flex.justify-center { justify-content: center; }
    .py-12 { padding: 48px 0; }
  `],
})
export class BranchContractorPayrollPageComponent implements OnInit, OnDestroy {
  months = MONTHS;
  years: number[] = [];
  selectedMonth = new Date().getMonth() + 1;
  selectedYear = new Date().getFullYear();

  sheet: PayrollSheet | null = null;
  rows: PayrollSheetRow[] = [];
  breakupRows: WageBreakupRow[] = [];

  loading = false;
  generating = false;
  submitting = false;
  dlBreakup = false;
  dlAtt = false;
  breakupResult: { rowsProcessed: number } | null = null;
  attResult: { rowsProcessed: number } | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private api: ContractorPayrollApiService,
    private auth: AuthService,
    private toast: ToastService,
    private confirm: ConfirmDialogService,
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
    this.breakupResult = null;
    this.attResult = null;
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

  downloadBreakupTemplate(): void {
    this.dlBreakup = true;
    setTimeout(() => { this.dlBreakup = false; this.cdr.markForCheck(); }, 2000);
    this.api.downloadBreakupTemplate(this.selectedMonth, this.selectedYear);
  }

  downloadAttTemplate(): void {
    this.dlAtt = true;
    setTimeout(() => { this.dlAtt = false; this.cdr.markForCheck(); }, 2000);
    this.api.downloadTemplate(this.selectedMonth, this.selectedYear);
  }

  onBreakupFile(file: File): void {
    if (!file) return;
    this.breakupResult = null;
    this.api
      .uploadWageBreakup(file, this.selectedMonth, this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.breakupResult = res;
          this.toast.success(`Breakup uploaded for ${res.rowsProcessed} employees`);
          this.api.getWageBreakup(this.selectedMonth, this.selectedYear)
            .pipe(takeUntil(this.destroy$))
            .subscribe({ next: (r) => { this.breakupRows = r; this.cdr.markForCheck(); } });
        },
        error: (err) => this.toast.error(err?.error?.message ?? 'Upload failed'),
      });
  }

  onAttFile(file: File): void {
    if (!file) return;
    this.attResult = null;
    this.api
      .uploadAttendance(file, this.selectedMonth, this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.attResult = res;
          this.toast.success(`${res.rowsProcessed} attendance records uploaded`);
          this.cdr.markForCheck();
        },
        error: (err) => this.toast.error(err?.error?.message ?? 'Upload failed'),
      });
  }

  generateSheet(): void {
    this.generating = true;
    this.cdr.markForCheck();
    this.api
      .generateSheet(this.selectedMonth, this.selectedYear)
      .pipe(finalize(() => { this.generating = false; this.cdr.markForCheck(); }), takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.toast.success('Wage sheet generated'); this.reload(); },
        error: (err) => this.toast.error(err?.error?.message ?? 'Failed to generate sheet'),
      });
  }

  async submitSheet(): Promise<void> {
    if (!this.sheet) return;
    const confirmed = await this.confirm.confirm(
      'Submit Wage Sheet',
      `Submit the ${this.monthLabel} wage sheet for client approval? This cannot be undone.`,
      { confirmText: 'Submit' },
    );
    if (!confirmed) return;

    this.submitting = true;
    this.cdr.markForCheck();
    this.api
      .submitSheet(this.sheet.id)
      .pipe(finalize(() => { this.submitting = false; this.cdr.markForCheck(); }), takeUntil(this.destroy$))
      .subscribe({
        next: (s) => { this.sheet = s; this.toast.success('Wage sheet submitted for approval'); this.cdr.markForCheck(); },
        error: (err) => this.toast.error(err?.error?.message ?? 'Submit failed'),
      });
  }

  exportSheet(): void {
    if (this.sheet) this.api.exportSheet(this.sheet.id);
  }
}

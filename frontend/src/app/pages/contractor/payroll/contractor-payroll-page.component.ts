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
import {
  ContractorBranchItem,
  ContractorProfileApiService,
} from '../../../core/contractor-profile-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { LoadingSpinnerComponent, PageHeaderComponent } from '../../../shared/ui';
import { FileDropzoneComponent } from '../shared/file-dropzone.component';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

@Component({
  selector: 'app-contractor-payroll-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, PageHeaderComponent, FileDropzoneComponent],
  template: `
    <ui-page-header title="Payroll & Wages" subtitle="Upload attendance and generate wage sheets" />

    <!-- Filters -->
    <div class="filter-bar">
      <select [(ngModel)]="selectedMonth" (ngModelChange)="onFilterChange()" class="select">
        <option *ngFor="let m of months; let i = index" [value]="i + 1">{{ m }}</option>
      </select>
      <select [(ngModel)]="selectedYear" (ngModelChange)="onFilterChange()" class="select">
        <option *ngFor="let y of years" [value]="y">{{ y }}</option>
      </select>
      <select *ngIf="branches.length > 0" [(ngModel)]="selectedBranchId" (ngModelChange)="onFilterChange()" class="select">
        <option value="">All Branches</option>
        <option *ngFor="let b of branches" [value]="b.id">{{ b.name }}</option>
      </select>
    </div>

    <div *ngIf="loading" class="center-spinner"><ui-loading-spinner /></div>

    <ng-container *ngIf="!loading">
      <!-- Attendance section -->
      <div class="section-card">
        <div class="section-header">
          <h3>Attendance</h3>
          <div class="actions">
            <button class="btn btn-outline" (click)="downloadTemplate()" [disabled]="downloading">
              {{ downloading ? 'Downloading…' : '⬇ Download Template' }}
            </button>
          </div>
        </div>
        <p class="hint">Download the Excel template, fill in P / A / H for each day, then upload below.</p>
        <app-file-dropzone accept=".xlsx,.xls" label="Drop attendance Excel here or click to browse"
          (filesChange)="onAttendanceFile($event[0])" />
        <div *ngIf="uploadResult" class="upload-result success">
          ✓ Uploaded {{ uploadResult.rowsProcessed }} attendance records
        </div>
      </div>

      <!-- Wage Breakup section (principal employer uploads approved component split) -->
      <div class="section-card">
        <div class="section-header">
          <h3>Approved Wage Breakup</h3>
          <div class="actions">
            <button class="btn btn-outline" (click)="downloadBreakupTemplate()" [disabled]="downloadingBreakup">
              {{ downloadingBreakup ? 'Downloading…' : '⬇ Download Template' }}
            </button>
          </div>
        </div>
        <p class="hint">
          Principal employer downloads the template, fills Basic / DA / HRA / Special / Other per employee,
          then uploads. PF is calculated on actual Basic + DA (capped at ₹15,000).
        </p>
        <app-file-dropzone accept=".xlsx,.xls" label="Drop wage breakup Excel here or click to browse"
          (filesChange)="onBreakupFile($event[0])" />
        <div *ngIf="breakupUploadResult" class="upload-result success">
          ✓ Uploaded breakup for {{ breakupUploadResult.rowsProcessed }} employees
        </div>

        <div *ngIf="breakupRows.length > 0" class="table-wrap" style="margin-top:14px">
          <table class="wage-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th class="num">Monthly Gross</th>
                <th class="num">Basic</th>
                <th class="num">DA</th>
                <th class="num">HRA</th>
                <th class="num">Special Allow.</th>
                <th class="num">Other Allow.</th>
                <th class="num">Basic + DA</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of breakupRows">
                <td>{{ r.employeeName }}</td>
                <td class="num">{{ r.monthlyGross | number:'1.2-2' }}</td>
                <td class="num">{{ r.basic | number:'1.2-2' }}</td>
                <td class="num">{{ r.da | number:'1.2-2' }}</td>
                <td class="num">{{ r.hra | number:'1.2-2' }}</td>
                <td class="num">{{ r.specialAllowance | number:'1.2-2' }}</td>
                <td class="num">{{ r.otherAllowances | number:'1.2-2' }}</td>
                <td class="num bold">{{ (r.basic + r.da) | number:'1.2-2' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div *ngIf="breakupRows.length === 0" class="empty-hint" style="padding:16px">
          No approved wage breakup uploaded for this period. Upload above to enable accurate PF calculation.
        </div>
      </div>

      <!-- Wage sheet section -->
      <div class="section-card">
        <div class="section-header">
          <h3>Wage Sheet — {{ monthLabel }}</h3>
          <div class="actions">
            <button class="btn btn-primary" (click)="generateSheet()" [disabled]="generating">
              {{ generating ? 'Generating…' : sheet ? '↻ Refresh Sheet' : '+ Generate Sheet' }}
            </button>
            <button *ngIf="sheet" class="btn btn-outline" (click)="exportSheet()">⬇ Export Excel</button>
          </div>
        </div>

        <div *ngIf="!sheet" class="empty-hint">No wage sheet yet for this period. Click "Generate Sheet" after uploading attendance.</div>

        <div *ngIf="sheet">
          <div class="status-badge" [ngClass]="'status-' + sheet.status.toLowerCase()">
            {{ sheet.status }}
          </div>

          <div class="table-wrap">
            <table class="wage-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Designation</th>
                  <th class="num">Monthly Gross</th>
                  <th class="num">Worked Days</th>
                  <th class="num">Earned Gross</th>
                  <th class="num">PF (Emp)</th>
                  <th class="num">PF (Emplr)</th>
                  <th class="num">ESI (Emp)</th>
                  <th class="num">ESI (Emplr)</th>
                  <th class="num">Net Pay</th>
                  <th class="num">CTC</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let r of rows">
                  <td>{{ r.employeeName }}</td>
                  <td>{{ r.designation || '—' }}</td>
                  <td class="num">{{ r.monthlyGross | number:'1.2-2' }}</td>
                  <td class="num">{{ r.workedDays }}</td>
                  <td class="num">{{ r.earnedGross | number:'1.2-2' }}</td>
                  <td class="num">{{ r.pfEmployee | number:'1.2-2' }}</td>
                  <td class="num">{{ r.pfEmployer | number:'1.2-2' }}</td>
                  <td class="num">{{ r.esiEmployee | number:'1.2-2' }}</td>
                  <td class="num">{{ r.esiEmployer | number:'1.2-2' }}</td>
                  <td class="num bold">{{ r.netPay | number:'1.2-2' }}</td>
                  <td class="num bold">{{ r.ctc | number:'1.2-2' }}</td>
                  <td><span class="source-badge source-{{ r.attendanceSource.toLowerCase() }}">{{ r.attendanceSource }}</span></td>
                </tr>
                <tr class="totals-row" *ngIf="rows.length > 0">
                  <td colspan="4"><strong>TOTALS</strong></td>
                  <td class="num bold">{{ totalEarnedGross | number:'1.2-2' }}</td>
                  <td class="num bold">{{ totalPfEmp | number:'1.2-2' }}</td>
                  <td class="num bold">{{ totalPfEmplr | number:'1.2-2' }}</td>
                  <td class="num bold">{{ totalEsiEmp | number:'1.2-2' }}</td>
                  <td class="num bold">{{ totalEsiEmplr | number:'1.2-2' }}</td>
                  <td class="num bold">{{ totalNetPay | number:'1.2-2' }}</td>
                  <td class="num bold">{{ totalCtc | number:'1.2-2' }}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div *ngIf="sheet.status === 'REJECTED' && sheet.reviewNote" class="reject-note">
            <strong>Rejection Note:</strong> {{ sheet.reviewNote }}
          </div>
        </div>
      </div>
    </ng-container>
  `,
  styles: [`
    .filter-bar { display: flex; gap: 12px; padding: 16px 0; flex-wrap: wrap; }
    .select { border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; background: var(--bg); color: var(--text); }
    .center-spinner { display: flex; justify-content: center; padding: 48px; }
    .section-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 20px; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .section-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
    .actions { display: flex; gap: 8px; }
    .hint { color: var(--text-muted); font-size: 13px; margin-bottom: 12px; }
    .upload-result { margin-top: 10px; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
    .upload-result.success { background: #e8f5e9; color: #2e7d32; }
    .empty-hint { color: var(--text-muted); font-size: 14px; text-align: center; padding: 32px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
    .status-draft { background: #e3f2fd; color: #1565c0; }
    .status-submitted { background: #fff3e0; color: #e65100; }
    .status-approved { background: #e8f5e9; color: #2e7d32; }
    .status-rejected { background: #fce4ec; color: #c62828; }
    .table-wrap { overflow-x: auto; }
    .wage-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .wage-table th, .wage-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    .wage-table th { background: var(--bg); font-weight: 600; text-align: left; }
    .wage-table .num { text-align: right; }
    .wage-table .bold { font-weight: 600; }
    .totals-row { background: var(--bg); }
    .source-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .source-upload { background: #e3f2fd; color: #1565c0; }
    .source-kiosk { background: #f3e5f5; color: #6a1b9a; }
    .source-mixed { background: #fff8e1; color: #f57f17; }
    .source-none { background: #f5f5f5; color: #757575; }
    .reject-note { margin-top: 12px; padding: 10px 14px; background: #fce4ec; border-radius: 6px; font-size: 13px; }
    .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: var(--primary, #1976d2); color: #fff; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
  `],
})
export class ContractorPayrollPageComponent implements OnInit, OnDestroy {
  months = MONTHS;
  years: number[] = [];
  selectedMonth = new Date().getMonth() + 1;
  selectedYear = new Date().getFullYear();
  selectedBranchId = '';

  branches: ContractorBranchItem[] = [];
  sheet: PayrollSheet | null = null;
  rows: PayrollSheetRow[] = [];
  breakupRows: WageBreakupRow[] = [];

  loading = false;
  generating = false;
  downloading = false;
  downloadingBreakup = false;
  uploadResult: { rowsProcessed: number } | null = null;
  breakupUploadResult: { rowsProcessed: number } | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private api: ContractorPayrollApiService,
    private profileApi: ContractorProfileApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {
    const now = new Date();
    for (let y = now.getFullYear(); y >= 2022; y--) this.years.push(y);
  }

  ngOnInit(): void {
    this.profileApi
      .getContractorBranches()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.branches = res.branches ?? [];
          this.cdr.markForCheck();
        },
      });
    this.loadSheet();
    this.loadBreakup();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get monthLabel(): string {
    return `${MONTHS[this.selectedMonth - 1]} ${this.selectedYear}`;
  }

  get totalEarnedGross() { return this.rows.reduce((s, r) => s + r.earnedGross, 0); }
  get totalPfEmp() { return this.rows.reduce((s, r) => s + r.pfEmployee, 0); }
  get totalPfEmplr() { return this.rows.reduce((s, r) => s + r.pfEmployer, 0); }
  get totalEsiEmp() { return this.rows.reduce((s, r) => s + r.esiEmployee, 0); }
  get totalEsiEmplr() { return this.rows.reduce((s, r) => s + r.esiEmployer, 0); }
  get totalNetPay() { return this.rows.reduce((s, r) => s + r.netPay, 0); }
  get totalCtc() { return this.rows.reduce((s, r) => s + r.ctc, 0); }

  onFilterChange(): void {
    this.uploadResult = null;
    this.breakupUploadResult = null;
    this.loadSheet();
    this.loadBreakup();
  }

  loadSheet(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.api
      .getSheet(this.selectedMonth, this.selectedYear, this.selectedBranchId || undefined)
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }), takeUntil(this.destroy$))
      .subscribe({
        next: ({ sheet, rows }) => {
          this.sheet = sheet;
          this.rows = rows;
          this.cdr.markForCheck();
        },
        error: () => this.toast.error('Failed to load wage sheet'),
      });
  }

  downloadTemplate(): void {
    this.downloading = true;
    setTimeout(() => { this.downloading = false; this.cdr.markForCheck(); }, 2000);
    this.api.downloadTemplate(this.selectedMonth, this.selectedYear, this.selectedBranchId || undefined);
  }

  onAttendanceFile(file: File): void {
    this.uploadResult = null;
    this.api
      .uploadAttendance(file, this.selectedMonth, this.selectedYear, this.selectedBranchId || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.uploadResult = res;
          this.toast.success(`Uploaded ${res.rowsProcessed} attendance records`);
          this.cdr.markForCheck();
        },
        error: (err) => this.toast.error(err?.error?.message ?? 'Upload failed'),
      });
  }

  loadBreakup(): void {
    this.api
      .getWageBreakup(this.selectedMonth, this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => { this.breakupRows = rows; this.cdr.markForCheck(); },
      });
  }

  downloadBreakupTemplate(): void {
    this.downloadingBreakup = true;
    setTimeout(() => { this.downloadingBreakup = false; this.cdr.markForCheck(); }, 2000);
    this.api.downloadBreakupTemplate(this.selectedMonth, this.selectedYear, this.selectedBranchId || undefined);
  }

  onBreakupFile(file: File): void {
    if (!file) return;
    this.breakupUploadResult = null;
    this.api
      .uploadWageBreakup(file, this.selectedMonth, this.selectedYear, this.selectedBranchId || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.breakupUploadResult = res;
          this.toast.success(`Wage breakup uploaded for ${res.rowsProcessed} employees`);
          this.loadBreakup();
        },
        error: (err) => this.toast.error(err?.error?.message ?? 'Breakup upload failed'),
      });
  }

  generateSheet(): void {
    this.generating = true;
    this.cdr.markForCheck();
    this.api
      .generateSheet(this.selectedMonth, this.selectedYear, this.selectedBranchId || undefined)
      .pipe(finalize(() => { this.generating = false; this.cdr.markForCheck(); }), takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Wage sheet generated');
          this.loadSheet();
        },
        error: (err) => this.toast.error(err?.error?.message ?? 'Failed to generate sheet'),
      });
  }

  exportSheet(): void {
    if (this.sheet) this.api.exportSheet(this.sheet.id);
  }
}

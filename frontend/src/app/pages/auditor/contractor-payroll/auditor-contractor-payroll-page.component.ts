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
  selector: 'app-auditor-contractor-payroll-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1 class="page-title">Contractor Payroll Verification</h1>
        <p class="page-subtitle">Read-only view of approved contractor wage sheets for audit verification</p>
      </div>

      <div class="filter-bar">
        <select [(ngModel)]="selectedMonth" (ngModelChange)="reload()" class="filter-select">
          <option *ngFor="let m of months; let i = index" [value]="i + 1">{{ m }}</option>
        </select>
        <select [(ngModel)]="selectedYear" (ngModelChange)="reload()" class="filter-select">
          <option *ngFor="let y of years" [value]="y">{{ y }}</option>
        </select>
        <button *ngIf="sheet" class="btn btn-outline" (click)="exportSheet()">⬇ Export Excel</button>
      </div>

      <div *ngIf="loading" class="flex-center py-12"><ui-loading-spinner /></div>

      <ng-container *ngIf="!loading">

        <div *ngIf="!sheet" class="empty-state">
          No wage sheet found for {{ monthLabel }}.
        </div>

        <ng-container *ngIf="sheet">

          <!-- Sheet status summary -->
          <div class="summary-card">
            <div class="summary-item">
              <span class="label">Period</span>
              <span class="value">{{ monthLabel }}</span>
            </div>
            <div class="summary-item">
              <span class="label">Status</span>
              <span class="badge badge-{{ sheet.status.toLowerCase() }}">{{ sheet.status }}</span>
            </div>
            <div class="summary-item">
              <span class="label">Total Employees</span>
              <span class="value">{{ rows.length }}</span>
            </div>
            <div class="summary-item">
              <span class="label">Total Earned Gross</span>
              <span class="value bold">₹{{ sum('earnedGross') | number:'1.2-2' }}</span>
            </div>
            <div class="summary-item">
              <span class="label">Total Net Pay</span>
              <span class="value bold">₹{{ sum('netPay') | number:'1.2-2' }}</span>
            </div>
            <div class="summary-item">
              <span class="label">Total CTC</span>
              <span class="value bold">₹{{ sum('ctc') | number:'1.2-2' }}</span>
            </div>
          </div>

          <!-- PF & ESI summary -->
          <div class="summary-card" style="margin-top: 12px;">
            <div class="summary-item">
              <span class="label">PF (Employee Total)</span>
              <span class="value">₹{{ sum('pfEmployee') | number:'1.2-2' }}</span>
            </div>
            <div class="summary-item">
              <span class="label">PF (Employer Total)</span>
              <span class="value">₹{{ sum('pfEmployer') | number:'1.2-2' }}</span>
            </div>
            <div class="summary-item">
              <span class="label">ESI (Employee Total)</span>
              <span class="value">₹{{ sum('esiEmployee') | number:'1.2-2' }}</span>
            </div>
            <div class="summary-item">
              <span class="label">ESI (Employer Total)</span>
              <span class="value">₹{{ sum('esiEmployer') | number:'1.2-2' }}</span>
            </div>
            <div class="summary-item">
              <span class="label">Total Statutory Outgo</span>
              <span class="value bold">₹{{ (sum('pfEmployee') + sum('pfEmployer') + sum('esiEmployee') + sum('esiEmployer')) | number:'1.2-2' }}</span>
            </div>
          </div>

          <!-- Wage Breakup (approved by principal employer) -->
          <div *ngIf="breakupRows.length" class="section-card">
            <h3 class="section-title">Approved Wage Breakup (Principal Employer)</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr>
                  <th>Employee</th><th class="r">Monthly Gross</th>
                  <th class="r">Basic</th><th class="r">DA</th><th class="r">HRA</th>
                  <th class="r">Special</th><th class="r">Other</th>
                  <th class="r highlight">Basic+DA (PF Basis)</th>
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
                    <td class="r bold highlight">{{ (r.basic + r.da) | number:'1.2-2' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Full wage calculation detail -->
          <div class="section-card">
            <h3 class="section-title">Wage Calculation Detail</h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr>
                  <th>Employee</th><th>Designation</th>
                  <th class="r">Monthly Gross</th><th class="r">Days</th>
                  <th class="r">Daily Rate</th><th class="r">Earned Gross</th>
                  <th class="r">PF Basis</th><th class="r">PF (Emp)</th><th class="r">PF (Emplr)</th>
                  <th class="r">ESI (Emp)</th><th class="r">ESI (Emplr)</th>
                  <th class="r">Net Pay</th><th class="r">CTC</th><th>Source</th>
                </tr></thead>
                <tbody>
                  <tr *ngFor="let r of rows">
                    <td>{{ r.employeeName }}</td>
                    <td>{{ r.designation || '—' }}</td>
                    <td class="r">{{ r.monthlyGross | number:'1.0-0' }}</td>
                    <td class="r">{{ r.workedDays }}</td>
                    <td class="r">{{ r.dailyRate | number:'1.2-2' }}</td>
                    <td class="r">{{ r.earnedGross | number:'1.2-2' }}</td>
                    <td class="r highlight">{{ r.pfBasis | number:'1.2-2' }}</td>
                    <td class="r">{{ r.pfEmployee | number:'1.2-2' }}</td>
                    <td class="r">{{ r.pfEmployer | number:'1.2-2' }}</td>
                    <td class="r">{{ r.esiEmployee | number:'1.2-2' }}</td>
                    <td class="r">{{ r.esiEmployer | number:'1.2-2' }}</td>
                    <td class="r bold">{{ r.netPay | number:'1.2-2' }}</td>
                    <td class="r bold">{{ r.ctc | number:'1.2-2' }}</td>
                    <td>
                      <span class="src-badge src-{{ r.attendanceSource.toLowerCase() }}">{{ r.attendanceSource }}</span>
                    </td>
                  </tr>
                  <tr class="totals-row">
                    <td colspan="5"><strong>TOTAL</strong></td>
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

        </ng-container>
      </ng-container>
    </div>
  `,
  styles: [`
    .page-container { padding: 24px; max-width: 1300px; margin: 0 auto; }
    .page-header { margin-bottom: 20px; }
    .page-title { font-size: 22px; font-weight: 700; }
    .page-subtitle { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
    .filter-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
    .filter-select { border: 1px solid var(--border); border-radius: 6px; padding: 7px 12px; background: var(--bg); color: var(--text); font-size: 13px; }
    .flex-center { display: flex; justify-content: center; }
    .py-12 { padding: 48px 0; }
    .empty-state { text-align: center; padding: 60px; color: var(--text-muted); font-size: 14px; }
    .summary-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; display: flex; flex-wrap: wrap; gap: 24px; }
    .summary-item { display: flex; flex-direction: column; gap: 4px; }
    .label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .value { font-size: 15px; font-weight: 500; }
    .value.bold { font-weight: 700; }
    .badge { padding: 3px 12px; border-radius: 12px; font-size: 11px; font-weight: 700; }
    .badge-draft { background: #e3f2fd; color: #1565c0; }
    .badge-submitted { background: #fff3e0; color: #e65100; }
    .badge-approved { background: #e8f5e9; color: #2e7d32; }
    .badge-rejected { background: #fce4ec; color: #c62828; }
    .section-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; margin-top: 16px; }
    .section-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
    .table-wrap { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .data-table th, .data-table td { padding: 7px 9px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    .data-table th { background: var(--bg); font-weight: 600; text-align: left; }
    .data-table .r { text-align: right; }
    .data-table .bold { font-weight: 600; }
    .data-table .highlight { background: #fffde7; }
    .totals-row { background: var(--bg); }
    .src-badge { padding: 1px 7px; border-radius: 8px; font-size: 10px; font-weight: 700; }
    .src-upload { background: #e3f2fd; color: #1565c0; }
    .src-kiosk { background: #f3e5f5; color: #6a1b9a; }
    .src-mixed { background: #fff8e1; color: #f57f17; }
    .src-none { background: #f5f5f5; color: #757575; }
    .btn { padding: 7px 14px; border-radius: 6px; border: 1px solid var(--border); cursor: pointer; font-size: 13px; background: transparent; color: var(--text); }
    .btn-outline { background: transparent; }
  `],
})
export class AuditorContractorPayrollPageComponent implements OnInit, OnDestroy {
  months = MONTHS;
  years: number[] = [];
  selectedMonth = new Date().getMonth() + 1;
  selectedYear = new Date().getFullYear();

  sheet: PayrollSheet | null = null;
  rows: PayrollSheetRow[] = [];
  breakupRows: WageBreakupRow[] = [];
  loading = false;

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

  exportSheet(): void {
    if (this.sheet) this.api.exportSheet(this.sheet.id);
  }
}

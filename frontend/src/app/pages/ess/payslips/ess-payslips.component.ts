import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { EssApiService, Payslip } from '../ess-api.service';
import { ToastService } from '../../../shared/toast/toast.service';

@Component({
  selector: 'app-ess-payslips',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-5xl mx-auto space-y-6">
      <h1 class="text-2xl font-bold text-gray-900">My Payslips</h1>

      <!-- Filter bar -->
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label class="block text-xs text-gray-500 mb-1">Year</label>
          <select [(ngModel)]="filterYear" (ngModelChange)="applyFilter()" class="input-sm">
            <option value="">All Years</option>
            <option *ngFor="let y of yearOptions" [value]="y">{{ y }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Month</label>
          <select [(ngModel)]="filterMonth" (ngModelChange)="applyFilter()" class="input-sm">
            <option value="">All Months</option>
            <option *ngFor="let m of monthFilterOptions" [value]="m.value">{{ m.label }}</option>
          </select>
        </div>
        <span class="text-sm text-gray-500 ml-auto">{{ filteredPayslips.length }} payslip{{ filteredPayslips.length !== 1 ? 's' : '' }}</span>
      </div>

      <div *ngIf="loading" class="text-gray-500 text-sm">Loading...</div>

      <div *ngIf="!loading && !filteredPayslips.length"
           class="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
        No payslips found for the selected filter.
      </div>

      <div *ngIf="!loading && filteredPayslips.length" class="section-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>File</th>
              <th>Size</th>
              <th class="text-right">Generated</th>
              <th class="text-right">Download</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of filteredPayslips">
              <td class="font-medium">{{ monthName(p.periodMonth) }} {{ p.periodYear }}</td>
              <td>
                <span *ngIf="p.fileName" class="text-gray-700">{{ p.fileName }}</span>
                <span *ngIf="!p.fileName" class="text-gray-400">-</span>
              </td>
              <td class="text-sm text-gray-500">{{ formatSize(p.fileSize) }}</td>
              <td class="text-right text-sm text-gray-500">{{ p.generatedAt | date:'mediumDate' }}</td>
              <td class="text-right">
                <button (click)="download(p)" [disabled]="downloading.has(p.id)" class="download-btn">
                  <svg *ngIf="!downloading.has(p.id)" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  <span>{{ downloading.has(p.id) ? 'Downloading...' : 'PDF' }}</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .section-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px;
      overflow-x: auto;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .data-table th {
      text-align: left;
      padding: 8px 12px;
      font-weight: 600;
      color: #6b7280;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 2px solid #e5e7eb;
    }
    .data-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #f3f4f6;
      color: #111827;
    }
    .download-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #0f2547;
      color: white;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .download-btn:hover { opacity: 0.9; }
    .download-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .download-btn svg { width: 16px; height: 16px; }
    .input-sm {
      border: 1px solid #d1d5db; border-radius: 0.5rem;
      padding: 0.375rem 0.75rem; font-size: 0.875rem;
      background: white; min-width: 120px;
    }
  `],
})
export class EssPayslipsComponent implements OnInit, OnDestroy {
  payslips: Payslip[] = [];
  filteredPayslips: Payslip[] = [];
  loading = false;
  downloading = new Set<string>();
  filterYear = '';
  filterMonth = '';
  private readonly destroy$ = new Subject<void>();

  private months = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  readonly yearOptions: number[] = (() => {
    const now = new Date().getFullYear();
    return [now, now - 1, now - 2, now - 3];
  })();

  readonly monthFilterOptions = [
    { value: '1', label: 'January' }, { value: '2', label: 'February' },
    { value: '3', label: 'March' }, { value: '4', label: 'April' },
    { value: '5', label: 'May' }, { value: '6', label: 'June' },
    { value: '7', label: 'July' }, { value: '8', label: 'August' },
    { value: '9', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' }, { value: '12', label: 'December' },
  ];

  constructor(private api: EssApiService, private cdr: ChangeDetectorRef, private toast: ToastService) {}

  ngOnInit(): void {
    this.loading = true;
    this.api.listPayslips()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: (list) => { this.loading = false; this.payslips = list; this.applyFilter(); },
        error: () => { this.loading = false; this.payslips = []; this.filteredPayslips = []; },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  applyFilter(): void {
    let result = [...this.payslips];
    if (this.filterYear) {
      result = result.filter(p => String(p.periodYear) === this.filterYear);
    }
    if (this.filterMonth) {
      result = result.filter(p => String(p.periodMonth) === this.filterMonth);
    }
    this.filteredPayslips = result;
  }

  monthName(m: number): string {
    return this.months[m] || String(m);
  }

  formatSize(bytes: string): string {
    const b = parseInt(bytes, 10);
    if (isNaN(b) || b === 0) return '-';
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  download(p: Payslip): void {
    if (this.downloading.has(p.id)) return; // prevent double-click
    this.downloading.add(p.id);
    this.cdr.detectChanges();
    this.api.downloadPayslip(p.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.downloading.delete(p.id); this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: (blob) => {
          this.downloading.delete(p.id);
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = p.fileName || `payslip_${p.periodYear}_${p.periodMonth}.pdf`;
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: () => {
          this.downloading.delete(p.id);
          this.toast.error('Failed to download payslip. The file may not be available.');
        },
      });
  }
}

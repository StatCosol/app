import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs/operators';
import { EssApiService, Payslip } from '../ess-api.service';

@Component({
  selector: 'app-ess-payslips',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-5xl mx-auto space-y-6">
      <h1 class="text-2xl font-bold text-gray-900">My Payslips</h1>

      <div *ngIf="loading" class="text-gray-500 text-sm">Loading...</div>

      <div *ngIf="!loading && !payslips.length"
           class="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
        No payslips found.
      </div>

      <div *ngIf="!loading && payslips.length" class="section-card">
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
            <tr *ngFor="let p of payslips">
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
  `],
})
export class EssPayslipsComponent implements OnInit {
  payslips: Payslip[] = [];
  loading = true;
  downloading = new Set<string>();

  private months = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  constructor(private api: EssApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.api.listPayslips()
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (list) => { this.payslips = list; },
        error: () => { this.payslips = []; },
      });
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
    this.downloading.add(p.id);
    this.cdr.detectChanges();
    this.api.downloadPayslip(p.id)
      .pipe(finalize(() => { this.downloading.delete(p.id); this.cdr.detectChanges(); }))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = p.fileName || `payslip_${p.periodYear}_${p.periodMonth}.pdf`;
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: () => {
          alert('Failed to download payslip. The file may not be available.');
        },
      });
  }
}

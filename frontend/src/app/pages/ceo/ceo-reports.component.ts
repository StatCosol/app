import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  CeoApiService,
  CeoReportPack,
  CeoReportsSummary,
  CeoReportPreview,
} from '../../core/api/ceo.api';
import {
  PageHeaderComponent,
  ActionButtonComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  DataTableComponent,
  TableColumn,
} from '../../shared/ui';
import { ToastService } from '../../shared/toast/toast.service';

interface ReportHistoryRow {
  time: string;
  reportType: string;
  period: string;
  format: 'CSV' | 'PDF';
  status: 'SUCCESS' | 'FAILED';
}

@Component({
  selector: 'app-ceo-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    DataTableComponent,
  ],
  template: `
    <div class="space-y-6">
      <ui-page-header
        title="Executive Reports"
        subtitle="Board-ready report packs with preview and export controls"
      ></ui-page-header>

      <div class="bg-white rounded-2xl border border-gray-100 shadow-card p-4">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label class="block text-xs text-gray-600 mb-1" for="cr-period">Period</label>
            <input autocomplete="off" id="cr-period" name="period"
              type="month"
              [(ngModel)]="period"
              class="h-10 rounded-lg border border-gray-200 px-3 text-sm"
            />
          </div>
          <ui-button variant="secondary" size="sm" [loading]="loadingSummary" (clicked)="loadSummary()">
            Refresh Packs
          </ui-button>
          <div class="text-xs text-gray-500 ml-auto" *ngIf="summary">
            Generated: {{ summary.generatedAt | date:'medium' }}
          </div>
        </div>
      </div>

      <div *ngIf="loadingSummary" class="py-16">
        <ui-loading-spinner text="Loading report packs..."></ui-loading-spinner>
      </div>

      <div *ngIf="!loadingSummary && error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {{ error }}
      </div>

      <ng-container *ngIf="!loadingSummary && !error">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <button
            *ngFor="let pack of packs"
            type="button"
            class="text-left bg-white rounded-2xl border p-4 transition-all"
            [ngClass]="selectedType === pack.id ? 'border-blue-500 ring-1 ring-blue-100' : 'border-gray-200 hover:border-gray-300'"
            (click)="selectPack(pack)">
            <div class="text-xs text-gray-500">{{ pack.title }}</div>
            <div class="text-2xl font-semibold text-gray-900 mt-1">{{ getPrimaryMetric(pack) }}</div>
            <div class="text-xs text-gray-500 mt-1">{{ getSecondaryMetric(pack) }}</div>
          </button>
        </div>

        <div class="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 class="text-lg font-bold text-gray-900">{{ preview?.title || 'Report Preview' }}</h3>
              <p class="text-sm text-gray-500">Preview for {{ period }}</p>
            </div>
            <div class="flex gap-2">
              <ui-button variant="secondary" size="sm" [loading]="loadingPreview" (clicked)="loadPreview()">
                Refresh Preview
              </ui-button>
              <ui-button variant="secondary" size="sm" [loading]="exportingCsv" [disabled]="!canExport" (clicked)="exportCsv()">
                Export CSV
              </ui-button>
              <ui-button variant="primary" size="sm" [loading]="exportingPdf" [disabled]="!canExport" (clicked)="exportPdf()">
                Export PDF
              </ui-button>
            </div>
          </div>

          <div class="mb-4">
            <div *ngIf="exportGuardrails.length; else exportReady" class="space-y-1">
              <div
                *ngFor="let issue of exportGuardrails"
                class="text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-700 px-2 py-1">
                {{ issue }}
              </div>
            </div>
            <ng-template #exportReady>
              <div class="text-xs rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-1">
                Export guardrails passed. CSV/PDF packs are ready.
              </div>
            </ng-template>
          </div>

          <div *ngIf="loadingPreview" class="py-12">
            <ui-loading-spinner text="Loading preview..."></ui-loading-spinner>
          </div>

          <ng-container *ngIf="!loadingPreview">
            <ui-data-table
              *ngIf="previewRows.length > 0"
              [columns]="previewColumns"
              [data]="previewRows"
              [loading]="false"
              emptyMessage="No rows in selected report"
            ></ui-data-table>

            <ui-empty-state
              *ngIf="previewRows.length === 0"
              title="No preview rows"
              description="Select another pack or period to view data."
            ></ui-empty-state>
          </ng-container>
        </div>

        <div class="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-gray-900">Saved Report History</h3>
            <ui-button variant="outline" size="sm" (clicked)="clearHistory()">Clear History</ui-button>
          </div>

          <ui-data-table
            *ngIf="history.length > 0"
            [columns]="historyColumns"
            [data]="history"
            [loading]="false"
            emptyMessage="No report history"
          ></ui-data-table>

          <ui-empty-state
            *ngIf="history.length === 0"
            title="No report exports yet"
            description="Your export actions will appear here."
          ></ui-empty-state>
        </div>
      </ng-container>
    </div>
  `,
})
export class CeoReportsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly historyStorageKey = 'ceo-reports-history-v1';

  period = new Date().toISOString().slice(0, 7);

  loadingSummary = false;
  loadingPreview = false;
  exportingCsv = false;
  exportingPdf = false;
  error: string | null = null;

  summary: CeoReportsSummary | null = null;
  packs: CeoReportPack[] = [];
  selectedType = '';

  preview: CeoReportPreview | null = null;
  previewColumns: TableColumn[] = [];
  previewRows: any[] = [];

  history: ReportHistoryRow[] = [];
  readonly historyColumns: TableColumn[] = [
    { key: 'time', header: 'Time' },
    { key: 'reportType', header: 'Report Type' },
    { key: 'period', header: 'Period', align: 'center' },
    { key: 'format', header: 'Format', align: 'center' },
    { key: 'status', header: 'Status', align: 'center' },
  ];

  constructor(
    private readonly ceoApi: CeoApiService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.restoreHistory();
    this.loadSummary();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSummary(): void {
    this.loadingSummary = true;
    this.error = null;

    this.ceoApi
      .getReportsSummary(this.period)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingSummary = false;
        }),
      )
      .subscribe({
        next: (summary) => {
          this.summary = summary;
          this.packs = summary?.packs || [];

          if (!this.selectedType || !this.packs.some((p) => p.id === this.selectedType)) {
            this.selectedType = this.packs[0]?.id || '';
          }

          this.loadPreview();
        },
        error: () => {
          this.error = 'Unable to load executive report packs.';
          this.toast.error('Failed to load report packs');
        },
      });
  }

  selectPack(pack: CeoReportPack): void {
    this.selectedType = pack.id;
    this.loadPreview();
  }

  loadPreview(): void {
    if (!this.selectedType) {
      this.preview = null;
      this.previewColumns = [];
      this.previewRows = [];
      return;
    }

    this.loadingPreview = true;
    this.ceoApi
      .getReportPreview(this.selectedType, this.period)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingPreview = false;
        }),
      )
      .subscribe({
        next: (preview) => {
          this.preview = preview;
          this.previewRows = preview?.rows || [];
          this.previewColumns = (preview?.columns || []).map((c) => ({
            key: c.key,
            header: c.label,
          }));
        },
        error: () => {
          this.preview = null;
          this.previewColumns = [];
          this.previewRows = [];
          this.toast.error('Failed to load report preview');
        },
      });
  }

  exportCsv(): void {
    if (!this.selectedType) return;

    this.exportingCsv = true;
    this.ceoApi
      .exportReportCsv(this.selectedType, this.period)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.exportingCsv = false;
        }),
      )
      .subscribe({
        next: (blob) => {
          const fileName = `ceo-${this.selectedType}-${this.period}.csv`;
          this.saveBlob(blob, fileName);
          this.pushHistory('CSV', 'SUCCESS');
          this.toast.success('CSV export downloaded');
        },
        error: () => {
          this.pushHistory('CSV', 'FAILED');
          this.toast.error('CSV export failed');
        },
      });
  }

  exportPdf(): void {
    if (!this.selectedType) return;

    this.exportingPdf = true;
    this.ceoApi
      .getReportPdfLink(this.selectedType, this.period)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.exportingPdf = false;
        }),
      )
      .subscribe({
        next: (res) => {
          if (res?.downloadUrl) {
            window.open(res.downloadUrl, '_blank');
            this.pushHistory('PDF', 'SUCCESS');
            this.toast.success('PDF export started');
            return;
          }
          this.pushHistory('PDF', 'FAILED');
          this.toast.error('PDF link not available');
        },
        error: () => {
          this.pushHistory('PDF', 'FAILED');
          this.toast.error('PDF export failed');
        },
      });
  }

  clearHistory(): void {
    this.history = [];
    localStorage.removeItem(this.historyStorageKey);
  }

  getPrimaryMetric(pack: CeoReportPack): string {
    const m = pack.metrics || {};
    const value = m['total'] ?? m['expiringSoon'] ?? m['completed'] ?? 0;
    return String(value);
  }

  getSecondaryMetric(pack: CeoReportPack): string {
    const m = pack.metrics || {};
    if (typeof m['completionRate'] === 'number') {
      return `Completion ${m['completionRate']}%`;
    }
    if (typeof m['overdue'] === 'number') {
      return `Overdue ${m['overdue']}`;
    }
    if (typeof m['critical'] === 'number') {
      return `Critical ${m['critical']}`;
    }
    if (typeof m['totalBranches'] === 'number') {
      return `${m['totalBranches']} branches in scope`;
    }
    return 'Executive report pack';
  }

  get exportGuardrails(): string[] {
    const issues: string[] = [];
    if (!this.selectedType) {
      issues.push('Select a report pack before exporting.');
    }
    if (!this.period || !/^\d{4}-\d{2}$/.test(this.period)) {
      issues.push('Pick a valid reporting period.');
    } else {
      const selected = new Date(`${this.period}-01T00:00:00`);
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      if (selected.getTime() > thisMonth.getTime()) {
        issues.push('Future period export is not allowed.');
      }
    }
    if (!this.loadingPreview && this.previewRows.length === 0) {
      issues.push('Preview has no rows. Refresh or choose another pack.');
    }
    return issues;
  }

  get canExport(): boolean {
    return (
      this.exportGuardrails.length === 0 &&
      !this.loadingSummary &&
      !this.loadingPreview &&
      !this.exportingCsv &&
      !this.exportingPdf
    );
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  private pushHistory(format: 'CSV' | 'PDF', status: 'SUCCESS' | 'FAILED'): void {
    const row: ReportHistoryRow = {
      time: new Date().toISOString(),
      reportType: this.selectedType,
      period: this.period,
      format,
      status,
    };

    this.history = [row, ...this.history].slice(0, 30);
    localStorage.setItem(this.historyStorageKey, JSON.stringify(this.history));
  }

  private restoreHistory(): void {
    try {
      const raw = localStorage.getItem(this.historyStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      this.history = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.history = [];
    }
  }
}

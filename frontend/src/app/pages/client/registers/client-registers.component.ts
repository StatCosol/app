import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { finalize, map, takeUntil, timeout } from 'rxjs/operators';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  ModalComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

type SourceType = 'GENERATED' | 'MANUAL';

type RegisterRow = {
  id: string;
  title: string;
  category: string;
  registerType: string | null;
  branchId: string | null;
  payrollInputId: string | null;
  stateCode: string | null;
  periodYear: number | null;
  periodMonth: number | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: string | null;
  approvalStatus: string;
  approvedAt: string | null;
  createdAt: string | null;
  sourceType: SourceType;
};

@Component({
  selector: 'app-client-registers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    ModalComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Registers Download Center"
        [subtitle]="isBranch ? 'Approved branch registers with preview and bulk download' : 'Preview and download payroll registers by period and branch'">
        <div class="actions">
          <ui-button variant="secondary" [disabled]="loading" (clicked)="reload()">Refresh</ui-button>
          <ui-button
            variant="primary"
            [disabled]="!filteredRows.length || loading || packDownloading"
            (clicked)="downloadPack()">
            {{ packDownloading ? 'Preparing Pack...' : 'Download ZIP Pack' }}
          </ui-button>
        </div>
      </ui-page-header>

      <section class="card mb-6">
        <div class="section-title">Filters</div>
        <div class="filter-grid">
          <label>
            <span>Year</span>
            <input type="number" [(ngModel)]="q.periodYear" placeholder="2026" />
          </label>
          <label>
            <span>Month</span>
            <input type="number" [(ngModel)]="q.periodMonth" placeholder="1-12" />
          </label>
          <label>
            <span>Category</span>
            <select [(ngModel)]="q.category">
              <option value="">All Categories</option>
              <option value="REGISTER">REGISTER</option>
              <option value="RECORD">RECORD</option>
            </select>
          </label>
          <label>
            <span>Branch ID</span>
            <input type="text" [(ngModel)]="q.branchId" placeholder="Branch id" />
          </label>
          <label>
            <span>Source</span>
            <select [(ngModel)]="q.sourceType" (ngModelChange)="applyLocalFilters()">
              <option value="">All</option>
              <option value="GENERATED">Generated</option>
              <option value="MANUAL">Manual</option>
            </select>
          </label>
          <label class="wide">
            <span>Search</span>
            <input
              type="text"
              [(ngModel)]="q.search"
              (ngModelChange)="applyLocalFilters()"
              placeholder="Title, register type, branch, file name" />
          </label>
          <div class="actions">
            <ui-button variant="primary" [disabled]="loading" (clicked)="reload()">Apply</ui-button>
            <ui-button variant="ghost" [disabled]="loading" (clicked)="reset()">Reset</ui-button>
          </div>
        </div>
        <div class="quick-meta" *ngIf="!loading && rows.length">
          <span>Total: {{ filteredRows.length }}</span>
          <span>Generated: {{ generatedCount }}</span>
          <span>Manual: {{ manualCount }}</span>
        </div>
      </section>

      <ui-loading-spinner *ngIf="loading" text="Loading registers..." size="lg"></ui-loading-spinner>

      <ui-empty-state *ngIf="!loading && error" title="Error" [description]="error"></ui-empty-state>

      <ui-empty-state
        *ngIf="!loading && !error && !filteredRows.length"
        title="No Registers Found"
        [description]="isBranch ? 'No approved registers available for your branch and filters.' : 'No registers match the current filters.'">
      </ui-empty-state>

      <section class="card" *ngIf="!loading && !error && filteredRows.length">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Branch</th>
                <th>Period</th>
                <th>Source</th>
                <th>Status</th>
                <th>Generated At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of pagedRows(); trackBy: trackById">
                <td>
                  <div class="title">{{ row.title }}</div>
                  <div class="meta">{{ row.registerType || '-' }} | {{ row.fileName || '-' }}</div>
                </td>
                <td>{{ row.branchId || '-' }}</td>
                <td>{{ periodLabel(row) }}</td>
                <td>
                  <span class="source-badge" [class.generated]="row.sourceType === 'GENERATED'">
                    {{ row.sourceType }}
                  </span>
                </td>
                <td><ui-status-badge [status]="row.approvalStatus || 'PENDING'"></ui-status-badge></td>
                <td>{{ row.createdAt | date:'dd MMM yyyy, hh:mm a' }}</td>
                <td>
                  <div class="meta">{{ formatFileSize(row.fileSize) }} | {{ row.fileType || 'unknown' }}</div>
                  <div class="row-actions">
                    <ui-button size="sm" variant="secondary" (clicked)="preview(row)">Preview</ui-button>
                    <ui-button size="sm" variant="primary" (clicked)="download(row)">Download</ui-button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pager">
          <div class="meta">
            Showing {{ pageStartIndex() + 1 }}-{{ pageEndIndex() }} of {{ filteredRows.length }}
          </div>
          <div class="row-actions">
            <ui-button size="sm" variant="secondary" [disabled]="page <= 1" (clicked)="prevPage()">Prev</ui-button>
            <span class="page-no">Page {{ page }}</span>
            <ui-button size="sm" variant="secondary" [disabled]="pageEndIndex() >= filteredRows.length" (clicked)="nextPage()">Next</ui-button>
          </div>
        </div>
      </section>
    </div>

    <ui-modal
      [isOpen]="previewOpen"
      [showFooter]="false"
      size="full"
      [title]="previewTitle"
      (closed)="closePreview()">
      <div class="preview-wrap">
        <div class="preview-meta" *ngIf="previewRow">
          <span>Source: {{ previewRow.sourceType }}</span>
          <span>Period: {{ periodLabel(previewRow) }}</span>
          <span>Status: {{ previewRow.approvalStatus || 'PENDING' }}</span>
          <span>Size: {{ formatFileSize(previewRow.fileSize) }}</span>
          <span>Generated: {{ previewRow.createdAt | date:'dd MMM yyyy, hh:mm a' }}</span>
        </div>
        <ng-container [ngSwitch]="previewMode">
          <iframe
            *ngSwitchCase="'pdf'"
            [src]="previewUrl"
            class="preview-frame"
            title="Register Preview">
          </iframe>
          <img
            *ngSwitchCase="'image'"
            [src]="previewUrl"
            class="preview-image"
            alt="Register preview" />
          <div *ngSwitchDefault class="unsupported">
            <p>Inline preview is not available for this file type.</p>
            <ui-button variant="primary" (clicked)="previewRow && download(previewRow)">Download File</ui-button>
          </div>
        </ng-container>
      </div>
    </ui-modal>
  `,
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; padding: 1rem; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 1rem; box-shadow: 0 6px 20px rgba(15, 23, 42, .04); }
    .section-title { font-size: .95rem; font-weight: 700; color: #111827; margin-bottom: .75rem; }
    .filter-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .7rem; }
    label { display: flex; flex-direction: column; gap: .35rem; }
    label > span { font-size: .78rem; color: #4b5563; font-weight: 600; }
    label.wide { grid-column: span 2; }
    input, select { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: .5rem .6rem; font-size: .84rem; }
    .actions { display: flex; align-items: end; gap: .5rem; flex-wrap: wrap; }
    .quick-meta { margin-top: .65rem; display: flex; gap: .7rem; flex-wrap: wrap; font-size: .75rem; color: #374151; }
    .quick-meta span { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 999px; padding: .2rem .55rem; font-weight: 600; }
    .table-wrap { overflow: auto; }
    table { width: 100%; min-width: 860px; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e5e7eb; text-align: left; padding: .55rem .5rem; vertical-align: middle; font-size: .82rem; color: #1f2937; }
    th { color: #6b7280; text-transform: uppercase; letter-spacing: .02em; font-size: .72rem; font-weight: 700; }
    .title { font-weight: 600; color: #111827; }
    .meta { color: #6b7280; font-size: .73rem; }
    .source-badge { border-radius: 999px; border: 1px solid #d1d5db; padding: .12rem .55rem; font-size: .7rem; font-weight: 700; color: #4b5563; }
    .source-badge.generated { color: #1d4ed8; border-color: #bfdbfe; background: #eff6ff; }
    .row-actions { display: flex; gap: .35rem; align-items: center; }
    .pager { margin-top: .75rem; display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
    .page-no { font-size: .8rem; color: #374151; min-width: 54px; text-align: center; }
    .preview-wrap { min-height: 65vh; }
    .preview-meta { display: flex; gap: .55rem; flex-wrap: wrap; margin-bottom: .6rem; }
    .preview-meta span { font-size: .73rem; color: #374151; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 999px; padding: .16rem .52rem; }
    .preview-frame { width: 100%; min-height: 65vh; border: 1px solid #e5e7eb; border-radius: 10px; }
    .preview-image { width: 100%; max-height: 75vh; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 10px; }
    .unsupported { min-height: 40vh; display: grid; place-content: center; gap: .6rem; color: #4b5563; }
    @media (max-width: 980px) {
      .filter-grid { grid-template-columns: 1fr 1fr; }
      label.wide { grid-column: span 2; }
    }
    @media (max-width: 700px) {
      .filter-grid { grid-template-columns: 1fr; }
      label.wide { grid-column: span 1; }
      .pager { flex-direction: column; align-items: stretch; }
    }
  `],
})
export class ClientRegistersComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  rows: RegisterRow[] = [];
  filteredRows: RegisterRow[] = [];
  loading = false;
  packDownloading = false;
  error = '';
  isBranch = false;

  page = 1;
  readonly pageSize = 15;

  q = {
    periodYear: null as number | null,
    periodMonth: null as number | null,
    category: '',
    branchId: '',
    sourceType: '' as '' | SourceType,
    search: '',
  };

  previewOpen = false;
  previewTitle = 'Register Preview';
  previewMode: 'pdf' | 'image' | 'unsupported' = 'unsupported';
  previewUrl: SafeResourceUrl | null = null;
  previewRow: RegisterRow | null = null;

  private readonly base = `${environment.apiBaseUrl}/api/v1/client/payroll/registers-records`;

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
    private readonly sanitizer: DomSanitizer,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.isBranch = this.auth.isBranchUser();
    this.reload();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  reload(): void {
    this.loading = true;
    this.error = '';

    let params = new HttpParams();
    if (this.q.periodYear) params = params.set('periodYear', String(this.q.periodYear));
    if (this.q.periodMonth) params = params.set('periodMonth', String(this.q.periodMonth));
    if (this.q.category.trim()) params = params.set('category', this.q.category.trim());
    if (this.q.branchId.trim()) params = params.set('branchId', this.q.branchId.trim());
    if (this.q.sourceType) params = params.set('sourceType', this.q.sourceType);
    if (this.q.search.trim()) params = params.set('search', this.q.search.trim());

    this.http.get<any>(this.base, { params }).pipe(
      takeUntil(this.destroy$),
      timeout(15000),
      map((res) => {
        const arr = Array.isArray(res) ? res : (res?.data || []);
        return arr.map((r: any): RegisterRow => ({
          id: String(r?.id || ''),
          title: String(r?.title || ''),
          category: String(r?.category || ''),
          registerType: r?.registerType || null,
          branchId: r?.branchId || null,
          payrollInputId: r?.payrollInputId || null,
          stateCode: r?.stateCode || null,
          periodYear: r?.periodYear ?? null,
          periodMonth: r?.periodMonth ?? null,
          fileName: r?.fileName || null,
          fileType: r?.fileType || null,
          fileSize: r?.fileSize || null,
          approvalStatus: String(r?.approvalStatus || 'PENDING'),
          approvedAt: r?.approvedAt || null,
          createdAt: r?.createdAt || null,
          sourceType: r?.payrollInputId ? 'GENERATED' : 'MANUAL',
        }));
      }),
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: (rows) => {
        this.rows = rows;
        this.page = 1;
        this.applyLocalFilters();
      },
      error: (err) => {
        this.rows = [];
        this.filteredRows = [];
        this.error = err?.error?.message || 'Failed to load registers';
      },
    });
  }

  applyLocalFilters(): void {
    const text = this.q.search.trim().toLowerCase();
    this.filteredRows = this.rows.filter((row) => {
      if (this.q.sourceType && row.sourceType !== this.q.sourceType) return false;
      if (!text) return true;
      return (
        row.title.toLowerCase().includes(text) ||
        String(row.registerType || '').toLowerCase().includes(text) ||
        String(row.branchId || '').toLowerCase().includes(text) ||
        String(row.fileName || '').toLowerCase().includes(text)
      );
    });
    this.page = 1;
  }

  reset(): void {
    this.q = {
      periodYear: null,
      periodMonth: null,
      category: '',
      branchId: '',
      sourceType: '',
      search: '',
    };
    this.reload();
  }

  periodLabel(row: RegisterRow): string {
    const y = row.periodYear ? String(row.periodYear) : '----';
    const m = Number(row.periodMonth || 0);
    return m > 0 ? `${String(m).padStart(2, '0')}/${y}` : `--/${y}`;
  }

  preview(row: RegisterRow): void {
    this.previewRow = row;
    this.previewTitle = row.title || 'Register Preview';
    this.previewMode = this.resolvePreviewMode(row.fileType);
    const url = this.auth.authenticateUrl(this.downloadUrl(row));
    this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    this.previewOpen = true;
  }

  closePreview(): void {
    this.previewOpen = false;
    this.previewRow = null;
    this.previewUrl = null;
    this.previewMode = 'unsupported';
  }

  download(row: RegisterRow): void {
    const authUrl = this.auth.authenticateUrl(this.downloadUrl(row));
    this.http.get(authUrl, { responseType: 'blob' }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = row.fileName || `register_${row.id}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1200);
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'Could not download register.');
      },
    });
  }

  downloadPack(): void {
    if (!this.filteredRows.length) return;
    this.packDownloading = true;
    let params = new HttpParams();
    if (this.q.periodYear) params = params.set('periodYear', String(this.q.periodYear));
    if (this.q.periodMonth) params = params.set('periodMonth', String(this.q.periodMonth));
    if (this.q.category.trim()) params = params.set('category', this.q.category.trim());
    if (this.q.branchId.trim()) params = params.set('branchId', this.q.branchId.trim());
    if (this.q.sourceType) params = params.set('sourceType', this.q.sourceType);
    if (this.q.search.trim()) params = params.set('search', this.q.search.trim());
    params = params.set('limit', '180');

    this.http
      .get(`${this.base}/download-pack`, {
        params,
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.packDownloading = false;
        }),
      )
      .subscribe({
        next: (res) => {
          const blob = res.body || new Blob();
          const header = res.headers.get('content-disposition') || '';
          const match = /filename="?([^"]+)"?/i.exec(header);
          const fileName =
            match?.[1] || `registers_pack_${new Date().toISOString().slice(0, 10)}.zip`;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1200);
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Could not generate pack.');
        },
      });
  }

  get generatedCount(): number {
    return this.filteredRows.filter((r) => r.sourceType === 'GENERATED').length;
  }

  get manualCount(): number {
    return this.filteredRows.filter((r) => r.sourceType === 'MANUAL').length;
  }

  nextPage(): void {
    if (this.pageEndIndex() >= this.filteredRows.length) return;
    this.page += 1;
  }

  prevPage(): void {
    if (this.page <= 1) return;
    this.page -= 1;
  }

  pageStartIndex(): number {
    return (this.page - 1) * this.pageSize;
  }

  pageEndIndex(): number {
    return Math.min(this.pageStartIndex() + this.pageSize, this.filteredRows.length);
  }

  pagedRows(): RegisterRow[] {
    return this.filteredRows.slice(this.pageStartIndex(), this.pageEndIndex());
  }

  trackById(_index: number, row: RegisterRow): string {
    return row.id || String(_index);
  }

  private resolvePreviewMode(fileType: string | null): 'pdf' | 'image' | 'unsupported' {
    const ft = String(fileType || '').toLowerCase();
    if (ft.includes('pdf')) return 'pdf';
    if (ft.startsWith('image/')) return 'image';
    return 'unsupported';
  }

  private downloadUrl(row: RegisterRow): string {
    return `${this.base}/${row.id}/download`;
  }

  formatFileSize(value: string | null): string {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

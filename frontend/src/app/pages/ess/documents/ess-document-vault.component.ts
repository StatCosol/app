import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  EssApiService,
  EssDocument,
} from '../ess-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  SharedFilePreviewModalComponent,
  SharedFilePreviewData,
} from '../../../shared/components/file-preview';

@Component({
  selector: 'app-ess-document-vault',
  standalone: true,
  imports: [CommonModule, FormsModule, SharedFilePreviewModalComponent],
  template: `
    <div class="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Document Vault</h1>
        <p class="text-sm text-gray-500">Letters, statutory documents, and identity files in one place</p>
      </div>

      <div class="card p-4">
        <div class="flex flex-wrap gap-2 mb-3">
          <button
            *ngFor="let cat of categories"
            class="tab-btn"
            [ngClass]="selectedCategory === cat.value ? 'active' : ''"
            (click)="selectCategory(cat.value)">
            {{ cat.label }}
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Year</label>
            <select class="input-sm w-full" [(ngModel)]="selectedYear" (ngModelChange)="loadDocuments()">
              <option [ngValue]="null">All Years</option>
              <option *ngFor="let y of yearOptions" [ngValue]="y">{{ y }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Status</label>
            <select class="input-sm w-full" [(ngModel)]="statusFilter">
              <option value="ALL">All</option>
              <option value="VERIFIED">Verified</option>
              <option value="PENDING">Pending Verification</option>
              <option value="EXPIRING_30">Expiring in 30 Days</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Sort</label>
            <select class="input-sm w-full" [(ngModel)]="sortBy">
              <option value="uploaded_desc">Uploaded (Newest)</option>
              <option value="uploaded_asc">Uploaded (Oldest)</option>
              <option value="expiry_asc">Expiry (Earliest)</option>
              <option value="expiry_desc">Expiry (Latest)</option>
              <option value="name_asc">Name (A-Z)</option>
            </select>
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs text-gray-500 mb-1">Search</label>
            <div class="flex gap-2">
              <input class="input-sm flex-1" [(ngModel)]="searchText" (keyup.enter)="loadDocuments()" placeholder="Search by document type, name, file" />
              <button class="btn-secondary" (click)="loadDocuments()">Apply</button>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div class="card stat">
          <div class="lbl">Total</div>
          <div class="val">{{ totalDocuments }}</div>
        </div>
        <div class="card stat">
          <div class="lbl">Verified</div>
          <div class="val text-green-600">{{ verifiedCount }}</div>
        </div>
        <div class="card stat">
          <div class="lbl">Pending</div>
          <div class="val text-amber-600">{{ pendingVerificationCount }}</div>
        </div>
        <div class="card stat">
          <div class="lbl">Expiring (30d)</div>
          <div class="val text-orange-600">{{ expiringSoonCount }}</div>
        </div>
        <div class="card stat">
          <div class="lbl">Expired</div>
          <div class="val text-red-600">{{ expiredCount }}</div>
        </div>
      </div>

      <div class="card p-3" *ngIf="vaultGuardrails.length">
        <div class="text-xs font-semibold text-gray-600 uppercase mb-2">Vault Guardrails</div>
        <div class="space-y-1">
          <div
            *ngFor="let issue of vaultGuardrails"
            class="text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-700 px-2 py-1">
            {{ issue }}
          </div>
        </div>
      </div>

      <div *ngIf="error" class="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{{ error }}</div>

      <div class="card overflow-hidden">
        <div *ngIf="loading" class="p-6 text-sm text-gray-500">Loading documents...</div>

        <table *ngIf="!loading && displayDocuments.length" class="doc-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Category</th>
              <th>Type</th>
              <th>Validity</th>
              <th>Verification</th>
              <th>Uploaded</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let d of displayDocuments">
              <td>
                <div class="font-medium text-gray-900">{{ d.docName || d.fileName }}</div>
                <div class="text-xs text-gray-500">{{ d.fileName }}</div>
              </td>
              <td><span class="chip">{{ d.category }}</span></td>
              <td>{{ d.docType }}</td>
              <td>
                <span class="validity-chip" [ngClass]="validityClass(d)">{{ validityLabel(d) }}</span>
                <div class="text-xs text-gray-500 mt-1" *ngIf="d.expiryDate; else noExp">{{ d.expiryDate | date:'d MMM y' }}</div>
                <ng-template #noExp>-</ng-template>
              </td>
              <td>
                <span class="verify-chip" [ngClass]="verificationClass(d)">{{ d.isVerified ? 'Verified' : 'Pending' }}</span>
              </td>
              <td>{{ d.createdAt | date:'d MMM y' }}</td>
              <td class="text-right">
                <div class="flex gap-2 justify-end">
                  <button class="btn-secondary" [disabled]="previewingId === d.id || !!downloadingId" (click)="preview(d)">
                    {{ previewingId === d.id ? 'Opening...' : 'Preview' }}
                  </button>
                  <button class="btn-primary" [disabled]="downloadingId === d.id || !!previewingId" (click)="download(d)">
                    {{ downloadingId === d.id ? 'Downloading...' : 'Download' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div *ngIf="!loading && !displayDocuments.length" class="p-8 text-center text-sm text-gray-500">
          No documents found for selected filters.
        </div>
      </div>
    </div>

    <shared-file-preview-modal
      [open]="previewOpen"
      [file]="previewFile"
      (closed)="closePreview()"
      (download)="downloadFromPreview()"
    ></shared-file-preview-modal>
  `,
  styles: [
    `
      .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
      .stat { padding: 14px 16px; }
      .lbl { font-size: 12px; color: #6b7280; }
      .val { font-size: 22px; font-weight: 700; color: #111827; margin-top: 2px; }
      .input-sm { border: 1px solid #d1d5db; border-radius: 0.5rem; padding: 0.375rem 0.75rem; font-size: 0.875rem; }
      .btn-primary { background: #1d4ed8; color: #fff; border: none; border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 600; }
      .btn-secondary { background: #f9fafb; color: #374151; border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 600; }
      .btn-primary:disabled, .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
      .tab-btn { border: 1px solid #d1d5db; background: #fff; color: #374151; border-radius: 9999px; padding: 5px 10px; font-size: 12px; font-weight: 600; }
      .tab-btn.active { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
      .doc-table { width: 100%; border-collapse: collapse; font-size: 14px; }
      .doc-table th { text-align: left; background: #f8fafc; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
      .doc-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #111827; }
      .chip { background: #f3f4f6; color: #374151; border-radius: 9999px; font-size: 11px; padding: 2px 8px; font-weight: 600; }
      .validity-chip, .verify-chip { border-radius: 9999px; font-size: 10px; padding: 2px 8px; font-weight: 700; display: inline-flex; align-items: center; }
      .validity-valid { background: #dcfce7; color: #166534; }
      .validity-expiring { background: #ffedd5; color: #9a3412; }
      .validity-expired { background: #fee2e2; color: #991b1b; }
      .validity-none { background: #f3f4f6; color: #374151; }
      .verify-ok { background: #dcfce7; color: #166534; }
      .verify-pending { background: #fef3c7; color: #92400e; }
    `,
  ],
})
export class EssDocumentVaultComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly categories = [
    { label: 'All', value: 'ALL' },
    { label: 'Identity', value: 'IDENTITY' },
    { label: 'Statutory', value: 'STATUTORY' },
    { label: 'Employment', value: 'EMPLOYMENT' },
    { label: 'Bank', value: 'BANK' },
    { label: 'Other', value: 'OTHER' },
  ];

  selectedCategory = 'ALL';
  selectedYear: number | null = new Date().getFullYear();
  statusFilter: 'ALL' | 'VERIFIED' | 'PENDING' | 'EXPIRING_30' | 'EXPIRED' = 'ALL';
  sortBy: 'uploaded_desc' | 'uploaded_asc' | 'expiry_asc' | 'expiry_desc' | 'name_asc' = 'uploaded_desc';
  searchText = '';

  loading = false;
  error = '';
  documents: EssDocument[] = [];
  downloadingId = '';
  previewingId = '';

  previewOpen = false;
  previewDoc: EssDocument | null = null;
  previewFile: SharedFilePreviewData | null = null;
  previewUrl = '';

  constructor(
    private readonly api: EssApiService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    this.revokePreviewUrl();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get yearOptions(): number[] {
    const current = new Date().getFullYear();
    return [current, current - 1, current - 2, current - 3, current - 4];
  }

  get totalDocuments(): number {
    return this.documents.length;
  }

  get verifiedCount(): number {
    return this.documents.filter((doc) => !!doc.isVerified).length;
  }

  get pendingVerificationCount(): number {
    return this.documents.filter((doc) => !doc.isVerified).length;
  }

  get expiringSoonCount(): number {
    return this.documents.filter((doc) => this.isExpiringSoon(doc)).length;
  }

  get expiredCount(): number {
    return this.documents.filter((doc) => this.isExpired(doc)).length;
  }

  get vaultGuardrails(): string[] {
    const issues: string[] = [];
    if (this.expiredCount > 0) {
      issues.push(`${this.expiredCount} documents are expired and need renewal/replacement.`);
    }
    if (this.expiringSoonCount > 0) {
      issues.push(`${this.expiringSoonCount} documents are expiring within 30 days.`);
    }
    if (this.pendingVerificationCount > 0) {
      issues.push(`${this.pendingVerificationCount} documents are pending verification.`);
    }
    return issues;
  }

  get displayDocuments(): EssDocument[] {
    let rows = [...this.documents];

    if (this.statusFilter === 'VERIFIED') {
      rows = rows.filter((doc) => !!doc.isVerified);
    } else if (this.statusFilter === 'PENDING') {
      rows = rows.filter((doc) => !doc.isVerified);
    } else if (this.statusFilter === 'EXPIRING_30') {
      rows = rows.filter((doc) => this.isExpiringSoon(doc));
    } else if (this.statusFilter === 'EXPIRED') {
      rows = rows.filter((doc) => this.isExpired(doc));
    }

    rows.sort((a, b) => this.compareDocs(a, b));
    return rows;
  }

  selectCategory(category: string): void {
    this.selectedCategory = category;
    this.loadDocuments();
  }

  loadDocuments(): void {
    this.loading = true;
    this.error = '';

    this.api
      .getDocuments({
        category: this.selectedCategory,
        year: this.selectedYear || undefined,
        q: this.searchText.trim() || undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
        }),
      )
      .subscribe({
        next: (res) => {
          this.documents = res?.items || [];
        },
        error: () => {
          this.documents = [];
          this.error = 'Unable to load documents.';
        },
      });
  }

  download(doc: EssDocument): void {
    if (!doc?.id || this.downloadingId) return;
    this.downloadingId = doc.id;
    this.api
      .downloadDocument(doc.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.downloadingId = '';
        }),
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = doc.docName || doc.fileName || 'document';
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => {
          this.toast.error('Document download failed.');
        },
      });
  }

  preview(doc: EssDocument): void {
    if (!doc?.id || this.previewingId) return;
    this.revokePreviewUrl();
    this.previewOpen = true;
    this.previewDoc = doc;
    this.previewingId = doc.id;
    this.previewFile = {
      id: doc.id,
      name: doc.docName || doc.fileName,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      uploadedAt: doc.createdAt,
      dueDate: doc.expiryDate,
      status: doc.isVerified ? 'VERIFIED' : 'PENDING',
      queryType: doc.docType,
      rejectionReason: '',
      versions: [],
    };

    this.api
      .downloadDocument(doc.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.previewingId = '';
        }),
      )
      .subscribe({
        next: (blob) => {
          this.previewUrl = URL.createObjectURL(blob);
          this.previewFile = {
            ...(this.previewFile || {
              id: doc.id,
              name: doc.docName || doc.fileName,
            }),
            mimeType: blob.type || doc.mimeType,
            url: this.previewUrl,
          };
        },
        error: () => {
          this.previewFile = {
            ...(this.previewFile || {
              id: doc.id,
              name: doc.docName || doc.fileName,
            }),
            url: null,
          };
          this.toast.error('Unable to preview this file.');
        },
      });
  }

  downloadFromPreview(): void {
    if (this.previewDoc) {
      this.download(this.previewDoc);
    }
  }

  closePreview(): void {
    this.previewOpen = false;
    this.previewDoc = null;
    this.previewFile = null;
    this.revokePreviewUrl();
  }

  private revokePreviewUrl(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = '';
    }
  }

  isExpired(doc: EssDocument): boolean {
    if (!doc?.expiryDate) return false;
    const date = new Date(doc.expiryDate);
    if (Number.isNaN(date.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date.getTime() < today.getTime();
  }

  isExpiringSoon(doc: EssDocument): boolean {
    if (!doc?.expiryDate || this.isExpired(doc)) return false;
    const date = new Date(doc.expiryDate);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    const days = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 30;
  }

  validityLabel(doc: EssDocument): string {
    if (this.isExpired(doc)) return 'Expired';
    if (this.isExpiringSoon(doc)) return 'Expiring Soon';
    if (doc.expiryDate) return 'Valid';
    return 'No Expiry';
  }

  validityClass(doc: EssDocument): string {
    if (this.isExpired(doc)) return 'validity-expired';
    if (this.isExpiringSoon(doc)) return 'validity-expiring';
    if (doc.expiryDate) return 'validity-valid';
    return 'validity-none';
  }

  verificationClass(doc: EssDocument): string {
    return doc.isVerified ? 'verify-ok' : 'verify-pending';
  }

  private compareDocs(a: EssDocument, b: EssDocument): number {
    if (this.sortBy === 'uploaded_asc') {
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    }
    if (this.sortBy === 'uploaded_desc') {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
    if (this.sortBy === 'name_asc') {
      return String(a.docName || a.fileName || '').localeCompare(String(b.docName || b.fileName || ''));
    }
    if (this.sortBy === 'expiry_asc') {
      return this.expiryTimestamp(a) - this.expiryTimestamp(b);
    }
    return this.expiryTimestamp(b) - this.expiryTimestamp(a);
  }

  private expiryTimestamp(doc: EssDocument): number {
    if (!doc?.expiryDate) return Number.MAX_SAFE_INTEGER;
    const ts = new Date(doc.expiryDate).getTime();
    return Number.isNaN(ts) ? Number.MAX_SAFE_INTEGER : ts;
  }
}

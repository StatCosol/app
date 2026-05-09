import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent, ClientContextStripComponent } from '../../../shared/ui';
import {
  SafetyDocumentsApi,
  SafetyDocument,
  ExpiringDocument,
  SafetyScore,
  SAFETY_CATEGORIES,
  SAFETY_FREQUENCIES,
  SAFETY_DOCUMENT_TYPES,
} from '../../../core/api/safety-documents.api';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';
import { ToastService } from '../../../shared/toast/toast.service';

@Component({
  standalone: true,
  selector: 'app-crm-safety',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent, ClientContextStripComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="Safety Documents" subtitle="View and verify safety documents for this client">
        <ui-client-context-strip [inline]="true"></ui-client-context-strip>
      </ui-page-header>

      <!-- Safety Risk Score Card -->
      <div *ngIf="safetyScore" class="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900">Client Safety Score</h3>
          <div class="text-3xl font-bold" [class.text-green-600]="safetyScore.overallScore >= 70"
            [class.text-amber-600]="safetyScore.overallScore >= 40 && safetyScore.overallScore < 70"
            [class.text-red-600]="safetyScore.overallScore < 40">
            {{ safetyScore.overallScore }}%
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div *ngFor="let cs of safetyScore.categoryScores" class="text-center p-2 rounded-lg bg-gray-50">
            <div class="text-xs text-gray-500 mb-1 truncate" [title]="cs.category">{{ cs.category }}</div>
            <div class="text-sm font-bold" [class.text-green-600]="cs.score >= 70"
              [class.text-amber-600]="cs.score >= 40 && cs.score < 70"
              [class.text-red-600]="cs.score < 40">{{ cs.score }}%</div>
            <div class="text-xs text-gray-400">{{ cs.uploaded }}/{{ cs.required }} · {{ cs.weight }}%</div>
          </div>
        </div>
      </div>

      <!-- Expiry Alerts Banner -->
      <div *ngIf="expiringDocs.length > 0" class="mb-6 bg-amber-50 border border-amber-300 rounded-xl p-4">
        <div class="flex items-start gap-3">
          <svg class="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <div>
            <h3 class="text-sm font-semibold text-amber-800">Expiring Documents ({{ expiringDocs.length }})</h3>
            <ul class="mt-1 space-y-1">
              <li *ngFor="let ed of expiringDocs" class="text-sm text-amber-700">
                <span class="font-medium">{{ ed.documentName }}</span>
                <span class="text-amber-600"> ({{ ed.category || ed.documentType }})</span> —
                <span [class]="ed.daysRemaining <= 7 ? 'text-red-600 font-bold' : 'text-amber-700'">
                  {{ ed.daysRemaining <= 0 ? 'EXPIRED' : ed.daysRemaining === 1 ? 'Expires TOMORROW' : 'Expires in ' + ed.daysRemaining + ' days' }}
                </span>
                <span *ngIf="ed.branchName" class="text-amber-500"> · {{ ed.branchName }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Frequency Tabs + Filters -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div class="border-b border-gray-200">
          <nav class="flex -mb-px overflow-x-auto">
            <button *ngFor="let tab of frequencyTabs" (click)="filterFrequency = tab.value; loadDocuments()"
              class="whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors"
              [class.border-indigo-500]="filterFrequency === tab.value"
              [class.text-indigo-600]="filterFrequency === tab.value"
              [class.border-transparent]="filterFrequency !== tab.value"
              [class.text-gray-500]="filterFrequency !== tab.value">
              {{ tab.label }}
            </button>
          </nav>
        </div>
        <div class="p-4 flex flex-wrap gap-3">
          <select id="cs-filter-category" name="filterCategory" [(ngModel)]="filterCategory" (ngModelChange)="loadDocuments()"
            class="form-select rounded-lg border-gray-300 text-sm">
            <option value="">All Categories</option>
            <option *ngFor="let c of categories" [value]="c">{{ c }}</option>
          </select>
          <button (click)="showUploadForm = !showUploadForm" type="button"
            class="ml-auto inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
            {{ showUploadForm ? 'Cancel' : 'Upload on Behalf' }}
          </button>
        </div>
      </div>

      <!-- Upload On Behalf Form -->
      <div *ngIf="showUploadForm" class="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="text-base font-semibold text-gray-900 mb-4">Upload Safety Document on Behalf of Branch</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Branch *</label>
            <select [(ngModel)]="uploadForm.branchId" name="uf-branch"
              class="form-select w-full rounded-lg border-gray-300 text-sm">
              <option value="">Select Branch</option>
              <option *ngFor="let b of branches" [value]="b.id">{{ b.branchName || b.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Document Type *</label>
            <select [(ngModel)]="uploadForm.documentType" name="uf-doctype"
              class="form-select w-full rounded-lg border-gray-300 text-sm">
              <option value="">Select Type</option>
              <option *ngFor="let dt of documentTypes" [value]="dt">{{ dt }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Document Name *</label>
            <input type="text" [(ngModel)]="uploadForm.documentName" name="uf-docname"
              class="form-input w-full rounded-lg border-gray-300 text-sm" placeholder="e.g. Fire Safety Certificate">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <select [(ngModel)]="uploadForm.category" name="uf-cat"
              class="form-select w-full rounded-lg border-gray-300 text-sm">
              <option value="">Select Category</option>
              <option *ngFor="let c of categories" [value]="c">{{ c }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Frequency</label>
            <select [(ngModel)]="uploadForm.frequency" name="uf-freq"
              class="form-select w-full rounded-lg border-gray-300 text-sm">
              <option value="">Select Frequency</option>
              <option *ngFor="let f of frequencyTabs.slice(1)" [value]="f.value">{{ f.label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Valid To</label>
            <input type="date" [(ngModel)]="uploadForm.validTo" name="uf-validto"
              class="form-input w-full rounded-lg border-gray-300 text-sm">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Remarks</label>
            <input type="text" [(ngModel)]="uploadForm.remarks" name="uf-remarks"
              class="form-input w-full rounded-lg border-gray-300 text-sm" placeholder="Optional notes">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">File *</label>
            <input type="file" (change)="onFileSelected($event)" #fileInput
              class="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
          </div>
          <div class="flex items-end">
            <button (click)="submitUpload()" [disabled]="uploading"
              class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
              {{ uploading ? 'Uploading...' : 'Upload' }}
            </button>
          </div>
        </div>
      </div>

      <ui-loading-spinner *ngIf="loading" text="Loading safety documents..."></ui-loading-spinner>

      <ui-empty-state *ngIf="!loading && documents.length === 0"
        icon="document" title="No Safety Documents"
        message="No safety documents have been uploaded for this client yet.">
      </ui-empty-state>

      <!-- Documents Table -->
      <div *ngIf="!loading && documents.length > 0"
        class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Branch</th>
                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Frequency</th>
                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valid To</th>
                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Verified</th>
                <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr *ngFor="let doc of documents" class="hover:bg-gray-50"
                [class.bg-red-50]="isExpired(doc)" [class.bg-amber-50]="isExpiringSoon(doc)">
                <td class="px-3 py-3 text-sm">
                  <div class="font-medium text-gray-900 truncate max-w-[180px]" [title]="doc.documentName">{{ doc.documentName }}</div>
                  <div class="text-xs text-gray-400 truncate" [title]="doc.fileName">{{ doc.fileName }}</div>
                </td>
                <td class="px-3 py-3 text-xs">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{{ doc.category || '—' }}</span>
                </td>
                <td class="px-3 py-3 text-sm text-gray-600">{{ doc.branchName || '—' }}</td>
                <td class="px-3 py-3 text-xs text-gray-600">{{ doc.frequency || '—' }}</td>
                <td class="px-3 py-3 text-xs text-gray-600">{{ formatPeriod(doc) }}</td>
                <td class="px-3 py-3 text-sm" [class.text-red-600]="isExpired(doc)" [class.font-bold]="isExpired(doc)">
                  {{ doc.validTo ? (doc.validTo | date:'mediumDate') : '—' }}
                  <span *ngIf="isExpired(doc)" class="ml-1 text-xs text-red-600">(Expired)</span>
                </td>
                <td class="px-3 py-3 text-sm">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    [class.bg-green-100]="doc.status === 'ACTIVE'" [class.text-green-800]="doc.status === 'ACTIVE'"
                    [class.bg-red-100]="doc.status !== 'ACTIVE'" [class.text-red-800]="doc.status !== 'ACTIVE'">
                    {{ doc.status }}
                  </span>
                </td>
                <td class="px-3 py-3 text-xs space-y-0.5">
                  <div [class.text-green-600]="doc.verifiedByCrm" [class.text-gray-400]="!doc.verifiedByCrm">CRM: {{ doc.verifiedByCrm ? '✓' : '—' }}</div>
                  <div [class.text-green-600]="doc.verifiedByAuditor" [class.text-gray-400]="!doc.verifiedByAuditor">Auditor: {{ doc.verifiedByAuditor ? '✓' : '—' }}</div>
                </td>
                <td class="px-3 py-3 text-sm space-x-1">
                  <button (click)="download(doc)" class="text-indigo-600 hover:text-indigo-800 font-medium text-xs">Download</button>
                  <button *ngIf="!doc.verifiedByCrm" (click)="verify(doc)" [disabled]="doc.verifying"
                    class="text-green-600 hover:text-green-800 font-medium text-xs disabled:opacity-50">
                    {{ doc.verifying ? 'Verifying...' : 'Verify' }}
                  </button>
                  <span *ngIf="doc.verifiedByCrm" class="text-green-600 text-xs font-medium">✓ Verified</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
          {{ documents.length }} document{{ documents.length !== 1 ? 's' : '' }}
        </div>
      </div>
    </main>
  `,
})
export class CrmSafetyComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  clientId = '';
  documents: (SafetyDocument & { verifying?: boolean })[] = [];
  expiringDocs: ExpiringDocument[] = [];
  safetyScore: SafetyScore | null = null;

  categories = SAFETY_CATEGORIES;
  documentTypes = SAFETY_DOCUMENT_TYPES;
  frequencyTabs = [{ value: '', label: 'All' }, ...SAFETY_FREQUENCIES];

  filterFrequency = '';
  filterCategory = '';

  /* Upload on behalf */
  showUploadForm = false;
  uploading = false;
  branches: any[] = [];
  selectedFile: File | null = null;
  uploadForm: any = { branchId: '', documentType: '', documentName: '', category: '', frequency: '', validTo: '', remarks: '' };

  monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  constructor(
    private readonly api: SafetyDocumentsApi,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
    private readonly crmClientsApi: CrmClientsApi,
  ) {}

  ngOnInit(): void {
    this.clientId = this.route.parent?.snapshot.params['clientId'] || '';
    if (this.clientId) {
      this.loadDocuments();
      this.loadExpiring();
      this.loadSafetyScore();
      this.crmClientsApi.getBranchesForClient(this.clientId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (b) => { this.branches = b || []; this.cdr.markForCheck(); },
      });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSafetyScore(): void {
    this.api.getSafetyScoreCrm(this.clientId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (s) => { this.safetyScore = s; this.cdr.markForCheck(); },
      error: () => {},
    });
  }

  loadDocuments(): void {
    this.loading = true;
    this.api
      .listForCrm(this.clientId, {
        category: this.filterCategory || undefined,
        frequency: this.filterFrequency || undefined,
      })
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }), takeUntil(this.destroy$))
      .subscribe({
        next: (docs) => (this.documents = docs),
        error: () => this.toast.error('Failed to load safety documents'),
      });
  }

  loadExpiring(): void {
    this.api.getExpiringCrm(this.clientId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (docs) => (this.expiringDocs = docs),
      error: () => {},
    });
  }

  verify(doc: SafetyDocument & { verifying?: boolean }): void {
    if (!confirm(`Verify "${doc.documentName}" as reviewed?`)) return;
    doc.verifying = true;
    this.api.verifyCrm(doc.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Document verified');
        doc.verifiedByCrm = true;
        doc.verifying = false;
        this.cdr.markForCheck();
      },
      error: () => { doc.verifying = false; this.toast.error('Verification failed'); this.cdr.markForCheck(); },
    });
  }

  download(doc: SafetyDocument): void {
    this.api.downloadCrm(doc.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = doc.fileName; a.click(); URL.revokeObjectURL(url); },
      error: () => this.toast.error('Download failed'),
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
  }

  submitUpload(): void {
    const f = this.uploadForm;
    if (!f.branchId || !f.documentType || !f.documentName || !this.selectedFile) {
      this.toast.error('Branch, Document Type, Document Name, and File are required.');
      return;
    }
    const fd = new FormData();
    fd.append('file', this.selectedFile);
    fd.append('clientId', this.clientId);
    fd.append('branchId', f.branchId);
    fd.append('documentType', f.documentType);
    fd.append('documentName', f.documentName);
    if (f.category) fd.append('category', f.category);
    if (f.frequency) fd.append('frequency', f.frequency);
    if (f.validTo) fd.append('validTo', f.validTo);
    if (f.remarks) fd.append('remarks', f.remarks);

    this.uploading = true;
    this.api.uploadForCrm(fd).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.uploading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: () => {
        this.toast.success('Document uploaded successfully.');
        this.showUploadForm = false;
        this.uploadForm = { branchId: '', documentType: '', documentName: '', category: '', frequency: '', validTo: '', remarks: '' };
        this.selectedFile = null;
        this.loadDocuments();
        this.loadSafetyScore();
      },
      error: (e) => this.toast.error(e?.error?.message || 'Upload failed'),
    });
  }

  isExpired(doc: SafetyDocument): boolean { if (!doc.validTo) return false; return new Date(doc.validTo) < new Date(); }
  isExpiringSoon(doc: SafetyDocument): boolean { if (!doc.validTo) return false; const d = Math.ceil((new Date(doc.validTo).getTime() - Date.now()) / 86400000); return d >= 0 && d <= 30; }

  formatPeriod(doc: SafetyDocument): string {
    const parts: string[] = [];
    if (doc.periodMonth) parts.push(this.monthLabels[doc.periodMonth - 1] || '');
    if (doc.periodQuarter) parts.push('Q' + doc.periodQuarter);
    if (doc.periodYear) parts.push(String(doc.periodYear));
    return parts.join(' ') || '—';
  }
}

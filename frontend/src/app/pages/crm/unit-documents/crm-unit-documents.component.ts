import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent } from '../../../shared/ui';
import { CrmUnitDocumentsApi, CrmUnitDocument } from '../../../core/api/crm-unit-documents.api';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

const LAW_CATEGORIES = ['PF', 'ESI', 'PT', 'FACTORY', 'CLRA', 'LWF', 'OTHER'];
const DOC_TYPES = ['Return', 'Receipt', 'Challan', 'Acknowledgement', 'Other'];

@Component({
  standalone: true,
  selector: 'app-crm-unit-documents',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <ui-page-header title="Unit Documents" subtitle="Upload & manage unit-specific compliance documents"></ui-page-header>

    <!-- Filters -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <select [(ngModel)]="filters.branchId" (ngModelChange)="loadDocuments()" class="form-select rounded-lg border-gray-300 text-sm">
          <option value="">All Units</option>
          <option *ngFor="let b of branches" [value]="b.id">{{ b.branchName }}</option>
        </select>
        <input type="month" [(ngModel)]="filters.month" (ngModelChange)="loadDocuments()"
          class="form-input rounded-lg border-gray-300 text-sm" placeholder="Month">
        <select [(ngModel)]="filters.lawCategory" (ngModelChange)="loadDocuments()" class="form-select rounded-lg border-gray-300 text-sm">
          <option value="">All Laws</option>
          <option *ngFor="let c of lawCategories" [value]="c">{{ c }}</option>
        </select>
        <select [(ngModel)]="filters.documentType" (ngModelChange)="loadDocuments()" class="form-select rounded-lg border-gray-300 text-sm">
          <option value="">All Types</option>
          <option *ngFor="let t of docTypes" [value]="t">{{ t }}</option>
        </select>
        <button
          (click)="showUploadForm = !showUploadForm"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
          [style.background]="showUploadForm ? '#dc2626' : '#0a2656'">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              [attr.d]="showUploadForm ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'" />
          </svg>
          {{ showUploadForm ? 'Cancel' : 'Upload Document' }}
        </button>
      </div>
    </div>

    <!-- Upload Form -->
    <div *ngIf="showUploadForm" class="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
      <h3 class="text-base font-semibold text-gray-800 mb-4">Upload New Document</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Unit *</label>
          <select [(ngModel)]="form.branchId" class="form-select w-full rounded-lg border-gray-300 text-sm" required>
            <option value="">Select Unit</option>
            <option *ngFor="let b of branches" [value]="b.id">{{ b.branchName }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Month</label>
          <input type="month" [(ngModel)]="form.month" class="form-input w-full rounded-lg border-gray-300 text-sm">
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Law Category *</label>
          <select [(ngModel)]="form.lawCategory" class="form-select w-full rounded-lg border-gray-300 text-sm" required>
            <option value="">Select Law</option>
            <option *ngFor="let c of lawCategories" [value]="c">{{ c }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Document Type *</label>
          <select [(ngModel)]="form.documentType" class="form-select w-full rounded-lg border-gray-300 text-sm" required>
            <option value="">Select Type</option>
            <option *ngFor="let t of docTypes" [value]="t">{{ t }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
          <input type="text" [(ngModel)]="form.remarks" class="form-input w-full rounded-lg border-gray-300 text-sm" placeholder="Optional remarks">
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">File * (PDF, XLSX, JPG, PNG, ZIP)</label>
          <input #fileInput type="file" (change)="onFileSelected($event)"
            accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.zip"
            class="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100">
        </div>
      </div>
      <div class="mt-4 flex justify-end">
        <button
          (click)="uploadDocument()"
          [disabled]="uploading || !canUpload()"
          class="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50"
          style="background: #0a2656;">
          <svg *ngIf="uploading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
          {{ uploading ? 'Uploading...' : 'Upload' }}
        </button>
      </div>
    </div>

    <!-- Documents Table -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <ui-loading-spinner *ngIf="loading"></ui-loading-spinner>

      <ui-empty-state *ngIf="!loading && !documents.length"
        title="No documents found"
        message="Upload unit-specific compliance documents using the button above.">
      </ui-empty-state>

      <div *ngIf="!loading && documents.length" class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Unit</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Month</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Law</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">File</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Uploaded</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Remarks</th>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-100">
            <tr *ngFor="let doc of documents" class="hover:bg-gray-50 transition-colors">
              <td class="px-4 py-3 text-sm text-gray-800">{{ getBranchName(doc.branchId) }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ doc.month || '—' }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  [ngClass]="{
                    'bg-blue-100 text-blue-700': doc.lawCategory === 'PF',
                    'bg-green-100 text-green-700': doc.lawCategory === 'ESI',
                    'bg-purple-100 text-purple-700': doc.lawCategory === 'PT',
                    'bg-amber-100 text-amber-700': doc.lawCategory === 'FACTORY',
                    'bg-red-100 text-red-700': doc.lawCategory === 'CLRA',
                    'bg-gray-100 text-gray-700': doc.lawCategory === 'OTHER' || doc.lawCategory === 'LWF'
                  }">
                  {{ doc.lawCategory }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ doc.documentType }}</td>
              <td class="px-4 py-3 text-sm text-gray-700 max-w-[180px] truncate" [title]="doc.fileName">{{ doc.fileName }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ doc.createdAt | date:'dd MMM yyyy' }}</td>
              <td class="px-4 py-3 text-sm text-gray-500 max-w-[120px] truncate" [title]="doc.remarks || ''">{{ doc.remarks || '—' }}</td>
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-2">
                  <button (click)="downloadDoc(doc)" class="text-blue-600 hover:text-blue-800 transition-colors" title="Download">
                    <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                  <button (click)="deleteDoc(doc)" class="text-red-500 hover:text-red-700 transition-colors" title="Delete">
                    <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
  `],
})
export class CrmUnitDocumentsComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  private destroy$ = new Subject<void>();

  clientId = '';
  loading = false;
  uploading = false;
  showUploadForm = false;

  documents: CrmUnitDocument[] = [];
  branches: any[] = [];

  lawCategories = LAW_CATEGORIES;
  docTypes = DOC_TYPES;

  filters = { branchId: '', month: this.currentMonth(), lawCategory: '', documentType: '' };
  form = { branchId: '', month: this.currentMonth(), lawCategory: '', documentType: '', remarks: '' };

  private currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  selectedFile: File | null = null;

  constructor(
    private api: CrmUnitDocumentsApi,
    private clientsApi: CrmClientsApi,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['clientId']) {
        this.clientId = params['clientId'];
        this.loadBranches();
        this.loadDocuments();
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBranches() {
    this.clientsApi.getBranchesForClient(this.clientId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.branches = Array.isArray(res) ? res : (res?.data || []);
        this.cdr.markForCheck();
      },
    });
  }

  loadDocuments() {
    this.loading = true;
    this.api.listForCrm({
      clientId: this.clientId,
      branchId: this.filters.branchId || undefined,
      month: this.filters.month || undefined,
      lawCategory: this.filters.lawCategory || undefined,
      documentType: this.filters.documentType || undefined,
    }).pipe(
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: docs => { this.documents = docs; },
      error: () => this.toast.error('Failed to load documents'),
    });
  }

  getBranchName(branchId: string): string {
    const b = this.branches.find((x: any) => x.id === branchId);
    return b?.branchName || branchId.substring(0, 8) + '...';
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
  }

  canUpload(): boolean {
    return !!(this.form.branchId && this.form.lawCategory && this.form.documentType && this.selectedFile);
  }

  uploadDocument() {
    if (!this.canUpload()) return;
    this.uploading = true;
    const fd = new FormData();
    fd.append('file', this.selectedFile!);
    fd.append('clientId', this.clientId);
    fd.append('branchId', this.form.branchId);
    if (this.form.month) fd.append('month', this.form.month);
    fd.append('lawCategory', this.form.lawCategory);
    fd.append('documentType', this.form.documentType);
    if (this.form.remarks) fd.append('remarks', this.form.remarks);

    this.api.uploadDocument(fd).pipe(
      finalize(() => { this.uploading = false; this.cdr.markForCheck(); }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => {
        this.toast.success('Document uploaded successfully');
        this.resetForm();
        this.loadDocuments();
      },
      error: (err: any) => this.toast.error(err?.error?.message || 'Upload failed'),
    });
  }

  downloadDoc(doc: CrmUnitDocument) {
    this.api.downloadCrm(doc.id).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.fileName;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Download failed'),
    });
  }

  async deleteDoc(doc: CrmUnitDocument) {
    if (!(await this.dialog.confirm('Delete Document', `Delete "${doc.fileName}"?`, { variant: 'danger', confirmText: 'Delete' }))) return;
    this.api.deleteDocument(doc.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Deleted');
        this.loadDocuments();
      },
      error: () => this.toast.error('Delete failed'),
    });
  }

  private resetForm() {
    this.form = { branchId: '', month: this.currentMonth(), lawCategory: '', documentType: '', remarks: '' };
    this.selectedFile = null;
    this.showUploadForm = false;
    if (this.fileInput) this.fileInput.nativeElement.value = '';
  }
}

import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  CrmDocumentScope,
  CrmUnitDocument,
  CrmUnitDocumentsApi,
} from '../../../core/api/crm-unit-documents.api';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  ClientContextStripComponent,
} from '../../../shared/ui';

const LAW_CATEGORIES = ['PF', 'ESI', 'PT', 'FACTORY', 'CLRA', 'LWF', 'OTHER'];
const DOC_TYPES = [
  'Return',
  'Receipt',
  'Challan',
  'Acknowledgement',
  'Certificate',
  'Approval',
  'Notice / Reply',
  'Other',
];

type ScopeFilter = '' | CrmDocumentScope;

@Component({
  standalone: true,
  selector: 'app-crm-unit-documents',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ClientContextStripComponent,
  ],
  template: `
    <ui-page-header
      title="Unit Documents"
      subtitle="Upload and manage CRM documents at company or branch scope">
      <ui-client-context-strip [inline]="true"></ui-client-context-strip>
    </ui-page-header>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <select
          id="crm-ud-scope"
          name="scope"
          [(ngModel)]="filters.scope"
          (ngModelChange)="onFilterScopeChange()"
          class="form-select rounded-lg border-gray-300 text-sm">
          <option value="">All Scopes</option>
          <option value="COMPANY">Company</option>
          <option value="BRANCH">Branch</option>
        </select>

        <select
          id="crm-ud-branch"
          name="branchId"
          [(ngModel)]="filters.branchId"
          (ngModelChange)="loadDocuments()"
          [disabled]="filters.scope === 'COMPANY'"
          class="form-select rounded-lg border-gray-300 text-sm disabled:bg-gray-100">
          <option value="">All Units</option>
          <option *ngFor="let b of branches" [value]="b.id">{{ b.branchName }}</option>
        </select>

        <input autocomplete="off"
          type="month"
          id="crm-ud-month"
          name="month"
          [(ngModel)]="filters.month"
          (ngModelChange)="loadDocuments()"
          class="form-input rounded-lg border-gray-300 text-sm"
          placeholder="Month">

        <select
          id="crm-ud-law"
          name="lawCategory"
          [(ngModel)]="filters.lawCategory"
          (ngModelChange)="loadDocuments()"
          class="form-select rounded-lg border-gray-300 text-sm">
          <option value="">All Laws</option>
          <option *ngFor="let c of lawCategories" [value]="c">{{ c }}</option>
        </select>

        <select
          id="crm-ud-doctype"
          name="documentType"
          [(ngModel)]="filters.documentType"
          (ngModelChange)="loadDocuments()"
          class="form-select rounded-lg border-gray-300 text-sm">
          <option value="">All Types</option>
          <option *ngFor="let t of docTypes" [value]="t">{{ t }}</option>
        </select>

        <button
          (click)="showUploadForm = !showUploadForm"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
          [style.background]="showUploadForm ? '#dc2626' : '#0a2656'">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              [attr.d]="showUploadForm ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'" />
          </svg>
          {{ showUploadForm ? 'Cancel' : 'Upload Document' }}
        </button>
      </div>
    </div>

    <div *ngIf="showUploadForm" class="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
      <h3 class="text-base font-semibold text-gray-800 mb-4">Upload New Document</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label for="crm-ud-form-scope" class="block text-xs font-medium text-gray-600 mb-1">Document Scope *</label>
          <select
            id="crm-ud-form-scope"
            name="formScope"
            [(ngModel)]="form.scope"
            (ngModelChange)="onFormScopeChange()"
            class="form-select w-full rounded-lg border-gray-300 text-sm">
            <option value="BRANCH">Branch</option>
            <option value="COMPANY">Company</option>
          </select>
        </div>

        <div>
          <label for="crm-ud-form-branch" class="block text-xs font-medium text-gray-600 mb-1">
            Unit <span *ngIf="form.scope === 'BRANCH'">*</span>
          </label>
          <select
            id="crm-ud-form-branch"
            name="formBranchId"
            [(ngModel)]="form.branchId"
            [disabled]="form.scope === 'COMPANY'"
            class="form-select w-full rounded-lg border-gray-300 text-sm disabled:bg-gray-100">
            <option value="">{{ form.scope === 'COMPANY' ? 'Not applicable' : 'Select Unit' }}</option>
            <option *ngFor="let b of branches" [value]="b.id">{{ b.branchName }}</option>
          </select>
        </div>

        <div>
          <label for="crm-ud-form-month" class="block text-xs font-medium text-gray-600 mb-1">Month</label>
          <input autocomplete="off"
            type="month"
            id="crm-ud-form-month"
            name="formMonth"
            [(ngModel)]="form.month"
            class="form-input w-full rounded-lg border-gray-300 text-sm">
        </div>

        <div>
          <label for="crm-ud-form-law" class="block text-xs font-medium text-gray-600 mb-1">Law Category *</label>
          <select
            id="crm-ud-form-law"
            name="formLawCategory"
            [(ngModel)]="form.lawCategory"
            class="form-select w-full rounded-lg border-gray-300 text-sm">
            <option value="">Select Law</option>
            <option *ngFor="let c of lawCategories" [value]="c">{{ c }}</option>
          </select>
        </div>

        <div>
          <label for="crm-ud-form-doctype" class="block text-xs font-medium text-gray-600 mb-1">Document Type *</label>
          <select
            id="crm-ud-form-doctype"
            name="formDocumentType"
            [(ngModel)]="form.documentType"
            class="form-select w-full rounded-lg border-gray-300 text-sm">
            <option value="">Select Type</option>
            <option *ngFor="let t of docTypes" [value]="t">{{ t }}</option>
          </select>
        </div>

        <div>
          <label for="crm-ud-form-remarks" class="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
          <input autocomplete="off"
            type="text"
            id="crm-ud-form-remarks"
            name="formRemarks"
            [(ngModel)]="form.remarks"
            class="form-input w-full rounded-lg border-gray-300 text-sm"
            placeholder="Optional remarks">
        </div>

        <div class="lg:col-span-2">
          <label for="crm-ud-form-file" class="block text-xs font-medium text-gray-600 mb-1">File * (PDF, XLSX, JPG, PNG, ZIP)</label>
          <input
            #fileInput
            id="crm-ud-form-file"
            name="file"
            type="file"
            (change)="onFileSelected($event)"
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

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <ui-loading-spinner *ngIf="loading"></ui-loading-spinner>

      <ui-empty-state
        *ngIf="!loading && !documents.length"
        title="No documents found"
        message="Upload CRM documents for company or branch scope using the button above.">
      </ui-empty-state>

      <div *ngIf="!loading && documents.length" class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Scope</th>
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
              <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  [ngClass]="doc.scope === 'COMPANY' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'">
                  {{ doc.scope === 'COMPANY' ? 'Company' : 'Branch' }}
                </span>
              </td>
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

  private readonly destroy$ = new Subject<void>();

  clientId = '';
  loading = false;
  uploading = false;
  showUploadForm = false;

  documents: CrmUnitDocument[] = [];
  branches: Array<{ id: string; branchName: string }> = [];

  lawCategories = LAW_CATEGORIES;
  docTypes = DOC_TYPES;

  filters: {
    scope: ScopeFilter;
    branchId: string;
    month: string;
    lawCategory: string;
    documentType: string;
  } = {
    scope: '',
    branchId: '',
    month: '',
    lawCategory: '',
    documentType: '',
  };

  form: {
    scope: CrmDocumentScope;
    branchId: string;
    month: string;
    lawCategory: string;
    documentType: string;
    remarks: string;
  } = {
    scope: 'BRANCH',
    branchId: '',
    month: '',
    lawCategory: '',
    documentType: '',
    remarks: '',
  };

  selectedFile: File | null = null;

  constructor(
    private readonly api: CrmUnitDocumentsApi,
    private readonly clientsApi: CrmClientsApi,
    private readonly toast: ToastService,
    private readonly dialog: ConfirmDialogService,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      if (!params['clientId']) return;
      this.clientId = params['clientId'];
      this.loadBranches();
      this.loadDocuments();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBranches(): void {
    this.clientsApi.getBranchesForClient(this.clientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const rows = Array.isArray(res) ? res : (res?.data || []);
          this.branches = rows.map((row: any) => ({
            id: row.id,
            branchName: row.branchName || row.name || 'Branch',
          }));
          this.cdr.markForCheck();
        },
      });
  }

  loadDocuments(): void {
    this.loading = true;
    this.api.listForCrm({
      clientId: this.clientId,
      branchId: this.filters.branchId || undefined,
      scope: this.filters.scope || undefined,
      month: this.filters.month || undefined,
      lawCategory: this.filters.lawCategory || undefined,
      documentType: this.filters.documentType || undefined,
    }).pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (docs) => {
        this.documents = docs;
      },
      error: () => this.toast.error('Failed to load documents'),
    });
  }

  onFilterScopeChange(): void {
    if (this.filters.scope === 'COMPANY') {
      this.filters.branchId = '';
    }
    this.loadDocuments();
  }

  onFormScopeChange(): void {
    if (this.form.scope === 'COMPANY') {
      this.form.branchId = '';
    }
  }

  getBranchName(branchId: string | null): string {
    if (!branchId) return 'Company';
    const branch = this.branches.find((item) => item.id === branchId);
    return branch?.branchName || `${branchId.substring(0, 8)}...`;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
  }

  canUpload(): boolean {
    const hasScopeTarget =
      this.form.scope === 'COMPANY' || !!this.form.branchId;
    return !!(
      hasScopeTarget &&
      this.form.lawCategory &&
      this.form.documentType &&
      this.selectedFile
    );
  }

  uploadDocument(): void {
    if (!this.canUpload()) return;

    this.uploading = true;
    const formData = new FormData();
    formData.append('file', this.selectedFile!);
    formData.append('clientId', this.clientId);
    formData.append('scope', this.form.scope);
    if (this.form.scope === 'BRANCH') {
      formData.append('branchId', this.form.branchId);
    }
    if (this.form.month) formData.append('month', this.form.month);
    formData.append('lawCategory', this.form.lawCategory);
    formData.append('documentType', this.form.documentType);
    if (this.form.remarks) formData.append('remarks', this.form.remarks);

    this.api.uploadDocument(formData).pipe(
      finalize(() => {
        this.uploading = false;
        this.cdr.markForCheck();
      }),
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

  downloadDoc(doc: CrmUnitDocument): void {
    this.api.downloadCrm(doc.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
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

  async deleteDoc(doc: CrmUnitDocument): Promise<void> {
    const confirmed = await this.dialog.confirm(
      'Delete Document',
      `Delete "${doc.fileName}"?`,
      { variant: 'danger', confirmText: 'Delete' },
    );
    if (!confirmed) return;

    this.api.deleteDocument(doc.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Deleted');
        this.loadDocuments();
      },
      error: () => this.toast.error('Delete failed'),
    });
  }

  private resetForm(): void {
    this.form = {
      scope: 'BRANCH',
      branchId: '',
      month: '',
      lawCategory: '',
      documentType: '',
      remarks: '',
    };
    this.selectedFile = null;
    this.showUploadForm = false;
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }
}

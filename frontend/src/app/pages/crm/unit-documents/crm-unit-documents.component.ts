import { AuditFilePreviewComponent, AuditFilePreview } from '../../../shared/files/components/audit-file-preview.component';
import { UnitRegistrationFieldsComponent, emptyRegistration, appendRegistration, registrationUploadError } from '../../../shared/components/unit-registration-fields.component';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
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

const LAW_CATEGORIES = ['POLLUTION', 'PF', 'ESI', 'PT', 'FACTORY', 'CLRA', 'LWF', 'OTHER'];
const DOC_TYPES = [
  'Registration',
  'Licence',
  'Renewal',
  'Report',
  'Return',
  'TRRN',
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
  imports: [AuditFilePreviewComponent, UnitRegistrationFieldsComponent, IconComponent,
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
      subtitle="Upload and manage files shared with client and branch users">
      <ui-client-context-strip [inline]="true"></ui-client-context-strip>
    </ui-page-header>

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div class="flex flex-wrap items-end gap-3 aligned-filter-controls">
          @if (branches.length > 1) {
          <label class="text-sm">Unit
            <select id="crm-ud-branch" name="branchId" [(ngModel)]="filters.branchId" (ngModelChange)="loadDocuments()" [disabled]="filters.scope === 'COMPANY'" class="form-select rounded-lg border-gray-300 text-sm">
              <option value="">All units</option>
              @for (b of branches; track b.id) { <option [value]="b.id">{{ b.branchName }}</option> }
            </select>
          </label>
          }
          <label class="text-sm">Document type
            <select id="crm-ud-doctype" name="documentType" [(ngModel)]="filters.documentType" (ngModelChange)="loadDocuments()" class="form-select rounded-lg border-gray-300 text-sm">
              <option value="">All types</option>
              @for (t of uploadDocTypes; track t) { <option [value]="t">{{ t }}</option> }
              <optgroup label="Older document types">
                @for (t of legacyDocTypes; track t) { <option [value]="t">{{ t }}</option> }
              </optgroup>
            </select>
          </label>
          <label class="text-sm">Law
            <select id="crm-ud-law" name="lawCategory" [(ngModel)]="filters.lawCategory" (ngModelChange)="loadDocuments()" class="form-select rounded-lg border-gray-300 text-sm">
              <option value="">All laws</option>
              @for (law of lawCategories; track law) { <option [value]="law">{{ law }}</option> }
            </select>
          </label>
          @if (filters.scope || filters.month || filters.lawCategory || filters.documentType || filters.branchId) {
            <button type="button" class="border rounded px-3 py-2 text-sm" (click)="clearFilters()">Clear filters</button>
          }
          <button type="button" (click)="showUploadForm = !showUploadForm" class="border rounded px-4 py-2 text-sm bg-brand-600 text-white">{{ showUploadForm ? 'Cancel' : 'Upload Document' }}</button>
        </div>
        <details class="mt-3">
          <summary class="cursor-pointer text-sm">More filters{{ filters.scope || filters.month ? ' (active)' : '' }}</summary>
          <div class="flex flex-wrap gap-3 mt-3">
            <label class="text-sm">Shared with
              <select id="crm-ud-scope" name="scope" [(ngModel)]="filters.scope" (ngModelChange)="onFilterScopeChange()" class="form-select rounded-lg border-gray-300 text-sm">
                <option value="">Company and branch</option><option value="COMPANY">Whole company</option><option value="BRANCH">Specific branch</option>
              </select>
            </label>
            <label class="text-sm">Period on older uploads
              <input type="month" id="crm-ud-month" name="month" [(ngModel)]="filters.month" (ngModelChange)="loadDocuments()" class="form-input rounded-lg border-gray-300 text-sm">
            </label>
          </div>
        </details>
      </div>

    @if (showUploadForm) {
<div class="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
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
            Unit @if (form.scope === 'BRANCH') {
<span>*</span>
}
          </label>
          <select
            id="crm-ud-form-branch"
            name="formBranchId"
            [(ngModel)]="form.branchId"
            [disabled]="form.scope === 'COMPANY'"
            class="form-select w-full rounded-lg border-gray-300 text-sm disabled:bg-gray-100">
            <option value="">{{ form.scope === 'COMPANY' ? 'Not applicable' : 'Select Unit' }}</option>
            @for (b of branches; track b) {
<option [value]="b.id">{{ b.branchName }}</option>
}
          </select>
        </div>

        <div>
          <label for="crm-ud-form-law" class="block text-xs font-medium text-gray-600 mb-1">Law Category *</label>
          <select
            id="crm-ud-form-law"
            name="formLawCategory"
            [(ngModel)]="form.lawCategory"
            class="form-select w-full rounded-lg border-gray-300 text-sm">
            <option value="">Select Law</option>
            @for (c of lawCategories; track c) {
<option [value]="c">{{ c }}</option>
}
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
            @for (t of uploadDocTypes; track t) {
<option [value]="t">{{ t }}</option>
}
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

        <label>Valid from <input type="date" name="periodFrom" [(ngModel)]="form.periodFrom" class="form-input w-full rounded-lg border-gray-300 text-sm"></label>
        <label>Valid until <input type="date" name="periodTo" [(ngModel)]="form.periodTo" [disabled]="registration.noExpiry" class="form-input w-full rounded-lg border-gray-300 text-sm"></label>
        <div class="lg:col-span-2">
          <label for="crm-ud-form-file" class="block text-xs font-medium text-gray-600 mb-1">Files * (PDF, XLSX, JPG, PNG, ZIP)</label>
          <input
            #fileInput
            id="crm-ud-form-file"
            name="file"
            type="file"
            multiple
            (change)="onFileSelected($event)"
            accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.zip"
            class="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100">
          @if (selectedFiles.length) {
<div class="mt-1 text-xs text-gray-500">
            {{ selectedFiles.length }} file{{ selectedFiles.length !== 1 ? 's' : '' }} selected
          </div>
}
        </div>
      </div>

      <app-unit-registration-fields portal="crm" [clientId]="clientId" [branchId]="form.scope === 'BRANCH' ? form.branchId : ''" [type]="form.documentType" (detailsChange)="registration = $event" />
      <div class="mt-4 flex justify-end">
        <button
          (click)="uploadDocument()"
          [disabled]="uploading || !canUpload()"
          class="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50"
          style="background: #0A1F44;">
          @if (uploading) {
<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
}
          {{ uploading ? 'Uploading...' : 'Upload' }}
        </button>
      </div>
    </div>
}

    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      @if (loading) {
<ui-loading-spinner></ui-loading-spinner>
}

      @if (!loading && !documents.length) {
<ui-empty-state

        title="No documents found"
        message="Upload shared files for company or branch scope using the button above.">
      </ui-empty-state>
}

      @if (!loading && documents.length) {
<div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Scope</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Unit</th>
              @if (hasRecordedMonth) { <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Month</th> }
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Law</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">File</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Uploaded</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Remarks</th>
              <th class="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-100">
            @for (doc of documents; track doc) {
<tr class="hover:bg-gray-50 transition-colors">
              <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  [ngClass]="doc.scope === 'COMPANY' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'">
                  {{ doc.scope === 'COMPANY' ? 'Company' : 'Branch' }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-800">{{ getBranchName(doc.branchId) }}</td>
              @if (hasRecordedMonth) { <td class="px-4 py-3 text-sm text-gray-600">{{ doc.month || '—' }}</td> }
              <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  [ngClass]="{
                    'bg-brand-100 text-brand-700': doc.lawCategory === 'PF',
                    'bg-green-100 text-green-700': doc.lawCategory === 'ESI',
                    'bg-purple-100 text-purple-700': doc.lawCategory === 'PT',
                    'bg-amber-100 text-amber-700': doc.lawCategory === 'FACTORY',
                    'bg-red-100 text-red-700': doc.lawCategory === 'CLRA',
                    'bg-gray-100 text-gray-700': doc.lawCategory === 'OTHER' || doc.lawCategory === 'LWF'
                  }">
                  {{ doc.lawCategory }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ doc.documentType }}
    @if (doc.registration) { <div data-testid="registration-status" class="text-xs font-medium mt-1">{{ doc.registration.type }}: {{ doc.registration.status.replace('_', ' ') }}<br>Current expiry: {{ doc.registration.expiryDate || 'No expiry' }}</div> }
    @if (doc.periodFrom || doc.periodTo) { <div class="text-xs text-gray-500">Valid: {{ doc.periodFrom || '—' }} – {{ doc.periodTo || '—' }}</div> }
  </td>
              <td class="px-4 py-3 text-sm text-gray-700 max-w-[180px] truncate" [title]="doc.fileName">{{ doc.fileName }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ doc.createdAt | date:'dd MMM yyyy' }}</td>
              <td class="px-4 py-3 text-sm text-gray-500 max-w-[120px] truncate" [title]="doc.remarks || ''">{{ doc.remarks || '—' }}</td>
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-2">
                  <button (click)="downloadDoc(doc)" class="compact-action text-brand-600 hover:text-brand-800 transition-colors" title="Download" aria-label="Download" data-action-label="Download" data-action-icon="download"><ui-icon name="download" [size]="20" /></button>
                  <button (click)="viewDoc(doc)" class="compact-action text-emerald-600 hover:text-emerald-800 transition-colors" title="View" aria-label="View" data-action-label="View" data-action-icon="eye"><ui-icon name="eye" [size]="20" /></button>
                  @if (!doc.registrationId) { <button (click)="deleteDoc(doc)" class="compact-action text-red-500 hover:text-red-700 transition-colors" title="Delete" aria-label="Delete" data-action-label="Delete" data-action-icon="trash"><ui-icon name="trash" [size]="20" /></button> }
                </div>
              </td>
            </tr>
}
          </tbody>
        </table>
      </div>
}
    </div>
    @if (documentPreview) { <app-audit-file-preview [request]="documentPreview" (closed)="documentPreview = null" /> }
  `,
  styles: [`
    :host { display: block; }
  `],
})
export class CrmUnitDocumentsComponent implements OnInit, OnDestroy {
  documentPreview: AuditFilePreview | null = null;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private readonly destroy$ = new Subject<void>();

  clientId = '';
  loading = false;
  registration = emptyRegistration();
  uploading = false;
  showUploadForm = false;

  documents: CrmUnitDocument[] = [];
  branches: Array<{ id: string; branchName: string }> = [];

  lawCategories = LAW_CATEGORIES;
  uploadDocTypes = ['Registration', 'Licence', 'Renewal', 'Report', 'Certificate', 'Approval', 'Other'];
  legacyDocTypes = DOC_TYPES.filter(type => !this.uploadDocTypes.includes(type));


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
    lawCategory: string;
    documentType: string;
    remarks: string;
    periodFrom: string;
    periodTo: string;
  } = {
    scope: 'BRANCH',
    branchId: '',
    lawCategory: '',
    documentType: '',
    remarks: '',
    periodFrom: '',
    periodTo: '',
  };

  selectedFiles: File[] = [];

  constructor(
    private readonly protectedFiles: ProtectedFileService,
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

  clearFilters(): void {
    this.filters = { scope: '', month: '', lawCategory: '', documentType: '', branchId: '' };
    this.loadDocuments();
  }

  get hasRecordedMonth(): boolean { return this.documents.some(doc => !!doc.month); }

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
    return branch?.branchName || 'Branch name unavailable';
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFiles = Array.from(input.files || []);
  }

  canUpload(): boolean {
    const hasScopeTarget =
      this.form.scope === 'COMPANY' || !!this.form.branchId;
    return !!(
      hasScopeTarget &&
      this.form.lawCategory &&
      this.form.documentType &&
      this.selectedFiles.length > 0
    );
  }

  uploadDocument(): void {
    if (this.uploading || !this.canUpload()) return;
    if (!this.registration.noExpiry && this.form.periodFrom && this.form.periodTo && this.form.periodTo < this.form.periodFrom) {
      this.toast.error('Valid until must be on or after valid from.'); return;
    }

    const registrationError = registrationUploadError(this.registration, this.form.documentType, this.form.scope === 'BRANCH' ? this.form.branchId : '', this.form.periodTo, this.selectedFiles.length);
    if (registrationError) { this.toast.error(registrationError); return; }
    this.uploading = true;
    const formData = new FormData();
    appendRegistration(formData, this.registration, this.form.documentType);
    this.selectedFiles.forEach((file) => formData.append('file', file));
    formData.append('clientId', this.clientId);
    formData.append('scope', this.form.scope);
    if (this.form.scope === 'BRANCH') {
      formData.append('branchId', this.form.branchId);
    }
    formData.append('lawCategory', this.form.lawCategory);
    formData.append('documentType', this.form.documentType);
    if (this.form.remarks) formData.append('remarks', this.form.remarks);
    if (this.form.periodFrom) formData.append('periodFrom', this.form.periodFrom);
    if (this.form.periodTo && !this.registration.noExpiry) formData.append('periodTo', this.form.periodTo);

    this.api.uploadDocument(formData).pipe(
      finalize(() => {
        this.uploading = false;
        this.cdr.markForCheck();
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (res) => {
        const count = res?.count || this.selectedFiles.length;
        this.toast.success(`${count} document${count !== 1 ? 's' : ''} uploaded successfully`);
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

  viewDoc(doc: CrmUnitDocument): void {
    this.documentPreview = { url: this.api.downloadUrl(doc.id, 'crm'), name: doc.fileName };
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
      lawCategory: '',
      documentType: '',
      remarks: '',
    periodFrom: '',
    periodTo: '',
    };
    this.selectedFiles = [];
    this.showUploadForm = false;
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }
}

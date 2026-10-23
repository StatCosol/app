import { AuditFilePreviewComponent, AuditFilePreview } from '../../../shared/files/components/audit-file-preview.component';
import { UnitRegistrationFieldsComponent, emptyRegistration, appendRegistration, registrationUploadError } from '../../../shared/components/unit-registration-fields.component';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  CrmDocumentScope,
  CrmUnitDocument,
  CrmUnitDocumentsApi,
} from '../../../core/api/crm-unit-documents.api';
import { AuthService } from '../../../core/auth.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
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
  selector: 'app-branch-unit-documents',
  imports: [AuditFilePreviewComponent, UnitRegistrationFieldsComponent, IconComponent,
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Unit Documents"
        subtitle="Registrations, licences, renewals and reports shared with CRM and client users">
      </ui-page-header>
      <form (ngSubmit)="upload()" class="bg-white rounded-xl border p-4 mb-6">
        <h2 class="font-medium mb-3">Upload Unit Document</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          @if (branches.length > 1) {
          <label class="flex flex-col gap-1 text-sm">Branch
          <select aria-label="Branch" name="uploadBranch" [(ngModel)]="uploadBranchId" required>
            <option value="">Select branch</option>
            @for (b of branches; track b.id) { <option [value]="b.id">{{ b.branchName || b.name || 'Branch' }}</option> }
          </select></label>
          } @else if (branches.length === 1) {
            <div class="flex flex-col gap-1 text-sm"><span>Branch</span><strong>{{ branches[0].branchName || branches[0].name }}</strong></div>
          }
          <label class="flex flex-col gap-1 text-sm">Law category
          <select aria-label="Law" name="uploadLaw" [(ngModel)]="uploadLaw" required>
            @for (law of lawCategories; track law) { <option [value]="law">{{ law }}</option> }
          </select></label>
          <label class="flex flex-col gap-1 text-sm">Document type
          <select aria-label="Document type" name="uploadType" [(ngModel)]="uploadType" required>
            @for (type of uploadDocTypes; track type) { <option [value]="type">{{ type }}</option> }
          </select></label>
          <label class="flex flex-col gap-1 text-sm">Valid from <input type="date" name="validFrom" [(ngModel)]="validFrom"></label>
          <label class="flex flex-col gap-1 text-sm">Valid until <input type="date" name="validTo" [(ngModel)]="validTo" [disabled]="registration.noExpiry"></label>
          <label class="flex flex-col gap-1 text-sm">Document file
          <input #uploadInput type="file" aria-label="Document file" (change)="selectFile($event)"></label>
        </div>
        <app-unit-registration-fields portal="branch" [clientId]="clientId" [branchId]="uploadBranchId" [type]="uploadType" (detailsChange)="registration = $event" />
        <textarea class="w-full border rounded mt-3 p-2" name="remarks" [(ngModel)]="uploadRemarks" placeholder="Remarks (optional)"></textarea>
        <button type="submit" class="border rounded px-3 py-2 mt-2" [disabled]="uploading">{{ uploading ? 'Uploading…' : 'Upload' }}</button>
      </form>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div class="flex flex-wrap items-end gap-3 aligned-filter-controls">

          <label class="text-sm">Document type
            <select id="bud-doctype" name="documentType" [(ngModel)]="filters.documentType" (ngModelChange)="loadDocuments()" class="form-select rounded-lg border-gray-300 text-sm">
              <option value="">All types</option>
              @for (t of uploadDocTypes; track t) { <option [value]="t">{{ t }}</option> }
              <optgroup label="Older document types">
                @for (t of legacyDocTypes; track t) { <option [value]="t">{{ t }}</option> }
              </optgroup>
            </select>
          </label>
          <label class="text-sm">Law
            <select id="bud-law" name="lawCategory" [(ngModel)]="filters.lawCategory" (ngModelChange)="loadDocuments()" class="form-select rounded-lg border-gray-300 text-sm">
              <option value="">All laws</option>
              @for (law of lawCategories; track law) { <option [value]="law">{{ law }}</option> }
            </select>
          </label>
          @if (filters.scope || filters.month || filters.lawCategory || filters.documentType) {
            <button type="button" class="border rounded px-3 py-2 text-sm" (click)="clearFilters()">Clear filters</button>
          }

        </div>
        <details class="mt-3">
          <summary class="cursor-pointer text-sm">More filters{{ filters.scope || filters.month ? ' (active)' : '' }}</summary>
          <div class="flex flex-wrap gap-3 mt-3">
            <label class="text-sm">Shared with
              <select id="bud-scope" name="scope" [(ngModel)]="filters.scope" (ngModelChange)="loadDocuments()" class="form-select rounded-lg border-gray-300 text-sm">
                <option value="">Company and branch</option><option value="COMPANY">Whole company</option><option value="BRANCH">Specific branch</option>
              </select>
            </label>
            <label class="text-sm">Period on older uploads
              <input type="month" id="bud-month" name="month" [(ngModel)]="filters.month" (ngModelChange)="loadDocuments()" class="form-input rounded-lg border-gray-300 text-sm">
            </label>
          </div>
        </details>
      </div>

      @if (!loading && errorMessage) { <div role="alert">{{ errorMessage }} <button type="button" (click)="loadDocuments()">Retry</button></div> }
      @if (loading) {
<ui-loading-spinner text="Loading documents..."></ui-loading-spinner>
}

      @if (!loading && !errorMessage && documents.length === 0) {
<ui-empty-state

        icon="document"
        title="No Documents Found"
        description="No unit documents match the selected filters.">
      </ui-empty-state>
}

      @if (!loading && documents.length > 0) {
<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Visible To</th>
                @if (hasRecordedMonth) { <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th> }
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Law</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remarks</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              @for (doc of documents; track doc) {
<tr class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-900 max-w-[220px] truncate" [title]="doc.fileName">
                  {{ doc.fileName }}
                </td>
                <td class="px-4 py-3 text-sm">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    [ngClass]="doc.scope === 'COMPANY' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'">
                    {{ doc.scope === 'COMPANY' ? 'Company' : 'Branch' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ doc.scope === 'COMPANY' ? 'All branches' : 'This branch' }}</td>
                @if (hasRecordedMonth) { <td class="px-4 py-3 text-sm text-gray-600">{{ doc.month || '—' }}</td> }
                <td class="px-4 py-3 text-sm">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-800">
                    {{ doc.lawCategory }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ doc.documentType }}
    @if (doc.registration) { <div data-testid="registration-status" class="text-xs font-medium mt-1">{{ doc.registration.type }}: {{ doc.registration.status.replace('_', ' ') }}<br>Current expiry: {{ doc.registration.expiryDate || 'No expiry' }}</div> }
    @if (doc.periodFrom || doc.periodTo) { <div class="text-xs text-gray-500">Valid: {{ doc.periodFrom || '—' }} – {{ doc.periodTo || '—' }}</div> }
  </td>
                <td class="px-4 py-3 text-sm text-gray-500 max-w-[180px] truncate" [title]="doc.remarks || ''">
                  {{ doc.remarks || '—' }}
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ doc.createdAt | date:'short' }}</td>
                <td class="px-4 py-3 text-sm">
                  <div class="flex gap-3 justify-end">
                    <button (click)="view(doc)" class="compact-action text-emerald-600 hover:text-emerald-800 font-medium text-sm" title="View" aria-label="View" data-action-label="View" data-action-icon="eye"><ui-icon name="eye" [size]="20" /></button>
                    <button (click)="download(doc)" class="compact-action text-brand-600 hover:text-brand-800 font-medium text-sm" title="Download" aria-label="Download" data-action-label="Download" data-action-icon="download"><ui-icon name="download" [size]="20" /></button>
                  </div>
                </td>
              </tr>
}
            </tbody>
          </table>
        </div>
        <div class="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
          {{ documents.length }} document{{ documents.length !== 1 ? 's' : '' }}
        </div>
      </div>
}
    </main>
    @if (documentPreview) { <app-audit-file-preview [request]="documentPreview" (closed)="documentPreview = null" /> }
  `,
})
export class BranchUnitDocumentsComponent implements OnInit, OnDestroy {
  documentPreview: AuditFilePreview | null = null;
  private readonly destroy$ = new Subject<void>();

  private listRequest?: Subscription;
  errorMessage = '';
  loading = false;
  documents: CrmUnitDocument[] = [];

  lawCategories = LAW_CATEGORIES;
  uploadDocTypes = ['Registration', 'Licence', 'Renewal', 'Report', 'Certificate', 'Approval', 'Other'];
  legacyDocTypes = DOC_TYPES.filter(type => !this.uploadDocTypes.includes(type));


  filters: {
    scope: ScopeFilter;
    month: string;
    lawCategory: string;
    documentType: string;
  } = {
    scope: '',
    month: '',
    lawCategory: '',
    documentType: '',
  };

  registration = emptyRegistration();
  uploading = false;
  branches: any[] = [];
  uploadBranchId = '';
  uploadLaw = 'OTHER';
  uploadType = 'Registration';
  validFrom = '';
  validTo = '';
  uploadRemarks = '';
  selectedFile: File | null = null;
  fileInput: HTMLInputElement | null = null;

  get clientId(): string { return this.auth.getUser()?.clientId || ''; }

  selectFile(event: Event) {
    this.fileInput = event.target as HTMLInputElement;
    this.selectedFile = this.fileInput.files?.[0] || null;
  }

  upload() {
    if (this.uploading) return;
    const clientId = this.auth.getUser()?.clientId;
    if (!clientId || !this.uploadBranchId || !this.selectedFile) {
      this.toast.error('Select a branch and a document file.'); return;
    }
    if (!this.registration.noExpiry && this.validFrom && this.validTo && this.validTo < this.validFrom) {
      this.toast.error('Valid until must be on or after valid from.'); return;
    }
    const registrationError = registrationUploadError(this.registration, this.uploadType, this.uploadBranchId, this.validTo, 1);
    if (registrationError) { this.toast.error(registrationError); return; }
    const fd = new FormData();
    appendRegistration(fd, this.registration, this.uploadType);
    fd.append('file', this.selectedFile);
    fd.append('clientId', clientId);
    fd.append('branchId', this.uploadBranchId);
    fd.append('scope', 'BRANCH');
    fd.append('lawCategory', this.uploadLaw);
    fd.append('documentType', this.uploadType);
    if (this.validFrom) fd.append('periodFrom', this.validFrom);
    if (this.validTo && !this.registration.noExpiry) fd.append('periodTo', this.validTo);
    if (this.uploadRemarks.trim()) fd.append('remarks', this.uploadRemarks.trim());
    this.uploading = true;
    this.api.uploadForBranch(fd).pipe(takeUntil(this.destroy$), finalize(() => { this.uploading = false; this.cdr.markForCheck(); })).subscribe({
      next: () => {
        this.toast.success('Unit document uploaded.');
        this.selectedFile = null;
        if (this.fileInput) this.fileInput.value = '';
        this.uploadRemarks = '';
        this.filters = { scope: '', month: '', lawCategory: '', documentType: '' };
        this.loadDocuments();
      },
      error: err => this.toast.error(err?.error?.message || 'Unit document upload failed.'),
    });
  }

  constructor(
    private readonly auth: AuthService,
    private readonly branchApi: ClientBranchesService,
    private readonly protectedFiles: ProtectedFileService,
    private readonly api: CrmUnitDocumentsApi,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.uploadBranchId = this.auth.getBranchIds()[0] || '';
    this.branchApi.list().pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => { this.branches = rows.filter(b => this.auth.getBranchIds().includes(b.id)); this.cdr.markForCheck(); },
      error: () => this.toast.error('Unable to load branch names.'),
    });
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    this.listRequest?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  clearFilters(): void {
    this.filters = { scope: '', month: '', lawCategory: '', documentType: '' };
    this.loadDocuments();
  }

  get hasRecordedMonth(): boolean { return this.documents.some(doc => !!doc.month); }

  loadDocuments(): void {
    this.listRequest?.unsubscribe(); this.errorMessage = '';
    this.loading = true;
    this.listRequest = this.api.listForBranch({
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
      error: () => { this.documents = []; this.errorMessage = 'Unable to load documents. Please retry.'; this.toast.error(this.errorMessage); },
    });
  }

  download(doc: CrmUnitDocument): void {
    this.protectedFiles.download(this.api.downloadUrl(doc.id, 'branch'), doc.fileName)
      .pipe(takeUntil(this.destroy$)).subscribe({error: () => this.toast.error('Download failed')});
  }

  view(doc: CrmUnitDocument): void {
    this.documentPreview = { url: this.api.downloadUrl(doc.id, 'branch'), name: doc.fileName };
  }
}

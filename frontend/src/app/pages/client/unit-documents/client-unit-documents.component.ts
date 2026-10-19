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
  selector: 'app-client-unit-documents',
  imports: [IconComponent,
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
        subtitle="View unit documents uploaded by branch and CRM users">
      </ui-page-header>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div class="flex flex-wrap items-end gap-3">
          <button type="button" class="border rounded px-3 py-2 text-sm" (click)="loadDocuments()">Refresh</button>
          @if (branches.length > 1) {
          <label class="text-sm">Unit
            <select id="cud-branch" name="branchId" [(ngModel)]="filters.branchId" (ngModelChange)="loadDocuments()" [disabled]="filters.scope === 'COMPANY'" class="form-select rounded-lg border-gray-300 text-sm">
              <option value="">All units</option>
              @for (b of branches; track b.id) { <option [value]="b.id">{{ b.branchName }}</option> }
            </select>
          </label>
          }
          <label class="text-sm">Document type
            <select id="cud-doctype" name="documentType" [(ngModel)]="filters.documentType" (ngModelChange)="loadDocuments()" class="form-select rounded-lg border-gray-300 text-sm">
              <option value="">All types</option>
              @for (t of uploadDocTypes; track t) { <option [value]="t">{{ t }}</option> }
              <optgroup label="Older document types">
                @for (t of legacyDocTypes; track t) { <option [value]="t">{{ t }}</option> }
              </optgroup>
            </select>
          </label>
          <label class="text-sm">Law
            <select id="cud-law" name="lawCategory" [(ngModel)]="filters.lawCategory" (ngModelChange)="loadDocuments()" class="form-select rounded-lg border-gray-300 text-sm">
              <option value="">All laws</option>
              @for (law of lawCategories; track law) { <option [value]="law">{{ law }}</option> }
            </select>
          </label>
          @if (filters.scope || filters.month || filters.lawCategory || filters.documentType || filters.branchId) {
            <button type="button" class="border rounded px-3 py-2 text-sm" (click)="clearFilters()">Clear filters</button>
          }

        </div>
        <details class="mt-3">
          <summary class="cursor-pointer text-sm">More filters{{ filters.scope || filters.month ? ' (active)' : '' }}</summary>
          <div class="flex flex-wrap gap-3 mt-3">
            <label class="text-sm">Shared with
              <select id="cud-scope" name="scope" [(ngModel)]="filters.scope" (ngModelChange)="onScopeChange()" class="form-select rounded-lg border-gray-300 text-sm">
                <option value="">Company and branch</option><option value="COMPANY">Whole company</option><option value="BRANCH">Specific branch</option>
              </select>
            </label>
            <label class="text-sm">Period on older uploads
              <input type="month" id="cud-month" name="month" [(ngModel)]="filters.month" (ngModelChange)="loadDocuments()" class="form-input rounded-lg border-gray-300 text-sm">
            </label>
          </div>
        </details>
      </div>

      @if (loading) {
<ui-loading-spinner text="Loading documents..."></ui-loading-spinner>
}

      @if (!loading && loadError) {
        <div role="alert" class="border border-red-200 rounded p-4 text-red-700">{{ loadError }}
          <button type="button" class="underline ml-2" (click)="loadDocuments()">Retry</button>
        </div>
      }
      @if (!loading && !loadError && documents.length === 0) {
<ui-empty-state

        icon="document"
        title="No Documents Found"
        description="No unit documents match the selected filters.">
      </ui-empty-state>
}

      @if (!loading && !loadError && documents.length > 0) {
<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                @if (hasRecordedMonth) { <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th> }
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Law</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
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
                <td class="px-4 py-3 text-sm text-gray-600">{{ getBranchName(doc.branchId) }}</td>
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
                <td class="px-4 py-3 text-sm text-gray-500">{{ doc.createdAt | date:'short' }}</td>
                <td class="px-4 py-3 text-sm">
                  <button (click)="view(doc)" class="compact-action text-emerald-600 hover:text-emerald-800 font-medium text-sm mr-3" title="View" aria-label="View" data-action-label="View" data-action-icon="eye"><ui-icon name="eye" [size]="20" /></button>
                  <button (click)="download(doc)" class="compact-action text-brand-600 hover:text-brand-800 font-medium text-sm" title="Download" aria-label="Download" data-action-label="Download" data-action-icon="download"><ui-icon name="download" [size]="20" /></button>
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
  `,
})
export class ClientUnitDocumentsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  private documentRequest?: Subscription;
  loading = false;
  loadError = '';
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

  constructor(
    private readonly protectedFiles: ProtectedFileService,
    private readonly api: CrmUnitDocumentsApi,
    private readonly branchService: ClientBranchesService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadBranches();
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    this.documentRequest?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBranches(): void {
    this.branchService.list()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows: any) => {
          const data = Array.isArray(rows) ? rows : [];
          this.branches = data.map((row: any) => ({
            id: row.id,
            branchName: row.branchName || row.branch_name || row.name || 'Branch',
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
    this.documentRequest?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    this.documents = [];
    this.documentRequest = this.api.listForClient({
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
      error: () => { this.loadError = 'Unable to load unit documents. Please retry.'; },
    });
  }

  onScopeChange(): void {
    if (this.filters.scope === 'COMPANY') {
      this.filters.branchId = '';
    }
    this.loadDocuments();
  }

  getBranchName(branchId: string | null): string {
    if (!branchId) return 'Company';
    const branch = this.branches.find((item) => item.id === branchId);
    return branch?.branchName || '—';
  }

  download(doc: CrmUnitDocument): void {
    this.api.downloadClient(doc.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.fileName;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Download failed'),
    });
  }

  view(doc: CrmUnitDocument): void {
    this.protectedFiles.open(this.api.downloadUrl(doc.id, 'client'), doc.fileName)
      .pipe(takeUntil(this.destroy$)).subscribe({ error: () => this.toast.error('Unable to view document.') });
  }
}

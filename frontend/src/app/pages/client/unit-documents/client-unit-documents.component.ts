import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
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
  selector: 'app-client-unit-documents',
  imports: [
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
        subtitle="View CRM documents shared at company or branch scope">
      </ui-page-header>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select
            id="cud-scope"
            name="scope"
            [(ngModel)]="filters.scope"
            (ngModelChange)="onScopeChange()"
            class="form-select rounded-lg border-gray-300 text-sm">
            <option value="">All Scopes</option>
            <option value="COMPANY">Company</option>
            <option value="BRANCH">Branch</option>
          </select>

          <select
            id="cud-branch"
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
            id="cud-month"
            name="month"
            [(ngModel)]="filters.month"
            (ngModelChange)="loadDocuments()"
            class="form-input rounded-lg border-gray-300 text-sm"
            placeholder="Month">

          <select
            id="cud-law"
            name="lawCategory"
            [(ngModel)]="filters.lawCategory"
            (ngModelChange)="loadDocuments()"
            class="form-select rounded-lg border-gray-300 text-sm">
            <option value="">All Laws</option>
            <option *ngFor="let c of lawCategories" [value]="c">{{ c }}</option>
          </select>

          <select
            id="cud-doctype"
            name="documentType"
            [(ngModel)]="filters.documentType"
            (ngModelChange)="loadDocuments()"
            class="form-select rounded-lg border-gray-300 text-sm">
            <option value="">All Types</option>
            <option *ngFor="let t of docTypes" [value]="t">{{ t }}</option>
          </select>
        </div>
      </div>

      <ui-loading-spinner *ngIf="loading" text="Loading documents..."></ui-loading-spinner>

      <ui-empty-state
        *ngIf="!loading && documents.length === 0"
        icon="document"
        title="No Documents Found"
        message="No CRM-uploaded documents match the selected filters.">
      </ui-empty-state>

      <div *ngIf="!loading && documents.length > 0" class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Law</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr *ngFor="let doc of documents" class="hover:bg-gray-50">
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
                <td class="px-4 py-3 text-sm text-gray-600">{{ doc.month || '—' }}</td>
                <td class="px-4 py-3 text-sm">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {{ doc.lawCategory }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ doc.documentType }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ doc.createdAt | date:'short' }}</td>
                <td class="px-4 py-3 text-sm">
                  <button (click)="download(doc)" class="text-indigo-600 hover:text-indigo-800 font-medium text-sm">
                    Download
                  </button>
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
export class ClientUnitDocumentsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = false;
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

  constructor(
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

  loadDocuments(): void {
    this.loading = true;
    this.api.listForClient({
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
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent } from '../../../shared/ui';
import { CrmUnitDocumentsApi, CrmUnitDocument } from '../../../core/api/crm-unit-documents.api';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { ToastService } from '../../../shared/toast/toast.service';

const LAW_CATEGORIES = ['PF', 'ESI', 'PT', 'FACTORY', 'CLRA', 'LWF', 'OTHER'];
const DOC_TYPES = ['Return', 'Receipt', 'Challan', 'Acknowledgement', 'Other'];

@Component({
  standalone: true,
  selector: 'app-client-unit-documents',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="Unit Documents" subtitle="View compliance documents uploaded by your CRM representative"></ui-page-header>

      <!-- Filters -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select [(ngModel)]="filters.branchId" (ngModelChange)="loadDocuments()" class="form-select rounded-lg border-gray-300 text-sm">
            <option value="">All Units</option>
            <option *ngFor="let b of branches" [value]="b.id">{{ b.branchName || b.branch_name }}</option>
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
        </div>
      </div>

      <ui-loading-spinner *ngIf="loading" text="Loading documents..."></ui-loading-spinner>

      <ui-empty-state
        *ngIf="!loading && documents.length === 0"
        icon="document"
        title="No Documents Found"
        message="No CRM-uploaded documents match the selected filters.">
      </ui-empty-state>

      <!-- Documents Table -->
      <div *ngIf="!loading && documents.length > 0"
        class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Law</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr *ngFor="let doc of documents" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-900 max-w-[200px] truncate" [title]="doc.fileName">
                  {{ doc.fileName }}
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ getBranchName(doc.branchId) }}</td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ doc.month || '—' }}</td>
                <td class="px-4 py-3 text-sm">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {{ doc.lawCategory }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ doc.documentType }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">
                  <span *ngIf="doc.periodFrom">{{ doc.periodFrom | date:'mediumDate' }}</span>
                  <span *ngIf="doc.periodFrom && doc.periodTo"> – </span>
                  <span *ngIf="doc.periodTo">{{ doc.periodTo | date:'mediumDate' }}</span>
                  <span *ngIf="!doc.periodFrom && !doc.periodTo">—</span>
                </td>
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

      <!-- Remarks panel -->
      <div *ngIf="selectedDoc" class="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h4 class="text-sm font-semibold text-amber-800 mb-1">Remarks for {{ selectedDoc.fileName }}</h4>
        <p class="text-sm text-amber-700">{{ selectedDoc.remarks || 'No remarks' }}</p>
        <button (click)="selectedDoc = null" class="mt-2 text-xs text-amber-600 underline">Close</button>
      </div>
    </main>
  `,
})
export class ClientUnitDocumentsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  documents: CrmUnitDocument[] = [];
  branches: any[] = [];
  selectedDoc: CrmUnitDocument | null = null;

  lawCategories = LAW_CATEGORIES;
  docTypes = DOC_TYPES;

  filters = {
    branchId: '',
    month: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })(),
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
    this.branchService.list().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data: any) => {
        this.branches = Array.isArray(data) ? data : [];
        this.cdr.markForCheck();
      },
    });
  }

  loadDocuments(): void {
    this.loading = true;
    const f: any = {};
    if (this.filters.branchId) f.branchId = this.filters.branchId;
    if (this.filters.month) f.month = this.filters.month;
    if (this.filters.lawCategory) f.lawCategory = this.filters.lawCategory;
    if (this.filters.documentType) f.documentType = this.filters.documentType;

    this.api.listForClient(f)
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }), takeUntil(this.destroy$))
      .subscribe({
        next: (docs) => this.documents = docs,
        error: () => this.toast.error('Failed to load documents'),
      });
  }

  getBranchName(branchId: string): string {
    const b = this.branches.find((x: any) => x.id === branchId);
    return b ? (b.branchName || b.branch_name || branchId) : branchId;
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

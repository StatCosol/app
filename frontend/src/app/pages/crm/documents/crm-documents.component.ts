import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { CrmContractorDocumentsApi } from '../../../core/api/crm-contractor-documents.api';
import {
  PageHeaderComponent,
  Breadcrumb,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  StatusBadgeComponent,
  FormSelectComponent,
} from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-crm-documents',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
    StatusBadgeComponent,
    FormSelectComponent,
  ],
  template: `
    <ui-page-header
      title="Contractor Documents"
      subtitle="Review and manage contractor document uploads for this client"
      [breadcrumbs]="breadcrumbs">
    </ui-page-header>

    <!-- KPI Cards -->
    <div *ngIf="kpis" class="kpi-strip">
      <div class="kpi-card">
        <span class="kpi-value">{{ kpis.total || 0 }}</span>
        <span class="kpi-label">Total Documents</span>
      </div>
      <div class="kpi-card kpi-pending">
        <span class="kpi-value">{{ kpis.pending || 0 }}</span>
        <span class="kpi-label">Pending Review</span>
      </div>
      <div class="kpi-card kpi-approved">
        <span class="kpi-value">{{ kpis.approved || 0 }}</span>
        <span class="kpi-label">Approved</span>
      </div>
      <div class="kpi-card kpi-rejected">
        <span class="kpi-value">{{ kpis.rejected || 0 }}</span>
        <span class="kpi-label">Rejected</span>
      </div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <div class="search-wrapper">
        <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input type="text" [(ngModel)]="searchTerm" (ngModelChange)="applyFilters()"
               placeholder="Search by contractor or file name..." class="search-input" />
      </div>
      <ui-form-select label="" [options]="statusOptions" [(ngModel)]="filterStatus"
                      (ngModelChange)="applyFilters()"></ui-form-select>
    </div>

    <ui-loading-spinner *ngIf="loading" text="Loading documents..."></ui-loading-spinner>

    <ui-empty-state
      *ngIf="!loading && filtered.length === 0"
      title="No documents found"
      [description]="searchTerm || filterStatus ? 'Try adjusting your filters.' : 'Contractor documents will appear here once uploaded.'"
      icon="document">
    </ui-empty-state>

    <!-- Documents Table -->
    <div *ngIf="!loading && filtered.length > 0" class="table-card">
      <table class="data-table">
        <thead>
          <tr>
            <th>Contractor</th>
            <th>Document</th>
            <th>Category</th>
            <th>Uploaded</th>
            <th>Status</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let doc of filtered">
            <td class="font-medium">{{ doc.contractorName || doc.contractor || '-' }}</td>
            <td>
              <div class="doc-name">{{ doc.name || doc.fileName || doc.title || '-' }}</div>
              <div *ngIf="doc.fileSize" class="text-xs text-gray-400">{{ formatSize(doc.fileSize) }}</div>
            </td>
            <td>{{ doc.category || doc.type || '-' }}</td>
            <td class="text-sm text-gray-500">{{ doc.createdAt || doc.uploadedAt | date:'mediumDate' }}</td>
            <td><ui-status-badge [status]="doc.status || 'PENDING'"></ui-status-badge></td>
            <td class="text-right">
              <div class="action-btns">
                <a *ngIf="doc.downloadUrl || doc.fileUrl"
                   [href]="doc.downloadUrl || doc.fileUrl" target="_blank"
                   class="btn-sm btn-outline">Download</a>
                <button *ngIf="(doc.status || 'PENDING') === 'PENDING'"
                        (click)="review(doc, 'APPROVED')" class="btn-sm btn-approve"
                        [disabled]="processing.has(doc.id)">Approve</button>
                <button *ngIf="(doc.status || 'PENDING') === 'PENDING'"
                        (click)="review(doc, 'REJECTED')" class="btn-sm btn-reject"
                        [disabled]="processing.has(doc.id)">Reject</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Review Modal -->
    <div *ngIf="reviewingDoc" class="modal-overlay" (click)="reviewingDoc = null">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <h3 class="modal-title">{{ reviewAction === 'REJECTED' ? 'Reject' : 'Approve' }} Document</h3>
        <p class="text-sm text-gray-600 mb-3">{{ reviewingDoc.name || reviewingDoc.fileName }}</p>
        <div *ngIf="reviewAction === 'REJECTED'" class="mb-3">
          <label class="text-sm font-medium text-gray-700">Reason for rejection</label>
          <textarea [(ngModel)]="reviewNotes" rows="3" class="field-input mt-1"
                    placeholder="Provide feedback..."></textarea>
        </div>
        <div class="modal-actions">
          <button (click)="reviewingDoc = null" class="btn-sm btn-outline">Cancel</button>
          <button (click)="confirmReview()" class="btn-sm"
                  [class.btn-approve]="reviewAction === 'APPROVED'"
                  [class.btn-reject]="reviewAction === 'REJECTED'"
                  [disabled]="reviewAction === 'REJECTED' && !reviewNotes.trim()">
            Confirm
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .kpi-card {
      background: white; border: 1px solid #e5e7eb; border-radius: 10px;
      padding: 14px 18px; text-align: center;
    }
    .kpi-value { display: block; font-size: 1.5rem; font-weight: 700; color: #111827; }
    .kpi-label { font-size: 12px; color: #6b7280; }
    .kpi-pending .kpi-value { color: #d97706; }
    .kpi-approved .kpi-value { color: #059669; }
    .kpi-rejected .kpi-value { color: #dc2626; }

    .filter-bar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
    .search-wrapper { position: relative; flex: 1; }
    .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: #9ca3af; }
    .search-input {
      width: 100%; padding: 8px 12px 8px 36px; border: 1px solid #d1d5db; border-radius: 8px;
      font-size: 14px; color: #111827; background: white;
    }
    .search-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }

    .table-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .data-table th {
      text-align: left; padding: 10px 14px; font-weight: 600; color: #6b7280;
      font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e5e7eb;
    }
    .data-table td { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; color: #111827; vertical-align: middle; }
    .data-table tbody tr:hover { background: #f9fafb; }
    .doc-name { font-weight: 500; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .action-btns { display: flex; gap: 6px; justify-content: flex-end; }
    .btn-sm {
      padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
      border: none; cursor: pointer; white-space: nowrap;
    }
    .btn-outline { background: white; border: 1px solid #d1d5db; color: #374151; }
    .btn-outline:hover { background: #f3f4f6; }
    .btn-approve { background: #059669; color: white; }
    .btn-approve:hover { opacity: 0.9; }
    .btn-approve:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-reject { background: #dc2626; color: white; }
    .btn-reject:hover { opacity: 0.9; }
    .btn-reject:disabled { opacity: 0.5; cursor: not-allowed; }

    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 50;
      display: flex; align-items: center; justify-content: center;
    }
    .modal-card { background: white; border-radius: 12px; padding: 24px; width: 420px; max-width: 90vw; }
    .modal-title { font-size: 1.1rem; font-weight: 700; color: #111827; margin-bottom: 8px; }
    .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
    .field-input {
      width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;
    }
    .field-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }

    @media (max-width: 640px) {
      .kpi-strip { grid-template-columns: repeat(2, 1fr); }
      .filter-bar { flex-direction: column; }
    }
  `],
})
export class CrmDocumentsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  documents: any[] = [];
  filtered: any[] = [];
  loading = true;
  kpis: any = null;

  searchTerm = '';
  filterStatus = '';
  statusOptions = [
    { label: 'All Statuses', value: '' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Approved', value: 'APPROVED' },
    { label: 'Rejected', value: 'REJECTED' },
  ];

  processing = new Set<string>();
  reviewingDoc: any = null;
  reviewAction = '';
  reviewNotes = '';

  breadcrumbs: Breadcrumb[] = [
    { label: 'Clients', route: '/crm/clients' },
    { label: 'Documents' },
  ];

  constructor(
    private api: CrmContractorDocumentsApi,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadKpis();
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadKpis(): void {
    this.api.kpis().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => { this.kpis = data; this.cdr.detectChanges(); },
      error: () => {},
    });
  }

  private loadDocuments(): void {
    this.loading = true;
    const clientId = this.route.snapshot.paramMap.get('clientId') || '';
    this.api.list({ clientId }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => {
        this.loading = false;
        this.documents = Array.isArray(data) ? data : (data as any)?.items || [];
        this.applyFilters();
      },
      error: () => { this.loading = false; this.documents = []; this.filtered = []; },
    });
  }

  applyFilters(): void {
    let result = [...this.documents];
    if (this.filterStatus) {
      result = result.filter(d => (d.status || 'PENDING') === this.filterStatus);
    }
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(d =>
        (d.contractorName || d.contractor || '').toLowerCase().includes(term) ||
        (d.name || d.fileName || d.title || '').toLowerCase().includes(term),
      );
    }
    this.filtered = result;
  }

  review(doc: any, action: string): void {
    this.reviewingDoc = doc;
    this.reviewAction = action;
    this.reviewNotes = '';
  }

  confirmReview(): void {
    if (!this.reviewingDoc) return;
    const id = this.reviewingDoc.id;
    this.processing.add(id);
    this.api.review(id, { status: this.reviewAction, reviewNotes: this.reviewNotes.trim() || undefined })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.processing.delete(id); this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.processing.delete(id);
          this.reviewingDoc = null;
          this.loadKpis();
          this.loadDocuments();
        },
        error: () => { this.processing.delete(id); alert('Review failed. Please try again.'); },
      });
  }

  formatSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
}

import {
  Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { AuthService } from '../../../core/auth.service';

interface DocumentItem {
  id: string;
  name: string;
  category: string;
  uploadedDate: string;
  status: 'Uploaded' | 'Pending' | 'Rejected';
  uploadedBy: string;
  fileType: string;
}

@Component({
  selector: 'app-branch-documents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Documents</h1>
          <p class="page-subtitle">Branch document repository — upload, track, and manage compliance documents</p>
        </div>
        <div class="flex items-center gap-3">
          <select [(ngModel)]="categoryFilter" (change)="applyFilter()" class="filter-select">
            <option value="all">All Categories</option>
            <option *ngFor="let cat of categories" [value]="cat">{{ cat }}</option>
          </select>
          <select [(ngModel)]="statusFilter" (change)="applyFilter()" class="filter-select">
            <option value="all">All Status</option>
            <option value="Uploaded">Uploaded</option>
            <option value="Pending">Pending</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      <!-- Summary -->
      <div class="summary-strip">
        <div class="summary-card border-l-4 border-emerald-500">
          <span class="summary-value text-emerald-600">{{ uploadedCount }}</span>
          <span class="summary-label">Uploaded</span>
        </div>
        <div class="summary-card border-l-4 border-amber-500">
          <span class="summary-value text-amber-600">{{ pendingCount }}</span>
          <span class="summary-label">Pending</span>
        </div>
        <div class="summary-card border-l-4 border-red-500">
          <span class="summary-value text-red-600">{{ rejectedCount }}</span>
          <span class="summary-label">Rejected</span>
        </div>
      </div>

      <!-- Document table -->
      <div class="table-card">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Category</th>
                <th>File Type</th>
                <th>Uploaded Date</th>
                <th>Uploaded By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let doc of filteredDocs; trackBy: trackById" class="data-row">
                <td class="font-medium text-slate-800 flex items-center gap-2">
                  <svg class="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                  </svg>
                  {{ doc.name }}
                </td>
                <td class="text-slate-600">{{ doc.category }}</td>
                <td class="text-slate-500 text-xs uppercase font-mono">{{ doc.fileType }}</td>
                <td class="text-slate-500 text-xs">{{ doc.uploadedDate }}</td>
                <td class="text-slate-600">{{ doc.uploadedBy }}</td>
                <td>
                  <span class="badge"
                    [class.bg-emerald-100]="doc.status === 'Uploaded'" [class.text-emerald-700]="doc.status === 'Uploaded'"
                    [class.bg-amber-100]="doc.status === 'Pending'" [class.text-amber-700]="doc.status === 'Pending'"
                    [class.bg-red-100]="doc.status === 'Rejected'" [class.text-red-700]="doc.status === 'Rejected'">
                    {{ doc.status }}
                  </span>
                </td>
              </tr>
              <tr *ngIf="filteredDocs.length === 0">
                <td colspan="6" class="text-center text-slate-400 py-12">No documents found</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
    .page-title { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
    .page-subtitle { font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
    .filter-select { padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.8125rem; background: white; cursor: pointer; }
    .summary-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
    @media (max-width: 640px) { .summary-strip { grid-template-columns: 1fr; } }
    .summary-card { background: white; border-radius: 0.75rem; padding: 1rem; text-align: center; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .summary-value { display: block; font-size: 1.5rem; font-weight: 800; }
    .summary-label { display: block; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.25rem; }
    .table-card { background: white; border-radius: 1rem; border: 1px solid #f1f5f9; box-shadow: 0 1px 4px rgba(0,0,0,0.04); overflow: hidden; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { text-align: left; padding: 0.75rem 1rem; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; background: #f8fafc; border-bottom: 2px solid #f1f5f9; }
    .data-table td { padding: 0.75rem 1rem; font-size: 0.8125rem; border-bottom: 1px solid #f8fafc; }
    .data-row:hover { background: #f8fafc; }
    .badge { display: inline-flex; padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; }
  `]
})
export class BranchDocumentsComponent implements OnInit {
  categoryFilter = 'all';
  statusFilter = 'all';
  categories: string[] = [];
  documents: DocumentItem[] = [];
  filteredDocs: DocumentItem[] = [];
  uploadedCount = 0;
  pendingCount = 0;
  rejectedCount = 0;
  loading = true;

  constructor(
    private cdr: ChangeDetectorRef,
    private branchSvc: ClientBranchesService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    const branchIds = this.auth.getBranchIds();
    if (!branchIds.length) { this.loading = false; this.cdr.markForCheck(); return; }
    const branchId = branchIds[0];

    this.branchSvc.listDocuments(branchId).subscribe({
      next: (rows) => {
        this.documents = (rows || []).map((r: any): DocumentItem => {
          let status: 'Uploaded' | 'Pending' | 'Rejected' = 'Pending';
          const s = (r.status || '').toUpperCase();
          if (s === 'REJECTED') status = 'Rejected';
          else if (s === 'UPLOADED' || s === 'APPROVED' || s === 'UNDER_REVIEW') status = 'Uploaded';

          const ext = (r.mimeType || r.mime_type || r.fileType || '').split('/').pop()?.toUpperCase() || r.fileName?.split('.').pop()?.toUpperCase() || '—';
          const fmt = (d: any) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

          return {
            id: r.id,
            name: r.fileName || r.file_name || r.docType || r.doc_type || '—',
            category: r.category || '—',
            uploadedDate: fmt(r.createdAt || r.created_at),
            status,
            uploadedBy: r.uploadedByName || r.uploaded_by || '—',
            fileType: ext,
          };
        });
        this.categories = [...new Set(this.documents.map(d => d.category))];
        this.computeCounts();
        this.applyFilter();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  applyFilter(): void {
    let result = [...this.documents];
    if (this.categoryFilter !== 'all') result = result.filter(d => d.category === this.categoryFilter);
    if (this.statusFilter !== 'all') result = result.filter(d => d.status === this.statusFilter);
    this.filteredDocs = result;
    this.cdr.markForCheck();
  }

  trackById(_: number, item: DocumentItem): string { return item.id; }

  private computeCounts(): void {
    this.uploadedCount = this.documents.filter(d => d.status === 'Uploaded').length;
    this.pendingCount = this.documents.filter(d => d.status === 'Pending').length;
    this.rejectedCount = this.documents.filter(d => d.status === 'Rejected').length;
  }

}

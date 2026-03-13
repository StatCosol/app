import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  BranchComplianceDocService,
  ComplianceDoc,
} from '../../../core/branch-compliance-doc.service';
import {
  StatusBadgeComponent,
  PageHeaderComponent,
  ModalComponent,
  DataTableComponent,
  TableCellDirective,
  TableColumn,
} from '../../../shared/ui';

@Component({
  selector: 'app-crm-branch-docs-review',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent, PageHeaderComponent, ModalComponent, DataTableComponent, TableCellDirective],
  templateUrl: './crm-branch-docs-review.component.html',
  styles: [`
    .page-container { max-width: 1400px; margin: 0 auto; padding: 0 1rem; }
    .filter-bar {
      display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
      padding: 1rem 1.25rem; background: white; border-radius: 0.75rem;
      border: 1px solid #e5e7eb; margin-bottom: 1.25rem;
    }
    .filter-select {
      padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid #d1d5db;
      font-size: 0.8125rem; background: white; color: #1e293b; min-width: 140px;
    }
    .filter-select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .kpi-card {
      background: white; border-radius: 0.75rem; padding: 1rem 1.25rem;
      border: 1px solid #e5e7eb; text-align: center;
    }
    .kpi-value { font-size: 1.5rem; font-weight: 700; color: #1e293b; }
    .kpi-label { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }
    .doc-table { width: 100%; border-collapse: collapse; }
    .doc-table th {
      text-align: left; padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: 600;
      color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;
      background: #f8fafc; border-bottom: 1px solid #e5e7eb;
    }
    .doc-table td {
      padding: 0.75rem 1rem; font-size: 0.8125rem; color: #1e293b;
      border-bottom: 1px solid #f1f5f9; vertical-align: top;
    }
    .doc-table tr:hover { background: #f8fafc; }
    .btn-approve {
      display: inline-flex; align-items: center; gap: 0.375rem;
      padding: 0.375rem 0.75rem; font-size: 0.75rem; font-weight: 600;
      color: white; background: #22c55e; border: none; border-radius: 0.5rem;
      cursor: pointer; transition: opacity 0.2s;
    }
    .btn-approve:hover { opacity: 0.9; }
    .btn-reject {
      display: inline-flex; align-items: center; gap: 0.375rem;
      padding: 0.375rem 0.75rem; font-size: 0.75rem; font-weight: 600;
      color: white; background: #f97316; border: none; border-radius: 0.5rem;
      cursor: pointer; transition: opacity 0.2s;
    }
    .btn-reject:hover { opacity: 0.9; }
    .btn-outline {
      display: inline-flex; align-items: center; gap: 0.375rem;
      padding: 0.375rem 0.75rem; font-size: 0.75rem; font-weight: 500;
      color: #3b82f6; border: 1px solid #bfdbfe; border-radius: 0.5rem;
      background: white; cursor: pointer; transition: all 0.2s;
    }
    .btn-outline:hover { background: #eff6ff; }
    .skeleton { background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%);
      background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 0.5rem; }
    .skeleton--kpi { height: 80px; }
    .skeleton--row { height: 48px; margin-bottom: 0.5rem; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .tab-group {
      display: flex; gap: 0.25rem; background: #f1f5f9; border-radius: 0.5rem; padding: 0.25rem;
    }
    .tab-btn {
      padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 500;
      cursor: pointer; transition: all 0.2s; border: none; background: transparent; color: #64748b;
    }
    .tab-btn.active { background: white; color: #0a2656; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-weight: 600; }
    .remarks-textarea {
      width: 100%; min-height: 80px; padding: 0.75rem; border: 1px solid #d1d5db;
      border-radius: 0.5rem; font-size: 0.8125rem; resize: vertical;
    }
    .remarks-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
  `],
})
export class CrmBranchDocsReviewComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  reviewing = false;
  documents: ComplianceDoc[] = [];
  kpis: any = null;

  readonly docColumns: TableColumn[] = [
    { key: 'branch', header: 'Branch', width: '20%' },
    { key: 'document', header: 'Document', width: '18%' },
    { key: 'period', header: 'Period', width: '10%' },
    { key: 'frequency', header: 'Frequency', width: '10%' },
    { key: 'status', header: 'Status', width: '12%' },
    { key: 'version', header: 'Version', width: '8%' },
    { key: 'actions', header: 'Actions', width: '22%' },
  ];

  // Filters
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() || 12;
  selectedFrequency = '';
  selectedStatus = '';

  // Review modal
  showReviewModal = false;
  reviewDoc: ComplianceDoc | null = null;
  reviewAction: 'APPROVED' | 'REUPLOAD_REQUIRED' = 'APPROVED';
  reviewRemarks = '';

  months = [
    { value: 0, label: 'All Months' },
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' }, { value: 4, label: 'April' },
    { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];

  statuses = [
    { value: '', label: 'All Statuses' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'RESUBMITTED', label: 'Resubmitted' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REUPLOAD_REQUIRED', label: 'Reupload Required' },
  ];

  frequencies = [
    { value: '', label: 'All Frequencies' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'HALF_YEARLY', label: 'Half-Yearly' },
    { value: 'YEARLY', label: 'Yearly' },
  ];

  years: number[] = [];

  constructor(private complianceDoc: BranchComplianceDocService, private auth: AuthService, private toast: ToastService, private cdr: ChangeDetectorRef) {
    const currentYear = new Date().getFullYear();
    this.years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;

    this.complianceDoc.listCrmDocs({
      year: this.selectedYear,
      month: this.selectedMonth || undefined,
      frequency: this.selectedFrequency || undefined,
      status: this.selectedStatus || undefined,
    })
    .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
    .subscribe({
      next: (res) => { this.documents = res.data || []; },
      error: () => { this.documents = []; },
    });

    // KPIs
    this.complianceDoc.getCrmKpis({
      year: this.selectedYear,
      month: this.selectedMonth || undefined,
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (k) => { this.kpis = k; },
      error: () => { this.kpis = null; },
    });
  }

  canReview(doc: ComplianceDoc): boolean {
    return doc.status === 'SUBMITTED' || doc.status === 'RESUBMITTED';
  }

  openReviewModal(doc: ComplianceDoc, action: 'APPROVED' | 'REUPLOAD_REQUIRED'): void {
    this.reviewDoc = doc;
    this.reviewAction = action;
    this.reviewRemarks = '';
    this.showReviewModal = true;
  }

  closeReviewModal(): void {
    this.showReviewModal = false;
    this.reviewDoc = null;
    this.reviewRemarks = '';
  }

  submitReview(): void {
    if (!this.reviewDoc) return;
    if (this.reviewAction === 'REUPLOAD_REQUIRED' && !this.reviewRemarks.trim()) {
      this.toast.warning('Please provide remarks for reupload request.');
      return;
    }

    this.reviewing = true;
    this.complianceDoc.reviewDocument(
      this.reviewDoc.id,
      this.reviewAction,
      this.reviewRemarks || undefined,
    )
    .pipe(takeUntil(this.destroy$), finalize(() => { this.reviewing = false; this.cdr.detectChanges(); }))
    .subscribe({
      next: () => {
        this.closeReviewModal();
        this.load();
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'Review failed.');
      },
    });
  }

  viewDoc(doc: ComplianceDoc): void {
    if (doc.uploadedFileUrl) window.open(this.auth.authenticateUrl(doc.uploadedFileUrl), '_blank');
  }

  getPeriodLabel(doc: ComplianceDoc): string {
    if (doc.frequency === 'MONTHLY' && doc.periodMonth) {
      const m = this.months.find(mm => mm.value === doc.periodMonth);
      return `${m?.label || doc.periodMonth} ${doc.periodYear}`;
    }
    if (doc.frequency === 'QUARTERLY' && doc.periodQuarter) {
      return `Q${doc.periodQuarter} ${doc.periodYear}`;
    }
    if (doc.frequency === 'HALF_YEARLY' && doc.periodHalf) {
      return `H${doc.periodHalf} ${doc.periodYear}`;
    }
    return String(doc.periodYear);
  }

  get pendingCount(): number {
    return this.documents.filter(d => d.status === 'SUBMITTED' || d.status === 'RESUBMITTED').length;
  }
}

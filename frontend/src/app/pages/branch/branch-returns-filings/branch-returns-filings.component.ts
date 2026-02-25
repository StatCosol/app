import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';
import {
  BranchComplianceDocService,
  ChecklistItem,
  BranchComplianceKpis,
} from '../../../core/branch-compliance-doc.service';
import {
  StatusBadgeComponent,
  PageHeaderComponent,
  ModalComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-branch-returns-filings',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent, PageHeaderComponent, ModalComponent],
  templateUrl: './branch-returns-filings.component.html',
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; padding: 0 1rem; }
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
    .doc-table { width: 100%; border-collapse: collapse; }
    .doc-table th {
      text-align: left; padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: 600;
      color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;
      background: #f8fafc; border-bottom: 1px solid #e5e7eb;
    }
    .doc-table td {
      padding: 0.75rem 1rem; font-size: 0.8125rem; color: #1e293b;
      border-bottom: 1px solid #f1f5f9;
    }
    .doc-table tr:hover { background: #f8fafc; }
    .btn-primary {
      display: inline-flex; align-items: center; gap: 0.375rem;
      padding: 0.5rem 1rem; font-size: 0.8125rem; font-weight: 600;
      color: white; border-radius: 0.5rem; cursor: pointer; border: none;
      background: linear-gradient(135deg, #0a2656, #1a3a6e); transition: opacity 0.2s;
    }
    .btn-primary:hover { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-outline {
      display: inline-flex; align-items: center; gap: 0.375rem;
      padding: 0.375rem 0.75rem; font-size: 0.75rem; font-weight: 500;
      color: #3b82f6; border: 1px solid #bfdbfe; border-radius: 0.5rem;
      background: white; cursor: pointer; transition: all 0.2s;
    }
    .btn-outline:hover { background: #eff6ff; }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 0.375rem; }
    .dot-grey { background: #9ca3af; }
    .dot-blue { background: #3b82f6; }
    .dot-green { background: #22c55e; }
    .dot-orange { background: #f97316; }
    .dot-purple { background: #8b5cf6; }
    .dot-red { background: #ef4444; }
    .remarks-text { font-size: 0.75rem; color: #dc2626; font-style: italic; margin-top: 0.25rem; }
    .upload-zone {
      border: 2px dashed #d1d5db; border-radius: 0.75rem; padding: 2rem;
      text-align: center; cursor: pointer; transition: border-color 0.2s;
    }
    .upload-zone:hover { border-color: #3b82f6; }
    .file-input { display: none; }
    .skeleton { background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%);
      background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 0.5rem; }
    .skeleton--row { height: 48px; margin-bottom: 0.5rem; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .frequency-tabs {
      display: flex; gap: 0.25rem; background: #f1f5f9; border-radius: 0.5rem; padding: 0.25rem;
    }
    .freq-tab {
      padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 500;
      cursor: pointer; transition: all 0.2s; border: none; background: transparent; color: #64748b;
    }
    .freq-tab.active { background: white; color: #0a2656; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-weight: 600; }
  `],
})
export class BranchReturnsFilingsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private load$ = new Subject<void>();

  loading = false;
  uploading = false;
  checklist: ChecklistItem[] = [];
  branchId = '';

  selectedFrequency = 'YEARLY';
  selectedYear = new Date().getFullYear();
  selectedQuarter = 1;
  selectedHalf = 1;

  // Upload modal
  showUploadModal = false;
  uploadTarget: ChecklistItem | null = null;
  selectedFile: File | null = null;
  uploadRemarks = '';

  years: number[] = [];

  frequencies = [
    { value: 'YEARLY', label: 'Yearly' },
    { value: 'HALF_YEARLY', label: 'Half-Yearly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
  ];

  quarters = [
    { value: 1, label: 'Q1 (Jan-Mar)' },
    { value: 2, label: 'Q2 (Apr-Jun)' },
    { value: 3, label: 'Q3 (Jul-Sep)' },
    { value: 4, label: 'Q4 (Oct-Dec)' },
  ];

  halves = [
    { value: 1, label: 'H1 (Apr-Sep)' },
    { value: 2, label: 'H2 (Oct-Mar)' },
  ];

  constructor(
    private complianceDoc: BranchComplianceDocService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {
    const currentYear = new Date().getFullYear();
    this.years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }

  /** If true, show frequency tabs. If false (route specifies a single frequency), hide tabs */
  showFrequencyTabs = true;

  ngOnInit(): void {
    const ids = this.auth.getBranchIds?.() || [];
    this.branchId = ids.length ? String(ids[0]) : '';

    // Subscribe to route data so frequency updates on route reuse
    this.route.data
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        const freq = data?.['frequency'];
        if (freq) {
          this.selectedFrequency = freq;
          this.showFrequencyTabs = false;
        } else {
          this.showFrequencyTabs = true;
        }
        this.load();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.load$.complete();
  }

  setFrequency(freq: string): void {
    this.selectedFrequency = freq;
    this.load();
  }

  load(): void {
    this.load$.next(); // cancel previous in-flight requests
    this.loading = true;

    this.complianceDoc.getChecklist({
      branchId: this.branchId || undefined,
      year: this.selectedYear,
      frequency: this.selectedFrequency,
      quarter: this.selectedFrequency === 'QUARTERLY' ? this.selectedQuarter : undefined,
      half: this.selectedFrequency === 'HALF_YEARLY' ? this.selectedHalf : undefined,
    })
    .pipe(takeUntil(this.load$), takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
    .subscribe({
      next: (res) => { this.checklist = res.data || []; this.cdr.detectChanges(); },
      error: () => { this.checklist = []; this.cdr.detectChanges(); },
    });
  }

  getStatusColor(item: ChecklistItem): string {
    const status = item.document?.status || 'NOT_UPLOADED';
    const map: Record<string, string> = {
      NOT_UPLOADED: 'dot-grey', SUBMITTED: 'dot-blue', APPROVED: 'dot-green',
      REUPLOAD_REQUIRED: 'dot-orange', RESUBMITTED: 'dot-purple', OVERDUE: 'dot-red',
    };
    return map[status] || 'dot-grey';
  }

  getStatus(item: ChecklistItem): string {
    return item.document?.status || 'NOT_UPLOADED';
  }

  canUpload(item: ChecklistItem): boolean {
    if (item.document?.isLocked) return false;
    const status = item.document?.status;
    return !status || status === 'NOT_UPLOADED' || status === 'REUPLOAD_REQUIRED' || status === 'OVERDUE';
  }

  openUploadModal(item: ChecklistItem): void {
    this.uploadTarget = item;
    this.selectedFile = null;
    this.uploadRemarks = '';
    this.showUploadModal = true;
  }

  closeUploadModal(): void {
    this.showUploadModal = false;
    this.uploadTarget = null;
    this.selectedFile = null;
    this.uploadRemarks = '';
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.selectedFile = input.files[0];
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer?.files?.length) this.selectedFile = event.dataTransfer.files[0];
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); }

  submitUpload(): void {
    if (!this.selectedFile || !this.uploadTarget || !this.branchId) return;

    this.uploading = true;
    const fd = new FormData();
    fd.append('file', this.selectedFile);
    fd.append('branchId', this.branchId);
    fd.append('returnCode', this.uploadTarget.returnCode);
    fd.append('periodYear', String(this.selectedYear));
    fd.append('frequency', this.selectedFrequency);
    if (this.selectedFrequency === 'QUARTERLY') {
      fd.append('periodQuarter', String(this.selectedQuarter));
    }
    if (this.selectedFrequency === 'HALF_YEARLY') {
      fd.append('periodHalf', String(this.selectedHalf));
    }
    if (this.uploadRemarks.trim()) {
      fd.append('remarks', this.uploadRemarks.trim());
    }

    this.complianceDoc.uploadDocument(fd)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.uploading = false; }))
      .subscribe({
        next: () => { this.closeUploadModal(); this.load(); },
        error: (err) => { alert(err?.error?.message || 'Upload failed.'); },
      });
  }

  downloadFile(item: ChecklistItem): void {
    const url = (item as any).document?.uploadedFileUrl;
    if (url) window.open(url, '_blank');
  }
}

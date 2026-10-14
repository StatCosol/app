import { ComplianceDocumentRecordsComponent } from '../../../shared/compliance/compliance-document-records.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BranchComplianceDocService } from '../../../core/branch-compliance-doc.service';
import { AuthService } from '../../../core/auth.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { DataTableComponent, PageHeaderComponent, TableCellDirective, TableColumn } from '../../../shared/ui';

@Component({
  selector: 'app-branch-compliance-docs',
  standalone: true,
  imports: [ComplianceDocumentRecordsComponent, RouterLink, IconComponent, CommonModule, FormsModule, DataTableComponent, TableCellDirective, PageHeaderComponent],
  templateUrl: './branch-compliance-docs.component.html',
})
export class BranchComplianceDocsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private checklistRequest?: Subscription;
  confirming = false;
  submissionsRevision = 0;
  loading = false;
  uploading = false;

  year = new Date().getFullYear();
  month = new Date().getMonth() + 1;

  frequency = 'MONTHLY';
  quarter = Math.ceil(this.month / 3);
  half = this.month >= 4 && this.month <= 9 ? 1 : 2;
  branchId = '';
  branches: any[] = [];

  get periodLabel(): string {
    if (this.frequency === 'QUARTERLY') return this.year + ' Q' + this.quarter;
    if (this.frequency === 'HALF_YEARLY') return this.year + ' H' + this.half;
    if (this.frequency === 'YEARLY') return String(this.year);
    return this.monthKey;
  }

  get periodQuery() {
    return { branchId: this.branchId, year: this.year, frequency: this.frequency,
      month: this.frequency === 'MONTHLY' ? this.month : undefined,
      quarter: this.frequency === 'QUARTERLY' ? this.quarter : undefined,
      half: this.frequency === 'HALF_YEARLY' ? this.half : undefined };
  }

  get availableReturns() { return this.checklistRows.filter(r => !r.document?.isLocked); }

  get monthKey(): string {
    return `${this.year}-${String(this.month).padStart(2, '0')}`;
  }

  kpis: any = null;
  checklistRows: any[] = [];

  readonly checklistColumns: TableColumn[] = [
    { key: 'name', header: 'Item' },
    { key: 'category', header: 'Category' },
    { key: 'dueDate', header: 'Due' },
    { key: 'status', header: 'Status' },
    { key: 'actions', header: 'File' },
  ];

  // upload meta
  uploadReturnCode = '';
  uploadNotes = '';
  selectedFile: File | null = null;
  fileInput: HTMLInputElement | null = null;

  constructor(
    private docs: BranchComplianceDocService,
    private auth: AuthService,
    private branchApi: ClientBranchesService,
    private files: ProtectedFileService,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.branchId = this.auth.getBranchIds()[0] || '';
    this.loadAll();
    this.branchApi.list().pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => {
        const mapped = this.auth.getBranchIds();
        this.branches = mapped.length ? rows.filter(b => mapped.includes(b.id)) : rows;
        this.branchId = this.branches.some(b => b.id === this.branchId) ? this.branchId : (this.branches[0]?.id || '');
        this.loadAll();
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('Unable to load branch names.'),
    });
  }

  ngOnDestroy() {
    this.checklistRequest?.unsubscribe();
    this.destroy$.next(); this.destroy$.complete();
  }

  loadAll() {
    this.checklistRequest?.unsubscribe();
    this.checklistRows = []; this.kpis = null;
    if (!this.branchId) { this.loading = false; return; }
    this.loading = true;
    this.checklistRequest = this.docs.getChecklist(this.periodQuery).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.checklistRows = res.data || [];
        if (!this.availableReturns.some(r => r.returnCode === this.uploadReturnCode)) this.uploadReturnCode = '';
        const uploaded = this.checklistRows.filter(r => !!r.document?.uploadedFileUrl).length;
        this.kpis = { uploadPct: this.checklistRows.length ? Math.round(uploaded * 100 / this.checklistRows.length) : 0,
          pending: this.checklistRows.filter(r => !r.document || ['SUBMITTED', 'RESUBMITTED', 'NOT_UPLOADED', 'OVERDUE'].includes(r.document.status)).length,
          returned: this.checklistRows.filter(r => r.document?.status === 'REUPLOAD_REQUIRED').length,
          reviewed: this.checklistRows.filter(r => r.document?.status === 'APPROVED').length };
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); this.toast.error('Failed to load checklist.'); },
    });
  }

  refresh() { this.submissionsRevision++; this.loadAll(); }

  onPeriodChange() { this.uploadReturnCode = ''; this.loadAll(); }

  openFile(row: any, download = false) {
    const doc = row.document;
    if (!doc?.uploadedFileUrl) return;
    const request = download ? this.files.download(doc.uploadedFileUrl, doc.uploadedFileName)
      : this.files.open(doc.uploadedFileUrl, doc.uploadedFileName);
    request.pipe(takeUntil(this.destroy$)).subscribe({ error: () => this.toast.error('Unable to open document.') });
  }

  onFileChange(e: any) {
    this.fileInput = e.target;
    this.selectedFile = e?.target?.files?.[0] || null;
  }

  clampPct(pct: number): number {
    const n = Number(pct || 0);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  pctClass(pct: number): string {
    const p = this.clampPct(pct);
    if (p < 50) return 'bg-red-100 text-red-800';
    if (p < 70) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  }

  barClass(pct: number): string {
    const p = this.clampPct(pct);
    if (p < 50) return 'bg-red-500';
    if (p < 70) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  async upload() {
    if (this.uploading || this.confirming || this.loading) return;
    if (!this.branchId || !this.uploadReturnCode || !this.availableReturns.some(r => r.returnCode === this.uploadReturnCode)) {
      this.toast.error('Please select a branch and a return for this frequency.');
      return;
    }
    if (!this.selectedFile) {
      this.toast.error('Please choose a file to upload.');
      return;
    }

    const fd = new FormData();
    fd.append('file', this.selectedFile);
    fd.append('branchId', this.branchId);
    fd.append('returnCode', this.uploadReturnCode);
    fd.append('frequency', this.frequency);
    fd.append('periodYear', String(this.year));
    if (this.frequency === 'MONTHLY') fd.append('periodMonth', String(this.month));
    if (this.frequency === 'QUARTERLY') fd.append('periodQuarter', String(this.quarter));
    if (this.frequency === 'HALF_YEARLY') fd.append('periodHalf', String(this.half));
    if (this.uploadNotes.trim()) fd.append('remarks', this.uploadNotes.trim());

    this.confirming = true;
    let ok = false;
    try { ok = await this.dialog.confirm('Upload Document', 'Upload document for ' + this.periodLabel + '?'); }
    finally { this.confirming = false; this.cdr.markForCheck(); }
    if (!ok) return;
    this.uploading = true;
    this.docs.uploadDocument(fd).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.uploading = false; this.cdr.markForCheck();
        this.toast.success('Uploaded successfully.');
        this.submissionsRevision++;
        this.selectedFile = null;
        if (this.fileInput) this.fileInput.value = '';
        this.uploadNotes = '';
        this.loadAll();
      },
      error: err => {
        this.uploading = false; this.cdr.markForCheck();
        const message = err?.error?.message;
        this.toast.error(Array.isArray(message) ? message.join(' ') : (message || 'Upload failed. Please try again.'));
      },
    });
  }
}

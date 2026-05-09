import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  BranchComplianceDocService,
  ChecklistItem,
} from '../../../core/branch-compliance-doc.service';
import {
  StatusBadgeComponent,
  PageHeaderComponent,
  ModalComponent,
} from '../../../shared/ui';
import { SharedTimelineComponent } from '../../../shared/components/timeline';
import { TimelineEvent as SharedTimelineEvent } from '../../../shared/components/timeline/timeline.model';
import {
  FileVersionItem,
  SharedFilePreviewData,
} from '../../../shared/components/file-preview/file-preview.model';
import { SharedFilePreviewModalComponent } from '../../../shared/components/file-preview';
import {
  ProtectedFileHandle,
  ProtectedFileService,
} from '../../../shared/files/services/protected-file.service';

type StatusFilter =
  | 'ALL'
  | 'NOT_UPLOADED'
  | 'SUBMITTED'
  | 'RESUBMITTED'
  | 'REUPLOAD_REQUIRED'
  | 'APPROVED'
  | 'OVERDUE';

interface ReviewerNoteEntry {
  id: string;
  title: string;
  createdAt: string;
  comment: string;
}

@Component({
  selector: 'app-branch-periodic-uploads-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    StatusBadgeComponent,
    PageHeaderComponent,
    ModalComponent,
    SharedTimelineComponent,
    SharedFilePreviewModalComponent,
  ],
  templateUrl: './branch-periodic-uploads-page.component.html',
  styleUrls: ['./branch-periodic-uploads-page.component.scss'],
})
export class BranchPeriodicUploadsPageComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private load$ = new Subject<void>();

  loading = false;
  uploading = false;
  checklist: ChecklistItem[] = [];
  filteredChecklist: ChecklistItem[] = [];
  selectedItem: ChecklistItem | null = null;
  timeline: SharedTimelineEvent[] = [];
  branchId = '';

  selectedFrequency = 'YEARLY';
  selectedYear = new Date().getFullYear();
  selectedQuarter = 1;
  selectedHalf = 1;
  selectedStatus: StatusFilter = 'ALL';
  selectedLawArea = 'ALL';
  selectedCategory = 'ALL';
  searchTerm = '';
  lawAreas: string[] = [];
  categories: string[] = [];
  submissionNotice = '';

  // Upload modal
  showUploadModal = false;
  uploadTarget: ChecklistItem | null = null;
  selectedFile: File | null = null;
  acknowledgementRef = '';
  uploadRemarks = '';
  showPreviewModal = false;
  previewData: SharedFilePreviewData | null = null;
  private previewHandle: ProtectedFileHandle | null = null;

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
    private toast: ToastService,
    private protectedFiles: ProtectedFileService,
  ) {
    const currentYear = new Date().getFullYear();
    this.years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }

  /** If true, show frequency tabs. If false (route specifies a single frequency), hide tabs */
  showFrequencyTabs = true;

  ngOnInit(): void {
    const ids = this.auth.getBranchIds?.() || [];
    this.branchId = ids.length ? String(ids[0]) : '';

    // Support both /uploads/:periodicity and legacy data-driven route config
    combineLatest([this.route.paramMap, this.route.queryParamMap, this.route.data])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([paramMap, queryParamMap, data]) => {
        const periodicity = (paramMap.get('periodicity') || '').toLowerCase();
        const mappedFromParam = this.mapPeriodicityToFrequency(periodicity);
        const focusCode = queryParamMap.get('code') || undefined;
        const yearParam = Number(queryParamMap.get('year') || '');
        const quarterParam = Number(queryParamMap.get('quarter') || '');
        const halfParam = Number(queryParamMap.get('half') || '');
        const branchIdFromQuery = queryParamMap.get('branchId') || '';
        if (mappedFromParam) {
          this.selectedFrequency = mappedFromParam;
          this.showFrequencyTabs = false;
        } else {
          const freq = data?.['frequency'];
          if (freq) {
            this.selectedFrequency = freq;
            this.showFrequencyTabs = false;
          } else {
            this.showFrequencyTabs = true;
          }
        }
        if (branchIdFromQuery) this.branchId = branchIdFromQuery;
        if (yearParam >= 2000) this.selectedYear = yearParam;
        if (quarterParam >= 1 && quarterParam <= 4) this.selectedQuarter = quarterParam;
        if (halfParam === 1 || halfParam === 2) this.selectedHalf = halfParam;
        this.load(focusCode);
      });
  }

  ngOnDestroy(): void {
    this.releasePreviewHandle();
    this.destroy$.next();
    this.destroy$.complete();
    this.load$.complete();
  }

  setFrequency(freq: string): void {
    this.selectedFrequency = freq;
    this.load();
  }

  trackByReturnCode(_: number, item: ChecklistItem): string {
    return item.returnCode;
  }

  load(focusCode?: string): void {
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
      next: (res) => {
        this.checklist = res.data || [];
        this.lawAreas = this.unique(this.checklist.map((x) => x.lawArea));
        this.categories = this.unique(this.checklist.map((x) => x.category || 'Other'));
        this.applyFilters();
        this.hydrateSelection(focusCode || this.selectedItem?.returnCode);
        this.cdr.detectChanges();
      },
      error: () => {
        this.checklist = [];
        this.filteredChecklist = [];
        this.selectedItem = null;
        this.timeline = [];
        this.cdr.detectChanges();
      },
    });
  }

  applyFilters(): void {
    const q = this.searchTerm.trim().toLowerCase();
    this.filteredChecklist = this.checklist.filter((item) => {
      if (this.selectedStatus !== 'ALL' && this.statusOf(item) !== this.selectedStatus) return false;
      if (this.selectedLawArea !== 'ALL' && item.lawArea !== this.selectedLawArea) return false;
      const category = item.category || 'Other';
      if (this.selectedCategory !== 'ALL' && category !== this.selectedCategory) return false;
      if (!q) return true;
      const text = `${item.returnName} ${item.returnCode} ${item.lawArea} ${category}`.toLowerCase();
      return text.includes(q);
    });
    this.hydrateSelection(this.selectedItem?.returnCode);
  }

  statusOf(item: ChecklistItem): string {
    return item.document?.status || 'NOT_UPLOADED';
  }

  workflowState(item: ChecklistItem): string {
    const status = this.statusOf(item);
    if (status === 'APPROVED') return 'Approved by CRM';
    if (status === 'SUBMITTED' || status === 'RESUBMITTED') return 'Submitted to CRM';
    if (status === 'REUPLOAD_REQUIRED') return 'Returned by CRM';
    if (status === 'OVERDUE') return 'Overdue';
    return 'Pending upload';
  }

  workflowClass(item: ChecklistItem): string {
    const status = this.statusOf(item);
    if (status === 'APPROVED') return 'wf wf--approved';
    if (status === 'SUBMITTED' || status === 'RESUBMITTED') return 'wf wf--submitted';
    if (status === 'REUPLOAD_REQUIRED') return 'wf wf--returned';
    if (status === 'OVERDUE') return 'wf wf--overdue';
    return 'wf wf--pending';
  }

  canUpload(item: ChecklistItem): boolean {
    if (item.document?.isLocked) return false;
    const status = this.statusOf(item);
    return !status || status === 'NOT_UPLOADED' || status === 'REUPLOAD_REQUIRED' || status === 'OVERDUE';
  }

  selectItem(item: ChecklistItem): void {
    this.selectedItem = item;
    this.timeline = this.buildTimeline(item);
  }

  openUploadModal(item: ChecklistItem): void {
    this.uploadTarget = item;
    this.selectedFile = null;
    this.acknowledgementRef = this.extractAckRef(item) || '';
    this.uploadRemarks = '';
    this.showUploadModal = true;
  }

  closeUploadModal(): void {
    this.showUploadModal = false;
    this.uploadTarget = null;
    this.selectedFile = null;
    this.acknowledgementRef = '';
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
    const remarksParts: string[] = [];
    if (this.acknowledgementRef.trim()) {
      remarksParts.push(`AckRef: ${this.acknowledgementRef.trim()}`);
    }
    if (this.uploadRemarks.trim()) {
      remarksParts.push(this.uploadRemarks.trim());
    }
    if (remarksParts.length) {
      fd.append('remarks', remarksParts.join(' | '));
    }

    const focusCode = this.uploadTarget.returnCode;
    this.complianceDoc.uploadDocument(fd)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.uploading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.submissionNotice = `Submitted to CRM at ${new Date().toLocaleString('en-IN')}`;
          this.toast.success('Submitted to CRM review queue');
          this.closeUploadModal();
          this.loadAndSelect(focusCode);
        },
        error: (err) => { this.toast.error(err?.error?.message || 'Upload failed.'); },
      });
  }

  downloadFile(item: ChecklistItem): void {
    const url = item.document?.uploadedFileUrl;
    if (!url) return;
    this.protectedFiles
      .download(url, item.document?.uploadedFileName || item.returnName)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: (err) => {
          this.toast.error(err?.error?.message || 'Unable to download file.');
        },
      });
  }

  previewFile(item: ChecklistItem): void {
    const url = item.document?.uploadedFileUrl;
    if (!url) return;
    this.releasePreviewHandle();
    this.protectedFiles
      .fetch(url, item.document?.uploadedFileName || item.returnName)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (file) => {
          this.previewHandle = file;
          const document = item.document!;
          const versions: FileVersionItem[] = [];
          if (document.version) {
            versions.push({
              id: `${item.returnCode}-v${document.version}`,
              label: `Version ${document.version}`,
              createdAt: document.uploadedAt || null,
              url: file.objectUrl,
            });
          }
          this.previewData = {
            id: String(document.id || item.returnCode),
            name: document.uploadedFileName || item.returnName,
            fileName: document.uploadedFileName || '',
            mimeType: file.mimeType || null,
            url: file.objectUrl,
            uploadedAt: document.uploadedAt || null,
            status: document.status || null,
            rejectionReason:
              document.status === 'REUPLOAD_REQUIRED' ? document.remarks || null : null,
            versions,
          };
          this.showPreviewModal = true;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.toast.error(err?.error?.message || 'Unable to load preview.');
        },
      });
  }

  closePreviewModal(): void {
    this.showPreviewModal = false;
    this.previewData = null;
    this.releasePreviewHandle();
  }

  downloadPreviewFile(): void {
    const url = this.selectedItem?.document?.uploadedFileUrl;
    if (!url || !this.previewData) return;
    this.protectedFiles
      .download(url, this.previewData.fileName || this.previewData.name)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: (err) => {
          this.toast.error(err?.error?.message || 'Unable to download file.');
        },
      });
  }

  periodLabel(): string {
    if (this.selectedFrequency === 'QUARTERLY') return `Q${this.selectedQuarter} ${this.selectedYear}`;
    if (this.selectedFrequency === 'HALF_YEARLY') return `H${this.selectedHalf} ${this.selectedYear}`;
    return `${this.selectedYear}`;
  }

  dueDateLabel(item: ChecklistItem): string {
    if (item.document?.dueDate) return new Date(item.document.dueDate).toLocaleDateString('en-GB');
    if (item.dueDay) return `Day ${item.dueDay}`;
    return '-';
  }

  dueInLabel(item: ChecklistItem): string {
    const due = item.document?.dueDate;
    if (!due) return item.dueDay ? `Due day ${item.dueDay}` : 'No due date';
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const d = new Date(due); d.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (diff < 0) return `${Math.abs(diff)} day(s) overdue`;
    if (diff === 0) return 'Due today';
    return `Due in ${diff} day(s)`;
  }

  signalLabel(item: ChecklistItem): string {
    const status = this.statusOf(item);
    if (status === 'APPROVED') return 'DONE';
    if (status === 'OVERDUE') return 'OVERDUE';
    const due = item.document?.dueDate;
    if (!due) return '';
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const d = new Date(due); d.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (diff < 0) return 'OVERDUE';
    if (diff <= 3) return 'DUE NOW';
    if (diff <= 7) return 'DUE SOON';
    return '';
  }

  signalClass(item: ChecklistItem): string {
    const label = this.signalLabel(item);
    switch (label) {
      case 'OVERDUE': return 'signal--overdue';
      case 'DUE NOW': return 'signal--due-now';
      case 'DUE SOON': return 'signal--due-soon';
      case 'DONE': return 'signal--approved';
      default: return '';
    }
  }

  extractAckRef(item: ChecklistItem): string {
    const txt = item.document?.uploaderRemarks || '';
    const match = txt.match(/ack(?:ref|nowledg(?:ement)?)\s*[:#-]\s*([^|;\n]+)/i);
    return match ? match[1].trim() : '';
  }

  onFiltersChanged(): void {
    this.applyFilters();
  }

  get totalItems(): number {
    return this.checklist.length;
  }

  get uploadedCount(): number {
    return this.checklist.filter((x) => !!x.document).length;
  }

  get pendingCount(): number {
    return this.checklist.filter((x) => ['NOT_UPLOADED', 'OVERDUE'].includes(this.statusOf(x))).length;
  }

  get returnedCount(): number {
    return this.checklist.filter((x) => this.statusOf(x) === 'REUPLOAD_REQUIRED').length;
  }

  get overdueCount(): number {
    return this.checklist.filter((x) => this.statusOf(x) === 'OVERDUE').length;
  }

  get submittedCount(): number {
    return this.checklist.filter((x) =>
      ['SUBMITTED', 'RESUBMITTED'].includes(this.statusOf(x)),
    ).length;
  }

  get completenessPct(): number {
    if (!this.totalItems) return 0;
    return Math.round((this.uploadedCount / this.totalItems) * 100);
  }

  isReturned(item: ChecklistItem): boolean {
    return this.statusOf(item) === 'REUPLOAD_REQUIRED';
  }

  isOverdue(item: ChecklistItem): boolean {
    return this.statusOf(item) === 'OVERDUE';
  }

  hasPendingQuery(item: ChecklistItem): boolean {
    if (this.statusOf(item) !== 'REUPLOAD_REQUIRED') return false;
    const txt = `${item.document?.remarks || ''} ${item.document?.uploaderRemarks || ''}`.toLowerCase();
    return txt.includes('query') || txt.includes('clarif') || txt.includes('missing');
  }

  submissionState(item: ChecklistItem): string {
    const status = this.statusOf(item);
    if (status === 'RESUBMITTED') return 'Resubmitted to CRM';
    if (status === 'SUBMITTED') return 'Submitted to CRM';
    if (status === 'APPROVED') return 'Approved by CRM';
    if (status === 'REUPLOAD_REQUIRED') return 'Returned by CRM';
    if (status === 'OVERDUE') return 'Overdue';
    return 'Pending upload';
  }

  submittedAtLabel(item: ChecklistItem): string {
    if (!item.document?.uploadedAt) return '-';
    return new Date(item.document.uploadedAt).toLocaleString('en-GB');
  }

  queueAgeLabel(item: ChecklistItem): string {
    if (!item.document?.uploadedAt) return '-';
    const uploaded = new Date(item.document.uploadedAt).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, now - uploaded);
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    return `${hours}h`;
  }

  resubmissionLabel(item: ChecklistItem): string {
    const version = item.document?.version || 0;
    if (version <= 1) return 'Initial submission';
    return `Resubmission v${version}`;
  }

  reviewerNotes(item: ChecklistItem): ReviewerNoteEntry[] {
    if (!item.document?.reviewedAt || !item.document?.remarks) return [];
    const state = this.statusOf(item) === 'APPROVED' ? 'Approved' : 'Returned';
    return [
      {
        id: `${item.returnCode}-review-note`,
        title: `${state} note`,
        createdAt: item.document.reviewedAt,
        comment: item.document.remarks,
      },
    ];
  }

  private loadAndSelect(returnCode?: string): void {
    this.load$.next();
    this.loading = true;

    this.complianceDoc.getChecklist({
      branchId: this.branchId || undefined,
      year: this.selectedYear,
      frequency: this.selectedFrequency,
      quarter: this.selectedFrequency === 'QUARTERLY' ? this.selectedQuarter : undefined,
      half: this.selectedFrequency === 'HALF_YEARLY' ? this.selectedHalf : undefined,
    })
      .pipe(
        takeUntil(this.load$),
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res) => {
          this.checklist = res.data || [];
          this.lawAreas = this.unique(this.checklist.map((x) => x.lawArea));
          this.categories = this.unique(this.checklist.map((x) => x.category || 'Other'));
          this.applyFilters();
          this.hydrateSelection(returnCode);
        },
      });
  }

  private hydrateSelection(returnCode?: string): void {
    if (!this.filteredChecklist.length) {
      this.selectedItem = null;
      this.timeline = [];
      return;
    }
    if (returnCode) {
      const item = this.filteredChecklist.find((x) => x.returnCode === returnCode);
      if (item) {
        this.selectItem(item);
        return;
      }
    }
    if (this.selectedItem) {
      const existing = this.filteredChecklist.find((x) => x.returnCode === this.selectedItem?.returnCode);
      if (existing) {
        this.selectItem(existing);
        return;
      }
    }
    this.selectItem(this.filteredChecklist[0]);
  }

  private buildTimeline(item: ChecklistItem): SharedTimelineEvent[] {
    const events: SharedTimelineEvent[] = [];
    if (item.document?.uploadedAt) {
      events.push({
        id: `${item.returnCode}-submitted`,
        title:
          item.document.version > 1
            ? `Resubmitted (v${item.document.version})`
            : 'Submitted to CRM',
        createdAt: item.document.uploadedAt,
        statusTo: item.document.status || 'SUBMITTED',
        comment: item.document.uploaderRemarks || null,
      });
    }
    if (item.document?.reviewedAt) {
      events.push({
        id: `${item.returnCode}-reviewed`,
        title:
          item.document.status === 'APPROVED'
            ? 'Approved by CRM'
            : 'Returned by CRM',
        createdAt: item.document.reviewedAt,
        statusTo: item.document.status || null,
        comment: item.document.remarks || null,
      });
    }
    return events;
  }

  private unique(items: string[]): string[] {
    return Array.from(new Set(items.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  private mapPeriodicityToFrequency(periodicity: string): string | null {
    if (periodicity === 'quarterly') return 'QUARTERLY';
    if (periodicity === 'half-yearly' || periodicity === 'half_yearly') return 'HALF_YEARLY';
    if (periodicity === 'yearly' || periodicity === 'annual') return 'YEARLY';
    return null;
  }

  private releasePreviewHandle(): void {
    this.previewHandle?.revoke();
    this.previewHandle = null;
  }
}

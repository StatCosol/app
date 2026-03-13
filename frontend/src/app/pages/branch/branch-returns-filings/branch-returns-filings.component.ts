import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
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

type StatusFilter =
  | 'ALL'
  | 'NOT_UPLOADED'
  | 'SUBMITTED'
  | 'RESUBMITTED'
  | 'REUPLOAD_REQUIRED'
  | 'APPROVED'
  | 'OVERDUE';

interface TimelineEvent {
  title: string;
  timestamp: string;
  note?: string | null;
}

@Component({
  selector: 'app-branch-returns-filings',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent, PageHeaderComponent, ModalComponent],
  templateUrl: './branch-returns-filings.component.html',
  styleUrls: ['./branch-returns-filings.component.scss'],
})
export class BranchReturnsFilingsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private load$ = new Subject<void>();

  loading = false;
  uploading = false;
  checklist: ChecklistItem[] = [];
  filteredChecklist: ChecklistItem[] = [];
  selectedItem: ChecklistItem | null = null;
  timeline: TimelineEvent[] = [];
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

  // Upload modal
  showUploadModal = false;
  uploadTarget: ChecklistItem | null = null;
  selectedFile: File | null = null;
  acknowledgementRef = '';
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
    private toast: ToastService,
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

  trackByReturnCode(_: number, item: ChecklistItem): string {
    return item.returnCode;
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
      next: (res) => {
        this.checklist = res.data || [];
        this.lawAreas = this.unique(this.checklist.map((x) => x.lawArea));
        this.categories = this.unique(this.checklist.map((x) => x.category || 'Other'));
        this.applyFilters();
        this.hydrateSelection(this.selectedItem?.returnCode);
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
          this.toast.success('Submitted to CRM review queue');
          this.closeUploadModal();
          this.loadAndSelect(focusCode);
        },
        error: (err) => { this.toast.error(err?.error?.message || 'Upload failed.'); },
      });
  }

  downloadFile(item: ChecklistItem): void {
    const url = (item as any).document?.uploadedFileUrl;
    if (url) window.open(this.auth.authenticateUrl(url), '_blank');
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

  private buildTimeline(item: ChecklistItem): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    if (item.document?.uploadedAt) {
      events.push({
        title: item.document.version > 1 ? `Resubmitted (v${item.document.version})` : 'Submitted to CRM',
        timestamp: item.document.uploadedAt,
        note: item.document.uploaderRemarks,
      });
    }
    if (item.document?.reviewedAt) {
      events.push({
        title: item.document.status === 'APPROVED' ? 'Approved by CRM' : 'Returned by CRM',
        timestamp: item.document.reviewedAt,
        note: item.document.remarks,
      });
    }
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  private unique(items: string[]): string[] {
    return Array.from(new Set(items.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }
}

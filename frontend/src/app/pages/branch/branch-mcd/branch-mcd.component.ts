import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';
import { ReportsService } from '../../../core/reports.service';
import {
  BranchComplianceDocService,
  ChecklistItem,
  ComplianceDoc,
} from '../../../core/branch-compliance-doc.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ModalComponent, PageHeaderComponent, StatusBadgeComponent } from '../../../shared/ui';

type StatusFilter = 'ALL' | 'PENDING_UPLOAD' | 'QUERY_PENDING' | 'SUBMITTED' | 'APPROVED';

interface TimelineEvent {
  title: string;
  timestamp: string;
  note?: string | null;
}

@Component({
  selector: 'app-branch-mcd',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent, ModalComponent],
  templateUrl: './branch-mcd.component.html',
  styleUrls: ['./branch-mcd.component.scss'],
})
export class BranchMcdComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly load$ = new Subject<void>();

  loading = false;
  uploading = false;

  branchId = '';
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() === 0 ? 12 : new Date().getMonth();
  searchTerm = '';
  statusFilter: StatusFilter = 'ALL';
  lawAreaFilter = 'ALL';
  categoryFilter = 'ALL';

  years: number[] = [];
  readonly months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  checklist: ChecklistItem[] = [];
  filteredChecklist: ChecklistItem[] = [];
  lawAreas: string[] = [];
  categories: string[] = [];
  latestDocsByCode = new Map<string, ComplianceDoc>();
  docsByCode = new Map<string, ComplianceDoc[]>();

  selectedItem: ChecklistItem | null = null;
  selectedLatestDoc: ComplianceDoc | null = null;
  selectedTimeline: TimelineEvent[] = [];

  showUploadModal = false;
  uploadTarget: ChecklistItem | null = null;
  selectedFile: File | null = null;
  uploadRemarks = '';

  constructor(
    private readonly complianceDocs: BranchComplianceDocService,
    private readonly auth: AuthService,
    private readonly route: ActivatedRoute,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    const now = new Date();
    this.selectedYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const currentYear = now.getFullYear();
    this.years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }

  ngOnInit(): void {
    const monthParam = this.route.snapshot.queryParamMap.get('month');
    const focusReturnCode = this.route.snapshot.queryParamMap.get('code') || undefined;
    const branchIdFromQuery = this.route.snapshot.queryParamMap.get('branchId') || '';

    if (monthParam) {
      const match = monthParam.match(/^(\d{4})-(\d{2})$/);
      if (match) {
        const parsedYear = Number(match[1]);
        const parsedMonth = Number(match[2]);
        if (parsedYear >= 2000 && parsedMonth >= 1 && parsedMonth <= 12) {
          this.selectedYear = parsedYear;
          this.selectedMonth = parsedMonth;
        }
      }
    }

    const branchIds = this.auth.getBranchIds();
    this.branchId = branchIds.length ? String(branchIds[0]) : branchIdFromQuery;
    if (!this.branchId) {
      this.toast.warning('Branch mapping not found', 'Please contact admin for branch access.');
      return;
    }
    this.load(focusReturnCode);
  }

  ngOnDestroy(): void {
    this.load$.next();
    this.load$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(focusReturnCode?: string): void {
    if (!this.branchId) return;

    const filters = {
      branchId: this.branchId,
      year: this.selectedYear,
      month: this.selectedMonth,
      frequency: 'MONTHLY',
    };

    this.load$.next();
    this.loading = true;

    forkJoin({
      checklistRes: this.complianceDocs.getChecklist(filters).pipe(
        catchError(() => of({ data: [] as ChecklistItem[], total: 0 })),
      ),
      docsRes: this.complianceDocs
        .listBranchDocs({
          ...filters,
          page: 1,
          pageSize: 500,
        })
        .pipe(catchError(() => of({ data: [] as ComplianceDoc[], total: 0 }))),
    })
      .pipe(
        takeUntil(this.load$),
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ checklistRes, docsRes }) => {
          this.checklist = checklistRes.data || [];
          this.docsByCode = this.buildDocsByCodeMap(docsRes.data || []);
          this.latestDocsByCode = this.buildLatestDocMap(docsRes.data || []);
          this.lawAreas = this.extractLawAreas(this.checklist);
          this.categories = this.extractCategories(this.checklist);
          this.applyFilters();
          this.hydrateSelection(focusReturnCode);
        },
        error: () => {
          this.checklist = [];
          this.filteredChecklist = [];
          this.latestDocsByCode = new Map<string, ComplianceDoc>();
          this.docsByCode = new Map<string, ComplianceDoc[]>();
          this.selectedItem = null;
          this.selectedLatestDoc = null;
          this.selectedTimeline = [];
          this.toast.error('Failed to load monthly compliance workbench');
        },
      });
  }

  applyFilters(): void {
    const q = this.searchTerm.trim().toLowerCase();
    this.filteredChecklist = this.checklist.filter((item) => {
      if (this.lawAreaFilter !== 'ALL' && item.lawArea !== this.lawAreaFilter) return false;
      const category = item.category || 'Other';
      if (this.categoryFilter !== 'ALL' && category !== this.categoryFilter) return false;
      if (!this.matchesStatusFilter(item)) return false;
      if (!q) return true;
      const haystack = `${item.returnName} ${item.returnCode} ${item.lawArea} ${item.category || ''}`.toLowerCase();
      return haystack.includes(q);
    });
    this.hydrateSelection(this.selectedItem?.returnCode);
  }

  onPeriodChange(): void {
    this.load(this.selectedItem?.returnCode);
  }

  exportMonthSheet(): void {
    const rows = this.checklist.map((item) => {
      const dueDate = this.resolveDueDate(item);
      return {
        returnCode: item.returnCode,
        returnName: item.returnName,
        lawArea: item.lawArea,
        category: item.category || 'Other',
        status: this.statusOf(item),
        dueDate: dueDate || '-',
        dueLabel: this.dueLabel(item),
        hasPendingQuery: this.isQueryPending(item) ? 'Yes' : 'No',
        reviewerRemarks: item.document?.remarks || '',
      };
    });

    ReportsService.exportCsv(
      rows,
      [
        { key: 'returnCode', label: 'Return Code' },
        { key: 'returnName', label: 'Return Name' },
        { key: 'lawArea', label: 'Law Area' },
        { key: 'category', label: 'Category' },
        { key: 'status', label: 'Status' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'dueLabel', label: 'Due Summary' },
        { key: 'hasPendingQuery', label: 'Pending Query' },
        { key: 'reviewerRemarks', label: 'Reviewer Remarks' },
      ],
      `branch-monthly-compliance-${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}.csv`,
    );
  }

  selectItem(item: ChecklistItem): void {
    this.selectedItem = item;
    this.syncSelectedDetails();
  }

  trackByReturnCode(_: number, item: ChecklistItem): string {
    return item.returnCode;
  }

  statusOf(item: ChecklistItem): string {
    const status = item.document?.status;
    if (status) return status;
    return this.isOverdue(item) ? 'OVERDUE' : 'NOT_UPLOADED';
  }

  canUpload(item: ChecklistItem): boolean {
    if (item.document?.isLocked) return false;
    const status = this.statusOf(item);
    return status === 'NOT_UPLOADED' || status === 'REUPLOAD_REQUIRED' || status === 'OVERDUE';
  }

  isQueryPending(item: ChecklistItem): boolean {
    return this.statusOf(item) === 'REUPLOAD_REQUIRED' || !!item.document?.remarks;
  }

  isDueNow(item: ChecklistItem): boolean {
    if (this.statusOf(item) === 'APPROVED') return false;
    const due = this.resolveDueDate(item);
    if (!due) return false;
    const days = this.daysBetween(this.startOfDay(new Date()), this.startOfDay(new Date(due)));
    return days >= 0 && days <= 7;
  }

  isOverdue(item: ChecklistItem): boolean {
    if (item.document?.status === 'OVERDUE') return true;
    if (this.statusOf(item) === 'APPROVED') return false;
    const due = this.resolveDueDate(item);
    if (!due) return false;
    return this.startOfDay(new Date(due)).getTime() < this.startOfDay(new Date()).getTime();
  }

  resolveDueDate(item: ChecklistItem): string | null {
    if (item.document?.dueDate) return item.document.dueDate;
    if (!item.dueDay) return null;
    return this.computeMonthlyDueDate(this.selectedYear, this.selectedMonth, item.dueDay);
  }

  dueLabel(item: ChecklistItem): string {
    const due = this.resolveDueDate(item);
    if (!due) return 'No due date configured';
    const days = this.daysBetween(this.startOfDay(new Date()), this.startOfDay(new Date(due)));
    if (days < 0) return `${Math.abs(days)} day(s) overdue`;
    if (days === 0) return 'Due today';
    return `Due in ${days} day(s)`;
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
    if (input.files?.length) {
      this.selectedFile = input.files[0];
    }
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer?.files?.length) {
      this.selectedFile = event.dataTransfer.files[0];
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  submitUpload(): void {
    if (!this.selectedFile || !this.uploadTarget || !this.branchId) return;

    this.uploading = true;
    const fd = new FormData();
    fd.append('file', this.selectedFile);
    fd.append('branchId', this.branchId);
    fd.append('returnCode', this.uploadTarget.returnCode);
    fd.append('periodYear', String(this.selectedYear));
    fd.append('frequency', 'MONTHLY');
    fd.append('periodMonth', String(this.selectedMonth));
    if (this.uploadRemarks.trim()) {
      fd.append('remarks', this.uploadRemarks.trim());
    }

    const focusReturnCode = this.uploadTarget.returnCode;
    this.complianceDocs
      .uploadDocument(fd)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.uploading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Document uploaded successfully');
          this.closeUploadModal();
          this.load(focusReturnCode);
        },
        error: (err) => {
          this.toast.error('Upload failed', err?.error?.message || 'Please try again.');
        },
      });
  }

  openDocument(item: ChecklistItem): void {
    const fileUrl = this.latestDocsByCode.get(item.returnCode)?.uploadedFileUrl;
    if (!fileUrl) {
      this.toast.info('No uploaded file is available for this item yet.');
      return;
    }
    window.open(this.auth.authenticateUrl(fileUrl), '_blank');
  }

  get completenessPct(): number {
    return this.totalItems ? Math.round((this.uploadedCount / this.totalItems) * 100) : 0;
  }

  get totalItems(): number {
    return this.checklist.length;
  }

  get uploadedCount(): number {
    return this.checklist.filter((item) => !!item.document).length;
  }

  get pendingCount(): number {
    return this.checklist.filter((item) => {
      const status = this.statusOf(item);
      return status === 'NOT_UPLOADED' || status === 'OVERDUE';
    }).length;
  }

  get returnedCount(): number {
    return this.checklist.filter((item) => this.statusOf(item) === 'REUPLOAD_REQUIRED').length;
  }

  get pendingQueryCount(): number {
    return this.checklist.filter((item) => this.isQueryPending(item)).length;
  }

  get approvedCount(): number {
    return this.checklist.filter((item) => this.statusOf(item) === 'APPROVED').length;
  }

  get overdueCount(): number {
    return this.checklist.filter((item) => this.isOverdue(item)).length;
  }

  get selectedMonthLabel(): string {
    return this.months.find((m) => m.value === this.selectedMonth)?.label || '';
  }

  get monthCloseStatus(): 'CLOSED' | 'OPEN' | 'NO_ITEMS' {
    if (!this.totalItems) return 'NO_ITEMS';
    return this.approvedCount === this.totalItems ? 'CLOSED' : 'OPEN';
  }

  get monthCloseLabel(): string {
    if (this.monthCloseStatus === 'NO_ITEMS') return 'No applicable items';
    if (this.monthCloseStatus === 'CLOSED') return 'All items approved';
    return `${this.totalItems - this.approvedCount} item(s) pending closure`;
  }

  get monthCloseProgressPct(): number {
    if (!this.totalItems) return 0;
    return Math.round((this.approvedCount / this.totalItems) * 100);
  }

  private hydrateSelection(focusReturnCode?: string): void {
    if (!this.filteredChecklist.length) {
      this.selectedItem = null;
      this.selectedLatestDoc = null;
      this.selectedTimeline = [];
      return;
    }

    if (focusReturnCode) {
      const focused = this.filteredChecklist.find((item) => item.returnCode === focusReturnCode);
      if (focused) {
        this.selectedItem = focused;
        this.syncSelectedDetails();
        return;
      }
    }

    if (!this.selectedItem) {
      this.selectedItem = this.filteredChecklist[0];
      this.syncSelectedDetails();
      return;
    }

    const match = this.filteredChecklist.find((item) => item.returnCode === this.selectedItem?.returnCode);
    this.selectedItem = match || this.filteredChecklist[0];
    this.syncSelectedDetails();
  }

  private syncSelectedDetails(): void {
    if (!this.selectedItem) {
      this.selectedLatestDoc = null;
      this.selectedTimeline = [];
      return;
    }
    this.selectedLatestDoc = this.latestDocsByCode.get(this.selectedItem.returnCode) || null;
    this.selectedTimeline = this.buildTimeline(
      this.selectedItem,
      this.selectedLatestDoc,
      this.docsByCode.get(this.selectedItem.returnCode) || [],
    );
  }

  private buildTimeline(
    item: ChecklistItem,
    latestDoc: ComplianceDoc | null,
    historyDocs: ComplianceDoc[],
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    for (const doc of historyDocs) {
      if (!doc.uploadedAt) continue;
      events.push({
        title: doc.version > 1 ? `Version ${doc.version} uploaded` : 'Document uploaded',
        timestamp: doc.uploadedAt,
        note: doc.uploadedFileName || null,
      });

      if (doc.reviewedAt) {
        events.push({
          title: doc.status === 'APPROVED' ? 'Reviewed and approved' : 'Returned with query',
          timestamp: doc.reviewedAt,
          note: doc.remarks,
        });
      }
    }

    if (!historyDocs.length && latestDoc?.uploadedAt) {
      events.push({
        title: latestDoc.version > 1 ? `Version ${latestDoc.version} uploaded` : 'Document uploaded',
        timestamp: latestDoc.uploadedAt,
        note: latestDoc.uploadedFileName || null,
      });
    }

    if (item.document?.uploaderRemarks && item.document?.uploadedAt) {
      events.push({
        title: 'Uploader remarks added',
        timestamp: item.document.uploadedAt,
        note: item.document.uploaderRemarks,
      });
    }

    return events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  private extractLawAreas(items: ChecklistItem[]): string[] {
    return Array.from(new Set(items.map((item) => item.lawArea).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }

  private extractCategories(items: ChecklistItem[]): string[] {
    return Array.from(new Set(items.map((item) => item.category || 'Other'))).sort((a, b) =>
      a.localeCompare(b),
    );
  }

  private matchesStatusFilter(item: ChecklistItem): boolean {
    switch (this.statusFilter) {
      case 'PENDING_UPLOAD':
        return this.statusOf(item) === 'NOT_UPLOADED' || this.statusOf(item) === 'OVERDUE';
      case 'QUERY_PENDING':
        return this.isQueryPending(item);
      case 'SUBMITTED':
        return this.statusOf(item) === 'SUBMITTED' || this.statusOf(item) === 'RESUBMITTED';
      case 'APPROVED':
        return this.statusOf(item) === 'APPROVED';
      case 'ALL':
      default:
        return true;
    }
  }

  private buildLatestDocMap(docs: ComplianceDoc[]): Map<string, ComplianceDoc> {
    const out = new Map<string, ComplianceDoc>();
    for (const doc of docs) {
      const existing = out.get(doc.returnCode);
      if (!existing) {
        out.set(doc.returnCode, doc);
        continue;
      }
      const currentTs = new Date(existing.uploadedAt || 0).getTime();
      const nextTs = new Date(doc.uploadedAt || 0).getTime();
      if (nextTs >= currentTs) {
        out.set(doc.returnCode, doc);
      }
    }
    return out;
  }

  private buildDocsByCodeMap(docs: ComplianceDoc[]): Map<string, ComplianceDoc[]> {
    const out = new Map<string, ComplianceDoc[]>();
    for (const doc of docs) {
      const bucket = out.get(doc.returnCode) || [];
      bucket.push(doc);
      out.set(doc.returnCode, bucket);
    }
    for (const [code, bucket] of out) {
      bucket.sort((a, b) => {
        const aTs = new Date(a.uploadedAt || 0).getTime();
        const bTs = new Date(b.uploadedAt || 0).getTime();
        if (bTs !== aTs) return bTs - aTs;
        return (b.version || 0) - (a.version || 0);
      });
      out.set(code, bucket);
    }
    return out;
  }

  private computeMonthlyDueDate(year: number, month: number, dueDay: number): string {
    let dueMonth = month + 1;
    let dueYear = year;
    if (dueMonth > 12) {
      dueMonth = 1;
      dueYear += 1;
    }
    return `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private daysBetween(start: Date, end: Date): number {
    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }
}

import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { catchError, finalize, of, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';
import { CrmContractorDocumentsApi } from '../../../core/api/crm-contractor-documents.api';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';
import { PageHeaderComponent, LoadingSpinnerComponent, ClientContextStripComponent } from '../../../shared/ui';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { McdRowDto } from '../../../shared/models/compliance.models';

type TrackerTab = 'DOCS' | 'MCD' | 'EXPIRY' | 'AUDIT_CLOSURES' | 'TASKS';

@Component({
  selector: 'app-crm-compliance',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderComponent, LoadingSpinnerComponent, ClientContextStripComponent],
  templateUrl: './crm-compliance.component.html',
  styleUrls: ['./crm-compliance.component.scss'],
})
export class CrmComplianceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  activeTab: TrackerTab = 'DOCS';

  /* ═══════ Shared ═══════ */
  clients: any[] = [];
  branches: any[] = [];
  yearOptions: number[] = [];
  /** Non-empty when navigated from a client workspace (/crm/clients/:clientId/…) */
  routeClientId = '';
  monthOptions = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' }, { value: 4, label: 'April' },
    { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];

  /* ═══════ Tab 1: Documents (Work Queue) ═══════ */
  docKpis: any = { uploaded: 0, pending_review: 0, approved: 0, reupload_required: 0, expired: 0 };
  docs: any[] = [];
  complianceDocs: any[] = [];
  docLoading = false;
  complianceDocsLoading = false;
  docErrorMsg: string | null = null;
  docFilters: any = {
    clientId: '', branchId: '', status: '', contractorId: '', expiringInDays: '',
  };
  reviewingDocId: string | null = null;
  reviewingCompDocId: string | null = null;
  reuploadBacklog: any = null;
  /* Compliance upload on behalf */
  showComplianceUpload = false;
  complianceUploading = false;
  complianceUploadFile: File | null = null;
  complianceReturnMaster: any[] = [];
  compUploadForm: any = { branchId: '', returnCode: '', frequency: 'MONTHLY', periodYear: new Date().getFullYear(), periodMonth: new Date().getMonth() + 1, remarks: '' };

  /* ═══════ Tab 2: MCD Tracker ═══════ */
  mcdRows: McdRowDto[] = [];
  mcdLoading = false;
  mcdYear = new Date().getFullYear();
  mcdMonth = new Date().getMonth() + 1;
  mcdClientId = '';
  finalizingBranchId: string | null = null;
  expandedMcdBranchId: string | null = null;
  mcdItems: any[] = [];
  mcdItemsLoading = false;
  mcdUploadingItemId: number | null = null;
  approvingItemId: number | null = null;
  rejectingItemId: number | null = null;
  rejectRemarks = '';

  /** Computed YYYY-MM key from mcdYear + mcdMonth */
  get mcdMonthKey(): string {
    return `${this.mcdYear}-${String(this.mcdMonth).padStart(2, '0')}`;
  }

  /* ═══════ Tab 3: Expiry / Renewals ═══════ */
  expiryDocs: any[] = [];
  expiryLoading = false;
  expiryDays = 30;

  /* ═══════ Tab 4: Audit Closures ═══════ */
  auditClosures: any[] = [];
  auditClosuresLoading = false;
  auditClosuresClientId = '';
  closingObsId: string | null = null;

  /* ═══════ Safe row helpers (camelCase / snake_case) ═══════ */
  private pick<T = any>(row: any, ...keys: string[]): T | undefined {
    for (const k of keys) {
      if (row && row[k] !== undefined && row[k] !== null) {
        return row[k];
      }
    }
    return undefined;
  }

  getBranchId(row: any): string {
    return this.pick<string>(row, 'branchId', 'branch_id') || '';
  }

  getBranchName(row: any): string {
    return this.pick<string>(row, 'branchName', 'branch_name') || '-';
  }

  getClientName(row: any): string {
    return this.pick<string>(row, 'clientName', 'client_name') || '-';
  }

  getPct(row: any, keyCamel: string, keySnake: string): number {
    return Number(this.pick(row, keyCamel, keySnake) || 0);
  }

  getAuditId(row: any): string {
    return this.pick<string>(row, 'auditId', 'audit_id') || '';
  }

  getAuditCode(row: any): string {
    return this.pick<string>(row, 'auditCode', 'audit_code') || '';
  }

  /* ═══════ Thresholds (tune anytime) ═══════ */
  mcdWarnPct = 70;
  mcdCriticalPct = 50;
  auditWarnPct = 70;
  auditCriticalPct = 50;

  /* ═══════ UI helpers ═══════ */
  pctClass(pct: number): string {
    if (pct < this.mcdCriticalPct) return 'bg-red-100 text-red-800';
    if (pct < this.mcdWarnPct) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  }

  barClass(pct: number): string {
    if (pct < this.mcdCriticalPct) return 'bg-red-500';
    if (pct < this.mcdWarnPct) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  rowHighlightClass(pct: number): string {
    if (pct < this.mcdCriticalPct) return 'bg-red-50';
    if (pct < this.mcdWarnPct) return 'bg-yellow-50';
    return '';
  }

  clampPct(pct: number): number {
    const n = Number(pct || 0);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  /* ═══════ Auto-reload hooks ═══════ */
  onMcdFilterChange(): void {
    if (this.activeTab === 'MCD') this.loadMcd();
  }

  onAuditFilterChange(): void {
    if (this.activeTab === 'AUDIT_CLOSURES') this.loadAuditClosures();
  }

  /* ═══════ Top N lowest MCD branches ═══════ */
  getTopLowestMcdBranches(limit = 5): any[] {
    const rows = Array.isArray(this.mcdRows) ? this.mcdRows : [];
    return rows
      .map((r) => ({
        row: r,
        pct: this.clampPct(this.getPct(r, 'pct', 'pct')),
        branchName: this.getBranchName(r),
        clientName: this.getClientName(r),
        branchId: this.getBranchId(r),
        pending: Number(this.pick(r, 'pending') ?? 0),
        returned: Number(this.pick(r, 'returned') ?? 0),
        uploaded: Number(this.pick(r, 'uploaded') ?? 0),
        totalApplicable: Number(this.pick(r, 'totalApplicable', 'total_applicable') ?? 0),
        finalized: !!this.pick(r, 'finalized'),
      }))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, limit);
  }

  /* ═══════ Jump to DOCS from MCD card ═══════ */
  jumpToDocsFromMcdCard(item: any): void {
    const branchId = item?.branchId || this.getBranchId(item?.row);
    const clientName = item?.clientName || this.getClientName(item?.row);

    // Resolve clientId from name using loaded clients list
    const clientId =
      this.pick(item?.row, 'clientId', 'client_id') ||
      (Array.isArray(this.clients)
        ? (this.clients.find((c: any) => (c.name || c.clientName) === clientName)?.id ||
           this.clients.find((c: any) => (c.client_name || c.clientName) === clientName)?.id)
        : undefined);

    // Apply filters
    if (clientId) this.docFilters.clientId = clientId;
    this.docFilters.branchId = branchId;
    this.docFilters.contractorId = '';
    this.docFilters.status = '';
    this.docFilters.expiringInDays = '';

    // Populate branches dropdown for DOCS tab
    if (clientId) {
      this.crmClientsApi.getBranchesForClient(clientId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (b: any) => { this.branches = b || []; this.cdr.detectChanges(); },
        error: () => this.toast.error('Failed to load branches for selected client.'),
      });
    }

    // Switch tab and load docs
    this.activeTab = 'DOCS';
    this.loadDocKpis();
    this.loadDocs();
  }

  /* ═══════ Export Pack (blob download) ═══════ */
  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  exportingPack = false;

  exportMcdPack(): void {
    this.exportingPack = true;
    const query = {
      clientId: this.mcdClientId || undefined,
      month: this.mcdMonthKey,
      type: 'MCD',
    };
    this.complianceApi.exportPack(query)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.exportingPack = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (blob) => {
          this.downloadBlob(blob, `MCD_Export_${this.mcdMonthKey}.zip`);
          this.toast.success('Export downloaded.');
        },
        error: () => { this.toast.error('Failed to export pack. Please try again.'); },
      });
  }

  /* ═══════ Tab 5: Tasks — redirects to dedicated page ═══════ */

  constructor(
    private complianceApi: ComplianceApiService,
    private cdr: ChangeDetectorRef,
    private crmClientsApi: CrmClientsApi,
    private crmDocsApi: CrmContractorDocumentsApi,
    private route: ActivatedRoute,
    private router: Router,
    private dialog: ConfirmDialogService,
    private toast: ToastService,
  ) {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 3; y <= currentYear + 1; y++) this.yearOptions.push(y);
  }

  ngOnInit(): void {
    this.loadClients();
    // Auto-populate clientId from route if navigated from client workspace
    // clientId lives in a parent route segment: /crm/clients/:clientId/compliance-tracker
    let routeClientId = '';
    let snap: any = this.route.snapshot;
    while (snap && !routeClientId) {
      routeClientId = snap.paramMap.get('clientId') || '';
      snap = snap.parent;
    }
    if (routeClientId) {
      this.routeClientId = routeClientId;
      this.docFilters.clientId = routeClientId;
      this.mcdClientId = routeClientId;
      this.auditClosuresClientId = routeClientId;
      // Pre-load branches for the selected client workspace
      this.onClientChange('doc');
    }
    // Support deep-link ?tab=DOCS&status=REJECTED etc.
    const qp = this.route.snapshot.queryParams;
    if (qp['tab'] && ['DOCS', 'MCD', 'EXPIRY', 'AUDIT_CLOSURES', 'TASKS'].includes(qp['tab'])) {
      this.activeTab = qp['tab'] as TrackerTab;
    }
    if (qp['status']) this.docFilters.status = qp['status'];
    this.onTabSwitch(this.activeTab);
  }

  goBack(): void {
    this.router.navigate(['/crm/dashboard']);
  }

  /* ─── Tab switching ─── */
  switchTab(tab: string): void {
    this.activeTab = tab as TrackerTab;
    this.onTabSwitch(this.activeTab);
  }

  private onTabSwitch(tab: TrackerTab): void {
    switch (tab) {
      case 'DOCS':   this.loadDocKpis(); this.loadDocs(); this.loadComplianceDocs(); this.loadReuploadBacklog(); break;
      case 'MCD':    this.loadMcd(); break;
      case 'EXPIRY': this.loadExpiry(); break;
      case 'AUDIT_CLOSURES': this.loadAuditClosures(); break;
      case 'TASKS':  break; // Tasks tab now links to dedicated page
    }
  }

  /* ─── Shared: clients / branches ─── */
  loadClients(): void {
    this.crmClientsApi.getAssignedClients().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => { this.clients = data || []; this.cdr.detectChanges(); },
      error: () => { this.toast.error('Failed to load clients.'); },
    });
  }

  onClientChange(source: 'doc' | 'mcd' | 'audit'): void {
    this.branches = [];
    let clientId = '';
    if (source === 'doc') { this.docFilters.branchId = ''; clientId = this.docFilters.clientId; }
    else if (source === 'mcd') { clientId = this.mcdClientId; }
    else if (source === 'audit') { clientId = this.auditClosuresClientId; }
    if (clientId) {
      this.crmClientsApi.getBranchesForClient(clientId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (data) => { this.branches = data || []; this.cdr.detectChanges(); },
        error: () => { this.toast.error('Failed to load branches.'); },
      });
    }
  }

  /* ═══════ Tab 1: Documents ═══════ */
  loadDocKpis(): void {
    this.crmDocsApi.kpis().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => { this.docKpis = data; this.cdr.detectChanges(); },
      error: () => { this.toast.error('Failed to load document KPIs.'); },
    });
  }

  loadReuploadBacklog(): void {
    this.complianceApi.crmGetReuploadBacklog().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => { this.reuploadBacklog = res; this.cdr.detectChanges(); },
      error: () => { this.toast.error('Failed to load reupload backlog.'); },
    });
  }

  filterDocsByKpi(status: string): void {
    this.docFilters.status = status;
    this.loadDocs();
  }

  loadDocs(): void {
    this.docLoading = true; this.docErrorMsg = null;
    this.crmDocsApi.list(this.docFilters).pipe(
      takeUntil(this.destroy$),
      catchError((err) => { this.docErrorMsg = err?.error?.message || 'Failed to load documents'; return of({ data: [] }); }),
      finalize(() => { this.docLoading = false; this.cdr.detectChanges(); }),
    ).subscribe((res: any) => { this.docs = res?.data || res || []; });
  }

  async reviewDoc(doc: any, status: string): Promise<void> {
    const label = status === 'REJECTED' ? 'Rejection reason (required):' : 'Review notes (optional):';
    const result = await this.dialog.prompt(status === 'REJECTED' ? 'Reject Document' : 'Review Document', label, { placeholder: 'Notes' });
    if (!result.confirmed) return;
    const notes = result.value || '';
    if (status === 'REJECTED' && !notes.trim()) return;
    this.reviewingDocId = doc.id;
    this.crmDocsApi.review(doc.id, { status, reviewNotes: notes }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.reviewingDocId = null; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => { this.loadDocs(); this.loadDocKpis(); },
      error: (e) => { this.docErrorMsg = e?.error?.message || 'Failed to review document. Please try again.'; },
    });
  }

  /* ─── Compliance Returns ─── */
  loadComplianceDocs(): void {
    this.complianceDocsLoading = true;
    const query: any = {};
    if (this.docFilters.clientId) query.companyId = this.docFilters.clientId;
    if (this.docFilters.branchId) query.branchId = this.docFilters.branchId;
    this.complianceApi.crmListBranchCompliance(query).pipe(
      takeUntil(this.destroy$),
      catchError(() => of({ data: [] })),
      finalize(() => { this.complianceDocsLoading = false; this.cdr.detectChanges(); }),
    ).subscribe((res: any) => { this.complianceDocs = res?.data || res || []; });
  }

  async reviewComplianceDoc(doc: any, status: string): Promise<void> {
    const isReject = status === 'REUPLOAD_REQUIRED';
    const label = isReject ? 'Rejection reason (required):' : 'Review notes (optional):';
    const result = await this.dialog.prompt(isReject ? 'Request Reupload' : 'Approve Document', label, { placeholder: 'Notes' });
    if (!result.confirmed) return;
    const remarks = result.value || '';
    if (isReject && !remarks.trim()) return;
    this.reviewingCompDocId = doc.id;
    this.complianceApi.crmReviewBranchCompliance(doc.id, { status, remarks }).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.reviewingCompDocId = null; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => { this.loadComplianceDocs(); },
      error: (e) => { this.toast.error(e?.error?.message || 'Failed to review document.'); },
    });
  }

  /* ─── Compliance Upload On Behalf ─── */
  loadReturnMaster(): void {
    if (this.complianceReturnMaster.length) return;
    this.complianceApi.crmGetReturnMaster().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => { this.complianceReturnMaster = data || []; this.cdr.detectChanges(); },
    });
  }

  onComplianceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.complianceUploadFile = input.files?.[0] || null;
  }

  submitComplianceUpload(): void {
    const f = this.compUploadForm;
    if (!f.branchId || !f.returnCode || !f.periodYear || !this.complianceUploadFile) {
      this.toast.error('Branch, Return, Period Year, and File are required.');
      return;
    }
    const fd = new FormData();
    fd.append('file', this.complianceUploadFile);
    fd.append('companyId', this.docFilters.clientId || this.routeClientId);
    fd.append('branchId', f.branchId);
    fd.append('returnCode', f.returnCode);
    fd.append('frequency', f.frequency);
    fd.append('periodYear', String(f.periodYear));
    if (f.frequency === 'MONTHLY' && f.periodMonth) fd.append('periodMonth', String(f.periodMonth));
    if (f.frequency === 'QUARTERLY' && f.periodQuarter) fd.append('periodQuarter', String(f.periodQuarter));
    if (f.frequency === 'HALF_YEARLY' && f.periodHalf) fd.append('periodHalf', String(f.periodHalf));
    if (f.remarks) fd.append('remarks', f.remarks);

    this.complianceUploading = true;
    this.complianceApi.crmUploadOnBehalf(fd).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.complianceUploading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        this.toast.success('Document uploaded on behalf of branch.');
        this.showComplianceUpload = false;
        this.complianceUploadFile = null;
        this.compUploadForm = { branchId: '', returnCode: '', frequency: 'MONTHLY', periodYear: new Date().getFullYear(), periodMonth: new Date().getMonth() + 1, remarks: '' };
        this.loadComplianceDocs();
      },
      error: (e) => this.toast.error(e?.error?.message || 'Upload failed'),
    });
  }

  /* ═══════ Tab 2: MCD Tracker (via ComplianceApiService) ═══════ */
  loadMcd(): void {
    this.mcdLoading = true;
    this.complianceApi.crmGetMcd({ clientId: this.mcdClientId || undefined, year: this.mcdYear, month: this.mcdMonth })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.mcdLoading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res: any) => { this.mcdRows = res?.data || res || []; },
        error: () => { this.mcdRows = []; this.toast.error('Failed to load MCD. Please try again.'); },
      });
  }

  async finalizeMcd(branchId: string): Promise<void> {
    const match = this.mcdRows.find(r => this.getBranchId(r) === branchId);
    const name = match ? this.getBranchName(match) : branchId;
    if (!(await this.dialog.confirm('Finalize MCD', `Finalize MCD for ${name} (${this.mcdMonthKey})?`))) return;
    this.finalizingBranchId = branchId;
    this.complianceApi.crmFinalizeMcd(branchId, { year: this.mcdYear, month: this.mcdMonth })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.finalizingBranchId = null; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => { this.toast.success('MCD finalized successfully.'); this.loadMcd(); },
        error: (e) => { this.toast.error(e?.error?.message || 'Failed to finalize MCD. Please try again.'); },
      });
  }

  toggleMcdItems(row: any): void {
    const branchId = this.getBranchId(row);
    if (this.expandedMcdBranchId === branchId) {
      this.expandedMcdBranchId = null;
      this.mcdItems = [];
      return;
    }
    this.expandedMcdBranchId = branchId;
    this.mcdItemsLoading = true;
    this.mcdItems = [];
    this.complianceApi.crmGetMcdItems(branchId, { year: this.mcdYear, month: this.mcdMonth })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.mcdItemsLoading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res: any) => { this.mcdItems = res?.data || []; },
        error: () => { this.mcdItems = []; this.toast.error('Failed to load MCD items.'); },
      });
  }

  onMcdItemFileSelected(event: Event, item: any): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.mcdUploadingItemId = item.id;
    this.complianceApi.crmUploadMcdItem(item.id, file)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.mcdUploadingItemId = null; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.toast.success('Evidence uploaded successfully.');
          // Refresh the items list
          item.status = 'SUBMITTED';
          const branchId = this.expandedMcdBranchId;
          if (branchId) {
            this.complianceApi.crmGetMcdItems(branchId, { year: this.mcdYear, month: this.mcdMonth })
              .pipe(takeUntil(this.destroy$))
              .subscribe({ next: (res: any) => { this.mcdItems = res?.data || []; this.cdr.detectChanges(); } });
          }
          this.loadMcd();
        },
        error: (e) => { this.toast.error(e?.error?.message || 'Upload failed.'); },
      });
    input.value = '';
  }

  approveMcdItem(item: any): void {
    this.approvingItemId = item.id;
    this.complianceApi.crmApproveMcdItem(item.id)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.approvingItemId = null; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.toast.success('Item approved.');
          item.status = 'APPROVED';
          const branchId = this.expandedMcdBranchId;
          if (branchId) {
            this.complianceApi.crmGetMcdItems(branchId, { year: this.mcdYear, month: this.mcdMonth })
              .pipe(takeUntil(this.destroy$))
              .subscribe({ next: (res: any) => { this.mcdItems = res?.data || []; this.cdr.detectChanges(); } });
          }
          this.loadMcd();
        },
        error: (e) => { this.toast.error(e?.error?.message || 'Approve failed.'); },
      });
  }

  startRejectMcdItem(item: any): void {
    this.rejectingItemId = item.id;
    this.rejectRemarks = '';
  }

  cancelReject(): void {
    this.rejectingItemId = null;
    this.rejectRemarks = '';
  }

  confirmRejectMcdItem(item: any): void {
    if (!this.rejectRemarks.trim()) {
      this.toast.error('Remarks are required when rejecting.');
      return;
    }
    this.complianceApi.crmRejectMcdItem(item.id, this.rejectRemarks.trim())
      .pipe(takeUntil(this.destroy$), finalize(() => { this.rejectingItemId = null; this.rejectRemarks = ''; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.toast.success('Item rejected.');
          item.status = 'REJECTED';
          item.remarks = this.rejectRemarks.trim();
          const branchId = this.expandedMcdBranchId;
          if (branchId) {
            this.complianceApi.crmGetMcdItems(branchId, { year: this.mcdYear, month: this.mcdMonth })
              .pipe(takeUntil(this.destroy$))
              .subscribe({ next: (res: any) => { this.mcdItems = res?.data || []; this.cdr.detectChanges(); } });
          }
          this.loadMcd();
        },
        error: (e) => { this.toast.error(e?.error?.message || 'Reject failed.'); },
      });
  }

  /* ═══════ Tab 3: Expiry / Renewals ═══════ */
  loadExpiry(): void {
    this.expiryLoading = true;
    this.crmDocsApi.list({ expiringInDays: this.expiryDays })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.expiryLoading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res) => { this.expiryDocs = res?.data || []; },
        error: () => { this.expiryDocs = []; this.toast.error('Failed to load expiring documents.'); },
      });
  }

  /* ═══════ Tab 4: Audit Closures (via ComplianceApiService) ═══════ */
  loadAuditClosures(): void {
    this.auditClosuresLoading = true;
    this.complianceApi.crmGetAuditClosures({ clientId: this.auditClosuresClientId || undefined })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.auditClosuresLoading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res: any) => { this.auditClosures = res?.data || res || []; },
        error: () => { this.auditClosures = []; this.toast.error('Failed to load audit closures. Please try again.'); },
      });
  }

  async closeObservation(auditId: string): Promise<void> {
    const result = await this.dialog.prompt('Close Observation', 'Closure notes (optional):', { placeholder: 'Notes' });
    if (!result.confirmed) return;
    const notes = result.value || '';
    this.closingObsId = auditId;
    this.complianceApi.crmCloseAuditObservation(auditId, { notes })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.closingObsId = null; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => { this.toast.success('Observation closed successfully.'); this.loadAuditClosures(); },
        error: (e) => { this.toast.error(e?.error?.message || 'Failed to close observation. Please try again.'); },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

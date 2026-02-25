import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { catchError, finalize, of, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { ComplianceService } from '../../../core/compliance.service';
import { CrmClientsApi } from '../../../core/api/crm-clients.api';
import { CrmContractorDocumentsApi } from '../../../core/api/crm-contractor-documents.api';
import { CrmComplianceTrackerApi } from '../../../core/api/crm-compliance-tracker.api';
import { PageHeaderComponent, LoadingSpinnerComponent, StatusBadgeComponent, ActionButtonComponent } from '../../../shared/ui';

type TrackerTab = 'DOCS' | 'MCD' | 'EXPIRY' | 'AUDIT_CLOSURES' | 'TASKS';

@Component({
  selector: 'app-crm-compliance',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, StatusBadgeComponent, ActionButtonComponent],
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
  docLoading = false;
  docErrorMsg: string | null = null;
  docFilters: any = {
    clientId: '', branchId: '', status: '', contractorId: '', expiringInDays: '',
  };
  reviewingDocId: string | null = null;

  /* ═══════ Tab 2: MCD Tracker ═══════ */
  mcdRows: any[] = [];
  mcdLoading = false;
  mcdYear = new Date().getFullYear();
  mcdMonth = new Date().getMonth() + 1;
  mcdClientId = '';
  finalizingBranchId: string | null = null;

  /* ═══════ Tab 3: Expiry / Renewals ═══════ */
  expiryDocs: any[] = [];
  expiryLoading = false;
  expiryDays = 30;

  /* ═══════ Tab 4: Audit Closures ═══════ */
  auditClosures: any[] = [];
  auditClosuresLoading = false;
  auditClosuresClientId = '';
  closingObsId: string | null = null;

  /* ═══════ Tab 5: Tasks (legacy) ═══════ */
  tasks: any[] = [];
  tasksLoading = true;
  tasksErrorMsg: string | null = null;
  tasksFilters: any = { clientId: '', branchId: '', status: '', year: '', month: '' };
  selectedTask: any = null;
  taskDetail: any = null;
  taskActionInProgress = false;

  constructor(
    private compliance: ComplianceService,
    private cdr: ChangeDetectorRef,
    private crmClientsApi: CrmClientsApi,
    private crmDocsApi: CrmContractorDocumentsApi,
    private trackerApi: CrmComplianceTrackerApi,
    private route: ActivatedRoute,
  ) {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 3; y <= currentYear + 1; y++) this.yearOptions.push(y);
  }

  ngOnInit(): void {
    this.loadClients();
    // Support deep-link ?tab=DOCS&status=REJECTED etc.
    const qp = this.route.snapshot.queryParams;
    if (qp['tab'] && ['DOCS', 'MCD', 'EXPIRY', 'AUDIT_CLOSURES', 'TASKS'].includes(qp['tab'])) {
      this.activeTab = qp['tab'] as TrackerTab;
    }
    if (qp['status']) this.docFilters.status = qp['status'];
    this.onTabSwitch(this.activeTab);
  }

  /* ─── Tab switching ─── */
  switchTab(tab: string): void {
    this.activeTab = tab as TrackerTab;
    this.onTabSwitch(this.activeTab);
  }

  private onTabSwitch(tab: TrackerTab): void {
    switch (tab) {
      case 'DOCS':   this.loadDocKpis(); this.loadDocs(); break;
      case 'MCD':    this.loadMcd(); break;
      case 'EXPIRY': this.loadExpiry(); break;
      case 'AUDIT_CLOSURES': this.loadAuditClosures(); break;
      case 'TASKS':  this.loadTasks(); break;
    }
  }

  /* ─── Shared: clients / branches ─── */
  loadClients(): void {
    this.crmClientsApi.getAssignedClients().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => { this.clients = data || []; this.cdr.detectChanges(); },
      error: () => {},
    });
  }

  onClientChange(source: 'doc' | 'mcd' | 'audit' | 'task'): void {
    this.branches = [];
    let clientId = '';
    if (source === 'doc') { this.docFilters.branchId = ''; clientId = this.docFilters.clientId; }
    else if (source === 'mcd') { clientId = this.mcdClientId; }
    else if (source === 'audit') { clientId = this.auditClosuresClientId; }
    else if (source === 'task') { this.tasksFilters.branchId = ''; clientId = this.tasksFilters.clientId; }
    if (clientId) {
      this.crmClientsApi.getBranchesForClient(clientId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (data) => { this.branches = data || []; this.cdr.detectChanges(); },
        error: () => {},
      });
    }
  }

  /* ═══════ Tab 1: Documents ═══════ */
  loadDocKpis(): void {
    this.crmDocsApi.kpis().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => { this.docKpis = data; this.cdr.detectChanges(); },
      error: () => {},
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

  reviewDoc(doc: any, status: string): void {
    const notes = prompt(status === 'REJECTED' ? 'Rejection reason (required):' : 'Review notes (optional):') || '';
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

  /* ═══════ Tab 2: MCD Tracker ═══════ */
  loadMcd(): void {
    this.mcdLoading = true;
    this.trackerApi.getMcd({ year: this.mcdYear, month: this.mcdMonth, clientId: this.mcdClientId || undefined })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.mcdLoading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res) => { this.mcdRows = res?.data || []; },
        error: () => { this.mcdRows = []; },
      });
  }

  finalizeMcd(row: any): void {
    if (!confirm(`Finalize all MCD items for ${row.branchName}?`)) return;
    this.finalizingBranchId = row.branchId;
    this.trackerApi.finalizeMcd(row.branchId, this.mcdYear, this.mcdMonth)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.finalizingBranchId = null; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => this.loadMcd(),
        error: (e) => { alert(e?.error?.message || 'Failed to finalize MCD. Please try again.'); },
      });
  }

  /* ═══════ Tab 3: Expiry / Renewals ═══════ */
  loadExpiry(): void {
    this.expiryLoading = true;
    this.crmDocsApi.list({ expiringInDays: this.expiryDays })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.expiryLoading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res) => { this.expiryDocs = res?.data || []; },
        error: () => { this.expiryDocs = []; },
      });
  }

  /* ═══════ Tab 4: Audit Closures ═══════ */
  loadAuditClosures(): void {
    this.auditClosuresLoading = true;
    this.trackerApi.getAuditClosures(this.auditClosuresClientId || undefined)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.auditClosuresLoading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res) => { this.auditClosures = res?.data || []; },
        error: () => { this.auditClosures = []; },
      });
  }

  closeObservation(auditRow: any): void {
    const notes = prompt('Closure notes (optional):') || '';
    this.closingObsId = auditRow.auditId;
    // Close all open observations for this audit — simplified to first open
    this.trackerApi.closeObservation(auditRow.auditId, notes)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.closingObsId = null; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => this.loadAuditClosures(),
        error: (e) => { alert(e?.error?.message || 'Failed to close observation. Please try again.'); },
      });
  }

  /* ═══════ Tab 5: Tasks (legacy) ═══════ */
  loadTasks(): void {
    this.tasksLoading = true; this.tasksErrorMsg = null;
    this.compliance.crmListTasks(this.tasksFilters).pipe(
      takeUntil(this.destroy$),
      catchError((err) => { this.tasksErrorMsg = err?.error?.message || 'Failed to load tasks'; return of({ data: [] }); }),
      finalize(() => { this.tasksLoading = false; this.cdr.detectChanges(); }),
    ).subscribe((res: any) => { this.tasks = res?.data || []; });
  }

  openTask(task: any): void {
    this.selectedTask = task;
    this.compliance.crmTaskDetail(task.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => { this.taskDetail = res; this.cdr.detectChanges(); },
      error: () => { this.taskDetail = null; this.cdr.detectChanges(); },
    });
  }

  approveTask(): void {
    if (this.taskActionInProgress) return;
    const remarks = prompt('Remarks (optional)') || '';
    this.taskActionInProgress = true;
    this.compliance.crmApprove(this.selectedTask.id, remarks).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.taskActionInProgress = false; this.loadTasks(); this.openTask(this.selectedTask); },
      error: () => { this.taskActionInProgress = false; },
    });
  }

  rejectTask(): void {
    if (this.taskActionInProgress) return;
    const remarks = prompt('Reason (required)') || '';
    if (!remarks.trim()) return;
    this.taskActionInProgress = true;
    this.compliance.crmReject(this.selectedTask.id, remarks.trim()).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.taskActionInProgress = false; this.loadTasks(); this.openTask(this.selectedTask); },
      error: () => { this.taskActionInProgress = false; },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import {
  PayrollApiService,
  PayrollClient,
  PayrollFnfDetail,
  PayrollFnfItem,
} from './payroll-api.service';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from '../../shared/toast/toast.service';
import { ClientContextStripComponent } from '../../shared/ui/client-context-strip/client-context-strip.component';

type FnfLifecycleFilter = 'ALL' | 'INITIATED' | 'UNDER_REVIEW' | 'APPROVED' | 'SETTLED' | 'DOCS_ISSUED' | 'COMPLETED';
type LifecycleAction = 'UNDER_REVIEW' | 'APPROVED' | 'SETTLED' | 'DOCS_ISSUED' | 'COMPLETED';

interface SettlementBreakup {
  pendingSalary: number;
  leaveEncashment: number;
  bonusArrears: number;
  deductions: number;
  recoveries: number;
}

interface TimelineEvent {
  label: string;
  detail: string;
  at: string | null;
}

interface ChecklistItem {
  label: string;
  done: boolean;
}

@Component({
  selector: 'app-payroll-fnf',
  standalone: true,
  imports: [CommonModule, FormsModule, ClientContextStripComponent],
  templateUrl: './payroll-fnf.component.html',
  styleUrls: ['./payroll-fnf.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollFnfComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = true;
  detailLoading = false;
  actionBusy = false;
  showCreateModal = false;

  clients: PayrollClient[] = [];
  cases: PayrollFnfItem[] = [];
  selectedCase: PayrollFnfDetail | null = null;

  // Settlement documents
  fnfDocuments: any[] = [];
  fnfDocsLoading = false;
  fnfDocUploading = false;
  fnfDocType = 'SETTLEMENT_STATEMENT';
  fnfDocName = '';
  fnfDocRemarks = '';

  readonly fnfDocTypeOptions = [
    { value: 'SETTLEMENT_STATEMENT', label: 'Settlement Statement' },
    { value: 'RELIEVING_LETTER', label: 'Relieving Letter' },
    { value: 'EXPERIENCE_CERTIFICATE', label: 'Experience Certificate' },
    { value: 'NO_DUES_CERTIFICATE', label: 'No Dues Certificate' },
    { value: 'FORM_16', label: 'Form 16' },
    { value: 'PF_WITHDRAWAL', label: 'PF Withdrawal Form' },
    { value: 'GRATUITY_FORM', label: 'Gratuity Form' },
    { value: 'SALARY_SLIP', label: 'Final Salary Slip' },
    { value: 'OTHER', label: 'Other' },
  ];

  lifecycleFilter: FnfLifecycleFilter = 'ALL';
  selectedClientId = '';
  searchText = '';
  page = 1;
  pageSize = 20;
  totalCount = 0;

  settlementInputs: SettlementBreakup = this.defaultBreakup();
  settlementAmountInput = 0;
  statusRemarks = '';
  documentChecklistDraft: ChecklistItem[] = [];

  createModel = {
    clientId: '',
    employeeId: '',
    separationDate: '',
    lastWorkingDay: '',
    reason: 'RESIGNATION',
    remarks: '',
  };

  readonly lifecycleTabs: { key: FnfLifecycleFilter; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'INITIATED', label: 'Initiated' },
    { key: 'UNDER_REVIEW', label: 'Under Review' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'SETTLED', label: 'Settled' },
    { key: 'DOCS_ISSUED', label: 'Docs Issued' },
    { key: 'COMPLETED', label: 'Completed' },
  ];

  readonly reasonOptions = [
    { value: 'RESIGNATION', label: 'Resignation' },
    { value: 'TERMINATION', label: 'Termination' },
    { value: 'RETIREMENT', label: 'Retirement' },
    { value: 'END_OF_CONTRACT', label: 'End of Contract' },
    { value: 'ABSCONDING', label: 'Absconding' },
    { value: 'OTHER', label: 'Other' },
  ];

  constructor(
    private readonly payrollApi: PayrollApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const routeClientId = this.route.snapshot.paramMap.get('clientId') || '';
    if (routeClientId) {
      this.selectedClientId = routeClientId;
      this.createModel.clientId = routeClientId;
    }
    this.loadClientsAndCases();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get filteredCases(): PayrollFnfItem[] {
    const q = this.searchText.trim().toLowerCase();
    return this.cases.filter((row) => {
      if (!q) return true;
      const text = `${row.employeeName} ${row.employeeCode} ${row.clientName} ${row.status}`.toLowerCase();
      return text.includes(q);
    });
  }

  get initiatedCount(): number {
    return this.cases.filter((c) => this.statusKey(c.status) === 'INITIATED').length;
  }

  get reviewCount(): number {
    return this.cases.filter((c) => this.statusKey(c.status) === 'UNDER_REVIEW').length;
  }

  get approvedCount(): number {
    return this.cases.filter((c) => this.statusKey(c.status) === 'APPROVED').length;
  }

  get settledCount(): number {
    return this.cases.filter((c) => this.statusKey(c.status) === 'SETTLED').length;
  }

  get docsIssuedCount(): number {
    return this.cases.filter((c) => this.statusKey(c.status) === 'DOCS_ISSUED').length;
  }

  get completedCount(): number {
    return this.cases.filter((c) => this.statusKey(c.status) === 'COMPLETED').length;
  }

  get netSettlement(): number {
    return (
      Number(this.settlementInputs.pendingSalary || 0) +
      Number(this.settlementInputs.leaveEncashment || 0) +
      Number(this.settlementInputs.bonusArrears || 0) -
      Number(this.settlementInputs.deductions || 0) -
      Number(this.settlementInputs.recoveries || 0)
    );
  }

  get timeline(): TimelineEvent[] {
    const selected = this.selectedCase;
    if (!selected) return [];

    if (selected.history?.length) {
      return selected.history.map((event) => ({
        label: event.statusTo || event.action || 'STATUS_UPDATE',
        detail:
          event.remarks ||
          (event.settlementAmount !== null && event.settlementAmount !== undefined
            ? `Settlement amount updated to ${this.inr(event.settlementAmount)}`
            : `Moved from ${event.statusFrom || 'N/A'} to ${event.statusTo}`),
        at: event.createdAt || null,
      }));
    }

    return [
      {
        label: 'INITIATED',
        detail: 'F&F case created',
        at: selected.createdAt || null,
      },
    ];
  }

  get canMoveToUnderReview(): boolean {
    return !this.actionGuardReason('UNDER_REVIEW');
  }

  get canApprove(): boolean {
    return !this.actionGuardReason('APPROVED');
  }

  get canSettle(): boolean {
    return !this.actionGuardReason('SETTLED');
  }

  get canMarkDocsIssued(): boolean {
    return !this.actionGuardReason('DOCS_ISSUED');
  }

  get canComplete(): boolean {
    return !this.actionGuardReason('COMPLETED');
  }

  get checklistCompletion(): { done: number; total: number; percent: number } {
    const total = this.documentChecklistDraft.length;
    const done = this.documentChecklistDraft.filter((item) => item.done).length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    return { done, total, percent };
  }

  get lifecycleGuardrails(): Array<{ label: string; allowed: boolean; reason: string }> {
    return [
      this.guardrail('Under Review', 'UNDER_REVIEW'),
      this.guardrail('Approve', 'APPROVED'),
      this.guardrail('Settle', 'SETTLED'),
      this.guardrail('Docs Issued', 'DOCS_ISSUED'),
      this.guardrail('Complete', 'COMPLETED'),
    ];
  }

  get canCreateCase(): boolean {
    return !!(this.createModel.clientId && this.createModel.employeeId && this.createModel.separationDate);
  }

  trackCase(_: number, row: PayrollFnfItem): string {
    return row.id;
  }

  trackTimeline(_: number, row: TimelineEvent): string {
    return `${row.label}-${row.at || 'na'}`;
  }

  setLifecycleFilter(filter: FnfLifecycleFilter): void {
    this.lifecycleFilter = filter;
    this.page = 1;
    this.loadCases();
  }

  onFilterChange(): void {
    this.page = 1;
    this.loadCases();
  }

  openCreateModal(): void {
    this.createModel = {
      clientId: this.selectedClientId || this.clients[0]?.id || '',
      employeeId: '',
      separationDate: '',
      lastWorkingDay: '',
      reason: 'RESIGNATION',
      remarks: '',
    };
    this.showCreateModal = true;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  createCase(): void {
    if (!this.canCreateCase || this.actionBusy) return;
    this.actionBusy = true;

    this.payrollApi
      .createFnf({
        clientId: this.createModel.clientId,
        employeeId: this.createModel.employeeId.trim(),
        separationDate: this.createModel.separationDate,
        lastWorkingDay: this.createModel.lastWorkingDay || undefined,
        reason: this.createModel.reason,
        remarks: this.createModel.remarks || undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('F&F case initiated');
          this.showCreateModal = false;
          this.loadCases();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to initiate F&F case'),
      });
  }

  selectCase(row: PayrollFnfItem): void {
    this.detailLoading = true;
    this.statusRemarks = '';

    this.payrollApi
      .getFullAndFinalCaseById(row.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.detailLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (detail) => {
          this.selectedCase = detail;
          this.seedLocalInputsFromDetail(detail);
          this.loadFnfDocuments(detail.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to load F&F case detail'),
      });
  }

  closeDetail(): void {
    this.selectedCase = null;
    this.statusRemarks = '';
    this.documentChecklistDraft = [];
  }

  moveToUnderReview(): void {
    const guard = this.actionGuardReason('UNDER_REVIEW');
    if (guard) {
      this.toast.error(guard);
      return;
    }
    this.updateStatus('UNDER_REVIEW');
  }

  approveCase(): void {
    if (!this.selectedCase || this.actionBusy) return;
    const guard = this.actionGuardReason('APPROVED');
    if (guard) {
      this.toast.error(guard);
      return;
    }
    this.actionBusy = true;
    this.payrollApi
      .approveFullAndFinal(this.selectedCase.id, this.statusRemarks || undefined)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('F&F case approved');
          this.reloadAfterAction(this.selectedCase!.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Approval failed'),
      });
  }

  settleCase(): void {
    if (!this.selectedCase || this.actionBusy) return;
    const guard = this.actionGuardReason('SETTLED');
    if (guard) {
      this.toast.error(guard);
      return;
    }
    const amount = Number(this.settlementAmountInput || this.netSettlement || 0);

    this.actionBusy = true;
    this.payrollApi
      .settleFullAndFinal(
        this.selectedCase.id,
        amount,
        {
          pendingSalary: Number(this.settlementInputs.pendingSalary || 0),
          leaveEncashment: Number(this.settlementInputs.leaveEncashment || 0),
          bonusArrears: Number(this.settlementInputs.bonusArrears || 0),
          deductions: Number(this.settlementInputs.deductions || 0),
          recoveries: Number(this.settlementInputs.recoveries || 0),
        },
        this.statusRemarks || undefined,
      )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Settlement marked as settled');
          this.reloadAfterAction(this.selectedCase!.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Settlement update failed'),
      });
  }

  markDocumentsIssued(): void {
    const guard = this.actionGuardReason('DOCS_ISSUED');
    if (guard) {
      this.toast.error(guard);
      return;
    }
    this.updateStatus('DOCS_ISSUED', {
      checklist: this.documentChecklistDraft,
    });
  }

  closeCaseAsCompleted(): void {
    const guard = this.actionGuardReason('COMPLETED');
    if (guard) {
      this.toast.error(guard);
      return;
    }
    this.updateStatus('COMPLETED', {
      checklist: this.documentChecklistDraft,
    });
  }

  onChecklistToggle(index: number, checked: boolean): void {
    if (index < 0 || index >= this.documentChecklistDraft.length) return;
    const copy = [...this.documentChecklistDraft];
    copy[index] = { ...copy[index], done: checked };
    this.documentChecklistDraft = copy;
  }

  // ── Settlement Document Repository ──
  loadFnfDocuments(fnfId: string): void {
    this.fnfDocsLoading = true;
    this.payrollApi
      .listFnfDocuments(fnfId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.fnfDocsLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (docs) => (this.fnfDocuments = docs || []),
        error: () => (this.fnfDocuments = []),
      });
  }

  onFnfDocFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.selectedCase) return;

    this.fnfDocUploading = true;
    this.payrollApi
      .uploadFnfDocument(
        this.selectedCase.id,
        file,
        this.fnfDocType,
        this.fnfDocName || file.name,
        this.fnfDocRemarks || undefined,
      )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.fnfDocUploading = false;
          input.value = '';
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Document uploaded');
          this.fnfDocName = '';
          this.fnfDocRemarks = '';
          this.loadFnfDocuments(this.selectedCase!.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Upload failed'),
      });
  }

  downloadFnfDoc(doc: any): void {
    this.payrollApi.downloadFnfDocument(doc.id, doc.docName || doc.fileName);
  }

  deleteFnfDoc(doc: any): void {
    if (!confirm('Remove this document permanently?')) return;
    this.payrollApi
      .deleteFnfDocument(doc.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Document removed');
          this.loadFnfDocuments(this.selectedCase!.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Delete failed'),
      });
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  caseStatusClass(status: string): string {
    const key = this.statusKey(status);
    if (key === 'COMPLETED') return 'badge badge--good';
    if (key === 'SETTLED') return 'badge badge--good';
    if (key === 'APPROVED') return 'badge badge--info';
    if (key === 'UNDER_REVIEW' || key === 'DOCS_ISSUED') return 'badge badge--warn';
    return 'badge badge--muted';
  }

  formatDate(input?: string | null): string {
    if (!input) return '-';
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  inr(value: number | null | undefined): string {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private updateStatus(
    status: string,
    options?: {
      checklist?: Array<{ label: string; done: boolean }>;
    },
  ): void {
    if (!this.selectedCase || this.actionBusy) return;
    this.actionBusy = true;

    this.payrollApi
      .updateFnfStatus(this.selectedCase.id, status, {
        remarks: this.statusRemarks || undefined,
        checklist: options?.checklist,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(`Status updated to ${status}`);
          this.reloadAfterAction(this.selectedCase!.id);
        },
        error: (err) => this.toast.error(err?.error?.message || 'Status update failed'),
      });
  }

  private reloadAfterAction(caseId: string): void {
    this.loadCases(() => {
      const row = this.cases.find((c) => c.id === caseId);
      if (row) this.selectCase(row);
    });
  }

  private loadClientsAndCases(): void {
    this.loading = true;
    this.payrollApi
      .getAssignedClients()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.clients = rows || [];
          this.loadCases();
        },
        error: () => {
          this.clients = [];
          this.loadCases();
        },
      });
  }

  private loadCases(afterLoad?: () => void): void {
    this.loading = true;
    this.payrollApi
      .getFullAndFinalCases({
        page: this.page,
        limit: this.pageSize,
        clientId: this.selectedClientId || undefined,
        status: this.lifecycleFilter === 'ALL' ? undefined : this.lifecycleFilter,
        search: this.searchText.trim() || undefined,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.cases = (res?.data || []).map((row) => ({
            ...row,
            status: this.statusKey(row.status),
            settlementAmount:
              row.settlementAmount !== null && row.settlementAmount !== undefined
                ? Number(row.settlementAmount)
                : null,
          }));
          this.totalCount = Number(res?.total || this.cases.length);

          if (this.selectedCase) {
            const stillExists = this.cases.find((c) => c.id === this.selectedCase?.id);
            if (!stillExists) this.selectedCase = null;
          }

          if (!this.selectedCase && this.cases.length) {
            this.selectCase(this.cases[0]);
          }

          if (afterLoad) afterLoad();
        },
        error: (err) => {
          this.cases = [];
          this.totalCount = 0;
          this.toast.error(err?.error?.message || 'Failed to load F&F cases');
        },
      });
  }

  private seedLocalInputsFromDetail(detail: PayrollFnfDetail): void {
    const breakup: Record<string, number> = detail.settlementBreakup || {};
    this.settlementInputs = {
      pendingSalary: Number(breakup['pendingSalary'] || 0),
      leaveEncashment: Number(breakup['leaveEncashment'] || 0),
      bonusArrears: Number(breakup['bonusArrears'] || 0),
      deductions: Number(breakup['deductions'] || 0),
      recoveries: Number(breakup['recoveries'] || 0),
    };
    this.settlementAmountInput = detail.settlementAmount || 0;
    this.statusRemarks = detail.remarks || '';
    this.documentChecklistDraft = this.buildChecklist(detail);
  }

  statusKey(status: string): string {
    return String(status || 'INITIATED').toUpperCase();
  }

  private defaultBreakup(): SettlementBreakup {
    return {
      pendingSalary: 0,
      leaveEncashment: 0,
      bonusArrears: 0,
      deductions: 0,
      recoveries: 0,
    };
  }

  private canTransitionTo(next: string): boolean {
    if (!this.selectedCase) return false;
    const current = this.statusKey(this.selectedCase.status);
    const map: Record<string, string[]> = {
      INITIATED: ['UNDER_REVIEW', 'APPROVED'],
      UNDER_REVIEW: ['APPROVED', 'SETTLED'],
      APPROVED: ['SETTLED', 'DOCS_ISSUED'],
      SETTLED: ['DOCS_ISSUED', 'COMPLETED'],
      DOCS_ISSUED: ['COMPLETED'],
      COMPLETED: [],
    };
    return (map[current] || []).includes(next);
  }

  private buildChecklist(detail: PayrollFnfDetail): ChecklistItem[] {
    if (detail.checklist?.length) {
      return detail.checklist.map((item) => ({
        label: item.label,
        done: !!item.done,
      }));
    }

    const status = this.statusKey(detail.status);
    const docsIssued = status === 'DOCS_ISSUED' || status === 'COMPLETED';
    const completed = status === 'COMPLETED';

    return [
      { label: 'Settlement statement issued', done: docsIssued },
      { label: 'Relieving letter issued', done: docsIssued },
      { label: 'No-dues closure completed', done: completed },
    ];
  }

  private actionGuardReason(action: LifecycleAction): string | null {
    if (!this.selectedCase) return 'Select a case first.';
    const blockedByLifecycle = this.transitionBlockedByLifecycle(action);
    if (blockedByLifecycle) return blockedByLifecycle;

    if (action === 'SETTLED') {
      const amount = Number(this.settlementAmountInput || this.netSettlement || 0);
      if (amount <= 0) return 'Settlement amount must be greater than zero.';
    }

    if (action === 'DOCS_ISSUED' || action === 'COMPLETED') {
      if (!this.documentChecklistDraft.length) {
        return 'Document checklist is required before closure actions.';
      }
      if (this.documentChecklistDraft.some((item) => !item.done)) {
        return 'Complete all checklist items before moving to document closure.';
      }
    }

    return null;
  }

  private transitionBlockedByLifecycle(next: LifecycleAction): string | null {
    if (!this.selectedCase) return 'Select a case first.';
    if (this.canTransitionTo(next)) return null;
    const current = this.statusKey(this.selectedCase.status);
    return `Current status ${current} cannot move to ${next}.`;
  }

  private guardrail(label: string, action: LifecycleAction): { label: string; allowed: boolean; reason: string } {
    const reason = this.actionGuardReason(action);
    return {
      label,
      allowed: !reason,
      reason: reason || 'Ready',
    };
  }
}

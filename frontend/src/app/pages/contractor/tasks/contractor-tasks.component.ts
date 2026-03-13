import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { ComplianceService } from '../../../core/compliance.service';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';

type RowType = 'TASK' | 'REUPLOAD';

interface UnifiedWorkRow {
  id: string;
  rowType: RowType;
  title: string;
  status: string;
  dueDate: string | null;
  branchName: string;
  clientName: string;
  reason?: string;
  remarks?: string;
  documentId?: number;
  createdAt?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
  evidenceCount?: number;
}

interface TimelineEvent {
  type: 'COMMENT' | 'EVIDENCE' | 'REUPLOAD' | 'STATUS';
  title: string;
  description: string;
  at: string;
  status?: string;
}

@Component({
  standalone: true,
  selector: 'app-contractor-tasks',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './contractor-tasks.component.html',
  styleUrls: ['../shared/contractor-theme.scss', './contractor-tasks.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorTasksComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  allRows: UnifiedWorkRow[] = [];
  filteredRows: UnifiedWorkRow[] = [];
  selectedRow: UnifiedWorkRow | null = null;

  selectedTaskDetail: any = null;
  selectedTaskHistory: TimelineEvent[] = [];
  relatedReuploads: UnifiedWorkRow[] = [];

  loading = false;
  detailLoading = false;
  actionBusy = false;

  search = '';
  typeFilter: 'ALL' | RowType = 'ALL';
  statusFilter = 'ALL';
  branchFilter = '';
  dueFilter: 'ALL' | 'OVERDUE' | 'DUE_TODAY' | 'DUE_7_DAYS' = 'ALL';

  readonly statusOptions = [
    'ALL',
    'OPEN',
    'PENDING',
    'IN_PROGRESS',
    'SUBMITTED',
    'REJECTED',
    'OVERDUE',
    'APPROVED',
    'REVERIFIED',
    'CLOSED',
  ];

  taskUploadFile: File | null = null;
  taskUploadNote = '';
  taskReply = '';
  reuploadFile: File | null = null;

  private pendingTaskIdFromRoute: string | null = null;

  constructor(
    private api: ComplianceService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.applyRouteDefaults();

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.pendingTaskIdFromRoute = params.get('id');
      if (this.pendingTaskIdFromRoute && this.filteredRows.length) {
        this.selectFromRouteId(this.pendingTaskIdFromRoute);
      }
    });

    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;

    forkJoin({
      tasks: this.api.getContractorTasks({}),
      reuploads: this.api.contractorGetReuploadRequests({}),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ tasks, reuploads }) => {
          const taskRows = this.toArray(tasks).map((t: any) =>
            this.mapTaskRow(t),
          );
          const reuploadRows = this.toArray(reuploads).map((r: any) =>
            this.mapReuploadRow(r),
          );

          this.allRows = [...taskRows, ...reuploadRows].sort(
            (a, b) => this.dateValue(a.dueDate) - this.dateValue(b.dueDate),
          );
          this.applyFilters();
          this.tryRestoreSelection();
        },
        error: (err: any) => {
          this.allRows = [];
          this.filteredRows = [];
          this.selectedRow = null;
          this.toast.error(
            'Load failed',
            err?.error?.message || 'Could not load contractor task center.',
          );
        },
      });
  }

  applyFilters(): void {
    const term = this.search.trim().toLowerCase();

    this.filteredRows = this.allRows.filter((row) => {
      if (this.typeFilter !== 'ALL' && row.rowType !== this.typeFilter) {
        return false;
      }

      if (this.statusFilter !== 'ALL') {
        if (this.statusFilter === 'OPEN') {
          if (!this.isOpenStatus(row.status)) return false;
        } else if (row.status !== this.statusFilter) {
          return false;
        }
      }

      if (this.branchFilter && row.branchName !== this.branchFilter) {
        return false;
      }

      if (!this.matchDueFilter(row)) {
        return false;
      }

      if (!term) return true;
      const haystack = [
        row.title,
        row.branchName,
        row.clientName,
        row.reason || '',
        row.remarks || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });

    if (
      this.selectedRow &&
      !this.filteredRows.some((r) => this.sameRow(r, this.selectedRow!))
    ) {
      this.selectedRow = null;
      this.selectedTaskDetail = null;
      this.selectedTaskHistory = [];
      this.relatedReuploads = [];
    }

    if (!this.selectedRow && this.filteredRows.length) {
      this.selectRow(this.filteredRows[0]);
    }
    this.cdr.markForCheck();
  }

  selectRow(row: UnifiedWorkRow): void {
    this.selectedRow = row;
    this.taskUploadFile = null;
    this.taskUploadNote = '';
    this.taskReply = '';
    this.reuploadFile = null;

    if (row.rowType === 'TASK') {
      this.loadTaskDetail(row.id);
      return;
    }

    this.selectedTaskDetail = null;
    this.relatedReuploads = [];
    this.selectedTaskHistory = this.buildReuploadTimeline(row);
    this.cdr.markForCheck();
  }

  startSelectedTask(): void {
    if (!this.selectedRow || this.selectedRow.rowType !== 'TASK' || this.actionBusy) {
      return;
    }
    this.actionBusy = true;
    this.api
      .contractorStart(this.selectedRow.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Task started', 'Task moved to in-progress.');
          this.load();
        },
        error: (err: any) =>
          this.toast.error(
            'Action failed',
            err?.error?.message || 'Unable to start task.',
          ),
      });
  }

  submitSelectedTask(): void {
    if (!this.selectedRow || this.selectedRow.rowType !== 'TASK' || this.actionBusy) {
      return;
    }
    this.actionBusy = true;
    this.api
      .contractorSubmit(this.selectedRow.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Task submitted', 'Sent for CRM/Auditor review.');
          this.load();
        },
        error: (err: any) =>
          this.toast.error(
            'Submit failed',
            err?.error?.message || 'Unable to submit task.',
          ),
      });
  }

  uploadTaskEvidence(): void {
    if (
      !this.selectedRow ||
      this.selectedRow.rowType !== 'TASK' ||
      !this.taskUploadFile ||
      this.actionBusy
    ) {
      return;
    }
    this.actionBusy = true;
    this.api
      .uploadContractorTaskFile(
        this.selectedRow.id,
        this.taskUploadFile,
        this.taskUploadNote.trim() || undefined,
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
          this.toast.success('File uploaded', 'Evidence uploaded successfully.');
          this.taskUploadFile = null;
          this.taskUploadNote = '';
          this.loadTaskDetail(this.selectedRow!.id, true);
          this.load();
        },
        error: (err: any) =>
          this.toast.error(
            'Upload failed',
            err?.error?.message || 'Could not upload evidence.',
          ),
      });
  }

  sendTaskReply(): void {
    if (
      !this.selectedRow ||
      this.selectedRow.rowType !== 'TASK' ||
      !this.taskReply.trim() ||
      this.actionBusy
    ) {
      return;
    }
    this.actionBusy = true;
    this.api
      .respondToContractorTask(this.selectedRow.id, this.taskReply.trim())
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Reply posted', 'Comment added to task history.');
          this.taskReply = '';
          this.loadTaskDetail(this.selectedRow!.id, true);
        },
        error: (err: any) =>
          this.toast.error(
            'Reply failed',
            err?.error?.message || 'Could not post reply.',
          ),
      });
  }

  uploadReuploadFile(): void {
    if (
      !this.selectedRow ||
      this.selectedRow.rowType !== 'REUPLOAD' ||
      !this.reuploadFile ||
      this.actionBusy
    ) {
      return;
    }
    this.actionBusy = true;
    this.api
      .contractorReuploadUpload(this.selectedRow.id, this.reuploadFile)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('File uploaded', 'Replacement file uploaded.');
          this.reuploadFile = null;
          this.load();
        },
        error: (err: any) =>
          this.toast.error(
            'Upload failed',
            err?.error?.message || 'Could not upload replacement file.',
          ),
      });
  }

  submitReupload(): void {
    if (!this.selectedRow || this.selectedRow.rowType !== 'REUPLOAD' || this.actionBusy) {
      return;
    }
    this.actionBusy = true;
    this.api
      .contractorReuploadSubmit(this.selectedRow.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.actionBusy = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success('Submitted', 'Reupload sent for verification.');
          this.load();
        },
        error: (err: any) =>
          this.toast.error(
            'Submit failed',
            err?.error?.message || 'Could not submit reupload.',
          ),
      });
  }

  onTaskFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement)?.files?.[0] || null;
    this.taskUploadFile = file;
    this.cdr.markForCheck();
  }

  onReuploadFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement)?.files?.[0] || null;
    this.reuploadFile = file;
    this.cdr.markForCheck();
  }

  dueText(row: UnifiedWorkRow): string {
    if (!row.dueDate) return 'No due date';
    const due = new Date(row.dueDate);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return `Overdue by ${Math.abs(diff)} day(s)`;
    if (diff === 0) return 'Due today';
    return `Due in ${diff} day(s)`;
  }

  get uniqueBranches(): string[] {
    const set = new Set(
      this.allRows.map((r) => r.branchName).filter((b) => b && b !== '-'),
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  get summaryCards(): Array<{ label: string; value: number; tone: string }> {
    const openCount = this.allRows.filter((r) => this.isOpenStatus(r.status)).length;
    const overdueCount = this.allRows.filter((r) =>
      this.isOverdueStatus(r.status, r.dueDate),
    ).length;
    const reuploadOpen = this.allRows.filter(
      (r) => r.rowType === 'REUPLOAD' && this.isOpenStatus(r.status),
    ).length;
    const submitted = this.allRows.filter((r) => r.status === 'SUBMITTED').length;

    return [
      { label: 'Total items', value: this.allRows.length, tone: 'neutral' },
      { label: 'Open items', value: openCount, tone: 'info' },
      { label: 'Overdue', value: overdueCount, tone: 'danger' },
      { label: 'Open reuploads', value: reuploadOpen, tone: 'warning' },
      { label: 'Submitted', value: submitted, tone: 'success' },
    ];
  }

  private loadTaskDetail(taskId: string, silent = false): void {
    this.detailLoading = !silent;
    forkJoin({
      detail: this.api.getContractorTaskById(taskId),
      history: this.api.getContractorTaskHistory(taskId),
      reuploads: this.api.contractorGetReuploadRequests({}),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.detailLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ detail, history, reuploads }) => {
          this.selectedTaskDetail = detail?.task || null;

          const taskEvidence = Array.isArray(detail?.evidence) ? detail.evidence : [];
          const evidenceIds = new Set(
            taskEvidence
              .map((e: any) => Number(e?.id))
              .filter((id: number) => Number.isFinite(id)),
          );
          const reqRows = this.toArray(reuploads).map((r: any) =>
            this.mapReuploadRow(r),
          );
          this.relatedReuploads = reqRows.filter(
            (r) => evidenceIds.size > 0 && evidenceIds.has(Number(r.documentId)),
          );

          const baseEvents = Array.isArray(history?.events) ? history.events : [];
          const reuploadEvents = this.relatedReuploads
            .filter((r) => !!r.createdAt)
            .map((r) => ({
              type: 'REUPLOAD' as const,
              title: `Reupload request #${r.id.slice(0, 8)}`,
              description: r.reason || r.remarks || 'Reupload requested',
              at: String(r.createdAt),
              status: r.status,
            }));

          this.selectedTaskHistory = [...baseEvents, ...reuploadEvents]
            .filter((e: any) => !!e?.at)
            .sort(
              (a: any, b: any) =>
                new Date(b.at).getTime() - new Date(a.at).getTime(),
            );
        },
        error: (err: any) => {
          this.selectedTaskDetail = null;
          this.relatedReuploads = [];
          this.selectedTaskHistory = [];
          this.toast.error(
            'Detail failed',
            err?.error?.message || 'Could not load selected task.',
          );
        },
      });
  }

  private buildReuploadTimeline(row: UnifiedWorkRow): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    if (row.createdAt) {
      events.push({
        type: 'REUPLOAD',
        title: 'Request created',
        description: row.reason || 'Reupload request created',
        at: row.createdAt,
        status: 'OPEN',
      });
    }
    if (row.submittedAt) {
      events.push({
        type: 'STATUS',
        title: 'Submitted by contractor',
        description: 'Replacement file submitted for review.',
        at: row.submittedAt,
        status: 'SUBMITTED',
      });
    }
    if (row.updatedAt) {
      events.push({
        type: 'STATUS',
        title: `Status: ${row.status}`,
        description: row.remarks || 'Request status changed',
        at: row.updatedAt,
        status: row.status,
      });
    }
    return events.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }

  private mapTaskRow(task: any): UnifiedWorkRow {
    return {
      id: String(task?.id || ''),
      rowType: 'TASK',
      title:
        task?.compliance?.complianceName ||
        task?.compliance?.title ||
        task?.complianceTitle ||
        'Compliance Task',
      status: this.normalizeStatus(task?.status || 'PENDING'),
      dueDate: this.firstDefined(task?.dueDate, task?.due_date),
      branchName:
        task?.branch?.branchName ||
        task?.branch?.name ||
        task?.branchName ||
        '-',
      clientName:
        task?.client?.clientName ||
        task?.clientName ||
        task?.client?.name ||
        '-',
      reason: task?.remarks || '',
      remarks: task?.remarks || '',
      evidenceCount: Number(task?.evidenceCount || 0),
      createdAt: this.firstDefined(task?.createdAt, task?.created_at),
      updatedAt: this.firstDefined(task?.updatedAt, task?.updated_at),
    };
  }

  private mapReuploadRow(req: any): UnifiedWorkRow {
    const documentId = Number(
      this.firstDefined(req?.documentId, req?.docId, req?.doc_id, 0),
    );
    return {
      id: String(this.firstDefined(req?.id, req?.requestId, req?.request_id, '')),
      rowType: 'REUPLOAD',
      title: `Reupload request for document #${documentId || '-'}`,
      status: this.normalizeStatus(req?.status || 'OPEN'),
      dueDate: this.firstDefined(req?.deadlineDate, req?.deadline_date, null),
      branchName: this.firstDefined(req?.branchName, req?.unitName, '-'),
      clientName: this.firstDefined(req?.clientName, '-'),
      reason: this.firstDefined(req?.reason, ''),
      remarks: this.firstDefined(req?.remarksVisible, req?.remarks, req?.crmRemarks, ''),
      documentId: Number.isFinite(documentId) ? documentId : undefined,
      createdAt: this.firstDefined(req?.createdAt, req?.created_at, null),
      submittedAt: this.firstDefined(req?.submittedAt, req?.submitted_at, null),
      updatedAt: this.firstDefined(req?.updatedAt, req?.updated_at, null),
    };
  }

  private tryRestoreSelection(): void {
    if (this.pendingTaskIdFromRoute) {
      this.selectFromRouteId(this.pendingTaskIdFromRoute);
      return;
    }

    const path = this.route.snapshot.routeConfig?.path || '';
    if (path.includes('reupload-requests')) {
      const firstReupload = this.filteredRows.find((r) => r.rowType === 'REUPLOAD');
      if (firstReupload) {
        this.selectRow(firstReupload);
        return;
      }
    }

    if (!this.selectedRow && this.filteredRows.length) {
      this.selectRow(this.filteredRows[0]);
    }
  }

  private selectFromRouteId(taskId: string): void {
    const row = this.filteredRows.find(
      (r) => r.rowType === 'TASK' && String(r.id) === String(taskId),
    );
    if (row) {
      this.selectRow(row);
      this.pendingTaskIdFromRoute = null;
    }
  }

  private applyRouteDefaults(): void {
    const qStatus = (this.route.snapshot.queryParamMap.get('status') || '')
      .trim()
      .toUpperCase();
    if (qStatus) {
      if (qStatus === 'DUE_TODAY') {
        this.dueFilter = 'DUE_TODAY';
      } else if (this.statusOptions.includes(qStatus)) {
        this.statusFilter = qStatus;
      }
    }

    const path = this.route.snapshot.routeConfig?.path || '';
    if (path.includes('reupload-requests')) {
      this.typeFilter = 'REUPLOAD';
      this.statusFilter = 'OPEN';
    }
  }

  private matchDueFilter(row: UnifiedWorkRow): boolean {
    if (this.dueFilter === 'ALL') return true;
    if (!row.dueDate) return false;

    const due = new Date(row.dueDate);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);

    if (this.dueFilter === 'OVERDUE') return diff < 0;
    if (this.dueFilter === 'DUE_TODAY') return diff === 0;
    if (this.dueFilter === 'DUE_7_DAYS') return diff >= 0 && diff <= 7;
    return true;
  }

  private isOpenStatus(status: string): boolean {
    return ['OPEN', 'PENDING', 'IN_PROGRESS', 'REJECTED', 'OVERDUE'].includes(
      status,
    );
  }

  private isOverdueStatus(status: string, dueDate: string | null): boolean {
    if (status === 'OVERDUE') return true;
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime() && this.isOpenStatus(status);
  }

  private normalizeStatus(raw: string): string {
    const value = String(raw || '').trim().toUpperCase();
    return value || 'PENDING';
  }

  private dateValue(dateValue: string | null): number {
    if (!dateValue) return Number.MAX_SAFE_INTEGER;
    const value = new Date(dateValue).getTime();
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  }

  private toArray(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }

  private sameRow(a: UnifiedWorkRow, b: UnifiedWorkRow): boolean {
    return a.id === b.id && a.rowType === b.rowType;
  }

  private firstDefined<T>(...values: T[]): T | null {
    for (const value of values) {
      if (value !== undefined && value !== null && `${value}` !== '') {
        return value;
      }
    }
    return null;
  }
}

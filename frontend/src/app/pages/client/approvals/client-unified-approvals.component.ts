import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
  StatusBadgeComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  BranchApprovalsApiService,
  PendingLeave,
  PendingNomination,
} from './branch-approvals-api.service';

type ApprovalType = 'LEAVE' | 'NOMINATION';
type QueueTab = 'ALL' | ApprovalType;
type AgeingFilter = 'ALL' | '0_3' | '4_7' | '8_PLUS';
type SortOrder = 'AGE_DESC' | 'AGE_ASC' | 'NEWEST' | 'OLDEST';

interface TimelineEvent {
  label: string;
  timeLabel: string;
  note?: string;
}

interface CompareRow {
  field: string;
  before: string;
  after: string;
}

interface DecisionAuditEntry {
  id: string;
  type: ApprovalType;
  action: 'APPROVED' | 'REJECTED';
  actor: string;
  at: string;
  note?: string;
  reason?: string;
  summary: string;
}

interface UnifiedApprovalItem {
  id: string;
  type: ApprovalType;
  employeeId: string;
  employeeName: string;
  branchId?: string | null;
  status: string;
  submittedAt: string | null;
  ageingDays: number;
  summary: string;
  raw: PendingLeave | PendingNomination;
}

@Component({
  standalone: true,
  selector: 'app-client-unified-approvals',
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    StatusBadgeComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="page-wrap">
      <ui-page-header
        title="Approvals Workbench"
        subtitle="Unified queue for leave and nomination approvals with comparison and decision timeline.">
        <ui-button variant="secondary" [disabled]="loading" (clicked)="load()">Refresh</ui-button>
      </ui-page-header>

      <section class="workspace-card mb-4">
        <div class="tabs">
          <button [class.active]="activeTab === 'ALL'" (click)="setTab('ALL')">
            All ({{ allCount }})
          </button>
          <button [class.active]="activeTab === 'LEAVE'" (click)="setTab('LEAVE')">
            Leave ({{ leaveCount }})
          </button>
          <button [class.active]="activeTab === 'NOMINATION'" (click)="setTab('NOMINATION')">
            Nomination ({{ nominationCount }})
          </button>
        </div>
        <div class="filter-row">
          <label>
            <span>Search</span>
            <input
              type="text"
              [(ngModel)]="searchText"
              (ngModelChange)="applyFilters()"
              placeholder="Employee, id, type, summary" />
          </label>
          <label>
            <span>Ageing</span>
            <select [(ngModel)]="ageingFilter" (ngModelChange)="applyFilters()">
              <option value="ALL">All</option>
              <option value="0_3">0-3 days</option>
              <option value="4_7">4-7 days</option>
              <option value="8_PLUS">8+ days</option>
            </select>
          </label>
          <label>
            <span>Branch ID</span>
            <input
              type="text"
              [(ngModel)]="branchFilter"
              placeholder="Optional branch id"
              (keyup.enter)="load()" />
          </label>
          <label>
            <span>Sort</span>
            <select [(ngModel)]="sortOrder" (ngModelChange)="applyFilters()">
              <option value="AGE_DESC">Ageing high to low</option>
              <option value="AGE_ASC">Ageing low to high</option>
              <option value="NEWEST">Newest submitted</option>
              <option value="OLDEST">Oldest submitted</option>
            </select>
          </label>
          <div class="filter-actions">
            <ui-button size="sm" variant="secondary" [disabled]="loading" (clicked)="load()">
              Apply
            </ui-button>
            <ui-button size="sm" variant="ghost" [disabled]="loading" (clicked)="clearFilters()">
              Reset
            </ui-button>
          </div>
        </div>
        <div class="ageing-cards">
          <div class="age-card">
            <div class="k">0-3d</div>
            <div class="v">{{ ageingCount0to3 }}</div>
          </div>
          <div class="age-card">
            <div class="k">4-7d</div>
            <div class="v">{{ ageingCount4to7 }}</div>
          </div>
          <div class="age-card danger">
            <div class="k">8+d</div>
            <div class="v">{{ ageingCount8Plus }}</div>
          </div>
        </div>
      </section>

      <ui-loading-spinner *ngIf="loading" text="Loading approvals..." size="lg"></ui-loading-spinner>

      <section class="grid-layout" *ngIf="!loading">
        <article class="workspace-card">
          <div class="section-head">
            <h3>Approval Queue</h3>
            <span class="muted">{{ filteredQueue.length }} item(s)</span>
          </div>

          <ui-empty-state
            *ngIf="!filteredQueue.length"
            title="No pending approvals"
            description="No leave or nomination approvals match the current filters.">
          </ui-empty-state>

          <div class="queue-list" *ngIf="filteredQueue.length">
            <button
              class="queue-row"
              *ngFor="let item of filteredQueue; trackBy: trackById"
              [class.selected]="selected?.id === item.id && selected?.type === item.type"
              (click)="select(item)">
              <div class="row-top">
                <span class="type-chip" [class.nom]="item.type === 'NOMINATION'">{{ item.type }}</span>
                <span class="emp">{{ item.employeeName || item.employeeId }}</span>
                <span class="ageing" [class.ageing-high]="item.ageingDays >= 8">{{ item.ageingDays }}d</span>
              </div>
              <div class="row-meta">
                <span>{{ item.summary }}</span>
                <span *ngIf="item.branchId">Branch: {{ item.branchId }}</span>
                <span>{{ item.submittedAt | date:'dd MMM yyyy' }}</span>
              </div>
            </button>
          </div>
        </article>

        <article class="workspace-card" *ngIf="selected; else noSelection">
          <div class="section-head">
            <h3>Approval Detail</h3>
            <ui-status-badge [status]="selected.status || 'PENDING'"></ui-status-badge>
          </div>

          <div class="detail-head">
            <div>
              <div class="label">Employee</div>
              <div class="value">{{ selected.employeeName || selected.employeeId }}</div>
            </div>
            <div>
              <div class="label">Type</div>
              <div class="value">{{ selected.type }}</div>
            </div>
            <div>
              <div class="label">Ageing</div>
              <div class="value">{{ selected.ageingDays }} day(s)</div>
            </div>
            <div>
              <div class="label">Branch</div>
              <div class="value">{{ selected.branchId || '-' }}</div>
            </div>
          </div>

          <div class="compare-grid">
            <section class="compare-card full">
              <h4>Before / After Compare</h4>
              <div class="compare-table-head">
                <span>Field</span>
                <span>Before</span>
                <span>After</span>
              </div>
              <div class="compare-table-row" *ngFor="let row of compareRows(selected); trackBy: trackByCompareField">
                <span class="f">{{ row.field }}</span>
                <span>{{ row.before }}</span>
                <span [class.pending-after]="row.after === 'Pending decision'">{{ row.after }}</span>
              </div>
            </section>
          </div>

          <label class="field">
            <span>Decision Notes</span>
            <textarea
              rows="2"
              [(ngModel)]="decisionNotes"
              (ngModelChange)="refreshTimeline()"
              placeholder="Optional notes for approval history">
            </textarea>
          </label>

          <label class="field" *ngIf="decisionType === 'REJECT'">
            <span>Rejection Reason <em>*</em></span>
            <textarea
              rows="2"
              [(ngModel)]="rejectionReason"
              (ngModelChange)="refreshTimeline()"
              placeholder="Reason required for rejection">
            </textarea>
          </label>

          <div class="inline-actions">
            <ui-button
              variant="primary"
              [disabled]="actionBusy"
              [loading]="actionBusy && decisionType === 'APPROVE'"
              (clicked)="approveSelected()">
              Approve
            </ui-button>
            <ui-button
              variant="danger"
              [disabled]="actionBusy"
              [loading]="actionBusy && decisionType === 'REJECT'"
              (clicked)="rejectSelected()">
              Reject
            </ui-button>
          </div>

          <section class="timeline">
            <h4>Decision Timeline</h4>
            <article class="timeline-row" *ngFor="let ev of timelineEvents; trackBy: trackByLabel">
              <div class="dot"></div>
              <div>
                <div class="event">{{ ev.label }}</div>
                <div class="time">{{ ev.timeLabel }}</div>
                <div class="note" *ngIf="ev.note">{{ ev.note }}</div>
              </div>
            </article>
          </section>

          <section class="timeline mt-2">
            <h4>Audit Trail (Current Session)</h4>
            <article
              class="timeline-row"
              *ngFor="let ev of selectedAuditTrail; trackBy: trackByAudit"
              [class.audit-row]="true">
              <div class="dot" [class.reject-dot]="ev.action === 'REJECTED'"></div>
              <div>
                <div class="event">{{ ev.action }} by {{ ev.actor }}</div>
                <div class="time">{{ formatDate(ev.at) }}</div>
                <div class="note" *ngIf="ev.reason">Reason: {{ ev.reason }}</div>
                <div class="note" *ngIf="ev.note">Note: {{ ev.note }}</div>
              </div>
            </article>
            <div class="muted" *ngIf="!selectedAuditTrail.length">
              No session decisions recorded for this item yet.
            </div>
          </section>
        </article>
      </section>

      <ng-template #noSelection>
        <article class="workspace-card">
          <ui-empty-state
            title="Select an approval item"
            description="Choose any queue item to review details and take action.">
          </ui-empty-state>
        </article>
      </ng-template>
    </div>
  `,
  styles: [`
    .page-wrap { max-width: 1280px; margin: 0 auto; padding: 1rem; }
    .workspace-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 1rem; box-shadow: 0 6px 20px rgba(15, 23, 42, .04); }
    .grid-layout { display: grid; grid-template-columns: 1fr 1.25fr; gap: 1rem; }
    .tabs { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: .7rem; }
    .tabs button { border: 1px solid #d1d5db; background: #fff; border-radius: 999px; padding: .3rem .7rem; font-size: .78rem; font-weight: 700; color: #374151; }
    .tabs button.active { background: #0a2656; color: #fff; border-color: #0a2656; }
    .filter-row { display: grid; grid-template-columns: 1fr 170px 1fr 190px auto; gap: .65rem; }
    .filter-actions { display: flex; align-items: end; gap: .45rem; }
    label { display: flex; flex-direction: column; gap: .35rem; }
    label > span { color: #4b5563; font-size: .78rem; font-weight: 600; }
    input, select, textarea { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: .5rem .6rem; font-size: .84rem; }
    .ageing-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .55rem; margin-top: .65rem; }
    .age-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: .45rem .55rem; background: #f8fafc; }
    .age-card .k { color: #6b7280; font-size: .72rem; font-weight: 700; text-transform: uppercase; }
    .age-card .v { color: #111827; font-size: 1.1rem; font-weight: 700; line-height: 1.1; margin-top: .2rem; }
    .age-card.danger { border-color: #fecaca; background: #fef2f2; }
    .age-card.danger .v { color: #991b1b; }
    .section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .65rem; gap: .5rem; }
    .section-head h3 { margin: 0; font-size: 1rem; font-weight: 700; color: #111827; }
    .muted { color: #6b7280; font-size: .75rem; }
    .queue-list { display: flex; flex-direction: column; gap: .55rem; max-height: 68vh; overflow: auto; }
    .queue-row { text-align: left; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; padding: .65rem; }
    .queue-row.selected { border-color: #93c5fd; background: #eff6ff; }
    .row-top { display: flex; align-items: center; gap: .45rem; }
    .row-meta { display: flex; justify-content: space-between; gap: .45rem; margin-top: .3rem; color: #6b7280; font-size: .74rem; }
    .type-chip { border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; font-size: .68rem; font-weight: 700; border-radius: 999px; padding: .1rem .45rem; }
    .type-chip.nom { border-color: #fbcfe8; background: #fdf2f8; color: #be185d; }
    .emp { font-weight: 600; color: #111827; font-size: .82rem; flex: 1; }
    .ageing { font-size: .72rem; font-weight: 700; color: #374151; border: 1px solid #e5e7eb; border-radius: 999px; padding: .05rem .45rem; }
    .ageing-high { color: #b91c1c; border-color: #fecaca; background: #fef2f2; }
    .detail-head { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .55rem; margin-bottom: .7rem; }
    .label { color: #6b7280; font-size: .73rem; }
    .value { color: #111827; font-size: .83rem; font-weight: 600; }
    .compare-grid { display: grid; grid-template-columns: 1fr; gap: .65rem; margin-bottom: .75rem; }
    .compare-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: .6rem; }
    .compare-card.full { width: 100%; }
    .compare-card h4 { margin: 0 0 .45rem; font-size: .82rem; color: #111827; }
    .item-line { font-size: .78rem; color: #1f2937; margin-bottom: .22rem; }
    .compare-table-head,
    .compare-table-row { display: grid; grid-template-columns: 180px 1fr 1fr; gap: .55rem; align-items: center; }
    .compare-table-head { color: #6b7280; font-size: .72rem; font-weight: 700; text-transform: uppercase; margin-bottom: .3rem; }
    .compare-table-row { border-top: 1px solid #f1f5f9; padding: .32rem 0; font-size: .78rem; color: #1f2937; }
    .compare-table-row .f { color: #4b5563; font-weight: 600; }
    .pending-after { color: #6b7280; font-style: italic; }
    .field { margin-bottom: .6rem; }
    .field em { color: #dc2626; font-style: normal; }
    .inline-actions { display: flex; gap: .45rem; margin-bottom: .75rem; flex-wrap: wrap; }
    .timeline h4 { margin: 0 0 .45rem; font-size: .82rem; color: #111827; }
    .timeline-row { display: flex; gap: .45rem; margin-bottom: .4rem; }
    .dot { width: .58rem; height: .58rem; border-radius: 999px; background: #2563eb; margin-top: .3rem; flex-shrink: 0; }
    .reject-dot { background: #dc2626; }
    .event { font-size: .79rem; color: #111827; font-weight: 600; }
    .time { font-size: .72rem; color: #6b7280; }
    .note { font-size: .75rem; color: #374151; margin-top: .1rem; }
    .mt-2 { margin-top: .6rem; }
    @media (max-width: 980px) {
      .grid-layout, .filter-row, .compare-grid, .detail-head { grid-template-columns: 1fr; }
      .compare-table-head,
      .compare-table-row { grid-template-columns: 1fr; }
      .ageing-cards { grid-template-columns: 1fr; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientUnifiedApprovalsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = false;
  actionBusy = false;

  activeTab: QueueTab = 'ALL';
  ageingFilter: AgeingFilter = 'ALL';
  searchText = '';
  branchFilter = '';
  sortOrder: SortOrder = 'AGE_DESC';

  queue: UnifiedApprovalItem[] = [];
  filteredQueue: UnifiedApprovalItem[] = [];
  selected: UnifiedApprovalItem | null = null;

  timelineEvents: TimelineEvent[] = [];
  decisionType: 'APPROVE' | 'REJECT' | '' = '';
  decisionNotes = '';
  rejectionReason = '';

  allCount = 0;
  leaveCount = 0;
  nominationCount = 0;
  ageingCount0to3 = 0;
  ageingCount4to7 = 0;
  ageingCount8Plus = 0;

  private auditTrail: DecisionAuditEntry[] = [];

  constructor(
    private readonly approvalsApi: BranchApprovalsApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    const branchId = this.branchFilter.trim() || undefined;
    forkJoin({
      leaves: this.approvalsApi
        .listPendingLeaves(branchId)
        .pipe(catchError(() => of([] as PendingLeave[]))),
      nominations: this.approvalsApi
        .listPendingNominations(branchId)
        .pipe(
        catchError(() => of([] as PendingNomination[])),
      ),
    })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ leaves, nominations }) => {
          this.queue = [
            ...leaves.map((lv) => this.mapLeave(lv)),
            ...nominations.map((nom) => this.mapNomination(nom)),
          ];

          this.allCount = this.queue.length;
          this.leaveCount = this.queue.filter((x) => x.type === 'LEAVE').length;
          this.nominationCount = this.queue.filter((x) => x.type === 'NOMINATION').length;

          this.applyFilters();
          if (!this.selected && this.filteredQueue.length) {
            this.select(this.filteredQueue[0]);
          } else if (this.selected) {
            const found = this.filteredQueue.find(
              (x) => x.id === this.selected?.id && x.type === this.selected?.type,
            );
            this.selected = found || null;
            if (this.selected) {
              this.buildTimeline(this.selected);
            } else {
              this.timelineEvents = [];
            }
          }
        },
        error: () => {
          this.toast.error('Could not load approvals queue.');
          this.queue = [];
          this.filteredQueue = [];
          this.selected = null;
          this.timelineEvents = [];
        },
      });
  }

  setTab(tab: QueueTab): void {
    this.activeTab = tab;
    this.applyFilters();
  }

  applyFilters(): void {
    const text = this.searchText.trim().toLowerCase();
    this.filteredQueue = this.queue.filter((item) => {
      if (this.activeTab !== 'ALL' && item.type !== this.activeTab) return false;
      if (!this.matchesAgeing(item.ageingDays, this.ageingFilter)) return false;
      if (this.branchFilter.trim()) {
        const branch = String(item.branchId || '').toLowerCase();
        if (!branch.includes(this.branchFilter.trim().toLowerCase())) return false;
      }
      if (!text) return true;
      return (
        item.employeeName.toLowerCase().includes(text) ||
        item.employeeId.toLowerCase().includes(text) ||
        item.type.toLowerCase().includes(text) ||
        item.summary.toLowerCase().includes(text) ||
        item.id.toLowerCase().includes(text)
      );
    });
    this.filteredQueue = this.sortQueue(this.filteredQueue, this.sortOrder);
    this.updateAgeingCounts();
  }

  clearFilters(): void {
    this.searchText = '';
    this.ageingFilter = 'ALL';
    this.sortOrder = 'AGE_DESC';
    this.branchFilter = '';
    this.applyFilters();
  }

  select(item: UnifiedApprovalItem): void {
    this.selected = item;
    this.decisionType = '';
    this.decisionNotes = '';
    this.rejectionReason = '';
    this.buildTimeline(item);
  }

  approveSelected(): void {
    if (!this.selected || this.actionBusy) return;
    this.decisionType = 'APPROVE';
    this.buildTimeline(this.selected);
    this.actionBusy = true;
    const req =
      this.selected.type === 'LEAVE'
        ? this.approvalsApi.approveLeave(this.selected.id)
        : this.approvalsApi.approveNomination(this.selected.id);

    req.pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.actionBusy = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: () => {
        this.toast.success(`${this.selected?.type} request approved.`);
        this.pushAudit('APPROVED');
        this.load();
      },
      error: () => {
        this.toast.error('Could not approve this request.');
      },
    });
  }

  rejectSelected(): void {
    if (!this.selected || this.actionBusy) return;
    if (!this.rejectionReason.trim()) {
      this.toast.info('Enter rejection reason before rejecting.');
      return;
    }
    this.decisionType = 'REJECT';
    this.buildTimeline(this.selected);
    this.actionBusy = true;
    const reason = this.rejectionReason.trim();
    const req =
      this.selected.type === 'LEAVE'
        ? this.approvalsApi.rejectLeave(this.selected.id, reason)
        : this.approvalsApi.rejectNomination(this.selected.id, reason);

    req.pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.actionBusy = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: () => {
        this.toast.success(`${this.selected?.type} request rejected.`);
        this.pushAudit('REJECTED');
        this.load();
      },
      error: () => {
        this.toast.error('Could not reject this request.');
      },
    });
  }

  beforeLines(item: UnifiedApprovalItem): string[] {
    if (item.type === 'LEAVE') {
      const raw = item.raw as PendingLeave;
      return [
        `Type: ${raw.leaveTypeCode}`,
        `Period: ${raw.fromDate} to ${raw.toDate}`,
        `Days: ${raw.numberOfDays}`,
        `Reason: ${raw.reason || '-'}`,
      ];
    }

    const raw = item.raw as PendingNomination;
    const members = raw.members?.length || 0;
    return [
      `Nomination Type: ${raw.nominationType}`,
      `Members: ${members}`,
      `Witness: ${raw.witnessName || '-'}`,
      `Declaration: ${raw.declarationDate || '-'}`,
    ];
  }

  trackById(_index: number, row: UnifiedApprovalItem): string {
    return `${row.type}-${row.id}`;
  }

  trackByLabel(_index: number, row: TimelineEvent): string {
    return `${row.label}-${row.timeLabel}-${_index}`;
  }

  trackByCompareField(_index: number, row: CompareRow): string {
    return row.field;
  }

  trackByAudit(_index: number, row: DecisionAuditEntry): string {
    return `${row.id}-${row.action}-${row.at}`;
  }

  get selectedAuditTrail(): DecisionAuditEntry[] {
    if (!this.selected) return [];
    return this.auditTrail.filter(
      (ev) => ev.id === this.selected?.id && ev.type === this.selected?.type,
    );
  }

  refreshTimeline(): void {
    if (!this.selected) return;
    this.buildTimeline(this.selected);
  }

  private mapLeave(lv: PendingLeave): UnifiedApprovalItem {
    const submittedAt = lv.appliedAt || null;
    return {
      id: lv.id,
      type: 'LEAVE',
      employeeId: String(lv.employeeId || ''),
      employeeName: String(lv.employeeName || lv.employeeId || ''),
      branchId: (String((lv as any)?.branchId || '') || null),
      status: String(lv.status || 'PENDING'),
      submittedAt,
      ageingDays: this.ageingDays(submittedAt || lv.fromDate),
      summary: `${lv.leaveTypeCode} - ${lv.fromDate} to ${lv.toDate} - ${lv.numberOfDays} day(s)`,
      raw: lv,
    };
  }

  private mapNomination(nom: PendingNomination): UnifiedApprovalItem {
    const submittedAt = nom.submittedAt || null;
    const memberCount = nom.members?.length || 0;
    return {
      id: nom.id,
      type: 'NOMINATION',
      employeeId: String(nom.employeeId || ''),
      employeeName: String(nom.employeeName || nom.employeeId || ''),
      branchId: (String((nom as any)?.branchId || '') || null),
      status: String(nom.status || 'PENDING'),
      submittedAt,
      ageingDays: this.ageingDays(submittedAt || nom.declarationDate || null),
      summary: `${nom.nominationType} - ${memberCount} nominee(s)`,
      raw: nom,
    };
  }

  private buildTimeline(item: UnifiedApprovalItem): void {
    const events: TimelineEvent[] = [];
    events.push({
      label: 'Submitted',
      timeLabel: item.submittedAt ? this.formatDate(item.submittedAt) : '-',
      note: item.summary,
    });
    events.push({
      label: 'Pending Review',
      timeLabel: `Ageing ${item.ageingDays} day(s)`,
    });
    if (this.decisionType === 'APPROVE') {
      events.push({
        label: 'Approval Selected',
        timeLabel: 'Current draft decision',
        note: this.decisionNotes || undefined,
      });
    }
    if (this.decisionType === 'REJECT') {
      events.push({
        label: 'Rejection Selected',
        timeLabel: 'Current draft decision',
        note: this.rejectionReason || this.decisionNotes || undefined,
      });
    }
    this.timelineEvents = events;
  }

  private updateAgeingCounts(): void {
    const branch = this.branchFilter.trim().toLowerCase();
    const items = this.queue.filter((x) => {
      if (this.activeTab !== 'ALL' && x.type !== this.activeTab) return false;
      if (branch) {
        const bid = String(x.branchId || '').toLowerCase();
        if (!bid.includes(branch)) return false;
      }
      return true;
    });
    this.ageingCount0to3 = items.filter((x) => x.ageingDays <= 3).length;
    this.ageingCount4to7 = items.filter((x) => x.ageingDays >= 4 && x.ageingDays <= 7).length;
    this.ageingCount8Plus = items.filter((x) => x.ageingDays >= 8).length;
  }

  private sortQueue(items: UnifiedApprovalItem[], sort: SortOrder): UnifiedApprovalItem[] {
    const sorted = [...items];
    if (sort === 'AGE_ASC') {
      sorted.sort((a, b) => a.ageingDays - b.ageingDays);
      return sorted;
    }
    if (sort === 'NEWEST') {
      sorted.sort((a, b) => this.sortByDateDesc(a.submittedAt, b.submittedAt));
      return sorted;
    }
    if (sort === 'OLDEST') {
      sorted.sort((a, b) => this.sortByDateAsc(a.submittedAt, b.submittedAt));
      return sorted;
    }
    sorted.sort((a, b) => b.ageingDays - a.ageingDays);
    return sorted;
  }

  private sortByDateDesc(a?: string | null, b?: string | null): number {
    const ta = a ? new Date(a).getTime() : 0;
    const tb = b ? new Date(b).getTime() : 0;
    return tb - ta;
  }

  private sortByDateAsc(a?: string | null, b?: string | null): number {
    const ta = a ? new Date(a).getTime() : 0;
    const tb = b ? new Date(b).getTime() : 0;
    return ta - tb;
  }

  private pushAudit(action: 'APPROVED' | 'REJECTED'): void {
    if (!this.selected) return;
    this.auditTrail.unshift({
      id: this.selected.id,
      type: this.selected.type,
      action,
      actor: 'You',
      at: new Date().toISOString(),
      note: this.decisionNotes || undefined,
      reason: action === 'REJECTED' ? this.rejectionReason || undefined : undefined,
      summary: this.selected.summary,
    });
  }

  compareRows(item: UnifiedApprovalItem): CompareRow[] {
    const rows: CompareRow[] = [];
    const statusAfter =
      this.decisionType === 'APPROVE'
        ? 'APPROVED'
        : this.decisionType === 'REJECT'
          ? 'REJECTED'
          : 'Pending decision';

    rows.push({ field: 'Status', before: item.status || 'PENDING', after: statusAfter });
    rows.push({
      field: 'Decision Notes',
      before: '-',
      after: this.decisionNotes.trim() ? this.decisionNotes.trim() : 'Pending decision',
    });

    if (item.type === 'LEAVE') {
      const raw = item.raw as PendingLeave;
      rows.push({ field: 'Leave Type', before: raw.leaveTypeCode, after: raw.leaveTypeCode });
      rows.push({
        field: 'Period',
        before: `${raw.fromDate} to ${raw.toDate}`,
        after: `${raw.fromDate} to ${raw.toDate}`,
      });
      rows.push({ field: 'Days', before: String(raw.numberOfDays), after: String(raw.numberOfDays) });
      rows.push({ field: 'Reason', before: raw.reason || '-', after: raw.reason || '-' });
      if (this.decisionType === 'REJECT') {
        rows.push({
          field: 'Rejection Reason',
          before: '-',
          after: this.rejectionReason.trim() || 'Pending decision',
        });
      }
      return rows;
    }

    const raw = item.raw as PendingNomination;
    const memberCount = raw.members?.length || 0;
    rows.push({
      field: 'Nomination Type',
      before: raw.nominationType || '-',
      after: raw.nominationType || '-',
    });
    rows.push({ field: 'Members', before: String(memberCount), after: String(memberCount) });
    rows.push({ field: 'Witness', before: raw.witnessName || '-', after: raw.witnessName || '-' });
    rows.push({
      field: 'Declaration',
      before: raw.declarationDate || '-',
      after: raw.declarationDate || '-',
    });
    if (this.decisionType === 'REJECT') {
      rows.push({
        field: 'Rejection Reason',
        before: '-',
        after: this.rejectionReason.trim() || 'Pending decision',
      });
    }
    return rows;
  }

  private matchesAgeing(days: number, filter: AgeingFilter): boolean {
    if (filter === 'ALL') return true;
    if (filter === '0_3') return days <= 3;
    if (filter === '4_7') return days >= 4 && days <= 7;
    return days >= 8;
  }

  private ageingDays(rawDate: string | null): number {
    if (!rawDate) return 0;
    const t = new Date(rawDate).getTime();
    if (Number.isNaN(t)) return 0;
    const now = Date.now();
    const diff = Math.floor((now - t) / (1000 * 60 * 60 * 24));
    return diff < 0 ? 0 : diff;
  }

  formatDate(rawDate: string): string {
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) return rawDate;
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}


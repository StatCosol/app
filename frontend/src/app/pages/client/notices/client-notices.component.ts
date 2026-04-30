import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, finalize, takeUntil, timeout } from 'rxjs';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/ui/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { NoticesService, Notice, NoticeKpis } from '../../../core/notices.service';

@Component({
  standalone: true,
  selector: 'app-client-notices',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="max-w-[1400px] mx-auto p-4">
      <ui-page-header title="Notices & Inspections" subtitle="View department notices, show-cause orders, and response status"></ui-page-header>

      <section class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4" *ngIf="kpis">
        <div class="border rounded-lg p-3 bg-white"><span class="block text-xl font-bold">{{ kpis.total }}</span><span class="text-xs text-gray-500">Total</span></div>
        <div class="border border-orange-200 rounded-lg p-3 bg-orange-50"><span class="block text-xl font-bold">{{ kpis.actionRequired }}</span><span class="text-xs text-gray-500">Action Required</span></div>
        <div class="border border-red-200 rounded-lg p-3 bg-red-50"><span class="block text-xl font-bold">{{ kpis.overdue }}</span><span class="text-xs text-gray-500">Overdue</span></div>
        <div class="border border-blue-200 rounded-lg p-3 bg-blue-50"><span class="block text-xl font-bold">{{ kpis.responseSubmitted }}</span><span class="text-xs text-gray-500">Responded</span></div>
        <div class="border border-green-200 rounded-lg p-3 bg-green-50"><span class="block text-xl font-bold">{{ kpis.closed }}</span><span class="text-xs text-gray-500">Closed</span></div>
        <div class="border border-red-200 rounded-lg p-3 bg-red-50"><span class="block text-xl font-bold">{{ kpis.critical }}</span><span class="text-xs text-gray-500">Critical</span></div>
        <div class="border border-red-200 rounded-lg p-3 bg-red-50"><span class="block text-xl font-bold">{{ kpis.escalated }}</span><span class="text-xs text-gray-500">Escalated</span></div>
      </section>

      <div class="flex flex-wrap gap-2 mb-4">
        <input type="text" class="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]" placeholder="Search..." [(ngModel)]="search" (input)="load()" />
        <select class="border rounded-lg px-3 py-2 text-sm" [(ngModel)]="statusFilter" (change)="load()">
          <option value="">All Statuses</option>
          <option *ngFor="let s of statuses" [value]="s">{{ s }}</option>
        </select>
        <select class="border rounded-lg px-3 py-2 text-sm" [(ngModel)]="severityFilter" (change)="load()">
          <option value="">All Severity</option>
          <option *ngFor="let s of severities" [value]="s">{{ s }}</option>
        </select>
      </div>

      <ui-loading-spinner *ngIf="loading" text="Loading notices..."></ui-loading-spinner>
      <ui-empty-state *ngIf="!loading && !notices.length" title="No notices" description="No notices found for your account."></ui-empty-state>

      <div class="grid gap-3" *ngIf="!loading && notices.length">
        <div *ngFor="let n of notices; trackBy: trackById"
             class="border rounded-lg p-4 bg-white hover:shadow-sm cursor-pointer"
             [class.border-red-300]="isOverdue(n)"
             (click)="selected = selected?.id === n.id ? null : n; selected && loadDetail(n.id)">
          <div class="flex items-center justify-between mb-1">
            <span class="font-mono text-xs text-gray-500">{{ n.noticeCode }}</span>
            <span class="text-xs px-2 py-0.5 rounded" [ngClass]="statusColor(n.status)">{{ n.status }}</span>
          </div>
          <h4 class="text-sm font-semibold text-gray-900 mb-1">{{ n.subject }}</h4>
          <div class="flex flex-wrap gap-3 text-xs text-gray-500">
            <span>{{ n.departmentName }}</span>
            <span>{{ n.noticeType }}</span>
            <span *ngIf="n.responseDueDate" [class.text-red-600]="isOverdue(n)">Due: {{ n.responseDueDate }}</span>
            <span class="px-1.5 py-0.5 rounded border text-xs" [ngClass]="severityColor(n.severity)">{{ n.severity }}</span>
          </div>

          <!-- Expanded detail -->
          <div *ngIf="selected?.id === n.id && detail" class="mt-3 pt-3 border-t">
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div><span class="text-gray-400">Branch</span><br/>{{ detail.branch?.branchName || 'N/A' }}</div>
              <div><span class="text-gray-400">Reference</span><br/>{{ detail.referenceNo || '—' }}</div>
              <div><span class="text-gray-400">Notice Date</span><br/>{{ detail.noticeDate }}</div>
              <div><span class="text-gray-400">Received</span><br/>{{ detail.receivedDate }}</div>
            </div>
            <p *ngIf="detail.description" class="text-xs text-gray-600 mt-2">{{ detail.description }}</p>
            <div *ngIf="detail.documents?.length" class="mt-2">
              <span class="text-xs font-semibold text-gray-500">Documents</span>
              <div *ngFor="let d of detail.documents" class="text-xs text-blue-600 hover:underline mt-0.5">
                <a [href]="d.fileUrl" target="_blank">{{ d.fileName }}</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ClientNoticesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = false;
  notices: Notice[] = [];
  kpis: NoticeKpis | null = null;
  selected: Notice | null = null;
  detail: Notice | null = null;
  search = '';
  statusFilter = '';
  severityFilter = '';
  statuses = ['RECEIVED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'RESPONSE_DRAFTED', 'RESPONSE_SUBMITTED', 'CLOSED', 'ESCALATED'];
  severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  constructor(private api: NoticesService) {}
  ngOnInit() { this.load(); this.api.clientKpis().pipe(takeUntil(this.destroy$)).subscribe({ next: k => this.kpis = k }); }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  load() {
    this.loading = true;
    const f: any = {};
    if (this.search) f.search = this.search;
    if (this.statusFilter) f.status = this.statusFilter;
    if (this.severityFilter) f.severity = this.severityFilter;
    this.api.clientList(f).pipe(takeUntil(this.destroy$), timeout(15000), finalize(() => this.loading = false))
      .subscribe({ next: d => this.notices = d });
  }

  loadDetail(id: string) {
    this.api.clientGetOne(id).pipe(takeUntil(this.destroy$)).subscribe({ next: d => this.detail = d });
  }

  severityColor(s: string) {
    if (s === 'CRITICAL') return 'text-red-700 bg-red-50 border-red-200';
    if (s === 'HIGH') return 'text-orange-700 bg-orange-50 border-orange-200';
    if (s === 'MEDIUM') return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    return 'text-green-700 bg-green-50 border-green-200';
  }
  statusColor(s: string) {
    if (s === 'CLOSED') return 'text-green-700 bg-green-50';
    if (s === 'ESCALATED') return 'text-red-700 bg-red-50';
    if (s === 'ACTION_REQUIRED') return 'text-orange-700 bg-orange-50';
    return 'text-gray-700 bg-gray-50';
  }
  isOverdue(n: Notice) { return !!n.responseDueDate && n.responseDueDate < new Date().toISOString().slice(0,10) && n.status !== 'CLOSED'; }
  trackById(_: number, item: any) { return item.id; }
}

import { ChangeDetectorRef, Component, NgZone, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, timeout } from 'rxjs';
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

      @if (kpis) {
<section class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        <div class="border rounded-lg p-3 bg-white"><span class="block text-xl font-bold">{{ kpis.total }}</span><span class="text-xs text-gray-500">Total</span></div>
        <div class="border border-orange-200 rounded-lg p-3 bg-orange-50"><span class="block text-xl font-bold">{{ kpis.actionRequired }}</span><span class="text-xs text-gray-500">Action Required</span></div>
        <div class="border border-red-200 rounded-lg p-3 bg-red-50"><span class="block text-xl font-bold">{{ kpis.overdue }}</span><span class="text-xs text-gray-500">Overdue</span></div>
        <div class="border border-brand-200 rounded-lg p-3 bg-brand-50"><span class="block text-xl font-bold">{{ kpis.responseSubmitted }}</span><span class="text-xs text-gray-500">Responded</span></div>
        <div class="border border-green-200 rounded-lg p-3 bg-green-50"><span class="block text-xl font-bold">{{ kpis.closed }}</span><span class="text-xs text-gray-500">Closed</span></div>
        <div class="border border-red-200 rounded-lg p-3 bg-red-50"><span class="block text-xl font-bold">{{ kpis.critical }}</span><span class="text-xs text-gray-500">Critical</span></div>
        <div class="border border-red-200 rounded-lg p-3 bg-red-50"><span class="block text-xl font-bold">{{ kpis.escalated }}</span><span class="text-xs text-gray-500">Escalated</span></div>
      </section>
}

      <div class="flex flex-wrap gap-2 mb-4">
        <input type="text" class="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]" placeholder="Search..." [(ngModel)]="search" (input)="load()" />
        <select class="border rounded-lg px-3 py-2 text-sm" [(ngModel)]="statusFilter" (change)="load()">
          <option value="">All Statuses</option>
          @for (s of statuses; track s) {
<option [value]="s">{{ s }}</option>
}
        </select>
        <select class="border rounded-lg px-3 py-2 text-sm" [(ngModel)]="severityFilter" (change)="load()">
          <option value="">All Severity</option>
          @for (s of severities; track s) {
<option [value]="s">{{ s }}</option>
}
        </select>
      </div>

      @if (loading) {
<ui-loading-spinner text="Loading notices..."></ui-loading-spinner>
}
      @if (!loading && !notices.length) {
<ui-empty-state title="No notices" description="No notices found for your account."></ui-empty-state>
}

      @if (!loading && notices.length) {
<div class="grid gap-3">
        @for (n of notices; track trackById($index, n)) {
<div
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
            @if (n.responseDueDate) {
<span [class.text-red-600]="isOverdue(n)">Due: {{ n.responseDueDate }}</span>
}
            <span class="px-1.5 py-0.5 rounded border text-xs" [ngClass]="severityColor(n.severity)">{{ n.severity }}</span>
          </div>

          <!-- Expanded detail -->
          @if (selected?.id === n.id && detail) {
<div class="mt-3 pt-3 border-t">
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div><span class="text-gray-400">Branch</span><br/>{{ detail.branch?.branchName || 'N/A' }}</div>
              <div><span class="text-gray-400">Reference</span><br/>{{ detail.referenceNo || '—' }}</div>
              <div><span class="text-gray-400">Notice Date</span><br/>{{ detail.noticeDate }}</div>
              <div><span class="text-gray-400">Received</span><br/>{{ detail.receivedDate }}</div>
            </div>
            @if (detail.description) {
<p class="text-xs text-gray-600 mt-2">{{ detail.description }}</p>
}
            @if (detail.documents?.length) {
<div class="mt-2">
              <span class="text-xs font-semibold text-gray-500">Documents</span>
              @for (d of detail.documents; track d) {
<div class="text-xs text-brand-600 hover:underline mt-0.5">
                <a [href]="d.fileUrl" target="_blank">{{ d.fileName }}</a>
              </div>
}
            </div>
}
          </div>
}
        </div>
}
      </div>
}
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

  constructor(private api: NoticesService, private zone: NgZone, private cdr: ChangeDetectorRef) {}
  ngOnInit() { this.load(); this.api.clientKpis().pipe(takeUntil(this.destroy$)).subscribe({ next: k => { this.kpis = k; this.cdr.markForCheck(); }, error: () => {} }); }
  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  private settle(arr: Notice[]) {
    this.zone.run(() => {
      this.notices = arr;
      this.loading = false;
      this.cdr.detectChanges();
    });
  }

  load() {
    this.loading = true;
    const f: any = {};
    if (this.search) f.search = this.search;
    if (this.statusFilter) f.status = this.statusFilter;
    if (this.severityFilter) f.severity = this.severityFilter;
    // Hard safety: no matter what happens (interceptor swallow, zone miss,
    // observable never completes) force the spinner off after 12s.
    const watchdog = setTimeout(() => {
      if (this.loading) this.settle(this.notices ?? []);
    }, 12000);
    this.api.clientList(f).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
    ).subscribe({
      next: (d: any) => {
        clearTimeout(watchdog);
        const arr = Array.isArray(d) ? d : (d?.data ?? d?.items ?? []);
        this.settle(arr);
      },
      error: () => {
        clearTimeout(watchdog);
        this.settle([]);
      },
    });
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

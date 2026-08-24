import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  ClientMobileAttendanceService,
  FailedScanRow,
  FailedScanStats,
  FaceFailureAlertRow,
  TopFailedScanSubjectRow,
} from '../../client/mobile-attendance/client-mobile-attendance.service';

type SubjectFilter = 'ALL' | 'EMPLOYEE' | 'CONTRACTOR';

// Mirror of backend reason taxonomy in face_failed_scan_logs.reason.
const REASONS: { value: string; label: string }[] = [
  { value: '', label: 'Any reason' },
  { value: 'FACE_MISMATCH', label: 'Face mismatch' },
  { value: 'LIVENESS_FAIL', label: 'Liveness fail' },
  { value: 'MULTI_FACE', label: 'Multiple faces' },
  { value: 'MASK_DETECTED', label: 'Mask detected' },
  { value: 'GEOFENCE_OUTSIDE', label: 'Outside geofence' },
  { value: 'MOCK_LOCATION', label: 'Mock location' },
  { value: 'ROOTED_DEVICE', label: 'Rooted device' },
  { value: 'EMPLOYEE_INACTIVE', label: 'Employee inactive' },
  { value: 'EMPLOYEE_EXITED', label: 'Employee exited' },
  { value: 'COOLDOWN_ACTIVE', label: 'Cooldown active' },
  { value: 'CROSS_SOURCE_CONFLICT', label: 'Cross-source conflict' },
  { value: 'CLOCK_SKEW', label: 'Clock skew' },
  { value: 'INVALID_TIME', label: 'Invalid time' },
  { value: 'QUALITY_LOW', label: 'Low quality' },
  { value: 'OTHER', label: 'Other' },
];

@Component({
  selector: 'app-branch-face-failures',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page-header
      title="Face Attendance Failures"
      subtitle="Rejected face-attendance scans for in-house employees and contractor workers in your branch"
    ></ui-page-header>

    <div class="p-4 md:p-6 space-y-4">
      @if (visibleAlerts().length) {
<div
           class="bg-rose-50 border border-rose-200 rounded-xl p-3 md:p-4 shadow-sm space-y-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-rose-800">
            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-600 text-white text-xs font-bold">!</span>
            <span class="text-sm font-semibold">Recent face-failure spike alerts</span>
            <span class="text-xs text-rose-600">({{ visibleAlerts().length }} of last 7 days)</span>
          </div>
          <button type="button" class="text-xs font-medium text-rose-700 hover:text-rose-900"
                  (click)="dismissAllAlerts()">Dismiss all</button>
        </div>
        <ul class="space-y-1.5">
          @for (a of visibleAlerts(); track a) {
<li
              class="flex items-start justify-between gap-3 bg-white border border-rose-100 rounded-lg px-3 py-2">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-gray-900 truncate" [title]="a.title">{{ a.title }}</div>
              @if (a.message) {
<div class="text-xs text-gray-600 mt-0.5">{{ a.message }}</div>
}
              <div class="text-[11px] text-gray-400 mt-0.5">{{ a.createdAt | date:'dd MMM yyyy, HH:mm' }}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button type="button"
                      class="text-xs px-2 py-1 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-100 font-medium"
                      title="Filter the dashboard to the 24h window of this alert"
                      (click)="investigateAlert(a)">Investigate</button>
              <button type="button" class="text-rose-400 hover:text-rose-700 text-lg leading-none"
                      title="Dismiss this alert" (click)="dismissAlert(a.id)">×</button>
            </div>
          </li>
}
        </ul>
      </div>
}
      @if (stats) {
<div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div class="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <div class="text-xs font-medium text-gray-500">Total</div>
          <div class="text-2xl font-semibold text-gray-900">{{ stats.total }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <div class="text-xs font-medium text-sky-600">Employees</div>
          <div class="text-2xl font-semibold text-sky-700">{{ stats.bySubject.employee }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <div class="text-xs font-medium text-violet-600">Contractors</div>
          <div class="text-2xl font-semibold text-violet-700">{{ stats.bySubject.contractor }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-3 shadow-sm col-span-2 md:col-span-1">
          <div class="text-xs font-medium text-gray-500">Top reason</div>
          <div class="text-sm font-semibold text-rose-700 truncate" [title]="topReason()?.reason">
            {{ topReason()?.reason || '—' }}
          </div>
          <div class="text-xs text-gray-500">{{ topReason()?.count || 0 }} hits</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-3 shadow-sm col-span-2 md:col-span-1">
          <div class="text-xs font-medium text-gray-500">Top branch</div>
          <div class="text-sm font-semibold text-indigo-700 truncate" [title]="topBranch()?.branchName || ''">
            {{ topBranch()?.branchName || '—' }}
          </div>
          <div class="text-xs text-gray-500">{{ topBranch()?.count || 0 }} hits</div>
        </div>
      </div>
}

      @if (stats && (stats.byReason.length || stats.byBranch.length || topSubjects.length)) {
<div
           class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div class="px-4 py-2 border-b border-gray-100 text-xs font-semibold uppercase text-gray-500">
            Top reasons
          </div>
          <ul class="divide-y divide-gray-100">
            @for (r of topReasons(); track r) {
<li class="text-sm">
              <button type="button"
                      class="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 text-left"
                      [class.bg-rose-50]="reason === r.reason"
                      [class.text-rose-800]="reason === r.reason"
                      [title]="reason === r.reason ? 'Clear reason filter' : 'Filter by ' + r.reason"
                      (click)="toggleReason(r.reason)">
                <span class="truncate pr-2">{{ r.reason }}</span>
                <span class="text-rose-700 font-medium text-xs">{{ r.count }}</span>
              </button>
            </li>
}
            @if (!stats.byReason.length) {
<li class="px-4 py-3 text-xs text-gray-400 text-center">
              No data
            </li>
}
          </ul>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div class="px-4 py-2 border-b border-gray-100 text-xs font-semibold uppercase text-gray-500">
            Top branches
          </div>
          <ul class="divide-y divide-gray-100">
            @for (b of topBranches(); track b) {
<li class="flex items-center justify-between px-4 py-2 text-sm">
              <span class="text-gray-700 truncate pr-2" [title]="b.branchName || ''">
                {{ b.branchName || '(unassigned)' }}
              </span>
              <span class="text-indigo-700 font-medium text-xs">{{ b.count }}</span>
            </li>
}
            @if (!stats.byBranch.length) {
<li class="px-4 py-3 text-xs text-gray-400 text-center">
              No data
            </li>
}
          </ul>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div class="px-4 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
            <span class="text-xs font-semibold uppercase text-gray-500">Top offenders</span>
            <div class="flex items-center gap-3">
              <label class="text-[10px] text-gray-500 flex items-center gap-1">
                ≥
                <input type="number" min="0" max="999" step="1"
                       [(ngModel)]="minCount" name="minCount"
                       (change)="reloadTopSubjects()"
                       class="w-12 px-1 py-0.5 text-xs border border-gray-200 rounded">
                hits
              </label>
              <button type="button"
                      class="text-[10px] text-blue-700 hover:underline disabled:text-gray-400"
                      [disabled]="!topSubjects.length"
                      (click)="exportOffendersCsv()">
                Export CSV
              </button>
            </div>
          </div>
          <ul class="divide-y divide-gray-100">
            @for (s of topSubjects; track s) {

            <li class="flex items-center justify-between px-4 py-2 text-sm">
              <button type="button"
                      class="text-left truncate pr-2 text-gray-700 hover:text-blue-700"
                      [title]="subjectLabel(s)"
                      (click)="focusOnSubject(s)">
                <div class="truncate">{{ subjectLabel(s) }}</div>
                <div class="text-xs text-gray-500">
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded"
                        [class.bg-sky-100]="s.subjectType === 'EMPLOYEE'"
                        [class.text-sky-700]="s.subjectType === 'EMPLOYEE'"
                        [class.bg-violet-100]="s.subjectType === 'CONTRACTOR'"
                        [class.text-violet-700]="s.subjectType === 'CONTRACTOR'">
                    {{ s.subjectType }}
                  </span>
                  @if (s.subjectType === 'CONTRACTOR' && s.contractorName) {
<span
                        class="ml-1">· {{ s.contractorName }}</span>
}
                  @if (s.subjectType === 'EMPLOYEE' && s.employeeCode) {
<span
                        class="ml-1">· {{ s.employeeCode }}</span>
}
                  @if (s.topReason) {
<span class="ml-1 text-amber-700">· {{ s.topReason }}</span>
}
                  @if (s.avgMatchScore !== null) {
<span class="ml-1">· avg {{ fmtScore(s.avgMatchScore) }}</span>
}
                  @if (s.lastFailedAt) {
<span class="ml-1" [title]="s.lastFailedAt">· last {{ s.lastFailedAt | date:'MMM d, HH:mm' }}</span>
}
                </div>
              </button>
              <div class="flex items-center gap-2">
                @if (isHighOffender(s)) {
<span
                      class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-600 text-white"
                      title="High failure volume">HIGH</span>
}
                <button type="button"
                        class="text-gray-400 hover:text-gray-700 text-xs w-5 text-center"
                        [title]="expandedKey === subjectKey(s) ? 'Hide recent failures' : 'Show recent failures'"
                        (click)="toggleExpand(s)">
                  {{ expandedKey === subjectKey(s) ? '▾' : '▸' }}
                </button>
                <span class="text-rose-700 font-medium text-xs whitespace-nowrap">{{ s.count }}</span>
              </div>
            </li>
            @if (expandedKey === subjectKey(s)) {
<li class="px-4 py-2 bg-gray-50">
              @if (expandingKey === subjectKey(s)) {
<div class="text-xs text-gray-400">Loading…</div>
}
              @if (expandingKey !== subjectKey(s)) {

                @if (!expandedRows.length) {
<div class="text-xs text-gray-400">No recent failures</div>
}
                @if (expandedRows.length) {
<ul class="space-y-1">
                  @for (r of expandedRows; track r) {
<li
                      class="text-[11px] text-gray-600 flex items-center justify-between gap-2">
                    <span class="truncate">{{ r.attemptedAt | date:'MMM d, HH:mm' }} · {{ r.reason }}</span>
                    <span class="text-gray-400 whitespace-nowrap">{{ fmtScore(r.matchScore) }}</span>
                  </li>
}
                </ul>
}
              
}
            </li>
}
            
}
            @if (!topSubjects.length) {
<li class="px-4 py-3 text-xs text-gray-400 text-center">
              No data
            </li>
}
          </ul>
        </div>
      </div>
}

      @if (stats && hasDaily()) {
<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div class="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div class="text-xs font-semibold uppercase text-gray-500">Daily failure trend</div>
          <div class="text-xs text-gray-500 flex items-center gap-3">
            <span>Total: <span class="font-semibold text-gray-700">{{ dailyTotal() }}</span></span>
            <span>Active days: <span class="font-semibold text-gray-700">{{ dailyActiveDays() }}</span></span>
            <span>Avg/day: <span class="font-semibold text-gray-700">{{ dailyAvgPerActive() }}</span></span>
            <span class="text-gray-400">Peak: {{ peakDayLabel() }}</span>
          </div>
        </div>
        <div class="flex items-end gap-0.5 h-20">
          @for (d of stats.byDay; track d) {
<div
               class="flex-1 bg-amber-500/70 hover:bg-amber-600 rounded-sm transition-colors"
               [style.height.%]="dayBarPct(d.count)"
               [title]="d.day + ': ' + d.count"></div>
}
        </div>
        @if (stats.byDay.length) {
<div class="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>{{ dayShort(stats.byDay[0].day) }}</span>
          <span>{{ dayShort(stats.byDay[stats.byDay.length - 1].day) }}</span>
        </div>
}
      </div>
}

      @if (stats && hasHourly()) {
<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs font-semibold uppercase text-gray-500">Failures by hour of day</div>
          <div class="text-xs text-gray-400">Peak: {{ peakHourLabel() }}</div>
        </div>
        <div class="flex items-end gap-0.5 h-20">
          @for (h of stats.byHour; track h) {
<div
               class="flex-1 bg-rose-500/70 hover:bg-rose-600 rounded-sm transition-colors"
               [style.height.%]="barPct(h.count)"
               [title]="hourLabel(h.hour) + ': ' + h.count"></div>
}
        </div>
        <div class="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>
}

      @if (stats && hasDow()) {
<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs font-semibold uppercase text-gray-500">Failures by day of week</div>
          <div class="text-xs text-gray-400">Peak: {{ peakDowLabel() }}</div>
        </div>
        <div class="flex items-end gap-1 h-20">
          @for (d of stats.byDayOfWeek; track d) {
<div
               class="flex-1 bg-indigo-500/70 hover:bg-indigo-600 rounded-sm transition-colors"
               [style.height.%]="dowBarPct(d.count)"
               [title]="dowLabel(d.dow) + ': ' + d.count"></div>
}
        </div>
        <div class="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
        </div>
      </div>
}

      @if (stats && topDevices().length) {
<div
           class="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div class="px-4 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
          <span class="text-xs font-semibold uppercase text-gray-500">Top devices by failure count</span>
          @if (modeBreakdown().length) {
<span class="flex items-center gap-1">
            @for (m of modeBreakdown(); track m) {
<span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-gray-700"
                  [title]="m.mode + ': ' + m.count + ' failures'">
              {{ m.mode }} <span class="text-rose-600">{{ m.count }}</span>
            </span>
}
          </span>
}
        </div>
        <ul class="divide-y divide-gray-100">
          @for (d of topDevices(); track d) {
<li
              class="flex items-center justify-between px-4 py-2 text-sm gap-2">
            <div class="min-w-0 flex-1">
              <div class="text-gray-700 truncate" [title]="deviceLabel(d)">{{ deviceLabel(d) }}</div>
              <div class="text-xs text-gray-500 mt-0.5">
                @if (d.mode) {
<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{{ d.mode }}</span>
}
                @if (d.lastFailedAt) {
<span class="ml-1" [title]="d.lastFailedAt">last {{ d.lastFailedAt | date:'MMM d, HH:mm' }}</span>
}
              </div>
            </div>
            <span class="text-rose-700 font-medium text-xs whitespace-nowrap">{{ d.count }}</span>
          </li>
}
        </ul>
      </div>
}

      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
        <div class="flex items-center gap-2 text-xs flex-wrap">
          <span class="text-gray-500 font-medium uppercase">Quick range:</span>
          @for (p of rangePresets; track p) {
<button type="button"
                  class="px-2.5 py-1 rounded-full border transition-colors"
                  [class.bg-blue-50]="activeRange === p.days"
                  [class.border-blue-300]="activeRange === p.days"
                  [class.text-blue-700]="activeRange === p.days"
                  [class.font-semibold]="activeRange === p.days"
                  [class.border-gray-200]="activeRange !== p.days"
                  [class.text-gray-600]="activeRange !== p.days"
                  [class.hover:bg-gray-50]="activeRange !== p.days"
                  (click)="setRange(p.days)">{{ p.label }}</button>
}
          @if (activeRange === null) {
<span class="text-gray-400">(custom range)</span>
}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label for="subj" class="block text-xs font-medium text-gray-600 mb-1">Subject</label>
          <select id="subj" name="subject" [(ngModel)]="subject"
                  (change)="load()" class="ui-input">
            <option value="ALL">All</option>
            <option value="EMPLOYEE">Employees only</option>
            <option value="CONTRACTOR">Contractors only</option>
          </select>
        </div>

        <div>
          <label for="reason" class="block text-xs font-medium text-gray-600 mb-1">Reason</label>
          <select id="reason" name="reason" [(ngModel)]="reason"
                  (change)="load()" class="ui-input">
            @for (r of reasons; track r) {
<option [value]="r.value">{{ r.label }}</option>
}
          </select>
        </div>

        <div>
          <label for="from" class="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input id="from" name="from" type="date" [(ngModel)]="from"
                 (change)="onDateChange()" class="ui-input">
        </div>
        <div>
          <label for="to" class="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input id="to" name="to" type="date" [(ngModel)]="to"
                 (change)="onDateChange()" class="ui-input">
        </div>

        <div class="flex items-end">
          <button type="button" class="ui-btn-secondary w-full"
                  [disabled]="loading" (click)="load()">
            Refresh
          </button>
        </div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 shadow-sm">
        @if (hasActiveFilters()) {
<div class="px-4 py-2 border-b border-blue-100 bg-blue-50 flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[10px] uppercase font-semibold text-blue-700">Active filters:</span>
            @if (subject !== 'ALL') {
<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-blue-200 text-xs text-blue-800">
              Subject: {{ subject === 'EMPLOYEE' ? 'Employees' : 'Contractors' }}
              <button type="button" class="text-blue-400 hover:text-blue-700" title="Clear subject" (click)="clearSubject()">×</button>
            </span>
}
            @if (reason) {
<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-blue-200 text-xs text-blue-800">
              Reason: {{ reason }}
              <button type="button" class="text-blue-400 hover:text-blue-700" title="Clear reason" (click)="clearReason()">×</button>
            </span>
}
            @if (focusLabel) {
<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-blue-200 text-xs text-blue-800">
              Person: {{ focusLabel }}
              <button type="button" class="text-blue-400 hover:text-blue-700" title="Clear person" (click)="clearFocus()">×</button>
            </span>
}
            @if (activeRange === null && (from || to)) {
<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-blue-200 text-xs text-blue-800">
              Range: {{ from || '…' }} → {{ to || '…' }}
              <button type="button" class="text-blue-400 hover:text-blue-700" title="Reset to last 7 days" (click)="clearCustomRange()">×</button>
            </span>
}
            @if (minCount !== 5) {
<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-blue-200 text-xs text-blue-800">
              Top offenders ≥ {{ minCount }}
              <button type="button" class="text-blue-400 hover:text-blue-700" title="Reset min hits" (click)="clearMinCount()">×</button>
            </span>
}
          </div>
          <button type="button" class="text-xs font-medium text-blue-700 hover:text-blue-900" (click)="resetFilters()">Reset all</button>
        </div>
}
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 class="font-semibold text-gray-900">
            Failures
            @if (rows.length) {
<span class="ml-2 text-xs font-normal text-gray-500">
              ({{ rows.length }})
            </span>
}
          </h3>
          <div class="flex items-center gap-2">
            <button type="button" class="ui-btn-secondary text-xs"
                    title="Copy a shareable link to this filtered view"
                    (click)="copyLink()">
              {{ copiedLink ? 'Link copied' : 'Copy link' }}
            </button>
            <button type="button" class="ui-btn-secondary text-xs"
                    [disabled]="exportingStats || loading" (click)="exportStatsCsv()">
              {{ exportingStats ? 'Exporting…' : 'Export stats CSV' }}
            </button>
            <button type="button" class="ui-btn-secondary text-xs"
                    [disabled]="exporting || loading" (click)="exportCsv()">
              {{ exporting ? 'Exporting…' : 'Export CSV' }}
            </button>
          </div>
        </div>

        @if (loading) {
<div class="py-10 flex justify-center">
          <ui-loading-spinner></ui-loading-spinner>
        </div>
}

        @if (!loading) {

          @if (!rows.length) {
<div>
            <ui-empty-state
              title="No failures found"
              description="No face-attendance rejections match the current filters in your branch."
            ></ui-empty-state>
          </div>
}

          @if (rows.length) {
<div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-xs font-medium text-gray-600 uppercase">
                <tr>
                  <th class="px-4 py-2">Attempted</th>
                  <th class="px-4 py-2">Subject</th>
                  <th class="px-4 py-2">Name</th>
                  <th class="px-4 py-2">Contractor</th>
                  <th class="px-4 py-2">Reason</th>
                  <th class="px-4 py-2">Detail</th>
                  <th class="px-4 py-2">Match</th>
                  <th class="px-4 py-2">Liveness</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (r of rows; track r) {
<tr class="hover:bg-gray-50">
                  <td class="px-4 py-2 whitespace-nowrap">
                    {{ r.attemptedAt | date:'dd MMM yyyy, HH:mm' }}
                  </td>
                  <td class="px-4 py-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          [class.bg-sky-100]="subjectOf(r) === 'EMPLOYEE'"
                          [class.text-sky-700]="subjectOf(r) === 'EMPLOYEE'"
                          [class.bg-violet-100]="subjectOf(r) === 'CONTRACTOR'"
                          [class.text-violet-700]="subjectOf(r) === 'CONTRACTOR'"
                          [class.bg-gray-100]="subjectOf(r) === 'UNKNOWN'"
                          [class.text-gray-700]="subjectOf(r) === 'UNKNOWN'">
                      {{ subjectOf(r) }}
                    </span>
                  </td>
                  <td class="px-4 py-2">
                    <button type="button" class="text-left hover:text-blue-700"
                            [disabled]="!r.employeeId && !r.contractorEmployeeId"
                            [class.cursor-default]="!r.employeeId && !r.contractorEmployeeId"
                            (click)="focusOn(r)"
                            title="Filter to this person">
                      <div>{{ r.employeeName || r.contractorEmployeeName || '—' }}</div>
                      @if (r.employeeCode) {
<div class="text-xs text-gray-500">
                        {{ r.employeeCode }}
                      </div>
}
                    </button>
                  </td>
                  <td class="px-4 py-2 text-xs text-gray-600">
                    {{ r.contractorName || '—' }}
                  </td>
                  <td class="px-4 py-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-xs font-medium">
                      {{ r.reason }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-xs text-gray-600">
                    {{ r.reasonDetail || '—' }}
                  </td>
                  <td class="px-4 py-2 text-xs text-gray-600">{{ fmtScore(r.matchScore) }}</td>
                  <td class="px-4 py-2 text-xs text-gray-600">{{ fmtScore(r.livenessScore) }}</td>
                </tr>
}
              </tbody>
            </table>
          </div>
}
        
}
      </div>
    </div>
  `,
})
export class BranchFaceFailuresComponent implements OnInit {
  readonly reasons = REASONS;

  rows: FailedScanRow[] = [];
  stats: FailedScanStats | null = null;
  topSubjects: TopFailedScanSubjectRow[] = [];
  alerts: FaceFailureAlertRow[] = [];
  dismissedAlertIds = new Set<string>();
  expandedKey: string | null = null;
  expandedRows: FailedScanRow[] = [];
  expandingKey: string | null = null;
  minCount = 5;
  subject: SubjectFilter = 'ALL';
  reason = '';
  from = '';
  to = '';
  loading = false;
  exporting = false;
  exportingStats = false;
  copiedLink = false;
  focusEmployeeId: string | null = null;
  focusContractorId: string | null = null;
  focusLabel = '';

  constructor(
    private svc: ClientMobileAttendanceService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (!this.restoreUrlState()) {
      this.setRange(7);
    } else {
      this.load();
    }
    this.loadAlerts();
  }

  loadAlerts(): void {
    this.svc.listFaceFailureAlerts(20).subscribe({
      next: (rows) => {
        this.alerts = rows ?? [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.alerts = [];
        this.cdr.markForCheck();
      },
    });
  }

  visibleAlerts(): FaceFailureAlertRow[] {
    return this.alerts.filter((a) => !this.dismissedAlertIds.has(a.id));
  }

  dismissAlert(id: string): void {
    // Face-failure alerts are spike aggregations computed client-side (their ids
    // are synthetic "branchId:reason:hour" keys, not persisted notifications), so
    // dismissal is purely local — there is no server-side read state to update.
    this.dismissedAlertIds.add(id);
  }

  dismissAllAlerts(): void {
    this.alerts.forEach((a) => {
      this.dismissedAlertIds.add(a.id);
    });
  }

  investigateAlert(a: FaceFailureAlertRow): void {
    const created = new Date(a.createdAt);
    const start = new Date(created.getTime() - 24 * 60 * 60 * 1000);
    this.from = this.toIsoDate(start);
    this.to = this.toIsoDate(created);
    this.activeRange = null;
    this.load();
    if (typeof window !== 'undefined') {
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    }
  }

  private restoreUrlState(): boolean {
    if (typeof window === 'undefined') return false;
    const p = new URLSearchParams(window.location.search);
    if (![...p.keys()].length) return false;
    const from = p.get('from');
    const to = p.get('to');
    const subj = p.get('subject');
    const reason = p.get('reason');
    const min = p.get('min');
    if (from) this.from = from;
    if (to) this.to = to;
    if (from || to) this.activeRange = null;
    if (subj === 'EMPLOYEE' || subj === 'CONTRACTOR') this.subject = subj;
    if (reason) this.reason = reason;
    if (min !== null && !Number.isNaN(Number(min))) {
      this.minCount = Math.max(0, Math.min(999, Number(min)));
    }
    return true;
  }

  private syncUrlState(): void {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams();
    if (this.from) p.set('from', this.from);
    if (this.to) p.set('to', this.to);
    if (this.subject !== 'ALL') p.set('subject', this.subject);
    if (this.reason) p.set('reason', this.reason);
    if (this.minCount !== 5) p.set('min', String(this.minCount));
    const qs = p.toString();
    const url = window.location.pathname + (qs ? '?' + qs : '');
    window.history.replaceState({}, '', url);
  }

  isHighOffender(s: TopFailedScanSubjectRow): boolean {
    if (!this.topSubjects.length) return false;
    const max = this.topSubjects[0]?.count ?? 0;
    return s.count >= 3 && max > 0 && s.count >= Math.ceil(max / 2);
  }

  load(): void {
    this.loading = true;
    this.syncUrlState();
    const from = this.from ? `${this.from}T00:00:00.000Z` : undefined;
    const to = this.to ? `${this.to}T23:59:59.999Z` : undefined;
    const subjectType =
      this.subject === 'EMPLOYEE' || this.subject === 'CONTRACTOR'
        ? this.subject
        : undefined;
    this.svc
      .failedScanStats({ from, to, subjectType })
      .subscribe({
        next: (s) => {
          this.stats = s;
          this.cdr.markForCheck();
        },
        error: () => {
          /* non-fatal; chips simply stay blank */
        },
      });
    this.svc
      .topFailedScanSubjects({ from, to, subjectType, limit: 10, minCount: this.minCount })
      .subscribe({
        next: (s) => {
          this.topSubjects = s;
          this.cdr.markForCheck();
        },
        error: () => {
          this.topSubjects = [];
          this.cdr.markForCheck();
        },
      });
    this.svc
      .listFailedScans({
        from,
        to,
        reason: this.reason || undefined,
        subjectType,
        employeeId: this.focusEmployeeId || undefined,
        contractorEmployeeId: this.focusContractorId || undefined,
        limit: 500,
      })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.rows = rows;
          this.cdr.markForCheck();
        },
        error: () => this.toast.error('Failed to load face failures'),
      });
  }

  topReason(): { reason: string; count: number } | null {
    return this.stats?.byReason?.[0] ?? null;
  }

  topReasons(): Array<{ reason: string; count: number }> {
    return this.stats?.byReason?.slice(0, 5) ?? [];
  }

  topBranches(): Array<{ branchName: string | null; count: number }> {
    return this.stats?.byBranch?.slice(0, 5) ?? [];
  }

  readonly rangePresets: Array<{ label: string; days: number }> = [
    { label: '7d', days: 7 },
    { label: '30d', days: 30 },
    { label: '90d', days: 90 },
  ];
  activeRange: number | null = 7;

  setRange(days: number): void {
    this.activeRange = days;
    const today = new Date();
    const start = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    this.to = this.toIsoDate(today);
    this.from = this.toIsoDate(start);
    this.load();
  }

  onDateChange(): void {
    this.activeRange = null;
    this.load();
  }

  toggleReason(r: string): void {
    this.reason = this.reason === r ? '' : r;
    this.load();
  }

  dailyTotal(): number {
    return (this.stats?.byDay ?? []).reduce((s, d) => s + d.count, 0);
  }

  dailyActiveDays(): number {
    return (this.stats?.byDay ?? []).filter((d) => d.count > 0).length;
  }

  dailyAvgPerActive(): number {
    const active = this.dailyActiveDays();
    if (!active) return 0;
    return Math.round(this.dailyTotal() / active);
  }

  hasDaily(): boolean {
    return (this.stats?.byDay ?? []).some((d) => d.count > 0);
  }

  private maxDayCount(): number {
    const m = Math.max(0, ...(this.stats?.byDay ?? []).map((d) => d.count));
    return m || 1;
  }

  dayBarPct(count: number): number {
    return Math.max(2, Math.round((count / this.maxDayCount()) * 100));
  }

  dayShort(day: string): string {
    // 'YYYY-MM-DD' -> 'MMM d'
    const parts = day?.split('-');
    if (!parts || parts.length !== 3) return day;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = parseInt(parts[1], 10);
    return `${months[m - 1] ?? parts[1]} ${parseInt(parts[2], 10)}`;
  }

  peakDayLabel(): string {
    const arr = this.stats?.byDay ?? [];
    if (!arr.length) return '—';
    let best = arr[0];
    for (const d of arr) if (d.count > best.count) best = d;
    if (!best.count) return '—';
    return `${this.dayShort(best.day)} (${best.count})`;
  }

  hasHourly(): boolean {
    return (this.stats?.byHour ?? []).some((h) => h.count > 0);
  }

  topDevices(): Array<{
    deviceId: string | null;
    deviceLabel: string | null;
    mode: string | null;
    lastFailedAt: string | null;
    count: number;
  }> {
    return (this.stats?.byDevice ?? []).slice(0, 5);
  }

  modeBreakdown(): Array<{ mode: string; count: number }> {
    return this.stats?.byMode ?? [];
  }

  deviceLabel(d: { deviceId: string | null; deviceLabel: string | null }): string {
    if (d.deviceLabel) return d.deviceLabel;
    if (d.deviceId) return d.deviceId.slice(0, 8) + '…';
    return '(unknown device)';
  }

  private maxHourCount(): number {
    let m = 0;
    for (const h of this.stats?.byHour ?? []) if (h.count > m) m = h.count;
    return m || 1;
  }

  barPct(count: number): number {
    return Math.max(2, Math.round((count / this.maxHourCount()) * 100));
  }

  hourLabel(h: number): string {
    return `${`${h}`.padStart(2, '0')}:00`;
  }

  peakHourLabel(): string {
    const arr = this.stats?.byHour ?? [];
    if (!arr.length) return '—';
    let best = arr[0];
    for (const h of arr) if (h.count > best.count) best = h;
    if (!best.count) return '—';
    return `${this.hourLabel(best.hour)} (${best.count})`;
  }

  hasDow(): boolean {
    return (this.stats?.byDayOfWeek ?? []).some((d) => d.count > 0);
  }

  private maxDowCount(): number {
    const m = Math.max(0, ...(this.stats?.byDayOfWeek ?? []).map((d) => d.count));
    return m || 1;
  }

  dowBarPct(count: number): number {
    return Math.max(2, Math.round((count / this.maxDowCount()) * 100));
  }

  dowLabel(d: number): string {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d] ?? `${d}`;
  }

  peakDowLabel(): string {
    const arr = this.stats?.byDayOfWeek ?? [];
    if (!arr.length) return '—';
    let best = arr[0];
    for (const d of arr) if (d.count > best.count) best = d;
    if (!best.count) return '—';
    return `${this.dowLabel(best.dow)} (${best.count})`;
  }

  subjectLabel(s: TopFailedScanSubjectRow): string {
    if (s.subjectType === 'EMPLOYEE') {
      return s.employeeName || s.employeeCode || 'Employee';
    }
    return s.contractorEmployeeName || 'Contractor worker';
  }

  reloadTopSubjects(): void {
    const from = this.from ? `${this.from}T00:00:00.000Z` : undefined;
    const to = this.to ? `${this.to}T23:59:59.999Z` : undefined;
    const subjectType =
      this.subject === 'EMPLOYEE' || this.subject === 'CONTRACTOR'
        ? this.subject
        : undefined;
    this.svc
      .topFailedScanSubjects({ from, to, subjectType, limit: 10, minCount: this.minCount })
      .subscribe({
        next: (s) => (this.topSubjects = s),
        error: () => (this.topSubjects = []),
      });
  }

  focusOnSubject(s: TopFailedScanSubjectRow): void {
    if (s.subjectType === 'EMPLOYEE' && s.employeeId) {
      this.focusEmployeeId = s.employeeId;
      this.focusContractorId = null;
      this.focusLabel = this.subjectLabel(s);
    } else if (s.subjectType === 'CONTRACTOR' && s.contractorEmployeeId) {
      this.focusContractorId = s.contractorEmployeeId;
      this.focusEmployeeId = null;
      this.focusLabel = this.subjectLabel(s);
    } else {
      return;
    }
    this.load();
  }

  subjectKey(s: TopFailedScanSubjectRow): string {
    return s.subjectType === 'EMPLOYEE'
      ? `EMP:${s.employeeId ?? ''}`
      : `CTR:${s.contractorEmployeeId ?? ''}`;
  }

  toggleExpand(s: TopFailedScanSubjectRow): void {
    const key = this.subjectKey(s);
    if (this.expandedKey === key) {
      this.expandedKey = null;
      this.expandedRows = [];
      this.expandingKey = null;
      return;
    }
    this.expandedKey = key;
    this.expandedRows = [];
    this.expandingKey = key;
    const from = this.from ? `${this.from}T00:00:00.000Z` : undefined;
    const to = this.to ? `${this.to}T23:59:59.999Z` : undefined;
    this.svc
      .listFailedScans({
        from,
        to,
        employeeId: s.employeeId ?? undefined,
        contractorEmployeeId: s.contractorEmployeeId ?? undefined,
        limit: 5,
      })
      .pipe(finalize(() => { if (this.expandingKey === key) this.expandingKey = null; }))
      .subscribe({
        next: (rows) => { if (this.expandedKey === key) this.expandedRows = rows; },
        error: () => { if (this.expandedKey === key) this.expandedRows = []; },
      });
  }

  focusOn(r: FailedScanRow): void {
    if (r.employeeId) {
      this.focusEmployeeId = r.employeeId;
      this.focusContractorId = null;
      this.focusLabel =
        r.employeeName || r.employeeCode || 'Selected employee';
    } else if (r.contractorEmployeeId) {
      this.focusContractorId = r.contractorEmployeeId;
      this.focusEmployeeId = null;
      this.focusLabel =
        r.contractorEmployeeName || 'Selected contractor worker';
    } else {
      return;
    }
    this.load();
  }

  clearFocus(): void {
    if (!this.focusEmployeeId && !this.focusContractorId) return;
    this.focusEmployeeId = null;
    this.focusContractorId = null;
    this.focusLabel = '';
    this.load();
  }

  clearSubject(): void {
    if (this.subject === 'ALL') return;
    this.subject = 'ALL';
    this.load();
  }

  clearReason(): void {
    if (!this.reason) return;
    this.reason = '';
    this.load();
  }

  clearMinCount(): void {
    if (this.minCount === 5) return;
    this.minCount = 5;
    this.load();
  }

  clearCustomRange(): void {
    if (this.activeRange !== null) return;
    this.setRange(7);
  }

  hasActiveFilters(): boolean {
    return (
      this.subject !== 'ALL' ||
      !!this.reason ||
      !!this.focusEmployeeId ||
      !!this.focusContractorId ||
      this.activeRange === null ||
      this.minCount !== 5
    );
  }

  resetFilters(): void {
    this.subject = 'ALL';
    this.reason = '';
    this.focusEmployeeId = null;
    this.focusContractorId = null;
    this.focusLabel = '';
    this.minCount = 5;
    this.setRange(7);
  }

  copyLink(): void {
    if (typeof window === 'undefined' || !navigator?.clipboard) {
      this.toast.error('Clipboard unavailable in this browser');
      return;
    }
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        this.copiedLink = true;
        this.toast.success('Link copied to clipboard');
        setTimeout(() => (this.copiedLink = false), 2000);
      })
      .catch(() => this.toast.error('Failed to copy link'));
  }

  topBranch(): { branchName: string | null; count: number } | null {
    return this.stats?.byBranch?.[0] ?? null;
  }

  exportCsv(): void {
    this.exporting = true;
    const from = this.from ? `${this.from}T00:00:00.000Z` : undefined;
    const to = this.to ? `${this.to}T23:59:59.999Z` : undefined;
    const subjectType =
      this.subject === 'EMPLOYEE' || this.subject === 'CONTRACTOR'
        ? this.subject
        : undefined;
    this.svc
      .exportFailedScansCsv({
        from,
        to,
        reason: this.reason || undefined,
        subjectType,
        employeeId: this.focusEmployeeId || undefined,
        contractorEmployeeId: this.focusContractorId || undefined,
      })
      .pipe(finalize(() => (this.exporting = false)))
      .subscribe({
        next: (blob) => {
          const stamp = new Date().toISOString().slice(0, 10);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `face-failed-scans-${stamp}.csv`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        },
        error: () => this.toast.error('Failed to export CSV'),
      });
  }

  exportStatsCsv(): void {
    this.exportingStats = true;
    const from = this.from ? `${this.from}T00:00:00.000Z` : undefined;
    const to = this.to ? `${this.to}T23:59:59.999Z` : undefined;
    const subjectType =
      this.subject === 'EMPLOYEE' || this.subject === 'CONTRACTOR'
        ? this.subject
        : undefined;
    this.svc
      .exportFailedScanStatsCsv({ from, to, subjectType })
      .pipe(finalize(() => (this.exportingStats = false)))
      .subscribe({
        next: (blob) => {
          const stamp = new Date().toISOString().slice(0, 10);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `face-failed-scans-stats-${stamp}.csv`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        },
        error: () => this.toast.error('Failed to export stats CSV'),
      });
  }

  exportOffendersCsv(): void {
    if (!this.topSubjects.length) return;
    const header = ['Subject Type', 'Name', 'Code/Contractor', 'Count', 'Avg Match %', 'Last Failed At', 'Top Reason'];
    const esc = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [header.join(',')];
    for (const s of this.topSubjects) {
      const name =
        s.subjectType === 'EMPLOYEE' ? s.employeeName ?? '' : s.contractorEmployeeName ?? '';
      const codeOrContractor =
        s.subjectType === 'EMPLOYEE' ? s.employeeCode ?? '' : s.contractorName ?? '';
      const avg = s.avgMatchScore === null ? '' : (Number(s.avgMatchScore) * 100).toFixed(1);
      lines.push(
        [s.subjectType, name, codeOrContractor, s.count, avg, s.lastFailedAt ?? '', s.topReason ?? '']
          .map(esc)
          .join(','),
      );
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `face-failed-scans-offenders-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  subjectOf(r: FailedScanRow): 'EMPLOYEE' | 'CONTRACTOR' | 'UNKNOWN' {
    if (r.employeeId) return 'EMPLOYEE';
    if (r.contractorEmployeeId) return 'CONTRACTOR';
    return 'UNKNOWN';
  }

  fmtScore(v: string | number | null): string {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return `${(n * 100).toFixed(0)}%`;
  }

  private toIsoDate(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
}

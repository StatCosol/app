import { ActivatedRoute, RouterModule } from '@angular/router';
import {
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import {
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';
import {
  DayReview,
  DuplicateAlert,
  FaceDeskDashboard,
  FaceDeskDevice,
  FaceDeskService,
  FaceDeskSettings,
  PendingEnrollmentRow,
  ReviewItem,
} from './facedesk.service';

type Tab =
  | 'dashboard'
  | 'devices'
  | 'pending'
  | 'duplicates'
  | 'review'
  | 'short-days'
  | 'reports'
  | 'settings';

/**
 * FaceDesk V2 admin console. Attendance capture and camera-based enrollment
 * run on the kiosk device (V2 kiosk app); this portal is the admin control
 * surface: dashboard, exception review, reports, payroll sync and thresholds.
 */
@Component({
  standalone: true,
  selector: 'app-facedesk',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Kiosk Attendance — PIN + Face"
        description="Manage the latest shared kiosk: employees enter their code and PIN, then complete face verification.">
      </ui-page-header>

      <div class="tab-bar">
        @if (!branchMode) {
          <button class="tab-btn" [class.active]="tab === 'dashboard'" (click)="switch('dashboard')">Dashboard</button>
          <button class="tab-btn" [class.active]="tab === 'devices'" (click)="switch('devices')">Devices</button>
        }
        <button class="tab-btn" [class.active]="tab === 'pending'" (click)="switch('pending')">Enrollment</button>
        <button class="tab-btn" [class.active]="tab === 'duplicates'" (click)="switch('duplicates')">
          Duplicate Alerts
          @if (cards && cards.duplicateAlertsPending > 0) {
<span class="badge">{{ cards.duplicateAlertsPending }}</span>
}
        </button>
        <button class="tab-btn" [class.active]="tab === 'review'" (click)="switch('review')">
          {{ branchMode ? 'Verifications' : 'Review Queue' }}
          @if (branchMode && review.length > 0) {
<span class="badge">{{ review.length }}</span>
}
          @if (!branchMode && cards && cards.reviewQueuePending > 0) {
<span class="badge">{{ cards.reviewQueuePending }}</span>
}
        </button>
        <button class="tab-btn" [class.active]="tab === 'short-days'" (click)="switch('short-days')">
          Short Days
          @if (shortDays.length > 0) {
<span class="badge">{{ shortDays.length }}</span>
}
        </button>
        @if (!branchMode) {
          <button class="tab-btn" [class.active]="tab === 'reports'" (click)="switch('reports')">Reports</button>
          <button class="tab-btn" [class.active]="tab === 'settings'" (click)="switch('settings')">Settings</button>
        }
      </div>

      <!-- DASHBOARD -->
      @if (tab === 'dashboard') {

        @if (loading) {
<ui-loading-spinner text="Loading dashboard..." size="lg"></ui-loading-spinner>
}
        @if (!loading && cards) {
<div class="cards">
          <div class="card"><div class="num">{{ cards.totalEmployees }}</div><div class="lbl">Total Employees</div></div>
          <div class="card"><div class="num text-green-700">{{ cards.enrolledEmployees }}</div><div class="lbl">Enrolled</div></div>
          <div class="card"><div class="num text-amber-700">{{ cards.pendingEnrollment }}</div><div class="lbl">Pending Enrollment</div></div>
          <div class="card"><div class="num text-green-700">{{ cards.todayPresent }}</div><div class="lbl">Today Present</div></div>
          <div class="card"><div class="num text-blue-700">{{ cards.todayPunches }}</div><div class="lbl">Punches Today</div></div>
          <div class="card"><div class="num text-red-600">{{ cards.todayAbsent }}</div><div class="lbl">Today Absent</div></div>
          <div class="card"><div class="num">{{ cards.failedAttemptsToday }}</div><div class="lbl">Failed Today</div></div>
          <div class="card"><div class="num text-amber-700">{{ cards.duplicateAlertsPending }}</div><div class="lbl">Duplicate Alerts</div></div>
          <div class="card"><div class="num text-amber-700">{{ cards.reviewQueuePending }}</div><div class="lbl">Review Queue</div></div>
          <div class="card"><div class="num text-green-700">{{ cards.devicesOnline }}</div><div class="lbl">Devices Online</div></div>
          <div class="card"><div class="num text-gray-500">{{ cards.devicesOffline }}</div><div class="lbl">Devices Offline</div></div>
        </div>
}
        @if (!loading && cards) {
<p class="text-xs text-gray-500 mt-3">
          Last sync: {{ cards.lastSyncTime ? (cards.lastSyncTime | date: 'dd MMM yyyy, HH:mm') : '—' }}
        </p>
}
      
}

      <!-- DEVICES -->
      @if (tab === 'devices') {

        <div class="flex flex-wrap items-end gap-2 mb-4">
          <label class="text-sm">Device name<input [(ngModel)]="newDevice.deviceName" class="inp" placeholder="e.g. Main Gate Tablet"></label>
          <label class="text-sm">Branch
            <select [(ngModel)]="newDevice.branchId" class="inp">
              <option value="">— select branch —</option>
              @for (b of branches; track b) {
<option [value]="b.id">{{ b.name }}</option>
}
            </select>
          </label>
          <label class="text-sm">Location<input [(ngModel)]="newDevice.location" class="inp" placeholder="optional"></label>
          <label class="text-sm">Admin PIN<input [(ngModel)]="newDevice.adminPin" class="inp" placeholder="4–12 digits" maxlength="12"></label>
          <button class="btn primary" (click)="provision()">Provision device</button>
          <button class="btn" (click)="switch('devices')">Refresh</button>
        </div>

        @if (newInstallToken) {
<div class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div class="text-sm font-semibold text-emerald-900 mb-1">Install token — enter this once on the kiosk to register it:</div>
          <div class="font-mono text-xs break-all bg-white border rounded p-2">{{ newInstallToken }}</div>
          <div class="text-xs text-emerald-800 mt-1">Shown once. Copy it now.</div>
        </div>
}

        @if (loading) {
<ui-loading-spinner text="Loading devices..." size="lg"></ui-loading-spinner>
}
        @if (!loading && deviceList.length === 0) {
<ui-empty-state title="No devices" description="Provision a kiosk device to get started."></ui-empty-state>
}
        @if (!loading && deviceList.length > 0) {
<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Name</th><th>Branch</th><th>Mode</th><th>Status</th><th>Last Sync</th><th>App</th><th class="right">Actions</th></tr></thead>
          <tbody>
            @for (d of deviceList; track d) {
<tr>
              <td>{{ d.deviceName }}<div class="text-xs text-gray-500">{{ d.location || '' }}</div></td>
              <td>{{ branchName(d.branchId) }}</td>
              <td><span class="pill amber">{{ d.mode }}</span></td>
              <td>
                <span class="pill" [class.amber]="d.deviceStatus !== 'ONLINE'"
                  [style.background]="d.deviceStatus === 'ONLINE' ? '#dcfce7' : ''"
                  [style.color]="d.deviceStatus === 'ONLINE' ? '#166534' : ''">{{ d.deviceStatus }}</span>
              </td>
              <td>{{ d.lastSyncTime ? (d.lastSyncTime | date: 'dd MMM, HH:mm') : '—' }}</td>
              <td class="text-xs">{{ d.appVersion || '—' }}</td>
              <td class="right nowrap">
                @if (d.deviceStatus !== 'REVOKED') {
<button class="link red" (click)="revoke(d)">Revoke</button>
}
                @if (d.deviceStatus === 'REVOKED') {
<button class="link red" (click)="deleteDevice(d)">Delete</button>
}
              </td>
            </tr>
}
          </tbody>
        </table></div>
}
      
}

      <!-- PENDING ENROLLMENT -->
      @if (tab === 'pending') {

        <div class="flex flex-wrap items-end gap-2 mb-3">
          <p class="text-sm text-gray-600 flex-1">
            {{ enrollmentView === 'PENDING'
              ? 'Pick a kiosk, then click Enroll for a person. The kiosk opens enrollment and pauses attendance until it is done.'
              : 'Review completed face enrollments, profile health, PIN status, and the last enrollment time.' }}
          </p>
          <label class="text-sm">Show
            <select [(ngModel)]="enrollmentView" (ngModelChange)="onEnrollmentViewChange()" class="inp">
              <option value="PENDING">Pending</option>
              <option value="ENROLLED">Enrolled</option>
            </select>
          </label>
          <label class="text-sm">Enroll
            <select [(ngModel)]="enrollSubjectType" (ngModelChange)="onSubjectTypeChange()" class="inp">
              <option value="EMPLOYEE">Employees</option>
              <option value="CONTRACTOR">Contractors</option>
            </select>
          </label>
          @if (enrollmentView === 'PENDING') {
            <label class="text-sm">Kiosk device
              <select [(ngModel)]="enrollDeviceId" class="inp">
                <option value="">— select device —</option>
                @for (d of activeDevices; track d) {
<option [value]="d.deviceId">{{ d.deviceName }} ({{ branchName(d.branchId) }})</option>
}
              </select>
            </label>
          }
        </div>
        @if (loading) {
<ui-loading-spinner text="Loading..." size="lg"></ui-loading-spinner>
}
        @if (!loading && enrollmentView === 'PENDING' && pending.length === 0) {
<ui-empty-state title="All enrolled" description="No {{ enrollSubjectType === 'CONTRACTOR' ? 'contractors' : 'employees' }} are pending enrollment."></ui-empty-state>
}
        @if (!loading && enrollmentView === 'PENDING' && pending.length > 0) {
<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Code</th><th>Employee</th><th>Status</th><th class="right">Action</th></tr></thead>
          <tbody>
            @for (r of pending; track r) {
<tr>
              <td class="mono">{{ r.employeeCode }}</td>
              <td>{{ r.employeeName || r.name }}</td>
              <td><span class="pill amber">{{ r.status || r.enrollmentStatus || 'PENDING' }}</span></td>
              <td class="right">
                <button class="link green" [disabled]="!enrollDeviceReady || enrollingId === r.employeeId"
                  (click)="enroll(r)">Enroll on kiosk</button>
              </td>
            </tr>
}
          </tbody>
        </table></div>
}

        @if (!loading && enrollmentView === 'ENROLLED' && enrolled.length === 0) {
<ui-empty-state title="No enrolled people" description="No active {{ enrollSubjectType === 'CONTRACTOR' ? 'contractors' : 'employees' }} have completed FaceDesk enrollment."></ui-empty-state>
}
        @if (!loading && enrollmentView === 'ENROLLED' && enrolled.length > 0) {
<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Code / Type</th><th>Worker</th><th>Branch</th><th>Profile</th><th>PIN</th><th>Enrolled</th>@if (branchMode) {<th>Photo</th>}<th class="right">Actions</th></tr></thead>
          <tbody>
            @for (r of enrolled; track r.employeeId) {
<tr>
              <td><span class="mono">{{ r.employeeCode || '—' }}</span><br><span class="text-xs text-gray-500">{{ r.subjectType || enrollSubjectType }}</span></td>
              <td>{{ r.employeeName || r.name }}<br><span class="text-xs text-gray-500">{{ r.department || '' }}{{ r.department && r.designation ? ' · ' : '' }}{{ r.designation || '' }}</span></td>
              <td>{{ branchName(r.branchId) }}</td>
              <td><span class="pill">{{ r.enrollmentStatus }}</span><br><span class="text-xs text-gray-500">Quality: {{ r.qualityScore === null || r.qualityScore === undefined ? '—' : (+r.qualityScore).toFixed(3) }} · Liveness: {{ r.livenessStatus || '—' }} · Duplicate: {{ r.duplicateStatus || '—' }}</span></td>
              <td><span class="pill" [class.amber]="!r.pinConfigured">{{ r.pinConfigured ? 'Configured' : 'Not set' }}</span></td>
              <td>{{ r.enrolledAt ? (r.enrolledAt | date: 'dd MMM yyyy, HH:mm') : '—' }}</td>
              @if (branchMode) {
                <td>
                  @if (r.hasEnrolledPhoto) {
                    <button type="button" class="link" (click)="viewEnrolledPhoto(r)">View</button>
                  } @else {
                    <span class="text-xs text-gray-400">—</span>
                  }
                </td>
              }
              <td class="right nowrap">
                <button class="link red" [disabled]="deletingId === r.employeeId"
                  (click)="deleteEnrollment(r)">Delete</button>
              </td>
            </tr>
}
          </tbody>
        </table></div>
}

        @if (branchMode) {
          <div class="pin-box" style="margin-top:1rem;">
            <h4>Set employee attendance PIN</h4>
            <p class="text-xs text-gray-500">After an employee is enrolled, enter their code and generate a PIN. Shown once — note it and hand it to the employee.</p>
            <div class="pin-row">
              <input class="inp" placeholder="Employee code" [(ngModel)]="pinCode">
              <button class="btn primary" [disabled]="!pinCode || pinBusy" (click)="generatePin()">
                {{ pinBusy ? 'Generating…' : 'Generate PIN' }}
              </button>
            </div>
            @if (lastPin) {
              <div class="pin-result">
                PIN for <strong>{{ lastPin.employeeCode }}</strong>:
                <span class="pin-value">{{ lastPin.pin }}</span>
                <span class="text-xs text-gray-500">(shown once)</span>
              </div>
            }
          </div>
        }

}

      <!-- DUPLICATE ALERTS -->
      @if (tab === 'duplicates') {

        @if (loading) {
<ui-loading-spinner text="Loading..." size="lg"></ui-loading-spinner>
}
        @if (!loading && duplicates.length === 0) {
<ui-empty-state title="No duplicate alerts" description="No pending duplicate-face alerts."></ui-empty-state>
}
        @if (!loading && duplicates.length > 0) {
<div class="table-wrap"><table class="tbl">
          <thead><tr><th>New Employee</th><th>Matched</th><th>Similarity</th><th>When</th><th class="right">Actions</th></tr></thead>
          <tbody>
            @for (a of duplicates; track a) {
<tr>
              <td>{{ a.newEmployeeName || a.newEmployeeId }}<br><span class="mono text-xs text-gray-500">{{ a.newEmployeeCode || '' }}{{ a.newSubjectType ? ' · ' + a.newSubjectType : '' }} · {{ branchName(a.newBranchId) }}</span>@if (a.hasNewPhoto) {<br><button type="button" class="link" (click)="viewDupeFace(a.newEmployeeId, a.newSubjectType, a.newEmployeeCode)">View face</button>}</td>
              <td>{{ a.matchedEmployeeName || a.matchedEmployeeId }}<br><span class="mono text-xs text-gray-500">{{ a.matchedEmployeeCode || '' }}{{ a.matchedSubjectType ? ' · ' + a.matchedSubjectType : '' }} · {{ branchName(a.matchedBranchId) }}</span>@if (a.hasMatchedPhoto) {<br><button type="button" class="link" (click)="viewDupeFace(a.matchedEmployeeId, a.matchedSubjectType, a.matchedEmployeeCode)">View face</button>}</td>
              <td>{{ (+a.similarityScore).toFixed(3) }}</td>
              <td>{{ a.createdAt | date: 'dd MMM, HH:mm' }}</td>
              <td class="right nowrap">
                @if (!branchMode) {
                  <button class="link green" (click)="dupeAction(a, 'APPROVE')">Approve</button>
                  <button class="link red" (click)="dupeAction(a, 'REJECT')">Reject</button>
                  <button class="link gray" (click)="dupeAction(a, 'FALSE_ALERT')">False</button>
                } @else {
                  <span class="text-xs text-gray-500">View only</span>
                }
              </td>
            </tr>
}
          </tbody>
        </table></div>
}
      
}

      <!-- REVIEW QUEUE -->
      @if (tab === 'review') {

        @if (loading) {
<ui-loading-spinner text="Loading..." size="lg"></ui-loading-spinner>
}
        @if (!branchMode) {
          <p class="text-sm text-gray-600 mb-3">
            PIN-correct / face-mismatch items appear here for branch verification.
          </p>
        }
        @if (branchMode) {
          <p class="text-sm text-gray-600 mb-3">Punches where the PIN was correct but the face didn't match are marked and listed here. Check the photo against the employee, then <strong>Approve</strong> to keep it or <strong>Reject</strong> to reverse it.</p>
        }
        @if (!loading && review.length === 0) {
<ui-empty-state title="Nothing to verify" description="No pending items."></ui-empty-state>
}
        @if (!loading && review.length > 0) {
<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Issue</th><th>Worker</th>@if (branchMode) {<th>Face comparison</th>}<th>Confidence</th><th>Punch</th><th>When</th><th class="right">Actions</th></tr></thead>
          <tbody>
            @for (r of review; track r) {
<tr>
              <td><span class="pill amber">{{ r.issueType }}</span></td>
              <td>{{ r.employeeName || r.employeeId || '—' }}<br><span class="mono text-xs text-gray-500">{{ r.employeeCode || '' }}{{ r.subjectType === 'CONTRACTOR' ? ' · Contractor' : '' }}</span></td>
              @if (branchMode) {
                <td>
                  @if (r.photoUrl) {
                    <button type="button" class="link compare-link" (click)="viewPhoto(r)">Captured</button>
                  } @else {
                    <span class="text-xs text-gray-400">—</span>
                  }
                  @if (r.hasEnrolledPhoto) {
                    <button type="button" class="link compare-link" (click)="viewEnrollmentPhoto(r)">Enrolled reference</button>
                  }
                </td>
              }
              <td>{{ r.confidenceScore ? (+r.confidenceScore * 100 | number:'1.0-0') + '%' : '—' }}</td>
              <td class="text-xs">{{ r.punchType || '' }} {{ r.punchTime ? (r.punchTime | date: 'HH:mm') : '' }}</td>
              <td>{{ r.createdAt | date: 'dd MMM, HH:mm' }}</td>
              <td class="right nowrap">
                <button class="link green" (click)="reviewAction(r, 'APPROVE')">Approve</button>
                <button class="link red" (click)="reviewAction(r, 'REJECT')">Reject</button>
              </td>
            </tr>
}
          </tbody>
        </table></div>
}
      
}

      <!-- SHORT DAYS (worked < full day → branch approval) -->
      @if (tab === 'short-days') {

        <p class="text-sm text-gray-600 mb-3">Days where the total worked hours (summed across all IN→OUT punches) came to less than a full day. Decide how each day counts: <strong>Full day</strong> (1.0), <strong>Half day</strong> (0.5), or <strong>Reject</strong> (absent).</p>
        @if (loading) {
<ui-loading-spinner text="Loading..." size="lg"></ui-loading-spinner>
}
        @if (!loading && shortDays.length === 0) {
<ui-empty-state title="Nothing to review" description="No short worked-days are pending approval."></ui-empty-state>
}
        @if (!loading && shortDays.length > 0) {
<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Employee</th><th>Day</th><th>Punches</th><th>Worked</th><th class="right">Actions</th></tr></thead>
          <tbody>
            @for (d of shortDays; track d) {
<tr>
              <td>{{ d.employeeName || d.employeeId }}<br><span class="mono text-xs text-gray-500">{{ d.employeeCode || '' }}{{ d.branchName ? ' · ' + d.branchName : '' }}</span></td>
              <td class="nowrap">{{ d.day }}</td>
              <td class="text-xs">{{ d.punchList }}</td>
              <td class="nowrap">{{ workedHhMm(d.workedSeconds) }}</td>
              <td class="right nowrap">
                <button class="link green" [disabled]="dayBusy" (click)="dayAction(d, 'FULL_DAY')">Full day</button>
                <button class="link" [disabled]="dayBusy" (click)="dayAction(d, 'HALF_DAY')">Half day</button>
                <button class="link red" [disabled]="dayBusy" (click)="dayAction(d, 'REJECT')">Reject</button>
              </td>
            </tr>
}
          </tbody>
        </table></div>
}

}

      <!-- REPORTS -->
      @if (tab === 'reports') {

        <div class="flex flex-wrap items-end gap-2 mb-3">
          <label class="text-sm">From <input type="date" [(ngModel)]="from" class="inp"></label>
          <label class="text-sm">To <input type="date" [(ngModel)]="to" class="inp"></label>
          <select [(ngModel)]="reportKind" class="inp">
            <option value="daily">Daily attendance</option>
            <option value="employee">Employee-wise</option>
            <option value="worked-hours">Worked hours &amp; day units</option>
            <option value="branch">Branch-wise</option>
            <option value="late">Late coming</option>
            <option value="early">Early going</option>
            <option value="absent">Absent</option>
            <option value="failed">Failed attempts</option>
            <option value="duplicates">Duplicates</option>
            <option value="pending-enrollment">Pending enrollment</option>
            <option value="device-sync">Device sync</option>
            <option value="payroll-export">Payroll export</option>
          </select>
          <button class="btn" (click)="runReport()">Run</button>
          <button class="btn primary" (click)="syncPayroll()">Sync to Payroll</button>
        </div>
        <div class="correction-box mb-4">
          <h4 class="text-sm font-semibold text-gray-800 mb-2">Manual attendance correction</h4>
          <p class="text-xs text-gray-500 mb-2">Submit an ADD correction for a missed punch. HR must approve it on the backend workflow.</p>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input class="inp" placeholder="Employee UUID" [(ngModel)]="correctionEmployeeId">
            <input class="inp" type="datetime-local" [(ngModel)]="correctionPunchTime">
            <select class="inp" [(ngModel)]="correctionPunchType">
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
            </select>
            <input class="inp" placeholder="Reason (optional)" [(ngModel)]="correctionReason">
          </div>
          <button class="btn primary mt-2" [disabled]="correctionBusy" (click)="submitCorrection()">
            {{ correctionBusy ? 'Submitting…' : 'Submit correction' }}
          </button>
        </div>
        @if (loading) {
<ui-loading-spinner text="Running report..." size="lg"></ui-loading-spinner>
}
        @if (!loading && reportRows.length === 0) {
<ui-empty-state title="No data" description="Run a report to see results."></ui-empty-state>
}
        @if (!loading && reportRows.length > 0) {
<div class="overflow-auto">
          <div class="table-wrap"><table class="tbl">
            <thead><tr>@for (c of reportCols; track c) {
<th>{{ c }}</th>
}</tr></thead>
            <tbody>
              @for (row of reportRows; track row) {
<tr>
                @for (c of reportCols; track c) {
<td class="text-xs">{{ fmt(row[c]) }}</td>
}
              </tr>
}
            </tbody>
          </table></div>
          <p class="text-xs text-gray-500 mt-2">{{ reportRows.length }} rows</p>
        </div>
}
      
}

      <!-- SETTINGS -->
      @if (tab === 'settings') {

        @if (loading) {
<ui-loading-spinner text="Loading settings..." size="lg"></ui-loading-spinner>
}
        @if (!loading && settings) {
<div class="settings">
            <p class="text-xs text-gray-500 col-span-2">
              The kiosk always asks for the employee code and a 6-digit PIN,
              then verifies the face 1:1 against that employee — no roster-wide scan,
              so look-alike / duplicate mismatches can't happen. Set each enrolled
              employee's PIN below.
            </p>
          <label>Match confidence (%)<input type="number" [(ngModel)]="settings.matchConfidencePct" class="inp"></label>
          <label>Retry confidence (%)<input type="number" [(ngModel)]="settings.retryConfidencePct" class="inp"></label>
          <label>Duplicate threshold (%)<input type="number" [(ngModel)]="settings.duplicatePct" class="inp"></label>
          <label>Min face samples<input type="number" [(ngModel)]="settings.minFaceSamples" class="inp"></label>
          <label>Frames per capture<input type="number" [(ngModel)]="settings.frameCaptureCount" class="inp"></label>
          <label class="chk"><input type="checkbox" [(ngModel)]="settings.livenessRequired"> Liveness required</label>
          <label class="chk"><input type="checkbox" [(ngModel)]="settings.offlineSyncEnabled"> Offline sync enabled</label>
          <label>Shift start (HH:MM)<input type="text" [(ngModel)]="settings.shiftStartTime" class="inp" placeholder="09:30"></label>
          <label>Shift end (HH:MM)<input type="text" [(ngModel)]="settings.shiftEndTime" class="inp" placeholder="18:00"></label>
          <p class="text-xs text-gray-500 col-span-2">
            Percentages map to the model's calibrated cosine thresholds (accept ≈ {{ settings.acceptCosine }},
            retry ≈ {{ settings.retryCosine }}). Tune per site.
          </p>
          <div class="col-span-2"><button class="btn primary" (click)="saveSettings()">Save settings</button></div>

            <div class="col-span-2 pin-box">
              <h4>Set employee attendance PIN</h4>
              <p class="text-xs text-gray-500">Enter an enrolled employee's code and generate a PIN. The PIN is shown once — note it and hand it to the employee.</p>
              <div class="pin-row">
                <input class="inp" placeholder="Employee code" [(ngModel)]="pinCode">
                <button class="btn primary" [disabled]="!pinCode || pinBusy" (click)="generatePin()">
                  {{ pinBusy ? 'Generating…' : 'Generate PIN' }}
                </button>
              </div>
              @if (lastPin) {
                <div class="pin-result">
                  PIN for <strong>{{ lastPin.employeeCode }}</strong>:
                  <span class="pin-value">{{ lastPin.pin }}</span>
                  <span class="text-xs text-gray-500">(shown once)</span>
                </div>
              }
            </div>
        </div>
}
      
}
    </div>
  `,
  styles: [`
    .page { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }
    .tab-bar { display: flex; gap: 0; border-bottom: 1px solid #e5e7eb; margin: 0 0 1.25rem; flex-wrap: wrap; }
    .tab-btn { padding: 0.625rem 1rem; font-size: 0.875rem; font-weight: 500; color: #6b7280; background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer; }
    .tab-btn:hover { color: #111827; }
    .tab-btn.active { color: #4f46e5; border-bottom-color: #4f46e5; }
    .badge { margin-left: 4px; background: #fef3c7; color: #92400e; border-radius: 9999px; padding: 0 6px; font-size: 0.7rem; font-weight: 600; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.75rem; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
    .card .num { font-size: 1.75rem; font-weight: 700; color: #111827; }
    .card .lbl { font-size: 0.75rem; color: #6b7280; margin-top: 2px; }
    .tbl { width: 100%; font-size: 0.875rem; background: #fff; border: 1px solid #e5e7eb; border-radius: 0.5rem; border-collapse: collapse; }
    .tbl th { text-align: left; padding: 0.5rem 0.75rem; background: #f9fafb; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151; }
    .tbl td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f3f4f6; }
    .mono { font-family: monospace; font-size: 0.75rem; }
    .right { text-align: right; } .nowrap { white-space: nowrap; }
    .pill { display: inline-flex; padding: 0.1rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 600; }
    .pill.amber { background: #fef3c7; color: #92400e; }
    .link { font-size: 0.75rem; margin-left: 0.6rem; background: none; border: none; cursor: pointer; }
    .compare-link { margin-left: 0; margin-right: 0.6rem; color: #4f46e5; font-weight: 600; }
    .link.green { color: #047857; } .link.red { color: #dc2626; } .link.gray { color: #6b7280; }
    .btn { padding: 0.4rem 0.9rem; border: 1px solid #d1d5db; border-radius: 0.5rem; background: #fff; font-size: 0.875rem; cursor: pointer; }
    .btn.primary { background: #4f46e5; color: #fff; border-color: #4f46e5; }
    .inp { display: block; padding: 0.4rem 0.6rem; border: 1px solid #d1d5db; border-radius: 0.5rem; font-size: 0.875rem; }
    .settings { display: grid; grid-template-columns: repeat(2, minmax(200px, 320px)); gap: 1rem; background: #fff; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1.25rem; }
    .settings label { font-size: 0.8125rem; color: #374151; }
    .settings label.chk { display: flex; align-items: center; gap: 0.5rem; }
    .pin-box { border-top: 1px solid #e5e7eb; padding-top: 1rem; margin-top: 0.5rem; }
    .pin-box h4 { font-size: 0.875rem; font-weight: 600; color: #111827; margin: 0 0 0.25rem; }
    .pin-row { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem; max-width: 420px; }
    .pin-row .inp { flex: 1; margin: 0; }
    .pin-result { margin-top: 0.75rem; font-size: 0.875rem; color: #374151; }
    .pin-value { font-family: monospace; font-size: 1.1rem; font-weight: 700; color: #4f46e5; background: #eef2ff; padding: 0.1rem 0.5rem; border-radius: 0.4rem; margin: 0 0.4rem; letter-spacing: 0.1em; }
    .col-span-2 { grid-column: span 2; }
  `],
})
export class FaceDeskComponent implements OnInit, OnDestroy {
  /**
   * Branch mode: rendered inside the branch portal for a branch user. Hides
   * the client-wide admin tabs (devices, reports, settings/thresholds) and
   * opens straight to enrollment. Backend already scopes every FaceDesk
   * endpoint to the caller's branch, so the data is branch-limited regardless.
   */
  @Input() branchMode = false;

  tab: Tab = 'dashboard';
  loading = false;

  cards: FaceDeskDashboard | null = null;
  pending: PendingEnrollmentRow[] = [];
  enrolled: PendingEnrollmentRow[] = [];
  duplicates: DuplicateAlert[] = [];
  review: ReviewItem[] = [];
  shortDays: DayReview[] = [];
  dayBusy = false;
  settings: FaceDeskSettings | null = null;

  reportKind = 'daily';
  from = '';
  to = '';
  reportRows: Record<string, unknown>[] = [];
  reportCols: string[] = [];

  correctionEmployeeId = '';
  correctionPunchTime = '';
  correctionPunchType: 'IN' | 'OUT' = 'IN';
  correctionReason = '';
  correctionBusy = false;

  deviceList: FaceDeskDevice[] = [];
  branches: { id: string; name: string }[] = [];
  newDevice: {
    deviceName: string;
    branchId: string;
    location: string;
    adminPin: string;
  } = { deviceName: '', branchId: '', location: '', adminPin: '' };
  newInstallToken: string | null = null;
  enrollDeviceId = '';
  enrollingId: string | null = null;
  deletingId: string | null = null;
  enrollSubjectType: 'EMPLOYEE' | 'CONTRACTOR' = 'EMPLOYEE';
  enrollmentView: 'PENDING' | 'ENROLLED' = 'PENDING';
  private enrollmentLoadSeq = 0;
  private enrollPollTimer: ReturnType<typeof setInterval> | null = null;
  /** How often to check whether the kiosk has finished the capture. */
  private static readonly ENROLL_POLL_INTERVAL_MS = 4000;
  /** Matches the kiosk enrollment ticket TTL — past this the ticket has
   *  expired, so there is nothing left to wait for. */
  private static readonly ENROLL_POLL_TIMEOUT_MS = 5 * 60 * 1000;
  private reviewTabLoadSeq = 0;

  /** Reload the pending list when the operator switches Employees/Contractors. */
  onSubjectTypeChange(): void {
    this.loadEnrollmentRows();
  }

  onEnrollmentViewChange(): void {
    this.loadEnrollmentRows();
  }

  private loadEnrollmentRows(silent = false): void {
    const seq = ++this.enrollmentLoadSeq;
    const view = this.enrollmentView;
    const subjectType = this.enrollSubjectType;
    const rows$ =
      view === 'ENROLLED'
        ? this.svc.enrolledEmployees(subjectType)
        : this.svc.pendingEnrollment(subjectType);

    // Background polls must not flash the spinner or steal focus — the operator
    // is mid-enrollment and the list refreshing under them should be invisible
    // until the row actually moves.
    if (!silent) this.loading = true;
    rows$
      .pipe(
        finalize(() => {
          if (seq === this.enrollmentLoadSeq) {
            this.loading = false;
            this.cdr.detectChanges();
          }
        }),
      )
      .subscribe({
        next: (rows) => {
          if (seq !== this.enrollmentLoadSeq) return;
          if (view === 'ENROLLED') {
            this.enrolled = rows;
          } else {
            this.pending = rows;
          }
          this.cdr.detectChanges();
        },
        error: () => {
          if (seq !== this.enrollmentLoadSeq) return;
          // A dropped background poll is not worth interrupting the operator
          // for — the next tick retries a few seconds later.
          if (!silent) this.toast.error('Failed to load');
        },
      });
  }

  /**
   * Watch for the kiosk finishing an enrollment.
   *
   * The kiosk completes enrollment on the device, so this page has no way to
   * know the person moved from Pending to Enrolled — operators were left
   * refreshing the browser by hand after every worker. Poll quietly until the
   * row moves, then stop.
   *
   * Bounded by the enrollment ticket's own lifetime: if nobody completes the
   * capture the ticket expires anyway, so polling past that is pointless.
   */
  private startEnrollPolling(): void {
    this.stopEnrollPolling();
    const startedAt = Date.now();
    this.enrollPollTimer = setInterval(() => {
      if (Date.now() - startedAt > FaceDeskComponent.ENROLL_POLL_TIMEOUT_MS) {
        this.stopEnrollPolling();
        return;
      }
      const before =
        this.enrollmentView === 'ENROLLED'
          ? this.enrolled.length
          : this.pending.length;
      this.loadEnrollmentRows(true);
      // The list is refreshed asynchronously; check on the next tick whether it
      // changed, and stop as soon as it has.
      setTimeout(() => {
        const after =
          this.enrollmentView === 'ENROLLED'
            ? this.enrolled.length
            : this.pending.length;
        if (after !== before) this.stopEnrollPolling();
      }, 1200);
    }, FaceDeskComponent.ENROLL_POLL_INTERVAL_MS);
  }

  private stopEnrollPolling(): void {
    if (this.enrollPollTimer !== null) {
      clearInterval(this.enrollPollTimer);
      this.enrollPollTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.stopEnrollPolling();
  }

  // PIN_THEN_FACE: per-employee PIN generation
  pinCode = '';
  pinBusy = false;
  lastPin: { employeeCode: string; pin: string } | null = null;

  constructor(
    private svc: FaceDeskService,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
    private branchSvc: ClientBranchesService,
    private protectedFiles: ProtectedFileService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.loadBranches();
    const requestedTab = this.route.snapshot.queryParamMap.get('tab');
    if (requestedTab === 'review') {
      this.tab = 'review';
      this.switch('review');
      return;
    }
    if (this.branchMode) {
      // Branch users land on enrollment and can assign employee PINs there.
      this.tab = 'pending';
      this.switch('pending');
      // Preload the verification count so the Verifications tab shows a badge.
      this.svc.reviewQueue().subscribe({
        next: (r) => { this.review = r; this.cdr.detectChanges(); },
        error: () => undefined,
      });
    } else {
      this.loadDashboard();
    }
  }

  /** Open the captured attendance photo (Bearer-protected) for verification. */
  viewPhoto(r: ReviewItem): void {
    if (!r.photoUrl) return;
    // Fetch through the scoped, authorized endpoint — the raw /uploads path is
    // intentionally 404'd for biometric photos.
    this.protectedFiles
      .open(this.svc.reviewPhotoUrl(r.reviewId), `verify-${r.employeeCode || r.employeeId || ''}`)
      .subscribe({
        error: () => this.toast.error('Unable to open photo'),
      });
  }

  /** Open the enrolled reference face through the same scoped photo boundary. */
  viewEnrollmentPhoto(r: ReviewItem): void {
    if (!r.hasEnrolledPhoto) return;
    this.protectedFiles
      .open(
        this.svc.reviewEnrollmentPhotoUrl(r.reviewId),
        `enrolled-${r.employeeCode || r.employeeId || ''}`,
      )
      .subscribe({
        error: () => this.toast.error('Unable to open enrolled reference photo'),
      });
  }

  /** Branch-only: view the enrolled reference photo from the Enrolled list. */
  viewEnrolledPhoto(r: PendingEnrollmentRow): void {
    if (!r.hasEnrolledPhoto || !r.employeeId) return;
    const subjectType = r.subjectType ?? this.enrollSubjectType;
    this.protectedFiles
      .open(
        this.svc.enrolledPhotoUrl(r.employeeId, subjectType),
        `enrolled-${r.employeeCode || r.employeeId}`,
      )
      .subscribe({
        error: () => this.toast.error('Unable to open enrolled photo'),
      });
  }

  /** Branch-only: view the enrolled face behind a duplicate alert so the admin
   *  can see which employee/face the new capture matched. */
  viewDupeFace(
    employeeId: string,
    subjectType: 'EMPLOYEE' | 'CONTRACTOR' | null | undefined,
    code: string | null | undefined,
  ): void {
    if (!employeeId) return;
    this.protectedFiles
      .open(
        this.svc.enrolledPhotoUrl(employeeId, subjectType ?? this.enrollSubjectType),
        `face-${code || employeeId}`,
      )
      .subscribe({
        error: () => this.toast.error('Unable to open face photo'),
      });
  }

  loadBranches(): void {
    this.branchSvc.list().subscribe({
      next: (rows: any[]) => {
        this.branches = (rows || []).map((b: any) => ({
          id: b.id,
          name: b.name || b.branchCode || b.code || b.id,
        }));
        this.cdr.detectChanges();
      },
      error: () => undefined,
    });
  }

  /** Resolve a device/row branchId to its display name. */
  branchName(id: string | null | undefined): string {
    if (!id) return '—';
    return this.branches.find((b) => b.id === id)?.name ?? id;
  }

  switch(t: Tab): void {
    this.tab = t;
    if (t === 'dashboard') this.loadDashboard();
    if (t === 'devices') this.load(this.svc.devices(), (r) => (this.deviceList = r));
    if (t === 'pending') {
      this.loadEnrollmentRows();
      if (this.deviceList.length === 0) this.svc.devices().subscribe((d) => (this.deviceList = d));
    }
    if (t === 'duplicates') this.load(this.svc.duplicateAlerts(), (r) => (this.duplicates = r));
    if (t === 'review') {
      this.loadReviewTab();
    }
    if (t === 'short-days') this.load(this.svc.dayReviews(), (r) => (this.shortDays = r));
    if (t === 'settings') this.load(this.svc.getSettings(), (r) => (this.settings = r));
  }

  private loadReviewTab(): void {
    const seq = ++this.reviewTabLoadSeq;
    this.loading = true;
    this.svc.reviewQueue().subscribe({
      next: (rows) => {
        if (seq !== this.reviewTabLoadSeq) return;
        this.review = rows;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        if (seq !== this.reviewTabLoadSeq) return;
        this.loading = false;
        this.toast.error('Failed to load');
        this.cdr.detectChanges();
      },
    });
  }

  private load<T>(obs: Observable<T>, assign: (r: T) => void): void {
    this.loading = true;
    obs.subscribe({
      next: (r: T) => { assign(r); this.loading = false; this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.toast.error('Failed to load'); this.cdr.detectChanges(); },
    });
  }

  loadDashboard(): void {
    this.load(this.svc.dashboard(), (r: FaceDeskDashboard) => (this.cards = r));
  }

  async dupeAction(a: DuplicateAlert, action: 'APPROVE' | 'REJECT' | 'FALSE_ALERT'): Promise<void> {
    const ok = await this.dialog.confirm(
      'Duplicate Alert',
      `${action} this duplicate alert?`,
      action === 'REJECT' ? { variant: 'danger', confirmText: 'Reject' } : { confirmText: action },
    );
    if (!ok) return;
    this.svc.actOnDuplicate(a.alertId, action).subscribe({
      next: () => { this.toast.success('Done'); this.switch('duplicates'); },
      error: (e) => this.toast.error(e?.error?.message || 'Action failed'),
    });
  }

  /** Seconds → "H:MM" for display. */
  workedHhMm(seconds: number): string {
    const s = Number(seconds) || 0;
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return `${h}:${String(m).padStart(2, '0')}`;
  }

  async dayAction(
    d: DayReview,
    action: 'FULL_DAY' | 'HALF_DAY' | 'REJECT',
  ): Promise<void> {
    const label =
      action === 'FULL_DAY'
        ? 'Count as a full day (1.0)'
        : action === 'HALF_DAY'
          ? 'Count as a half day (0.5)'
          : 'Reject (count as absent)';
    const confirmText =
      action === 'FULL_DAY'
        ? 'Full day'
        : action === 'HALF_DAY'
          ? 'Half day'
          : 'Reject';
    const ok = await this.dialog.confirm(
      'Short Day',
      `${label} — ${d.employeeName || d.employeeCode || d.employeeId} on ${d.day} (${this.workedHhMm(d.workedSeconds)} worked)?`,
      action === 'REJECT' ? { variant: 'danger', confirmText } : { confirmText },
    );
    if (!ok) return;
    this.dayBusy = true;
    this.svc
      .actOnDayReview({ employeeId: d.employeeId, workDate: d.day, action })
      .subscribe({
        next: () => {
          this.dayBusy = false;
          this.toast.success('Done');
          this.switch('short-days');
        },
        error: (e) => {
          this.dayBusy = false;
          this.toast.error(e?.error?.message || 'Action failed');
        },
      });
  }

  async reviewAction(r: ReviewItem, action: 'APPROVE' | 'REJECT'): Promise<void> {
    const ok = await this.dialog.confirm(
      'Review Item',
      `${action} this ${r.issueType} item?`,
      action === 'REJECT' ? { variant: 'danger', confirmText: 'Reject' } : { confirmText: action },
    );
    if (!ok) return;
    this.svc.actOnReview(r.reviewId, action).subscribe({
      next: () => { this.toast.success('Done'); this.switch('review'); },
      error: (e) => this.toast.error(e?.error?.message || 'Action failed'),
    });
  }

  runReport(): void {
    this.loading = true;
    this.svc.report(this.reportKind, this.from || undefined, this.to || undefined).subscribe({
      next: (rows) => {
        this.reportRows = rows ?? [];
        this.reportCols = rows && rows.length ? Object.keys(rows[0]) : [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.toast.error('Report failed'); this.cdr.detectChanges(); },
    });
  }

  generatePin(): void {
    const code = this.pinCode.trim();
    if (!code) return;
    this.pinBusy = true;
    this.lastPin = null;
    this.svc.setAttendancePin(code).subscribe({
      next: (r) => {
        this.lastPin = { employeeCode: r.employeeCode || code, pin: r.pin };
        this.pinCode = '';
        this.pinBusy = false;
        this.toast.success('PIN generated — note it now, it is shown once');
        this.cdr.detectChanges();
      },
      error: (e) => {
        this.pinBusy = false;
        this.toast.error(e?.error?.message || 'Could not set PIN');
        this.cdr.detectChanges();
      },
    });
  }

  async syncPayroll(): Promise<void> {
    const ok = await this.dialog.confirm(
      'Sync to Payroll',
      'Push approved attendance to payroll for the selected range?',
      { confirmText: 'Sync' },
    );
    if (!ok) return;
    this.svc.pushToPayroll(this.from || undefined, this.to || undefined).subscribe({
      next: (r) => this.toast.success(`Pushed ${r.pushed} of ${r.received} punches to payroll`),
      error: (e) => this.toast.error(e?.error?.message || 'Payroll sync failed'),
    });
  }

  submitCorrection(): void {
    if (!this.correctionEmployeeId.trim()) {
      this.toast.error('Employee ID is required');
      return;
    }
    if (!this.correctionPunchTime) {
      this.toast.error('Punch time is required');
      return;
    }
    this.correctionBusy = true;
    this.svc
      .createCorrection({
        employeeId: this.correctionEmployeeId.trim(),
        correctionType: 'ADD',
        newPunchTime: new Date(this.correctionPunchTime).toISOString(),
        newPunchType: this.correctionPunchType,
        reason: this.correctionReason.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.correctionBusy = false;
          this.correctionEmployeeId = '';
          this.correctionPunchTime = '';
          this.correctionReason = '';
          this.toast.success('Correction submitted for approval');
        },
        error: (e) => {
          this.correctionBusy = false;
          this.toast.error(e?.error?.message || 'Correction failed');
        },
      });
  }

  /** Only non-revoked devices can receive an enrollment ticket. */
  get activeDevices(): FaceDeskDevice[] {
    return this.deviceList.filter((d) => d.deviceStatus !== 'REVOKED');
  }

  /** True when a kiosk is selected and still active (not revoked/removed). */
  get enrollDeviceReady(): boolean {
    return this.activeDevices.some((d) => d.deviceId === this.enrollDeviceId);
  }

  async enroll(r: PendingEnrollmentRow): Promise<void> {
    if (!this.enrollDeviceId) { this.toast.error('Select a kiosk device first'); return; }
    const empId = r.employeeId;
    if (!empId) return;
    // The selected kiosk may have been revoked since it was picked (it's then
    // dropped from activeDevices but enrollDeviceId still holds its id). Bail
    // out and clear the stale selection rather than post a doomed request.
    const dev = this.activeDevices.find((d) => d.deviceId === this.enrollDeviceId);
    if (!dev) {
      this.enrollDeviceId = '';
      this.toast.error('That kiosk is no longer available — pick another');
      return;
    }
    const ok = await this.dialog.confirm(
      'Enroll on Kiosk',
      `Send ${r.employeeName || r.name} to "${dev?.deviceName}" for enrollment? The kiosk opens the enrollment screen and pauses attendance until done.`,
      { confirmText: 'Send to kiosk' },
    );
    if (!ok) return;
    this.enrollingId = empId;
    this.svc.createEnrollTicket(empId, this.enrollDeviceId, this.enrollSubjectType).subscribe({
      next: () => {
        this.enrollingId = null;
        this.toast.success('Sent to kiosk — ask the employee to face the camera');
        // The kiosk completes the enrollment on the device, so watch for the
        // row to move rather than making the operator refresh the browser.
        this.startEnrollPolling();
      },
      error: (e) => {
        this.enrollingId = null;
        this.toast.error(e?.error?.message || 'Could not create enrollment');
      },
    });
  }

  /** Delete an enrolled subject's face profile + PIN (history is preserved). */
  async deleteEnrollment(r: PendingEnrollmentRow): Promise<void> {
    const empId = r.employeeId;
    if (!empId) return;
    const ok = await this.dialog.confirm(
      'Delete enrollment',
      `Remove ${r.employeeName || r.name || 'this worker'}'s face enrollment and PIN? Their attendance history is kept, but they must be re-enrolled to punch again.`,
      { confirmText: 'Delete', variant: 'danger' },
    );
    if (!ok) return;
    this.deletingId = empId;
    this.svc
      .deleteEnrollment(empId, r.subjectType || this.enrollSubjectType)
      .subscribe({
        next: () => {
          this.deletingId = null;
          this.toast.success('Enrollment deleted');
          this.loadEnrollmentRows();
        },
        error: (e) => {
          this.deletingId = null;
          this.toast.error(e?.error?.message || 'Could not delete enrollment');
        },
      });
  }

  provision(): void {
    if (!this.newDevice.deviceName.trim()) {
      this.toast.error('Enter a device name');
      return;
    }
    const adminPin = this.newDevice.adminPin.trim();
    if (!/^\d{4,12}$/.test(adminPin)) {
      this.toast.error('Enter a 4–12 digit admin PIN for the kiosk');
      return;
    }
    this.svc.provisionDevice({
      deviceName: this.newDevice.deviceName.trim(),
      branchId: this.newDevice.branchId || undefined,
      location: this.newDevice.location.trim() || undefined,
      mode: 'ATTENDANCE',
      adminPin,
    }).subscribe({
      next: (d) => {
        this.newInstallToken = d.installToken;
        this.newDevice = { deviceName: '', branchId: '', location: '', adminPin: '' };
        this.toast.success('Device provisioned');
        this.switch('devices');
      },
      error: (e) => this.toast.error(e?.error?.message || 'Provision failed'),
    });
  }

  async revoke(d: FaceDeskDevice): Promise<void> {
    const ok = await this.dialog.confirm(
      'Revoke Device',
      `Revoke "${d.deviceName}"? It will stop accepting attendance immediately.`,
      { variant: 'danger', confirmText: 'Revoke' },
    );
    if (!ok) return;
    this.svc.revokeDevice(d.deviceId).subscribe({
      next: () => { this.toast.success('Device revoked'); this.switch('devices'); },
      error: (e) => this.toast.error(e?.error?.message || 'Revoke failed'),
    });
  }

  async deleteDevice(d: FaceDeskDevice): Promise<void> {
    const ok = await this.dialog.confirm(
      'Delete Device',
      `Permanently delete "${d.deviceName}"? This removes it from the list for good.`,
      { variant: 'danger', confirmText: 'Delete' },
    );
    if (!ok) return;
    this.svc.deleteDevice(d.deviceId).subscribe({
      next: () => { this.toast.success('Device deleted'); this.switch('devices'); },
      error: (e) => this.toast.error(e?.error?.message || 'Delete failed'),
    });
  }

  saveSettings(): void {
    if (!this.settings) return;
    // Send only the editable fields — getEffective() also returns computed
    // cosine values which UpdateSettingsDto rejects (forbidNonWhitelisted).
    const patch: Partial<FaceDeskSettings> = {
      matchConfidencePct: this.settings.matchConfidencePct,
      retryConfidencePct: this.settings.retryConfidencePct,
      duplicatePct: this.settings.duplicatePct,
      minFaceSamples: this.settings.minFaceSamples,
      frameCaptureCount: this.settings.frameCaptureCount,
      livenessRequired: this.settings.livenessRequired,
      offlineSyncEnabled: this.settings.offlineSyncEnabled,
    };
    this.svc.updateSettings(patch).subscribe({
      next: (r) => { this.settings = r; this.toast.success('Settings saved'); },
      error: (e) => this.toast.error(e?.error?.message || 'Save failed'),
    });
  }

  fmt(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) {
      return new Date(v).toLocaleString();
    }
    return String(v);
  }
}

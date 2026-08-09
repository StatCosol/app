import { ActivatedRoute, RouterModule } from '@angular/router';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { fromEvent, interval, merge, Subject, Subscription } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  ModalComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { ClientEmployeesService, Employee } from '../employees/client-employees.service';
import { AuthService } from '../../../core/auth.service';
import { ProtectedFileService } from '../../../shared/files/services/protected-file.service';
import {
  ClientMobileAttendanceService,
  ContractorReenrollRequest,
  EnrollmentStatusRow,
  MobileAttendanceDevice,
  RegisterMobileDeviceBody,
  ReenrollRequest,
  ReenrollRequestStatus,
  FederatedReviewItem,
  FederatedReviewSummary,
  ReviewPunchRow,
} from './client-mobile-attendance.service';

type ReenrollScope = 'employee' | 'contractor';

interface ReenrollViewRow {
  id: string;
  scope: ReenrollScope;
  subjectId: string;
  displayName: string | null;
  displayCode: string | null;
  branchId: string | null;
  source: 'ADMIN' | 'ESS' | 'KIOSK';
  status: ReenrollRequestStatus;
  reason: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  photoUrl: string | null;
}

interface BranchOption { id: string; name: string }

@Component({
  selector: 'app-client-mobile-attendance',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    PageHeaderComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ModalComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="ESS Mobile Attendance"
        description="Manage face attendance from employees' personal phones. Shared PIN + face kiosks are managed separately under Kiosk Attendance."
        icon="device">
      </ui-page-header>

      <!-- Tabs -->
      <div class="tab-bar">
        @if (hasContractorFaceAttendanceModule) {
<button class="tab-btn" [class.active]="tab === 'devices'" (click)="switchTab('devices')">ESS Devices</button>
}
        @if (hasEmployeeMobileAttendanceModule) {
<button class="tab-btn" [class.active]="tab === 'status'" (click)="switchTab('status')">Enrollment Status</button>
}
        @if (hasReenrollWorkflow) {
<button class="tab-btn" [class.active]="tab === 'reenroll'" (click)="switchTab('reenroll')">
          Re-enrollment Requests
          @if (totalPendingReenrollCount > 0) {
<span
                class="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
            {{ totalPendingReenrollCount }}
          </span>
}
        </button>
}
        @if (hasAnyFaceModule) {
<button class="tab-btn" [class.active]="tab === 'review'" (click)="switchTab('review')">
          Punch Review (employees)
          @if (pendingReviewCount > 0) {
<span
                class="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
            {{ pendingReviewCount }}
          </span>
}
        </button>
        @if (hasContractorFaceAttendanceModule) {
<p class="text-xs text-gray-500 w-full mt-1">
          Contractor face mismatches are reviewed under
          <a routerLink="/client/facedesk" class="text-blue-600 hover:underline">Kiosk Attendance → Review Queue</a>.
        </p>
}
}
        <button class="tab-btn" [class.active]="tab === 'help'" (click)="switchTab('help')">Setup Guide</button>
      </div>

      <!-- ────── DEVICES TAB ────── -->
      @if (tab === 'devices') {

        <div class="flex items-center justify-between mb-4">
          <span class="text-sm text-gray-500">{{ devices.length }} device(s) registered</span>
          <ui-button variant="primary" (clicked)="openAdd()">+ Register Device</ui-button>
        </div>

        @if (loadingDevices) {
<ui-loading-spinner text="Loading devices..." size="lg"></ui-loading-spinner>
}

        @if (!loadingDevices && devices.length === 0) {
<ui-empty-state

          title="No ESS devices registered"
          description="Register an employee's personal phone for ESS face attendance. Shared kiosks are registered under Kiosk Attendance.">
        </ui-empty-state>
}

        @if (!loadingDevices && devices.length > 0) {
<div
             class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Label</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Branch</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Geofence</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Last Seen</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Last Punch</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (d of devices; track d) {
<tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 text-gray-900 font-medium">{{ d.deviceLabel || d.deviceName || '—' }}</td>
                <td class="px-4 py-3 text-gray-700">{{ branchName(d.branchId) }}</td>
                <td class="px-4 py-3 text-gray-700">
                  @if (d.geofenceLat !== null && d.geofenceLng !== null) {
<span>
                    {{ d.geofenceLat | number:'1.4-4' }}, {{ d.geofenceLng | number:'1.4-4' }}
                    <span class="text-gray-400">· {{ d.geofenceRadiusM || 100 }}m</span>
                  </span>
}
                  @if (d.geofenceLat === null) {
<span class="text-gray-400">—</span>
}
                </td>
                <td class="px-4 py-3 text-gray-700">{{ d.lastSeenAt ? (d.lastSeenAt | date: 'dd MMM, HH:mm') : 'Never' }}</td>
                <td class="px-4 py-3 text-gray-700">{{ d.lastPunchAt ? (d.lastPunchAt | date: 'dd MMM, HH:mm') : 'Never' }}</td>
                <td class="px-4 py-3 text-center">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                    [class.bg-green-100]="d.isActive" [class.text-green-700]="d.isActive"
                    [class.bg-gray-100]="!d.isActive" [class.text-gray-500]="!d.isActive">
                    {{ d.isActive ? 'Active' : 'Revoked' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  @if (d.isActive) {
<button class="text-xs text-blue-600 hover:underline mr-3" (click)="showToken(d)">Show Token</button>
}
                  @if (d.isActive) {
<button class="text-xs text-green-600 hover:underline mr-3" (click)="renameDevice(d)">Rename</button>
}
                  @if (d.isActive) {
<button class="text-xs text-indigo-600 hover:underline mr-3" (click)="openGeofence(d)">Geofence</button>
}
                  @if (d.isActive) {
<button class="text-xs text-red-600 hover:underline" (click)="revoke(d)">Revoke</button>
}
                  @if (!d.isActive) {
<button class="text-xs text-red-700 hover:underline" (click)="hardDelete(d)">Delete</button>
}
                </td>
              </tr>
}
            </tbody>
          </table>
        </div>
}
      
}

      <!-- ────── ENROLLMENT STATUS TAB ────── -->
      @if (tab === 'status') {

        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div class="text-sm text-gray-700">
            <span class="font-semibold text-gray-900">{{ enrolledCount }}</span> enrolled ·
            <span class="font-semibold text-amber-700">{{ pendingCount }}</span> pending ·
            <span class="text-gray-500">{{ enrollmentRows.length }} total</span>
          </div>
          <div class="flex items-center gap-2">
            <input type="text" placeholder="Search code or name…" [(ngModel)]="statusSearch"
              class="ui-input" style="width: 220px;">
            <select [(ngModel)]="statusFilter" class="ui-input" style="width: 160px;">
              <option value="all">All</option>
              <option value="pending">Pending only</option>
              <option value="enrolled">Enrolled only</option>
              <option value="deactivated">Deactivated only</option>
            </select>
            <ui-button variant="secondary" (clicked)="loadEnrollments()">Refresh</ui-button>
          </div>
        </div>

        @if (loadingEnrollments) {
<ui-loading-spinner text="Loading enrollments..." size="lg"></ui-loading-spinner>
}

        @if (!loadingEnrollments && enrollmentRows.length === 0) {
<ui-empty-state
         
          title="No employees found"
          description="There are no active employees in the selected scope.">
        </ui-empty-state>
}

        @if (!loadingEnrollments && filteredEnrollments.length > 0) {
<div
             class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Code</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Employee</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Branch</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Model</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Enrolled At</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filteredEnrollments; track r) {
<tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 text-gray-700 font-mono text-xs">{{ r.employeeCode }}</td>
                <td class="px-4 py-3 text-gray-900 font-medium">{{ r.employeeName }}</td>
                <td class="px-4 py-3 text-gray-700">{{ branchName(r.branchId) }}</td>
                <td class="px-4 py-3 text-center">
                  @if (r.isEnrolled && r.isActive) {
<span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Enrolled</span>
}
                  @if (r.isEnrolled && !r.isActive) {
<span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                    [title]="r.deactivationReason || ''">Deactivated</span>
}
                  @if (!r.isEnrolled) {
<span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Pending</span>
}
                </td>
                <td class="px-4 py-3 text-gray-700 text-xs">{{ r.embeddingModel || '—' }}</td>
                <td class="px-4 py-3 text-gray-700">{{ r.enrolledAt ? (r.enrolledAt | date: 'dd MMM yyyy, HH:mm') : '—' }}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  @if (!r.isEnrolled) {
<span class="text-xs text-gray-500 italic"
                    title="Face enrollment is completed through the supervised branch enrollment workflow. Client admins review status here.">Awaiting face enrollment</span>
}
                  @if (hasContractorFaceAttendanceModule && r.isEnrolled && r.isActive) {
<button class="text-xs text-emerald-700 hover:underline mr-3"
                    (click)="deputeAsEss(r)" title="Register a personal phone for this employee (ESS mode) — useful for project deputation">Depute (ESS)</button>
}
                  @if (r.isEnrolled && r.isActive) {
<button class="text-xs text-red-600 hover:underline mr-3"
                    (click)="deactivate(r)">Deactivate</button>
}
                  @if (r.isEnrolled) {
<button class="text-xs text-red-700 hover:underline font-semibold"
                    (click)="hardDeleteEnrollment(r)" title="Permanently remove this enrollment row (audit history preserved)">Delete</button>
}
                </td>
              </tr>
}
            </tbody>
          </table>
        </div>
}

        @if (!loadingEnrollments && enrollmentRows.length > 0 && filteredEnrollments.length === 0) {
<div
             class="text-sm text-gray-500 mt-4">No employees match the current filter.</div>
}
      
}

      <!-- ────── RE-ENROLLMENT REQUESTS TAB ────── -->
      @if (tab === 'reenroll') {

        <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div class="flex items-center gap-3 flex-wrap">
            <div class="inline-flex rounded-md border border-gray-200 overflow-hidden text-sm">
              @if (hasEmployeeMobileAttendanceModule) {
<button type="button"
                      class="px-3 py-1.5"
                      [class.bg-indigo-600]="reenrollScope === 'employee'"
                      [class.text-white]="reenrollScope === 'employee'"
                      [class.bg-white]="reenrollScope !== 'employee'"
                      [class.text-gray-700]="reenrollScope !== 'employee'"
                      (click)="switchReenrollScope('employee')">
                Employees
                @if (pendingReenrollCount > 0) {
<span
                      class="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full"
                      [class.bg-white]="reenrollScope === 'employee'"
                      [class.text-indigo-700]="reenrollScope === 'employee'"
                      [class.bg-amber-100]="reenrollScope !== 'employee'"
                      [class.text-amber-800]="reenrollScope !== 'employee'">
                  {{ pendingReenrollCount }}
                </span>
}
              </button>
}
              @if (hasContractorFaceAttendanceModule) {
<button type="button"
                      class="px-3 py-1.5 border-l border-gray-200"
                      [class.bg-indigo-600]="reenrollScope === 'contractor'"
                      [class.text-white]="reenrollScope === 'contractor'"
                      [class.bg-white]="reenrollScope !== 'contractor'"
                      [class.text-gray-700]="reenrollScope !== 'contractor'"
                      (click)="switchReenrollScope('contractor')">
                Contractors
                @if (pendingContractorReenrollCount > 0) {
<span
                      class="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full"
                      [class.bg-white]="reenrollScope === 'contractor'"
                      [class.text-indigo-700]="reenrollScope === 'contractor'"
                      [class.bg-amber-100]="reenrollScope !== 'contractor'"
                      [class.text-amber-800]="reenrollScope !== 'contractor'">
                  {{ pendingContractorReenrollCount }}
                </span>
}
              </button>
}
            </div>
            <span class="text-sm text-gray-500">
              {{ reenrollRows.length }} {{ reenrollFilter | lowercase }} request(s)
            </span>
          </div>
          <div class="flex items-center gap-2">
            <select [(ngModel)]="reenrollFilter" (ngModelChange)="loadReenrollRequests()" class="ui-input text-sm" style="width:auto">
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <ui-button variant="secondary" (clicked)="loadReenrollRequests()">Refresh</ui-button>
          </div>
        </div>

        @if (loadingReenroll) {
<ui-loading-spinner text="Loading requests..." size="lg"></ui-loading-spinner>
}

        @if (!loadingReenroll && reenrollRows.length === 0) {
<ui-empty-state
         
          title="No {{ reenrollFilter | lowercase }} {{ reenrollScope === 'contractor' ? 'contractor' : 'employee' }} re-enrollment requests"
          [description]="reenrollScope === 'contractor'
            ? 'When a contractor employee re-enrolls their face, the new embedding lands here for review before it overwrites the live one.'
            : 'When an employee re-enrolls through ESS, the new embedding lands here for review before it overwrites the live one.'">
        </ui-empty-state>
}

        @if (!loadingReenroll && reenrollRows.length > 0) {
<div
             class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-semibold text-gray-700">
                  {{ reenrollScope === 'contractor' ? 'Contractor Employee' : 'Employee' }}
                </th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Source</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Reason</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Requested</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Reviewed</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (r of reenrollRows; track r) {
<tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3">
                  <div class="font-medium text-gray-900">{{ r.displayName || '—' }}</div>
                  <div class="text-xs text-gray-500">{{ r.displayCode || r.subjectId }}</div>
                </td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded"
                        [class.bg-blue-100]="r.source === 'ADMIN'" [class.text-blue-800]="r.source === 'ADMIN'"
                        [class.bg-green-100]="r.source === 'ESS'" [class.text-green-800]="r.source === 'ESS'"
                        [class.bg-purple-100]="r.source === 'KIOSK'" [class.text-purple-800]="r.source === 'KIOSK'">
                    {{ r.source }}
                  </span>
                </td>
                <td class="px-4 py-3 text-gray-700 max-w-xs">
                  <div class="truncate" [title]="r.reason || ''">{{ r.reason || '—' }}</div>
                </td>
                <td class="px-4 py-3 text-gray-600 text-xs">{{ r.requestedAt | date:'medium' }}</td>
                <td class="px-4 py-3 text-gray-600 text-xs">
                  @if (r.reviewedAt) {

                    <div>{{ r.reviewedAt | date:'medium' }}</div>
                    @if (r.reviewNotes) {
<div class="text-gray-500" [title]="r.reviewNotes">{{ r.reviewNotes }}</div>
}
                  
} @else {
<span class="text-gray-400">—</span>
}
                  
                </td>
                <td class="px-4 py-3 text-center">
                  @if (r.status === 'PENDING') {

                    <button class="text-xs font-medium text-green-700 hover:text-green-900 mr-2"
                            [disabled]="reviewingId === r.id"
                            (click)="openReview(r, 'APPROVED')">Approve</button>
                    <button class="text-xs font-medium text-red-600 hover:text-red-800"
                            [disabled]="reviewingId === r.id"
                            (click)="openReview(r, 'REJECTED')">Reject</button>
                  
} @else {

                    <span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded"
                          [class.bg-green-100]="r.status === 'APPROVED'" [class.text-green-800]="r.status === 'APPROVED'"
                          [class.bg-red-100]="r.status === 'REJECTED'" [class.text-red-800]="r.status === 'REJECTED'"
                          [class.bg-gray-100]="r.status === 'CANCELLED'" [class.text-gray-800]="r.status === 'CANCELLED'">
                      {{ r.status }}
                    </span>
                  
}
                  
                </td>
              </tr>
}
            </tbody>
          </table>
        </div>
}
      
}

      <!-- ────── PUNCH REVIEW TAB ────── -->
      @if (tab === 'review') {

        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div class="text-sm text-gray-600">
            Borderline 1:N face matches (ESS phones and offline kiosk) are held here instead of auto-counting.
            @if (hasContractorFaceAttendanceModule) {
              PIN-correct / face-mismatch items are reviewed under
              <a routerLink="/client/facedesk" [queryParams]="{ tab: 'review' }" class="text-blue-600 hover:underline">
                Kiosk Attendance → Review Queue
              </a>.
            }
            Approving mirrors the punch into Daily Attendance; rejecting discards it (the audit record is preserved).
          </div>
          <div class="flex items-center gap-2">
            <select [(ngModel)]="reviewStatusFilter" (ngModelChange)="loadReviewPunches()" class="ui-input" style="width: 180px;">
              <option value="REVIEW_PENDING">Pending</option>
              <option value="REVIEW_APPROVED">Approved</option>
              <option value="REVIEW_REJECTED">Rejected</option>
            </select>
            <ui-button variant="secondary" (clicked)="loadReviewPunches()">Refresh</ui-button>
          </div>
        </div>

        @if (hasFederatedReview && federatedSummary && reviewStatusFilter === 'REVIEW_PENDING') {
          <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>{{ federatedSummary.totalPending }}</strong> pending face review item(s):
            {{ federatedSummary.mobileBorderlinePending }} borderline ESS/kiosk match(es) on this page,
            {{ federatedSummary.facedeskVerificationPending }} kiosk PIN/face verification(s) in
            <a routerLink="/client/facedesk" [queryParams]="{ tab: 'review' }" class="text-blue-700 hover:underline">
              Kiosk Attendance
            </a>.
          </div>
        }

        @if (hasFederatedReview && federatedFaceDeskItems.length > 0 && reviewStatusFilter === 'REVIEW_PENDING') {
          <div class="mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div class="px-4 py-3 border-b border-gray-200 bg-gray-50 text-sm font-semibold text-gray-800">
              Kiosk verification queue (review in FaceDesk)
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200">
                  <th class="text-left px-4 py-3 font-semibold text-gray-700">Person</th>
                  <th class="text-left px-4 py-3 font-semibold text-gray-700">Branch</th>
                  <th class="text-left px-4 py-3 font-semibold text-gray-700">Punch Time</th>
                  <th class="text-left px-4 py-3 font-semibold text-gray-700">Issue</th>
                  <th class="text-right px-4 py-3 font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                @for (item of federatedFaceDeskItems; track item.itemId) {
                  <tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="px-4 py-3">
                      <div class="text-gray-900 font-medium">{{ item.displayName || 'Unknown' }}</div>
                      <div class="text-xs text-gray-500 font-mono">{{ item.displayCode || item.subjectType }}</div>
                    </td>
                    <td class="px-4 py-3 text-gray-700">{{ branchName(item.branchId) }}</td>
                    <td class="px-4 py-3 text-gray-700">{{ item.punchTime | date: 'dd MMM yyyy, HH:mm:ss' }}</td>
                    <td class="px-4 py-3 text-gray-700">{{ item.issueLabel }}</td>
                    <td class="px-4 py-3 text-right">
                      <a routerLink="/client/facedesk" [queryParams]="{ tab: 'review' }"
                         class="text-xs text-indigo-600 hover:underline">
                        Open in Kiosk Attendance
                      </a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        @if (loadingReview) {
<ui-loading-spinner text="Loading review queue..." size="lg"></ui-loading-spinner>
}

        @if (!loadingReview && showReviewEmptyState) {
<ui-empty-state
         
          title="Nothing to review"
          description="No employee mobile punches in this state. Borderline ESS/kiosk matches will appear here automatically.">
        </ui-empty-state>
}

        @if (!loadingReview && reviewRows.length > 0) {
<div
             class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Person</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Branch</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Punch Time</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-700">Score</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-700">Margin</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Held Because</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-700">Photo</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (r of reviewRows; track r) {
<tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3">
                  <div class="text-gray-900 font-medium">{{ r.subjectName || 'Unknown' }}</div>
                  <div class="text-xs text-gray-500 font-mono">
                    {{ r.subjectCode || (r.subjectType === 'CONTRACTOR' ? 'Contractor' : '') }}
                  </div>
                </td>
                <td class="px-4 py-3 text-gray-700">{{ branchName(r.branchId) }}</td>
                <td class="px-4 py-3 text-gray-700">{{ r.punchTime | date: 'dd MMM yyyy, HH:mm:ss' }}</td>
                <td class="px-4 py-3 text-center font-mono text-xs"
                    [title]="'Threshold: ' + (r.matchThreshold || '—')">
                  {{ formatScore(r.matchCosine) }}
                </td>
                <td class="px-4 py-3 text-center font-mono text-xs">{{ formatScore(r.matchMargin) }}</td>
                <td class="px-4 py-3 text-xs text-gray-600 max-w-[220px]">{{ r.reviewNote || '—' }}</td>
                <td class="px-4 py-3 text-center">
                  @if (isPhotoOpenable(r.photoUrl)) {
<button type="button"
                     class="text-xs text-indigo-600 hover:underline"
                     (click)="openPunchPhoto(r)">View</button>
}
                  @if (!isPhotoOpenable(r.photoUrl)) {
<span class="text-xs text-gray-400">—</span>
}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  @if (r.decision === 'REVIEW_PENDING') {

                    <button class="text-xs text-emerald-700 hover:underline font-semibold mr-3"
                      [disabled]="reviewingPunchId === r.id"
                      (click)="reviewPunchAction(r, 'APPROVE')">Approve</button>
                    <button class="text-xs text-red-600 hover:underline font-semibold"
                      [disabled]="reviewingPunchId === r.id"
                      (click)="reviewPunchAction(r, 'REJECT')">Reject</button>
                  
} @else {

                    <span class="text-xs text-gray-500 italic">
                      {{ r.decision === 'REVIEW_APPROVED' ? 'Approved' : 'Rejected' }}
                      {{ r.reviewedAt ? (r.reviewedAt | date: 'dd MMM, HH:mm') : '' }}
                    </span>
                  
}
                  
                </td>
              </tr>
}
            </tbody>
          </table>
        </div>
}
      
}

      <!-- ────── HELP TAB ────── -->
      @if (tab === 'help') {

        <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4 text-sm text-gray-700">
          <div>
            <h3 class="font-semibold text-gray-900 mb-1">1. ESS attendance</h3>
            <p>ESS attendance runs on an employee's personal phone using 1:1 face verification. The workplace geofence is enforced before the punch is accepted.</p>
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 mb-1">2. Register an ESS phone</h3>
            <p>From <em>ESS Devices</em>, select the employee and branch, then enter the workplace geofence. The system generates an <code>install token</code>.</p>
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 mb-1">3. Install the Android app</h3>
            <p>Download <code>statcompy-attendance.apk</code> on the device, open it, paste the install token, and grant Camera + Location permissions.</p>
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 mb-1">4. Enroll employee faces (Branch user)</h3>
            <p>Face enrollment is performed by the <strong>Branch user</strong>, not from this page. The Branch user opens <em>Branch portal → Face Enrollment</em>, picks the employee, and completes an operator-supervised live capture. Client admins review enrollment status here.</p>
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 mb-1">5. Punches flow into payroll automatically</h3>
            <p>ESS punches appear under <em>Attendance Review</em> and <em>Daily Attendance</em>, then roll into payroll and registers automatically.</p>
          </div>
        </div>
      
}
    </div>

    <!-- Geofence Modal -->
    @if (geofenceModal) {
<ui-modal [isOpen]="geofenceModal" [showFooter]="false" title="Configure Geofence" (closed)="geofenceModal = false">
      <form (ngSubmit)="saveGeofence()" class="space-y-3">
        <p class="text-xs text-gray-500">Set the geofence centre and radius for this device. Leave blank and save to clear.</p>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
            <input type="number" step="0.0000001" class="ui-input" [(ngModel)]="geofenceForm.lat" name="gfLat" placeholder="e.g. 19.0760">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
            <input type="number" step="0.0000001" class="ui-input" [(ngModel)]="geofenceForm.lng" name="gfLng" placeholder="e.g. 72.8777">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Radius (m)</label>
            <input type="number" step="1" min="50" max="50000" class="ui-input" [(ngModel)]="geofenceForm.radiusM" name="gfRadius" placeholder="100">
          </div>
        </div>
        @if (geofenceError) {
<div class="text-sm text-red-600">{{ geofenceError }}</div>
}
        <div class="flex justify-between gap-2 pt-2">
          <ui-button variant="secondary" type="button" (clicked)="clearGeofence()">Clear Geofence</ui-button>
          <div class="flex gap-2">
            <ui-button variant="secondary" type="button" (clicked)="geofenceModal = false">Cancel</ui-button>
            <ui-button variant="primary" type="submit" [loading]="savingGeofence">Save</ui-button>
          </div>
        </div>
      </form>
    </ui-modal>
}

    <!-- Add Device Modal -->
    @if (showModal) {
<ui-modal [isOpen]="showModal" [showFooter]="false" title="Register ESS Device" (closed)="showModal = false">
      <form (ngSubmit)="save()" class="space-y-3">
        <p class="text-xs text-gray-500">
          ESS devices are employee personal phones using 1:1 face verification and a workplace geofence.
          Register shared devices under <strong>Kiosk Attendance (PIN + Face)</strong>.
        </p>
        <div>
          <label for="dev-label" class="block text-xs font-medium text-gray-600 mb-1">Device Label</label>
          <input autocomplete="off" id="dev-label" name="label" type="text" class="ui-input"
                 [(ngModel)]="form.deviceLabel" placeholder="Employee ESS Phone">
        </div>
        <div>
          <label for="dev-branch" class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
          <select id="dev-branch" name="branchId" [(ngModel)]="form.branchId" (ngModelChange)="onBranchChange()" class="ui-input">
            <option value="">— None —</option>
            @for (b of branches; track b) {
<option [value]="b.id">{{ b.name }}</option>
}
          </select>
        </div>
        @if (form.mode === 'ESS') {
<div class="space-y-3">
          <div>
            <label for="dev-ess-emp" class="block text-xs font-medium text-gray-600 mb-1">Bound Employee (ESS)</label>
            <select id="dev-ess-emp" name="essEmployeeId" [(ngModel)]="form.essEmployeeId" class="ui-input" [disabled]="!form.branchId">
              <option value="">{{ form.branchId ? '— Select employee —' : '— Pick a branch first —' }}</option>
              @for (e of essEligibleEmployees; track e) {
<option [value]="e.id">{{ e.name }} ({{ e.employeeCode }})</option>
}
            </select>
            <p class="text-xs text-gray-500 mt-1">This personal phone will only be able to punch and self-enroll for this employee. Showing employees from the selected branch only.</p>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label for="dev-lat" class="block text-xs font-medium text-gray-600 mb-1">Geofence Lat <span class="text-red-500">*</span></label>
              <input autocomplete="off" id="dev-lat" name="geofenceLat" type="number" step="0.0000001" class="ui-input bg-gray-50" [(ngModel)]="form.geofenceLat" readonly required>
            </div>
            <div>
              <label for="dev-lng" class="block text-xs font-medium text-gray-600 mb-1">Geofence Lng <span class="text-red-500">*</span></label>
              <input autocomplete="off" id="dev-lng" name="geofenceLng" type="number" step="0.0000001" class="ui-input bg-gray-50" [(ngModel)]="form.geofenceLng" readonly required>
            </div>
            <div>
              <label for="dev-rad" class="block text-xs font-medium text-gray-600 mb-1">Radius (m) <span class="text-red-500">*</span></label>
              <input autocomplete="off" id="dev-rad" name="geofenceRadiusM" type="number" step="1" min="1" class="ui-input" [(ngModel)]="form.geofenceRadiusM" placeholder="100" required>
            </div>
          </div>
          <div class="flex items-center justify-between gap-2 -mt-1">
            <button type="button" (click)="captureLocation()" [disabled]="capturingLocation"
                    class="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400 inline-flex items-center gap-1">
              <span>📍</span>
              @if (!capturingLocation) {
<span>Use my current location</span>
}
              @if (capturingLocation) {
<span>Detecting…</span>
}
            </button>
            @if (locationAccuracy !== null && !locationError) {
<span class="text-xs text-gray-500">
              Accuracy ±{{ locationAccuracy | number:'1.0-0' }} m
            </span>
}
          </div>
          @if (locationError) {
<p class="text-xs text-amber-600">{{ locationError }}</p>
}
          <p class="text-xs text-gray-500">Coordinates are auto-captured from your browser's location and cannot be edited — stand at the project site when registering. Adjust radius to match the project boundary; the ESS app will then verify each punch is inside this geofence.</p>
        </div>
}
        @if (formError) {
<div class="text-sm text-red-600">{{ formError }}</div>
}
        <div class="flex justify-end gap-2 pt-2">
          <ui-button variant="secondary" type="button" (clicked)="showModal = false">Cancel</ui-button>
          <ui-button variant="primary" type="submit" [loading]="saving">Register</ui-button>
        </div>
      </form>
    </ui-modal>
}

    <!-- Re-enrollment review modal -->
    @if (reviewRequest) {
<ui-modal [isOpen]="!!reviewRequest" [showFooter]="false"
              [title]="reviewDecision === 'APPROVED' ? 'Approve re-enrollment' : 'Reject re-enrollment'"
              (closed)="closeReview()">
      <div class="space-y-3 text-sm">
        <div class="text-gray-700">
          <div>
            <strong>{{ reviewRequest.scope === 'contractor' ? 'Contractor employee' : 'Employee' }}:</strong>
            {{ reviewRequest.displayName }}
            @if (reviewRequest.displayCode) {
<span>({{ reviewRequest.displayCode }})</span>
}
          </div>
          <div><strong>Source:</strong> {{ reviewRequest.source }}</div>
          <div><strong>Requested:</strong> {{ reviewRequest.requestedAt | date:'medium' }}</div>
          @if (reviewRequest.reason) {
<div><strong>Reason:</strong> {{ reviewRequest.reason }}</div>
}
        </div>
        @if (reviewPhotoBlobUrl) {
<div class="border rounded overflow-hidden bg-gray-50">
          <div class="px-2 py-1 text-xs font-medium text-gray-600 border-b bg-white">Submitted photo</div>
          <img [src]="reviewPhotoBlobUrl" alt="Submitted re-enrollment photo"
               class="block w-full max-h-72 object-contain bg-black" referrerpolicy="no-referrer" />
        </div>
}
        @if (!reviewPhotoBlobUrl && reviewRequest.photoUrl) {
<p class="text-xs text-gray-500 italic">Loading photo…</p>
}
        @if (!reviewPhotoBlobUrl && !reviewRequest.photoUrl) {
<p class="text-xs text-gray-500 italic">
          No photo available — review the request based on the source and reason only.
        </p>
}
        @if (reviewDecision === 'APPROVED') {
<p class="text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-xs">
          Approving will overwrite this {{ reviewRequest.scope === 'contractor' ? 'contractor employee' : 'employee' }}'s live face embedding with the new one. The previous embedding cannot be recovered.
        </p>
}
        <div>
          <label for="review-notes" class="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
          <textarea id="review-notes" name="reviewNotes" rows="3" class="ui-input" [(ngModel)]="reviewNotes"
                    placeholder="Audit trail notes — visible in the request log"></textarea>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <ui-button variant="secondary" (clicked)="closeReview()">Cancel</ui-button>
          <ui-button [variant]="reviewDecision === 'APPROVED' ? 'primary' : 'danger'"
                     [loading]="reviewingId === reviewRequest.id"
                     (clicked)="submitReview()">
            {{ reviewDecision === 'APPROVED' ? 'Approve' : 'Reject' }}
          </ui-button>
        </div>
      </div>
    </ui-modal>
}

    <!-- Show install token after creation -->
    @if (tokenModal) {
<ui-modal [isOpen]="tokenModal" [showFooter]="false" title="Install Token" (closed)="tokenModal = false">
      <div class="space-y-3 text-sm">
        <p class="text-gray-700">Paste this 64-character token into the Android app on the device. Copy the full token before closing this window.</p>
        <div class="flex items-center justify-between text-xs text-gray-500">
          <span>Token length: {{ tokenLength }}/64</span>
          @if (tokenLength === 64) {
<span class="text-green-700 font-medium">Ready to paste</span>
}
          @if (tokenLength !== 64) {
<span class="text-red-700 font-medium">Create a new device token</span>
}
        </div>
        <div
          class="bg-gray-50 border border-gray-200 rounded p-3 font-mono text-sm leading-6 break-words select-all"
          [class.border-red-300]="tokenLength !== 64"
          [class.bg-red-50]="tokenLength !== 64">
          {{ formattedTokenToShow }}
        </div>
        @if (tokenLength !== 64) {
<p class="text-xs text-red-700">
          This token is not 64 characters, so the ESS app will reject it. Delete this device and register a new ESS device.
        </p>
}
        <div class="flex justify-end gap-2">
          <ui-button variant="secondary" (clicked)="copyToken()">Copy full token</ui-button>
          <ui-button variant="primary" (clicked)="tokenModal = false">Done</ui-button>
        </div>
      </div>
    </ui-modal>
}
  `,
  styles: [`
    .page { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }
    .tab-bar { display: flex; gap: 0; border-bottom: 1px solid #e5e7eb; margin: 0 0 1.25rem; }
    .tab-btn {
      padding: 0.625rem 1rem; font-size: 0.875rem; font-weight: 500; color: #6b7280;
      background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer;
    }
    .tab-btn:hover { color: #111827; }
    .tab-btn.active { color: #4f46e5; border-bottom-color: #4f46e5; }
    .ui-input {
      display: block; width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db;
      border-radius: 0.5rem; font-size: 0.875rem; background: #fff;
    }
    .ui-input:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 2px rgba(79,70,229,.15); }
    code { background: #f3f4f6; padding: 0 4px; border-radius: 3px; font-size: 0.8125rem; }
  `],
})
export class ClientMobileAttendanceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private readonly liveRefreshMs = 10000;

  tab: 'devices' | 'help' | 'status' | 'reenroll' | 'review' = 'devices';

  // Devices
  devices: MobileAttendanceDevice[] = [];
  loadingDevices = false;
  showModal = false;
  saving = false;
  formError = '';
  capturingLocation = false;
  locationError = '';
  locationAccuracy: number | null = null;
  form: {
    mode: 'ESS';
    deviceLabel: string;
    branchId: string;
    geofenceLat: number | null;
    geofenceLng: number | null;
    geofenceRadiusM: number | null;
    essEmployeeId: string;
  } = { mode: 'ESS', deviceLabel: '', branchId: '', geofenceLat: null, geofenceLng: null, geofenceRadiusM: 100, essEmployeeId: '' };

  // Token reveal
  tokenModal = false;
  tokenToShow = '';

  // Geofence modal
  geofenceModal = false;
  geofenceDeviceId = '';
  geofenceForm: { lat: number | null; lng: number | null; radiusM: number | null } = { lat: null, lng: null, radiusM: null };
  geofenceError = '';
  savingGeofence = false;

  get tokenLength(): number {
    return this.tokenToShow?.length || 0;
  }

  get formattedTokenToShow(): string {
    return (this.tokenToShow || '').match(/.{1,8}/g)?.join(' ') || '';
  }

  // Branches + Employees
  branches: BranchOption[] = [];
  employees: Employee[] = [];

  // Enrollment status tab
  enrollmentRows: EnrollmentStatusRow[] = [];
  loadingEnrollments = false;
  statusFilter: 'all' | 'pending' | 'enrolled' | 'deactivated' = 'all';
  statusSearch = '';

  // Re-enrollment requests tab
  reenrollRows: ReenrollViewRow[] = [];
  loadingReenroll = false;
  reenrollFilter: ReenrollRequestStatus = 'PENDING';
  reenrollScope: ReenrollScope = 'employee';
  pendingReenrollCount = 0;
  pendingContractorReenrollCount = 0;
  reviewRequest: ReenrollViewRow | null = null;
  reviewPhotoBlobUrl: string | null = null;
  private reviewPhotoSub: Subscription | null = null;
  reviewDecision: 'APPROVED' | 'REJECTED' = 'APPROVED';
  reviewNotes = '';
  reviewingId: string | null = null;

  // Punch review tab (two-level face decision)
  reviewRows: ReviewPunchRow[] = [];
  loadingReview = false;
  reviewStatusFilter: 'REVIEW_PENDING' | 'REVIEW_APPROVED' | 'REVIEW_REJECTED' =
    'REVIEW_PENDING';
  pendingReviewCount = 0;
  reviewingPunchId: string | null = null;
  federatedSummary: FederatedReviewSummary | null = null;
  federatedFaceDeskItems: FederatedReviewItem[] = [];

  get hasAnyFaceModule(): boolean {
    return (
      this.hasEmployeeMobileAttendanceModule ||
      this.hasContractorFaceAttendanceModule
    );
  }

  get totalPendingReenrollCount(): number {
    if (!this.hasReenrollWorkflow) return 0;
    return (this.hasEmployeeMobileAttendanceModule ? this.pendingReenrollCount : 0)
      + (this.hasContractorFaceAttendanceModule ? this.pendingContractorReenrollCount : 0);
  }

  readonly hasReenrollWorkflow = true;

  get hasEmployeeMobileAttendanceModule(): boolean {
    return this.auth.hasModule('MOBILE_ATTENDANCE');
  }

  get hasContractorFaceAttendanceModule(): boolean {
    return this.auth.hasModule('CONTRACTOR_FACE_ATTENDANCE');
  }

  get hasFederatedReview(): boolean {
    return (
      this.hasEmployeeMobileAttendanceModule &&
      this.hasContractorFaceAttendanceModule
    );
  }

  get showReviewEmptyState(): boolean {
    if (this.loadingReview) return false;
    const hasMobileRows = this.reviewRows.length > 0;
    const hasFaceDeskRows =
      this.hasFederatedReview &&
      this.reviewStatusFilter === 'REVIEW_PENDING' &&
      this.federatedFaceDeskItems.length > 0;
    return !hasMobileRows && !hasFaceDeskRows;
  }

  /** Employees selectable for ESS device binding — filtered to the branch
   *  picked in the Register Device modal. Prevents binding an ESS phone to
   *  an employee in a different branch (which would break geofencing and
   *  payroll routing). */
  get essEligibleEmployees(): Employee[] {
    if (!this.form.branchId) return [];
    return this.employees.filter((e) => e.branchId === this.form.branchId);
  }

  /** Reset the bound ESS employee when the operator changes the branch — the
   *  previously-selected employee is almost certainly from a different
   *  branch now and must be re-picked. */
  onBranchChange(): void {
    this.form.essEmployeeId = '';
    this.bump();
  }

  constructor(
    private svc: ClientMobileAttendanceService,
    private branchSvc: ClientBranchesService,
    private employeesSvc: ClientEmployeesService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private dialog: ConfirmDialogService,
    private auth: AuthService,
    private protectedFile: ProtectedFileService,
    private route: ActivatedRoute,
  ) {}

  private bump(): void {
    if (NgZone.isInAngularZone()) this.cdr.detectChanges();
    else this.zone.run(() => this.cdr.detectChanges());
  }

  ngOnInit(): void {
    this.selectInitialTab();
    if (this.hasEmployeeMobileAttendanceModule || this.hasContractorFaceAttendanceModule) {
      this.loadBranches();
    }
    if (this.hasContractorFaceAttendanceModule) {
      this.loadDevices();
    }
    if (this.hasEmployeeMobileAttendanceModule) {
      if (this.hasContractorFaceAttendanceModule) this.loadEmployees();
      if (this.tab === 'status') this.loadEnrollments();
      if (this.hasReenrollWorkflow) this.refreshPendingReenrollCount();
    }
    if (this.hasContractorFaceAttendanceModule) {
      this.reenrollScope = this.hasEmployeeMobileAttendanceModule ? this.reenrollScope : 'contractor';
      if (this.hasReenrollWorkflow) this.refreshPendingContractorReenrollCount();
    }
    if (this.hasAnyFaceModule) {
      this.refreshPendingReviewCount();
    }
    if (this.tab === 'review') {
      this.loadReviewPunches();
    }
    this.startLiveRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  switchTab(t: 'devices' | 'help' | 'status' | 'reenroll' | 'review'): void {
    if (t === 'devices' && !this.hasContractorFaceAttendanceModule) return;
    if (t === 'status' && !this.hasEmployeeMobileAttendanceModule) return;
    if (t === 'reenroll' && !this.hasReenrollWorkflow) return;
    if (t === 'review' && !this.hasAnyFaceModule) return;
    this.tab = t;
    if (t === 'devices' && this.devices.length === 0) {
      this.loadDevices();
    }
    if (t === 'status' && this.enrollmentRows.length === 0) {
      this.loadEnrollments();
    }
    if (t === 'reenroll') {
      this.loadReenrollRequests();
    }
    if (t === 'review') {
      this.loadReviewPunches();
    }
  }

  // ─── Punch review queue ────────────────────────────────────────────────

  loadReviewPunches(): void {
    this.loadingReview = true;
    this.bump();
    if (this.hasFederatedReview) {
      this.loadFederatedReview(true);
    }
    this.svc
      .listReviewPunches({ status: this.reviewStatusFilter, limit: 200 })
      .subscribe({
        next: (rows) => {
          // ESS administration shows employee-phone punches only. Contractor
          // and shared-kiosk review belongs in Kiosk Attendance.
          this.reviewRows = (rows ?? []).filter(
            (row) => row.subjectType === 'EMPLOYEE',
          );
          if (this.reviewStatusFilter === 'REVIEW_PENDING' && !this.hasFederatedReview) {
            this.pendingReviewCount = this.reviewRows.length;
          }
          this.loadingReview = false;
          this.bump();
        },
        error: () => {
          this.loadingReview = false;
          this.toast.error('Failed to load punch review queue');
          this.bump();
        },
      });
  }

  refreshPendingReviewCount(): void {
    if (this.hasFederatedReview) {
      this.loadFederatedReview(false);
      return;
    }
    this.svc
      .listReviewPunches({ status: 'REVIEW_PENDING', limit: 200 })
      .subscribe({
        next: (rows) => {
          this.pendingReviewCount = (rows ?? []).filter(
            (row) => row.subjectType === 'EMPLOYEE',
          ).length;
          this.bump();
        },
        error: () => undefined,
      });
  }

  private loadFederatedReview(includeFaceDeskList: boolean): void {
    this.svc
      .listFederatedReview({ mobileStatus: 'REVIEW_PENDING', limit: 50 })
      .subscribe({
        next: (response) => {
          this.federatedSummary = response.summary;
          this.federatedFaceDeskItems = includeFaceDeskList
            ? (response.facedeskItems ?? [])
            : this.federatedFaceDeskItems;
          this.pendingReviewCount = response.summary.totalPending;
          this.bump();
        },
        error: () => {
          if (includeFaceDeskList) {
            this.federatedSummary = null;
            this.federatedFaceDeskItems = [];
          }
        },
      });
  }

  formatScore(v: string | null): string {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(3) : '—';
  }

  /** New captures store a /uploads path; legacy local:// files are gone. */
  isPhotoOpenable(url: string | null | undefined): boolean {
    return !!url && url.startsWith('/uploads/');
  }

  /**
   * Open a review punch's photo through the scoped, access-checked endpoint
   * (never the raw storage path). The backend verifies client + branch scope
   * on the owning punch.
   */
  openPunchPhoto(r: ReviewPunchRow): void {
    const kind = r.subjectType.toLowerCase();
    const url = `/api/v1/mobile-attendance/punches/review/${kind}/${r.id}/photo`;
    this.protectedFile.open(url, 'punch-photo.jpg').subscribe({
      error: () => this.toast.error('Could not open the photo'),
    });
  }

  async reviewPunchAction(
    row: ReviewPunchRow,
    action: 'APPROVE' | 'REJECT',
  ): Promise<void> {
    const who = row.subjectName || 'this person';
    const when = new Date(row.punchTime).toLocaleString();
    const confirmed = await this.dialog.confirm(
      action === 'APPROVE' ? 'Approve Punch' : 'Reject Punch',
      action === 'APPROVE'
        ? `Approve the held punch for ${who} at ${when}? It will be counted in Daily Attendance.`
        : `Reject the held punch for ${who} at ${when}? It will NOT count towards attendance.`,
      action === 'APPROVE'
        ? { confirmText: 'Approve' }
        : { variant: 'danger', confirmText: 'Reject' },
    );
    if (!confirmed) return;

    this.reviewingPunchId = row.id;
    this.bump();
    this.svc.reviewPunch(row.subjectType, row.id, action).subscribe({
      next: () => {
        this.toast.success(
          action === 'APPROVE'
            ? 'Punch approved and mirrored to attendance'
            : 'Punch rejected',
        );
        this.reviewingPunchId = null;
        this.loadReviewPunches();
      },
      error: (err) => {
        this.reviewingPunchId = null;
        this.toast.error(
          err?.error?.message || `Failed to ${action.toLowerCase()} punch`,
        );
        this.bump();
      },
    });
  }

  private selectInitialTab(): void {
    const requested = this.route.snapshot.queryParamMap.get('tab');
    if (requested === 'review' && this.hasAnyFaceModule) {
      this.tab = 'review';
      return;
    }
    if (this.hasContractorFaceAttendanceModule) {
      this.tab = 'devices';
      return;
    }
    if (this.hasEmployeeMobileAttendanceModule) {
      this.tab = 'status';
      return;
    }
    this.tab = 'help';
  }

  // ── Branches / Employees ──────────────────────────────────
  loadBranches(): void {
    this.branchSvc.list()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows: any[]) => {
          this.branches = (rows || []).map((b: any) => ({ id: b.id, name: b.name || b.branchCode || b.code || b.id }));
          this.bump();
        },
        error: (e) => { this.toast.error(e?.error?.message || 'Failed to load branches'); this.bump(); },
      });
  }

  loadEmployees(): void {
    if (!this.hasEmployeeMobileAttendanceModule) {
      this.employees = [];
      return;
    }
    this.employeesSvc.list({ isActive: 'true', limit: 1000 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.employees = (res?.data || []).slice().sort((a, b) => a.name.localeCompare(b.name));
          this.bump();
        },
        error: (e) => { this.toast.error(e?.error?.message || 'Failed to load employees'); this.bump(); },
      });
  }

  branchName(id: string | null): string {
    if (!id) return '—';
    const b = this.branches.find((x) => x.id === id);
    return b ? b.name : '—';
  }

  // ── Devices ───────────────────────────────────────────────
  loadDevices(silent = false): void {
    if (this.loadingDevices) return;
    if (!silent) this.loadingDevices = true;
    this.svc.listDevices()
      .pipe(takeUntil(this.destroy$), finalize(() => { if (!silent) this.loadingDevices = false; this.bump(); }))
      .subscribe({
        // The legacy shared KIOSK mode is intentionally not exposed here.
        // Shared devices are provisioned exclusively through FaceDesk.
        next: (rows) => {
          this.devices = (rows || []).filter((device) => device.mode === 'ESS');
          this.bump();
        },
        error: (e) => { if (!silent) this.toast.error(e?.error?.message || 'Failed to load devices'); this.bump(); },
      });
  }

  openAdd(): void {
    if (!this.hasContractorFaceAttendanceModule) return;
    this.formError = '';
    this.locationError = '';
    this.locationAccuracy = null;
    this.form = { mode: 'ESS', deviceLabel: '', branchId: '', geofenceLat: null, geofenceLng: null, geofenceRadiusM: 100, essEmployeeId: '' };
    this.showModal = true;
  }

  onModeChange(): void {
    if (this.form.mode === 'ESS' && this.form.geofenceLat == null && this.form.geofenceLng == null) {
      this.captureLocation();
    }
  }

  /**
   * Auto-fill geofence lat/lng from the browser's Geolocation API. Used both
   * by the explicit "Use my current location" button and on ESS mode select.
   * The captured point becomes the geofence centre — the ESS phone must then
   * be within `geofenceRadiusM` of it for punches to be accepted.
   */
  captureLocation(): void {
    this.locationError = '';
    this.locationAccuracy = null;
    if (!('geolocation' in navigator)) {
      this.locationError = 'Geolocation is not supported by this browser. Enter coordinates manually.';
      this.bump();
      return;
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      this.locationError = 'Geolocation requires HTTPS. Enter coordinates manually.';
      this.bump();
      return;
    }
    this.capturingLocation = true;
    this.bump();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.zone.run(() => {
          this.form.geofenceLat = Number(pos.coords.latitude.toFixed(7));
          this.form.geofenceLng = Number(pos.coords.longitude.toFixed(7));
          this.locationAccuracy = pos.coords.accuracy;
          this.capturingLocation = false;
          this.bump();
        });
      },
      (err) => {
        this.zone.run(() => {
          this.capturingLocation = false;
          if (err.code === err.PERMISSION_DENIED) {
            this.locationError = 'Location permission denied. Allow location for this site or enter coordinates manually.';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            this.locationError = 'Location unavailable. Move near a window / outdoors and retry, or enter manually.';
          } else if (err.code === err.TIMEOUT) {
            this.locationError = 'Location request timed out. Retry, or enter coordinates manually.';
          } else {
            this.locationError = err.message || 'Could not detect location.';
          }
          this.bump();
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  /**
   * Quick-action from the Enrollment Status tab: open the Register Device
   * modal pre-filled for ESS mode + this employee. Used when an already-
   * enrolled employee is being deputed to a project — admin only needs to
   * fill in the project geofence and submit.
   */
  deputeAsEss(r: EnrollmentStatusRow): void {
    if (!this.hasContractorFaceAttendanceModule) {
      this.toast.error('Device registration is not enabled for this service package');
      return;
    }
    this.formError = '';
    this.locationError = '';
    this.locationAccuracy = null;
    this.form = {
      mode: 'ESS',
      deviceLabel: `${r.employeeName} — ESS`,
      branchId: r.branchId || '',
      geofenceLat: null,
      geofenceLng: null,
      geofenceRadiusM: 100,
      essEmployeeId: r.employeeId,
    };
    this.tab = 'devices';
    this.showModal = true;
    this.bump();
    // Auto-capture geofence centre from the admin's current device location.
    this.captureLocation();
  }

  save(): void {
    this.formError = '';
    if (!this.hasContractorFaceAttendanceModule) {
      this.formError = 'Device registration is not enabled for this service package';
      return;
    }
    // This page provisions ESS phones only. Keeping the assignment here also
    // prevents a stale form value from recreating the retired shared-kiosk mode.
    this.form.mode = 'ESS';
    if (this.form.mode === 'ESS' && !this.form.essEmployeeId) {
      this.formError = 'ESS mode requires a bound employee';
      return;
    }
    if (this.form.mode === 'ESS' && (this.form.geofenceLat == null || this.form.geofenceLng == null)) {
      this.formError = 'ESS mode requires geofence latitude and longitude — click 📍 Use my current location';
      return;
    }
    if (this.form.mode === 'ESS') {
      const lat = this.form.geofenceLat ?? 0;
      const lng = this.form.geofenceLng ?? 0;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        this.formError = 'Geofence coordinates are out of range. Latitude must be -90..90 and longitude -180..180.';
        return;
      }
      // Soft sanity guard for India operations — rejects accidental
      // 0,0 (null-island) or Western Hemisphere coordinates that almost
      // always indicate a typo.
      const inIndia = lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;
      if (!inIndia) {
        this.formError = `Coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)}) look wrong for an Indian work site. Re-capture or confirm before saving.`;
        return;
      }
    }
    if (this.form.mode === 'ESS' && (!this.form.geofenceRadiusM || this.form.geofenceRadiusM <= 0)) {
      this.formError = 'ESS mode requires a geofence radius (metres)';
      return;
    }
    if (this.form.mode === 'ESS' && this.form.geofenceRadiusM && this.form.geofenceRadiusM > 10000) {
      this.formError = 'Geofence radius must be 10000 m or less. Use a tighter perimeter for ESS.';
      return;
    }
    this.saving = true;
    const payload: RegisterMobileDeviceBody = {
      mode: this.form.mode,
      branchId: this.form.branchId || undefined,
      deviceLabel: this.form.deviceLabel || undefined,
      essEmployeeId: this.form.mode === 'ESS' ? this.form.essEmployeeId : undefined,
    };
    if (this.form.mode === 'ESS') {
      payload.geofenceLat = this.form.geofenceLat ?? undefined;
      payload.geofenceLng = this.form.geofenceLng ?? undefined;
      payload.geofenceRadiusM = this.form.geofenceRadiusM ?? undefined;
    }
    this.svc.registerDevice(payload)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.saving = false; this.bump(); }))
      .subscribe({
        next: (created) => {
          this.showModal = false;
          this.tokenToShow = created.installToken;
          this.tokenModal = true;
          this.toast.success('Device registered');
          this.loadDevices();
        },
        error: (e) => { this.formError = e?.error?.message || 'Failed to register device'; this.bump(); },
      });
  }

  showToken(d: MobileAttendanceDevice): void {
    this.tokenToShow = d.installToken;
    this.tokenModal = true;
  }

  copyToken(): void {
    if (!this.tokenToShow) return;
    navigator.clipboard?.writeText(this.tokenToShow).then(
      () => this.toast.success('Token copied'),
      () => this.toast.error('Copy failed — select & copy manually'),
    );
  }

  async renameDevice(d: MobileAttendanceDevice): Promise<void> {
    const current = d.deviceLabel || d.deviceName || '';
    const newLabel = window.prompt('Enter new device name:', current);
    if (newLabel === null || newLabel.trim() === '') return;
    this.svc.renameDevice(d.id, newLabel.trim())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.toast.success('Device renamed'); this.loadDevices(); },
        error: (e) => this.toast.error(e?.error?.message || 'Rename failed'),
      });
  }

  async revoke(d: MobileAttendanceDevice): Promise<void> {
    if (!(await this.dialog.confirm('Revoke Device', `Revoke device "${d.deviceLabel || d.id}"? It will stop accepting punches immediately.`, { variant: 'danger', confirmText: 'Revoke' }))) return;
    this.svc.revokeDevice(d.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.toast.success('Device revoked'); this.loadDevices(); },
        error: (e) => this.toast.error(e?.error?.message || 'Revoke failed'),
      });
  }

  async hardDelete(d: MobileAttendanceDevice): Promise<void> {
    if (d.isActive) {
      this.toast.error('Revoke the device before deleting it');
      return;
    }
    if (!(await this.dialog.confirm('Delete Device', `Permanently delete device "${d.deviceLabel || d.id}"? This cannot be undone. Past punches are preserved.`, { variant: 'danger', confirmText: 'Delete' }))) return;
    this.svc.hardDeleteDevice(d.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.toast.success('Device deleted'); this.loadDevices(); },
        error: (e) => this.toast.error(e?.error?.message || 'Delete failed'),
      });
  }

  openGeofence(d: MobileAttendanceDevice): void {
    this.geofenceDeviceId = d.id;
    this.geofenceError = '';
    this.geofenceForm = {
      lat: d.geofenceLat ?? null,
      lng: d.geofenceLng ?? null,
      radiusM: d.geofenceRadiusM ?? null,
    };
    this.geofenceModal = true;
  }

  saveGeofence(): void {
    this.geofenceError = '';
    const { lat, lng, radiusM } = this.geofenceForm;
    const hasValues = lat !== null && lng !== null && radiusM !== null;
    if (hasValues && (lat! < -90 || lat! > 90 || lng! < -180 || lng! > 180)) {
      this.geofenceError = 'Coordinates out of range';
      return;
    }
    if (hasValues && (radiusM! < 50 || radiusM! > 50000)) {
      this.geofenceError = 'Radius must be between 50 m and 50 000 m';
      return;
    }
    this.savingGeofence = true;
    const params = hasValues ? { lat: lat!, lng: lng!, radiusM: radiusM! } : null;
    this.svc.configureGeofence(this.geofenceDeviceId, params)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.savingGeofence = false; this.bump(); }))
      .subscribe({
        next: () => {
          this.geofenceModal = false;
          this.toast.success(params ? 'Geofence saved' : 'Geofence cleared');
          this.loadDevices();
        },
        error: (e) => { this.geofenceError = e?.error?.message || 'Failed to save geofence'; this.bump(); },
      });
  }

  clearGeofence(): void {
    this.geofenceForm = { lat: null, lng: null, radiusM: null };
    this.saveGeofence();
  }

  // ── Live camera + face enrollment ─────────────────────────
  // Removed: face enrollment is now performed by Branch users on a paired
  // kiosk / ESS device. The Client portal only views enrollment status and
  // reviews re-enrollment requests.

  // ── Enrollment status ────────────────────────────────────
  loadEnrollments(silent = false): void {
    if (!this.hasEmployeeMobileAttendanceModule) {
      this.enrollmentRows = [];
      return;
    }
    if (this.loadingEnrollments) return;
    if (!silent) this.loadingEnrollments = true;
    this.svc.listEnrollments()
      .pipe(takeUntil(this.destroy$), finalize(() => { if (!silent) this.loadingEnrollments = false; this.bump(); }))
      .subscribe({
        next: (rows) => { this.enrollmentRows = rows || []; this.bump(); },
        error: (e) => { if (!silent) this.toast.error(e?.error?.message || 'Failed to load enrollments'); this.bump(); },
      });
  }

  get enrolledCount(): number {
    return this.enrollmentRows.filter((r) => r.isEnrolled && r.isActive).length;
  }

  get pendingCount(): number {
    return this.enrollmentRows.filter((r) => !r.isEnrolled).length;
  }

  get filteredEnrollments(): EnrollmentStatusRow[] {
    const q = this.statusSearch.trim().toLowerCase();
    return this.enrollmentRows.filter((r) => {
      if (this.statusFilter === 'pending' && r.isEnrolled) return false;
      if (this.statusFilter === 'enrolled' && !(r.isEnrolled && r.isActive)) return false;
      if (this.statusFilter === 'deactivated' && !(r.isEnrolled && !r.isActive)) return false;
      if (q && !(r.employeeCode.toLowerCase().includes(q) || r.employeeName.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  async deactivate(r: EnrollmentStatusRow): Promise<void> {
    const result = await this.dialog.prompt('Deactivate Enrollment', `Deactivate face enrollment for ${r.employeeName}?`, {
      defaultValue: 'Employee request',
      placeholder: 'Reason required for DPDP audit',
      confirmText: 'Deactivate',
    });
    const reason = result.value?.trim();
    if (!result.confirmed || !reason) return;
    this.svc.deactivateEnrollment(r.employeeId, reason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.toast.success('Enrollment deactivated'); this.loadEnrollments(); },
        error: (e) => this.toast.error(e?.error?.message || 'Deactivation failed'),
      });
  }

  async hardDeleteEnrollment(r: EnrollmentStatusRow): Promise<void> {
    if (!(await this.dialog.confirm('Delete Face Enrollment', `Permanently delete the face enrollment row for ${r.employeeName}?\n\nThis removes the stored face template so the employee can be enrolled again from scratch. The audit history is preserved.\n\nThis action cannot be undone.`, { variant: 'danger', confirmText: 'Delete' }))) return;
    const result = await this.dialog.prompt('Delete Reason', 'Reason required for DPDP audit:', {
      defaultValue: 'Wrong enrollment - re-enrollment required',
      placeholder: 'Reason',
      confirmText: 'Delete',
    });
    const reason = result.value?.trim();
    if (!result.confirmed || !reason) return;
    this.svc.deleteEnrollment(r.employeeId, reason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.toast.success('Enrollment permanently deleted'); this.loadEnrollments(); },
        error: (e) => this.toast.error(e?.error?.message || 'Delete failed'),
      });
  }

  // ── Re-enrollment requests (Phase 3e + 4c) ────────────────
  switchReenrollScope(scope: ReenrollScope): void {
    if (scope === 'employee' && !this.hasEmployeeMobileAttendanceModule) return;
    if (scope === 'contractor' && !this.hasContractorFaceAttendanceModule) return;
    if (this.reenrollScope === scope) return;
    this.reenrollScope = scope;
    this.reenrollRows = [];
    this.loadReenrollRequests();
  }

  loadReenrollRequests(silent = false): void {
    if (!this.hasReenrollWorkflow) {
      this.reenrollRows = [];
      return;
    }
    if (this.loadingReenroll) return;
    if (this.reenrollScope === 'employee' && !this.hasEmployeeMobileAttendanceModule) {
      this.reenrollScope = this.hasContractorFaceAttendanceModule ? 'contractor' : 'employee';
    }
    if (this.reenrollScope === 'contractor' && !this.hasContractorFaceAttendanceModule) {
      this.reenrollRows = [];
      return;
    }
    if (this.reenrollScope === 'employee' && !this.hasEmployeeMobileAttendanceModule) {
      this.reenrollRows = [];
      return;
    }
    if (!silent) this.loadingReenroll = true;
    const scope = this.reenrollScope;
    const done = () => { if (!silent) this.loadingReenroll = false; this.bump(); };
    const onError = (e: any) =>
      !silent && this.toast.error(e?.error?.message || 'Failed to load re-enrollment requests');
    if (scope === 'contractor') {
      this.svc.listContractorReenrollRequests(this.reenrollFilter)
        .pipe(takeUntil(this.destroy$), finalize(done))
        .subscribe({
          next: (rows) => {
            this.reenrollRows = (rows || []).map((r) => this.normalizeContractor(r));
            if (this.reenrollFilter === 'PENDING') {
              this.pendingContractorReenrollCount = this.reenrollRows.length;
            }
          },
          error: onError,
        });
    } else {
      this.svc.listReenrollRequests(this.reenrollFilter)
        .pipe(takeUntil(this.destroy$), finalize(done))
        .subscribe({
          next: (rows) => {
            this.reenrollRows = (rows || []).map((r) => this.normalizeEmployee(r));
            if (this.reenrollFilter === 'PENDING') {
              this.pendingReenrollCount = this.reenrollRows.length;
            }
          },
          error: onError,
        });
    }
  }

  private normalizeEmployee(r: ReenrollRequest): ReenrollViewRow {
    return {
      id: r.id,
      scope: 'employee',
      subjectId: r.employeeId,
      displayName: r.employeeName ?? null,
      displayCode: r.employeeCode ?? null,
      branchId: r.branchId,
      source: r.source,
      status: r.status,
      reason: r.reason,
      requestedAt: r.requestedAt,
      reviewedAt: r.reviewedAt,
      reviewNotes: r.reviewNotes,
      photoUrl: r.photoUrl,
    };
  }

  private normalizeContractor(r: ContractorReenrollRequest): ReenrollViewRow {
    return {
      id: r.id,
      scope: 'contractor',
      subjectId: r.contractorEmployeeId,
      displayName: r.contractorName ?? null,
      displayCode: null,
      branchId: r.branchId,
      source: r.source,
      status: r.status,
      reason: r.reason,
      requestedAt: r.requestedAt,
      reviewedAt: r.reviewedAt,
      reviewNotes: r.reviewNotes,
      photoUrl: r.photoUrl,
    };
  }

  private refreshPendingReenrollCount(): void {
    if (!this.hasEmployeeMobileAttendanceModule) {
      this.pendingReenrollCount = 0;
      return;
    }
    this.svc.listReenrollRequests('PENDING')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => { this.pendingReenrollCount = (rows || []).length; this.bump(); },
        error: () => { /* badge is best-effort */ },
      });
  }

  private refreshPendingContractorReenrollCount(): void {
    if (!this.hasContractorFaceAttendanceModule) {
      this.pendingContractorReenrollCount = 0;
      return;
    }
    this.svc.listContractorReenrollRequests('PENDING')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => { this.pendingContractorReenrollCount = (rows || []).length; this.bump(); },
        error: () => { /* badge is best-effort */ },
      });
  }

  private startLiveRefresh(): void {
    merge(interval(this.liveRefreshMs), fromEvent(window, 'focus'))
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.shouldLiveRefresh()) return;
        if (this.hasReenrollWorkflow && this.hasEmployeeMobileAttendanceModule) this.refreshPendingReenrollCount();
        if (this.hasReenrollWorkflow && this.hasContractorFaceAttendanceModule) this.refreshPendingContractorReenrollCount();
        if (this.hasAnyFaceModule) this.refreshPendingReviewCount();
        if (this.tab === 'devices' && this.hasContractorFaceAttendanceModule) this.loadDevices(true);
        if (this.tab === 'status' && this.hasEmployeeMobileAttendanceModule) this.loadEnrollments(true);
        if (this.tab === 'reenroll') this.loadReenrollRequests(true);
        if (this.tab === 'review') this.loadReviewPunches();
      });
  }

  private shouldLiveRefresh(): boolean {
    return !this.showModal && !this.tokenModal && !this.reviewRequest && !this.saving;
  }

  openReview(r: ReenrollViewRow, decision: 'APPROVED' | 'REJECTED'): void {
    this.cancelReviewPhotoFetch();
    this.reviewRequest = r;
    this.reviewDecision = decision;
    this.reviewNotes = '';
    if (this.reviewPhotoBlobUrl) {
      URL.revokeObjectURL(this.reviewPhotoBlobUrl);
      this.reviewPhotoBlobUrl = null;
    }
    if (r.photoUrl) {
      const requestId = r.id;
      this.reviewPhotoSub = this.protectedFile.fetch(r.photoUrl, 'reenroll-photo.jpg')
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (handle) => {
            if (this.reviewRequest?.id !== requestId) {
              URL.revokeObjectURL(handle.objectUrl);
              return;
            }
            this.reviewPhotoBlobUrl = handle.objectUrl;
            this.bump();
          },
          error: () => { /* photo optional */ },
        });
    }
  }

  private cancelReviewPhotoFetch(): void {
    if (this.reviewPhotoSub) {
      this.reviewPhotoSub.unsubscribe();
      this.reviewPhotoSub = null;
    }
  }

  closeReview(): void {
    this.cancelReviewPhotoFetch();
    if (this.reviewPhotoBlobUrl) {
      URL.revokeObjectURL(this.reviewPhotoBlobUrl);
      this.reviewPhotoBlobUrl = null;
    }
    this.reviewRequest = null;
    this.reviewNotes = '';
  }

  submitReview(): void {
    if (!this.reviewRequest) return;
    const id = this.reviewRequest.id;
    const scope = this.reviewRequest.scope;
    this.reviewingId = id;
    const body = {
      decision: this.reviewDecision,
      notes: this.reviewNotes.trim() || undefined,
    };
    const done = () => { this.reviewingId = null; this.bump(); };
    const onSuccess = (res: { status: 'APPROVED' | 'REJECTED' }) => {
      this.toast.success(res.status === 'APPROVED' ? 'Request approved — embedding updated' : 'Request rejected');
      this.closeReview();
      this.loadReenrollRequests();
      if (scope === 'contractor') this.refreshPendingContractorReenrollCount();
      else this.refreshPendingReenrollCount();
    };
    const onError = (e: any) => this.toast.error(e?.error?.message || 'Review failed');
    if (scope === 'contractor') {
      this.svc.reviewContractorReenrollRequest(id, body)
        .pipe(takeUntil(this.destroy$), finalize(done))
        .subscribe({ next: onSuccess, error: onError });
    } else {
      this.svc.reviewReenrollRequest(id, body)
        .pipe(takeUntil(this.destroy$), finalize(done))
        .subscribe({ next: onSuccess, error: onError });
    }
  }
}

import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  ModalComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { ClientEmployeesService, Employee } from '../employees/client-employees.service';
import {
  ClientMobileAttendanceService,
  ContractorReenrollRequest,
  EnrollmentStatusRow,
  MobileAttendanceDevice,
  MobileDeviceMode,
  RegisterMobileDeviceBody,
  ReenrollRequest,
  ReenrollRequestStatus,
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
}

interface BranchOption { id: string; name: string }

@Component({
  selector: 'app-client-mobile-attendance',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ModalComponent,
  ],
  template: `
    <div class="page">
      <ui-page-header
        title="Mobile Attendance"
        description="Replace fingerprint readers with phone- or tablet-based face attendance. Register a kiosk for a shared gate device, or ESS for an employee's personal phone."
        icon="device">
      </ui-page-header>

      <!-- Tabs -->
      <div class="tab-bar">
        <button class="tab-btn" [class.active]="tab === 'devices'" (click)="switchTab('devices')">Devices</button>
        <button class="tab-btn" [class.active]="tab === 'status'" (click)="switchTab('status')">Enrollment Status</button>
        <button class="tab-btn" [class.active]="tab === 'enroll'" (click)="switchTab('enroll')">Face Enrollment</button>
        <button class="tab-btn" [class.active]="tab === 'reenroll'" (click)="switchTab('reenroll')">
          Re-enrollment Requests
          <span *ngIf="totalPendingReenrollCount > 0"
                class="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
            {{ totalPendingReenrollCount }}
          </span>
        </button>
        <button class="tab-btn" [class.active]="tab === 'help'" (click)="switchTab('help')">Setup Guide</button>
      </div>

      <!-- ────── DEVICES TAB ────── -->
      <ng-container *ngIf="tab === 'devices'">
        <div class="flex items-center justify-between mb-4">
          <span class="text-sm text-gray-500">{{ devices.length }} device(s) registered</span>
          <ui-button variant="primary" (clicked)="openAdd()">+ Register Device</ui-button>
        </div>

        <ui-loading-spinner *ngIf="loadingDevices" text="Loading devices..." size="lg"></ui-loading-spinner>

        <ui-empty-state
          *ngIf="!loadingDevices && devices.length === 0"
          title="No mobile devices registered"
          description="Register a tablet (KIOSK mode) at the gate or an employee's phone (ESS mode) to start collecting face-based attendance.">
        </ui-empty-state>

        <div *ngIf="!loadingDevices && devices.length > 0"
             class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Label</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Mode</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Branch</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Geofence</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Last Seen</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-700">Last Punch</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let d of devices" class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 text-gray-900 font-medium">{{ d.deviceLabel || '—' }}</td>
                <td class="px-4 py-3">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                    [class.bg-blue-100]="d.mode === 'KIOSK'" [class.text-blue-700]="d.mode === 'KIOSK'"
                    [class.bg-purple-100]="d.mode === 'ESS'" [class.text-purple-700]="d.mode === 'ESS'">
                    {{ d.mode }}
                  </span>
                </td>
                <td class="px-4 py-3 text-gray-700">{{ branchName(d.branchId) }}</td>
                <td class="px-4 py-3 text-gray-700">
                  <span *ngIf="d.geofenceLat !== null && d.geofenceLng !== null">
                    {{ d.geofenceLat | number:'1.4-4' }}, {{ d.geofenceLng | number:'1.4-4' }}
                    <span class="text-gray-400">· {{ d.geofenceRadiusM || 100 }}m</span>
                  </span>
                  <span *ngIf="d.geofenceLat === null" class="text-gray-400">—</span>
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
                  <button *ngIf="d.isActive" class="text-xs text-blue-600 hover:underline mr-3" (click)="showToken(d)">Show Token</button>
                  <button *ngIf="d.isActive" class="text-xs text-red-600 hover:underline" (click)="revoke(d)">Revoke</button>
                  <button *ngIf="!d.isActive" class="text-xs text-red-700 hover:underline" (click)="hardDelete(d)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>

      <!-- ────── ENROLLMENT STATUS TAB ────── -->
      <ng-container *ngIf="tab === 'status'">
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

        <ui-loading-spinner *ngIf="loadingEnrollments" text="Loading enrollments..." size="lg"></ui-loading-spinner>

        <ui-empty-state
          *ngIf="!loadingEnrollments && enrollmentRows.length === 0"
          title="No employees found"
          description="There are no active employees in the selected scope.">
        </ui-empty-state>

        <div *ngIf="!loadingEnrollments && filteredEnrollments.length > 0"
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
              <tr *ngFor="let r of filteredEnrollments" class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 text-gray-700 font-mono text-xs">{{ r.employeeCode }}</td>
                <td class="px-4 py-3 text-gray-900 font-medium">{{ r.employeeName }}</td>
                <td class="px-4 py-3 text-gray-700">{{ branchName(r.branchId) }}</td>
                <td class="px-4 py-3 text-center">
                  <span *ngIf="r.isEnrolled && r.isActive"
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Enrolled</span>
                  <span *ngIf="r.isEnrolled && !r.isActive"
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                    [title]="r.deactivationReason || ''">Deactivated</span>
                  <span *ngIf="!r.isEnrolled"
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Pending</span>
                </td>
                <td class="px-4 py-3 text-gray-700 text-xs">{{ r.embeddingModel || '—' }}</td>
                <td class="px-4 py-3 text-gray-700">{{ r.enrolledAt ? (r.enrolledAt | date: 'dd MMM yyyy, HH:mm') : '—' }}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button *ngIf="!r.isEnrolled" class="text-xs text-indigo-600 hover:underline"
                    (click)="jumpToEnroll(r)">Enroll</button>
                  <button *ngIf="r.isEnrolled && r.isActive" class="text-xs text-emerald-700 hover:underline mr-3"
                    (click)="deputeAsEss(r)" title="Register a personal phone for this employee (ESS mode) — useful for project deputation">Depute (ESS)</button>
                  <button *ngIf="r.isEnrolled && r.isActive" class="text-xs text-red-600 hover:underline mr-3"
                    (click)="deactivate(r)">Deactivate</button>
                  <button *ngIf="r.isEnrolled" class="text-xs text-red-700 hover:underline font-semibold"
                    (click)="hardDeleteEnrollment(r)" title="Permanently remove this enrollment row (audit history preserved)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div *ngIf="!loadingEnrollments && enrollmentRows.length > 0 && filteredEnrollments.length === 0"
             class="text-sm text-gray-500 mt-4">No employees match the current filter.</div>
      </ng-container>

      <!-- ────── ENROLLMENT TAB ────── -->
      <ng-container *ngIf="tab === 'enroll'">
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 mb-4">
          <strong>DPDP Compliance:</strong> Face data is biometric Sensitive Personal Information. The employee MUST give explicit, informed consent before enrollment. Tick the consent box only after the employee has read the privacy notice and agreed.
        </div>

        <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 class="font-semibold text-gray-900 mb-3">Enroll an Employee Face</h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="enroll-emp" class="block text-xs font-medium text-gray-600 mb-1">Employee</label>
              <select id="enroll-emp" name="employeeId" [(ngModel)]="enrollForm.employeeId" (ngModelChange)="onEnrollEmployeeChange()" class="ui-input">
                <option value="">— Select employee —</option>
                <option *ngFor="let e of employees" [value]="e.id">{{ e.employeeCode }} · {{ e.name }}</option>
              </select>
            </div>
            <div>
              <label for="enroll-photo" class="block text-xs font-medium text-gray-600 mb-1">Reference Photo (clear, well-lit, front-facing)</label>
              <input id="enroll-photo" name="photo" type="file" accept="image/jpeg,image/png" capture="user" (change)="onPhotoChosen($event)" class="ui-input">
              <p class="text-xs text-gray-500 mt-1">Or use the live camera below.</p>
              <p *ngIf="enrollForm.photoFileName" class="text-xs text-emerald-700 mt-1">✓ {{ enrollForm.photoFileName }} ({{ photoKB }} KB) ready</p>
            </div>
          </div>

          <!-- Live camera capture -->
          <div class="mt-4 border-t border-gray-100 pt-4">
            <div class="flex items-center justify-between mb-2">
              <h4 class="text-sm font-semibold text-gray-800">Live Camera Capture</h4>
              <div class="flex gap-2">
                <ui-button *ngIf="!cameraActive" variant="secondary" size="sm" (clicked)="startCamera()">Start Camera</ui-button>
                <ui-button *ngIf="cameraActive" variant="primary" size="sm" (clicked)="capturePhoto()">📷 Capture</ui-button>
                <ui-button *ngIf="cameraActive" variant="secondary" size="sm" (clicked)="stopCamera()">Stop</ui-button>
              </div>
            </div>
            <div class="relative bg-gray-900 rounded-lg overflow-hidden" [style.maxWidth.px]="480" [style.aspectRatio]="'4 / 3'">
              <video #cameraVideo autoplay playsinline muted [hidden]="!cameraActive" class="w-full h-full object-cover"></video>
              <div *ngIf="!cameraActive" class="flex items-center justify-center h-full text-gray-400 text-sm" style="min-height: 180px;">
                Camera off — click “Start Camera” to begin
              </div>
            </div>
            <p *ngIf="cameraError" class="text-xs text-red-600 mt-2">{{ cameraError }}</p>
            <canvas #cameraCanvas hidden></canvas>
          </div>

          <div class="mt-4 flex items-start gap-2">
            <input id="enroll-consent" type="checkbox" name="consentGiven" [(ngModel)]="enrollForm.consentGiven" class="mt-0.5">
            <label for="enroll-consent" class="text-sm text-gray-700">
              I confirm the employee has read the biometric data privacy notice and has given explicit informed consent for face enrollment under the DPDP Act 2023.
            </label>
          </div>

          <div *ngIf="enrollError" class="mt-3 text-sm text-red-600">{{ enrollError }}</div>

          <div class="mt-4 flex gap-2">
            <ui-button variant="primary" (clicked)="submitEnroll()" [loading]="enrolling" [disabled]="!canEnroll">Enroll Face</ui-button>
            <ui-button variant="secondary" (clicked)="resetEnroll()">Reset</ui-button>
          </div>
        </div>
      </ng-container>

      <!-- ────── RE-ENROLLMENT REQUESTS TAB ────── -->
      <ng-container *ngIf="tab === 'reenroll'">
        <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div class="flex items-center gap-3 flex-wrap">
            <div class="inline-flex rounded-md border border-gray-200 overflow-hidden text-sm">
              <button type="button"
                      class="px-3 py-1.5"
                      [class.bg-indigo-600]="reenrollScope === 'employee'"
                      [class.text-white]="reenrollScope === 'employee'"
                      [class.bg-white]="reenrollScope !== 'employee'"
                      [class.text-gray-700]="reenrollScope !== 'employee'"
                      (click)="switchReenrollScope('employee')">
                Employees
                <span *ngIf="pendingReenrollCount > 0"
                      class="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full"
                      [class.bg-white]="reenrollScope === 'employee'"
                      [class.text-indigo-700]="reenrollScope === 'employee'"
                      [class.bg-amber-100]="reenrollScope !== 'employee'"
                      [class.text-amber-800]="reenrollScope !== 'employee'">
                  {{ pendingReenrollCount }}
                </span>
              </button>
              <button type="button"
                      class="px-3 py-1.5 border-l border-gray-200"
                      [class.bg-indigo-600]="reenrollScope === 'contractor'"
                      [class.text-white]="reenrollScope === 'contractor'"
                      [class.bg-white]="reenrollScope !== 'contractor'"
                      [class.text-gray-700]="reenrollScope !== 'contractor'"
                      (click)="switchReenrollScope('contractor')">
                Contractors
                <span *ngIf="pendingContractorReenrollCount > 0"
                      class="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full"
                      [class.bg-white]="reenrollScope === 'contractor'"
                      [class.text-indigo-700]="reenrollScope === 'contractor'"
                      [class.bg-amber-100]="reenrollScope !== 'contractor'"
                      [class.text-amber-800]="reenrollScope !== 'contractor'">
                  {{ pendingContractorReenrollCount }}
                </span>
              </button>
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

        <ui-loading-spinner *ngIf="loadingReenroll" text="Loading requests..." size="lg"></ui-loading-spinner>

        <ui-empty-state
          *ngIf="!loadingReenroll && reenrollRows.length === 0"
          title="No {{ reenrollFilter | lowercase }} {{ reenrollScope === 'contractor' ? 'contractor' : 'employee' }} re-enrollment requests"
          [description]="reenrollScope === 'contractor'
            ? 'When a contractor employee re-enrolls their face from the ESS app or kiosk, the new embedding lands here for review before it overwrites the live one.'
            : 'When an employee re-enrolls their face from the ESS app or kiosk, the new embedding lands here for review before it overwrites the live one.'">
        </ui-empty-state>

        <div *ngIf="!loadingReenroll && reenrollRows.length > 0"
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
              <tr *ngFor="let r of reenrollRows" class="border-b border-gray-100 hover:bg-gray-50">
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
                  <ng-container *ngIf="r.reviewedAt; else notReviewed">
                    <div>{{ r.reviewedAt | date:'medium' }}</div>
                    <div *ngIf="r.reviewNotes" class="text-gray-500" [title]="r.reviewNotes">{{ r.reviewNotes }}</div>
                  </ng-container>
                  <ng-template #notReviewed><span class="text-gray-400">—</span></ng-template>
                </td>
                <td class="px-4 py-3 text-center">
                  <ng-container *ngIf="r.status === 'PENDING'; else statusBadge">
                    <button class="text-xs font-medium text-green-700 hover:text-green-900 mr-2"
                            [disabled]="reviewingId === r.id"
                            (click)="openReview(r, 'APPROVED')">Approve</button>
                    <button class="text-xs font-medium text-red-600 hover:text-red-800"
                            [disabled]="reviewingId === r.id"
                            (click)="openReview(r, 'REJECTED')">Reject</button>
                  </ng-container>
                  <ng-template #statusBadge>
                    <span class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded"
                          [class.bg-green-100]="r.status === 'APPROVED'" [class.text-green-800]="r.status === 'APPROVED'"
                          [class.bg-red-100]="r.status === 'REJECTED'" [class.text-red-800]="r.status === 'REJECTED'"
                          [class.bg-gray-100]="r.status === 'CANCELLED'" [class.text-gray-800]="r.status === 'CANCELLED'">
                      {{ r.status }}
                    </span>
                  </ng-template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>

      <!-- ────── HELP TAB ────── -->
      <ng-container *ngIf="tab === 'help'">
        <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4 text-sm text-gray-700">
          <div>
            <h3 class="font-semibold text-gray-900 mb-1">1. Choose a mode</h3>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>KIOSK</strong> — a shared tablet placed at the gate. Any employee walks up, looks at the camera, and is identified (1:N face match). Best replacement for the eSSL fingerprint reader.</li>
              <li><strong>ESS</strong> — an employee's personal phone running self-service punch (1:1 verification). Geofence is enforced so the punch only counts inside the workplace.</li>
            </ul>
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 mb-1">2. Register the device</h3>
            <p>Click <em>+ Register Device</em>, choose mode + branch, and (for ESS) enter the geofence coordinates. The system generates an <code>install token</code>.</p>
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 mb-1">3. Install the Android app</h3>
            <p>Download <code>statcompy-attendance.apk</code> on the device, open it, paste the install token, and grant Camera + Location permissions.</p>
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 mb-1">4. Enroll employee faces</h3>
            <p>Switch to the <em>Face Enrollment</em> tab. For each employee, take a clear reference photo, tick the consent checkbox, and submit. Enrollments are stored as embeddings (not images) on the server.</p>
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 mb-1">5. Punches flow into payroll automatically</h3>
            <p>Mobile punches share the same pipeline as biometric punches — they appear under <em>Attendance Review</em>, <em>Daily Attendance</em>, and roll into payroll/registers without any extra work.</p>
          </div>
        </div>
      </ng-container>
    </div>

    <!-- Add Device Modal -->
    <ui-modal *ngIf="showModal" [isOpen]="showModal" [showFooter]="false" title="Register Mobile Device" (closed)="showModal = false">
      <form (ngSubmit)="save()" class="space-y-3">
        <div>
          <label for="dev-mode" class="block text-xs font-medium text-gray-600 mb-1">Mode <span class="text-red-500">*</span></label>
          <select id="dev-mode" name="mode" [(ngModel)]="form.mode" (ngModelChange)="onModeChange()" class="ui-input">
            <option value="KIOSK">KIOSK — shared gate tablet (1:N identification)</option>
            <option value="ESS">ESS — employee personal phone (1:1 + geofence)</option>
          </select>
        </div>
        <div>
          <label for="dev-label" class="block text-xs font-medium text-gray-600 mb-1">Device Label</label>
          <input autocomplete="off" id="dev-label" name="label" type="text" class="ui-input"
                 [(ngModel)]="form.deviceLabel" placeholder="Main Gate Tablet">
        </div>
        <div>
          <label for="dev-branch" class="block text-xs font-medium text-gray-600 mb-1">Branch</label>
          <select id="dev-branch" name="branchId" [(ngModel)]="form.branchId" class="ui-input">
            <option value="">— None —</option>
            <option *ngFor="let b of branches" [value]="b.id">{{ b.name }}</option>
          </select>
        </div>
        <div *ngIf="form.mode === 'ESS'" class="space-y-3">
          <div>
            <label for="dev-ess-emp" class="block text-xs font-medium text-gray-600 mb-1">Bound Employee (ESS)</label>
            <select id="dev-ess-emp" name="essEmployeeId" [(ngModel)]="form.essEmployeeId" class="ui-input">
              <option value="">— Select employee —</option>
              <option *ngFor="let e of employees" [value]="e.id">{{ e.name }} ({{ e.employeeCode }})</option>
            </select>
            <p class="text-xs text-gray-500 mt-1">This personal phone will only be able to punch and self-enroll for this employee.</p>
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
              <span *ngIf="!capturingLocation">Use my current location</span>
              <span *ngIf="capturingLocation">Detecting…</span>
            </button>
            <span *ngIf="locationAccuracy !== null && !locationError" class="text-xs text-gray-500">
              Accuracy ±{{ locationAccuracy | number:'1.0-0' }} m
            </span>
          </div>
          <p *ngIf="locationError" class="text-xs text-amber-600">{{ locationError }}</p>
          <p class="text-xs text-gray-500">Coordinates are auto-captured from your browser's location and cannot be edited — stand at the project site when registering. Adjust radius to match the project boundary; the ESS app will then verify each punch is inside this geofence.</p>
        </div>
        <div *ngIf="formError" class="text-sm text-red-600">{{ formError }}</div>
        <div class="flex justify-end gap-2 pt-2">
          <ui-button variant="secondary" type="button" (clicked)="showModal = false">Cancel</ui-button>
          <ui-button variant="primary" type="submit" [loading]="saving">Register</ui-button>
        </div>
      </form>
    </ui-modal>

    <!-- Re-enrollment review modal -->
    <ui-modal *ngIf="reviewRequest" [isOpen]="!!reviewRequest" [showFooter]="false"
              [title]="reviewDecision === 'APPROVED' ? 'Approve re-enrollment' : 'Reject re-enrollment'"
              (closed)="closeReview()">
      <div class="space-y-3 text-sm">
        <div class="text-gray-700">
          <div>
            <strong>{{ reviewRequest.scope === 'contractor' ? 'Contractor employee' : 'Employee' }}:</strong>
            {{ reviewRequest.displayName }}
            <span *ngIf="reviewRequest.displayCode">({{ reviewRequest.displayCode }})</span>
          </div>
          <div><strong>Source:</strong> {{ reviewRequest.source }}</div>
          <div><strong>Requested:</strong> {{ reviewRequest.requestedAt | date:'medium' }}</div>
          <div *ngIf="reviewRequest.reason"><strong>Reason:</strong> {{ reviewRequest.reason }}</div>
        </div>
        <p *ngIf="reviewDecision === 'APPROVED'" class="text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-xs">
          Approving will overwrite this {{ reviewRequest.scope === 'contractor' ? 'contractor employee' : 'employee' }}'s live face embedding with the new one. The previous embedding cannot be recovered.
        </p>
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

    <!-- Show install token after creation -->
    <ui-modal *ngIf="tokenModal" [isOpen]="tokenModal" [showFooter]="false" title="Install Token" (closed)="tokenModal = false">
      <div class="space-y-3 text-sm">
        <p class="text-gray-700">Paste this 64-character token into the Android app on the device. It will not be displayed again — copy it now.</p>
        <div class="bg-gray-50 border border-gray-200 rounded p-3 font-mono text-xs break-all select-all">{{ tokenToShow }}</div>
        <div class="flex justify-end gap-2">
          <ui-button variant="secondary" (clicked)="copyToken()">Copy</ui-button>
          <ui-button variant="primary" (clicked)="tokenModal = false">Done</ui-button>
        </div>
      </div>
    </ui-modal>
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

  tab: 'devices' | 'enroll' | 'help' | 'status' | 'reenroll' = 'devices';

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
    mode: MobileDeviceMode;
    deviceLabel: string;
    branchId: string;
    geofenceLat: number | null;
    geofenceLng: number | null;
    geofenceRadiusM: number | null;
    essEmployeeId: string;
  } = { mode: 'KIOSK', deviceLabel: '', branchId: '', geofenceLat: null, geofenceLng: null, geofenceRadiusM: 100, essEmployeeId: '' };

  // Token reveal
  tokenModal = false;
  tokenToShow = '';

  // Branches + Employees
  branches: BranchOption[] = [];
  employees: Employee[] = [];

  // Enroll form
  enrollForm: {
    employeeId: string;
    consentGiven: boolean;
    photoBase64: string;
    photoMime: string;
    photoFileName: string;
    photoSize: number;
  } = { employeeId: '', consentGiven: false, photoBase64: '', photoMime: '', photoFileName: '', photoSize: 0 };
  enrolling = false;
  enrollError = '';

  // Live camera capture
  @ViewChild('cameraVideo') cameraVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('cameraCanvas') cameraCanvas?: ElementRef<HTMLCanvasElement>;
  cameraActive = false;
  cameraError = '';
  private cameraStream: MediaStream | null = null;

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
  reviewDecision: 'APPROVED' | 'REJECTED' = 'APPROVED';
  reviewNotes = '';
  reviewingId: string | null = null;

  get totalPendingReenrollCount(): number {
    return this.pendingReenrollCount + this.pendingContractorReenrollCount;
  }

  constructor(
    private svc: ClientMobileAttendanceService,
    private branchSvc: ClientBranchesService,
    private employeesSvc: ClientEmployeesService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
  ) {}

  private bump(): void {
    if (NgZone.isInAngularZone()) this.cdr.detectChanges();
    else this.zone.run(() => this.cdr.detectChanges());
  }

  ngOnInit(): void {
    this.loadBranches();
    this.loadDevices();
    this.loadEmployees();
    this.refreshPendingReenrollCount();
    this.refreshPendingContractorReenrollCount();
  }

  ngOnDestroy(): void {
    this.stopCamera();
    this.destroy$.next();
    this.destroy$.complete();
  }

  switchTab(t: 'devices' | 'enroll' | 'help' | 'status' | 'reenroll'): void {
    if (t !== 'enroll') this.stopCamera();
    this.tab = t;
    if (t === 'status' && this.enrollmentRows.length === 0) {
      this.loadEnrollments();
    }
    if (t === 'reenroll') {
      this.loadReenrollRequests();
    }
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
        error: () => { /* silent */ },
      });
  }

  loadEmployees(): void {
    this.employeesSvc.list({ isActive: 'true', limit: 1000 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.employees = (res?.data || []).slice().sort((a, b) => a.name.localeCompare(b.name));
          this.bump();
        },
        error: () => { /* silent */ },
      });
  }

  branchName(id: string | null): string {
    if (!id) return '—';
    const b = this.branches.find((x) => x.id === id);
    return b ? b.name : '—';
  }

  // ── Devices ───────────────────────────────────────────────
  loadDevices(): void {
    this.loadingDevices = true;
    this.svc.listDevices()
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loadingDevices = false; this.bump(); }))
      .subscribe({
        next: (rows) => { this.devices = rows || []; this.bump(); },
        error: (e) => { this.toast.error(e?.error?.message || 'Failed to load devices'); this.bump(); },
      });
  }

  openAdd(): void {
    this.formError = '';
    this.locationError = '';
    this.locationAccuracy = null;
    this.form = { mode: 'KIOSK', deviceLabel: '', branchId: '', geofenceLat: null, geofenceLng: null, geofenceRadiusM: 100, essEmployeeId: '' };
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
    if (this.form.mode === 'ESS' && !this.form.essEmployeeId) {
      this.formError = 'ESS mode requires a bound employee';
      return;
    }
    if (this.form.mode === 'ESS' && (this.form.geofenceLat == null || this.form.geofenceLng == null)) {
      this.formError = 'ESS mode requires geofence latitude and longitude — click 📍 Use my current location';
      return;
    }
    if (this.form.mode === 'ESS' && (!this.form.geofenceRadiusM || this.form.geofenceRadiusM <= 0)) {
      this.formError = 'ESS mode requires a geofence radius (metres)';
      return;
    }
    this.saving = true;
    const payload: RegisterMobileDeviceBody = {
      mode: this.form.mode,
      branchId: this.form.branchId || undefined,
      deviceLabel: this.form.deviceLabel || undefined,
      geofenceLat: this.form.geofenceLat ?? undefined,
      geofenceLng: this.form.geofenceLng ?? undefined,
      geofenceRadiusM: this.form.geofenceRadiusM ?? undefined,
      essEmployeeId: this.form.mode === 'ESS' ? this.form.essEmployeeId : undefined,
    };
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

  revoke(d: MobileAttendanceDevice): void {
    if (!confirm(`Revoke device "${d.deviceLabel || d.id}"? It will stop accepting punches immediately.`)) return;
    this.svc.revokeDevice(d.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.toast.success('Device revoked'); this.loadDevices(); },
        error: (e) => this.toast.error(e?.error?.message || 'Revoke failed'),
      });
  }

  hardDelete(d: MobileAttendanceDevice): void {
    if (d.isActive) {
      this.toast.error('Revoke the device before deleting it');
      return;
    }
    if (!confirm(`Permanently delete device "${d.deviceLabel || d.id}"? This cannot be undone. Past punches are preserved.`)) return;
    this.svc.hardDeleteDevice(d.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.toast.success('Device deleted'); this.loadDevices(); },
        error: (e) => this.toast.error(e?.error?.message || 'Delete failed'),
      });
  }

  // ── Enrollment ────────────────────────────────────────────
  get canEnroll(): boolean {
    return !!this.enrollForm.employeeId
      && this.enrollForm.consentGiven
      && !!this.enrollForm.photoBase64;
  }

  get photoKB(): number {
    return Math.round(this.enrollForm.photoSize / 1024);
  }

  onPhotoChosen(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('Photo too large (max 5 MB)');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      this.enrollForm.photoBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      this.enrollForm.photoMime = file.type || 'image/jpeg';
      this.enrollForm.photoFileName = file.name;
      this.enrollForm.photoSize = file.size;
      this.toast.success('Photo loaded — ready to enroll');
      this.bump();
    };
    reader.onerror = () => this.toast.error('Failed to read photo');
    reader.readAsDataURL(file);
  }

  // ── Live camera ──────────────────────────────────────────
  async startCamera(): Promise<void> {
    this.cameraError = '';
    // getUserMedia requires a Secure Context (https:// or localhost).
    const isSecure =
      typeof window !== 'undefined' &&
      ((window as any).isSecureContext === true ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1');
    if (!isSecure) {
      this.cameraError =
        'Camera blocked: this page must be loaded over HTTPS to use the camera.';
      this.toast.error(this.cameraError);
      this.bump();
      return;
    }
    if (!navigator?.mediaDevices?.getUserMedia) {
      this.cameraError =
        'Camera API not available in this browser. Try Chrome / Edge / Safari and allow camera access.';
      this.toast.error(this.cameraError);
      this.bump();
      return;
    }
    // Show the <video> element BEFORE requesting the stream so it is in the
    // DOM and visible by the time we assign srcObject. This avoids a race
    // where setTimeout(0) attached the stream to a still-hidden element and
    // play() rejected silently on some Android Chrome versions.
    this.cameraActive = true;
    this.bump();
    try {
      // Enumerate cameras and prefer a real one over virtual cameras
      // (Windows Phone Link "Use as connected camera", DroidCam, OBS,
      // Snap Camera, XSplit, NDI). Labels are usually empty until the
      // user has granted camera permission once — that's fine, we just
      // fall back to facingMode in that case.
      let constraints: MediaStreamConstraints = {
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      };
      let chosenLabel = '';
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === 'videoinput');
        const VIRTUAL = /(phone link|phone\s*\(|droidcam|obs|snap camera|virtual|xsplit|ndi|manycam)/i;
        const real = cams.find((c) => c.label && !VIRTUAL.test(c.label));
        console.info('[mobile-attendance] cameras:', cams.map((c) => c.label || '(no label)'));
        if (real?.deviceId) {
          chosenLabel = real.label;
          constraints = {
            video: { deviceId: { exact: real.deviceId }, width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          };
        }
      } catch { /* enumerateDevices is best-effort */ }
      // Race getUserMedia against an 8s timeout. Some virtual cameras
      // (notably Windows Phone Link in 'connecting' state) leave the
      // promise pending forever instead of rejecting.
      let timedOut = false;
      const gumPromise = navigator.mediaDevices.getUserMedia(constraints);
      gumPromise.then((s) => { if (timedOut) s.getTracks().forEach((t) => t.stop()); }).catch(() => {});
      const stream = await Promise.race<MediaStream>([
        gumPromise,
        new Promise<MediaStream>((_, rej) => setTimeout(() => {
          timedOut = true;
          rej(new Error(
            `Camera open timed out (8s)${chosenLabel ? ` on "${chosenLabel}"` : ''}. ` +
            'A virtual camera (Windows Phone Link "Use as connected camera", DroidCam, OBS, Snap Camera) is most likely holding it. ' +
            'Disable it in Windows Settings → Bluetooth & devices → Cameras, or close the app, then retry.'
          ));
        }, 8000)),
      ]);
      this.cameraStream = stream;
      const v = this.cameraVideo?.nativeElement;
      if (!v) {
        stream.getTracks().forEach((t) => t.stop());
        this.cameraStream = null;
        this.cameraActive = false;
        this.cameraError = 'Camera element not ready — please retry.';
        this.toast.error(this.cameraError);
        this.bump();
        return;
      }
      v.srcObject = stream;
      v.muted = true;
      v.setAttribute('playsinline', 'true');
      v.play().catch(() => {
        requestAnimationFrame(() => { v.play().catch(() => { /* ignore */ }); });
      });
      // Wait for the first real video frame. If none arrives in 6s the
      // camera is almost certainly held by another app (Windows Phone
      // Link, Teams, Zoom, OBS virtual cam, etc.) — surface that clearly.
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const cleanup = () => {
          v.removeEventListener('loadedmetadata', check);
          v.removeEventListener('playing', check);
          v.removeEventListener('canplay', check);
        };
        const check = () => {
          if (done) return;
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            done = true; cleanup(); resolve();
          }
        };
        v.addEventListener('loadedmetadata', check);
        v.addEventListener('playing', check);
        v.addEventListener('canplay', check);
        check();
        setTimeout(() => {
          if (done) return;
          done = true; cleanup();
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            resolve();
          } else {
            const label = stream.getVideoTracks()[0]?.label || 'unknown';
            reject(new Error(
              `Camera "${label}" was opened but is not sending frames. Another app (e.g. Windows Phone Link "use phone as webcam", Teams, Zoom, OBS) is most likely holding it. Close that app and click Start again.`
            ));
          }
        }, 6000);
      });
      this.bump();
    } catch (err: any) {
      this.cameraActive = false;
      this.cameraStream?.getTracks().forEach((t) => t.stop());
      this.cameraStream = null;
      const name = err?.name || '';
      const msg =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera permission denied. Open site settings, allow camera, and retry.'
          : name === 'NotFoundError' || name === 'DevicesNotFoundError'
            ? 'No camera found on this device.'
            : name === 'NotReadableError' || name === 'TrackStartError'
              ? 'Camera is in use by another app or unavailable. Close other camera apps and retry.'
              : name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError'
                ? 'Camera does not support the requested settings.'
                : name === 'AbortError'
                  ? 'Camera start was aborted. Please retry.'
                  : `Camera error: ${err?.message || name || 'unknown'}`;
      this.cameraError = msg;
      this.toast.error(msg);
      this.bump();
    }
  }

  stopCamera(): void {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((t) => t.stop());
      this.cameraStream = null;
    }
    if (this.cameraVideo?.nativeElement) {
      this.cameraVideo.nativeElement.srcObject = null;
    }
    this.cameraActive = false;
    this.bump();
  }

  capturePhoto(): void {
    const v = this.cameraVideo?.nativeElement;
    const c = this.cameraCanvas?.nativeElement;
    if (!v || !c) {
      this.toast.error('Camera not ready');
      return;
    }
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    if (!w || !h) {
      this.toast.error('Camera not ready — wait a moment and try again');
      return;
    }
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) { this.toast.error('Canvas not supported'); return; }
    ctx.drawImage(v, 0, 0, w, h);
    const dataUrl = c.toDataURL('image/jpeg', 0.9);
    const comma = dataUrl.indexOf(',');
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    this.enrollForm.photoBase64 = base64;
    this.enrollForm.photoMime = 'image/jpeg';
    this.enrollForm.photoFileName = `camera-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
    this.enrollForm.photoSize = Math.round((base64.length * 3) / 4);
    this.toast.success('Photo captured — ready to enroll');
    this.stopCamera();
  }

  submitEnroll(): void {
    this.enrollError = '';
    if (!this.canEnroll) {
      this.enrollError = 'Select employee, attach photo, and tick consent';
      return;
    }
    this.enrolling = true;
    this.svc.enrollFace({
      employeeId: this.enrollForm.employeeId,
      consentGiven: true,
      photoBase64: this.enrollForm.photoBase64,
      photoMime: this.enrollForm.photoMime,
    })
      .pipe(takeUntil(this.destroy$), finalize(() => { this.enrolling = false; this.bump(); }))
      .subscribe({
        next: () => { this.toast.success('Face enrolled'); this.resetEnroll(); },
        error: (e) => {
          this.enrollError = e?.error?.message || 'Enrollment failed';
          // Clear the captured photo on failure so the operator is forced to
          // re-capture/re-upload — prevents accidentally re-submitting the
          // same (often wrong) photo against a different employee.
          this.clearCapturedPhoto();
          this.bump();
        },
      });
  }

  /** Clears any captured/uploaded photo and stops the camera. Keeps employee + consent. */
  clearCapturedPhoto(): void {
    this.enrollForm.photoBase64 = '';
    this.enrollForm.photoMime = '';
    this.enrollForm.photoFileName = '';
    this.enrollForm.photoSize = 0;
    this.stopCamera();
  }

  /** Called when the operator picks a different employee. Drops any stale photo. */
  onEnrollEmployeeChange(): void {
    this.clearCapturedPhoto();
    this.enrollError = '';
    this.bump();
  }

  resetEnroll(): void {
    this.enrollForm = { employeeId: '', consentGiven: false, photoBase64: '', photoMime: '', photoFileName: '', photoSize: 0 };
    this.enrollError = '';
    this.stopCamera();
  }

  // ── Enrollment status ────────────────────────────────────
  loadEnrollments(): void {
    this.loadingEnrollments = true;
    this.svc.listEnrollments()
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loadingEnrollments = false; this.bump(); }))
      .subscribe({
        next: (rows) => { this.enrollmentRows = rows || []; this.bump(); },
        error: (e) => { this.toast.error(e?.error?.message || 'Failed to load enrollments'); this.bump(); },
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

  jumpToEnroll(r: EnrollmentStatusRow): void {
    this.enrollForm.employeeId = r.employeeId;
    this.tab = 'enroll';
  }

  deactivate(r: EnrollmentStatusRow): void {
    const reason = prompt(`Deactivate face enrollment for ${r.employeeName}? Enter a reason (required for DPDP audit):`, 'Employee request');
    if (!reason || !reason.trim()) return;
    this.svc.deactivateEnrollment(r.employeeId, reason.trim())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.toast.success('Enrollment deactivated'); this.loadEnrollments(); },
        error: (e) => this.toast.error(e?.error?.message || 'Deactivation failed'),
      });
  }

  hardDeleteEnrollment(r: EnrollmentStatusRow): void {
    if (!confirm(`PERMANENTLY DELETE the face enrollment row for ${r.employeeName}?\n\nThis removes the stored face template so the employee can be enrolled again from scratch. The audit history is preserved.\n\nThis action cannot be undone.`)) return;
    const reason = prompt(`Reason (required for DPDP audit):`, 'Wrong enrollment — re-enrollment required');
    if (!reason || !reason.trim()) return;
    this.svc.deleteEnrollment(r.employeeId, reason.trim())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.toast.success('Enrollment permanently deleted'); this.loadEnrollments(); },
        error: (e) => this.toast.error(e?.error?.message || 'Delete failed'),
      });
  }

  // ── Re-enrollment requests (Phase 3e + 4c) ────────────────
  switchReenrollScope(scope: ReenrollScope): void {
    if (this.reenrollScope === scope) return;
    this.reenrollScope = scope;
    this.reenrollRows = [];
    this.loadReenrollRequests();
  }

  loadReenrollRequests(): void {
    this.loadingReenroll = true;
    const scope = this.reenrollScope;
    const done = () => { this.loadingReenroll = false; this.bump(); };
    const onError = (e: any) =>
      this.toast.error(e?.error?.message || 'Failed to load re-enrollment requests');
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
    };
  }

  private refreshPendingReenrollCount(): void {
    this.svc.listReenrollRequests('PENDING')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => { this.pendingReenrollCount = (rows || []).length; this.bump(); },
        error: () => { /* badge is best-effort */ },
      });
  }

  private refreshPendingContractorReenrollCount(): void {
    this.svc.listContractorReenrollRequests('PENDING')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => { this.pendingContractorReenrollCount = (rows || []).length; this.bump(); },
        error: () => { /* badge is best-effort */ },
      });
  }

  openReview(r: ReenrollViewRow, decision: 'APPROVED' | 'REJECTED'): void {
    this.reviewRequest = r;
    this.reviewDecision = decision;
    this.reviewNotes = '';
  }

  closeReview(): void {
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

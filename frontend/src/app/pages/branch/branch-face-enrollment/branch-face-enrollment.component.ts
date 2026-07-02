import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { fromEvent, interval, merge, Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  ActionButtonComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../core/auth.service';
import { ClientEmployeesService, Employee } from '../../client/employees/client-employees.service';
import {
  ContractorEmployee,
  ContractorEmployeesApiService,
} from '../../../core/contractor-employees-api.service';
import {
  ClientMobileAttendanceService,
  ContractorEnrollmentStatusRow,
  CreateKioskEnrollTicketBody,
  EnrollContractorFaceBody,
  EnrollFaceBody,
  EnrollmentStatusRow,
  KioskEnrollTicket,
  KioskEnrollTicketStatus,
  MobileAttendanceDevice,
} from '../../client/mobile-attendance/client-mobile-attendance.service';

type SubjectType = 'employee' | 'contractor';

interface EnrollForm {
  subjectType: SubjectType;
  subjectId: string; // employees.id OR contractor_employees.id
  photoBase64: string;
  photoMime: string;
  photoFileName: string;
  consentGiven: boolean;
}

@Component({
  selector: 'app-branch-face-enrollment',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    LoadingSpinnerComponent,
  ],
  template: `
    <ui-page-header
      title="Face Enrollment"
      subtitle="Register face biometrics for employees in your branch"
    ></ui-page-header>

    <div class="p-4 md:p-6 space-y-4">
      <!-- Subject-type tabs (Employee vs Contractor) -->
      <div
        class="bg-white rounded-xl border border-gray-200 p-2 shadow-sm flex gap-1"
        role="tablist"
      >
        <button
          *ngIf="canViewEmployeeFaceEnrollment"
          type="button"
          role="tab"
          class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition"
          [class.bg-indigo-600]="subjectType === 'employee'"
          [class.text-white]="subjectType === 'employee'"
          [class.text-gray-700]="subjectType !== 'employee'"
          [class.hover:bg-gray-100]="subjectType !== 'employee'"
          [attr.aria-selected]="subjectType === 'employee'"
          (click)="switchSubjectType('employee')"
        >
          Employees
        </button>
        <button
          *ngIf="canViewContractorFaceEnrollment"
          type="button"
          role="tab"
          class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition"
          [class.bg-indigo-600]="subjectType === 'contractor'"
          [class.text-white]="subjectType === 'contractor'"
          [class.text-gray-700]="subjectType !== 'contractor'"
          [class.hover:bg-gray-100]="subjectType !== 'contractor'"
          [attr.aria-selected]="subjectType === 'contractor'"
          (click)="switchSubjectType('contractor')"
        >
          Contractor Employees
        </button>
      </div>

      <!-- Notice: employees self-enroll from their paired ESS device. -->
      <div
        *ngIf="subjectType === 'employee'"
        class="bg-indigo-50 border border-indigo-200 rounded-xl p-5 shadow-sm"
      >
        <h3 class="font-semibold text-indigo-900 mb-1">
          Employee face enrollment moved to the ESS mobile app
        </h3>
        <p class="text-sm text-indigo-800">
          To strengthen identity assurance, employees now enroll their face directly from their
          paired ESS device using a live 8-frame capture. Pair the device under
          <strong>Mobile Devices</strong>, link it to the employee, and ask them to open the ESS app
          — the enroll screen launches automatically the first time.
        </p>
        <p class="text-xs text-indigo-700 mt-2">
          You can still view enrollment status and deactivate / delete a stored template below. For
          exceptional re-enrollments, use the re-enrollment request workflow.
        </p>
      </div>

      <div
        *ngIf="subjectType === 'contractor'"
        class="bg-indigo-50 border border-indigo-200 rounded-xl p-5 shadow-sm"
      >
        <h3 class="font-semibold text-indigo-900 mb-1">
          Contractor face enrollment uses kiosk review
        </h3>
        <p class="text-sm text-indigo-800">
          Select a contractor employee below and use <strong>Enroll on Kiosk</strong>. The kiosk
          captures only; the registration becomes active only after web approval.
        </p>
      </div>

      <!-- Enrollment status table -->
      <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 class="font-semibold text-gray-900">
              {{
                subjectType === 'contractor' ? 'Contractor Enrollment Status' : 'Enrollment Status'
              }}
            </h3>
            <p class="text-xs text-gray-500">
              <span class="font-semibold text-gray-900">{{ enrolledCount }}</span> enrolled ·
              <span class="font-semibold text-amber-700">{{ pendingCount }}</span> pending ·
              {{ activeRows.length }} total in your branch
            </p>
          </div>
          <div class="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search…"
              [(ngModel)]="statusSearch"
              name="statusSearch"
              class="ui-input"
              style="width: 200px;"
            />
            <select
              [(ngModel)]="statusFilter"
              name="statusFilter"
              class="ui-input"
              style="width: 160px;"
            >
              <option value="all">All</option>
              <option value="pending">Pending only</option>
              <option value="enrolled">Enrolled only</option>
              <option value="deactivated">Deactivated only</option>
            </select>
            <ui-button variant="secondary" (clicked)="loadEnrollments()">Refresh</ui-button>
          </div>
        </div>

        <div *ngIf="loadingEnrollments" class="py-6 flex justify-center">
          <ui-loading-spinner></ui-loading-spinner>
        </div>

        <!-- Employee status table -->
        <div
          *ngIf="
            !loadingEnrollments && subjectType === 'employee' && filteredEnrollments.length > 0
          "
          class="overflow-x-auto"
        >
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-3 py-2 font-semibold text-gray-700">Code</th>
                <th class="text-left px-3 py-2 font-semibold text-gray-700">Employee</th>
                <th class="text-center px-3 py-2 font-semibold text-gray-700">Status</th>
                <th class="text-left px-3 py-2 font-semibold text-gray-700">Enrolled At</th>
                <th class="text-right px-3 py-2 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let r of filteredEnrollments"
                class="border-b border-gray-100 hover:bg-gray-50"
              >
                <td class="px-3 py-2 text-gray-700 font-mono text-xs">{{ r.employeeCode }}</td>
                <td class="px-3 py-2 text-gray-900 font-medium">{{ r.employeeName }}</td>
                <td class="px-3 py-2 text-center">
                  <span
                    *ngIf="r.isEnrolled && r.isActive"
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"
                    >Enrolled</span
                  >
                  <span
                    *ngIf="r.isEnrolled && !r.isActive"
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                    >Deactivated</span
                  >
                  <span
                    *ngIf="!r.isEnrolled"
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
                    >Pending</span
                  >
                </td>
                <td class="px-3 py-2 text-gray-700">
                  {{ r.enrolledAt ? (r.enrolledAt | date: 'dd MMM yyyy, HH:mm') : '—' }}
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    *ngIf="r.isEnrolled && r.isActive"
                    class="text-xs text-red-600 hover:underline mr-3"
                    (click)="deactivate(r)"
                  >
                    Deactivate
                  </button>
                  <button
                    *ngIf="r.isEnrolled"
                    class="text-xs text-red-700 hover:underline font-semibold"
                    (click)="hardDelete(r)"
                    title="Permanently remove this enrollment row (audit history preserved)"
                  >
                    Delete
                  </button>
                  <button
                    *ngIf="!r.isEnrolled && canUseKioskEnrollment"
                    class="text-xs text-indigo-600 hover:underline font-semibold"
                    (click)="openKioskEnrollForEmployee(r)"
                    title="Send a one-time capture instruction to a KIOSK device"
                  >
                    Enroll on Kiosk
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Contractor status table -->
        <div
          *ngIf="
            !loadingEnrollments &&
            subjectType === 'contractor' &&
            filteredContractorEnrollments.length > 0
          "
          class="overflow-x-auto"
        >
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-3 py-2 font-semibold text-gray-700">Name</th>
                <th class="text-center px-3 py-2 font-semibold text-gray-700">Status</th>
                <th class="text-left px-3 py-2 font-semibold text-gray-700">Enrolled At</th>
                <th class="text-right px-3 py-2 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let r of filteredContractorEnrollments"
                class="border-b border-gray-100 hover:bg-gray-50"
              >
                <td class="px-3 py-2 text-gray-900 font-medium">{{ r.name }}</td>
                <td class="px-3 py-2 text-center">
                  <span
                    *ngIf="r.isEnrolled && r.isActive"
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"
                    >Enrolled</span
                  >
                  <span
                    *ngIf="r.isEnrolled && !r.isActive"
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                    >Deactivated</span
                  >
                  <span
                    *ngIf="!r.isEnrolled"
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
                    >Pending</span
                  >
                </td>
                <td class="px-3 py-2 text-gray-700">
                  {{ r.enrolledAt ? (r.enrolledAt | date: 'dd MMM yyyy, HH:mm') : '—' }}
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    *ngIf="!r.isEnrolled && canUseManualContractorEnrollment"
                    class="text-xs text-indigo-600 hover:underline mr-3"
                    (click)="selectContractorForEnroll(r)"
                  >
                    Enroll
                  </button>
                  <button
                    *ngIf="!r.isEnrolled && canUseKioskEnrollment"
                    class="text-xs text-indigo-600 hover:underline mr-3 font-semibold"
                    (click)="openKioskEnrollForContractor(r)"
                    title="Send a one-time capture instruction to a KIOSK device"
                  >
                    Enroll on Kiosk
                  </button>
                  <button
                    *ngIf="r.isEnrolled && r.isActive"
                    class="text-xs text-red-600 hover:underline mr-3"
                    (click)="deactivateContractor(r)"
                  >
                    Deactivate
                  </button>
                  <button
                    *ngIf="r.isEnrolled"
                    class="text-xs text-red-700 hover:underline font-semibold"
                    (click)="hardDeleteContractor(r)"
                    title="Permanently remove this enrollment row (audit history preserved)"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          *ngIf="!loadingEnrollments && activeRows.length > 0 && activeFilteredRows.length === 0"
          class="text-sm text-gray-500"
        >
          No {{ subjectType === 'contractor' ? 'contractor employees' : 'employees' }} match the
          current filter.
        </div>
        <div *ngIf="!loadingEnrollments && activeRows.length === 0" class="text-sm text-gray-500">
          No {{ subjectType === 'contractor' ? 'contractor employees' : 'employees' }} found in your
          branch.
        </div>
      </div>

      <!-- Kiosk-enroll ticket history -->
      <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 class="font-semibold text-gray-900">Kiosk Enrollment Tickets</h3>
            <p class="text-xs text-gray-500">
              Last 100 tickets you sent to a kiosk, most recent first.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              *ngFor="let s of kioskTicketStatusFilters"
              class="px-3 py-1 rounded-full text-xs font-medium border transition"
              [class.bg-indigo-600]="kioskTicketStatusFilter === s.value"
              [class.text-white]="kioskTicketStatusFilter === s.value"
              [class.border-indigo-600]="kioskTicketStatusFilter === s.value"
              [class.text-gray-700]="kioskTicketStatusFilter !== s.value"
              [class.border-gray-300]="kioskTicketStatusFilter !== s.value"
              [class.hover:bg-gray-50]="kioskTicketStatusFilter !== s.value"
              (click)="setKioskTicketStatusFilter(s.value)"
            >
              {{ s.label }}
            </button>
            <button
              type="button"
              class="px-3 py-1 rounded-lg text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
              (click)="loadKioskTickets()"
              [disabled]="loadingKioskTickets"
            >
              Refresh
            </button>
          </div>
        </div>

        <ui-loading-spinner *ngIf="loadingKioskTickets"></ui-loading-spinner>

        <div
          *ngIf="!loadingKioskTickets && visibleKioskTickets.length === 0"
          class="text-sm text-gray-500"
        >
          No tickets in this view yet.
        </div>

        <div *ngIf="!loadingKioskTickets && visibleKioskTickets.length > 0" class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="text-xs uppercase text-gray-500 border-b border-gray-200">
              <tr>
                <th class="text-left py-2 pr-3">Subject</th>
                <th class="text-left py-2 pr-3">Type</th>
                <th class="text-left py-2 pr-3">Status</th>
                <th class="text-left py-2 pr-3">Evidence</th>
                <th class="text-left py-2 pr-3">Created</th>
                <th class="text-left py-2 pr-3">Resolved</th>
                <th class="text-right py-2"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let t of visibleKioskTickets" class="border-b border-gray-100 last:border-0">
                <td class="py-2 pr-3">
                  <div class="font-medium text-gray-900">{{ t.subjectName }}</div>
                  <div class="text-xs text-gray-500" *ngIf="t.subjectCode">{{ t.subjectCode }}</div>
                </td>
                <td class="py-2 pr-3 text-gray-700">
                  {{ t.subjectType === 'EMPLOYEE' ? 'Employee' : 'Contractor' }}
                </td>
                <td class="py-2 pr-3">
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    [ngClass]="kioskTicketStatusClass(t.status)"
                    >{{ kioskTicketStatusLabel(t.status) }}</span
                  >
                </td>
                <td class="py-2 pr-3 text-xs">
                  <div
                    *ngIf="t.notes"
                    class="max-w-xs rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900"
                  >
                    <div class="font-semibold">Review note</div>
                    <div class="whitespace-pre-line">{{ t.notes }}</div>
                  </div>
                  <a
                    *ngIf="t.photoUrl"
                    class="mt-1 inline-flex items-center gap-2 text-indigo-700 hover:underline"
                    [href]="t.photoUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      [src]="t.photoUrl"
                      alt="Captured face"
                      class="h-10 w-10 rounded border border-gray-200 object-cover"
                    />
                    <span>Inspect photo</span>
                  </a>
                  <div
                    *ngIf="t.matchScoreSelf"
                    class="mt-1 text-xs text-gray-500"
                  >
                    Score: {{ (t.matchScoreSelf! * 100).toFixed(1) }}%
                  </div>
                  <div
                    *ngIf="t.rejectionReason"
                    class="mt-1 max-w-xs rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-red-900"
                  >
                    <div class="font-semibold">Rejection reason</div>
                    <div class="whitespace-pre-line">{{ t.rejectionReason }}</div>
                  </div>
                  <span *ngIf="!t.notes && !t.photoUrl && !t.rejectionReason && !t.matchScoreSelf" class="text-gray-400"
                    >-</span
                  >
                </td>
                <td class="py-2 pr-3 text-xs text-gray-700">{{ t.createdAt | date: 'medium' }}</td>
                <td class="py-2 pr-3 text-xs text-gray-700">
                  <span *ngIf="t.completedAt">{{ t.completedAt | date: 'medium' }}</span>
                  <span *ngIf="!t.completedAt && t.reviewedAt">{{
                    t.reviewedAt | date: 'medium'
                  }}</span>
                  <span *ngIf="!t.completedAt && !t.reviewedAt && t.capturedAt">{{
                    t.capturedAt | date: 'medium'
                  }}</span>
                  <span *ngIf="!t.completedAt && t.cancelledAt">{{
                    t.cancelledAt | date: 'medium'
                  }}</span>
                  <span
                    *ngIf="!t.completedAt && !t.cancelledAt && t.status === 'PENDING'"
                    class="text-gray-400"
                    >expires {{ t.expiresAt | date: 'shortTime' }}</span
                  >
                  <span
                    *ngIf="!t.completedAt && !t.cancelledAt && t.status === 'EXPIRED'"
                    class="text-gray-400"
                    >expired {{ t.expiresAt | date: 'medium' }}</span
                  >
                </td>
                <td class="py-2 text-right whitespace-nowrap">
                  <span
                    *ngIf="t.status === 'REVIEW_PENDING'"
                    class="text-xs text-gray-500"
                    title="This is an old manual-review ticket state. Create a fresh kiosk ticket to enroll."
                    >Create fresh ticket</span
                  >
                  <button
                    type="button"
                    *ngIf="t.status === 'PENDING'"
                    class="text-xs text-red-700 hover:underline"
                    (click)="cancelKioskTicketFromList(t)"
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Kiosk-supervised enrollment modal -->
      <div
        *ngIf="kioskModalOpen"
        class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        (click)="closeKioskModal()"
      >
        <div
          class="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
          (click)="$event.stopPropagation()"
        >
          <h3 class="text-lg font-semibold text-gray-900 mb-1">Enroll on Kiosk</h3>
          <p class="text-xs text-gray-500 mb-3">
            Capturing for <strong class="text-gray-800">{{ kioskSubjectName }}</strong>
            <span *ngIf="kioskSubjectCode" class="font-mono">({{ kioskSubjectCode }})</span>
          </p>

          <ng-container *ngIf="!kioskActiveTicket">
            <div class="mb-3">
              <label class="block text-xs font-medium text-gray-600 mb-1" for="kiosk-device-sel"
                >Kiosk device</label
              >
              <select
                id="kiosk-device-sel"
                [(ngModel)]="kioskSelectedDeviceId"
                name="kioskDeviceId"
                class="ui-input"
              >
                <option value="">— Select a kiosk —</option>
                <option *ngFor="let d of kioskDevicesForSubject" [value]="d.id">
                  {{ d.deviceLabel || 'Device ' + d.id.slice(0, 8) }}
                </option>
              </select>
              <p
                *ngIf="!loadingKioskDevices && kioskDevicesForSubject.length === 0"
                class="text-xs text-amber-700 mt-1"
              >
                No active KIOSK device is registered in this subject's branch.
              </p>
              <div *ngIf="loadingKioskDevices" class="py-2">
                <ui-loading-spinner></ui-loading-spinner>
              </div>
            </div>
            <div class="flex items-start gap-2 mb-4">
              <input
                id="kiosk-consent"
                type="checkbox"
                [(ngModel)]="kioskConsentGiven"
                name="kioskConsent"
                class="mt-0.5"
              />
              <label for="kiosk-consent" class="text-xs text-gray-700">
                I confirm the subject has given explicit informed consent for face capture at the
                kiosk (DPDP Act 2023).
              </label>
            </div>
            <div *ngIf="kioskError" class="text-sm text-red-600 mb-3">{{ kioskError }}</div>
            <div class="flex justify-end gap-2">
              <ui-button variant="secondary" (clicked)="closeKioskModal()">Cancel</ui-button>
              <ui-button
                variant="primary"
                [disabled]="!kioskSelectedDeviceId || !kioskConsentGiven || kioskCreating"
                [loading]="kioskCreating"
                (clicked)="startKioskEnrollment()"
                >Send to Kiosk</ui-button
              >
            </div>
          </ng-container>

          <ng-container *ngIf="kioskActiveTicket">
            <div
              class="rounded-lg border p-3 mb-3"
              [class.bg-amber-50]="kioskActiveTicket.status === 'PENDING'"
              [class.bg-blue-50]="kioskActiveTicket.status === 'REVIEW_PENDING'"
              [class.bg-emerald-50]="kioskActiveTicket.status === 'COMPLETED'"
              [class.bg-red-50]="kioskActiveTicket.status === 'REJECTED'"
              [class.bg-gray-100]="
                kioskActiveTicket.status === 'CANCELLED' || kioskActiveTicket.status === 'EXPIRED'
              "
            >
              <div
                class="text-sm font-semibold"
                [class.text-amber-800]="kioskActiveTicket.status === 'PENDING'"
                [class.text-blue-800]="kioskActiveTicket.status === 'REVIEW_PENDING'"
                [class.text-emerald-800]="kioskActiveTicket.status === 'COMPLETED'"
                [class.text-red-800]="kioskActiveTicket.status === 'REJECTED'"
                [class.text-gray-700]="
                  kioskActiveTicket.status === 'CANCELLED' || kioskActiveTicket.status === 'EXPIRED'
                "
              >
                <span *ngIf="!isKnownKioskTicketStatus(kioskActiveTicket.status)">{{
                  kioskActiveTicketMessage(kioskActiveTicket.status)
                }}</span>
                <span *ngIf="kioskActiveTicket.status === 'PENDING'"
                  >Waiting for kiosk capture…</span
                >
                <span *ngIf="kioskActiveTicket.status === 'REVIEW_PENDING'"
                  >Captured — approve from web to activate</span
                >
                <span *ngIf="kioskActiveTicket.status === 'COMPLETED'"
                  >✓ Face enrolled successfully</span
                >
                <span *ngIf="kioskActiveTicket.status === 'REJECTED'">Rejected</span>
                <span *ngIf="kioskActiveTicket.status === 'CANCELLED'">Cancelled</span>
                <span *ngIf="kioskActiveTicket.status === 'EXPIRED'"
                  >Ticket expired — try again</span
                >
              </div>
              <div
                *ngIf="kioskActiveTicket.status === 'PENDING'"
                class="text-xs text-amber-700 mt-1"
              >
                Expires in {{ kioskCountdownLabel }}. Tell the subject to stand in front of the
                selected kiosk.
              </div>
              <div
                *ngIf="!isKnownKioskTicketStatus(kioskActiveTicket.status)"
                class="text-xs text-gray-600 mt-1"
              >
                Refreshing ticket status. Close this dialog and check the ticket list if it does not
                update.
              </div>
            </div>
            <div class="flex justify-end gap-2">
              <ui-button
                *ngIf="kioskActiveTicket.status === 'PENDING'"
                variant="secondary"
                (clicked)="cancelKioskEnrollment()"
                [loading]="kioskCancelling"
                >Cancel Ticket</ui-button
              >
              <ui-button variant="primary" (clicked)="closeKioskModal()">Close</ui-button>
            </div>
          </ng-container>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .ui-input {
        display: block;
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 0.5rem;
        font-size: 0.875rem;
        background: #fff;
      }
      .ui-input:focus {
        outline: none;
        border-color: #4f46e5;
        box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.15);
      }
    `,
  ],
})
export class BranchFaceEnrollmentComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private readonly liveRefreshMs = 5000;

  subjectType: SubjectType = 'employee';

  employees: Employee[] = [];
  contractors: ContractorEmployee[] = [];
  loadingEmployees = false;
  loadingContractors = false;

  enrollForm: EnrollForm = this.emptyForm();
  enrolling = false;
  enrollError = '';

  // Live camera capture
  @ViewChild('cameraVideo') cameraVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('cameraCanvas') cameraCanvas?: ElementRef<HTMLCanvasElement>;
  cameraActive = false;
  cameraError = '';
  private cameraStream: MediaStream | null = null;

  // Status table
  enrollmentRows: EnrollmentStatusRow[] = [];
  contractorEnrollmentRows: ContractorEnrollmentStatusRow[] = [];
  loadingEnrollments = false;
  statusFilter: 'all' | 'pending' | 'enrolled' | 'deactivated' = 'all';
  statusSearch = '';

  // Kiosk-supervised enrollment modal state
  kioskModalOpen = false;
  kioskSubjectType: 'EMPLOYEE' | 'CONTRACTOR' = 'EMPLOYEE';
  kioskSubjectId = '';
  kioskSubjectName = '';
  kioskSubjectCode: string | null = null;
  kioskSubjectBranchId: string | null = null;
  kioskDevices: MobileAttendanceDevice[] = [];
  loadingKioskDevices = false;
  kioskSelectedDeviceId = '';
  kioskConsentGiven = false;
  kioskCreating = false;
  kioskCancelling = false;
  kioskError = '';
  kioskActiveTicket: KioskEnrollTicket | null = null;
  kioskCountdownLabel = '5:00';
  private kioskPollTimer: any = null;
  private kioskPollErrorCount = 0;
  private kioskCountdownTimer: any = null;

  // Kiosk ticket history panel
  kioskTickets: KioskEnrollTicket[] = [];
  loadingKioskTickets = false;
  private kioskTicketPollTimer: any = null;
  // Auto-refresh interval while at least one PENDING ticket is in view.
  static readonly KIOSK_TICKET_POLL_MS = 30_000;
  kioskTicketStatusFilter: '' | KioskEnrollTicketStatus = '';
  readonly kioskTicketStatusFilters: ReadonlyArray<{
    label: string;
    value: '' | KioskEnrollTicketStatus;
  }> = [
    { label: 'All', value: '' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Review', value: 'REVIEW_PENDING' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Rejected', value: 'REJECTED' },
    { label: 'Cancelled', value: 'CANCELLED' },
    { label: 'Expired', value: 'EXPIRED' },
  ];

  constructor(
    private auth: AuthService,
    private empSvc: ClientEmployeesService,
    private contractorEmpSvc: ContractorEmployeesApiService,
    private svc: ClientMobileAttendanceService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private dialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.selectInitialSubjectType();
    this.loadSubjects();
    this.loadEnrollments();
    this.loadKioskTickets();
    this.startLiveRefresh();
  }

  ngOnDestroy(): void {
    this.stopCamera();
    this.stopKioskTimers();
    this.stopKioskTicketPoll();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get photoKB(): number {
    if (!this.enrollForm.photoBase64) return 0;
    // base64 length * 3/4 â‰ˆ raw bytes
    return Math.round((this.enrollForm.photoBase64.length * 3) / 4 / 1024);
  }

  get canEnroll(): boolean {
    return (
      !!this.enrollForm.subjectId &&
      !!this.enrollForm.photoBase64 &&
      this.enrollForm.consentGiven &&
      !this.enrolling
    );
  }

  get subjectCount(): number {
    return this.subjectType === 'contractor' ? this.contractors.length : this.employees.length;
  }

  get loadingSubjects(): boolean {
    return this.subjectType === 'contractor' ? this.loadingContractors : this.loadingEmployees;
  }

  get canViewEmployeeFaceEnrollment(): boolean {
    return this.auth.hasModule('MOBILE_ATTENDANCE');
  }

  get canViewContractorFaceEnrollment(): boolean {
    return this.auth.hasModule('CONTRACTOR_FACE_ATTENDANCE');
  }

  get canUseManualEmployeeEnrollment(): boolean {
    return this.auth.hasModule('EMPLOYEE_COMPLIANCE');
  }

  get canUseManualContractorEnrollment(): boolean {
    return this.auth.hasAnyModule(['CONTRACTOR_AUDIT', 'CONTRACTOR_DOCUMENTS']);
  }

  get canUseKioskEnrollment(): boolean {
    return this.subjectType === 'employee'
      ? this.canViewEmployeeFaceEnrollment
      : this.canViewContractorFaceEnrollment;
  }

  get visibleKioskTickets(): KioskEnrollTicket[] {
    return this.kioskTickets.filter((t) =>
      t.subjectType === 'EMPLOYEE'
        ? this.canViewEmployeeFaceEnrollment
        : this.canViewContractorFaceEnrollment,
    );
  }

  switchSubjectType(t: SubjectType): void {
    if (this.subjectType === t) return;
    if (t === 'employee' && !this.canViewEmployeeFaceEnrollment) return;
    if (t === 'contractor' && !this.canViewContractorFaceEnrollment) return;
    this.subjectType = t;
    this.enrollForm = this.emptyForm();
    this.enrollError = '';
    this.statusSearch = '';
    this.statusFilter = 'all';
    this.stopCamera();
    this.cdr.markForCheck();
  }

  private loadSubjects(): void {
    if (this.canUseManualEmployeeEnrollment) this.loadEmployees();
    if (this.canUseManualContractorEnrollment) this.loadContractors();
  }

  private selectInitialSubjectType(): void {
    if (this.canViewEmployeeFaceEnrollment) {
      this.subjectType = 'employee';
    } else if (this.canViewContractorFaceEnrollment) {
      this.subjectType = 'contractor';
    }
    this.enrollForm = this.emptyForm();
  }

  private loadEmployees(): void {
    const branchId = this.auth.getBranchIds()?.[0];
    if (!branchId) {
      this.toast.error('No branch is assigned to your account');
      return;
    }
    this.loadingEmployees = true;
    this.empSvc
      .list({ branchId, isActive: 'true', limit: 1000 })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingEmployees = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (r) => {
          this.employees = r?.data ?? [];
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.toast.error(e?.error?.message || 'Failed to load employees');
        },
      });
  }

  private loadContractors(): void {
    const branchId = this.auth.getBranchIds()?.[0];
    if (!branchId) {
      // Already surfaced via loadEmployees(); avoid duplicate toast.
      return;
    }
    this.loadingContractors = true;
    // Use the CLIENT-portal endpoint; the contractor-portal `list()` is
    // @Roles('CONTRACTOR') and 403s for branch (CLIENT-role) users.
    this.contractorEmpSvc
      .listForBranch({ branchId, isActive: true })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingContractors = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (r) => {
          this.contractors = r?.data ?? [];
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.toast.error(e?.error?.message || 'Failed to load contractor employees');
        },
      });
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
      this.cameraError = 'Camera blocked: this page must be loaded over HTTPS to use the camera.';
      this.toast.error(this.cameraError);
      this.cdr.detectChanges();
      return;
    }
    if (!navigator?.mediaDevices?.getUserMedia) {
      this.cameraError =
        'Camera API not available in this browser. Try Chrome / Edge / Safari and allow camera access.';
      this.toast.error(this.cameraError);
      this.cdr.detectChanges();
      return;
    }
    // Show the <video> element BEFORE requesting the stream so it is in the
    // DOM and visible by the time we assign srcObject. This avoids a race
    // where setTimeout(0) attached the stream to a still-hidden element and
    // play() rejected silently on some Android Chrome versions.
    this.cameraActive = true;
    this.cdr.detectChanges();
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
        const VIRTUAL =
          /(phone link|phone\s*\(|droidcam|obs|snap camera|virtual|xsplit|ndi|manycam)/i;
        const real = cams.find((c) => c.label && !VIRTUAL.test(c.label));
        if (real?.deviceId) {
          chosenLabel = real.label;
          constraints = {
            video: {
              deviceId: { exact: real.deviceId },
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
            audio: false,
          };
        }
      } catch {
        /* enumerateDevices is best-effort */
      }
      // Race getUserMedia against an 8s timeout. Some virtual cameras
      // (notably Windows Phone Link in 'connecting' state) leave the
      // promise pending forever instead of rejecting.
      let timedOut = false;
      const gumPromise = navigator.mediaDevices.getUserMedia(constraints);
      gumPromise
        .then((s) => {
          if (timedOut) s.getTracks().forEach((t) => t.stop());
        })
        .catch(() => {});
      const stream = await Promise.race<MediaStream>([
        gumPromise,
        new Promise<MediaStream>((_, rej) =>
          setTimeout(() => {
            timedOut = true;
            rej(
              new Error(
                `Camera open timed out (8s)${chosenLabel ? ` on "${chosenLabel}"` : ''}. ` +
                  'A virtual camera (Windows Phone Link "Use as connected camera", DroidCam, OBS, Snap Camera) is most likely holding it. ' +
                  'Disable it in Windows Settings → Bluetooth & devices → Cameras, or close the app, then retry.',
              ),
            );
          }, 8000),
        ),
      ]);
      this.cameraStream = stream;
      const v = this.cameraVideo?.nativeElement;
      if (!v) {
        stream.getTracks().forEach((t) => t.stop());
        this.cameraStream = null;
        this.cameraActive = false;
        this.cameraError = 'Camera element not ready — please retry.';
        this.toast.error(this.cameraError);
        this.cdr.detectChanges();
        return;
      }
      v.srcObject = stream;
      v.muted = true;
      v.setAttribute('playsinline', 'true');
      // Kick off play(), with a one-frame retry if the browser rejects
      // the first call (some Android Chrome builds need a tick after
      // srcObject is assigned before play() is allowed).
      v.play().catch(() => {
        requestAnimationFrame(() => {
          v.play().catch(() => {
            /* ignore */
          });
        });
      });
      // Wait for the first real video frame. If none arrives in 6s the
      // camera is almost certainly held by another app (Windows Phone
      // Link, Teams, Zoom, OBS virtual cam, etc.) — surface that clearly
      // so the user knows what to close.
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
            done = true;
            cleanup();
            resolve();
          }
        };
        v.addEventListener('loadedmetadata', check);
        v.addEventListener('playing', check);
        v.addEventListener('canplay', check);
        // Kick once in case the event already fired before listeners attached.
        check();
        setTimeout(() => {
          if (done) return;
          done = true;
          cleanup();
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            resolve();
          } else {
            const label = stream.getVideoTracks()[0]?.label || 'unknown';
            reject(
              new Error(
                `Camera "${label}" was opened but is not sending frames. Another app (e.g. Windows Phone Link "use phone as webcam", Teams, Zoom, OBS) is most likely holding it. Close that app and click Start again.`,
              ),
            );
          }
        }, 6000);
      });
      this.cdr.detectChanges();
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
      this.cdr.detectChanges();
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
    this.cdr.markForCheck();
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
    if (!ctx) {
      this.toast.error('Canvas not supported');
      return;
    }
    ctx.drawImage(v, 0, 0, w, h);
    const dataUrl = c.toDataURL('image/jpeg', 0.9);
    const comma = dataUrl.indexOf(',');
    const base64 = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
    this.enrollForm.photoBase64 = base64;
    this.enrollForm.photoMime = 'image/jpeg';
    this.enrollForm.photoFileName = `camera-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
    this.toast.success('Photo captured — ready to enroll');
    this.stopCamera();
  }

  submitEnroll(): void {
    this.enrollError = '';
    if (!this.canEnroll) {
      this.enrollError = 'Select a subject, capture a photo from the live camera, and tick consent';
      return;
    }
    this.enrolling = true;
    const done = () => {
      this.enrolling = false;
      this.cdr.markForCheck();
    };
    if (this.subjectType === 'contractor') {
      const body: EnrollContractorFaceBody = {
        contractorEmployeeId: this.enrollForm.subjectId,
        consentGiven: true,
        photoBase64: this.enrollForm.photoBase64,
        photoMime: this.enrollForm.photoMime,
      };
      this.svc
        .enrollContractorFace(body)
        .pipe(takeUntil(this.destroy$), finalize(done))
        .subscribe({
          next: () => {
            this.toast.success('Contractor face enrolled');
            this.resetEnroll();
            this.loadEnrollments();
          },
          error: (e) => {
            this.enrollError = e?.error?.message || 'Enrollment failed';
            this.clearCapturedPhoto();
            this.cdr.markForCheck();
          },
        });
      return;
    }
    const body: EnrollFaceBody = {
      employeeId: this.enrollForm.subjectId,
      consentGiven: true,
      photoBase64: this.enrollForm.photoBase64,
      photoMime: this.enrollForm.photoMime,
    };
    this.svc
      .enrollFace(body)
      .pipe(takeUntil(this.destroy$), finalize(done))
      .subscribe({
        next: () => {
          this.toast.success('Face enrolled');
          this.resetEnroll();
          this.loadEnrollments();
        },
        error: (e) => {
          this.enrollError = e?.error?.message || 'Enrollment failed';
          this.clearCapturedPhoto();
          this.cdr.markForCheck();
        },
      });
  }

  /** Clears any captured/uploaded photo and stops the camera. Keeps subject + consent. */
  clearCapturedPhoto(): void {
    this.enrollForm.photoBase64 = '';
    this.enrollForm.photoMime = '';
    this.enrollForm.photoFileName = '';
    this.stopCamera();
  }

  /** Called when the operator picks a different subject. Drops any stale photo. */
  onEnrollSubjectChange(): void {
    this.clearCapturedPhoto();
    this.enrollError = '';
    this.cdr.markForCheck();
  }

  resetEnroll(): void {
    this.enrollForm = this.emptyForm();
    this.enrollError = '';
    this.stopCamera();
    this.cdr.markForCheck();
  }

  // ── Enrollment status ────────────────────────────────────
  loadEnrollments(silent = false): void {
    if (this.loadingEnrollments) return;
    if (!silent) this.loadingEnrollments = true;
    const done = () => {
      if (!silent) this.loadingEnrollments = false;
      this.cdr.markForCheck();
    };
    if (this.subjectType === 'contractor') {
      if (!this.canViewContractorFaceEnrollment) {
        this.contractorEnrollmentRows = [];
        done();
        return;
      }
      this.svc
        .listContractorEnrollments()
        .pipe(takeUntil(this.destroy$), finalize(done))
        .subscribe({
          next: (rows) => {
            this.contractorEnrollmentRows = rows || [];
            this.cdr.markForCheck();
          },
          error: (e) => {
            if (!silent)
              this.toast.error(e?.error?.message || 'Failed to load contractor enrollments');
          },
        });
      return;
    }
    if (!this.canViewEmployeeFaceEnrollment) {
      this.enrollmentRows = [];
      done();
      return;
    }
    this.svc
      .listEnrollments()
      .pipe(takeUntil(this.destroy$), finalize(done))
      .subscribe({
        next: (rows) => {
          this.enrollmentRows = rows || [];
          this.cdr.markForCheck();
        },
        error: (e) => {
          if (!silent) this.toast.error(e?.error?.message || 'Failed to load enrollments');
        },
      });
  }

  /** Currently-visible enrollment rows for the active subject tab. */
  get activeRows(): Array<EnrollmentStatusRow | ContractorEnrollmentStatusRow> {
    return this.subjectType === 'contractor' ? this.contractorEnrollmentRows : this.enrollmentRows;
  }

  get activeFilteredRows(): Array<EnrollmentStatusRow | ContractorEnrollmentStatusRow> {
    return this.subjectType === 'contractor'
      ? this.filteredContractorEnrollments
      : this.filteredEnrollments;
  }

  get enrolledCount(): number {
    return this.activeRows.filter((r) => r.isEnrolled && r.isActive).length;
  }

  get pendingCount(): number {
    return this.activeRows.filter((r) => !r.isEnrolled).length;
  }

  private matchesFilter(r: { isEnrolled: boolean; isActive: boolean }): boolean {
    if (this.statusFilter === 'pending' && r.isEnrolled) return false;
    if (this.statusFilter === 'enrolled' && !(r.isEnrolled && r.isActive)) return false;
    if (this.statusFilter === 'deactivated' && !(r.isEnrolled && !r.isActive)) return false;
    return true;
  }

  get filteredEnrollments(): EnrollmentStatusRow[] {
    const q = this.statusSearch.trim().toLowerCase();
    return this.enrollmentRows.filter((r) => {
      if (!this.matchesFilter(r)) return false;
      if (
        q &&
        !(r.employeeCode.toLowerCase().includes(q) || r.employeeName.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }

  get filteredContractorEnrollments(): ContractorEnrollmentStatusRow[] {
    const q = this.statusSearch.trim().toLowerCase();
    return this.contractorEnrollmentRows.filter((r) => {
      if (!this.matchesFilter(r)) return false;
      if (q && !(r.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  selectForEnroll(r: EnrollmentStatusRow): void {
    this.subjectType = 'employee';
    this.enrollForm.subjectType = 'employee';
    this.enrollForm.subjectId = r.employeeId;
    this.cdr.markForCheck();
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  selectContractorForEnroll(r: ContractorEnrollmentStatusRow): void {
    this.subjectType = 'contractor';
    this.enrollForm.subjectType = 'contractor';
    this.enrollForm.subjectId = r.contractorEmployeeId;
    this.cdr.markForCheck();
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async deactivate(r: EnrollmentStatusRow): Promise<void> {
    const result = await this.dialog.prompt(
      'Deactivate Enrollment',
      `Deactivate face enrollment for ${r.employeeName}?`,
      {
        defaultValue: 'Employee request',
        placeholder: 'Reason required for DPDP audit',
        confirmText: 'Deactivate',
      },
    );
    const reason = result.value?.trim();
    if (!result.confirmed || !reason) return;
    this.svc
      .deactivateEnrollment(r.employeeId, reason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Enrollment deactivated');
          this.loadEnrollments();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Deactivation failed'),
      });
  }

  async deactivateContractor(r: ContractorEnrollmentStatusRow): Promise<void> {
    const result = await this.dialog.prompt(
      'Deactivate Enrollment',
      `Deactivate face enrollment for ${r.name}?`,
      {
        defaultValue: 'Contractor request',
        placeholder: 'Reason required for DPDP audit',
        confirmText: 'Deactivate',
      },
    );
    const reason = result.value?.trim();
    if (!result.confirmed || !reason) return;
    this.svc
      .deactivateContractorEnrollment(r.contractorEmployeeId, reason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Enrollment deactivated');
          this.loadEnrollments();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Deactivation failed'),
      });
  }

  async hardDelete(r: EnrollmentStatusRow): Promise<void> {
    if (
      !(await this.dialog.confirm(
        'Delete Face Enrollment',
        `Permanently delete the face enrollment row for ${r.employeeName}?\n\nThis removes the stored face template so the employee can be enrolled again from scratch. The audit history is preserved.\n\nThis action cannot be undone.`,
        { variant: 'danger', confirmText: 'Delete' },
      ))
    )
      return;
    const result = await this.dialog.prompt('Delete Reason', 'Reason required for DPDP audit:', {
      defaultValue: 'Wrong enrollment - re-enrollment required',
      placeholder: 'Reason',
      confirmText: 'Delete',
    });
    const reason = result.value?.trim();
    if (!result.confirmed || !reason) return;
    this.svc
      .deleteEnrollment(r.employeeId, reason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Enrollment permanently deleted');
          this.loadEnrollments();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Delete failed'),
      });
  }

  async hardDeleteContractor(r: ContractorEnrollmentStatusRow): Promise<void> {
    if (
      !(await this.dialog.confirm(
        'Delete Contractor Enrollment',
        `Permanently delete the face enrollment row for ${r.name}?\n\nThis removes the stored face template so the contractor employee can be enrolled again from scratch. The audit history is preserved.\n\nThis action cannot be undone.`,
        { variant: 'danger', confirmText: 'Delete' },
      ))
    )
      return;
    const result = await this.dialog.prompt('Delete Reason', 'Reason required for DPDP audit:', {
      defaultValue: 'Wrong enrollment - re-enrollment required',
      placeholder: 'Reason',
      confirmText: 'Delete',
    });
    const reason = result.value?.trim();
    if (!result.confirmed || !reason) return;
    this.svc
      .deleteContractorEnrollment(r.contractorEmployeeId, reason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Enrollment permanently deleted');
          this.loadEnrollments();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Delete failed'),
      });
  }

  private emptyForm(): EnrollForm {
    return {
      subjectType: this.subjectType,
      subjectId: '',
      photoBase64: '',
      photoMime: '',
      photoFileName: '',
      consentGiven: false,
    };
  }

  // ── Kiosk-supervised enrollment ─────────────────────────
  openKioskEnrollForEmployee(r: EnrollmentStatusRow): void {
    this.openKioskModal({
      subjectType: 'EMPLOYEE',
      subjectId: r.employeeId,
      subjectName: r.employeeName,
      subjectCode: r.employeeCode,
      subjectBranchId: r.branchId ?? null,
    });
  }

  openKioskEnrollForContractor(r: ContractorEnrollmentStatusRow): void {
    this.openKioskModal({
      subjectType: 'CONTRACTOR',
      subjectId: r.contractorEmployeeId,
      subjectName: r.name,
      subjectCode: null,
      subjectBranchId: r.branchId ?? null,
    });
  }

  private openKioskModal(opts: {
    subjectType: 'EMPLOYEE' | 'CONTRACTOR';
    subjectId: string;
    subjectName: string;
    subjectCode: string | null;
    subjectBranchId: string | null;
  }): void {
    this.kioskSubjectType = opts.subjectType;
    this.kioskSubjectId = opts.subjectId;
    this.kioskSubjectName = opts.subjectName;
    this.kioskSubjectCode = opts.subjectCode;
    this.kioskSubjectBranchId = opts.subjectBranchId ?? this.auth.getBranchIds()?.[0] ?? null;
    this.kioskSelectedDeviceId = '';
    this.kioskConsentGiven = false;
    this.kioskError = '';
    this.kioskActiveTicket = null;
    this.kioskPollErrorCount = 0;
    this.kioskModalOpen = true;
    this.loadKioskDevices();
    this.cdr.markForCheck();
  }

  closeKioskModal(): void {
    this.kioskModalOpen = false;
    this.stopKioskTimers();
    if (
      this.kioskActiveTicket?.status === 'COMPLETED' ||
      this.kioskActiveTicket?.status === 'REVIEW_PENDING'
    ) {
      this.loadEnrollments();
      this.loadKioskTickets();
    }
    this.kioskActiveTicket = null;
    this.cdr.markForCheck();
  }

  private loadKioskDevices(): void {
    this.loadingKioskDevices = true;
    this.svc
      .listDevices()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loadingKioskDevices = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.kioskDevices = rows ?? [];
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.kioskError = e?.error?.message || 'Failed to load kiosk devices';
        },
      });
  }

  get kioskDevicesForSubject(): MobileAttendanceDevice[] {
    const bid = this.kioskSubjectBranchId;
    return this.kioskDevices.filter(
      (d) => d.isActive && d.mode === 'KIOSK' && (!bid || !d.branchId || d.branchId === bid),
    );
  }

  startKioskEnrollment(): void {
    if (!this.kioskSelectedDeviceId || !this.kioskConsentGiven) return;
    this.kioskError = '';
    this.kioskCreating = true;
    const body: CreateKioskEnrollTicketBody = {
      deviceId: this.kioskSelectedDeviceId,
      subjectType: this.kioskSubjectType,
      subjectName: this.kioskSubjectName,
      subjectCode: this.kioskSubjectCode ?? undefined,
    };
    if (this.kioskSubjectType === 'EMPLOYEE') {
      body.employeeId = this.kioskSubjectId;
    } else {
      body.contractorEmployeeId = this.kioskSubjectId;
    }
    this.svc
      .createKioskEnrollTicket(body)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.kioskCreating = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (t) => {
          this.kioskActiveTicket = t;
          this.startKioskTimers();
          this.toast.success('Ticket sent to kiosk');
        },
        error: (e) => {
          this.kioskError = e?.error?.message || 'Failed to create ticket';
        },
      });
  }

  cancelKioskEnrollment(): void {
    if (!this.kioskActiveTicket) return;
    this.kioskCancelling = true;
    this.svc
      .cancelKioskEnrollTicket(this.kioskActiveTicket.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.kioskCancelling = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          if (this.kioskActiveTicket) {
            this.kioskActiveTicket = {
              ...this.kioskActiveTicket,
              status: 'CANCELLED',
            };
          }
          this.stopKioskTimers();
          this.toast.info('Ticket cancelled');
        },
        error: (e) => this.toast.error(e?.error?.message || 'Cancel failed'),
      });
  }

  private startKioskTimers(): void {
    this.stopKioskTimers();
    this.updateKioskCountdown();
    this.kioskCountdownTimer = setInterval(() => this.updateKioskCountdown(), 1000);
    this.kioskPollTimer = setInterval(() => this.pollKioskTicket(), 2000);
  }

  private stopKioskTimers(): void {
    if (this.kioskPollTimer) {
      clearInterval(this.kioskPollTimer);
      this.kioskPollTimer = null;
    }
    if (this.kioskCountdownTimer) {
      clearInterval(this.kioskCountdownTimer);
      this.kioskCountdownTimer = null;
    }
  }

  private updateKioskCountdown(): void {
    if (!this.kioskActiveTicket) return;
    const ms = new Date(this.kioskActiveTicket.expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      this.kioskCountdownLabel = '0:00';
      return;
    }
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    this.kioskCountdownLabel = `${m}:${s.toString().padStart(2, '0')}`;
    this.cdr.markForCheck();
  }

  private pollKioskTicket(): void {
    if (!this.kioskActiveTicket) return;
    this.svc
      .getKioskEnrollTicket(this.kioskActiveTicket.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (t) => {
          this.kioskPollErrorCount = 0;
          this.kioskActiveTicket = t;
          if (t.status !== 'PENDING') {
            this.stopKioskTimers();
            if (t.status === 'COMPLETED') {
              this.toast.success(`${t.subjectName} enrolled successfully`);
            } else if (t.status === 'REVIEW_PENDING') {
              this.toast.info(`${t.subjectName} captured, waiting for approval`);
            }
            this.loadKioskTickets();
          }
          this.cdr.markForCheck();
        },
        error: (e: unknown) => {
          const status = e instanceof HttpErrorResponse ? e.status : 0;
          if (status === 401 || status === 403) {
            this.stopKioskTimers();
            this.kioskError =
              status === 401
                ? 'Your login session expired. Please log in again and restart kiosk enrollment.'
                : 'You do not have access to this kiosk enrollment ticket.';
            this.toast.error(this.kioskError);
            this.cdr.markForCheck();
            return;
          }
          this.kioskPollErrorCount++;
          if (this.kioskPollErrorCount >= 8) {
            this.stopKioskTimers();
            this.kioskError = 'Lost connection while waiting. Close and retry.';
            this.cdr.markForCheck();
          }
        },
      });
  }

  // ── Kiosk ticket history panel ──
  setKioskTicketStatusFilter(s: '' | KioskEnrollTicketStatus): void {
    if (this.kioskTicketStatusFilter === s) return;
    this.kioskTicketStatusFilter = s;
    this.loadKioskTickets();
  }

  loadKioskTickets(silent = false): void {
    if (this.loadingKioskTickets) return;
    if (!silent) this.loadingKioskTickets = true;
    const status = this.kioskTicketStatusFilter || undefined;
    this.svc
      .listKioskEnrollTickets(status)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (!silent) this.loadingKioskTickets = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.kioskTickets = rows ?? [];
          this.syncKioskTicketPoll();
        },
        error: (e) => {
          if (!silent) {
            this.toast.error(e?.error?.message || 'Failed to load kiosk tickets');
          }
        },
      });
  }

  private syncKioskTicketPoll(): void {
    const hasPending = this.kioskTickets.some(
      (t) => t.status === 'PENDING' || t.status === 'REVIEW_PENDING',
    );
    if (hasPending && !this.kioskTicketPollTimer) {
      this.kioskTicketPollTimer = setInterval(() => {
        // Serialize: if a previous poll is still in flight (slow network /
        // backend), skip this tick so we don't issue concurrent requests
        // and risk processing responses out of order.
        if (this.loadingKioskTickets) return;
        this.loadKioskTickets(true);
      }, BranchFaceEnrollmentComponent.KIOSK_TICKET_POLL_MS);
    } else if (!hasPending && this.kioskTicketPollTimer) {
      this.stopKioskTicketPoll();
    }
  }

  private stopKioskTicketPoll(): void {
    if (this.kioskTicketPollTimer) {
      clearInterval(this.kioskTicketPollTimer);
      this.kioskTicketPollTimer = null;
    }
  }

  private startLiveRefresh(): void {
    merge(interval(this.liveRefreshMs), fromEvent(window, 'focus'))
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.shouldLiveRefresh()) {
          this.loadEnrollments(true);
          this.loadKioskTickets(true);
        }
      });
  }

  private shouldLiveRefresh(): boolean {
    return (
      !this.cameraActive &&
      !this.enrolling &&
      !this.kioskCreating &&
      !this.kioskCancelling &&
      !this.kioskModalOpen
    );
  }

  kioskTicketStatusClass(s: KioskEnrollTicketStatus): string {
    switch (s) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'REVIEW_PENDING':
        return 'bg-blue-100 text-blue-800';
      case 'PENDING':
        return 'bg-amber-100 text-amber-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-700';
      case 'EXPIRED':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  }

  kioskTicketStatusLabel(s: KioskEnrollTicketStatus): string {
    return s === 'REVIEW_PENDING' ? 'REVIEW' : s;
  }

  isKnownKioskTicketStatus(
    s: KioskEnrollTicketStatus | string | null | undefined,
  ): s is KioskEnrollTicketStatus {
    return (
      s === 'PENDING' ||
      s === 'REVIEW_PENDING' ||
      s === 'COMPLETED' ||
      s === 'REJECTED' ||
      s === 'CANCELLED' ||
      s === 'EXPIRED'
    );
  }

  kioskActiveTicketMessage(s: KioskEnrollTicketStatus | string | null | undefined): string {
    if (!s) return 'Ticket created. Waiting for kiosk status...';
    if (this.isKnownKioskTicketStatus(s)) {
      return this.kioskTicketStatusLabel(s);
    }
    return `Ticket status: ${String(s).replace(/_/g, ' ')}`;
  }

  cancelKioskTicketFromList(t: KioskEnrollTicket): void {
    if (t.status !== 'PENDING') return;
    this.svc
      .cancelKioskEnrollTicket(t.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.info('Ticket cancelled');
          this.loadKioskTickets();
        },
        error: (e) => this.toast.error(e?.error?.message || 'Cancel failed'),
      });
  }
}

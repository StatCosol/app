import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
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
  EnrollmentStatusRow,
  MobileAttendanceDevice,
  MobileDeviceMode,
  RegisterMobileDeviceBody,
} from './client-mobile-attendance.service';

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
                  <button *ngIf="r.isEnrolled && r.isActive" class="text-xs text-red-600 hover:underline"
                    (click)="deactivate(r)">Deactivate</button>
                  <span *ngIf="r.isEnrolled && !r.isActive" class="text-xs text-gray-400">—</span>
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
              <select id="enroll-emp" name="employeeId" [(ngModel)]="enrollForm.employeeId" class="ui-input">
                <option value="">— Select employee —</option>
                <option *ngFor="let e of employees" [value]="e.id">{{ e.employeeCode }} · {{ e.name }}</option>
              </select>
            </div>
            <div>
              <label for="enroll-photo" class="block text-xs font-medium text-gray-600 mb-1">Reference Photo (clear, well-lit, front-facing)</label>
              <input id="enroll-photo" name="photo" type="file" accept="image/jpeg,image/png" (change)="onPhotoChosen($event)" class="ui-input">
              <p *ngIf="enrollForm.photoFileName" class="text-xs text-gray-500 mt-1">{{ enrollForm.photoFileName }} ({{ photoKB }} KB)</p>
            </div>
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
          <select id="dev-mode" name="mode" [(ngModel)]="form.mode" class="ui-input">
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
              <label for="dev-lat" class="block text-xs font-medium text-gray-600 mb-1">Geofence Lat</label>
              <input autocomplete="off" id="dev-lat" name="geofenceLat" type="number" step="0.0000001" class="ui-input" [(ngModel)]="form.geofenceLat">
            </div>
            <div>
              <label for="dev-lng" class="block text-xs font-medium text-gray-600 mb-1">Geofence Lng</label>
              <input autocomplete="off" id="dev-lng" name="geofenceLng" type="number" step="0.0000001" class="ui-input" [(ngModel)]="form.geofenceLng">
            </div>
            <div>
              <label for="dev-rad" class="block text-xs font-medium text-gray-600 mb-1">Radius (m)</label>
              <input autocomplete="off" id="dev-rad" name="geofenceRadiusM" type="number" step="1" class="ui-input" [(ngModel)]="form.geofenceRadiusM" placeholder="100">
            </div>
          </div>
        </div>
        <div *ngIf="formError" class="text-sm text-red-600">{{ formError }}</div>
        <div class="flex justify-end gap-2 pt-2">
          <ui-button variant="secondary" type="button" (clicked)="showModal = false">Cancel</ui-button>
          <ui-button variant="primary" type="submit" [loading]="saving">Register</ui-button>
        </div>
      </form>
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

  tab: 'devices' | 'enroll' | 'help' | 'status' = 'devices';

  // Devices
  devices: MobileAttendanceDevice[] = [];
  loadingDevices = false;
  showModal = false;
  saving = false;
  formError = '';
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

  // Enrollment status tab
  enrollmentRows: EnrollmentStatusRow[] = [];
  loadingEnrollments = false;
  statusFilter: 'all' | 'pending' | 'enrolled' | 'deactivated' = 'all';
  statusSearch = '';

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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  switchTab(t: 'devices' | 'enroll' | 'help' | 'status'): void {
    this.tab = t;
    if (t === 'status' && this.enrollmentRows.length === 0) {
      this.loadEnrollments();
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
    this.form = { mode: 'KIOSK', deviceLabel: '', branchId: '', geofenceLat: null, geofenceLng: null, geofenceRadiusM: 100, essEmployeeId: '' };
    this.showModal = true;
  }

  save(): void {
    this.formError = '';
    if (this.form.mode === 'ESS' && !this.form.essEmployeeId) {
      this.formError = 'ESS mode requires a bound employee';
      return;
    }
    if (this.form.mode === 'ESS' && (this.form.geofenceLat == null || this.form.geofenceLng == null)) {
      this.formError = 'ESS mode requires geofence latitude and longitude';
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
      this.bump();
    };
    reader.readAsDataURL(file);
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
        error: (e) => { this.enrollError = e?.error?.message || 'Enrollment failed'; this.bump(); },
      });
  }

  resetEnroll(): void {
    this.enrollForm = { employeeId: '', consentGiven: false, photoBase64: '', photoMime: '', photoFileName: '', photoSize: 0 };
    this.enrollError = '';
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
}

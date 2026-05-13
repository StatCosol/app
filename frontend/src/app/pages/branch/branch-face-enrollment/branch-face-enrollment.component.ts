import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import {
  ActionButtonComponent,
  EmptyStateComponent,
  LoadingSpinnerComponent,
  PageHeaderComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import { AuthService } from '../../../core/auth.service';
import { ClientEmployeesService, Employee } from '../../client/employees/client-employees.service';
import {
  ClientMobileAttendanceService,
  EnrollFaceBody,
} from '../../client/mobile-attendance/client-mobile-attendance.service';

interface EnrollForm {
  employeeId: string;
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
    EmptyStateComponent,
  ],
  template: `
    <ui-page-header
      title="Face Enrollment"
      subtitle="Register face biometrics for employees in your branch"
    ></ui-page-header>

    <div class="p-4 md:p-6 space-y-4">
      <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 class="font-semibold text-gray-900 mb-3">Enroll an Employee Face</h3>

        <div *ngIf="loadingEmployees" class="py-6 flex justify-center">
          <ui-loading-spinner></ui-loading-spinner>
        </div>

        <ng-container *ngIf="!loadingEmployees">
          <div *ngIf="!employees.length">
            <ui-empty-state
              title="No employees found"
              message="There are no active employees in your branch yet."
            ></ui-empty-state>
          </div>

          <ng-container *ngIf="employees.length">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="enroll-emp" class="block text-xs font-medium text-gray-600 mb-1">Employee</label>
                <select id="enroll-emp" name="employeeId" [(ngModel)]="enrollForm.employeeId" class="ui-input">
                  <option value="">— Select employee —</option>
                  <option *ngFor="let e of employees" [value]="e.id">{{ e.employeeCode }} · {{ e.name }}</option>
                </select>
              </div>
              <div>
                <label for="enroll-photo" class="block text-xs font-medium text-gray-600 mb-1">
                  Reference Photo (clear, well-lit, front-facing)
                </label>
                <input id="enroll-photo" name="photo" type="file" accept="image/jpeg,image/png"
                  (change)="onPhotoChosen($event)" class="ui-input">
                <p *ngIf="enrollForm.photoFileName" class="text-xs text-gray-500 mt-1">
                  {{ enrollForm.photoFileName }} ({{ photoKB }} KB)
                </p>
              </div>
            </div>

            <div class="mt-4 flex items-start gap-2">
              <input id="enroll-consent" type="checkbox" name="consentGiven"
                [(ngModel)]="enrollForm.consentGiven" class="mt-0.5">
              <label for="enroll-consent" class="text-sm text-gray-700">
                I confirm the employee has read the biometric data privacy notice and has given explicit
                informed consent for face enrollment under the DPDP Act 2023.
              </label>
            </div>

            <div *ngIf="enrollError" class="mt-3 text-sm text-red-600">{{ enrollError }}</div>

            <div class="mt-4 flex gap-2">
              <ui-button variant="primary" (clicked)="submitEnroll()" [loading]="enrolling" [disabled]="!canEnroll">
                Enroll Face
              </ui-button>
              <ui-button variant="secondary" (clicked)="resetEnroll()">Reset</ui-button>
            </div>

            <p class="mt-3 text-xs text-gray-500">
              The photo is processed on the server to compute a face embedding (MobileFaceNet, 192-d).
              Only the embedding is stored — the photo itself is not retained.
            </p>
          </ng-container>
        </ng-container>
      </div>
    </div>
  `,
})
export class BranchFaceEnrollmentComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  employees: Employee[] = [];
  loadingEmployees = false;

  enrollForm: EnrollForm = this.emptyForm();
  enrolling = false;
  enrollError = '';

  constructor(
    private auth: AuthService,
    private empSvc: ClientEmployeesService,
    private svc: ClientMobileAttendanceService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadEmployees();
  }

  ngOnDestroy(): void {
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
      !!this.enrollForm.employeeId &&
      !!this.enrollForm.photoBase64 &&
      this.enrollForm.consentGiven &&
      !this.enrolling
    );
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
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loadingEmployees = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (r) => { this.employees = r?.data ?? []; this.cdr.markForCheck(); },
        error: (e) => { this.toast.error(e?.error?.message || 'Failed to load employees'); },
      });
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
      this.enrollForm.photoBase64 = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
      this.enrollForm.photoMime = file.type || 'image/jpeg';
      this.enrollForm.photoFileName = file.name;
      this.cdr.markForCheck();
    };
    reader.onerror = () => this.toast.error('Failed to read photo');
    reader.readAsDataURL(file);
  }

  submitEnroll(): void {
    this.enrollError = '';
    if (!this.canEnroll) {
      this.enrollError = 'Select employee, attach photo, and tick consent';
      return;
    }
    const body: EnrollFaceBody = {
      employeeId: this.enrollForm.employeeId,
      consentGiven: true,
      photoBase64: this.enrollForm.photoBase64,
      photoMime: this.enrollForm.photoMime,
    };
    this.enrolling = true;
    this.svc
      .enrollFace(body)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.enrolling = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => { this.toast.success('Face enrolled'); this.resetEnroll(); },
        error: (e) => { this.enrollError = e?.error?.message || 'Enrollment failed'; this.cdr.markForCheck(); },
      });
  }

  resetEnroll(): void {
    this.enrollForm = this.emptyForm();
    this.enrollError = '';
    this.cdr.markForCheck();
  }

  private emptyForm(): EnrollForm {
    return {
      employeeId: '',
      photoBase64: '',
      photoMime: '',
      photoFileName: '',
      consentGiven: false,
    };
  }
}

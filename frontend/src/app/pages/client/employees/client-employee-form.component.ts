import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { ClientEmployeesService, Employee } from './client-employees.service';
import {
  PageHeaderComponent,
  Breadcrumb,
  ActionButtonComponent,
  FormInputComponent,
  FormSelectComponent,
  LoadingSpinnerComponent,
} from '../../../shared/ui';

@Component({
  selector: 'app-client-employee-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ActionButtonComponent,
    FormInputComponent,
    FormSelectComponent,
    LoadingSpinnerComponent,
  ],
  template: `
    <div class="page">
      <!-- Back Button -->
      <button (click)="goBack()"
        class="flex items-center gap-1 text-sm text-gray-500 hover:text-statco-blue mb-4 transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back to Employees
      </button>

      <ui-page-header
        [title]="isEdit ? 'Edit Employee' : 'New Employee Registration'"
        [subtitle]="isEdit ? ('Editing: ' + form.firstName + ' ' + (form.lastName || '') + ' (' + form.employeeCode + ')') : 'Fill in the details below to register a new employee'"
        [breadcrumbs]="breadcrumbs">
      </ui-page-header>

      <ui-loading-spinner *ngIf="loadingEmployee" text="Loading employee..." size="lg"></ui-loading-spinner>

      <!-- Error Banner -->
      <div *ngIf="loadError && !loadingEmployee"
           class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>{{ loadError }}</span>
        </div>
        <button (click)="goBack()" class="text-red-800 font-semibold hover:underline ml-4">Go Back</button>
      </div>

      <form *ngIf="!loadingEmployee && !loadError" (ngSubmit)="save()" class="form-sections">

        <!-- Section 1: Personal Information -->
        <div class="section-card">
          <div class="section-header">
            <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            <h3>Personal Information</h3>
          </div>
          <div class="section-grid">
            <ui-form-input label="First Name *" [(ngModel)]="form.firstName" name="firstName"
                           placeholder="Enter first name"></ui-form-input>
            <ui-form-input label="Last Name" [(ngModel)]="form.lastName" name="lastName"
                           placeholder="Enter last name"></ui-form-input>
            <ui-form-select label="Gender" [options]="genderOptions" [(ngModel)]="form.gender"
                            name="gender"></ui-form-select>
            <div class="form-field">
              <label class="form-label">Date of Birth</label>
              <input type="date" class="form-date-input" [(ngModel)]="form.dateOfBirth" name="dateOfBirth" />
            </div>
            <ui-form-input label="Father's / Husband's Name" [(ngModel)]="form.fatherName" name="fatherName"
                           placeholder="Enter father's name"></ui-form-input>
          </div>
        </div>

        <!-- Section 2: Contact Information -->
        <div class="section-card">
          <div class="section-header">
            <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
            <h3>Contact Information</h3>
          </div>
          <div class="section-grid">
            <ui-form-input label="Phone" type="tel" [(ngModel)]="form.phone" name="phone"
                           placeholder="e.g. 9876543210"></ui-form-input>
            <ui-form-input label="Email" type="email" [(ngModel)]="form.email" name="email"
                           placeholder="employee@example.com"></ui-form-input>
          </div>
        </div>

        <!-- Section 3: Identity Documents -->
        <div class="section-card">
          <div class="section-header">
            <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"/>
            </svg>
            <h3>Identity Documents</h3>
          </div>
          <div class="section-grid">
            <ui-form-input label="Aadhaar Number" [(ngModel)]="form.aadhaar" name="aadhaar"
                           placeholder="XXXX XXXX XXXX"></ui-form-input>
            <ui-form-input label="PAN" [(ngModel)]="form.pan" name="pan"
                           placeholder="ABCDE1234F"></ui-form-input>
            <ui-form-input label="UAN (Universal Account Number)" [(ngModel)]="form.uan" name="uan"
                           placeholder="PF UAN number"></ui-form-input>
            <ui-form-input label="ESIC Number" [(ngModel)]="form.esic" name="esic"
                           placeholder="ESI contribution number"></ui-form-input>
          </div>
        </div>

        <!-- Section 4: Employment Details -->
        <div class="section-card">
          <div class="section-header">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
            <h3>Employment Details</h3>
          </div>
          <div class="section-grid">
            <ui-form-input label="Designation" [(ngModel)]="form.designation" name="designation"
                           placeholder="e.g. Software Engineer"></ui-form-input>
            <ui-form-input label="Department" [(ngModel)]="form.department" name="department"
                           placeholder="e.g. Engineering"></ui-form-input>
            <div class="form-field">
              <label class="form-label">Date of Joining</label>
              <input type="date" class="form-date-input" [(ngModel)]="form.dateOfJoining" name="dateOfJoining" />
            </div>
            <ui-form-select label="State" [options]="stateOptions" [(ngModel)]="form.stateCode"
                            name="stateCode"></ui-form-select>
          </div>
        </div>

        <!-- Section 5: Bank Details -->
        <div class="section-card">
          <div class="section-header">
            <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
            </svg>
            <h3>Bank Details</h3>
          </div>
          <div class="section-grid">
            <ui-form-input label="Bank Name" [(ngModel)]="form.bankName" name="bankName"
                           placeholder="e.g. State Bank of India"></ui-form-input>
            <ui-form-input label="Account Number" [(ngModel)]="form.bankAccount" name="bankAccount"
                           placeholder="Bank account number"></ui-form-input>
            <ui-form-input label="IFSC Code" [(ngModel)]="form.ifsc" name="ifsc"
                           placeholder="e.g. SBIN0001234"></ui-form-input>
          </div>
        </div>

        <!-- Form Error -->
        <div *ngIf="formError"
             class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <svg class="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>{{ formError }}</span>
        </div>

        <!-- Success Message -->
        <div *ngIf="successMsg"
             class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <svg class="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          <span>{{ successMsg }}</span>
        </div>

        <!-- Action Bar -->
        <div class="action-bar">
          <ui-button variant="secondary" (clicked)="goBack()">Cancel</ui-button>
          <ui-button variant="primary" [disabled]="saving" [loading]="saving" (clicked)="save()">
            {{ isEdit ? 'Update Employee' : 'Register Employee' }}
          </ui-button>
        </div>
      </form>
    </div>
  `,
  styles: [
    `
      .page { max-width: 900px; margin: 0 auto; padding: 1.5rem 1rem; }
      .form-sections { display: flex; flex-direction: column; gap: 1.25rem; margin-top: 1.5rem; }
      .section-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 0.75rem;
        padding: 1.25rem 1.5rem;
        transition: box-shadow 0.2s;
      }
      .section-card:hover { box-shadow: 0 1px 3px 0 rgba(0,0,0,0.05); }
      .section-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid #f3f4f6;
      }
      .section-header h3 { font-size: 0.95rem; font-weight: 600; color: #111827; margin: 0; }
      .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.875rem; }
      .form-field { display: flex; flex-direction: column; gap: 0.25rem; }
      .form-label { font-size: 0.875rem; font-weight: 500; color: #374151; }
      .form-date-input {
        padding: 0.5rem 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 0.5rem;
        font-size: 0.875rem;
        color: #111827;
        background: white;
        transition: border-color 0.2s;
        height: 38px;
      }
      .form-date-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
      .action-bar {
        display: flex;
        gap: 0.75rem;
        justify-content: flex-end;
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
      }
      @media (max-width: 640px) {
        .section-grid { grid-template-columns: 1fr; }
        .page { padding: 1rem 0.5rem; }
      }
    `,
  ],
})
export class ClientEmployeeFormComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  isEdit = false;
  employeeId = '';
  loadingEmployee = false;
  loadError = '';
  saving = false;
  formError = '';
  successMsg = '';
  form: any = {};

  breadcrumbs: Breadcrumb[] = [
    { label: 'Employees', route: '/client/employees' },
    { label: 'New Registration' },
  ];

  genderOptions = [
    { label: 'Select gender', value: '' },
    { label: 'Male', value: 'Male' },
    { label: 'Female', value: 'Female' },
    { label: 'Other', value: 'Other' },
  ];

  stateOptions = [
    { label: 'Select state', value: '' },
    { label: 'Andhra Pradesh', value: 'AP' },
    { label: 'Arunachal Pradesh', value: 'AR' },
    { label: 'Assam', value: 'AS' },
    { label: 'Bihar', value: 'BR' },
    { label: 'Chhattisgarh', value: 'CG' },
    { label: 'Delhi', value: 'DL' },
    { label: 'Goa', value: 'GA' },
    { label: 'Gujarat', value: 'GJ' },
    { label: 'Haryana', value: 'HR' },
    { label: 'Himachal Pradesh', value: 'HP' },
    { label: 'Jharkhand', value: 'JH' },
    { label: 'Karnataka', value: 'KA' },
    { label: 'Kerala', value: 'KL' },
    { label: 'Madhya Pradesh', value: 'MP' },
    { label: 'Maharashtra', value: 'MH' },
    { label: 'Manipur', value: 'MN' },
    { label: 'Meghalaya', value: 'ML' },
    { label: 'Mizoram', value: 'MZ' },
    { label: 'Nagaland', value: 'NL' },
    { label: 'Odisha', value: 'OD' },
    { label: 'Punjab', value: 'PB' },
    { label: 'Rajasthan', value: 'RJ' },
    { label: 'Sikkim', value: 'SK' },
    { label: 'Tamil Nadu', value: 'TN' },
    { label: 'Telangana', value: 'TS' },
    { label: 'Tripura', value: 'TR' },
    { label: 'Uttar Pradesh', value: 'UP' },
    { label: 'Uttarakhand', value: 'UK' },
    { label: 'West Bengal', value: 'WB' },
    { label: 'Chandigarh', value: 'CH' },
    { label: 'Puducherry', value: 'PY' },
    { label: 'Jammu & Kashmir', value: 'JK' },
    { label: 'Ladakh', value: 'LA' },
  ];

  constructor(
    private svc: ClientEmployeesService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.employeeId = this.route.snapshot.paramMap.get('id') || '';
    if (this.employeeId) {
      this.isEdit = true;
      this.breadcrumbs = [
        { label: 'Employees', route: '/client/employees' },
        { label: 'Edit Employee' },
      ];
      this.loadEmployee();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadEmployee(): void {
    this.loadingEmployee = true;
    this.svc
      .getById(this.employeeId)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loadingEmployee = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (emp) => {
          this.loadingEmployee = false;
          this.form = { ...emp };
          this.breadcrumbs = [
            { label: 'Employees', route: '/client/employees' },
            { label: emp.firstName + ' ' + (emp.lastName || ''), route: '/client/employees/' + emp.id },
            { label: 'Edit' },
          ];
        },
        error: () => {
          this.loadingEmployee = false;
          this.loadError = 'Employee not found or access denied.';
        },
      });
  }

  save(): void {
    if (!this.form.firstName?.trim()) {
      this.formError = 'First name is required';
      return;
    }
    this.saving = true;
    this.formError = '';
    this.successMsg = '';

    const obs = this.isEdit
      ? this.svc.update(this.employeeId, this.form)
      : this.svc.create(this.form);

    obs.pipe(takeUntil(this.destroy$), finalize(() => { this.saving = false; this.cdr.detectChanges(); })).subscribe({
      next: (emp) => {
        this.saving = false;
        if (this.isEdit) {
          this.successMsg = 'Employee updated successfully';
          setTimeout(() => this.router.navigate(['/client/employees', this.employeeId]), 1000);
        } else {
          this.router.navigate(['/client/employees', emp.id]);
        }
      },
      error: (e) => {
        this.saving = false;
        this.formError = e?.error?.message || e?.message || 'Save failed. Please try again.';
      },
    });
  }

  goBack(): void {
    if (this.isEdit && this.employeeId) {
      this.router.navigate(['/client/employees', this.employeeId]);
    } else {
      this.router.navigate(['/client/employees']);
    }
  }
}

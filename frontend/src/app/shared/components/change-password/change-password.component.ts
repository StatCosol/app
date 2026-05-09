import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { ProfileApiService } from '../../../core/api/profile.api';
import { matchValidator, passwordStrength } from '../../validators/validators';
import { ValidationMessagesComponent } from '../../ui/validation-messages/validation-messages.component';

@Component({
  selector: 'ui-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ValidationMessagesComponent],
  template: `
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <h3 class="text-base font-semibold text-gray-800">Change Password</h3>
        <p class="text-sm text-gray-500 mt-0.5">Update your account password</p>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="p-5 space-y-4">
        <!-- Success -->
        <div *ngIf="success" class="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
          {{ success }}
        </div>

        <!-- Error -->
        <div *ngIf="error" class="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
          {{ error }}
        </div>

        <!-- Current Password -->
        <div>
          <label for="cp-current" class="block text-sm font-medium text-gray-700 mb-1.5">Current Password <span class="text-red-500">*</span></label>
          <div class="relative">
            <input
              id="cp-current"
              name="currentPassword"
              [type]="showCurrent ? 'text' : 'password'"
              formControlName="currentPassword"
              autocomplete="current-password"
              placeholder="Enter current password"
              class="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none transition"
            />
            <button type="button" (click)="showCurrent = !showCurrent"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg *ngIf="!showCurrent" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <svg *ngIf="showCurrent" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>
            </button>
          </div>
          <ui-validation-messages [control]="form.controls['currentPassword']"></ui-validation-messages>
        </div>

        <!-- New Password -->
        <div>
          <label for="cp-new" class="block text-sm font-medium text-gray-700 mb-1.5">New Password <span class="text-red-500">*</span></label>
          <div class="relative">
            <input
              id="cp-new"
              name="newPassword"
              [type]="showNew ? 'text' : 'password'"
              formControlName="newPassword"
              autocomplete="new-password"
              placeholder="Enter new password"
              class="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none transition"
            />
            <button type="button" (click)="showNew = !showNew"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg *ngIf="!showNew" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <svg *ngIf="showNew" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>
            </button>
          </div>
          <ui-validation-messages [control]="form.controls['newPassword']"></ui-validation-messages>
        </div>

        <!-- Confirm Password -->
        <div>
          <label for="cp-confirm" class="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password <span class="text-red-500">*</span></label>
          <div class="relative">
            <input
              id="cp-confirm"
              name="confirmPassword"
              [type]="showConfirm ? 'text' : 'password'"
              formControlName="confirmPassword"
              autocomplete="new-password"
              placeholder="Re-enter new password"
              class="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none transition"
            />
            <button type="button" (click)="showConfirm = !showConfirm"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg *ngIf="!showConfirm" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <svg *ngIf="showConfirm" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>
            </button>
          </div>
          <ui-validation-messages [control]="form.controls['confirmPassword']"></ui-validation-messages>
        </div>

        <button
          type="submit"
          [disabled]="saving || form.invalid"
          class="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-primary-600 text-white font-medium text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <span *ngIf="!saving">Update Password</span>
          <span *ngIf="saving" class="inline-flex items-center gap-2">
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Saving&hellip;
          </span>
        </button>
      </form>
    </div>
  `,
})
export class ChangePasswordComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  showCurrent = false;
  showNew = false;
  showConfirm = false;
  saving = false;
  success = '';
  error = '';

  form!: FormGroup;

  constructor(private fb: FormBuilder, private profileApi: ProfileApiService) {
    this.form = this.fb.nonNullable.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, passwordStrength()]],
      confirmPassword: ['', [Validators.required, matchValidator('newPassword')]],
    });
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving) return;

    this.saving = true;
    this.success = '';
    this.error = '';

    const { currentPassword, newPassword } = this.form.getRawValue();

    this.profileApi
      .changePassword(currentPassword, newPassword)
      .pipe(takeUntil(this.destroy$), finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.success = 'Password changed successfully';
          this.form.reset();
        },
        error: (e) => {
          this.error = e?.error?.message || 'Failed to change password';
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

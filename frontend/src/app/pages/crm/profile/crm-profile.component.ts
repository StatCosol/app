import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs/operators';
import { PageHeaderComponent, LoadingSpinnerComponent } from '../../../shared/ui';
import { ProfileApiService, UserProfile } from '../../../core/api/profile.api';

@Component({
  standalone: true,
  selector: 'app-crm-profile',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent],
  template: `
    <ui-page-header title="Profile" description="Manage your CRM profile"></ui-page-header>

    <ui-loading-spinner *ngIf="loading" text="Loading profile..."></ui-loading-spinner>

    <div *ngIf="error" class="alert alert-error mb-4">{{ error }}</div>
    <div *ngIf="success" class="alert alert-success mb-4">{{ success }}</div>

    <div *ngIf="!loading && profile" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card">
        <h3 class="card-title mb-4">Personal Information</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" class="input w-full" [(ngModel)]="profile.name" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" class="input w-full" [value]="profile.email" disabled />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" class="input w-full" [(ngModel)]="profile.phone" />
          </div>
          <button class="btn-primary" [disabled]="saving" (click)="saveProfile()">
            {{ saving ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title mb-4">Change Password</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input type="password" class="input w-full" [(ngModel)]="currentPassword" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input type="password" class="input w-full" [(ngModel)]="newPassword" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input type="password" class="input w-full" [(ngModel)]="confirmPassword" />
          </div>
          <button class="btn-primary" [disabled]="changingPassword" (click)="changePassword()">
            {{ changingPassword ? 'Changing...' : 'Change Password' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class CrmProfileComponent implements OnInit {
  profile: UserProfile | null = null;
  loading = false;
  saving = false;
  changingPassword = false;
  error: string | null = null;
  success: string | null = null;
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  constructor(private profileApi: ProfileApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    this.profileApi.getProfile().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => { this.profile = data; this.cdr.detectChanges(); },
      error: () => { this.error = 'Failed to load profile'; this.cdr.detectChanges(); },
    });
  }

  saveProfile(): void {
    if (!this.profile || this.saving) return;
    this.saving = true;
    this.error = null;
    this.success = null;
    this.profileApi.updateProfile({ name: this.profile.name, phone: this.profile.phone }).subscribe({
      next: (updated) => { this.profile = updated; this.saving = false; this.success = 'Profile updated'; this.cdr.detectChanges(); },
      error: () => { this.error = 'Failed to save profile'; this.saving = false; this.cdr.detectChanges(); },
    });
  }

  changePassword(): void {
    if (this.changingPassword) return;
    if (this.newPassword !== this.confirmPassword) { this.error = 'Passwords do not match'; return; }
    if (!this.currentPassword || !this.newPassword) { this.error = 'All password fields are required'; return; }
    this.changingPassword = true;
    this.error = null;
    this.success = null;
    this.profileApi.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.changingPassword = false;
        this.success = 'Password changed successfully';
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
        this.cdr.detectChanges();
      },
      error: () => { this.error = 'Failed to change password'; this.changingPassword = false; this.cdr.detectChanges(); },
    });
  }
}

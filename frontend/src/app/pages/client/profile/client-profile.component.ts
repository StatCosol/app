import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { PageHeaderComponent, LoadingSpinnerComponent, ActionButtonComponent } from '../../../shared/ui';
import { ProfileApiService, UserProfile } from '../../../core/api/profile.api';

@Component({
  standalone: true,
  selector: 'app-client-profile',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, ActionButtonComponent],
  template: `
    <div class="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="My Profile" description="Your account information" icon="user"></ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading profile..."></ui-loading-spinner>

      <div *ngIf="!loading && error" class="card text-center py-8">
        <p class="text-red-600">{{ error }}</p>
        <button class="btn-primary mt-4" (click)="loadProfile()">Retry</button>
      </div>

      <div *ngIf="!loading && !error && user" class="space-y-6">
        <!-- Profile Card -->
        <div class="card">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium text-gray-500 mb-1">Name</label>
              <div class="text-base text-gray-900">{{ user.name || '-' }}</div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-500 mb-1">Email</label>
              <div class="text-base text-gray-900">{{ user.email || '-' }}</div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-500 mb-1">Phone</label>
              <div class="text-base text-gray-900">{{ user.phone || '-' }}</div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-500 mb-1">Role</label>
              <div class="text-base text-gray-900">{{ user.role || '-' }}</div>
            </div>
          </div>
        </div>

        <!-- Edit Profile -->
        <div class="card">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Update Profile</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" [(ngModel)]="editName" class="w-full rounded-lg border-gray-300 focus:border-statco-blue-light focus:ring-statco-blue-light" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="text" [(ngModel)]="editPhone" class="w-full rounded-lg border-gray-300 focus:border-statco-blue-light focus:ring-statco-blue-light" />
            </div>
          </div>
          <ui-button variant="primary" size="md" (click)="saveProfile()" [disabled]="saving">
            {{ saving ? 'Saving...' : 'Save Changes' }}
          </ui-button>
          <span *ngIf="saveMsg" class="ml-3 text-sm text-green-600">{{ saveMsg }}</span>
        </div>

        <!-- Change Password -->
        <div class="card">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input type="password" [(ngModel)]="currentPassword" class="w-full rounded-lg border-gray-300 focus:border-statco-blue-light focus:ring-statco-blue-light" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input type="password" [(ngModel)]="newPassword" class="w-full rounded-lg border-gray-300 focus:border-statco-blue-light focus:ring-statco-blue-light" />
            </div>
          </div>
          <ui-button variant="primary" size="md" (click)="changePassword()" [disabled]="changingPassword">
            {{ changingPassword ? 'Changing...' : 'Change Password' }}
          </ui-button>
          <span *ngIf="pwMsg" class="ml-3 text-sm" [class.text-green-600]="!pwError" [class.text-red-600]="pwError">{{ pwMsg }}</span>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./client-profile.component.scss'],
})
export class ClientProfileComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  user: UserProfile | null = null;
  loading = false;
  error: string | null = null;

  editName = '';
  editPhone = '';
  saving = false;
  saveMsg = '';

  currentPassword = '';
  newPassword = '';
  changingPassword = false;
  pwMsg = '';
  pwError = false;

  constructor(private profileApi: ProfileApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadProfile();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadProfile() {
    this.loading = true;
    this.error = null;
    this.profileApi.getProfile().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (u) => {
        this.loading = false;
        this.user = u;
        this.editName = u.name || '';
        this.editPhone = u.phone || '';
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.error = 'Failed to load profile.';
        this.cdr.detectChanges();
      },
    });
  }

  saveProfile() {
    if (this.saving) return;
    this.saving = true;
    this.saveMsg = '';
    this.profileApi.updateProfile({ name: this.editName, phone: this.editPhone }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.saveMsg = 'Profile updated.';
        this.cdr.detectChanges();
        this.loadProfile();
      },
      error: () => {
        this.saving = false;
        this.saveMsg = '';
        this.cdr.detectChanges();
      },
    });
  }

  changePassword() {
    if (this.changingPassword) return;
    if (!this.currentPassword || !this.newPassword) {
      this.pwMsg = 'Both fields are required.';
      this.pwError = true;
      return;
    }
    this.changingPassword = true;
    this.pwMsg = '';
    this.pwError = false;
    this.profileApi.changePassword(this.currentPassword, this.newPassword).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.changingPassword = false;
        this.pwMsg = 'Password changed.';
        this.pwError = false;
        this.currentPassword = '';
        this.newPassword = '';
        this.cdr.detectChanges();
      },
      error: () => {
        this.changingPassword = false;
        this.pwMsg = 'Failed to change password.';
        this.pwError = true;
        this.cdr.detectChanges();
      },
    });
  }
}

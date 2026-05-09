import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { PageHeaderComponent, LoadingSpinnerComponent } from '../../../shared/ui';
import { ProfileApiService, UserProfile } from '../../../core/api/profile.api';
import { ChangePasswordComponent } from '../../../shared/components/change-password/change-password.component';

@Component({
  standalone: true,
  selector: 'app-crm-profile',
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, ChangePasswordComponent],
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
            <label for="crm-profile-name" class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" id="crm-profile-name" name="name" autocomplete="name" class="input w-full" [(ngModel)]="profile.name" />
          </div>
          <div>
            <label for="crm-profile-email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" id="crm-profile-email" name="email" class="input w-full" [value]="profile.email" disabled />
          </div>
          <div>
            <label for="crm-profile-phone" class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" id="crm-profile-phone" name="phone" autocomplete="tel" class="input w-full" [(ngModel)]="profile.phone" />
          </div>
          <button class="btn-primary" [disabled]="saving" (click)="saveProfile()">
            {{ saving ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>

      <ui-change-password></ui-change-password>
    </div>
  `,
})
export class CrmProfileComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  profile: UserProfile | null = null;
  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  constructor(private profileApi: ProfileApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    this.profileApi.getProfile().pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (data) => { this.loading = false; this.profile = data; this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.error = 'Failed to load profile'; this.cdr.detectChanges(); },
    });
  }

  saveProfile(): void {
    if (!this.profile || this.saving) return;
    this.saving = true;
    this.error = null;
    this.success = null;
    this.profileApi.updateProfile({ name: this.profile.name, phone: this.profile.phone }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (updated) => { this.profile = updated; this.saving = false; this.success = 'Profile updated'; this.cdr.detectChanges(); },
      error: () => { this.error = 'Failed to save profile'; this.saving = false; this.cdr.detectChanges(); },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, timeout, takeUntil } from 'rxjs/operators';
import { PageHeaderComponent, LoadingSpinnerComponent } from '../../shared/ui';
import { ProfileApiService, UserProfile } from '../../core/api/profile.api';
import { ChangePasswordComponent } from '../../shared/components/change-password/change-password.component';

@Component({
  selector: 'app-cco-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, LoadingSpinnerComponent, ChangePasswordComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="My Profile (CCO)" description="User profile and settings" icon="user-circle"></ui-page-header>

      <ui-loading-spinner *ngIf="loading" text="Loading profile..."></ui-loading-spinner>

      <div *ngIf="error" class="alert alert-error mb-4">{{ error }}</div>
      <div *ngIf="success" class="alert alert-success mb-4">{{ success }}</div>

      <div *ngIf="!loading && profile" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="card">
          <h3 class="card-title mb-4">Personal Information</h3>
          <div class="space-y-4">
            <div>
              <label for="cco-profile-name" class="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" id="cco-profile-name" name="name" autocomplete="name" class="input w-full" [(ngModel)]="profile.name" />
            </div>
            <div>
              <label for="cco-profile-email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" id="cco-profile-email" name="email" class="input w-full" [value]="profile.email" disabled />
            </div>
            <div>
              <label for="cco-profile-phone" class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" id="cco-profile-phone" name="phone" autocomplete="tel" class="input w-full" [class.border-red-500]="phoneError" [(ngModel)]="profile.phone" placeholder="e.g. +919876543210" />
              <p *ngIf="phoneError" class="mt-1 text-sm text-red-600 bg-red-50 px-2 py-1 rounded">{{ phoneError }}</p>
            </div>
            <button class="btn-primary" [disabled]="saving" (click)="saveProfile()">
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>

        <ui-change-password></ui-change-password>
      </div>
    </main>
  `,
})
export class CcoProfileComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  profile: UserProfile | null = null;
  loading = true;
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

  get phoneError(): string {
    const v = (this.profile?.phone || '').trim();
    if (!v) return '';
    const cleaned = v.replace(/[\s-]/g, '');
    if (!/^\+\d{1,3}[6-9]\d{9}$/.test(cleaned)) return 'Phone must include country code + 10 digits (e.g. +919876543210)';
    return '';
  }

  saveProfile(): void {
    if (!this.profile || this.saving) return;
    if (this.phoneError) {
      this.error = this.phoneError;
      return;
    }
    this.saving = true;
    this.error = null;
    this.success = null;
    this.profileApi.updateProfile({ name: this.profile.name, phone: this.profile.phone }).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: (updated) => { this.profile = updated; this.saving = false; this.success = 'Profile updated'; this.cdr.detectChanges(); },
      error: () => { this.error = 'Failed to save profile'; this.saving = false; this.cdr.detectChanges(); },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

}

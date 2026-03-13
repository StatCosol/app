import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { EssApiService, EssProfile } from '../ess-api.service';

@Component({
  selector: 'app-ess-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900">My Profile</h1>
        <div class="flex gap-2" *ngIf="emp">
          <button *ngIf="!editing" (click)="startEdit()"
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition">
            Edit Profile
          </button>
          <ng-container *ngIf="editing">
            <button (click)="cancelEdit()"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
              Cancel
            </button>
            <button (click)="saveEdit()" [disabled]="saving"
              class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-50">
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </button>
          </ng-container>
        </div>
      </div>

      <div *ngIf="loading" class="text-gray-500 text-sm">Loading...</div>
      <div *ngIf="error" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{{ error }}</div>
      <div *ngIf="saveSuccess" class="bg-green-50 text-green-700 p-3 rounded-lg text-sm">Profile updated successfully.</div>

      <ng-container *ngIf="emp && !loading">
        <!-- Personal -->
        <div class="info-card">
          <h2 class="card-title">Personal Information</h2>
          <div class="info-grid">
            <div class="info-row"><span class="label">Full Name</span><span class="value">{{ emp.firstName }} {{ emp.lastName || '' }}</span></div>
            <div class="info-row"><span class="label">Employee Code</span><span class="value font-mono">{{ emp.employeeCode }}</span></div>
            <div class="info-row"><span class="label">Gender</span><span class="value">{{ emp.gender || '-' }}</span></div>
            <div class="info-row"><span class="label">Date of Birth</span><span class="value">{{ emp.dateOfBirth || '-' }}</span></div>
            <div class="info-row"><span class="label">Father's Name</span><span class="value">{{ emp.fatherName || '-' }}</span></div>
            <div class="info-row">
              <span class="label">Phone</span>
              <span class="value" *ngIf="!editing">{{ emp.phone || '-' }}</span>
              <input *ngIf="editing" [(ngModel)]="editForm.phone" class="edit-input" placeholder="Phone" />
            </div>
            <div class="info-row">
              <span class="label">Email</span>
              <span class="value" *ngIf="!editing">{{ emp.email || '-' }}</span>
              <input *ngIf="editing" [(ngModel)]="editForm.email" class="edit-input" placeholder="Email" />
            </div>
          </div>
        </div>

        <!-- Employment -->
        <div class="info-card">
          <h2 class="card-title">Employment Details</h2>
          <div class="info-grid">
            <div class="info-row"><span class="label">Designation</span><span class="value">{{ emp.designation || '-' }}</span></div>
            <div class="info-row"><span class="label">Department</span><span class="value">{{ emp.department || '-' }}</span></div>
            <div class="info-row"><span class="label">Date of Joining</span><span class="value">{{ emp.dateOfJoining || '-' }}</span></div>
            <div *ngIf="emp.dateOfExit" class="info-row"><span class="label">Date of Exit</span><span class="value text-red-600">{{ emp.dateOfExit }}</span></div>
            <div class="info-row"><span class="label">State</span><span class="value">{{ emp.stateCode || '-' }}</span></div>
            <div class="info-row"><span class="label">Status</span>
              <span class="value" [class.text-green-600]="emp.isActive" [class.text-red-600]="!emp.isActive">
                {{ emp.isActive ? 'Active' : 'Inactive' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Identity -->
        <div class="info-card">
          <h2 class="card-title">Identity & Statutory</h2>
          <div class="info-grid">
            <div class="info-row"><span class="label">Aadhaar</span><span class="value font-mono">{{ emp.aadhaar || '-' }}</span></div>
            <div class="info-row"><span class="label">PAN</span><span class="value font-mono">{{ emp.pan || '-' }}</span></div>
            <div class="info-row"><span class="label">UAN</span><span class="value font-mono">{{ emp.uan || '-' }}</span></div>
            <div class="info-row"><span class="label">ESIC Number</span><span class="value font-mono">{{ emp.esic || '-' }}</span></div>
            <div class="info-row"><span class="label">PF Applicable</span><span class="value">{{ emp.pfApplicable ? 'Yes' : 'No' }}</span></div>
            <div class="info-row"><span class="label">PF Registered</span><span class="value">{{ emp.pfRegistered ? 'Yes' : 'No' }}</span></div>
            <div class="info-row"><span class="label">ESI Applicable</span><span class="value">{{ emp.esiApplicable ? 'Yes' : 'No' }}</span></div>
            <div class="info-row"><span class="label">ESI Registered</span><span class="value">{{ emp.esiRegistered ? 'Yes' : 'No' }}</span></div>
          </div>
        </div>

        <!-- Bank -->
        <div class="info-card">
          <h2 class="card-title">Bank Details</h2>
          <div class="info-grid">
            <div class="info-row">
              <span class="label">Bank Name</span>
              <span class="value" *ngIf="!editing">{{ emp.bankName || '-' }}</span>
              <input *ngIf="editing" [(ngModel)]="editForm.bankName" class="edit-input" placeholder="Bank Name" />
            </div>
            <div class="info-row">
              <span class="label">Account Number</span>
              <span class="value font-mono" *ngIf="!editing">{{ emp.bankAccount || '-' }}</span>
              <input *ngIf="editing" [(ngModel)]="editForm.bankAccount" class="edit-input" placeholder="Account Number" />
            </div>
            <div class="info-row">
              <span class="label">IFSC</span>
              <span class="value font-mono" *ngIf="!editing">{{ emp.ifsc || '-' }}</span>
              <input *ngIf="editing" [(ngModel)]="editForm.ifsc" class="edit-input" placeholder="IFSC Code" />
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .info-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px 24px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 16px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #f9fafb;
      font-size: 14px;
    }
    .label { color: #6b7280; }
    .value { color: #111827; font-weight: 500; text-align: right; }
    @media (max-width: 640px) {
      .info-grid { grid-template-columns: 1fr; }
    }
    .edit-input {
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 14px;
      text-align: right;
      width: 200px;
      color: #111827;
    }
    .edit-input:focus {
      border-color: #3b82f6;
      outline: none;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
  `],
})
export class EssProfileComponent implements OnInit, OnDestroy {
  emp: EssProfile | null = null;
  loading = false;
  error = '';
  editing = false;
  saving = false;
  saveSuccess = false;
  editForm: any = {};
  private readonly destroy$ = new Subject<void>();

  constructor(private api: EssApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loading = true;
    this.api.getProfile()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: (p) => { this.loading = false; this.emp = p; },
        error: () => { this.loading = false; this.error = 'Failed to load profile'; },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  startEdit(): void {
    if (!this.emp) return;
    this.editing = true;
    this.saveSuccess = false;
    this.editForm = {
      phone: this.emp.phone || '',
      email: this.emp.email || '',
      bankName: this.emp.bankName || '',
      bankAccount: this.emp.bankAccount || '',
      ifsc: this.emp.ifsc || '',
    };
  }

  cancelEdit(): void {
    this.editing = false;
    this.editForm = {};
  }

  saveEdit(): void {
    if (!this.emp) return;
    this.saving = true;
    this.saveSuccess = false;
    // Merge edits into profile for optimistic UI, then persist
    const payload = { ...this.editForm };
    this.api.updateProfile(payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.saving = false; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: () => {
          // Apply edits locally
          Object.assign(this.emp!, this.editForm);
          this.editing = false;
          this.saveSuccess = true;
          setTimeout(() => { this.saveSuccess = false; this.cdr.detectChanges(); }, 3000);
        },
        error: () => {
          this.error = 'Failed to save profile changes.';
        },
      });
  }
}

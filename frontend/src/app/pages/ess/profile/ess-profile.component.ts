import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { EssApiService, EssProfile } from '../ess-api.service';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  selector: 'app-ess-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  template: `
    <div class="max-w-4xl mx-auto space-y-6">
      <ui-page-header title="My Profile" subtitle="Personal, employment, and bank details">
        @if (emp && !editing) {
          <button (click)="startEdit()"
            class="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition">
            Edit Profile
          </button>
        }
        @if (emp && editing) {
          <button (click)="cancelEdit()"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
            Cancel
          </button>
          <button (click)="saveEdit()" [disabled]="saving"
            class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-50">
            {{ saving ? 'Saving...' : 'Save Changes' }}
          </button>
        }
      </ui-page-header>

      @if (loading) {
<div class="text-gray-500 text-sm">Loading...</div>
}
      @if (error) {
<div class="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{{ error }}</div>
}
      @if (saveSuccess) {
<div class="bg-green-50 text-green-700 p-3 rounded-lg text-sm">Profile updated successfully.</div>
}

      @if (emp && !loading) {

        <!-- Personal -->
        <div class="info-card">
          <h2 class="card-title">Personal Information</h2>
          <div class="info-grid">
            <div class="info-row"><span class="label">Name as per Aadhaar</span><span class="value">{{ emp.name }}</span></div>
            <div class="info-row"><span class="label">Employee Code</span><span class="value font-mono">{{ emp.employeeCode }}</span></div>
            <div class="info-row"><span class="label">Gender</span><span class="value">{{ emp.gender || '-' }}</span></div>
            <div class="info-row"><span class="label">DOB as per Aadhaar</span><span class="value">{{ emp.dateOfBirth || '-' }}</span></div>
            <div class="info-row"><span class="label">Father's Name</span><span class="value">{{ emp.fatherName || '-' }}</span></div>
            <div class="info-row">
              <span class="label">Marital Status</span>
              @if (!editing) {
<span class="value">{{ emp.maritalStatus || '-' }}</span>
}
              @if (editing) {
<div class="edit-field">
                <select id="ess-marital" name="maritalStatus" [(ngModel)]="editForm.maritalStatus" class="edit-input">
                  <option value="">- Select -</option>
                  <option value="MARRIED">Married</option>
                  <option value="UNMARRIED">Unmarried</option>
                  <option value="WIDOW">Widow</option>
                  <option value="WIDOWER">Widower</option>
                </select>
              </div>
}
            </div>
            <div class="info-row">
              <span class="label">Phone</span>
              @if (!editing) {
<span class="value">{{ emp.phone || '-' }}</span>
}
              @if (editing) {
<div class="edit-field">
                <input id="ess-phone" name="phone" autocomplete="tel" [(ngModel)]="editForm.phone" class="edit-input" [class.border-red-500]="phoneError" placeholder="e.g. +919876543210" />
                @if (phoneError) {
<p class="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded mt-1">{{ phoneError }}</p>
}
              </div>
}
            </div>
            <div class="info-row">
              <span class="label">Email</span>
              @if (!editing) {
<span class="value">{{ emp.email || '-' }}</span>
}
              @if (editing) {
<div class="edit-field">
                <input id="ess-email" name="email" autocomplete="email" [(ngModel)]="editForm.email" class="edit-input" [class.border-red-500]="editEmailError" placeholder="Email" />
                @if (editEmailError) {
<p class="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded mt-1">{{ editEmailError }}</p>
}
              </div>
}
            </div>
          </div>
        </div>

        <!-- Employment -->
        <div class="info-card">
          <h2 class="card-title">Employment Details</h2>
          <div class="info-grid">
            <div class="info-row"><span class="label">Designation</span><span class="value">{{ emp.designation || '-' }}</span></div>
            <div class="info-row"><span class="label">Department</span><span class="value">{{ emp.department || '-' }}</span></div>
            <div class="info-row"><span class="label">Date of Joining</span><span class="value">{{ emp.dateOfJoining ? (emp.dateOfJoining | date:'dd/MM/yyyy') : '-' }}</span></div>
            @if (emp.dateOfExit) {
<div class="info-row"><span class="label">Date of Exit</span><span class="value text-red-600">{{ emp.dateOfExit }}</span></div>
}
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
            @if (emp.pfServiceStartDate) {
<div class="info-row"><span class="label">PF Service Start Date</span><span class="value font-mono">{{ emp.pfServiceStartDate | date:'dd/MM/yyyy' }}</span></div>
}
            @if (emp.basicAtPfStart !== null && emp.basicAtPfStart !== undefined) {
<div class="info-row"><span class="label">Basic Salary at PF Start</span><span class="value">₹{{ emp.basicAtPfStart | number:'1.2-2' }}</span></div>
}
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
              @if (!editing) {
<span class="value">{{ emp.bankName || '-' }}</span>
}
              @if (editing) {
<input autocomplete="off" id="ess-bank-name" name="bankName" [(ngModel)]="editForm.bankName" class="edit-input" placeholder="Bank Name" />
}
            </div>
            <div class="info-row">
              <span class="label">Account Number</span>
              @if (!editing) {
<span class="value font-mono">{{ emp.bankAccount || '-' }}</span>
}
              @if (editing) {
<input autocomplete="off" id="ess-bank-account" name="bankAccount" [(ngModel)]="editForm.bankAccount" class="edit-input" placeholder="Account Number" />
}
            </div>
            <div class="info-row">
              <span class="label">IFSC</span>
              @if (!editing) {
<span class="value font-mono">{{ emp.ifsc || '-' }}</span>
}
              @if (editing) {
<input autocomplete="off" id="ess-ifsc" name="ifsc" [(ngModel)]="editForm.ifsc" class="edit-input" placeholder="IFSC Code" />
}
            </div>
          </div>
        </div>
      
}
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
      maritalStatus: this.emp.maritalStatus || '',
    };
  }

  cancelEdit(): void {
    this.editing = false;
    this.editForm = {};
  }

  get phoneError(): string {
    const v = (this.editForm.phone || '').trim();
    if (!v) return '';
    const cleaned = v.replace(/[\s-]/g, '');
    if (!/^\+\d{1,3}[6-9]\d{9}$/.test(cleaned)) return 'Phone must include country code + 10 digits (e.g. +919876543210)';
    return '';
  }

  get editEmailError(): string {
    const v = (this.editForm.email || '').trim();
    if (!v) return '';
    if (!v.includes('@')) return 'Email must include @ symbol';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'Please enter a valid email address';
    return '';
  }

  saveEdit(): void {
    if (!this.emp) return;
    if (this.phoneError) {
      this.error = this.phoneError;
      return;
    }
    if (this.editEmailError) {
      this.error = this.editEmailError;
      return;
    }
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

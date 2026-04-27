import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { ClientEmployeesService, Employee, EmployeeNomination } from '../../client/employees/client-employees.service';
import {
  ActionButtonComponent,
  StatusBadgeComponent,
  LoadingSpinnerComponent,
} from '../../../shared/ui';
import { ToastService } from '../../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-branch-employee-detail',
  standalone: true,
  imports: [
    CommonModule,
    ActionButtonComponent,
    StatusBadgeComponent,
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

      <ui-loading-spinner *ngIf="loading" text="Loading employee..." size="lg"></ui-loading-spinner>

      <!-- Error -->
      <div *ngIf="error && !loading"
           class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-center justify-between">
        <span>{{ error }}</span>
        <button (click)="goBack()" class="text-red-800 font-semibold hover:underline ml-4">Go Back</button>
      </div>

      <ng-container *ngIf="emp && !loading">
        <!-- Header Card -->
        <div class="header-card">
          <div class="header-top">
            <div class="header-info">
              <div class="header-name">
                {{ emp.name }}
                <ui-status-badge [status]="emp.isActive ? 'ACTIVE' : 'INACTIVE'" class="ml-2"></ui-status-badge>
                <span *ngIf="emp.approvalStatus === 'PENDING'" class="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Pending Approval</span>
                <span *ngIf="emp.approvalStatus === 'REJECTED'" class="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Rejected</span>
              </div>
              <div class="header-meta">{{ emp.employeeCode }}</div>
              <div *ngIf="emp.designation || emp.department" class="header-meta">
                {{ emp.designation || '' }}<span *ngIf="emp.designation && emp.department"> &middot; </span>{{ emp.department || '' }}
              </div>
            </div>
            <div class="header-actions">
              <ui-button variant="primary" (clicked)="editEmployee()">Edit</ui-button>
              <ui-button variant="outline" [disabled]="downloadingLetter" (clicked)="downloadAppointmentLetter()">
                {{ downloadingLetter ? 'Downloading...' : 'Appointment Letter (PDF)' }}
              </ui-button>
              <ui-button variant="outline" [disabled]="downloadingDocx" (clicked)="downloadAppointmentLetterDocx()">
                {{ downloadingDocx ? 'Downloading...' : 'Appointment Letter (Word)' }}
              </ui-button>
              <ui-button *ngIf="emp.isActive && emp.approvalStatus !== 'PENDING'" variant="secondary" [disabled]="provisioningEss || !hasValidEmail()" (clicked)="provisionEssLogin()"
                [title]="hasValidEmail() ? 'Create ESS login for this employee' : 'Add a valid employee email first to create ESS login'">
                {{ provisioningEss ? 'Creating...' : 'Create ESS Login' }}
              </ui-button>
              <ui-button *ngIf="emp.isActive" variant="danger" (clicked)="confirmDeactivate()">Deactivate</ui-button>
            </div>
          </div>
        </div>

        <!-- ESS Credentials Card -->
        <div *ngIf="essResult?.generatedPassword" class="ess-credentials-card">
          <div class="ess-cred-header">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <h4 class="text-sm font-semibold text-green-800">ESS Login Created Successfully</h4>
            </div>
            <button (click)="essResult = null" class="text-gray-400 hover:text-gray-600 p-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <p class="text-xs text-amber-700 mb-3">
            <svg class="w-3.5 h-3.5 inline -mt-0.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Copy these credentials now. The password will not be shown again.
          </p>
          <div class="ess-cred-fields">
            <div class="ess-cred-row">
              <span class="ess-cred-label">Email</span>
              <span class="ess-cred-value">{{ essResult.email }}</span>
              <button class="ess-copy-btn" (click)="copyCredential(essResult.email)" title="Copy email">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
              </button>
            </div>
            <div class="ess-cred-row">
              <span class="ess-cred-label">Password</span>
              <span class="ess-cred-value font-mono">{{ essResult.generatedPassword }}</span>
              <button class="ess-copy-btn" (click)="copyCredential(essResult.generatedPassword)" title="Copy password">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Profile -->
        <div class="info-grid">
          <div class="info-section">
            <h4 class="info-section-title">Personal Information</h4>
            <div class="info-rows">
              <div class="info-row"><span class="info-label">Name as per Aadhaar</span><span class="info-value">{{ emp.name }}</span></div>
              <div class="info-row"><span class="info-label">Gender</span><span class="info-value">{{ emp.gender || '-' }}</span></div>
              <div class="info-row"><span class="info-label">DOB as per Aadhaar</span><span class="info-value">{{ emp.dateOfBirth || '-' }}</span></div>
              <div class="info-row"><span class="info-label">Father's Name</span><span class="info-value">{{ emp.fatherName || '-' }}</span></div>
            </div>
          </div>

          <div class="info-section">
            <h4 class="info-section-title">Contact</h4>
            <div class="info-rows">
              <div class="info-row"><span class="info-label">Phone</span><span class="info-value">{{ emp.phone || '-' }}</span></div>
              <div class="info-row"><span class="info-label">Email</span><span class="info-value">{{ emp.email || '-' }}</span></div>
            </div>
          </div>

          <div class="info-section">
            <h4 class="info-section-title">Identity Documents</h4>
            <div class="info-rows">
              <div class="info-row"><span class="info-label">Aadhaar</span><span class="info-value">{{ emp.aadhaar || '-' }}</span></div>
              <div class="info-row"><span class="info-label">PAN</span><span class="info-value">{{ emp.pan || '-' }}</span></div>
              <div class="info-row"><span class="info-label">UAN</span><span class="info-value">{{ emp.uan || '-' }}</span></div>
              <div class="info-row"><span class="info-label">ESIC Number</span><span class="info-value">{{ emp.esic || '-' }}</span></div>
            </div>
          </div>

          <div class="info-section">
            <h4 class="info-section-title">Employment</h4>
            <div class="info-rows">
              <div class="info-row"><span class="info-label">Employee Code</span><span class="info-value font-mono">{{ emp.employeeCode }}</span></div>
              <div class="info-row"><span class="info-label">Designation</span><span class="info-value">{{ emp.designation || '-' }}</span></div>
              <div class="info-row"><span class="info-label">Department</span><span class="info-value">{{ emp.department || '-' }}</span></div>
              <div class="info-row"><span class="info-label">Date of Joining</span><span class="info-value">{{ emp.dateOfJoining ? (emp.dateOfJoining | date:'dd/MM/yyyy') : '-' }}</span></div>
              <div *ngIf="emp.dateOfExit" class="info-row"><span class="info-label">Date of Exit</span><span class="info-value text-red-600">{{ emp.dateOfExit }}</span></div>
              <div class="info-row"><span class="info-label">State</span><span class="info-value">{{ emp.stateCode || '-' }}</span></div>
            </div>
          </div>

          <div class="info-section">
            <h4 class="info-section-title">Bank Details</h4>
            <div class="info-rows">
              <div class="info-row"><span class="info-label">Bank Name</span><span class="info-value">{{ emp.bankName || '-' }}</span></div>
              <div class="info-row"><span class="info-label">Account Number</span><span class="info-value font-mono">{{ emp.bankAccount || '-' }}</span></div>
              <div class="info-row"><span class="info-label">IFSC</span><span class="info-value font-mono">{{ emp.ifsc || '-' }}</span></div>
            </div>
          </div>
        </div>

        <!-- Nominations -->
        <div class="nom-section">
          <div class="nom-section-header">
            <h4 class="info-section-title" style="margin:0">Nominations</h4>
            <span class="text-xs text-gray-500" *ngIf="!loadingNoms && nominations.length">{{ nominations.length }} record(s)</span>
          </div>
          <ui-loading-spinner *ngIf="loadingNoms" text="Loading nominations..."></ui-loading-spinner>
          <div *ngIf="!loadingNoms && nominations.length === 0" class="text-sm text-gray-500">
            No nominations recorded for this employee yet.
          </div>
          <div *ngIf="!loadingNoms && nominations.length" class="nom-list">
            <div *ngFor="let nom of nominations" class="nom-row">
              <div class="nom-row-info">
                <ui-status-badge [status]="nom.nominationType"></ui-status-badge>
                <span class="text-xs text-gray-500" *ngIf="nom.declarationDate">Declared: {{ nom.declarationDate }}</span>
                <span class="text-xs text-gray-500">{{ nom.members?.length || 0 }} nominee(s)</span>
              </div>
              <ui-button variant="outline" size="sm"
                         [disabled]="printingNomination === nom.nominationType"
                         (clicked)="printNomination(nom.nominationType)">
                {{ printingNomination === nom.nominationType ? 'Preparing...' : 'Print / Download PDF' }}
              </ui-button>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .page { max-width: 1280px; margin: 0 auto; padding: 1.5rem 1rem; }

    .header-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.75rem;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.25rem;
    }
    .header-top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; }
    .header-name { font-size: 1.25rem; font-weight: 700; color: #111827; display: flex; align-items: center; }
    .header-meta { font-size: 0.85rem; color: #6b7280; margin-top: 0.15rem; }
    .header-actions { display: flex; gap: 0.5rem; }

    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
    .info-section {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 1rem 1.25rem;
    }
    .info-section-title { font-size: 0.8rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.75rem; }
    .info-rows { display: flex; flex-direction: column; gap: 0.5rem; }
    .info-row { display: flex; justify-content: space-between; font-size: 0.875rem; padding: 0.25rem 0; border-bottom: 1px solid #f9fafb; }
    .info-label { color: #6b7280; }
    .info-value { color: #111827; font-weight: 500; text-align: right; }

    @media (max-width: 640px) {
      .info-grid { grid-template-columns: 1fr; }
      .header-top { flex-direction: column; }
    }

    .ess-credentials-card {
      background: linear-gradient(135deg, #ecfdf5, #f0fdf4);
      border: 1px solid #86efac;
      border-radius: 0.75rem;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
    }
    .ess-cred-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .ess-cred-fields {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .ess-cred-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: white;
      border: 1px solid #d1fae5;
      border-radius: 0.5rem;
      padding: 0.5rem 0.75rem;
    }
    .ess-cred-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #6b7280;
      min-width: 64px;
    }
    .ess-cred-value {
      flex: 1;
      font-size: 0.875rem;
      font-weight: 500;
      color: #111827;
      word-break: break-all;
    }
    .ess-copy-btn {
      background: none;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      padding: 0.25rem;
      cursor: pointer;
      color: #6b7280;
      transition: color 0.15s, border-color 0.15s;
    }
    .ess-copy-btn:hover {
      color: #4f46e5;
      border-color: #4f46e5;
    }

    .nom-section {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 1rem 1.25rem;
      margin-top: 1.25rem;
    }
    .nom-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .nom-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .nom-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.625rem 0.875rem; border: 1px solid #f1f5f9; border-radius: 0.5rem;
      background: #f9fafb;
    }
    .nom-row-info { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  `],
})
export class BranchEmployeeDetailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  employeeId = '';
  emp: Employee | null = null;
  loading = false;
  error = '';
  downloadingLetter = false;
  downloadingDocx = false;
  provisioningEss = false;
  essResult: any = null;
  nominations: EmployeeNomination[] = [];
  loadingNoms = false;
  printingNomination = '';

  constructor(
    private svc: ClientEmployeesService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private dialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.employeeId = this.route.snapshot.paramMap.get('id') || '';
    this.loadEmployee();
    this.loadNominations();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadEmployee(): void {
    this.loading = true;
    this.error = '';
    this.svc
      .getById(this.employeeId)
      .pipe(takeUntil(this.destroy$), finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (emp) => { this.emp = emp; },
        error: () => { this.error = 'Employee not found or access denied.'; },
      });
  }

  editEmployee(): void {
    this.router.navigate(['/branch/employees', this.employeeId, 'edit']);
  }

  downloadAppointmentLetter(): void {
    if (this.downloadingLetter) return;
    this.downloadingLetter = true;
    this.svc.downloadAppointmentLetter(this.employeeId).pipe(
      finalize(() => { this.downloadingLetter = false; this.cdr.detectChanges(); }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Appointment_Letter_${this.emp?.employeeCode || 'employee'}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to generate appointment letter'),
    });
  }

  downloadAppointmentLetterDocx(): void {
    if (this.downloadingDocx) return;
    this.downloadingDocx = true;
    this.svc.downloadAppointmentLetter(this.employeeId, 'docx').pipe(
      finalize(() => { this.downloadingDocx = false; this.cdr.detectChanges(); }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Appointment_Letter_${this.emp?.employeeCode || 'employee'}.docx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to generate appointment letter'),
    });
  }

  async confirmDeactivate(): Promise<void> {
    if (!this.emp) return;
    const confirmed = await this.dialog.confirm(
      'Deactivate Employee',
      `Deactivate ${this.emp.name}?`,
      { variant: 'danger', confirmText: 'Deactivate' },
    );
    if (!confirmed) return;
    this.svc.deactivate(this.employeeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.loadEmployee(),
      error: (e) => this.toast.error(e?.error?.message || 'Failed to deactivate'),
    });
  }

  hasValidEmail(): boolean {
    const e = (this.emp?.email || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  provisionEssLogin(): void {
    if (!this.emp || !this.hasValidEmail()) {
      this.toast.error('Please add a valid email address for this employee first');
      return;
    }
    if (!confirm(`Create ESS login for ${this.emp.name}?\nEmail: ${this.emp.email}`)) return;
    this.provisioningEss = true;
    this.essResult = null;
    this.cdr.detectChanges();

    this.svc.provisionEss(this.employeeId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.provisioningEss = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res) => {
        this.provisioningEss = false;
        this.essResult = res;
        if (res.generatedPassword) {
          this.toast.success('ESS login created — see credentials below');
        } else {
          this.toast.success(`ESS login created for ${res.email}`);
        }
        this.cdr.detectChanges();
      },
      error: (e) => {
        this.provisioningEss = false;
        this.toast.error(e?.error?.message || 'Failed to create ESS login');
      },
    });
  }

  copyCredential(value: string): void {
    navigator.clipboard.writeText(value).then(
      () => this.toast.success('Copied to clipboard'),
      () => this.toast.error('Failed to copy'),
    );
  }

  goBack(): void {
    this.router.navigate(['/branch/employees']);
  }

  loadNominations(): void {
    if (!this.employeeId) return;
    this.loadingNoms = true;
    this.svc.listNominations(this.employeeId).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.loadingNoms = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (list) => { this.nominations = list || []; },
      error: () => { this.nominations = []; },
    });
  }

  printNomination(formType: string): void {
    if (this.printingNomination) return;
    this.printingNomination = formType;
    this.svc.printNominationForm(this.employeeId, formType).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.printingNomination = ''; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${formType}_Nomination_${this.emp?.employeeCode || 'employee'}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => this.toast.error(e?.error?.message || 'Failed to download nomination form'),
    });
  }
}

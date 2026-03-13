import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { ClientEmployeesService, Employee } from '../../client/employees/client-employees.service';
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
                {{ emp.firstName }} {{ emp.lastName || '' }}
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
              <ui-button *ngIf="emp.isActive" variant="danger" (clicked)="confirmDeactivate()">Deactivate</ui-button>
            </div>
          </div>
        </div>

        <!-- Profile -->
        <div class="info-grid">
          <div class="info-section">
            <h4 class="info-section-title">Personal Information</h4>
            <div class="info-rows">
              <div class="info-row"><span class="info-label">Full Name</span><span class="info-value">{{ emp.firstName }} {{ emp.lastName || '' }}</span></div>
              <div class="info-row"><span class="info-label">Gender</span><span class="info-value">{{ emp.gender || '-' }}</span></div>
              <div class="info-row"><span class="info-label">Date of Birth</span><span class="info-value">{{ emp.dateOfBirth || '-' }}</span></div>
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
              <div class="info-row"><span class="info-label">Date of Joining</span><span class="info-value">{{ emp.dateOfJoining || '-' }}</span></div>
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
  `],
})
export class BranchEmployeeDetailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  employeeId = '';
  emp: Employee | null = null;
  loading = false;
  error = '';

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

  async confirmDeactivate(): Promise<void> {
    if (!this.emp) return;
    const confirmed = await this.dialog.confirm(
      'Deactivate Employee',
      `Deactivate ${this.emp.firstName} ${this.emp.lastName || ''}?`,
      { variant: 'danger', confirmText: 'Deactivate' },
    );
    if (!confirmed) return;
    this.svc.deactivate(this.employeeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.loadEmployee(),
      error: (e) => this.toast.error(e?.error?.message || 'Failed to deactivate'),
    });
  }

  goBack(): void {
    this.router.navigate(['/branch/employees']);
  }
}

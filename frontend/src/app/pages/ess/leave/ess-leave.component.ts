import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { EssApiService, LeaveBalance, LeavePolicy, LeaveApplication } from '../ess-api.service';

@Component({
  selector: 'app-ess-leave',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-5xl mx-auto space-y-6">
      <div class="flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">Leave Management</h1>
        <button (click)="openApplyForm()" class="btn-primary">+ Apply for Leave</button>
      </div>

      <div *ngIf="loading" class="text-gray-500 text-sm">Loading...</div>

      <!-- Leave Balances -->
      <div *ngIf="!loading && balances.length" class="section-card">
        <h2 class="section-title">Leave Balances</h2>
        <table class="data-table">
          <thead>
            <tr>
              <th>Leave Type</th>
              <th class="text-right">Opening</th>
              <th class="text-right">Accrued</th>
              <th class="text-right">Used</th>
              <th class="text-right">Available</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let b of balances">
              <td class="font-medium">{{ b.leaveType }}</td>
              <td class="text-right">{{ b.opening }}</td>
              <td class="text-right">{{ b.accrued }}</td>
              <td class="text-right">{{ b.used }}</td>
              <td class="text-right font-semibold">{{ b.available }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Leave Applications -->
      <div class="section-card">
        <h2 class="section-title">My Applications</h2>

        <div *ngIf="!loading && !applications.length" class="text-gray-500 text-sm py-4">
          No leave applications yet.
        </div>

        <table *ngIf="applications.length" class="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>From</th>
              <th>To</th>
              <th class="text-right">Days</th>
              <th>Reason</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let a of applications">
              <td>{{ a.leaveType }}</td>
              <td>{{ a.fromDate }}</td>
              <td>{{ a.toDate }}</td>
              <td class="text-right">{{ a.totalDays }}</td>
              <td class="max-w-[200px] truncate" [title]="a.reason || ''">{{ a.reason || '-' }}</td>
              <td>
                <span class="leave-status" [ngClass]="'ls-' + a.status">{{ a.status }}</span>
              </td>
              <td>
                <button *ngIf="a.status === 'DRAFT' || a.status === 'SUBMITTED'"
                        (click)="cancelApplication(a)"
                        class="text-xs text-red-600 hover:underline">
                  Cancel
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Apply Leave modal -->
      <div *ngIf="showApplyForm" class="modal-overlay" (click)="showApplyForm = false">
        <div class="modal-panel" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="text-lg font-semibold">Apply for Leave</h2>
            <button (click)="showApplyForm = false" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
          </div>
          <div class="modal-body space-y-4">
            <div>
              <label class="field-label">Leave Type *</label>
              <select [(ngModel)]="applyForm.leaveType" class="field-input">
                <option value="">Select type</option>
                <option *ngFor="let p of policies" [value]="p.leaveType">
                  {{ p.leaveName || p.leaveType }} ({{ p.yearlyLimit }} days/year)
                </option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="field-label">From Date *</label>
                <input type="date" [(ngModel)]="applyForm.fromDate" class="field-input" />
              </div>
              <div>
                <label class="field-label">To Date *</label>
                <input type="date" [(ngModel)]="applyForm.toDate" class="field-input" />
              </div>
            </div>
            <div>
              <label class="field-label">Reason</label>
              <textarea [(ngModel)]="applyForm.reason" rows="3" class="field-input"></textarea>
            </div>
            <div *ngIf="applyError" class="text-red-600 text-sm">{{ applyError }}</div>
          </div>
          <div class="modal-footer">
            <button (click)="showApplyForm = false" class="btn-secondary">Cancel</button>
            <button (click)="submitLeave()" [disabled]="submitting" class="btn-primary">
              {{ submitting ? 'Submitting...' : 'Submit' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .btn-primary {
      background: #0f2547;
      color: #fff;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      border: none;
      cursor: pointer;
    }
    .btn-primary:hover { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      border: 1px solid #d1d5db;
      cursor: pointer;
    }

    .section-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 12px;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .data-table th {
      text-align: left;
      padding: 8px 12px;
      font-weight: 600;
      color: #6b7280;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 2px solid #e5e7eb;
    }
    .data-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #f3f4f6;
      color: #111827;
    }

    .leave-status {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 999px;
    }
    .ls-DRAFT { background: #f3f4f6; color: #6b7280; }
    .ls-SUBMITTED { background: #fef3c7; color: #b45309; }
    .ls-APPROVED { background: #dcfce7; color: #15803d; }
    .ls-REJECTED { background: #fee2e2; color: #b91c1c; }
    .ls-CANCELLED { background: #f3f4f6; color: #9ca3af; }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal-panel {
      background: white;
      border-radius: 16px;
      width: 95%;
      max-width: 550px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    .modal-body { padding: 16px 20px; }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 12px 20px;
      border-top: 1px solid #e5e7eb;
    }

    .field-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 4px;
    }
    .field-input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      color: #111827;
      background: white;
    }
    .field-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  `],
})
export class EssLeaveComponent implements OnInit {
  loading = true;
  balances: LeaveBalance[] = [];
  policies: LeavePolicy[] = [];
  applications: LeaveApplication[] = [];

  showApplyForm = false;
  submitting = false;
  applyError = '';
  applyForm: any = {};

  constructor(private api: EssApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loading = true;
    forkJoin({
      balances: this.api.getLeaveBalances(),
      policies: this.api.getLeavePolicies(),
      applications: this.api.listLeaveApplications(),
    })
    .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
    .subscribe({
      next: (data) => {
        this.balances = data.balances;
        this.policies = data.policies;
        this.applications = data.applications;
      },
      error: () => {},
    });
  }

  openApplyForm(): void {
    this.applyError = '';
    this.applyForm = {
      leaveType: '',
      fromDate: '',
      toDate: '',
      reason: '',
    };
    this.showApplyForm = true;
  }

  submitLeave(): void {
    if (!this.applyForm.leaveType) { this.applyError = 'Leave type is required'; return; }
    if (!this.applyForm.fromDate) { this.applyError = 'From date is required'; return; }
    if (!this.applyForm.toDate) { this.applyError = 'To date is required'; return; }
    if (this.applyForm.toDate < this.applyForm.fromDate) { this.applyError = 'To date must be on or after from date'; return; }
    this.submitting = true;
    this.applyError = '';
    this.api.applyLeave(this.applyForm)
      .pipe(finalize(() => { this.submitting = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.showApplyForm = false;
          this.loadAll();
        },
        error: (e) => {
          this.applyError = e?.error?.message || 'Failed to submit leave application';
        },
      });
  }

  cancelApplication(app: LeaveApplication): void {
    if (!confirm('Are you sure you want to cancel this leave application?')) return;
    this.api.cancelLeave((app as any).id)
    .subscribe({
      next: () => this.loadAll(),
      error: () => {},
    });
  }
}

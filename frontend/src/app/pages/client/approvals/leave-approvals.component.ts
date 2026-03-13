import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { BranchApprovalsApiService, PendingLeave } from './branch-approvals-api.service';
import { ToastService } from '../../../shared/toast/toast.service';

@Component({
  selector: 'app-leave-approvals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-6xl mx-auto space-y-6">
      <h1 class="text-2xl font-bold text-gray-900">Leave Approvals</h1>

      <div *ngIf="loading" class="text-gray-500 text-sm">Loading pending leave applications...</div>

      <div *ngIf="!loading && !leaves.length"
           class="bg-white border rounded-xl p-8 text-center text-gray-500">
        No pending leave applications to review.
      </div>

      <div *ngIf="!loading && leaves.length" class="section-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Leave Type</th>
              <th>From</th>
              <th>To</th>
              <th class="text-right">Days</th>
              <th>Reason</th>
              <th>Applied</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let lv of leaves">
              <td class="font-medium">{{ lv.employeeName || lv.employeeId }}</td>
              <td>{{ lv.leaveTypeCode }}</td>
              <td>{{ lv.fromDate }}</td>
              <td>{{ lv.toDate }}</td>
              <td class="text-right">{{ lv.numberOfDays }}</td>
              <td class="max-w-[180px] truncate" [title]="lv.reason || ''">{{ lv.reason || '-' }}</td>
              <td class="text-sm text-gray-500">{{ lv.appliedAt }}</td>
              <td class="text-right">
                <div class="flex justify-end gap-2">
                  <button (click)="approve(lv)" class="btn-approve" [disabled]="processing.has(lv.id)">
                    Approve
                  </button>
                  <button (click)="startReject(lv)" class="btn-reject" [disabled]="processing.has(lv.id)">
                    Reject
                  </button>
                </div>
              </td>
            </tr>
            <!-- Inline reject row -->
            <tr *ngIf="rejectId">
              <td colspan="8">
                <div class="reject-inline">
                  <label class="text-xs font-medium text-gray-600">Reason for rejection:</label>
                  <div class="flex gap-2 mt-1 items-start">
                    <textarea [(ngModel)]="rejectReason" rows="2" class="field-input flex-1"></textarea>
                    <button (click)="confirmReject()" class="btn-reject" [disabled]="!rejectReason.trim()">
                      Confirm
                    </button>
                    <button (click)="rejectId = ''" class="btn-secondary">Cancel</button>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .section-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px;
      overflow-x: auto;
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
      vertical-align: top;
    }
    .btn-approve {
      background: #059669;
      color: white;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-approve:hover { opacity: 0.9; }
    .btn-approve:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-reject {
      background: #dc2626;
      color: white;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-reject:hover { opacity: 0.9; }
    .btn-reject:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid #d1d5db;
      cursor: pointer;
    }
    .reject-inline {
      padding: 8px 0;
    }
    .field-input {
      padding: 8px 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
    }
    .field-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  `],
})
export class LeaveApprovalsComponent implements OnInit, OnDestroy {
  leaves: PendingLeave[] = [];
  loading = true;
  processing = new Set<string>();
  rejectId = '';
  rejectReason = '';
  private readonly destroy$ = new Subject<void>();

  constructor(private api: BranchApprovalsApiService, private cdr: ChangeDetectorRef, private toast: ToastService) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.api.listPendingLeaves()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: (list) => { this.loading = false; this.leaves = list; },
        error: () => { this.loading = false; this.leaves = []; },
      });
  }

  approve(lv: PendingLeave): void {
    if (this.processing.has(lv.id)) return; // prevent double-click
    this.processing.add(lv.id);
    this.api.approveLeave(lv.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.processing.delete(lv.id); this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: () => { this.processing.delete(lv.id); this.load(); },
        error: () => { this.processing.delete(lv.id); this.toast.error('Failed to approve leave application.'); },
      });
  }

  startReject(lv: PendingLeave): void {
    this.rejectId = lv.id;
    this.rejectReason = '';
  }

  confirmReject(): void {
    if (this.processing.has(this.rejectId)) return; // prevent double-click
    this.processing.add(this.rejectId);
    const id = this.rejectId;
    this.api.rejectLeave(id, this.rejectReason.trim())
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.processing.delete(id); this.rejectId = ''; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: () => { this.processing.delete(this.rejectId); this.rejectId = ''; this.load(); },
        error: () => { this.processing.delete(this.rejectId); this.rejectId = ''; this.toast.error('Failed to reject leave application.'); },
      });
  }
}

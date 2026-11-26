import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { BranchApprovalsApiService, PendingLeave } from './branch-approvals-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { describeApiError } from '../../../shared/utils/api-error.util';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  selector: 'app-leave-approvals',
  standalone: true,
  imports: [IconComponent, FormsModule, PageHeaderComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ui-page-header
        title="Leave Approvals"
        subtitle="Review pending leave applications"
        [breadcrumbs]="[{ label: 'Approvals Centre', route: '/client/approvals' }, { label: 'Leave Approvals' }]">
      </ui-page-header>

      @if (loading) {
<div class="text-gray-500 text-sm">Loading pending leave applications...</div>
}

      @if (!loading && loadError) {
        <div role="alert" class="text-sm text-red-600">
          Could not load leave approvals: {{ loadError }}
          <button type="button" class="standard-action btn-secondary" (click)="load()">Retry</button>
        </div>
      }
      @if (!loading && !loadError && !leaves.length) {
<div
           class="bg-white border rounded-xl p-8 text-center text-gray-500">
        No pending leave applications to review.
      </div>
}

      @if (!loading && leaves.length) {
<div class="section-card">
        <div class="table-wrap"><table class="data-table">
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
            @for (lv of leaves; track lv) {
<tr>
              <td class="font-medium">{{ lv.employeeName || lv.employeeCode || 'Employee name unavailable' }}</td>
              <td>{{ lv.leaveTypeCode }}</td>
              <td>{{ lv.fromDate }}</td>
              <td>{{ lv.toDate }}</td>
              <td class="text-right">{{ lv.numberOfDays }}</td>
              <td class="max-w-[180px] truncate" [title]="lv.reason || ''">{{ lv.reason || '-' }}</td>
              <td class="text-sm text-gray-500">{{ lv.appliedAt }}</td>
              <td class="text-right">
                <div class="flex justify-end gap-2">
                  <button (click)="approve(lv)" class="compact-action btn-approve" [disabled]="processing.has(lv.id)" title="Approve" aria-label="Approve" data-action-label="Approve" data-action-icon="check-circle"><ui-icon name="check-circle" [size]="20" /></button>
                  <button (click)="startReject(lv)" class="compact-action btn-reject" [disabled]="processing.has(lv.id)" title="Reject" aria-label="Reject" data-action-label="Reject" data-action-icon="x-circle"><ui-icon name="x-circle" [size]="20" /></button>
                </div>
              </td>
            </tr>
}
            <!-- Inline reject row -->
            @if (rejectId) {
<tr>
              <td colspan="8">
                <div class="reject-inline">
                  <label class="text-xs font-medium text-gray-600" for="la-reject-reason">Reason for rejection:</label>
                  <div class="flex gap-2 mt-1 items-start">
                    <textarea autocomplete="off" id="la-reject-reason" name="rejectReason" [(ngModel)]="rejectReason" rows="2" class="field-input flex-1"></textarea>
                    <button (click)="confirmReject()" class="standard-action btn-reject" [disabled]="!rejectReason.trim() || processing.has(rejectId)">
                      Confirm
                    </button>
                    <button (click)="rejectId = ''" class="standard-action btn-secondary">Cancel</button>
                  </div>
                </div>
              </td>
            </tr>
}
          </tbody>
        </table></div>
      </div>
}
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
      color: #5b6472;
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
  loadError = '';
  processing = new Set<string>();
  rejectId = '';
  rejectReason = '';
  private readonly destroy$ = new Subject<void>();
  private destroyed = false;
  private loadVersion = 0;
  private readonly completedAtLoad = new Map<string, number>();

  constructor(private api: BranchApprovalsApiService, private cdr: ChangeDetectorRef, private toast: ToastService) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    if (this.destroyed) return;
    const version = ++this.loadVersion;
    const current = () => !this.destroyed && version === this.loadVersion;
    this.loading = true;
    this.loadError = '';
    this.api.listPendingLeaves()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { if (current()) { this.loading = false; this.cdr.detectChanges(); } }),
      )
      .subscribe({
        next: (list) => { if (current()) this.leaves = list.filter(row => (this.completedAtLoad.get(row.id) ?? -1) < version); },
        error: (e) => { if (current()) { this.leaves = []; this.loadError = describeApiError(e, 'Please try again.'); } },
      });
  }

  approve(lv: PendingLeave): void {
    if (!this.canDecide(lv.id)) return;
    this.processing.add(lv.id);
    this.api.approveLeave(lv.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.processing.delete(lv.id); if (!this.destroyed) this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: () => this.completeDecision(lv.id),
        error: () => { this.processing.delete(lv.id); this.toast.error('Failed to approve leave application.'); },
      });
  }

  startReject(lv: PendingLeave): void {
    if (!this.canDecide(lv.id)) return;
    this.rejectId = lv.id;
    this.rejectReason = '';
  }

  confirmReject(): void {
    const id = this.rejectId;
    const reason = this.rejectReason.trim();
    if (!reason || !this.canDecide(id)) return;
    this.processing.add(id);
    this.api.rejectLeave(id, reason)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.processing.delete(id); if (!this.destroyed) this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: () => this.completeDecision(id),
        error: () => { this.toast.error('Failed to reject leave application.'); },
      });
  }

  private canDecide(id: string): boolean {
    return !this.destroyed && !this.loading && !this.loadError && !this.processing.has(id)
      && this.leaves.some(row => row.id === id);
  }

  private completeDecision(id: string): void {
    // Suppress only reads already pending when the decision completed.
    // A fresh server read may legitimately return a corrected resubmission.
    this.completedAtLoad.set(id, this.loadVersion);
    this.leaves = this.leaves.filter(row => row.id !== id);
    if (this.rejectId === id) { this.rejectId = ''; this.rejectReason = ''; }
  }
}

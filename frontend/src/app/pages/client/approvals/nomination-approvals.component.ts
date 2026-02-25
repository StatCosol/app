import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { BranchApprovalsApiService, PendingNomination } from './branch-approvals-api.service';

@Component({
  selector: 'app-nomination-approvals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-6xl mx-auto space-y-6">
      <h1 class="text-2xl font-bold text-gray-900">Nomination Approvals</h1>

      <div *ngIf="loading" class="text-gray-500 text-sm">Loading pending nominations...</div>

      <div *ngIf="!loading && !nominations.length"
           class="bg-white border rounded-xl p-8 text-center text-gray-500">
        No pending nominations to review.
      </div>

      <div *ngFor="let nom of nominations" class="approval-card">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <span class="type-badge">{{ nom.nominationType }}</span>
              <span class="text-sm font-medium text-gray-700">{{ nom.employeeName || nom.employeeId }}</span>
              <span *ngIf="nom.submittedAt" class="text-xs text-gray-400">Submitted {{ nom.submittedAt }}</span>
            </div>

            <div *ngIf="nom.members?.length" class="mb-2">
              <div class="member-grid header">
                <span>Nominee</span><span>Relationship</span><span>Share %</span>
              </div>
              <div *ngFor="let m of nom.members" class="member-grid">
                <span>{{ m.memberName }}</span>
                <span>{{ m.relationship || '-' }}</span>
                <span>{{ m.sharePct }}%</span>
              </div>
            </div>

            <div *ngIf="nom.witnessName" class="text-xs text-gray-500">
              Witness: {{ nom.witnessName }}
            </div>
          </div>

          <div class="flex flex-col gap-2 min-w-[160px]">
            <button (click)="approve(nom)" class="btn-approve" [disabled]="processing.has(nom.id)">
              Approve
            </button>
            <button (click)="startReject(nom)" class="btn-reject" [disabled]="processing.has(nom.id)">
              Reject
            </button>
          </div>
        </div>

        <!-- Reject reason input -->
        <div *ngIf="rejectId === nom.id" class="reject-reason">
          <label class="text-xs font-medium text-gray-600">Reason for rejection:</label>
          <textarea [(ngModel)]="rejectReason" rows="2" class="field-input mt-1"></textarea>
          <div class="flex gap-2 mt-2">
            <button (click)="confirmReject(nom)" class="btn-reject" [disabled]="!rejectReason.trim()">
              Confirm Reject
            </button>
            <button (click)="rejectId = ''" class="btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .approval-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px 20px;
    }
    .type-badge {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      background: #e0ecff;
      color: #1d4ed8;
      padding: 4px 10px;
      border-radius: 999px;
    }
    .member-grid {
      display: grid;
      grid-template-columns: 2fr 1.5fr 1fr;
      gap: 8px;
      font-size: 13px;
      padding: 4px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .member-grid.header {
      font-weight: 600;
      color: #374151;
      border-bottom-color: #d1d5db;
    }
    .btn-approve {
      background: #059669;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      border: none;
      cursor: pointer;
    }
    .btn-approve:hover { opacity: 0.9; }
    .btn-approve:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-reject {
      background: #dc2626;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      border: none;
      cursor: pointer;
    }
    .btn-reject:hover { opacity: 0.9; }
    .btn-reject:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      border: 1px solid #d1d5db;
      cursor: pointer;
    }
    .reject-reason {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
    }
    .field-input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
    }
    .field-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  `],
})
export class NominationApprovalsComponent implements OnInit, OnDestroy {
  nominations: PendingNomination[] = [];
  loading = true;
  processing = new Set<string>();
  rejectId = '';
  rejectReason = '';
  private readonly destroy$ = new Subject<void>();

  constructor(private api: BranchApprovalsApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.api.listPendingNominations()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: (list) => { this.loading = false; this.nominations = list; },
        error: () => { this.loading = false; this.nominations = []; },
      });
  }

  approve(nom: PendingNomination): void {
    if (this.processing.has(nom.id)) return; // prevent double-click
    this.processing.add(nom.id);
    this.api.approveNomination(nom.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.processing.delete(nom.id); this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: () => { this.processing.delete(nom.id); this.load(); },
        error: () => { this.processing.delete(nom.id); alert('Failed to approve nomination.'); },
      });
  }

  startReject(nom: PendingNomination): void {
    this.rejectId = nom.id;
    this.rejectReason = '';
  }

  confirmReject(nom: PendingNomination): void {
    if (this.processing.has(nom.id)) return; // prevent double-click
    this.processing.add(nom.id);
    this.api.rejectNomination(nom.id, this.rejectReason.trim())
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.processing.delete(nom.id); this.rejectId = ''; this.cdr.detectChanges(); }),
      )
      .subscribe({
        next: () => { this.processing.delete(nom.id); this.rejectId = ''; this.load(); },
        error: () => { this.processing.delete(nom.id); this.rejectId = ''; alert('Failed to reject nomination.'); },
      });
  }
}

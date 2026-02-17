import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { finalize, timeout } from 'rxjs/operators';
import { AdminUsersApi } from '../../../core/api/admin-users.api';
import { ShortIdPipe } from '../../../shared/pipes/short-id.pipe';

@Component({
  selector: 'app-cco-approvals',
  standalone: true,
  imports: [CommonModule, ShortIdPipe],
  template: `
    <div class="page">
      <h2>My Approvals</h2>

      <div class="card">
        <div class="header-row">
          <h3>Pending Deletion Requests</h3>
          <button (click)="load()" [disabled]="loading">Refresh</button>
        </div>

        <div *ngIf="error" class="error">{{ error }}</div>

        <table class="tbl" *ngIf="requests.length; else empty">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Requested By</th>
              <th>Required Role</th>
              <th>Specific Approver</th>
              <th>Requested At</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of requests">
              <td>
                <div>{{ r.entityLabel || r.entityType }}</div>
              </td>
              <td>
                <div>{{ r.requestedByUserName || r.requestedByUserEmail || 'Unknown user' }}</div>
                <div class="sub" *ngIf="r.requestedByUserEmail">{{ r.requestedByUserEmail }}</div>
              </td>
              <td>{{ r.requiredApproverRole }}</td>
              <td>{{ r.requiredApproverUserId ? (r.requiredApproverUserId | shortId) : '-' }}</td>
              <td>{{ r.requestedAt | date: 'short' }}</td>
              <td>
                <button (click)="approve(r)" [disabled]="loading">Approve</button>
              </td>
            </tr>
          </tbody>
        </table>

        <ng-template #empty>
          <p>No pending approvals.</p>
        </ng-template>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 16px; max-width: 960px; margin: 0 auto; }
    .card { border: 1px solid #ddd; border-radius: 10px; padding: 14px; margin-bottom: 14px; }
    .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .tbl { width: 100%; border-collapse: collapse; }
    .tbl th, .tbl td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; vertical-align: top; }
    .error { color: #b00020; margin-bottom: 10px; }
    .sub { font-size: 12px; color: #555; }
    button { padding: 6px 10px; border-radius: 6px; border: 1px solid #999; background: #f6f6f6; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
  `],
})
export class CcoApprovalsComponent implements OnInit {
  loading = false;
  error = '';
  requests: Array<{
    id: string;
    entityType: string;
    entityId: string;
    requestedByUserId: string;
    requiredApproverRole: string;
    requiredApproverUserId: string | null;
    status: string;
    requestedAt: string;
    entityLabel?: string | null;
    requestedByUserName?: string | null;
    requestedByUserEmail?: string | null;
  }> = [];

  constructor(private adminApi: AdminUsersApi, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.error = '';
    this.loading = true;
    this.adminApi.getPendingApprovals().pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (rows) => {
        // Backend approval IDs are UUID strings. Some older payloads may contain numeric IDs;
        // normalize to string so UI + API calls are type-safe.
        this.requests = (rows || []).map((r: any) => ({ ...r, id: String(r.id) }));
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load approvals';
        this.cdr.detectChanges();
      },
    });
  }

  approve(r: { id: string }): void {
    if (!confirm('Approve this deletion request?')) return;
    this.loading = true;
    this.error = '';
    this.adminApi.approveDeletionRequest(r.id).pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        // Remove from local list
        this.requests = this.requests.filter((x) => x.id !== r.id);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to approve request';
        this.cdr.detectChanges();
      },
    });
  }
}

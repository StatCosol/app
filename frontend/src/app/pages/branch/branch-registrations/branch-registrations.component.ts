import {
  Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../../core/client-branches.service';
import { AuthService } from '../../../core/auth.service';

interface RegistrationItem {
  id: string;
  type: string;
  registrationNumber: string;
  issuedDate: string;
  expiryDate: string;
  status: 'Active' | 'Expiring Soon' | 'Expired';
  daysRemaining: number;
  authority: string;
}

@Component({
  selector: 'app-branch-registrations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Registrations &amp; Licenses</h1>
          <p class="page-subtitle">Track all branch registrations, licenses, and their expiry dates</p>
        </div>
        <div class="flex items-center gap-3">
          <select [(ngModel)]="statusFilter" (change)="applyFilter()" class="filter-select">
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Expiring Soon">Expiring Soon</option>
            <option value="Expired">Expired</option>
          </select>
        </div>
      </div>

      <!-- Status summary -->
      <div class="summary-strip">
        <div class="summary-card border-l-4 border-emerald-500">
          <span class="summary-value text-emerald-600">{{ activeCount }}</span>
          <span class="summary-label">Active</span>
        </div>
        <div class="summary-card border-l-4 border-amber-500">
          <span class="summary-value text-amber-600">{{ expiringCount }}</span>
          <span class="summary-label">Expiring Soon</span>
        </div>
        <div class="summary-card border-l-4 border-red-500">
          <span class="summary-value text-red-600">{{ expiredCount }}</span>
          <span class="summary-label">Expired</span>
        </div>
        <div class="summary-card border-l-4 border-blue-500">
          <span class="summary-value text-blue-600">{{ registrations.length }}</span>
          <span class="summary-label">Total</span>
        </div>
      </div>

      <!-- Registrations table -->
      <div class="table-card">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Registration / License</th>
                <th>Registration No.</th>
                <th>Issuing Authority</th>
                <th>Issued Date</th>
                <th>Expiry Date</th>
                <th>Days Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of filteredItems; trackBy: trackById" class="data-row">
                <td class="font-medium text-slate-800">{{ item.type }}</td>
                <td class="text-slate-600 font-mono text-xs">{{ item.registrationNumber }}</td>
                <td class="text-slate-600">{{ item.authority }}</td>
                <td class="text-slate-500">{{ item.issuedDate }}</td>
                <td class="font-medium" [class.text-red-600]="item.status === 'Expired'" [class.text-amber-600]="item.status === 'Expiring Soon'">{{ item.expiryDate }}</td>
                <td>
                  <span *ngIf="item.daysRemaining >= 0" class="text-sm font-semibold"
                        [class.text-emerald-600]="item.daysRemaining > 30"
                        [class.text-amber-600]="item.daysRemaining > 0 && item.daysRemaining <= 30"
                        [class.text-red-600]="item.daysRemaining === 0">
                    {{ item.daysRemaining }} days
                  </span>
                  <span *ngIf="item.daysRemaining < 0" class="text-sm font-semibold text-red-600">
                    {{ -item.daysRemaining }} days overdue
                  </span>
                </td>
                <td>
                  <span class="expiry-badge"
                    [class.badge-active]="item.status === 'Active'"
                    [class.badge-expiring]="item.status === 'Expiring Soon'"
                    [class.badge-expired]="item.status === 'Expired'">
                    {{ item.status }}
                  </span>
                </td>
              </tr>
              <tr *ngIf="filteredItems.length === 0">
                <td colspan="7" class="text-center text-slate-400 py-12">
                  <svg class="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z"/>
                  </svg>
                  No registrations found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Info note -->
      <div class="info-note">
        <svg class="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-xs text-slate-500">
          Registration data is managed by your compliance manager. Contact the helpdesk if any registration information is incorrect or missing.
          Items expiring within 30 days are marked as "Expiring Soon".
        </p>
      </div>
    </div>
  `,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
    .page-title { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
    .page-subtitle { font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
    .filter-select { padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.8125rem; background: white; cursor: pointer; }
    .summary-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
    @media (max-width: 640px) { .summary-strip { grid-template-columns: repeat(2, 1fr); } }
    .summary-card { background: white; border-radius: 0.75rem; padding: 1rem; text-align: center; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .summary-value { display: block; font-size: 1.5rem; font-weight: 800; }
    .summary-label { display: block; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.25rem; }
    .table-card { background: white; border-radius: 1rem; border: 1px solid #f1f5f9; box-shadow: 0 1px 4px rgba(0,0,0,0.04); overflow: hidden; margin-bottom: 1rem; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { text-align: left; padding: 0.75rem 1rem; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; background: #f8fafc; border-bottom: 2px solid #f1f5f9; }
    .data-table td { padding: 0.75rem 1rem; font-size: 0.8125rem; border-bottom: 1px solid #f8fafc; }
    .data-row:hover { background: #f8fafc; }
    .expiry-badge { display: inline-flex; padding: 0.25rem 0.625rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
    .badge-active { background: #d1fae5; color: #065f46; }
    .badge-expiring { background: #fef3c7; color: #92400e; }
    .badge-expired { background: #fee2e2; color: #991b1b; }
    .info-note { display: flex; gap: 0.5rem; padding: 0.75rem 1rem; background: #eff6ff; border-radius: 0.75rem; border: 1px solid #dbeafe; }
  `]
})
export class BranchRegistrationsComponent implements OnInit {
  statusFilter = 'all';
  registrations: RegistrationItem[] = [];
  filteredItems: RegistrationItem[] = [];
  activeCount = 0;
  expiringCount = 0;
  expiredCount = 0;
  loading = true;

  constructor(
    private cdr: ChangeDetectorRef,
    private branchSvc: ClientBranchesService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    const branchIds = this.auth.getBranchIds();
    if (!branchIds.length) { this.loading = false; this.cdr.markForCheck(); return; }
    const branchId = branchIds[0];

    this.branchSvc.listRegistrations(branchId).subscribe({
      next: (rows) => {
        this.registrations = (rows || []).map((r: any) => this.mapRow(r));
        this.computeCounts();
        this.applyFilter();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  private mapRow(r: any): RegistrationItem {
    const days = Number(r.daysRemaining ?? 0);
    let status: 'Active' | 'Expiring Soon' | 'Expired';
    const cs = r.computedStatus;
    if (cs === 'EXPIRED') status = 'Expired';
    else if (cs === 'EXPIRING_SOON') status = 'Expiring Soon';
    else status = 'Active';

    const fmt = (d: any) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    return {
      id: r.id,
      type: r.type || '',
      registrationNumber: r.registrationNumber || '—',
      authority: r.authority || '—',
      issuedDate: fmt(r.issuedDate),
      expiryDate: r.expiryDate ? fmt(r.expiryDate) : 'No Expiry',
      status,
      daysRemaining: days,
    };
  }

  applyFilter(): void {
    if (this.statusFilter === 'all') {
      this.filteredItems = [...this.registrations];
    } else {
      this.filteredItems = this.registrations.filter(r => r.status === this.statusFilter);
    }
    this.cdr.markForCheck();
  }

  trackById(_: number, item: RegistrationItem): string { return item.id; }

  private computeCounts(): void {
    this.activeCount = this.registrations.filter(r => r.status === 'Active').length;
    this.expiringCount = this.registrations.filter(r => r.status === 'Expiring Soon').length;
    this.expiredCount = this.registrations.filter(r => r.status === 'Expired').length;
  }

}

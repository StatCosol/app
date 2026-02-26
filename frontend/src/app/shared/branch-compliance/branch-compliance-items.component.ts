import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';
import {
  BranchComplianceService,
  BranchComplianceResponse,
  ComplianceScheduleEntry,
} from './branch-compliance.service';

@Component({
  selector: 'app-branch-compliance-items',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DatePipe],
  template: `
    <div class="page-container">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Branch Compliance Schedule</h1>
          <p class="page-subtitle" *ngIf="data">
            {{ data.branchName }} &middot; {{ data.stateCode | uppercase }} &middot; {{ data.establishmentType }}
          </p>
        </div>

        <!-- Month picker -->
        <div class="flex items-center gap-3">
          <button class="btn-icon" (click)="prevMonth()" title="Previous month">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <input
            type="month"
            class="month-input"
            [ngModel]="selectedMonth"
            (ngModelChange)="onMonthChange($event)"
          />
          <button class="btn-icon" (click)="nextMonth()" title="Next month">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Branch selector (for client portal with multiple branches) -->
      <div *ngIf="branchIds.length > 1 && !fixedBranchId" class="branch-selector">
        <label class="text-sm font-medium text-gray-600">Branch</label>
        <select class="select-input" [(ngModel)]="selectedBranchId" (ngModelChange)="load()">
          <option *ngFor="let id of branchIds" [value]="id">{{ id }}</option>
        </select>
      </div>

      <!-- Loading skeleton -->
      <div *ngIf="loading" class="space-y-3 mt-6">
        <div *ngFor="let i of [1,2,3,4,5]" class="skeleton-row"></div>
      </div>

      <!-- Error -->
      <div *ngIf="error && !loading" class="error-banner mt-6">
        <svg class="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <span>{{ error }}</span>
      </div>

      <!-- Empty state -->
      <div *ngIf="!loading && !error && data && data.items.length === 0" class="empty-state mt-6">
        <svg class="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-gray-500">No compliance items applicable for this branch in {{ selectedMonth }}.</p>
      </div>

      <!-- Results -->
      <div *ngIf="!loading && !error && data && data.items.length > 0" class="mt-6 space-y-6">
        <!-- Summary cards -->
        <div class="summary-grid">
          <div class="summary-card summary-card--returns">
            <span class="summary-count">{{ returnsItems.length }}</span>
            <span class="summary-label">Returns / Payments</span>
          </div>
          <div class="summary-card summary-card--mcd">
            <span class="summary-count">{{ mcdItems.length }}</span>
            <span class="summary-label">MCD / Document</span>
          </div>
        </div>

        <!-- Returns section -->
        <div *ngIf="returnsItems.length" class="section-card">
          <h2 class="section-title">
            <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6M9 8h6m2-4H7l-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2z"/>
            </svg>
            Returns &amp; Payments Due
          </h2>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Compliance</th>
                  <th>Module</th>
                  <th>Frequency</th>
                  <th>Due Date</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of returnsItems" class="table-row">
                  <td class="font-medium">{{ item.name }}</td>
                  <td>{{ item.module }}</td>
                  <td>
                    <span class="freq-badge" [ngClass]="'freq--' + item.frequency.toLowerCase()">
                      {{ item.frequency }}
                    </span>
                  </td>
                  <td class="font-mono text-sm">{{ item.dueDate | date:'dd MMM yyyy' }}</td>
                  <td>
                    <span class="priority-badge" [ngClass]="'priority--' + item.priority.toLowerCase()">
                      {{ item.priority }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- MCD section -->
        <div *ngIf="mcdItems.length" class="section-card">
          <h2 class="section-title">
            <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            Monthly Compliance Documents
          </h2>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Compliance</th>
                  <th>Module</th>
                  <th>Window Open</th>
                  <th>Window Close</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of mcdItems" class="table-row">
                  <td class="font-medium">{{ item.name }}</td>
                  <td>{{ item.module }}</td>
                  <td class="font-mono text-sm">{{ item.windowOpen | date:'dd MMM yyyy' }}</td>
                  <td class="font-mono text-sm">{{ item.windowClose | date:'dd MMM yyyy' }}</td>
                  <td>
                    <span class="priority-badge" [ngClass]="'priority--' + item.priority.toLowerCase()">
                      {{ item.priority }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 20px 48px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 16px;
    }

    .page-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1e293b;
    }

    .page-subtitle {
      font-size: 0.875rem;
      color: #64748b;
      margin-top: 4px;
    }

    .btn-icon {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      background: #fff;
      cursor: pointer;
      color: #475569;
      transition: all 0.15s;
    }
    .btn-icon:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }

    .month-input {
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      font-size: 0.875rem;
      font-weight: 500;
      color: #334155;
      background: #fff;
    }

    .branch-selector {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 16px;
    }

    .select-input {
      padding: 6px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      background: #fff;
      color: #334155;
    }

    .skeleton-row {
      height: 48px;
      border-radius: 8px;
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .error-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 10px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
      font-size: 0.875rem;
    }

    .empty-state {
      text-align: center;
      padding: 48px 24px;
      background: #fafafa;
      border-radius: 12px;
      border: 1px dashed #e2e8f0;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
    }

    .summary-card {
      padding: 20px;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .summary-card--returns {
      background: linear-gradient(135deg, #eff6ff, #dbeafe);
      border: 1px solid #bfdbfe;
    }
    .summary-card--mcd {
      background: linear-gradient(135deg, #ecfdf5, #d1fae5);
      border: 1px solid #a7f3d0;
    }
    .summary-count {
      font-size: 2rem;
      font-weight: 700;
      color: #1e293b;
    }
    .summary-label {
      font-size: 0.8rem;
      color: #64748b;
      font-weight: 500;
    }

    .section-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px 20px;
      font-size: 1rem;
      font-weight: 600;
      color: #1e293b;
      border-bottom: 1px solid #f1f5f9;
    }

    .table-wrapper {
      overflow-x: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    .data-table th {
      text-align: left;
      padding: 10px 16px;
      font-weight: 600;
      color: #64748b;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .data-table td {
      padding: 12px 16px;
      color: #334155;
      border-bottom: 1px solid #f1f5f9;
    }

    .table-row:hover {
      background: #f8fafc;
    }

    .freq-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .freq--monthly { background: #dbeafe; color: #1e40af; }
    .freq--half_yearly { background: #fef3c7; color: #92400e; }
    .freq--yearly { background: #e0e7ff; color: #3730a3; }
    .freq--window { background: #d1fae5; color: #065f46; }

    .priority-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .priority--critical { background: #fef2f2; color: #991b1b; }
    .priority--high { background: #fff7ed; color: #9a3412; }
    .priority--medium { background: #fefce8; color: #854d0e; }
    .priority--low { background: #f0fdf4; color: #166534; }
  `],
})
export class BranchComplianceItemsComponent implements OnInit, OnDestroy {
  loading = false;
  error = '';
  data: BranchComplianceResponse | null = null;
  selectedMonth = '';
  selectedBranchId = '';
  branchIds: string[] = [];
  fixedBranchId = '';

  private destroy$ = new Subject<void>();

  constructor(
    private api: BranchComplianceService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // Default to current month
    const now = new Date();
    this.selectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // If route has branchId param (branch portal), use it directly
    const paramBranch = this.route.snapshot.paramMap.get('branchId');
    if (paramBranch) {
      this.fixedBranchId = paramBranch;
      this.selectedBranchId = paramBranch;
    } else {
      // Client portal: use branchIds from token
      this.branchIds = this.auth.getBranchIds().map(String);
      if (this.branchIds.length === 1) {
        this.fixedBranchId = this.branchIds[0];
      }
      this.selectedBranchId = this.branchIds[0] || '';
    }

    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    if (!this.selectedBranchId || !this.selectedMonth) return;

    this.loading = true;
    this.error = '';
    this.data = null;

    this.api
      .getComplianceItems(this.selectedBranchId, this.selectedMonth)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: (res) => (this.data = res),
        error: (err) => (this.error = err?.error?.message || 'Failed to load compliance items.'),
      });
  }

  get returnsItems(): ComplianceScheduleEntry[] {
    return (this.data?.items || []).filter((i) => i.module === 'RETURNS');
  }

  get mcdItems(): ComplianceScheduleEntry[] {
    return (this.data?.items || []).filter((i) => i.module === 'MCD');
  }

  onMonthChange(val: string): void {
    this.selectedMonth = val;
    this.load();
  }

  prevMonth(): void {
    const d = new Date(this.selectedMonth + '-01');
    d.setMonth(d.getMonth() - 1);
    this.selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.load();
  }

  nextMonth(): void {
    const d = new Date(this.selectedMonth + '-01');
    d.setMonth(d.getMonth() + 1);
    this.selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.load();
  }
}

import {
  Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LegitxDashboardService } from '../../../core/legitx-dashboard.service';
import { AuthService } from '../../../core/auth.service';

@Component({
  selector: 'app-branch-employees',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Employees</h1>
          <p class="page-subtitle">Employee headcount, PF &amp; ESIC registration status</p>
        </div>
        <div class="flex items-center gap-3">
          <input type="text" [(ngModel)]="searchQuery" (input)="filterEmployees()" placeholder="Search employees..." class="search-input" />
          <select [(ngModel)]="statusFilter" (change)="filterEmployees()" class="filter-select">
            <option value="all">All Status</option>
            <option value="pf-pending">PF Pending</option>
            <option value="esi-pending">ESIC Pending</option>
            <option value="registered">Fully Registered</option>
          </select>
        </div>
      </div>

      <!-- Summary cards -->
      <div class="summary-strip">
        <div class="summary-card">
          <span class="summary-value text-blue-600">{{ totalEmployees }}</span>
          <span class="summary-label">Total Employees</span>
        </div>
        <div class="summary-card">
          <span class="summary-value text-blue-700">{{ maleCount }}</span>
          <span class="summary-label">Male</span>
        </div>
        <div class="summary-card">
          <span class="summary-value text-pink-600">{{ femaleCount }}</span>
          <span class="summary-label">Female</span>
        </div>
        <div class="summary-card">
          <span class="summary-value text-amber-600">{{ pfPendingCount }}</span>
          <span class="summary-label">PF Pending</span>
        </div>
        <div class="summary-card">
          <span class="summary-value text-red-600">{{ esiPendingCount }}</span>
          <span class="summary-label">ESI Pending</span>
        </div>
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="flex items-center justify-center py-20">
        <div class="spinner"></div>
      </div>

      <!-- Employee table -->
      <div *ngIf="!loading" class="table-card">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Gender</th>
                <th>Contractor</th>
                <th>PF Status</th>
                <th>ESIC Status</th>
                <th>UAN</th>
                <th>ESIC No</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let emp of filteredEmployees; trackBy: trackByIndex" class="data-row">
                <td class="font-medium text-slate-800">{{ emp.name || '—' }}</td>
                <td>
                  <span class="badge" [class.bg-blue-100]="emp.gender === 'Male'" [class.text-blue-700]="emp.gender === 'Male'"
                        [class.bg-pink-100]="emp.gender === 'Female'" [class.text-pink-700]="emp.gender === 'Female'">
                    {{ emp.gender || '—' }}
                  </span>
                </td>
                <td class="text-slate-600">{{ emp.contractorName || '—' }}</td>
                <td>
                  <span class="badge" [class.bg-emerald-100]="emp.pfRegistered" [class.text-emerald-700]="emp.pfRegistered"
                        [class.bg-amber-100]="!emp.pfRegistered" [class.text-amber-700]="!emp.pfRegistered">
                    {{ emp.pfRegistered ? 'Registered' : 'Pending' }}
                  </span>
                </td>
                <td>
                  <span class="badge" [class.bg-emerald-100]="emp.esiRegistered" [class.text-emerald-700]="emp.esiRegistered"
                        [class.bg-red-100]="!emp.esiRegistered" [class.text-red-700]="!emp.esiRegistered">
                    {{ emp.esiRegistered ? 'Registered' : 'Pending' }}
                  </span>
                </td>
                <td class="text-slate-500 font-mono text-xs">{{ emp.uan || '—' }}</td>
                <td class="text-slate-500 font-mono text-xs">{{ emp.esicNumber || '—' }}</td>
              </tr>
              <tr *ngIf="filteredEmployees.length === 0">
                <td colspan="7" class="text-center text-slate-400 py-12">
                  <svg class="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
                  </svg>
                  No employees match the current filter
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; }
    .page-title { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
    .page-subtitle { font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
    .search-input {
      padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.8125rem; width: 220px;
      &:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
    }
    .filter-select {
      padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.8125rem; background: white; cursor: pointer;
    }
    .summary-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
    @media (max-width: 768px) { .summary-strip { grid-template-columns: repeat(2, 1fr); } }
    .summary-card { background: white; border-radius: 0.75rem; padding: 1rem; text-align: center; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .summary-value { display: block; font-size: 1.5rem; font-weight: 800; }
    .summary-label { display: block; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.25rem; }
    .table-card { background: white; border-radius: 1rem; border: 1px solid #f1f5f9; box-shadow: 0 1px 4px rgba(0,0,0,0.04); overflow: hidden; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { text-align: left; padding: 0.75rem 1rem; font-size: 0.6875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; background: #f8fafc; border-bottom: 2px solid #f1f5f9; }
    .data-table td { padding: 0.75rem 1rem; font-size: 0.8125rem; border-bottom: 1px solid #f8fafc; }
    .data-row:hover { background: #f8fafc; }
    .badge { display: inline-flex; padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 600; }
    .spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class BranchEmployeesComponent implements OnInit {
  loading = true;
  searchQuery = '';
  statusFilter = 'all';
  employees: any[] = [];
  filteredEmployees: any[] = [];
  totalEmployees = 0;
  maleCount = 0;
  femaleCount = 0;
  pfPendingCount = 0;
  esiPendingCount = 0;

  constructor(
    private cdr: ChangeDetectorRef,
    private legitxService: LegitxDashboardService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    const branchIds = this.authService.getBranchIds();
    const branchId = branchIds?.[0] || '';
    const now = new Date();

    this.legitxService.getSummary({
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      branchId: branchId || undefined,
    }).subscribe({
      next: (resp: any) => {
        const kpis = resp?.kpis;
        this.totalEmployees = kpis?.employees?.total || 0;
        this.maleCount = kpis?.employees?.male || 0;
        this.femaleCount = kpis?.employees?.female || 0;
        this.pfPendingCount = kpis?.payroll?.pfPending || 0;
        this.esiPendingCount = kpis?.payroll?.esiPending || 0;

        // If there are employee details in the response, use them
        // Otherwise build summary from KPI data
        this.employees = resp?.employees || [];
        this.filteredEmployees = [...this.employees];
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  filterEmployees(): void {
    let filtered = [...this.employees];
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.contractorName || '').toLowerCase().includes(q)
      );
    }
    if (this.statusFilter === 'pf-pending') filtered = filtered.filter(e => !e.pfRegistered);
    else if (this.statusFilter === 'esi-pending') filtered = filtered.filter(e => !e.esiRegistered);
    else if (this.statusFilter === 'registered') filtered = filtered.filter(e => e.pfRegistered && e.esiRegistered);
    this.filteredEmployees = filtered;
    this.cdr.markForCheck();
  }

  trackByIndex(i: number): number { return i; }
}

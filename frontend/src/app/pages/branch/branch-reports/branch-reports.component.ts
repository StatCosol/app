import { Component, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, finalize, timeout } from 'rxjs/operators';

interface ReportItem {
  name: string;
  description: string;
  icon: string;
  category: string;
  available: boolean;
  key?: string; // endpoint key for loading data
}

@Component({
  selector: 'app-branch-reports',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Reports</h1>
          <p class="page-subtitle">Generate and download branch compliance reports</p>
        </div>
      </div>

      <!-- Report categories -->
      <div *ngFor="let category of categories" class="report-category">
        <h2 class="category-title">{{ category }}</h2>
        <div class="report-grid">
          <div *ngFor="let report of getReportsForCategory(category)"
               class="report-card"
               [class.cursor-pointer]="report.available"
               (click)="report.available ? openReport(report) : null">
            <div class="report-icon">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" [attr.d]="report.icon"/>
              </svg>
            </div>
            <div>
              <h3 class="report-name">{{ report.name }}</h3>
              <p class="report-desc">{{ report.description }}</p>
            </div>
            <svg *ngIf="report.available" class="w-5 h-5 text-slate-400 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- ══════════ Report Data Drawer ══════════ -->
      <div *ngIf="activeReport" class="report-drawer">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900">{{ activeReport.name }}</h2>
          <button (click)="closeReport()" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div *ngIf="reportLoading" class="text-center py-8 text-gray-500">Loading...</div>

        <!-- Summary cards -->
        <div *ngIf="!reportLoading && reportSummary" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div *ngFor="let s of summaryPairs" class="bg-gray-50 rounded-lg p-3 text-center">
            <p class="text-xl font-bold text-gray-900">{{ s.value }}</p>
            <p class="text-xs text-gray-500">{{ s.label }}</p>
          </div>
        </div>

        <!-- Registration Expiry Table -->
        <div *ngIf="!reportLoading && activeReport.key === 'registration-expiry' && reportData.length > 0" class="overflow-x-auto">
          <table class="min-w-full text-sm divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-3 py-2 text-left font-medium text-gray-600">Branch</th>
                <th class="px-3 py-2 text-left font-medium text-gray-600">Type</th>
                <th class="px-3 py-2 text-left font-medium text-gray-600">Reg #</th>
                <th class="px-3 py-2 text-left font-medium text-gray-600">Expiry</th>
                <th class="px-3 py-2 text-left font-medium text-gray-600">Days Left</th>
                <th class="px-3 py-2 text-left font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr *ngFor="let r of reportData" class="hover:bg-gray-50">
                <td class="px-3 py-2">{{ r.branchName }}</td>
                <td class="px-3 py-2 font-medium">{{ r.type }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ r.registrationNumber || '—' }}</td>
                <td class="px-3 py-2">{{ r.expiryDate | date:'mediumDate' }}</td>
                <td class="px-3 py-2 font-semibold"
                  [ngClass]="{
                    'text-red-600': r.daysUntilExpiry !== null && r.daysUntilExpiry < 0,
                    'text-amber-600': r.daysUntilExpiry !== null && r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30,
                    'text-green-600': r.daysUntilExpiry !== null && r.daysUntilExpiry > 30
                  }">
                  {{ r.daysUntilExpiry !== null ? r.daysUntilExpiry : '—' }}
                </td>
                <td class="px-3 py-2">
                  <span class="inline-flex text-xs font-medium px-2 py-0.5 rounded-full"
                    [ngClass]="{
                      'bg-red-100 text-red-700': r.expiryStatus === 'EXPIRED',
                      'bg-amber-100 text-amber-700': r.expiryStatus === 'EXPIRING_SOON',
                      'bg-yellow-100 text-yellow-700': r.expiryStatus === 'EXPIRING',
                      'bg-green-100 text-green-700': r.expiryStatus === 'ACTIVE' || r.expiryStatus === 'NO_EXPIRY'
                    }">
                    {{ formatExpiryStatus(r.expiryStatus) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Audit Observations Table -->
        <div *ngIf="!reportLoading && activeReport.key === 'audit-observations' && reportData.length > 0" class="overflow-x-auto">
          <table class="min-w-full text-sm divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-3 py-2 text-left font-medium text-gray-600">Audit</th>
                <th class="px-3 py-2 text-left font-medium text-gray-600">Branch</th>
                <th class="px-3 py-2 text-left font-medium text-gray-600">Observation</th>
                <th class="px-3 py-2 text-left font-medium text-gray-600">Risk</th>
                <th class="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                <th class="px-3 py-2 text-left font-medium text-gray-600">Age (d)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr *ngFor="let o of reportData" class="hover:bg-gray-50">
                <td class="px-3 py-2 font-mono text-xs">{{ o.auditCode || '—' }}</td>
                <td class="px-3 py-2">{{ o.branchName || '—' }}</td>
                <td class="px-3 py-2 max-w-xs truncate" [title]="o.observation">{{ o.observation }}</td>
                <td class="px-3 py-2">
                  <span class="inline-flex text-xs font-semibold px-2 py-0.5 rounded-full"
                    [ngClass]="{
                      'bg-red-100 text-red-700': o.risk === 'CRITICAL',
                      'bg-orange-100 text-orange-700': o.risk === 'HIGH',
                      'bg-yellow-100 text-yellow-700': o.risk === 'MEDIUM',
                      'bg-green-100 text-green-700': o.risk === 'LOW',
                      'bg-gray-100 text-gray-600': !o.risk
                    }">
                    {{ o.risk || 'Unrated' }}
                  </span>
                </td>
                <td class="px-3 py-2">
                  <span class="inline-flex text-xs font-medium px-2 py-0.5 rounded-full"
                    [ngClass]="{
                      'bg-red-100 text-red-700': o.status === 'OPEN',
                      'bg-amber-100 text-amber-700': o.status === 'ACKNOWLEDGED',
                      'bg-green-100 text-green-700': o.status === 'RESOLVED' || o.status === 'CLOSED'
                    }">
                    {{ o.status }}
                  </span>
                </td>
                <td class="px-3 py-2 font-semibold"
                  [ngClass]="{
                    'text-red-600': o.ageDays > 30,
                    'text-amber-600': o.ageDays > 14 && o.ageDays <= 30,
                    'text-gray-600': o.ageDays <= 14
                  }">
                  {{ o.ageDays }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div *ngIf="!reportLoading && reportData.length === 0" class="text-center text-gray-500 py-8">
          No data found for this report.
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container { max-width: 1280px; margin: 0 auto; }
    .page-header { margin-bottom: 1.5rem; }
    .page-title { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
    .page-subtitle { font-size: 0.8125rem; color: #64748b; margin-top: 0.25rem; }
    .report-category { margin-bottom: 1.5rem; }
    .category-title { font-size: 0.875rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; padding-left: 0.25rem; }
    .report-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 0.75rem; }
    .report-card {
      display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem;
      background: white; border-radius: 0.75rem; border: 1px solid #f1f5f9;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04); transition: all 0.15s;
    }
    .report-card:hover { border-color: #3b82f6; box-shadow: 0 2px 8px rgba(59,130,246,0.12); }
    .report-icon { width: 44px; height: 44px; border-radius: 10px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; color: #3b82f6; flex-shrink: 0; }
    .report-name { font-size: 0.875rem; font-weight: 600; color: #1e293b; }
    .report-desc { font-size: 0.75rem; color: #64748b; margin-top: 0.125rem; }
    .report-drawer {
      margin-top: 1.5rem; padding: 1.5rem; background: white; border-radius: 0.75rem;
      border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    }
  `]
})
export class BranchReportsComponent {
  private destroy$ = new Subject<void>();
  activeReport: ReportItem | null = null;
  reportData: any[] = [];
  reportSummary: any = null;
  reportLoading = false;
  summaryPairs: { label: string; value: any }[] = [];

  reports: ReportItem[] = [
    { name: 'Monthly Compliance Summary', description: 'PF, ESIC, PT, LWF challan summary for selected month', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', category: 'Compliance', available: true },
    { name: 'PF/ESIC Registration Status', description: 'Employee-wise PF and ESIC registration tracker', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', category: 'Compliance', available: true },
    { name: 'Headcount Report', description: 'Employee and contractor headcount with M/F breakdown', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', category: 'Workforce', available: true },
    { name: 'Contractor Upload Summary', description: 'Document upload % by contractor for selected month', icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12', category: 'Workforce', available: true },
    { name: 'Registration Expiry Report', description: 'All registrations with expiry dates and renewal status', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', category: 'Registrations', available: true, key: 'registration-expiry' },
    { name: 'Audit Observation Report', description: 'Open/closed observations with aging analysis', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', category: 'Audits', available: true, key: 'audit-observations' },
  ];

  categories = [...new Set(this.reports.map(r => r.category))];

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  getReportsForCategory(cat: string): ReportItem[] {
    return this.reports.filter(r => r.category === cat);
  }

  openReport(report: ReportItem): void {
    if (!report.key) return; // static reports don't have a backend endpoint yet
    this.activeReport = report;
    this.reportData = [];
    this.reportSummary = null;
    this.summaryPairs = [];
    this.reportLoading = true;
    this.cdr.markForCheck();

    this.http
      .get<any>(`/api/v1/branch/reports/${report.key}`)
      .pipe(
        takeUntil(this.destroy$),
        timeout(15000),
        finalize(() => {
          this.reportLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          this.reportData = res?.data || [];
          this.reportSummary = res?.summary || null;
          this.summaryPairs = this.buildSummaryPairs(res?.summary);
          this.cdr.markForCheck();
        },
        error: () => {
          this.reportData = [];
          this.reportSummary = null;
          this.cdr.markForCheck();
        },
      });
  }

  closeReport(): void {
    this.activeReport = null;
    this.reportData = [];
    this.reportSummary = null;
    this.cdr.markForCheck();
  }

  formatExpiryStatus(s: string): string {
    const map: Record<string, string> = {
      EXPIRED: 'Expired',
      EXPIRING_SOON: 'Expiring Soon',
      EXPIRING: 'Expiring',
      ACTIVE: 'Active',
      NO_EXPIRY: 'No Expiry',
    };
    return map[s] || s;
  }

  private buildSummaryPairs(summary: any): { label: string; value: any }[] {
    if (!summary) return [];
    const map: Record<string, string> = {
      total: 'Total',
      expired: 'Expired',
      expiringSoon: 'Expiring Soon',
      active: 'Active',
      open: 'Open',
      resolved: 'Resolved',
      critical: 'Critical',
      avgAgeDays: 'Avg Age (d)',
    };
    return Object.entries(summary)
      .filter(([k]) => map[k])
      .map(([k, v]) => ({ label: map[k], value: v }));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

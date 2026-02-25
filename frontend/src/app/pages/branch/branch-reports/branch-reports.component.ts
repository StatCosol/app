import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface ReportItem {
  name: string;
  description: string;
  icon: string;
  category: string;
  available: boolean;
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
               [class.opacity-50]="!report.available"
               [class.cursor-pointer]="report.available"
               [class.cursor-not-allowed]="!report.available">
            <div class="report-icon">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" [attr.d]="report.icon"/>
              </svg>
            </div>
            <div>
              <h3 class="report-name">{{ report.name }}</h3>
              <p class="report-desc">{{ report.description }}</p>
            </div>
            <span *ngIf="!report.available" class="coming-soon">Coming Soon</span>
            <svg *ngIf="report.available" class="w-5 h-5 text-slate-400 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
          </div>
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
    .report-card:hover:not(.opacity-50) { border-color: #3b82f6; box-shadow: 0 2px 8px rgba(59,130,246,0.12); }
    .report-icon { width: 44px; height: 44px; border-radius: 10px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; color: #3b82f6; flex-shrink: 0; }
    .report-name { font-size: 0.875rem; font-weight: 600; color: #1e293b; }
    .report-desc { font-size: 0.75rem; color: #64748b; margin-top: 0.125rem; }
    .coming-soon { font-size: 0.625rem; font-weight: 600; text-transform: uppercase; color: #94a3b8; background: #f1f5f9; padding: 0.125rem 0.5rem; border-radius: 999px; margin-left: auto; flex-shrink: 0; letter-spacing: 0.04em; }
  `]
})
export class BranchReportsComponent {
  reports: ReportItem[] = [
    { name: 'Monthly Compliance Summary', description: 'PF, ESIC, PT, LWF challan summary for selected month', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', category: 'Compliance', available: true },
    { name: 'PF/ESIC Registration Status', description: 'Employee-wise PF and ESIC registration tracker', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', category: 'Compliance', available: true },
    { name: 'Headcount Report', description: 'Employee and contractor headcount with M/F breakdown', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', category: 'Workforce', available: true },
    { name: 'Contractor Upload Summary', description: 'Document upload % by contractor for selected month', icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12', category: 'Workforce', available: true },
    { name: 'Registration Expiry Report', description: 'All registrations with expiry dates and renewal status', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', category: 'Registrations', available: false },
    { name: 'Audit Observation Report', description: 'Open/closed observations with aging analysis', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', category: 'Audits', available: false },
  ];

  categories = [...new Set(this.reports.map(r => r.category))];

  getReportsForCategory(cat: string): ReportItem[] {
    return this.reports.filter(r => r.category === cat);
  }
}

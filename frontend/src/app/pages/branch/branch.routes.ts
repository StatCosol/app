import { Routes } from '@angular/router';
import { branchPortalGuard } from '../../core/branch-portal.guard';
import { branchPayrollAccessGuard } from '../../core/branch-payroll-access.guard';

const BranchLayoutComponent = () =>
  import('./branch-layout/branch-layout.component').then((m) => m.BranchLayoutComponent);
const BranchDashboardComponent = () =>
  import('./branch-dashboard/branch-dashboard.component').then((m) => m.BranchDashboardComponent);
const BranchEmployeesComponent = () =>
  import('./branch-employees/branch-employees.component').then((m) => m.BranchEmployeesComponent);
const BranchEmployeeFormComponent = () =>
  import('./branch-employees/branch-employee-form.component').then((m) => m.BranchEmployeeFormComponent);
const BranchEmployeeDetailComponent = () =>
  import('./branch-employees/branch-employee-detail.component').then((m) => m.BranchEmployeeDetailComponent);
const BranchContractorsComponent = () =>
  import('./branch-contractors/branch-contractors.component').then((m) => m.BranchContractorsComponent);
const BranchMcdComponent = () =>
  import('./compliance/branch-monthly-compliance-page.component').then(
    (m) => m.BranchMonthlyCompliancePageComponent,
  );
const BranchRegistrationsComponent = () =>
  import('./branch-registrations/branch-registrations-page.component').then(
    (m) => m.BranchRegistrationsPageComponent,
  );
const BranchAuditObservationsComponent = () =>
  import('./branch-audit-observations/branch-audit-observations-page.component').then(
    (m) => m.BranchAuditObservationsPageComponent,
  );
const BranchDocumentsComponent = () =>
  import('./branch-documents/branch-documents.component').then((m) => m.BranchDocumentsComponent);
const BranchReportsComponent = () =>
  import('./branch-reports/branch-reports.component').then((m) => m.BranchReportsComponent);
const BranchNotificationsComponent = () =>
  import('./branch-notifications/branch-notifications.component').then((m) => m.BranchNotificationsComponent);
const BranchHelpdeskComponent = () =>
  import('./branch-helpdesk/branch-helpdesk.component').then((m) => m.BranchHelpdeskComponent);
const BranchPeriodicUploadsPageComponent = () =>
  import('./branch-periodic-uploads/branch-periodic-uploads-page.component').then(
    (m) => m.BranchPeriodicUploadsPageComponent,
  );
const ComplianceCalendarComponent = () =>
  import('../../shared/calendar/compliance-calendar.component').then((m) => m.ComplianceCalendarComponent);
const HeatmapComponent = () =>
  import('../../shared/risk/heatmap.component').then((m) => m.HeatmapComponent);
const SlaTrackerComponent = () =>
  import('../../shared/sla/sla-tracker.component').then((m) => m.SlaTrackerComponent);
const RiskTrendComponent = () =>
  import('../../shared/risk/risk-trend.component').then((m) => m.RiskTrendComponent);
const EscalationsComponent = () =>
  import('../../shared/escalations/escalations.component').then((m) => m.EscalationsComponent);
const BranchUnitDocumentsComponent = () =>
  import('./branch-unit-documents/branch-unit-documents.component').then((m) => m.BranchUnitDocumentsComponent);
const BranchSafetyComponent = () =>
  import('./branch-safety/branch-safety-matrix-page.component').then(
    (m) => m.BranchSafetyMatrixPageComponent,
  );
const BranchComplianceItemsComponent = () =>
  import('../../shared/branch-compliance/branch-compliance-items.component').then((m) => m.BranchComplianceItemsComponent);
const BranchComplianceComponent = () =>
  import('../../shared/compliance/branch-compliance.component').then((m) => m.BranchComplianceComponent);
const BranchComplianceDocsComponent = () =>
  import('./branch-compliance-docs/branch-compliance-docs.component').then((m) => m.BranchComplianceDocsComponent);
const NewsDetailComponent = () =>
  import('../../shared/news/news-detail.component').then((m) => m.NewsDetailComponent);
const BranchPayrollComponent = () =>
  import('../client/payroll/client-payroll-monitoring-page.component').then(
    (m) => m.ClientPayrollMonitoringPageComponent,
  );
const BranchAttendanceReviewComponent = () =>
  import('../client/attendance/client-attendance-review-page.component').then(
    (m) => m.ClientAttendanceReviewPageComponent,
  );
const BranchDailyAttendanceComponent = () =>
  import('../client/attendance/client-daily-attendance-page.component').then(
    (m) => m.ClientDailyAttendancePage,
  );
const BranchMarkAttendanceComponent = () =>
  import('./branch-attendance/branch-mark-attendance.component').then(
    (m) => m.BranchMarkAttendanceComponent,
  );
const BranchNoticesComponent = () =>
  import('./notices/branch-notices.component').then((m) => m.BranchNoticesComponent);
const BranchCtcComponent = () =>
  import('./branch-ctc/branch-ctc.component').then((m) => m.BranchCtcComponent);
const BranchAppraisalDashboardComponent = () =>
  import('./performance-appraisal/branch-appraisal-dashboard.component').then((m) => m.BranchAppraisalDashboardComponent);
const BranchAppraisalsListComponent = () =>
  import('./performance-appraisal/branch-appraisals-list.component').then((m) => m.BranchAppraisalsListComponent);
const BranchAppraisalFormComponent = () =>
  import('./performance-appraisal/branch-appraisal-form.component').then((m) => m.BranchAppraisalFormComponent);
const BranchAppraisalCyclesComponent = () =>
  import('./performance-appraisal/branch-appraisal-cycles.component').then((m) => m.BranchAppraisalCyclesComponent);

export const BRANCH_ROUTES: Routes = [
  {
    path: 'branch',
    loadComponent: BranchLayoutComponent,
    canActivate: [branchPortalGuard],
    children: [
      { path: 'dashboard', loadComponent: BranchDashboardComponent },
      { path: 'employees/new', loadComponent: BranchEmployeeFormComponent },
      { path: 'employees/:id/edit', loadComponent: BranchEmployeeFormComponent },
      { path: 'employees/:id', loadComponent: BranchEmployeeDetailComponent },
      { path: 'employees', loadComponent: BranchEmployeesComponent },
      { path: 'contractors', loadComponent: BranchContractorsComponent },

      // Monthly compliance workbench
      { path: 'monthly-compliance', redirectTo: 'compliance/monthly', pathMatch: 'full' },
      { path: 'compliance/monthly', loadComponent: BranchMcdComponent, runGuardsAndResolvers: 'always' },

      // Factory / Office compliance consolidated into monthly
      { path: 'compliance/factory', redirectTo: 'compliance/monthly', pathMatch: 'full' },
      { path: 'compliance/office', redirectTo: 'compliance/monthly', pathMatch: 'full' },

      // Periodic uploads workspace
      { path: 'uploads', loadComponent: BranchPeriodicUploadsPageComponent, runGuardsAndResolvers: 'always' },
      { path: 'uploads/monthly', redirectTo: 'compliance/monthly', pathMatch: 'full' },
      { path: 'uploads/:periodicity', loadComponent: BranchPeriodicUploadsPageComponent, runGuardsAndResolvers: 'always' },

      // Legacy periodic aliases
      { path: 'returns-filings', redirectTo: 'uploads/yearly', pathMatch: 'full' },
      { path: 'compliance/quarterly', redirectTo: 'uploads/quarterly', pathMatch: 'full' },
      { path: 'compliance/half-yearly', redirectTo: 'uploads/half-yearly', pathMatch: 'full' },
      { path: 'compliance/yearly', redirectTo: 'uploads/yearly', pathMatch: 'full' },

      { path: 'registrations', loadComponent: BranchRegistrationsComponent },
      { path: 'audits/observations', loadComponent: BranchAuditObservationsComponent },
      { path: 'audit-observations', redirectTo: 'audits/observations', pathMatch: 'full' },
      { path: 'documents', loadComponent: BranchDocumentsComponent },
      { path: 'reports', loadComponent: BranchReportsComponent },
      { path: 'payroll', loadComponent: BranchPayrollComponent, canActivate: [branchPayrollAccessGuard] },
      { path: 'branch-ctc', loadComponent: BranchCtcComponent },
      { path: 'attendance', loadComponent: BranchAttendanceReviewComponent },
      { path: 'attendance/mark', loadComponent: BranchMarkAttendanceComponent },
      { path: 'attendance/daily', loadComponent: BranchDailyAttendanceComponent },
      { path: 'notifications', loadComponent: BranchNotificationsComponent },
      { path: 'helpdesk', loadComponent: BranchHelpdeskComponent },
      { path: 'compliance-items', loadComponent: BranchComplianceItemsComponent },
      { path: 'compliance', loadComponent: BranchComplianceComponent },
      { path: 'compliance-docs', loadComponent: BranchComplianceDocsComponent },
      { path: 'calendar', loadComponent: ComplianceCalendarComponent },
      { path: 'heatmap', loadComponent: HeatmapComponent },
      { path: 'sla', loadComponent: SlaTrackerComponent },
      { path: 'risk-trend', loadComponent: RiskTrendComponent },
      { path: 'escalations', loadComponent: EscalationsComponent },
      { path: 'unit-documents', loadComponent: BranchUnitDocumentsComponent },
      { path: 'safety', loadComponent: BranchSafetyComponent },
      { path: 'news', loadComponent: NewsDetailComponent },
      { path: 'news/:newsId', loadComponent: NewsDetailComponent },
      { path: 'notices', loadComponent: BranchNoticesComponent },
      { path: 'appraisal-dashboard', loadComponent: BranchAppraisalDashboardComponent },
      { path: 'appraisals', loadComponent: BranchAppraisalsListComponent },
      { path: 'appraisals/:id', loadComponent: BranchAppraisalFormComponent },
      { path: 'appraisal-cycles', loadComponent: BranchAppraisalCyclesComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

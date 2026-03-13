import { Routes } from '@angular/router';
import { branchPortalGuard } from '../../core/branch-portal.guard';

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
const BranchMcdUploadComponent = () =>
  import('./branch-mcd-upload/branch-mcd-upload.component').then((m) => m.BranchMcdUploadComponent);
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
const BranchReuploadInboxComponent = () =>
  import('./compliance/branch-reupload-inbox.component').then((m) => m.BranchReuploadInboxComponent);
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

      // Periodic uploads workspace
      { path: 'uploads', loadComponent: BranchPeriodicUploadsPageComponent, runGuardsAndResolvers: 'always' },
      { path: 'uploads/monthly', loadComponent: BranchMcdUploadComponent, runGuardsAndResolvers: 'always' },
      { path: 'uploads/:periodicity', loadComponent: BranchPeriodicUploadsPageComponent, runGuardsAndResolvers: 'always' },

      // Legacy aliases
      { path: 'mcd-upload', redirectTo: 'uploads/monthly', pathMatch: 'full' },
      { path: 'returns-filings', redirectTo: 'uploads/yearly', pathMatch: 'full' },
      { path: 'compliance/quarterly', redirectTo: 'uploads/quarterly', pathMatch: 'full' },
      { path: 'compliance/half-yearly', redirectTo: 'uploads/half-yearly', pathMatch: 'full' },
      { path: 'compliance/yearly', redirectTo: 'uploads/yearly', pathMatch: 'full' },
      { path: 'compliance/annual', redirectTo: 'uploads/yearly', pathMatch: 'full' },
      { path: 'monthly-uploads', redirectTo: 'uploads/monthly', pathMatch: 'full' },

      { path: 'registrations', loadComponent: BranchRegistrationsComponent },
      { path: 'audits/observations', loadComponent: BranchAuditObservationsComponent },
      { path: 'audit-observations', redirectTo: 'audits/observations', pathMatch: 'full' },
      { path: 'documents', loadComponent: BranchDocumentsComponent },
      { path: 'reports', loadComponent: BranchReportsComponent },
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
      { path: 'compliance/reupload-inbox', loadComponent: BranchReuploadInboxComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

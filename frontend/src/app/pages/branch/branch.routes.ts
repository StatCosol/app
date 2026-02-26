import { Routes } from '@angular/router';
import { branchPortalGuard } from '../../core/branch-portal.guard';

const BranchLayoutComponent = () =>
  import('./branch-layout/branch-layout.component').then((m) => m.BranchLayoutComponent);
const BranchDashboardComponent = () =>
  import('./branch-dashboard/branch-dashboard.component').then((m) => m.BranchDashboardComponent);
const BranchEmployeesComponent = () =>
  import('./branch-employees/branch-employees.component').then((m) => m.BranchEmployeesComponent);
const BranchContractorsComponent = () =>
  import('./branch-contractors/branch-contractors.component').then((m) => m.BranchContractorsComponent);
const BranchMcdComponent = () =>
  import('./branch-mcd/branch-mcd.component').then((m) => m.BranchMcdComponent);
const BranchRegistrationsComponent = () =>
  import('./branch-registrations/branch-registrations.component').then((m) => m.BranchRegistrationsComponent);
const BranchAuditObservationsComponent = () =>
  import('./branch-audit-observations/branch-audit-observations.component').then((m) => m.BranchAuditObservationsComponent);
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
const BranchReturnsFilingsComponent = () =>
  import('./branch-returns-filings/branch-returns-filings.component').then((m) => m.BranchReturnsFilingsComponent);
const ComplianceCalendarComponent = () =>
  import('../../shared/calendar/compliance-calendar.component').then((m) => m.ComplianceCalendarComponent);
// Phase-2: const HeatmapComponent = () =>
//   import('../../shared/risk/heatmap.component').then((m) => m.HeatmapComponent);
const SlaTrackerComponent = () =>
  import('../../shared/sla/sla-tracker.component').then((m) => m.SlaTrackerComponent);
// Phase-2: const RiskTrendComponent = () =>
//   import('../../shared/risk/risk-trend.component').then((m) => m.RiskTrendComponent);
const EscalationsComponent = () =>
  import('../../shared/escalations/escalations.component').then((m) => m.EscalationsComponent);
const BranchComplianceItemsComponent = () =>
  import('../../shared/branch-compliance/branch-compliance-items.component').then((m) => m.BranchComplianceItemsComponent);
const BranchComplianceComponent = () =>
  import('../../shared/compliance/branch-compliance.component').then(m => m.BranchComplianceComponent);
const MonthlyUploadsComponent = () =>
  import('../../shared/uploads/monthly-uploads.component').then(m => m.MonthlyUploadsComponent);
export const BRANCH_ROUTES: Routes = [
  {
    path: 'branch',
    loadComponent: BranchLayoutComponent,
    canActivate: [branchPortalGuard],
    children: [
      { path: 'dashboard',          loadComponent: BranchDashboardComponent },
      { path: 'employees',          loadComponent: BranchEmployeesComponent },
      { path: 'contractors',        loadComponent: BranchContractorsComponent },
      { path: 'monthly-compliance', loadComponent: BranchMcdComponent },
      // ── Compliance Document pages (frequency-specific) ──
      { path: 'compliance/monthly',     loadComponent: BranchMcdUploadComponent, runGuardsAndResolvers: 'always' },
      { path: 'compliance/quarterly',   loadComponent: BranchReturnsFilingsComponent, data: { frequency: 'QUARTERLY' }, runGuardsAndResolvers: 'always' },
      { path: 'compliance/half-yearly', loadComponent: BranchReturnsFilingsComponent, data: { frequency: 'HALF_YEARLY' }, runGuardsAndResolvers: 'always' },
      { path: 'compliance/yearly',      loadComponent: BranchReturnsFilingsComponent, data: { frequency: 'YEARLY' }, runGuardsAndResolvers: 'always' },
      // Legacy aliases
      { path: 'mcd-upload',         redirectTo: 'compliance/monthly',     pathMatch: 'full' },
      { path: 'returns-filings',    redirectTo: 'compliance/yearly',      pathMatch: 'full' },
      { path: 'compliance/annual',  redirectTo: 'compliance/yearly',      pathMatch: 'full' },
      { path: 'registrations',      loadComponent: BranchRegistrationsComponent },
      { path: 'audit-observations', loadComponent: BranchAuditObservationsComponent },
      { path: 'documents',          loadComponent: BranchDocumentsComponent },
      { path: 'reports',            loadComponent: BranchReportsComponent },
      { path: 'notifications',      loadComponent: BranchNotificationsComponent },
      { path: 'helpdesk',           loadComponent: BranchHelpdeskComponent },
      { path: 'compliance-items',     loadComponent: BranchComplianceItemsComponent },
      { path: 'compliance',              loadComponent: BranchComplianceComponent },
      { path: 'monthly-uploads',      loadComponent: MonthlyUploadsComponent },
      { path: 'calendar',            loadComponent: ComplianceCalendarComponent },
      // Phase-2: { path: 'heatmap',             loadComponent: HeatmapComponent },
      { path: 'sla',                 loadComponent: SlaTrackerComponent },
      // Phase-2: { path: 'risk-trend',          loadComponent: RiskTrendComponent },
      { path: 'escalations',          loadComponent: EscalationsComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

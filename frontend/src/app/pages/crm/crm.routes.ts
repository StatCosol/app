import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';
import { crmClientAccessGuard } from '../../core/crm-client-access.guard';

const CrmLayoutComponent = () =>
  import('./crm-layout/crm-layout.component').then((m) => m.CrmLayoutComponent);
const CrmDashboardActionPageComponent = () =>
  import('./crm-dashboard-action-page.component').then(
    (m) => m.CrmDashboardActionPageComponent,
  );
const CrmReportsComponent = () =>
  import('./crm-reports.component').then((m) => m.CrmReportsComponent);
const CrmClientBranchesComponent = () =>
  import('./crm-client-branches.component').then((m) => m.CrmClientBranchesComponent);
const CrmClientsComponent = () =>
  import('./clients/crm-clients.component').then((m) => m.CrmClientsComponent);
const CrmClientOverviewComponent = () =>
  import('./clients/crm-client-overview.component').then((m) => m.CrmClientOverviewComponent);
const CrmComplianceComponent = () =>
  import('./compliance/crm-compliance.component').then((m) => m.CrmComplianceComponent);
const CrmComplianceTasksComponent = () =>
  import('./compliance/crm-compliance-tasks.component').then((m) => m.CrmComplianceTasksComponent);
const CrmAuditManagementPageComponent = () =>
  import('./audits/crm-audit-management-page.component').then((m) => m.CrmAuditManagementPageComponent);
const CrmContractorsComponent = () =>
  import('./contractors/crm-contractors.component').then((m) => m.CrmContractorsComponent);
const CrmPayrollStatusComponent = () =>
  import('./payroll/crm-payroll-status.component').then((m) => m.CrmPayrollStatusComponent);
const CrmDocumentsComponent = () =>
  import('./documents/crm-documents.component').then((m) => m.CrmDocumentsComponent);
const CrmRequestsComponent = () =>
  import('./requests/crm-requests.component').then((m) => m.CrmRequestsComponent);
const CrmProfileComponent = () =>
  import('./profile/crm-profile.component').then((m) => m.CrmProfileComponent);
const CrmBranchDocsReviewComponent = () =>
  import('./branch-docs-review/crm-branch-docs-review.component').then((m) => m.CrmBranchDocsReviewComponent);
const CrmReturnsWorkspacePageComponent = () =>
  import('./returns/crm-returns-workspace-page.component').then(
    (m) => m.CrmReturnsWorkspacePageComponent,
  );
const CrmComplianceDocsComponent = () =>
  import('./compliance-docs/crm-compliance-docs.component').then((m) => m.CrmComplianceDocsComponent);
const CrmRegistrationsComponent = () =>
  import('./registrations/crm-registrations.component').then((m) => m.CrmRegistrationsComponent);
const CrmRegistrationsLandingComponent = () =>
  import('./registrations/crm-registrations-landing.component').then(
    (m) => m.CrmRegistrationsLandingComponent,
  );
const CrmUnitDocumentsComponent = () =>
  import('./unit-documents/crm-unit-documents.component').then((m) => m.CrmUnitDocumentsComponent);
const CrmSafetyComponent = () =>
  import('./safety/crm-safety.component').then((m) => m.CrmSafetyComponent);
const ComplianceCalendarComponent = () =>
  import('../../shared/calendar/compliance-calendar.component').then((m) => m.ComplianceCalendarComponent);
const SlaTrackerComponent = () =>
  import('../../shared/sla/sla-tracker.component').then((m) => m.SlaTrackerComponent);
const HeatmapComponent = () =>
  import('../../shared/risk/heatmap.component').then((m) => m.HeatmapComponent);
const RiskTrendComponent = () =>
  import('../../shared/risk/risk-trend.component').then((m) => m.RiskTrendComponent);
const EscalationsComponent = () =>
  import('../../shared/escalations/escalations.component').then((m) => m.EscalationsComponent);
const CrmRenewalsWorkspacePageComponent = () =>
  import('./renewals/crm-renewals-workspace-page.component').then(
    (m) => m.CrmRenewalsWorkspacePageComponent,
  );
const CrmAmendmentsWorkspacePageComponent = () =>
  import('./amendments/crm-amendments-workspace-page.component').then(
    (m) => m.CrmAmendmentsWorkspacePageComponent,
  );
const CrmAuditMonitoringComponent = () =>
  import('./audits/crm-audit-monitoring.component').then(
    (m) => m.CrmAuditMonitoringComponent,
  );
const CrmExpiryTasksComponent = () =>
  import('./expiry/crm-expiry-tasks.component').then(
    (m) => m.CrmExpiryTasksComponent,
  );
const CrmNoticesComponent = () =>
  import('./notices/crm-notices.component').then(
    (m) => m.CrmNoticesComponent,
  );

export const CRM_ROUTES: Routes = [
  {
    path: 'crm',
    loadComponent: CrmLayoutComponent,
    canActivate: [roleGuard(['CRM', 'ADMIN'])],
    children: [
      // ── Top-level pages ──
      { path: 'dashboard', loadComponent: CrmDashboardActionPageComponent },
      {
        path: 'clients',
        children: [
          { path: '', loadComponent: CrmClientsComponent },
          {
            path: ':clientId',
            canActivateChild: [crmClientAccessGuard],
            children: [
              { path: 'overview', loadComponent: CrmClientOverviewComponent },
              { path: 'branches', loadComponent: CrmClientBranchesComponent },
              { path: 'contractors', loadComponent: CrmContractorsComponent },
              { path: 'compliance-tracker', loadComponent: CrmComplianceComponent },
              { path: 'documents', loadComponent: CrmDocumentsComponent },
              { path: 'compliance-docs', loadComponent: CrmComplianceDocsComponent },
              { path: 'registrations', loadComponent: CrmRegistrationsComponent },
              { path: 'payroll-status', loadComponent: CrmPayrollStatusComponent },
              { path: 'unit-documents', loadComponent: CrmUnitDocumentsComponent },
              { path: 'safety', loadComponent: CrmSafetyComponent },
              { path: '', pathMatch: 'full', redirectTo: 'overview' },
            ],
          },
        ],
      },
      { path: 'notifications', redirectTo: 'helpdesk', pathMatch: 'full' },
      { path: 'compliance-tracker', loadComponent: CrmComplianceComponent },
      { path: 'compliance/tasks', loadComponent: CrmComplianceTasksComponent },
      { path: 'helpdesk', loadComponent: CrmRequestsComponent },
      { path: 'requests', redirectTo: 'helpdesk', pathMatch: 'full' },
      { path: 'reports', loadComponent: CrmReportsComponent },
      { path: 'audits', loadComponent: CrmAuditManagementPageComponent },
      { path: 'audit-monitoring', loadComponent: CrmAuditMonitoringComponent },
      { path: 'expiry-tasks', loadComponent: CrmExpiryTasksComponent },
      { path: 'returns', loadComponent: CrmReturnsWorkspacePageComponent },
      { path: 'registrations', loadComponent: CrmRegistrationsLandingComponent },
      { path: 'renewals', loadComponent: CrmRenewalsWorkspacePageComponent },
      { path: 'amendments', loadComponent: CrmAmendmentsWorkspacePageComponent },
      { path: 'branch-docs-review', loadComponent: CrmBranchDocsReviewComponent },
      { path: 'notices', loadComponent: CrmNoticesComponent },
      { path: 'profile', loadComponent: CrmProfileComponent },
      { path: 'calendar', loadComponent: ComplianceCalendarComponent },
      { path: 'sla', loadComponent: SlaTrackerComponent },
      { path: 'heatmap', loadComponent: HeatmapComponent },
      { path: 'risk-trend', loadComponent: RiskTrendComponent },
      { path: 'escalations', loadComponent: EscalationsComponent },
      { path: 'reupload-backlog', redirectTo: 'branch-docs-review', pathMatch: 'full' },

      // ── Legacy redirects ──
      { path: 'contractors', redirectTo: 'clients', pathMatch: 'full' },
      { path: 'compliance', redirectTo: 'clients', pathMatch: 'full' },
      { path: 'returns/filings', redirectTo: 'returns', pathMatch: 'full' },
      { path: 'compliance-tracker/mcd', redirectTo: 'compliance-tracker', pathMatch: 'full' },
      { path: 'helpdesk/tickets', redirectTo: 'helpdesk', pathMatch: 'full' },

      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

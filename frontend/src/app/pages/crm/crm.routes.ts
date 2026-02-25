import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';
import { crmClientAccessGuard } from '../../core/crm-client-access.guard';

const CrmLayoutComponent = () =>
  import('./crm-layout/crm-layout.component').then((m) => m.CrmLayoutComponent);
const CrmDashboardComponent = () =>
  import('./crm-dashboard.component').then((m) => m.CrmDashboardComponent);
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
const CrmNotificationsComponent = () =>
  import('./notifications/crm-notifications.component').then((m) => m.CrmNotificationsComponent);
const CrmAuditsComponent = () =>
  import('./crm-audits.component').then((m) => m.CrmAuditsComponent);
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
const CrmReturnsFilingsComponent = () =>
  import('./returns/crm-returns-filings.component').then((m) => m.CrmReturnsFilingsComponent);
const CrmComplianceDocsComponent = () =>
  import('./compliance-docs/crm-compliance-docs.component').then((m) => m.CrmComplianceDocsComponent);
const CrmRegistrationsComponent = () =>
  import('./registrations/crm-registrations.component').then((m) => m.CrmRegistrationsComponent);

export const CRM_ROUTES: Routes = [
  {
    path: 'crm',
    loadComponent: CrmLayoutComponent,
    canActivate: [roleGuard(['CRM'])],
    children: [
      // ── Top-level pages ──
      { path: 'dashboard', loadComponent: CrmDashboardComponent },
      {
        path: 'clients',
        children: [
          { path: '', loadComponent: CrmClientsComponent },
          {
            path: ':clientId',
            canActivateChild: [crmClientAccessGuard],
            children: [
              // ── Client workspace ──
              { path: 'overview', loadComponent: CrmClientOverviewComponent },
              { path: 'branches', loadComponent: CrmClientBranchesComponent },
              { path: 'contractors', loadComponent: CrmContractorsComponent },
              { path: 'compliance-tracker', loadComponent: CrmComplianceComponent },
              { path: 'documents', loadComponent: CrmDocumentsComponent },
              { path: 'compliance-docs', loadComponent: CrmComplianceDocsComponent },
              { path: 'registrations', loadComponent: CrmRegistrationsComponent },
              { path: 'payroll-status', loadComponent: CrmPayrollStatusComponent },
              { path: '', pathMatch: 'full', redirectTo: 'overview' },
            ],
          },
        ],
      },
      { path: 'notifications', loadComponent: CrmNotificationsComponent },
      { path: 'compliance-tracker', loadComponent: CrmComplianceComponent },
      { path: 'helpdesk', loadComponent: CrmRequestsComponent },
      { path: 'requests', redirectTo: 'helpdesk', pathMatch: 'full' },
      { path: 'reports', loadComponent: CrmReportsComponent },
      { path: 'audits', loadComponent: CrmAuditsComponent },
      { path: 'returns', loadComponent: CrmReturnsFilingsComponent },
      { path: 'branch-docs-review', loadComponent: CrmBranchDocsReviewComponent },
      { path: 'profile', loadComponent: CrmProfileComponent },

      // ── Legacy redirects ──
      { path: 'contractors', redirectTo: 'clients', pathMatch: 'full' },
      { path: 'compliance', redirectTo: 'clients', pathMatch: 'full' },
      { path: 'payroll-status', redirectTo: 'clients', pathMatch: 'full' },

      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

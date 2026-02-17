import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';
import { branchUserOnlyGuard } from '../../core/branch-user-only.guard';

const ClientLayoutComponent = () =>
  import('./client-layout/client-layout.component').then((m) => m.ClientLayoutComponent);
const ClientDashboardComponent = () =>
  import('./dashboard/client-dashboard.component').then((m) => m.ClientDashboardComponent);
const ClientComplianceStatusComponent = () =>
  import('./compliance/client-compliance-status.component').then((m) => m.ClientComplianceStatusComponent);
const ClientQueriesComponent = () =>
  import('./queries/client-queries.component').then((m) => m.ClientQueriesComponent);
const ThreadChatComponent = () =>
  import('./queries/thread-chat.component').then((m) => m.ThreadChatComponent);
const ClientProfileComponent = () =>
  import('./profile/client-profile.component').then((m) => m.ClientProfileComponent);
const ClientSupportComponent = () =>
  import('./client-support.component').then((m) => m.ClientSupportComponent);
const ClientBranchesComponent = () =>
  import('./client-branches.component').then((m) => m.ClientBranchesComponent);
const BranchDetailComponent = () =>
  import('./branches/branch-detail.component').then((m) => m.BranchDetailComponent);
const ClientContractorsComponent = () =>
  import('./contractors/client-contractors.component').then((m) => m.ClientContractorsComponent);
const ClientContractorsBranchComponent = () =>
  import('./contractors/client-contractors-branch.component').then(
    (m) => m.ClientContractorsBranchComponent,
  );
const ClientPayrollComponent = () =>
  import('./payroll/client-payroll.component').then((m) => m.ClientPayrollComponent);
const ClientAuditsComponent = () =>
  import('./audits/client-audits.component').then((m) => m.ClientAuditsComponent);
const ClientReturnsComponent = () =>
  import('./compliance/client-returns.component').then((m) => m.ClientReturnsComponent);
const ClientMcdComponent = () =>
  import('./compliance/client-mcd.component').then((m) => m.ClientMcdComponent);
const ClientMcdUploadsComponent = () =>
  import('./compliance/client-mcd-uploads.component').then((m) => m.ClientMcdUploadsComponent);

export const CLIENT_ROUTES: Routes = [
  {
    path: 'client',
    loadComponent: ClientLayoutComponent,
    canActivate: [roleGuard(['CLIENT'])],
    children: [
      { path: 'dashboard', loadComponent: ClientDashboardComponent },
      { path: 'branches', loadComponent: ClientBranchesComponent },
      { path: 'branches/:id', loadComponent: BranchDetailComponent },
      { path: 'contractors', loadComponent: ClientContractorsComponent },
      { path: 'contractors/branch/:branchId', loadComponent: ClientContractorsBranchComponent },
      { path: 'compliance/status', loadComponent: ClientComplianceStatusComponent },
      { path: 'compliance/mcd', loadComponent: ClientMcdComponent },
      {
        path: 'compliance/mcd/uploads',
        loadComponent: ClientMcdUploadsComponent,
        canActivate: [branchUserOnlyGuard],
      },
      { path: 'compliance/returns', loadComponent: ClientReturnsComponent },
      { path: 'payroll', loadComponent: ClientPayrollComponent },
      { path: 'audits', loadComponent: ClientAuditsComponent },
      { path: 'queries', loadComponent: ClientQueriesComponent },
      { path: 'queries/:id', loadComponent: ThreadChatComponent },
      { path: 'profile', loadComponent: ClientProfileComponent },
      { path: 'support', loadComponent: ClientSupportComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

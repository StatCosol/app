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
const ClientEmployeesComponent = () =>
  import('./employees/client-employees.component').then((m) => m.ClientEmployeesComponent);
const ClientEmployeeFormComponent = () =>
  import('./employees/client-employee-form.component').then((m) => m.ClientEmployeeFormComponent);
const ClientEmployeeDetailComponent = () =>
  import('./employees/client-employee-detail.component').then((m) => m.ClientEmployeeDetailComponent);
const ClientAuditsComponent = () =>
  import('./audits/client-audits.component').then((m) => m.ClientAuditsComponent);
const ClientRegistersComponent = () =>
  import('./registers/client-registers.component').then((m) => m.ClientRegistersComponent);
const ClientReturnsComponent = () =>
  import('./compliance/client-returns.component').then((m) => m.ClientReturnsComponent);
const ClientMcdComponent = () =>
  import('./compliance/client-mcd.component').then((m) => m.ClientMcdComponent);
const ClientMcdUploadsComponent = () =>
  import('./compliance/client-mcd-uploads.component').then((m) => m.ClientMcdUploadsComponent);
const NominationApprovalsComponent = () =>
  import('./approvals/nomination-approvals.component').then((m) => m.NominationApprovalsComponent);
const LeaveApprovalsComponent = () =>
  import('./approvals/leave-approvals.component').then((m) => m.LeaveApprovalsComponent);

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
      { path: 'employees', loadComponent: ClientEmployeesComponent },
      { path: 'employees/new', loadComponent: ClientEmployeeFormComponent },
      { path: 'employees/:id', loadComponent: ClientEmployeeDetailComponent },
      { path: 'employees/:id/edit', loadComponent: ClientEmployeeFormComponent },
      { path: 'registers', loadComponent: ClientRegistersComponent },
      { path: 'audits', loadComponent: ClientAuditsComponent },
      { path: 'queries', loadComponent: ClientQueriesComponent },
      { path: 'queries/:id', loadComponent: ThreadChatComponent },
      { path: 'profile', loadComponent: ClientProfileComponent },
      { path: 'support', loadComponent: ClientSupportComponent },
      { path: 'approvals/nominations', loadComponent: NominationApprovalsComponent },
      { path: 'approvals/leaves', loadComponent: LeaveApprovalsComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

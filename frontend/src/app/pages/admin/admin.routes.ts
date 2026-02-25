import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const AdminLayoutComponent = () =>
  import('./admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent);
const AdminDashboardComponent = () =>
  import('./admin-dashboard.component').then((m) => m.AdminDashboardComponent);
const AdminReportsComponent = () =>
  import('./admin-reports.component').then((m) => m.AdminReportsComponent);
const UsersComponent = () =>
  import('./users/users.component').then((m) => m.UsersComponent);
const AdminClientsComponent = () =>
  import('./clients/admin-clients.component').then((m) => m.AdminClientsComponent);
const AdminAssignmentsComponent = () =>
  import('./assignments/admin-assignments.component').then((m) => m.AdminAssignmentsComponent);
const AdminNotificationsComponent = () =>
  import('./notifications/admin-notifications.component').then((m) => m.AdminNotificationsComponent);
const AdminPayrollAssignmentsComponent = () =>
  import('./payroll-assignments/admin-payroll-assignments.component').then(
    (m) => m.AdminPayrollAssignmentsComponent,
  );
const AdminMastersComponent = () =>
  import('./masters/admin-masters.component').then((m) => m.AdminMastersComponent);
const AdminApprovalsComponent = () =>
  import('./approvals/admin-approvals.component').then((m) => m.AdminApprovalsComponent);
const AiDashboardComponent = () =>
  import('./ai/ai-dashboard.component').then((m) => m.AiDashboardComponent);
const AiRiskComponent = () =>
  import('./ai/ai-risk.component').then((m) => m.AiRiskComponent);
const AiAuditComponent = () =>
  import('./ai/ai-audit.component').then((m) => m.AiAuditComponent);
const AiPayrollComponent = () =>
  import('./ai/ai-payroll.component').then((m) => m.AiPayrollComponent);
const AiConfigComponent = () =>
  import('./ai/ai-config.component').then((m) => m.AiConfigComponent);

export const ADMIN_ROUTES: Routes = [
  {
    path: 'admin',
    loadComponent: AdminLayoutComponent,
    canActivate: [roleGuard(['ADMIN'])],
    children: [
      { path: 'dashboard', loadComponent: AdminDashboardComponent },
      { path: 'reports', loadComponent: AdminReportsComponent },
      { path: 'users', loadComponent: UsersComponent },
      { path: 'clients', loadComponent: AdminClientsComponent },
      { path: 'clients/:id', loadComponent: AdminClientsComponent },
      { path: 'clients/:id/:tab', loadComponent: AdminClientsComponent },
      { path: 'assignments', loadComponent: AdminAssignmentsComponent },
      { path: 'payroll-assignments', loadComponent: AdminPayrollAssignmentsComponent },
      { path: 'masters', loadComponent: AdminMastersComponent },
      { path: 'approvals', loadComponent: AdminApprovalsComponent },
      { path: 'notifications', loadComponent: AdminNotificationsComponent },
      { path: 'ai-hub', loadComponent: AiDashboardComponent },
      { path: 'ai-risk', loadComponent: AiRiskComponent },
      { path: 'ai-audit', loadComponent: AiAuditComponent },
      { path: 'ai-payroll', loadComponent: AiPayrollComponent },
      { path: 'ai-config', loadComponent: AiConfigComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

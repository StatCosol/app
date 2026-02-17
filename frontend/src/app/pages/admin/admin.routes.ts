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
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

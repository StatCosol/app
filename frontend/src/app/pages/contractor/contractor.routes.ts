import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const ContractorLayoutComponent = () =>
  import('./contractor-layout/contractor-layout.component').then((m) => m.ContractorLayoutComponent);
const ContractorDashboardComponent = () =>
  import('./contractor-dashboard.component').then((m) => m.ContractorDashboardComponent);
const ContractorNotificationsComponent = () =>
  import('./notifications/contractor-notifications.component').then(
    (m) => m.ContractorNotificationsComponent,
  );
const ContractorSupportComponent = () =>
  import('./contractor-support.component').then((m) => m.ContractorSupportComponent);
const ContractorComplianceComponent = () =>
  import('./compliance/contractor-compliance.component').then((m) => m.ContractorComplianceComponent);
const ContractorUnifiedTaskCenterPageComponent = () =>
  import('./tasks/contractor-unified-task-center-page.component').then(
    (m) => m.ContractorUnifiedTaskCenterPageComponent,
  );
const ContractorProfileComponent = () =>
  import('./contractor-profile.component').then((m) => m.ContractorProfileComponent);

export const CONTRACTOR_ROUTES: Routes = [
  {
    path: 'contractor',
    loadComponent: ContractorLayoutComponent,
    canActivate: [roleGuard(['CONTRACTOR'])],
    children: [
      { path: 'dashboard', loadComponent: ContractorDashboardComponent },
      { path: 'notifications', loadComponent: ContractorNotificationsComponent },
      { path: 'support', loadComponent: ContractorSupportComponent },
      { path: 'compliance', loadComponent: ContractorComplianceComponent },
      { path: 'compliance/tasks', pathMatch: 'full', redirectTo: 'tasks' },
      { path: 'compliance/tasks/:id', pathMatch: 'full', redirectTo: 'tasks/:id' },
      { path: 'compliance/reupload-requests', pathMatch: 'full', redirectTo: 'reupload-requests' },
      { path: 'reupload-requests', loadComponent: ContractorUnifiedTaskCenterPageComponent },
      { path: 'tasks', loadComponent: ContractorUnifiedTaskCenterPageComponent },
      { path: 'tasks/:id', loadComponent: ContractorUnifiedTaskCenterPageComponent },
      { path: 'profile', loadComponent: ContractorProfileComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

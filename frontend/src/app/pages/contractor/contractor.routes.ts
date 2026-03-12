import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const ContractorLayoutComponent = () =>
  import('./contractor-layout/contractor-layout.component').then((m) => m.ContractorLayoutComponent);
const ContractorDashboardUpgradePageComponent = () =>
  import('./contractor-dashboard-upgrade-page.component').then(
    (m) => m.ContractorDashboardUpgradePageComponent,
  );
const ContractorNotificationsComponent = () =>
  import('./notifications/contractor-notifications.component').then(
    (m) => m.ContractorNotificationsComponent,
  );
const ContractorSupportComponent = () =>
  import('./contractor-support.component').then((m) => m.ContractorSupportComponent);
const ContractorComplianceComponent = () =>
  import('./compliance/contractor-compliance.component').then((m) => m.ContractorComplianceComponent);
const ContractorTasksComponent = () =>
  import('./tasks/contractor-tasks.component').then((m) => m.ContractorTasksComponent);
const ContractorTaskDetailComponent = () =>
  import('./tasks/task-detail/contractor-task-detail.component').then(
    (m) => m.ContractorTaskDetailComponent,
  );
const ContractorProfileComponent = () =>
  import('./contractor-profile.component').then((m) => m.ContractorProfileComponent);
const ContractorReuploadRequestsComponent = () =>
  import('./contractor-reupload-requests.component').then(
    (m) => m.ContractorReuploadRequestsComponent,
  );

export const CONTRACTOR_ROUTES: Routes = [
  {
    path: 'contractor',
    loadComponent: ContractorLayoutComponent,
    canActivate: [roleGuard(['CONTRACTOR'])],
    children: [
      { path: 'dashboard', loadComponent: ContractorDashboardUpgradePageComponent },
      { path: 'notifications', loadComponent: ContractorNotificationsComponent },
      { path: 'support', loadComponent: ContractorSupportComponent },
      { path: 'compliance', loadComponent: ContractorComplianceComponent },
      { path: 'reupload-requests', loadComponent: ContractorReuploadRequestsComponent },
      { path: 'tasks', loadComponent: ContractorTasksComponent },
      { path: 'tasks/:id', loadComponent: ContractorTaskDetailComponent },
      { path: 'profile', loadComponent: ContractorProfileComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

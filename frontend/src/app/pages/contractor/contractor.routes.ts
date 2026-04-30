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
const ContractorUnifiedTaskCenterPageComponent = () =>
  import('./tasks/contractor-unified-task-center-page.component').then(
    (m) => m.ContractorUnifiedTaskCenterPageComponent,
  );
const ContractorProfileIdentityPageComponent = () =>
  import('./contractor-profile-identity-page.component').then(
    (m) => m.ContractorProfileIdentityPageComponent,
  );
const NewsDetailComponent = () =>
  import('../../shared/news/news-detail.component').then((m) => m.NewsDetailComponent);
const ContractorEmployeesPageComponent = () =>
  import('./employees/contractor-employees-page.component').then(
    (m) => m.ContractorEmployeesPageComponent,
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
      { path: 'compliance', redirectTo: 'tasks', pathMatch: 'full' },
      { path: 'compliance/tasks', pathMatch: 'full', redirectTo: 'tasks' },
      { path: 'compliance/tasks/:id', pathMatch: 'full', redirectTo: 'tasks/:id' },
      { path: 'tasks', loadComponent: ContractorUnifiedTaskCenterPageComponent },
      { path: 'tasks/:id', loadComponent: ContractorUnifiedTaskCenterPageComponent },
      { path: 'profile', loadComponent: ContractorProfileIdentityPageComponent },
      { path: 'news', loadComponent: NewsDetailComponent },
      { path: 'news/:newsId', loadComponent: NewsDetailComponent },
      { path: 'employees', loadComponent: ContractorEmployeesPageComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

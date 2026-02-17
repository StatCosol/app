import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const CcoLayoutComponent = () =>
  import('./cco-layout/cco-layout.component').then((m) => m.CcoLayoutComponent);
const CcoDashboardComponent = () =>
  import('./cco-dashboard.component').then((m) => m.CcoDashboardComponent);
const CcoApprovalsComponent = () =>
  import('./cco-approvals.component').then((m) => m.CcoApprovalsComponent);
const CcoOversightComponent = () =>
  import('./cco-oversight.component').then((m) => m.CcoOversightComponent);
const CcoCrmsUnderMeComponent = () =>
  import('./cco-crms-under-me.component').then((m) => m.CcoCrmsUnderMeComponent);
const CcoCrmPerformanceComponent = () =>
  import('./cco-crm-performance.component').then((m) => m.CcoCrmPerformanceComponent);
const CcoNotificationsComponent = () =>
  import('./cco-notifications.component').then((m) => m.CcoNotificationsComponent);
const CcoProfileComponent = () =>
  import('./cco-profile.component').then((m) => m.CcoProfileComponent);

export const CCO_ROUTES: Routes = [
  {
    path: 'cco',
    loadComponent: CcoLayoutComponent,
    // Backend endpoints under /api/cco/* are protected with Roles('CCO').
    // Keeping the frontend guard aligned prevents CEO users from seeing CCO UI that will 403.
    canActivate: [roleGuard(['CCO'])],
    children: [
      { path: 'dashboard', loadComponent: CcoDashboardComponent },
      { path: 'approvals', loadComponent: CcoApprovalsComponent },
      { path: 'oversight', loadComponent: CcoOversightComponent },
      { path: 'crms-under-me', loadComponent: CcoCrmsUnderMeComponent },
      { path: 'crm-performance', loadComponent: CcoCrmPerformanceComponent },
      { path: 'notifications', loadComponent: CcoNotificationsComponent },
      { path: 'profile', loadComponent: CcoProfileComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

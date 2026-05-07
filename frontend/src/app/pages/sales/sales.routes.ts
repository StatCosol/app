import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

export const SALES_ROUTES: Routes = [
  {
    path: 'sales',
    loadComponent: () =>
      import('./sales-layout/sales-layout.component').then((m) => m.SalesLayoutComponent),
    canActivate: [roleGuard(['SALES', 'ADMIN'])],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./sales-dashboard.component').then((m) => m.SalesDashboardComponent),
      },
      {
        path: 'leads',
        loadComponent: () =>
          import('./sales-leads-list.component').then((m) => m.SalesLeadsListComponent),
      },
      {
        path: 'leads/new',
        loadComponent: () =>
          import('./sales-lead-create.component').then((m) => m.SalesLeadCreateComponent),
      },
      {
        path: 'leads/:id',
        loadComponent: () =>
          import('./sales-lead-detail.component').then((m) => m.SalesLeadDetailComponent),
      },
      {
        path: 'followups',
        loadComponent: () =>
          import('./sales-followups.component').then((m) => m.SalesFollowupsComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./sales-profile.component').then((m) => m.SalesProfileComponent),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

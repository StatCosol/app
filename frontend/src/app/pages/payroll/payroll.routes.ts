import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const PayrollLayoutComponent = () =>
  import('./payroll-layout/payroll-layout.component').then((m) => m.PayrollLayoutComponent);
const PayrollDashboardComponent = () =>
  import('./payroll-dashboard.component').then((m) => m.PayrollDashboardComponent);
const PayrollClientsComponent = () =>
  import('./payroll-clients.component').then((m) => m.PayrollClientsComponent);
const PayrollRunsComponent = () =>
  import('./payroll-runs.component').then((m) => m.PayrollRunsComponent);
const PayrollStructuresBuilderPageComponent = () =>
  import('./payroll-structures-builder-page.component').then(
    (m) => m.PayrollStructuresBuilderPageComponent,
  );
const PayrollRegistersComponent = () =>
  import('./payroll-registers.component').then((m) => m.PayrollRegistersComponent);
const PayrollProfileComponent = () =>
  import('./payroll-profile.component').then((m) => m.PayrollProfileComponent);
const PayrollSetupComponent = () =>
  import('./payroll-setup.component').then((m) => m.PayrollSetupComponent);

export const PAYROLL_ROUTES: Routes = [
  {
    path: 'payroll',
    loadComponent: PayrollLayoutComponent,
    canActivate: [roleGuard(['PAYROLL'])],
    children: [
      { path: 'dashboard', loadComponent: PayrollDashboardComponent },
      { path: 'clients', loadComponent: PayrollClientsComponent },
      { path: 'runs', loadComponent: PayrollRunsComponent },
      { path: 'setup', loadComponent: PayrollSetupComponent },
      { path: 'structures', loadComponent: PayrollStructuresBuilderPageComponent },
      { path: 'registers', loadComponent: PayrollRegistersComponent },
      { path: 'profile', loadComponent: PayrollProfileComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const PayrollLayoutComponent = () =>
  import('./payroll-layout/payroll-layout.component').then((m) => m.PayrollLayoutComponent);
const PayrollDashboardComponent = () =>
  import('./payroll-dashboard.component').then((m) => m.PayrollDashboardComponent);
const PayrollClientsComponent = () =>
  import('./payroll-clients.component').then((m) => m.PayrollClientsComponent);
const PayrollRunsConsolePageComponent = () =>
  import('./payroll-runs-console-page.component').then((m) => m.PayrollRunsConsolePageComponent);
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
      { path: 'runs', loadComponent: PayrollRunsConsolePageComponent },
      { path: 'setup', loadComponent: PayrollSetupComponent },
      { path: 'registers', loadComponent: PayrollRegistersComponent },
      { path: 'profile', loadComponent: PayrollProfileComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const PayrollLayoutComponent = () =>
  import('./payroll-layout/payroll-layout.component').then((m) => m.PayrollLayoutComponent);
const PayrollDashboardComponent = () =>
  import('./payroll-dashboard.component').then((m) => m.PayrollDashboardComponent);
const PayrollClientsComponent = () =>
  import('./payroll-clients.component').then((m) => m.PayrollClientsComponent);
const PayrollRunsConsolePageComponent = () =>
  import('./payroll-runs-console-page.component').then(
    (m) => m.PayrollRunsConsolePageComponent,
  );
const PayrollRegistersComponent = () =>
  import('./payroll-registers.component').then((m) => m.PayrollRegistersComponent);
const PayrollProfileComponent = () =>
  import('./payroll-profile.component').then((m) => m.PayrollProfileComponent);
const PayrollSetupTabsPageComponent = () =>
  import('./payroll-setup-tabs-page.component').then(
    (m) => m.PayrollSetupTabsPageComponent,
  );
const PayrollPfEsiDashboardPageComponent = () =>
  import('./payroll-pf-esi-dashboard-page.component').then(
    (m) => m.PayrollPfEsiDashboardPageComponent,
  );
const PayrollEmployeesComponent = () =>
  import('./payroll-employees.component').then((m) => m.PayrollEmployeesComponent);
const PayrollEmployeeDetailComponent = () =>
  import('./payroll-employee-detail.component').then((m) => m.PayrollEmployeeDetailComponent);
const PayrollQueriesComponent = () =>
  import('./payroll-queries.component').then((m) => m.PayrollQueriesComponent);
const PayrollFfLifecyclePageComponent = () =>
  import('./payroll-ff-lifecycle-page.component').then(
    (m) => m.PayrollFfLifecyclePageComponent,
  );
const PayrollReportsComponent = () =>
  import('./payroll-reports.component').then((m) => m.PayrollReportsComponent);
const PayrollRuleSetsPageComponent = () =>
  import('./payroll-rule-sets-page.component').then(
    (m) => m.PayrollRuleSetsPageComponent,
  );
const PayrollStructuresBuilderPageComponent = () =>
  import('./payroll-structures-builder-page.component').then(
    (m) => m.PayrollStructuresBuilderPageComponent,
  );
const PayrollTdsComponent = () =>
  import('./payroll-tds.component').then((m) => m.PayrollTdsComponent);
const PayrollGratuityComponent = () =>
  import('./payroll-gratuity.component').then((m) => m.PayrollGratuityComponent);

export const PAYROLL_ROUTES: Routes = [
  {
    path: 'payroll',
    loadComponent: PayrollLayoutComponent,
    canActivate: [roleGuard(['PAYROLL'])],
    children: [
      { path: 'dashboard', loadComponent: PayrollDashboardComponent },
      { path: 'clients', loadComponent: PayrollClientsComponent },
      { path: 'employees', loadComponent: PayrollEmployeesComponent },
      { path: 'employees/:employeeId', loadComponent: PayrollEmployeeDetailComponent },
      { path: 'runs', loadComponent: PayrollRunsConsolePageComponent },
      { path: 'pf-esi', loadComponent: PayrollPfEsiDashboardPageComponent },
      { path: 'queries', loadComponent: PayrollQueriesComponent },
      { path: 'full-and-final', loadComponent: PayrollFfLifecyclePageComponent },
      { path: 'fnf', redirectTo: 'full-and-final', pathMatch: 'full' },
      { path: 'reports', loadComponent: PayrollReportsComponent },
      { path: 'setup', loadComponent: PayrollSetupTabsPageComponent },
      { path: 'rule-sets', loadComponent: PayrollRuleSetsPageComponent },
      { path: 'structures', loadComponent: PayrollStructuresBuilderPageComponent },
      { path: 'tds-calculator', loadComponent: PayrollTdsComponent },
      { path: 'gratuity-calculator', loadComponent: PayrollGratuityComponent },
      { path: 'registers', loadComponent: PayrollRegistersComponent },
      { path: 'profile', loadComponent: PayrollProfileComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

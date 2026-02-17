import { Routes } from '@angular/router';

const LoginComponent = () =>
  import('./pages/login/login.component').then((m) => m.LoginComponent);

import { CEO_ROUTES } from './pages/ceo/ceo.routes';
import { ADMIN_ROUTES } from './pages/admin/admin.routes';
import { CCO_ROUTES } from './pages/cco/cco.routes';
import { CRM_ROUTES } from './pages/crm/crm.routes';
import { CLIENT_ROUTES } from './pages/client/client.routes';
import { CONTRACTOR_ROUTES } from './pages/contractor/contractor.routes';
import { AUDITOR_ROUTES } from './pages/auditor/auditor.routes';
import { PUBLIC_ROUTES } from './pages/public/public.routes';
import { PAYROLL_ROUTES } from './pages/payroll/payroll.routes';
import { BRANCH_ROUTES } from './pages/branch/branch.routes';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', loadComponent: LoginComponent },

  ...ADMIN_ROUTES,
  ...CEO_ROUTES,
  ...CCO_ROUTES,
  ...CRM_ROUTES,
  ...CLIENT_ROUTES,
  ...CONTRACTOR_ROUTES,
  ...AUDITOR_ROUTES,
  ...BRANCH_ROUTES,
  ...PAYROLL_ROUTES,
  ...PUBLIC_ROUTES,

  { path: '**', redirectTo: '', pathMatch: 'full' },
];

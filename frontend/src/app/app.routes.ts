import { Routes } from '@angular/router';
import { ADMIN_ROUTES } from './pages/admin/admin.routes';
import { AUDITOR_ROUTES } from './pages/auditor/auditor.routes';
import { BRANCH_ROUTES } from './pages/branch/branch.routes';
import { CCO_ROUTES } from './pages/cco/cco.routes';
import { CEO_ROUTES } from './pages/ceo/ceo.routes';
import { CLIENT_ROUTES } from './pages/client/client.routes';
import { CONTRACTOR_ROUTES } from './pages/contractor/contractor.routes';
import { CRM_ROUTES } from './pages/crm/crm.routes';
import { ESS_ROUTES } from './pages/ess/ess.routes';
import { PAYROLL_ROUTES } from './pages/payroll/payroll.routes';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },

  // ── Role-based modules (each file defines its own layout + children) ──
  ...ADMIN_ROUTES,
  ...CRM_ROUTES,
  ...AUDITOR_ROUTES,
  ...CEO_ROUTES,
  ...CCO_ROUTES,
  ...CLIENT_ROUTES,
  ...BRANCH_ROUTES,
  ...CONTRACTOR_ROUTES,
  ...PAYROLL_ROUTES,
  ...ESS_ROUTES,

  // ── Shared ──
  {
    path: 'unauthorized',
    loadComponent: () =>
      import('./pages/shared/unauthorized/unauthorized.component').then(
        (m) => m.UnauthorizedComponent,
      ),
  },

  { path: '**', redirectTo: 'login', pathMatch: 'full' },
];

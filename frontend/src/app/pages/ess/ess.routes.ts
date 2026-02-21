import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const EssLoginComponent = () =>
  import('./ess-login/ess-login.component').then((m) => m.EssLoginComponent);
const EssLayoutComponent = () =>
  import('./ess-layout/ess-layout.component').then((m) => m.EssLayoutComponent);
const EssDashboardComponent = () =>
  import('./dashboard/ess-dashboard.component').then((m) => m.EssDashboardComponent);
const EssProfileComponent = () =>
  import('./profile/ess-profile.component').then((m) => m.EssProfileComponent);
const EssNominationsComponent = () =>
  import('./nominations/ess-nominations.component').then((m) => m.EssNominationsComponent);
const EssLeaveComponent = () =>
  import('./leave/ess-leave.component').then((m) => m.EssLeaveComponent);
const EssPayslipsComponent = () =>
  import('./payslips/ess-payslips.component').then((m) => m.EssPayslipsComponent);
const EssPfComponent = () =>
  import('./pf/ess-pf.component').then((m) => m.EssPfComponent);
const EssEsiComponent = () =>
  import('./esi/ess-esi.component').then((m) => m.EssEsiComponent);

export const ESS_ROUTES: Routes = [
  // Separate ESS login (no auth guard — public)
  { path: 'ess/login', loadComponent: EssLoginComponent },
  // Company-branded login (e.g. /ess/ACME/login)
  { path: 'ess/:companyCode/login', loadComponent: EssLoginComponent },
  {
    path: 'ess',
    loadComponent: EssLayoutComponent,
    canActivate: [roleGuard(['EMPLOYEE'])],
    children: [
      { path: 'dashboard', loadComponent: EssDashboardComponent },
      { path: 'profile', loadComponent: EssProfileComponent },
      { path: 'pf', loadComponent: EssPfComponent },
      { path: 'esi', loadComponent: EssEsiComponent },
      { path: 'nominations', loadComponent: EssNominationsComponent },
      { path: 'leave', loadComponent: EssLeaveComponent },
      { path: 'payslips', loadComponent: EssPayslipsComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

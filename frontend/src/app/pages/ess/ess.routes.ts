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
const EssAttendancePageComponent = () =>
  import('./attendance/ess-attendance-page.component').then(
    (m) => m.EssAttendancePageComponent,
  );
const EssDocumentVaultPageComponent = () =>
  import('./documents/ess-document-vault-page.component').then(
    (m) => m.EssDocumentVaultPageComponent,
  );
const EssHelpdeskComponent = () =>
  import('./helpdesk/ess-helpdesk.component').then(
    (m) => m.EssHelpdeskComponent,
  );
const EssAppraisalsComponent = () =>
  import('./appraisals/ess-appraisals.component').then(
    (m) => m.EssAppraisalsComponent,
  );
const EssAppraisalSelfReviewComponent = () =>
  import('./appraisals/ess-appraisal-self-review.component').then(
    (m) => m.EssAppraisalSelfReviewComponent,
  );
const EssForgotPasswordComponent = () =>
  import('./forgot-password/ess-forgot-password.component').then(
    (m) => m.EssForgotPasswordComponent,
  );

export const ESS_ROUTES: Routes = [
  // Separate ESS login (no auth guard — public)
  { path: 'ess/login', loadComponent: EssLoginComponent },
  // ESS forgot password (public)
  { path: 'ess/forgot-password', loadComponent: EssForgotPasswordComponent },
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
      { path: 'attendance', loadComponent: EssAttendancePageComponent },
      { path: 'documents', loadComponent: EssDocumentVaultPageComponent },
      { path: 'helpdesk', loadComponent: EssHelpdeskComponent },
      { path: 'appraisals', loadComponent: EssAppraisalsComponent },
      { path: 'appraisals/:id', loadComponent: EssAppraisalSelfReviewComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

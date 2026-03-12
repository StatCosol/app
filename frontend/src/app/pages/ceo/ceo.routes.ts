import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const CeoLayoutComponent = () =>
  import('./ceo-layout/ceo-layout.component').then((m) => m.CeoLayoutComponent);
const CeoExecutiveDashboardPageComponent = () =>
  import('./ceo-executive-dashboard-page.component').then(
    (m) => m.CeoExecutiveDashboardPageComponent,
  );
const CeoApprovalsComponent = () =>
  import('./ceo-approvals.component').then((m) => m.CeoApprovalsComponent);
const CeoEscalationsComponent = () =>
  import('./ceo-escalations.component').then((m) => m.CeoEscalationsComponent);
const CeoOversightComponent = () =>
  import('./oversight/ceo-cco-oversight.component').then(
    (m) => m.CeoCcoOversightComponent,
  );
const CeoReportsComponent = () =>
  import('./ceo-reports.component').then((m) => m.CeoReportsComponent);
const CeoNotificationsComponent = () =>
  import('./ceo-notifications.component').then((m) => m.CeoNotificationsComponent);
const CeoProfileComponent = () =>
  import('./ceo-profile.component').then((m) => m.CeoProfileComponent);
const CeoRegistersComponent = () =>
  import('./registers/ceo-registers.component').then((m) => m.CeoRegistersComponent);

export const CEO_ROUTES: Routes = [
  {
    path: 'ceo',
    loadComponent: CeoLayoutComponent,
    canActivate: [roleGuard(['CEO'])],
    children: [
      { path: 'dashboard', loadComponent: CeoExecutiveDashboardPageComponent },
      { path: 'approvals', loadComponent: CeoApprovalsComponent },
      { path: 'escalations', loadComponent: CeoEscalationsComponent },
      { path: 'oversight', loadComponent: CeoOversightComponent },
      { path: 'reports', loadComponent: CeoReportsComponent },
      { path: 'registers', loadComponent: CeoRegistersComponent },
      { path: 'notifications', loadComponent: CeoNotificationsComponent },
      { path: 'profile', loadComponent: CeoProfileComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },

  // Details pages must also be protected (they are outside the CeoLayout child tree)
  {
    path: 'ceo/approvals/:id',
    canActivate: [roleGuard(['CEO'])],
    loadComponent: () =>
      import('./approvals/approval-details.component').then(
        (m) => m.ApprovalDetailsComponent,
      ),
  },
  {
    path: 'ceo/escalations/:id',
    canActivate: [roleGuard(['CEO'])],
    loadComponent: () =>
      import('./escalations/escalation-details.component').then(
        (m) => m.EscalationDetailsComponent,
      ),
  },
];

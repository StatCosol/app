import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const AuditorLayoutComponent = () =>
  import('./auditor-layout/auditor-layout.component').then((m) => m.AuditorLayoutComponent);
const AuditorDashboardComponent = () =>
  import('./auditor-dashboard.component').then((m) => m.AuditorDashboardComponent);
const AuditorAuditsComponent = () =>
  import('./auditor-audits.component').then((m) => m.AuditorAuditsComponent);
const AuditorComplianceComponent = () =>
  import('./auditor-compliance.component').then((m) => m.AuditorComplianceComponent);
const AuditorObservationsComponent = () =>
  import('./observations/auditor-observations.component').then((m) => m.AuditorObservationsComponent);
const AuditorAuditWorkspaceComponent = () =>
  import('./auditor-audit-workspace.component').then((m) => m.AuditorAuditWorkspaceComponent);
const AuditorRegistersComponent = () =>
  import('./registers/auditor-registers.component').then((m) => m.AuditorRegistersComponent);
export const AUDITOR_ROUTES: Routes = [
  {
    path: 'auditor',
    loadComponent: AuditorLayoutComponent,
    canActivate: [roleGuard(['AUDITOR'])],
    children: [
      { path: 'dashboard', loadComponent: AuditorDashboardComponent },
      { path: 'audits', loadComponent: AuditorAuditsComponent },
      { path: 'audit-workspace', loadComponent: AuditorAuditWorkspaceComponent },
      { path: 'observations', loadComponent: AuditorObservationsComponent },
      { path: 'registers', loadComponent: AuditorRegistersComponent },
      { path: 'compliance', loadComponent: AuditorComplianceComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

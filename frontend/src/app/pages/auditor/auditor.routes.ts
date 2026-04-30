import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const AuditorLayoutComponent = () =>
  import('./auditor-layout/auditor-layout.component').then((m) => m.AuditorLayoutComponent);
const AuditorDashboardComponent = () =>
  import('./auditor-dashboard.component').then((m) => m.AuditorDashboardComponent);
const AuditorAuditsComponent = () =>
  import('./auditor-audits.component').then((m) => m.AuditorAuditsComponent);
const AuditorObservationsVerificationPageComponent = () =>
  import('./observations/auditor-observations-verification-page.component').then(
    (m) => m.AuditorObservationsVerificationPageComponent,
  );
const AuditorNotificationsComponent = () =>
  import('./notifications/auditor-notifications.component').then(
    (m) => m.AuditorNotificationsComponent,
  );
const AuditorAuditCockpitPageComponent = () =>
  import('./audit-cockpit/auditor-audit-cockpit-page.component').then(
    (m) => m.AuditorAuditCockpitPageComponent,
  );
const AuditorReportsComponent = () =>
  import('./reports/auditor-reports.component').then(
    (m) => m.AuditorReportsComponent,
  );
const AuditorReportBuilderPageComponent = () =>
  import('./reports/auditor-report-builder-page.component').then(
    (m) => m.AuditorReportBuilderPageComponent,
  );
const AuditorAiAuditComponent = () =>
  import('./ai-audit/auditor-ai-audit.component').then(
    (m) => m.AuditorAiAuditComponent,
  );
export const AUDITOR_ROUTES: Routes = [
  {
    path: 'auditor',
    loadComponent: AuditorLayoutComponent,
    canActivate: [roleGuard(['AUDITOR'])],
    children: [
      { path: 'dashboard', loadComponent: AuditorDashboardComponent },
      { path: 'audits/:auditId/workspace', loadComponent: AuditorAuditCockpitPageComponent },
      { path: 'audits', loadComponent: AuditorAuditsComponent },
      { path: 'audit-workspace', redirectTo: 'audits', pathMatch: 'full' },
      { path: 'observations', loadComponent: AuditorObservationsVerificationPageComponent },
      { path: 'reverification', redirectTo: 'observations', pathMatch: 'full' },
      { path: 'compliance', redirectTo: 'observations', pathMatch: 'full' },
      { path: 'registers', redirectTo: 'audits', pathMatch: 'full' },
      { path: 'reports/:auditId/builder', loadComponent: AuditorReportBuilderPageComponent },
      { path: 'reports', loadComponent: AuditorReportsComponent },
      { path: 'notifications', loadComponent: AuditorNotificationsComponent },
      { path: 'ai-audit', loadComponent: AuditorAiAuditComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

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
const AuditorObservationsVerificationPageComponent = () =>
  import('./observations/auditor-observations-verification-page.component').then(
    (m) => m.AuditorObservationsVerificationPageComponent,
  );
const AuditorAuditCockpitPageComponent = () =>
  import('./audit-cockpit/auditor-audit-cockpit-page.component').then(
    (m) => m.AuditorAuditCockpitPageComponent,
  );
const AuditorRegistersComponent = () =>
  import('./registers/auditor-registers.component').then((m) => m.AuditorRegistersComponent);
const AuditorComplianceTasksComponent = () =>
  import('./compliance/auditor-compliance-tasks.component').then(
    (m) => m.AuditorComplianceTasksComponent,
  );
const AuditorComplianceTaskDetailComponent = () =>
  import('./compliance/auditor-compliance-task-detail.component').then(
    (m) => m.AuditorComplianceTaskDetailComponent,
  );
const AuditorReuploadInboxComponent = () =>
  import('./compliance/auditor-reupload-inbox.component').then(
    (m) => m.AuditorReuploadInboxComponent,
  );
const AuditorReportsComponent = () =>
  import('./reports/auditor-reports.component').then(
    (m) => m.AuditorReportsComponent,
  );
const AuditorReportBuilderPageComponent = () =>
  import('./reports/auditor-report-builder-page.component').then(
    (m) => m.AuditorReportBuilderPageComponent,
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
      { path: 'audit-workspace', loadComponent: AuditorAuditCockpitPageComponent },
      { path: 'observations', loadComponent: AuditorObservationsVerificationPageComponent },
      { path: 'registers', loadComponent: AuditorRegistersComponent },
      { path: 'compliance', loadComponent: AuditorComplianceComponent },
      { path: 'compliance/tasks', loadComponent: AuditorComplianceTasksComponent },
      { path: 'compliance/tasks/:id', loadComponent: AuditorComplianceTaskDetailComponent },
      { path: 'compliance/reupload-inbox', loadComponent: AuditorReuploadInboxComponent },
      { path: 'reports/:auditId/builder', loadComponent: AuditorReportBuilderPageComponent },
      { path: 'reports', loadComponent: AuditorReportsComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

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
const AuditorReportBuilderComponent = () =>
  import('./reports/auditor-report-builder.component').then(
    (m) => m.AuditorReportBuilderComponent,
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
      { path: 'observations', loadComponent: AuditorObservationsComponent },
      { path: 'registers', loadComponent: AuditorRegistersComponent },
      { path: 'compliance', loadComponent: AuditorComplianceComponent },
      { path: 'compliance/tasks', loadComponent: AuditorComplianceTasksComponent },
      { path: 'compliance/tasks/:id', loadComponent: AuditorComplianceTaskDetailComponent },
      { path: 'compliance/reupload-inbox', loadComponent: AuditorReuploadInboxComponent },
      { path: 'reports/:auditId/builder', loadComponent: AuditorReportBuilderComponent },
      { path: 'reports', loadComponent: AuditorReportsComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

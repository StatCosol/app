import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const AdminLayoutComponent = () =>
  import('./admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent);
const AdminDashboardComponent = () =>
  import('./admin-dashboard.component').then((m) => m.AdminDashboardComponent);
const AdminReportsComponent = () =>
  import('./admin-reports.component').then((m) => m.AdminReportsComponent);
const UsersComponent = () =>
  import('./users/users.component').then((m) => m.UsersComponent);
const AdminClientsComponent = () =>
  import('./clients/admin-clients.component').then((m) => m.AdminClientsComponent);
const AdminAssignmentsComponent = () =>
  import('./assignments/admin-assignments.component').then((m) => m.AdminAssignmentsComponent);
const AdminHelpdeskCenterPageComponent = () =>
  import('./notifications/admin-helpdesk-center-page.component').then(
    (m) => m.AdminHelpdeskCenterPageComponent,
  );
const AdminDigestComponent = () =>
  import('./digest/admin-digest.component').then((m) => m.AdminDigestComponent);
const AdminPayrollAssignmentsComponent = () =>
  import('./payroll-assignments/admin-payroll-assignments.component').then(
    (m) => m.AdminPayrollAssignmentsComponent,
  );
const AdminPayrollTemplatesPageComponent = () =>
  import('./payroll-templates/admin-payroll-templates-page.component').then(
    (m) => m.AdminPayrollTemplatesPageComponent,
  );
const AdminPayrollClientSettingsPageComponent = () =>
  import('./payroll-client-settings/admin-payroll-client-settings-page.component').then(
    (m) => m.AdminPayrollClientSettingsPageComponent,
  );
const AdminMastersComponent = () =>
  import('./masters/admin-masters.component').then((m) => m.AdminMastersComponent);
const AdminApprovalsComponent = () =>
  import('./approvals/admin-approvals.component').then((m) => m.AdminApprovalsComponent);
const AiDashboardComponent = () =>
  import('./ai/ai-dashboard.component').then((m) => m.AiDashboardComponent);
const AiRiskComponent = () =>
  import('./ai/ai-risk.component').then((m) => m.AiRiskComponent);
const AiAuditComponent = () =>
  import('./ai/ai-audit.component').then((m) => m.AiAuditComponent);
const AiPayrollComponent = () =>
  import('./ai/ai-payroll.component').then((m) => m.AiPayrollComponent);
const AiConfigComponent = () =>
  import('./ai/ai-config.component').then((m) => m.AiConfigComponent);
const SlaTrackerComponent = () =>
  import('../../shared/sla/sla-tracker.component').then((m) => m.SlaTrackerComponent);
const HeatmapComponent = () =>
  import('../../shared/risk/heatmap.component').then((m) => m.HeatmapComponent);
const RiskTrendComponent = () =>
  import('../../shared/risk/risk-trend.component').then((m) => m.RiskTrendComponent);
const EscalationsComponent = () =>
  import('../../shared/escalations/escalations.component').then((m) => m.EscalationsComponent);
const AdminAuditLogsComponent = () =>
  import('./audit-logs/admin-audit-logs.component').then((m) => m.AdminAuditLogsComponent);
const AdminGovernanceControlPageComponent = () =>
  import('./governance/admin-governance-control-page.component').then(
    (m) => m.AdminGovernanceControlPageComponent,
  );
const UnassignedClientsComponent = () =>
  import('./governance/unassigned-clients.component').then((m) => m.UnassignedClientsComponent);
const AdminArchiveComponent = () =>
  import('./archive/admin-archive.component').then((m) => m.AdminArchiveComponent);
const ApplicabilityListComponent = () =>
  import('./applicability/applicability-list.component').then((m) => m.ApplicabilityListComponent);
const BranchApplicabilityComponent = () =>
  import('./applicability/branch-applicability.component').then((m) => m.BranchApplicabilityComponent);

export const ADMIN_ROUTES: Routes = [
  {
    path: 'admin',
    loadComponent: AdminLayoutComponent,
    canActivate: [roleGuard(['ADMIN'])],
    children: [
      { path: 'dashboard', loadComponent: AdminDashboardComponent },
      { path: 'reports', loadComponent: AdminReportsComponent },
      { path: 'users', loadComponent: UsersComponent },
      { path: 'clients', loadComponent: AdminClientsComponent },
      { path: 'clients/:id', loadComponent: AdminClientsComponent },
      { path: 'clients/:id/:tab', loadComponent: AdminClientsComponent },
      { path: 'assignments', loadComponent: AdminAssignmentsComponent },
      { path: 'payroll-assignments', loadComponent: AdminPayrollAssignmentsComponent },
      { path: 'payroll/templates', loadComponent: AdminPayrollTemplatesPageComponent },
      { path: 'payroll/client-settings', loadComponent: AdminPayrollClientSettingsPageComponent },
      { path: 'masters', loadComponent: AdminMastersComponent },
      { path: 'approvals', loadComponent: AdminApprovalsComponent },
      { path: 'notifications', loadComponent: AdminHelpdeskCenterPageComponent },
      { path: 'digest', loadComponent: AdminDigestComponent },
      { path: 'ai-hub', loadComponent: AiDashboardComponent },
      { path: 'ai-risk', loadComponent: AiRiskComponent },
      { path: 'ai-audit', loadComponent: AiAuditComponent },
      { path: 'ai-payroll', loadComponent: AiPayrollComponent },
      { path: 'ai-config', loadComponent: AiConfigComponent },
      { path: 'sla', loadComponent: SlaTrackerComponent },
      { path: 'heatmap', loadComponent: HeatmapComponent },
      { path: 'risk-trend', loadComponent: RiskTrendComponent },
      { path: 'escalations', loadComponent: EscalationsComponent },
      { path: 'audit-logs', loadComponent: AdminAuditLogsComponent },
      { path: 'governance', loadComponent: AdminGovernanceControlPageComponent },
      { path: 'governance/unassigned', loadComponent: UnassignedClientsComponent },
      { path: 'archive', loadComponent: AdminArchiveComponent },
      { path: 'applicability', loadComponent: ApplicabilityListComponent },
      { path: 'branches/:branchId/applicability', loadComponent: BranchApplicabilityComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

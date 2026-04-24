import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';
import { branchUserOnlyGuard } from '../../core/branch-user-only.guard';
import { branchPayrollAccessGuard } from '../../core/branch-payroll-access.guard';

const ClientLayoutComponent = () =>
  import('./client-layout/client-layout.component').then((m) => m.ClientLayoutComponent);
const ClientDashboardComponent = () =>
  import('./dashboard/client-dashboard.component').then((m) => m.ClientDashboardComponent);
const ClientComplianceStatusComponent = () =>
  import('./compliance/client-compliance-status.component').then((m) => m.ClientComplianceStatusComponent);
const ClientProfileComponent = () =>
  import('./profile/client-profile.component').then((m) => m.ClientProfileComponent);
const ClientSupportComponent = () =>
  import('./client-support.component').then((m) => m.ClientSupportComponent);
const ClientBranchesComponent = () =>
  import('./client-branches.component').then((m) => m.ClientBranchesComponent);
const ClientBranchDetailWorkspacePageComponent = () =>
  import('./branches/client-branch-detail-workspace-page.component').then(
    (m) => m.ClientBranchDetailWorkspacePageComponent,
  );
const ClientContractorsComponent = () =>
  import('./contractors/client-contractors.component').then((m) => m.ClientContractorsComponent);
const ClientContractorsBranchComponent = () =>
  import('./contractors/client-contractors-branch.component').then(
    (m) => m.ClientContractorsBranchComponent,
  );
const ClientPayrollMonitoringPageComponent = () =>
  import('./payroll/client-payroll-monitoring-page.component').then(
    (m) => m.ClientPayrollMonitoringPageComponent,
  );
const ClientEmployeesComponent = () =>
  import('./employees/client-employees.component').then((m) => m.ClientEmployeesComponent);
const ClientEmployeeFormComponent = () =>
  import('./employees/client-employee-form.component').then((m) => m.ClientEmployeeFormComponent);
const ClientEmployeeDetailComponent = () =>
  import('./employees/client-employee-detail.component').then((m) => m.ClientEmployeeDetailComponent);
const ClientAuditsComponent = () =>
  import('./audits/client-audits.component').then((m) => m.ClientAuditsComponent);
const ClientRegistersDownloadPageComponent = () =>
  import('./registers/client-registers-download-page.component').then(
    (m) => m.ClientRegistersDownloadPageComponent,
  );
const ClientReturnsComponent = () =>
  import('./compliance/client-returns.component').then((m) => m.ClientReturnsComponent);
const ClientMcdComponent = () =>
  import('./compliance/client-mcd.component').then((m) => m.ClientMcdComponent);
const ClientMcdUploadsComponent = () =>
  import('./compliance/client-mcd-uploads.component').then((m) => m.ClientMcdUploadsComponent);
const NominationApprovalsComponent = () =>
  import('./approvals/nomination-approvals.component').then((m) => m.NominationApprovalsComponent);
const LeaveApprovalsComponent = () =>
  import('./approvals/leave-approvals.component').then((m) => m.LeaveApprovalsComponent);
const ClientUnifiedApprovalsPageComponent = () =>
  import('./approvals/client-unified-approvals-page.component').then(
    (m) => m.ClientUnifiedApprovalsPageComponent,
  );
const ClientAccessSettingsComponent = () =>
  import('./settings/client-access-settings.component').then((m) => m.ClientAccessSettingsComponent);
const ClientComplianceLibraryComponent = () =>
  import('./compliance/client-compliance-library.component').then((m) => m.ClientComplianceLibraryComponent);
const ClientRegistrationsComponent = () =>
  import('./compliance/client-registrations.component').then((m) => m.ClientRegistrationsComponent);
const ComplianceCalendarComponent = () =>
  import('../../shared/calendar/compliance-calendar.component').then((m) => m.ComplianceCalendarComponent);
const HeatmapComponent = () =>
  import('../../shared/risk/heatmap.component').then((m) => m.HeatmapComponent);
const SlaTrackerComponent = () =>
  import('../../shared/sla/sla-tracker.component').then((m) => m.SlaTrackerComponent);
const RiskTrendComponent = () =>
  import('../../shared/risk/risk-trend.component').then((m) => m.RiskTrendComponent);
const EscalationsComponent = () =>
  import('../../shared/escalations/escalations.component').then((m) => m.EscalationsComponent);
const ClientUnitDocumentsComponent = () =>
  import('./unit-documents/client-unit-documents.component').then((m) => m.ClientUnitDocumentsComponent);
const ClientSafetyComponent = () =>
  import('./safety/client-safety.component').then((m) => m.ClientSafetyComponent);
const BranchComplianceItemsComponent = () =>
  import('../../shared/branch-compliance/branch-compliance-items.component').then((m) => m.BranchComplianceItemsComponent);
const BranchComplianceComponent = () =>
  import('../../shared/compliance/branch-compliance.component').then(m => m.BranchComplianceComponent);
const ClientMasterDataComponent = () =>
  import('./master-data/client-master-data.component').then(m => m.ClientMasterDataComponent);
const ClientAttendanceReviewPageComponent = () =>
  import('./attendance/client-attendance-review-page.component').then(
    (m) => m.ClientAttendanceReviewPageComponent,
  );
const ClientDailyAttendancePage = () =>
  import('./attendance/client-daily-attendance-page.component').then(
    (m) => m.ClientDailyAttendancePage,
  );
const NewsDetailComponent = () =>
  import('../../shared/news/news-detail.component').then((m) => m.NewsDetailComponent);
const ClientAuditSummariesComponent = () =>
  import('./audits/client-audit-summaries.component').then((m) => m.ClientAuditSummariesComponent);
const ClientRenewalsComponent = () =>
  import('./renewals/client-renewals.component').then((m) => m.ClientRenewalsComponent);
const ClientReturnsSummaryComponent = () =>
  import('./returns/client-returns-summary.component').then((m) => m.ClientReturnsSummaryComponent);
const ClientComplianceRemindersComponent = () =>
  import('./reminders/client-compliance-reminders.component').then((m) => m.ClientComplianceRemindersComponent);
const ClientReturnsPageComponent = () =>
  import('./returns-status/client-returns-page.component').then((m) => m.ClientReturnsPageComponent);
const ClientRenewalsPageComponent = () =>
  import('./renewals-status/client-renewals-page.component').then((m) => m.ClientRenewalsPageComponent);
const ClientNoticesComponent = () =>
  import('./notices/client-notices.component').then((m) => m.ClientNoticesComponent);
const ClientCtcSummaryComponent = () =>
  import('./ctc-summary/client-ctc-summary.component').then((m) => m.ClientCtcSummaryComponent);
const ClientAppraisalDashboardComponent = () =>
  import('./performance-appraisal/client-appraisal-dashboard.component').then((m) => m.ClientAppraisalDashboardComponent);
const ClientAppraisalsListComponent = () =>
  import('./performance-appraisal/client-appraisals-list.component').then((m) => m.ClientAppraisalsListComponent);
const ClientAppraisalApproveComponent = () =>
  import('./performance-appraisal/client-appraisal-approve.component').then((m) => m.ClientAppraisalApproveComponent);
const ClientAppraisalCyclesComponent = () =>
  import('./performance-appraisal/client-appraisal-cycles.component').then((m) => m.ClientAppraisalCyclesComponent);
const ClientAppraisalReportsComponent = () =>
  import('./performance-appraisal/client-appraisal-reports.component').then((m) => m.ClientAppraisalReportsComponent);

export const CLIENT_ROUTES: Routes = [
  {
    path: 'client',
    loadComponent: ClientLayoutComponent,
    canActivate: [roleGuard(['CLIENT'])],
    children: [
      { path: 'dashboard', loadComponent: ClientDashboardComponent },
      { path: 'branches', loadComponent: ClientBranchesComponent },
      { path: 'branches/:branchId', loadComponent: ClientBranchDetailWorkspacePageComponent },
      { path: 'contractors', loadComponent: ClientContractorsComponent },
      { path: 'contractors/branch/:branchId', loadComponent: ClientContractorsBranchComponent },
      { path: 'compliance/status', loadComponent: ClientComplianceStatusComponent, runGuardsAndResolvers: 'always' },
      { path: 'compliance/mcd', loadComponent: ClientMcdComponent, runGuardsAndResolvers: 'always' },
      {
        path: 'compliance/mcd/uploads',
        loadComponent: ClientMcdUploadsComponent,
        canActivate: [branchUserOnlyGuard],
        runGuardsAndResolvers: 'always',
      },
      { path: 'compliance/returns', loadComponent: ClientReturnsComponent, runGuardsAndResolvers: 'always' },
      { path: 'compliance/library', loadComponent: ClientComplianceLibraryComponent, runGuardsAndResolvers: 'always' },
      { path: 'payroll', loadComponent: ClientPayrollMonitoringPageComponent, canActivate: [branchPayrollAccessGuard] },
      { path: 'ctc-summary', loadComponent: ClientCtcSummaryComponent },
      { path: 'employees', loadComponent: ClientEmployeesComponent },
      { path: 'employees/new', loadComponent: ClientEmployeeFormComponent },
      { path: 'employees/:id', loadComponent: ClientEmployeeDetailComponent },
      { path: 'employees/:id/edit', loadComponent: ClientEmployeeFormComponent },
      { path: 'compliance/registrations', loadComponent: ClientRegistrationsComponent },
      { path: 'registers', loadComponent: ClientRegistersDownloadPageComponent },
      { path: 'audits', loadComponent: ClientAuditsComponent },
      { path: 'audit-summaries', loadComponent: ClientAuditSummariesComponent },
      { path: 'renewals', loadComponent: ClientRenewalsComponent },
      { path: 'returns-summary', loadComponent: ClientReturnsSummaryComponent },
      { path: 'reminders', loadComponent: ClientComplianceRemindersComponent },
      { path: 'returns-status', loadComponent: ClientReturnsPageComponent },
      { path: 'renewals-status', loadComponent: ClientRenewalsPageComponent },
      { path: 'compliance-calendar-feed', redirectTo: 'calendar', pathMatch: 'full' },
      { path: 'compliance-reminders-feed', redirectTo: 'reminders', pathMatch: 'full' },
      { path: 'queries', loadComponent: ClientSupportComponent },
      { path: 'queries/:id', redirectTo: 'queries', pathMatch: 'full' },
      { path: 'profile', loadComponent: ClientProfileComponent },
      { path: 'support', redirectTo: 'queries', pathMatch: 'full' },
      { path: 'approvals', loadComponent: ClientUnifiedApprovalsPageComponent },
      { path: 'approvals/nominations', loadComponent: NominationApprovalsComponent },
      { path: 'approvals/leaves', loadComponent: LeaveApprovalsComponent },
      { path: 'settings/access', loadComponent: ClientAccessSettingsComponent },
      { path: 'branches/:branchId/compliance-items', loadComponent: BranchComplianceItemsComponent },
      { path: 'branch-compliance', loadComponent: BranchComplianceComponent },
      { path: 'calendar', loadComponent: ComplianceCalendarComponent },
      { path: 'heatmap', loadComponent: HeatmapComponent },
      { path: 'sla', loadComponent: SlaTrackerComponent },
      { path: 'risk-trend', loadComponent: RiskTrendComponent },
      { path: 'escalations', loadComponent: EscalationsComponent },
      { path: 'unit-documents', loadComponent: ClientUnitDocumentsComponent },
      { path: 'safety', loadComponent: ClientSafetyComponent },
      { path: 'branches/:branchId/applicability', loadComponent: () => import('../admin/applicability/branch-applicability.component').then(m => m.BranchApplicabilityComponent) },
      { path: 'master-data', loadComponent: ClientMasterDataComponent },
      { path: 'attendance', loadComponent: ClientAttendanceReviewPageComponent },
      { path: 'attendance/daily', loadComponent: ClientDailyAttendancePage },
      { path: 'news', loadComponent: NewsDetailComponent },
      { path: 'news/:newsId', loadComponent: NewsDetailComponent },
      { path: 'notices', loadComponent: ClientNoticesComponent },
      { path: 'appraisal-dashboard', loadComponent: ClientAppraisalDashboardComponent },
      { path: 'appraisals', loadComponent: ClientAppraisalsListComponent },
      { path: 'appraisals/:id', loadComponent: ClientAppraisalApproveComponent },
      { path: 'appraisal-cycles', loadComponent: ClientAppraisalCyclesComponent },
      { path: 'appraisal-reports', loadComponent: ClientAppraisalReportsComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

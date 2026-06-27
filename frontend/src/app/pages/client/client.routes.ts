import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';
import { branchUserOnlyGuard } from '../../core/branch-user-only.guard';
import { branchPayrollAccessGuard } from '../../core/branch-payroll-access.guard';
import { moduleAccessGuard } from '../../core/module-access.guard';

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
const ClientBiometricComponent = () =>
  import('./biometric/client-biometric.component').then(
    (m) => m.ClientBiometricComponent,
  );
const ClientMobileAttendanceComponent = () =>
  import('./mobile-attendance/client-mobile-attendance.component').then(
    (m) => m.ClientMobileAttendanceComponent,
  );
const ClientFaceFailuresComponent = () =>
  import('./face-failures/client-face-failures.component').then(
    (m) => m.ClientFaceFailuresComponent,
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
      {
        path: 'dashboard',
        loadComponent: ClientDashboardComponent,
        canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')],
      },
      { path: 'branches', loadComponent: ClientBranchesComponent, canActivate: [moduleAccessGuard(['EMPLOYEE_COMPLIANCE', 'CONTRACTOR_AUDIT', 'CONTRACTOR_DOCUMENTS', 'MOBILE_ATTENDANCE', 'CONTRACTOR_FACE_ATTENDANCE'])] },
      { path: 'branches/:branchId', loadComponent: ClientBranchDetailWorkspacePageComponent, canActivate: [moduleAccessGuard(['EMPLOYEE_COMPLIANCE', 'CONTRACTOR_AUDIT', 'CONTRACTOR_DOCUMENTS', 'MOBILE_ATTENDANCE', 'CONTRACTOR_FACE_ATTENDANCE'])] },
      { path: 'contractors', loadComponent: ClientContractorsComponent, canActivate: [moduleAccessGuard(['CONTRACTOR_AUDIT', 'CONTRACTOR_DOCUMENTS'])] },
      { path: 'contractors/branch/:branchId', loadComponent: ClientContractorsBranchComponent, canActivate: [moduleAccessGuard(['CONTRACTOR_AUDIT', 'CONTRACTOR_DOCUMENTS'])] },
      { path: 'compliance/status', loadComponent: ClientComplianceStatusComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')], runGuardsAndResolvers: 'always' },
      { path: 'compliance/mcd', loadComponent: ClientMcdComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')], runGuardsAndResolvers: 'always' },
      {
        path: 'compliance/mcd/uploads',
        loadComponent: ClientMcdUploadsComponent,
        canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE'), branchUserOnlyGuard],
        runGuardsAndResolvers: 'always',
      },
      { path: 'compliance/returns', loadComponent: ClientReturnsComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')], runGuardsAndResolvers: 'always' },
      { path: 'compliance/library', loadComponent: ClientComplianceLibraryComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')], runGuardsAndResolvers: 'always' },
      { path: 'payroll', loadComponent: ClientPayrollMonitoringPageComponent, canActivate: [moduleAccessGuard('PAYROLL'), branchPayrollAccessGuard] },
      { path: 'ctc-summary', loadComponent: ClientCtcSummaryComponent, canActivate: [moduleAccessGuard('PAYROLL')] },
      { path: 'employees', loadComponent: ClientEmployeesComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'employees/new', loadComponent: ClientEmployeeFormComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'employees/:id', loadComponent: ClientEmployeeDetailComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'employees/:id/edit', loadComponent: ClientEmployeeFormComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'compliance/registrations', loadComponent: ClientRegistrationsComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'registers', loadComponent: ClientRegistersDownloadPageComponent, canActivate: [moduleAccessGuard('PAYROLL')] },
      { path: 'audits', loadComponent: ClientAuditsComponent, canActivate: [moduleAccessGuard('CONTRACTOR_AUDIT')] },
      { path: 'audit-summaries', loadComponent: ClientAuditSummariesComponent, canActivate: [moduleAccessGuard('CONTRACTOR_AUDIT')] },
      { path: 'renewals', loadComponent: ClientRenewalsComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'returns-summary', loadComponent: ClientReturnsSummaryComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'reminders', loadComponent: ClientComplianceRemindersComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'returns-status', loadComponent: ClientReturnsPageComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'renewals-status', loadComponent: ClientRenewalsPageComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'compliance-calendar-feed', redirectTo: 'calendar', pathMatch: 'full' },
      { path: 'compliance-reminders-feed', redirectTo: 'reminders', pathMatch: 'full' },
      { path: 'queries', loadComponent: ClientSupportComponent },
      { path: 'queries/:id', redirectTo: 'queries', pathMatch: 'full' },
      { path: 'profile', loadComponent: ClientProfileComponent },
      { path: 'support', redirectTo: 'queries', pathMatch: 'full' },
      { path: 'approvals', loadComponent: ClientUnifiedApprovalsPageComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'approvals/nominations', loadComponent: NominationApprovalsComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'approvals/leaves', loadComponent: LeaveApprovalsComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'settings/access', loadComponent: ClientAccessSettingsComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'branches/:branchId/compliance-items', loadComponent: BranchComplianceItemsComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'branch-compliance', loadComponent: BranchComplianceComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'calendar', loadComponent: ComplianceCalendarComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'heatmap', loadComponent: HeatmapComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'sla', loadComponent: SlaTrackerComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'risk-trend', loadComponent: RiskTrendComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'escalations', loadComponent: EscalationsComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'unit-documents', loadComponent: ClientUnitDocumentsComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'safety', loadComponent: ClientSafetyComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'branches/:branchId/applicability', loadComponent: () => import('../admin/applicability/branch-applicability.component').then(m => m.BranchApplicabilityComponent), canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'master-data', loadComponent: ClientMasterDataComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'attendance', loadComponent: ClientAttendanceReviewPageComponent, canActivate: [moduleAccessGuard('EMPLOYEE_ATTENDANCE')] },
      { path: 'attendance/daily', loadComponent: ClientDailyAttendancePage, canActivate: [moduleAccessGuard('EMPLOYEE_ATTENDANCE')] },
      { path: 'biometric', loadComponent: ClientBiometricComponent, canActivate: [moduleAccessGuard('EMPLOYEE_ATTENDANCE')] },
      { path: 'mobile-attendance', loadComponent: ClientMobileAttendanceComponent, canActivate: [moduleAccessGuard(['MOBILE_ATTENDANCE', 'CONTRACTOR_FACE_ATTENDANCE'])] },
      { path: 'face-failures', loadComponent: ClientFaceFailuresComponent, canActivate: [moduleAccessGuard(['MOBILE_ATTENDANCE', 'CONTRACTOR_FACE_ATTENDANCE'])] },
      { path: 'news', loadComponent: NewsDetailComponent },
      { path: 'news/:newsId', loadComponent: NewsDetailComponent },
      { path: 'notices', loadComponent: ClientNoticesComponent, canActivate: [moduleAccessGuard('EMPLOYEE_COMPLIANCE')] },
      { path: 'appraisal-dashboard', loadComponent: ClientAppraisalDashboardComponent, canActivate: [moduleAccessGuard('APPRAISAL')] },
      { path: 'appraisals', loadComponent: ClientAppraisalsListComponent, canActivate: [moduleAccessGuard('APPRAISAL')] },
      { path: 'appraisals/:id', loadComponent: ClientAppraisalApproveComponent, canActivate: [moduleAccessGuard('APPRAISAL')] },
      { path: 'appraisal-cycles', loadComponent: ClientAppraisalCyclesComponent, canActivate: [moduleAccessGuard('APPRAISAL')] },
      { path: 'appraisal-reports', loadComponent: ClientAppraisalReportsComponent, canActivate: [moduleAccessGuard('APPRAISAL')] },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

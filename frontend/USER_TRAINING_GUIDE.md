# StatCo Solutions — Comprehensive User Training Guide

> **Platform**: StatCo Compliance Platform (LegitX)
> **Version**: 1.0
> **Last Updated**: March 2026

---

## Table of Contents

1. [Getting Started (Login & Authentication)](#1-getting-started)
2. [Module 1: Admin — Administration Console](#2-admin-module)
3. [Module 2: CEO — Chief Escalation Officer](#3-ceo-module)
4. [Module 3: CCO — Chief Compliance Officer](#4-cco-module)
5. [Module 4: CRM — Client Relationship Manager](#5-crm-module)
6. [Module 5: Client — Master User & Branch User](#6-client-module)
7. [Module 6: Branch — BranchDesk Portal](#7-branch-module)
8. [Module 7: Contractor — ConTrack Portal](#8-contractor-module)
9. [Module 8: Auditor — Audit Management Console](#9-auditor-module)
10. [Module 9: ESS — Employee Self-Service](#10-ess-module)
11. [Module 10: Payroll — PayDek](#11-payroll-module)
12. [Module 11: PF Team — PF & ESI Helpdesk](#12-pf-team-module)

---

## 1. Getting Started

### 1.1 Logging In

- Navigate to the platform URL. You will be directed to the **Login** page.
- Enter your **email** and **password**, then click **Sign In**.
- Upon successful login, you are automatically redirected to your role-specific dashboard (Admin, CRM, Client, etc.).

### 1.2 Forgot Password

- From the login page, click **Forgot Password**.
- Enter your registered email address to receive a password reset link.

### 1.3 Authentication & Session

- The platform uses **JWT-based authentication** with access and refresh tokens stored in your browser session.
- If your session expires, you will be redirected to the login page.
- All API calls are prefixed with `/api/v1/` and protected by role-based access controls.

### 1.4 Role-Based Access

Each user is assigned one role. After login, you only see the module and pages your role permits:

| Role Code | Portal Name | Guard |
|-----------|------------|-------|
| ADMIN | StatCo Admin | `roleGuard(['ADMIN'])` |
| CEO | CEO Executive Dashboard | `roleGuard(['CEO'])` |
| CCO | CCO Dashboard | `roleGuard(['CCO'])` |
| CRM | CRM Portal | `roleGuard(['CRM'])` |
| CLIENT | LegitX Client Portal | `roleGuard(['CLIENT'])` |
| *(Branch User)* | BranchDesk | `branchPortalGuard` |
| CONTRACTOR | ConTrack Portal | `roleGuard(['CONTRACTOR'])` |
| AUDITOR | Auditor Console | `roleGuard(['AUDITOR'])` |
| EMPLOYEE | Employee Self-Service | `roleGuard(['EMPLOYEE'])` |
| PAYROLL | PayDek | `roleGuard(['PAYROLL'])` |
| PF_TEAM | PF & ESI Helpdesk | `roleGuard(['PF_TEAM'])` |

---

## 2. Admin Module

**Portal Name**: StatCo Admin — Administration Console
**URL Prefix**: `/admin`
**Access**: `ADMIN` role only
**Sidebar Color**: Dark blue gradient

### 2.1 Sidebar Navigation

| Group | Menu Item | Route |
|-------|-----------|-------|
| **Overview** | Dashboard | `/admin/dashboard` |
| | Reports | `/admin/reports` |
| **User & Client Management** | Users | `/admin/users` |
| | Clients | `/admin/clients` |
| | Assignments | `/admin/assignments` |
| | Payroll Assignments | `/admin/payroll-assignments` |
| | Governance Center | `/admin/governance` |
| | Unassigned Clients | `/admin/governance/unassigned` |
| **Configuration** | Masters | `/admin/masters` |
| | Payroll Templates | `/admin/payroll/templates` |
| | Payroll Client Settings | `/admin/payroll/client-settings` |
| | Approvals | `/admin/approvals` |
| | Applicability Engine | `/admin/applicability` |
| **Monitoring** | SLA Tracker | `/admin/sla` |
| | Escalations | `/admin/escalations` |
| | Notifications | `/admin/notifications` |
| | Digest | `/admin/digest` |
| | Latest News | `/admin/news` |
| | Helpdesk | `/admin/helpdesk` |
| | Audit Logs | `/admin/audit-logs` |
| **AI Intelligence** | AI Hub | `/admin/ai-hub` |
| | AI Risk Analysis | `/admin/ai-risk` |
| | AI Audit Insights | `/admin/ai-audit` |
| | AI Payroll | `/admin/ai-payroll` |
| | AI Config | `/admin/ai-config` |

### 2.2 Complete Route Map

| Route Path | Component | Description |
|-----------|-----------|-------------|
| `/admin/dashboard` | AdminDashboardComponent | Main admin metrics dashboard |
| `/admin/reports` | AdminReportsComponent | System-wide reporting |
| `/admin/users` | UsersComponent | Create, edit, activate/deactivate all platform users |
| `/admin/clients` | AdminClientsComponent | Manage client companies |
| `/admin/clients/:id` | AdminClientsComponent | View specific client detail |
| `/admin/clients/:id/:tab` | AdminClientsComponent | Client detail with specific tab selected |
| `/admin/assignments` | AdminAssignmentsComponent | Assign CRMs to clients |
| `/admin/payroll-assignments` | AdminPayrollAssignmentsComponent | Assign payroll operators to clients |
| `/admin/payroll/templates` | AdminPayrollTemplatesPageComponent | Manage payroll templates |
| `/admin/payroll/client-settings` | AdminPayrollClientSettingsPageComponent | Configure per-client payroll settings |
| `/admin/masters` | AdminMastersComponent | Manage master data (acts, rules, compliance items) |
| `/admin/approvals` | AdminApprovalsComponent | Review and approve/reject system requests |
| `/admin/notifications` | AdminHelpdeskCenterPageComponent | Helpdesk notification center |
| `/admin/digest` | AdminDigestComponent | Digest/summary views |
| `/admin/ai-hub` | AiDashboardComponent | AI analytics dashboard |
| `/admin/ai-risk` | AiRiskComponent | AI-powered risk analysis |
| `/admin/ai-audit` | AiAuditComponent | AI audit insights |
| `/admin/ai-payroll` | AiPayrollComponent | AI payroll analytics |
| `/admin/ai-config` | AiConfigComponent | Configure AI features |
| `/admin/sla` | SlaTrackerComponent | Track SLA compliance across all clients |
| `/admin/heatmap` | HeatmapComponent | Risk heatmap visualization |
| `/admin/risk-trend` | RiskTrendComponent | Risk trend analysis over time |
| `/admin/escalations` | EscalationsComponent | View all escalated issues |
| `/admin/audit-logs` | AdminAuditLogsComponent | System audit trail |
| `/admin/governance` | AdminGovernanceControlPageComponent | Governance control center |
| `/admin/governance/unassigned` | UnassignedClientsComponent | Clients without CRM assignments |
| `/admin/archive` | AdminArchiveComponent | Archived records |
| `/admin/applicability` | ApplicabilityListComponent | Applicability engine — map laws to branches |
| `/admin/branches/:branchId/applicability` | BranchApplicabilityComponent | Branch-specific applicability configuration |
| `/admin/news` | AdminNewsComponent | Publish and manage news items |
| `/admin/helpdesk` | AdminHelpdeskComponent | Internal helpdesk tickets list |
| `/admin/helpdesk/:id` | AdminHelpdeskDetailComponent | Individual helpdesk ticket detail |

### 2.3 Key Features

- **User Management**: Create users across all roles, set permissions, activate/deactivate accounts
- **Client Management**: Onboard clients, manage their branches, view client detail tabs
- **Assignment Engine**: Assign CRMs and payroll operators to clients
- **Masters Configuration**: Define compliance items, acts, rules, and regulatory frameworks
- **Applicability Engine**: Map applicable laws/compliances to specific branches based on state, industry, etc.
- **AI Intelligence Suite**: AI-powered dashboards for risk, audit, and payroll insights
- **Monitoring Tools**: SLA tracking, escalations, risk heatmap, risk trends
- **Governance Center**: Track unassigned clients, governance controls
- **Audit Logs**: Complete system activity trail
- **Helpdesk**: Internal support ticket management
- **News Management**: Publish news/updates visible to all portal users

---

## 3. CEO Module

**Portal Name**: CEO — Executive Dashboard
**URL Prefix**: `/ceo`
**Access**: `CEO` role only
**Sidebar Color**: Dark green gradient

### 3.1 Sidebar Navigation

| Group | Menu Item | Route |
|-------|-----------|-------|
| **Overview** | Dashboard | `/ceo/dashboard` |
| | Notifications | `/ceo/notifications` |
| **Governance** | Approvals | `/ceo/approvals` |
| | Escalations | `/ceo/escalations` |
| | Oversight | `/ceo/oversight` |
| **Intelligence** | Reports | `/ceo/reports` |
| | Registers | `/ceo/registers` |
| **Account** | Profile | `/ceo/profile` |

### 3.2 Complete Route Map

| Route Path | Component | Description |
|-----------|-----------|-------------|
| `/ceo/dashboard` | CeoExecutiveDashboardPageComponent | Executive summary with KPIs |
| `/ceo/approvals` | CeoApprovalsComponent | Items requiring CEO approval |
| `/ceo/approvals/:id` | ApprovalDetailsComponent | Individual approval detail (standalone page) |
| `/ceo/escalations` | CeoEscalationsComponent | Escalated compliance issues |
| `/ceo/escalations/:id` | EscalationDetailsComponent | Individual escalation detail (standalone page) |
| `/ceo/oversight` | CeoCcoOversightComponent | CCO oversight and exception monitoring |
| `/ceo/branches` | CeoBranchesComponent | All branches overview |
| `/ceo/branches/:branchId` | CeoBranchDetailComponent | Branch-level detail |
| `/ceo/reports` | CeoExecutiveReportsPageComponent | Executive reports and analytics |
| `/ceo/registers` | CeoRegistersComponent | Statutory register downloads |
| `/ceo/notifications` | CeoNotificationsComponent | CEO notification center |
| `/ceo/profile` | CeoProfileComponent | CEO profile & password change |

### 3.3 Key Features

- **Executive Dashboard**: High-level KPIs, compliance health score, overdue items
- **Approval Workflow**: Review and approve/reject items escalated to CEO level (detail pages open standalone outside the sidebar layout)
- **Escalation Management**: Track and resolve escalated compliance issues
- **Oversight**: Monitor CCO activities and exception reports
- **Branch Visibility**: Drill down into any branch's compliance status
- **Executive Reports**: Download and view compliance/performance reports
- **Registers**: Download statutory registers

---

## 4. CCO Module

**Portal Name**: CCO — Chief Compliance Officer
**URL Prefix**: `/cco`
**Access**: `CCO` role only
**Sidebar Color**: Purple gradient

### 4.1 Sidebar Navigation

| Group | Menu Item | Route |
|-------|-----------|-------|
| **Overview** | Dashboard | `/cco/dashboard` |
| | Notifications | `/cco/notifications` |
| **Compliance** | Approvals | `/cco/approvals` |
| | Oversight | `/cco/oversight` |
| | Escalations | `/cco/escalations` |
| | Risk Heatmap | `/cco/risk-heatmap` |
| | Controls | `/cco/controls` |
| | Registers | `/cco/registers` |
| **Team Management** | CRMs Under Me | `/cco/crms-under-me` |
| | CRM Performance | `/cco/crm-performance` |
| **Account** | Profile | `/cco/profile` |

### 4.2 Complete Route Map

| Route Path | Component | Description |
|-----------|-----------|-------------|
| `/cco/dashboard` | CcoDashboardComponent | CCO compliance dashboard |
| `/cco/approvals` | CcoApprovalsComponent | Items requiring CCO approval |
| `/cco/oversight` | CcoOversightExceptionPageComponent | Oversight exceptions and compliance gaps |
| `/cco/crms-under-me` | CcoCrmsUnderMeComponent | List of CRMs reporting to this CCO |
| `/cco/crm-performance` | CcoCrmPerformanceComponent | CRM performance metrics and ratings |
| `/cco/escalations` | CcoEscalationsComponent | Escalated issues |
| `/cco/risk-heatmap` | CcoRiskHeatmapComponent | Visual risk heatmap across clients |
| `/cco/controls` | CcoControlsRegisterPageComponent | Controls register — define/monitor internal controls |
| `/cco/registers` | CcoRegistersComponent | Statutory register downloads |
| `/cco/notifications` | CcoNotificationsComponent | CCO notification center |
| `/cco/profile` | CcoProfileComponent | CCO profile & password change |

### 4.3 Key Features

- **Compliance Dashboard**: Overview of compliance status across all managed clients
- **Approvals**: Approve/reject compliance documents, contractor verifications, etc.
- **Oversight & Exceptions**: Monitor non-compliant areas and exception reports
- **Team Management**: View CRMs under the CCO, track their client portfolios and performance scores
- **CRM Performance**: Detailed performance analytics for each CRM
- **Risk Heatmap**: Visual heat map showing risk levels by client/branch/category
- **Controls Register**: Define and monitor internal compliance controls
- **Escalation Tracking**: Monitor and resolve escalated items

---

## 5. CRM Module

**Portal Name**: CRM — Client Relationship Management
**URL Prefix**: `/crm`
**Access**: `CRM` role only
**Sidebar Color**: Teal gradient

### 5.1 Sidebar Navigation

| Group | Menu Item | Route |
|-------|-----------|-------|
| **Overview** | Dashboard | `/crm/dashboard` |
| **Client Management** | All Clients | `/crm/clients` |
| | Helpdesk | `/crm/helpdesk` |
| **Compliance** | Compliance Tracker | `/crm/compliance-tracker` |
| | Returns / Filings | `/crm/returns` |
| | Branch Docs Review | `/crm/branch-docs-review` |
| | Compliance Calendar | `/crm/calendar` |
| | SLA Tracker | `/crm/sla` |
| | Escalations | `/crm/escalations` |
| | Reupload Backlog | `/crm/reupload-backlog` |
| **Audits & Reports** | Audits | `/crm/audits` |
| | Reports | `/crm/reports` |
| **Account** | Profile | `/crm/profile` |

### 5.2 Complete Route Map

| Route Path | Component | Description |
|-----------|-----------|-------------|
| `/crm/dashboard` | CrmDashboardActionPageComponent | CRM action dashboard with pending tasks |
| `/crm/clients` | CrmClientsComponent | List of all assigned clients |
| `/crm/clients/:clientId/overview` | CrmClientOverviewComponent | Individual client overview (guarded by `crmClientAccessGuard`) |
| `/crm/clients/:clientId/branches` | CrmClientBranchesComponent | Client's branches list |
| `/crm/clients/:clientId/contractors` | CrmContractorsComponent | Client's contractors |
| `/crm/clients/:clientId/compliance-tracker` | CrmComplianceComponent | Client-specific compliance tracker |
| `/crm/clients/:clientId/documents` | CrmDocumentsComponent | Client documents |
| `/crm/clients/:clientId/compliance-docs` | CrmComplianceDocsComponent | Compliance document library |
| `/crm/clients/:clientId/registrations` | CrmRegistrationsComponent | Client registrations & licenses |
| `/crm/clients/:clientId/payroll-status` | CrmPayrollStatusComponent | Client payroll status |
| `/crm/clients/:clientId/unit-documents` | CrmUnitDocumentsComponent | Per-unit document management |
| `/crm/clients/:clientId/safety` | CrmSafetyComponent | Safety compliance matrix |
| `/crm/compliance-tracker` | CrmComplianceComponent | Cross-client compliance tracker |
| `/crm/compliance/tasks` | CrmComplianceTasksComponent | Compliance task list |
| `/crm/helpdesk` | CrmRequestsComponent | Helpdesk tickets from clients |
| `/crm/reports` | CrmReportsComponent | CRM reports |
| `/crm/audits` | CrmAuditManagementPageComponent | Audit management workspace |
| `/crm/returns` | CrmReturnsWorkspacePageComponent | Returns/filings workspace |
| `/crm/renewals` | CrmRenewalsWorkspacePageComponent | Registration renewals workspace |
| `/crm/amendments` | CrmAmendmentsWorkspacePageComponent | Registration amendments workspace |
| `/crm/branch-docs-review` | CrmBranchDocsReviewComponent | Review documents uploaded by branches |
| `/crm/profile` | CrmProfileComponent | CRM profile & password change |
| `/crm/calendar` | ComplianceCalendarComponent | Compliance due date calendar |
| `/crm/sla` | SlaTrackerComponent | SLA tracking |
| `/crm/heatmap` | HeatmapComponent | Risk heatmap |
| `/crm/risk-trend` | RiskTrendComponent | Risk trend analysis |
| `/crm/escalations` | EscalationsComponent | Escalated issues |
| `/crm/reupload-backlog` | CrmReuploadBacklogComponent | Documents requiring re-upload |

### 5.3 Key Features

- **Dashboard**: Action-oriented dashboard showing pending tasks, overdue items, and quick actions
- **Client Portfolio**: Manage multiple clients with per-client sub-navigation (overview, branches, contractors, compliance, documents, registrations, payroll, unit docs, safety)
- **Client Access Guard**: CRMs can only access clients assigned to them
- **Compliance Tracker**: Track compliance status across all clients or per-client
- **Compliance Tasks**: Manage individual compliance tasks
- **Returns & Filings**: Workspace for managing statutory returns and filings
- **Renewals & Amendments**: Track registration renewals and amendments
- **Branch Docs Review**: Review and approve/reject documents uploaded by branch users
- **Helpdesk**: Respond to client support requests
- **Reupload Backlog**: Track documents that need re-uploading after rejection
- **Audit Management**: Schedule, plan, and manage compliance audits
- **Shared Tools**: Compliance calendar, SLA tracker, risk heatmap, risk trends, escalations

---

## 6. Client Module

**Portal Name**: LegitX — Client Compliance Platform
**URL Prefix**: `/client`
**Access**: `CLIENT` role only
**Sidebar Color**: Dark blue gradient

> **Important**: The Client module has two user types:
> - **Master User**: Can see all branches; *cannot* see MCD Uploads (that's branch-level only)
> - **Branch User**: Sees data for their specific branch(es); can see MCD Uploads; may have payroll access hidden if not granted by master user

### 6.1 Sidebar Navigation

| Group | Menu Item | Route | Notes |
|-------|-----------|-------|-------|
| **Overview** | Dashboard | `/client/dashboard` | |
| **Compliance** | Compliance Status | `/client/compliance/status` | |
| | Branch Compliance | `/client/branch-compliance` | |
| | Monthly Uploads | `/client/monthly-uploads` | |
| | Monthly MCD | `/client/compliance/mcd` | |
| | MCD Uploads | `/client/compliance/mcd/uploads` | *Branch users only* (hidden for master users) |
| | Returns / Filings | `/client/compliance/returns` | |
| | Registrations & Licenses | `/client/compliance/registrations` | |
| | Document Library | `/client/compliance/library` | |
| | Unit Documents | `/client/unit-documents` | |
| | Safety | `/client/safety` | |
| | Compliance Calendar | `/client/calendar` | |
| | Risk Heatmap | `/client/heatmap` | |
| | SLA Tracker | `/client/sla` | |
| | Risk Trend | `/client/risk-trend` | |
| | Escalations | `/client/escalations` | |
| | Audits | `/client/audits` | |
| **Payroll** | Payroll | `/client/payroll` | *Hidden for branch users without payroll access* |
| | Employees | `/client/employees` | |
| | Registers | `/client/registers` | |
| | Attendance | `/client/attendance` | |
| | Master Data | `/client/master-data` | |
| **Company** | Branches | `/client/branches` | |
| | Contractors | `/client/contractors` | |
| **Approvals** | Approvals Center | `/client/approvals` | |
| | Nomination Approvals | `/client/approvals/nominations` | |
| | Leave Approvals | `/client/approvals/leaves` | |
| **Support** | My Queries | `/client/queries` | |
| | Help & Support | `/client/support` | *(redirects to queries)* |
| **Account** | Profile | `/client/profile` | |
| | Access Settings | `/client/settings/access` | |

### 6.2 Complete Route Map

| Route Path | Component | Guards | Description |
|-----------|-----------|--------|-------------|
| `/client/dashboard` | ClientDashboardComponent | | Client dashboard |
| `/client/branches` | ClientBranchesComponent | | All branches list |
| `/client/branches/:branchId` | ClientBranchDetailWorkspacePageComponent | | Branch detail workspace |
| `/client/branches/:branchId/compliance-items` | BranchComplianceItemsComponent | | Branch compliance items |
| `/client/branches/:branchId/applicability` | BranchApplicabilityComponent | | Branch applicability settings |
| `/client/contractors` | ClientContractorsComponent | | All contractors list |
| `/client/contractors/branch/:branchId` | ClientContractorsBranchComponent | | Contractors per branch |
| `/client/compliance/status` | ClientComplianceStatusComponent | | Compliance status overview |
| `/client/compliance/mcd` | ClientMcdComponent | | Monthly compliance documents |
| `/client/compliance/mcd/uploads` | ClientMcdUploadsComponent | `branchUserOnlyGuard` | MCD file uploads (branch users only) |
| `/client/compliance/returns` | ClientReturnsComponent | | Returns and filings tracker |
| `/client/compliance/library` | ClientComplianceLibraryComponent | | Document library |
| `/client/compliance/registrations` | ClientRegistrationsComponent | | Registrations & licenses |
| `/client/compliance/reupload-inbox` | *(redirects to `/client/compliance/mcd`)* | | Reupload requests (now a tab in Compliance Upload Center) |
| `/client/payroll` | ClientPayrollMonitoringPageComponent | `branchPayrollAccessGuard` | Payroll monitoring dashboard |
| `/client/employees` | ClientEmployeesComponent | | Employee list |
| `/client/employees/new` | ClientEmployeeFormComponent | | Add new employee |
| `/client/employees/:id` | ClientEmployeeDetailComponent | | Employee detail view |
| `/client/employees/:id/edit` | ClientEmployeeFormComponent | | Edit employee |
| `/client/registers` | ClientRegistersDownloadPageComponent | | Download statutory registers |
| `/client/audits` | ClientAuditsComponent | | Audit results |
| `/client/queries` | ClientSupportComponent | | Support queries/tickets |
| `/client/profile` | ClientProfileComponent | | Profile & password |
| `/client/approvals` | ClientUnifiedApprovalsPageComponent | | Unified approvals center |
| `/client/approvals/nominations` | NominationApprovalsComponent | | PF/ESI nomination approvals |
| `/client/approvals/leaves` | LeaveApprovalsComponent | | Employee leave approvals |
| `/client/settings/access` | ClientAccessSettingsComponent | | Manage branch user access |
| `/client/branch-compliance` | BranchComplianceComponent | | Branch-level compliance view |
| `/client/monthly-uploads` | MonthlyUploadsComponent | | Monthly document uploads |
| `/client/calendar` | ComplianceCalendarComponent | | Compliance due date calendar |
| `/client/heatmap` | HeatmapComponent | | Risk heatmap |
| `/client/sla` | SlaTrackerComponent | | SLA tracker |
| `/client/risk-trend` | RiskTrendComponent | | Risk trend chart |
| `/client/escalations` | EscalationsComponent | | Escalated issues |
| `/client/unit-documents` | ClientUnitDocumentsComponent | | Per-unit document management |
| `/client/safety` | ClientSafetyComponent | | Safety compliance matrix |
| `/client/master-data` | ClientMasterDataComponent | | Master data management |
| `/client/attendance` | ClientAttendanceReviewPageComponent | | Review employee attendance |
| `/client/news` | NewsDetailComponent | | Latest news/updates |
| `/client/news/:newsId` | NewsDetailComponent | | Specific news article |

### 6.3 Key Features

- **Dashboard**: Compliance health overview, pending actions, upcoming due dates
- **Compliance Suite**: Full compliance monitoring — status tracking, MCD, returns/filings, registrations, document library, safety matrix
- **Branch Management**: View all branches, drill into branch detail, view branch-level compliance items and applicability
- **Employee Management**: Full CRUD for employees — add, edit, view detail pages
- **Payroll Monitoring**: View payroll processing status (requires payroll access for branch users)
- **Approvals**: Unified approvals center covering PF/ESI nominations and employee leave requests
- **Contractors**: View all contractors or filter by branch
- **Support**: Raise and track support queries
- **Access Settings**: Master users can configure what branch users can access
- **Reupload Inbox**: View documents that were rejected and need re-uploading
- **Shared Tools**: Calendar, heatmap, SLA tracker, risk trends, escalations
- **Attendance**: Review employee attendance data
- **Master Data**: Manage organizational master data
- **News**: View company news and regulatory updates

---

## 7. Branch Module

**Portal Name**: BranchDesk — Compliance Execution Portal
**URL Prefix**: `/branch`
**Access**: `branchPortalGuard` (branch users who access via the Branch portal)
**Sidebar Color**: Dark blue gradient with emerald accents

### 7.1 Sidebar Navigation

| Menu Item | Route | Notes |
|-----------|-------|-------|
| Dashboard | `/branch/dashboard` | |
| Employees | `/branch/employees` | |
| Contractors | `/branch/contractors` | |
| **Compliance** *(expandable group)* | | Expands to show sub-items |
| ↳ Branch Compliance | `/branch/compliance` | |
| ↳ Monthly Workbench | `/branch/compliance/monthly` | |
| ↳ Monthly Uploads | `/branch/uploads/monthly` | Shows badge count for overdue items |
| ↳ Periodic Uploads | `/branch/uploads` | |
| ↳ Registrations | `/branch/registrations` | |
| ↳ Compliance Calendar | `/branch/calendar` | |
| ↳ Risk Heatmap | `/branch/heatmap` | |
| ↳ SLA Tracker | `/branch/sla` | |
| ↳ Risk Trend | `/branch/risk-trend` | |
| ↳ Escalations | `/branch/escalations` | |
| ↳ Audit Observations | `/branch/audits/observations` | |
| Documents | `/branch/documents` | |
| Unit Documents | `/branch/unit-documents` | |
| Safety | `/branch/safety` | |
| Reports | `/branch/reports` | |
| Notifications | `/branch/notifications` | |
| Helpdesk | `/branch/helpdesk` | |

### 7.2 Complete Route Map

| Route Path | Component | Description |
|-----------|-----------|-------------|
| `/branch/dashboard` | BranchDashboardComponent | Branch dashboard with compliance metrics |
| `/branch/employees` | BranchEmployeesComponent | Employee list for this branch |
| `/branch/employees/new` | BranchEmployeeFormComponent | Add new employee |
| `/branch/employees/:id` | BranchEmployeeDetailComponent | Employee detail |
| `/branch/employees/:id/edit` | BranchEmployeeFormComponent | Edit employee |
| `/branch/contractors` | BranchContractorsComponent | Contractors at this branch |
| `/branch/compliance/monthly` | BranchMonthlyCompliancePageComponent | Monthly compliance workbench |
| `/branch/uploads` | BranchPeriodicUploadsPageComponent | All periodic uploads (default view) |
| `/branch/uploads/monthly` | BranchMcdUploadComponent | Monthly MCD upload |
| `/branch/uploads/:periodicity` | BranchPeriodicUploadsPageComponent | Uploads by periodicity (quarterly, half-yearly, yearly) |
| `/branch/registrations` | BranchRegistrationsPageComponent | Registrations & licenses |
| `/branch/audits/observations` | BranchAuditObservationsPageComponent | Audit observations and remediation |
| `/branch/documents` | BranchDocumentsComponent | Branch document repository |
| `/branch/reports` | BranchReportsComponent | Branch reports |
| `/branch/notifications` | BranchNotificationsComponent | Notifications |
| `/branch/helpdesk` | BranchHelpdeskComponent | Support tickets |
| `/branch/compliance-items` | BranchComplianceItemsComponent | Compliance item list |
| `/branch/compliance` | BranchComplianceComponent | Overall branch compliance view |
| `/branch/compliance-docs` | BranchComplianceDocsComponent | Compliance document library |
| `/branch/calendar` | ComplianceCalendarComponent | Compliance calendar |
| `/branch/heatmap` | HeatmapComponent | Risk heatmap |
| `/branch/sla` | SlaTrackerComponent | SLA tracker |
| `/branch/risk-trend` | RiskTrendComponent | Risk trend |
| `/branch/escalations` | EscalationsComponent | Escalations |
| `/branch/unit-documents` | BranchUnitDocumentsComponent | Unit-level documents |
| `/branch/safety` | BranchSafetyMatrixPageComponent | Safety matrix |
| `/branch/compliance/reupload-inbox` | *(redirects to `/branch/compliance/monthly`)* | Re-upload requests (now a tab in Monthly Compliance) |
| `/branch/news` | NewsDetailComponent | News updates |
| `/branch/news/:newsId` | NewsDetailComponent | Specific news article |

### 7.3 Legacy Redirects

The following old routes automatically redirect:
- `/branch/monthly-compliance` → `/branch/compliance/monthly`
- `/branch/mcd-upload` → `/branch/uploads/monthly`
- `/branch/returns-filings` → `/branch/uploads/yearly`
- `/branch/compliance/quarterly` → `/branch/uploads/quarterly`
- `/branch/compliance/half-yearly` → `/branch/uploads/half-yearly`
- `/branch/compliance/yearly` → `/branch/uploads/yearly`

### 7.4 Key Features

- **Dashboard**: Branch-specific compliance dashboard with metrics
- **Employee Management**: Full employee CRUD (add, view, edit)
- **Contractor Visibility**: View contractors operating at this branch
- **Compliance Group** (expandable): All compliance-related tools in one collapsible group with badge counts showing overdue/reupload items
- **Periodic Uploads**: Upload compliance documents by periodicity (monthly, quarterly, half-yearly, yearly)
- **Monthly Workbench**: Work through monthly compliance items
- **Registrations**: Manage branch registrations and licenses
- **Audit Observations**: View audit findings and submit remediation evidence
- **Document Management**: Branch and unit-level document repositories
- **Safety Matrix**: Track safety compliance items
- **Support**: Helpdesk tickets, notifications
- **Shared Tools**: Calendar, heatmap, SLA, risk trend, escalations

---

## 8. Contractor Module

**Portal Name**: ConTrack — Contractor Portal
**URL Prefix**: `/contractor`
**Access**: `CONTRACTOR` role only
**Sidebar Color**: Dark rose/maroon gradient

### 8.1 Sidebar Navigation

| Group | Menu Item | Route |
|-------|-----------|-------|
| **Overview** | Dashboard | `/contractor/dashboard` |
| **Work** | Compliance | `/contractor/compliance` |
| | Tasks | `/contractor/tasks` |
| | Notifications | `/contractor/notifications` |
| **Support** | Support | `/contractor/support` |
| **Account** | Profile | `/contractor/profile` |

### 8.2 Complete Route Map

| Route Path | Component | Description |
|-----------|-----------|-------------|
| `/contractor/dashboard` | ContractorDashboardUpgradePageComponent | Contractor dashboard with overview cards |
| `/contractor/compliance` | ContractorComplianceComponent | Compliance status for the contractor |
| `/contractor/tasks` | ContractorUnifiedTaskCenterPageComponent | Unified task center (upload docs, respond to requests) |
| `/contractor/tasks/:id` | ContractorUnifiedTaskCenterPageComponent | Specific task detail |
| `/contractor/notifications` | ContractorNotificationsComponent | Notification center |
| `/contractor/support` | ContractorSupportComponent | Raise support tickets |
| `/contractor/profile` | ContractorProfileIdentityPageComponent | Profile & identity management |
| `/contractor/news` | NewsDetailComponent | News updates |
| `/contractor/news/:newsId` | NewsDetailComponent | Specific news article |

### 8.3 Legacy Redirects

- `/contractor/compliance/tasks` → `/contractor/tasks`
- `/contractor/compliance/tasks/:id` → `/contractor/tasks/:id`
- `/contractor/compliance/reupload-requests` → `/contractor/tasks`
- `/contractor/reupload-requests` → `/contractor/tasks`

### 8.4 Key Features

- **Dashboard**: Overview of compliance status, pending tasks, and notifications
- **Compliance View**: See all applicable compliance requirements and their statuses
- **Unified Task Center**: Single workspace for all tasks — upload compliance documents, respond to re-upload requests, complete compliance tasks
- **Profile & Identity**: Manage company profile, upload identity/registration documents
- **Support**: Raise queries to the assigned CRM
- **News**: View regulatory updates

---

## 9. Auditor Module

**Portal Name**: Auditor — Audit Management Console
**URL Prefix**: `/auditor`
**Access**: `AUDITOR` role only
**Sidebar Color**: Amber/gold gradient

### 9.1 Sidebar Navigation

| Group | Menu Item | Route |
|-------|-----------|-------|
| **Overview** | Dashboard | `/auditor/dashboard` |
| **Audit Work** | Audits | `/auditor/audits` |
| | Audit Workspace | `/auditor/audit-workspace` *(redirects to audits)* |
| | Observations | `/auditor/observations` |
| **Compliance** | Compliance Review | `/auditor/compliance` |
| | Registers | `/auditor/registers` |
| | Reports | `/auditor/reports` |

### 9.2 Complete Route Map

| Route Path | Component | Description |
|-----------|-----------|-------------|
| `/auditor/dashboard` | AuditorDashboardComponent | Audit dashboard with upcoming and in-progress audits |
| `/auditor/audits` | AuditorAuditsComponent | List of all assigned audits |
| `/auditor/audits/:auditId/workspace` | AuditorAuditCockpitPageComponent | Audit cockpit — full workspace for conducting an audit |
| `/auditor/observations` | AuditorObservationsVerificationPageComponent | Verify and manage audit observations |
| `/auditor/registers` | AuditorRegistersComponent | Download statutory registers |
| `/auditor/compliance` | AuditorComplianceComponent | Review compliance data |
| `/auditor/compliance/tasks` | AuditorComplianceTasksComponent | Compliance task list |
| `/auditor/compliance/tasks/:id` | AuditorComplianceTaskDetailComponent | Individual compliance task detail |
| `/auditor/compliance/reupload-inbox` | AuditorReuploadInboxComponent | Documents needing re-upload approval |
| `/auditor/reports` | AuditorReportsComponent | Audit reports list |
| `/auditor/reports/:auditId/builder` | AuditorReportBuilderPageComponent | Build/generate audit reports |

### 9.3 Key Features

- **Dashboard**: Overview of audits — upcoming, in-progress, completed
- **Audit List**: View all assigned audits with status filters
- **Audit Cockpit**: Full workspace for conducting an audit — view branch details, compliance data, upload findings, record observations
- **Observations**: Record, verify, and track audit observations and their remediation status
- **Compliance Review**: Review compliance data for audited entities
- **Compliance Tasks**: Track compliance tasks assigned during audits
- **Reupload Inbox**: Review and approve/reject re-uploaded documents
- **Report Builder**: Generate structured audit reports
- **Registers**: Download statutory registers for verification

---

## 10. ESS Module

**Portal Name**: Employee Self-Service (Company-branded — shows client company name)
**URL Prefix**: `/ess`
**Access**: `EMPLOYEE` role only
**Sidebar Color**: Dark navy gradient

### 10.1 Login

ESS has its own dedicated login page:
- `/ess/login` — Standard ESS login
- `/ess/:companyCode/login` — Company-branded login (e.g., `/ess/ACME/login`)

### 10.2 Sidebar Navigation

| Menu Item | Route |
|-----------|-------|
| Dashboard | `/ess/dashboard` |
| My Profile | `/ess/profile` |
| My PF | `/ess/pf` |
| My ESI | `/ess/esi` |
| Nominations | `/ess/nominations` |
| Leave | `/ess/leave` |
| Attendance | `/ess/attendance` |
| Documents | `/ess/documents` |
| Payslips | `/ess/payslips` |
| Helpdesk | `/ess/helpdesk` |

### 10.3 Complete Route Map

| Route Path | Component | Description |
|-----------|-----------|-------------|
| `/ess/login` | EssLoginComponent | ESS login page (public, no guard) |
| `/ess/:companyCode/login` | EssLoginComponent | Company-branded ESS login (public) |
| `/ess/dashboard` | EssDashboardComponent | Employee dashboard |
| `/ess/profile` | EssProfileComponent | Personal profile, bank details, emergency contacts |
| `/ess/pf` | EssPfComponent | PF (Provident Fund) details and passbook |
| `/ess/esi` | EssEsiComponent | ESI (Employee State Insurance) details |
| `/ess/nominations` | EssNominationsComponent | PF/ESI/Gratuity nominee management |
| `/ess/leave` | EssLeaveComponent | Apply for leave, view leave balance and history |
| `/ess/payslips` | EssPayslipsComponent | View and download monthly payslips |
| `/ess/attendance` | EssAttendancePageComponent | View attendance records |
| `/ess/documents` | EssDocumentVaultPageComponent | Document vault — upload and view personal documents |
| `/ess/helpdesk` | EssHelpdeskComponent | Raise helpdesk tickets |

### 10.4 Key Features

- **Company Branding**: The portal displays the employer's name and logo
- **Dashboard**: Welcome screen, quick links, recent activities
- **Profile**: View and update personal details, bank information, emergency contacts
- **PF Details**: View PF account information, UAN, contribution history
- **ESI Details**: View ESI number and contribution details
- **Nominations**: Submit and update PF, ESI, and gratuity nominations (sent for employer approval)
- **Leave Management**: Apply for leave, check balances, view approval status
- **Payslips**: View and download monthly salary slips
- **Attendance**: View daily attendance logs and summaries
- **Document Vault**: Upload personal documents (ID proofs, certificates) securely
- **Helpdesk**: Raise HR/payroll-related tickets

---

## 11. Payroll Module

**Portal Name**: PayDek — Payroll Management
**URL Prefix**: `/payroll`
**Access**: `PAYROLL` role only
**Sidebar Color**: Slate/dark gray gradient

### 11.1 Sidebar Navigation

| Group | Menu Item | Route |
|-------|-----------|-------|
| **Overview** | Dashboard | `/payroll/dashboard` |
| **People** | Clients | `/payroll/clients` |
| | Employees | `/payroll/employees` |
| **Payroll Operations** | Payroll Runs | `/payroll/runs` |
| | PF / ESI Compliance | `/payroll/pf-esi` |
| | Registers | `/payroll/registers` |
| | Full & Final | `/payroll/full-and-final` |
| | TDS Calculator | `/payroll/tds-calculator` |
| | Gratuity Calculator | `/payroll/gratuity-calculator` |
| **Communication** | Queries | `/payroll/queries` |
| **Analytics** | Reports | `/payroll/reports` |
| **Configuration** | Payroll Setup | `/payroll/setup` |
| | Rule Sets | `/payroll/rule-sets` |
| | Salary Structures | `/payroll/structures` |
| **Account** | Profile | `/payroll/profile` |

### 11.2 Complete Route Map

| Route Path | Component | Description |
|-----------|-----------|-------------|
| `/payroll/dashboard` | PayrollDashboardComponent | Payroll operations dashboard |
| `/payroll/clients` | PayrollClientsComponent | Assigned client companies |
| `/payroll/employees` | PayrollEmployeesComponent | Employee master list |
| `/payroll/employees/:employeeId` | PayrollEmployeeDetailComponent | Employee detail view |
| `/payroll/runs` | PayrollRunsConsolePageComponent | Payroll run console — process monthly payroll |
| `/payroll/pf-esi` | PayrollPfEsiDashboardPageComponent | PF & ESI compliance dashboard |
| `/payroll/queries` | PayrollQueriesComponent | Client/employee queries |
| `/payroll/full-and-final` | PayrollFfLifecyclePageComponent | Full & Final settlement processing |
| `/payroll/reports` | PayrollReportsComponent | Payroll reports |
| `/payroll/setup` | PayrollSetupTabsPageComponent | Payroll setup and configuration (tabbed) |
| `/payroll/rule-sets` | PayrollRuleSetsPageComponent | Define payroll calculation rule sets |
| `/payroll/structures` | PayrollStructuresBuilderPageComponent | Build salary structures/components |
| `/payroll/tds-calculator` | PayrollTdsComponent | TDS (Tax Deducted at Source) calculator |
| `/payroll/gratuity-calculator` | PayrollGratuityComponent | Gratuity calculator |
| `/payroll/registers` | PayrollRegistersComponent | Statutory register generation & download |
| `/payroll/profile` | PayrollProfileComponent | Profile & password management |

### 11.3 Key Features

- **Dashboard**: Payroll status overview — pending runs, completed runs, upcoming deadlines
- **Client Management**: View assigned clients and their payroll configuration
- **Employee Management**: Browse and view employee details for payroll processing
- **Payroll Runs Console**: Process monthly payroll — import attendance, calculate salaries, generate payslips, finalize runs
- **PF / ESI Dashboard**: Track PF and ESI filing compliance, generate challan data
- **Full & Final**: Process employee exit settlements (F&F lifecycle management)
- **Registers**: Generate and download statutory registers (Form A, Form B, etc.)
- **TDS Calculator**: Calculate TDS for employees based on income and tax regime
- **Gratuity Calculator**: Calculate gratuity payouts
- **Payroll Setup**: Configure payroll parameters (pay periods, components, deductions)
- **Rule Sets**: Define calculation rules for different client requirements
- **Salary Structures**: Build and manage salary component structures
- **Queries**: Respond to payroll-related queries from clients/employees
- **Reports**: Generate payroll analytics and compliance reports

---

## 12. PF Team Module

**Portal Name**: StatCo — PF & ESI Helpdesk
**URL Prefix**: `/pf-team`
**Access**: `PF_TEAM` role only
**Sidebar Color**: Dark navy gradient

### 12.1 Sidebar Navigation

| Menu Item | Route |
|-----------|-------|
| Dashboard | `/pf-team/dashboard` |
| Tickets | `/pf-team/tickets` |

### 12.2 Complete Route Map

| Route Path | Component | Description |
|-----------|-----------|-------------|
| `/pf-team/dashboard` | PfTeamDashboardComponent | PF team dashboard — ticket metrics and overview |
| `/pf-team/tickets` | PfTeamTicketsComponent | Ticket list — all PF/ESI helpdesk tickets |
| `/pf-team/tickets/:id` | PfTeamTicketDetailComponent | Individual ticket detail and response |

### 12.3 Key Features

- **Dashboard**: Overview of open, pending, and resolved PF/ESI tickets
- **Ticket Management**: View  all PF/ESI helpdesk tickets raised by employees, view ticket details, respond, and resolve
- **Ticket Detail**: Full conversation thread, attachments, status updates, resolution tracking

---

## Appendix A: Shared Components

The following components are shared across multiple modules:

| Component | Used By | Description |
|-----------|---------|-------------|
| ComplianceCalendarComponent | CRM, Client, Branch | Interactive calendar showing compliance due dates |
| SlaTrackerComponent | Admin, CRM, Client, Branch | Track SLA compliance across entities |
| HeatmapComponent | Admin, CRM, Client, Branch | Risk heatmap visualization |
| RiskTrendComponent | Admin, CRM, Client, Branch | Risk trend line chart over time |
| EscalationsComponent | Admin, CRM, Client, Branch | View and manage escalated issues |
| BranchComplianceItemsComponent | Client, Branch | Branch-level compliance item list |
| BranchComplianceComponent | Client, Branch | Branch compliance overview |
| MonthlyUploadsComponent | Client | Monthly document upload interface |
| NewsDetailComponent | Client, Branch, Contractor | View news articles and regulatory updates |

## Appendix B: Route Guards Reference

| Guard | Purpose | Used By |
|-------|---------|---------|
| `roleGuard(['ROLE'])` | Ensures user has the specified role | All role-specific modules |
| `branchPortalGuard` | Ensures user is a branch user accessing the branch portal | Branch module |
| `branchUserOnlyGuard` | Restricts access to branch users only (not master users) | Client MCD Uploads |
| `branchPayrollAccessGuard` | Checks if the branch user has been granted payroll access | Client Payroll page |
| `crmClientAccessGuard` | Ensures CRM can only access their assigned clients | CRM client sub-routes |

## Appendix C: Portal Branding Summary

| Module | Portal Name | Sidebar Brand | Collapsed Abbreviation |
|--------|-------------|---------------|----------------------|
| Admin | StatCo Admin | Administration Console | SA |
| CEO | CEO | Executive Dashboard | CE |
| CCO | CCO | Chief Compliance Officer | CC |
| CRM | CRM | Client Relationship Mgmt | CR |
| Client | LegitX | Client Compliance Platform | LX |
| Branch | BranchDesk | Compliance Execution Portal | BD |
| Contractor | ConTrack | Contractor Portal | CT |
| Auditor | Auditor | Audit Management Console | AU |
| ESS | *(Company Name)* | Employee Portal | *(dynamic)* |
| Payroll | PayDek | Payroll Management | PD |
| PF Team | StatCo | PF & ESI Helpdesk | *(collapsed)* |

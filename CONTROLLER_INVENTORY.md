# Backend Controller Inventory
Generated: 2026-03-05T05:06:40.819Z
Total endpoints: 752
Total controller classes: 152
Total files: 126
Total modules: 41

## Test Users
| Email | Password | Role | ClientId |
|-------|----------|------|----------|
| admin@statcosol.com | Admin@123 | ADMIN | - |
| testclient@test.com | Test@123 | CLIENT | 512cf437-ef2a-4b87-81ab-905a3f4813fe |

## Global Prefix: `api`, URI Versioning default: `v1`
Base URL: `http://localhost:3000/api/v1/...`

---

## Module: `admin`

### admin/admin-actions.controller.ts

**AdminActionsController** — Controller path: `admin/actions`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/admin/actions/notify` | notify | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/actions/reassign` | reassign | (none/JWT only) | any authenticated user |

### admin/admin-approvals.controller.ts

**AdminApprovalsController** — Controller path: `admin/approvals`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/approvals` | list | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/approvals/counts` | getCounts | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/approvals/:id/approve` | approve | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/approvals/:id/reject` | reject | (none/JWT only) | any authenticated user |

### admin/admin-audit-logs.controller.ts

**AdminAuditLogsController** — Controller path: `admin/audit-logs`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/audit-logs` | list | ADMIN | admin@statcosol.com |

### admin/admin-digest.controller.ts

**AdminDigestController** — Controller path: `admin/reminders`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/admin/reminders/send-now` | sendNow | ADMIN | admin@statcosol.com |
| POST | `/api/v1/admin/reminders/send-critical` | sendCritical | (none/JWT only) | any authenticated user |

### admin/admin-list.controller.ts

**AdminListController** — Controller path: `admin`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/notifications/list` | listNotifications | ADMIN | admin@statcosol.com |

### admin/admin-masters.controller.ts

**AdminMastersController** — Controller path: `admin/masters`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/masters/compliances` | listComplianceMasters | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/masters/compliances/:id` | getComplianceMaster | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/masters/compliances` | createComplianceMaster | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/admin/masters/compliances/:id` | updateComplianceMaster | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/admin/masters/compliances/:id` | deleteComplianceMaster | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/masters/audit-categories` | listAuditCategories | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/masters/audit-categories` | createAuditCategory | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/admin/masters/audit-categories/:id` | updateAuditCategory | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/admin/masters/audit-categories/:id` | deleteAuditCategory | (none/JWT only) | any authenticated user |

### admin/admin-payroll-client-settings.controller.ts

**AdminPayrollClientSettingsController** — Controller path: `admin/payroll`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/payroll/['client-settings', 'payroll-client-settings']` | listSettings | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/payroll/['client-settings/:clientId', 'payroll-client-settings/:clientId']` | getSettings | ADMIN | admin@statcosol.com |
| POST | `/api/v1/admin/payroll/['client-settings/:clientId', 'payroll-client-settings/:clientId']` | setSettings | ADMIN | admin@statcosol.com |

### admin/admin-payroll-templates.controller.ts

**AdminPayrollTemplatesController** — Controller path: `admin/payroll`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/payroll/['templates', 'payroll-templates']` | listTemplates | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/payroll/['templates/:id', 'payroll-templates/:id']` | getTemplate | ADMIN | admin@statcosol.com |
| POST | `/api/v1/admin/payroll/['templates', 'payroll-templates']` | createTemplate | ADMIN | admin@statcosol.com |
| PATCH | `/api/v1/admin/payroll/['templates/:id', 'payroll-templates/:id']` | updateTemplate | ADMIN | admin@statcosol.com |
| POST | `/api/v1/admin/payroll/['templates/assign', 'payroll-templates/assign']` | assignTemplateToClient | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/payroll/['templates/client/:clientId', 'payroll-templates/client/:clientId']` | getClientTemplate | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/payroll/runs` | listRuns | ADMIN | admin@statcosol.com |

### admin/admin-reports.controller.ts

**AdminReportsController** — Controller path: `admin/reports`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/reports/user-activity` | getUserActivity | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/reports/user-registrations` | getUserRegistrations | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/reports/user-deletions` | getUserDeletions | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/reports/access-logs` | getAccessLogs | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/reports/assignments` | getAssignments | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/reports/audit-reports` | listAuditReports | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/reports/audit-reports/summary` | getAuditReportsSummary | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/reports/audit-reports/:id` | getAuditReport | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/reports/audit-reports` | createAuditReport | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/admin/reports/audit-reports/:id` | updateAuditReport | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/admin/reports/audit-reports/:id/submit` | submitAuditReport | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/admin/reports/audit-reports/:id/approve` | approveAuditReport | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/admin/reports/audit-reports/:id/publish` | publishAuditReport | (none/JWT only) | any authenticated user |

---

## Module: `ai`

### ai/ai.controller.ts

**AiController** — Controller path: `ai`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/ai/config` | getConfig | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/ai/config` | updateConfig | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ai/status` | getStatus | ADMIN | admin@statcosol.com |
| POST | `/api/v1/ai/risk/assess` | runRiskAssessment | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/ai/risk/client/:clientId` | getClientRisk | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ai/risk/client/:clientId/history` | getClientRiskHistory | ADMIN, CEO, CCO, CRM | admin@statcosol.com |
| GET | `/api/v1/ai/risk/high-risk` | getHighRiskClients | ADMIN, CEO, CCO, CRM | admin@statcosol.com |
| GET | `/api/v1/ai/risk/summary` | getPlatformRiskSummary | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/ai/insights` | getInsights | ADMIN, CEO, CCO | admin@statcosol.com |
| PUT | `/api/v1/ai/insights/:id/dismiss` | dismissInsight | ADMIN, CEO, CCO, CRM | admin@statcosol.com |
| POST | `/api/v1/ai/audit/generate-observation` | generateAuditObservation | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/ai/audit/observations` | listObservations | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ai/audit/observations/:id` | getObservation | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/ai/audit/observations/:id/review` | reviewObservation | ADMIN, CCO, CRM, AUDITOR | admin@statcosol.com |
| POST | `/api/v1/ai/payroll/detect-anomalies` | detectPayrollAnomalies | ADMIN, CCO, AUDITOR | admin@statcosol.com |
| GET | `/api/v1/ai/payroll/anomalies/:clientId` | listAnomalies | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ai/payroll/anomaly-summary/:clientId` | getAnomalySummary | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/ai/payroll/anomalies/:id/resolve` | resolveAnomaly | ADMIN, CEO, CCO, PAYROLL | admin@statcosol.com |
| GET | `/api/v1/ai/dashboard` | getAiDashboard | ADMIN, CCO, PAYROLL | admin@statcosol.com |
| POST | `/api/v1/ai/query-draft` | generateQueryDraft | (none/JWT only) | any authenticated user |
| POST | `/api/v1/ai/document-check/:documentId` | runDocumentCheck | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ai/document-checks` | listDocumentChecks | (none/JWT only) | any authenticated user |
| POST | `/api/v1/ai/risk/branch-assess` | runBranchRiskAssessment | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ai/risk/branch/:branchId` | getBranchRisk | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ai/requests` | listAiRequests | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ai/requests/:id` | getAiRequest | (none/JWT only) | any authenticated user |

---

## Module: `assignments`

### assignments/assignment-rotation.controller.ts

**AssignmentRotationController** — Controller path: `admin/assignments-rotation`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/admin/assignments-rotation/run` | runRotation | ADMIN | admin@statcosol.com |

### assignments/assignments.controller.ts

**AssignmentsController** — Controller path: `admin/assignments`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/assignments/crm` | listCrmAssignments | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/assignments/crm` | assignCrmCompat | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/assignments/auditor` | listAuditorAssignments | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/assignments/auditor` | assignAuditorCompat | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/assignments/branch-auditors` | listBranchAuditors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/assignments/branch-auditors` | assignAuditorToBranch | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/admin/assignments/branch-auditors/:id` | endBranchAuditor | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/assignments` | getAll | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/assignments` | create | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/admin/assignments/:clientId` | updateAssignment | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/assignments/current` | getCurrent | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/assignments/history` | getHistory | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/assignments/clients/:clientId/assignments/current` | getCurrentByClient | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/assignments/clients/:clientId/assignments/history` | getHistoryByClient | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/admin/assignments/:id` | update | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/admin/assignments/:clientId` | unassignClient | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/assignments/clients/:clientId/assignments/change` | change | (none/JWT only) | any authenticated user |

**CrmClientsController** — Controller path: `crm/clients`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/clients/assigned` | getAssigned | CRM | admin@statcosol.com (need role-specific user) |

**AuditorClientsController** — Controller path: `auditor/clients`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auditor/clients/assigned` | getAssigned | AUDITOR | admin@statcosol.com (need role-specific user) |

---

## Module: `auditor`

### auditor/auditor-branches.controller.ts

**AuditorBranchesController** — Controller path: `auditor`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auditor/branches` | myBranches | AUDITOR | admin@statcosol.com (need role-specific user) |

### auditor/auditor-dashboard.controller.ts

**AuditorDashboardController** — Controller path: `auditor/dashboard`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auditor/dashboard/summary` | getSummary | (none/JWT only) | any authenticated user |
| GET | `/api/v1/auditor/dashboard/audits` | getAudits | (none/JWT only) | any authenticated user |
| GET | `/api/v1/auditor/dashboard/observations` | getObservations | (none/JWT only) | any authenticated user |
| GET | `/api/v1/auditor/dashboard/reports` | getReports | (none/JWT only) | any authenticated user |
| GET | `/api/v1/auditor/dashboard/evidence-pending` | getEvidencePending | (none/JWT only) | any authenticated user |
| GET | `/api/v1/auditor/dashboard/activity` | getActivity | (none/JWT only) | any authenticated user |
| POST | `/api/v1/auditor/dashboard/evidence/:id/remind` | remindEvidence | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/auditor/dashboard/evidence/:id/status` | updateEvidenceStatus | (none/JWT only) | any authenticated user |

### auditor/auditor-list.controller.ts

**AuditorListController** — Controller path: `auditor`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auditor/documents` | listDocuments | (none/JWT only) | any authenticated user |
| GET | `/api/v1/auditor/audits` | listAudits | (none/JWT only) | any authenticated user |

---

## Module: `audits`

### audits/auditor-observations.controller.ts

**AuditorObservationsController** — Controller path: `auditor/observations`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auditor/observations/categories` | listCategories | AUDITOR | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/auditor/observations` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/auditor/observations/:id` | getOne | (none/JWT only) | any authenticated user |
| POST | `/api/v1/auditor/observations` | create | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/auditor/observations/:id` | update | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/auditor/observations/:id` | delete | (none/JWT only) | any authenticated user |
| GET | `/api/v1/auditor/observations/audit/:auditId/export` | exportToPdf | (none/JWT only) | any authenticated user |

### audits/audits.controller.ts

**AuditKpiController** — Controller path: `audits/kpi`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/audits/kpi/branch/:branchId` | getBranchKpi | ADMIN, CEO, CCO, CRM, CLIENT, BRANCH, AUDITOR | admin@statcosol.com |
| GET | `/api/v1/audits/kpi/branch/:branchId/:periodCode` | getBranchKpiSingle | (none/JWT only) | any authenticated user |

**CrmAuditsController** — Controller path: `crm/audits`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/audits` | list | CRM | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/crm/audits/:id` | getOne | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/audits` | create | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/crm/audits/:id/status` | updateStatus | (none/JWT only) | any authenticated user |

**AuditorAuditsController** — Controller path: `auditor/audits`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auditor/audits` | list | AUDITOR | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/auditor/audits/:id` | getOne | (none/JWT only) | any authenticated user |
| POST | `/api/v1/auditor/audits/:id/score` | calculateScore | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/auditor/audits/:id/status` | updateStatus | (none/JWT only) | any authenticated user |

**ClientAuditsController** — Controller path: `client/audits`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/audits` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/audits/summary` | summary | (none/JWT only) | any authenticated user |

---

## Module: `auth`

### auth/auth.controller.ts

**AuthController** — Controller path: `auth`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auth/login` | getLogin | (none/JWT only) | any authenticated user |
| POST | `/api/v1/auth/login` | login | (none/JWT only) | any authenticated user |
| POST | `/api/v1/auth/ess/login` | essLogin | (none/JWT only) | any authenticated user |
| POST | `/api/v1/auth/refresh` | refresh | (none/JWT only) | any authenticated user |
| POST | `/api/v1/auth/logout` | logout | (none/JWT only) | any authenticated user |
| POST | `/api/v1/auth/password/request-reset` | requestReset | (none/JWT only) | any authenticated user |
| POST | `/api/v1/auth/password/reset` | resetPassword | (none/JWT only) | any authenticated user |

---

## Module: `branch-compliance`

### branch-compliance/controllers/admin-compliance-docs.controller.ts

**AdminComplianceDocsController** — Controller path: `admin/branch-compliance`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/branch-compliance/return-master` | listMaster | ADMIN | admin@statcosol.com |
| POST | `/api/v1/admin/branch-compliance/return-master` | createMaster | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/admin/branch-compliance/return-master/:returnCode` | updateMaster | (none/JWT only) | any authenticated user |

### branch-compliance/controllers/auditor-compliance-docs.controller.ts

**AuditorComplianceDocsController** — Controller path: `auditor/compliance-docs`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auditor/compliance-docs` | list | AUDITOR | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/auditor/compliance-docs/return-master` | returnMaster | (none/JWT only) | any authenticated user |

### branch-compliance/controllers/branch-compliance-docs.controller.ts

**BranchComplianceDocsController** — Controller path: `branch/compliance-docs`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/branch/compliance-docs/checklist` | getChecklist | CLIENT | testclient@test.com |
| GET | `/api/v1/branch/compliance-docs` | list | (none/JWT only) | any authenticated user |
| POST | `/api/v1/branch/compliance-docs/upload` | UseInterceptors | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/compliance-docs/return-master` | returnMaster | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/compliance-docs/dashboard-kpis` | dashboardKpis | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/compliance-docs/weighted-compliance` | weightedCompliance | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/compliance-docs/dashboard/full` | fullDashboard | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/compliance-docs/trend` | complianceTrend | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/compliance-docs/risk` | riskExposure | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/compliance-docs/badges` | sidebarBadges | (none/JWT only) | any authenticated user |

### branch-compliance/controllers/client-compliance-docs.controller.ts

**ClientComplianceDocsController** — Controller path: `client/branch-compliance`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/branch-compliance` | list | CLIENT | testclient@test.com |
| GET | `/api/v1/client/branch-compliance/dashboard-kpis` | dashboardKpis | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/branch-compliance/return-master` | returnMaster | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/branch-compliance/lowest-branches` | lowestBranches | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/branch-compliance/trend` | companyTrend | (none/JWT only) | any authenticated user |

### branch-compliance/controllers/crm-compliance-docs.controller.ts

**CrmComplianceDocsController** — Controller path: `crm/branch-compliance`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/branch-compliance` | list | CRM | admin@statcosol.com (need role-specific user) |
| PATCH | `/api/v1/crm/branch-compliance/:id/review` | review | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/branch-compliance/return-master` | returnMaster | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/branch-compliance/dashboard-kpis` | dashboardKpis | (none/JWT only) | any authenticated user |

---

## Module: `branches`

### branches/branch-documents.controller.ts

**ClientBranchDocumentsController** — Controller path: `client/branches`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/branches/:id/documents` | listDocs | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/branches/:id/documents/upload` | UseInterceptors | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/client/branches/documents/:docId/reupload` | UseInterceptors | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/branches/:id/mcd` | mcdSchedule | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/branches/:id/registrations` | listRegistrations | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/branches/:id/registration-summary` | registrationSummary | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/branches/registration-summary` | clientRegistrationSummary | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/branches/registration-alerts` | registrationAlerts | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/branches/:id/audit-observations` | listAuditObservations | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/branches/:id/mcd/overview` | mcdOverview | (none/JWT only) | any authenticated user |

**CrmBranchDocumentsController** — Controller path: `crm/branch-documents`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/branch-documents` | list | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/crm/branch-documents/:docId/review` | review | (none/JWT only) | any authenticated user |

**CrmBranchRegistrationsController** — Controller path: `crm/branch-registrations`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/branch-registrations` | list | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/branch-registrations` | create | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/branch-registrations/for-client/:clientId` | createForClient | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/crm/branch-registrations/:id/for-client/:clientId` | update | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/crm/branch-registrations/:id/for-client/:clientId` | remove | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/branch-registrations/:id/for-client/:clientId/upload` | UseInterceptors | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/branch-registrations/summary/:clientId` | summary | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/branch-registrations/alerts/:clientId` | alerts | (none/JWT only) | any authenticated user |

### branches/branch-list.controller.ts

**BranchListController** — Controller path: `branch`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/branch/mcd` | listMcd | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/returns` | listReturns | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/returns/yearly` | listReturnsYearly | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/queries` | listQueries | (none/JWT only) | any authenticated user |

### branches/branch-reports.controller.ts

**BranchReportsController** — Controller path: `branch/reports`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/branch/reports/registration-expiry` | registrationExpiry | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/reports/audit-observations` | auditObservations | (none/JWT only) | any authenticated user |

### branches/branches-common.controller.ts

**BranchesCommonController** — Controller path: `branches`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/branches` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branches/:id` | findOne | (none/JWT only) | any authenticated user |

### branches/branches.controller.ts

**BranchesController** — Controller path: `admin`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/admin/clients/:clientId/branches` | create | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/clients/:clientId/branches` | findByClient | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/branches/:id` | findOne | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/admin/branches/:id` | update | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/admin/branches/:id` | delete | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/branches/:id/restore` | restore | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/branches/:id/contractors` | listContractors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/branches/:id/contractors` | addContractor | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/admin/branches/:branchId/contractors/:userId` | removeContractor | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/branches/:id/applicable-compliances` | listApplicableCompliances | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/branches/:id/applicable-compliances` | saveApplicableCompliances | (none/JWT only) | any authenticated user |

### branches/client-branches.controller.ts

**ClientBranchesController** — Controller path: `client/branches`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/branches` | list | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/branches` | create | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/branches/:id` | detail | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/branches/:id/dashboard` | dashboard | (none/JWT only) | any authenticated user |

### branches/crm-branch-compliances.controller.ts

**CrmBranchCompliancesController** — Controller path: `crm`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/compliances/master` | listMasterCompliances | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/branches/:branchId/applicable-compliances` | getBranchApplicableCompliances | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/branches/:branchId/applicable-compliances` | saveBranchApplicableCompliances | (none/JWT only) | any authenticated user |

### branches/crm-branches.controller.ts

**CrmBranchesController** — Controller path: `crm`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/clients/:clientId/branches` | listByClient | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/clients/:clientId/branches` | createBranch | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/branches/:id/compliances` | listCompliances | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/branches/:id/compliances` | saveCompliances | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/crm/branches/:id` | updateBranch | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/crm/branches/:id` | deleteBranch | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/branches/:id/contractors` | listContractors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/branches/:id/contractors` | addContractor | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/crm/branches/:branchId/contractors/:userId` | removeContractor | (none/JWT only) | any authenticated user |

---

## Module: `calendar`

### calendar/calendar.controller.ts

**CalendarController** — Controller path: `calendar`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/calendar` | getCalendar | ADMIN, CCO, CEO, CRM, CLIENT | admin@statcosol.com |

---

## Module: `cco`

### cco/cco-controls.controller.ts

**CcoControlsController** — Controller path: `cco/controls`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/cco/controls` | getAll | (none/JWT only) | any authenticated user |
| POST | `/api/v1/cco/controls/sla` | saveSla | CCO, ADMIN | admin@statcosol.com |
| PATCH | `/api/v1/cco/controls/sla/:id` | toggleSla | CCO | admin@statcosol.com (need role-specific user) |
| POST | `/api/v1/cco/controls/thresholds` | saveThreshold | CCO | admin@statcosol.com (need role-specific user) |
| PATCH | `/api/v1/cco/controls/thresholds/:id` | toggleThreshold | CCO | admin@statcosol.com (need role-specific user) |
| POST | `/api/v1/cco/controls/reminders` | saveReminder | CCO | admin@statcosol.com (need role-specific user) |
| PATCH | `/api/v1/cco/controls/reminders/:id` | toggleReminder | CCO | admin@statcosol.com (need role-specific user) |

### cco/cco-list.controller.ts

**CcoListController** — Controller path: `cco`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/cco/escalations` | listEscalations | CCO | admin@statcosol.com (need role-specific user) |

### cco/cco.controller.ts

**CcoController** — Controller path: `cco`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/cco/dashboard` | getDashboard | (none/JWT only) | any authenticated user |
| GET | `/api/v1/cco/approvals` | getApprovals | CCO | admin@statcosol.com (need role-specific user) |
| POST | `/api/v1/cco/approvals/:id/approve` | approveRequest | CCO | admin@statcosol.com (need role-specific user) |
| POST | `/api/v1/cco/approvals/:id/reject` | rejectRequest | CCO | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/cco/crms-under-me` | getCrmsUnderMe | CCO | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/cco/oversight` | getOversight | CCO | admin@statcosol.com (need role-specific user) |

---

## Module: `ceo`

### ceo/ceo-dashboard.controller.ts

**CeoDashboardController** — Controller path: `ceo/dashboard`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/ceo/dashboard/summary` | getSummary | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/dashboard/client-overview` | getClientOverview | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/dashboard/cco-crm-performance` | getCcoCrmPerformance | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/dashboard/governance-compliance` | getGovernanceCompliance | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/dashboard/recent-escalations` | getRecentEscalations | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/dashboard/compliance-trend` | getComplianceTrend | (none/JWT only) | any authenticated user |

### ceo/ceo-list.controller.ts

**CeoListController** — Controller path: `ceo`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/ceo/branches` | listBranches | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/audits` | listAudits | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/escalations` | listEscalations | (none/JWT only) | any authenticated user |

### ceo/ceo.controller.ts

**CeoController** — Controller path: `ceo`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/ceo/dashboard` | dashboard | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/approvals` | approvals | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/approvals/:id` | approval | (none/JWT only) | any authenticated user |
| POST | `/api/v1/ceo/approvals/:id/approve` | approve | (none/JWT only) | any authenticated user |
| POST | `/api/v1/ceo/approvals/:id/reject` | reject | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/escalations` | escalations | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/escalations/:id` | escalation | (none/JWT only) | any authenticated user |
| POST | `/api/v1/ceo/escalations/:id/comment` | escalationComment | (none/JWT only) | any authenticated user |
| POST | `/api/v1/ceo/escalations/:id/assign-to-cco` | escalationAssign | (none/JWT only) | any authenticated user |
| POST | `/api/v1/ceo/escalations/:id/close` | escalationClose | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/oversight/cco-summary` | oversightSummary | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/oversight/cco/:ccoId/items` | oversightItems | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/notifications` | notifications | (none/JWT only) | any authenticated user |
| POST | `/api/v1/ceo/notifications/:id/read` | markNotificationRead | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ceo/reports` | reports | (none/JWT only) | any authenticated user |

---

## Module: `checklists`

### checklists/checklists.controller.ts

**ChecklistsController** — Controller path: `checklists`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/checklists/branch/:branchId` | getByBranch | (none/JWT only) | any authenticated user |
| GET | `/api/v1/checklists/branch/:branchId/summary` | branchSummary | (none/JWT only) | any authenticated user |
| GET | `/api/v1/checklists/client/:clientId` | getByClient | CRM, CLIENT, ADMIN, CCO, CEO | admin@statcosol.com |
| PATCH | `/api/v1/checklists/:id` | updateItem | CRM, ADMIN, CCO, CEO | admin@statcosol.com |

---

## Module: `cleanup`

### cleanup/admin-archive.controller.ts

**AdminArchiveController** — Controller path: `admin/archive`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/archive/clients` | listDeletedClients | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/archive/branches` | listDeletedBranches | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/archive/users` | listDeletedUsers | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/archive/clients/:id/summary` | getDeletedClientSummary | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/archive/clients/:id/documents` | getDeletedClientDocuments | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/archive/clients/:id/audits` | getDeletedClientAudits | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/archive/clients/:id/returns` | getDeletedClientReturns | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/archive/clients/:id/registers` | getDeletedClientRegisters | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/archive/clients/:id/restore` | restoreClient | (none/JWT only) | any authenticated user |

---

## Module: `client-dashboard`

### client-dashboard/client-dashboard.controller.ts

**ClientStatsDashboardController** — Controller path: `client-dashboard`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client-dashboard/pf-esi-summary` | getPfEsi | CLIENT | testclient@test.com |
| GET | `/api/v1/client-dashboard/contractor-upload-summary` | getContractorSummary | (none/JWT only) | any authenticated user |

---

## Module: `clients`

### clients/admin-clients.controller.ts

**AdminClientsController** — Controller path: `admin`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/clients` | list | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/clients/with-aggregates` | listWithAggregates | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/clients/:id` | findOne | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/clients` | create | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/admin/clients/:id` | update | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/clients/:id/readiness` | readinessCheck | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/admin/clients/:id` | softDelete | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/clients/:id/restore` | restore | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/client-users-with-client` | listClientUsersWithClient | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/clients/:id/users` | listClientUsers | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/clients/:id/users` | addClientUser | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/admin/clients/:clientId/users/:userId` | removeClientUser | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/clients/:id/logo` | UseInterceptors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/clients/:id/logo-svg` | uploadSvgCode | (none/JWT only) | any authenticated user |

### clients/cco-clients.controller.ts

**CcoClientsController** — Controller path: `cco/clients`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/cco/clients` | list | CCO, ADMIN | admin@statcosol.com |
| GET | `/api/v1/cco/clients/:id` | get | (none/JWT only) | any authenticated user |
| POST | `/api/v1/cco/clients` | create | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/cco/clients/:id/assign` | assign | (none/JWT only) | any authenticated user |

### clients/client-list.controller.ts

**ClientListController** — Controller path: `client`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/compliance/branch-wise` | listCompliance | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/returns` | listReturns | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/audits` | listAudits | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/documents` | listDocuments | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/queries` | listQueries | (none/JWT only) | any authenticated user |

### clients/client.controller.ts

**ClientController** — Controller path: `client`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/me` | getMyCompany | CLIENT | testclient@test.com |

### clients/clients.controller.ts

**ClientsController** — Controller path: `admin/clients-legacy`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/clients-legacy/list-with-aggregates` | listWithAggregates | ADMIN | admin@statcosol.com |

---

## Module: `common`

### common/compliance-pct.controller.ts

**CompliancePctController** — Controller path: `compliance-pct`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/compliance-pct/branch/:branchId` | branchPct | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance-pct/branch/:branchId/weighted` | branchWeighted | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance-pct/client/:clientId` | clientOverall | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance-pct/client/:clientId/branches` | clientBranches | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance-pct/client/:clientId/lowest` | lowestBranches | (none/JWT only) | any authenticated user |

---

## Module: `compliance`

### compliance/controllers/admin-compliance.controller.ts

**AdminComplianceController** — Controller path: `admin/compliance`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/compliance/tasks` | list | ADMIN | admin@statcosol.com |

### compliance/controllers/auditor-compliance.controller.ts

**AuditorComplianceController** — Controller path: `auditor/compliance`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auditor/compliance` | root | AUDITOR | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/auditor/compliance/tasks` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/auditor/compliance/tasks/:id` | detail | (none/JWT only) | any authenticated user |
| GET | `/api/v1/auditor/compliance/docs` | listDocs | (none/JWT only) | any authenticated user |
| POST | `/api/v1/auditor/compliance/reupload-requests` | createReuploadRequests | (none/JWT only) | any authenticated user |
| GET | `/api/v1/auditor/compliance/reupload-requests` | listReuploadRequests | (none/JWT only) | any authenticated user |
| POST | `/api/v1/auditor/compliance/reupload-requests/:id/approve` | approveReupload | (none/JWT only) | any authenticated user |
| POST | `/api/v1/auditor/compliance/reupload-requests/:id/reject` | rejectReupload | (none/JWT only) | any authenticated user |

### compliance/controllers/branch-reupload.controller.ts

**BranchReuploadController** — Controller path: `branch/compliance-docs`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/branch/compliance-docs/reupload-requests` | listReuploadRequests | CLIENT | testclient@test.com |
| POST | `/api/v1/branch/compliance-docs/reupload-requests/:id/upload` | UseInterceptors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/branch/compliance-docs/reupload-requests/:id/submit` | submitReupload | (none/JWT only) | any authenticated user |

### compliance/controllers/client-compliance.controller.ts

**ClientComplianceController** — Controller path: `client/compliance`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/compliance/tasks` | list | CLIENT | testclient@test.com |
| GET | `/api/v1/client/compliance/tasks/:id/items` | listItems | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/compliance/tasks/:id/evidence` | UseInterceptors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/compliance/tasks/:id/submit` | submitTask | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/compliance/reupload-requests` | listReuploadRequests | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/compliance/reupload-requests/:id/upload` | UseInterceptors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/compliance/reupload-requests/:id/submit` | submitReupload | (none/JWT only) | any authenticated user |

### compliance/controllers/common-compliance.controller.ts

**CommonComplianceController** — Controller path: `compliance`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/compliance/master` | getMaster | ADMIN | admin@statcosol.com |

### compliance/controllers/contractor-compliance.controller.ts

**ContractorComplianceController** — Controller path: `contractor/compliance`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/contractor/compliance/tasks` | list | CONTRACTOR | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/contractor/compliance/tasks/:id` | detail | (none/JWT only) | any authenticated user |
| POST | `/api/v1/contractor/compliance/tasks/:id/start` | start | (none/JWT only) | any authenticated user |
| POST | `/api/v1/contractor/compliance/tasks/:id/submit` | submit | (none/JWT only) | any authenticated user |
| POST | `/api/v1/contractor/compliance/tasks/:id/comment` | comment | (none/JWT only) | any authenticated user |
| POST | `/api/v1/contractor/compliance/tasks/:id/evidence` | UseInterceptors | (none/JWT only) | any authenticated user |
| GET | `/api/v1/contractor/compliance/reupload-requests` | listReuploadRequests | (none/JWT only) | any authenticated user |
| GET | `/api/v1/contractor/compliance/docs/:docId/remarks` | getDocRemarks | (none/JWT only) | any authenticated user |
| POST | `/api/v1/contractor/compliance/reupload-requests/:id/upload` | UseInterceptors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/contractor/compliance/reupload-requests/:id/submit` | submitReupload | (none/JWT only) | any authenticated user |

### compliance/controllers/crm-compliance.controller.ts

**CrmComplianceTasksController** — Controller path: `crm/compliance-tasks`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/compliance-tasks/tasks/kpis` | kpis | CRM | admin@statcosol.com (need role-specific user) |
| POST | `/api/v1/crm/compliance-tasks/tasks/bulk-approve` | bulkApprove | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/compliance-tasks/tasks/bulk-reject` | bulkReject | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/compliance-tasks/tasks` | createTask | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/compliance-tasks/tasks` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/compliance-tasks/tasks/:id` | detail | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/crm/compliance-tasks/tasks/:id/assign` | assign | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/compliance-tasks/tasks/:id/approve` | approve | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/compliance-tasks/tasks/:id/reject` | reject | (none/JWT only) | any authenticated user |

### compliance/controllers/dashboard.controller.ts

**ComplianceCrmDashboardController** — Controller path: `crm/dashboard`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/dashboard` | get | CRM | admin@statcosol.com (need role-specific user) |

**ContractorDashboardController** — Controller path: `contractor/dashboard`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/contractor/dashboard` | get | CONTRACTOR | admin@statcosol.com (need role-specific user) |

**ClientDashboardController** — Controller path: `client/dashboard`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/dashboard` | get | CLIENT | testclient@test.com |

**AdminRoleDashboardController** — Controller path: `admin/role-dashboard`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/role-dashboard` | get | ADMIN | admin@statcosol.com |

**ComplianceAuditorDashboardController** — Controller path: `auditor/dashboard`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auditor/dashboard` | get | AUDITOR | admin@statcosol.com (need role-specific user) |

---

## Module: `compliance-documents`

### compliance-documents/admin-compliance-docs.controller.ts

**AdminComplianceDocsController** — Controller path: `admin/compliance-docs`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/admin/compliance-docs/upload` | UseInterceptors | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/compliance-docs` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/compliance-docs/categories` | getCategories | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/compliance-docs/categories/:category/sub` | getSubCategories | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/compliance-docs/:id/download` | download | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/admin/compliance-docs/:id` | remove | (none/JWT only) | any authenticated user |

### compliance-documents/client-compliance-docs.controller.ts

**ClientComplianceDocsController** — Controller path: `client/compliance-docs`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/compliance-docs` | list | CLIENT | testclient@test.com |
| GET | `/api/v1/client/compliance-docs/categories` | getCategories | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/compliance-docs/categories/:category/sub` | getSubCategories | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/compliance-docs/:id/download` | download | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/compliance-docs/settings` | getSettings | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/compliance-docs/settings` | updateSettings | (none/JWT only) | any authenticated user |

### compliance-documents/crm-compliance-docs.controller.ts

**CrmComplianceDocsController** — Controller path: `crm/compliance-docs`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/crm/compliance-docs/upload` | UseInterceptors | CRM | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/crm/compliance-docs` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/compliance-docs/categories` | getCategories | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/compliance-docs/categories/:category/sub` | getSubCategories | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/compliance-docs/:id/download` | download | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/crm/compliance-docs/:id` | remove | (none/JWT only) | any authenticated user |

---

## Module: `compliances`

### compliances/branch-compliance-override.controller.ts

**BranchComplianceOverrideController** — Controller path: `branch-compliances`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/branch-compliances/override` | override | ADMIN, CCO, CRM | admin@statcosol.com |

### compliances/branch-compliance-recompute.controller.ts

**BranchComplianceRecomputeController** — Controller path: `branches`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/branches/:branchId/compliances/recompute` | recompute | ADMIN, CRM | admin@statcosol.com |

### compliances/branch-compliance.controller.ts

**BranchComplianceController** — Controller path: `branches`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/branches/:branchId/compliance-items` | listBranchCompliance | (none/JWT only) | any authenticated user |

### compliances/compliance-metrics.controller.ts

**ComplianceMetricsController** — Controller path: `compliance`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/compliance/completion` | completion | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance/completion-trend` | trend | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance/risk-score` | riskScore | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance/risk-ranking` | riskRanking | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance/risk-heatmap` | heatmap | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance/lowest-branches` | lowestBranches | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance/action-plan` | actionPlan | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance/risk-forecast` | forecast | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance/summary` | summary | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance/benchmark` | benchmark | (none/JWT only) | any authenticated user |
| POST | `/api/v1/compliance/simulate-risk` | simulateRisk | (none/JWT only) | any authenticated user |
| GET | `/api/v1/compliance/export-pack` | exportPack | (none/JWT only) | any authenticated user |

### compliances/compliances.controller.ts

**CompliancesController** — Controller path: `admin`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/compliances` | findAll | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/branches/:branchId/compliances` | getBranchCompliances | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/branches/:branchId/compliances` | saveBranchCompliances | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/branches/:branchId/compliances/recompute` | recompute | (none/JWT only) | any authenticated user |

### compliances/crm-compliance.controller.ts

**CrmComplianceController** — Controller path: `crm/compliance`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/compliance` | list | CRM | admin@statcosol.com (need role-specific user) |

---

## Module: `contractor`

### contractor/client-contractors.controller.ts

**ClientContractorsController** — Controller path: `client/contractors`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/contractors` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/contractors/documents` | documents | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/contractors/dashboard` | dashboard | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/contractors/dashboard/branch/:branchId` | branchDashboard | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/contractors/dashboard/contractor/:contractorId` | contractorDashboard | (none/JWT only) | any authenticated user |

### contractor/contractor-documents.controller.ts

**ContractorDocumentsController** — Controller path: `contractor/documents`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/contractor/documents` | list | CONTRACTOR | admin@statcosol.com (need role-specific user) |
| POST | `/api/v1/contractor/documents/upload` | UseInterceptors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/contractor/documents/reupload/:id` | UseInterceptors | (none/JWT only) | any authenticated user |

**CrmContractorDocumentsController** — Controller path: `crm/contractor-documents`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/contractor-documents` | list | CRM, ADMIN, CCO, CEO, AUDITOR | admin@statcosol.com |
| POST | `/api/v1/crm/contractor-documents/:id/review` | review | (none/JWT only) | any authenticated user |

### contractor/contractor-list.controller.ts

**ContractorListController** — Controller path: `contractor`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/contractor/documents` | listDocuments | (none/JWT only) | any authenticated user |
| GET | `/api/v1/contractor/queries` | listQueries | (none/JWT only) | any authenticated user |

### contractor/contractor-required-documents.controller.ts

**CrmContractorRequiredDocumentsController** — Controller path: `crm/contractor-required-documents`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/contractor-required-documents` | list | CRM, ADMIN, CCO, CEO | admin@statcosol.com |
| GET | `/api/v1/crm/contractor-required-documents/by-client` | listByClient | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/contractor-required-documents` | add | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/contractor-required-documents/bulk` | addBulk | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/crm/contractor-required-documents/:id/toggle` | toggle | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/crm/contractor-required-documents/:id` | remove | (none/JWT only) | any authenticated user |

**ClientContractorRequiredDocumentsController** — Controller path: `client/contractor-required-documents`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/contractor-required-documents` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/contractor-required-documents/all` | listAll | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/contractor-required-documents` | add | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/contractor-required-documents/bulk` | addBulk | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/client/contractor-required-documents/:id/toggle` | toggle | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/client/contractor-required-documents/:id` | remove | (none/JWT only) | any authenticated user |

### contractor/contractor.controller.ts

**ContractorController** — Controller path: `contractor`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/contractor/dashboard` | getDashboard | CONTRACTOR | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/contractor/score-trend` | getScoreTrend | (none/JWT only) | any authenticated user |

**AdminContractorsController** — Controller path: `admin/contractors`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/contractors/links` | listLinks | ADMIN | admin@statcosol.com |

**CrmContractorsController** — Controller path: `crm/contractors`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/contractors/:contractorId/branches` | getContractorBranches | CRM | admin@statcosol.com (need role-specific user) |
| PUT | `/api/v1/crm/contractors/:contractorId/branches` | setContractorBranches | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/contractors/:contractorId/branches` | addContractorBranches | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/crm/contractors/:contractorId/branches/:branchId` | removeContractorBranch | (none/JWT only) | any authenticated user |

### contractor/crm-contractor-registration.controller.ts

**CrmContractorRegistrationController** — Controller path: `crm/contractors`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/crm/contractors/register` | registerContractor | CRM | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/crm/contractors/my-contractors` | listMyContractors | (none/JWT only) | any authenticated user |

---

## Module: `crm`

### crm/crm-compliance-tracker.controller.ts

**CrmComplianceTrackerController** — Controller path: `crm/compliance-tracker`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/compliance-tracker/mcd` | mcd | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/compliance-tracker/mcd/:branchId/finalize` | finalizeMcd | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/compliance-tracker/mcd/:branchId/return` | returnMcd | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/compliance-tracker/mcd/:branchId/lock` | lockMcd | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/compliance-tracker/reupload-backlog` | reuploadBacklog | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/compliance-tracker/reupload-requests` | reuploadRequests | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/compliance-tracker/reupload-top-units` | topOverdueUnits | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/compliance-tracker/audit-closures` | auditClosures | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/compliance-tracker/audit-closures/:observationId/close` | closeObservation | (none/JWT only) | any authenticated user |

### crm/crm-contractor-documents.controller.ts

**CrmContractorDocumentsController** — Controller path: `crm/contractor-documents`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/contractor-documents/kpis` | kpis | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/contractor-documents` | list | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/contractor-documents/:id/review` | review | (none/JWT only) | any authenticated user |

### crm/crm-dashboard.controller.ts

**CrmDashboardController** — Controller path: `crm/dashboard`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/dashboard/summary` | getSummary | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/dashboard/due-compliances` | getDueCompliances | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/dashboard/low-coverage-branches` | getLowCoverageBranches | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/dashboard/queries` | getQueries | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/dashboard/pending-documents` | getPendingDocuments | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/dashboard/kpis` | getKpis | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/dashboard/priority-today` | getPriorityToday | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/dashboard/top-risk-clients` | getTopRiskClients | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/dashboard/upcoming-audits` | getUpcomingAudits | (none/JWT only) | any authenticated user |

### crm/crm-list.controller.ts

**CrmListController** — Controller path: `crm`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/tasks` | listTasks | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/due-items` | listDueItems | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/documents/review` | listDocReview | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/mcd` | listMcd | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/queries` | listQueries | (none/JWT only) | any authenticated user |

---

## Module: `crm-documents`

### crm-documents/controllers/branch-unit-documents.controller.ts

**BranchUnitDocumentsController** — Controller path: `branch/unit-documents`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/branch/unit-documents` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/unit-documents/:id/download` | download | (none/JWT only) | any authenticated user |

### crm-documents/controllers/client-unit-documents.controller.ts

**ClientUnitDocumentsController** — Controller path: `client/unit-documents`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/unit-documents` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/unit-documents/:id/download` | download | (none/JWT only) | any authenticated user |

### crm-documents/controllers/crm-unit-documents.controller.ts

**CrmUnitDocumentsController** — Controller path: `crm/unit-documents`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/crm/unit-documents/upload` | UseInterceptors | CRM | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/crm/unit-documents` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/unit-documents/:id/download` | download | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/crm/unit-documents/:id` | remove | (none/JWT only) | any authenticated user |

---

## Module: `dashboard`

### dashboard/admin-dashboard.controller.ts

**AdminDashboardController** — Controller path: `admin/dashboard`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/dashboard` | base | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/states` | getAvailableStates | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/clients-minimal` | clientsMinimal | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/summary` | summary | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/escalations` | getEscalations | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/assignments-attention` | getAssignmentsAttention | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/task-status` | getTaskStatus | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/sla-trend` | getSlaTrend | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/stats` | getStats | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/crm-load` | getCrmLoad | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/auditor-load` | getAuditorLoad | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/attention` | getAttention | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/assignment-summary` | getAssignmentSummary | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/unassigned-clients` | getUnassignedClients | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/audit-summary` | getAuditSummary | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/dashboard/risk-alerts` | getRiskAlerts | ADMIN, CEO, CCO | admin@statcosol.com |

---

## Module: `employees`

### employees/employees.controller.ts

**ClientEmployeesController** — Controller path: `client/employees`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/client/employees` | create | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/employees` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/employees/:id` | findOne | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/client/employees/:id` | update | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/client/employees/:id/deactivate` | deactivate | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/employees/:id/provision-ess` | provisionEss | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/employees/:id/nominations` | createNomination | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/employees/:id/nominations` | listNominations | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/employees/:id/forms/generate` | generateForm | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/employees/:id/forms` | listForms | (none/JWT only) | any authenticated user |

---

## Module: `escalations`

### escalations/escalations.controller.ts

**EscalationsController** — Controller path: `escalations`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/escalations` | list | ADMIN, CCO, CEO, CRM, CLIENT | admin@statcosol.com |
| PATCH | `/api/v1/escalations/:id` | update | (none/JWT only) | any authenticated user |

---

## Module: `ess`

### ess/ess.controller.ts

**EssController** — Controller path: `ess`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/ess/company` | getCompanyBranding | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ess/profile` | getProfile | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ess/statutory` | getStatutory | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ess/contributions` | getContributions | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ess/nominations` | listNominations | (none/JWT only) | any authenticated user |
| POST | `/api/v1/ess/nominations` | createNomination | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/ess/nominations/:id/submit` | submitNomination | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/ess/nominations/:id/resubmit` | resubmitNomination | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ess/leave/balances` | getLeaveBalances | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ess/leave/policies` | getLeavePolicies | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ess/leave/applications` | listLeaveApplications | (none/JWT only) | any authenticated user |
| POST | `/api/v1/ess/leave/apply` | applyLeave | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/ess/leave/:id/cancel` | cancelLeave | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ess/payslips` | listPayslips | (none/JWT only) | any authenticated user |
| GET | `/api/v1/ess/payslips/:id/download` | downloadPayslip | (none/JWT only) | any authenticated user |

**BranchApprovalsController** — Controller path: `branch-approvals`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/branch-approvals/nominations` | listPendingNominations | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/branch-approvals/nominations/:id/approve` | approveNomination | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/branch-approvals/nominations/:id/reject` | rejectNomination | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch-approvals/leaves` | listPendingLeaves | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/branch-approvals/leaves/:id/approve` | approveLeave | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/branch-approvals/leaves/:id/reject` | rejectLeave | (none/JWT only) | any authenticated user |

**LeaveManagementController** — Controller path: `leave-management`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/leave-management/policies` | listPolicies | CLIENT | testclient@test.com |
| POST | `/api/v1/leave-management/policies` | createPolicy | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/leave-management/policies/:id` | updatePolicy | (none/JWT only) | any authenticated user |
| POST | `/api/v1/leave-management/seed-defaults` | seedDefaults | (none/JWT only) | any authenticated user |
| POST | `/api/v1/leave-management/initialize-balances` | initializeBalances | ADMIN, CLIENT | admin@statcosol.com |

---

## Module: `files`

### files/files.controller.ts

**FilesController** — Controller path: `files`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/files/download` | download | ADMIN, CLIENT, PAYROLL, PF_TEAM, CRM, AUDITOR, CONTRACTOR | admin@statcosol.com |

---

## Module: `health`

### health/health.controller.ts

**HealthController** — Controller path: `health | api/health`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/health | api/health` | health | (none/JWT only) | any authenticated user |

---

## Module: `helpdesk`

### helpdesk/helpdesk.controller.ts

**AdminHelpdeskController** — Controller path: `admin/helpdesk`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/helpdesk/tickets` | list | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/helpdesk/tickets/:ticketId` | getTicket | (none/JWT only) | any authenticated user |

**ClientHelpdeskController** — Controller path: `client/helpdesk`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/helpdesk/tickets` | list | CLIENT | testclient@test.com |
| POST | `/api/v1/client/helpdesk/tickets` | create | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/helpdesk/tickets/:ticketId` | getTicket | (none/JWT only) | any authenticated user |

**PfTeamHelpdeskController** — Controller path: `pf-team/helpdesk`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/pf-team/helpdesk/tickets` | list | PF_TEAM | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/pf-team/helpdesk/tickets/:ticketId` | getTicket | (none/JWT only) | any authenticated user |

**HelpdeskMessagesController** — Controller path: `helpdesk/tickets/:ticketId`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/helpdesk/tickets/:ticketId/messages` | postMessage | CLIENT, PF_TEAM, ADMIN, CRM | admin@statcosol.com |
| POST | `/api/v1/helpdesk/tickets/:ticketId/files` | UseInterceptors | (none/JWT only) | any authenticated user |
| GET | `/api/v1/helpdesk/tickets/:ticketId/messages` | listMessages | (none/JWT only) | any authenticated user |

**CrmHelpdeskController** — Controller path: `crm/helpdesk`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/helpdesk/tickets` | list | CRM | admin@statcosol.com (need role-specific user) |

**HelpdeskManagementController** — Controller path: `helpdesk`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| PATCH | `/api/v1/helpdesk/tickets/:id/status` | updateStatus | PF_TEAM, ADMIN, CRM | admin@statcosol.com |

---

## Module: `legitx`

### legitx/legitx-compliance-status.controller.ts

**LegitxComplianceStatusController** — Controller path: `legitx/compliance-status`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/legitx/compliance-status/summary` | summary | CLIENT, CEO, CCO, CRM, AUDITOR, ADMIN | admin@statcosol.com |
| GET | `/api/v1/legitx/compliance-status/branches` | branches | CLIENT, CEO, CCO, CRM, AUDITOR, ADMIN | admin@statcosol.com |
| GET | `/api/v1/legitx/compliance-status/tasks` | tasks | CLIENT, CEO, CCO, CRM, AUDITOR, ADMIN | admin@statcosol.com |
| GET | `/api/v1/legitx/compliance-status/contractors` | contractors | CLIENT, CEO, CCO, CRM, AUDITOR, ADMIN | admin@statcosol.com |
| GET | `/api/v1/legitx/compliance-status/audit` | audit | CLIENT, CEO, CCO, CRM, AUDITOR, ADMIN | admin@statcosol.com |
| GET | `/api/v1/legitx/compliance-status/returns` | returns | CLIENT, CEO, CCO, CRM, AUDITOR, ADMIN | admin@statcosol.com |

### legitx/legitx-compliance.controller.ts

**LegitxComplianceController** — Controller path: `legitx`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/legitx/compliance-status` | complianceStatus | (none/JWT only) | any authenticated user |
| GET | `/api/v1/legitx/mcd` | listMcd | (none/JWT only) | any authenticated user |
| GET | `/api/v1/legitx/returns` | listReturns | (none/JWT only) | any authenticated user |
| GET | `/api/v1/legitx/returns/:id/download` | downloadReturn | (none/JWT only) | any authenticated user |
| GET | `/api/v1/legitx/audits` | listAudits | (none/JWT only) | any authenticated user |
| GET | `/api/v1/legitx/audits/:auditId/report/download` | downloadAuditReport | (none/JWT only) | any authenticated user |
| GET | `/api/v1/legitx/audits/:auditId/observations` | auditObservations | (none/JWT only) | any authenticated user |

### legitx/legitx-dashboard.controller.ts

**LegitxDashboardController** — Controller path: `legitx/dashboard`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/legitx/dashboard` | base | CLIENT, CEO, CCO, CRM, AUDITOR, PAYROLL, ADMIN | admin@statcosol.com |
| GET | `/api/v1/legitx/dashboard/summary` | summary | CLIENT, CEO, CCO, CRM, AUDITOR, PAYROLL, ADMIN | admin@statcosol.com |

---

## Module: `monthly-documents`

### monthly-documents/monthly-documents.controller.ts

**MonthlyDocumentsController** — Controller path: `documents/monthly`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/documents/monthly` | list | CLIENT | testclient@test.com |
| POST | `/api/v1/documents/monthly/upload` | UseInterceptors | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/documents/monthly/:id` | remove | (none/JWT only) | any authenticated user |

---

## Module: `nominations`

### nominations/nominations.controller.ts

**NominationsController** — Controller path: `client/nominations`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/client/nominations/save` | save | CLIENT | testclient@test.com |
| GET | `/api/v1/client/nominations` | get | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/nominations/all` | listAll | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/nominations/forms` | listForms | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/nominations/generate` | generate | (none/JWT only) | any authenticated user |

---

## Module: `notifications`

### notifications/admin-notifications.controller.ts

**AdminNotificationsController** — Controller path: `admin/notifications`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/notifications` | list | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/notifications/:id` | detail | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/notifications` | create | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/notifications/:id/reply` | reply | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/notifications/:id/read` | markRead | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/admin/notifications/:id/status` | setStatus | (none/JWT only) | any authenticated user |

### notifications/notifications-inbox.controller.ts

**NotificationsInboxController** — Controller path: `notifications`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/notifications/list` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/notifications/:id` | get | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/notifications/:id/status` | setStatus | (none/JWT only) | any authenticated user |

### notifications/notifications.controller.ts

**NotificationsController** — Controller path: `notifications`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/notifications` | create | (none/JWT only) | any authenticated user |
| GET | `/api/v1/notifications/inbox` | inbox | (none/JWT only) | any authenticated user |
| GET | `/api/v1/notifications/my` | my | (none/JWT only) | any authenticated user |
| GET | `/api/v1/notifications/threads/:threadId` | thread | (none/JWT only) | any authenticated user |
| POST | `/api/v1/notifications/threads/:threadId/reply` | threadReply | (none/JWT only) | any authenticated user |
| POST | `/api/v1/notifications/threads/:threadId/close` | close | (none/JWT only) | any authenticated user |
| POST | `/api/v1/notifications/threads/:threadId/reopen` | reopen | (none/JWT only) | any authenticated user |
| POST | `/api/v1/notifications/threads/:threadId/read` | markRead | (none/JWT only) | any authenticated user |
| POST | `/api/v1/notifications/raise` | raise | (none/JWT only) | any authenticated user |
| POST | `/api/v1/notifications/:id/reply` | reply | (none/JWT only) | any authenticated user |

---

## Module: `options`

### options/admin-options.controller.ts

**AdminOptionsController** — Controller path: `admin/options`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/options/clients` | getClients | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/admin/options/branches` | getBranches | (none/JWT only) | any authenticated user |

### options/auditor-options.controller.ts

**AuditorOptionsController** — Controller path: `auditor/options`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auditor/options/clients` | getClients | AUDITOR | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/auditor/options/branches` | getBranches | (none/JWT only) | any authenticated user |

### options/branch-options.controller.ts

**BranchOptionsController** — Controller path: `branch/options`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/branch/options/self` | getSelf | BRANCH_DESK | admin@statcosol.com (need role-specific user) |

### options/client-options.controller.ts

**ClientOptionsController** — Controller path: `client/options`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/options/branches` | getBranches | CLIENT | testclient@test.com |

### options/crm-options.controller.ts

**CrmOptionsController** — Controller path: `crm/options`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/options/clients` | getClients | CRM | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/crm/options/branches` | getBranches | (none/JWT only) | any authenticated user |

### options/paydek-options.controller.ts

**PaydekOptionsController** — Controller path: `paydek/options`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/paydek/options/clients` | getClients | PAYDEK | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/paydek/options/branches` | getBranches | (none/JWT only) | any authenticated user |

---

## Module: `payroll`

### payroll/engine/payroll-engine.controller.ts

**PayrollEngineController** — Controller path: `payroll/engine`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/payroll/engine/runs/:runId/process` | processWithEngine | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/engine/preview` | previewEmployee | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/engine/rule-sets` | listRuleSets | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/engine/rule-sets/:id` | getRuleSet | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/engine/rule-sets` | createRuleSet | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/payroll/engine/rule-sets/:id` | updateRuleSet | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/payroll/engine/rule-sets/:id` | deleteRuleSet | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/engine/rule-sets/:ruleSetId/parameters` | listParameters | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/engine/rule-sets/:ruleSetId/parameters` | createParameter | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/payroll/engine/rule-sets/:ruleSetId/parameters/:paramId` | updateParameter | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/payroll/engine/rule-sets/:ruleSetId/parameters/:paramId` | deleteParameter | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/engine/structures` | listStructures | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/engine/structures/:id` | getStructure | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/engine/structures` | createStructure | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/payroll/engine/structures/:id` | updateStructure | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/payroll/engine/structures/:id` | deleteStructure | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/engine/structures/:structureId/items` | listStructureItems | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/engine/structures/:structureId/items` | createStructureItem | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/payroll/engine/structures/:structureId/items/:itemId` | updateStructureItem | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/payroll/engine/structures/:structureId/items/:itemId` | deleteStructureItem | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/engine/structures/:structureId/items/bulk` | bulkUpdateItems | (none/JWT only) | any authenticated user |

### payroll/paydek-list.controller.ts

**PaydekListController** — Controller path: `paydek`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/paydek/employees` | listEmployees | (none/JWT only) | any authenticated user |
| GET | `/api/v1/paydek/pf-esi/pending` | listPfEsiPending | (none/JWT only) | any authenticated user |
| GET | `/api/v1/paydek/queries` | listQueries | (none/JWT only) | any authenticated user |

### payroll/payroll-assignments.admin.controller.ts

**PayrollAssignmentsAdminController** — Controller path: `admin/payroll-assignments`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/payroll-assignments/:clientId` | getCurrent | ADMIN | admin@statcosol.com |
| POST | `/api/v1/admin/payroll-assignments` | assign | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/admin/payroll-assignments/:clientId` | unassign | (none/JWT only) | any authenticated user |

### payroll/payroll-processing.controller.ts

**PayrollProcessingController** — Controller path: `payroll/runs`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| POST | `/api/v1/payroll/runs/:runId/upload-breakup` | UseInterceptors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/runs/:runId/process` | processRun | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/runs/:runId/generate/pf-ecr` | generatePfEcr | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/runs/:runId/generate/esi` | generateEsi | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/runs/:runId/generate/registers` | generateRegister | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/runs/register-templates` | listTemplates | (none/JWT only) | any authenticated user |

### payroll/payroll-reports.controller.ts

**PayrollReportsController** — Controller path: `payroll/reports`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/payroll/reports/bank-statement` | bankStatement | PAYROLL, ADMIN | admin@statcosol.com |
| GET | `/api/v1/payroll/reports/muster-roll` | musterRoll | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/reports/cost-analysis` | costAnalysis | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/reports/form16` | form16 | (none/JWT only) | any authenticated user |

### payroll/payroll-setup.controller.ts

**PayrollSetupController** — Controller path: `payroll/setup`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/payroll/setup/:clientId` | getSetup | PAYROLL, ADMIN | admin@statcosol.com |
| POST | `/api/v1/payroll/setup/:clientId` | upsertSetup | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/setup/:clientId/components` | listComponents | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/setup/:clientId/components` | createComponent | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/payroll/setup/:clientId/components/:componentId` | updateComponent | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/payroll/setup/:clientId/components/:componentId` | deleteComponent | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/setup/:clientId/components/:componentId/rules` | listRules | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/setup/:clientId/components/:componentId/rules` | createRule | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/payroll/setup/:clientId/components/:componentId/rules/:ruleId` | updateRule | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/payroll/setup/:clientId/components/:componentId/rules/:ruleId` | deleteRule | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/setup/:clientId/components/:componentId/rules/:ruleId/slabs` | listSlabs | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/setup/:clientId/components/:componentId/rules/:ruleId/slabs` | saveSlabs | (none/JWT only) | any authenticated user |

**ClientPayrollSetupController** — Controller path: `client/payroll/setup`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/payroll/setup` | getSetup | CLIENT | testclient@test.com |
| GET | `/api/v1/client/payroll/setup/components` | listComponents | (none/JWT only) | any authenticated user |

### payroll/payroll.config.controller.ts

**PayrollConfigController** — Controller path: `payroll/clients`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/payroll/clients/:clientId/components-effective` | getEffectiveComponents | PAYROLL, ADMIN | admin@statcosol.com |
| POST | `/api/v1/payroll/clients/:clientId/component-overrides` | saveOverrides | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/clients/:clientId/payslip-layout` | getLayout | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/clients/:clientId/payslip-layout` | saveLayout | (none/JWT only) | any authenticated user |

### payroll/payroll.controller.ts

**PayrollController** — Controller path: `payroll`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/payroll/summary` | getPayrollSummary | PAYROLL, ADMIN | admin@statcosol.com |
| GET | `/api/v1/payroll/dashboard` | getPayrollDashboard | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| GET | `/api/v1/payroll/pf-esi-summary` | getPfEsiSummary | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| GET | `/api/v1/payroll/employees` | getPayrollEmployees | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| GET | `/api/v1/payroll/employees/:employeeId` | getPayrollEmployeeDetail | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| GET | `/api/v1/payroll/clients` | getAssignedClients | PAYROLL, ADMIN, CRM, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/payroll/templates` | listTemplates | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| GET | `/api/v1/payroll/payslips` | listPayslips | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| GET | `/api/v1/payroll/registers-records` | listRegistersRecords | PAYROLL, ADMIN, CRM, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/payroll/registers` | listRegistersAlias | PAYROLL, ADMIN, CRM, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/payroll/registers/:id/download` | downloadRegister | PAYROLL, ADMIN, CRM, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/payroll/registers-records/:id/download` | downloadRegisterRecord | PAYROLL, ADMIN, CRM, CEO, CCO | admin@statcosol.com |
| PATCH | `/api/v1/payroll/registers/:id/approve` | approveRegister | PAYROLL, ADMIN | admin@statcosol.com |
| PATCH | `/api/v1/payroll/registers/:id/reject` | rejectRegister | PAYROLL, ADMIN | admin@statcosol.com |
| GET | `/api/v1/payroll/runs` | listRuns | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| POST | `/api/v1/payroll/runs` | createRun | PAYROLL, ADMIN | admin@statcosol.com |
| POST | `/api/v1/payroll/runs/:runId/employees/upload` | UseInterceptors | PAYROLL, ADMIN | admin@statcosol.com |
| GET | `/api/v1/payroll/runs/:runId/employees` | listRunEmployees | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| GET | `/api/v1/payroll/runs/:runId/employees/:employeeId/payslip.pdf` | downloadGeneratedPayslip | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| GET | `/api/v1/payroll/runs/:runId/employees/:employeeId/payslip.archived.pdf` | downloadArchivedPayslip | (none/JWT only) | any authenticated user |
| POST | `/api/v1/payroll/runs/:runId/payslips/archive` | archiveRunPayslips | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/runs/:runId/payslips.zip` | downloadPayslipsZip | PAYROLL, ADMIN | admin@statcosol.com |
| GET | `/api/v1/payroll/inputs/:id/files` | listPayrollInputFilesForPayroll | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/payroll/inputs/:id/status` | updatePayrollInputStatus | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| GET | `/api/v1/payroll/inputs/files/:id/download` | downloadPayrollInputFile | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| POST | `/api/v1/payroll/clients/:clientId/template` | UseInterceptors | PAYROLL, ADMIN | admin@statcosol.com |
| GET | `/api/v1/payroll/clients/:clientId/template` | getClientTemplateMeta | (none/JWT only) | any authenticated user |
| GET | `/api/v1/payroll/clients/:clientId/template/download` | downloadClientTemplate | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| GET | `/api/v1/payroll/queries` | listQueries | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| GET | `/api/v1/payroll/queries/:queryId` | getQueryDetail | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| POST | `/api/v1/payroll/queries` | createQuery | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| POST | `/api/v1/payroll/queries/:queryId/messages` | addQueryMessage | PAYROLL, ADMIN | admin@statcosol.com |
| PATCH | `/api/v1/payroll/queries/:queryId/resolve` | resolveQuery | PAYROLL, ADMIN | admin@statcosol.com |
| PATCH | `/api/v1/payroll/queries/:queryId/status` | updateQueryStatus | PAYROLL, ADMIN | admin@statcosol.com |
| GET | `/api/v1/payroll/fnf` | listFnf | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| GET | `/api/v1/payroll/fnf/:fnfId` | getFnfDetail | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| POST | `/api/v1/payroll/fnf` | createFnf | PAYROLL, ADMIN, CRM | admin@statcosol.com |
| PATCH | `/api/v1/payroll/fnf/:fnfId/status` | updateFnfStatus | PAYROLL, ADMIN | admin@statcosol.com |

**ClientPayrollInputsController** — Controller path: `client/payroll/inputs`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/payroll/inputs` | list | CLIENT | testclient@test.com |
| POST | `/api/v1/client/payroll/inputs` | create | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/client/payroll/inputs/:id/status` | updateStatus | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/payroll/inputs/:id/status-history` | getStatusHistory | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/payroll/inputs/:id/files` | UseInterceptors | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/payroll/inputs/:id/files` | listFiles | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/payroll/inputs/files/:id/download` | downloadFile | (none/JWT only) | any authenticated user |

**ClientPayrollTemplateController** — Controller path: `client/payroll/template`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/payroll/template` | getTemplateMeta | CLIENT | testclient@test.com |
| GET | `/api/v1/client/payroll/template/download` | download | (none/JWT only) | any authenticated user |

**ClientRegistersRecordsController** — Controller path: `client/payroll/registers-records`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/payroll/registers-records` | list | CLIENT | testclient@test.com |
| POST | `/api/v1/client/payroll/registers-records` | UseInterceptors | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/payroll/registers-records/:id/download` | download | (none/JWT only) | any authenticated user |

**ClientComponentsEffectiveController** — Controller path: `client/payroll/components-effective`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/payroll/components-effective/:clientId` | getEffectiveComponents | CLIENT | testclient@test.com |
| POST | `/api/v1/client/payroll/components-effective/:clientId` | saveEffectiveComponents | (none/JWT only) | any authenticated user |

**ClientPayslipLayoutController** — Controller path: `client/payroll/payslip-layout`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/payroll/payslip-layout/:clientId` | getPayslipLayout | CLIENT | testclient@test.com |
| POST | `/api/v1/client/payroll/payslip-layout/:clientId` | savePayslipLayout | (none/JWT only) | any authenticated user |

**ClientPayrollSettingsController** — Controller path: `client/payroll/settings`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/payroll/settings` | get | CLIENT | testclient@test.com |
| POST | `/api/v1/client/payroll/settings` | update | (none/JWT only) | any authenticated user |

**AuditorRegistersController** — Controller path: `auditor/registers`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auditor/registers` | list | AUDITOR | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/auditor/registers/:id/download` | download | (none/JWT only) | any authenticated user |

---

## Module: `reports`

### reports/assignment-report.controller.ts

**AssignmentReportController** — Controller path: `reports/assignments`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/reports/assignments/health` | health | ADMIN, CEO, CCO | admin@statcosol.com |

### reports/audit-report.controller.ts

**AuditReportController** — Controller path: `reports/audits`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/reports/audits/overdue` | overdue | ADMIN, CEO, CCO, AUDITOR | admin@statcosol.com |

### reports/compliance-report.controller.ts

**ComplianceReportController** — Controller path: `reports/compliance`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/reports/compliance` | summary | ADMIN, CEO, CCO, CRM | admin@statcosol.com |

### reports/pdf-report.controller.ts

**PdfReportController** — Controller path: `reports/pdf`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/reports/pdf/compliance/:clientId` | complianceSummary | (none/JWT only) | any authenticated user |
| GET | `/api/v1/reports/pdf/ceo-dashboard` | ceoDashboard | (none/JWT only) | any authenticated user |
| GET | `/api/v1/reports/pdf/risk-heatmap/:clientId` | riskHeatmap | (none/JWT only) | any authenticated user |
| GET | `/api/v1/reports/pdf/dtss/:clientId` | dtss | (none/JWT only) | any authenticated user |

### reports/report-export.controller.ts

**ReportExportController** — Controller path: `reports/export`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/reports/export/compliance.xlsx` | compliance | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/reports/export/audits-overdue.xlsx` | audits | ADMIN, CEO, CCO | admin@statcosol.com |
| GET | `/api/v1/reports/export/assignments-health.xlsx` | assignments | ADMIN, CEO, CCO | admin@statcosol.com |

### reports/reports.controller.ts

**ReportsController** — Controller path: `reports`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/reports` | root | (none/JWT only) | any authenticated user |
| GET | `/api/v1/reports/compliance-summary` | getComplianceSummary | ADMIN | admin@statcosol.com |
| GET | `/api/v1/reports/overdue` | getOverdue | (none/JWT only) | any authenticated user |
| GET | `/api/v1/reports/contractor-performance` | getContractorPerformance | (none/JWT only) | any authenticated user |
| GET | `/api/v1/reports/overdue/export` | exportOverdue | (none/JWT only) | any authenticated user |

---

## Module: `returns`

### returns/admin-returns.controller.ts

**AdminReturnsController** — Controller path: `admin/returns`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/returns/filings` | list | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/returns/types` | types | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/admin/returns/filings/:id/status` | updateStatus | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/admin/returns/filings/:id/delete` | softDelete | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/admin/returns/filings/:id/restore` | restore | (none/JWT only) | any authenticated user |

### returns/auditor-returns.controller.ts

**AuditorReturnsController** — Controller path: `auditor/returns`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/auditor/returns/filings` | list | AUDITOR | admin@statcosol.com (need role-specific user) |
| PATCH | `/api/v1/auditor/returns/filings/:id/status` | updateStatus | (none/JWT only) | any authenticated user |

### returns/client-returns.controller.ts

**ClientReturnsController** — Controller path: `client/returns`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/returns/filings` | list | CLIENT | testclient@test.com |
| GET | `/api/v1/client/returns/types` | types | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/returns/filings` | create | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/returns/filings/:id/ack` | UseInterceptors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/returns/filings/:id/challan` | UseInterceptors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/client/returns/filings/:id/submit` | submit | (none/JWT only) | any authenticated user |

### returns/crm-returns.controller.ts

**CrmReturnsController** — Controller path: `crm/returns`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/returns/filings` | list | CRM | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/crm/returns/types` | types | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/crm/returns/filings/:id/status` | updateStatus | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/returns/filings/:id/ack` | UseInterceptors | (none/JWT only) | any authenticated user |
| POST | `/api/v1/crm/returns/filings/:id/challan` | UseInterceptors | (none/JWT only) | any authenticated user |

---

## Module: `risk`

### risk/risk.controller.ts

**RiskController** — Controller path: `risk`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/risk/heatmap` | heatmap | (none/JWT only) | any authenticated user |
| GET | `/api/v1/risk/trend` | trend | (none/JWT only) | any authenticated user |

---

## Module: `safety-documents`

### safety-documents/controllers/branch-safety-documents.controller.ts

**BranchSafetyDocumentsController** — Controller path: `branch/safety-documents`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/branch/safety-documents/master` | getMasterList | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/safety-documents/categories` | getCategories | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/safety-documents/safety-score` | getSafetyScore | (none/JWT only) | any authenticated user |
| POST | `/api/v1/branch/safety-documents/upload` | UseInterceptors | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/safety-documents` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/safety-documents/expiring` | getExpiring | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/branch/safety-documents/:id` | delete | (none/JWT only) | any authenticated user |
| GET | `/api/v1/branch/safety-documents/:id/download` | download | (none/JWT only) | any authenticated user |

### safety-documents/controllers/client-safety-documents.controller.ts

**ClientSafetyDocumentsController** — Controller path: `client/safety-documents`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/client/safety-documents/categories` | getCategories | CLIENT | testclient@test.com |
| GET | `/api/v1/client/safety-documents/safety-score` | getSafetyScore | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/safety-documents` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/safety-documents/expiring` | getExpiring | (none/JWT only) | any authenticated user |
| GET | `/api/v1/client/safety-documents/:id/download` | download | (none/JWT only) | any authenticated user |

### safety-documents/controllers/crm-safety-documents.controller.ts

**CrmSafetyDocumentsController** — Controller path: `crm/safety-documents`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/safety-documents/categories` | getCategories | CRM | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/crm/safety-documents/safety-score` | getSafetyScore | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/safety-documents` | list | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/safety-documents/expiring` | getExpiring | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/crm/safety-documents/:id/verify` | verify | (none/JWT only) | any authenticated user |
| GET | `/api/v1/crm/safety-documents/:id/download` | download | (none/JWT only) | any authenticated user |

---

## Module: `sla`

### sla/sla.controller.ts

**SlaController** — Controller path: `sla`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/sla/tasks` | list | ADMIN, CCO, CEO, CRM, CLIENT | admin@statcosol.com |
| PATCH | `/api/v1/sla/tasks/:id` | update | (none/JWT only) | any authenticated user |

---

## Module: `users`

### users/approvals.controller.ts

**ApprovalsController** — Controller path: `approvals`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/approvals/pending` | getPending | CCO, CEO | admin@statcosol.com (need role-specific user) |
| POST | `/api/v1/approvals/:id/approve` | approve | (none/JWT only) | any authenticated user |
| POST | `/api/v1/approvals/:id/reject` | reject | (none/JWT only) | any authenticated user |

### users/cco-users.controller.ts

**CcoUsersController** — Controller path: `cco/users`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/cco/users/crms` | listCrms | CCO, ADMIN | admin@statcosol.com |
| GET | `/api/v1/cco/users/auditors` | listAuditors | (none/JWT only) | any authenticated user |

### users/crm-users.controller.ts

**CrmUsersController** — Controller path: `crm/users`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/crm/users/auditors` | listAuditors | CRM | admin@statcosol.com (need role-specific user) |
| GET | `/api/v1/crm/users/contractors` | listContractors | (none/JWT only) | any authenticated user |

### users/me.controller.ts

**MeController** — Controller path: `me`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/me` | getMe | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/me/profile` | updateProfile | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/me/password` | changePassword | (none/JWT only) | any authenticated user |

### users/users.controller.ts

**UsersController** — Controller path: `admin`

| Method | Full URL | Handler | Roles | Test User |
|--------|----------|---------|-------|-----------|
| GET | `/api/v1/admin/users/cco` | listCcoUsers | ADMIN | admin@statcosol.com |
| GET | `/api/v1/admin/users/active-by-role/:role` | getActiveUsersByRole | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/users/reset-ceo-password` | resetCeoPassword | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/roles` | listRoles | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/roles/:id` | getRoleById | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/auditors` | listAuditors | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/users` | listUsers | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/users/list` | listUsersSimple | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/users/export` | exportUsers | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/client-users` | listClientUsers | (none/JWT only) | any authenticated user |
| GET | `/api/v1/admin/users/directory` | getDirectory | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/users` | createUser | (none/JWT only) | any authenticated user |
| PUT | `/api/v1/admin/users/:id` | updateUser | (none/JWT only) | any authenticated user |
| POST | `/api/v1/admin/users/:id/reset-password` | resetPassword | (none/JWT only) | any authenticated user |
| DELETE | `/api/v1/admin/users/:id` | deleteUser | (none/JWT only) | any authenticated user |
| PATCH | `/api/v1/admin/users/:id/status` | updateStatus | (none/JWT only) | any authenticated user |

---


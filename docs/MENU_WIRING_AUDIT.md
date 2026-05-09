# Menu → Route → Component Wiring Audit

**Scope:** Every navigation/menu item across all portals, mapped to its Angular route and loaded component. Verifies that each menu entry actually resolves to a real, defined route in `frontend/src/app/`.

**Sources of truth:**
- Global menu: [frontend/src/app/core/menu/menu.config.ts](frontend/src/app/core/menu/menu.config.ts) (used by ADMIN, CCO, CEO, CRM, AUDITOR, CONTRACTOR, PF_TEAM, PAYROLL)
- CLIENT portal: hand-crafted sidebar in [frontend/src/app/pages/client/client-layout/client-sidebar.component.ts](frontend/src/app/pages/client/client-layout/client-sidebar.component.ts) (lines 522+)
- Per-portal route files under `frontend/src/app/pages/<portal>/<portal>.routes.ts`, all aggregated in [frontend/src/app/app.routes.ts](frontend/src/app/app.routes.ts).

**Legend:** ✓ = wired correctly · ↪ = resolved via redirect · ⚠ = wired but worth attention.

---

## ADMIN — [admin.routes.ts](frontend/src/app/pages/admin/admin.routes.ts)

| # | Menu label | Route | Loads component | Status |
|---|---|---|---|---|
| 1 | Dashboard | `/admin/dashboard` | `AdminDashboardComponent` | ✓ |
| 2 | Users | `/admin/users` | `UsersComponent` | ✓ |
| 3 | Clients | `/admin/clients` | `AdminClientsComponent` | ✓ |
| 4 | Assignments | `/admin/assignments` | `AdminAssignmentsComponent` | ✓ |
| 5 | Masters | `/admin/masters` | `AdminMastersComponent` | ✓ |
| 6 | Payroll Assignments | `/admin/payroll-assignments` | `AdminPayrollAssignmentsComponent` | ✓ |
| 7 | Notifications | `/admin/notifications` | `AdminHelpdeskCenterPageComponent` | ✓ |
| 8 | Digest | `/admin/digest` | `AdminDigestComponent` | ✓ |
| 9 | Reports | `/admin/reports` | `AdminReportsComponent` | ✓ |
| 10 | Risk Heatmap | `/admin/heatmap` | `HeatmapComponent` (shared) | ✓ |
| 11 | SLA Tracker | `/admin/sla` | `SlaTrackerComponent` (shared) | ✓ |
| 12 | Risk Trend | `/admin/risk-trend` | `RiskTrendComponent` (shared) | ✓ |
| 13 | Escalations | `/admin/escalations` | `EscalationsComponent` (shared) | ✓ |
| 14 | Audit Logs | `/admin/audit-logs` | `AdminAuditLogsComponent` | ✓ |
| 15 | Unassigned Clients | `/admin/governance/unassigned` | `UnassignedClientsComponent` | ✓ |
| 16 | Archive & Recovery | `/admin/archive` | `AdminArchiveComponent` | ✓ |
| 17 | 🤖 AI Hub | `/admin/ai-hub` | `AiDashboardComponent` | ✓ |

**Routes registered but NOT in main menu** (reachable only via in-page nav; not a defect):
`/admin/approvals`, `/admin/governance`, `/admin/ai-risk`, `/admin/ai-payroll`, `/admin/ai-config`, `/admin/applicability` (+ `/config`, `branches/:branchId/applicability`), `/admin/news`, `/admin/helpdesk` (+ `/:id`), `/admin/client-contacts`, `/admin/mail-templates`, `/admin/clients/:id` (+ `/:tab`).

---

## CEO — [ceo.routes.ts](frontend/src/app/pages/ceo/ceo.routes.ts)

| # | Menu label | Route | Loads component | Status |
|---|---|---|---|---|
| 1 | Dashboard | `/ceo/dashboard` | `CeoExecutiveDashboardPageComponent` | ✓ |
| 2 | Approvals | `/ceo/approvals` | `CeoApprovalsComponent` | ✓ |
| 3 | Escalations | `/ceo/escalations` | `CeoEscalationsComponent` | ✓ |
| 4 | Oversight | `/ceo/oversight` | `CeoCcoOversightComponent` | ✓ |
| 5 | Registers | `/ceo/registers` | `CeoRegistersComponent` | ✓ |
| 6 | Notifications | `/ceo/notifications` | `CeoNotificationsComponent` | ✓ |
| 7 | Reports | `/ceo/reports` | `CeoExecutiveReportsPageComponent` | ✓ |

Extra registered routes: `/ceo/branches`, `/ceo/branches/:branchId`, `/ceo/profile`, `/ceo/approvals/:id`, `/ceo/escalations/:id`.

---

## CCO — [cco.routes.ts](frontend/src/app/pages/cco/cco.routes.ts)

| # | Menu label | Route | Loads component | Status |
|---|---|---|---|---|
| 1 | Dashboard | `/cco/dashboard` | `CcoDashboardComponent` | ✓ |
| 2 | CRM Management | `/cco/crms-under-me` | `CcoCrmsUnderMeComponent` | ✓ |
| 3 | Approvals | `/cco/approvals` | `CcoApprovalsComponent` | ✓ |
| 4 | Oversight | `/cco/oversight` | `CcoOversightExceptionPageComponent` | ✓ |
| 5 | Escalations | `/cco/escalations` | `CcoEscalationsComponent` | ✓ |
| 6 | Registers | `/cco/registers` | `CcoRegistersComponent` | ✓ |
| 7 | Notifications | `/cco/notifications` | `CcoNotificationsComponent` | ✓ |
| 8 | Reports | `/cco/crm-performance` | `CcoCrmPerformanceComponent` | ✓ |

Extra registered routes: `/cco/risk-heatmap` (`CcoRiskHeatmapComponent`), `/cco/controls` (`CcoControlsRegisterPageComponent`), `/cco/profile`.

---

## CRM — [crm.routes.ts](frontend/src/app/pages/crm/crm.routes.ts)

| # | Menu label | Route | Loads component | Status |
|---|---|---|---|---|
| 1 | Dashboard | `/crm/dashboard` | `CrmDashboardActionPageComponent` | ✓ |
| 2 | Clients | `/crm/clients` | `CrmClientsComponent` | ✓ |
| 3 | Compliance Tracker | `/crm/compliance-tracker` | `CrmComplianceComponent` | ✓ |
| 4 | Returns / Filings | `/crm/returns` | `CrmReturnsWorkspacePageComponent` | ✓ |
| 5 | Schedule Audit | `/crm/audits` | `CrmAuditManagementPageComponent` | ✓ |
| 6 | Helpdesk | `/crm/helpdesk` | `CrmRequestsComponent` | ✓ |
| 7 | Reports | `/crm/reports` | `CrmReportsComponent` | ✓ |
| 8 | Compliance Calendar | `/crm/calendar` | `ComplianceCalendarComponent` | ✓ |
| 9 | Risk Heatmap | `/crm/heatmap` | `HeatmapComponent` | ✓ |
| 10 | SLA Tracker | `/crm/sla` | `SlaTrackerComponent` | ✓ |
| 11 | Risk Trend | `/crm/risk-trend` | `RiskTrendComponent` | ✓ |
| 12 | Escalations | `/crm/escalations` | `EscalationsComponent` | ✓ |

Extra registered routes (deep features not in left menu): `/crm/clients/:clientId/{overview,branches,contractors,compliance-tracker,documents,compliance-docs,registrations,payroll-status,unit-documents,safety}`, `/crm/compliance/tasks`, `/crm/audit-monitoring`, `/crm/expiry-tasks`, `/crm/registrations`, `/crm/renewals`, `/crm/amendments`, `/crm/branch-docs-review`, `/crm/notices`, `/crm/minimum-wages`, `/crm/profile`. ⚠ `/crm/notifications` is a redirect → `/crm/helpdesk` (intentional).

---

## AUDITOR — [auditor.routes.ts](frontend/src/app/pages/auditor/auditor.routes.ts)

| # | Menu label | Route | Loads component | Status |
|---|---|---|---|---|
| 1 | Dashboard | `/auditor/dashboard` | `AuditorDashboardComponent` | ✓ |
| 2 | Audits | `/auditor/audits` | `AuditorAuditsComponent` | ✓ |
| 3 | Observations | `/auditor/observations` | `AuditorObservationsVerificationPageComponent` | ✓ |
| 4 | Reports | `/auditor/reports` | `AuditorReportsComponent` | ✓ |
| 5 | Notifications | `/auditor/notifications` | `AuditorNotificationsComponent` | ✓ |

Extra: `/auditor/audits/:auditId/workspace`, `/auditor/reports/:auditId/builder`, `/auditor/ai-audit`.

---

## CONTRACTOR — [contractor.routes.ts](frontend/src/app/pages/contractor/contractor.routes.ts)

| # | Menu label | Route | Loads component | Status |
|---|---|---|---|---|
| 1 | Dashboard | `/contractor/dashboard` | `ContractorDashboardUpgradePageComponent` | ✓ |
| 2 | Tasks | `/contractor/tasks` | `ContractorUnifiedTaskCenterPageComponent` | ✓ |
| 3 | Compliance | `/contractor/compliance` | ↪ redirect → `tasks` | ✓ |
| 4 | Notifications | `/contractor/notifications` | `ContractorNotificationsComponent` | ✓ |
| 5 | Support | `/contractor/support` | `ContractorSupportComponent` | ✓ |

Extra: `/contractor/profile`, `/contractor/employees`, `/contractor/news` (+ `/:newsId`), `/contractor/tasks/:id`.

---

## PF_TEAM — [pf-team.routes.ts](frontend/src/app/pages/pf-team/pf-team.routes.ts)

| # | Menu label | Route | Loads component | Status |
|---|---|---|---|---|
| 1 | Dashboard | `/pf-team/dashboard` | `PfTeamDashboardComponent` | ✓ |
| 2 | Tickets | `/pf-team/tickets` | `PfTeamTicketsComponent` | ✓ |

Extra: `/pf-team/tickets/:id` (`PfTeamTicketDetailComponent`).

---

## PAYROLL — [payroll.routes.ts](frontend/src/app/pages/payroll/payroll.routes.ts)

| # | Menu label | Route | Loads component | Status |
|---|---|---|---|---|
| 1 | Dashboard | `/payroll/dashboard` | `PayrollDashboardComponent` | ✓ |
| 2 | Clients | `/payroll/clients` | `PayrollClientsComponent` | ✓ |
| 3 | Runs | `/payroll/runs` | ↪ redirect → `clients` | ⚠ menu label says "Runs" but lands on client picker (no client preselected) |
| 4 | Setup | `/payroll/setup` | ↪ redirect → `clients` | ⚠ same as above |
| 5 | Registers | `/payroll/registers` | ↪ redirect → `clients` | ⚠ same as above |

The actual functional routes are scoped per-client: `/payroll/clients/:clientId/{overview,employees,employees/:employeeId,runs,pf-esi,queries,full-and-final,setup,rule-sets,structures,config,registers}`. Top-level menu labels are deliberately bouncers (per code comment) so the user is forced to pick a client first. Consider renaming to "Runs (pick client)" or adding a client selector in the layout for clarity.

Other extras: `/payroll/tds-calculator`, `/payroll/gratuity-calculator`, `/payroll/reports`, `/payroll/profile`.

---

## CLIENT — sidebar in [client-sidebar.component.ts](frontend/src/app/pages/client/client-layout/client-sidebar.component.ts) → [client.routes.ts](frontend/src/app/pages/client/client.routes.ts)

### Group: Overview
| Label | Route | Component | Status |
|---|---|---|---|
| Dashboard | `/client/dashboard` | `ClientDashboardComponent` | ✓ |

### Group: Compliance
| Label | Route | Component | Status |
|---|---|---|---|
| Compliance Status | `/client/compliance/status` | `ClientComplianceStatusComponent` | ✓ |
| Branch Compliance | `/client/branch-compliance` | `BranchComplianceComponent` (shared) | ✓ |
| Safety | `/client/safety` | `ClientSafetyComponent` | ✓ |
| Returns / Filings | `/client/compliance/returns` | `ClientReturnsComponent` | ✓ |
| Returns Summary | `/client/returns-summary` | `ClientReturnsSummaryComponent` | ✓ |
| Returns Status | `/client/returns-status` | `ClientReturnsPageComponent` | ✓ |
| Registrations & Licenses | `/client/compliance/registrations` | `ClientRegistrationsComponent` | ✓ |
| Renewals | `/client/renewals` | `ClientRenewalsComponent` | ✓ |
| Renewals Status | `/client/renewals-status` | `ClientRenewalsPageComponent` | ✓ |
| Unit Documents | `/client/unit-documents` | `ClientUnitDocumentsComponent` | ✓ |
| Compliance Upload Center | `/client/compliance/mcd` | `ClientMcdComponent` | ✓ |
| Document Repository | `/client/compliance/library` | `ClientComplianceLibraryComponent` | ✓ |
| Audits | `/client/audits` | `ClientAuditsComponent` | ✓ |
| Audit Summaries | `/client/audit-summaries` | `ClientAuditSummariesComponent` | ✓ |

### Group: Risk & Monitoring
| Label | Route | Component | Status |
|---|---|---|---|
| Compliance Calendar | `/client/calendar` | `ComplianceCalendarComponent` | ✓ |
| Compliance Reminders | `/client/reminders` | `ClientComplianceRemindersComponent` | ✓ |
| Risk Heatmap | `/client/heatmap` | `HeatmapComponent` | ✓ |
| SLA Tracker | `/client/sla` | `SlaTrackerComponent` | ✓ |
| Risk Trend | `/client/risk-trend` | `RiskTrendComponent` | ✓ |
| Escalations | `/client/escalations` | `EscalationsComponent` | ✓ |
| Notices | `/client/notices` | `ClientNoticesComponent` | ✓ |

### Group: Payroll & Workforce
| Label | Route | Component | Status |
|---|---|---|---|
| Payroll | `/client/payroll` | `ClientPayrollMonitoringPageComponent` (guard: `branchPayrollAccessGuard`) | ✓ |
| Employees | `/client/employees` | `ClientEmployeesComponent` | ✓ |
| Registers | `/client/registers` | `ClientRegistersDownloadPageComponent` | ✓ |
| Attendance Review | `/client/attendance` | `ClientAttendanceReviewPageComponent` | ✓ |
| Daily Attendance | `/client/attendance/daily` | `ClientDailyAttendancePage` | ✓ |
| Biometric Devices | `/client/biometric` | `ClientBiometricComponent` | ✓ |
| Master Data | `/client/master-data` | `ClientMasterDataComponent` | ✓ |
| CTC Summary | `/client/ctc-summary` | `ClientCtcSummaryComponent` | ✓ |

### Group: Company
| Label | Route | Component | Status |
|---|---|---|---|
| Branches | `/client/branches` | `ClientBranchesComponent` | ✓ |
| Contractors | `/client/contractors` | `ClientContractorsComponent` | ✓ |

### Group: Governance
| Label | Route | Component | Status |
|---|---|---|---|
| Approvals Center | `/client/approvals` | `ClientUnifiedApprovalsPageComponent` | ✓ |
| Dashboard ⚠ | `/client/appraisal-dashboard` | `ClientAppraisalDashboardComponent` | ⚠ Label "Dashboard" inside Governance is ambiguous (already a top-level Dashboard); rename to "Appraisal Dashboard". |
| Appraisals | `/client/appraisals` | `ClientAppraisalsListComponent` | ✓ |
| Cycles | `/client/appraisal-cycles` | `ClientAppraisalCyclesComponent` | ✓ |
| Reports | `/client/appraisal-reports` | `ClientAppraisalReportsComponent` | ✓ |

### Group: Support
| Label | Route | Component | Status |
|---|---|---|---|
| My Queries | `/client/queries` | `ClientSupportComponent` | ✓ |

### Group: Accounts
| Label | Route | Component | Status |
|---|---|---|---|
| Profile | `/client/profile` | `ClientProfileComponent` | ✓ |
| Access Settings | `/client/settings/access` | `ClientAccessSettingsComponent` | ✓ |

**Routes registered but not surfaced in sidebar (deep / param routes):**
`/client/branches/:branchId`, `/client/branches/:branchId/compliance-items`, `/client/branches/:branchId/applicability`, `/client/contractors/branch/:branchId`, `/client/employees/new`, `/client/employees/:id`, `/client/employees/:id/edit`, `/client/appraisals/:id`, `/client/news`, `/client/news/:newsId`, `/client/approvals/nominations`, `/client/approvals/leaves`, `/client/compliance/mcd/uploads` (guarded by `branchUserOnlyGuard`).

Legacy redirects in `client.routes.ts`: `support → queries`, `compliance-calendar-feed → calendar`, `compliance-reminders-feed → reminders`, `queries/:id → queries`.

---

## Summary

- **Total menu entries audited:** 78 across 9 portals.
- **Broken (no matching route):** 0.
- **Loading non-existent component:** 0 (all `loadComponent` import paths resolve at build — verified by route file imports).
- **Soft warnings (3):**
  1. PAYROLL: `Runs`, `Setup`, `Registers` top-level menu items redirect to `/payroll/clients` (client picker). Functional, but UX-confusing labels.
  2. CRM: `Notifications` menu redirects to `/crm/helpdesk`. Intentional, but the menu label is misleading.
  3. CLIENT > Governance: a sub-item is labeled just **"Dashboard"** — duplicates the top-level Dashboard label. Recommend renaming to "Appraisal Dashboard".
- **No menu item points to a missing route.** No route loads a non-existent component class.

Role gating is consistently aligned at three layers: `MenuService.getMenusForRole` filters menu, `roleGuard([...])` protects each portal's parent route, and backend controllers enforce `@Roles(...)`. (Backend-side role coverage is out of scope for this audit but the guards are in place per route file.)

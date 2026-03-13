# UI Developer Execution Sheet

## 1) Delivery Model

Use this tracking model for every page item:

- `ID`: Stable page/task ID (from your list)
- `Module`
- `Page`
- `Priority`: P1/P2/P3/P4
- `Phase`: 1/2/3
- `Status`: `Backlog | In Progress | QA | Done | Blocked`
- `Owner`: FE / BE / QA
- `Dependencies`: API, shared component, route guard, roles
- `Acceptance`: Must-have completion checks

Definition of Done (DoD):

1. Role-correct route and guard wiring
2. List + detail workflow (where applicable)
3. Status transitions and history/timeline visible
4. Upload/preview/reupload flows functional
5. Filters + search + pagination + empty/loading/error states
6. Mobile usable, desktop optimized
7. Build passes, smoke test completed

---

## 2) Phase Plan

## Phase 1 (highest priority implementation)

| ID | Module | Page | Priority | Status | Owner | Dependencies | Acceptance |
|---|---|---|---|---|---|---|---|
| 1 | Branch | Monthly Compliance Workbench | P1 | Done | FE | Branch compliance docs APIs | Branch-first list/detail, completeness %, query/overdue indicators, upload/reupload, timeline |
| 2 | Branch | Periodic Upload Pages (M/Q/H/Y) | P1 | Done | FE+BE | Required docs by period, reviewer notes/history | Due date + period clarity, submitted-to-CRM state, ack/reference, resubmission status |
| 6 | CRM | Dashboard Action Workbench | P1 | Done | FE+BE | CRM dashboard aggregates | Implemented action-first dashboard with KPI drilldowns, due-compliance tabs, low-coverage and pending-review panels, renewals/amendments/registrations board, plus trend and overdue-ageing widgets |
| 7 | CRM | Returns Filing Workspace | P1 | Done | FE+BE | Returns status transition APIs | Prepared/reviewed/filed/ack/rejected workflow, ARN capture, audit trail |
| 8 | CRM | Renewals Workspace | P1 | Done | FE+BE | Renewals queue/detail APIs | Workspace queue + detail panel, owner assignment, follow-up reminders, approve/reject/return controls |
| 9 | CRM | Amendments Workspace | P1 | Done | FE+BE | Amendments status/timeline APIs | Authority/reference panel, comments timeline, and approve/reject/return controls |
| 11 | Client | Branch Detail Full Workspace | P1 | Done | FE+BE | Branch summary + tab APIs | Converted to full tabbed workspace with risk score, pending panel, month trend, and export summary |
| 12 | Client | Payroll Monitoring Page | P1 | Done | FE+BE | Payroll run status + exception APIs | Implemented consolidated monitoring workspace with cycle summary, branch comparison, pending queue, approval queue, exception drilldown, status timeline, and processed-cycle history |
| 13 | Client | Registers Download Center | P1 | Done | FE+BE | Register metadata + download APIs | Implemented download center with period/branch/category filters, source badge (generated/manual), preview modal, pagination, and filtered bulk pack download |
| 14 | Client | Unified Approvals Center | P1 | Done | FE+BE | Unified approvals APIs | Implemented `/client/approvals` unified workbench aggregating leave + nomination queues, with type tabs, ageing/search filters, compare-before/after panel, and decision timeline |
| 15 | Client | Attendance Review + Payroll Handoff | P1 | Done | FE+BE | Attendance mismatch + LOP + handoff APIs | Implemented month-based attendance review workspace with mismatch queue, LOP preview table, review approval action, and payroll handoff via client payroll input submission |
| 16 | Payroll | Runs Processing Console | P1 | Done | FE+BE | Run lifecycle + publish/rollback APIs | Stepper console, import status, exception board, preview totals, approval/publish, rerun + rollback control surface |

## Phase 2

| ID | Module | Page | Priority | Status | Owner | Dependencies | Acceptance |
|---|---|---|---|---|---|---|---|
| 17 | Payroll | Structures Builder | P2 | Done | FE+BE | Formula preview APIs | Implemented `/payroll/structures` builder workspace with client-scoped structure list, effective-date version history, component mapping grid, formula token helper, and calculation preview panel |
| 18 | Payroll | Rule Sets Page | P2 | Done | FE+BE | Rule version APIs | Implemented `/payroll/rule-sets` workbench with versioned list, effective-date controls, activation workflow, parameter matrix CRUD, and side-by-side version comparison |
| 19 | Payroll | Setup Tabs | P2 | Done | FE+BE | Client setup APIs | Rebuilt `/payroll/setup` into tabbed sections (statutory, pay cycle, leave/pay policy, attendance, deductions/recovery) with section-wise validations, save states, and effective-date display |
| 20 | Payroll | PF/ESI Dashboard | P2 | Done | FE+BE | PF/ESI applicability/remittance APIs | Implemented `/payroll/pf-esi` dashboard with statutory summary cards, applicability gap table + exception drawer, derived remittance-state board from payroll runs, and challan/return linkage panel from statutory register records |
| 21 | Payroll | F&F Lifecycle | P2 | Done | FE+BE | F&F lifecycle APIs | Implemented `/payroll/full-and-final` lifecycle workspace with queue + detail panel, status transitions (under-review/approved/settled/docs-issued/completed), settlement breakup + amount capture, checklist view, and timeline |
| 22 | Auditor | Audit Cockpit | P2 | Done | FE+BE | Audit scope/evidence APIs | Implemented cockpit workspace at `/auditor/audits/:auditId/workspace` (with fallback selector route), including scope header, checklist panel, evidence tray with reupload request action, observation builder, risk/severity summary, and report progress stepper |
| 23 | Auditor | Observations + CAPA Verification | P2 | Done | FE+BE | Observation verification APIs | Implemented `/auditor/observations` verification workspace with observation status list, branch-response panel, CAPA detail card, evidence preview links, verification action bar (acknowledge/resolve/close/reopen), and status-ageing visibility |
| 24 | Auditor | Report Builder | P2 | Done | FE+BE | Report draft/export APIs | Implemented `/auditor/reports/:auditId/builder` with section editor, observation import panel, internal/client version toggle, draft/final lock controls, and PDF export integration |
| 25 | Contractor | Unified Task Center | P2 | Done | FE+BE | Unified task/reupload APIs | Rebuilt `/contractor/tasks` as a merged task center for compliance + reupload flows with summary cards, due-date sorting, unified filters, detail drawer, direct upload/reply actions, and consolidated history timeline |
| 26 | Contractor | Dashboard Upgrade | P2 | Done | FE+BE | Dashboard KPI APIs | Upgraded `/contractor/dashboard` with contractor KPI extensions and action widgets: expiring-license queue, pending-upload list, rejected-doc list, worker-onboarding pending list, and branch/client mapping summary driven by live task data |
| 27 | Contractor | Profile + Compliance Identity | P2 | Done | FE+BE | Contractor identity APIs | Rebuilt `/contractor/profile` into company identity workspace with editable profile basics, statutory identity cards (PF/ESI/license evidence), contact/signatory table, served-branches view, and recent document register |
| 28 | Admin | Payroll Templates | P2 | Done | FE+BE | Admin payroll template APIs | Implemented `/admin/payroll/templates` workspace with template list/detail editor, component mapping preview, version-copy action, and client linkage panel with effective-date assignment history |
| 29 | Admin | Payroll Client Settings | P2 | Done | FE+BE | Admin client settings APIs | Built `/admin/payroll/client-settings` with client selector + filter list, per-client statutory/cycle/validation/reminder defaults, effective-date controls, and save-history timeline persisted in settings JSON |
| 38 | Shared | File Preview Component | P2 | Done | FE | File metadata/version APIs | Added reusable `shared-file-preview-modal` + metadata header, version history, rejection reason panels; integrated into ESS document vault preview flow |
| 39 | Shared | Timeline Component | P2 | Done | FE | Event history APIs | Added reusable `shared-timeline` + event card, actor badge, and status-change row for approvals/reuploads/returns/audit history |
| 40 | Shared | Query/Thread Component | P2 | Done | FE | Thread/message/SLA APIs | Added standardized `thread-inbox-list`, `thread-message-panel`, `reply-composer`, and `sla-priority-strip` components; wired into admin notifications, branch helpdesk/notifications, CRM helpdesk, and shared `app-thread-layout` used by CRM/Client/Contractor/Payroll thread pages; `/crm/notifications` unified via redirect to `/crm/helpdesk`; legacy client queries/thread-chat screens retired in favor of shared client support thread workspace |
| 41 | Shared | Status UI Component Set | P2 | Done | FE | N/A | Added shared `status-chip`, `priority-chip`, `due-date-badge`, and `sla-age-badge` for consistent status rendering |
| 42 | Shared | Workspace Layout Component Set | P2 | Done | FE | N/A | Added shared `detail-drawer-layout`, `entity-header-strip`, and `action-footer-bar` workspace shell components |

## Phase 3

| ID | Module | Page | Priority | Status | Owner | Dependencies | Acceptance |
|---|---|---|---|---|---|---|---|
| 3 | Branch | Registrations Workspace | P3 | Done | FE+BE | Branch registrations + helpdesk APIs | Implemented full `/branch/registrations` workspace with status/type filters, expiry alerts, list+detail view, document completeness checklist, timeline, and apply/amend/renew/closure request wizard routed to CRM via registration-tagged compliance tickets |
| 4 | Branch | Audit Observations Closure | P3 | Done | FE+BE | CAPA + verification APIs | Implemented `/branch/audit-observations` closure workspace with observation queue, root-cause and corrective-action workflow, owner/due-date tracking, closure evidence upload, and reviewer-verification timeline |
| 5 | Branch | Safety Compliance Matrix | P3 | Done | FE+BE | Safety requirements/log APIs | Rebuilt `/branch/safety` as periodicity-first matrix with required-vs-uploaded coverage, missing/expiry alerts, requirement-wise upload/reupload, and incident/training/committee record trackers |
| 10 | CRM | Audit Management Page | P3 | Done | FE+BE | CRM audits + audit-closures APIs | Implemented dedicated `/crm/audits` workspace with queue/detail, schedule modal (auditor assignment), month calendar list, readiness checklist, report status card, and CAPA summary widget |
| 30 | Admin | Governance Control Center | P3 | Done | FE+BE | Governance summary APIs | Built `/admin/governance` with governance summary cards, unassigned-client panel, duplicate active-mapping detection, stale-account table, rotation-due queue, and quick remediation links |
| 31 | Admin | Notifications/Helpdesk Center | P3 | Done | FE+BE | Thread + SLA APIs | Rebuilt `/admin/notifications` into threaded helpdesk center with KPI strip, role/type/priority filters, SLA-age chips, status transitions, and full reply-history panel |
| 32 | CCO | Oversight Exception Center | P3 | Done | FE+BE | Risk/ageing/perf APIs | Reworked `/cco/oversight` into exception-first center with risk cards, repeated-delay patterns, top-overdue list, CRM performance snapshot, and escalation queue filters |
| 33 | CCO | Controls Register | P3 | Done | FE+BE | Controls register APIs | Rebuilt `/cco/controls` into register-style list/detail workspace with owner, evidence, design/operating effectiveness, active-status control, and review timeline |
| 34 | CEO | Executive Dashboard Enhancement | P3 | Done | FE+BE | Executive aggregate APIs | Enhanced `/ceo/dashboard` with branch ranking (top-risk + best-performing), monthly audit closure trend, refreshed executive KPI layout, and expanded CSV board summary export |
| 35 | CEO | Executive Reports Pack | P3 | Done | FE+BE | Report pack export APIs | Rebuilt `/ceo/reports` into report-pack workspace with period selector, type cards, preview panel, CSV/PDF export actions, and saved export history |
| 36 | ESS | Attendance + Holiday View | P4 | Done | FE+BE | ESS attendance/holiday APIs | Added `/ess/attendance` with month selector, summary counters, calendar-day statuses, holiday list, and discrepancy-note panel |
| 37 | ESS | Document Vault | P4 | Done | FE+BE | Employee document APIs | Added `/ess/documents` with category tabs, year/search filters, document table, preview modal (image/PDF), and secure download flow |

---

## 3) Build Order (execution)

1. ID 2 (Branch periodic uploads)
2. IDs 7, 8, 9 (CRM returns/renewals/amendments)
3. ID 11 (Client branch detail workspace)
4. ID 16 (Payroll runs console)
5. IDs 38, 39, 40, 41, 42 (shared infra pass, reused by above pages)

---

## 4) Sprint Checklist Template (copy per item)

`Page ID`:
`Route`:
`Role Guard`:
`API Contract Finalized`: Yes/No
`UI Blocks Implemented`: Yes/No
`Status Workflow Wired`: Yes/No
`Timeline/History Wired`: Yes/No
`File Preview/Reupload Wired`: Yes/No
`QA Scenarios Passed`: Yes/No
`Open Risks`:
`Blocked By`:

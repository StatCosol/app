# Project module sample verification — 14 September 2026

Tested application revision: `7553974c8d8df0aaf9392078fba9cf05952d7a50` (merged PR 659). Test harness improvements are on `codex/project-module-sample-tests`. All final executed checks passed. No application defect was reproduced. This is local automated/sample verification, not complete production or user acceptance.

## Results

| Check | Result |
| --- | --- |
| Backend unit/regression tests | 1,504 passed across 208 suites; database-only boot test run separately |
| Real PostgreSQL entity boot | Passed with all mapped entities |
| Angular browser suite | 321 tests, 58 files passed |
| Frontend service/logic Vitest suite | 73 tests, 11 files passed; overlaps browser discovery, not an additional unique-test count |
| Module graph | 64 modules; 262 registered providers; 241 controllers; no orphan controllers/services |
| Module/deployment checker regressions | 9 passed |
| Frontend and backend production builds and full lint | Passed |
| Face service synthetic image/inference tests | 6 passed; actual models/devices not assessed |
| Attendance kiosk fresh Android unit tests | 38 passed, no skips/failures |
| Workflow/support scripts | All 12 passed; see details below |
| Monthly-close and payroll reconciliation PostgreSQL samples | Both passed |
| Register PostgreSQL workflow | 30 checks passed, including all five reviewed applicability identities |
| Nine portal work queues at desktop/mobile sizes | All 18 scenarios passed |
| Fresh TS/AP/MH payroll demo | Nine fictional employees, three approved runs, four generated register workbooks |

## Sample business workflows

- Client/branch scope: all assigned branches, foreign branch/client denial, actual audit period parsing, PF/ESI run aggregation.
- Attendance and payroll approval: India day boundaries, replay boundaries, duplicate mirrored punches, contractor separation, maker/checker and concurrent approvals.
- Contractor payroll: quotation authority, enrollment, branch approval, owner/scope restrictions, mismatch notifications and return/recalculation checks covered by the regression suites and authority script.
- Compliance/audit and task queues: scoped lists, document state and permissions, expiry tasks, scheduler controls, concurrent/repeated execution and delivery deduplication.
- Wage-document reconciliation: synthetic Excel and text/raster PDF documents, exact matches, one-rupee discrepancy, NC output, UAN/ESI comparison and manual-review fallback.
- Accounts: receipt rollover and concurrent unique sequential numbers.
- Registers: exact Act identity, branch-state scope, reviewed applicability, approvals/download permission, duplicate generation and revision retention.
- Monthly close/payroll reconciliation: missing approvals, branch/month isolation, current evidence and decimal comparisons.

The browser smoke uses the built frontend and completely intercepted synthetic API responses. It checks ADMIN, CRM, AUDITOR, CCO, CEO, CLIENT, BRANCH, CONTRACTOR and PAYROLL My Work pages at widths 1440 and 390: sample task display, company filter, navigation, runtime errors and page overflow. It is not a live login or every-page CRUD test. Accounts, Sales, PF-team and ESS web are represented in the existing suites, not this new nine-portal smoke. ESS Android was excluded as previously requested.

## Coverage gaps requiring further acceptance

Direct tests in 28 module areas only construct a service/controller. Some have cross-module database or browser coverage, but their full business workflows remain unproven. In particular, passing `should be defined` is not counted as a sample-data business test.

Construction-only areas: admin, ai, assignments, audit-logs, auditor, audits, branch-compliance, calendar, cco, ceo, checklists, cleanup, client-contacts, compliance-documents, crm, email, escalations, helpdesk, masters, monthly-documents, news, nominations, notices, notifications, options, reports, sla, users.

Live AI provider responses/costs, actual email delivery, physical FaceDesk/biometric/ESSL capture, model accuracy and spoof resistance, and a real hosted multi-role HTTP/CRUD session were not tested. No production credentials, live tenant, payment, email or filing were used. Register catalogue coverage remains 72 implemented and 31 reference-only identities.

## Reproducibility and test-only changes

- Standardized the two older monthly-close/reconciliation scripts on the existing AUTOMATION_TEST_* local-test settings. Host remains fixed to loopback. Added both real checks to the existing PostgreSQL CI step.
- Added `frontend/puppeteer-tests/module-sample-smoke.cjs`; it starts a temporary local static server and blocks non-local/non-fixture requests. Build frontend first, then run with Node. Browser and server close after completion.
- Initial face-service import failure was a missing FastAPI dependency; rerun passed in an isolated test environment. Initial Node test-runner failures were sandbox process restrictions; rerun passed with process access. The new browser harness initially expected the wrong company query parameter; corrected to clientId, and all scenarios passed.
- Test schemas/databases created by verification scripts are removed in their cleanup. The fresh three-branch demo database is retained for review; its local PostgreSQL server is stopped after testing.

Local raw evidence: `tmp-art/all-modules-*.log`, `tmp-art/all-modules-backend.json`, `tmp-art/all-modules-integration-results.json`, `tmp-art/module-browser-samples/results.json` and screenshots; Android XML in `mobile/app/build/test-results/testKioskDebugUnitTest`.

## Module-by-module direct test inventory

Counts are by module area/folder and may be shared by nested modules; do not sum this table. Cross-module integration checks are listed above.

| Module file | Area tests passed | Direct test depth |
| --- | ---: | --- |
| access/access.module.ts | 41 | Behavior assertions present (not full coverage) |
| accounts-billing/accounts-billing.module.ts | 26 | Behavior assertions present (not full coverage) |
| admin/admin.module.ts | 1 | Construction only; workflow coverage gap |
| ai/ai.module.ts | 3 | Construction only; workflow coverage gap |
| app.module.ts | — | Whole graph and entity boot |
| applicability/applicability.module.ts | 9 | Behavior assertions present (not full coverage) |
| assignments/assignments.module.ts | 1 | Construction only; workflow coverage gap |
| attendance/attendance.module.ts | 6 | Behavior assertions present (not full coverage) |
| audit-logs/audit-logs.module.ts | 1 | Construction only; workflow coverage gap |
| auditor/auditor.module.ts | 1 | Construction only; workflow coverage gap |
| audits/audits.module.ts | 1 | Construction only; workflow coverage gap |
| auth/auth.module.ts | 55 | Behavior assertions present (not full coverage) |
| automation/automation.module.ts | 41 | Behavior assertions present (not full coverage) |
| biometric/biometric.module.ts | 21 | Behavior assertions present (not full coverage) |
| branch-compliance/branch-compliance.module.ts | 1 | Construction only; workflow coverage gap |
| branches/branches.module.ts | 4 | Behavior assertions present (not full coverage) |
| calendar/calendar.module.ts | 1 | Construction only; workflow coverage gap |
| cco/cco.module.ts | 1 | Construction only; workflow coverage gap |
| ceo/ceo.module.ts | 1 | Construction only; workflow coverage gap |
| checklists/checklists.module.ts | 2 | Construction only; workflow coverage gap |
| cleanup/cleanup.module.ts | 1 | Construction only; workflow coverage gap |
| client-contacts/client-contacts.module.ts | 1 | Construction only; workflow coverage gap |
| client-dashboard/client-dashboard.module.ts | 2 | Behavior assertions present (not full coverage) |
| clients/clients.module.ts | 10 | Behavior assertions present (not full coverage) |
| common/shared.module.ts | 29 | Behavior assertions present (not full coverage) |
| compliance/compliance.module.ts | 2 | Behavior assertions present (not full coverage) |
| compliance-documents/compliance-documents.module.ts | 1 | Construction only; workflow coverage gap |
| compliances/compliances.module.ts | 8 | Behavior assertions present (not full coverage) |
| contractor/contractor.module.ts | 185 | Behavior assertions present (not full coverage) |
| crm/crm.module.ts | 1 | Construction only; workflow coverage gap |
| crm-documents/crm-documents.module.ts | 8 | Behavior assertions present (not full coverage) |
| email/email.module.ts | 1 | Construction only; workflow coverage gap |
| employees/employees.module.ts | 2 | Behavior assertions present (not full coverage) |
| escalations/escalations.module.ts | 1 | Construction only; workflow coverage gap |
| ess/ess.module.ts | 8 | Behavior assertions present (not full coverage) |
| facedesk/facedesk.module.ts | 236 | Behavior assertions present (not full coverage) |
| files/files.module.ts | 27 | Behavior assertions present (not full coverage) |
| health/health.module.ts | 7 | Behavior assertions present (not full coverage) |
| helpdesk/helpdesk.module.ts | 1 | Construction only; workflow coverage gap |
| legitx/legitx.module.ts | 24 | Behavior assertions present (not full coverage) |
| list-queries/list-queries.module.ts | 10 | Behavior assertions present (not full coverage) |
| masters/masters.module.ts | 1 | Construction only; workflow coverage gap |
| mobile-attendance/mobile-attendance.module.ts | 106 | Behavior assertions present (not full coverage) |
| monthly-close/monthly-close.module.ts | 11 | Behavior assertions present (not full coverage) |
| monthly-documents/monthly-documents.module.ts | 1 | Construction only; workflow coverage gap |
| news/news.module.ts | 1 | Construction only; workflow coverage gap |
| nominations/nominations.module.ts | 1 | Construction only; workflow coverage gap |
| notices/notices.module.ts | 1 | Construction only; workflow coverage gap |
| notifications/notifications.module.ts | 1 | Construction only; workflow coverage gap |
| options/options.module.ts | 1 | Construction only; workflow coverage gap |
| payroll/payroll.module.ts | 421 | Behavior assertions present (not full coverage) |
| payroll/state-slab.module.ts | 421 | Behavior assertions present (not full coverage) |
| payroll-reconciliation/payroll-document-reconciliation.module.ts | 16 | Behavior assertions present (not full coverage) |
| performance-appraisal/performance-appraisal.module.ts | 25 | Behavior assertions present (not full coverage) |
| reports/reports.module.ts | 1 | Construction only; workflow coverage gap |
| returns/returns.module.ts | 20 | Behavior assertions present (not full coverage) |
| risk/risk.module.ts | 4 | Behavior assertions present (not full coverage) |
| safety-documents/safety-documents.module.ts | 6 | Behavior assertions present (not full coverage) |
| sales/sales.module.ts | 3 | Behavior assertions present (not full coverage) |
| service-entitlements/service-entitlements.module.ts | 56 | Behavior assertions present (not full coverage) |
| sla/sla.module.ts | 1 | Construction only; workflow coverage gap |
| task-center/task-center.module.ts | 24 | Behavior assertions present (not full coverage) |
| units/units.module.ts | 10 | Behavior assertions present (not full coverage) |
| users/users.module.ts | 1 | Construction only; workflow coverage gap |

## Workflow script results

| Script | Result |
| --- | --- |
| validate-client-branch-db | PASS |
| validate-critical-workflows-db | PASS |
| validate-module-gap-db | PASS |
| validate-operational-scope | PASS |
| validate-deep-list-review | PASS |
| validate-automation-controls | PASS |
| validate-automation-dedup | PASS |
| validate-my-work | PASS |
| validate-contractor-payroll-authority | PASS |
| validate-payroll-document-reconciliation | PASS |
| security-dependency-smoke | PASS |
| validate-deploy-migration-order | PASS |

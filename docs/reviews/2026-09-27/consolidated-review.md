# Consolidated remaining-module fixes (PR #706)

## Boundaries

This extends the existing billing email PR into the single consolidated PR requested by the owner. No kiosk, Android APK, face capture, attendance, biometric/PIN implementation, shared authentication, startup schema or salary calculation changes. No production database access, data changes, migrations, real email/AI delivery, merge or deployment. Existing review screenshots and unrelated workspace changes are excluded.

The backend graph contains 64 modules, 269 registered providers and 243 registered controllers. Graph validation and regression tests cover the repository; they do not establish exhaustive behavioral coverage of every module. A construction-only test is not a workflow test.

## Confirmed fixes

| Area | Fix and verification |
| --- | --- |
| Billing documents | Email text/log/attachment share the rendered invoice snapshot. PDF files use unique, exclusive-create names. Publishing compares the invoice/client/item snapshot under the invoice lock, rejects stale renders and removes their files. Editing invalidates the previously registered PDF. Disk/publish errors stop delivery. Mocked filesystem/email tests plus real PostgreSQL transaction checks. |
| Billing report integrity | Item-description/SAC filters select invoices without dropping their other lines; detail lines reconcile with invoice totals. GST detail/search uses the saved invoice GSTIN. PostgreSQL multi-line fixtures and report unit tests. |
| Billing validation | Reject empty items, unsupported decimal precision, non-finite/negative values and excessive discounts. Quantity precision matches the existing two-decimal database column. The UI accepts fractional quantities, preserves unchanged legacy invoice dates and hidden item fields, and mirrors validation. |
| Billing UI lifecycle | Reused invoice routes cancel stale loads/saves, retain inactive selected clients and show recoverable load errors. Desktop/mobile browser tests include long error text and existing form behavior. |
| Employees and master data | Branch users without assignments cannot fall through to all employees. Read/write/export/delete/ESS/nomination/form actions check branch scope; destination branches must belong to the client. Department/grade/designation routes check requested client ownership. Synthetic allow/deny tests; no salary or attendance service changes. |
| Employee documents | Resolve ownership from the employee for list/upload/download/verify/delete. A guard checks access before file interception; service repeats authorization. Rejected uploads are removed only inside this feature's directory. Tests cover cross-client/orphan records, admin ownership, empty scope and cleanup failure. |
| Compliance and applicability | Explicit branch users cannot become company masters just because mappings are empty. Company settings require master access; unassigned branch users cannot list/download company documents. Unit creation validates branch/tenant ownership against actual physical column names. CRM search uses mapped entity properties; frontend upload sends `notes`. Unit, Angular and PostgreSQL fixtures. |
| Calendar and LegitX | Operational scope restricts current CCO assignments, requested branches and empty branch assignment sets. Scoped-query and controller tests. |
| Reports | CCO JSON/XLSX coverage, overdue-audit and assignment reports restrict companies, including empty assignments. Company-wide PDFs require company-level access; branch users cannot download aggregates of other branches. Overdue lists exclude closed/cancelled/completed audits and today's date-only deadlines. Real PostgreSQL queries use the actual coverage-view migration; generated Excel workbooks are reopened and checked. |
| AI access and reporting | CCO lists/dashboard/aggregates use current client assignments. Client/branch reads and generation routes check access before provider work; observation reads/reviews, insight dismissal, anomaly resolution and document analysis check record ownership. Global insights remain platform-managed. Risk lists select the latest assessment first, filter current risk and rank before limiting. Mocked providers and real PostgreSQL aggregate/list fixtures. |
| Audit KPIs | Both branch KPI routes check CRM/auditor assignments before querying. Existing client and CCO checks remain. Focused allowed/denied read tests. |
| News | Non-admin detail reads reject inactive/expired articles consistently with the feed. Admin preview retained. |
| CI | The consolidated database fixture is a required PostgreSQL step. Release-check tests ensure it cannot silently become optional. Existing Angular and Node test configurations remain separate; page tests are still discovered. |

## Coverage limits

| Modules / surfaces | Actual depth |
| --- | --- |
| Billing, selected employee/document, compliance/applicability, AI, reports, calendar, LegitX, news, audit KPI routes | Targeted implementation review and new behavioral tests described above. Not every endpoint or role combination was exercised through HTTP. |
| Audits/auditor/audit logs, automation, helpdesk, escalations, SLA/task center, CRM/CCO/CEO/dashboard, sales, performance appraisal, contractor non-attendance entrypoints | Sampled ownership/role/delegation review plus the full existing backend/frontend regression suites. See the companion operations notes. Previously recorded database workflow results are historical, not rerun evidence for this pass. |
| Other clients/branches/assignments, contacts, units, users/options/masters, returns/notices, monthly documents/close, risk/safety/checklists, entitlements, payroll/reconciliation/ESS/nominations | Module registration and existing automated regression coverage only for paths not listed as targeted fixes. No claim of fresh end-to-end inspection of every UI/API/database workflow. |
| Access/auth/common/config, files/email/notifications/cleanup/health | Shared boundaries inspected where needed; existing tests rerun. No shared policy or runtime changes. |
| Kiosk/APK/face capture/attendance/biometric/PIN | Excluded from edits. Existing tests can run without changing implementation or contacting devices. |

## Verification

- Backend and production frontend compile successfully; frontend lint passes and all changed backend TypeScript files pass ESLint.
- Full Angular browser run: 86 files, 535 tests passed. Separate Node frontend run: 17 files, 93 tests passed (some service coverage overlaps).
- Final full backend run: 264 suites, 2,192 tests passed, with one existing skipped suite/test.
- Real PostgreSQL billing transactions: contention, numbering races, rollback, financial-year identity, PDF invalidation/stale publication and complete filtered report lines passed.
- Real PostgreSQL consolidated scope: view/report SQL, scoped Excel contents, empty scopes, audit deadlines/statuses, applicability branch ownership, latest risk ranking and aggregates passed.
- Module graph has no orphan providers/controllers or missing delegate targets. All 14 module/release-check regressions passed.
- Invoice edit screenshots at 390px and 1440px were inspected; error text and controls fit the tested viewports. Existing screenshot artifacts were preserved, not committed.

The database scripts use only loopback PostgreSQL and create/drop UUID-named disposable databases. Their minimal report/AI fixtures verify selected queries and the real coverage view, not migration completeness for a production clone. Billing fixtures use real TypeORM repositories against their disposable schema. Email, AI and PDF renderer behavior is mocked where stated, not certified against external providers.

## Remaining work and rollout

- Fresh CI/security checks must pass for the new commit before merge. An earlier frontend image check failed before scanning because the Alpine package repository TLS download failed; no security check was disabled.
- A staging acceptance pass remains necessary for actual role assignments, migrated tenants, storage/providers and end-to-end UI workflows. A full production-equivalent schema rehearsal was not performed.
- Branch-only versions of company-wide PDFs are not implemented. Those requests now fail closed with 403; the existing client UI shows its generic download error.
- No durable retry queue or historical invoice-file retention cleanup is introduced. Unique old PDFs remain on disk but ordinary edits revoke their registered download path. Successful delivery followed by an email-log failure remains an operational ambiguity.
- The PDF snapshot check does not lock billing settings or client-master edits throughout external email delivery, and cannot recall a document already downloaded or emailed.
- AI business-rule quality, cross-reference validation of every optional audit/payroll link, library curation and live provider behavior are not certified. The changes here focus on access and selected query correctness.
- Shared startup DDL, retention cleanup of client/branch/user records and credential rotation require separately coordinated work because they can affect delivered systems. They were deliberately left unchanged.

No new database migration is required. Review and merge using the normal protected PR process; retain the existing deployment gates. Rollback uses the previous application image, without a schema rollback for this PR.

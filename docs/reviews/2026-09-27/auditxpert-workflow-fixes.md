# AuditXpert Workflow Fixes

## Scope

Fixes the six defects reproduced with fictional AuditXpert sample data:

- Corrected-document review requires an actual, unreviewed upload in a reviewable NC state.
- Rejecting a correction persists the parent audit's CORRECTION_PENDING state.
- CLOSED, COMPLETED and CANCELLED audits reject report authoring, finalization and reopening.
- The corrected-review endpoint validates decisions and remarks at runtime and returns 400 for invalid input.
- Closed/accepted NCs and terminal audits cannot receive new corrected uploads; duplicate pending uploads are rejected.
- CRM report holds persist their timestamp, actor and note, remain visible after reload, and can be explicitly released. Held reports cannot be approved, published or reopened by the author. Send-back clears the hold.

Correction writes run in one transaction, locking the parent audit before the NC. This serializes duplicate uploads/reviews and concurrent acceptance of the last NCs. Notification and report-output hooks remain outside that transaction.

No kiosk/APK, face-capture, attendance, payroll or production-data changes are included.

## Validation

- Backend: 245 suites passed; 1,917 tests passed, one existing skipped test. Includes 46 new correction/report regression tests.
- Auditor and CRM browser tests: six files, 27 tests passed. Includes six new CRM hold tests.
- CRM held-report screenshots inspected at 390 and 1440 pixels, including long notes and the release action.
- Fictional sample-data workflow rerun: 42 passed, zero failed. Covers report draft/PDF/governance, submissions, scoring, findings, correction retries, tenant scope, HTTP validation and rollback. Original failed results remain separate from post-fix results in the local review artifacts.
- Real PostgreSQL/TypeORM regression script: nine checks passed, including simultaneous uploads, simultaneous reviews, last-NC closure, transactional rollback, a concurrent report hold, and HTTP hold/release routing and permissions.
- Existing audit-entry and auditor-dashboard SQL integration scripts passed against disposable local PostgreSQL databases.
- Backend and production frontend builds passed. Changed-file backend/frontend lint and module-wiring checks passed.
- Existing Sass deprecation and Angular readiness-list tracking warnings remain outside this change.

Tests use fictional records. External delivery/automation hooks and login identity are stubbed in the focused integration checks; these are not a full production login, email-delivery or deployment test. The TypeORM concurrency script uses minimal audit-only fixture schemas.

## Reproduction

From `backend`, after building, run `node scripts/verify-audit-corrections.cjs` with a disposable local PostgreSQL server. It connects only to 127.0.0.1, defaults to port 55439 and user monthly_close_test, creates a uniquely named database, and drops only that database on exit. Optional settings: AUDITXPERT_TEST_PORT, AUDITXPERT_TEST_USER and AUDITXPERT_TEST_PASSWORD. It does not read the application's database configuration.

Run the focused unit tests with `npx jest --runInBand src/audits/audit-nc.service.spec.ts src/audits/audit-report.service.spec.ts`.

From `frontend`, run `npx ng test --watch=false --include='src/app/pages/auditor/**/*.spec.ts' --include='src/app/pages/crm/audits/*.spec.ts'`.

## Deployment

Apply `20260927_audit_report_hold.sql` before deploying the backend. It adds three nullable columns to audit_reports and is registered in the existing service-migration deployment runner. Existing reports default to not held. The migration was applied twice in local tests to verify idempotence.

No APK update is required. No production migration or deployment was performed during this verification.

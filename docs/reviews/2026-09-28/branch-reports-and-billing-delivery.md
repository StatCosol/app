# Branch reports and invoice delivery status

## Completed in this change

- Connected the branch Reports page to compliance-summary, risk-heatmap and due-task submission-status PDF downloads, with an optional month filter, busy state, duplicate-click protection and actionable errors.
- Authorized branch users receive only their assigned branches. Both company ownership and branch membership are applied in SQL before PDF generation. An empty assignment fails closed.
- Scoped compliance totals use the same branch rows as the report table, counting APPROVED and SUBMITTED tasks. Company-wide callers retain their previous scope and calculation.
- PDF headings distinguish assigned-branch reports from company-wide reports. Invalid month filters return a validation error.
- Invoice emails accepted by SMTP are no longer marked FAILED merely because saving the email log or invoice status fails. Both status writes are attempted independently. The response and invoice page explicitly warn against resending until the administrator reconciles the status.

## Protection boundaries

### Review follow-up: branch PDF entitlement

The three scoped PDF endpoints now call the existing entitlement service for `EMPLOYEE_COMPLIANCE` before returning branch IDs or reading report data. This covers both `CLIENT` branch users and explicit `BRANCH_DESK` users, including direct HTTP requests where the global route guard does not enforce the module. Current server-side entitlements are checked on every request; frontend visibility or a stale user snapshot is not treated as authorization. Non-branch reporting scope is unchanged. ReportsModule explicitly imports ServiceEntitlementsModule; the shared guard and attendance routes are untouched.

Verification for this follow-up: 158 tests passed across report scope, report rendering, the new HTTP regression suite and existing entitlement-service/guard suites. The HTTP fixture uses synthetic authentication and the actual entitlement guard, PDF controller and entitlement service. It covers contractor-only modules, empty modules, permitted access, revocation, lookup failure and unchanged non-branch behavior.

No kiosk, APK, face capture, attendance, biometric, PIN, salary-calculation, shared authentication, migration or startup-schema changes. The optional compliance-calculator branch argument is additive; existing callers that omit it retain their existing SQL scope. No production database checks, real email deliveries or production file deletion were performed.

No schema migration or new runtime configuration is needed for this PR. Merge/deployment remains the existing PR workflow; local validation does not mean the changes are published.

## Verification

- Backend unit coverage includes scoped SQL parameters with/without a month, empty assignments, cross-company rejection, invalid dates, weighted report totals, PDF rendering and independent post-delivery database failures.
- Full backend suite: 2,261 tests across 267 suites passed; one existing test/suite is skipped.
- Angular browser coverage includes real report service requests, Blob handling, disabled download state, error display, URL cleanup and desktop/mobile screenshots at 1440px and 390px.
- Full Angular suite: 563 tests across 89 files passed.
- Frontend Node suite: 103 tests across 17 files passed.
- Backend and production frontend builds passed. Existing Bootstrap/Sass import deprecation warnings remain.
- Changed frontend lint and the 64-module registration/delegation check passed.
- The first backend lint pass found seven formatting errors in the new test file; the repository formatter corrected them and its file-level lint recheck passed.
- `node scripts/verify-branch-pdf-db.cjs` passed against an isolated loopback PostgreSQL cluster. It creates and drops its own disposable database, inserts synthetic cross-company/cross-branch/month fixtures, renders all three PDFs and parses their text to check that forbidden records do not appear.

For the database fixture, build the backend first. It uses the existing `auditxpert-test-db.cjs` adapter and only `AUDITXPERT_TEST_PORT`, `AUDITXPERT_TEST_USER` and optional `AUDITXPERT_TEST_PASSWORD`, not application database configuration.

## Still pending, not certified by this PR

1. Durable invoice delivery/reconciliation and post-audit follow-up queues. SMTP acceptance plus a process crash or lost response still needs reconciliation; this patch does not provide exactly-once delivery, persisted warnings or automatic retries.
2. Retention cleanup of historical invoice PDFs and unreferenced uploads. This needs a defined retention policy and protection against deleting files that are still referenced or being registered. No automatic deletion has been introduced.
3. AI business-rule quality and live-provider acceptance, beyond the already merged scope and ownership checks.
4. Shared startup-schema and general record-retention refactoring, which remains outside the protected-system boundary of this work.
5. Staging acceptance with actual role accounts, migration rehearsal, credential-rotation confirmation and live weekly-news delivery verification. Synthetic tests are not evidence of production provider delivery.

The broader development backlog is not complete. This PR completes the report-download gap and the known post-acceptance invoice-status defect without bundling unverified destructive or background-delivery behavior.

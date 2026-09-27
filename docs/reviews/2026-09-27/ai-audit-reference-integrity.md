# AI audit observation reference integrity

Follow-up to merged PR #706. This closes the audit-reference gap recorded in the consolidated review, not every remaining module-review item.

## Findings and fixes

- Generation previously accepted an arbitrary audit ID alongside an authorized company ID. It now requires the audit to belong to that company before consulting the learning library, calling a provider or saving a record.
- A branch-scoped audit now supplies its stored branch when the request omits one. An explicit conflicting branch is rejected. The resolved branch must belong to the company and must not be deleted.
- UUID review follow-up: branch equality is case-insensitive. Uppercase/mixed-case requests remain equivalent to PostgreSQL's lowercase UUID representation, while different UUID values still reject.
- Missing/deleted companies and unavailable database context fail closed instead of generating observations against empty placeholder context.
- The provider context now receives the branch name through the correct query alias.
- Whitespace-only findings are rejected; accepted finding text is trimmed consistently by the UI and service.
- Expected validation/not-found errors preserve their HTTP status and actionable message. Unexpected database/provider details are not returned in the generic 500 response.
- The auditor form displays the rejection, retains the entered values for correction, and prevents overlapping clicks. Successful submission behavior remains unchanged.

## Compatibility and boundaries

- Standalone company observations remain supported. Company-wide audits may retain no branch or use an explicitly selected branch from the same company.
- Existing caller authorization remains in the controller. No shared access/auth policy changes, database migrations, legacy record repair, legal-rule edits or provider configuration changes.
- Kiosk, Android APK, attendance, face capture, biometric/PIN and payroll implementation are untouched. No production records/settings were accessed or changed; no external AI/email calls were made.
- Reference validation describes the records at request processing time. This does not add cross-record schema constraints, hold database locks across provider work or implement server-side idempotency for network retries.
- AI-generated legal/business content, legacy malformed observations, optional payroll-run links and the other consolidated-review gaps remain outside this focused change.

## Verification

- 33 targeted backend tests passed across generation/reference, UUID casing, HTTP error and existing AI scope suites.
- Five Angular generation-form tests passed: trim/duplicate clicks, rejection/correction/retry, missing-message fallback and whitespace-only findings.
- Real PostgreSQL and TypeORM checks passed for cross-company/missing audit, explicit/inferred branch integrity, valid saved observations, standalone/company-wide compatibility and deleted owners. Rejections leave the saved row count and provider-call count unchanged.
- The database test creates and drops a UUID-named disposable database on loopback only, using the existing test adapter. Real client/observation entity metadata is used; audit/branch lookup tables are minimal schema fixtures, not a production migration rehearsal.
- Six release-check regressions passed; the new database script is required in CI. Module graph checks found no orphan services/controllers or missing delegate targets.
- Full backend suite before the UUID review correction: 265 suites / 2,208 tests passed; one existing suite/test remains skipped. The correction was rechecked with the 33 focused tests, lint, build and real PostgreSQL uppercase-ID save/rejection fixtures; full CI reruns on the pushed commit.
- Full Angular suite: 87 files / 540 tests passed, including the new page specification through normal discovery.
- Backend and production frontend builds, changed-backend ESLint and frontend lint passed. Existing Sass deprecation warnings remain. Fresh CI status is reported separately from these local results.

Reproduce the database check after a backend build with a local PostgreSQL role permitted to create databases:

```text
node scripts/verify-ai-audit-references-db.cjs
```

It reads only `AUDITXPERT_TEST_PORT`, `AUDITXPERT_TEST_USER` and optional `AUDITXPERT_TEST_PASSWORD`, never application database configuration. Default host/port are `127.0.0.1:55439`.

No merge or deployment is performed by this change. Review and merge through the existing protected PR process after the checks pass.

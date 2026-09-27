# Project hardening: scope and verification

## Release boundaries

This is a reviewed code change, not a production deployment or certification of every workflow. No APK, kiosk, face capture, attendance, salary calculation, startup schema, production records, or production settings were changed. No new migration is required. Existing client payslips keep the standard renderer until an authorized payroll user explicitly enables a custom layout.

## Completed changes

| Concern | Change |
| --- | --- |
| Embedded smoke-test credentials | Replaced committed login literals with required environment variables. The script permits loopback HTTP(S) servers only, refuses redirects, hides response bodies and fails on unsuccessful checks. |
| Release checks that did not exercise behavior | Replaced the payroll echo-only job with real approval, scope and reconciliation tests. Added audit correction, audit entry, dashboard, layout transaction and PDF regressions to CI. |
| Hidden audit follow-up failures | Correction responses contain warnings; the auditor UI displays them. Independent follow-ups still run after another fails. Review activity metadata records follow-up warnings when logging is available. Structured logs contain record IDs and operation names, not private error payloads. Document review hooks now log their failures too. |
| Duplicate report transition rules | Admin and CRM use one conditional approval/publication implementation. Role and assignment checks remain in their existing owners. Admin still requires approval before publication; CRM retains its existing direct-publication rule. Concurrent holds remain protected in SQL. |
| Audit output generation failure | Removed the invalid UUID-to-bigint report-version query, retained the persisted report version, and propagated rendering/delivery failures. Report-ready notifications are sent only for rendered, published, unheld reports. Rejection notifications now join the actual client branch table. |
| Saved payslip layout ignored | Added an opt-in editor in client payroll configuration and a paginated renderer. Supports component labels/order, section titles and total labels. Required totals come from saved payroll run amounts, never from editable layout arithmetic. INR amount-only settings are validated; unsupported rates/units are rejected. Saves and before/after history commit together under a per-client lock. |

## Local verification

- Backend: 249 suites / 1,969 tests passed; one existing suite/test skipped.
- Angular browser suite: 80 files / 436 tests passed.
- Separate frontend service suite: 16 files / 92 tests passed.
- Real PostgreSQL correction suite: all 11 lifecycle, race, rollback, hold and HTTP-role checks passed.
- Real PostgreSQL audit-entry fixtures: assignment scope, contractor mapping, all 13 templates, re-entry and migration idempotency passed.
- Real PostgreSQL dashboard fixtures: status counts, date boundaries, scope and pagination passed.
- Real PostgreSQL layout fixtures: simultaneous first saves, exact before/after history, scope rejection and history-failure rollback passed.
- PDF fixtures: custom labels/order, saved totals, legacy/disabled/inactive compatibility and a 45-row multipage layout passed. Rendered pages were visually inspected.
- Playwright-backed browser checks and screenshots at 390px and 1440px passed, including no horizontal control overflow.
- Release/module regression scripts: 11 checks passed; module graph has no unregistered providers/controllers.
- Backend and production frontend builds passed. Changed-file lint passed. Existing Sass deprecation warnings remain.
- Smoke-script safety tests use mocked HTTP functions and disposable placeholder credentials. They do not authenticate to production.

PostgreSQL tests connect only to 127.0.0.1 and create/drop uniquely named disposable databases. External email, AI and other provider delivery is not certified by these tests.

## Reproduce the added database/PDF checks

Build the backend first. Use a local PostgreSQL role permitted to create disposable databases. Set `AUDITXPERT_TEST_PORT`, `AUDITXPERT_TEST_USER`, and optionally `AUDITXPERT_TEST_PASSWORD`. The default target is localhost:55439 with user `monthly_close_test`; application database variables are never used.

```text
node scripts/verify-audit-corrections.cjs
node scripts/verify-audit-entry.cjs ./auditxpert-test-db.cjs
node scripts/verify-auditor-dashboard.cjs ./auditxpert-test-db.cjs
node scripts/verify-payslip-layout-db.cjs
node scripts/verify-payslip-layout.cjs
```

## Work not claimed complete

1. **Credential revocation:** deleting literals does not revoke old passwords or remove them from Git history. Coordinate replacement of the old admin/auditor account passwords and session invalidation with the account owners. Do not test the exposed credentials against production. No kiosk/device keys should be rotated as part of this cleanup. History rewriting needs separate repository-owner coordination and is not a substitute for revocation.
2. **Full external acceptance coverage:** these are local automated checks, not proof that every production role, provider, email, storage integration and migrated tenant works. A staging acceptance pass with disposable accounts and provider sandboxes remains necessary.
3. **Durable follow-up delivery:** failures are observable, but this change does not add a persistent retry queue. An authorized admin/assigned CRM can retry report refresh through the existing scoped `POST /api/v1/automation/triggers/audit-output/:auditId` endpoint after diagnosing the cause. Do not resubmit a committed correction. Task/mail failures still need operator investigation. If activity logging itself fails, the structured server event is the fallback.
4. **Shared-backend/startup schema debt:** do not remove or relocate startup DDL while the delivered kiosk shares the backend. Inventory the existing startup statements, verify migration-ledger coverage against a disposable restored schema, move non-attendance changes into explicit migrations in small batches, and rehearse upgrade/rollback before a separately approved release. This architectural risk remains; this PR does not pretend to remove it.
5. **Open refactor PR #695:** this branch is based on merged PR #696, not the unmerged payroll refactor. Both touch payroll configuration ownership. Rebase and retest #695 after this change is merged rather than losing the layout validation/history changes during conflict resolution.

## Rollout and rollback

Merge through the normal PR process after required CI/security checks succeed. Do not bypass the deployment gate. The custom layout remains off by default, including for legacy saved layouts with no explicit `settings.enabled: true`. Validate one synthetic/staging client before enabling it for a real client. Disabling the setting restores standard rendering for newly generated payslips; existing archived files are not rewritten. Application rollback uses the previously deployed image and does not require a schema rollback for this change.

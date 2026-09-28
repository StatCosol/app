# Invoice delivery recovery and read-only PDF inventory

## Scope

Continues the remaining development review after merged PR #711. Changes are limited to billing delivery, its admin review screen, a read-only invoice-file inventory, tests and deployment migration registration.

Kiosk, APK, FaceDesk, attendance, biometric/PIN, shared authentication, salary calculations and shared startup DDL are unchanged. No production database, provider credentials or real customer messages were used. No deployment or automatic merge is performed.

## Completed

- A delivery journal is committed before PDF preparation or SMTP invocation. Concurrent sends for one invoice are serialized and unresolved deliveries block another attempt.
- The invoice form supplies a request UUID. Retrying an unchanged request reuses its persisted outcome; a reused key with changed content is rejected. Reopening the form creates a new intentional attempt, still subject to the unresolved-delivery guard.
- Preparation failures and expired preparation records are definite non-sends. An expired worker cannot later initiate sending.
- SMTP acceptance is persisted before the separate invoice/log bookkeeping transaction. A minute-based recovery job reconciles saved receipts after failures or restarts, without sending any messages. Receipt updates cannot mark a subsequently edited or cancelled invoice as emailed.
- PDF regeneration/downloads retain the registered attachment path while its delivery is SENDING, UNKNOWN or ACCEPTED. The freshly rendered download is still returned, but cannot invalidate that receipt's identity. Actual invoice edits clear the path as before; later downloads resume normal registration once the delivery is reconciled.
- Ambiguous failures and abandoned sends become UNKNOWN, not automatically retried. An ADMIN can record a provider-verified accepted/not-sent outcome with mandatory evidence and explicit confirmation that no send remains in progress. Evidence, outcome, log and invoice changes commit atomically. ACCOUNTS can read the history but cannot resolve outcomes.
- Email Logs shows persistent delivery state, provider references, administrator evidence and explicit IST acceptance times. Loading/error states, bounded scrolling, pagination and mobile review controls are covered by browser tests.
- ADMIN can preview the local `uploads/invoices` PDF inventory. Current invoice and delivery-journal references are checked; recent, referenced, blocked and unregistered files are distinguished. Traversal is bounded at 1,000 directory entries and incomplete scans are flagged. There is no delete endpoint, file-content read or scheduled cleanup.

## Important limits

SMTP is not an exactly-once transaction with PostgreSQL. A crash after provider acceptance but before receipt persistence remains UNKNOWN and needs provider verification. Accepted means accepted by the mail server, not delivered to the recipient's inbox. The administrator's evidence is an attestation; this change does not query the provider's delivery API. Confirm the original request is no longer running before marking it not sent.

The journal covers new invoice sends. Historical email logs and pending-payment follow-up emails retain their existing behavior. Rolling back to an older sender would bypass the journal; pause billing sends and review unresolved entries before any rollback. Do not drop the delivery journal as part of rollback.

The inventory is a local, capped observation, not proof a file may be deleted. File age uses modification time, not a statutory retention date. A file being registered concurrently, a legacy differently formatted reference, another application replica or an external archive can make an apparently unregistered path still necessary. The default 365-day preview threshold is only a filter, not an approved retention policy. No deletions should be inferred from this report.

## Rollout and acceptance

1. Apply `20260929_invoice_delivery_recovery.sql` through the existing migration runner before running the new backend. It is included in the deployment migration allowlist and is additive/idempotent. Rehearse on a staging database clone with the normal backup procedure; local fixtures are not proof of the actual production schema.
2. Deploy the backend and frontend through the normal reviewed PR pipeline. Avoid mixed old/new billing senders: quiesce invoice sends during rollout and drain old in-flight requests.
3. In staging, verify ADMIN can review an UNKNOWN attempt and preview inventory, while ACCOUNTS can only read logs and other roles cannot use either privileged endpoint.
4. Using an approved synthetic invoice and controlled mailbox, verify one acceptance, retry after a lost HTTP response, recovery after a bookkeeping outage and provider-supported manual resolution. Do not experiment on a real customer invoice.
5. Confirm the reconciliation schedule appears in Automation Control's registered-job inventory and watch Email Logs for ACCEPTED entries becoming recorded. UNKNOWN entries must stay blocked until reviewed.

## Verification

- Backend billing tests: 153 passed across 12 suites, using the production validation pipe for HTTP cases. Provider confirmation must be an actual boolean true; text/numeric coercion is rejected.
- Full backend suite: 2,411 passed across 274 suites; one existing test/suite skipped.
- Isolated PostgreSQL fixture: 16 checks passed, including concurrent reservations, stale preparation, restart recovery, stale PDF protection, manual-resolution authorization and atomic rollback when evidence persistence fails. Migration replay tested twice. The fixture creates and drops only its own UUID-named localhost database; no SMTP calls.
- The full billing PostgreSQL transaction fixture also passed with real TypeORM invoice entities. Added coverage exercises PDF registration during SENDING/UNKNOWN/ACCEPTED, successful receipt reconciliation after the download, later regeneration without clearing sent status, and a genuine invoice edit during delivery remaining unsent.
- Backend and production frontend builds passed; existing Bootstrap/Sass deprecation warnings remain.
- Backend and frontend lint passed.
- Full Angular browser suite: 586 tests passed across 91 files, including the actual billing page specs. Desktop/mobile screenshots were inspected at 1365px and 390px.
- Separate frontend logic suite: 105 tests passed across 17 files.
- Release/deployment/module-regression checks: 17 passed. The 64-module registration and delegation check passed with no orphan providers or controllers.
- `git diff --check` passed. No protected-system implementation files changed.

Screenshots: [desktop](billing-delivery-1365.png), [mobile](billing-delivery-390.png).

Run the database fixture after building the backend: `node scripts/verify-invoice-delivery.cjs`. It reads only `AUDITXPERT_TEST_PORT`, `AUDITXPERT_TEST_USER` and optional `AUDITXPERT_TEST_PASSWORD` for a loopback test cluster. CI runs it alongside the existing database regression fixtures.

## Remaining acceptance and policy work

- Retention duration, eligible file categories, legal holds, archive/restore requirements and a separately reviewed deletion mechanism. This PR supplies inventory only; historical uploads outside invoice PDFs are not scanned.
- AI business-rule quality: a domain-reviewed reference dataset, agreed acceptance thresholds and live-provider evaluation. Passing mocked authorization/response-validation tests does not establish business accuracy.
- Staging tests with actual role accounts, deployment/migration rehearsal, credential-rotation confirmation and live weekly-news provider delivery verification.
- Shared startup-schema/general record-retention refactoring remains outside the protected-system boundary.

These items remain open; the full project is not certified complete by this PR.

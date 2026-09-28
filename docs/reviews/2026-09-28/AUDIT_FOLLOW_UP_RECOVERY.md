# Audit correction follow-up recovery

## Scope

Persist follow-ups from corrected audit uploads and auditor acceptance/rejection.
No kiosk, APK, face capture, attendance, biometric/PIN, authentication, salary
calculation, or production data changes are included.

## Behaviour

- The correction and its job commit together. Failure to enqueue rolls back the correction.
- An immediate post-commit attempt preserves the normal workflow. Failure returns a
  saved-with-retry warning instead of asking the user to submit the correction again.
- A named worker scans up to 20 ready jobs each minute. Failed effects roll back to
  a savepoint before the failure counter and next attempt are saved.
- Automatic retries back off from one minute to one hour, stopping after eight failed
  attempts. Administrators can queue another cycle; manual retries are audit-logged.
- Audit/NC/job row locks serialize workers and correction decisions. The effects
  and completion record share one transaction; connection loss rolls everything
  back and leaves the durable job available. There is no stuck processing lease.
- Latest correction ID, decision, NC state, audit cancellation/closure and company
  deletion are rechecked before effects. Superseded jobs retain historical activity
  but do not create obsolete tasks, close a new correction, or refresh its report.
- Score changes, task changes, report generation and in-app notification writes use
  the same transaction manager, including notification routing lookups and receipts.
  No SMTP/email delivery is retried by this worker.
- Report holds still suppress publication notifications. The report row is locked
  while its publishability is checked. Original NC acceptance timestamps are retained.

## Administration

Open **Admin > Automation > Audit follow-ups** (`/admin/audit-follow-ups`).
Status filter, bounded pagination, attempt counts, scheduled retry times (IST),
sanitized errors and retry actions are available. Only ADMIN can access the
versioned list/retry endpoints. Retry requests for completed, skipped, pending or
busy jobs return a conflict. Payloads and document details are not returned by the list.

## Deployment And Rollback

`20260928_audit_follow_up_jobs.sql` is additive and is registered in the existing
deployment migration runner. Apply it before deploying the new backend. It creates
an empty job table, indexes, foreign keys and event/status constraints; no existing
business records are backfilled or modified.

The migration was tested twice against a disposable local database. No production
migration or deployment was performed during development. An application rollback
can leave the additive table in place, but the older application will not process
queued jobs or enqueue new ones. Retain the table and its contents for a forward fix;
do not drop it while pending work exists.

This only guarantees durable delivery for corrections made after rollout. Historic
follow-ups that failed before rollout have no durable job and need investigation;
the migration deliberately does not replay old notifications. No automatic history
purge is introduced.

## Verification

Final local results: 2,371 backend tests passed (one existing skipped test),
574 Angular browser tests passed, 103 Node-only frontend tests passed, and both
production builds passed. Backend lint, changed-frontend lint, module wiring and
migration coverage passed. Existing Sass deprecation warnings remain unchanged.

- Backend unit/HTTP tests cover role restrictions, bounded inputs, retry state,
  stale decisions, failure sanitization, scheduler overlap and transaction propagation.
- `verify-audit-follow-ups.cjs`: 13 real PostgreSQL checks with sample data, including
  partial rollback, fresh-worker retry, terminated fixture connection, simultaneous
  workers, delayed retries, exhausted retries, manual recovery and FK integrity.
- `verify-audit-corrections.cjs`: 11 existing real PostgreSQL/TypeORM correction and
  report-hold checks. Its delivery stub is updated to the new follow-up interface.
- Angular browser tests cover actions, loading/error states, filtering, pagination,
  request cancellation, IST dates and desktop/mobile table containment.
- The new database fixture runs in CI alongside the existing audit regressions.
- Desktop/mobile screenshots in this folder use fictional sample records.

The database recovery fixture substitutes transactional sample effects for business
hooks; separate tests invoke the actual hook services and reject any query or write
that escapes the supplied transaction. Neither fixture sends real messages.

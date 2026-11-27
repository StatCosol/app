# Daily notification email summaries — 28 November 2026

Requested policy: one combined notification email per recipient per day, at 10:30 AM Asia/Kolkata. In-app updates remain immediate. Password resets and invoices explicitly sent by a user remain immediate.

## Delivery

Audit/compliance alerts, SLA and risk reminders, assignment rotation, rejections, licence alerts, payroll-input and contractor-data reminders, compliance news, administrator digests and pending-payment reminders use the shared durable queue. The sender is the configured audit mailbox (with the existing authenticated-mailbox fallback).

Each recipient gets only their own To/Cc/Bcc-addressed items. Addresses are normalized and overlapping roles are deduplicated. All queued items are included, without a top-N truncation. Items arriving at or after 10:30 are eligible the next day. A minute-based worker catches up after a restart.

A unique recipient/date reservation is committed before SMTP. Concurrent workers and retries cannot issue another summary for that recipient/day. Identical event content for the same delivery date is deduplicated. SMTP acceptance sets SENT; it is not proof of mailbox delivery. A crash or uncertain SMTP response is held as UNKNOWN and is not automatically resent. Review the provider receipt before any recovery; do not delete reservations to retry.

Queue failures fail closed; they do not fall back to per-task email. EMAIL_ENABLED=false disables both queuing and dispatch.

## Records and operations

The deployment migration adds notification delivery tables and links from existing delivery logs. Queued reminders are not counted as sent. Payment reminder counts increase once after confirmed SMTP acceptance; amount, payment state and actual balances are not modified. No historical task notifications are backfilled or resent by this migration.

Overdue-task transitions are atomic, preventing two workers from claiming the same tasks or overwriting a newly approved task. The zero-task run now completes its cron log. Daily summaries include the task title, client, branch, period and due date.

For read-only monitoring, inspect notification_email_digests for SENDING/SENT/UNKNOWN, and pending notification_email_recipients with digest_id IS NULL. UNKNOWN requires provider investigation. Delivery reconciliation reads outstanding tracked events rather than scanning every historical event. Existing source logs distinguish QUEUED from SENT/UNKNOWN.

## Validation

- Backend and frontend production builds.
- Full backend regression suite: 373 suites / 3,746 tests passed; one pre-existing skipped test. Changed backend files pass lint. Frontend build retains existing Sass and initial-bundle size warnings.
- Focused routing tests cover all notification helpers, disabled email, queue failure, authentication, invoice attachments and direct digest dispatch.
- Isolated PostgreSQL integration script: backend/scripts/test-notification-digests.cjs (requires compiled backend and a loopback-only PostgreSQL test server).
- Migration applied twice; 130 simulated tasks with duplicate enqueue attempts; concurrent digest workers; private-recipient isolation; complete lists; IST cutoff and late events; restart/catch-up; uncertain SMTP and stopped-sender handling; tracking reconciliation and counters applied once.
- Concurrent overdue jobs: two eligible fixture tasks transition once, approved and deleted-client fixtures are preserved; immediate in-app notifications remain independent.
- Payment amount/status remain unchanged in database tests; payment queue tests check metadata-only updates and uncertain-delivery guards.
- Local mail delivery is mocked. Test schemas are dropped after execution. No test emails are sent to live clients and no production records or balances are used for write tests.

Deployment and live verification remain pending the protected release process.

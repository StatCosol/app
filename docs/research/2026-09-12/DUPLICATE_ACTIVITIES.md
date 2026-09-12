# Duplicate activity fixes — 12 September 2026

Status: implemented and verified locally. Not published or deployed.

## Delivered behavior

- Task creation reuses an existing active task for the same source and assignment. Separate company, branch, role and user assignments remain separate.
- Automated due, overdue, audit schedule, non-compliance and document-expiry reminders use durable delivery receipts. Concurrent workers and same-day retries produce one ticket per event/recipient and one notification-center entry per event/role/scope. A subsequent Indian calendar day can produce the next daily reminder.
- Tickets, messages, notification-center entries and their receipts commit together. A failure rolls them back together, so retrying neither loses the reminder nor creates partial duplicates. Reminders are assigned to the intended recipient and start unread. Role-level entries are shared across recipients.
- Filing overdue alerts and overdue tasks linked to that filing share an event identity, eliminating the duplicate alert from the two scheduled jobs.
- Manual and scheduled expiry scans call the same coordinator. Contractor documents use the actual contractor_user_id and branch/company fields. Branch registration renewals use compliance_returns and no longer create a competing REGISTRATION_EXPIRY activity. The obsolete scan of nonexistent branch_documents.expiry_date was removed; registration expiry is handled through branch_registrations.
- Registration/expiry links make renewal filing creation safe under concurrent scans. Filing and task creation share one transaction. Separate registrations of the same type stay separate. New filing periods come from the expiry date, including next-year expiries.
- Exact legacy contractor expiry aliases are adopted into the canonical workflow; duplicate active tasks for that same document/owner/scope/expiry are cancelled with a retained-task note. Exact legacy registration expiry tasks are cancelled with the replacement filing ID after that filing exists. Historical rows remain present.
- Completed or cancelled tasks are not recreated by repeated scans of the same expiry. A changed document expiry date creates a separate cycle. Due-today tasks are no longer classified as overdue because of the current time of day.

## Migration and rollout

The additive migration `backend/migrations/20260912_automation_delivery_dedup.sql` creates automation_delivery_receipts and registration_renewal_links. It is registered in the production deployment list in `backend/scripts/apply-service-entitlements-migrations.mjs`; it is not merely an unregistered SQL file.

Apply the migration before starting upgraded automation workers. Replace old workers rather than running old and new expiry producers together. Both migration applications in the disposable fixture succeeded. The production database was not changed during this task.

Existing reminder tickets are preserved. Old tickets without delivery receipts can be followed by the first keyed reminder after rollout. Ambiguous legacy renewal filings are logged for review rather than guessed, deleted or silently linked to the wrong registration. Deleted filings require explicit recovery and are not recreated by the scanner.

## Verification

Backend build and affected-file lint passed. Module wiring checks passed. The full backend suite passed 1,160 tests and identified one missing migration registration; that registration was fixed, and all four migration-coverage tests then passed. The one environment-dependent test remained skipped. This verifies all 1,161 runnable backend tests through the full run and targeted correction check.

Real PostgreSQL checks in `backend/scripts/validate-automation-dedup.cjs` passed:

- Twenty concurrent deliveries and same-day retries, next-day reminders, changed wording, separate sources/branches/recipients, and shared role-center entries.
- Injected notification-center failure rolled back ticket/message/receipt writes; retry then succeeded.
- Cross-job filing alert deduplication, audit schedule reminders, NC reminders and report notices.
- Indian date boundaries for due-today versus overdue tasks.
- Concurrent manual/scheduled expiry scans, multiple registrations of one type, legacy filing adoption, exact duplicate retirement and retained history.
- Approved/closed history, changed document expiry cycles, next-year filing periods, and filing/task rollback plus recovery.

The existing My Work database checks also passed, including twenty concurrent task creators and a 5,000-task list/count fixture. Frontend code was unchanged in this fix; its previously completed 257-test run was not repeated.

For reproduction, build the backend and run the two validation scripts against the isolated local PostgreSQL test identity on port 55439. They create/remove their own schema and never read production credentials. `backend/scripts/check-duplicate-activities.sql` remains a read-only diagnostic for historical data review.
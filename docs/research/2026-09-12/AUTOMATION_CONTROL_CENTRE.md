# Automation Control Centre — 12 September 2026

Implemented locally at **Admin → Automation** (`/admin/automation`). This release manages four existing automation flows; it is not a replacement for every scheduler in the project.

## Included flows

| Flow | Actions | Default daily time (India) |
| --- | --- | --- |
| Expiry renewals | Registration renewal filings/tasks within 60 days; contractor document tasks/reminders within 30 days | 07:00 |
| Task reminders | Tasks due within 3 days, overdue escalations to CRM, audit schedule reminders within 5 days | 08:00 |
| Overdue filing alerts | Notify the current CRM; raise linked active task priority after seven overdue days | 08:00 |
| Audit corrections | Remind the assigned auditor, or audit creator, about open non-compliances | 09:00 |

## Behaviour

- Administrator-only configuration, preview, execution, retry and history APIs. Legacy renewal/overdue triggers are also administrator-only and use the same controls.
- Company and branch overrides support enable/pause and daily India time. Scoped overrides are excluded from parent runs, including paused overrides. Default pause stops the rule everywhere; company pause stops its child branches. Removing a scoped override restores inheritance.
- Preview uses the same scoped eligibility queries as execution. It shows eligible counts and examples without writing records. Counts are not a promise of new work: existing activities/reminders are reused, and underlying records may change before execution.
- Manual runs require a saved scope and current configuration digest. Settings use version checks. Settings cannot change while the rule is running.
- Database advisory locks prevent simultaneous runs of the same rule across application replicas. Request keys prevent repeat execution of a submitted run. Existing task/filing identities and notification receipts protect individual actions against duplicate retries.
- Each enabled scope runs once per Indian calendar day at or after its configured time. The minute scheduler catches up on the current day after downtime; it does not backfill previous days. Failed scheduled attempts need a manual retry or a new run.
- History distinguishes completed, partial, failed, interrupted and running work, with actor, scope, results and timestamps. Setting changes retain before/after values and actor identity even after an override is removed.
- Retry is available for failed, partial or interrupted runs on the same Indian date and unchanged configuration. Older or changed-scope work requires a new preview/run. A subsequent run holding the rule lock marks abandoned running records interrupted.
- Preview and history requests are cancelled when superseded, preventing stale responses. Desktop and mobile layouts have been checked.
- Final approvals remain with existing authorized users. This feature does not approve appraisals, submit statutory filings, or make AI compliance decisions.

## Corrections found during verification

- Audit reminder query now uses the actual `audit_schedules.auditor_id` field.
- Managed date queries use the Indian operational date independently of database timezone.
- PostgreSQL update/delete results are read consistently through result-returning queries; saved settings and execution history are verified against a real database.
- The quick frontend test command excludes the two browser-only shared pages, while retaining the existing pure component tests.

## Validation

- Backend build passed; 187 test suites passed, 1,179 tests passed, one environment-dependent test skipped.
- Frontend production build passed; 48 browser suites / 264 tests passed; quick suite 9 files / 58 tests passed.
- Changed backend files and new frontend page lint passed. Existing Sass deprecation warnings remain.
- Disposable PostgreSQL fixture passed: migration replay, previews, company/branch exclusions, null-branch records, wrong-company rejection, stale configuration rejection, actual scoped delivery, repeated request identity, global pause, inherited settings, concurrent-run/settings exclusion, failed/partial/interrupted results, retries, daily scheduling, actor attribution and scoped audit reminders.
- Existing duplicate-delivery, expiry/renewal deduplication, concurrent task creation and My Work reconciliation fixtures passed.
- Module registration check passed: no orphan services/controllers.
- Screenshots: `docs/reviews/2026-09-12/automation-control-desktop.png` and `automation-control-mobile.png`.

## Deployment and remaining scope

Apply `backend/migrations/20260912b_automation_control_center.sql` after `20260912_automation_delivery_dedup.sql`, before starting the new backend. Both are registered in the service-entitlements deployment migration list. Deploy backend and frontend together and retire old backend instances: old versions do not consult these controls. The new scheduler replaces the old scheduled invocations of these four flows.

No production migration, deployment or remote push was performed. Validation used isolated local schemas and synthetic records, not production data.

Monthly filing generation, monthly compliance cycles, applicability recalculation and audit schedule generation retain their existing scheduling. Custom recipient rules, configurable eligibility windows, weekly/monthly frequencies, a general workflow designer and additional AI automation remain future work.

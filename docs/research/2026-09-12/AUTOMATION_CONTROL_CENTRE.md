# Automation Control Centre — expanded release, 12 September 2026

## Implemented scope

Admin → Automation (`/admin/automation`) now manages nine flows:

| Flow | Result |
| --- | --- |
| Expiry renewals | Registration renewal filings/tasks and contractor document reminders |
| Task reminders | Due-task notices, overdue escalations and audit reminders |
| Overdue filings | CRM alerts and configurable priority escalation |
| Audit corrections | Reminders for unresolved non-compliances |
| Periodic filings | Current-period filings and branch tasks from return-master rules |
| Monthly compliance cycles | Monthly items/tasks from the branch’s actual applicable compliance list |
| Audit scheduling | Schedules from active frequency rules and current auditor assignments |
| Applicability checks | The existing unit/package evaluator, preserving manual overrides |
| AI gap review | Stored explanations and suggested next actions for up to 20 open activities, with a full open count |

The Client/Branch compliance assistant continues to provide its existing scoped on-demand guidance. Scheduled AI gap review adds administrator history and optional summaries. AI output never approves, closes or submits records. If the provider is unavailable or returns invalid output, the system stores factual rule-based guidance. The page reports provider readiness. AI review starts paused so an administrator can choose its scope and frequency before enabling provider usage.

## Configuration and operating rules

- Daily, weekly and monthly schedules use Indian calendar dates. Month-end schedules clamp to the last real day. Catch-up occurs only within the current daily/weekly/monthly period.
- Company/branch overrides are excluded from parent runs, including paused overrides. Default pause stops a rule globally; company pause stops its branches. A scoped override can be removed to restore inheritance.
- Registration/document look-ahead, task/audit reminder windows and overdue escalation thresholds are configurable within validated bounds. Applicability allows selection of an active compliance package; the default is `DEFAULT_INDIA`.
- Up to ten active administrators may receive additional execution summaries. Default task-owner/CRM/auditor routing continues; this does not assign work or grant access to arbitrary recipients.
- Read-only previews use the same scoped eligibility queries, including proposed window changes. Counts are eligible work, not a promise of new records. Underlying records can change before execution.
- Manual execution requires a saved scope and current configuration digest. Version checks reject stale saves. Settings changes conflict with active execution.
- Database locks serialize each rule across application replicas. Request identities deduplicate submitted runs. Existing activity identities and notification receipts protect retries.
- Failed, partial and interrupted runs can be retried on the same Indian date with unchanged configuration. Older/changed configurations require a fresh preview/run.
- History stores scope, settings, actor, status and results. Setting history retains before/after values. Superseded preview/history requests are cancelled in the UI.

## Correctness and duplication fixes

- Monthly generation uses actual branch and applicability fields; the previous query mixed incompatible catalogs.
- Filing/task and cycle/item/task creation commit atomically. Concurrent generators create one occurrence; failures roll back records that would otherwise be orphaned. Closed cycles and terminal task history are preserved.
- Audit scheduling uses actual assignment columns and typed UUID comparisons. It locks occurrence creation and prevents a retry from advancing the same frequency rule again on the same day.
- Applicability uses the existing unit/package evaluator instead of writing computed results into an audit-trail table with nonexistent fields.
- Managed legacy global triggers use centre controls and administrator authority. CRM filing automation buttons identify administrator ownership. Legacy unscoped automation task readers are administrator-only; normal users retain the scoped My Work APIs.
- The old cron decorators for all eight operational flows have been removed. The centre owns their scheduling; other unrelated application jobs remain separate.

## Validation

- Backend and frontend production builds pass.
- Backend regression suite: 189 suites / 1,193 tests passed. The normally skipped database boot check passed separately. Frontend: 48 browser suites / 266 tests passed. Calendar, AI fallback, validation and database regressions are included.
- Real PostgreSQL fixture tests migration replay, null/branch/company scopes, pauses/inheritance, configuration conflicts, scoped delivery, run locking, failure/partial/interruption history, safe retries, summary recipients and schedules.
- Expanded database cases cover concurrent monthly generators, task-failure rollback, closed cycles, manual applicability overrides, actual audit assignment schema, repeated audit scheduling and AI fallback.
- Existing duplicate-delivery, expiry/renewal deduplication and My Work reconciliation fixtures pass.
- These database regressions are now included in GitHub CI using its disposable PostgreSQL service. The scripts connect only to loopback and never load production credentials.
- Module registration: 63 modules, 257 providers, 239 controllers; no orphan services/controllers.
- Desktop/mobile screenshots are in `docs/reviews/2026-09-12/automation-control-*.png`.

## Release requirements

Apply migrations in registered order: `20260912_automation_delivery_dedup.sql`, `20260912b_automation_control_center.sql`, then `20260912c_automation_expansion.sql`. Deploy matching backend/frontend versions and stop old backend revisions so their legacy jobs cannot continue independently.

GitHub main requires backend, frontend, payroll-transition-smoke and docker checks plus one approving review. Production deployment additionally requires successful CI and Security Scans for the exact main commit. Do not bypass those gates. Deployment and live verification are pending until the reviewed release merges; local fixture results do not establish production health.

After deployment, verify health and migration completion, role restrictions, all-assigned-branch totals, saved schedules, a scoped read-only preview, run-history access, provider readiness and the next scheduled execution. Use existing configured AI credentials; never write credentials to reports or source control.

### Branch document expiry restoration

The expiry flow also scans branch_documents within the configured document window, includes them in previews, and creates BRANCH_DOC_EXPIRY work in the shared branch queue. Existing tasks (including completed occurrences) are retained; a changed expiry date permits a new occurrence. Alerts go only to active users mapped to that branch and company. Concurrent scans reuse tasks and delivery receipts.

Apply the registered 20260912d_branch_document_expiry.sql migration before deploying this backend. It adds the nullable expiry_date field and index without replacing existing dates. Documents without an expiry date are excluded.

Validation: backend build, 39 focused tests, changed-file lint, and both PostgreSQL automation/control and delivery-deduplication fixtures passed. Branch fixtures cover scoped previews, exclusions, concurrency, recipient isolation, terminal reuse and changed expiry dates.

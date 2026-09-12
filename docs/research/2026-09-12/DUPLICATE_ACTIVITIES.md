# Duplicate activity review — 12 September 2026

## Confirmed defect fixed locally

TaskEngineService.createTask previously inserted unconditionally. A retry or two concurrent producers for the same source and assignment could produce multiple active system_tasks records. Existing producer-side existence checks were not atomic.

Task creation now locks the source/assignment identity within a READ COMMITTED transaction, checks for an active task and returns it before inserting. The identity includes module, reference type and ID, company, branch, contractor, role and assigned user. Wording or due-date changes do not create a second active task or reset progress. Separate assignments stay separate. CLOSED and CANCELLED history is preserved; a subsequent activity can create a new task. This does not perform source approval or reopen the old record.

All source-level system_tasks INSERT statements found in backend/src currently use this engine. External writers that bypass it would not participate in the lock. Existing duplicate records are not removed or hidden.

## Additional findings

1. DueRemindersJob and AutomationNotificationService create new reminder tickets on each run. Daily reminders are intentional, but retrying the same run or running multiple application instances can repeat tickets within the same day. These callers do not supply a stable event key. This remains a separate notification-delivery issue; the task-creation fix does not suppress those tickets.
2. ExpiryRemindersJob and the manually invoked ExpiryEngineService contain overlapping contractor document expiry logic with different reference types (CONTRACTOR_DOC_EXPIRY and LICENSE_EXPIRY). The manual engine also references contractor_id/deleted_at fields that do not match the current contractor document entity. Treat this as an inconsistent legacy path, not evidence that both paths currently succeed in production.
3. Registration expiry tasks and renewal filing tasks can represent stages of the same renewal with different source records. These require linking to a single renewal workflow rather than automatically deleting similarly titled tasks.
4. My Work joins company and branch by primary key, so its joins do not multiply task rows. It displays actual task IDs. Different role assignments and closed history are intentional separate records.

## Verification and limits

Real PostgreSQL verification passed: 20 simultaneous identical creations produced one task ID; retries preserved IN_PROGRESS; different branches, roles and recipients remained separate; closed/cancelled history remained intact; active My Work counts matched the resulting list. The existing 5,000-task reconciliation fixture also passed.

Backend build and changed-file lint passed. The full backend regression suite passed: 186 suites, 1,161 tests; one environment-dependent test/suite skipped.

The live production database was not queried. No production duplicates were deleted. The read-only script backend/scripts/check-duplicate-activities.sql identifies exact active task duplicates and candidate repeated reminder tickets for a later data review. Repeated reminders and cross-workflow consolidation remain open findings. This is an operational-task review, not certification of every business activity in the project.
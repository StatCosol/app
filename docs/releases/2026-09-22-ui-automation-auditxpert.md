# UI, automation and AuditXpert update

Base: main at `280ab23830e5cd83493ab0a749bef27cebc1beba` (retains separately merged contractor updates #680, #681 and #682).

## Changes

- Recurring billing uses a deterministic invoice ID per configuration and due period. A failed approval or negative mail result does not advance the schedule. Retrying reuses the invoice; an already recorded successful delivery is not sent again. Month-end frequency changes clamp to valid calendar dates.
- Reminder links target existing payroll and contractor task screens, carry the requested month, and survive normal portal login. Client payroll reads the linked period. Preview-template defaults use the corrected routes.
- Monthly reminder dates and enablement can be configured per client by administrators. Defaults remain payroll day 1/deadline 7 and contractor day 16/deadline 25. Checks use Indian calendar dates and distributed locks. Changing settings does not backfill earlier requests. Manual sends respect disabled policies. Settings use optimistic versions to reject stale edits.
- Automation Control Centre inventories registered cron handlers, declared schedules, time zones and disabled flags. This is a schedule inventory, not execution-health telemetry. Existing independent engines retain their controls and schedules, except the communication policy checks described above.
- AI gap review prioritizes critical/high-priority work and displays reviewed/total counts and remaining work. The existing maximum of 20 reviewed tasks remains explicit; AI suggestions require human review.
- Monthly Close is labelled Monthly Review because it reports readiness without closing or locking payroll.
- Branch upload badges include all assigned branches and use the actual upload menu route. CRM and AuditXpert menus support search without removing role permissions or destinations.
- My Work links audit findings to the assigned audit and CRM return/renewal tasks to the exact filing. Other source types retain their work-area fallback; this update does not invent a link between unrelated task IDs and source records.
- AuditXpert observations now use the same auditor assignment rule for unfiltered lists, individual records and exports. Another auditor's explicitly assigned audit is excluded even when the client is shared. Legacy unassigned audits require client assignment.
- Audit observation creation and action bodies have runtime validation. Generic updates cannot close or reopen observations. Verification requires RESOLVED status and a reason; reopening requires a reason. Closed observations must be reopened before editing.
- AuditXpert corrections are ordered by risk, with verification shortcuts and next-finding navigation. Audit changes cancel stale list requests and clear old selections. Evidence uses authenticated downloads. Client contact and policy screens also reject stale client responses.

## Data and workflow preservation

The only migration creates an empty `client_communication_policies` configuration table. It does not update existing clients, employees, attendance, nominations, payroll or invoice history. No historical nominee repair, invoice cleanup, draft conversion or production test seeding is included.

Employee registration, attendance capture, FaceDesk and contractor enrollment implementations are unchanged. Payroll final approval and contractor payroll approval/verification authority remain unchanged.

Default request-email dates are operational reminders, not statutory or payroll deadlines. Existing custom email templates with literal URLs are not rewritten. Recurring invoice recovery protects runs created with this version; historical duplicate invoices need separate reconciliation. SMTP acceptance followed by a process/database failure still cannot guarantee exactly-once email delivery without provider-level idempotency.

## Verification

- Local backend: 241 passing suites, 1,831 passing tests; database boot test intentionally skips without a configured database.
- Local backend and frontend production builds and lint checks pass; 92 frontend logic tests pass.
- Synthetic PostgreSQL-compatible database checks pass for repeat-safe additive migration, unchanged employee fixtures, policy isolation/version conflicts, assigned audit links and foreign/corrupted reference denial. The same check is registered in CI against PostgreSQL.
- Route inventory: 377 routes, 73 central menu entries, no broken central menu destinations or template parse errors.
- Added browser tests cover AuditXpert stale responses and verification gates, client-policy switching/versioned saves and source-record task links. Local browser launch is unavailable because the Chromium download failed; CI's actual browser result is a required release gate.

## Remaining scope

This is an incremental improvement, not completion of every future recommendation in the full module roadmap. Complete source-link coverage, consolidated screens for every module and unified execution telemetry for independent scheduled jobs remain follow-up work. The separately reported external security review F04 and historical GitHub App key rotation require their own verified closure; this patch does not claim to resolve them.

Publishing to production requires the repository's CI/security checks and independent maintainer review. Do not bypass branch protection. After merge, verify the exact main commit's Azure rollout and readiness before calling this deployed.

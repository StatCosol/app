# Deeper business-flow verification — 14 September 2026

This pass adds 31 real PostgreSQL scenarios across client contacts, nominations, effective-dated masters, SLA tasks and registration calendars, plus 13 AI risk assessment scenarios. These are business assertions, not construction checks. Employee lookup in the nomination harness uses a minimal SQL adapter; nomination headers/members and the other tested entities use real TypeORM repositories. The nomination controller mapping is exercised directly; this is not a full JWT/HTTP acceptance test.

## Defects exposed and corrected

- An explicitly empty client-contact scope returned contacts from every client. It now returns no contacts.
- Contact creation compared an untrimmed address for duplicates but stored a trimmed value. Normalization now happens before the duplicate lookup. This does not add a database uniqueness constraint or certify concurrent contact creation.
- Nomination controller mapping discarded all but the first branch, and an empty branch-user scope became company-wide. The complete assigned set is retained, and missing company/empty branch scope is denied.
- Negative/non-numeric nominee shares could be accepted or reach PostgreSQL as errors. Values now require finite 0–100 percentages with at most two decimals; combined shares cannot exceed 100. Missing shares retain the existing zero default; this pass does not impose a legal rule requiring exactly 100 for every nomination type.
- Replacing nominees could delete existing members and modify the header before a later write failed. Header/member replacement now runs in one transaction. A forced constraint failure verifies rollback. An advisory transaction lock serializes concurrent first saves; a delayed-insert test stresses this path.
- Saved nomination headers omitted employee client/branch identity. These fields now persist with the record. Submitted/approved records are protected from edits; correcting a rejected record returns it to draft and clears old review metadata.
- AI risk responses could supply out-of-range, fractional, non-numeric or malformed scores/data and corrupt an assessment or trigger downstream failures. Invalid responses now use the deterministic fallback; valid responses retain model attribution. No real AI provider was contacted.

## Validation

- 31 PostgreSQL business scenarios passed. Every run creates and drops a unique local schema.
- 13 AI scenarios passed; the initial baseline failed eight malformed-response cases.
- Full backend regression suite: 1,517 passed; database-only boot is excluded from this ordinary unit run.
- Backend production build and full lint passed. No frontend application code changed.
- Added the deeper PostgreSQL workflow script to the existing CI database step. The earlier monthly-close/reconciliation and portal smoke additions remain in PR 660.

## Scope and remaining work

Six of the previously weak module areas now have these deeper tests: client-contacts, nominations, masters, SLA, calendar and AI. They are not exhaustively covered. The other 22 areas from the prior report still need equivalent direct business-flow coverage: admin, assignments, audit-logs, auditor, audits, branch-compliance, cco, ceo, checklists, cleanup, compliance-documents, crm, email, escalations, helpdesk, monthly-documents, news, notices, notifications, options, reports and users. Existing cross-module integration tests cover parts of some of these areas.

No production writes, real emails, payments, filings, external AI calls or device actions occurred. Physical device behavior, hosted multi-role login/CRUD, full nomination submission/approval concurrency through ESS, and broader workflow acceptance remain unverified. No statutory applicability or legal advice is established by fictional test values.

## PostgreSQL cases

| Scenario | Result |
| --- | --- |
| contact: empty allowed-client set returns no records | PASS |
| contact: assigned-client filter excludes other company | PASS |
| contact: trimmed/case-insensitive duplicate is rejected | PASS |
| contact: deactivate, omit from active emails, then reactivate | PASS |
| threshold: TS 2026-05-31 | PASS |
| threshold: TS 2026-06-30 | PASS |
| threshold: TS 2026-07-01 | PASS |
| threshold: AP 2026-09-01 | PASS |
| threshold: missing configuration fails explicitly | PASS |
| nomination: second assigned branch is readable | PASS |
| nomination: branch user with no assignments is denied | PASS |
| nomination: foreign branch is denied | PASS |
| nomination: foreign company is denied | PASS |
| nomination: missing company context is rejected | PASS |
| nomination: invalid share -1 fails before writes | PASS |
| nomination: invalid share 101 fails before writes | PASS |
| nomination: invalid share NaN fails before writes | PASS |
| nomination: invalid share Infinity fails before writes | PASS |
| nomination: invalid share abc fails before writes | PASS |
| nomination: two shares totaling 100 succeed; excess cents fail | PASS |
| nomination: failed replacement retains header and existing nominees | PASS |
| nomination: concurrent first saves produce one complete record | PASS |
| nomination: saved record retains employee company and branch | PASS |
| nomination: SUBMITTED snapshot cannot be overwritten | PASS |
| nomination: APPROVED snapshot cannot be overwritten | PASS |
| nomination: correcting rejection clears prior review fields and creates draft | PASS |
| SLA: overdue classification, close and reopen | PASS |
| SLA: branch user cannot change deadline | PASS |
| SLA: invalid date rejected without mutation | PASS |
| calendar: includes both branch/date boundaries, sorts and excludes deleted/foreign | PASS |
| calendar: denied explicit branch returns no records | PASS |

Local evidence: `tmp-art/deeper-business-before.log`, `tmp-art/deeper-business-after.log`, `tmp-art/deeper-ai-before.log`, `tmp-art/deeper-unit.log`, `tmp-art/deeper-all-backend-final.json`, `tmp-art/deeper-build-final.log`, `tmp-art/deeper-lint-final.log`.

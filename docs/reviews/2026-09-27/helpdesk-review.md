# Helpdesk permissions and workflow review

Scope: a focused continuation from main after PR #695. No kiosk, APK, face-capture or attendance implementation changes. No production database access, data migration or deployment.

## Confirmed issues and fixes

- A CLIENT login without a client ID could fall through the generic ticket-list method to its unrestricted ADMIN query. The method now rejects missing identity, unsupported roles and missing client context before querying. Existing live branch-membership predicates remain intact.
- General tickets could be assigned through the API to external users or internal roles without Helpdesk access. Assignment now requires an active, undeleted PF_TEAM user for PF/ESI/PAYSLIP, or ADMIN/currently assigned CRM for other categories. Explicit null is required to unassign; an omitted property is rejected.
- Status changes and administrator assignment used full-entity saves after independent reads. Racing requests could restore an old assignee or overwrite a later status. Both now update only their intended fields, conditional on the scope, category, status and assignee read during validation. A changed record returns HTTP 409.
- The older status helper now delegates to the same scoped transition method, eliminating its weaker alternate permission path.
- PF Team controls no longer offer administrator/client closure, resolving directly from OPEN, or messaging/status changes before assignment. Failed actions display an error and retain the draft message.
- Administrator choices exclude unsupported roles and inactive users, and are filtered by ticket category. The API remains authoritative for current CRM client assignment; CRM membership is not exposed by the existing user-directory response, so an out-of-scope CRM selection is rejected visibly by the server.
- The administrator screen prevents overlapping status/assignment requests, displays errors, updates the assignee name after assignment and clears it when unassigned. Assignment controls wrap on narrow screens.

## Verification

- Backend production build and frontend production build passed.
- Full backend suite: 251 suites, 2,025 tests passed; one environment-dependent test skipped.
- All 18 Helpdesk browser tests passed, covering role/category choices, action denials, unsent messages, stale-write errors, overlapping requests, and Admin/PF Team controls at 390px and 1440px. Screenshots were visually inspected.
- Backend changed-file lint, frontend lint and deep module checks passed.
- `node scripts/verify-helpdesk-db.cjs` passed with synthetic fixtures in a disposable loopback PostgreSQL database. It verifies actual client/branch list isolation, assignee eligibility and synchronized competing database writes. The test database is removed afterward.
- CI now runs the Helpdesk database check using its PostgreSQL service; a release-check regression verifies this step cannot silently allow failures. All 12 release/module-check regressions passed locally.

## Remaining review boundaries

- This is not a claim that every application module has been reviewed end to end. Other remaining modules need separate focused PRs.
- No live client tickets were edited and no production permission records were inspected.
- Existing Helpdesk attachment presentation, message-loading error states and list pagination remain follow-up review areas, outside this assignment/status patch.
- CRM assignment changes themselves are outside this patch. The ticket compare-and-update protects ticket-row changes, not a transaction spanning edits to the separate CRM assignment tables.
- Existing Sass deprecation warnings remain; the frontend build succeeds.

# Portal option coverage and ownership regression tests — 14 September 2026

**Status: broader verified coverage; not a complete option-by-option business acceptance sign-off.**

The run uses a built Angular frontend with synthetic responses and a disposable local PostgreSQL schema with fictional records. No live mail, external AI, payment, production-data or physical-device operations were performed. ESS Android remains excluded. ESS web routes were checked.

## Verified results

| Check | Result | What it proves |
|---|---:|---|
| Central menu destinations | 73 / 73 | Each configured menu URL has a declared route; this is not a click test of every navigation control. |
| Component templates parsed | 390 / 390 | Angular template parsing; not transaction behavior. |
| Pages under API failure | 295 / 295 | Page rendering without uncaught errors, after supplying assignment/branch permissions where required. |
| Logged-out page access | 295 / 295 | Protected page requests redirect to login. |
| Wrong-role page access | 295 / 295 | An unrelated role cannot remain on the requested page. |
| Declared endpoint role policies | 30,198 / 30,198 | Real RolesGuard, actual controller metadata, 1,438 endpoints, 21 identities including virtual/legacy roles, unknown role and anonymous. |
| Notice/checklist database scenarios | 29 / 29 | Actual queries and writes, owner restrictions, branch-set filtering, summaries, closure logging, document metadata and protected update fields. Assignment resolution is a fictional adapter; JWT and actual file upload bytes are not exercised by this script. |
| Contact/communication option tests | 31 / 31 | CCO contact ownership, source/destination ownership on edits and admin-only global communication actions. Mail is not sent. |
| Full backend tests | 1,548 passed | Existing and new backend regressions; one DB-only test is skipped in this run and separately passes against local PostgreSQL. |
| Previous deeper database regressions | 31 / 31 | Nomination, contact, threshold, SLA and calendar behavior remains intact. |
| Backend build, lint and dependency graph | Passed | Compilation, lint and provider/module wiring. |

The initial outage sweep had 266 direct passes and 29 redirects. Rechecks used correct assigned-client fixtures, enabled branch-payroll permission, and a branch user for the branch-only MCD upload screen. Two empty child paths only needed trailing-slash normalization. All 29 rechecks passed. Successful transaction results were not inferred from these page-load results.

## Portal reachability and access coverage

| Portal | Page paths tested in each access mode |
|---|---:|
| accounts | 12 |
| admin | 37 |
| auditor | 14 |
| branch | 45 |
| cco | 16 |
| ceo | 18 |
| client | 60 |
| contractor | 13 |
| crm | 40 |
| ess | 12 |
| payroll | 19 |
| pf-team | 3 |
| sales | 6 |

## Fixed findings

1. CCO client-contact list/create/update/delete now enforce managed-client ownership. An update checks both the existing contact company and a requested destination company. Global email triggers and template changes now enforce their documented ADMIN-only policy.
2. Notices now use the operational ownership service for list, detail, create, update, document attachment and KPI queries. CRM lists no longer span unassigned companies. Branch users retain all assigned branches and cannot see siblings or company-wide notices through a branch scope. Empty assignments return no records.
3. Checklists now check client/branch scope on reads and summaries and check the existing record before updates. Extra JSON fields cannot change its company, branch or compliance identity.

## Inventory and what remains unverified

The source inventory contains 373 route declarations and 9,347 option declarations: 3,945 event bindings, 3,703 native control declarations, 1,485 model bindings, 156 router links, 41 href links and 17 form-control bindings. These categories overlap. They must not be reported as 9,347 distinct features or as passing tests. Runtime-generated options and shared components also need scenario mapping.

The generated inventory keeps individual action declarations UNVERIFIED until a scenario is explicitly mapped to them. This run did not click every action, fill every form, vary every filter combination, test every file format, exercise every approval state or validate every download payload. The new role matrix tests enforcement of declared roles, not whether the declared policy itself is sufficient. It separately lists 35 public endpoints and 34 authenticated endpoints without a declared role restriction; those are not counted as ownership/business-flow passes.

Twenty areas still need comparable deep option/business-flow coverage beyond existing smoke and cross-module tests: admin, assignments, audit logs, auditor, audits, branch compliance, CCO, CEO, cleanup, compliance documents, CRM, email, escalations, helpdesk, monthly documents, news, notifications, options, reports and users. Other modules with substantial tests still need their individual UI options mapped to verified success, rejection and recovery scenarios.

Actual message delivery, real AI-provider behavior, device capture, installation/update behavior and live-service integration remain unverified. The existing register demo proves specific fictional TS/AP/MH samples; it does not establish every statutory format or every state/Act combination.

## Repeatable checks

- `node frontend/puppeteer-tests/option-inventory.cjs` generates the source ledger and checks central menu destinations.
- `node frontend/puppeteer-tests/portal-error-options.cjs` runs the initial API-failure page sweep against the existing production build.
- Set `OPTION_AUDIT_MODE=guard-fixtures`, `anonymous` or `wrong-role` for the additional browser scenarios. `guard-fixtures` rechecks redirects from the initial run. All external requests are blocked.
- Build the backend, then run `node backend/scripts/validate-endpoint-role-options.cjs`.
- Run `node backend/scripts/validate-notice-checklist-options.cjs` with the isolated local database. `AUTOMATION_TEST_PORT`, `AUTOMATION_TEST_USER`, `AUTOMATION_TEST_PASSWORD` and `AUTOMATION_TEST_DATABASE` configure it; host is fixed to 127.0.0.1 and the script cleans its disposable schema.
- CI now includes menu/template inventory, the endpoint role matrix and the notice/checklist PostgreSQL scenarios. The page sweeps remain a local browser QA script, not a hosted end-to-end environment.

## Evidence

Local raw evidence is under `tmp-art/option-audit/` (ignored runtime artifacts): `inventory.json`, `page-error-results.json`, `guard-fixtures-results.json`, `anonymous-results.json`, `wrong-role-results.json`, `endpoint-role-results.json`, `notice-checklist-final.log`, `contact-tests.log`, `backend-tests.json`, `backend-build-final.log`, `backend-lint-final.log`, `module-graph.log`, `database-boot.log` and `deeper-regression.log`. The inventory and role scripts regenerate these files; rerunning can overwrite them.

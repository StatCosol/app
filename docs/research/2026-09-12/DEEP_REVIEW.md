# Second deep review: shared lists, ownership and sensitive data

Date: 12 September 2026. Reviewed baseline: `b6bcf6e5`. Scope: repeat source searches, all callers of the shared query-scope helper, contractor document ownership, user-property selection, audit period filters, branch filters, and the previously reported appraisal/dashboard regressions. Changes remain local and have not been deployed.

## Findings fixed

| Priority | Finding and reproducible trigger | Correction | Evidence |
| --- | --- | --- | --- |
| P1 | An authenticated branch user with no branch assignments could receive company-wide rows through `AccessScopeService.applyToQb`: the branch predicate was added only for nonempty arrays. This helper has 13 call sites across tasks/MCD, returns/KPIs, documents, threads/helpdesk, employees, audits, escalations and contractor payroll computation lists. | Empty or missing branch assignments produce an always-false predicate. Missing company scope in company/branch modes also fails closed. Valid multi-branch arrays remain intact. | New query-scope unit matrix and actual PostgreSQL document-list fixtures. |
| P1 | `GET /api/v1/contractor/documents` applied tenant scope but not `contractorUserId`. Two contractors belonging to the same company could receive each other's document records. | Derive contractor ownership from authenticated identity and add the ownership predicate independently of company/branch filters; reject an absent identity. | Two contractor fixtures in one company, including documents in two branches: own contractor returns two own rows; company branch view returns three allowed rows; empty assignment returns zero. |
| P1 | `UserEntity.passwordHash` was selected by default. Contractor documents and notification threads join user entities and return entity-shaped responses; audit listings also join contractor users. These normal reads could include the stored hash. | Mark the password column `select:false`. Password verification explicitly opts in. Ordinary email lookup stays hidden by default. Existing primary/ESS login queries already explicitly select the hash. | PostgreSQL ordinary user lookup and joined document results omit the hash; explicit auth selection, successful login, incorrect current-password rejection and password change followed by login all pass. |
| P2 | Audit month filtering used `%MM%` against `periodCode`. For February 2026, `%02%` also matches the `2026` prefix, returning unrelated months. It also failed to intentionally include applicable quarterly, half-yearly and annual periods. | Match exact supported period codes, using the same period coverage as the dashboard. Reject impossible month numbers in the shared query DTO. | PostgreSQL February fixture returns `2026-02`, `2026-Q1`, `2026-H1`, `2026`; excludes January and December. DTO tests reject 00/13/99. |
| P2 | Thread, helpdesk and escalation list methods accepted `branchId` but did not apply it. A selected branch could show records from another permitted branch. | Apply the selected branch in addition to the existing scope predicates and participant restrictions. | Regression tests assert the branch predicate in all three list methods. |

## Fresh searches and cross-checks

- Rechecked all `applyToQb` call sites, branch-array length checks, contractor document list callers, passwordHash reads and writes, user relation joins, and list period filters.
- Checked installed TypeORM **0.3.31**, rather than assuming the latest website defaults apply. This change does not globally alter null/undefined handling or upgrade dependencies.
- [TypeORM hidden-column documentation](https://typeorm.io/docs/query-builder/select-query-builder/) supports excluding sensitive fields from ordinary reads and explicitly selecting them where needed. `select:false` is a read boundary, not a response sanitizer for newly created in-memory objects or arbitrary raw SQL. Existing account-creation responses still require explicit DTOs.
- [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) supports deny-by-default checks on every request. The new empty-scope behavior follows that rule.
- [OWASP property-level authorization guidance](https://api-security.owasp.org/editions/2023/en/0xa3-broken-object-property-level-authorization/) supports returning only appropriate fields. This review removed default password-hash selection; it does not claim every endpoint has a complete response allowlist.

## Earlier review findings rechecked

| Earlier issue | Current evidence |
| --- | --- |
| Branch user reverses CLIENT_APPROVED appraisal | `employee-appraisals.service.ts` checks actor level before this transition; controller derives it from identity. Existing appraisal regression tests passed in the full suite. |
| Only first assigned appraisal branch included | Scope resolution preserves the complete array for multiple assignments; single assignment may select that branch. Existing regressions passed. |
| LegitX audits query nonexistent period_month | Dashboard filters actual `period_year` and `period_code`. The remaining separate list substring defect is fixed in this review. |
| Payroll run chosen before branch scope | Dashboard uses scoped_runs and aggregates applicable rows instead of one arbitrary unscoped run. Existing dashboard regressions passed. |
| Task center omits other assigned branches | Task controller preserves all assigned branches, and empty arrays remain restrictive. Existing tests passed. |
| Stale task responses after branch/month change | Branch dashboard owns task requests in the same forkJoin subscription and cancels it on reload. Browser regression passed. |
| Contractor payroll approval/version protections | Existing real-database regression passed again: migration, transaction preservation, visibility, CRM approval, independent verification, reopening, immutable snapshots and concurrent transitions. |

## Validation

- Backend build passed.
- Full backend suite: **1,152 passed**, one environment-dependent test skipped; 185 suites passed.
- Browser follow-up tests: **6 passed in two files**, covering branch/month cancellation and client/branch AI behavior. Existing Sass/Vitest configuration warnings were emitted; no browser test failed.
- Affected lint passed. Module checker: 63 modules, 255 providers, 238 unique controller names; no orphan services/controllers or missing feature modules.
- `backend/scripts/validate-deep-list-review.cjs` passed on disposable local PostgreSQL using actual entity columns and synthetic data. Tests create/remove a unique schema and do not read production credentials. The isolated tables do not recreate the full production foreign-key graph.
- Existing contractor-payroll PostgreSQL regression passed again.
- No migration or provider configuration change is needed for these fixes. No production accounts, passwords or records were accessed to reproduce the findings. This does not establish whether any production exposure occurred.

## Remaining coverage

The broader roadmap in [PROJECT_RESEARCH.md](PROJECT_RESEARCH.md) remains open: canonical attendance/evidence versions, complete statutory report packs, full approval-event history, assignee eligibility, risk calibration and HTTP-level role/ownership coverage across every endpoint. This second pass fixes the five confirmed categories above; it is not a claim that every module is gap-free.

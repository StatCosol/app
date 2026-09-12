# All-module gap fixes — 12 September 2026

All eight findings from the all-module review have code corrections. The earlier Contractor corrections remain included. Nothing has been deployed or applied to production data.

| Finding | Change |
| --- | --- |
| G1 — Appraisal ownership | Added a registered appraisal guard on employee, cycle, template, scale and report controllers. ID lookups enforce company ownership and branch assignments; missing company/branch scope fails closed. Branch list/dashboard queries use the authenticated branch, and cycle lists/counts honor branch scope. Referenced templates, scales and scope branches are checked. Company-level approval/setup/report operations are blocked for branch users. Manager/branch item updates are tied to the appraisal ID and reject foreign items. |
| G2 — Sales ownership | SALES list queries always use the authenticated owner, even when another owner is requested. ADMIN/CEO filtering remains supported. |
| G3 — Branch review role | Appraisal controllers use the existing BRANCH_DESK virtual role, which the normal CLIENT/BRANCH identity receives. Ownership checks remain in place before review actions. |
| G4 — Review transitions | Review, send-back, approval and lock actions validate their permitted source states and reject locked records. Each transition, item update and audit write runs in one transaction with a pessimistic parent-row lock. |
| G5 — Receipt numbering | Uses a numeric suffix maximum, BigInt increment and a transaction-held financial-year advisory lock across invoices. Handles 9999 → 10000 → 10001 without a schema change. |
| G6 — Payroll navigation | Recent-run links include the owning client. The run workspace selects the requested run ID instead of the first row. Legacy links without a matching client no longer choose the first assigned client automatically. |
| G7 — Sales totals | Added an owner-scoped server aggregate endpoint across all open leads. Dashboard stage/value/count totals use it instead of a 500-row list. Summary and follow-up loading complete together. |
| G8 — Unavailable data | CEO, CCO, CRM, BranchDesk and Contractor dashboards show an explicit unavailable state and Retry when an input fails. Invalid fallback aggregates are hidden; main aggregation callbacks do not run with failed inputs. This intentionally withholds the dashboard until required inputs can be loaded. ESS leave and payment receipts distinguish load failure from successfully empty data and offer Retry. |

## Verification

- Full backend: **1,051 tests passed across 177 suites**. The separately executed database boot test also passed against disposable PostgreSQL, validating all entity metadata and connectivity.
- Full Angular browser suite: **242 tests passed across 43 files**.
- Backend and frontend production builds passed; frontend has existing Sass deprecation warnings.
- Backend and frontend lint passed.
- Module wiring: **63 modules, 251 providers, 236 controllers; no orphan registrations, disconnected modules or missing delegate targets**.
- New regressions cover cross-company/branch denials, valid branch-review access, foreign review items, invalid/locked transitions, transaction locking, Sales owner enforcement, grouped totals above 500, receipt rollover, wrong-client payroll links, requested-run selection and failure/retry states.

Additional real PostgreSQL verification passed: two concurrent receipt transactions allocated unique suffixes 10001 and 10002 after existing 9999 and 10000 receipts; appraisal ownership allowed the assigned branch and denied another company or branch. The repeatable check is backend/scripts/validate-module-gap-db.cjs; it uses the dedicated disposable loopback test cluster and cleans up its generated schema.

## Limits

Verification includes local regression tests, browser component tests, production builds and the database checks above. A staging HTTP acceptance session and production deployment have not been performed. Release requires the protected branch checks and an independent approving review. No production data or schema changes are required by these fixes.
## Appraisal review follow-up

- Branch users cannot send back CLIENT_APPROVED appraisals. Authority comes from the authenticated user and is checked after the transaction acquires the appraisal lock. Company users retain this action, with the correct CLIENT audit approval level.
- Unfiltered multi-branch users receive every assigned branch in employee lists, dashboard aggregates and cycle visibility/counts. Explicit branch filters remain validated; single-branch assignments retain automatic selection.
- The dashboard branch summary now retains the same authorized scope as its other aggregates.
- Focused appraisal verification: 24 tests passed, including transaction-level rejection, company approval reversal, actor audit levels and all dashboard query parameters. Backend type checking passed.
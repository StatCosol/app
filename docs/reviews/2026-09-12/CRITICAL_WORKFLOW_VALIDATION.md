# Critical workflow validation — 12 September 2026

This pass strengthened the existing application through executable business-rule checks, isolated PostgreSQL tests, and synthetic performance measurements. It does not establish that the product is market-leading or that every statutory rule, client policy, device, and workflow is correct.

## Reproduced defects and corrections

1. **Missing approval state appeared clear.** SQL comparisons such as `status <> 'APPROVED'` do not match NULL. Imported/legacy attendance, document, or filing rows with missing status could therefore escape the monthly review queue. The checks now use NULL-safe comparisons. A real PostgreSQL regression verifies that all three categories require review.
2. **Payroll reversion could overwrite a competing update.** Reversion saved the whole previously read run, unlike the other approval transitions. The regression reproduced overwriting a newer SUBMITTED state and an unrelated edited title. Reversion now updates only decision fields and requires the observed status still to match. Real TypeORM/PostgreSQL tests also verify these cases. This protects that transition; it is not a claim that all payroll edits use one transactional snapshot.
3. **An empty payroll run was marked PROCESSED.** Processing now refuses an empty run before saving a successful processing status.
4. **Attendance loading failure was treated like absent attendance.** Both full-run and selected-employee processing previously caught a failed attendance lookup and continued. They now stop before employee calculations are written and return an actionable error. Even runs with uploaded inputs must retry after attendance access is restored; this deliberately avoids silently choosing fallback data during an outage.

The failing-before evidence is preserved in `logic-approval-before.log`, `logic-engine-before.log`, and `logic-monthly-close-before.log`. Passing evidence is in the corresponding targeted, database, build, and lint logs.

## Executed checks

- Payroll submission blocks unresolved leave/OT differences and failed validation calls.
- Tenant access is checked before validation; self-approval and approval by a payroll operator are denied.
- Competing approve/reject requests yield one successful state transition in real PostgreSQL.
- Payroll reversion preserves unrelated concurrent edits and refuses a stale observed state.
- IST midnight/month rollover and leap-day boundaries match the current calendar-day attendance logic. This does not independently certify overnight-shift policy.
- Pending/rejected punches do not count as accepted attendance. Mobile records mirrored into biometric storage are not counted twice.
- Historical replay cutoffs exclude later punches; employee and contractor directions remain separate; other-tenant records are excluded.
- Monthly-close checks cover reporting periods, latest document versions, branch overrides, missing files, expiry, NULL approval states, and issue-list truncation.
- Payroll CSV reconciliation preserves exact amounts at 1,000 and 5,000 employees, and rejects 5,001 rows. Its existing 5,000-employee-per-comparison limit remains in place.

Database tests run only against the dedicated loopback test cluster on port 55439. Generated schemas and temporary tables are removed after each run. Some service collaborators (authorization lookup and leave/OT responses) are fixtures; the approval transitions and attendance queries themselves use real PostgreSQL. This is not a complete HTTP/authentication/inference deployment test.

## Performance scope

Scenarios use 1,000/5,000/20,000 employees across 10/50/100 branches, with 30,000/150,000/600,000 attendance rows and up to 30,000 contractor document versions. Monthly-close requests review one branch, with 10 and 25 concurrent calls and a database pool of 10 connections.

Connection pools and queries are warmed before measurement. Baseline indexing is a representative subset copied from existing migrations. The candidate stage applies the exact new SQL migration transactionally in the disposable schema. Authorization and entitlement lookups are stubbed, and HTTP, network, browser rendering, face inference, and full payroll-engine processing are excluded.

The machine, sample counts, p50/p95/max timings, and precise scope are recorded in [critical-performance.json](critical-performance.json). These local results are not production capacity or an SLA. The 20,000-employee source-data scenario does not change the CSV comparison's 5,000-row limit.

## Measured results

Backend production build and changed-file lint passed. The full backend suite passed 1,032 tests across 173 suites; one existing database boot test was skipped. The separate targeted PostgreSQL checks described above passed. The focused business-rule suite passed 28 tests.

The final service benchmark used 1,000 requests per measured configuration after warming the connection pool with 100 requests. Times below are milliseconds, for the isolated monthly-close service only.

| Employees / branches | Attendance rows | Baseline p95, 10 calls | Indexed p95, 10 calls | Indexed p95, 25 calls |
| --- | --- | --- | --- | --- |
| 1000 / 10 | 30000 | 10.95 | 8.98 | 22.46 |
| 5000 / 50 | 150000 | 11.86 | 9.34 | 22.21 |
| 20000 / 100 | 600000 | 35.03 | 23.56 | 56.89 |

The largest-data scenario improved from 35.03 ms to 23.56 ms at the 95th percentile with 10 concurrent calls in this run. Earlier short samples varied, so the reported run uses longer samples. Verify benefit on production-like staging before scheduling index rollout.

Production-bundle browser workflows also passed with 1,000 and 5,000 employee comparisons: actual CSV selection/upload, 50 employee cards per page, next-page navigation, searching the final employee, one-paisa detail, and desktop/mobile layout. All API responses were synthetic. The associated `reconciliation-ui-1000.json` and `reconciliation-ui-5000.json` files contain single-run UI observations, not percentile or production measurements.

## Index rollout

`backend/migrations/20260912_critical_workflow_query_indexes.sql` adds:

- An attendance index on client, branch, and date, including approval status.
- A contractor document index supporting the latest version for client, branch, contractor, document type, and reporting month.

The file is tested transactionally by the benchmark. It is deliberately not a boot patch or automatic deployment migration. A DBA should verify it on production-like staging and apply this specific file with `psql --single-transaction -v ON_ERROR_STOP=1 -f` during an agreed maintenance window. The generic `db:migrate:sql` runner also discovers the file. The migration guard records this explicit manual mechanism.

Regular index creation can block writes while building. The file uses a five-second lock timeout and a five-minute statement timeout; failure rolls back both indexes when applied in the stated transaction. No production migration was executed. Application correctness does not depend on these optional indexes.

## Human acceptance and remaining evidence

[CLIENT_ACCEPTANCE_SESSION.md](CLIENT_ACCEPTANCE_SESSION.md) contains role-specific tasks, expected results, evidence fields, and proposed acceptance gates. It is prepared, not completed.

Still needed: sessions with client users; performance against the full stack and realistic traffic on staging; spare-device tests of the client's released APK; measured face-recognition/liveness accuracy; finance/compliance owner approval of expected rule examples; and explicit approval-history expectations for edits/additions to already approved payroll. Existing tests and this bounded pass do not certify those areas.

## Delivery

All code, tests, measurements, and migration preparation are local. No deployment, production data change, new APK installation, or message to client users was performed.

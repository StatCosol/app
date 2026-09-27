# AI payroll anomaly scan integrity

## Summary

- Reject missing/deleted companies and missing/foreign-company payroll runs before scanning or saving findings.
- Compare UUID references in PostgreSQL, accepting uppercase equivalents and persisting the canonical run ID.
- Restrict optional run-selected checks to same-company run members. Imported members without employee IDs can match by same-company employee code; explicit IDs remain authoritative.
- Preserve the selected run reference on all four finding types.
- Stop swallowing database errors. A failed rule aborts detection before any accumulated findings are saved; it cannot return an empty or partial success.
- Preserve expected HTTP 400/404 responses, while hiding unexpected database details behind a generic 500 response.
- Prevent duplicate UI submissions, trim the optional run ID, lock the scan inputs, retain rejected inputs for correction, and show a persistent error instead of the empty success state.
- Require the new synthetic PostgreSQL regression in CI. Angular and Node test configurations are unchanged.

## Important Remaining Limitation

This is a reporting safety fix, not restoration or certification of the salary-analysis rules. Three legacy rules query `employees.basic_salary` and `employees.gross_salary`, which are absent from the checked-in employee entity and migrations. On that schema, detection now fails visibly instead of silently producing a partial result or claiming payroll is clean.

The salary rules still need an explicit, reviewed mapping to real payroll data. No fields have been invented or added to production. Run selection restricts **current employee data** by run membership; it is not a historical payroll snapshot analysis. Inactive/departed employees remain excluded by the existing rules.

Existing rule thresholds, statutory applicability, wage-base versus contribution wording, employee-master registration fallbacks, repeated-scan deduplication, historical findings and resolution workflow are not certified or repaired by this PR. In particular, the existing PF rule compares wage bases while describing contributions; that needs review with the salary-source repair. This PR must not be presented as a fully working or legally validated payroll audit.

## Verification

- Backend: 2,226 tests passed across 266 suites; one existing suite/test skipped.
- Angular: 548 tests passed across 88 files, including eight new anomaly-form tests and a rendered TestBed assertion for locked inputs and visible errors.
- Separate frontend service runner: 93 tests passed across 17 files.
- Backend and production frontend builds passed. Existing Sass deprecation warnings remain.
- Changed backend TypeScript lint and full frontend lint passed.
- Module wiring check passed: 64 modules, 269 providers, 243 controllers, no orphan registrations.
- Release-check assertions: seven passed, including required CI execution of the new PostgreSQL regression.
- Real local PostgreSQL/TypeORM test passed: missing/deleted/foreign owners, uppercase UUIDs, selected-run membership, imported code fallback, empty runs, all four stored run references, and failed scans without partial writes.
- The PostgreSQL test first reproduces the missing-column failure against an employee-table fixture without those unsupported columns. It then adds salary columns **only in the disposable test database** to exercise compatibility-path filtering and persistence. This does not establish that the current application schema supports successful salary scans.
- All data is synthetic. The UUID-named test database was dropped and the temporary local PostgreSQL cluster stopped after testing.

## Scope And Release

Only AI anomaly reporting, its UI, regression tests and CI coverage are changed. No kiosk, Android APK, face capture, attendance, shared authentication/access implementation, salary-calculation engine, migration, production data/settings, external provider, email or deployment changes.

Existing unrelated screenshot changes and generated test artifacts were preserved and excluded from the commit. Publication is through a PR for review; no merge or deployment was performed.

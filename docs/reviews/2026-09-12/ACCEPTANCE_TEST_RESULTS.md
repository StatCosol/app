# Local acceptance tests — 12 September 2026

Fresh verification after the user's request to proceed with testing. All final executed checks passed. This is local automated verification, not client acceptance or production certification.

| Check | Result | Evidence |
| --- | --- | --- |
| Backend full suite | 1,032 passed across 173 suites; one existing database boot test skipped | acceptance-backend.log |
| Angular browser suite | 214 passed across 39 files | acceptance-frontend.log |
| Android kiosk unit tests, forced fresh execution | 38 passed; no failures, errors or skips | acceptance-android-fresh.log and mobile/app/build/test-results/testKioskDebugUnitTest |
| Kiosk and ESS debug assembly | Successful; build tasks were up to date | acceptance-android.log |
| Face-service safety regressions | 6 passed, including concurrent endpoint requests and configured liveness failure handling | acceptance-face-service.log |
| Module/deployment guard regressions | 8 passed | acceptance-guards.log |
| Current module graph | Passed | acceptance-module-graph.log |
| Real PostgreSQL attendance and approval workflows | Passed | acceptance-critical-workflows.log |
| Real PostgreSQL monthly close | Passed | acceptance-monthly-close-db.log |
| Real TypeORM payroll reconciliation | Passed | acceptance-reconciliation-db.log |
| All 13 portal shells, desktop and mobile | Passed; module search, keyboard dismissal, focus, density, runtime errors and horizontal overflow checks | acceptance-portals.log; ui/portal-smoke.json |
| Payroll reports with 1,000 and 5,000 employees | Passed; actual CSV selection/upload against synthetic API responses, 50-row paging, next page, last-employee search and one-paisa difference | acceptance-payroll-ui-1000.log; acceptance-payroll-ui-5000.log |

## Attendance within payroll

The full backend suite includes payroll attendance loading and checks that processing stops before employee writes when attendance cannot be loaded, for both full-run and selected-employee processing. Empty payroll runs cannot be marked processed.

Disposable PostgreSQL checks exercised Indian business-day/month boundaries, leap days, tenant separation, rejected/pending punch exclusions, mirrored-punch de-duplication, historical replay cutoffs and contractor punch separation. Payroll approval checks exercised self-approval denial, competing decisions, safe reversion and preservation of unrelated concurrent edits. Monthly-close checks covered missing approval states, branch/month isolation, latest evidence, expiry and filing evidence. These are service/database checks, not a complete deployed HTTP workflow from a camera through payroll.

## Test correction

The first portal pass sometimes inspected module results immediately after the native dialog opened, before Angular rendered signal changes. The smoke script now waits for rendered module buttons, density state and empty search results. Assertions remain in place. The rerun passed all 13 portals. No application source change was required during this test pass.

The initial Python and Node guard attempts hit local sandbox access/process restrictions. Both completed successfully when rerun with the existing dependencies and permitted process access.

## Limits and remaining acceptance

- Portal checks use representative pages and synthetic responses; they do not exercise every screen or every live backend route.
- Python tests simulate inference. Camera quality, recognition accuracy, spoof resistance and the deployed model's real-class order require the actual model and device.
- No staging address or spare device access was supplied. The user's reply identified attendance within payroll; that connection was included in local coverage.
- No physical device installation, offline/restart recovery drill, release signing or in-place APK upgrade was performed. The client's installed attendance APK is unchanged.
- No production migration, deployment, hosted security scan or real-user acceptance session was performed. Android compilation emits existing deprecation warnings despite successful tests.
- Earlier synthetic performance results remain in CRITICAL_WORKFLOW_VALIDATION.md; this pass did not rerun the benchmark or establish production capacity.

Database scripts used generated schemas in the dedicated loopback PostgreSQL test cluster on port 55439. No generated critical/reconciliation schemas remained after testing. The cluster was stopped after verification.

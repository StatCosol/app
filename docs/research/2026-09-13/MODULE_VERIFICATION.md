# Cross-module verification — 13 September 2026

Baseline: main 915e07a0 (merged PR655 and PR656). ESS Android release/device work excluded. Shared backend/frontend suites were run in full.

## Results

| Check | Result |
| --- | --- |
| Backend module wiring | 64 modules, 259 providers, 240 controllers; no orphan services/controllers, disconnected features or invalid delegate targets |
| Backend unit tests | 197 suites / 1,323 tests passed; database boot test initially skipped without DB settings |
| Database boot and all entity metadata | Explicit follow-up with disposable PostgreSQL: 1 test passed |
| Frontend browser suite | 53 files / 294 tests passed |
| Frontend pure unit suite | 10 files / 64 tests passed |
| Face-service request/inference safety | 6 tests passed |
| Module-checker and deployment-gate regressions | 9 tests passed |
| Backend and frontend production builds | Passed |
| Backend and frontend lint | Passed |
| Production dependency audits | Zero reported vulnerabilities in both projects |
| Reconciliation scale | 5,000 workers; pagination, last-worker search, one-paisa mismatch, desktop/mobile layout passed |

## Sample-data integration checks

All 12 existing verification scripts passed after updating two stale test harnesses:

- Client/LegitX/Branch Desk: actual audit period fields, branch ownership, all-assigned payroll aggregation, task summary/list consistency and recurring-task pagination.
- Payroll and attendance: IST midnight/month/leap boundaries, tenant isolation, pending/rejected punches, mirrored attendance deduplication, contractor separation, self-approval rejection, concurrent approve/reject, safe reversion.
- Accounts and appraisal: sequential receipt allocation across rollover and concurrent transactions; appraisal company/branch ownership.
- Operational work: scoped lists/updates, empty and multiple assignments, dates/statuses, close/reopen, concurrent patches and deadlines.
- Contractor/auth/audit listing: tenant boundaries, password-hash exclusion, explicit authentication selection and exact audit periods.
- Automation controls: scope/exclusions, read-only previews, version checks, retry, pause, scheduler attribution, concurrent runs, branch document expiry, AI fallback.
- Automation deduplication: reminder concurrency, rollback, recipient separation, filing/expiry reuse and retained terminal history.
- My Work: counts/list agreement, pagination and 5,000-row fixture; 20 concurrent creators produce one task.
- Contractor payroll: actual migration/entity schema, authority, immutable snapshots, approval, independent verification, controlled reopening and concurrent transitions.
- Payroll evidence: real Excel/PDF extraction and raster-only OCR; mismatch details and mandatory auditor review.
- Deployment: failed, canceled and unfinished migrations block backend deployment.
- Dependency runtime: mail generation without delivery, Excel round-trip and HTML sanitizer.

## Maintenance changes

The client/branch regression used an obsolete empty task-center dependency; it now uses OperationalScopeService with AccessScopeService. The critical workflow script imported uncompiled TypeScript while other regression scripts use the production build; it now loads dist. Five previously local-only database checks accept the CI database credentials (host remains loopback) and now run in backend CI.

No application defect was identified in these checks. Generated test schemas were removed by their scripts and the disposable PostgreSQL service was stopped after completion. No production records or notifications were created.

## Limits and operational prerequisites

This is automated cross-module verification, not a claim that every production screen was manually exercised as every role. Face-service tests use controlled inference fixtures, not physical camera/device acceptance. External delivery, actual ESSL/biometric devices, and client-specific payroll acceptance require the corresponding live inputs. Existing Sass import deprecation warnings remain non-blocking.

ITC/Peregrine Telangana still needs actual worker enrollment and confirmed skill classifications, branch quotation entry effective 1 June 2026, approved attendance and first-cycle payroll acceptance. These business inputs cannot be inferred or fabricated.

# Module audit — 7 October 2026

Baseline: main commit ec861167f5ee2deb58618d39bba9579a28abf33c. Checks used synthetic fixtures and an isolated PostgreSQL 16 database. Production configuration and data were not changed. Assist remains absent from the client and branch dashboards.

## Confirmed defects and changes

1. **Shared first-visit rendering failure (P2).** Client, branch, CRM, contractor, auditor, admin, payroll, CCO, CEO, ESS and PF Team route-host layouts used OnPush. A normal child page can receive its delayed response inside Angular's zone yet remain invisible because the clean parent layout is skipped. A regression using each real layout, its router outlet and the app's zone configuration failed in all eleven layouts before the fix. Accounts and Sales passed as controls. Set the eleven route-host layouts to Default; child components retain their existing strategies. All thirteen portal cases now pass without extra clicks or manual change detection.
2. **Payroll Reports assigned clients not refreshed (P2).** The explicitly OnPush page assigned the delayed client list without notifying the view. Its new regression failed before the fix. Mark the view after client-list responses and after download busy-state transitions.
3. **Payroll Queries stale client context (P2).** The explicitly OnPush page updated its thread context on reused-route parameters without notifying the view. Its new regression displayed the prior context before the fix. Mark the view after the context changes. API scope and thread permissions are unchanged.

The isolated Returns Status notification fix is already in PR #741. This audit addresses the common parent-layout cause and remains compatible with that change.

Tradeoff: route-host layouts now participate in normal zone-driven checks. This can increase checks of the small shell templates. No polling or additional data requests were introduced; optimized leaf components remain optimized. A production load/performance benchmark was not performed.

## Validation results

| Check | Result |
|---|---|
| Backend module wiring | 64 modules, 276 providers, 244 controllers; no orphan services/controllers or controller modules missing from AppModule |
| Backend unit and authorization tests | 2,729 passed across 294 suites; DB-only boot case intentionally skipped here and executed separately |
| Module/deployment/release checker tests | 17 passed |
| Full Chromium suite after fixes | 701 passed across 109 files |
| Frontend service/unit suite | 118 passed across 20 files |
| Route/menu/template inventory | 380 routes, 74 menu declarations, 402 templates; no broken menu targets or parse errors |
| Integration regressions | 34 passed on the host; the remaining OCR regression passed in exact Linux dependencies with the fixture font supplied |
| Backend and frontend types/lint | Passed |
| Backend compile and exact-lockfile Docker builder | Passed |
| Frontend production build and Docker image | Passed |
| All-entity metadata/PostgreSQL boot | Passed in Linux container |
| Patched dependency runtime smoke | Passed in Linux container |
| Production dependency audits | Backend and frontend: zero reported vulnerabilities at audit time |
| Local smoke safety and ESS native session bridge | Passed; the smoke safety test deliberately emits negative-case failures before its final PASS |

The Windows shared dependency junction lacks the bundled OCR language package. The minimal Alpine builder also has no Arial-compatible font, so the synthetic canvas scan initially contained no readable text. Running the unchanged OCR regression with exact dependencies and a read-only Arial font mount passes real Excel/PDF extraction, offline scanned-PDF OCR, expected PF differences and mandatory manual-review outcomes. No production OCR logic was changed or failure masked.

## Integration coverage

These fixtures cover payroll cycles and locks, assigned-client/branch scope, compliance workflows, deep lists and reports, automation deduplication, Action Queue, contractor payroll authority, document reconciliation, notice/checklist options, endpoint roles, Monthly Review, payroll reconciliation, nomination repair, CLRA scope, contractor punch lists, audits and corrections, follow-ups, invoice delivery, audit dashboards, payslip layouts, register generation, helpdesk, billing transactions and AI reference/anomaly integrity.

| Regression | Outcome |
|---|---|
| validate-intern-payroll-cycle.cjs | Pass |
| validate-payroll-period-lock.cjs | Pass |
| validate-client-branch-db.cjs | Pass |
| validate-critical-workflows-db.cjs | Pass |
| validate-module-gap-db.cjs | Pass |
| validate-operational-scope.cjs | Pass |
| validate-deep-list-review.cjs | Pass |
| validate-automation-controls.cjs | Pass |
| validate-automation-dedup.cjs | Pass |
| validate-my-work.cjs | Pass |
| validate-ui-automation-upgrade.cjs | Pass |
| validate-contractor-payroll-authority.cjs | Pass |
| validate-payroll-document-reconciliation.cjs | Pass on Linux rerun with synthetic fixture font; initial host/container environment limitations documented above |
| validate-deeper-business-flows.cjs | Pass |
| validate-notice-checklist-options.cjs | Pass |
| validate-endpoint-role-options.cjs | Pass |
| test-monthly-close-db.js | Pass |
| test-payroll-reconciliation-db.js | Pass |
| validate-nomination-repair.cjs | Pass |
| validate-clra-scope.cjs | Pass |
| validate-contractor-punch-list.cjs | Pass |
| validate-report-queries.cjs | Pass |
| verify-audit-corrections.cjs | Pass |
| verify-audit-follow-ups.cjs | Pass |
| verify-invoice-delivery.cjs | Pass |
| verify-audit-entry.cjs | Pass |
| verify-auditor-dashboard.cjs | Pass |
| verify-payslip-layout-db.cjs | Pass |
| verify-register-generation-time-db.cjs | Pass |
| verify-helpdesk-db.cjs | Pass |
| verify-billing-transactions.cjs | Pass |
| verify-consolidated-scope-db.cjs | Pass |
| verify-ai-audit-references-db.cjs | Pass |
| verify-ai-payroll-anomalies-db.cjs | Pass |
| verify-payslip-layout.cjs | Pass |

## Boundaries

This is a source, automated browser, build, dependency and synthetic database audit. The portal loading regression isolates the route-host template to its router outlet and stubs shell initialization; the existing browser suite provides the broader component checks. It is not an assertion that every business option or every combination of production tenant data was manually exercised.

No authenticated production role matrix, email/payment delivery, real statutory filing, Android/native-device build, or biometric hardware/inference test was performed. FaceDesk source and production settings were not modified; its existing backend tests ran within the full suite. These external/device checks remain separate validation work.

Fixes are prepared for review. They have not been deployed by this audit.

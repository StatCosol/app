# Project review — 12 September 2026

Reviewed commit: `488fed40ba33189b9cebf0ccbc8d881e300649fe`. The working tree was clean at the start. Application source was not changed.

This is a repository-wide structural review, automated validation, and targeted manual review of shared controls and integrations. It covers every backend area in the matrix below and the frontend, Android, face service, database definitions, and deployment workflows. It is **not** a claim that every business workflow or all 1,464 route handlers have been manually exercised.

## Findings

P1 = address urgently; P2 = address next. Findings below are based on source inspection unless an executed reproduction is explicitly noted. No production data or endpoints were accessed.

### 1. P1 — Cross-company downloads remain possible through static upload exceptions

[backend/src/main.ts:269](C:/Users/statc/Desktop/statcompy/backend/src/main.ts:269) allows any valid access token through for nine named directories, including invoices and payroll-breakups, without calling the ownership checker. [InvoicePdfService:41](C:/Users/statc/Desktop/statcompy/backend/src/accounts-billing/services/invoice-pdf.service.ts:41) writes invoice PDFs into this path and derives filenames from invoice numbers. Payroll processing also writes salary imports to an exempt directory.

A user from company A who knows a company B file path can request it through `/uploads/invoices/...` or `/uploads/payroll-breakups/...`. The protected files controller does not protect this separate static route, and the frontend proxy forwards uploads to it.

**Correction:** associate generated/imported files with their owner, enforce FilesService authorization on every sensitive directory, and test cross-company and cross-role denial on the static URL itself. Existing exemptions are documented in the source but remain an access-control defect.

### 2. P1 — Android offline queue can lose unsynced punches

[FaceDeskOfflineStore.kt:54](C:/Users/statc/Desktop/statcompy/mobile/app/src/main/java/com/statcosol/attendance/facedesk/FaceDeskOfflineStore.kt:54) deletes the existing encrypted file before successfully writing its replacement, then logs and swallows write errors. A storage failure or process termination in that interval destroys the previous queue. Migration also deletes the legacy file in a finally block, even if writing the encrypted replacement failed.

The locking is also per store instance: the activity and background worker each create a separate FaceDeskOfflineStore. Their `@Synchronized` methods therefore do not serialize access to the same file. An enqueue can race a flush and lose data even though finishFlush preserves new punches within one instance.

**Correction:** use a transactional queue or crash-safe replacement compatible with EncryptedFile's filename binding; serialize all readers/writers through a shared store/lock. Only delete legacy data after verifying durable migration. Validate concurrent enqueue/flush and injected write failure.

### 3. P1 — Face service shares a mutable TFLite interpreter across simultaneous requests

[face-svc/app/main.py:348](C:/Users/statc/Desktop/statcompy/face-svc/app/main.py:348) performs set_tensor → invoke → get_tensor on a process-global interpreter with no lock. The `embed` endpoint is a normal synchronous function at line 380, which FastAPI runs in a worker thread pool. Multiple requests within either Uvicorn worker can interleave this sequence, mix request inputs/outputs, or fail inference.

This inference is supported by the [FastAPI execution model](https://fastapi.tiangolo.com/async/#path-operation-functions) and the [TFLite interpreter contract](https://www.tensorflow.org/api_docs/python/tf/lite/Interpreter), which prohibits other operations on the interpreter while invoke is running. Two Uvicorn processes do not eliminate concurrency within each process.

**Correction:** lock the entire inference operation, including shared detector access, or use independently owned detector/interpreter instances. Add a concurrent-request test. Actual model inference was not run in this review.

### 4. P1 — Binary liveness models report confidence in a spoof as confidence in a real face

[face-svc/app/main.py:296](C:/Users/statc/Desktop/statcompy/face-svc/app/main.py:296) uses argmax as the real-face class when the output has fewer than three classes. For binary probabilities `[0.99 spoof, 0.01 real]`, it returns 0.99 as livenessScore instead of 0.01. Thus a confidently rejected face gets a high real-face score.

This affects deployments supplying a two-class liveness model; the three-class branch uses its fixed index. The current model artifact/class mapping was not inspected.

**Correction:** configure and validate the real-class index against the deployed model. Never infer class meaning from whichever class has the highest score. Test both confident real and confident spoof outputs.

### 5. P1 — Docker Compose backend fails production configuration validation

[docker-compose.yml:45](C:/Users/statc/Desktop/statcompy/docker-compose.yml:45) sets NODE_ENV=production but does not pass AI_ENCRYPTION_KEY. [env.validation.ts:59](C:/Users/statc/Desktop/statcompy/backend/src/config/env.validation.ts:59) requires that setting in production.

**Executed reproduction:** evaluating the compiled validator with the Compose backend environment yields `"AI_ENCRYPTION_KEY" is required`; see [compose-validation.log](C:/Users/statc/Desktop/statcompy/docs/reviews/2026-09-12/compose-validation.log). Merely defining this variable in the host's .env does not inject it into this service's explicitly declared container environment.

**Correction:** inject the required key through the Compose service configuration, and cover Compose configuration with a startup check.

### 6. P2 — ESS Android cannot handle the web portal's blob downloads

[MainActivity.kt:263](C:/Users/statc/Desktop/statcompy/mobile/essportal/src/main/java/com/statcosol/ess/portal/MainActivity.kt:263) hands the download URL directly to DownloadManager. The ESS [payslip page:232](C:/Users/statc/Desktop/statcompy/frontend/src/app/pages/ess/payslips/ess-payslips.component.ts:232) and [document vault:449](C:/Users/statc/Desktop/statcompy/frontend/src/app/pages/ess/documents/ess-document-vault.component.ts:449) fetch authenticated blobs and download blob: URLs.

Android's [DownloadManager](https://developer.android.com/reference/android/app/DownloadManager) performs HTTP downloads; it cannot retrieve an in-memory WebView blob. There is no blob transfer bridge in the wrapper. The native handler catches the failure and shows a download error.

**Correction:** implement a tightly scoped bridge to save bytes from the trusted portal, or a native authenticated download flow. Verify payslip and document saving on a device. This was identified from the integration code and API contract, not reproduced on a device.

### 7. P2 — Every advertised security scan is a successful placeholder

[.github/workflows/security.yml:25](C:/Users/statc/Desktop/statcompy/.github/workflows/security.yml:25) and the following jobs only echo messages. npm audit, Semgrep, Gitleaks, Trivy filesystem/image scans, and CodeQL never run. Their green status does not provide security evidence.

**Correction:** restore actual scanners and publish their outputs. Keep required checks meaningful; represent temporary scanner exceptions explicitly rather than unconditional success. No current vulnerability database audit or secret scan was run as part of this review.

### 8. P2 — Deployment is not gated on the CI test result

[.github/workflows/deploy-azure.yml:3](C:/Users/statc/Desktop/statcompy/.github/workflows/deploy-azure.yml:3) runs independently on a main push. Its deploy jobs depend on its image build, not successful CI. A commit can compile, fail unit tests, and still be deployed by this workflow.

**Correction:** make deployment depend on successful checks for the exact commit being deployed. Repository branch protection or environment rules were not inspected; they may reduce exposure but do not create the missing dependency in this workflow.

### 9. P2 — Optional disaster-recovery boot test uses incompatible environment variables

[.github/workflows/dr-restore-drill.yml:163](C:/Users/statc/Desktop/statcompy/.github/workflows/dr-restore-drill.yml:163) launches the backend with DATABASE_HOST/USER/PASSWORD/NAME while the app requires DB_HOST/USER/PASS/NAME. It also omits required JWT_SECRET and the production AI_ENCRYPTION_KEY. The optional run_boot_test=true path therefore cannot validate the restored application.

**Correction:** supply the current environment contract with isolated test secrets and use `/api/v1/health/ready` for database readiness. The existing `/health` endpoint intentionally returns HTTP 200 even if the database becomes unreachable. The restore workflow was not executed because it provisions resources and touches production firewall rules.

### 10. P2 — Deep module check cannot fail CI when it detects broken delegates

[backend/scripts/deep-module-check.js:192](C:/Users/statc/Desktop/statcompy/backend/scripts/deep-module-check.js:192) discards verifyDelegates()'s boolean result; no failure exit code is set for missing delegates or orphan registrations. The CI command can therefore print a detected defect and still succeed.

The current run's three apparent wiring findings are false positives: GratuityInput and UnitFactsDto are DTO classes that the first-export regex mistakes for services, and FaceDeskModule is imported but the filename-derived spelling is FacedeskModule. There were no missing delegate targets in this run.

**Correction:** use parsed class/decorator metadata, resolve actual module symbols, and set a nonzero exit status for genuine failures.

## Validation results

| Check | Result |
| --- | --- |
| Backend production build | Passed |
| Backend unit tests | 166 suites / 953 tests passed; one database boot test skipped |
| Entity metadata | All 217 compiled entities validated locally without a DB connection |
| Backend lint | Failed: 6,675 errors; 6,669 formatting errors and 6 TypeScript lint errors |
| Frontend production build | Passed |
| Frontend lint | Passed |
| Frontend Vitest utility/service suite | 7 files / 51 tests passed |
| Angular browser suite | 35 files / 183 tests passed |
| Android initial check | Kiosk test task and ESS debug assembly succeeded, all tasks cached |
| Android fresh validation | Passed: 36 tests; Kiosk and ESS debug APK builds; all 86 tasks executed | 
| Module wiring script | 62 modules, 243 provider names, 241 controller names; 21 delegate pairs checked |
| Controller inventory | 1,464 route methods across all backend areas |
| Docker Compose configuration | Reproduced missing AI_ENCRYPTION_KEY |
| Face service runtime | Not executed; default Python command is unavailable and model inference was not provisioned |

Backend lint is a failing check, not 6,675 separate application defects. The non-formatting issues are in contractor employee DTO/delegation specs, the ESS leave-race spec, and three payroll specs. Fix these alongside formatting and add the lint command to CI; the existing backend CI job does not run it. The checkout's line-ending state contributes heavily to the formatting count.

The three route methods without explicit role/custom-guard decorators were manually inspected: FilesController.download enforces file ownership and the two service-entitlement catalog endpoints list package/module options. All still sit behind the global JWT guard. Their absence of a Roles decorator was not counted as a vulnerability.

## Coverage and limits

All backend areas below participated in the source inventory, build and applicable unit tests. Numbers describe files, not assertion or branch coverage. An area with zero colocated spec files may be exercised indirectly; a passing spec does not validate all business cases.

The manual review focused on authentication, shared tenant/branch/file scope, payroll import and file delivery, service registration, Android offline persistence and downloads, face inference/liveness, configuration, and release/recovery checks. Automated searches also covered implementation markers and controller access metadata throughout the source tree.

No live database migration, full HTTP end-to-end suite, production portal walkthrough, physical camera/liveness test, release signing, cloud deployment, backup/restore drill, or full dependency/secret scan was performed. In particular, local entity metadata validation is not proof that a deployed database schema matches all queries. The HTTP end-to-end suite imports AppModule and was not pointed at the developer's configured database because startup includes scheduled work and schema writes.

Frontend utility tests also appear in the Angular suite; test counts should not be added and described as unique coverage.

## Backend area matrix


| Area | TS files | Controllers | Services | Spec files |
| --- | ---: | ---: | ---: | ---: |
| access | 7 | 0 | 1 | 5 |
| accounts-billing | 53 | 7 | 12 | 5 |
| admin | 25 | 8 | 5 | 1 |
| ai | 27 | 1 | 10 | 3 |
| applicability | 31 | 2 | 2 | 2 |
| assignments | 18 | 2 | 2 | 1 |
| attendance | 12 | 2 | 2 | 1 |
| audit-logs | 5 | 0 | 1 | 1 |
| auditor | 8 | 3 | 1 | 1 |
| audits | 27 | 2 | 8 | 1 |
| auth | 29 | 1 | 3 | 6 |
| automation | 31 | 7 | 12 | 2 |
| biometric | 13 | 3 | 3 | 2 |
| branch-compliance | 13 | 5 | 3 | 1 |
| branches | 27 | 9 | 4 | 2 |
| calendar | 5 | 1 | 1 | 1 |
| cco | 11 | 3 | 2 | 1 |
| ceo | 6 | 3 | 1 | 1 |
| checklists | 6 | 1 | 1 | 2 |
| cleanup | 5 | 1 | 2 | 1 |
| client-contacts | 9 | 1 | 3 | 1 |
| client-dashboard | 5 | 1 | 1 | 1 |
| clients | 15 | 6 | 1 | 2 |
| common | 38 | 1 | 5 | 6 |
| compliance | 28 | 10 | 7 | 1 |
| compliance-documents | 12 | 3 | 1 | 1 |
| compliances | 21 | 6 | 7 | 3 |
| config | 3 | 0 | 0 | 1 |
| contractor | 49 | 11 | 9 | 9 |
| crm | 8 | 4 | 1 | 1 |
| crm-documents | 10 | 3 | 1 | 2 |
| dashboard | 2 | 1 | 0 | 1 |
| email | 5 | 0 | 2 | 1 |
| employees | 24 | 5 | 4 | 1 |
| escalations | 6 | 1 | 2 | 1 |
| ess | 11 | 1 | 1 | 2 |
| facedesk | 58 | 7 | 16 | 24 |
| files | 4 | 1 | 1 | 1 |
| health | 4 | 1 | 0 | 2 |
| helpdesk | 7 | 1 | 1 | 1 |
| legitx | 15 | 3 | 3 | 3 |
| list-queries | 9 | 0 | 7 | 1 |
| masters | 10 | 0 | 1 | 1 |
| mobile-attendance | 60 | 6 | 14 | 18 |
| monthly-documents | 7 | 1 | 1 | 1 |
| news | 8 | 1 | 1 | 1 |
| nominations | 6 | 1 | 1 | 1 |
| notices | 10 | 1 | 1 | 1 |
| notifications | 17 | 3 | 2 | 1 |
| options | 9 | 7 | 0 | 1 |
| payroll | 127 | 14 | 27 | 16 |
| performance-appraisal | 25 | 4 | 4 | 1 |
| reports | 11 | 6 | 3 | 1 |
| returns | 23 | 6 | 3 | 2 |
| risk | 5 | 1 | 2 | 1 |
| safety-documents | 12 | 4 | 2 | 2 |
| sales | 8 | 1 | 1 | 1 |
| service-entitlements | 8 | 1 | 1 | 2 |
| sla | 6 | 1 | 2 | 1 |
| task-center | 4 | 1 | 1 | 1 |
| units | 18 | 1 | 4 | 5 |
| users | 20 | 6 | 1 | 1 |

## Frontend page areas

| Area | Components | Spec files |
| --- | ---: | ---: |
| accounts | 2 | 0 |
| admin | 31 | 1 |
| auditor | 15 | 1 |
| branch | 33 | 2 |
| cco | 17 | 2 |
| ceo | 19 | 2 |
| client | 54 | 2 |
| contractor | 14 | 1 |
| crm | 37 | 2 |
| ess | 17 | 1 |
| forgot-password | 1 | 0 |
| login | 1 | 0 |
| payroll | 28 | 3 |
| pf-team | 4 | 1 |
| reset-password | 1 | 0 |
| sales | 8 | 0 |
| shared | 1 | 0 |
| shared-vendor | 1 | 0 |

Shared core, interceptors, guards, utilities, and feature modules are covered by the frontend build and full browser test discovery. See inventory.json for backend route locations and access decorators. Test command outputs are stored beside this report.

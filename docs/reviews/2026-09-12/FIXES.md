# Review fixes — 12 September 2026

All ten findings from PROJECT_REVIEW.md are addressed in the local project. The backend lint failures are also corrected. Nothing has been pushed, deployed, or installed on a client device.

## What changed

| Finding | Resolution |
| --- | --- |
| Static file access | Removed token-only exceptions. Static downloads validate the current user and enforce ownership. Forms, notices, returns, and registration documents resolve their existing database owners. Invoice PDFs follow the ADMIN/ACCOUNTS policy. Biometric photos and scratch payroll imports cannot be downloaded through static URLs. |
| Android offline queue | Writes a complete encrypted replacement and syncs it before atomic replacement. Keeps the original basename required by EncryptedFile. A process-wide lock serializes activity and worker access; failed migration/writes preserve the existing data and sync retries errors. |
| Shared face interpreter | Serializes the complete shared detector/inference operation. Added a concurrent test through the actual embed endpoint. |
| Binary liveness score | Selects an explicit real-face class instead of the highest-confidence class. Default index remains 1. Invalid output or inference failure in a configured liveness model returns a zero score instead of disabling the gate. |
| Compose startup | Passes the required AI_ENCRYPTION_KEY and documents it in the production environment example. A test validates the actual Compose environment against the backend schema. |
| ESS Android downloads | Added a main-frame, HTTPS-origin-restricted message bridge that receives already-authenticated file bytes and opens Android's Save dialog. No authentication token crosses the bridge. Transfers are limited to 20 MB. The web portal keeps its browser fallback when the bridge is absent. |
| Security scans | Restored npm audit, Semgrep, standalone Gitleaks, Trivy filesystem/image scanning, and CodeQL. Jobs retain reports, run real tools, and no longer return success from placeholder echo commands. |
| Deployment gate | Requires successful CI and security runs for the exact main commit before image builds/deployment. Regression tests cover failed scans, stale passing commits, and non-main manual dispatch. Production verification uses readiness. |
| Recovery boot test | Uses the current DB_* variables, isolated generated JWT/AI test secrets, disabled email/bootstrap seeding, registry login, and the readiness endpoint. No restore was performed. |
| Module checker | Parses decorated classes and module metadata, traverses module imports, and returns failure for orphan registrations, disconnected modules, and missing delegate methods. Negative regression tests confirm it can fail. |

Backend lint now passes. This includes line-ending/formatting corrections across existing files and six TypeScript lint corrections. CI now runs backend/frontend lint, checker regressions, face-service regressions, and real Android debug assembly.

## Client APK compatibility

- The face model, preprocessing, embedding dimensions, model identifiers, enrollment format, and attendance API contract are unchanged. These server fixes do not require a new APK or a model migration.
- Liveness is stricter when a configured model fails or confidently classifies a spoof. Confirm the deployed model's class order before deployment; the real-class index is configurable through LIVENESS_REAL_CLASS_INDEX.
- The offline queue fix requires a new kiosk APK. The kiosk version is prepared as **0.7.30 (37)**, retaining its application ID and encrypted queue format.
- The native download fix requires the updated ESS wrapper and web portal. The ESS version is prepared as **0.1.1 (2)**. The client’s current attendance APK remains untouched.
- Local APK outputs are **debug validation builds**, not release handover packages. A client update must use the existing release signing identity and an in-place installation; do not uninstall or clear app data, which would remove offline data and device registration.

## Verification

| Check | Result |
| --- | --- |
| Backend production build | Passed |
| Backend unit suite | 972 tests passed, 168 suites; one DB boot test skipped |
| Backend lint | Passed, zero reported problems |
| Frontend production build | Passed |
| Frontend lint | Passed |
| Frontend utility suite | 54 tests passed |
| Angular browser suite | 186 tests passed |
| Android kiosk JVM tests | 38 passed, zero failures/errors |
| Kiosk and ESS debug APK assembly | Passed |
| Face-service regressions | 6 passed, including concurrent endpoint requests and liveness failure handling |
| Module checker and deployment-gate regressions | 8 passed |
| Current module graph | Passed, no orphan services/controllers or missing delegate targets |
| Backend/frontend production dependency audits | Both reported zero known vulnerabilities |
| Workflow YAML parsing and diff whitespace checks | Passed |

The frontend utility suite overlaps the Angular browser suite; these are not additive unique coverage counts. Logs are retained beside this document. Python endpoint tests used an isolated FastAPI installation and simulated inference, without downloading or replacing a face model.

## Deployment requirements and remaining verification

The fixes are local and uncommitted. Live database workflows, hosted security scanners other than the local npm audits, the recovery drill, and physical-device camera/offline recovery/Save-dialog behavior have not been executed. The restored cloud scans must succeed before the new deployment gate allows deployment; source changes alone are not evidence that those hosted scans passed.

Configure Compose with the existing production AI encryption key where applicable; replacing an established key would affect encrypted AI settings. Files without a registered owner now fail closed; legitimate legacy artifacts without a database reference must be registered or regenerated.

Before a client rollout, validate the server changes in staging against the installed APK version, then test the newly signed APK's in-place update and offline queue recovery on a test device. Server deployment and client APK installation are separate actions.

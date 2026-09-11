# Security remediation for PR 642

## Changes

- Angular framework 21.2.23 and build/CLI 21.2.24: patched within major 21.
- NestJS common/core/platform/testing aligned to 11.2.3; patched Multer 2.3.0 resolved for the platform adapter.
- Nodemailer 10.0.8, sanitizer 2.17.7 and compatible transitive patches. Removed unused backend Puppeteer (no backend source or script consumers).
- ExcelJS's UUID consumer uses the maintained CommonJS-capable UUID 11 release. A generated workbook with data bars verifies its UUID path and a workbook round trip.
- Real sanitizer dependencies are transformed for CommonJS Jest; production uses the original modules. The sanitizer is not mocked.
- Frontend uses the official Nginx unprivileged image with UID 101 and port 8080. Compose maps external 80 to 8080. Azure/local deployment scripts set ingress target 8080; external HTTPS does not change. The first transition may briefly interrupt frontend traffic while the port and revision switch. Rollback to an older frontend image also requires restoring target port 80.
- Runtime Alpine packages are upgraded during image builds; unused npm/Yarn tooling is removed from the backend runtime image.
- Face-service Pillow is pinned to 12.3.0 in runtime and test requirements.
- Gitleaks keeps its full history scan and default rules. The only allowlist entry matches the exact non-secret literal REPLACE_WITH_64_HEX_CHARACTERS from the example environment file. No historical credentials or private keys are allowlisted.

## Local validation

Both production npm audits report zero vulnerabilities. Backend: 1,032 tests passed, one pre-existing database boot test skipped locally. Frontend: 217 tests passed. Face-service: six tests passed. Builds and lint passed. Eight module/deployment guard tests passed. A separate Node runtime smoke verifies mail generation without delivery, an Excel data-bar/UUID round trip and actual HTML sanitization. CI now executes that smoke on Node 22 and tests the built frontend container as a non-root user at /healthz and /app/.

Container scans and the runtime container smoke require fresh hosted results; the local Docker engine is unavailable. No live service was modified.

## History findings still require owner verification

The previous scan flagged historical JWTs, report credentials and the GitHub App private-key file in commit 3ced35a1. These files are no longer tracked at HEAD, but deleting files does not revoke credentials. The user's reply 'proceed' did not confirm revocation. The history gate remains active; key/credential validity and revocation must be resolved before acknowledging historical findings or changing any baseline. Do not publish secret values in logs or comments.

References: https://github.com/nginx/docker-nginx-unprivileged and https://github.com/nodemailer/nodemailer/releases . Hosted evidence lives in the PR check runs; local reports are excluded from commits.

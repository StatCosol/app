# Monthly workspace — first upgrade release

Status: implemented in local source; not committed, deployed, or installed on client devices.

## Available workflow

Open **Monthly close** in the client, branch, or CRM navigation. Client and branch dashboards also provide a shortcut. Select an accessible company, branch, and reporting month.

The workspace consolidates:

- Attendance approval exceptions and unresolved attendance mismatches. Counts can overlap; missing attendance days and queued device punches are not inferred.
- Branch-specific payroll approval status. Branch payroll visibility settings are enforced; no salary amounts are exposed.
- Contractor requirement-to-submission reconciliation: company defaults, branch overrides (including explicit opt-outs), latest monthly submission, missing file references, expiry before period end, and pending/rejected reviews. Assigned contractors without configured requirements generate a setup action.
- Monthly returns plus non-monthly returns due within the selected month, with pending approvals, absent acknowledgment files, and missing filing dates surfaced.

Each action identifies a responsible role or recorded compliance owner. Links open existing source workspaces where available. Branch users are directed to their compliance team for return filing issues. Source screens retain their existing filtering behavior; confirm the reporting period there.

Search filters the displayed actions without altering totals. The outstanding-only switch can be turned off to inspect clear checks. Counts cover all matching rows; document and return action lists show at most 100 items and explicitly disclose truncation.

## Access and reliability

The API permits CLIENT, CRM, and ADMIN roles. Central access scoping validates both client authorization and branch membership. Only enabled service modules are queried. Branch payroll restrictions are checked before payroll records are queried.

Unconfigured/empty data and failed queries are not reported as completed. Failed requests clear previous screen results. Changing company, branch, or month cancels stale requests and removes previous results.

This is a live review, not a monthly lock, statutory certification, payment confirmation, or historical closing snapshot. Company-wide runs and returns are intentionally excluded from this branch-specific view and disclosed on screen. No database migration or new dependency is required.

## Validation

- Backend build and lint of changed backend files passed.
- 11 backend unit tests passed, covering access rejection, module restrictions, payroll visibility, missing data, partial failure, totals, and request validation.
- PostgreSQL 18 integration script passed against a dedicated temporary cluster using connection-local synthetic tables. It exercised tenant/branch/month isolation, replacement submissions, defaults and overrides, missing configuration, expiry, blank files, return evidence, and the 100-row display limit.
- 14 Angular browser tests passed across the monthly workspace and the two updated dashboards, including 8 new tests for loading, errors, empty data, search, input validation, request cancellation, and stale company/month responses.
- Frontend production build and lint passed.
- Production-bundle visual smoke tested at desktop and 390-pixel mobile widths using synthetic API responses, with no runtime errors or horizontal page overflow. Screenshots are included in this folder.
- Diff whitespace check passed.

## Boundaries and next enhancements

This release provides a shared review workflow and document-completeness reconciliation. It does not extract PDF/image contents, compare wage amounts against challans, verify government filings, record reviewer sign-off, or implement all twelve strategic recommendations. OCR and financial reconciliation need a separate evidence-processing workflow with provenance, confidence, and approval history. Broader portal redesign and the remaining roadmap items are still outstanding.

Existing face models, enrollment data, device endpoints, Android code, and APK versions are unchanged by this release. Earlier source fixes remain in the working tree separately. The client device has not been updated.

## Main source locations

- backend/src/monthly-close/
- backend/scripts/test-monthly-close-db.js
- frontend/src/app/pages/monthly-close/
- frontend/src/app/core/monthly-close.service.ts
- frontend/scripts/preview-monthly-close.cjs

The visual smoke script runs a short-lived localhost server and intercepts all API requests with synthetic responses; it sends no requests to production services. The database script targets only the dedicated localhost test port 55439 with the temporary test user.

## Subsequent upgrade

CSV wage-register amount reconciliation is now implemented separately in the payroll run workspace. See PAYROLL_RECONCILIATION.md for its scope and validation. The earlier boundaries above describe the first monthly-workspace release; PDF/image OCR and persisted sign-off remain outstanding.

# Wage-register reconciliation upgrade

Status: implemented locally, not deployed. Existing client APK and device APIs are unchanged.

## User workflow

Payroll users open **PayDek > Client > Payroll Runs**, select a processed, submitted, or approved run, and use **Compare a wage register**. Admin API access is also supported; the existing payroll portal route keeps its current role restrictions.

Download the CSV template, replace the sample row with actual register records, choose the file, and compare. Supported columns:

- Required: employee_code, period (YYYY-MM), gross_earnings, net_pay.
- Optional: pf_employee and esi_employee (employee contributions).
- Employee codes match exactly, preserving leading zeros. Each row must carry the selected run's month.
- UTF-8 CSV, maximum 1 MB and 5,000 employees. Use plain amounts with up to two decimal places, without grouping separators or currency symbols.

The review identifies missing/extra employees, mismatched amounts, and unknown values. It displays payroll/register totals, employee-level differences, CSV source lines, omitted fields, and the snapshot time. Search and pagination affect the display only; the JSON report includes every compared row.

## Correctness and access

Amounts are compared as integer paise. Blank source values and absent payroll values remain unknown, not zero. Duplicate employee codes, malformed CSV, wrong periods, unsupported files and oversized uploads are rejected. Empty or unprocessed payroll cannot produce a successful comparison. Matching totals do not override employee-level findings.

Only PAYROLL and ADMIN roles can call the endpoint. Payroll users must have access to the run's company through the central assignment scope; the company must have payroll enabled. Uploaded form data cannot override client or branch scope. Employee amounts are read only after these checks.

Run metadata and employee values are read in a repeatable-read database transaction. Reports include SHA-256 identifiers for the original uploaded bytes and the compared payroll baseline, along with the run, company, period, reviewer identifier and comparison time. Hashes identify inputs; they are not digital signatures or proof of document authenticity.

The feature does not update payroll, approve runs, store uploaded files, or send documents to an external AI service. Reports describe the captured snapshot; compare again after changing payroll or the register.

## Validation

- Backend and frontend builds passed.
- Changed backend files and frontend lint passed.
- 36 backend tests passed: parsing, exact arithmetic, missing values, duplicate/missing/extra employees, period checks, role/assignment/entitlement restrictions, source fingerprints, and HTTP upload limits.
- 13 Angular browser tests passed: 8 new reconciliation tests plus 5 existing payroll run tests. Covered multipart upload, changing files/runs, canceled requests, errors, format/size rejection, access, full report download and template period.
- PostgreSQL 18 / TypeORM integration passed using actual payroll entity mappings in an isolated disposable schema. Verified precision, null values, baseline fingerprint changes and no payroll mutation.
- Production-bundle desktop/mobile smoke passed using synthetic API responses, with no browser runtime errors or panel overflow. It exercised file selection, comparison and display of a one-paisa difference.
- Diff whitespace check passed.

## Remaining scope

This adds numeric CSV reconciliation beyond the earlier document-completeness checks. It is not OCR, PDF/image extraction, government filing verification, bank payment confirmation, employer-contribution reconciliation, persisted review/sign-off, or automatic discrepancy correction. Those remain separate enhancements.

## Locations

- API: POST /api/v1/payroll/runs/:runId/reconcile-register (multipart field: file).
- backend/src/payroll/reconciliation/
- frontend/src/app/pages/payroll/reconciliation/
- backend/scripts/test-payroll-reconciliation-db.js
- frontend/scripts/preview-payroll-reconciliation.cjs

The database integration script uses only the isolated localhost test port 55439/test user, creates a dedicated test schema, and removes that schema afterward. The visual smoke script intercepts API requests with synthetic records and sends nothing to production.
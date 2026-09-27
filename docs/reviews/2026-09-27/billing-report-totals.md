# Billing financial-report scope and export totals

## Scope

Backend-only follow-up after merged PR #702. No frontend, API payload, database
migration, production data, kiosk, APK, face-capture or attendance changes.

## Fixed

- The dashboard previously included draft/cancelled invoices in billed and
  outstanding amounts. It now shares the existing GST report's issued Tax
  Invoice definition with client, outstanding and paid financial reports.
- Drafts no longer appear as debt in client/outstanding reports. Zero balances
  no longer inflate the dashboard's pending-payment count.
- Proformas and credit notes are excluded from Tax Invoice financial metrics,
  matching the advanced reports. These are not net-of-credit-note ledger totals.
- The complete invoice register still shows every document type and status.
  Total-invoice, draft and approved document counts remain unchanged in scope.
- GST-detail exports repeat the invoice total beside each line for context.
  Their footer no longer sums that repeated value or unit rates. Outstanding
  reports no longer sum overdue days. Additive currency/quantity subtotals
  remain, and unique-invoice amounts remain on the Summary worksheet.

Dashboard amounts can decrease after deployment because non-issued documents
are excluded, not because records are removed or rewritten.

## Verification

- Backend build, changed-file ESLint and deep module check passed.
- Full backend suite: 252 suites / 2,074 tests passed, with one existing
  environment-dependent suite/test skipped.
- Expanded real PostgreSQL checks passed using synthetic mixed-status data:
  dashboard/report reconciliation, multi-line invoices counted once, zero
  balances, explicit draft-filter intersections, complete register retention,
  and immediate removal from financial totals after cancellation.
- Existing payment/edit concurrency, numbering, recurring retry and rollback
  database regressions also passed. The existing required billing CI step runs
  these checks, and the disposable database is dropped on exit.
- Workbook tests reopen the generated XLSX buffer and inspect summary values
  and footer formulas for multi-line invoices and outstanding reports.
- Frontend/browser tests were not rerun for this backend-only change.

## Remaining Review

- Invoice client changes without replacement items need tax-recalculation
  review; metadata-only edits also need snapshot-preservation review.
- Line-level SAC/search filtering versus invoice-level report summaries remains
  a separate review item, as do overdue-date/chart semantics.
- No credit-note allocation ledger, payment reversal workflow or historical
  invoice data repair is introduced. This is a focused report correction, not
  certification of all accounting or invoice-edit behavior.

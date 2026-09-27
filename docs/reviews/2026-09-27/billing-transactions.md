# Billing invoice transaction integrity

## Scope

Focused follow-up after Helpdesk PR #699. This is not a certification of the
entire Accounts & Billing module or the remaining application.

No kiosk, APK, face capture, attendance, production data, or migration changes.
No frontend or API route/payload changes. Existing ADMIN/ACCOUNTS guards remain.

## Fixed

- Invoice edits now lock the invoice before checking its payment state. Item
  replacement, invoice totals, and the edit audit log commit in one transaction.
- Approval and cancellation validate the latest locked state and update only
  their intended fields, without cascading stale item or payment snapshots.
- Cancellation also rejects recorded amounts/payment status when a historical
  invoice's workflow status does not reflect its payments.
- PDF-path updates retain the existing status-transition rules but check them
  under the same invoice lock, preventing a concurrent payment or cancellation
  from being overwritten with GENERATED.
- Added a required CI check using real TypeORM repositories and disposable
  PostgreSQL databases, independent of application connection settings.

## Verification

- Backend build and changed-file ESLint: passed.
- Full backend Jest: 252 suites passed, 2,056 tests passed, one existing
  environment-dependent suite/test skipped.
- Nine overlapping-operation database scenarios: passed. Covers payment then
  edit/cancel/PDF, full-payment then PDF, cancellation then payment/approval/PDF,
  edit then payment against the new total, and competing approvals. Each test
  confirms PostgreSQL actually blocks the competing request before release.
- Two forced database failures: passed. Rejected item insertion and rejected
  audit insertion restore the exact original invoice and item records.
- Deep module check and 13 module/release-check regressions: passed.
- All database records are synthetic. The test database is dropped on exit.
- Frontend browser tests were not run because this PR changes no frontend code.

## Remaining Billing Review

- Align UI action availability with backend rules: the invoice detail page
  currently offers cancellation for partially paid invoices and payment entry
  for drafts, although the backend rejects both.
- Review invoice-number allocation under concurrent creation, report totals,
  client changes/tax recalculation, and list filtering/pagination separately.
- Locking protects overlapping database writes, not optimistic revision checks
  for an old browser form. Cached PDF freshness during simultaneous editing is
  also outside this status-integrity change.

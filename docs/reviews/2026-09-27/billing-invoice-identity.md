# Invoice identity and edit-form consistency

## Scope

Focused follow-up to #704. Billing API and invoice create/edit form only.
No kiosk, APK, attendance, face-capture, production data, migrations or permission changes.

## Fixes

- Reject changes to an already numbered invoice's document type. The dedicated
  Proforma conversion workflow remains available and retains its separate numbering.
- Reject invoice-date changes across the saved financial-year boundary. Allow
  changes within the same year, including April 1 and March 31.
- Keep the assigned number, type and financial year unchanged during ordinary edits.
  Do not silently rewrite a legacy financial year during a remarks-only update.
- Disable document-type selection in the edit form and constrain the invoice date
  to its assigned year. Creation still permits all existing document types.
- Review correction: exempt the exact originally loaded legacy date from both
  the Angular year validator and native date-input bounds. Remarks-only edits
  remain possible without repairing history; any different out-of-year date is
  still rejected. Clearing the date remains invalid.
- Match the backend payment lock in the form, including a positive received amount
  with a stale UNPAID label.
- Normalize PostgreSQL numeric strings when loading editable line values and client
  defaults. Send a blank optional due date as null instead of an invalid empty date.
- Preserve service codes, periods and sequence values when resubmitting line items.
- Show server validation/save failures without discarding edits. Block duplicate
  submissions, disable the form during saving and unsubscribe when it is destroyed.
- Validate nonnegative discounts and GST rates between 0 and 100 in the form.

## Verification

- Backend build passed; changed backend files pass ESLint.
- Full backend suite: 2,092 passed across 253 suites, one existing test/suite skipped.
- Full Angular browser suite: 522 passed across 85 files, including 18 new invoice
  editor tests and the existing 31 invoice-detail component tests.
- After the legacy-date review correction, the focused invoice-editor browser
  suite passed all 22 tests, including four new legacy-date cases. These cover
  both sides of the year boundary, native input validity, remarks-only saves,
  rejection of another out-of-year date, in-year changes and exact restoration.
  The full suite above was run before this focused follow-up.
- Separate frontend Node suite: 92 passed across 16 files.
- Frontend production build and lint passed. Existing Sass deprecation warnings remain.
- Desktop (1440 px) and mobile (390 px) screenshots inspected; edit controls and
  server-error text stay within the viewport.
- Real TypeORM/PostgreSQL regression script passed with disposable synthetic data.
  New checks prove that rejected type/year changes leave invoices, items and audit
  records unchanged; same-year edits preserve invoice identity.
- Existing transaction, numbering, reporting and client-tax regression checks passed.
- Backend module wiring passed: 64 modules, 268 providers, 243 controllers.
- Temporary database dropped; isolated local PostgreSQL server stopped.
- Existing unrelated screenshot changes were preserved and are excluded from this PR.

## Boundaries and Next Review

- No renumbering or backfill of historical invoices. Already inconsistent historical
  numbers/types/years require a separate explicit remediation policy.
- This does not change the existing policy allowing unpaid issued invoices to be edited.
- Frontend preview uses existing environment configuration; no live billing actions
  were submitted. Browser tests use mocked APIs; database tests use local sample data.
- Next review: stale generated PDFs after edits, route-reuse/loading behavior of the
  create/edit form, inactive-client selection and remaining line-precision validation.
- No merge or deployment performed.

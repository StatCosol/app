# Billing invoice edit consistency

## Scope

Focused follow-up to #703. Backend billing only. No kiosk, APK, attendance,
face-capture, production data, database migration, permission or deployment changes.

## Fixes

- Preserve the invoice's saved GSTIN, recipient state and place of supply when
  the client is unchanged, including when the edit form sends the same client ID.
- Preserve the recorded GST split and default rate for same-client item edits
  instead of silently adopting changed client/supplier master settings.
- A client-only reassignment refreshes recipient details and recalculates the
  CGST/SGST versus IGST split using retained line amounts. It keeps line IDs,
  negotiated GST rates, reimbursement amounts and the invoice number intact.
  An explicitly supplied place of supply still takes precedence.
- When the client and items both change, honor the new client's default GST,
  including numeric zero. Creation now also preserves a numeric zero default.
- Persist the calculated `totalGst` alongside the component amounts on creation
  and financial edits. Previously this field was omitted from calculation output.
- Reject empty replacement item lists and edits with a positive recorded receipt,
  even when the stored payment-status label still says UNPAID.
- Keep snapshot changes, totals and the edit audit record in the existing locked
  transaction. A failed audit save rolls everything back.

## Verification

- Focused service tests: 39 passed across 3 suites, including 9 new edit regressions.
- Full backend suite: 2,083 tests passed across 253 suites; one existing test/suite
  remains skipped.
- Backend build and changed-file ESLint passed.
- Module wiring check passed: 64 modules, 268 providers, 243 controllers;
  no orphan services/controllers or missing delegate targets.
- Real TypeORM/PostgreSQL regression script passed against a disposable local
  database with synthetic records only. Existing transaction races, numbering
  races and reporting checks also passed.
- New database checks cover mixed 18%/5% lines, reimbursement lines, saved
  snapshots after master changes, client-only reassignment in both tax directions,
  complete edit-form payloads, zero GST, empty items, stale payment status and
  forced audit failure during reassignment.
- The temporary database was dropped and the local test server stopped.
- No frontend files changed; no new browser/UI test run for this backend-only PR.

## Boundaries and Follow-ups

- No historical backfill: remarks-only edits leave existing financial figures
  untouched, including any historical `totalGst` mismatch.
- This does not redefine mixed-rate header labels, reimbursement tax-base policy,
  credit-note accounting, or the business policy for changing issued invoices.
- Existing invoices do not store a supplier-state snapshot. Saved nonzero GST
  component rates identify their prior split; zero-rate legacy invoices fall
  back to the current supplier state and the saved recipient state.
- Review invoice-type/financial-year changes versus assigned invoice numbers,
  stale generated PDFs after edits, and the create/edit UI's validation and error
  feedback in a separate focused change.
- No merge or deployment is performed by this change.

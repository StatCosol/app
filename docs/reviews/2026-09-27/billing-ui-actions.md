# Billing invoice UI/API consistency

## Scope

Frontend-only follow-up on merged PR #700. No backend, database migration,
production data, kiosk, APK, face-capture or attendance changes.

## Changes

- Hide payment entry for drafts, cancelled/paid invoices, proformas and zero
  balances. Hide cancellation for invoices with payment status or amounts
  indicating recorded payments. Guard handlers as well as visible controls.
- Prevent duplicate or overlapping actions while a request or cancellation
  confirmation is pending. Display approval, cancellation and payment failures.
- Keep payment and email drafts on errors. Respect the email endpoint's
  `{ success: false, error }` response instead of closing the form as a success.
- Type the email response contract. Normalize payment amounts to numbers,
  validate amounts/deductions, and use the local calendar date for new payments.
  Label the gross settled amount consistently with the existing backend rules.
- Subscribe to invoice route changes, cancel obsolete requests and ignore stale
  confirmation dialogs. Clear stale invoice details when a refresh fails and
  provide a read-only retry.
- Keep existing converted tax invoices accessible. Bound modal height so mobile
  forms scroll instead of losing their bottom controls below the viewport.

## Verification

- 31 Chromium Angular TestBed tests passed with synthetic records and mocked
  service responses: invoice-state matrix, failed delivery and HTTP errors,
  validation, repeat submissions, stale reads/actions, route reuse and retry.
- Mobile (390px) and desktop (1440px) browser checks passed; inspected generated
  screenshots for invoice actions and the payment dialog.
- All 92 frontend service/utility tests passed. Billing component tests are
  discovered by the Angular runner rather than the Node-only service runner.
- Review follow-up: separated `vitest.angular.config.ts` (Angular browser runner)
  from `vitest.config.ts` (Node service runner). The installed Angular CLI ignores
  Vitest's include setting, but the separate files remove that shared-config
  ambiguity. The unfiltered `npm test -- --watch=false --reporters=verbose` run
  passed all 84 files / 504 tests, explicitly including all 31 billing component
  tests. The separate Node run still passed all 16 files / 92 tests.
- Complete production frontend build and frontend lint passed. Existing Sass
  deprecation warnings remain.
- No real emails sent, payments recorded or client data accessed. Backend tests
  were not rerun for this frontend-only change; CI retains its full backend suite.

## Boundaries

UI guards supplement, not replace, the existing server authorization and state
checks. Blocking repeat clicks is not server-side request idempotency, and an
aborted browser request does not undo a server-side operation already committed.
The current module has no payment-reversal workflow added by this PR.

Invoice-number concurrency, report totals and invoice edit recalculation remain
separate review items. This change does not certify the entire billing module.

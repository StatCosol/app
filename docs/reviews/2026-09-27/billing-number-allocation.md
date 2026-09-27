# Billing invoice-number allocation

## Scope

Backend-only follow-up after merged PR #701. No frontend, migration, production
data, kiosk, APK, face-capture or attendance changes. Existing numbers and the
16-character / 9,999-per-series generation limits remain unchanged.

## Confirmed Issues and Fixes

- Manual/recurring creation previously selected a number outside its save
  transaction. Conversion was transactional but did not serialize allocation
  with other invoices. Concurrent requests could select the same number and
  fail at the unique constraint.
- Allocation now requires an active transaction and holds a PostgreSQL advisory
  lock for the normalized prefix and financial-year series until commit.
  Creation saves the invoice and its items through that same transaction.
- Numeric maximum lookup replaces lexical sorting and partial parseInt parsing.
  Unpadded numeric suffixes count toward the series; malformed suffixes do not.
  Very large historical numeric suffixes produce the existing exhaustion error
  instead of overflowing a bigint cast. Historical records are not rewritten.
- Recurring creation locks its stable invoice ID and returns an existing record
  instead of allowing TypeORM save to overwrite/renumber it on a raced retry.
  A mismatched billing client is rejected. Paid invoice details are preserved.
- Financial-year selection uses UTC getters for UTC-parsed calendar dates, so
  server-local timezone does not move an April 1 date into the prior year.

## Verification

- Backend build, changed-file ESLint and deep module check: passed.
- Full backend suite: 252 suites / 2,067 tests passed; one existing
  environment-dependent suite/test skipped.
- Focused allocation unit suite: all 15 tests passed.
- Real PostgreSQL with real TypeORM repositories: existing nine overlapping
  invoice/payment scenarios and two rollback scenarios passed.
- Six additional controlled numbering races passed: manual/manual,
  conversion/manual, conversion/conversion, recurring/manual, repeated recurring
  ID, and two invoice types sharing a normalized prefix. The harness verifies
  the competing transaction waits for the first one to commit.
- Database checks also passed for paid recurring retry preservation, mismatched
  client rejection, numeric historical ordering, invalid suffixes, failed-create
  rollback without orphan items, 9,999 exhaustion and new-financial-year reset.
- These database checks extend the existing required billing CI step. Every
  fixture is synthetic and the disposable database is dropped on exit.
- Frontend tests were not rerun for this backend-only change.

## Boundaries and Next Review

No new series is automatically created after 9,999, and no manual invoice
submission idempotency key is introduced. A committed manual request retried
after a lost response can still create a different invoice with a new number.
Advisory locks coordinate application writers; direct SQL still relies on the
existing unique constraint. Billing report totals and invoice-edit tax/client
consistency remain separate review items.

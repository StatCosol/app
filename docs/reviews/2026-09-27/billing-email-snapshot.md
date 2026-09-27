# Invoice email and attachment snapshot consistency

## Findings and Scope

Follow-up to #705. Both PDF download routes and email attachments already render
a fresh PDF; they do not serve a cached attachment through these routes.

However, email delivery loaded the invoice separately from PDF generation. An
edit committed between those reads could produce old email amounts, dates or
references with a newly edited attachment. When no prior PDF path existed,
delivery also generated the PDF a second time unnecessarily.

This is a narrow backend billing change. No frontend, kiosk, APK, attendance,
permissions, database schema, production data or deployment changes.

## Changes

- Return the rendered invoice snapshot alongside the existing internal PDF buffer,
  filename and path result. The PDF HTTP controllers still send only binary data.
- Compose default email text, subject references and email-log content from that
  same snapshot. There is no additional invoice read in the email service.
- Remove the second PDF generation. Generation already makes its existing
  best-effort persistence attempt.
- Preserve explicit subject/body, recipient/CC/BCC choices and delivery outcomes.
- Every later request still reads the latest invoice; no new snapshot cache.

## Verification

- Nine focused service regressions passed, using synthetic invoice data and mocked
  email transport/filesystem writes. The real PDF orchestration is exercised;
  the renderer returns identifiable test bytes so its input can be compared with
  the email and log. No real email was sent and no invoice PDF was written.
- Tests cover single-read/single-render behavior with and without an existing PDF,
  an edit immediately after the initial read, freshness on the next request,
  internal return compatibility, custom email content, render failure, rejected
  or skipped delivery, and transport exceptions.
- Backend build and changed-file ESLint passed.
- Full backend suite: 2,101 tests passed across 254 suites; one existing test/suite
  remains skipped.
- Module wiring check passed with no orphan services/controllers or missing targets.
- PDF rendering/layout code, database writes and public response shapes are unchanged.
  No new visual PDF or real database run was needed for this orchestration-only change.

## Remaining Boundaries

- This guarantees consistency within one email, not that an in-flight email is
  cancelled when someone edits the invoice afterward. It does not lock editing
  during external email delivery.
- Concurrent PDF renders can still overwrite the same disk filename. Revisioned
  persistence and invalidation of stored paths after edits remain separate work.
- Existing PDF best-effort disk persistence and email success/logging failure
  semantics have not been redesigned here.
- No merge or deployment performed.

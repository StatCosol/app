# Helpdesk attachments and loading reliability

Focused follow-up to merged PR #698. No kiosk, APK, face-capture or attendance implementation changes; no production data edits or migrations.

## Changes

- Admin and PF Team message threads now show attachment filenames and download controls. A shared component downloads through the existing authenticated files endpoint and preserves the original filename. No public storage links or token-bearing URLs are introduced.
- Download failures remain visible and retryable. PF Team attachment controls remain disabled until the ticket is assigned to that user, matching the existing backend file policy.
- Ticket and message loading failures are distinct from empty results. Read-only retries do not repost messages. A failed message send retains its draft.
- Detail pages cancel previous ticket/message/action subscriptions when the route changes or the component is destroyed, preventing late replies from updating another ticket's screen.
- Admin ticket-list requests cancel superseded filters/pages. Stats errors remain separate from list errors, failed loads clear stale rows, and a page that disappears after records change is reloaded at the last valid page.
- Admin pagination rejects invalid page/limit values, keeps the existing 100-row page-size ceiling, and uses ticket ID as a deterministic secondary sort for matching creation timestamps.
- PF Team displays 20 filtered tickets per page, with previous/next controls and explicit loading/error/retry states. Filtering uses the entire existing API result, not only the displayed page.

## Verification

- Backend production build and frontend production build passed.
- Full backend suite: 252 suites and 2,035 tests passed; one existing environment-dependent test skipped.
- All 37 focused Helpdesk browser tests passed. They include authenticated download requests, encoded filenames, blob download behavior, denied/duplicate downloads, route changes during requests, retries, page recovery, and complete PF filtering/pagination.
- Long attachment names were checked at 390px and 1440px, including Playwright screenshots and horizontal-overflow assertions.
- Backend changed-file lint, frontend lint, and module wiring checks passed.
- The existing CI-backed Helpdesk PostgreSQL regression now also verifies attachment ownership for Admin, Client master/branch, PF Team, CRM and Employee identities. Cross-client access, missing branch membership, other employees, other PF users, revoked CRM assignments and revoked branch membership are denied.
- All 123 synthetic tickets with identical creation timestamps were returned exactly once across pages of an unchanged database fixture. The 100-row maximum was also verified.
- Database checks used a disposable loopback PostgreSQL database, which was removed afterward. The local test cluster was stopped.

## Boundaries

- Client/employee list and message response formats, APK-facing behavior, file authorization rules and shared download infrastructure are unchanged. This does not require an APK update.
- PF pagination is client-side over the existing complete array response. It limits rendered rows, not database/network volume. Server-side PF pagination can be a separate backwards-compatible change if ticket volume requires it.
- Admin paging remains offset-based, not a historical snapshot. A changing live queue should be refreshed; the stable sort prevents ties from shuffling an otherwise unchanged dataset.
- Browser HTTP tests use synthetic responses; access decisions were additionally verified against real local PostgreSQL. No live client attachments were downloaded or edited.
- Accounts & Billing and other remaining modules have not been certified by this Helpdesk PR. They remain separate review batches.
- Existing Sass deprecation warnings remain; the build succeeds.

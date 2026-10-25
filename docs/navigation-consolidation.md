# Page-purpose navigation consolidation

This release removes repeated editing implementations and connects related views without changing database schemas, stored documents, backend authorization, module entitlements or workflow ownership.

## Canonical workspaces and compatible links

- Client Monthly Compliance: both existing upload URLs use ClientMcdComponent. The old `/client/compliance/mcd/uploads` URL retains its additional branch-user guard. The editor still restricts writes to branch users.
- Branch Audits & Evidence: `/branch/audits/evidence` redirects to `/branch/audits`; the destination retains the audit-module guard. Queries and fragments survive.
- CRM submission review: client Documents and Compliance Tracker use the same component. The client ID is resolved through route ancestors and pinned in document requests. The duplicate client-overview card is removed; bookmarks still work. Search, file URLs, pending-state decisions and rejection notes are retained.
- Client Returns & Filings: one sidebar entry and Filings / Status / Summary navigation. Branch and period travel in the URL. Status opens the exact filing with a clear way back to the full list. Summary is explicitly labelled company-wide and all-period; it is not represented as a filtered branch report.
- Registrations & Renewals: registration records, upcoming expiry dates and renewal tasks remain separate views with clear names and cross-navigation.
- Document discovery: client, branch and client-scoped CRM workspaces explain document categories. Client and branch links obey module visibility. Existing route guards remain authoritative.
- Payroll: client selection states its destination, and configuration pages explain their scope with client-pinned links. Existing formula editors, versions and calculations are preserved; this release does not migrate or silently replace payroll configuration records.
- Reports: audit, CRM performance, payroll, branch and executive report links have contextual names.

## Preserved workflow distinctions

Auditor review remains distinct from client evidence submission. Attendance capture, review and device setup remain distinct. Finance invoices, payment receipts and collections remain distinct. Tasks, notifications and escalations retain their original owners and actions. Existing redirect aliases and historical files remain available. No legacy source file is deleted solely because a route no longer imports it.

## Verification

- Production Angular build and lint.
- Frontend unit suite and navigation compatibility contracts.
- Real Chromium tests for branch/period handoff, exact filing links, guarded audit aliases, permission-filtered category links, and 390 / 768 / 1280 px layouts.
- Repository release checks must pass before merging. Verify the deployed revision and public application after deployment. Signed-in production testing must use an authorized account and a designated test record; do not submit synthetic evidence to real client work.

## Additional deep review

- Exact filing links no longer normalize or filter by the display return code. Older links containing both filing ID and code also resolve by identity, including GRATUITY_FORM_LM and CLRA_FORM_XXV.
- Leaving exact filing focus clears the hidden type restriction and reloads the full filtered list.
- Returns views respond to query-only navigation. Superseded requests cannot replace a newer branch selection; failed status loads clear stale rows and offer retry.
- Client-scoped CRM expiry requests include the selected client ID. Portfolio-wide counters are not displayed under a client heading.
- Shared CRM lists accept array, data and items response envelopes used by the older screen.
- Fifteen targeted Chromium regressions pass after these changes; production build and lint are repeated before publishing the update.

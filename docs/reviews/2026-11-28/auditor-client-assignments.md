# Auditor assigned-client navigation — 28 November 2026

The assignment page now groups the auditor's existing assignments by client, then branch. Opening a branch lists its individual contractor/type/period audits. Opening a row goes directly to that audit, without the separate scope-selection form.

The dashboard's long audit dropdown is replaced with one choice per assigned client. A synthetic reproduction of the supplied screenshot verifies that 35 assignments become one client choice, which opens that client's branches. Branch audits use readable cards instead of a narrow multi-column table.

Filters are collapsed by default with an active-filter count. Assignment selection is preserved in the URL and passed through the workspace's Back action. Exact assigned document scope is selected automatically; legacy audits without a branch still require an explicit choice. Separate branch/contractor reports and existing authorization remain unchanged.

## Verification

- [x] One client entry for multiple branch/contractor/period assignments.
- [x] Client → branch → exact audit interaction, including UNH/Arax synthetic fixtures.
- [x] All 13 audit types remain available in the assigned branch.
- [x] Branch change clears the previous contractor selection.
- [x] Client/branch/contractor/period selection survives return and reload.
- [x] Actual/test scope isolation, pagination and stale-response checks.
- [x] Failed loads show Retry without losing selection or broadening scope.
- [x] Exact branch/contractor document selection and workspace Back context.
- [x] First-click sidebar navigation and a single active menu item.
- [x] Responsive rendered checks at 390, 768 and 1440 pixels (sidebar also 1280).
- [x] Production frontend build; existing Sass and bundle-size warnings remain.
- [x] PR #892 release checks and reviewer approval; merged as `1a2e6c66c8da98c8b6d35b6dbde972402f6c3140`.
- [x] Deployment succeeded: https://github.com/StatCosol/app/actions/runs/46132800262.
- [x] Live read-only desktop, tablet and mobile navigation and document preview checks.

All browser tests use in-memory synthetic responses. No live test records were created, and no client, balance, assignment, evidence or FaceDesk data was changed. The separately reported residual test entries in the live audit portal still require exact record identification; this navigation change does not delete them.

## Live retest after deployment — 28 November 2026

Verified through the existing signed-in Auditor browser session. Desktop used the normal browser viewport (1536-pixel screenshot); tablet/mobile used Edge responsive emulation at 768 × 800 and 390 × 800, not physical devices.

- Dashboard groups 35 active audit choices into ITC (31) and Vedha (4), instead of the original long per-audit dropdown.
- ITC opens branch cards. Head office opens eight separate contractor/period audit cards. Only Assigned Clients is selected in the menu.
- Desktop: UNH August `AUD-2026-002` opens the correct head-office and contractor scope automatically; eight documents appear. The existing UNH August PF challan PDF rendered successfully.
- Tablet: Client → ITC → head office → Arax August `AX-2026-EFE4102DD971` works. Six Arax documents appear, separate from UNH. The existing four-page Arax August ESI PDF rendered successfully.
- Mobile: the menu closes on the first Assigned Clients click. Client → branch → audit cards fit the viewport. Selecting August reduces the branch list to two audits. Arax opens with the correct automatic scope and six documents; its PDF renders and Next page moves from page 1 to page 2.
- Back navigation and reload retain ITC, head office and the August filter. Normal desktop view restored after checks.
- No approval, rejection, remarks, upload, submission, start-status mutation or other record writes were performed. Existing audit statuses remained visible as Planned/In Progress. FaceDesk was not opened or modified.

Follow-up found: October Arax assignment `CA-5a40147b42804c5f9` has no document rows. Its scope header is correct and the queue correctly shows zero documents, but the preselected branch and contractor dropdown labels are blank because their options were built only from uploads. The follow-up supplies the assigned scope labels even when there are no uploads; it does not add document rows or broaden the filter.

- [x] Follow-up: nine isolated document-filter tests pass, including rendered empty-scope labels, uploads arriving later, branch/group changes and legacy unassigned audits.
- [x] Follow-up production frontend build passes (existing Sass and bundle-size warnings only).
- [ ] Follow-up empty-upload scope-label fix deployed and live retested.

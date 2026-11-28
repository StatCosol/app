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
- [ ] GitHub release checks and reviewer approval.
- [ ] Deployment and live portal confirmation.

All browser tests use in-memory synthetic responses. No live test records were created, and no client, balance, assignment, evidence or FaceDesk data was changed. The separately reported residual test entries in the live audit portal still require exact record identification; this navigation change does not delete them.

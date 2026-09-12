# My Work release — 12 September 2026

Status: implemented and verified locally. Not published or deployed.

## Delivered

My Work is available from the navigation in nine portals: Client/LegitX, Branch Desk, Contractor, CRM, Auditor, Payroll, CCO, CEO and Admin. Existing landing dashboards remain available.

The shared page provides company, branch, due-month, work-area and title filters. Filters are retained in the URL, including browser navigation. Changing company clears the branch selection; changing a filter resets pagination. Changing scope cancels the previous request and clears stale results.

Six status views expose active, overdue, due within seven days, returned for correction, closed and all tasks. Counts and the selected list come from the same filtered database snapshot. Active, overdue, soon and returned overlap intentionally; cancelled tasks appear only in All. Deadlines use the Indian operational date. Empty and failed states are distinct.

Results include company and branch names, priority, status, due date, contextual next-step guidance and links to supported existing work areas. Desktop and mobile layouts were visually reviewed. Source approval remains a separate workflow: this page grants no new approval, reopening or editing authority.

## Scope and efficiency

The new versioned tasks/workspace endpoint reuses the existing task authorization rules. It checks explicit company and branch filters, then derives the permitted queue from the current user. Multiple assigned branches are retained; an empty branch assignment returns no records. Contractor queues retain contractor identity restrictions. CCO and Payroll retain managed/assigned company restrictions.

The server computes counts, facets and pagination in one query and returns at most 200 items (25 in the page). Search values are parameterized. Pagination is bounded to the available pages. Filter options describe companies and branches with tasks in the permitted queue.

## Verification

- Backend: 186 suites passed; 1,161 tests passed; one environment-dependent suite/test skipped.
- Frontend: all 47 test files and 257 tests passed, including five My Work browser tests.
- Backend and frontend production builds passed. Existing Sass deprecation warnings remain.
- Changed TypeScript and frontend templates passed lint; whitespace checks passed.
- Module wiring check found no orphan controllers/services or broken delegate targets.
- Real PostgreSQL fixture passed all six view/count comparisons, multiple/empty branch assignment checks, foreign-branch rejection, company/branch facets, literal search, due-month filtering and page bounds.
- A 5,000-task fixture returned a 25-item page with matching totals; the measured local query took 36 ms. This is a fixture measurement, not a production performance guarantee.

Reproduction: build the backend, start a disposable local PostgreSQL database on port 55439 with the test identity declared in backend/scripts/validate-my-work.cjs, then run that script. It creates and removes its own isolated schema and does not read production credentials.

Screenshots: [Desktop](../../reviews/2026-09-12/my-work-desktop.png) · [Mobile](../../reviews/2026-09-12/my-work-mobile.png)

## Remaining roadmap boundaries

This release covers the existing system task queue. It does not claim to reconcile every statutory obligation, payroll figure, evidence item or audit finding with source records. Work-area links lead to existing module pages, not necessarily the individual source record.

ESS, PF Team, Accounts and Sales do not receive this page in this phase. Existing dashboard/task-summary APIs remain available. Cross-module filters have not been retrofitted into every older page.

Next-step guidance here is deterministic. This phase adds no new AI integration; the previously implemented LegitX gap explanation remains separate. Evidence-linked AI recommendations, complete statutory reporting and broader workflow modernization remain on the project roadmap.
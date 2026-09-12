# Client / LegitX and Branch Desk review — 12 September 2026

Reviewed both portal route sets and traced dashboards, compliance status/tasks, branch registrations, documents, assigned-branch access and existing AI services. The earlier appraisal fixes remain in merged PR #645; that release has successfully deployed and passed backend/frontend health checks.

## Corrections

1. Shared LegitX scope now uses the established access service, checks current branch mappings against the company, recognizes Branch Desk, rejects missing mappings and cross-company branch requests, and restricts assignment-scoped staff. Unfiltered branch requests preserve every assigned branch.
2. Dashboard queries and metadata honor that scope, including payroll employee rows inside company-wide runs and branch audits. Low-compliance queues no longer examine only the ten highest-ranking branches. Audit counts use the selected month/year and no longer double-count overdue audits in the completion denominator.
3. Compliance branch risk includes actual open audit observations instead of an empty placeholder map. Audit averages read the maintained audit score field.
4. Database failures return unavailable responses rather than successful zero totals. Client dashboard widget failures expose a retry state. Branch document loading preserves the previous result and reports failure when any assigned branch cannot load.
5. Branch registrations have an explicit assigned-branch selector and retry state. Changing branches clears the previous selection and cancels the pending workspace load.
6. Compliance task lists support paging beyond the first 100–500 records. Distinct recurring tasks are retained instead of being collapsed by compliance/branch. Links honor the selected month, year, branch and task status. Multi-branch status views default to all assigned branches.

## Compliance assistant

Both dashboards provide **Explain my gaps**. The endpoint resolves user scope before loading overdue, rejected, pending and in-progress tasks. It returns a prioritized sample of up to 12 tasks with recorded evidence, suggested next steps and links to the filtered task workspace.

The implementation reuses the existing configured AI provider and usage tracking. Only selected task facts are sent for explanation; employee, payroll and document contents are not included. Provider output cannot add task IDs or change navigation targets. Angular renders explanations as text. Explanations are advisory; no evidence, approval, closure or other business record is changed. Requests are rate limited, and changing UI scope cancels the pending request and clears old results.

If AI is unconfigured, unavailable or produces invalid output, an explicitly labelled evidence-based action plan remains available. No new provider credentials were added or exposed. Actual hosted-provider generation was not exercised; provider behavior is covered with controlled response tests. Existing production AI configuration determines whether AI explanations are available after deployment.

## Verification

- Full backend: 1,077 tests passed across 179 suites before the final paging regression; focused final backend: 22 tests passed across four suites.
- Full frontend: 246 tests passed across 44 files before the final paging regression; final focused browser checks cover five workflows.
- Backend and frontend production builds passed. Existing frontend Sass deprecation warnings remain.
- Module graph: 63 modules, 253 providers and 237 controllers; no wiring gaps.
- Real disposable PostgreSQL checks passed for live assignment scope, cross-company denial, payroll employee filtering, audit period/count calculations and recurring-task paging. All entity metadata and connectivity passed the separate database boot check. The disposable schema and server were cleaned up.
- Repeatable database check: backend/scripts/validate-client-branch-db.cjs.

This was a code and workflow review with regression and database testing, not an exhaustive live session for every permission combination. No pending customer compliance record was automatically marked complete. These new changes require review and deployment; the prior PR #645 is already live.
## PR #646 review follow-up

- Replaced the invalid audits.period_month reference with period_code matching for monthly, quarterly, half-yearly and annual periods covering the selected month. The PostgreSQL fixture now uses period_code and checks AuditEntity metadata; the earlier fixture incorrectly included period_month and therefore missed this defect.
- Payroll runs are filtered to the allowed branch set (plus company-wide runs) before aggregation. All applicable runs are included, with employee-level branch filtering retained; no arbitrary LIMIT 1 selection remains.
- Task-center summary, items, overdue and expiring endpoints preserve all assigned branches when no explicit branch is selected. Empty branch sets return no rows. Explicit branch selections remain validated.
- Task summary and task items now share the dashboard subscription, so branch/month changes and component destruction cancel the entire request group. Stale task responses cannot replace the current selection.
Verification of the follow-up: 31 focused backend tests, the browser request-cancellation regression, backend build and both affected lint checks passed. PostgreSQL checks passed for actual audit period_code metadata and period coverage, multiple assigned payroll runs (including company-wide, cancelled and unassigned cases), and combined task-center summaries/items. No migration is required.

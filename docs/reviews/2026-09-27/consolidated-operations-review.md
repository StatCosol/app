# Consolidated operations review

Branch: `codex/billing-email-snapshot-20260927`. Integration target: PR #706.
These are the initial operations review notes, before final integration. See `consolidated-review.md` for the subsequent AI/KPI fixes and full-suite/database verification. This is an entrypoint review with focused fixes, not an end-to-end certification of every module.

## Fixed issues

- Calendar: branch users with no assignments previously fell through to company-wide event queries. Empty branch scope now returns no events; requested branches and CRM/CCO companies are checked through the existing OperationalScopeService. No shared access code changed.
- News: authenticated readers could open inactive or expired articles by ID despite those items being hidden from the feed. Detail reads now return 404; administrators retain preview access.
- Reports: CCO compliance, overdue-audit and assignment-health JSON/XLSX queries now filter to assigned companies, including an empty assignment set. PDF compliance, risk and DTSS downloads explicitly check company access. Branch users are denied these company-wide PDFs because the existing generators cannot restrict branch aggregates. Global ScopeGuard already protects many explicit CRM/client IDs; this fix addresses the additional CCO and branch-level gaps.
- Overdue-audit JSON and XLSX reports now exclude CLOSED/CANCELLED audits as well as COMPLETED, and treat date-only deadlines as overdue after their due day rather than from midnight on that day.
- AI: reviewing an observation by ID now validates the stored company/branch ownership and CCO company assignment before mutation. Previously, that route had no clientId for the global ScopeGuard to inspect.
- LegitX: CCO dashboard/compliance scope now resolves assigned companies, including when a branch ID indirectly selects the company.

## Coverage actually achieved

| Area | Review depth this pass |
| --- | --- |
| Calendar, news, reports | Controller/service inspection, selected frontend API consumer comparison; new focused regression tests. XLSX tests serialize and reopen real workbooks with mocked database reads. PDF rendering is mocked. |
| AI, LegitX | Selected controller/service and scope inspection; focused observation-review and CCO scope tests. Existing LegitX branch regression suite rerun. No AI provider calls. |
| Audits, auditor, audit logs | Entrypoint role/scope scan; sampled audit KPI and auditor dashboard controller; admin audit-log list. Read existing AuditXpert review notes, but did not rerun their workflow/database evidence. |
| Automation, helpdesk, escalations, SLA, task center | Sampled control-center/helpdesk/notification entrypoints and queue/scope paths; read escalation/SLA scoped query and mutation logic. Existing review notes are background only, not verification performed here. |
| CRM, CCO, CEO, dashboards | Role/scope entrypoint scan and sampled dashboard/controller delegation; selected role routes inspected. No full dashboard SQL reconciliation or browser test. |
| Sales | Controller/service access checks and frontend role routes sampled. No sales workflow tests rerun. |
| Performance appraisal | Controller role scan and appraisal scope guard inspection. No workflow or rating tests rerun. |
| Contractor | Sampled profile/task/document and CLRA entrypoints only. Excluded employee/attendance/payroll/computation paths and attendance-adjacent contracts. |
| Cleanup, files, email | Read retention cron, download controller, and email configuration entrypoints. No cleanup executed, no files downloaded, no email sent. Billing email ownership remains with parent. |

## Verification

- Nine focused Jest suites passed, 63 tests total: the five new specs below plus `calendar.service.spec.ts`, `news.service.spec.ts`, `reports.service.spec.ts`, and `legitx/client-branch-regressions.spec.ts`.
- The calendar/news/reports service specs are construction smoke tests; they do not prove workflow correctness. New specs cover denials, allowed reads/mutations, empty scopes, report query predicates and workbook serialization. Database access is mocked.
- Changed-file formatting completed. Final lint and whitespace check results are reported with the handoff.
- No full builds, full Angular suite, browser tests, production calls, provider calls, database migrations, commits or pushes.

## Residual risks and follow-up

- Branch-scoped PDF generation remains unsupported; branch users now receive 403 for company-wide PDFs. The existing frontend shows a generic download failure. No shared aggregation code or frontend was changed.
- Other AI routes still warrant deeper CCO/record-ownership review: platform risk summaries/high-risk lists, insight dismissal, observation generation and ID-based reads. Do not treat this observation-review fix as an AI-wide authorization sign-off.
- Audit KPI branch-ID access and auditor evidence mutation deserve deeper scope/concurrency testing. Only entrypoints were sampled here.
- Retention cleanup makes sequential deletes without a wrapping transaction. Foreign-key failure/partial cleanup behavior was not reproduced; no cleanup changes were made.
- File download identity reconstruction, public news attachments, calendar date-range/timezone behavior, and orphaned upload cleanup were not validated end to end.
- CCO company restrictions reuse OperationalScopeService/getCcoClientIds conventions already used by operations modules. Integration should validate these against real assignment fixtures. No real PostgreSQL authorization test ran here.
- Other agents' changes are present in the shared worktree. Only the following files belong to this pass.

## Exact files

Modified:

```text
backend/src/ai/ai.controller.ts
backend/src/calendar/calendar.controller.ts
backend/src/calendar/calendar.module.ts
backend/src/legitx/legitx-scope.service.ts
backend/src/news/news.controller.ts
backend/src/reports/assignment-report.controller.ts
backend/src/reports/audit-report.controller.ts
backend/src/reports/compliance-report.controller.ts
backend/src/reports/pdf-report.controller.ts
backend/src/reports/report-export.controller.ts
backend/src/reports/report-export.service.ts
backend/src/reports/reports.module.ts
```

Added:

```text
backend/src/ai/ai-observation-review-scope.spec.ts
backend/src/calendar/calendar.controller.spec.ts
backend/src/legitx/legitx-cco-scope.spec.ts
backend/src/news/news.controller.spec.ts
backend/src/reports/report-scope.spec.ts
docs/reviews/2026-09-27/consolidated-operations-review.md
```

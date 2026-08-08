# God Service Refactor Status

Large services are being split into focused injectables. **Controllers unchanged** — god services delegate to extracted services.

## Completed extractions

| Original | Extracted service | Methods moved |
|----------|-------------------|---------------|
| `payroll.service.ts` | `payroll-client-scope.service.ts` | `getAssignedClientIds`, `assertPayrollAccessToClient` |
| `payroll.service.ts` | `payroll-query.service.ts` | 6 query/ticket methods |
| `payroll.service.ts` | `payroll-fnf.service.ts` | 10 F&F + document methods |
| `payroll.service.ts` | `payroll-registers.service.ts` | 13 register list/upload/download/approval methods |
| `payroll.service.ts` | `payroll-input.service.ts` | ~19 input/template methods |
| `compliance.service.ts` | `compliance-reupload.service.ts` | 17 reupload + CRM backlog methods |
| `compliance.service.ts` | `compliance-dashboard.service.ts` | CRM/contractor/auditor/admin dashboard KPIs |
| `compliance.service.ts` | `compliance-crm-tasks.service.ts` | CRM task workflow methods |
| `compliance.service.ts` | `compliance-portal-tasks.service.ts` | Client/contractor/auditor/admin portal task APIs |
| `audits.service.ts` | `audit-nc.service.ts` | 9 NC list/review/upload methods |
| `audits.service.ts` | `audit-checklist.service.ts` | `generateChecklistFromCompliance` |
| `audits.service.ts` | `audit-auditor-dashboard.service.ts` | preliminary PDF, submission history, auditor dashboard |
| `audits.service.ts` | `audit-listing.service.ts` | CRM/auditor/contractor/client listings + branch KPIs |
| `audits.service.ts` | `audit-document-review.service.ts` | Document list/review, NC auto-link, rejection notifications |
| `audits.service.ts` | `audit-report.service.ts` | `exportReportPdfForAuditor`, `getReportForAuditor` chain |
| `payroll.service.ts` | `payroll-runs.service.ts` | Run lifecycle: create, list, process, seed utilities |
| `payroll.service.ts` | `payroll-payslips.service.ts` | Payslip PDF/archive/zip/listing + leave/attendance enrichment |
| `payroll/` (prior work) | `payroll-setup.service.ts`, `payroll-processing.service.ts`, `payroll-reports.service.ts`, `payroll-approval.service.ts`, engine/* | Setup, processing, reports, approval |

## Pattern

```typescript
// payroll.service.ts — thin delegate
async listQueries(user: ReqUser, q: Record<string, any>) {
  return this.queryService.listQueries(user, q);
}
```

New features should be added to extracted services first; god service only forwards.

## Extraction scripts

Reusable scripts live in `backend/scripts/`:

- `extract-payroll-fnf.js`, `replace-payroll-fnf-delegates.js`
- `extract-payroll-registers.js`, `replace-payroll-registers-delegates.js`
- `extract-payroll-input.js`, `replace-payroll-input-delegates.js`
- `extract-audit-nc.js`, `replace-audit-nc-delegates.js`
- `extract-audit-checklist.js`, `extract-audit-auditor-dashboard.js`, `replace-audit-extract-delegates.js`
- `extract-audit-report.js`, `replace-audit-report-delegates-v2.js`
- `extract-compliance-dashboard.js`, `extract-compliance-crm-tasks.js`, `extract-compliance-portal-tasks.js`, `replace-compliance-delegates.js`, `replace-compliance-portal-delegates.js`
- `extract-audit-listing.js`, `replace-audit-listing-delegates.js`
- `extract-audit-document-review.js`, `replace-audit-document-review-delegates.js`
- `extract-payroll-runs.js`, `replace-payroll-runs-delegates.js`
- `extract-payroll-payslips.js`, `replace-payroll-payslips-delegates.js`

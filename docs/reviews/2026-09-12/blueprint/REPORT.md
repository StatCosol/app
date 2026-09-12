# StatComPy operating blueprint: implementation and remaining work

Date: 2026-09-12. Baseline: merged PR #646, commit 6bb82cf6.

## Scope and status

The supplied blueprint is the product acceptance direction. It spans a multi-module programme; this change implements contractor payroll authority and records the remaining requirements. Existing module directories and screens establish implementation presence, not proof that every requirement is complete. This report does not certify statutory accuracy, production deployment, or full blueprint completion.

## Contractor payroll controls implemented

- Contractor attendance produces a draft revision. Every successful recalculation preserves the previous snapshot and atomically replaces current computation rows; a failure leaves existing payroll intact.
- Contractor submits. Assigned CRM approves or returns. An assigned auditor independently verifies/locks or returns. A creator or CRM approver cannot subsequently act as the verifying auditor, including after a role change.
- Submitted/approved/verified payroll cannot be recalculated. Admin or CCO must record a reopening reason for approved/verified payroll. Recalculation then creates a new draft requiring fresh submission, CRM approval and auditor verification.
- Review actions record actor, role, time and reason. Prior revision events remain available in history. Current snapshots are retained when superseded.
- Clients, branches, auditors, CCO and CEO see approved payroll only. Contractor sees its own payroll; CRM remains assignment scoped. Empty branch assignments deny access. Historical unversioned computations are treated as drafts, never inferred to be approved.
- CRM approval fails with unresolved wage exceptions or negative net pay. Contractor uploads cannot override rates, wage components, PF ceiling settings or deductions. Nonzero monetary/OT adjustments require a future controlled adjustment flow and currently receive a clear error.
- Attendance requires a deployment branch, valid month, unique employee codes, valid payable days and a matching active employee. Name substitution for an unknown code is blocked. Skill is taken from employee master. Employment dates limit payable days.
- Payable daily wages use the CRM rate. Missing/below-configured-minimum rates remain exceptions for correction. No statutory contribution rates or slab tables were changed.
- Existing rate records cannot be overwritten. A new effective date creates a new rate; concurrent uploads of the same key are serialized. This is effective-dated daily-rate control, not the full component/work-order rate master below.
- Approved working workbook: payroll, attendance, PF, ESI, PT/LWF workings, exceptions and review trail. This is explicitly **not** the complete statutory register/payment evidence/certificate pack requested by the blueprint.
- Review controls appear in Contractor, CRM, Auditor, Client and Branch payroll screens. CCO and Admin approval screens provide company selection for controlled reopening.

## Rollout

The deployment runner now includes `backend/migrations/20260913_contractor_payroll_authority.sql`, so the tables are created before the new backend is released. For a manual deployment, apply that migration first. The migration creates version/event tables and unique current/revision indexes. It is repeatable. Existing calculations remain drafts; contractors regenerate and submit them to establish a recorded version. Deploy frontend and backend together. No production database was modified during validation.

## Remaining acceptance backlog

| Module / flow | Existing implementation evidence | Remaining blueprint acceptance work |
|---|---|---|
| Admin | `backend/src/admin`, `masters`, `applicability`, `assignments`, `service-entitlements` | Validate state/law/headcount/work-order applicability configuration end to end; ensure effective-date changes trigger reassessment. |
| LegitX | `backend/src/legitx`, client pages; scoped dashboards and gap assistant merged in #646 | Consolidated verified-compliance status must reconcile to audit closure and source evidence across all document classes. Test hosted AI provider configuration. |
| BranchDesk | `branches`, `branch-compliance`, branch pages; multi-branch scope fixed in #646 | Configurable branch attendance confirmation before contractor submission; consistent employment/deployment and headcount data across screens. |
| ConTrack | `contractor`, contractor employees, document requirements, CLRA, new payroll workflow | Work-order/designation/component-based monthly rates; approved variable adjustments/OT; contractor-specific payroll score; employee transfer/exit period handling and final settlement; rate revision request/reason/evidence approval UI. |
| PayDek | `payroll/payroll-approval.service.ts` currently uses processor → CCO approval | Blueprint requests CRM review and client confirmation before lock. Reconcile these workflows without weakening existing CCO gates; connect contractor calculations to the shared canonical run/employee model. |
| Payroll statutory engine | Existing PF/ESI calculators and shared state slab service | Validate membership/EPS ceiling and contribution-period ESI continuity, monthly proration and effective-date rate splits against configured legal rules and official sources. No certification in this change. |
| CRM | `crm`, `crm-documents`, `monthly-documents`, assigned-client controls | Prove complete MCD returned/reuploaded/approved → auditor-verified lifecycle; link payroll exceptions to assigned tasks and communication history. |
| AuditXpert | `audits/auditor-observations.controller.ts` restricts observations to assigned auditors; audit report service | Link each payroll verification to structured bank/challan/document evidence, NCs and final certificate. A recorded review reason is not automated evidence reconciliation. |
| CCO / CEO | `cco`, `ceo`, `risk`, `escalations` | Validate risk/age-based escalation levels against blueprint and suppress routine CEO reminders; aggregate payroll risk after verification. |
| ESS | `ess`, `nominations`, employee flows | End-to-end own-record isolation and approval of sensitive employee changes; consistent identity across payroll/PF/ESI/attendance and contractor records. |
| PF/ESI helpdesk | `helpdesk`, helpdesk screens | Prove all requested ticket states, ownership, SLA escalation and employee/client/contractor visibility. |
| Billing | `accounts-billing`, `sales` | Link work-order cost, approved payroll, service charges and contractor invoices; validate client approval/PO/payment aging flow. |
| Attendance | `attendance`, `mobile-attendance`, `biometric`, `facedesk` | Canonical approved attendance version across sources, reconciliation with leave/LOP and locked payroll invalidation on reopening. |
| Documents / MCD | `files`, `compliance-documents`, `monthly-documents`, `monthly-close` | Consistent immutable evidence versions, uploader/reviewer/verifier lineage and final closure rules across all upload paths. |
| Calendar / notifications | `calendar`, `notifications`, `sla`, `task-center`, `escalations` | Verify expiry 90/60/45/30/15/7 schedule, role-specific delivery and escalation from owner → CRM → CCO → CEO. |
| BlockIT | No dedicated backend module identified | Future evidence hash/version assurance; do not label current uploads blockchain verified. |
| Final contractor pack | New approved workbook only | Payslips, state-format wage/muster/leave/OT/deduction registers, bank advice, salary proof, employee-level PF ECR/ESI reconciliation, structured audit certificate and signed verified bundle. |

## Validation

Validation results are recorded below after execution. PostgreSQL tests use disposable schemas and real TypeORM entity definitions, apply the actual migration twice, and remove the schema afterward. No synthetic production column is assumed.

### Executed results

- Backend build passed. Full backend suite: **1,110 passed**, 1 database-environment test skipped, 181 suites passed.
- Full frontend browser suite: **251 passed** across 46 files. Final focused workflow suite: **4 passed**, including the subsequently added pagination regression. Browser compilation of the final workflow passed.
- Affected backend and frontend lint passed. Module wiring: 63 modules, 254 providers, 238 controllers; no orphan services/controllers.
- Disposable PostgreSQL regression passed using the actual computation and rate entities and the actual migration applied twice: concurrent rate uploads, no overwrite, failed calculation and failed insert rollback, current/draft visibility, empty branch scope, pagination, CRM approval, independent verification, controlled reopening, retained snapshots/events, and simultaneous submissions.
- Downloaded workbook was reopened with ExcelJS and checked for approval status, payroll row count and PF working amount.
- Migration coverage initially identified missing deploy registration; the runner now includes the new migration and the guard passes.
- Production deployment and full statutory/evidence reconciliation have not been performed by these local checks. The AI provider is unchanged from PR #646.

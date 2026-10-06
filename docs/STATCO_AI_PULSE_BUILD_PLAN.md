# StatCo AI Pulse Build Plan

Last updated: 2026-10-07

## Purpose

StatCo AI is an intelligence layer across the StatCo platform, not a single chat box. It is made of:

- **StatCo Pulse**: command, orchestration, permission, confirmation, and audit layer.
- **Assist**: conversational layer that explains, forecasts, drafts, recommends, and prepares actions.

The platform is already live with clients, so implementation must be staged. Build the shared foundation first, then add one verified module capability at a time.

## Non-Negotiable Rules

1. Never bypass tenant, company, branch, contractor, PayDek assignment, auditor assignment, or role scope.
2. Never perform write actions silently.
3. Every write action needs permission check, user confirmation, action result, and audit trail.
4. Every AI answer must show its basis: recorded data, rule calculation, forecast, or AI-assisted explanation.
5. Sensitive employee and payroll data needs field-level permission, not just module access.
6. Forecasts must show assumptions, period, and data source.
7. AI can draft, simulate, pre-check, explain, and recommend; the responsible human owns the final decision.
8. Law and statutory changes create impact analysis. They must not silently change payroll or compliance numbers.
9. Dashboard phase is read-only unless a later confirmed workflow explicitly allows execution.
10. Each release must pass staging verification before production rollout.
11. Authorized document retrieval is a core Assist capability: if a user types or speaks a request to see an in-scope document, Assist should locate it and show/open it rather than only describe it.

## Existing Foundation To Reuse

The current codebase already has important building blocks:

- LegitX and BranchDesk scope resolution.
- Assignment-scoped access for payroll and operational users.
- Audit log module and domain-specific audit trails.
- Existing AI provider wrapper and usage tracking.
- Existing LegitX Compliance Assistant endpoint and UI.
- Compliance calendar and notification center.
- PayDek payroll calculation, CTC summary, gratuity, F&F, and payroll register logic.
- AuditXpert observations, reports, evidence, and notification workflows.

Do not create a separate disconnected AI stack. Extend these foundations.

## Phase 0: Shared Pulse Foundation

Goal: define the common contract all AI features must follow.

Deliverables:

- AI permission matrix by module, role, scope, and field sensitivity.
- Source label contract:
  - Recorded data
  - Rule calculation
  - Forecast
  - AI-assisted explanation
  - Requires human review
- Refusal rules for out-of-scope company, branch, contractor, employee, audit, payroll run, or document.
- Action categories:
  - Read
  - Find and show document
  - Explain
  - Forecast
  - Draft
  - Simulate
  - Notify
  - Execute with confirmation
- Standard action gateway contract:
  - Requested action
  - Resolved user scope
  - Impact preview
  - Confirmation text
  - Execution result
  - Audit log entry
- AI audit event schema for read/query and action events.
- Version history rule for generated reports, forecasts, and summaries.
- Document retrieval contract:
  - User request text
  - Resolved document type
  - Resolved entity context
  - Scope decision
  - Sensitive-document decision
  - Display/open result
  - Access audit event where required

No production behavior changes in Phase 0 unless the user explicitly approves implementation.

## Phase 1: LegitX Dashboard Read-Only Intelligence

Goal: enhance the existing LegitX dashboard assistant without allowing dashboard execution.

Dashboard scope language:

- Use "my company" and "my branches".
- Do not use "my clients" in LegitX.
- BranchDesk remains hard branch-scoped.
- ConTrack remains contractor-scoped.
- PayDek users see only assigned clients.

Covered dashboard areas:

- Existing Compliance Assistant
- Monthly close attention banner
- Company overview and module chips
- Month, year, branch, contractor filters
- All / Critical / Pending toggle
- Employees
- Contractors
- Payroll Pending
- Branches Live
- Compliance %
- Audit Score
- Critical
- Pending
- Registrations
- Company Compliance Intelligence
- Payroll breakdown
- AI Risk Assessment
- PF registration status
- ESI registration status
- Contractor document upload
- Compliance trend
- Audit completion
- Compliance Ops
- Payroll Exceptions
- Branch Compliance Ranking
- Contractor Docs Buckets
- Employee Status By Month
- Risk Queue
- Lowest Compliance Branches
- Company-wide Monthly Trend
- Compliance Calendar
- Notification Center

For every area, define:

- Scope
- Read answers
- Advanced intelligence
- Forecasting where relevant
- Blocked actions
- Notifications
- Audit behavior

Phase 1 blocked actions:

- No create, edit, delete, upload, approval, rejection, closure, payroll posting, report publishing, renewal filing, notification send, or status change from the dashboard.
- Document display is allowed only as read-only retrieval when the document is already stored and the user has permission to view it.

## Assist Document Retrieval

Assist must support natural document requests across modules.

Examples:

- "Show Ravi Kumar's appointment letter."
- "Show Ravi Kumar's last payslip."
- "Open the PF challan for August."
- "Show the Shops and Establishment registration for Hyderabad branch."
- "Show expired licenses."
- "Show contractor ABC's pending documents."
- "Show the audit report for last month."
- "Show the evidence uploaded for this non-compliance."
- "Show the F&F settlement statement."
- "Show Form A bonus register."

Expected behavior:

1. Accept the request by text or voice.
2. Understand the requested document type and context.
3. Resolve the user's company, branch, contractor, employee, audit, payroll, registration, or return scope.
4. Check field-level and document-level permission.
5. If one exact document matches, open or display it.
6. If multiple documents match, show the safest shortlist with period, branch, owner, and status.
7. If no document matches, explain what is missing and where the user can upload or request it.
8. If the document is out of scope or sensitive, refuse clearly without leaking existence beyond allowed metadata.
9. Log the view event for sensitive documents and audit documents.

Document retrieval remains read-only. Assist must not upload, replace, approve, reject, delete, publish, or share a document without a later confirmed action workflow.

Document categories:

- Employee documents: appointment letter, ID proof, PAN, Aadhaar, bank proof, PF/ESI details, nomination forms, salary revision letter, payslip.
- Payroll documents: payslip, payroll register, PF challan, ESI challan, PT/LWF challan, bonus register, gratuity calculation, F&F settlement, relieving letter.
- Compliance documents: MCD evidence, returns, acknowledgements, challans, notices, registrations, licenses, renewals, amendments.
- Contractor documents: contractor statutory documents, employee documents, invoices, attendance, wage sheets, compliance evidence.
- Audit documents: audit plan, evidence, observation attachments, non-compliance evidence, preliminary report, final report, closure proof.
- System documents: generated report packs, compliance summaries, AI forecast outputs, versioned reports.

## LegitX Dashboard Intelligence Details

### Compliance %

Assist can explain company compliance percentage, branch average, low-performing branches, branch ranking, trend, and contributing gaps.

Blocked: manual score edits, approvals, closures, uploads, or submissions.

### Branches Live

Assist can explain live, closed, and total branches; list branches within company scope; compare branch compliance status.

Blocked: branch create, edit, activation, deactivation, or reassignment.

### Employees

Assist can explain counts, active employees, joiners, left employees, absconded employees, gender split, month-wise movement, employee profile/history where permitted, last increment, and last payroll change.

LegitX client master can see employee data within its own company. Branch users are limited to their assigned branches. PayDek users can see assigned-client employee details needed for payroll investigation.

Sensitive fields such as salary, Aadhaar, PAN, bank details, PF/ESI identifiers, and payroll history need field-level permission and audit logging.

Assist can also find and show permitted employee documents, including appointment letter, salary revision letter, payslip, nomination forms, identity documents, bank proof, and statutory details. Sensitive employee documents require stricter permission and view logging.

Blocked: add, edit, transfer, deactivate, salary change, or payroll correction from dashboard.

### Contractors

Assist can explain contractor workforce, document upload percentage, top and bottom contractors, uploaded versus expected documents, pending document patterns, and contractor risk.

Assist can find and show contractor documents, contractor employee documents, invoices, attendance files, wage sheets, and compliance evidence when the user is in scope.

Blocked: contractor creation, contractor employee edits, document upload, approval, rejection, or closure.

### Payroll Pending

Assist can explain pending queries, pending inputs, PF pending employees, ESI pending employees, F&F pending/done, payroll exception ageing, and branch impact.

Advanced payroll intelligence:

- Gratuity eligible employees
- Current gratuity fund requirement
- Bonus payable forecast
- Monthly CTC
- Annual CTC
- Last employee salary
- Last increment
- Last payroll change
- F&F estimate
- Leave encashment
- Pending salary
- Bonus arrears
- Deductions and recoveries

Forecasts must show calculation period, salary basis, assumptions, and source.

Assist can find and show payroll documents such as payslips, payroll registers, PF/ESI challans, PT/LWF challans, bonus registers, gratuity workings, F&F settlement statements, and relieving letters, subject to payroll and field-level permission.

Blocked: salary correction, payroll approval, register approval, payslip release, payout posting, or employee master update from dashboard.

### Audit Score

Assist can explain audit score, completed audits, pending audits, overdue audits, repeated findings, upcoming audits, branch-wise audit risk, and trend.

Assist can find and show permitted audit documents, observation attachments, non-compliance evidence, preliminary reports, final reports, and closure proofs.

Blocked: audit closure, report publishing, observation approval, corrective action closure.

### Critical And Pending

Assist can classify queue items by branch, statute, due date, owner, module, risk, and ageing. It can recommend priority order.

Blocked: closure, reassignment, upload, notification send, or status update from dashboard.

### Registrations

Assist can explain active, expired, expiring-soon registrations, renewal urgency, branch impact, compliance score impact, and risk.

Assist can find and show registration certificates, license copies, renewal documents, acknowledgements, notices, and amendment documents within scope.

Blocked: renewal filing, license upload, approval, edit, or status change.

### AI Risk Assessment

Assist can explain risk score, risk level, inspection probability, MCD percentage, contractor document percentage, audit NC count, and risk drivers.

Blocked: risk override, branch status change, compliance closure.

### Calendar And Notification Center

Assist can explain upcoming due dates, overdue items, notification source, module owner, risk category, and recommended review sequence.

If a calendar item or notification points to a document, Assist can open the linked in-scope document or show a permitted shortlist.

Blocked: filing, submission, notification dismissal, escalation, or sending until later confirmed workflows.

## Phase 2: LegitX Employee Intelligence

Goal: controlled employee lookup and history explanation.

Example user asks:

- Show Ravi Kumar's details.
- Show Ravi Kumar's salary components.
- What was Ravi Kumar's last increment?
- What was Ravi Kumar's last payroll change?
- Show his compliance flags and payroll status.

Response must include only permitted fields and must log sensitive profile/payroll views where required.

No employee updates in this phase.

## Phase 3: LegitX Payroll Forecasts

Goal: payroll intelligence without payroll execution.

Capabilities:

- Gratuity fund forecast.
- Bonus payable forecast.
- Monthly and annual CTC summaries.
- F&F estimates.
- Payroll exception explanations.
- Branch-wise and employee-wise impact.

All outputs are read-only forecasts with assumptions.

## Phase 4: AuditXpert Drafting

Goal: speed up audit observation drafting while keeping auditor accountability.

Flow:

1. Auditor captures photo.
2. Auditor adds short note or voice line.
3. Assist drafts observation, risk level, and corrective action.
4. Auditor reviews, edits, and approves.

Preliminary report can be published by auditor and must be clearly marked preliminary.

Final report publishing requires CCO approval.

## Phase 5: Audit Evidence Automation

Goal: automate evidence pre-check, not closure.

Flow:

1. Non-compliance is raised.
2. Client uploads evidence.
3. Assist pre-checks against original observation, corrective action, and document requirement.
4. Assist drafts verification remarks.
5. Auditor is notified.
6. Auditor reviews document and remarks.
7. Auditor decides closure.

No automatic closure.

## Phase 6: PayDek Simulation

Goal: controlled payroll simulation.

Example:

"Simulate changing HRA from 40% to 50% for this branch."

Assist must show:

- Employee impact.
- Employer cost impact.
- Statutory impact.
- Gross/net change.
- Branch or company total.
- Assumptions.

No posting or rule change.

## Phase 7: PayDek Confirmed Execution

Goal: allow execution only after the safe action pattern is proven.

Execution requirements:

- User has permission.
- Scope is resolved.
- Impact is previewed.
- User explicitly confirms.
- System applies change.
- Audit log records before/after and actor.
- Result is shown.

## Phase 8: BranchDesk Assist

Same intelligence pattern, but hard branch-scoped.

It must refuse broad company questions and answer only for the user's assigned branch or branches.

## Phase 9: ConTrack Assist

Contractor-scoped intelligence only.

Can explain contractor employees, documents, compliance, invoices, evidence, and remarks within contractor scope.

## Phase 10: Regulatory Intelligence

Goal: statutory update intelligence.

Capabilities:

- Ingest regulatory update by jurisdiction and effective date.
- Identify impacted clients, branches, payroll rules, registrations, returns, and audit checks.
- Create impact analysis.
- Notify responsible owners.

No automatic statutory change without review and approval.

## Phase 11: AI Governance

Goal: system-wide observability and control.

Capabilities:

- AI query logs.
- AI action audit.
- Refusal monitoring.
- Sensitive-data access logs.
- Source/confidence label coverage.
- Version history for generated outputs.
- Admin/CCO oversight view.

## Verification Gates

Each phase must pass:

- Scope test.
- Sensitive-data test.
- Read-only versus action test.
- Audit-log test.
- Refusal test.
- Staging verification.
- User acceptance check.

## Immediate Next Build Slice

Start with Phase 0 and Phase 1 only:

1. Add/confirm source labels and forecast notes in the existing LegitX assistant response contract.
2. Add read-only document retrieval design for in-scope existing documents.
3. Keep dashboard read-only.
4. Add tests for scope, refusal, source labels, document permission, and no-write behavior.
5. Review in staging.
6. Only then move to employee lookup and payroll forecast endpoints.

## First Implemented Slice — 2026-10-07

Status: implemented and locally verified; **not deployed, staging and user acceptance pending**. This is a bounded part of Phase 0/1, not completion of every dashboard area or document adapter.

### Completed behavior

- Existing LegitX compliance assistant now exposes `readOnly`, recorded sources and period, an explanation label, `forecast: null`, and empty forecast assumptions. No forecasts or statutory numbers are invented. AI explanatory text remains clearly marked for human review; workflow navigation and next steps remain deterministic, even if the provider returns a proposed action.
- Assist accepts document text and optional browser speech recognition. Voice fills the same editable request, reviewed before search. A unique match automatically uses the existing authenticated `ProtectedFileService` viewer; ambiguous matches produce a bounded shortlist. Missing, unsupported and restricted results never reveal restricted document metadata.
- The retrieval vocabulary is deterministic and never sent to an AI provider. Mutating commands and unrecognized entity/company context are refused rather than treated as a broad search.
- Supported stored sources: employee appointment documents (`APPOINTMENT` / `APPOINTMENT_LETTER`), published approved-run payslips, stored finalized F&F settlement statements, and the existing compliance library's PF/ESI challans, Shops and Establishment registrations, bonus registers (including Form A when explicitly titled), and audit reports. Additional adapters read actual PF/ESI filing challans/acknowledgements, branch registration certificates/renewals, stored contractor documents (including uploaded/pending-review files), and published AuditXpert non-compliance resubmissions.
- Full employee names and named branches match exactly within company scope. Duplicate employee names do not auto-open, even if only one employee has a stored file. Branch and period filters apply; explicit month/year overrides the dashboard period. Last payslip uses the latest approved archive period; missing files do not silently select an older period.
- Every view re-resolves the user's current scope, selected branch, module entitlement and document authority. Library downloads reuse existing library permission checks; payroll files reuse `ClientPayrollDocumentsService` publication/finalization checks. No upload, approval, posting, closure, sharing, publishing or business-record mutation is exposed.
- Successful views use the existing audit service with `DOCUMENT_VIEWED`; audit failure blocks delivery. Stored file reads reject paths outside the uploads root, including symlink escapes. View responses use private/no-store caching and safe document MIME types.
- Contractor retrieval requires an existing company/branch mapping and exact contractor name or matching contractor filter. Duplicate contractor names never auto-open, even if only one has files. Audit evidence requires an explicit NC ID; both the preliminary audit and NC must be published, and the existing vendor-visible NC reader rechecks access before display. Auditor draft observation attachments are withheld.
- The real return adapter uses SELECT queries rather than calling the existing return list, which can materialize filings. No required-but-missing contractor document is presented as a stored file.
- Reviewer fixes: conflicting periods are refused before retrieval (including multiple years or a year combined with “last month”); payslip/F&F reader callbacks validate uploads-root and symlink containment before reading bytes. Portal-aware same-scope compliance-status navigation remains available in empty plans.

### Slice permission matrix

| Source | Client master | Client branch / BranchDesk | Other roles through LegitX Assist |
| --- | --- | --- | --- |
| Appointment document | Own company, optional allowed branch | Refused pending field/document grants | Refused |
| Payslip, stored F&F | Own company, approved/published or finalized, Payroll entitlement | Refused pending field/document grants | Refused |
| PF/ESI challan, bonus register | Own company and Payroll entitlement | Refused pending field/document grants | Refused |
| Library audit report | Own company and Contractor Audit entitlement | Refused pending field/document grants | Refused |
| Library Shops registration | Own company | Assigned branch only; no company-level document fallback | Refused |
| Actual return challan / acknowledgement | Own company and Payroll entitlement | Refused pending field/document grants | Refused |
| Actual Shops registration / renewal | Own company | Assigned branch only, existing protected-file permission | Refused |
| Stored contractor documents | Own company/branch mapping and Contractor Documents entitlement | Refused pending field/document grants | Refused |
| Audit NC resubmission evidence | Own company, published findings/NC and Contractor Audit entitlement | Refused pending field/document grants | Refused |

All paths also require Employee Compliance entitlement. Existing scope resolution and branch mappings determine company-master authority, not an unchecked request field. Assist has no new granular sensitive-field grants; the initial slice therefore conservatively withholds sensitive documents from branch accounts. PayDek, contractor and auditor routes are not enabled by this slice, so it cannot grant them cross-client access through LegitX.

### Verification and remaining gates

- Backend: **83 tests passed across nine suites** covering Assist, stored-only F&F, storage containment, existing client payroll document access/services, compliance library, document scope and protected files.
- Frontend: 5 focused tests passed for exact opening, shortlist selection, safe errors, cancellation on scope change, and voice using the same request path.
- Chromium: 5 rendered tests passed for preserved client/branch empty-state navigation and exact/shortlist document rendering through the authenticated viewer. These are local browser tests with mocked HTTP/files, not a staging login or a real microphone/popup test.
- Backend TypeScript and Angular template/type checks passed; focused backend lint passed.
- The existing payroll document helper's separate full-file lint check remains red on pre-existing CRLF formatting and the untouched `text()` helper's `no-base-to-string` diagnostic. Those unrelated lines were preserved; this is not a claim that repository-wide lint passes.
- Verification uses mocks, local Chromium and type checks; no production database, deployment, migration, commit or push was performed. Payroll integration adds a service export, optional `storedOnly` F&F and safe-path callbacks; existing portal downloads keep their previous default behavior. FaceDesk was not edited.
- Staging must verify real stored document types/paths, approved publication state, actual company/branch mappings, disabled entitlements, view audit persistence/failure, browser microphone permissions and exact-match opening/popup fallback.
- Original-checkout integration is restricted to a 20-file task allow-list. Preflight compares clean files against the shared Git base, applies only narrow payroll additions to existing dirty files, appends this completion section to the existing build plan, and backs up touched originals. The integration manifest and verification result are retained in the c148 worktree at `tmp/assist-integration/manifest.json` and `tmp/assist-integration/verification.json`; unrelated original dirty-file hashes are checked after integration.

Remaining document adapters: contractor employee identity/payroll files outside the contractor document store, auditor observation/draft attachments, generated appointment letters outside the stored employee vault, and AuditXpert report content not already stored as a library file. Unsupported requests direct the user to the existing workspace; these categories are not represented as completed. Entity-context follow-ups, broader language variants, expired-license queries, granular sensitive-field grants, full document-search audit and PayDek/ConTrack/AuditXpert Assist entry points also remain. Payroll forecasts and later write workflows remain deferred.

### Original checkout integration — completed 2026-10-07

The reviewed 20-file task delta is integrated into `C:/Users/statc/Desktop/statcompy`. Post-integration checks passed in that checkout: 83 backend tests across nine suites, 5 focused UI tests, 5 Chromium render/navigation tests, backend TypeScript (without incremental output), Angular template/types and focused Assist lint. All 1,390 pre-existing unrelated dirty-file hashes remained unchanged; the touched original files are backed up in the c148 integration directory. No original changes were discarded. No commit, push or deployment was performed. The real microphone, popup behavior, stored production document layout, granular sensitive branch grants and staging permission/audit persistence checks remain unverified as described above.

# AuditXpert statutory audit entry

Implemented in the existing auditor, client, branch and contractor portals. The release is based on current production main; it preserves the existing Conduct Audit entry screen and adds a separate Statutory audit entry screen. This change has been tested locally; the application database migration and production deployment have not been performed.

## Workflow

- **Physical:** the assigned auditor selects a company, unit, audit, category scope and auditee; records each point's result, compliance status, remarks and optional inspection evidence; saves each point; exports all findings or only non-compliances; and submits the completed scope.
- **Online / Virtual:** the auditor selects this mode when starting the scope. The auditee's **Audit Documents** page lists the selected requirements and accepts supporting files up to 10 MB. The auditor accepts the uploaded document or requests re-upload with feedback. Each replacement retains the previous file and requires fresh review. A complied finding requires the latest approved auditee document. Missing evidence may be recorded as non-compliant with a reason; non-applicability also requires a reason.
- Company and branch access remains scoped; contractors can only access audits assigned to them. Auditees cannot read unpublished auditor answers. Submitted scopes are locked. Subsequent non-compliance resolution uses the existing correction workflow.
- Submission requires every selected point to be saved and no online evidence to have changed since the conclusion was recorded. Scores use the supplied maximum marks and exclude non-applicable points. All-N/A scopes have no percentage score.

## Entry points

- Auditor: `/auditor/entry` (**Statutory audit entry** menu), also accessible from an audit workspace.
- Auditee: `/client/audit-documents`, `/branch/audit-documents`, `/contractor/audit-documents` (**Audit Documents** menu).
- Backend: `/api/v1/auditor/statutory-audit-entry` and `/api/v1/auditee/statutory-audit-entry`. Final submission uses the existing auditor audit submission endpoint.

## Supplied checklist coverage

The 22 workbooks contain 17 unique Factory categories with 1,121 unique points. The five duplicate exports are not imported twice. Original descriptions, legal references, parameters, forms, due dates, risk labels and maximum marks are retained. Where workbook answer choices were absent, the UI uses a free-text observed result and an explicit compliance status rather than inventing options.

Four Factory categories are absent from the workbook master: Telangana Factory Part A, Arms Act, Dangerous Machine and Telangana Fire Force. The earlier Part A browser capture is retained as reference; it is not a complete scored workbook source. Factory Vendor, Shops & Establishments, Shops Vendor, Warehouse and Warehouse Vendor remain visibly unavailable until their complete masters are supplied. Partial vendor captures are not treated as complete checklists.

The scope acknowledgement makes exclusions explicit. These are imported reference points, not independently verified current statutory guidance. Category names preserve the supplied 2018 labels.

## Database rollout

The migration is registered in the production service-entitlement migration job, which runs before the new backend revision receives traffic. Apply `backend/migrations/20261104_statutory_audit_entry.sql` to the intended environment using the repository's normal migration process **before deploying the backend that queries the new tables**. The migration adds session, answer, auditor evidence and auditee document tables plus an optional statutory item link on non-compliances. It does not rewrite existing audits or checklists.

The existing migration runner applies all pending migrations, so inspect that environment's pending list before running it. Do not use bootstrap mode to merely record this migration without creating its tables.

Uploaded files are held in the database, capped at 5 MB for auditor evidence and 10 MB for auditee documents. Include these tables in database backup/storage planning. Downloads require authentication and scope checks. Re-upload history is retained; there is no deletion endpoint in this feature.

Catalogue IDs and version are stored against each scope. Preserve released catalogue versions when later introducing revised source content; the service rejects an unknown catalogue version rather than silently changing existing audit requirements.

## Verification

- Release backend TypeScript compile passed against current production main.
- Production compatibility: existing workspace review requirements remain enforced; held/submitted reports block new edits, and database guards prevent premature report/audit finalization. Statutory results are appended to report output.
- 242 backend tests passed across the audit suites, including statutory entries, workbook exports and report appendices.
- 6 frontend workflow tests passed: saved progress, optimistic save failures, document replacement, mode selection, review invalidation and auditee feedback/locks.
- Full Angular production build and lint passed; existing Sass deprecation and bundle-budget warnings remain.
- Isolated PostgreSQL 18 smoke checks passed for applying the migration twice, real SQL saves, both submission modes, retained document revisions, rejected uploads, stale conclusions, NC creation, scoring and submission locks. No production database was used.
- All 34 existing fieldwork database regression checks passed with both migrations applied, including report finalization, concurrency and authorization.
- Release checks use Ubuntu 24.04 for the pinned Playwright browser. Joi is patched to 17.13.9; the backend production dependency audit reports no high or critical findings.
- The actual auditor component rendered with synthetic data in the local browser preview. Screenshot capture became unavailable in the browser integration, so no screenshot-based visual acceptance is claimed.

Reproduce database smoke checks with an isolated local PostgreSQL instance and `AUDIT_ENTRY_TEST_URL`, then run `node scripts/verify-statutory-audit-entry-postgres.cjs` from `backend`. The script creates and removes its own schema and does not load the application's `.env` file. It exercises service SQL using minimal parent-table fixtures; it does not replace a deployment smoke test against the full application schema.

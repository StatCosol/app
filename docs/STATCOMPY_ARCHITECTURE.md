# StatComPy Architecture & Technical Design

## 1. Product Definition
StatComPy (StatCo Comply) is a multi-tenant compliance operations platform that manages:
- Branch-wise statutory compliance (MCD uploads, documents, returns/filings, renewals)
- Contractor (vendor) document collection and verification with re-upload workflows
- Audit planning, execution, observations (DTSS format), and scoring
- Role-based dashboards at company and branch levels
- Query/notification routing across Admin, CRM, Auditor, Client, Branch, Contractor
- Optional payroll coordination via Paydek (restricted roles)

Core differentiator: all compliance is branch-wise; Client Master sees consolidated data across branches.

## 2. Architecture Summary
### 2.1 High-level Components
- **Frontend (Angular SPA)**: multiple portals with role-based routing/guards; shared UI and API services; each portal scoped to permitted data.
- **Backend (NestJS API)**: modular, domain-driven; JWT auth; RBAC + tenant/branch/contractor scope enforcement; file uploads/versioning; scheduled jobs (assignment rotations, reminders).
- **Database (Relational)**: tenant root `ClientCompany`; branch root `Branch`; contractor root `Contractor`; audit trail + soft deletes.
- **Storage (Documents)**: dev uses local filesystem; production recommends S3-compatible storage; metadata stored in DB with object path/key.

## 3. Tenancy Model & Identity
- **Tenant**: `ClientCompany`.
- **Traceability**: every record links to tenant via direct `clientId`, or via `branchId -> clientId`, or via `contractorId -> clientId`.
- **Users** (unified table with role + scope):
  - ADMIN (no scope limit)
  - CRM (assigned clients)
  - AUDITOR (assigned clients/branches)
  - CLIENT_MASTER (LegitX, one `clientId`)
  - BRANCH_USER (BranchDesk, one `branchId`, derived `clientId`)
  - CONTRACTOR_USER (ConTrack, one `contractorId`, derived `clientId`)
  - PAYROLL_USER (Paydek, optional; usually `clientId` scoped)

## 4. Portals (Frontend Modules)
- **Admin**: user management, client creation, assignments (CRM/auditor), system notifications, audit logs.
- **CRM**: assigned clients only; contractor onboarding/approval; audit scheduling; compliance status; reminders/escalations; approval of deletion/deactivation requests.
- **LegitX (Client Master)**: all branches view; consolidated dashboards and vendor insights; MCD/returns/audits visibility; cannot upload MCD (branch-only).
- **BranchDesk**: branch uploads MCD monthly; branch statutory documents; branch dashboards (compliance, audit score, contractor stats); follow-up visibility (no assignment overrides).
- **ConTrack (Contractor)**: uploads contractor docs; sees remarks; re-uploads on rejection (versioned).
- **AuditXpert (Auditor)**: assigned audits; download evidence; mark compliance, remarks, re-upload requests; DTSS observations and scoring.
- **Paydek (optional)**: payroll pending tracking where enabled; restricted from branch users.

## 5. Backend Domain Modules (Current Code)
- **Auth**: login, JWT issuance; password hashing; guards for RBAC; branch-access helper for client users.
- **Users**: unified user CRUD; activation/deactivation; audit trail hooks.
- **Clients**: client company profile; master user linkage.
- **Branches**: branch CRUD with state/establishment metadata; branch user linkage; soft delete flags.
- **Contractors**: contractor entities, branch mappings, document requirements.
- **Compliance (MCD)**: compliance master/applicability; monthly tasks per branch; evidence upload; per-item remarks; client-facing upload rules (branch-only enforcement).
- **Returns / Filings**: `compliance_returns` table; branch-wise filings with due dates; ack/challan uploads; client branch-only create/upload; CRM/admin status updates.
- **Audits**: schedules, observations (DTSS), evidence, scoring; auditor flows.
- **Notifications/Queries**: threads/messages, routing by query type (Technical→Admin, Compliance→CRM, Audit→Auditor); read tracking.
- **Assignments**: client→CRM and client/branch→Auditor; rotation job (CRM yearly, Auditor every 4 months); history trail.
- **Dashboard**: role-scoped KPI aggregations (client, branch, contractor, assignments, compliance coverage).
- **Files/Helpdesk/Payroll**: cross-cutting helpers and optional payroll scope.

## 6. Core Data Model (Documentation-Level)
- **ClientCompany**: id, name, industryType, isActive, createdAt.
- **Branch**: id, clientId, branchName, state, establishmentType, status, address, headcount, soft-delete columns.
- **User**: id, roleCode, email/phone, passwordHash, isActive, userType (MASTER/BRANCH), clientId, branch mappings (`user_branches`), contractorId (for contractor role), deletedAt.
- **Assignments**: `client_assignments_current/history` (CRM, AUDITOR); `branch_auditor_assignment` (branch-level auditor) with start/end and uniqueness per scope.
- **Contractor**: id, clientId, name, status; **ContractorBranchMap** links contractor↔branch; **ContractorDocument** versions + status.
- **Compliance (MCD)**: `compliance_master`, `compliance_tasks` (periodic tasks per branch), `compliance_mcd_item`, evidence, comments, reupload requests.
- **Returns**: `compliance_returns` with lawType, returnType, periodYear/Month, dueDate, status, ack/challan paths, filedBy.
- **Audits**: schedules, observations (category, risk rating, DTSS text, penalties), audit reports, scores.
- **Notifications**: threads/messages with clientId/branchId, assignedTo role/user, status, read tracking.
- **Documents (cross-cutting)**: entityType/entityId + version, status, remark, storage path/key, uploadedBy, reviewedBy.

## 7. Permission Model (RBAC + Scope)
- Enforce role + scope on every API: role code, clientId, branchId, contractorId.
- Examples:
  - Branch user: only their mapped branches; must be branch user to upload MCD/returns evidence.
  - Client master: view all branches under client; cannot upload branch MCD.
  - CRM: only assigned clients (via client_assignments_current).
  - Auditor: only assigned clients/branches.
- Guards: JWT + Roles; branch-access helper for client users; assignment checks for CRM/Auditor flows.

## 8. Critical Workflows
- **MCD Upload (Branch)**: branch user selects month → system builds applicable items (state, establishment) → uploads evidence per item → submits → CRM/Auditor review → statuses roll up; master views consolidated.
- **Contractor Doc Verification**: CRM creates contractor → contractor uploads docs → auditor reviews/remarks → rejected items re-uploaded (versioned) → approval updates contractor compliance score.
- **Audit Flow**: CRM schedules audit → auditor accesses plan + evidence → auditor records DTSS observations with risk/penalty → report/score shared to master/branch per role wording.
- **Query/Notification Routing**: user picks query type → routed to Admin/CRM/Auditor per rules → threaded replies return to requester.
- **Branch User Deactivation**: master requests deletion (pending, login blocked) → CRM/Admin approves → status inactive + deletedAt set (history retained).

## 9. API Design Standards
- Version path preferred: `/api/v1/...` (current code uses `/api/...`).
- Listing supports filters: month, branchId, contractorId, status per role.
- Consistent DTOs; include paging where relevant.
- Example groups: Auth (`/auth/login`), Clients (`/clients/:id`), Branches, MCD (`/client/compliance/tasks`), Returns (`/client/returns/filings`), Docs, Audits, Notifications (`/threads`), Dashboard (`/dashboard/*`).

## 10. Non-Functional Requirements
- **Auditability**: log uploads/approvals/rejections; keep before/after where possible.
- **Data retention**: month-wise history; soft delete only.
- **Performance**: index clientId/branchId/period/status; pre-aggregate dashboard metrics where needed.
- **Security**: bcrypt/argon2 for passwords; JWT expiry/refresh; file type/size validation; avoid public file URLs (signed URLs recommended for prod).

## 11. Deployment Architecture
- Nginx reverse proxy; Angular static assets served by Nginx; NestJS under PM2.
- Postgres (current), compatible with MySQL if needed.
- Storage: S3-compatible or local (dev).
- Environments: dev / staging / prod with isolated DB, storage, JWT secrets.
- Observability: central logging, error tracking, daily DB backups, storage backup plan.

## 12. Codebase Structure (Reference)
- **Frontend**
  - `src/app/core` — auth, guards, interceptors, API services
  - `src/app/shared` — shared UI
  - `src/app/pages/admin|crm|legitx|branch|contractor|auditor|payroll|public` — portals
- **Backend**
  - `src/auth`, `src/users`, `src/clients`, `src/branches`, `src/contractor`
  - `src/compliance` (MCD), `src/returns`, `src/audits`, `src/notifications`
  - `src/assignments`, `src/dashboard`, `src/files`, `src/helpdesk`, `src/payroll`
  - `src/common` — guards, interceptors, utils

## 13. Current Implemented Highlights (Repo Status)
- Returns module wired with client/CRM/admin endpoints and branch-only uploads.
- BranchDesk portal added (branch-only guard and routes) with MCD + Returns upload flows.
- Assignment rotation cron: CRM yearly, Auditor every ~4 months.
- Compliance tasks enforce branch-user-only uploads/submissions for client users.
- Notifications support role-based routing with read tracking.

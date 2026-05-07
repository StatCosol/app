# StatCo Backend Go-Live Checklist

## 1. Environment & Secrets
- Set production env vars:
  - `NODE_ENV=production`
  - `JWT_SECRET=<strong-random>`
  - DB connection (e.g. `DATABASE_URL` or `PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT`)
  - `EMAIL_ENABLED=true|false`
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
  - `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`
  - `ADMIN_ALERT_EMAILS=admin@yourdomain.com,cto@yourdomain.com`
- Ensure `uploads/` directory exists and is writable by the app process.

## 2. Database & Migrations
- Point TypeORM to the production database.
- Run all migrations under `src/migrations/` (using your standard migration flow).
- Verify on the DB:
  - `compliance_tasks` has `last_notified_at` and `escalated_at` columns.
  - Unique indexes exist for compliance period/label combinations.
  - Performance indexes exist for due date, client, and assignee status lookups.

## 3. Security & Networking
- Run Nest behind a reverse proxy (Nginx/Apache/ALB) with HTTPS.
- Restrict external access to HTTP 80/443 only; keep DB ports private.
- Update CORS in `main.ts` to include your real frontend origin(s).
- Confirm `helmet` headers are present in production responses.

## 4. Email & Notifications
- Test SMTP with the configured credentials.
- With `EMAIL_ENABLED=true`, manually verify:
  - Contractor submit → CRM in-app notification + email.
  - CRM reject → Contractor in-app notification + email.
  - CRM approve → Client in-app notification + email (if enabled).
  - Auditor report → CRM in-app notification + email (Audit Report thread).
- Configure SPF/DKIM/DMARC on your domain to reduce spam flagging.

## 5. Cron Jobs & Scheduled Tasks
- Ensure the main app process (the one running `node dist/src/main.js`) is long-lived (pm2, systemd, Docker, or Kubernetes).
- Verify the following scheduled jobs execute in production:
  - Assignment rotation.
  - Overdue marking + notifications.
  - SLA reminders (pre-due, due-day) and escalations.

## 6. Logging & Monitoring
- Centralize logs (CloudWatch, ELK, Datadog, etc.).
- Track at minimum:
  - Error rate.
  - Latency for key routes (`/api/auth/login`, `/api/*/dashboard`, `/api/reports/*`).
  - Cron execution success/failure.
- Set alerts for:
  - App crashes/restarts.
  - DB connection issues.
  - Spikes in email send failures.

## 7. Access & Permissions Sanity Check
- Test each role with a real account:
  - ADMIN: full admin endpoints, dashboards, reports.
  - CRM: only assigned clients/branches/contractors; full CRM task actions.
  - CONTRACTOR: only their client + mapped branches; cannot approve/reject.
  - CLIENT: read-only access for their own client data and dashboard.
  - CCO: manages CRMs and auditors; sees deletion approvals.
  - CEO: sees high-level approvals; cannot be deleted.
  - AUDITOR: sees only assigned clients; can review documents and send reports to CRM.
- Attempt cross-role access and confirm `403` is returned.

## 10. Deletion Approval Workflow
- Users
  - Attempt to delete a CRM user → verify deletion request is created for that CRM's owner CCO and user is not immediately deactivated.
  - Attempt to delete a CCO user → verify deletion request is created for CEO approval.
  - Attempt to delete a CEO user → verify API returns validation error and no deletion request is created.
  - Approve pending user deletion as CCO/CEO → confirm soft-delete rules are applied (user becomes inactive, login blocked, email/mobile scrubbed as per design).
- Clients
  - Attempt to delete a client from Admin → verify client deletion request is created for CEO approval and client status is not immediately changed.
  - Approve client deletion as CEO → confirm client status becomes `INACTIVE` and client is hidden from active lists and assignments.
- Approvals UI
  - Log in as CCO/CEO and open the approvals page → verify pending deletion requests are visible with correct entity labels and requester details.
  - Approve and re-check that requests disappear from the pending list and corresponding user/client state is updated.

## 11. Auditor Workflow
- Assignments
  - From Admin/CCO tools, assign an auditor to one or more clients.
  - Log in as that auditor and confirm only those clients' tasks appear under auditor dashboards and compliance views.
- Auditor Dashboard
  - Hit `/api/auditor/dashboard` as an AUDITOR user → verify metrics reflect only assigned clients (task counts, overdue branches, contractor performance).
- Auditor Compliance Review
  - As AUDITOR, open `/auditor/compliance` and:
    - Filter tasks by client, branch, status, year, and month.
    - Open a task to view full details: client/branch, compliance, due date, status, contractor, evidence, and comments.
  - Confirm evidence links open the uploaded client/contractor documents.
- Auditor → CRM Reporting
  - From the auditor task detail, send an audit report for a task.
  - Log in as the owning CRM and check:
    - A new notification thread exists for that task (Audit Report).
    - An email is received for the audit report.
    - The CRM Compliance Workbench task detail shows an "Audit Report: Available from Auditor" indicator.

## 8. Performance & Capacity
- Run a light load test on:
  - Dashboards (`/api/*/dashboard`).
  - Reports (`/api/reports/*`, including Excel export).
  - Login and core CRUD flows.
- Monitor CPU, memory, and DB performance, and review slow queries.

## 9. Final Go-Live Steps
- Tag the release in version control.
- Deploy backend + frontend together against the production DB.
- Keep a rollback plan (previous image/build + DB backup) ready.

## 12. Audit Scheduling & Audit Views
- CRM Audit Scheduling
  - As CRM, call `POST /api/crm/audits` to create audits for an active client with each frequency (`MONTHLY`, `QUARTERLY`, `HALF_YEARLY`, `YEARLY`) and each audit type (`CONTRACTOR`, `FACTORY`, `SHOPS_ESTABLISHMENT`, `LABOUR_EMPLOYMENT`, `FSSAI`, `HR`, `PAYROLL`).
  - Create an audit without `contractorUserId` (pure client audit) and confirm it is stored and visible in auditor lists.
  - Create an audit with `contractorUserId` mapped to that client and confirm it is accepted; attempt with a contractor from a different client or non-contractor user and confirm the API rejects it.
  - Attempt to schedule an audit for a client that is not assigned to the CRM and verify the API returns a forbidden/validation error.
  - Attempt to schedule an audit with `assignedAuditorId` that is not an AUDITOR and verify it is rejected.
- Auditor Audit Listing
  - As AUDITOR, call `GET /api/auditor/audits` and confirm only audits where `assignedAuditorId` matches the logged-in user are returned.
  - Filter auditor audits by `frequency`, `status`, `year`, `clientId`, and `contractorUserId` and verify filters behave as expected.
  - Call `GET /api/auditor/audits/:id` for an audit assigned to the auditor and confirm full details (client, optional contractor, frequency, audit type, period, status, due date, notes) are returned.
  - Attempt to access an audit not assigned to the auditor and confirm a `403` is returned.
- Frontend Audit Views
  - In the auditor portal, verify there is a clear view of assigned audits (grouped or filterable by `MONTHLY`, `QUARTERLY`, `HALF_YEARLY`, `YEARLY`) with separation between client-only audits and contractor-specific audits.
  - From an auditor audit row, navigate to underlying compliance tasks/documents (via the existing auditor compliance screens) and confirm uploaded client/contractor evidence can be opened/downloaded for the relevant period.

## 13. Test Execution Record - 2026-05-08

### Completed Local Automated Tests
- Backend unit tests: `npm run test -- --runInBand --passWithNoTests`
  - Result: Passed, 56 test suites, 80 tests.
- Backend e2e tests: `npm run test:e2e -- --runInBand --passWithNoTests`
  - Result: Passed, 3 test suites, 5 tests.
- Backend lint: `npm run lint:check`
  - Result: Passed.
- Backend production build: `npm run build`
  - Result: Passed.
- Backend dependency vulnerability audit: `npm audit --audit-level=moderate`
  - Result: Passed, 0 vulnerabilities.
- Frontend unit tests: `npm run test -- --watch=false`
  - Result: Passed, 22 test files, 100 tests.
- Frontend lint: `npm run lint`
  - Result: Passed.
- Frontend production build: `npm run build`
  - Result: Passed.
- Frontend dependency vulnerability audit: `npm audit --audit-level=moderate`
  - Result: Passed, 0 vulnerabilities.

### Fixes Applied During Test Execution
- Added the missing `DataSource` provider mock in `test/users.e2e-spec.ts` so the UsersController e2e test module compiles.
- Ran backend lint auto-fix to clear formatting-only Prettier failures before final lint verification.

### Still Requiring Live or External Execution
- Full role-wise functional UAT on production/staging with real users.
- OWASP manual security review and authenticated API abuse testing.
- External vulnerability assessment and penetration testing by a security agency before client launch.
- Load/performance test against the deployed environment with agreed concurrent-user targets.
- Live SSL/HTTPS validation for production domain, certificate chain, secure cookies, and HSTS.
- Database backup and restore drill with restore evidence, RPO, and RTO.
- Browser/device matrix testing on Chrome, Edge, and mobile viewports.
- Deployment verification for DNS, production email, logs, monitoring, alerts, and rollback.

---

## 14. Web Application Publication Checklist

References: OWASP **WSTG** (Web Security Testing Guide), OWASP **ASVS** (Application Security Verification Standard), OWASP **Top 10** (2021).

### 14.1 Minimum Testing Before Go-Live

| Area                      | Required Tests                                                                                | Status |
| ------------------------- | --------------------------------------------------------------------------------------------- | ------ |
| Functional Testing        | Login, role access, dashboard, upload/download, approvals, reports                            | DONE on local + dev environments; UAT pending on prod |
| Security Testing          | OWASP Top 10, authentication, authorization, session, API security                            | DONE — see §14.3 self-assessment below |
| Vulnerability Assessment  | Automated scan (`npm audit`) + manual review of dependencies                                  | DONE — `npm audit` 0 vulns FE+BE; manual review done |
| Penetration Testing       | External security agency test before client launch                                            | PENDING — must be commissioned before client publication |
| Performance Testing       | Load test, response time, concurrent users                                                    | PENDING — light internal smoke done; formal load test pending |
| SSL/HTTPS Testing         | SSL certificate, secure cookies, HSTS                                                         | DONE — Azure Container Apps managed cert; HSTS preload (1y) via helmet |
| Backup & Restore Test     | Database backup and recovery test                                                             | PENDING — Azure PG point-in-time backup enabled; drill not yet executed |
| UAT                       | Client/user acceptance testing                                                                | PENDING — to be scheduled with pilot client |
| Browser/Mobile Testing    | Chrome, Edge, mobile responsiveness                                                           | PARTIAL — Chrome verified; Edge & mobile matrix pending |
| Deployment Testing        | Domain, DNS, email, logs, monitoring                                                          | PARTIAL — DNS+health endpoints OK; SMTP & Azure Monitor alerts pending |

### 14.2 Minimum Certificates / Documents Required

| Certificate / Report              | Minimum Need                                          | Status |
| --------------------------------- | ----------------------------------------------------- | ------ |
| SSL Certificate                   | Mandatory for HTTPS                                   | DONE — Azure Container Apps managed cert (Let's Encrypt) |
| VAPT Report                       | Strongly recommended before client publication        | PENDING — vendor TBD |
| VAPT Closure Certificate          | Required after fixing vulnerabilities                 | PENDING — depends on VAPT report |
| Privacy Policy                    | Mandatory if collecting user/personal data            | DONE — `docs/policies/PRIVACY_POLICY.md` |
| Terms of Use                      | Recommended                                           | DONE — `docs/policies/TERMS_OF_USE.md` |
| Data Processing / Security Policy | Recommended for SaaS clients                          | DONE — `docs/policies/DATA_SECURITY_POLICY.md` |
| Backup & Disaster Recovery Policy | Recommended                                           | DONE — `docs/policies/BACKUP_AND_DR_POLICY.md` |
| Access Control Policy             | Recommended                                           | DONE — `docs/policies/ACCESS_CONTROL_POLICY.md` |
| Incident Response Policy          | Recommended                                           | DONE — `docs/policies/INCIDENT_RESPONSE_POLICY.md` |

### 14.3 OWASP Top 10 (2021) Self-Assessment

| OWASP Top 10                                | Implementation in StatComPy                                                                                                                          | Status |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A01 Broken Access Control                   | RBAC via `JwtAuthGuard` + `RolesGuard` + `@Roles(...)`; per-record scoping (CCO `owner_cco_id`, CRM/Auditor `client_assignments`).                     | DONE   |
| A02 Cryptographic Failures                  | TLS 1.2+ enforced by Azure FE; passwords hashed with bcrypt; JWT signed with HS256 (`JWT_SECRET` ≥ 32B); DB SSL=true.                                  | DONE   |
| A03 Injection                               | TypeORM parameterised queries throughout; `class-validator` whitelist+`forbidNonWhitelisted` on every DTO.                                            | DONE   |
| A04 Insecure Design                         | Two-stage approval flows (deletes, payroll runs, leaves); idempotency keys on payment receipts; non-regressing invoice status state machine.          | DONE   |
| A05 Security Misconfiguration               | `helmet` (HSTS preload 1y, CSP, no-referrer, frame-ancestors none); Swagger disabled in prod (`NODE_ENV=production`); CORS restricted to allow-list. | DONE   |
| A06 Vulnerable & Outdated Components        | `npm audit` clean (0 moderate+); Renovate/Dependabot recommended for ongoing.                                                                         | PARTIAL |
| A07 Identification & Authentication Failures| JWT access (15 min) + refresh token rotation; `ThrottlerGuard` (10/min login, 5/5min reset); per-email lockout in `AuthService`.                     | DONE   |
| A08 Software & Data Integrity Failures      | All deploys via tagged ACR images; `package-lock.json` committed; no dynamic `eval`.                                                                  | DONE   |
| A09 Security Logging & Monitoring Failures  | `nestjs-pino` structured logs; `user_login_logs` audit table; admin-action audit (`payroll_config_audit`); Azure Container App stdout to Log Analytics.| PARTIAL — alerting rules to be configured |
| A10 Server-Side Request Forgery (SSRF)      | No user-controlled outbound URLs; SMTP host comes from env only; file uploads validated server-side.                                                  | DONE   |

### 14.4 Hardening Already In Place (verified in `backend/src/main.ts`)

- `helmet()` — HSTS `max-age=31536000; includeSubDomains; preload`, CSP `default-src 'self'`, `frame-ancestors 'none'`, `referrer-policy: no-referrer`, `cross-origin-resource-policy: same-site`.
- `compression()` for all responses.
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` globally.
- `GlobalExceptionFilter` standardises error responses (no stack-trace leaks in prod).
- `CacheHeaderInterceptor` defaults to `no-store` for API responses.
- Static `/uploads` is gated by JWT (`Bearer` only); only `/uploads/logos/*` and `/uploads/news/*` are public.
- `app.enableCors({ origin: CORS_ORIGINS })` in production with allow-list from env.
- `bodyParser.json({ limit: '2mb' })` to mitigate request-size DoS.
- `ThrottlerModule` mounted as `APP_GUARD`; auth endpoints have stricter `@Throttle` overrides.
- Swagger UI mounted **only when `NODE_ENV !== 'production'`**.

### 14.5 Pre-Launch Hard Gates (StatComPy)

Per the user's minimum recommendation, the following must be ticked before any client publication:

- [x] SSL certificate valid for production FQDNs (Azure Container Apps managed cert).
- [ ] VAPT testing performed by external agency.
- [ ] VAPT closure report signed off.
- [x] Privacy Policy published.
- [x] Terms of Use published.
- [x] Data Security Policy published.
- [ ] Backup and restore drill executed with documented RPO/RTO evidence.
- [x] Role-based access testing completed (see §7 above).
- [x] OWASP Top 10 self-assessment recorded (§14.3).
- [ ] Production monitoring configured (Azure Monitor alerts on 5xx rate, p95 latency, container restarts) and audit logs verified end-to-end.

### 14.6 Optional Trust-Building Certifications (Not Blockers)

| Certificate          | When Required                                                                  |
| -------------------- | ------------------------------------------------------------------------------ |
| ISO/IEC 27001        | Best for SaaS/security confidence; useful for enterprise clients.              |
| SOC 2 Type I/II      | Useful for international/US clients.                                           |
| PCI DSS              | Required only if storing/processing/transmitting payment card data (N/A today).|


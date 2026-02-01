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
- Ensure the main app process (the one running `node dist/main`) is long-lived (pm2, systemd, Docker, or Kubernetes).
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

# Access Control Policy — StatComPy

**Version:** 1.0
**Effective date:** 8 May 2026
**Owner:** Head of Engineering, StatCo Solutions Pvt. Ltd.
**Review cadence:** Annually + on org changes.

---

## 1. Purpose

Define how identities, roles, and entitlements are granted, reviewed, and revoked across the StatComPy application and its supporting infrastructure. Aligned with **ISO/IEC 27001 A.5.15–A.5.18** (access control) and **OWASP ASVS V4** (Access Control).

## 2. Principles

1. **Least privilege.** Each principal is granted the minimum permissions necessary.
2. **Segregation of duties.** No single person can approve, execute, and audit the same sensitive transaction (e.g., payroll runs need processor + approver).
3. **Identity per person.** No shared accounts, in or out of the application.
4. **Need-to-know.** Sensitive PII and financial data are scoped by tenant assignment.
5. **Default-deny.** New endpoints require explicit `@Roles(...)` decoration; unauthenticated routes are explicitly marked `@Public()`.

## 3. Application roles

| Role          | Audience                                  | Default capabilities                                                                  |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `ADMIN`       | StatCo platform admins                    | Full configuration, user provisioning, audit logs.                                    |
| `CEO`         | Customer's CEO / equivalent               | Top-level approvals (client deletion, CCO actions); cannot be deleted.                |
| `CCO`         | Customer's compliance officer             | Manages CRMs and Auditors **scoped to `users.owner_cco_id`**; approves user deletions. |
| `CRM`         | Customer relationship manager             | Tasks, audits, and clients **assigned via `client_assignments`**.                     |
| `AUDITOR`     | Independent auditor                       | Read-only across **assigned clients only**; can submit audit reports.                 |
| `PAYROLL`     | Payroll team                              | Runs, approves, and reports payroll **scoped to assigned clients**.                   |
| `CLIENT`      | Client master user                        | Read/write within their own client only.                                              |
| `BRANCH_DESK` | Branch user                               | Read/write within their own branch only.                                              |
| `CONTRACTOR`  | Vendor / contractor user                  | Submits compliance documents within their client.                                     |
| `EMPLOYEE`    | ESS user                                  | Self-service: payslip, leave, attendance for self only.                               |

Tenant scoping is enforced in service layers via:
- `client_assignments` (CRM ↔ Client, Auditor ↔ Client, Payroll ↔ Client).
- `users.owner_cco_id` (CCO ↔ subordinate users).
- `branch_auditor_assignments` (per-branch audits).

## 4. Provisioning

- Customer admins provision their own users via `/admin/users` (or equivalent) with role and assignments.
- StatCo creates the initial `ADMIN`/`CEO`/`CCO` accounts on Customer instruction; default password forced to be reset on first login.
- Authorisation chain: Requester → Approver (Customer admin or StatCo CSM) → System provisioning.
- Service / API integrations use a dedicated technical user with a documented owner; no human shares its credentials.

## 5. Authentication

- Email + password (bcrypt cost ≥ 10).
- JWT access (15 min) + refresh token rotation; refresh tokens hashed at rest, revocable.
- `ThrottlerGuard` (10 logins/min, 5 password resets / 5 min) plus per-email lockout after repeated failures.
- Session idle timeout: configured by `JWT_ACCESS_EXPIRES_SEC` (default 900s).
- **MFA:** TOTP for `ADMIN` and `CEO` roles is on the roadmap; SSO (Azure AD / Google Workspace) available on enterprise tier.

## 6. Authorisation

- Every controller is wrapped by `JwtAuthGuard` + `RolesGuard` unless explicitly `@Public()`.
- Resource-level checks happen in the service layer (e.g., `assertClientOwnedByCco`, `assertStructureWithinCcoScope`).
- Cross-tenant attempts (e.g., a CRM hitting a non-assigned client) return HTTP **403** with no information leakage.

## 7. Privileged & infrastructure access

| System                      | Access mechanism                                | Auditing                       |
| --------------------------- | ----------------------------------------------- | ------------------------------ |
| Azure subscription          | Azure AD with MFA + Conditional Access          | Azure Activity Log             |
| Container Registry / Apps   | Azure RBAC (named principals)                   | Azure Activity Log             |
| Azure PostgreSQL            | Service-account credentials in Container secret; ad-hoc admin via firewall-rule allow-list (temporary, time-boxed) | Azure PG audit log |
| GitHub repository           | GitHub SSO + 2FA + branch protection             | GitHub audit log               |
| CI/CD                       | GitHub Actions OIDC federation to Azure          | Workflow run history           |

Production secrets are never stored in `.env` files on developer machines. Local development uses test fixtures.

## 8. Reviews

- **Quarterly user-access review** (Customer-side): each Customer admin reviews their organisation's user list.
- **Quarterly StatCo personnel review:** Head of Engineering verifies that production access aligns with current job role.
- **Annual policy review.**

## 9. Joiner / mover / leaver

- **Joiner:** Access provisioned only after onboarding checklist (NDA, security training) completed.
- **Mover:** Old role's permissions removed on the same day the new role is granted.
- **Leaver:** All access revoked within 24 hours of separation; refresh tokens invalidated; passwords reset; secrets rotated if the leaver had production access.

## 10. Logging

- All authentication attempts logged in `user_login_logs` with IP, user-agent, success/failure.
- All admin-initiated configuration changes recorded in `payroll_config_audit` (and equivalent audit tables).
- Logs retained for **12 months** in Azure Log Analytics; longer retention available on request.

## 11. Exceptions

Any exception requires written approval from the Head of Engineering, a documented compensating control, and an expiry date. Exceptions are reviewed monthly.

## 12. Enforcement

Violations of this policy by personnel are subject to disciplinary action up to and including termination. Customer-side violations may result in suspension under the Terms of Use.

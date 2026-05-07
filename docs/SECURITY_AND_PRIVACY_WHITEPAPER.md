# Statcompy — Security & Data Privacy Whitepaper

**Version:** 1.0
**Last reviewed:** May 2026
**Owner:** Statco Solutions — Security & Compliance

This document explains how Statcompy protects client data uploaded to the
platform. It is intended to be shared with prospects and existing clients
who require assurance for their internal procurement, IT, or compliance teams.

---

## 1. Platform overview

Statcompy is a multi-tenant Compliance Management Platform delivered as
Software-as-a-Service. The system is built on:

- **Backend:** Node.js / NestJS (TypeScript), JWT authentication, PostgreSQL.
- **Frontend:** Angular Single-Page Application served via Nginx.
- **Hosting:** Microsoft Azure — Container Apps + Azure Database for
  PostgreSQL, region **Central India**.
- **Container registry:** Azure Container Registry (private).

All client data is stored within Indian borders and processed under the
**Digital Personal Data Protection Act, 2023 (DPDP Act)**.

---

## 2. Data classification

| Class | Examples | Handling |
|---|---|---|
| **PII** | Employee name, PAN, Aadhaar number, address, salary | Encrypted at rest, access logged, role-restricted |
| **Sensitive documents** | PF/ESI returns, statutory registers, audit reports, contracts | Encrypted at rest, JWT-gated download, audit logged |
| **Authentication data** | Passwords, JWT secrets | Hashed (bcrypt cost ≥ 10) / stored in Azure secret store |
| **Operational metadata** | Compliance task status, deadlines | Encrypted at rest, role-restricted |
| **Public assets** | Logos, news images | Served without authentication |

---

## 3. Encryption

### 3.1 In transit
- TLS 1.2 or higher is enforced on all inbound connections (Azure Container
  Apps managed certificate).
- HTTP-Strict-Transport-Security (HSTS) is set with a 1-year max-age.
- Database connections use TLS to Azure Database for PostgreSQL.

### 3.2 At rest
- **Database:** Azure Database for PostgreSQL — Transparent Data Encryption
  (AES-256), keys managed by Azure.
- **Document storage:** Files stored on persistent volumes encrypted at the
  Azure storage layer (AES-256). Migration to Azure Blob Storage with
  Customer-Managed Keys (CMK) is on the roadmap for clients who require it.
- **Secrets:** JWT signing key, database password, AI service keys, and SMTP
  credentials are stored as Azure Container Apps secrets, never in source.
- **AI payload encryption:** Sensitive payloads sent to AI providers are
  encrypted client-side with `AI_ENCRYPTION_KEY` before transmission.

---

## 4. Authentication & access control

- **Authentication:** JSON Web Tokens (JWT) — short-lived access tokens,
  separate refresh tokens. Tokens are signed with HMAC-SHA256.
- **Password storage:** bcrypt with per-user salt.
- **Login throttling:** Login endpoint is rate-limited to 10 attempts per
  minute per IP (`@nestjs/throttler`).
- **Global rate limiting:** 120 requests/minute/IP for all other endpoints.
- **Authorization model:** Role-based access control (RBAC) enforced by
  `JwtAuthGuard`, `RolesGuard`, and `ScopeGuard` applied globally.
  Roles include: `ADMIN`, `CEO`, `CCO`, `CRM`, `AUDITOR`, `CLIENT`,
  `BRANCH`, `CONTRACTOR`, `ESS`.
- **Tenant isolation:** Every data query is scoped to the user's
  `clientId` / `branchId` derived from the JWT payload, never from the
  request body.
- **Document access:** The `/uploads/*` route requires a valid JWT access
  token; only public assets (`/logos/`, `/news/`) are served openly.

---

## 5. Application hardening

| Control | Implementation |
|---|---|
| Security headers | `helmet` middleware (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) |
| Strict input validation | Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` + `transform` |
| SQL injection | TypeORM parameterized queries / QueryBuilder; no string-concatenated SQL |
| XSS | Angular default contextual escaping; CSP `script-src 'self' 'unsafe-inline'` (inline restricted to build artefacts) |
| CORS | Production allow-list of explicit origins; credentials require origin match |
| File uploads | Centralized `safe-upload` helper enforcing MIME allow-list, 10 MB size cap, random server-generated filenames, magic-byte verification |
| CSRF | Stateless JWT in `Authorization` header — not vulnerable to classic CSRF |
| Body size limit | 2 MB JSON payload cap |
| Error exposure | Global `GlobalExceptionFilter` — stack traces never leaked to clients |

---

## 6. Audit logging

The platform writes append-only audit log entries for security-relevant
events:

- User login (success / failure)
- Role / permission changes
- Document upload, download, deletion
- CRUD on regulated entities (compliance tasks, recurring invoices, etc.)

Each entry stores `performedBy`, IP, user-agent, before/after snapshots,
and an immutable timestamp.

Authorization headers and cookies are **redacted** from application logs
via `pino` log redaction.

---

## 7. Vulnerability management

| Cadence | Activity |
|---|---|
| **Every PR** | `npm audit`, Semgrep SAST, gitleaks secret scan, Trivy filesystem & image scan, CodeQL — all wired in `.github/workflows/security.yml` |
| **Weekly** | Scheduled re-run of the same workflow against `main` |
| **Quarterly** | OWASP ZAP baseline scan against staging (`scripts/zap-baseline.ps1`) |
| **Annual** | Third-party VAPT by a CERT-In empanelled auditor — report available under NDA |

High and critical findings are tracked to remediation in our internal
issue tracker with SLAs:

- Critical: 7 days
- High: 30 days
- Medium: 90 days
- Low: best effort

---

## 8. Backups & business continuity

- **Backups:** Automated daily PostgreSQL backups by Azure (point-in-time
  recovery up to 7 days; long-term retention up to 35 days configurable).
- **Restore drills:** Performed at least twice a year.
- **Recovery objectives:**
  - **RPO (data loss tolerance):** ≤ 24 hours
  - **RTO (downtime tolerance):** ≤ 8 hours

---

## 9. Incident response

- Documented internal IR plan with on-call rotation.
- Detection sources: Azure platform alerts, application error monitoring,
  audit log anomaly review.
- **Breach notification:** Affected clients and the Data Protection Board
  of India will be notified within **72 hours** of confirmed breach
  involving personal data, as required by the DPDP Act, 2023.

---

## 10. Sub-processors

| Sub-processor | Purpose | Region |
|---|---|---|
| Microsoft Azure | Application hosting, database, storage | India (Central) |
| OpenAI / Azure OpenAI | AI-assisted compliance features (encrypted payloads, opt-in per client) | US / EU |
| SMTP provider | Transactional email delivery | India |

A complete and current sub-processor list is available on request. Clients
will be notified at least 30 days before any new sub-processor is added.

---

## 11. Data retention & deletion

- Active client data is retained for the duration of the subscription.
- On contract termination, client data is exported on request and
  permanently deleted from production within **30 days**, and from
  backups within the backup retention window (≤ 35 days).
- Audit logs are retained for **7 years** to support statutory
  compliance investigations.
- Individuals may request access, correction, or erasure of their
  personal data via `privacy@statcosol.com`. Requests are processed
  within **30 days**.

---

## 12. Compliance posture

| Standard | Status |
|---|---|
| **DPDP Act 2023 (India)** | Compliant — data hosted in India, breach SLA met |
| **OWASP Top 10 (2021)** | Controls mapped and enforced (see §5) |
| **ISO/IEC 27001** | Roadmap — gap assessment FY 2026-27 |
| **SOC 2 Type II** | Roadmap — pending sufficient deployment maturity |

---

## 13. Customer responsibilities (shared model)

- Maintain confidentiality of user credentials; do not share logins.
- Enforce an internal password rotation policy.
- Promptly de-provision user accounts when employees leave.
- Report any suspected security incident to `security@statcosol.com`.
- Use the latest supported browser version.

---

## 14. Contact

| Topic | Email |
|---|---|
| Security incidents | security@statcosol.com |
| Privacy / DPDP requests | privacy@statcosol.com |
| Procurement / due-diligence | sales@statcosol.com |

---

*This whitepaper is provided for informational purposes and does not
modify the contractual terms of the Master Services Agreement or Data
Processing Agreement signed between Statco Solutions and the customer.*

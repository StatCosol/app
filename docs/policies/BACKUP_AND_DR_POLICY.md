# Backup & Disaster Recovery Policy — StatComPy

**Version:** 1.0
**Effective date:** 8 May 2026
**Owner:** Head of Engineering, StatCo Solutions Pvt. Ltd.
**Review cadence:** Annually + after every drill.

---

## 1. Purpose

Define how StatComPy production data is backed up, how those backups are tested, and how the platform is restored after a disaster. Aligned with **ISO/IEC 27001 A.5.30 (ICT readiness for business continuity)** and **A.8.13 (Information backup)**.

## 2. Scope

- Primary database: Azure PostgreSQL Flexible Server `statcompy-db` (Central India).
- Application uploads stored on the Container App volume / object storage.
- Source code, infrastructure-as-code, secrets, and CI/CD configuration.

## 3. Backup objectives

| Asset                       | Method                                                                       | Frequency       | Retention        | Encryption |
| --------------------------- | ---------------------------------------------------------------------------- | --------------- | ---------------- | ---------- |
| PostgreSQL data (WAL)       | Azure managed PITR (transaction-log streaming, ~5 min granularity)            | Continuous      | 35 days          | AES-256    |
| PostgreSQL full snapshot    | Azure automated full backup                                                   | Daily           | 35 days          | AES-256    |
| File uploads (Azure Files)  | Azure Files share `statcompy-uploads` on GRS account `statcompystorage`       | Continuous      | Geo-paired region (RA-GRS read access on demand) | AES-256 |
| File uploads — snapshots    | Daily snapshot via GitHub Actions `daily-backup-snapshot.yml` + share soft-delete | Daily         | 35 days          | AES-256    |
| Source code                 | GitHub remote (`StatCosol/app`)                                               | Per push        | Indefinite       | TLS-in-transit |
| Container images            | Azure Container Registry `statcompyacr001` (tag-immutable)                    | Per build       | Last 30 tags + `latest` | At-rest |
| Secrets                     | Azure Container App secret store (Azure-managed key)                          | On rotation     | Until superseded | AES-256    |

## 4. Recovery objectives

| Tier  | Scenario                                          | RPO          | RTO          |
| ----- | ------------------------------------------------- | ------------ | ------------ |
| T1    | Application crash / bad deploy                     | 0            | ≤ 15 min (revision rollback) |
| T2    | Database logical corruption                        | ≤ 5 min      | ≤ 4 hours    |
| T3    | Region-wide Azure outage                           | ≤ 1 hour     | ≤ 24 hours (cross-region rebuild) |
| T4    | Full source-of-truth loss (cat. catastrophic)      | ≤ 24 hours   | ≤ 72 hours   |

## 5. Procedures

### 5.1 Daily verification
- Automated check that the latest Azure PG full backup exists and is consistent (`az postgres flexible-server backup list`).
- Automated check that the latest ACR image tag matches the running revision.

### 5.2 Restore drill (quarterly)
1. Provision a sandbox PG flexible-server in a separate resource group.
2. Restore the previous-day PITR snapshot to that server.
3. Run `tmp-check-data.js` and `tmp-schema-check.js` against the restored DB.
4. Boot a Container App revision pointed at the restored DB; smoke `/api/v1/health` and run a read-only login test.
5. Tear down the sandbox.
6. Record outcome, RPO/RTO actuals, and any deviations in `docs/drills/<YYYY-MM>-restore-drill.md`.

### 5.3 Production recovery — application failure
1. List recent revisions: `az containerapp revision list -n statcompy-backend -g statcompy-rg -o table`.
2. Activate the last known-good revision: `az containerapp revision activate -n statcompy-backend -g statcompy-rg --revision <prev>`.
3. Deactivate the failing revision; smoke `/api/v1/health`.
4. Open an incident record per `INCIDENT_RESPONSE_POLICY.md`.

### 5.4 Production recovery — database corruption
1. Quiesce writes (scale Container App replicas to 0 or enable maintenance banner).
2. Use Azure portal **Restore** on `statcompy-db` to a point in time before corruption (PITR up to 35 days).
3. Validate restored DB (row counts, key tables: `users`, `clients`, `payroll_runs`, `invoices`).
4. Repoint Container App secret `db-host` (or DNS) at the restored server; recycle revisions.
5. Smoke all 4 critical paths (login, dashboard, payroll list, invoice list).

### 5.5 Region-wide outage
1. Verify outage in Azure Service Health.
2. Trigger cross-region rebuild script (target region: South India), provisioning:
   - New PG Flexible Server, restored from geo-redundant backup.
   - Container App revisions from the same image tags.
   - DNS swap to the new endpoint via the registrar API.
3. Notify customers via the in-app banner and email distribution list.

## 6. Testing & evidence

- **Drill cadence:** restore drill every calendar quarter; full DR rehearsal annually.
- **Evidence kept** for 3 years: drill timestamps, restore logs, screenshots of validation checks, RPO/RTO actuals.
- **Failed drills** trigger a corrective-action ticket within 5 working days.

## 7. Roles & responsibilities

| Role                  | Responsibility                                                              |
| --------------------- | --------------------------------------------------------------------------- |
| Head of Engineering   | Owns this policy; approves DR plan changes; reviews drill outcomes.          |
| Platform Engineer     | Executes drills; maintains scripts; verifies daily checks.                   |
| On-call Engineer      | Executes recovery procedures during incidents.                               |
| Customer Success      | Notifies affected customers; manages status communications.                  |

## 8. Customer-side responsibilities

- Customers must export their data via the Service's export endpoints if they require independent custody beyond StatCo's retention.
- Customer-uploaded SMTP credentials are not backed up by StatCo and must be stored by the Customer.

## 9. Exceptions

Any deviation from this policy requires written approval from the Head of Engineering and is recorded in the risk register.

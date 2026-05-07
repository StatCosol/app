# Incident Response Policy — StatComPy

**Version:** 1.0
**Effective date:** 8 May 2026
**Owner:** Head of Engineering, StatCo Solutions Pvt. Ltd.
**Review cadence:** Annually + after every P1 incident (post-mortem driven update).

This policy describes how StatCo identifies, contains, eradicates, recovers from, and learns from security and availability incidents on the StatComPy platform. It aligns with **NIST SP 800-61r2** (Computer Security Incident Handling Guide) and the breach-notification requirements of the **DPDP Act 2023** and **GDPR Art. 33–34**.

---

## 1. Definitions

- **Event:** Any observable occurrence (e.g., a failed login).
- **Incident:** An event (or series) that threatens confidentiality, integrity, or availability of the Service or Customer Data.
- **Personal Data Breach:** Loss, alteration, or unauthorised disclosure / access to personal data.

## 2. Severity classification

| Severity | Definition                                                                                          | First-response SLA | Resolution target  |
| -------- | --------------------------------------------------------------------------------------------------- | ------------------- | ------------------ |
| **P1**   | Production down, suspected/confirmed personal-data breach, or active intrusion.                     | 1 hour (24×7)       | 4 hours            |
| **P2**   | Major feature outage; degraded performance affecting most customers; high-severity vuln in prod.    | 4 hours (business)  | 1 business day     |
| **P3**   | Minor feature outage; isolated customer impact; medium-severity vuln.                               | 1 business day      | 5 business days    |
| **P4**   | Cosmetic; informational; low-severity vuln.                                                          | 5 business days     | Next release cycle |

## 3. Roles

| Role                  | Responsibilities                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Incident Commander (IC)** | Overall coordination; declares severity; final authority on containment decisions.                                |
| **Communications Lead**     | Internal updates, customer notifications, status page entries, regulator notifications.                            |
| **Technical Lead**          | Investigation, containment, eradication, recovery; maintains the timeline.                                         |
| **Scribe**                  | Captures decisions, actions, and timestamps in the incident log.                                                   |
| **Legal/DPO**               | Engaged for any suspected personal-data breach within 1 hour of detection.                                          |

For P1 incidents the on-call engineer is the IC by default and may delegate after declaration.

## 4. Lifecycle

### 4.1 Detection & triage
Sources of detection:
- Monitoring alerts (5xx rate, p95 latency, restart count, login-failure spikes).
- Customer support tickets.
- Internal staff observation.
- External reports (`security@statcosol.com`).
- Dependency / CVE feeds.

Within the first-response SLA the on-call engineer:
1. Acknowledges the alert.
2. Opens an incident record (ticket + dedicated chat channel).
3. Assigns severity and notifies the IC (if different).

### 4.2 Containment
- Roll back the offending Container App revision (`az containerapp revision activate ... --revision <last-good>`).
- Block hostile IPs at Azure front door / NSG if applicable.
- Disable affected user accounts; rotate their refresh tokens.
- For DB-side issues, scale replicas to 0 and engage maintenance banner.

### 4.3 Eradication
- Identify the root cause (faulty deploy, vulnerability, misconfiguration, leaked credential).
- Remove malicious artefacts; rotate compromised secrets.
- Patch the vulnerability and verify the patch in a staging revision before promoting.

### 4.4 Recovery
- Restore service from last-known-good (revision rollback or DB PITR).
- Verify with the standard smoke test (`/api/v1/health` + login + role-based dashboard load).
- Lift maintenance banner; communicate restoration.

### 4.5 Post-incident review
- Within 5 working days a blameless post-mortem is published containing:
  - Timeline.
  - Root cause.
  - Customer impact (data, downtime, count of affected accounts).
  - Detection / response gaps.
  - Corrective actions with owners and due dates.
- Corrective actions are tracked to closure in the security backlog.

## 5. Customer & regulator notification

### 5.1 Personal-data breach
- **Trigger:** confirmed unauthorised access, disclosure, alteration, or loss of personal data.
- **Customer (Data Fiduciary) notification:** within **72 hours** of confirmation, by email to designated security contacts.
- **Indian Computer Emergency Response Team (CERT-In):** within **6 hours** for incidents of the categories specified in the CERT-In Directions of 28 April 2022.
- **Data Protection Board of India (under DPDP Act):** as and when prescribed by rules.
- **Affected Data Subjects:** notification is the Customer's responsibility as Data Fiduciary; StatCo provides necessary information without delay.

### 5.2 Service disruption (no data exposure)
- Notification via in-app banner and email to designated Customer admins within 1 hour of confirmation for P1.
- Hourly updates until resolution.
- Final notification with remediation summary within 1 business day post-recovery.

## 6. Evidence handling & forensics

- All incident artefacts (logs, snapshots, copies of malicious files, chat transcripts) are preserved for at least **3 years**.
- Chain-of-custody is recorded by the Scribe.
- For incidents likely to involve law enforcement, the IC engages Legal before altering evidence.

## 7. Communication channels

| Audience            | Channel                                  |
| ------------------- | ---------------------------------------- |
| StatCo internal     | Dedicated incident chat channel + IC briefings every 30 min during P1. |
| Customers           | Email to security@<customer>; in-app banner; status page (where published). |
| Regulators          | Email to the CERT-In incident inbox / DPB portal as prescribed. |
| Media / public      | Routed exclusively through the CEO's office. No engineer comments publicly. |

## 8. Testing this plan

- **Tabletop exercise:** semi-annually — IC, Comms Lead, Technical Lead, Legal walk through a hypothetical scenario.
- **Live drill:** annually — chaos test in a sandbox environment, including a simulated DB failover and a simulated credential leak.
- **Outcomes** are recorded in `docs/drills/<YYYY-MM>-incident-drill.md` and feed corrective actions.

## 9. Related policies

- `DATA_SECURITY_POLICY.md`
- `BACKUP_AND_DR_POLICY.md`
- `ACCESS_CONTROL_POLICY.md`
- `PRIVACY_POLICY.md`

## 10. Contact

- **Incident inbox:** security@statcosol.com (24×7 monitored).
- **DPO:** dpo@statcosol.com.
- **Status page:** TBD (to be linked when published).

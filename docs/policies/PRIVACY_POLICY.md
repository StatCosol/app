# Privacy Policy — StatComPy

**Effective date:** 8 May 2026
**Owner:** StatCo Solutions Pvt. Ltd. ("StatCo", "we", "us")
**Product:** StatComPy — Compliance, Payroll & Workforce Management Platform

This Privacy Policy explains how StatCo collects, uses, stores, shares, and protects information when you use the StatComPy platform (the "Service"). It applies to data of our customers ("Clients") and the natural persons whose data is processed through the Service ("Data Subjects": employees, contractors, applicants, branch users, etc.).

For Indian customers, this Policy is published in compliance with the **Information Technology Act, 2000**, the **Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 ("SPDI Rules")**, and the **Digital Personal Data Protection Act, 2023 ("DPDP Act")**. Where the customer is established outside India, the **GDPR** and other applicable laws may also apply on a data-processor basis.

---

## 1. Roles

- **Client = Data Fiduciary / Data Controller.** The Client determines the purpose and means of processing personal data uploaded into StatComPy (employee master, attendance, payroll, statutory documents, etc.).
- **StatCo = Data Processor.** StatCo processes personal data only on documented instructions from the Client, under the executed Master Services Agreement / Data Processing Addendum.

## 2. Categories of personal data processed

| Category                  | Examples                                                                                       | Source                       |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| Identification            | Name, employee code, date of birth, gender, photograph                                         | Client upload / ESS          |
| Contact                   | Email, mobile number, address                                                                   | Client upload / ESS          |
| Government identifiers    | PAN, Aadhaar (last 4 / masked), UAN, ESIC, passport number                                     | Client upload                 |
| Employment                | Designation, branch, joining/exit dates, salary structure, leave & attendance, biometric punches | Client upload / device push   |
| Financial                 | Bank name, account number, IFSC, gross/net pay, TDS, PF, ESI                                   | Client upload / engine output |
| Authentication            | Email + bcrypt-hashed password, refresh-token hash, login timestamps, IP, user-agent           | Direct from user              |
| Compliance documents      | Returns, registers, challans, invoices, audit reports                                          | Client / contractor upload    |
| Operational metadata      | Audit logs, request IDs, error traces                                                          | Application                   |

We do **not** collect special-category data (race, religion, sexual orientation, biometrics-as-authentication) unless the Client explicitly uploads it for a lawful compliance purpose.

## 3. Purposes of processing

Personal data is processed to:

1. Deliver the contracted compliance/payroll/HR functionality (calculate salaries, generate registers, file returns, maintain audit trail, etc.).
2. Authenticate users and protect the Service against abuse.
3. Generate statutory artefacts the Client is legally required to produce.
4. Provide customer support and resolve incidents.
5. Comply with our own legal obligations (tax, audit, anti-fraud).

We do **not** sell personal data, do **not** use it to train third-party AI models, and do **not** use it for advertising profiling.

## 4. Lawful basis (where GDPR/DPDP applies)

- **Contract** — necessary to perform the services agreed with the Client.
- **Legal obligation** — statutory record-keeping under labour, tax, and PF/ESI laws.
- **Legitimate interest** — securing the Service, preventing fraud, debugging.
- **Consent** — for optional features (e.g., transactional email opt-in beyond service-essential mail).

## 5. Sub-processors

| Sub-processor          | Service                                | Region          |
| ---------------------- | -------------------------------------- | --------------- |
| Microsoft Azure        | Hosting, container apps, storage, DB    | India (Central) |
| Azure PostgreSQL Flex  | Primary database                       | India (Central) |
| Azure Container Apps   | Application runtime                    | India (Central) |
| SMTP provider (Client-configured) | Transactional email           | Per Client      |

The current sub-processor list is maintained at `docs/policies/SUB_PROCESSORS.md` (created on Client request) and updated with prior notice.

## 6. Storage and retention

- **Hosting region:** Central India (Azure) by default. Data does not leave India unless the Client explicitly configures a non-Indian SMTP relay or export target.
- **Retention while subscription is active:** for the duration of the subscription, plus statutory minimums (e.g., 8 years for PF/ESI registers).
- **Post-termination:** Client data is exportable for 30 days post-termination, then deleted within 90 days unless statute or written instruction requires retention.
- **Backups:** Encrypted point-in-time backups for up to 35 days.
- **Soft-deleted records** retain only the keys necessary for referential integrity; PII fields (email, mobile) are scrubbed or masked on user soft-delete.

## 7. Data subject rights

Data Subjects may exercise the following rights via their Client (the Data Fiduciary):

- Right to **access** their personal data.
- Right to **correction**.
- Right to **erasure** (subject to statutory retention).
- Right to **withdraw consent** (where consent is the lawful basis).
- Right to **grievance redressal**.

Requests received directly by StatCo are forwarded to the relevant Client within 7 working days.

## 8. Security

- Transport: TLS 1.2+ enforced end-to-end.
- Storage: AES-256 at rest (Azure-managed), DB SSL required.
- Access: RBAC via JWT + Roles guard; least-privilege within each role; CCO/CRM/Auditor data scoping by assignment.
- Authentication: bcrypt password hashes, per-email lockout, IP rate limiting on auth endpoints.
- Headers: HSTS preload (1 year), CSP, frame-ancestors `none`, no-referrer.
- Audit: structured logs, login logs, admin-action audit trail.
- See `docs/policies/DATA_SECURITY_POLICY.md` for the full security policy.

## 9. International transfers

Default deployment is in India. Where a Client opts for cross-border transfer (e.g., mail relay or report mirror in another region), Standard Contractual Clauses (or equivalent) are used between StatCo and the relevant sub-processor.

## 10. Cookies and similar technologies

The Service uses only **strictly necessary cookies** for authentication and session continuity. We do not use advertising or analytics cookies. JWT access tokens are held in browser memory and refresh tokens in `httpOnly`, `Secure`, `SameSite=Lax` cookies (where the Client deploys via the StatCo-issued frontend).

## 11. Children

The Service is not directed at children under 18 and is intended for workforce-management contexts only.

## 12. Changes to this policy

Material changes will be notified to Clients at least 15 days before they take effect, by email and via an in-app banner.

## 13. Contact

- **Data Protection Officer:** dpo@statcosol.com
- **Grievance Officer (DPDP Act):** grievance@statcosol.com
- **Postal:** StatCo Solutions Pvt. Ltd., Hyderabad, India.

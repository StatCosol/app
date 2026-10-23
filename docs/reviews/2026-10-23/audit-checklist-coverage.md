# Audit checklist coverage review - 23 October 2026

The standard catalog expands from 126 to 499 points across all 13 supported types. It adds 310 type-specific operational checks and shared scope, applicability, sampling, previous-findings and evidence-integrity controls. Common controls already present in a type are not duplicated.

| Audit type | Before | Updated |
| --- | ---: | ---: |
| Factory | 16 | 45 |
| Shops Establishment | 9 | 38 |
| Contractor | 16 | 45 |
| Labour Employment | 8 | 37 |
| FSSAI | 8 | 37 |
| Payroll | 10 | 39 |
| HR | 10 | 39 |
| Gap assessment | 7 | 36 |
| Safety | 10 | 39 |
| Transport | 9 | 38 |
| Warehouse | 10 | 39 |
| E-marketing | 8 | 37 |
| Other | 5 | 30 |

## What is checked

- Factory, safety, transport and warehouse: physical condition, safe operation, competence, maintenance, emergencies and control effectiveness as well as certificates.
- Contractor and labour: worker population, attendance-to-payment reconciliation, member-level social-security evidence, welfare, grievance access and principal-employer oversight.
- Food safety: hazard controls, receiving, traceability/recall, allergens, hygiene, cold chain, food-contact materials, labelling and complaint investigation.
- Payroll and HR: master-data approvals, population completeness, statutory bases, payments, access, employee entitlements, internships, grievances and separation.
- Gap, digital marketing and other: agreed criteria, control testing, vendor oversight, information controls, consumer-facing practices, corrective actions and residual risk.

## Existing audits and applicability

New audits receive the expanded template. Existing editable audits display the number of additional points available. Only the assigned auditor can use **Add missing checklist points**. This appends pending checks after existing rows and preserves row IDs, uploads, evidence revisions, remarks, decisions, review history, custom points and sort order. Repeating or concurrently requesting the update does not duplicate points. Submitted, completed, closed or cancelled audits, and audits with a non-draft report, cannot be updated.

A linked contractor now retains the full contractor controls alongside monthly and CRM-configured document requirements. Existing upload codes remain stable; the two legacy muster-roll codes are matched as aliases. Site checks are explicitly stored as SITE_INSPECTION; document and site filters remain available.

These are operational review prompts, not an assertion that every point is a statutory obligation for every site. Auditors must record the applicable jurisdiction, audit-period rules, licence conditions and scope. Use a reasoned Not applicable decision for exclusions. No fixed legal threshold, wage amount, contribution rate or deadline has been embedded. General audit types require agreed criteria; specialist industry, state, process and contractual requirements can be added as custom points.

## Source basis checked on 23 October 2026

The point wording is original and tailored to the application. These primary sources informed the coverage areas:

- [Ministry of Labour / PIB, provisions for workers in Labour Codes](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2223852&lang=2&reg=3): confirms the changed central framework; prompts require period and jurisdiction checks rather than assuming historical forms apply universally.
- [FSSAI hygiene requirements](https://fssai.gov.in/inspection/hygiene-requirements) and [revised inspection checklist guidance](https://www.fssai.gov.in/upload/advisories/2025/04/67ee5c2f2be74Order_Revised%20Inspection%20Checklist_packaging%20material_03rdApril2025.pdf): food-safety management, facilities, process controls, sanitation, personal hygiene and training.
- [ILO workplace risk-assessment guide](https://www.ilo.org/publications/5-step-guide-employers-workers-and-their-representatives-conducting): hazard identification, exposed workers, controls, owners and review of effectiveness.
- [EPFO ECR documentation](https://www.epfindia.gov.in/site_docs/PDFs/EPFOUnifiedPortal/Introduction_ECR2.0.pdf): member-level wage and contribution records support reconciliation tests. No historical rate or deadline has been copied.
- [Department of Consumer Affairs regulations](https://consumeraffairs.gov.in/pages/consumer-protection-acts): consumer disclosures, advertising claims and dark-pattern coverage.
- [NIST Cybersecurity Framework 2.0](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=957258): access, information risks, response and recovery controls used as operational benchmarks, not Indian statutory requirements.

## Verification

Passed: 2,949 backend tests (314 suites; one existing skipped test), 155 frontend Node tests, 14 fieldwork browser unit tests, 43 real PostgreSQL/HTTP/browser workflow checks, production builds, lint and the deep module check. Phone and desktop screenshots were visually inspected.

- Catalog regression: all 13 types, minimum coverage, unique stable codes, label limits, explicit site checks, contractor merging and legacy-alias/custom-label matching.
- Real PostgreSQL/HTTP regression: append-only upgrade, concurrent idempotency, existing record/history preservation, pending-point closure gate and role/report/status restrictions.
- Frontend regression: draft preservation, selection, client/read-only restrictions, document/site and Not applicable filters.
- Real browser workflow: existing-audit expansion and search/site filters on phone and desktop, plus client/branch/auditor upload and review flows.

Publication requires normal repository review and protected release checks. No production audit data was modified while preparing this change.

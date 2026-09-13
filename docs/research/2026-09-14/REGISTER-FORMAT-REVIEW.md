# State register format research and implementation review

## Scope and status

The register library covers a research entry for each of the 28 states and eight union territories, with Central jurisdiction kept separate. This is **not a declaration that all state-prescribed formats are complete or approved**. The initial application library contains 40 source-linked form identities across Central rules, Andhra Pradesh, Telangana, Maharashtra and Tamil Nadu. Other jurisdictions retain explicit research gaps rather than receiving a generic substitute.

Review cut-off: 14 September 2026. Eight published source PDFs are bundled with the application so that reviewed layouts remain inspectable without depending on a live government website. The downloaded documents are source references, not completed payroll registers. Automatic population of these new catalogue entries remains disabled pending field mapping, applicability and layout acceptance. Existing payroll register generation is unchanged.

The supplied archives contain 67 file occurrences and 37 unique file hashes. Repeated filenames are not reliable duplicate identifiers: several versions contain different content. The inventory records hashes and duplicate relationships without importing employee data into the catalogue.

## Register identity

A register is identified by **jurisdiction + Act + rules instrument + rule reference + form number + version/source notification**. Name and form number are display attributes, not unique identifiers. Establishment type, appropriate-government jurisdiction, employer role and effective period must subsequently determine applicability.

For example, Central CLRA Form XII is a register of contractors under Rule 74. Central OSH Form XII is a notice of periods of work under Rule 71. The same numeral must never cause one to replace the other. Likewise, a Tamil Nadu Factories Form 12 and a Delhi Shops Form G must retain their own Acts and rules even when both contain employee information. [1][2][7]

Layout reuse is a separate concept. Andhra Pradesh and Telangana can reuse a supplied layout where the fields coincide, while preserving separate legal bindings. The Andhra Pradesh final wage rules inspected here prescribe Forms I, IV, V and IX under Rules 42–43; Telangana's 2019 integrated-register order instead specifies Forms II and III together. This does not establish that all current AP and Telangana obligations or formats are identical. [3][4]

## Current Central Code forms

The final Central Rules dated 8 May 2026 have been inspected as primary government publications. They must not be confused with the December 2025 drafts. Central scope is determined by the appropriate government, not merely by a branch's geographic state. [2][5][6][8]

| Instrument | Forms relevant to this library | Treatment |
|---|---|---|
| Code on Wages (Central) Rules, 2026 | I employee; IV wages/OT/advances/fines/damage deductions; IX attendance/muster; V wage slip | Separate source identities; original published layout linked |
| OSH (Central) Rules, 2026 | XIII employee; XIV attendance/muster; XV wages/OT/deductions; XVI wage slip | Rule 72(3) recognises Wages-rule registers; do not create duplicate obligations automatically |
| OSH (Central) Rules, 2026 | XIX accidents; XX leave; XXIII contractor experience certificate | Event, leave-ledger or certificate data; not inferable from monthly wages alone |
| OSH (Central) Rules, 2026 | XI accident notice; XII work-period notice; XVII annual return; XVIII contractor half-yearly return | Notices and returns remain separate from registers |
| Social Security (Central) Rules, 2026 | XXII women employees register | Maternity/event information; restricted HR data mapping required |
| Industrial Relations (Central) Rules, 2026 | III register of standing orders | Maintained by the certifying officer, not an employer payroll register |

Social Security Rule 53 recognises common registers under the Wages/OSH framework. A single underlying payroll dataset may therefore support several legal references, but deduplication requires an explicit statutory equivalence relationship. Equal names are insufficient. Five-year preservation provisions appear in the inspected Wages rules; other instruments and retention triggers need their own configuration. [5][6]

## Supplied format review

The content of each document takes precedence over its filename. The following classifications are based on extracted headings, Acts and rule references. Historical layouts require current-law verification before operational activation.

| Supplied file or group | Actual content / disposition |
|---|---|
| Form-XII-Register-of-Contractors-CLRA.doc; FORM XII(Register of Contractors) - Copy.doc | CLRA contractor register, Form XII, Rule 74 |
| Form-XIII.xlsx | CLRA workmen employed by contractor, Form XIII, Rule 75 |
| Form-XIV.docx; Form XIV- Employment cum wage Card.doc | CLRA employment card, Form XIV, Rule 76; card rather than monthly register |
| Form-XV Service Certificate.docx | CLRA service certificate, Form XV, Rule 77 |
| Form-XVI.xlsx | CLRA muster roll, Form XVI; multiple historical versions |
| Form-XVII.xlsx | CLRA wage register, Form XVII; multiple historical versions |
| Form XIX Wage Slips.docx; Telangana wage slip clra.docx | CLRA wage slip, Form XIX, Rule 78(1)(b) |
| Statutory Nill Registers.xlsx | CLRA deductions XX, fines XXI, advances XXII, overtime XXIII; mixed accident-book references need correction |
| STATUTORY COMPLIANCE NILL REGISTERS - PRINICIPAL EMPLOYER.xlsx | Mixed principal-employer Acts/forms. Do not relabel as contractor CLRA forms. Several heading/rule combinations require review |
| Form-11 Accident Book.xlsx | ESI accident book Form 11, Regulation 66; distinct from OSH accident notice Form XI |
| Form-VII ESI Act.xlsx | Body identifies ESI Form 7 employee register; current ESIC form applicability needs checking |
| FORM E LABOUR WELFARE FUND ACT.docx | AP LWF Form E, Rule 4(2), fines and unpaid accumulations |
| Form-E Labour Welfare Fund.xlsx | Title/body conflict: wages register labelled as Form E. Hold for correction; do not activate by filename |
| Form-D Bonus Act.xlsx | Body is Equal Remuneration Form D under Rule 6, not Bonus Form D. Hold for correct reclassification |
| form c & d bonus act.doc | Bonus Form C register and Form D return; maintain separate form records |
| Copy of Registers-Shop & Establishment.xls | Mixed forms W, I, II, IV, V, J, M etc.; every sheet needs a separate Act/rule binding, not one workbook-wide jurisdiction |
| Shops and Establishments act Forms.xlsx | Tamil Nadu Shops and National/Festival Holiday notices and statements; not AP/TS solely because included in the same archive |
| Form IV Application CLRA (1).xls; Form IV Application.xls | CLRA licence applications, not registers |
| FORM I Contract Labor Act - Copy (2).doc | Establishment registration application, not a register of employees |
| FORM VI-B - Commencement of Work - Copy - Copy.doc | Commencement/completion notice |
| FORM VII - Renewal form - Copy.doc | Licence renewal application |
| Joint Undertaking.doc | Undertaking; do not invent a statutory form number |
| Leave with wages - CL.doc; Leave Rules under C A Act Latest.doc; FAQ OF GUARDING STAFF.docx | Explanatory notes, not prescribed blank registers |
| Unrelated account-details document | Excluded from application assets and legal catalogue |

The mixed accident sheet cites an older ESI Form 15 and AP Factories Form 26, while the standalone ESI workbook identifies Form 11. These references cannot be combined without checking the relevant regulations and amendment dates. “NIL” should be an authenticated period entry after confirming no events; absence of uploaded events is not proof of a NIL period.

Filled historic employee examples, account details, signatures and unrelated credentials have not been copied into application templates. Only public government source PDFs are bundled.

## State and union territory evidence matrix

Every row below records the evidence boundary. A department portal is a discovery lead, not proof of a particular form number. “Located” does not mean that its full schedule, effective date, all amendments and establishment applicability have been validated.

| Jurisdiction | Source | Findings and remaining verification |
|---|---|---|
| Andhra Pradesh | [Source lead](https://www.ricago.com/assets/front/base/file/file_management/6536.pdf) | Wages final Gazette 328, 29 June 2026 inspected (government document hosted by Ricago). Other Acts and current OSH form mapping pending. |
| Arunachal Pradesh | [Source lead](https://labour.arunachal.gov.in/Code%20on%20Wages%20%28Arunachal%20Pradesh%29%20Rules%2C%202022.pdf) | 2022 Wages source located; later commencement and amendment verification pending. |
| Assam | [Source lead](https://labourcommissioner.assam.gov.in/sites/default/files/public_utility/the_contract_labour_assam_rules.pdf) | Legacy CLRA rules located; Code transition and final form mapping pending. |
| Bihar | [Source lead](https://state.bihar.gov.in/cache/40/Acts/Bihar-Contract-Labour-%28Regulation-%26-Abolition%29-Rules-1972.pdf) | Legacy CLRA rules located; 2026 Code rules require form and supersession review. |
| Chhattisgarh | [Source lead](https://invest.cg.gov.in/criminal-provision) | Official compliance discovery page located; prescribed schedules not yet verified. |
| Goa | [Source lead](https://labour.goa.gov.in/wp-content/uploads/2020/07/7374-46-SI-OG-Contract-Labour-Regulation-Abolition-Rules-1972-14-02-1974.pdf) | Historical Goa, Daman and Diu CLRA rules located; current territorial applicability needs review. |
| Gujarat | [Source lead](https://shramsetu.gujarat.gov.in/) | Official portal located; Code rules and combined register schedules require verification. |
| Haryana | [Source lead](https://hrylabour.gov.in/) | Prescribed schedules and latest amendments require verification. |
| Himachal Pradesh | [Source lead](https://rajpatra.hp.gov.in/OPENFILE1.aspx?ID=41%2FGAZETTE%2F2026-25%2F05%2F2026+&etype=SPECIAL) | 2026 Gazette lead located; draft/final status and form schedules require verification. |
| Jharkhand | [Source lead](https://shramadhan.jharkhand.gov.in/faqShow.action) | Official compliance guidance located; prescribed schedules require verification. |
| Karnataka | [Source lead](https://klwb.karnataka.gov.in/storage/pdf-files/NewLabourDept_English_Final_2%2C2025-26.pdf) | LWF compendium located; do not derive current contribution rates from historical form examples. |
| Kerala | [Source lead](https://lc.kerala.gov.in/images/amndmnt_mnwgsrulsnotification.pdf) | Minimum Wages amendment and Form XIV alternative located; conditions and Code transition require review. |
| Madhya Pradesh | [Source lead](https://labour.gov.in/acts-wise) | Combined-register simplification reported on Ministry page; state schedule verification pending. |
| Maharashtra | [Source lead](https://mahakamgar.maharashtra.gov.in/Site/Upload/PDF/Regulation_of_Employment_Conditions_of_Service_Rules_2018.pdf) | Shops Rules Form Q inspected. Labour Code drafts must not be treated as final rules. |
| Manipur | [Source lead](https://manipurlabour.mn.gov.in/Account/Register) | Official portal located; prescribed schedules require verification. |
| Meghalaya | [Source lead](https://meglabour.gov.in/laws.html) | Official laws index located; prescribed schedules require verification. |
| Mizoram | [Source lead](https://printingstationery.mizoram.gov.in/storage/site/files/Ex-19%20-%20Code%20on%20Wage%20Rules%202022.pdf) | 2022 Wages Gazette located; operative date and amendments require review. |
| Nagaland | [Source lead](https://nlsic.nagaland.gov.in/index.php/2020/02/27/labour-commissioner/) | Official department information located; prescribed schedules require verification. |
| Odisha | [Source lead](https://labourdirectorate.odisha.gov.in/ease-of-doing-business/building-and-other-construction-workers-regulation-employment-and-conditions) | Official BOCW guidance located; register schedules require verification. |
| Punjab | [Source lead](https://punjab.gov.in/government/departments/department-of-labour/) | Official department directory located; prescribed schedules require verification. |
| Rajasthan | [Source lead](https://labour.rajasthan.gov.in/DownloadForms.aspx) | Official forms index located; state Code draft forms require final-notification review. |
| Sikkim | [Source lead](https://labour.sikkim.gov.in/Uploads/LawsAndForms/16621372-87C7-4373-B920-18C9EF1F486C.pdf) | Rules on attendance, payment, advances and overtime located; exact numbering and current amendments require verification. |
| Tamil Nadu | [Source lead](https://dish.tn.gov.in/assets/pdf/Amendment%20of%20Rules%20for%20Maintenance%20of%20registers.pdf) | 2021 Factories amendment inspected; supplied Shops and holiday forms belong to Tamil Nadu. |
| Telangana | [Source lead](https://ipass.telangana.gov.in/viewpdf.aspx?filepathnew=D%3A%2FTS-iPASSFinal%2Fdocs%2F2019LETF_MS6+%282%29.PDF) | 2019 G.O.Ms.No.6 integrated Forms II and III inspected. Current Code transition requires separate review. |
| Tripura | [Source lead](https://labour.tripura.gov.in/sites/default/files/2025-01/The%20Tripura%20Ease%20of%20Compliance%20to%20Maintain%20Registers%20under%20various%20Labour%20Laws%20Rules%2C%202019.pdf) | 2019 common-register rules located in official search; direct retrieval failed, schedules pending. |
| Uttar Pradesh | [Source lead](https://niveshmitra.up.gov.in/information/criminal-provisions-list) | Official compliance list located; prescribed schedules require verification. |
| Uttarakhand | [Source lead](https://labour.uk.gov.in/files/Joint_Inspection_Checklist__Procedure.pdf) | Official inspection checklist located; new Code notices and exact schedules require review. |
| West Bengal | [Source lead](https://lwf.wblabour.gov.in/wblabour/Admin/form_h) | Official LWF Form H indexed; website currently redirects to maintenance. Current schedule verification pending. |
| Andaman and Nicobar Islands | [Source lead](https://www.legislative.gov.in/static/uploads/2025/06/c784a49473bd4d752545e4efe54c2925.pdf) | 2013 Shops Regulation located; rules and prescribed schedules require verification. |
| Chandigarh | [Source lead](https://www.chandigarh.gov.in/sites/default/files/RTI/r2i_labour.pdf) | Official department information located; schedules and 2026 rules require review. |
| Dadra and Nagar Haveli and Daman and Diu | [Source lead](https://cdnbbsr.s3waas.gov.in/s371e09b16e21f7b6919bbfc43f6a5b2f0/uploads/2023/11/202311242091612363.pdf) | Combined UT tracked once. Historical territory-specific rules and subsequent notifications require review. |
| Delhi | [Source lead](https://labour.delhi.gov.in/labour/delhi-shops-establishments-rules-1954-0) | Shops Rule 14 Forms G, or H with I, identified; exact printable schedules and later amendments pending. |
| Jammu and Kashmir | [Source lead](https://jklabourcomm.jk.gov.in/LabourRules/Contract_Labour_%28Regulation_and_Abolition%29.pdf) | CLRA compilation hosted by department located; amendments and Code transition pending. |
| Ladakh | [Source lead](https://cdnbbsr.s3waas.gov.in/s395192c98732387165bf8e396c0f2dad2/uploads/2026/04/20260427650973687.pdf) | April 2026 OSH source located; later final rules and supersession need verification. |
| Lakshadweep | Not verified | No authoritative prescribed schedule verified. Obtain published rules and Gazette schedules; no state form enabled. |
| Puducherry | [Source lead](https://labour.py.gov.in/registers-and-returns) | Official register/return index located; exact layouts and Code transition require verification. |

## Application changes

The Statutory Registers page now includes a legal-format library with jurisdiction selection and search across form number, Act, rules and title. Each record shows the rule reference, publication instrument, source status, document purpose and source link. Search for XII keeps the CLRA contractor register and OSH work-period notice separate.

The API returns only the selected jurisdiction. It rejects unknown jurisdictions and does not fall back to Central forms for an unverified state. It serves source documents through a catalogue identifier, never a request-provided file path. The reference endpoints expose no client or employee data.

Published existing state rules are distinguished from superseded Central CLRA material and final new Code rules. Source publication status is separate from establishment applicability approval: a real Gazette can still be inapplicable to a specific branch or payroll period.

## Act-based preparation implemented

The operational flow is branch and month → jurisdiction → Act → identified form. Fourteen reviewed layouts (Central and Andhra Pradesh Code on Wages Forms I, IV, V and IX, plus Central OSH Forms XIII, XIV, XV, XVI, XIX and XX) support blank Excel download and reviewed manual preparation. Each workbook carries the full legal identity, source, rule reference, schema fingerprint, branch, period, preparer and applicability evidence. These are electronic field-based layouts, not facsimiles. All fourteen were generated with fictional sample data and exported through native Excel; representative wage, muster, accident, leave and wage-slip pages were inspected. Local-language and authentication requirements still require statutory review.

Generation requires an active authorised branch, matching state or Central appropriate-government jurisdiction, a confirmed decision for the selected WAGES_2019 or OSH_2020 Act from the existing branch applicability engine, and facts that have not changed since that decision. A rule version beginning mid-month cannot generate the entire transition month. The migration introduces an explicit appropriate-government field and separate Code applicability items, without automatically assuming applicability. It is included in the migration runner that executes before backend rollout.

Forms IV and V can prefill stored fields from an approved payroll run belonging to the selected client, branch and month. Rates and deduction breakdowns that are absent from that snapshot remain for the preparer to complete. Employee forms prefill approved branch employee profiles, retaining missing particulars for completion. Muster forms use approved employee daily attendance with an approver and approval timestamp; missing days are never inferred as absence or reconstructed from payroll totals. A separate vendor selector uses branch-assigned contractors. Contractor employee records, branch-approved attendance snapshots and current published payroll versions are scoped by client, branch, vendor and month. Unresolved payroll mismatches block prefill. Missing daily timing evidence, wage-rate splits and payment details remain for completion; employer costs are never deducted from employee wages. Central OSH Form XX can prefill approved earned-leave applications, without inventing statutory leave entitlement, annual carry-forward or leave payments. Central OSH Form XIX requires an incident/report reference and consistent event dates. Authority-maintained registers remain reference-only.

Validated workbooks are saved as PENDING records in the existing register review workflow. Identical content is deduplicated under a database transaction lock. Changed content creates another record with a unique evidence file; existing approved evidence is preserved. Generated values are explicitly identified as preparer-entered/reviewed, not an immutable payroll snapshot. Monetary reconciliations, selected wage period, required details, text identifiers and valid calendar days are checked.

## Remaining coverage and verification

1. Verify the remaining state/UT schedules, amendments, effective dates and savings provisions. Forty catalogue entries are available as references; only the fourteen layouts above support preparation. Telangana is not silently mapped to Andhra Pradesh.
2. Resolve contradictory headings in supplied workbooks and convert remaining prescribed forms under their exact legal identity.
3. Complete exact prescribed-layout, vernacular and authentication review for the remaining formats. Native Excel printing has been checked for the implemented layouts; these electronic field layouts still require statutory authentication before operational use.
4. Full statutory leave-ledger calculations and structured incident-system integration remain pending. Current adapters use approved earned-leave applications and referenced manual incident evidence. Historical transfers, missing contractor daily timings and particulars absent from source snapshots require supporting records.
5. Implement approved-record reuse/attestation for statutory equivalence. Central OSH Rule 72(3), verified on PDF page 193, is now explained beside the four relevant forms to avoid unnecessary duplicate preparation. This notice does not automatically approve applicability or link existing records.
6. Production migration and deployment have not been performed. The migration and service-level generation/approval/download flow were verified against an isolated PostgreSQL 18 instance, which is stopped after testing.

## Validation completed

- 38 backend tests passed, including form identity, scope, period, required details, reconciliation and duplicate/revised evidence handling.
- Five Angular browser tests cover Act isolation, employee/vendor source selection, and cancellation/reset on jurisdiction, branch or contractor changes.
- Backend and production frontend builds passed. Frontend emitted existing Sass import deprecation warnings.
- Targeted backend lint and Git whitespace checks passed.
- Eleven isolated PostgreSQL checks passed: repeated migration, government constraint, concurrent deduplication, pending-download denial, approval and byte-identical download, access through the second assigned branch, empty-branch denial, cross-client denial, generated list identity/filter, preservation of approved revisions and stale-facts denial. The verifier creates a unique temporary test database on a dedicated local port and removes that database afterwards. It never reads application database environment variables.
- Fourteen fictional populated formats passed input validation and native Excel PDF export. Long bank-account and UAN strings retained leading zeros in applicable PDFs. Print inspection corrected cover-sheet horizontal splitting, small wage columns, wrapping and continuation headings, and removed non-applicable daily signature cells from OSH muster. Reproduce fixtures with `node -r ts-node/register/transpile-only scripts/render-register-samples.cjs`; this utility reads no application database. Native Excel, not the third-party spreadsheet preview, was used for these checks.

## Sources

1. Chief Labour Commissioner (Central). [Contract Labour (Regulation and Abolition) Central Rules, 1971](https://clc.gov.in/clc/acts-rules/contract-labour-regulation-abolition-act-1970), Rules 74–78. Historical source subject to later supersession and savings.
2. Ministry of Labour and Employment. [OSH (Central) Rules, 2026](https://www.labour.gov.in/static/uploads/2026/05/ee246f790cad0b8e99c3828f34fa09a6.pdf), G.S.R.345(E), 8 May 2026; Rule 72 and annexed forms, PDF pages 192–194 (Rules 72–76), 280–310 (forms).
3. Government of Andhra Pradesh. [Code on Wages (Andhra Pradesh) Rules, 2026](https://www.ricago.com/assets/front/base/file/file_management/6536.pdf), G.O.Rt.No.124, Gazette No.328, 29 June 2026. Government Gazette copy hosted by Ricago; Rules 42–43 and schedules.
4. Government of Telangana. [G.O.Ms.No.6](https://ipass.telangana.gov.in/viewpdf.aspx?filepathnew=D%3A%2FTS-iPASSFinal%2Fdocs%2F2019LETF_MS6+%282%29.PDF), 2 March 2019, common return and integrated registers.
5. Ministry of Labour and Employment. [Code on Wages (Central) Rules, 2026](https://www.labour.gov.in/static/uploads/2026/05/6eb0c35ba63b776487a025e5123b6b12.pdf), G.S.R.343(E), 8 May 2026; Rules 51–52 and Forms I, IV, V, IX.
6. Ministry of Labour and Employment. [Code on Social Security (Central) Rules, 2026](https://www.labour.gov.in/static/uploads/2026/05/49aa9b62c2125499c37399b90e969d67.pdf), G.S.R.344(E), 8 May 2026; Rule 53 and Form XXII.
7. Government of Delhi. [Delhi Shops and Establishments Rules, 1954](https://labour.delhi.gov.in/labour/delhi-shops-establishments-rules-1954-0), Rule 14.
8. Ministry of Labour and Employment. [Industrial Relations (Central) Rules, 2026](https://www.labour.gov.in/static/uploads/2026/05/f05a2c220dcdec0ea9c55e84d9ff791f.pdf), G.S.R.342(E), 8 May 2026; Rule 17.
9. Government of Maharashtra. [Shops and Establishments Rules, 2018](https://mahakamgar.maharashtra.gov.in/Site/Upload/PDF/Regulation_of_Employment_Conditions_of_Service_Rules_2018.pdf), 23 March 2018; Rule 26 and Form Q, PDF page 90 onwards.
10. Government of Tamil Nadu. [Factories Rules amendment](https://dish.tn.gov.in/assets/pdf/Amendment%20of%20Rules%20for%20Maintenance%20of%20registers.pdf), 24 March 2021; amended Forms 12, 15 and 25.
11. Supplied Word/Excel files and ZIP archives, local private references; filenames and classifications listed above. Content reviewed for form identity, not accepted as evidence of current legal applicability.


## Reviewed evidence and leave calculation follow-up

Added versioned operational source records for implemented incident and leave forms. The branch, period, form and stable evidence reference identify a record. Identical JSON inputs reuse the current version; corrections retain the earlier snapshot and create a new pending version. Only Payroll/Admin can approve the current version. The preparation screen can load saved evidence for review and reuse approved particulars. Generation retains its separate pending-register review.

Added explicit reuse attestations for Central OSH Rule 72(3), limited to the verified Central Wages counterparts for OSH XIII–XVI. A source must already be approved and match the client, branch, period and employee/contractor workforce. Both Acts' current applicability must pass. Reuse creates a link, not a duplicate register or a change to the source's legal identity. Payroll/Admin approval is required; withdrawing source approval makes the link ineffective. Older generated records without persisted workforce scope are deliberately excluded.

Added a Central OSH section 32 annual leave calculator using reviewed annual attendance/leave totals: qualification versus earning days, mid-year joining, adolescent/underground rates, exit entitlement, ordinary carry cap, separately protected refused leave and encashable excess. It requires confirmation that standard section 32 applies. Special-category schemes/exemptions need separate verification. No rounding convention, payment, ESS balance or unavailable source total is invented. Existing register remarks are retained and editing inputs cancels stale calculations.

Legal basis: [OSH Code 2020, section 32, Gazette pages 30–31](https://labour.maharashtra.gov.in/sites/default/files/2026-04/the-occupational-safety-health-and-working-conditions-code-2020.pdf), together with Central OSH Rule 76. The original Gazette distinguishes qualifying days from days earning leave and protects refused leave separately. More-beneficial and special provisions must be checked for the worker.

Validation of this follow-up: backend and production frontend builds passed; 1,369 backend tests passed (one skipped); 10 Angular register-screen tests passed; 18 isolated PostgreSQL checks passed, including migration idempotence, concurrent reuse without duplicate files, source withdrawal, JSON-order deduplication, reviewer roles and source revision preservation. Existing Sass deprecation warnings remain.

Remaining coverage: this does not complete all-state prescribed formats. The 14 implemented layouts remain the generation set. Other states and register types remain reference/research entries until their current notification, exact columns, source adapter and printed output are verified. Telangana is not assumed to inherit Andhra Pradesh's 2026 rules. Further review must also address the older generic register-generation API before declaring all statutory generation paths migrated. New evidence tables require migration 20260921 before these features are deployed.

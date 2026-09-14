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

## Remaining coverage and verification (current)

1. The catalogue contains 100 Act/state/form identities; 68 have implemented preparation layouts. Other combinations remain explicitly unavailable for generation until the full applicable schedule is verified. Telangana is not silently mapped to Andhra Pradesh.
2. Remaining state/UT rules, state Acts, savings provisions, amendments, vernacular layouts and authentication requirements still require verification. This is not complete India-wide coverage.
3. Arunachal schedules were recovered from a complete alternate Gazette copy; Forms I, IV and V are implemented. The earlier clipped copy is not the bundled source.
4. Special statutory leave schemes (including working journalists and sales promotion employees), historical leave transfers and direct incident-system integration remain pending. Standard section 32 calculation, reviewed incident/leave evidence and explicit OSH Rule 72(3) reuse attestations are implemented.
5. Production migration and deployment have not been performed. Isolated PostgreSQL checks cover migration, generation, approval, downloads, revisions and access scope.

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


## Rajasthan formats and retirement of generic generation

Rajasthan Gazette S.O.40 dated 12 August 2026 was retrieved and its own schedules inspected (source retained as rjw.pdf with SHA-256 in the manifest). Four additional layouts implement Form I wages/fines/damage, Form IV employee particulars, Form V daily status muster/overtime, and Form VII wage slips. These are not matched to the same-number Central forms. Rule 1 requires commencement on publication, so this monthly preparation flow first accepts September 2026; it does not apply the new rules retroactively to the whole of August.

The Rajasthan employee form omits Central-only particulars. The wage form preserves its 23 numbered columns and distinct deduction reconciliation. Composite worker/parent and designation/department particulars require completion from source records rather than accepting partial payroll fields. Daily muster uses P/HD/A/L/WO/H and validates days present, rest and leave against the daily entries. Approved company attendance can prefill statuses and complete-month totals; paid days require payment evidence. Contractor monthly totals cannot be turned into daily attendance, so that register requires the reviewed daily record.

Both generic generation methods and the legacy branch-template preview now return HTTP 410 with the Act-specific library replacement. The old template metadata remains reference-only, and existing files remain available through the scoped record-download workflow. PF ECR and ESI contribution generators are separate and unaffected. The frontend no longer displays the old unverified applicable-template badges or invokes bulk generation.

The implemented generation count is now 18. All 18 fictional sample workbooks validate; all four new Rajasthan workbooks exported through native Excel. Source and output pages were visually inspected. Remaining states/Acts still require their own source and layout verification: this update does not represent complete India-wide statutory coverage.

Primary document: [Rajasthan Gazette, Code on Wages Rules 2026](https://cdn.labourcodesadvisor.com/Rules/rajasthan/final-wages-rules.pdf), Rules 42–43 and PDF pages 18–19, 24–26 (government document hosted by Labour Code Advisor).

Follow-up validation: all 52 focused register/retired-path tests passed; backend and frontend production builds passed; targeted backend lint passed. The isolated PostgreSQL evidence tests from the previous commit remain applicable; this follow-up introduces no database migration.


## Gujarat schedules and commencement

Gujarat notification KHR/2021/128/LVD/10/2020/555709/M(2), dated 5 October 2021, was inspected, including its final-making recital and Rule 1(3). The rule ties operation to commencement of the Code. The relevant provisions, including record requirements, commenced on 21 November 2025 under S.O.5322(E). This is distinct from the 2021 publication date.

Implemented Gujarat Form I (19 columns, including attendance date/signature), Form IV employee particulars, and Form V wage slip. Form I has no prescribed separate gross or PF/ESI deduction columns; those are not copied from Rajasthan's 23-column schedule. The employee and wage-slip particulars were compared against their schedules before sharing field definitions. The signature exception for electronic maintenance is retained. The notification is stored as gjw.pdf and hashed in the source manifest.

Current implemented total: 21 formats. All 21 fictional workbooks validate; the three Gujarat workbooks also exported through native Excel and the wage output was visually inspected. All 53 focused register tests passed. Other state/Act combinations remain reference/research items, not implicitly substituted with these forms.

Sources: [Gujarat final notification](https://cdn.labourcodesadvisor.com/Rules/gujarat/final-wages-rules.pdf), Rules 1, 42–43 and PDF pages 14 and 17; [Central commencement notification S.O.5322(E)](https://www.labour.gov.in/static/uploads/2025/12/0fd090d29a4576739079a7b565c8ca9d.pdf).


## Bihar, Ladakh, Uttar Pradesh, Sikkim and Arunachal follow-up

Final-making recitals and commencement provisions were inspected, separately from the tracker used to locate the Gazette copies. Bihar notification 30 June 2026 was published on 1 July: Rule 1(3) uses publication, so preparation starts with July, not June. Ladakh S.O.231 is dated 28 July but published 3 August; the monthly flow requires September or later. Uttar Pradesh's notification and publication are 12 August, so its monthly flow likewise starts in September.

| Jurisdiction | Implemented schedules | Distinctions retained |
| --- | --- | --- |
| Bihar | I employee; IV wages; V slip; IX attendance | 33-column wages with Others instead of a separate Advances column; deduction reconciliation remains enforced |
| Ladakh | I employee; IV wages; V slip; IX attendance | Same verified field purposes as Bihar, independently identified; daily in/out/signatures |
| Uttar Pradesh | I wages; II employee; IX slip | 33 wage columns; 37 employee columns including the continuation; IX is not a muster roll |
| Sikkim | I wages; IV employee; V slip | Final Gazette No.168, 28 April 2022, rather than the draft No.12 on the official download page; 19 wage columns |
| Arunachal Pradesh | I wages; IV employee; V slip | Complete alternate Gazette No.35, 24 February 2022; Rules 50–51, 19 wage / 30 employee fields |

Sikkim Rule 1(3) refers to final publication; this implementation conservatively limits Code register preparation to periods after the relevant Code commencement on 21 November 2025. Arunachal Rule 1(3) expressly ties commencement to the Code. The 2022 publication dates remain separately recorded. No claim of earlier Code enforceability is made.

Sources: government Gazette copies hosted by Labour Code Advisor: [Bihar](https://cdn.labourcodesadvisor.com/Rules/bihar/final-wages-rules.pdf), pages 23, 36, 38–39, 42–43, 48; [Ladakh](https://cdn.labourcodesadvisor.com/Rules/ladakh/final-wages-rules.pdf), pages 1–2, 20–21, 25, 30–31, 35; [Uttar Pradesh](https://cdn.labourcodesadvisor.com/Rules/uttar-pradesh/final-wages-rules.pdf), pages 46, 57–58, 63–64, 68; [Sikkim](https://cdn.labourcodesadvisor.com/Rules/sikkim/final-wages-rules.pdf), pages 1, 14–15, 17, 21–22; [Arunachal Pradesh](https://a4m1n.praansconsultech.com/storage/labour-code-documents/01KZG1FS2S09AVA50JXMT95TEF.pdf), pages 1, 9–10, 13. Original downloaded PDFs are preserved and hashed; inspection copies do not replace source evidence.

Validation: 60 focused tests passed; 32 prior/new fictional workbooks passed validation and 11 Bihar/Ladakh/UP formats exported through native Excel. Final Sikkim/Arunachal print checks and full build checks are recorded below when complete.


The Central short title was corrected to **Wages (Central) Rules, 2026** by [G.S.R.629(E), 15 July 2026](https://egazette.gov.in/WriteReadData/2026/274525.pdf). The original notification and separate corrigendum are bundled with hashes. Existing internal Act/rules/form identifiers are preserved; this wording correction does not change the implemented columns.


## Social Security women-employees schedule

Central Social Security Form XXII (Rule 53(1)(a), PDF page 232) is implemented as a separate authorised-HR preparation. It records women employees even when maternity event fields are inapplicable. All 23 prescribed groups are retained, including the employment-month table, proof dates, dated payments, nominee/death-payment particulars and reserved inspector remarks. Each monthly snapshot retains its own evidence and approval; prior employment/event history must be retained in supporting records rather than inferred from payroll.

The preparer cannot fill the inspector-only remarks. Payment amounts require dates, illness payments require the granted leave period, and employment-status days must reconcile to the selected calendar month. Payroll and attendance prefills are disabled for this form. This is record preparation, not maternity entitlement calculation or a payment instruction.

Current implementation: 39 layouts, 64 focused tests passing. Backend and frontend builds, 10 frontend register tests and targeted lint passed before this final maternity addition; subsequent validation is recorded in the PR. The preceding 38 layouts all exported through native Excel; the new women-employees layout is checked separately.

Special leave research: Central OSH Rule 66, pages 187–190, uses a separate 1/11 duty earning basis with a 120-day earned-leave accumulation stop, 1/18 service medical leave with a 90-day stop, medical conversion, and specific exit provisions. Intervening holidays count within such leave, unlike the standard section 32 flow. Applying annual aggregate totals without chronological balance movements can over-credit when a cap is reached. A separate chronological implementation remains required; the existing calculator continues to exclude this scheme explicitly.

Final follow-up validation: 65 focused backend tests and 11 Angular register tests passed; backend/frontend production builds and targeted backend lint passed. All 39 fictional formats validate and export through native Excel. Original source hashes and the 39-pair sample archive were checked. No application database or live employee data was used for these print tests.

## Andhra Pradesh, Bihar and Rajasthan final OSH schedules

Verified and implemented 17 additional state layouts from original government notifications hosted by public legal/compliance publishers:

- [Andhra Pradesh Gazette No.432, 7 August 2026](https://ascent-hr.com/wp-content/uploads/2026/08/OSHWC-Andhra-Pradesh-Rules-2026_07.08.2026.pdf): Rule 32 and Forms VIII, VIII(A), IX, X and XI; PDF pages 38–39 and 449–453. Effective from publication, not the previous day's notification. Employee VIII includes a separate PPF number; wage IX includes total wage rate and eight deduction categories without an advances column. Leave X has 15 numbered columns without the Central carry-forward field. Accident XI has six columns.
- [Bihar Gazette No.699, 1 July 2026](https://employmentlaw.lkslaw.com/file/updates/state-rules/bihar/bihar-osh-rules-2026.pdf): Rules 27, 30 and 31; Forms VIII, VIII(A), VIII(B), VIII(C), X and XI; PDF pages 227–229, 381–384 and 388. The readable 408-page final Gazette replaces the unusable scanned research copy as bundled evidence. English/Hindi and five-year preservation requirements are recorded, along with quarterly incident-register communication and the leave-register transfer requirement.
- [Rajasthan S.O.23, 30 June 2026](https://employmentlaw.lkslaw.com/file/updates/legacy/rajasthan-osh-rules-2026.pdf): Rules 49, 52 and 53; numeric Forms 16–20 and 24; PDF pages 26–28, 186–191 and 198. These identities are distinct from Rajasthan Wages forms. Employee and attendance preparation retains establishment district; statutory source PDFs preserve the complete original schedules.

Shared field definitions are reused only after comparing these specific schedules. Every register retains its jurisdiction, Act, rules, form, commencement and source page. The workbook identity sheet now carries the source-specific requirements and establishment address. Samples contain a fictional branch/address and no live employee data.

Verified reuse now covers Bihar Rule 27(2) and Rajasthan Rule 49(3), as well as Central Rule 72(3). Source records must belong to the same jurisdiction, client, branch, period and workforce and already be approved. Both Acts are independently checked before offering sources. The stored attestation records the correct state rule. No equivalence is inferred for Andhra Pradesh. The UI consumes verified capabilities from the definition; state leave records no longer show the Central-only leave calculator.

Validation: 73 focused backend tests, 12 browser tests, backend/frontend production builds and targeted backend lint passed. All 56 sample workbooks validate and exported through native Excel. The 56-pair sample archive includes fictional establishment particulars and source identity. Source/output pages were visually checked; original bundled PDF hashes were verified. This update does not claim all-state or all-Act completion; the remaining coverage below is still applicable.


## Arunachal Pradesh and Gujarat OSH schedules

Five further layouts are implemented from primary Gazette copies: [Arunachal Gazette No.132, 2 May 2022](https://a4m1n.praansconsultech.com/storage/labour-code-documents/01KZG1HNEYB4P5VVA0CNZDVW64.pdf), pages 15, 207 and 214, and [Gujarat Gazette Extra No.87, 12 June 2025](https://cdn.labourcodesadvisor.com/Rules/gujarat/final-osh-rules.pdf), pages 26–28, 61 and 66. Code commencement is checked against [S.O.5321(E), 21 November 2025](https://labour.maharashtra.gov.in/sites/default/files/2025-11/implementation-of-labour-codes_0.pdf).

Arunachal VIII preserves the 19 wage columns; X places event date before the injured person's name; XI retains the 15 leave columns. The rule text and printed schedule cite inconsistent sub-rule numbers; both are recorded rather than silently corrected. Gujarat 13 preserves its 19 wage columns, and 22 retains 15 numbered groups including notice time, ESIC, witnesses and absence including holidays. Its factory/construction restriction is enforced against fresh applicability facts and retained in the approval evidence. The December 2025 Gujarat amendment examined is a draft, not an operative replacement.

Combined designation/department fields are not filled with an incomplete designation from payroll. Incident notice times use 24-hour HH:mm; same-day notices cannot precede the incident and entry dates cannot precede it. Gujarat's written-order equivalence provision is not treated as automatic permission to reuse another Act's register.

Validation: 77 focused backend tests pass; backend production build and targeted lint pass. All 61 fictional workbooks validate and export through native Excel. The five new printed schedules were inspected for field order and readability. The isolated PostgreSQL verifier passed all 18 checks with the updated applicability query. Previous frontend changes passed 12 browser tests and production build; no frontend code changed in this batch. All 21 bundled source hashes were verified. Coverage remains partial: 61 implemented layouts among 86 catalogue identities, with other state/Act schedules, specialist leave and vernacular review still pending.


## Ladakh and Uttar Pradesh final OSH schedules and annual leave preparation

[Ladakh S.O.238](https://cdn.labourcodesadvisor.com/Rules/ladakh/final-osh-rules.pdf), signed 30 July 2026 and published as SG-LD-E-02092026-1819 on **2 September 2026**, was inspected at pages 1–2, 23–25, 204–207 and 218. Rules 39 and 45 expressly refer to Wages registers; the library identifies the referenced Ladakh Wages Forms I and IV and provides reviewed reuse with independent applicability checks. These are referenced Wages form numbers, not invented OSH schedules. Form 18 preserves its six fields and uses total **man-hours lost**, without substituting another state's days-absent field.

Ladakh Form 19 now has dedicated annual preparation. The selected year covers January–December; the monthly filter does not affect annual evidence identity. All twelve monthly worked-day entries must reconcile to the annual total, and cannot exceed days employed in each month. Opening plus earned leave establishes available credit, and used/encashed/remaining leave reconciles to that credit. This implements ledger reconciliation, not statutory entitlement calculation. Reviewed HR evidence is required; monthly payroll/application prefills and the Central-only calculator are unavailable. The workbook clearly prints the calendar-year period. A completed annual register cannot be issued before year-end, and a year spanning the rule's commencement is blocked for separate transition review. This means the first full-year preparation under this version is 2027; the September 2026 transition is not silently backdated.

Ladakh Forms 16 and 17 remain identified but unavailable for preparation pending daily/weekly overtime, compensatory rest and worker-card handling. Form 29 is correctly marked authority-maintained under Rule 67. The biometric-card exception in Rule 41 requires all prescribed conditions; installing an attendance device alone does not establish the exception.

[Uttar Pradesh notification 962/XXXVI-03-2026-1903305, 27 August 2026](https://cdn.labourcodesadvisor.com/Rules/uttar-pradesh/final-osh-rules.pdf) was inspected at pages 289, 309–311, 477, 490–492 and 511. Final Rule 1(4) commences on publication. Accident Form 16 retains all 20 groups, including notice authentication, shift/department, witnesses and insurance local office. It has neither a lost-days nor a lost-man-hours field; both are excluded. Form 29 is maintained by the designated licensing authority. Attendance Form 6 and leave Forms 14/15 remain separately identified pending their full operational workflows; Rule 61's separate overtime slip is not conflated with a regular wage slip. Rule 55 retention/language and pending-proceedings requirements are recorded.

Sikkim follow-up: the [official OSH notification retrieved](https://labour.sikkim.gov.in/Uploads/AllFiles/133.pdf) is a draft. No final Sikkim OSH schedule was established by this follow-up search, so no draft-based generation was enabled. This does not assert that no later final notification exists.

Latest verification: 84 focused backend tests and 13 frontend register tests pass. Sixty-six fictional XLSX formats validate; new Ladakh and UP samples export through native Excel, while unchanged PDF samples retain their earlier verified exports. Annual/incident output and source pages were inspected. Original bundled source hashes and the sample archive were checked. Backend/frontend production builds and targeted backend lint passed. This remains a partial all-state implementation; other state/Act registers, specialist leave, transition periods and vernacular/authentication review remain open.


## Follow-up on draft and preliminary sources

The following sources were rechecked rather than treated as final register authority: [Maharashtra's official rules index](https://labour.maharashtra.gov.in/en/publication/new-labour-code), [Odisha Gazette notification index](https://labour.odisha.gov.in/en/notification/gazette-notification), [Uttarakhand's proposed-rule documents](https://labour.uk.gov.in/documents/), [Kerala's Labour Commissionerate updates](https://lc.kerala.gov.in/ml/node/5), [Assam's draft-rule index](https://labour.assam.gov.in/document-details/draft-state-rules-labour-code), [Karnataka Gazette No.99, 23 January 2026](https://ascent-hr.com/wp-content/uploads/2026/01/Karnataka-draft-OSH-Rules-2026.pdf), [Tamil Nadu Gazette No.214, 11 April 2022](https://labour.tn.gov.in/pdf/Code_on_Wages.pdf), and [Telangana G.O.Rt.480, 29 September 2021](https://saralweb.com/state-wise-rules/telangana/COWTelangana.pdf). These particular rule sources are labelled draft/proposed/preliminary. This establishes their status, not the absence of any later final rule. No generation was enabled from these documents, and no Andhra Pradesh-to-Telangana equivalence was inferred. Existing saved rules, later amendments and unrepealed state Acts still require separate applicability/version review.

Annual balance reconciliation now uses exact hundredths of a day rather than the monetary one-paise tolerance; finer precision and duplicate annual worker-register numbers are rejected.


## Final Andhra Pradesh and Bihar Social Security schedules

Verified [Andhra Pradesh Gazette No.345, 7 July 2026](https://www.ricago.com/assets/front/base/file/file_management/6454.pdf), pages 1–2, 28–29 and 73–74, and [Bihar Gazette No.697, 1 July 2026](https://betastate.bihar.gov.in/file_2/FileUpload/2026/Jul/22-Jul-2026/35/DyPage/1b6711fd-9342-46c0-a9cb-7de816f3e6f5.pdf), pages 1, 76–77 and 106. AP Form XX and Bihar Form XXI retain 21 prescribed groups. Their schedules omit the two separate Central PF/ESI particulars. Each uses its own Act, rule, source and commencement date. Monthly preparation records reviewed HR evidence and retains supporting history; it does not calculate maternity entitlements or infer events from payroll. Inspector remarks remain reserved. Recorded events and paid-benefit dates cannot exceed issue date.

AP Rule 28 and Bihar Rule 27 recognise specified Wages/OSH registers. Those dependencies are not new Social Security form numbers; the women register cannot replace them. Bihar Rule 27(2) prints Wages Rules 2025 for slips, while its common-register clauses name 2026; no automatic slip equivalence was added from that inconsistent reference. Bihar Chapter V records also have the separate ten-year retention provision in Rule 27(6).

Source quality: the Praans page labelled AP final Social Security rules linked the February preliminary G.O.Rt.43 PDF. That file was excluded. The Ricago copy contains the actual final Gazette header and final-making recital. The Bihar government download provides the complete readable Gazette; it replaces the scanned notification research copy as bundled evidence.

Current verification: 68 layouts across 100 legal identities, 25 hashed source PDFs, and 68 fictional XLSX/PDF pairs. Ninety focused backend tests cover the current changes; 13 frontend register tests and the frontend production build passed before these backend-only additions. The latest backend build and targeted lint passed. Annual leave reconciles exact hundredths of a day. CI on f2e9bbda passed all 14 checks; the next commit requires its own CI result. India-wide state-Act coverage, specialist schemes, transition periods, vernacular/authentication review and production deployment remain open.

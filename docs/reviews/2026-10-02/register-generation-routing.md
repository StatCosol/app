# Payroll register generation and download audit

Reviewed 2 October 2026. Scope: Payroll preparation, saved-register filters and ZIP transfers, LegitX and Branch Desk access, and implemented Excel outputs.

## Confirmed defects and corrections

- Payroll's register-type menu contained legacy types but omitted saved Act-specific legal identities. It also excluded event/manual register types although the current library prepares some of them. Saved legal forms now appear using their exact identity, with matching Act groups.
- The on-screen Act filter was applied only in the browser; ZIP requests omitted it. ZIP requests now include the displayed record IDs. The backend validates a bounded UUID list and intersects it with existing tenant, branch, period and type scope. Downloads are unavailable during scope reloads; generation clears stale form filters.
- Payroll prefill omitted stored PF/ESI deductions. Employee-row snapshot values now take precedence, with approved-run component snapshots as a fallback. Real zeros remain zero; missing amounts remain missing. No rates, payment receipts or daily attendance are inferred.
- Individual form sheets omitted the selected establishment's address. It now appears on the form, with taller wrapped headers when required. Establishment name/address participate in the evidence fingerprint.
- Telangana table counts used a format that could display a trailing decimal point. Whole values now use an integer format; fractional counts retain two decimals. Numeric fields on individual forms also use numeric display formats.
- A changed workbook renderer previously did not affect the preparation schema hash. Workbook format version 3 now invalidates reuse of older output when corrected formatting is generated, while identical evidence within a version remains reusable.
- LegitX/Branch Desk counts distinguish pending, approved and rejected saved records; filter changes cancel stale list requests. Branch downloads retain the existing approval and assignment restrictions.

- Annual register preparation saves its evidence under December. Its completion event now carries the saved branch/year/month through the library to Payroll, so the refreshed list opens the actual saved period and ignores stale branch events.

## Live Logiq evidence (read-only)

All March–August 2026 approved payroll employee snapshots are linked to HYD-001 / BRM. Employee counts respectively: 32, 35, 26, 27, 29 and 28. March has copied statutory deduction fields on 31 employee rows. April–August do not have those copied fields, but do have stored payroll component snapshots, explaining the missing prefill source.

March has 16 legacy register files pending register review. No register files are saved for April–August. This audit does not generate, approve or replace production business evidence. Retired generic formats are not substituted for prescribed Act-specific formats. Supporting particulars required by manual formats still need review.

## Verification

Regression coverage includes every implemented format's three-record grouping, source columns and numeric types; individual address/attendance output; historical component prefill and unknown/zero amounts; source eligibility and client/branch/period restrictions; evidence reuse, replacement and changed establishment fingerprints; secure ZIP filters; and Payroll/LegitX/Branch Desk browser flows. Synthetic Telangana workbook panels were rendered for inspection. A legal or government upload certification of every format is not claimed.

## Deeper transfer and evidence review

- Client ZIPs previously applied a silent server cap (120 records by default; the frontend sent an undeclared limit). Payroll and client ZIPs also silently skipped missing files. Both now preflight the complete scoped selection, reject missing/stale/oversized selections before sending headers, and fail the transfer on archive warnings.
- LegitX/Branch Desk send displayed IDs in a bounded POST body, retaining client, branch, period, approval and source restrictions. Blob error responses are decoded so regeneration/refresh instructions reach the user.
- ZIP name truncation could discard the file extension, particularly with legal-form titles. Names now preserve extensions and remain unique within the length bound.
- Approval/rejection previously saved a full stale entity, which could overwrite a replacement file. Reviews now carry a fingerprint of the displayed evidence; stale pages are rejected, and the database conditionally updates only review fields for the unchanged file/status. Missing files cannot be approved.
- Telangana Form II particulars now export worker counts as numeric cells and text identifiers with text formatting, preserving leading zeros. The output format version prevents reuse of the previous representation.
- The disposable PostgreSQL fixture now creates a real workbook, persists it, checks master/branch visibility, approves it, compares individual/ZIP download bytes, deletes its test file and verifies repair resets approval while retaining record identity and creation history. This fixture uses a fixed synthetic applicability/access context; existing scope and applicability regressions cover those decisions separately.

- Branch wage restrictions now recognize wage-bearing legal layouts (including integrated Telangana forms) in list, download and ZIP queries, rather than relying solely on title text.

- Integrated Form III now repeats the reviewed worksite name/address entered in Form II; branch office details previously overrode them and could make the two required parts disagree. The authorised branch remains identified on the review sheet.

## Live preparation blocker found in the deeper check

A read-only check of live revision statcompy-backend--0001135 found Logiq BRM classified as FACTORY, with appropriate_government unset. Current decisions for TS_SHOPS_1988, WAGES_2019, OSH_2020 and SOCIAL_SECURITY_2020 are false. These are all Acts with implemented forms available for TS/Central in the deployed catalogue, so no such form can currently pass preparation eligibility. Branch context now exposes missing applicability/authority setup before form selection. Correcting the business configuration requires confirmation of the actual worksite relationship and governing authority; the audit does not infer or change them.

## Telangana factory binding and supplied template review

Following confirmation that BRM is a factory under State authority, its live facts were updated to STATE through the facts service and applicability was recomputed with audit records. The FACTORY classification and other facts were preserved. The FACTORIES decision remains applicable; TS_SHOPS_1988 remains inapplicable.

The catalogue now has a separate Factories Act identity for Telangana integrated Forms II and III. It resolves the existing FACTORIES compliance-master decision and requires a Telangana factory under State authority with current applicability evidence. It shares the prescribed workbook layout with the separate Shops entry, without sharing applicability. The MULTI_ACT references remain reference-only. Preparation requires reviewed supporting records, both parts and explicit site capacity; an approved payroll month alone does not create this manual register.

### Sources and comparison

Official source: [Telangana G.O.Ms.No.6, 2 March 2019](https://ipass.telangana.gov.in/viewpdf.aspx?filepathnew=D:/TS-iPASSFinal/docs/2019LETF_MS6+(2).PDF), paragraph 4(9), notification paragraphs 2–3, and PDF pages 12–13. This is the existing-rules source; the selected period's applicable rules and Labour Code transition still require review before authentication.

The user-supplied blank workbook, Integrated registers.xlsx, was inspected read-only on 2 October 2026. It has Form-II, Form-III and an empty Sheet3, with no formulas. It is a customised working layout, not an exact copy of the prescribed form.

| Area | Supplied workbook | Prescribed output retained |
| --- | --- | --- |
| Form II establishment particulars | Main establishment, employer, contractor, registration, inspection and accident fields present | Same particulars, with separate male/female category, skill-class and adolescent counts |
| Form III columns | 30 columns, including Actual Gross; Basic+VDA/allowance/total breakdown; separate ESI/PF | 26 numbered source columns, including total earnings and all other deductions |
| Other earnings | Advance Bonus only | Other amount with description, allowing relevant earnings beyond bonus |
| Other deductions | ESI and PF headings | EPF, ESI, Welfare Fund and other applicable deductions remain representable |
| Authentication | Employer/contractor signature and signatory name | Also principal-employer certification, representative name, designation and signature when acting as contractor |
| Calculations | Blank template with no formulas; Actual Gross versus earned total and repeated allowances are not defined | Reviewed amounts; no guessed mapping or double-counting of the extra working columns |

The application's statutory sheets therefore retain the prescribed fields. The supplied 30-column working layout has not replaced the statutory layout or been given invented calculation rules. The source's printed net-pay cross-reference is not executed as a payroll formula.

### Factory-specific verification

Local checks passed: 207 backend tests across 12 register suites, 17 frontend register preparation/library tests, backend build, targeted frontend/backend lint and diff validation. The disposable PostgreSQL roundtrip fixture now also covers the factory form: both parts, persistence, LegitX master visibility, Branch Desk visibility after approval, individual/ZIP byte equality, wage-access restrictions and missing-file replacement resetting review. Its context is synthetic; eligibility decisions have separate regression tests. CI must execute the database fixture before release.

# Payroll register generation and download audit

Reviewed 2 October 2026. Scope: Payroll preparation, saved-register filters and ZIP transfers, LegitX and Branch Desk access, and implemented Excel outputs.

## Confirmed defects and corrections

- Payroll's register-type menu contained legacy types but omitted saved Act-specific legal identities. It also excluded event/manual register types although the current library prepares some of them. Saved legal forms now appear using their exact identity, with matching Act groups.
- The on-screen Act filter was applied only in the browser; ZIP requests omitted it. ZIP requests now include the displayed record IDs. The backend validates a bounded UUID list and intersects it with existing tenant, branch, period and type scope. Downloads are unavailable during scope reloads; generation clears stale form filters.
- Payroll prefill omitted stored PF/ESI deductions. Employee-row snapshot values now take precedence, with approved-run component snapshots as a fallback. Real zeros remain zero; missing amounts remain missing. No rates, payment receipts or daily attendance are inferred.
- Individual form sheets omitted the selected establishment's address. It now appears on the form, with taller wrapped headers when required. Establishment name/address participate in the evidence fingerprint.
- Telangana table counts used a format that could display a trailing decimal point. Whole values now use an integer format; fractional counts retain two decimals. Numeric fields on individual forms also use numeric display formats.
- A changed workbook renderer previously did not affect the preparation schema hash. Workbook format version 2 now invalidates reuse of older output when corrected formatting is generated, while identical evidence within a version remains reusable.
- LegitX/Branch Desk counts distinguish pending, approved and rejected saved records; filter changes cancel stale list requests. Branch downloads retain the existing approval and assignment restrictions.

## Live Logiq evidence (read-only)

All March–August 2026 approved payroll employee snapshots are linked to HYD-001 / BRM. Employee counts respectively: 32, 35, 26, 27, 29 and 28. March has copied statutory deduction fields on 31 employee rows. April–August do not have those copied fields, but do have stored payroll component snapshots, explaining the missing prefill source.

March has 16 legacy register files pending register review. No register files are saved for April–August. This audit does not generate, approve or replace production business evidence. Retired generic formats are not substituted for prescribed Act-specific formats. Supporting particulars required by manual formats still need review.

## Verification

Regression coverage includes every implemented format's three-record grouping, source columns and numeric types; individual address/attendance output; historical component prefill and unknown/zero amounts; source eligibility and client/branch/period restrictions; evidence reuse, replacement and changed establishment fingerprints; secure ZIP filters; and Payroll/LegitX/Branch Desk browser flows. Synthetic Telangana workbook panels were rendered for inspection. A legal or government upload certification of every format is not claimed.

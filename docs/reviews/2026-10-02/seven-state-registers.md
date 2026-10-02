# Seven-state register coverage

Reviewed 2 October 2026. This extends the register library with 20 executable layouts and retains the existing Andhra Pradesh, Telangana and Maharashtra formats. It does not claim complete coverage of every Act in these states.

| State | Added in this change | Existing coverage retained |
| --- | --- | --- |
| Andhra Pradesh | Shops X (fines), XI (damage/loss), XII (advances), XXIII (wages) | Existing ten AP layouts |
| Telangana | Factory binding for integrated II + III from PR #721, included in this branch | Separate Shops II + III binding |
| Karnataka | Shops T, combined attendance and wages | Source references |
| Tamil Nadu | Shops U, V, W, X; Factory 12, both parts of 15, 25 | Source references |
| Maharashtra | No new layout in this change | Shops O leave book and Q muster-roll/wages |
| Haryana | Shops C daily hours/leave, D wages, E deductions | Source references |
| West Bengal | Shops I daily hours, J leave, M pay, U overtime, W employees | Source references |

## Identity and applicability

Each form has its own state/Act/rules/form/source identity. Factory layouts require FACTORIES applicability and Factory/Both establishment classification; new Shops layouts require their own reviewed Act decision and Establishment/Both classification. Existing state/authority/freshness checks remain in force. Five new Shops compliance codes are selectable for review but disabled by default in DEFAULT_INDIA; the migration is idempotent and adds no automatic rule. A payroll approval alone is insufficient to prepare a manual statutory record.

All 20 additions are manual preparations from supporting evidence. No absent incident is automatically declared NIL; no attendance, wage amounts or signatures are invented. Monetary, deduction and benefit layouts participate in salary-access restrictions. Pending records are visible to LegitX masters; Branch Desk requires register approval and the applicable access settings.

## Source verification

Public source copies are bundled with hash/size provenance in the register-library manifest. The supplied filled files and their personal data are not committed. The catalogue clearly identifies third-party-hosted compilations rather than describing those hosts as government portals.

- Andhra Pradesh: reproduced Shops Rules 1990, G.O.Ms.No.169 of 28 October 1991, source PDF pages 60–62 and 70.
- Karnataka: reproduced Shops Rules 1963, Rule 24(9-B), LD 104 LET 2004 of 9 May 2006. Form T retains all 38 numbered groups, including 31 attendance entries and suspension particulars.
- Tamil Nadu Shops: final Gazette of 30 March 2022, G.O.Ms.No.23 / SRO A-8/2022. U/V/W/X retain source numbering. W preserves the printed PF/ESI number fields as identifiers and requires separate supporting deduction evidence; these headings are not silently reinterpreted as monetary deductions.
- Tamil Nadu Factory: official DISH Gazette amendment of 24 March 2021. Form 15 exports Part I (leave/benefits) and Part II (wages/deductions) separately. Form 25 has distinct shift and hours/code fields for each day. Factory PF/ESI fields remain monetary deductions.
- Haryana: reproduced Punjab Shops Rules as adapted in Haryana, Rule 5, Forms C–E. Historic commentary in the compilation is not used to determine current thresholds, hours or entitlements. Later amendments and period-specific coverage need review.
- West Bengal: schedules reproduced in the West Bengal Labour Gazette 2011 Volume II. The official Labour Commissioner inspection checklist also lists I/J/M/U/W. J retains leave-category identification and date ranges; M retains payment certification, witness fields and employee receipts.

Links are recorded per form in the catalogue and exported workbook. Later law/Code transition and establishment exemptions still require period-specific review. These forms do not establish substitution for Factory/CLRA obligations under other Acts.

## Export and validation

Every workbook includes legal identity, source and review status, establishment/authentication details and the prescribed data fields. Wide tables use repeating identity columns and printable panels. Employer certification remains pending authentication. PF/ESI text identifiers preserve leading zeros; absent signatures export as empty strings. A third-party preview renderer displayed shared-string indices in empty cells during QA; direct ExcelJS rereads confirmed the XLSX cells are empty, and a regression locks this behavior.

Validation covers source earnings/deduction and leave balances, payment totals, chronological dates, selected-period dates, duplicate daily/serial entries, non-existent calendar days, required daily attendance, prescribed Tamil Nadu hours/codes and factory shifts, and Haryana overtime totals. Future requested West Bengal leave is permitted while application dates cannot postdate issue. No entitlement calculation is inferred from the source templates.

## Verification and remaining scope

Focused register tests, backend build and lint, frontend build/lint, source comparison and synthetic workbook rendering are performed locally. CI also runs disposable PostgreSQL tests for all 20 additions plus the existing AP and TS factory forms: actual XLSX creation, persistence, pending/master/approved-branch visibility, individual and ZIP byte equality, salary restrictions, missing-file replacement with a new generation timestamp and reset approval. Applicability/access decisions in these roundtrips use synthetic contexts; separate service tests exercise their actual gates. No production evidence was fabricated or approved for testing.

Not included: complete Factory/CLRA packs for all seven states, every annual return/application/card, historical ESI Form VII conversion, or consultant-supplied leave/NIL declarations. These require their own current source and data mapping. Deployment remains subject to the repository's required independent review and green CI.


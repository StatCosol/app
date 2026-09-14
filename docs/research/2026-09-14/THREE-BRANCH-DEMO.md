# Three-branch payroll/register demonstration

The isolated demo uses a dedicated PostgreSQL server at 127.0.0.1:55439 as register_test. It never reads the application database environment. Run both scripts from backend with ts-node/register: first scripts/demo-three-branch-payroll.cjs, then scripts/demo-three-branch-registers.cjs. Each payroll execution creates a new statco_demo_<UUID> database and leaves it available for inspection; outputs and its name are recorded under tmp-art/demo-three-branches. Do not run against production or expose this trust-authenticated local test server to a network.

The scripts create one fictional client, TS/AP/MH branches and three approved employees per branch; real repository-backed services resolve branch salary structures, import attendance, calculate payroll, validate leave/OT and process maker/checker approval. Registers use the real builder, exact Act identities and reviewed demo applicability. They are preparation drafts, not signed filings. Daily Maharashtra statuses are separate fictional inputs; monthly attendance is not evidence of device punches.

September 2026 results: TS gross 54,000/net 48,195; AP gross 60,000/net 54,150; MH gross 63,000/net 57,126. Demo PT/LWF is disabled; rates and the minimum-wage field are illustrative, not legal assertions. All nine employee totals reconcile. Outputs are TS II+III, AP IV and V, and MH Q. Workbook inspection confirmed every branch's three names and absence of names from other branches. Repeated identical preparation returns the same record.

The first real import exposed PostgreSQL parameter inference conflicts in syncEmployeePaidLeave: year is inserted into an integer column and compared to numeric EXTRACT results; leave_type is reused across varchar/text columns. Explicit casts resolve both conflicts. The demo asserts both leave balances exist after each import; this failed before the fix and passes afterward for all nine employees. The final run produced no leave-sync errors. All 347 payroll/register tests, backend build and targeted lint passed.

Generated data, database dumps and workbooks remain local artifacts and are not committed. This demonstrates current implemented forms, not complete statutory coverage or production deployment.

## Telangana shared register correction

The supplied Telangana Form III is a branch-level register, not an employee-specific record. The exporter now creates one Form III table with all 26 columns and employee rows sorted by serial number; Form II remains a single establishment sheet. Sorting does not mutate source rows. The layout metadata changes the generation schema fingerprint, so historical employee-sheet files cannot be returned as the new format by deduplication.

The three-worker demo was regenerated and visually checked using native Excel PDF export: one worksheet with serials 1, 2, 3; two readable A3 landscape print panels repeat employee identity and headings. The branch heading and period appear on both pages; signature/certification sections are retained. All 106 register-library tests, backend build and targeted lint passed. Other form layouts were not changed by this correction.

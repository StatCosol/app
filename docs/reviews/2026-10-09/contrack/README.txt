ConTrack sample data — 9 October 2026

These fictional records are used by the automated regression tests. They were not inserted into production. CSVs are reference tables, not a promise of compatibility with every application import screen.

Contractor: SAMPLE-CT-001 / Sample Contractor Services
Assignment: SAMPLE-ASG-001 / sample packing work
Workers: SAMPLE-W001 and SAMPLE-W002
Periods: September and October 2026
September: Sample Worker 1, 8 normal hours, 0 overtime hours; 20 wage days, gross/net 10,000.
October: Sample Worker 2, 8 normal hours, 1 overtime hour; 21 wage days, gross/net 10,500.
Amounts are deliberately distinct for stale-data detection; not a payroll statutory calculation example.

Scenarios checked:
1. List request returns HTTP 503: show error and Retry; do not show a successful empty list.
2. Retry succeeds: display the supplied workers/assignments and clear the error.
3. September attendance/wages delayed; October selected and loaded first: late September results must not replace October.
4. Assignment switched during a request: previous assignment results must be ignored.
5. Server/network error loading profile: show temporary load failure, not missing linkage.
6. Explicit 404 with backend not-linked message: show CRM linking guidance.
7. Worker creation succeeds: one save, refresh the list, close the form.
8. Worker creation fails: keep form open; no success message.
9. Old-period attendance/wage form: reject save after the selected period changes.
10. Component destroyed during request: cancel pending list subscriptions.

sample-data.json is the complete linked fixture; CSV files provide readable individual tables. No passwords, emails, real identity numbers, or production records are included.

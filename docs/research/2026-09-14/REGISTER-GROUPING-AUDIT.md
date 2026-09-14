# Register record grouping audit — 14 September 2026

Scope: all 72 implemented layouts in the current catalogue. 24 use a shared register table; 48 retain individual records. This is an export/data-preservation audit, not a certification that all state/Act registers are implemented or legally applicable. 31 catalogue identities remain reference-only.

Shared tables retain every source field in order and sort by serial number where prescribed. Accident tables without a serial column retain entry order. Individual employee cards, wage slips, worker leave pages and daily IN/OUT grids remain separate. Annual worker records are not collapsed into a payroll summary.

Source checks: bundled government Gazette forms, including AP Wages pages 15/21/30, Telangana Integrated page 13, Maharashtra Shops page 90, Central OSH pages 304–305 (leave note explicitly requires a separate page per worker), Rajasthan Wages page 25, and accident forms UP OSH 492, Ladakh OSH 206, Arunachal OSH 214, Gujarat OSH 66, Rajasthan OSH 198, Bihar OSH 388 and AP OSH 453. Catalogue source URLs and identities are preserved in every workbook.

Validation: 179 register tests pass, including three-record preservation across all 72 implemented layouts and explicit individual/shared exceptions. All 72 sample workbooks regenerated; backend build and targeted lint passed. Corrected local demo exports reuse the prior approved fictional payroll inputs; this workbook refresh does not update production or the saved demo database export history.

| Legal identity | Grouping |
| --- | --- |
| ts--shops-1988--ts-integrated-2019--ii---iii--tsi | Shared table |
| mh--shops-2017--mh-shops-2018--o--mh | Individual record |
| up--social-security-2020--up-ss-2026--xxxvi--upss | Individual record |
| ap--social-security-2020--ap-ss-2026--xx--apss | Individual record |
| br--social-security-2020--bihar-ss-2026--xxi--brss | Individual record |
| up--osh-2020--uttar-pradesh-osh-2026--6--uposh | Reference-only |
| up--osh-2020--uttar-pradesh-osh-2026--14--uposh | Reference-only |
| up--osh-2020--uttar-pradesh-osh-2026--15--uposh | Reference-only |
| up--osh-2020--uttar-pradesh-osh-2026--16--uposh | Shared table |
| up--osh-2020--uttar-pradesh-osh-2026--29--uposh | Reference-only |
| la--osh-2020--ladakh-osh-2026--i--laosh | Individual record |
| la--osh-2020--ladakh-osh-2026--iv--laosh | Shared table |
| la--osh-2020--ladakh-osh-2026--16--laosh | Reference-only |
| la--osh-2020--ladakh-osh-2026--17--laosh | Reference-only |
| la--osh-2020--ladakh-osh-2026--18--laosh | Shared table |
| la--osh-2020--ladakh-osh-2026--19--laosh | Individual record |
| la--osh-2020--ladakh-osh-2026--29--laosh | Reference-only |
| ar--osh-2020--arunachal-pradesh-osh-2022--viii--arosh | Shared table |
| ar--osh-2020--arunachal-pradesh-osh-2022--x--arosh | Shared table |
| ar--osh-2020--arunachal-pradesh-osh-2022--xi--arosh | Individual record |
| gj--osh-2020--gujarat-osh-2025--13--gjosh | Shared table |
| gj--osh-2020--gujarat-osh-2025--22--gjosh | Shared table |
| rj--osh-2020--rajasthan-osh-2026--16--rjosh | Individual record |
| rj--osh-2020--rajasthan-osh-2026--17--rjosh | Individual record |
| rj--osh-2020--rajasthan-osh-2026--18--rjosh | Individual record |
| rj--osh-2020--rajasthan-osh-2026--19--rjosh | Individual record |
| rj--osh-2020--rajasthan-osh-2026--20--rjosh | Individual record |
| rj--osh-2020--rajasthan-osh-2026--24--rjosh | Shared table |
| br--osh-2020--bihar-osh-2026--viii--brosh | Individual record |
| br--osh-2020--bihar-osh-2026--viii-a--brosh | Individual record |
| br--osh-2020--bihar-osh-2026--viii-b--brosh | Individual record |
| br--osh-2020--bihar-osh-2026--viii-c--brosh | Individual record |
| br--osh-2020--bihar-osh-2026--x--brosh | Shared table |
| br--osh-2020--bihar-osh-2026--xi--brosh | Individual record |
| ap--osh-2020--ap-osh-2026--viii--aposh | Individual record |
| ap--osh-2020--ap-osh-2026--viii-a--aposh | Individual record |
| ap--osh-2020--ap-osh-2026--ix--aposh | Individual record |
| ap--osh-2020--ap-osh-2026--x--aposh | Individual record |
| ap--osh-2020--ap-osh-2026--xi--aposh | Shared table |
| ar--wages-2019--arunachal-pradesh-wages-2022--i--arw | Shared table |
| ar--wages-2019--arunachal-pradesh-wages-2022--iv--arw | Individual record |
| ar--wages-2019--arunachal-pradesh-wages-2022--v--arw | Individual record |
| sk--wages-2019--sikkim-wages-2022--i--skw | Shared table |
| sk--wages-2019--sikkim-wages-2022--iv--skw | Individual record |
| sk--wages-2019--sikkim-wages-2022--v--skw | Individual record |
| br--wages-2019--bihar-wages-2026--i--brw | Individual record |
| br--wages-2019--bihar-wages-2026--iv--brw | Shared table |
| br--wages-2019--bihar-wages-2026--v--brw | Individual record |
| br--wages-2019--bihar-wages-2026--ix--brw | Individual record |
| la--wages-2019--ladakh-wages-2026--i--ldw | Individual record |
| la--wages-2019--ladakh-wages-2026--iv--ldw | Shared table |
| la--wages-2019--ladakh-wages-2026--v--ldw | Individual record |
| la--wages-2019--ladakh-wages-2026--ix--ldw | Individual record |
| up--wages-2019--uttar-pradesh-wages-2026--i--upw | Shared table |
| up--wages-2019--uttar-pradesh-wages-2026--ii--upw | Individual record |
| up--wages-2019--uttar-pradesh-wages-2026--ix--upw | Individual record |
| gj--wages-2019--gujarat-wages-2021--i--gjw | Shared table |
| gj--wages-2019--gujarat-wages-2021--iv--gjw | Individual record |
| gj--wages-2019--gujarat-wages-2021--v--gjw | Individual record |
| rj--wages-2019--rajasthan-wages-2026--i--rjw | Shared table |
| rj--wages-2019--rajasthan-wages-2026--iv--rjw | Individual record |
| rj--wages-2019--rajasthan-wages-2026--v--rjw | Shared table |
| rj--wages-2019--rajasthan-wages-2026--vii--rjw | Individual record |
| central--wages-2019--central-wages-2026--i--cw | Individual record |
| central--wages-2019--central-wages-2026--iv--cw | Shared table |
| central--wages-2019--central-wages-2026--ix--cw | Individual record |
| central--wages-2019--central-wages-2026--v--cw | Individual record |
| ap--wages-2019--ap-wages-2026--i--apw | Individual record |
| ap--wages-2019--ap-wages-2026--iv--apw | Shared table |
| ap--wages-2019--ap-wages-2026--ix--apw | Individual record |
| ap--wages-2019--ap-wages-2026--v--apw | Individual record |
| central--osh-2020--central-osh-2026--v--osh | Reference-only |
| central--osh-2020--central-osh-2026--xi--osh | Reference-only |
| central--osh-2020--central-osh-2026--xii--osh | Reference-only |
| central--osh-2020--central-osh-2026--xiii--osh | Individual record |
| central--osh-2020--central-osh-2026--xiv--osh | Individual record |
| central--osh-2020--central-osh-2026--xv--osh | Shared table |
| central--osh-2020--central-osh-2026--xvi--osh | Individual record |
| central--osh-2020--central-osh-2026--xvii--osh | Reference-only |
| central--osh-2020--central-osh-2026--xviii--osh | Reference-only |
| central--osh-2020--central-osh-2026--xix--osh | Shared table |
| central--osh-2020--central-osh-2026--xx--osh | Individual record |
| central--osh-2020--central-osh-2026--xxiii--osh | Reference-only |
| central--social-security-2020--central-ss-2026--xxii--ss | Individual record |
| central--ir-2020--central-ir-2026--iii--ir | Reference-only |
| ts--multi-act--ts-integrated-2019--ii---iii--tsi | Reference-only |
| ts--multi-act--ts-integrated-2019--i--tsi | Reference-only |
| mh--shops-2017--mh-shops-2018--q--mh | Shared table |
| tn--factories-1948--tn-factories-1950-amend-2021--12--tn | Reference-only |
| tn--factories-1948--tn-factories-1950-amend-2021--15--tn | Reference-only |
| tn--factories-1948--tn-factories-1950-amend-2021--25--tn | Reference-only |
| central--clra-1970--central-clra-1971--xii--clra | Reference-only |
| central--clra-1970--central-clra-1971--xiii--clra | Reference-only |
| central--clra-1970--central-clra-1971--xiv--clra | Reference-only |
| central--clra-1970--central-clra-1971--xv--clra | Reference-only |
| central--clra-1970--central-clra-1971--xvi--clra | Reference-only |
| central--clra-1970--central-clra-1971--xvii--clra | Reference-only |
| central--clra-1970--central-clra-1971--xviii--clra | Reference-only |
| central--clra-1970--central-clra-1971--xix--clra | Reference-only |
| central--clra-1970--central-clra-1971--xx--clra | Reference-only |
| central--clra-1970--central-clra-1971--xxi--clra | Reference-only |
| central--clra-1970--central-clra-1971--xxii--clra | Reference-only |
| central--clra-1970--central-clra-1971--xxiii--clra | Reference-only |

## PR 659 review corrections

- Added `20260925_reviewed_register_applicability.sql` to the predeployment runner. It upserts DEFAULT_INDIA links for WAGES_2019, OSH_2020, TS_SHOPS_1988, SHOPS_2017 and SOCIAL_SECURITY_2020 with `included_by_default=false`. Earlier deployed migration files remain unchanged because the runner verifies their recorded checksums.
- The correction immediately disables stored `AUTO=true` decisions for these review-only identities, with before/after audit entries. Explicit OVERRIDE and SPECIAL_SELECTED decisions remain intact. Reapplication produces no duplicate repair audits.
- The payroll Act filter now recognizes exact legal identities for Social Security, Telangana/Maharashtra Shops, Wages, OSH, Factories and CLRA while retaining legacy register-type filtering. Exact legal identity takes precedence over an ambiguous legacy label.
- Resolved main-branch conflicts while preserving the shared-table changes and tests.
- Validation: 179 register tests; nine frontend Act-filter tests; isolated PostgreSQL upgrade, missing-link, repeat-application, override-preservation and all-five-identity recomputation/generation checks; frontend/backend production builds and targeted backend lint passed. The isolated verification database was dropped and its server stopped. Production was not changed.

# Client acceptance session — ready to run

Status: prepared; not yet performed with client users. Local automated checks are recorded separately in CRITICAL_WORKFLOW_VALIDATION.md.

Use staging with a representative company and branch configuration. For face attendance, use a spare device running the client's current APK connected to staging. Keep delivered production devices and production records untouched.

## Participants and records

Invite a branch attendance operator, payroll processor, separate CCO approver, contractor representative, and client administrator. Allow approximately 45 minutes per role. Record the application version, device/browser, network conditions, service package, and branch permissions.

Prepare at least: a regular employee, a joiner partway through the month, an employee on leave, an employee with overtime, an employee with a correction, and a contractor employee. Include two branches and a separate test company. Have the payroll reviewer independently approve the expected attendance and amount examples before testing; current statutory rules and client policies need their own verification.

## Tasks and expected outcomes

| ID | Participant task | Expected result | Result / evidence |
| --- | --- | --- | --- |
| U01 | Find attendance, payroll, and reports without instructions | Correct available module opens; no inaccessible module is exposed by search | Pending |
| U02 | Complete navigation with only keyboard; open and close a dialog | Focus is visible, remains inside the dialog, and returns to its opener | Pending |
| U03 | Search/filter a list, change columns, and export | Visible rows/columns and export scope are understandable; filters preserve context | Pending |
| U04 | Complete a common task on a 390px phone | Controls remain readable and usable; helpdesk list uses the full width | Pending |
| A01 | Enroll and punch using the current released APK | Correct employee and branch are recorded; normal success time is measured | Pending |
| A02 | Repeat the same punch, retry a timed-out request, and reconnect after offline punches | No duplicate payable attendance; queued events synchronize once; rejected events remain distinguishable | Pending |
| A03 | Try a nonmatching face and a replay/photo under realistic lighting | No incorrect employee acceptance; record false rejects and review outcomes | Pending |
| A04 | Review a punch close to midnight IST and an overnight-shift example | Day assignment matches the configured business/shift policy; overnight behavior needs explicit owner confirmation | Pending |
| A05 | Correct attendance and approve/reject as different roles | Only authorized reviewers can change it; reason and audit history remain traceable | Pending |
| P01 | Import the independently checked payroll fixture and process | Per-employee and run totals match the signed expected results, including rounding and join/leave cases | Pending |
| P02 | Process an empty run; simulate attendance-service failure | Clear error; no new employee calculations are written and the empty run is not reported as successfully processed | Pending |
| P03 | Submit with unresolved leave or overtime differences | Submission is blocked and affected employees are identified | Pending |
| P04 | Submit, attempt self-approval, then use the separate approver | Self-approval is denied; permitted independent approval succeeds | Pending |
| P05 | Approve and reject concurrently; revert while another action changes the run | Only a valid state transition succeeds; stale reversion cannot overwrite a newer state or unrelated edits | Pending |
| P06 | Compare a wage CSV containing a one-paisa difference and a blank amount | Exact difference is visible; blank remains unknown; payroll is unchanged | Pending |
| P07 | Review existing approved runs and approved-run additions/reprocessing | Owner confirms which changes require renewed approval; preserve a complete approval history | Pending |
| C01 | Replace an approved contractor document with a pending version | The latest version requires review; the older approval does not clear it | Pending |
| C02 | Omit approval status, requirement configuration, or filing evidence | Missing information does not show as clear; the required action is understandable | Pending |
| C03 | Switch reporting month and branch, including a nonmonthly return due this month | Only intended records are shown; expiry and reporting-period rules are correct | Pending |
| S01 | Attempt another company's record URL and a disabled-module URL | Access is denied server-side; no record or sensitive download is returned | Pending |
| S02 | Use a restricted branch user and a payroll operator assigned to one company | Both records and payroll visibility honor the configured scope | Pending |

## Capture real evidence

For each task record: participant role, task ID, start/end time, completed unaided / completed with help / failed, errors, what the person expected, and a screenshot or record ID from staging. Do not mark a task passed solely because the screen looks good.

For attendance accuracy, record lighting, camera, distance, consented test subject, expected identity, returned identity, and review outcome. Separate false acceptance from false rejection. Synthetic database tests do not measure face-model accuracy or liveness quality.

## Proposed acceptance gate

These are proposed product targets, not measured results or industry guarantees:

- No cross-company access, wrong-person attendance, duplicate payable punch, unexplained amount discrepancy, or unauthorized approval.
- At least 90% of agreed everyday tasks completed without assistance after the normal onboarding explanation.
- No unresolved blocker in the attendance → review → payroll → independent approval → evidence review flow.
- Approve response-time targets on production-like staging, then measure median and 95th-percentile times under agreed concurrent traffic. The local service timings are not a production SLA.
- Finance/compliance owners approve the expected rule examples and known exceptions. Product owner signs the tested version and records remaining nonblocking issues.

## Findings log

| Task | Role | Version | Elapsed time | Unaided / helped / failed | Expected / actual | Severity | Owner | Retest result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |

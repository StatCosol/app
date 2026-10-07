# Pre-Pulse restoration and audit corrections — 7 October 2026

This release uses production commit a65530ee as its base. It restores the pre-Pulse portal experience while retaining the subsequent payroll, loading, work-search, and dependency fixes. It does not publish the older mixed desktop checkout.

| Audit finding | Correction |
| --- | --- |
| F01: Incomplete Assist recall | Both dashboard mounts remain absent. A controller-wide recall guard rejects every Assist API, including document search and viewing. |
| F02: BranchDesk entering LegitX | A branch account opening a saved client URL is redirected to BranchDesk; master client access remains available. |
| F03: Predictable generated passwords | User creation, branch creation and administrator resets use 144 bits of cryptographic randomness. Existing credential-delivery and password-change flows remain in place. |
| F04: Reset sessions and actor attribution | Password updates atomically increment the session version and revoke refresh tokens through a database trigger, covering all password-write paths. Access, refresh and reset tokens reject stale versions. Admin resets record the acting administrator. |
| F05: False evidence-upload success | Outcomes are tracked per file. Failed files remain selected and can be retried against the same closure case without reposting the closure response. |
| F06: Attendance errors showing Present | Failed attendance loads show an error and disable saving. Old date responses are ignored. Failed monthly exports produce no file. |
| F07: Hidden data-load errors | ESS, CCO, Accounts, Sales and the CRM audit workspace show unavailable/retry states instead of successful empty results. |
| F08: Truncated lists | Sales has server pagination. CRM audit overview and attendance/export collect every server page and fail if a page fails. Stable tie ordering was added for audits and employees. |
| F09: Truncated auditor client selector | Client options come from the assigned-client endpoint instead of the first 25 audit records. |
| F10: Duplicate lead numbers | A persistent yearly database counter allocates numbers transactionally, including concurrent creation and deletion gaps. |
| F11: Partial sales activities | Activity creation and lead updates commit or roll back together while the lead is locked. |
| F12: Older vulnerable dependencies | Current production lockfiles are retained. Both production dependency audits report zero known advisories at validation time. |
| F13: Mixed checkout/release drift | Changes are prepared in an isolated branch based on current production, with explicit CI and security gates. |

## Validation

- Frontend production build and lint passed; 718 browser tests passed before the final retry regression, and the updated eight-test release regression suite passed afterward.
- 125 frontend unit tests passed.
- Backend full run passed 2,733 tests with one intentionally skipped; one typed fixture needed the new session-version field. The corrected authentication suite passed on rerun. Final CI reruns the full suite.
- All 35 existing PostgreSQL/integration scripts passed, covering payroll, document reconciliation, compliance, access scope, audits, helpdesk and billing.
- New disposable PostgreSQL regression passed: password revocation/rollback, acting admin, migration replay, 20 simultaneous lead creates, deletion-safe numbering and atomic activity failure/retry.
- Module registration/delegate validation passed for 64 modules; all 17 release-gate regression tests passed.

## Release conditions

Apply the additive password-session and lead-counter migration before deploying the new backend. The existing deployment workflow enforces this ordering and requires successful CI/security runs for the exact main commit.

Production login with the reporting branch user's account has not been performed; the portal boundary is verified with synthetic branch/master identities. Existing business data is not rolled back or deleted. Account-specific branch mapping remains subject to the account's stored configuration.

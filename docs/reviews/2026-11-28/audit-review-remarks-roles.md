# Audit review remarks and portal roles — 28 November 2026

CRM approval and publication now store a review event in audit_logs in the same transaction as the decision and, for publication, its immutable PDF. The event retains trimmed optional remarks, reviewer identity, timestamp, report identity and revision. Invalid or overlong remarks are rejected before writes. Failed event storage rolls back the decision and publication snapshot.

CRM's approval/publication dialog accepts remarks. The report status panel reloads the saved review history, including decision, reviewer and revision. Failed submissions retain the remarks for retry on the same audit/action. Changing selection or leaving the page while the dialog is open cannot submit the decision to another audit.

Admin is removed from the CRM and Client audit controller role declarations, as directed by the user. CRM assignment restrictions and Client/Branch scope checks remain. These portal routes do not grant Admin new reading or review authority. Separate pre-existing Admin endpoints are outside this change.

Historical remarks were never stored and cannot be recovered. Existing issued PDF bytes and historical business records are unchanged. No migration, production data repair, emails or financial updates are part of this release.

## Verification checklist

- [x] Actual role guard admits CRM/Client on their routes and rejects Admin and other portal roles.
- [x] Real PostgreSQL approval/publication remarks persist and reload with reviewer, time and revision.
- [x] Decision-log failure rolls back approval/publication and its PDF archive.
- [x] Duplicate decisions and invalid remarks are refused.
- [x] New revisions start separate history while retaining the prior revision's events.
- [x] Existing 12 correction/report-governance database checks pass.
- [x] Responsive review history checked at 390, 768 and 1440 pixels.
- [ ] Final full-suite/release results and deployment verification.

All tests use disposable local fixtures. No actual records or balances were changed.

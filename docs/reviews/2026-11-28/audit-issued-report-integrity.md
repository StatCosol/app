# AuditXpert issued-report integrity — 28 November 2026

The first release addresses the three report-integrity findings: closure overwriting the submitted score, published downloads changing with live findings, and observation writes after finalization. It also requires CRM approval for the legacy COMPLETED transition.

## Behavior

- Standard submission uses the existing 50/50 weighted-observation and audit-scoped-document/fieldwork formula. Correction processing and score preview do not write the assessment. Resubmission retains the first score for the revision; explicit re-audit starts a new assessment. Statutory-entry scoring remains unchanged and its submitted assessment is preserved too.
- Publication stores the complete rendered PDF, SHA-256 checksum and assessment score in the same transaction as PUBLISHED. Any rendering/storage failure rolls back publication. Auditor, CRM, Client and Branch published-download paths use the stored bytes. Re-audit keeps the old publication and creates a new draft/revision.
- Observation writes share the audit lock with finalization and publication; database guards cover alternative writers. Submitted/approved/published reports, held drafts and terminal audits are read-only. A deliberately returned/reopened draft remains editable. Draft deletions record the actor and prior content in audit_logs.
- Migration is additive and replay-safe. It does not recalculate historical scores, backfill issued PDFs, alter client balances, or send messages.

## Historical reports and rollout decision

Historical published reports do not have archived PDFs. Their original bytes cannot be recovered from today's mutable findings. Such downloads now give an explicit archive-unavailable error rather than silently generating a different issued document. An authorized new revision is required. Review this intentional access change before deployment; do not claim historical reports or historical incorrect scores were repaired.

## Isolated verification

- Real submission formula: critical + two high open observations and 6 approved / 13 applicable documents produces 62%; corrections, resubmission, closure, preview and NC output refresh keep 62%.
- Loopback PostgreSQL: migration twice, real PDF rendering, frozen bytes and checksum, old/new revisions, immutable publication storage, failed archive rollback, concurrent observation/finalization locking, and CRM/Admin publication.
- Existing PostgreSQL correction and HTTP governance suite: 12 checks passed.
- Auditor browser action checks: 12 tests passed.
- Production backend/frontend builds pass; frontend retains the existing Sass deprecation and initial bundle-budget warning.
- Full backend tests and final release checks are recorded separately with the PR head.
- No production database queries/writes or client emails were used in these tests.

## Follow-up checklist (not included in this release)

- Cancelled-audit NC queues, correction access and escalation termination.
- Branch-level NC visibility.
- Auditor evidence-status authority and the no-op Remind action.
- Persisted CRM approval/publication remarks and Admin scope parity.
- Evidence-based recovery review for historical scores and previously issued PDFs; never invent originals.

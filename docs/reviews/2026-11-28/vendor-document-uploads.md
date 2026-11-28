# Vendor document upload review — 28 November 2026

## Live read-only checks

- Signed in to the authorized Arax ConTrack account in a separate InPrivate window; signed out after checking.
- Work → Tasks → Monthly Compliance Documents shows branch, month and year. November 2026 / sresta head office loaded six required document types.
- Opened the Wage Register form: the branch and November title were correct; Submit remained disabled without a file. Cancelled without selecting a file or submitting.
- Tasks → Document corrections exposes CRM review notes and correction/resubmission controls. The selected November branch had no matching documents; no live correction was performed.
- Work → Audit Documents loaded four actual assignments, including the legacy AUD-2026-006 with missing branch and contractor.
- Switched between September and August Arax assignments. Detail branch and period changed correctly. The August audit displayed its existing rejected ESI document; nothing was edited.
- No uploads, submissions, status changes, deletions, notifications or balances were changed. FaceDesk was not opened or modified.

## Issues and correction

- Audit cards omitted branch/client context and the upload panel omitted contractor identity. Add these labels and a fixed upload destination.
- The audit page title did not distinguish audit evidence from monthly statutory documents. Explain both upload locations.
- A legacy contractor audit could infer a branch from the vendor's sole assignment. Hide its new-upload form, explain the required CRM correction, and enforce complete branch/contractor scope on the server.
- Multi-branch vendors could change the destination of a branch-assigned audit in the upload form. Keep the assigned branch fixed in the form and upload request.
- Legacy monthly period 2026-9 failed the upload month format check. Normalize valid monthly periods to 2026-09 before display/submission.

## Validation

- [x] 50 focused backend tests: assignment scope, actual/test separation, valid uploads, monthly uploads, locks and evidence resubmission.
- [x] 29 frontend tests, including rendered destination/blocked-form checks at 390, 768 and 1440 pixels and contractor workflow regressions.
- [x] Backend and production frontend builds. Existing Sass deprecation and initial bundle budget warnings remain.
- [ ] Release checks and reviewer approval.
- [ ] Deployment and live retest of the new labels and safeguards.

Responsive tests use isolated fixtures. No new synthetic data was written to production. Existing unscoped audit records are preserved for CRM correction.

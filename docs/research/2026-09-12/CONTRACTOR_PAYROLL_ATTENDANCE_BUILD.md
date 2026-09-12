# Contractor payroll workflow build

## Implemented: branch attendance approval

Contractors submit Excel attendance or a server-generated device attendance summary. Neither path calculates payroll on submission. Only CLIENT users with userType BRANCH or BRANCH_DESK users assigned to the same client and branch may approve or return the batch. Registered employee codes are required; names cannot replace identity matching.

The common scope is client + vendor + deployment branch + payroll month. One current attendance batch exists for this scope, across both sources. New submissions supersede old batches, preserve earlier rows/review remarks, and require fresh approval. Payroll under review or published must first be returned/reopened before attendance replacement.

Approval and payroll creation share the payroll advisory lock and database transaction. Failure rolls the approval back; concurrent approvals generate one payroll version. Contractor payroll submission checks that the current attendance batch is approved, including for older draft payrolls. Existing drafts without approval must be resubmitted as attendance and approved by the branch.

The Generated Payroll page in contractor and branch/client portals now includes an attendance review panel. Contractor Monthly Documents shows that Excel attendance was submitted for branch approval. Combined wage/muster workbooks supply attendance columns only: uploaded monetary values never control calculated wages. A submitted document ID is validated against its contractor, client, branch and month before it is linked.

Device attendance uses accepted contractor_biometric_punches, including the existing FaceDesk/biometric/eSSL attribution paths. It excludes pending/rejected face decisions, counts distinct IST dates, and filters both punch deployment and employee deployment to the selected branch. A parameter collision between the contractor and timezone filters was corrected. This is a present-day summary, not a verified shift-duration or overtime engine; reviewers must inspect incomplete shifts and leave before approval.

## Verification

- 54 backend tests: approval authority, stale/replaced batches, multi-branch scope, enrollment prerequisite, payroll workflow and device scoping.
- 5 frontend tests: role visibility, scope-change cancellation, decision remarks and error handling.
- Backend TypeScript and frontend Angular template compilation passed.
- Backend lint passed for changed services/controllers and tests.
- Real disposable PostgreSQL test: new migration applied twice; calculation failure leaves attendance pending; concurrent approval creates one payroll version; existing payroll approval/verification/reopen checks still pass.
- No production data changed. Migration must run before backend rollout; included in the existing pre-deployment migration runner.

## Remaining work from the agreed full workflow

This change does not complete the broader quotation/payroll/document-audit build:

1. Expand CRM quotations from skill-level daily/monthly wages into designation-specific, effective-dated components and separate employee pay versus vendor billing calculations. The supplied Hyderabad quotation and monthly wage breakup are the reference, not deployed financial settings.
2. Represent bonus/leave payouts, billing provisions, relieving charges and management fees without double counting. Define attendance divisor, partial periods, mid-month rate revisions and explicit rounding. Do not infer statutory deduction bases from commercial quotation figures.
3. Preserve quotation version, UAN/ESI master identifiers and component calculations in immutable payroll snapshots. Expose generated reports to the respective client, branch and assigned auditor at the agreed workflow stage; current CRM-approved publication rules remain in place.
4. Reconcile vendor wage/attendance Excel against generated payroll with employee/UAN/ESI matching, expected versus submitted values, missing/duplicate workers and document-linked NC remarks.
5. Extract PDF ECR/ESI/wage register data, retain page references, and distinguish confirmed mismatches from unreadable/ambiguous extraction. Validate challan coverage before comparing totals. Auditor owns final compliance decisions.
6. Retain document revisions, reconciliation history and auditor comments; rerun checks after corrected submissions or payroll revisions.
7. Test the complete configured quotation-to-attendance-to-payroll-to-audit flow with representative Excel and PDF files. No real PDF samples were supplied in this task.

Client/vendor/effective-date identification and actual sample files are still required to configure and validate the supplied quotation in a live client profile.

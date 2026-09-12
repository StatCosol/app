# Contractor payroll completion

## Delivered behavior

- CRM uploads versioned component quotations by client, contractor, optional branch and designation. Revisions use a new effective date; existing versions cannot be overwritten. A downloadable workbook distinguishes employee earnings, deductions, employer costs and billing fees, with fixed, percentage and hourly calculations and explicit rounding/proration.
- Contractor uploads enrolled-worker attendance or submits dated device attendance. Assigned branch users approve, return or correct payable days/overtime with remarks. Original submissions and approved snapshots are retained separately. The queue supports additional pages beyond 200 batches.
- A month containing a quotation change requires dated attendance. Each payable date uses its applicable version; monthly contribution ceilings are shared across segments, and unprorated fixed monthly charges apply once. Unconfigured overtime or gaps in revised component rates block calculation with an explanation.
- Company, assigned branch and assigned auditor users can see generated payroll before final CRM approval. CRM publication and auditor verification remain separate controlled actions. Auditor payroll access also checks assigned audit client, branch and contractor scope.
- Payroll downloads contain gross wages (A), total earnings (B), deductions, net pay, UAN/ESI identifiers, quotation references, contribution bases and commercial totals. Calculation snapshots retain rate components and quotation segments.
- Uploaded XLSX wage/attendance data and supported table PDFs are compared with current generated payroll. Definite differences produce NC findings with expected/uploaded values. Missing/unreadable data and ambiguous identifiers require review. Numeric Excel identifiers are flagged for verification. Daily attendance files are aggregated before comparison.
- Upload/reupload and attendance approval trigger comparison. Auditor can run it again in the document workspace; file hash and payroll version retain separate check history. Automatic findings do not replace the auditor's final decision or overwrite existing draft remarks.

## Sample arithmetic

The supplied guard figures produce gross A 18,000, bonus 1,333, leave 770, total B 20,103, deductions 2,070 and net 18,033. The originally supplied 20,102/18,032 differ by one rupee. The supervisor figures produce total B 24,778 and net 22,678. The workbook is a configurable example, not validation of statutory contribution bases or a complete commercial bill; CRM must enter the agreed components and applicable bases.

## Verification

- Local backend suite: 1,294 passed, one existing skipped test. Isolated branch suite run separately.
- Frontend unit suite: 64 passed; isolated Angular browser suite: 277 passed.
- Backend compilation, frontend production build, Angular template compilation and changed backend lint checks passed; frontend lint passed.
- Disposable PostgreSQL: migrations applied twice; quotation version concurrency; actual midmonth rate calculation and shared PF ceiling; scope denial; draft visibility; rollback on calculation failure; immutable history; simultaneous approval; 205-row branch queue.
- Actual synthetic Excel and grid PDF files: match, one-rupee NC, saved comparison history and invalid-PDF manual-review fallback. Synthetic files removed afterwards. No production employee records were used.

## Deployment and operating requirements

Apply 20260916_contractor_rate_cards.sql and 20260917_payroll_document_checks.sql through the predeployment migration runner before the new backend receives traffic. The runner registration is included. The PDF parser package and lockfile are included.

Actual client/vendor assignment, revised quotation dates and approved statutory bases must be supplied/configured before live payroll. No sample quotation was assigned to a real client. Scanned/unrecognized PDFs, consolidated challans and payment/bank records require manual checks of document period, establishment and coverage; OCR and automatic challan certification are not claimed. Device summaries count accepted attendance dates; branch review must resolve incomplete shifts/leave, and a corrected dated file is required when changing attendance across rate revisions.

PR651 client-specific payroll configuration now has all checks passing. The previous merged attendance release (PR652) completed backend and frontend deployment successfully. This completion PR still needs its own review, merge and deployment.

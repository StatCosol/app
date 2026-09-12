# Payroll document completion — local OCR

Auditors can use Compare with payroll to extract scanned English PDF tables locally. The bundled OCR runtime and language model run without network calls. Extraction is isolated in a child process with a 45-second timeout, one concurrent OCR process per API instance, a 10 MB input limit and a five-page limit. No temporary document copies or plaintext worker logs are created. The child receives the exact bytes used for the saved file hash.

Extracted identifiers and amounts are compared with the immutable payroll snapshot. Candidate differences and page text appear in the auditor workspace. OCR results always remain NEEDS_REVIEW, including apparent matches; the auditor makes the final compliance decision. Unsupported/unclear columns are not guessed. Consolidated challans and bank/payment evidence still require establishment, period and coverage verification by the auditor.

Automatic uploads retain fast table-based comparison; OCR runs only from the scoped auditor action. Mixed readable/scanned PDFs cannot be marked matched when some pages were not compared. Busy/time-limited attempts are not cached, so the auditor can retry. If payroll changes during extraction, the result requires a fresh comparison instead of saving an outdated result.

Migration 20260918_payroll_document_check_profiles.sql preserves existing checks and separates table/OCR profiles in the uniqueness constraint. It is registered in the predeployment runner before application traffic switches.

Validation: 1,323 backend tests passed, one existing skipped. 71 focused payroll/comparison tests passed. Backend compilation, changed backend lint and Angular template compilation passed. Disposable PostgreSQL verified repeated migrations, separate table/OCR history, payroll approval, access scope, concurrency and immutable versions. Actual synthetic Excel, grid PDF and raster-only PDF checks passed. A scanned PF deduction of 1,900 was compared against 1,800, with all OCR findings remaining NEEDS_REVIEW. OCR worker networking is disabled during both testing and operation.

Live setup: user specified ITC LIMITED, peregrine guarding pvt ltd, Telangana branches. Both live client and contractor identities were verified through a read-only lookup. Effective date remains required; no live quotation rates or employee payroll were changed.

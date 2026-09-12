# ESS session release and payroll closeout

ESS 1.0.3 (version code 4, com.statco.ess) source is now reconciled with main. Native pull-to-refresh is disabled so nested page scrolling is not intercepted. Employee session fields use Android Keystore encryption in no-backup storage, bound to the exact HTTPS main-frame origin. Token rotation updates saved state and logout clears it; passwords are excluded. Temporary API/network failures preserve a valid session for retry, while authentication rejection logs out. The compatibility bridge supports the existing website; shared web hooks provide explicit save/clear signals.

Validation: 50 authentication/session browser tests passed, native compatibility-script regressions passed, Angular compilation and changed TypeScript lint passed. Android assembleDebug passed using the equivalent reconciled source. The native script regression is now in CI. Physical device gesture, encrypted storage and cold-start acceptance remain required; no device was attached during this check.

Play Console showed the approved 1.0.3 closed Alpha release ready to publish on 2026-09-13. Final publication awaits specific user confirmation after automatic approval review blocked that irreversible step. This is not a production release or evidence of completed tester participation.

The merged payroll workflow passed disposable PostgreSQL checks for quotation revisions, attendance approval, role visibility, independent audit verification, history and concurrency. Actual synthetic Excel/PDF extraction passed matching, NC differences and unreadable-document review fallback. No production worker or quotation data was inserted.

Operational inputs still required: actual client/vendor/branch assignments, effective quotation dates and approved component bases. The supplied example has no named client/vendor assignment and cannot safely be applied to production. Scanned PDFs and consolidated challans require auditor review; OCR is not implemented by this release and must not be represented as automatic certification.

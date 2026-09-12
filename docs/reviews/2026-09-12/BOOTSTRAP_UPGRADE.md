# Bootstrap workspace upgrade — 12 September 2026

Implemented locally using Bootstrap 5.3.8 with a custom Statco theme. No deployment or device installation occurred.

## Visible changes

- Ivory navigation, emerald selection, structured page headings and a branded workspace toolbar across the 13 portal shells.
- Bootstrap buttons, shared inputs/selects and data tables; existing Angular event handling, accessibility attributes and native module-search dialog remain in control.
- Table column/export controls grouped into a distinct toolbar; readable hover states and numeric alignment.
- Contractor roster: clickable Active Workers count, visible Active/Inactive/All filters and a primary Download Workers action. Clicking the count clears text search and displays active workers within the current branch scope.
- Excel download retains the chosen scope and preserves leading-zero codes. It exports registered roster status, not live on-site attendance.

## Integration

The new bootstrap-workspace.scss follows Bootstrap's selective Sass import approach: https://getbootstrap.com/docs/5.3/customize/sass/ . Component CSS is scoped to explicit .bs-surface hosts. Global Bootstrap Reboot, grid, utility overrides and DOM-manipulating JavaScript plugins are not loaded. Existing Tailwind-based bespoke pages retain their layouts; this is a shared-system upgrade, not a claim that every page has been rewritten in Bootstrap.

The existing package lock was updated with the Bootstrap dependency. Sass reports upstream Bootstrap deprecation notices; compilation succeeds within the existing bundle budget.

## Verification

- 217 browser tests across 40 files passed, including worker download safety and failure handling.
- Production build and frontend lint passed; final edited files passed a further lint check.
- All 13 representative portal screens passed desktop/mobile checks: module finder content, focus, Escape dismissal, density controls, search empty state, no runtime errors and no horizontal page overflow.
- The contractor browser check uses 63 active and 2 inactive synthetic workers. It verifies the status filters, search, clickable count, actual Excel generation with 63 active rows and preserved punch code 00001.
- Monthly-close desktop/mobile preview passed; payroll reconciliation passed with 5,000 synthetic employees.
- Visual review identified and corrected light-sidebar label contrast and worker metric alignment.

Logs: bootstrap-build.log, bootstrap-tests.log, bootstrap-lint.log, bootstrap-final-lint.log, bootstrap-portals.log, bootstrap-monthly-close.log, bootstrap-payroll-ui.log.

Preview gallery: ui/index.html. All preview data is synthetic. Physical-device and live-client acceptance remain separate.

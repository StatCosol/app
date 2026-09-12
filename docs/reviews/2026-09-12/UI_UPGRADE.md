# Web workspace UI upgrade — 12 September 2026

Implemented locally across all 13 web portal shells: Admin, Accounts, Sales, Auditor, Contractor, PF/ESI Team, Client, Employee Self Service, CEO, CCO, Branch, Payroll, and CRM.

## Scope and behavior

- A shared workspace presentation layer covers typography, cards, panel spacing, table spacing, form controls, focus indicators, responsive controls, and reduced-motion preferences. Existing role identities and business status colors are retained. Public login pages are outside this change.
- Every portal has a working module finder, opened by its button or Ctrl/Cmd+K. It searches links present in that portal's navigation, deduplicates destinations, excludes external and other-portal links, and keeps existing route guards. It searches module names, not employee or document contents. Search results depend on the navigation currently rendered, including its permission and search filters.
- Comfortable/compact table spacing persists as a local display preference. The preference contains no business records. Touch controls retain larger targets on coarse-pointer devices.
- The client header's previously inactive search field now opens the module finder.
- Shared data tables offer column selection with at least one visible column, keyboard sorting, accessible scroll regions, loading state, and keyboard row activation. CSV exports contain visible columns and currently loaded rows; the label makes this scope explicit. String cells starting with spreadsheet formula characters are escaped.
- Shared form controls refresh when values or disabled state are set programmatically; numeric zero is preserved. Required states are exposed to assistive technology.
- Disabled/loading link buttons cannot navigate. Shared modals and confirmation dialogs focus their contents, retain keyboard focus, handle Escape, and restore their opener. Breadcrumbs mark the current page.
- Mobile grids explicitly designed for one column now override older broad grid rules. The shared helpdesk list uses the full phone width instead of being squeezed into half the screen.
- Shared dashboard hero styling now uses the product's navy/green palette with lighter shadows.

## Coverage

The 13 role route files contain 357 route definitions, including redirects and parameterized routes. All run beneath upgraded portal shells. Fifty source files use the shared data-table component. This is a cross-module shared UI upgrade; it does not replace every bespoke screen with a newly designed page or add column selection to custom tables.

Browser previews use synthetic responses, never client records. Representative routes: Admin users; Accounts settings; Sales profile; Auditor audits; Contractor profile; PF Team tickets; Client profile; ESS profile; CEO profile; CCO profile; Branch helpdesk; Payroll profile; CRM profile. Each is checked at 1440px desktop and 390px mobile widths for the correct portal, available module search, keyboard focus, spacing preference, empty search results, horizontal document overflow, and runtime errors.

Monthly-close and payroll-reconciliation previews additionally exercise populated workflow screens. The reconciliation preview uploads a synthetic CSV and verifies a one-paisa difference.

## Validation

- Production frontend build and lint.
- Full browser regression suite: 39 files, 214 passing tests.
- New UI interaction suite: 12 passing tests, included in the full suite; targeted repeat after final template refinements.
- Desktop and mobile smoke checks for all 13 portals.
- Monthly-close and payroll-reconciliation production-bundle previews.

Logs are alongside this report. Screenshot gallery: [Portal review](ui/index.html). Per-portal preview results and mocked endpoint inventory: [portal-smoke.json](ui/portal-smoke.json).

## Delivery boundary

Source changes and production bundle are local. No deployment, publication, payroll mutation, client-data edit, or Android APK update was performed for this UI upgrade. Existing mobile changes from earlier work are separate. Production acceptance still needs representative client workflows and real permission combinations; synthetic previews do not certify every route, dataset, browser, or accessibility requirement.

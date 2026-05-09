# Frontend Angular Template UI Alignment & Layout Audit

**Generated**: Full audit of `frontend/src/app/pages/` templates  
**Scope**: All page folders — admin, crm, client, ceo, cco, branch, contractor, auditor, payroll, shared  
**Methodology**: External `.html` templates (116 files) + inline `template:` in `.ts` files (100+)

---

## Summary of Findings

| Category | HIGH | MEDIUM | LOW | Total |
|---|---|---|---|---|
| Buttons missing `type` attribute | 0 | 38 | 0 | 38 |
| Page-level wrapper inconsistency | 0 | 5 | 8 | 13 |
| Raw `<table>` without width class | 11 | 10 | 0 | 21 |
| Raw `<table>` without overflow wrapper | 0 | 6 | 0 | 6 |
| Gap/spacing inconsistency | 0 | 0 | 12 | 12 |
| Mixed table paradigms (raw vs `ui-data-table`) | 0 | 0 | 6 | 6 |
| **Totals** | **11** | **59** | **26** | **96** |

---

## 1. BUTTONS MISSING `type` ATTRIBUTE (MEDIUM)

Buttons without `type="button"` default to `type="submit"`, which can cause unintended form submissions. Every `<button>` with a `(click)` handler that is NOT a form submit should have `type="button"`.

### auditor-dashboard.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 10 | `<button (click)="errorMsg = null; loadAllData()" class="text-red-800...">Retry</button>` | Add `type="button"` | MEDIUM |

### auditor/reports/auditor-reports.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 32 | `<button (click)="exportAll()" class="ml-auto inline-flex...">Export All</button>` | Add `type="button"` | MEDIUM |

### auditor/compliance/auditor-compliance-tasks.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 42 | `<button (click)="clearFilters()" class="text-xs...">Clear filters</button>` | Add `type="button"` | MEDIUM |

### ceo/ceo-dashboard.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 12 | `<button (click)="loadAll()" class="text-red-800...">Retry</button>` | Add `type="button"` | MEDIUM |

### ceo/branches/ceo-branches.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 62 | `<button (click)="clearFilters()" class="text-xs...">Clear</button>` | Add `type="button"` | MEDIUM |

### cco/cco-dashboard.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 14 | `<button class="mt-2..." (click)="reload()">Try Again</button>` | Add `type="button"` | MEDIUM |
| 32 | `<button (click)="exportCsv()" class="ml-auto...">Export</button>` | Add `type="button"` | MEDIUM |

### cco/cco-crms-under-me.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 13 | `<button (click)="retry()" class="text-red-800...">Retry</button>` | Add `type="button"` | MEDIUM |
| 48 | `<button (click)="exportCsv()" class="ml-auto...">Export</button>` | Add `type="button"` | MEDIUM |

### admin/users/users.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 115 | `<button class="text-sm..." (click)="cancelEdit()">Cancel ✕</button>` | Add `type="button"` | MEDIUM |

### admin/masters/admin-masters.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 98 | `<button (click)="exportCsv()" class="inline-flex...">Export CSV</button>` | Add `type="button"` | MEDIUM |

### admin/clients/admin-clients.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 215 | `<button *ngIf="regLogoFile" type="button" (click)="removeRegLogo()">Remove</button>` | ✅ OK (has type) | — |
| 684 | `<button (click)="createdBranchUser = null" class="text-green-600...">×</button>` | Add `type="button"` | MEDIUM |

### branch/branch-dashboard/branch-dashboard.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 23 | `<button (click)="loadDashboard()" class="refresh-btn">Refresh</button>` | Add `type="button"` | MEDIUM |

### branch/branch-mcd/branch-mcd.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 59 | `<button class="btn-refresh" (click)="load(selectedItem?.returnCode)">Refresh</button>` | Add `type="button"` | MEDIUM |
| 60 | `<button class="btn-refresh" (click)="exportMonthSheet()">Export Month Sheet</button>` | Add `type="button"` | MEDIUM |
| 277 | `<button class="btn-secondary" type="button" (click)="closeUploadModal()">Cancel</button>` | ✅ OK | — |
| 278 | `<button class="btn-primary" type="button" ...>Upload</button>` | ✅ OK | — |

### branch/branch-safety/branch-safety.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 82 | `<button class="btn btn-ghost" type="button" (click)="clearFilters()">Reset</button>` | ✅ OK | — |
| 169 | `<button class="btn btn-secondary" type="button" (click)="downloadLatest()">Download</button>` | ✅ OK | — |
| 193 | `<button class="btn btn-primary" type="button" ...>Upload</button>` | ✅ OK | — |

### branch/branch-compliance-docs/branch-compliance-docs.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 15 | `<button class="px-3 py-2 text-sm border rounded" (click)="loadAll()">Refresh</button>` | Add `type="button"` | MEDIUM |

### contractor/contractor-dashboard.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 28 | `<button (click)="retry()" class="text-red-800...">Retry</button>` | Add `type="button"` | MEDIUM |

### contractor/compliance/contractor-compliance.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 76 | `<button (click)="exportCsv()" class="inline-flex...">Export</button>` | Add `type="button"` | MEDIUM |

### contractor/compliance/contractor-compliance-tasks.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 4 | `<button class="px-3 py-2 text-sm border rounded" (click)="load()">Refresh</button>` | Add `type="button"` | MEDIUM |

### contractor/compliance/contractor-compliance-reupload-requests.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 4 | `<button class="px-3 py-2 text-sm border rounded" (click)="load()">Refresh</button>` | Add `type="button"` | MEDIUM |
| 24 | `<button class="text-xs text-blue-600 underline mt-1" (click)="viewRemarks(r)">View full remarks</button>` | Add `type="button"` | MEDIUM |

### crm/crm-dashboard.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 76 | `<button [class.active]="dueTab==='OVERDUE'" (click)="setDueTab('OVERDUE')">Overdue</button>` | Add `type="button"` | MEDIUM |
| 77 | `<button [class.active]="dueTab==='DUE_SOON'" (click)="setDueTab('DUE_SOON')">Due Soon</button>` | Add `type="button"` | MEDIUM |
| 78 | `<button [class.active]="dueTab==='THIS_MONTH'" (click)="setDueTab('THIS_MONTH')">This Month</button>` | Add `type="button"` | MEDIUM |
| 118 | `<button class="workflow-card" (click)="openShortcut(...)">Returns</button>` | Add `type="button"` | MEDIUM |

### crm/audits/crm-audit-management-page.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 11-16 | Tab buttons (Manage Audits / + Schedule New) | Add `type="button"` | MEDIUM |
| 178 | `<button class="status-action-btn" (click)="openScheduleModal(row)">Assign / Reschedule</button>` | Add `type="button"` | MEDIUM |

### crm/branch-docs-review/crm-branch-docs-review.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 105 | `<button *ngIf="row.uploadedFileUrl" class="btn-outline" (click)="viewDoc(row)">View</button>` | Add `type="button"` | MEDIUM |
| 112 | `<button *ngIf="canReview(row)" class="btn-approve" (click)="openReviewModal(row, 'APPROVED')">Approve</button>` | Add `type="button"` | MEDIUM |
| 118 | `<button *ngIf="canReview(row)" class="btn-reject" (click)="openReviewModal(row, 'REUPLOAD_REQUIRED')">Reject</button>` | Add `type="button"` | MEDIUM |

### crm/compliance-docs/crm-compliance-docs.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 9 | `<button class="btn-upload" (click)="toggleUploadForm()">Upload Document</button>` | Add `type="button"` | MEDIUM |
| 88 | `<button class="btn-upload" [disabled]="..." (click)="upload()">Upload Document</button>` | Add `type="button"` | MEDIUM |

### crm/returns/crm-returns-filings.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 242 | `<button class="mini" (click)="openAckUpload(row.id)">Upload Ack</button>` | Add `type="button"` | MEDIUM |
| 245 | `<button class="mini mini--view" [disabled]="..." (click)="openFile(row.ackFilePath)">View</button>` | Add `type="button"` | MEDIUM |
| 252 | `<button class="mini" (click)="openChallanUpload(row.id)">Upload Challan</button>` | Add `type="button"` | MEDIUM |
| 255 | `<button class="mini mini--view" [disabled]="..." (click)="openFile(row.challanFilePath)">View</button>` | Add `type="button"` | MEDIUM |

### client/audits/client-audits.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 112 | `<button (click)="exportCsv()" class="inline-flex...">Export</button>` | Add `type="button"` | MEDIUM |
| 129 | `<button *ngIf="row.status === 'COMPLETED'" (click)="openAuditDetail(row)">View</button>` | Add `type="button"` | MEDIUM |
| 141 | `<button (click)="selectedAudit = null" class="p-1 text-gray-400...">×</button>` | Add `type="button"` | MEDIUM |

### client/compliance/client-compliance-status.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 17 | `<button (click)="loadAll()" class="text-red-800...">Retry</button>` | Add `type="button"` | MEDIUM |

### client/compliance/client-returns.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 40 | `<button class="btn btn-secondary ml-auto" (click)="loadFilings()">Refresh</button>` | Add `type="button"` | MEDIUM |
| 72 | `<button class="btn btn-primary" (click)="create()">Create filing</button>` | Add `type="button"` | MEDIUM |

### client/branches/branch-detail.component.html
| Line | Problematic Code | Fix | Severity |
|---|---|---|---|
| 467 | `<button class="pending-row" *ngFor="let item of pendingPanel" (click)="jumpToPending(item)">` | Add `type="button"` | MEDIUM |

---

## 2. PAGE-LEVEL WRAPPER INCONSISTENCY (MEDIUM/LOW)

Three different patterns are used for page root wrappers, creating inconsistent horizontal padding and max-width behavior:

| Pattern | Usage | Files |
|---|---|---|
| `<div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">` | Tailwind responsive | Most newer pages |
| `<div class="page-wrap">` | Custom CSS class | Payroll, auditor workspace, observations, report-builder |
| `<div class="page">` | Custom CSS class | crm-compliance-docs |
| `<div class="p-4">` | Minimal padding only | 5 pages (see below) |

### Files using `<div class="p-4">` (inconsistent — no max-width or responsive padding)

| File | Line | Severity | Fix |
|---|---|---|---|
| `branch/branch-compliance-docs/branch-compliance-docs.component.html` | 1 | MEDIUM | Change to `<div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">` |
| `contractor/compliance/contractor-compliance-tasks.component.html` | 1 | MEDIUM | Change to `<div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">` |
| `contractor/compliance/contractor-compliance-reupload-requests.component.html` | 1 | MEDIUM | Change to `<div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">` |
| `auditor/compliance/auditor-compliance-task-detail.component.html` | 1 | MEDIUM | Change to `<div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">` |
| `cco/cco-oversight.component.html` | 56 | LOW | Inner content using `p-4` — acceptable in nested card context |

### Files using `<div class="page-wrap">` (custom class — not inherently wrong, but different from majority)

| File | Line | Severity |
|---|---|---|
| `payroll/payroll-structures.component.html` | 1 | LOW |
| `payroll/payroll-setup.component.html` | 1 | LOW |
| `payroll/payroll-rule-sets.component.html` | 1 | LOW |
| `payroll/payroll-pf-esi.component.html` | 1 | LOW |
| `payroll/payroll-fnf.component.html` | 1 | LOW |
| `auditor/auditor-audit-workspace.component.html` | 1 | LOW |
| `auditor/observations/auditor-observations.component.html` | 1 | LOW |
| `auditor/reports/auditor-report-builder.component.html` | 1 | LOW |

> **Recommendation**: Standardize all pages on **one** wrapper. The `max-w-7xl mx-auto px-4 sm:px-6 py-6` pattern is the majority and provides responsive padding. The `page-wrap` custom class is acceptable if it resolves to the same sizing. The `p-4` pages are the worst offenders — they lack max-width constraints, making content stretch edge-to-edge on large screens.

---

## 3. RAW `<table>` WITHOUT WIDTH CLASS (HIGH/MEDIUM)

Raw `<table>` elements without `w-full` or `min-w-full` don't stretch to fill their container, causing ragged right edges.

### Payroll pages (HIGH — all use `<table>` inside `table-wrap` with no width class)

| File | Lines | Count | Severity |
|---|---|---|---|
| `payroll/payroll-structures.component.html` | 87, 281, 326, 391 | 4 | HIGH |
| `payroll/payroll-setup.component.html` | 317, 362 | 2 | HIGH |
| `payroll/payroll-rule-sets.component.html` | 75, 216, 382 | 3 | HIGH |
| `payroll/payroll-pf-esi.component.html` | 128, 188, 223 | 3 | HIGH |
| `payroll/payroll-fnf.component.html` | 74 | 1 | HIGH |
| `payroll/payroll-runs.component.html` | 70, 202, 266 | 3 | HIGH |

**Fix**: Change `<table>` to `<table class="w-full">` in all payroll table elements.

### Auditor pages

| File | Lines | Count | Severity |
|---|---|---|---|
| `auditor/auditor-audit-workspace.component.html` | 26, 192, 288 | 3 | MEDIUM |
| `auditor/observations/auditor-observations.component.html` | 75 | 1 | MEDIUM |

These are wrapped in `table-wrap` (which may set width via CSS), so severity is MEDIUM rather than HIGH. Verify that `table-wrap` includes `width:100%` rule.

### CCO pages

| File | Lines | Count | Severity |
|---|---|---|---|
| `cco/cco-oversight.component.html` | 79, 113, 151, 182, 240 | 5 | MEDIUM |

### Branch pages

| File | Lines | Count | Severity |
|---|---|---|---|
| `branch/branch-safety/branch-safety.component.html` | 100, 247, 275 | 3 | MEDIUM |

### CRM pages

| File | Lines | Count | Severity |
|---|---|---|---|
| `crm/crm-dashboard.component.html` | 87+ (inside table-wrap) | varies | MEDIUM |
| `crm/amendments/crm-amendments.component.html` | 59, 108 (inside table-wrap) | 2 | MEDIUM |

**Fix for all**: Add `class="w-full"` or `class="min-w-full"` to every `<table>` element.

> **Contrast with correctly styled tables**: `crm-compliance.component.html`, `crm-reports.component.html`, `crm-reupload-backlog.component.html`, `contractor-dashboard.component.html`, `client-contractors.component.html`, `client-compliance-status.component.html` — all use `class="min-w-full"` on their tables. This is the correct pattern.

---

## 4. RAW `<table>` WITHOUT OVERFLOW WRAPPER (MEDIUM)

Tables without an `overflow-x-auto` or `overflow-auto` wrapper will cause horizontal page scrolling on narrow screens instead of only scrolling the table.

### Tables wrapped in `table-wrap` (custom class)
These use `table-wrap` which likely provides overflow handling via CSS — **verify the CSS** includes `overflow-x: auto`:
- All payroll tables
- Auditor workspace/observations tables
- CRM dashboard/amendments tables

### Tables WITHOUT any overflow wrapper

| File | Lines | Issue | Severity |
|---|---|---|---|
| `cco/cco-oversight.component.html` | 79, 113, 151, 182, 240 | No overflow wrapper around any of the 5 tables | MEDIUM |
| `branch/branch-safety/branch-safety.component.html` | 100, 247, 275 | Tables in custom card containers without overflow-x-auto | MEDIUM |

**Fix**: Wrap each `<table>` in `<div class="overflow-x-auto">...</div>`.

---

## 5. GAP / SPACING INCONSISTENCIES (LOW)

### Inconsistent `gap` values within admin pages

| File | Line | Gap Value | Context | Severity |
|---|---|---|---|---|
| `admin/admin-dashboard.component.html` | KPI grid | `gap-4` | KPI cards | LOW |
| `admin/admin-dashboard.component.html` | Section grid | `gap-6` | Main sections | LOW |
| `admin/admin-assignments.component.html` | — | `gap-6` | Main layout | LOW |
| `admin/admin-notifications.component.html` | KPI section | `gap-4` | KPIs | LOW |
| `admin/admin-notifications.component.html` | Main section | `gap-6` | Sections | LOW |
| `admin/users/users.component.html` | Filter | `gap-4` | Filters | LOW |

> **Assessment**: The pattern of `gap-4` for compact grids (KPIs, filters) and `gap-6` for major layout sections is **actually intentional and correct**. This is a design-system-level distinction. No fix needed unless strict uniformity is desired.

### Inconsistent KPI grid columns

| File | Grid Pattern | Severity |
|---|---|---|
| `admin-dashboard.component.html` | `grid-cols-2 md:grid-cols-4` | — |
| `contractor-dashboard.component.html` | `grid-cols-2 md:grid-cols-5` | LOW |
| `auditor-reports.component.html` | `grid-cols-2 sm:grid-cols-4` | LOW |
| `ceo-dashboard.component.html` | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` | LOW |
| `payroll-dashboard.component.html` | `grid-cols-2 md:grid-cols-4` | — |

> **Assessment**: Different column counts are driven by the number of KPIs on each dashboard, not misalignment. The breakpoint variant (`sm:` vs `md:`) is a minor inconsistency. Recommend standardizing on `sm:grid-cols-N` for smaller breakpoint response.

---

## 6. MIXED TABLE PARADIGMS — raw `<table>` vs `ui-data-table` (LOW)

Some pages use the shared `ui-data-table` component (which standardizes sorting, pagination, accessibility) while others in the same portal use raw `<table>` elements.

| Portal | Pages using `ui-data-table` | Pages using raw `<table>` |
|---|---|---|
| Auditor | reports, compliance-tasks | audit-workspace, observations |
| CRM | audits (crm-audits.component) | compliance, reports, amendments, dashboard |
| Contractor | compliance-tasks | dashboard, reupload-requests |
| Client | — | contractors, compliance-status, mcd, returns |
| Payroll | — | ALL pages (structures, setup, runs, rule-sets, pf-esi, fnf) |
| CCO | — | oversight, controls |
| Branch | — | safety |

> **Recommendation**: Migrate raw `<table>` usage to `ui-data-table` where feasible to achieve consistent styling, built-in sorting, and accessibility. Priority: Payroll (6 pages, 16 tables) and CCO Oversight (5 tables).

---

## 7. ADDITIONAL FINDINGS

### 7a. Cards with inconsistent padding

| Pattern | Files |
|---|---|
| `class="card"` (custom CSS) | Most dashboards, admin pages |
| `class="contractor-card p-4"` | contractor-dashboard |
| `class="bg-white border ... rounded-xl p-4"` | auditor-reports |
| `class="summary-card"` | auditor-workspace, observations |

> Cards use a mix of `card` custom class and inline Tailwind. Minor inconsistency (LOW).

### 7b. Buttons in contractor-compliance-reupload-requests.component.html missing `type="button"`

| Line | Code | Severity |
|---|---|---|
| 38 | `<button class="px-2 py-1 text-xs border rounded" [disabled]="..." (click)="upload(r)">Upload</button>` | MEDIUM |
| 43 | `<button class="px-2 py-1 text-xs bg-black text-white rounded ml-2" [disabled]="..." (click)="submit(r)">Submit</button>` | MEDIUM |

### 7c. CRM Audits tab buttons missing `type="button"`

| Line | Code | Severity |
|---|---|---|
| 11 | `<button (click)="activeTab = 'list'" [class]="...">Manage Audits</button>` | MEDIUM |
| 16 | `<button (click)="activeTab = 'create'" [class]="...">+ Schedule New</button>` | MEDIUM |

### 7d. CRM Audits — action buttons in table rows missing `type="button"`
| Line | Code | Severity |
|---|---|---|
| ~89 | `<button *ngFor="let action of getNextStatuses(row.status)" (click)="changeStatus(row, action.value)" ...>{{ action.label }}</button>` | MEDIUM |

---

## Fix Priority Summary

### Tier 1 — Fix Now (HIGH)
1. **Add `class="w-full"` to ALL raw `<table>` elements** in payroll pages (16 tables across 6 files). These are data-heavy HR/payroll tables that become unusable when not full-width.

### Tier 2 — Fix Soon (MEDIUM)
2. **Add `type="button"` to ~38 `<button>` elements** across all portals. Bulk find-and-replace: any `<button` with `(click)` that lacks `type=` should get `type="button"`.
3. **Change page wrappers from `class="p-4"` to `class="max-w-7xl mx-auto px-4 sm:px-6 py-6"`** in 4 files: `branch-compliance-docs`, `contractor-compliance-tasks`, `contractor-compliance-reupload-requests`, `auditor-compliance-task-detail`.
4. **Add overflow wrappers** to tables in `cco-oversight` (5 tables) and `branch-safety` (3 tables).

### Tier 3 — Consider (LOW)
5. Standardize on `sm:` vs `md:` breakpoints for KPI grids.
6. Migrate high-traffic raw `<table>` pages to `ui-data-table` component.
7. Standardize page wrapper class (`page-wrap` vs Tailwind `max-w-7xl`).

---

*End of audit report.*

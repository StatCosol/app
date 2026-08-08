# Page → Backend Endpoint Wiring Audit

**Mode:** Map + flag issues only — no code changes were made.
**Generated:** automated static extraction over `backend/src/**/*.controller.ts` and `frontend/src/app/**/*.ts`.
**Scope:** all portals (Admin, CEO, CCO, CRM, Auditor, Client, Branch, Contractor, ESS, Payroll, PF-Team, Accounts).

---

## 1. Headline Numbers

| Metric | Count |
|---|---|
| Backend HTTP route handlers (`@Get/@Post/@Put/@Patch/@Delete`) | **1,245** |
| Distinct frontend HTTP URLs extracted (after base-constant + template resolution) | **815** |
| Frontend URLs that map cleanly to a backend handler | **777** (95.3%) |
| Frontend URLs with NO matching backend handler | **38** (most are service base constants — see §3) |
| Backend handlers with no detectable frontend caller | **339** (most are false-positive — see §4) |

> **Static-analysis caveats** — Findings below are signal, not absolute proof. The extractor cannot fully resolve:
> - URLs built via `+` string concatenation across multiple statements
> - Bases imported from another file (`import { API_BASE } from ...`)
> - URLs assembled from runtime values (`/clients/${this.selectedClientId}/...`) — these match generically as `/clients/{p}/...`
> - Routes wired only by guards/cron/internal services (not from any UI page)
>
> Anything flagged below was further checked against the codebase manually and is reported with that verification.

---

## 2. Confirmed Real Issues (action recommended)

### 2.1 ❗ AzureBlobService → 4 endpoints with no backend handler

`frontend/src/app/shared/files/services/azure-blob.service.ts` calls 4 file-upload endpoints, but `backend/src/files/files.controller.ts` only exposes `GET /api/v1/files/download`.

| Frontend call | File:line | Backend status |
|---|---|---|
| `POST /api/v1/files/sas-token` | [azure-blob.service.ts:44](frontend/src/app/shared/files/services/azure-blob.service.ts#L44) | **MISSING** |
| `POST /api/v1/files/confirm` | [azure-blob.service.ts:84](frontend/src/app/shared/files/services/azure-blob.service.ts#L84) | **MISSING** |
| `GET  /api/v1/files/download-url` | [azure-blob.service.ts:118](frontend/src/app/shared/files/services/azure-blob.service.ts#L118) | **MISSING** |
| `DELETE /api/v1/files/{blobName}` | [azure-blob.service.ts:128](frontend/src/app/shared/files/services/azure-blob.service.ts#L128) | **MISSING** |

Impact: any UI flow that injects `AzureBlobService` and calls `upload()`, `getDownloadUrl()`, or `deleteBlob()` will receive 404 from production. Either:
- (a) The service is dead code and should be removed; or
- (b) These four backend handlers need to be implemented in `files.controller.ts` (Azure Blob SAS upload pattern).

### 2.2 ❗ Accounts / Billing module — UI not yet built

`backend/src/accounts-billing/**` ships **37 production handlers** (invoices, billing-clients, billing-settings, invoice-payments, invoice-pdf-email, recurring-invoices, pending-payment-followups), all gated `@Roles('ADMIN','ACCOUNTS')`. On the frontend only one stub service exists — [accounts-billing.service.ts:12](frontend/src/app/modules/accounts-billing/services/accounts-billing.service.ts#L12) — declaring `private readonly base = '${env}/api/v1/billing'` but issuing **zero** real HTTP calls. There is also no menu item, route, or page component for it.

| Backend area | Handlers | Roles | Frontend caller |
|---|---|---|---|
| `billing/clients`         | 5  | ADMIN/ACCOUNTS | none |
| `billing/settings`        | 2  | ADMIN/ACCOUNTS | none |
| `billing/invoices` (CRUD, approve, cancel, stats, GST) | 9  | ADMIN/ACCOUNTS | none |
| `billing/invoices/:id/payments` + `billing/payments` | 3 | ADMIN/ACCOUNTS | none |
| `billing/invoices/:id/{generate-pdf,pdf,send-email}` + email-logs | 4 | ADMIN/ACCOUNTS | none |
| `billing/recurring`       | 7  | ADMIN/ACCOUNTS | none |
| `billing/pending-payments`| 9  | ADMIN/ACCOUNTS | none |

**Impact:** expected gap if billing UI is on the roadmap; bug if it was meant to be live.

### 2.3 ⚠️ Two URL extractions that look broken in source

| Source | Issue |
|---|---|
| [azure-blob.service.ts:128](frontend/src/app/shared/files/services/azure-blob.service.ts#L128) | URL literal `` `${this.baseUrl}/api/v1/files/${encodeURIComponent(blobName)}` `` extracts cleanly only because of a fortunate regex hit; not actually a bug, just confirms the missing backend handler from §2.1. |
| [compliance-api.service.ts:11](frontend/src/app/shared/services/compliance-api.service.ts#L11) | Generic helper builds `/api/v1/${path}` from caller-supplied tail. Static analysis can't validate; verified callers do supply real tails matched elsewhere. |

---

## 3. The 38 "Unmatched FE URLs" — Triage Table

Every entry below was checked. Real misses are §2.1 only; the rest fall into 4 false-positive classes:

| Class | Count | Examples |
|---|---|---|
| Base constant only — actual calls under it ARE matched | 27 | `/api/v1/admin`, `/api/v1/billing`, `/api/v1/payroll`, `/api/v1/payroll/engine`, `/api/v1/payroll/setup`, `/api/v1/ess`, `/api/v1/client`, `/api/v1/units`, `/api/v1/tasks`, `/api/v1/contractor/compliance`, `/api/v1/crm/compliance-tasks`, `/api/v1/admin/helpdesk`, `/api/v1/admin/applicability-config`, `/api/v1/admin/branch-compliance`, `/api/v1/admin/reminders`, `/api/v1/audit-schedules`, `/api/v1/automation/returns-filing`, `/api/v1/appraisal`, `/api/v1/client/biometric`, `/api/v1/client/master-data`, `/api/v1/client/visibility`, `/api/v1/employees/documents`, `/api/v1/helpdesk`, `/api/v1/pf-team/helpdesk`, `/api/v1/payroll/tds`, `/api/v1/payroll/gratuity`, `/api/v1/admin/archive` |
| Interceptor / generic helper templates | 3 | `/api/v1`, `/api/v1{p}` ([api-prefix.interceptor.ts:14](frontend/src/app/core/interceptors/api-prefix.interceptor.ts#L14)), `/api/v1/{p}` |
| AI service base const (only used for SSE that the matcher doesn't follow) | 1 | `/api/v1/ai` ([ai-api.service.ts:143](frontend/src/app/core/ai-api.service.ts#L143)) |
| Branch-reports param-key concat | 1 | `/api/v1/branch/reports/{p}` — verified backend has `branch/reports/:key` handler ([branch-reports.controller.ts](backend/src/branches/branch-reports.controller.ts)) |
| **Real missing backend handlers (§2.1)** | **5** (4 distinct routes + 1 dup) | files/sas-token, files/confirm, files/download-url, files/{p}, files/${enc(...)} |

Net **real** unmatched FE → backend gap: **4 endpoints** (all in `AzureBlobService`).

---

## 4. Backend Orphans by Module

339 handlers were not matched by the static extractor. The largest groups are summarised below. **For each, the table shows whether spot-checks confirm the orphan, partial UI exists, or it's a false-positive due to extractor blind spots.**

| Backend module | "Orphan" count | Spot-check verdict |
|---|---|---|
| `contractor` (incl. `clra-*` controllers) | 53 | **CLRA wired (2026-08)** — CRM workspace `/crm/clients/:clientId/clra`, contractor portal `/contractor/clra`, portal API `/clra/me/*`. Register runs + full assignment drill-down on FE. |
| `payroll` | 47 | Mix: `paydek/*`, `payroll/runs/seed-config/reprocess-employees/fix-employee-gross/debug` are admin-only debug/maintenance endpoints with no UI (intentional). `payroll/setup/.../slabs` and `client/payroll/setup/components` likely **missing UI**. |
| `branches` | 23 | Likely false positives (services use cross-file imports). |
| `crm` | 21 | Mix of false positives + a few admin-only endpoints. |
| `applicability` | 17 | Admin config endpoints — likely partial UI coverage. |
| `compliance` | 17 | False positives (heavy use of cross-imported bases). |
| `ess` | 17 | Mostly `branch-approvals/*` and `client/approvals` — verify CLIENT-portal approval pages exist. |
| `automation` | 14 | Likely cron / internal — many `expiry-tasks/*` accept admin trigger, low priority. |
| `audits` | 12 | Mostly admin-only audit-schedules; verify auditor portal completeness. |
| `admin` | 11 | Admin-only endpoints — false positives or low-traffic admin actions. |
| `returns` | 10 | Verify returns automation portal coverage. |
| `accounts-billing` | 1 (`GET /api/v1/billing/invoices/:id/pdf`) | Confirmed — UI module not built (see §2.2). |
| `cleanup` (`admin/archive`) | 3 | False positive — UI calls `${base}/${activeTab}` with dynamic value the matcher can't resolve. |

(Full list per-module is in `audit-result.json` → `orphansByModule`.)

### Honest interpretation

After accounting for the extractor limits, the **realistic** count of backend handlers that have zero UI surface is roughly **60–80 routes** (≈ 5–6% of backend), heavily concentrated in:
1. **Accounts / Billing** (37 routes) — confirmed UI-less
2. **CLRA contractor module** — **resolved**: CRM + contractor portals cover PE, contractors, workers, assignments, deployments, wage periods, attendance, wages, register runs.
3. **Payroll admin debug endpoints** (~10–15 routes) — intentional, no UI needed
4. **AzureBlobService gap** (4 routes) — actually FE→BE missing, not BE→FE

---

## 5. Per-Portal Spot-Check Summary

| Portal | Pages audited | Endpoint coverage | Notes |
|---|---|---|---|
| Admin | ~30 | Good | Missing UI for: archive detail-tabs work via dynamic var (matcher false-positive); applicability-config fully wired. |
| CEO | 8 | Good | All dashboard, KPI, drill-down endpoints matched. |
| CCO | 12 | Good | Registers/payroll wired through `payroll-engine-api.service`. |
| CRM | 25+ | Good | Compliance + clients + branch-registrations + contractors all wired. |
| Auditor | 10 | Good | Dashboard + audits + non-compliances wired. |
| Client | 30+ | Good | Notices, biometric, master-data, payroll-inputs, dashboards all wired. Verify gratuity/TDS pages depth. |
| Branch | 10 | Good | Mark-attendance, notices, audit-non-compliances, reports all wired. |
| Contractor | 9 | Good | CLRA at `/contractor/clra` (assignments, workers, registers). |
| ESS | 15+ | Good | Attendance/leaves/holidays/contributions/documents/helpdesk all wired. |
| Payroll | 20 | Mostly good | Engine, setup, runs, registers wired. Some admin-debug endpoints intentionally UI-less. |
| PF-Team | 5 | Good | Helpdesk + tickets wired. |
| **Accounts** | **~12 pages** | **Good** | Portal at `/accounts/*` (invoices, payments, clients, settings). |

---

## 6. Recommendations

1. **Decide the fate of `AzureBlobService`** — either implement the 4 missing `files/*` endpoints or delete the service. (~30 min triage.)
2. **Accounts / Billing UI** — portal exists at `/accounts/*`; verify PDF invoice endpoint (`GET /billing/invoices/:id/pdf`) is wired if needed.
3. ~~**CLRA contractor flow**~~ — **Done**: `/crm/clients/:clientId/clra` (CRM) and `/contractor/clra` (contractor self-service).
4. **Payroll debug endpoints** — endpoints like `/payroll/runs/seed-config`, `/fix-employee-gross`, `/patch-attendance/:runId`, `/debug/:runId/:empCode` are admin-only maintenance hooks. Confirm they're either wired to an admin tools page or guarded behind a feature flag.
5. **No menu wiring issues** were found — all 78 menu items in `menu.config.ts` resolve to mounted Angular routes (separate report: [docs/MENU_WIRING_AUDIT.md](docs/MENU_WIRING_AUDIT.md)).

---

## 6a. Deep Dive — Payroll Structure & Configuration UI gap (post-review)

The first pass under-reported the **Payroll** module. After a focused re-check, the following per-client structure & configuration backend endpoints have **NO frontend caller** at all:

### 6a.1 `PayrollConfigController` — entirely UI-less
File: [backend/src/payroll/payroll.config.controller.ts](backend/src/payroll/payroll.config.controller.ts) — Roles `PAYROLL`, `ADMIN`.

| Verb | Endpoint | Purpose |
|---|---|---|
| GET  | `/api/v1/payroll/clients/:clientId/components-effective` | Effective component master + per-client overrides |
| POST | `/api/v1/payroll/clients/:clientId/component-overrides`  | Save per-client component overrides |
| GET  | `/api/v1/payroll/clients/:clientId/payslip-layout`       | Per-client payslip layout |
| POST | `/api/v1/payroll/clients/:clientId/payslip-layout`       | Save per-client payslip layout |
| GET  | `/api/v1/payroll/clients/:clientId/config-audit`         | Configuration change audit trail |

Verified zero frontend hits for any of `components-effective`, `component-overrides`, `payslip-layout`, `config-audit` (`grep_search` across `frontend/src/app/**`).

The existing page [frontend/src/app/pages/payroll/client-payroll-config.component.ts](frontend/src/app/pages/payroll/client-payroll-config.component.ts) is **misleadingly named** — it only calls `engineApi.listClientStructures()` (legacy client-structures CRUD) plus the legacy engine `listStructures` / `listRuleSets`. It does not surface the effective components view, overrides editor, payslip layout designer, or config audit timeline.

### 6a.2 `PayrollSetupController` — rule slabs sub-routes UI-less
File: [backend/src/payroll/payroll-setup.controller.ts](backend/src/payroll/payroll-setup.controller.ts)

| Verb | Endpoint | Roles |
|---|---|---|
| GET  | `/api/v1/payroll/setup/:clientId/components/:componentId/rules/:ruleId/slabs` | PAYROLL, ADMIN |
| POST | `/api/v1/payroll/setup/:clientId/components/:componentId/rules/:ruleId/slabs` | PAYROLL, ADMIN |
| GET  | `/api/v1/client/payroll/setup`                       | CLIENT |
| GET  | `/api/v1/client/payroll/setup/components`            | CLIENT |

The PAYROLL setup screens use the components/rules CRUD but never the **slabs** editor — meaning slab-based rules (e.g., income-tax slabs, PT slabs) cannot be created/edited via the UI. The two CLIENT-portal read endpoints (`/client/payroll/setup` and `.../setup/components`) also have no caller — clients cannot view their own payroll setup.

### 6a.3 `ClientStructuresController` — `/all` variant unused
- `GET /api/v1/payroll/client-structures/client/:clientId/all` — never called. The page uses the stable `client/:clientId` endpoint to avoid 404 noise. Likely intentional but worth deleting if confirmed dead.

### 6a.4 Other payroll backend handlers without UI (intentional admin / debug)
These are flagged for awareness only; most are admin-only fixers / cron-style triggers:

- `POST /api/v1/payroll/runs/:runId/reprocess-employees`
- `POST /api/v1/payroll/runs/seed-config`
- `POST /api/v1/payroll/runs/fix-employee-gross`
- `POST /api/v1/payroll/runs/update-employee-statutory-flags`
- `POST /api/v1/payroll/runs/patch-attendance/:runId`
- `GET  /api/v1/payroll/runs/debug/:runId/:empCode`
- `GET  /api/v1/payroll/runs/register-templates`
- `GET  /api/v1/paydek/employees`, `/paydek/pf-esi/pending`, `/paydek/queries` (PAYDEK role — separate portal not yet built)

### 6a.5 Recommended actions

| # | Action | Effort |
|---|---|---|
| 1 | Build a "Per-Client Component Overrides" tab in `client-payroll-config.component.ts` calling `components-effective` + `component-overrides`. | M |
| 2 | Build a "Payslip Layout" designer (drag/drop component ordering, show/hide flags) calling `payslip-layout` GET/POST. | M |
| 3 | Build a "Config Audit Trail" tab calling `config-audit`. | S |
| 4 | Add **slab editor** UI under the rule edit dialog of `payroll-setup-api.service` (drives `setup/:clientId/components/:componentId/rules/:ruleId/slabs`). | M |
| 5 | Wire the CLIENT-portal `/client/payroll/setup` + `/setup/components` read endpoints into the existing client payroll dashboard so clients can review their applied configuration. | S |
| 6 | Decide whether to expose the admin `payroll/runs/{seed-config,fix-employee-gross,patch-attendance,...}` actions in an admin-tools page or remove them. | S |

Net: **5 UI tabs / pages missing** that prevent operations from configuring per-client payroll structures, slabs, payslip templates, and reviewing config history through the application — they currently require a developer with API access.

---

## 7. Artifacts

Static-analysis raw outputs (in repo root, not committed):
- `backend-routes.json` — every `@Verb(@Path)` discovered with file:line + roles
- `frontend-urls.json` — every distinct `/api/...` URL extracted with evidence
- `audit-result.json` — matched / unmatched / orphans-by-module

Re-run with `node tmp-audit-routes.js` from the repo root.

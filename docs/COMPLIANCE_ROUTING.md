# Compliance Routing Guide

StatComPy uses **two backend modules** that both expose paths under `/api/v1/compliance`. This document clarifies the split so new routes do not collide.

## Backend modules

| Module | Path prefix | Purpose |
|--------|-------------|---------|
| `backend/src/compliance/` | `/api/v1/compliance/*` | Task workflow — evidence, MCD, reupload, dashboards |
| `backend/src/compliances/` | `/api/v1/compliance/*` **and** `/api/v1/admin/compliances` | Masters, metrics, applicability, completion/risk |

### Task workflow (`compliance/`)
- `GET /compliance/tasks` — portal task lists
- `GET /compliance/master` — shared master lookup
- Role controllers: CRM, client, contractor, auditor, branch reupload

### Masters & metrics (`compliances/`)
- `GET /api/v1/admin/compliances` — admin CRUD for compliance codes
- `GET /api/v1/compliance/completion` — branch completion %
- `GET /api/v1/compliance/risk-score` — risk scoring

**Naming rule:** New **workflow** endpoints → `compliance/` module. New **master/metric** endpoints → `compliances/` module. Avoid adding a third module at the same prefix.

## Frontend routes

| Portal | Path pattern | Component domain |
|--------|--------------|------------------|
| Client | `/client/compliance/*` | Returns, MCD, library, status |
| Branch | `/branch/compliance/monthly` (specific paths **before** bare `compliance`) | Monthly uploads |
| Branch | `/branch/compliance` | Branch compliance overview |
| CRM | `/crm/compliance-tracker`, `/crm/compliance/tasks` | Tracker + tasks |
| CRM | `/crm/clients/:id/clra` | CLRA contractor registers |
| Contractor | `/contractor/tasks` | Compliance tasks (legacy `/contractor/compliance` redirects) |
| Admin | `/admin/clients/:id/compliances` | Compliance master tab |

### Route ordering (branch)
Always register **specific** paths (`compliance/monthly`, `compliance/quarterly`) **before** the catch-all `compliance` route in `branch.routes.ts`.

## Frontend services

| Service | API surface |
|---------|-------------|
| `core/compliance.service.ts` | Task APIs per role |
| `core/client-branches.service.ts` | Metrics (`/compliance/completion`, risk) |
| `pages/admin/clients/admin-clients.service.ts` | Admin masters |
| `core/admin-masters.service.ts` | Global compliance CRUD |

## CLRA (contract labour)
CLRA is **not** under `/compliance` — it uses `/api/v1/clra` with:
- CRM: `/crm/clients/:clientId/clra`
- Contractor: `/contractor/clra`

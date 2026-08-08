# StatComPy

Full-stack compliance and HR operations platform built with **NestJS** (backend) and **Angular 21** (frontend).

## Repository Structure

```
backend/   – NestJS API server (TypeScript), 60+ domain modules
frontend/  – Angular SPA (TypeScript, Tailwind CSS), 14 role portals
docs/      – Architecture docs, audits, deployment runbooks
```

## Portals

| Portal | Path | Roles |
|--------|------|-------|
| Admin | `/admin` | ADMIN |
| CEO | `/ceo` | CEO |
| CCO | `/cco` | CCO |
| CRM | `/crm` | CRM, ADMIN |
| Auditor | `/auditor` | AUDITOR |
| Client (LegitX) | `/client` | CLIENT |
| Branch (BranchDesk) | `/branch` | CLIENT (branch user) |
| Contractor (ConTrack) | `/contractor` | CONTRACTOR |
| Payroll (PayDek) | `/payroll` | PAYROLL, CCO |
| PF Team | `/pf-team` | PF_TEAM |
| ESS | `/ess` | EMPLOYEE |
| Accounts & Billing | `/accounts` | ACCOUNTS, ADMIN |
| Sales | `/sales` | SALES, ADMIN |

## Quick Start

### Backend
```bash
cd backend
npm install
cp .env.example .env   # configure DB, JWT secret, etc.
npm run start:dev       # http://localhost:3000
```

### Frontend
```bash
cd frontend
npm install
ng serve                # http://localhost:4200
```

## Key Backend Modules

| Domain | Modules |
|--------|---------|
| **Compliance** | compliance, compliances, branch-compliance, returns, audits, legitx |
| **HR / Payroll** | employees, payroll, ess, attendance, facedesk, mobile-attendance, performance-appraisal |
| **Governance** | admin, ceo, cco, crm, auditor, assignments, ai |
| **Billing / Sales** | accounts-billing, sales |
| **Contractor** | contractor (incl. CLRA) |

## Scripts

- `npm run start:dev` – Backend dev server with hot reload
- `npm run start:prod` – Production backend
- `npm run test` – Unit tests (backend: Jest, frontend: Vitest)
- `npm run test:e2e` – End-to-end tests
- `npm run db:migrate:sql` – Apply SQL migrations

## Architecture

See [docs/STATCOMPY_ARCHITECTURE.md](docs/STATCOMPY_ARCHITECTURE.md) for detailed architecture documentation.

## Production Deployment

Use the production runbook in [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md).

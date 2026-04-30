# StatComPy

Full-stack compliance management platform built with **NestJS** (backend) and **Angular 21** (frontend).

## Repository Structure

```
backend/   – NestJS API server (TypeScript)
frontend/  – Angular SPA (TypeScript, Tailwind CSS)
docs/      – Architecture docs & migration reports
```

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

## Key Modules

| Module | Description |
|--------|-------------|
| **Auth** | JWT authentication, role-based guards (ADMIN, CRM, CLIENT, AUDITOR, PAYROLL) |
| **Clients / Branches** | Client onboarding, branch management, state-level grouping |
| **Assignments** | CRM-to-client assignment workflow |
| **Compliance** | Monthly Compliance Documents (MCD), return filings, proof uploads |
| **Returns** | GST / TDS / PF / ESI return tracking with status workflow |
| **Payroll (PayDek)** | Payroll runs, PF/ESI compliance, salary structures, F&F |
| **Admin** | User management, master data imports, dashboard analytics |
| **Audits** | Audit trail logging |

## Scripts

- `npm run start:dev` – Backend dev server with hot reload
- `npm run start:prod` – Production backend
- `npm run test` – Unit tests (backend: Jest, frontend: Vitest)
- `npm run test:e2e` – End-to-end tests
- `npx ng lint` / `npx eslint src/` – Lint checks

## Architecture

See [docs/STATCOMPY_ARCHITECTURE.md](docs/STATCOMPY_ARCHITECTURE.md) for detailed architecture documentation.

## Production Deployment

Use the production runbook in [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md).

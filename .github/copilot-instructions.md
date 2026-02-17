# Copilot Instructions for statco-app

## Overview
This monorepo contains two main projects:
- **statco-backend**: A NestJS (TypeScript) API server for business logic, data access, and authentication.
- **statco-frontend**: An Angular (TypeScript) SPA for client-side UI, communicating with the backend via REST APIs.

## Architecture & Patterns
- **Backend**
  - Organized by domain modules (e.g., `assignments`, `audits`, `branches`, `clients`, etc.) under `src/`.
  - Each module typically has a controller, service, DTOs, and entities.
  - Uses NestJS dependency injection, guards (e.g., `jwt-auth.guard.ts`, `roles.guard.ts`), and DTO validation.
  - Data migrations and SQL scripts are in `migrations/` and root SQL files.
  - Main entry: `src/main.ts`.
- **Frontend**
  - Standard Angular CLI structure in `src/app/`.
  - Environment-specific API base URLs set in `src/environments/`.
  - E2E and Puppeteer tests in `puppeteer-tests/`.

## Developer Workflows
- **Backend**
  - Install: `npm install` in `statco-backend/`.
  - Run (dev): `npm run start:dev`
  - Run (prod): `npm run start:prod`
  - Test: `npm run test` (unit), `npm run test:e2e` (e2e), `npm run test:cov` (coverage)
  - Migrations: Place SQL in `migrations/` and run manually as needed.
- **Frontend**
  - Install: `npm install` in `statco-frontend/`.
  - Dev server: `ng serve` (default port 4200)
  - Build: `ng build`
  - Test: `ng test` (unit), `ng e2e` (e2e)
  - Puppeteer tests: see `puppeteer-tests/`

## Conventions & Integration
- **API contracts**: Defined by backend controllers and DTOs. Frontend consumes these via REST.
- **Auth**: JWT-based, with guards and strategies in `auth/`.
- **CORS**: Ensure backend allows frontend origin in production.
- **Custom scripts**: See `.ps1` files in backend for admin/dev tasks.
- **Naming**: Use kebab-case for files, camelCase for variables, PascalCase for classes.

## Key Files & Directories
- `statco-backend/src/` — All backend source code
- `statco-frontend/src/app/` — Main Angular app code
- `statco-frontend/puppeteer-tests/` — Custom E2E browser tests
- `statco-backend/migrations/` — SQL migration scripts

## Examples
- Add a new backend feature: create a module in `src/`, add controller/service/DTO/entity as needed.
- Add a new frontend page: generate a component in `src/app/`, update routing if necessary.

## Do Not
- Do not edit files in `node_modules/` or generated `dist/` folders.
- Do not hardcode API URLs; use environment files.

---
For more, see each project's `README.md`.

# Database migrations

SQL migrations live in `backend/migrations/`. Apply them in filename order.

## Fresh install

```bash
cd backend
npm run db:migrate:bootstrap   # marks legacy schema as applied when upgrading an existing DB
npm run db:migrate:sql         # applies pending *.sql files
```

Or on Windows:

```powershell
npm run db:migrate:bootstrap:ps1
npm run db:migrate:sql:ps1
```

Minimum role seed for new environments is in `statco_seed_min.sql` (includes `SALES`, `ACCOUNTS`).

## Role-related migrations (run if portal users cannot be created)

| File | Purpose |
|------|---------|
| `20260507_sales_leads.sql` | `SALES` role + lead tables |
| `20260808_accounts_role.sql` | `ACCOUNTS` role for billing module |
| `20260808_clra_contractor_user_link.sql` | CLRA contractor portal user link |

## After pulling schema changes

1. Run pending migrations against your dev/staging DB.
2. `npx tsc --noEmit` and `npm test` in `backend/`.
3. `npm run deep-module-check` to verify Nest module wiring.

# Production Deployment (Docker Compose)

This repository includes a production-focused `docker-compose.yml` at the repo root.

## Prerequisites

- Docker Engine + Docker Compose plugin installed on the target host.
- DNS/ingress ready for frontend and backend exposure.

## 1. Prepare Environment File

From the repository root:

```bash
cp .env.production.example .env.production
```

Set required values in `.env.production`:

- `DB_PASS`
- `JWT_SECRET`

Optional values:

- `EMAIL_ENABLED`
- `FRONTEND_URL`
- `CORS_ORIGINS`

## 2. Validate Compose Configuration

```bash
docker compose --env-file .env.production config
```

## 3. Build and Start

```bash
docker compose --env-file .env.production up --build -d
```

## 4. Verify Services

```bash
docker compose ps
docker compose logs migrate --tail=200
docker compose logs backend --tail=200
docker compose logs frontend --tail=200
```

## Operational Notes

- The backend image starts with `node dist/src/main.js`.
- A one-time `migrate` service runs before backend startup.
- DB credentials are required; there is no insecure fallback password.
- Postgres is not published to the host by default in production compose.
- `SKIP_BOOTSTRAP_SEED=true` is set for backend service startup.

## Rollback

- Deploy a previous tagged image set and rerun compose up.
- Restore DB from backup if schema/data rollback is needed.

# ── Stage 1: Build ────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ── Stage 2: Production ──────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Trusted CA bundle for outbound TLS (Azure Postgres / Redis / external APIs).
# `ca-certificates` ships DigiCert Global Root CA, DigiCert Global Root G2,
# Microsoft RSA Root Certificate Authority 2017 — i.e. every CA Azure rotates
# its managed-PG server certs to. Set DB_SSL_CA_PATH=/etc/ssl/certs/ca-certificates.crt
# in the Container App env to enforce strict TLS verification end-to-end.
RUN apk add --no-cache ca-certificates && update-ca-certificates

# Default DB_SSL_CA_PATH so strict TLS is on by default; override with empty
# string only if explicitly debugging.
ENV DB_SSL_CA_PATH=/etc/ssl/certs/ca-certificates.crt

# Create non-root user
RUN addgroup -S statco && adduser -S statco -G statco

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/assets ./assets

# Ensure uploads directory exists
RUN mkdir -p uploads/news uploads/logos uploads/temp && chown -R statco:statco /app

USER statco

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1
CMD ["node", "dist/src/main.js"]

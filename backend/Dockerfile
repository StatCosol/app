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

# Create non-root user
RUN addgroup -S statco && adduser -S statco -G statco

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts

# Ensure uploads directory exists
RUN mkdir -p uploads/news uploads/logos uploads/temp && chown -R statco:statco /app

USER statco

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1
CMD ["sh", "-c", "node scripts/apply-migrations.mjs || true && node dist/src/main.js"]

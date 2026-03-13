# ── Stage 1: Build ────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ── Stage 2: Production ──────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -S statco && adduser -S statco -G statco

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Ensure uploads directory exists
RUN mkdir -p uploads && chown -R statco:statco /app

USER statco

EXPOSE 3000
CMD ["node", "dist/main"]

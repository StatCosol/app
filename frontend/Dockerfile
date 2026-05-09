# ── Stage 1: Build ────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx ng build --configuration=production --base-href /app/ --deploy-url /app/

# ── Stage 2: Serve with Nginx ────────────────
FROM nginx:1.27-alpine
COPY --from=builder /app/dist/statco-frontend/browser /usr/share/nginx/html/app
COPY nginx.conf /etc/nginx/templates/default.conf.template

ENV BACKEND_URL=http://backend:3000

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]

# ── Stage 1: Build ────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx ng build --configuration=production --base-href /app/ --deploy-url /app/

# ── Stage 2: Serve with Nginx ────────────────
FROM nginxinc/nginx-unprivileged:stable-alpine
USER root
RUN apk upgrade --no-cache
COPY --from=builder --chown=101:101 /app/dist/statco-frontend/browser /usr/share/nginx/html/app
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Pre-compress immutable Angular assets so Nginx can serve gzip_static files
# instead of spending CPU compressing large JS/CSS chunks on each cold request.
RUN find /usr/share/nginx/html/app -type f \
      \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.svg' \) \
      -exec gzip -9 -k {} \;

ENV BACKEND_URL=http://backend:3000

USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]

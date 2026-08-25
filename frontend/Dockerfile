# ─── Build stage ───
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Ensure public/ exists even when .dockerignore excludes all its contents
RUN mkdir -p public

# Build Next.js
RUN npm run build

# ─── Production stage ───
FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOME=/home/nextjs

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --create-home nextjs

# Install only what's needed for the frontend (no Chromium).
# curl is required for the docker-compose/E2E healthcheck (exec-based CMD curl
# against /api/health) — Kubernetes probes use httpGet and don't need it, but
# local `docker compose up` and the E2E workflow rely on this binary being present.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy standalone output (includes node_modules needed at runtime).
COPY --chown=nextjs:nodejs --from=builder /app/.next/standalone ./
COPY --chown=nextjs:nodejs --from=builder /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs --from=builder /app/public ./public

# Copy entrypoint
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./

# Default environment
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]

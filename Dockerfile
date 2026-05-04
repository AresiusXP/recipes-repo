# ─── Build stage ───
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci

# Copy source
COPY . .

# Ensure public/ exists even when .dockerignore excludes all its contents
RUN mkdir -p public

# Generate Prisma client and build Next.js
RUN npx prisma generate && npm run build

# ─── Migrator stage ───
# Lightweight image with full Prisma CLI for running db push / migrate.
# Used as a Kubernetes initContainer before the app starts.
FROM node:20-bookworm-slim AS migrator

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user (same UID/GID as the runner for shared volume permissions)
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Install only production dependencies (includes Prisma CLI + full dep tree)
COPY package.json package-lock.json ./
COPY prisma ./prisma/
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
RUN npm ci --omit=dev

# Create data directory with correct permissions
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data /app/prisma

ENV DATABASE_URL="file:/app/data/recipes.db"

USER nextjs

CMD npx prisma db push --schema prisma/schema.prisma --url "$DATABASE_URL" --accept-data-loss

# ─── Production stage ───
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Install curl (needed by the scraper's primary fetch strategy) and
# Chromium with its runtime dependencies (needed by the Playwright browser
# fallback for login-walled sites).
# Chromium is installed from Debian's official repos — this is the supported
# Playwright path for Debian/Ubuntu images.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Tell Playwright where to find the system Chromium binary.
# This avoids any attempt to download a managed browser at runtime.
ENV PLAYWRIGHT_EXECUTABLE_PATH="/usr/bin/chromium"

# Copy standalone output (includes node_modules needed at runtime).
# --chown ensures the non-root user owns every file from the start, which is
# more efficient than a separate chown pass and is required for Next.js to
# write prerender cache files at runtime (e.g. .next/server/app/*.body).
COPY --chown=nextjs:nodejs --from=builder /app/.next/standalone ./
COPY --chown=nextjs:nodejs --from=builder /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs --from=builder /app/public ./public

# Copy generated Prisma client (needed at runtime by the app)
COPY --chown=nextjs:nodejs --from=builder /app/src/generated ./src/generated

# Copy entrypoint
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./

# Create data and media directories with correct ownership
RUN mkdir -p /app/media /app/data && \
    chown -R nextjs:nodejs /app/media /app/data

# Default environment
ENV DATABASE_URL="file:/app/data/recipes.db"
ENV MEDIA_DIR="media"
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]

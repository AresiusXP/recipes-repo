# ─── Build stage ───
FROM node:20-alpine AS builder

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
FROM node:20-alpine AS migrator

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user (same UID/GID as the runner for shared volume permissions)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Install only production dependencies (includes Prisma CLI + full dep tree)
COPY package.json package-lock.json ./
COPY prisma ./prisma/
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
RUN npm ci --omit=dev

# Create data directory with correct permissions
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data /app/prisma

ENV DATABASE_URL="file:/app/data/recipes.db"

USER nextjs

CMD npx prisma db push --schema prisma/schema.prisma --url "$DATABASE_URL"

# ─── Production stage ───
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

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

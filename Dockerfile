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

# Generate Prisma client and build Next.js
RUN npx prisma generate && npm run build

# ─── Production stage ───
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (includes node_modules needed at runtime)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema and config (needed for db push at startup)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/generated ./src/generated

# Copy Prisma CLI and dependencies for db push
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/dotenv ./node_modules/dotenv

# Copy entrypoint
COPY docker-entrypoint.sh ./

# Create data and media directories with correct permissions
RUN mkdir -p /app/public/media /app/data && \
    chown -R nextjs:nodejs /app/public/media /app/data /app/prisma

# Default environment
ENV DATABASE_URL="file:/app/data/recipes.db"
ENV MEDIA_DIR="public/media"
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]

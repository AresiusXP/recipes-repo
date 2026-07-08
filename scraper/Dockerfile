# ─── Build stage ───
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ─── Production stage ───
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# renovate: datasource=github-releases depName=yt-dlp/yt-dlp
ARG YT_DLP_VERSION="2026.07.04"

ENV NODE_ENV=production
ENV HOME=/home/scraper

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --create-home scraper

# Install curl (primary fetch strategy), Chromium (Playwright browser fallback),
# ffmpeg (needed by yt-dlp to mux DASH video+audio streams into a single mp4),
# and yt-dlp standalone binary (Instagram reel extraction — no Python required)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
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
    && rm -rf /var/lib/apt/lists/* \
    && ARCH="$(dpkg --print-architecture)" \
    && if [ "$ARCH" = "amd64" ]; then YT_DLP_BIN="yt-dlp_linux"; \
       elif [ "$ARCH" = "arm64" ]; then YT_DLP_BIN="yt-dlp_linux_aarch64"; \
       else YT_DLP_BIN="yt-dlp_linux"; fi \
    && curl -L "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/${YT_DLP_BIN}" \
       -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

# Tell Playwright where to find the system Chromium binary.
ENV PLAYWRIGHT_EXECUTABLE_PATH="/usr/bin/chromium"

# Install only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=builder /app/dist ./dist

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"
ENV LOG_LEVEL="info"
ENV APP_NAME="recipes-scraper"

USER scraper

EXPOSE 3001

CMD ["node", "dist/server.js"]

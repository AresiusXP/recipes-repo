# ─── Build stage ───
FROM golang:1.26-bookworm AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server ./cmd/server

# ─── Production stage ───
FROM debian:bookworm-slim AS runner

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

# Install curl (used by the scraper service, not the backend itself, but
# keeping ca-certificates for HTTPS calls to Gemini API)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system --gid 1001 appgroup && \
    useradd --system --uid 1001 --gid appgroup --create-home appuser

# Copy binary
COPY --from=builder /app/server /app/server

ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
ENV LOG_LEVEL="info"
ENV MEDIA_DIR="/media"

USER appuser

EXPOSE 8080

CMD ["/app/server"]

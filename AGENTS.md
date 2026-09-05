<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md — recipes-repo

## Deployment Target

This application runs in a **microk8s homelab** Kubernetes cluster. Always consider this when making decisions about:

- **Configuration & secrets** — use Kubernetes-native patterns (e.g. `Secret`, `ConfigMap`) rather than assuming a managed cloud provider.
- **Storage** — PostgreSQL data and media files rely on persistent volumes; avoid assumptions about ephemeral or cloud-managed storage.
- **Networking** — ingress, service discovery, and TLS are handled by the cluster (e.g. via an ingress controller); do not assume a cloud load balancer.
- **Images** — container images must be compatible with the cluster's architecture and pull policy; prefer explicit image tags over `latest`.
- **Resource constraints** — a homelab has limited CPU/memory; avoid changes that significantly increase resource usage.
- **Standalone build** — the `output: "standalone"` Next.js build is intentional and required for the Docker/Kubernetes deployment; do not remove it.

## Monorepo Structure

The repository is split into three independent services plus an E2E test suite:

```
recipes-repo/
├── frontend/     # Next.js app (UI + NextAuth only, ~256Mi)
├── backend/      # Go REST API (business logic, DB, Gemini AI, ~256Mi)
├── scraper/      # Node.js scraper microservice (Playwright + Cheerio, ~512Mi)
├── e2e/          # Playwright end-to-end tests (manually triggered in CI)
├── helm/
│   └── recipes/            # Unified Helm chart (deploys all three services)
├── docker-compose.yml      # Spins up all services for E2E / local dev
└── .github/workflows/      # Path-based CI + tag-based release + E2E workflows
```

**PostgreSQL** is deployed separately using the [CloudPirates Helm chart](https://github.com/CloudPirates-io/helm-charts/tree/main/charts/postgres). Do NOT use Bitnami charts.

## Commands

### Frontend (`frontend/`)

```bash
npm run dev          # Start Next.js dev server (http://localhost:3000)
npm run build        # Production build (standalone output)
npm run start        # Serve production build
npm run lint         # ESLint (core-web-vitals + typescript presets)
npm run test         # Run unit tests once (Vitest)
npm run test:watch   # Run tests in watch mode
npm run test:ci      # Run tests with verbose reporter (CI)
```

### Backend (`backend/`)

```bash
go build ./...       # Build all packages
go test ./...        # Run all tests
go vet ./...         # Static analysis
```

The backend uses **`pgx/v5`** directly via `sqlc`-generated queries. The database schema is defined in `backend/db/schema.sql` and applied by a `psql` initContainer on pod start (idempotent — safe to re-run).

```bash
# No Prisma migration commands needed at runtime.
# To apply the schema manually (e.g. first-time local setup):
psql $DATABASE_URL -f backend/db/schema.sql
```

### Scraper (`scraper/`)

```bash
npm run build        # TypeScript compile
npm run dev          # Run with ts-node-dev (hot reload)
npm run test         # Run unit tests (Vitest)
npm run lint         # ESLint
```

### E2E Tests (`e2e/`)

```bash
# Triggered manually via GitHub Actions (workflow_dispatch)
# Or locally:
docker compose up -d
npx playwright test
docker compose down
```

### Validating changes

| Service | Commands |
|---|---|
| Frontend | `npm run lint && npm run test && npm run build` (run inside `frontend/`) |
| Backend | `go vet ./... && go test ./... && go build ./...` (run inside `backend/`) |
| Scraper | `npm run lint && npm run test && npm run build` (run inside `scraper/`) |

The CI pipeline runs these automatically on path-filtered pushes/PRs.

## Releases & Versioning

Each service is versioned independently. Pushing a tag triggers the corresponding GitHub Actions release workflow, which builds the Docker image, updates the unified Helm chart, and pushes the chart to GHCR.

### Tag scheme

| Tag format | Example | What it does |
|---|---|---|
| `frontend-v<semver>` | `frontend-v1.3.0` | Builds & pushes the frontend image; updates `helm/recipes/values.yaml` `frontend.image.tag`; patch-bumps `helm/recipes/Chart.yaml`; releases the chart |
| `backend-v<semver>` | `backend-v2.1.0` | Same for the backend image |
| `scraper-v<semver>` | `scraper-v1.0.5` | Same for the scraper image |
| `helm-v<semver>` | `helm-v0.5.0` | Chart-only release — no image build; sets `Chart.yaml` version exactly to the tag version; use when only Helm templates or values change |

### Rules for @committer

- **Only tag the service(s) whose code actually changed.** If only the frontend changed, push `frontend-v*` only.
- **Use semantic versioning** (`MAJOR.MINOR.PATCH`). Increment PATCH for bug fixes, MINOR for new features, MAJOR for breaking changes.
- **Never use `latest` as an image tag** — always use the explicit version from the tag.
- **Service tags are independent** — `frontend-v1.3.0` and `backend-v2.1.0` can coexist; they do not need to match.
- **The Helm chart version is managed automatically** by the service release workflows (patch-bumped on every service release). Each service release also auto-creates a `helm-v<new_chart_version>` git tag so every chart artifact in GHCR is traceable to an exact commit. Only push a `helm-v*` tag manually when you need to release a chart change that has no associated service image change — and make sure the version is higher than the current `Chart.yaml` version to avoid conflicts.
- **Do not push multiple service tags simultaneously** unless you intend them to queue — the release workflows share a `concurrency: group: helm-release` lock and will run sequentially.

### Workflow files

| Workflow | File | Trigger |
|---|---|---|
| Release — Frontend | `.github/workflows/release-frontend.yml` | `frontend-v*` |
| Release — Backend | `.github/workflows/release-backend.yml` | `backend-v*` |
| Release — Scraper | `.github/workflows/release-scraper.yml` | `scraper-v*` |
| Release — Helm chart | `.github/workflows/release-helm.yml` | `helm-v*` |

### Helm chart

The unified chart lives at `helm/recipes/`. It deploys all three services (frontend, backend, scraper) in a single `helm install`/`helm upgrade`. Image tags for each service are stored in `helm/recipes/values.yaml` under `frontend.image.tag`, `backend.image.tag`, and `scraper.image.tag` — these are updated automatically by the release workflows.

## Tech Stack

### Frontend
- **Next.js 16** (App Router) with **React 19** and **TypeScript** (strict mode)
- **Tailwind CSS 4** for styling
- **NextAuth.js v5** (Google OAuth and Microsoft Entra ID — both optional, enabled via env vars)
- No database access — all data fetched from the Go backend via `fetch()`

### Backend
- **Go** REST API with `net/http` (standard library)
- **PostgreSQL** via `pgx/v5`
- **Prisma** for schema management and migrations only (not used at runtime)
- **Google Gemini** for AI recipe extraction and translation
- Owns media file storage (PVC mounted at `MEDIA_DIR`)

### Scraper
- **Node.js / TypeScript** microservice
- **Playwright** (Chromium) for JavaScript-rendered pages
- **Cheerio** for HTML parsing
- Async job queue (in-memory); jobs tracked in PostgreSQL by the backend

## Project Layout

### Frontend (`frontend/src/`)

```
src/
├── app/
│   ├── actions/recipes.ts        # Server actions — thin proxies to Go backend
│   ├── actions/user.ts           # Server actions — thin proxies to Go backend
│   ├── actions/notifications.ts  # Server actions — thin proxies to Go backend
│   ├── actions/admin.ts          # Server actions — thin proxies to Go backend
│   ├── actions/auth.ts           # Server action (sign-out)
│   ├── api/auth/                 # NextAuth route handler
│   ├── api/import-status/[jobId] # Proxy: polls backend for import job status
│   ├── login/                    # Login page
│   ├── recipes/                  # Recipe pages (list, detail, edit, new, favorites)
│   ├── recipes/import/[jobId]/   # Async import status polling page
│   ├── notifications/            # Notifications page
│   ├── settings/                 # User settings page
│   ├── admin/                    # Admin user management page
│   ├── globals.css               # Tailwind styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Root redirect
├── components/                   # React components (mix of server and client)
│   └── ImportStatusPoller.tsx    # Polls /api/import-status/{jobId} for async imports
└── lib/
    ├── api-client.ts             # Typed fetch() wrappers for all backend endpoints
    ├── admin.ts                  # Admin auth guard (isAdminEmail helper)
    ├── auth.ts                   # NextAuth configuration (JWT strategy, no DB adapter)
    ├── gemini.ts                 # Re-exports TargetLanguage type only (Gemini lives in backend)
    ├── image-constants.ts        # Shared image MIME type / size constraints
    ├── require-auth.ts           # Auth guard helper
    └── theme.ts                  # Theme helpers (client-side)
```

### Backend (`backend/`)

```
backend/
├── cmd/server/main.go            # Entry point, router setup
├── internal/
│   ├── db/                       # pgx connection pool
│   ├── gemini/                   # Gemini AI client
│   ├── handlers/                 # HTTP handlers (recipes, users, notifications, admin, media, auth)
│   ├── middleware/               # JWT auth middleware
│   ├── models/                   # Shared types
│   └── scraper/                  # Scraper service client (calls scraper pod)
├── prisma/schema.prisma          # Database schema (source of truth)
├── scripts/migrate-sqlite-to-postgres/  # One-time SQLite → PostgreSQL migration
├── Dockerfile
└── go.mod / go.sum
```

### Scraper (`scraper/src/`)

```
src/
├── server.ts     # HTTP server + job queue worker
├── scraper.ts    # Playwright + Cheerio scraping logic
└── queue.ts      # In-memory FIFO job queue
```

## Code Style

### Formatting

- **Double quotes** for strings; **semicolons** required.
- No Prettier or Biome config exists — preserve existing formatting conventions.
- Use 2-space indentation (matches all existing files).

### Imports

- Order: framework/external packages first, then `@/...` internal imports.
- Always use the `@/` path alias (mapped to `src/`). Never use relative paths like `../../lib/`.

```ts
import { backendFetch } from "@/lib/api-client";
import { requireAuth } from "@/lib/require-auth";
```

### TypeScript

- `strict: true` is enabled — do not weaken it.
- Define explicit `interface` or `type` for component props and server action return values.
- Prefer `interface` for object shapes; use `type` for unions and utility types.
- Use `unknown` over `any`; narrow with `instanceof` checks.

### Naming

| Kind | Convention | Example |
|---|---|---|
| React components | PascalCase | `RecipeEditForm` |
| Functions / actions | camelCase | `importRecipeFromUrl` |
| Utility files | kebab-case | `require-auth.ts` |
| Component files | PascalCase | `RecipeList.tsx` |
| Interfaces/types | PascalCase | `RecipeFormData` |

## Next.js / React Patterns

### Server vs Client Components

- **Server Components are the default.** Pages and layouts are typically `async` server components.
- Add `"use client"` only when the component needs browser APIs, hooks, or event handlers.
- Add `"use server"` at the top of server action files (see `src/app/actions/recipes.ts`).

### Server Actions

- Server actions in `src/app/actions/` are **thin proxies** — they call `backendFetch()` from `@/lib/api-client` and return the result.
- They do **not** access the database, Gemini, or the filesystem directly.
- Client components call server actions directly — do not create extra API routes unless truly necessary.
- Inline `"use server"` in form actions is acceptable for simple cases (e.g., sign-out buttons).

### API Client

- `src/lib/api-client.ts` contains all typed `fetch()` wrappers for the Go backend.
- `backendFetch<T>(path, options?)` handles auth token injection and JSON parsing.
- All backend types (Recipe, UserSettings, AdminUser, etc.) are defined here.

### Authentication

- Use `requireAuth()` from `@/lib/require-auth` for server-side auth gating.
- It redirects to `/login` if unauthenticated and returns a session with a guaranteed `user.id`.
- The session JWT is forwarded to the Go backend as `Authorization: Bearer <token>` on every API call.
- The Go backend validates the JWT using the shared `AUTH_SECRET`.

## Async Recipe Import

Recipe imports from URLs are **asynchronous**:

1. Frontend calls `POST /api/recipes/import` → backend returns `{ jobId, status: "pending" }` (HTTP 202).
2. Frontend redirects to `/recipes/import/{jobId}`.
3. `ImportStatusPoller` component polls `/api/import-status/{jobId}` every 2.5 seconds.
4. Backend scrapes (via scraper pod), calls Gemini, creates the recipe, updates job status.
5. On `done`, frontend redirects to the new recipe page. On `failed`, shows error + retry.

Job status values: `pending` → `scraping` → `extracting` → `done` | `failed`.

## Translation System

Recipes support on-demand translation into **English**, **Dutch**, or **Spanish**.

### User preference (`autoTranslateLanguage`)

- Stored on the `User` model as a nullable string (`"en"` | `"nl"` | `"es"` | `null`).
- `null` means automatic translation is **off** — this is the default for all new users.
- Controlled in Settings via a 4-option picker (Off / English / Dutch / Spanish).
- When set, newly imported recipes are automatically extracted directly into that language by Gemini at import time.

### Per-recipe translation rules

**URL-imported recipes** (`sourceUrl` is set):
- The translate button is always visible.
- Every translation re-scrapes the original `sourceUrl` and re-extracts with Gemini.

**Manual-import recipes** (`sourceUrl` is null):
- One translation is permitted, using the stored `rawContent` as source.
- After one translation, only **Show original** remains available.
- `hasBeenTranslated = true` is set after the first translation and is never reset.

### Recipe model fields involved

| Field | Purpose |
|---|---|
| `sourceLanguage` | Detected ISO 639-1 language of the original content |
| `translatedLanguage` | Current display language, or `null` = showing original |
| `hasBeenTranslated` | `true` once any translation has been applied |
| `isTranslatedToEnglish` | Legacy boolean; `true` when `translatedLanguage === "en"` or source is English |
| `rawContent` | Original scraped/entered content (up to 50 000 chars) |

## Database

- **PostgreSQL** — deployed via the [CloudPirates Helm chart](https://github.com/CloudPirates-io/helm-charts/tree/main/charts/postgres).
- **Schema** is defined in `backend/db/schema.sql` (source of truth). All statements use `IF NOT EXISTS` and are idempotent.
- **Migrations** are applied by a Kubernetes initContainer running `psql "$DATABASE_URL" -f /schema/schema.sql` using the `postgres:17-alpine` image. The SQL is embedded in `helm/recipes/templates/backend-schema-configmap.yaml` — **keep this in sync with `backend/db/schema.sql`** when the schema changes.
- **Runtime access** is via `pgx/v5` in Go — Prisma is not used at runtime.
- `ingredients` and `steps` are stored as JSON strings (`JSON.stringify`/`JSON.parse`), not normalized tables.

### SQLite → PostgreSQL migration

A one-time migration script lives at `backend/scripts/migrate-sqlite-to-postgres/`. See `README.md` for the safe cutover procedure.

## Error Handling

- **Server actions** return `{ success: boolean; error?: string }` — do not throw errors to the client.
- **Auth failures** redirect via `requireAuth()` (which calls `redirect("/login")`).
- **Ownership failures** return a generic `"Recipe not found"` message — do not reveal authorization details.
- **Backend errors** are logged server-side; the frontend receives a generic error message.
- Pattern for error narrowing: `error instanceof Error ? error.message : "Fallback message"`.

## Styling

- Uses **Tailwind CSS 4** with a mobile-first approach.
- Dark mode classes are used throughout (e.g., `dark:bg-zinc-900`).
- Custom color tokens like `text-primary` and `bg-primary` are defined in `globals.css`.

## Files You Should Not Edit

- `.env*` (except `.env.example`) — secrets; gitignored
- `*.db`, `*.db-journal` — database files; gitignored
- `public/media/` — user-uploaded images; gitignored
- `frontend/.next/` — Next.js build cache; gitignored
- `backend/internal/db/` — if using sqlc, these are generated; check before editing

## Build Configuration Cautions

- `frontend/next.config.ts` uses `output: "standalone"`. Do not remove it.
- A static **Content-Security-Policy** header is applied to all routes in `next.config.ts`. `unsafe-eval` is only added in development.
- `experimental.serverActions.bodySizeLimit` is set to `"10mb"` to allow recipe image uploads.
- ESLint config (`eslint.config.mjs`) uses the flat config format with `eslint-config-next` core-web-vitals and TypeScript presets.

## Environment Variables

### Frontend (`frontend/.env`)

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Session encryption secret (shared with backend) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `MICROSOFT_ENTRA_ID_CLIENT_ID` | Microsoft Entra ID client ID (leave empty to disable) |
| `MICROSOFT_ENTRA_ID_CLIENT_SECRET` | Microsoft Entra ID client secret |
| `MICROSOFT_ENTRA_ID_ISSUER` | Microsoft issuer URL (default: `common`) |
| `NEXTAUTH_URL` / `AUTH_URL` | App base URL for OAuth callbacks |
| `BACKEND_URL` | Go backend service URL (e.g. `http://recipes-backend:8080`) |
| `BACKEND_INTERNAL_SECRET` | Shared secret protecting the internal auth endpoint (must match backend) |
| `ALLOWED_EMAILS` | Comma-separated allowlist for new registrations (empty = open) |
| `ADMIN_EMAILS` | Comma-separated list of admin emails |

### Backend (`backend/.env`)

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Shared with frontend — used to validate NextAuth JWTs |
| `DATABASE_URL` | PostgreSQL connection string (`postgresql://user:pass@host:5432/db`) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_MODEL` | Gemini model name (default: `gemini-2.0-flash`) |
| `GEMINI_CHAT_MODEL` | Gemini model used for the in-recipe chat assistant (default: `gemini-flash-lite-latest`) — deliberately a cheaper/faster model since chat is called far more often than extraction/translation |
| `MEDIA_DIR` | Image storage directory (default: `public/media`) |
| `SCRAPER_URL` | Scraper service URL (e.g. `http://recipes-scraper:3001`) |
| `BACKEND_INTERNAL_SECRET` | Shared secret protecting the internal auth endpoint (must match frontend) |
| `ADMIN_EMAILS` | Comma-separated list of admin emails |
| `ALLOWED_EMAILS` | Comma-separated allowlist for new registrations |
| `APP_VERSION_BACKEND` | Deployed backend image tag, shown on the Admin page (Helm-injected; defaults to `unknown`) |
| `APP_VERSION_FRONTEND` | Deployed frontend image tag, shown on the Admin page (Helm-injected; defaults to `unknown`) |
| `APP_VERSION_SCRAPER` | Deployed scraper image tag, shown on the Admin page (Helm-injected; defaults to `unknown`) |

### Scraper (`scraper/.env`)

| Variable | Purpose |
|---|---|
| `PORT` | HTTP server port (default: `3001`) |
| `PLAYWRIGHT_EXECUTABLE_PATH` | Path to Chromium binary |

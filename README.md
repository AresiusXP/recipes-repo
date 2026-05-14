# Recipes

A mobile-first web application for saving, organizing, and browsing food recipes from the internet. Powered by Gemini AI for automatic recipe extraction and formatting.

## Features

- **Import recipes from URL** — paste a link and AI extracts ingredients, steps, and tags
- **Manual paste fallback** — paste recipe text directly if URL scraping fails
- **Metric conversion** — imperial measurements are automatically converted to metric
- **Translation** — optionally translate imported recipes to English, Dutch, or Spanish (configurable in settings), with per-recipe translation for already imported content
- **Image capture** — recipe images are downloaded and stored locally
- **Search & filter** — browse recipes by text search and tag filtering
- **Favorites** — star recipes and browse them on a dedicated favorites page
- **Edit recipes** — correct or refine AI-extracted content
- **Notifications** — in-app notification system
- **Admin panel** — user management for admin accounts
- **Google login** — authentication via Google OAuth
- **Microsoft login** — authentication via Microsoft Entra ID (personal, work, and school accounts)
- **Mobile-first UI** — optimized for phones, works on desktop too

## Tech Stack

### Frontend
- **Next.js 16** (App Router, React 19, TypeScript strict mode)
- **Tailwind CSS 4** for styling
- **NextAuth.js v5** with Google OAuth and Microsoft Entra ID providers
- No database access — all data fetched from the Go backend via `fetch()`

### Backend
- **Go** REST API (`net/http` standard library)
- **PostgreSQL** via `pgx/v5` with `sqlc`-generated queries
- **Prisma** for schema management and migrations only (not used at runtime)
- **Google Gemini** (`gemini-2.0-flash`) for AI recipe extraction and translation
- Owns media file storage (PVC mounted at `MEDIA_DIR`)

### Scraper
- **Node.js / TypeScript** microservice
- **Playwright** (Chromium) for JavaScript-rendered pages
- **Cheerio** for HTML parsing
- Async in-memory job queue; job status tracked in PostgreSQL by the backend

### Infrastructure
- **Kubernetes** (microk8s homelab) via Helm
- **PostgreSQL** deployed via the [CloudPirates Helm chart](https://github.com/CloudPirates-io/helm-charts/tree/main/charts/postgres)
- **Docker Compose** for E2E testing

## Repository Structure

```
recipes-repo/
├── frontend/     # Next.js app (UI + NextAuth only)
├── backend/      # Go REST API (business logic, DB, Gemini AI)
├── scraper/      # Node.js scraper microservice (Playwright + Cheerio)
├── e2e/          # Playwright end-to-end tests
├── helm/
│   └── recipes/  # Unified Helm chart (deploys all three services)
├── docker-compose.yml   # Spins up all services for E2E / local dev
└── .github/workflows/   # Path-based CI + tag-based release + E2E workflows
```

## Local Development

Each service is developed independently. You'll need to run them in separate terminals.

### Prerequisites

- Node.js 20+
- Go 1.22+
- A running PostgreSQL instance
- A [Google Cloud OAuth 2.0 Client](https://console.cloud.google.com/apis/credentials) (Web application type)
- A [Gemini API key](https://aistudio.google.com/apikey)
- _(Optional)_ A [Microsoft Entra ID app registration](https://entra.microsoft.com/) for Microsoft OAuth

### Frontend (`frontend/`)

```bash
cd frontend
npm install
cp .env.example .env   # then edit .env
npm run dev            # http://localhost:3000
```

**Frontend environment variables:**

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Random secret for session encryption — shared with backend (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `MICROSOFT_ENTRA_ID_CLIENT_ID` | _(Optional)_ Microsoft Entra app client ID |
| `MICROSOFT_ENTRA_ID_CLIENT_SECRET` | _(Optional)_ Microsoft Entra app client secret |
| `MICROSOFT_ENTRA_ID_ISSUER` | _(Optional)_ Microsoft Entra issuer URL (default: `common`) |
| `NEXTAUTH_URL` / `AUTH_URL` | App base URL for OAuth callbacks (e.g. `http://localhost:3000`) |
| `BACKEND_URL` | Go backend URL (e.g. `http://localhost:8080`) |
| `BACKEND_INTERNAL_SECRET` | Shared secret protecting the internal auth endpoint — must match backend |
| `ALLOWED_EMAILS` | _(Optional)_ Comma-separated email allowlist for new registrations (empty = open) |
| `ADMIN_EMAILS` | _(Optional)_ Comma-separated list of admin email addresses |

### Backend (`backend/`)

```bash
cd backend
cp .env.example .env   # then edit .env
go run ./cmd/server    # http://localhost:8080
```

**Backend environment variables:**

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Shared with frontend — used to validate NextAuth JWTs |
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user:pass@localhost:5432/recipes`) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_MODEL` | Gemini model name (default: `gemini-2.0-flash`) |
| `MEDIA_DIR` | Image storage directory (default: `public/media`) |
| `SCRAPER_URL` | Scraper service URL (e.g. `http://localhost:3001`) |
| `BACKEND_INTERNAL_SECRET` | Shared secret protecting the internal auth endpoint — must match frontend |
| `ALLOWED_EMAILS` | _(Optional)_ Comma-separated email allowlist for new registrations |
| `ADMIN_EMAILS` | _(Optional)_ Comma-separated list of admin email addresses |

**Database migrations:**

```bash
cd backend
npx prisma migrate dev   # create a new migration (requires DATABASE_URL)
```

### Scraper (`scraper/`)

```bash
cd scraper
npm install
cp .env.example .env   # then edit .env
npm run dev            # http://localhost:3001
```

**Scraper environment variables:**

| Variable | Description |
|---|---|
| `PORT` | HTTP server port (default: `3001`) |
| `PLAYWRIGHT_EXECUTABLE_PATH` | Path to Chromium binary |

### Set up Google OAuth

In the Google Cloud Console, add these authorized redirect URIs:
- `http://localhost:3000/api/auth/callback/google`

### (Optional) Set up Microsoft Entra ID OAuth

1. Go to the [Microsoft Entra admin center](https://entra.microsoft.com/) → **Identity → Applications → App Registrations → New registration**.
2. Give the app a name (e.g. "Recipes").
3. Under **Supported account types**, choose **"Accounts in any organizational directory and personal Microsoft accounts"**.
4. Set the **Redirect URI** platform to **Web** and enter:
   - `http://localhost:3000/api/auth/callback/microsoft-entra-id` (development)
   - `https://your-domain.com/api/auth/callback/microsoft-entra-id` (production)
5. From the **Overview** page, copy the **Application (client) ID** → paste into `MICROSOFT_ENTRA_ID_CLIENT_ID`.
6. Go to **Certificates & secrets → New client secret**, copy the value → paste into `MICROSOFT_ENTRA_ID_CLIENT_SECRET`.
7. Set `MICROSOFT_ENTRA_ID_ISSUER` to:
   - `https://login.microsoftonline.com/common/v2.0` — personal + work/school (default, recommended)
   - `https://login.microsoftonline.com/consumers/v2.0` — personal accounts only
   - `https://login.microsoftonline.com/organizations/v2.0` — work/school only
   - `https://login.microsoftonline.com/<Directory (tenant) ID>/v2.0` — single tenant

## Kubernetes Deployment (Helm)

### Container images and Helm chart

Images and the Helm chart are published automatically to GitHub Container Registry (GHCR) via GitHub Actions.

| Artifact | Location |
|---|---|
| Frontend image | `ghcr.io/aresiusxp/recipes-frontend:<version>` |
| Backend image | `ghcr.io/aresiusxp/recipes-backend:<version>` |
| Scraper image | `ghcr.io/aresiusxp/recipes-scraper:<version>` |
| Helm chart (OCI) | `oci://ghcr.io/aresiusxp/charts/recipes` |

### Releasing

Each service is versioned independently. Push a tag to trigger the corresponding release workflow:

| Tag format | Example | What it does |
|---|---|---|
| `frontend-v<semver>` | `frontend-v1.3.0` | Builds & pushes the frontend image; patch-bumps the Helm chart |
| `backend-v<semver>` | `backend-v2.1.0` | Builds & pushes the backend image; patch-bumps the Helm chart |
| `scraper-v<semver>` | `scraper-v1.0.5` | Builds & pushes the scraper image; patch-bumps the Helm chart |
| `helm-v<semver>` | `helm-v0.5.0` | Chart-only release — no image build; sets chart version exactly |

Service tags are independent — `frontend-v1.3.0` and `backend-v2.1.0` can coexist and do not need to match.

### 1. Deploy PostgreSQL

Deploy PostgreSQL using the [CloudPirates Helm chart](https://github.com/CloudPirates-io/helm-charts/tree/main/charts/postgres) before installing the recipes chart.

### 2. Create Kubernetes Secrets

**Frontend secret:**

```bash
kubectl create secret generic recipes-frontend-secrets \
  --from-literal=auth-secret="$(openssl rand -base64 32)" \
  --from-literal=google-client-id="your-google-client-id" \
  --from-literal=google-client-secret="your-google-client-secret"
  # Optional: add Microsoft Entra ID credentials to enable Microsoft login:
  # --from-literal=microsoft-entra-id-client-id="your-entra-client-id" \
  # --from-literal=microsoft-entra-id-client-secret="your-entra-client-secret"
```

> **Note:** `AUTH_SECRET` must be the same value in both the frontend and backend secrets.

**Backend secret:**

```bash
kubectl create secret generic recipes-backend-secrets \
  --from-literal=auth-secret="<same-value-as-frontend-auth-secret>" \
  --from-literal=database-url="postgresql://user:pass@postgres-host:5432/recipes" \
  --from-literal=gemini-api-key="your-gemini-api-key" \
  --from-literal=backend-internal-secret="$(openssl rand -base64 32)"
```

> **`database-url`** — PostgreSQL connection string. The hostname is the Kubernetes service DNS name of your PostgreSQL deployment. Run `kubectl get svc -A | grep postgres` to find the exact service name and namespace (e.g. `my-postgres.default.svc.cluster.local`).
>
> **`backend-internal-secret`** — a random string shared between the frontend and backend to protect the internal auth endpoint. Generate with `openssl rand -base64 32`. The same value must be set as `BACKEND_INTERNAL_SECRET` in the frontend pod (currently requires a manual env override or a custom values patch if not wired via Helm).

### 3. Install with Helm

```bash
helm install recipes oci://ghcr.io/aresiusxp/charts/recipes \
  --version 0.1.2 \
  --set frontend.config.nextauthUrl=https://recipes.yourdomain.com \
  --set frontend.ingress.hosts[0].host=recipes.yourdomain.com \
  --set frontend.ingress.hosts[0].paths[0].path=/ \
  --set frontend.ingress.hosts[0].paths[0].pathType=Prefix
```

### 4. Update OAuth redirect URIs

Add your production domain to the OAuth redirect URIs in each provider's console:
- Google: `https://recipes.yourdomain.com/api/auth/callback/google`
- Microsoft: `https://recipes.yourdomain.com/api/auth/callback/microsoft-entra-id`

### Helm Values

See [`helm/recipes/values.yaml`](helm/recipes/values.yaml) for all configurable options. Key values:

**Frontend:**
| Value | Description |
|---|---|
| `frontend.image.repository` / `frontend.image.tag` | Container image |
| `frontend.config.nextauthUrl` | Public URL for OAuth callbacks |
| `frontend.config.backendUrl` | Internal backend service URL (default: `http://recipes-backend:8080`) |
| `frontend.config.allowedEmails` | Comma-separated email allowlist (empty = open) |
| `frontend.config.adminEmails` | Comma-separated admin email list |
| `frontend.config.microsoftEntraIdIssuer` | Microsoft account scope |
| `frontend.secrets.existingSecret` | Name of the frontend Kubernetes Secret |
| `frontend.ingress.*` | Ingress hostname, TLS, and annotations |
| `frontend.resources` | CPU/memory limits |

**Backend:**
| Value | Description |
|---|---|
| `backend.image.repository` / `backend.image.tag` | Container image |
| `backend.config.scraperUrl` | Internal scraper service URL (default: `http://recipes-scraper:3001`) |
| `backend.config.geminiModel` | Gemini model name (default: `gemini-2.0-flash`) |
| `backend.config.allowedEmails` | Comma-separated email allowlist |
| `backend.config.adminEmails` | Comma-separated admin email list |
| `backend.secrets.existingSecret` | Name of the backend Kubernetes Secret |
| `backend.mediaPvc.size` | Media PVC size (default: `5Gi`) |
| `backend.resources` | CPU/memory limits |

**Scraper:**
| Value | Description |
|---|---|
| `scraper.image.repository` / `scraper.image.tag` | Container image |
| `scraper.resources` | CPU/memory limits (default: `512Mi` — Playwright is memory-hungry) |

## Notes

- **Image persistence**: Recipe images are stored on a PVC mounted in the backend pod. The Helm chart provisions this automatically via `backend.mediaPvc`.
- **Scraping limitations**: Some recipe sites block automated access. Use the manual paste fallback when URL import fails.
- **Async import**: Recipe imports from URLs are asynchronous. The UI polls for job status and redirects to the new recipe once extraction is complete.
- **Migrations**: The database schema is defined in `backend/db/schema.sql`. For Docker Compose / E2E, this file is applied automatically. For Kubernetes, apply it manually against your PostgreSQL instance before the first deploy (e.g. `psql $DATABASE_URL -f backend/db/schema.sql`). The Helm chart includes a migration initContainer placeholder that will be wired up in a future release.

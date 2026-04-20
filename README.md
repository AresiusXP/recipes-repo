# Recipes Repository

A mobile-first web application for saving, organizing, and browsing food recipes from the internet. Powered by Gemini AI for automatic recipe extraction and formatting.

## Features

- **Import recipes from URL** — paste a link and AI extracts ingredients, steps, and tags
- **Manual paste fallback** — paste recipe text directly if URL scraping fails
- **Metric conversion** — imperial measurements are automatically converted to metric
- **English translation** — optionally translate imported recipes to English (configurable in settings), with per-recipe translation for already imported content
- **Image capture** — recipe images are downloaded and stored locally
- **Search & filter** — browse recipes by text search and tag filtering
- **Favorites** — star recipes and browse them on a dedicated favorites page
- **Edit recipes** — correct or refine AI-extracted content
- **Google login** — authentication via Google OAuth
- **Microsoft login** — authentication via Microsoft Entra ID (personal, work, and school accounts)
- **Mobile-first UI** — optimized for phones, works on desktop too

## Tech Stack

- **Frontend/Backend**: Next.js 16 (App Router, React 19, TypeScript)
- **Database**: SQLite via Prisma ORM + libSQL adapter
- **AI**: Google Gemini (gemini-2.0-flash)
- **Styling**: Tailwind CSS 4
- **Auth**: NextAuth.js v5 with Google and Microsoft Entra ID providers
- **Container**: Docker + Docker Compose
- **Deployment**: Kubernetes via Helm chart

## Prerequisites

- Node.js 20+
- A [Google Cloud OAuth 2.0 Client](https://console.cloud.google.com/apis/credentials) (Web application type)
- A [Gemini API key](https://aistudio.google.com/apikey)
- _(Optional)_ A [Microsoft Entra ID app registration](https://entra.microsoft.com/) for Microsoft OAuth

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Random secret for session encryption (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `MICROSOFT_ENTRA_ID_CLIENT_ID` | _(Optional)_ Microsoft Entra app client ID |
| `MICROSOFT_ENTRA_ID_CLIENT_SECRET` | _(Optional)_ Microsoft Entra app client secret |
| `MICROSOFT_ENTRA_ID_ISSUER` | _(Optional)_ Microsoft Entra issuer URL (default: `common`) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_MODEL` | Gemini model name (default: `gemini-2.0-flash`) |
| `DATABASE_URL` | SQLite path (default: `file:./dev.db`) |
| `NEXTAUTH_URL` | App URL (default: `http://localhost:3000`) |
| `AUTH_URL` | Auth.js v5 app URL (same as `NEXTAUTH_URL`) |
| `MEDIA_DIR` | Image storage directory (default: `public/media`) |

### 3. Set up Google OAuth

In the Google Cloud Console, add these authorized redirect URIs:
- `http://localhost:3000/api/auth/callback/google`

### 4. (Optional) Set up Microsoft Entra ID OAuth

1. Go to the [Microsoft Entra admin center](https://entra.microsoft.com/) → **Identity → Applications → App Registrations → New registration**.
2. Give the app a name (e.g. "Recipes Repo").
3. Under **Supported account types**, choose **"Accounts in any organizational directory and personal Microsoft accounts"** — this covers MSN, Outlook, Hotmail, Live, as well as work and school accounts.
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

### 5. Initialize database

```bash
npx prisma db push
```

### 6. Start the dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

## Docker Compose (Local Container)

```bash
# Set required env vars
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"
export GEMINI_API_KEY="your-gemini-key"
export AUTH_SECRET="$(openssl rand -base64 32)"

# Build and run
docker compose up --build
```

Data persists across restarts via Docker volumes (`recipes-data` and `recipes-media`).

## Kubernetes Deployment (Helm)

### Container image and Helm chart

Both the container image and the Helm chart are published automatically to
GitHub Container Registry (GHCR) via GitHub Actions.

| Artifact | Location |
|---|---|
| Container image | `ghcr.io/aresiusxp/recipes-repo:<version>` |
| Helm chart (OCI) | `oci://ghcr.io/aresiusxp/charts/recipes-repo` |

#### Releasing

- **App release** — push a tag like `v1.2.3`. This builds and pushes the
  container image, updates `Chart.yaml` (`version` + `appVersion`), publishes
  the Helm chart, and prepends a new entry to [`CHANGELOG.md`](CHANGELOG.md).
- **Chart-only release** — push a tag like `helm-v1.2.4`. This bumps only the
  chart `version` (keeps the existing `appVersion`), publishes the chart, and
  prepends a new entry (labelled _Chart-only release (appVersion unchanged)_) to [`CHANGELOG.md`](CHANGELOG.md).

Both workflows commit the updated `CHANGELOG.md` back to `main` alongside the
`Chart.yaml` bump. The changelog is generated automatically by
`scripts/update-changelog.mjs` from the commit messages between the previous
tag and the new one.

### 1. Create the Kubernetes Secret

```bash
kubectl create secret generic recipes-repo-secrets \
  --from-literal=auth-secret="$(openssl rand -base64 32)" \
  --from-literal=google-client-id="your-client-id" \
  --from-literal=google-client-secret="your-client-secret" \
  --from-literal=gemini-api-key="your-gemini-key" \
  # Optional: add Microsoft Entra ID credentials to enable Microsoft login
  # --from-literal=microsoft-entra-id-client-id="your-entra-client-id" \
  # --from-literal=microsoft-entra-id-client-secret="your-entra-client-secret"
```

### 2. Install with Helm

```bash
# Pull and install from GHCR OCI registry
helm install recipes-repo oci://ghcr.io/aresiusxp/charts/recipes-repo \
  --version 1.2.3 \
  --set config.nextauthUrl=https://recipes.yourdomain.com \
  --set ingress.hosts[0].host=recipes.yourdomain.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix
```

The image tag defaults to the chart's `appVersion`, so you do not need to set
`image.tag` explicitly unless you want to override it.

### 3. Update OAuth redirect URIs

Add your production domain to the OAuth redirect URIs in each provider's console:
- Google: `https://recipes.yourdomain.com/api/auth/callback/google`
- Microsoft: `https://recipes.yourdomain.com/api/auth/callback/microsoft-entra-id`

### Helm Values

See [`helm/recipes-repo/values.yaml`](helm/recipes-repo/values.yaml) for all configurable options, including:

- `image.repository` / `image.tag` — container image (tag defaults to `appVersion`)
- `config.nextauthUrl` — public URL for OAuth callbacks
- `config.geminiModel` — Gemini model name (default: `gemini-2.0-flash`)
- `config.microsoftEntraIdIssuer` — Microsoft account scope (default: `common`)
- `secrets.existingSecret` — name of the Kubernetes Secret
- `secrets.keys.microsoftEntraIdClientId` / `secrets.keys.microsoftEntraIdClientSecret` — Microsoft credential keys
- `ingress.*` — ingress hostname, TLS, and annotations
- `persistence.data.size` / `persistence.media.size` — storage sizes
- `resources` — CPU/memory limits

## Project Structure

```
src/
├── app/
│   ├── actions/          # Server actions (recipe CRUD)
│   ├── api/auth/         # NextAuth API route
│   ├── login/            # Login page
│   ├── recipes/          # Recipe pages (list, detail, edit, new, favorites)
│   ├── globals.css       # Tailwind styles
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Root redirect
├── components/           # React components
├── generated/prisma/     # Generated Prisma client (gitignored)
└── lib/                  # Shared utilities
    ├── auth.ts           # NextAuth configuration
    ├── gemini.ts         # Gemini AI integration
    ├── image-storage.ts  # Local image download/storage
    ├── prisma.ts         # Prisma client singleton
    ├── require-auth.ts   # Auth helper
    └── scraper.ts        # Web page scraper
prisma/
└── schema.prisma         # Database schema
helm/
└── recipes-repo/         # Helm chart
.github/
└── workflows/            # CI/CD pipelines (release + helm-release)
docker-compose.yml        # Local container setup
Dockerfile                # Production container
```

## Notes

- **Single replica**: SQLite is file-based, so the Helm chart defaults to 1 replica. Horizontal scaling would require migrating to PostgreSQL or similar.
- **Image persistence**: Recipe images are stored on disk. Both Docker Compose and Helm use persistent volumes to preserve them across restarts.
- **Scraping limitations**: Some recipe sites block automated access. Use the manual paste fallback when URL import fails.

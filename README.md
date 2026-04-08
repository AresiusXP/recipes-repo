# Recipes Repository

A mobile-first web application for saving, organizing, and browsing food recipes from the internet. Powered by Gemini AI for automatic recipe extraction and formatting.

## Features

- **Import recipes from URL** — paste a link and AI extracts ingredients, steps, and tags
- **Manual paste fallback** — paste recipe text directly if URL scraping fails
- **Metric conversion** — imperial measurements are automatically converted to metric
- **English output** — all recipe content is translated to English regardless of source language
- **Image capture** — recipe images are downloaded and stored locally
- **Search & filter** — browse recipes by text search and tag filtering
- **Favorites** — star recipes and browse them on a dedicated favorites page
- **Edit recipes** — correct or refine AI-extracted content
- **Google login** — authentication via Google OAuth
- **Mobile-first UI** — optimized for phones, works on desktop too

## Tech Stack

- **Frontend/Backend**: Next.js 16 (App Router, React 19, TypeScript)
- **Database**: SQLite via Prisma ORM + libSQL adapter
- **AI**: Google Gemini (gemini-2.0-flash)
- **Styling**: Tailwind CSS 4
- **Auth**: NextAuth.js v5 with Google provider
- **Container**: Docker + Docker Compose
- **Deployment**: Kubernetes via Helm chart

## Prerequisites

- Node.js 20+
- A [Google Cloud OAuth 2.0 Client](https://console.cloud.google.com/apis/credentials) (Web application type)
- A [Gemini API key](https://aistudio.google.com/apikey)

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
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_MODEL` | Gemini model name (default: `gemini-2.0-flash`) |
| `DATABASE_URL` | SQLite path (default: `file:./dev.db`) |
| `NEXTAUTH_URL` | App URL (default: `http://localhost:3000`) |
| `MEDIA_DIR` | Image storage directory (default: `public/media`) |

### 3. Set up Google OAuth

In the Google Cloud Console, add these authorized redirect URIs:
- `http://localhost:3000/api/auth/callback/google`

### 4. Initialize database

```bash
npx prisma db push
```

### 5. Start the dev server

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

### 1. Build and push the Docker image

```bash
docker build -t your-registry/recipes-repo:latest .
docker push your-registry/recipes-repo:latest
```

### 2. Create the Kubernetes Secret

```bash
kubectl create secret generic recipes-repo-secrets \
  --from-literal=auth-secret="$(openssl rand -base64 32)" \
  --from-literal=google-client-id="your-client-id" \
  --from-literal=google-client-secret="your-client-secret" \
  --from-literal=gemini-api-key="your-gemini-key"
```

### 3. Install with Helm

```bash
helm install recipes-repo ./helm/recipes-repo \
  --set image.repository=your-registry/recipes-repo \
  --set image.tag=latest \
  --set config.nextauthUrl=https://recipes.yourdomain.com \
  --set ingress.hosts[0].host=recipes.yourdomain.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix
```

### 4. Update Google OAuth redirect URI

Add your production domain to the OAuth redirect URIs:
- `https://recipes.yourdomain.com/api/auth/callback/google`

### Helm Values

See [`helm/recipes-repo/values.yaml`](helm/recipes-repo/values.yaml) for all configurable options, including:

- `image.repository` / `image.tag` — container image
- `config.nextauthUrl` — public URL for OAuth callbacks
- `config.geminiModel` — Gemini model name (default: `gemini-2.0-flash`)
- `secrets.existingSecret` — name of the Kubernetes Secret
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
docker-compose.yml        # Local container setup
Dockerfile                # Production container
```

## Notes

- **Single replica**: SQLite is file-based, so the Helm chart defaults to 1 replica. Horizontal scaling would require migrating to PostgreSQL or similar.
- **Image persistence**: Recipe images are stored on disk. Both Docker Compose and Helm use persistent volumes to preserve them across restarts.
- **Scraping limitations**: Some recipe sites block automated access. Use the manual paste fallback when URL import fails.

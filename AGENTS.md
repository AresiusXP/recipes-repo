<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md — recipes-repo

## Commands

```bash
npm run dev          # Start Next.js dev server (http://localhost:3000)
npm run build        # Production build (standalone output)
npm run start        # Serve production build
npm run lint         # ESLint (core-web-vitals + typescript presets)

npm run db:generate  # Regenerate Prisma client
npm run db:push      # Push schema to database without migrations
npm run db:migrate   # Create and apply a Prisma migration
npm run db:studio    # Open Prisma Studio GUI
```

### Testing

There is **no test runner configured** in this repository. No `test` script exists in `package.json`, and no Jest, Vitest, Playwright, or Cypress config files are present. There are no `*.test.*` or `*.spec.*` files.

**Running a single test is not supported.** If you add a test framework, update this section.

### Validating changes

Use `npm run lint` and `npm run build` to verify correctness. The build will catch TypeScript errors, broken imports, and invalid Next.js conventions.

## Tech Stack

- **Next.js 16** (App Router) with **React 19** and **TypeScript** (strict mode)
- **Tailwind CSS 4** for styling
- **Prisma ORM** with SQLite via `@prisma/adapter-libsql`
- **NextAuth.js v5** (Google OAuth)
- **Google Gemini** for AI recipe extraction

## Project Layout

```
src/
├── app/
│   ├── actions/recipes.ts   # Server actions (recipe CRUD, translate)
│   ├── actions/user.ts      # Server actions (user settings)
│   ├── api/auth/             # NextAuth route handler (minimal)
│   ├── login/                # Login page
│   ├── recipes/              # Recipe pages (list, detail, edit, new, favorites)
│   ├── settings/             # User settings page
│   ├── globals.css           # Tailwind styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Root redirect
├── components/               # React components (client-side)
├── generated/prisma/         # Generated Prisma client (gitignored — never edit)
└── lib/                      # Shared server utilities
    ├── auth.ts               # NextAuth configuration
    ├── gemini.ts             # Gemini AI integration
    ├── image-storage.ts      # Image download/storage
    ├── prisma.ts             # Prisma client singleton
    ├── require-auth.ts       # Auth guard helper
    └── scraper.ts            # Web page scraper
prisma/
└── schema.prisma             # Database schema
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
import { prisma } from "@/lib/prisma";
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

- All recipe CRUD operations are server actions in `src/app/actions/recipes.ts`.
- Client components call server actions directly — do not create extra API routes unless truly necessary.
- Inline `"use server"` in form actions is acceptable for simple cases (e.g., sign-out buttons).

### Authentication

- Use `requireAuth()` from `@/lib/require-auth` for server-side auth gating.
- It redirects to `/login` if unauthenticated and returns a session with a guaranteed `user.id`.
- Always verify resource ownership before mutations (compare `userId`).

## Prisma / Data Layer

- **Client location:** Generated into `src/generated/prisma` — never hand-edit these files.
- **Singleton pattern:** Import `prisma` from `@/lib/prisma`. Do not create new `PrismaClient` instances.
- **SQLite + libSQL:** The database is file-based (single-replica only).
- **Schema fields:** `ingredients` and `steps` are stored as JSON strings (`JSON.stringify`/`JSON.parse`), not normalized tables.
- After changing `prisma/schema.prisma`, run `npm run db:generate` then `npm run db:push` (or `db:migrate`).

## Error Handling

- **Server actions** return `{ success: boolean; error?: string }` — do not throw errors to the client.
- **Auth failures** redirect via `requireAuth()` (which calls `redirect("/login")`).
- **Ownership failures** return a generic `"Recipe not found"` message — do not reveal authorization details.
- **Utility functions** (e.g., `image-storage.ts`) catch errors, log with `console.error`, and return `null` or no-op rather than throwing.
- Pattern for error narrowing: `error instanceof Error ? error.message : "Fallback message"`.

## Styling

- Uses **Tailwind CSS 4** with a mobile-first approach.
- Dark mode classes are used throughout (e.g., `dark:bg-zinc-900`).
- Custom color tokens like `text-primary` and `bg-primary` are defined in `globals.css`.

## Files You Should Not Edit

- `src/generated/prisma/` — auto-generated by Prisma; gitignored
- `.env*` (except `.env.example`) — secrets; gitignored
- `*.db`, `*.db-journal` — database files; gitignored
- `public/media/` — user-uploaded images; gitignored
- `.next/` — Next.js build cache; gitignored

## Build Configuration Cautions

- `next.config.ts` uses `output: "standalone"` and externalizes Prisma/libsql packages via `serverExternalPackages`. Avoid changes that break standalone server builds.
- ESLint config (`eslint.config.mjs`) uses the flat config format with `eslint-config-next` core-web-vitals and TypeScript presets. No custom stylistic rules are added.

## Environment Variables

Required variables are documented in `.env.example`:

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Session encryption secret |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GEMINI_API_KEY` | Google Gemini API key |
| `DATABASE_URL` | SQLite database path (default: `file:./dev.db`) |
| `NEXTAUTH_URL` | App base URL for OAuth callbacks |
| `MEDIA_DIR` | Image storage directory (default: `public/media`) |
| `ALLOWED_EMAILS` | Comma-separated allowlist for new registrations (empty = open) |

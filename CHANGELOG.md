# Changelog

All notable changes to this project will be documented in this file.

## [Frontend 0.11.8] — 2026-06-23

_Frontend service release_

- fix: preserve scroll and prevent full page refresh on browser back
- fix: eliminate scroll and theme flashes on page navigation

## [Helm 0.1.34] — 2026-06-23

_Chart-only release (appVersion unchanged)_

- fix: eliminate scroll and theme flashes on page navigation

## [Frontend 0.11.7] — 2026-06-23

_Frontend service release_

- fix: eliminate scroll and theme flashes on page navigation

## [Helm 0.1.33] — 2026-06-23

_Chart-only release (appVersion unchanged)_

- fix: replace img with Next.js Image and upgrade Tailwind CSS
- feat: restore scroll position when returning to recipe list

## [Frontend 0.11.6] — 2026-06-23

_Frontend service release_

- fix: replace img with Next.js Image and upgrade Tailwind CSS
- feat: restore scroll position when returning to recipe list

## [Helm 0.1.32] — 2026-06-08

_Chart-only release (appVersion unchanged)_

- No user-facing changes.

## [Backend 1.4.2] — 2026-06-08

_Backend service release_

- fix: prevent crash on recipes with zero tags
- ci: trigger helm release on service workflow completion
- force helm build
- force helm build
- fix(frontend): remove redundant recipe ownership check
- ci: delegate chart packaging to release-helm workflow
- fix(frontend,backend): persist uploaded recipe images

## [Frontend 0.11.5] — 2026-06-08

_Frontend service release_

- fix: prevent crash on recipes with zero tags
- ci: trigger helm release on service workflow completion
- force helm build
- force helm build

## [Helm 0.1.30] — 2026-06-08

_Chart-only release (appVersion unchanged)_

- force helm build
- force helm build
- fix(frontend): remove redundant recipe ownership check
- ci: delegate chart packaging to release-helm workflow
- fix(frontend,backend): persist uploaded recipe images
- build(frontend): patch Next.js and PostCSS vulnerabilities
- feat: support Instagram reel recipe imports
- fix(backend): block private network SSRF targets
- fix(backend): skip logging health probe requests
- fix(scraper): retry blocked fetches in Playwright
- Set package-ecosystem to 'gomod' in dependabot config
- fix(backend): don't overwrite name/image on subsequent OAuth sign-ins
- feat: implement linked accounts (AccountProvider table + full flow)
- fix(frontend): fix import status poller auth (secureCookie + JWS re-sign)
- fix(backend): accept DD/MM/YYYY date format for cookThisWeek
- fix(backend): include name, email, image in GetSettings response
- fix(backend): include recipeCount and accountProviders in admin user list
- fix(db): add missing bannedAt column to User table
- fix(db+frontend): add missing columns and media proxy route
- chore: add missing package-lock files and ignore e2e test-results
- fix(auth): pass secureCookie:true to getToken() to match HKDF salt
- fix(auth): skip iss parameter check for Google OAuth provider
- fix(auth): restore backend API auth for NextAuth v5 sessions
- fix(helm): replace non-ASCII chars in values.yaml to fix Argo CD gRPC UTF-8 error
- docs(agents): sync AGENTS.md with current architecture

## [Frontend 0.11.4] — 2026-06-08

_Frontend service release_

- fix(frontend): remove redundant recipe ownership check
- ci: delegate chart packaging to release-helm workflow
- fix(frontend,backend): persist uploaded recipe images

## [Backend 1.4.1] — 2026-05-20

_Backend service release_

- fix(frontend,backend): persist uploaded recipe images
- build(frontend): patch Next.js and PostCSS vulnerabilities

## [Frontend 0.11.3] — 2026-05-20

_Frontend service release_

- fix(frontend,backend): persist uploaded recipe images

## [Frontend 0.11.2] — 2026-05-17

_Frontend service release_

- build(frontend): patch Next.js and PostCSS vulnerabilities

## [Frontend 0.11.1] — 2026-05-16

_Frontend service release_

- build(frontend): patch Next.js and PostCSS vulnerabilities

## [Backend 1.4.0] — 2026-05-16

_Backend service release_

- feat: support Instagram reel recipe imports
- fix(backend): block private network SSRF targets
- fix(backend): skip logging health probe requests
- fix(scraper): retry blocked fetches in Playwright
- Set package-ecosystem to 'gomod' in dependabot config

## [Frontend 0.11.0] — 2026-05-16

_Frontend service release_

- feat: support Instagram reel recipe imports
- fix(backend): block private network SSRF targets
- fix(backend): skip logging health probe requests
- fix(scraper): retry blocked fetches in Playwright
- Set package-ecosystem to 'gomod' in dependabot config

## [Scraper 1.2.0] — 2026-05-16

_Scraper service release_

- feat: support Instagram reel recipe imports
- fix(backend): block private network SSRF targets
- fix(backend): skip logging health probe requests
- fix(scraper): retry blocked fetches in Playwright
- Set package-ecosystem to 'gomod' in dependabot config

## [Scraper 1.1.0] — 2026-05-15

_Scraper service release_

- feat: support Instagram reel recipe imports
- fix(backend): block private network SSRF targets
- fix(backend): skip logging health probe requests
- fix(scraper): retry blocked fetches in Playwright

## [Backend 1.3.0] — 2026-05-15

_Backend service release_

- feat: support Instagram reel recipe imports
- fix(backend): block private network SSRF targets
- fix(backend): skip logging health probe requests
- fix(scraper): retry blocked fetches in Playwright

## [Frontend 0.10.0] — 2026-05-15

_Frontend service release_

- feat: support Instagram reel recipe imports
- fix(backend): block private network SSRF targets
- fix(backend): skip logging health probe requests
- fix(scraper): retry blocked fetches in Playwright
- fix(backend): don't overwrite name/image on subsequent OAuth sign-ins

## [Backend 1.2.3] — 2026-05-15

_Backend service release_

- fix(backend): block private network SSRF targets
- fix(backend): skip logging health probe requests
- fix(scraper): retry blocked fetches in Playwright

## [Backend 1.2.2] — 2026-05-14

_Backend service release_

- fix(backend): skip logging health probe requests
- fix(scraper): retry blocked fetches in Playwright

## [Scraper 1.0.1] — 2026-05-14

_Scraper service release_

- fix(scraper): retry blocked fetches in Playwright
- fix(backend): don't overwrite name/image on subsequent OAuth sign-ins
- feat: implement linked accounts (AccountProvider table + full flow)
- fix(frontend): fix import status poller auth (secureCookie + JWS re-sign)
- fix(backend): accept DD/MM/YYYY date format for cookThisWeek
- fix(backend): include name, email, image in GetSettings response
- fix(backend): include recipeCount and accountProviders in admin user list
- fix(db): add missing bannedAt column to User table
- fix(db+frontend): add missing columns and media proxy route
- chore: add missing package-lock files and ignore e2e test-results
- fix(auth): pass secureCookie:true to getToken() to match HKDF salt
- fix(auth): skip iss parameter check for Google OAuth provider
- fix(auth): restore backend API auth for NextAuth v5 sessions
- fix(helm): replace non-ASCII chars in values.yaml to fix Argo CD gRPC UTF-8 error
- docs(agents): sync AGENTS.md with current architecture
- chore(helm): bump chart version to 0.1.3
- fix(helm): restore backend schema init and frontend auth secret
- docs: rewrite README to reflect current monorepo architecture
- chore(helm): tag helm-v0.1.2 release

## [Backend 1.2.1] — 2026-05-14

_Backend service release_

- fix(backend): don't overwrite name/image on subsequent OAuth sign-ins

## [Frontend 0.9.5] — 2026-05-14

_Frontend service release_

- feat: implement linked accounts (AccountProvider table + full flow)

## [Backend 1.2.0] — 2026-05-14

_Backend service release_

- feat: implement linked accounts (AccountProvider table + full flow)
- fix(frontend): fix import status poller auth (secureCookie + JWS re-sign)

## [Frontend 0.9.4] — 2026-05-14

_Frontend service release_

- fix(frontend): fix import status poller auth (secureCookie + JWS re-sign)
- fix(backend): accept DD/MM/YYYY date format for cookThisWeek
- fix(backend): include name, email, image in GetSettings response
- fix(backend): include recipeCount and accountProviders in admin user list
- fix(db): add missing bannedAt column to User table

## [Backend 1.1.3] — 2026-05-14

_Backend service release_

- fix(backend): accept DD/MM/YYYY date format for cookThisWeek

## [Backend 1.1.2] — 2026-05-14

_Backend service release_

- fix(backend): include name, email, image in GetSettings response

## [Backend 1.1.1] — 2026-05-14

_Backend service release_

- fix(backend): include recipeCount and accountProviders in admin user list
- fix(db): add missing bannedAt column to User table
- fix(db+frontend): add missing columns and media proxy route
- chore: add missing package-lock files and ignore e2e test-results
- fix(auth): pass secureCookie:true to getToken() to match HKDF salt
- fix(auth): skip iss parameter check for Google OAuth provider

## [Frontend 0.9.3] — 2026-05-14

_Frontend service release_

- fix(db+frontend): add missing columns and media proxy route
- chore: add missing package-lock files and ignore e2e test-results
- fix(auth): pass secureCookie:true to getToken() to match HKDF salt

## [Frontend 0.9.2] — 2026-05-14

_Frontend service release_

- fix(auth): pass secureCookie:true to getToken() to match HKDF salt
- fix(auth): skip iss parameter check for Google OAuth provider

## [Frontend 0.9.1] — 2026-05-14

_Frontend service release_

- fix(auth): skip iss parameter check for Google OAuth provider

## [Frontend 0.9.0] — 2026-05-14

_Frontend service release_

- fix(auth): restore backend API auth for NextAuth v5 sessions
- fix(helm): replace non-ASCII chars in values.yaml to fix Argo CD gRPC UTF-8 error
- docs(agents): sync AGENTS.md with current architecture
- chore(helm): bump chart version to 0.1.3
- fix(helm): restore backend schema init and frontend auth secret
- docs: rewrite README to reflect current monorepo architecture
- chore(helm): tag helm-v0.1.2 release
- ci: use plain ASCII dashes in release workflow names
- ci: rewrite release workflows for unified Helm chart and add chart-only release
- feat(helm): unify service charts and migrate scraper to ESLint v9

## [Backend 1.1.0] — 2026-05-14

_Backend service release_

- fix(auth): restore backend API auth for NextAuth v5 sessions
- fix(helm): replace non-ASCII chars in values.yaml to fix Argo CD gRPC UTF-8 error
- docs(agents): sync AGENTS.md with current architecture
- chore(helm): bump chart version to 0.1.3
- fix(helm): restore backend schema init and frontend auth secret
- docs: rewrite README to reflect current monorepo architecture
- chore(helm): tag helm-v0.1.2 release

## [Helm 0.1.4] — 2026-05-14

_Chart-only release (appVersion unchanged)_

- fix(helm): replace non-ASCII chars in values.yaml to fix Argo CD gRPC UTF-8 error
- docs(agents): sync AGENTS.md with current architecture
- chore(helm): bump chart version to 0.1.3
- fix(helm): restore backend schema init and frontend auth secret
- docs: rewrite README to reflect current monorepo architecture

## [Helm 0.1.3] — 2026-05-14

_Chart-only release (appVersion unchanged)_

- chore(helm): bump chart version to 0.1.3
- fix(helm): restore backend schema init and frontend auth secret
- docs: rewrite README to reflect current monorepo architecture

## [Helm 0.1.2] — 2026-05-14

_Chart-only release (appVersion unchanged)_

- chore(helm): tag helm-v0.1.2 release
- ci: use plain ASCII dashes in release workflow names

## [Backend 1.0.0] — 2026-05-12

_Backend service release_

- ci: use plain ASCII dashes in release workflow names
- ci: rewrite release workflows for unified Helm chart and add chart-only release
- feat(helm): unify service charts and migrate scraper to ESLint v9
- chore: use **/node_modules/ wildcard in .gitignore to exclude all nested node_modules
- chore(release): bump frontend to 0.8.1
- fix(e2e): fix Docker build issues and E2E test selectors — all tests pass
- chore(release): bump frontend to 0.8.0
- chore: update root .gitignore to exclude node_modules/ in all subdirectories
- fix: address CodeRabbit frontend/scraper review — fix markAllNotificationsRead auth, viewport accessibility, FavoriteButton error handling, URL parsing safety
- fix(backend): address CodeRabbit review findings — SQL bug, Gemini timeout, auth startup validation, error handling improvements
- chore(frontend): remove Prisma, media route, image-storage, scraper libs — moved to backend/scraper services
- feat: add Helm charts for all services, E2E test suite, path-based CI/CD workflows, and update AGENTS.md
- feat(scraper): add Node.js/TypeScript scraper microservice with async job queue
- feat(backend): add Go REST API with async recipe import, JWT auth middleware, Gemini AI, and media handling
- feat(frontend): refactor to thin API proxy — remove Prisma/Gemini/Playwright, add api-client and async import UX
- chore: move frontend files into frontend/ subdirectory
- fix: create home directory for nextjs user so Chromium can launch
- fix: grant nextjs user write access to node_modules in migrator
- fix: resolve Kubernetes runtime issues and bump version to 0.7.5
- docs: bring AGENTS.md up to date with current codebase
- fix: add ca-certificates to Debian runner image
- feat: implement browser fallback for recipe scraper
- feat: add dismissible notifications
- 0.7.1
- feat: show banned-user notice and tighten recipe scraping
- feat: add admin dashboard and moderation controls
- docs: document Helm allowedEmails configuration
- bug: allowedEmails missing from Helm chart
- fix(security): add Content-Security-Policy header
- fix(deps): patch Next.js App Router DoS vulnerability
- feat(auth): add Microsoft sign-in and account linking
- fix(scraper): use curl to bypass TLS fingerprint blocking
- fix(import): handle bot-blocked recipe pages gracefully
- fix(docker): add --accept-data-loss to migrator db push command
- fix(db): add --accept-data-loss flag to db:push for schema migrations
- ci: automate changelog updates for release tags
- feat(recipes): overhaul multilingual translation flow
- feat(ui): give recipes app a cozy visual refresh
- feat(recipes): add image upload controls for create and edit
- fix(scraper): use browser-like headers for blocked sites
- feat(cook-this-week): add weekly meal planning
- fix(recipe-detail): prevent mobile header overflow
- feat(sharing): add recipe sharing with in-app notifications
- fix(docker): chown runner-stage files for Next.js cache writes
- fix(ci): restore release workflow registry step id broken by rebase
- feat(logging): add structured JSON logs for Loki
- ci: lowercase GHCR image and chart paths
- feat: add recipe view toggle and theme customization
- feat: add persistent list view for recipe lists
- fix: serve runtime media in standalone deployments
- Changed favicon and logo in navbar
- fix: pass DATABASE_URL directly to migrator db push
- fix: remove unsupported Prisma db push flag
- fix: move Prisma schema init to a dedicated migrator image
- fix: fail fast on schema init and tune pod DNS
- fix: start Google OAuth from the client on login
- fix: trust auth.js host headers behind reverse proxies
- fix: lowercase GHCR registry paths in release workflows
- fix: ensure Docker builder creates public directory
- ci: ignore generated Prisma files in lint
- test: add Vitest suite and CI checks
- ci: automate GHCR image and Helm chart releases
- feat: restrict new registrations with an email allowlist
- build: override @auth/core to patch next-auth CVE
- feat: let users manage profile pictures in settings
- feat: move account actions into avatar menu
- feat: add configurable recipe translation controls
- updated agents
- feat: add recipe favorites and configurable Gemini output
- feat: bootstrap recipes app with AI import and deployment stack
- Initial commit from Create Next App
- first commit

## [Scraper 1.0.0] — 2026-05-12

_Scraper service release_

- ci: use plain ASCII dashes in release workflow names
- ci: rewrite release workflows for unified Helm chart and add chart-only release
- feat(helm): unify service charts and migrate scraper to ESLint v9
- chore: use **/node_modules/ wildcard in .gitignore to exclude all nested node_modules
- chore(release): bump frontend to 0.8.1
- fix(e2e): fix Docker build issues and E2E test selectors — all tests pass
- chore(release): bump frontend to 0.8.0
- chore: update root .gitignore to exclude node_modules/ in all subdirectories
- fix: address CodeRabbit frontend/scraper review — fix markAllNotificationsRead auth, viewport accessibility, FavoriteButton error handling, URL parsing safety
- fix(backend): address CodeRabbit review findings — SQL bug, Gemini timeout, auth startup validation, error handling improvements
- chore(frontend): remove Prisma, media route, image-storage, scraper libs — moved to backend/scraper services
- feat: add Helm charts for all services, E2E test suite, path-based CI/CD workflows, and update AGENTS.md
- feat(scraper): add Node.js/TypeScript scraper microservice with async job queue
- feat(backend): add Go REST API with async recipe import, JWT auth middleware, Gemini AI, and media handling
- feat(frontend): refactor to thin API proxy — remove Prisma/Gemini/Playwright, add api-client and async import UX
- chore: move frontend files into frontend/ subdirectory
- fix: create home directory for nextjs user so Chromium can launch
- fix: grant nextjs user write access to node_modules in migrator
- fix: resolve Kubernetes runtime issues and bump version to 0.7.5
- docs: bring AGENTS.md up to date with current codebase
- fix: add ca-certificates to Debian runner image
- feat: implement browser fallback for recipe scraper
- feat: add dismissible notifications
- 0.7.1
- feat: show banned-user notice and tighten recipe scraping
- feat: add admin dashboard and moderation controls
- docs: document Helm allowedEmails configuration
- bug: allowedEmails missing from Helm chart
- fix(security): add Content-Security-Policy header
- fix(deps): patch Next.js App Router DoS vulnerability
- feat(auth): add Microsoft sign-in and account linking
- fix(scraper): use curl to bypass TLS fingerprint blocking
- fix(import): handle bot-blocked recipe pages gracefully
- fix(docker): add --accept-data-loss to migrator db push command
- fix(db): add --accept-data-loss flag to db:push for schema migrations
- ci: automate changelog updates for release tags
- feat(recipes): overhaul multilingual translation flow
- feat(ui): give recipes app a cozy visual refresh
- feat(recipes): add image upload controls for create and edit
- fix(scraper): use browser-like headers for blocked sites
- feat(cook-this-week): add weekly meal planning
- fix(recipe-detail): prevent mobile header overflow
- feat(sharing): add recipe sharing with in-app notifications
- fix(docker): chown runner-stage files for Next.js cache writes
- fix(ci): restore release workflow registry step id broken by rebase
- feat(logging): add structured JSON logs for Loki
- ci: lowercase GHCR image and chart paths
- feat: add recipe view toggle and theme customization
- feat: add persistent list view for recipe lists
- fix: serve runtime media in standalone deployments
- Changed favicon and logo in navbar
- fix: pass DATABASE_URL directly to migrator db push
- fix: remove unsupported Prisma db push flag
- fix: move Prisma schema init to a dedicated migrator image
- fix: fail fast on schema init and tune pod DNS
- fix: start Google OAuth from the client on login
- fix: trust auth.js host headers behind reverse proxies
- fix: lowercase GHCR registry paths in release workflows
- fix: ensure Docker builder creates public directory
- ci: ignore generated Prisma files in lint
- test: add Vitest suite and CI checks
- ci: automate GHCR image and Helm chart releases
- feat: restrict new registrations with an email allowlist
- build: override @auth/core to patch next-auth CVE
- feat: let users manage profile pictures in settings
- feat: move account actions into avatar menu
- feat: add configurable recipe translation controls
- updated agents
- feat: add recipe favorites and configurable Gemini output
- feat: bootstrap recipes app with AI import and deployment stack
- Initial commit from Create Next App
- first commit

## [Helm 0.1.0] — 2026-05-12

_Chart-only release (appVersion unchanged)_

- ci: rewrite release workflows for unified Helm chart and add chart-only release
- feat(helm): unify service charts and migrate scraper to ESLint v9
- chore: use **/node_modules/ wildcard in .gitignore to exclude all nested node_modules
- chore(release): bump frontend to 0.8.1
- fix(e2e): fix Docker build issues and E2E test selectors — all tests pass
- chore(release): bump frontend to 0.8.0
- chore: update root .gitignore to exclude node_modules/ in all subdirectories
- fix: address CodeRabbit frontend/scraper review — fix markAllNotificationsRead auth, viewport accessibility, FavoriteButton error handling, URL parsing safety
- fix(backend): address CodeRabbit review findings — SQL bug, Gemini timeout, auth startup validation, error handling improvements
- chore(frontend): remove Prisma, media route, image-storage, scraper libs — moved to backend/scraper services
- feat: add Helm charts for all services, E2E test suite, path-based CI/CD workflows, and update AGENTS.md
- feat(scraper): add Node.js/TypeScript scraper microservice with async job queue
- feat(backend): add Go REST API with async recipe import, JWT auth middleware, Gemini AI, and media handling
- feat(frontend): refactor to thin API proxy — remove Prisma/Gemini/Playwright, add api-client and async import UX
- chore: move frontend files into frontend/ subdirectory
- fix: create home directory for nextjs user so Chromium can launch
- fix: grant nextjs user write access to node_modules in migrator
- fix: resolve Kubernetes runtime issues and bump version to 0.7.5
- docs: bring AGENTS.md up to date with current codebase
- fix: add ca-certificates to Debian runner image
- feat: implement browser fallback for recipe scraper
- feat: add dismissible notifications
- 0.7.1
- feat: show banned-user notice and tighten recipe scraping
- feat: add admin dashboard and moderation controls
- docs: document Helm allowedEmails configuration
- bug: allowedEmails missing from Helm chart
- fix(security): add Content-Security-Policy header
- fix(deps): patch Next.js App Router DoS vulnerability
- feat(auth): add Microsoft sign-in and account linking
- fix(scraper): use curl to bypass TLS fingerprint blocking
- fix(import): handle bot-blocked recipe pages gracefully
- fix(docker): add --accept-data-loss to migrator db push command
- fix(db): add --accept-data-loss flag to db:push for schema migrations
- ci: automate changelog updates for release tags
- feat(recipes): overhaul multilingual translation flow
- feat(ui): give recipes app a cozy visual refresh
- feat(recipes): add image upload controls for create and edit
- fix(scraper): use browser-like headers for blocked sites
- feat(cook-this-week): add weekly meal planning
- fix(recipe-detail): prevent mobile header overflow
- feat(sharing): add recipe sharing with in-app notifications
- fix(docker): chown runner-stage files for Next.js cache writes
- fix(ci): restore release workflow registry step id broken by rebase
- feat(logging): add structured JSON logs for Loki
- ci: lowercase GHCR image and chart paths
- feat: add recipe view toggle and theme customization
- feat: add persistent list view for recipe lists
- fix: serve runtime media in standalone deployments
- Changed favicon and logo in navbar
- fix: pass DATABASE_URL directly to migrator db push
- fix: remove unsupported Prisma db push flag
- fix: move Prisma schema init to a dedicated migrator image
- fix: fail fast on schema init and tune pod DNS
- fix: start Google OAuth from the client on login
- fix: trust auth.js host headers behind reverse proxies
- fix: lowercase GHCR registry paths in release workflows
- fix: ensure Docker builder creates public directory
- ci: ignore generated Prisma files in lint
- test: add Vitest suite and CI checks
- ci: automate GHCR image and Helm chart releases
- feat: restrict new registrations with an email allowlist
- build: override @auth/core to patch next-auth CVE
- feat: let users manage profile pictures in settings
- feat: move account actions into avatar menu
- feat: add configurable recipe translation controls
- updated agents
- feat: add recipe favorites and configurable Gemini output
- feat: bootstrap recipes app with AI import and deployment stack
- Initial commit from Create Next App
- first commit

## [0.7.7] — 2026-05-04

_App release_

- fix: create home directory for nextjs user so Chromium can launch

## [0.7.6] — 2026-05-04

_App release_

- fix: grant nextjs user write access to node_modules in migrator
- chore: bump chart and update changelog for v0.7.5 [skip ci]
- fix: resolve Kubernetes runtime issues and bump version to 0.7.5
- chore: bump chart and update changelog for v0.7.4 [skip ci]

## [0.7.5] — 2026-05-04

_App release_

- fix: resolve Kubernetes runtime issues and bump version to 0.7.5
- docs: bring AGENTS.md up to date with current codebase
- fix: add ca-certificates to Debian runner image
- chore: bump chart and update changelog for v0.7.3 [skip ci]

## [0.7.4] — 2026-05-04

_App release_

- fix: add ca-certificates to Debian runner image

## [0.7.3] — 2026-05-04

_App release_

- feat: implement browser fallback for recipe scraper
- chore: bump chart and update changelog for v0.7.2 [skip ci]

## [0.7.2] — 2026-04-29

_App release_

- feat: add dismissible notifications
- chore: bump chart and update changelog for v0.7.0 [skip ci]
- chore: bump chart and update changelog for v0.7.1 [skip ci]
- 0.7.1
- feat: show banned-user notice and tighten recipe scraping
- feat: add admin dashboard and moderation controls
- docs: document Helm allowedEmails configuration
- chore: bump chart and update changelog for v0.6.3 [skip ci]

## [0.7.0] — 2026-04-28

_App release_

- feat: add admin dashboard and moderation controls
- docs: document Helm allowedEmails configuration

## [0.7.1] — 2026-04-28

_App release_

- 0.7.1
- feat: show banned-user notice and tighten recipe scraping
- feat: add admin dashboard and moderation controls
- docs: document Helm allowedEmails configuration

## [0.6.3] — 2026-04-28

_App release_

- bug: allowedEmails missing from Helm chart
- chore: bump chart and update changelog for v0.6.2 [skip ci]

## [0.6.2] — 2026-04-21

_App release_

- fix(security): add Content-Security-Policy header
- fix(deps): patch Next.js App Router DoS vulnerability
- chore: bump chart and update changelog for v0.6.1 [skip ci]
- chore: bump chart and update changelog for v0.6.0 [skip ci]

## [0.6.1] — 2026-04-20

_App release_

- fix(deps): patch Next.js App Router DoS vulnerability

## [0.6.0] — 2026-04-20

_App release_

- feat(auth): add Microsoft sign-in and account linking
- chore: bump chart and update changelog for v0.5.6 [skip ci]

## [0.5.6] — 2026-04-13

_App release_

- fix(scraper): use curl to bypass TLS fingerprint blocking
- chore: bump chart and update changelog for v0.5.5 [skip ci]

## [0.5.5] — 2026-04-13

_App release_

- fix(import): handle bot-blocked recipe pages gracefully
- chore: bump chart and update changelog for v0.5.4 [skip ci]
- fix(docker): add --accept-data-loss to migrator db push command
- chore: bump chart and update changelog for v0.5.3 [skip ci]

## [0.5.4] — 2026-04-12

_App release_

- fix(docker): add --accept-data-loss to migrator db push command
- fix(db): add --accept-data-loss flag to db:push for schema migrations

## [0.5.3] — 2026-04-12

_App release_

- fix(db): add --accept-data-loss flag to db:push for schema migrations
- ci: automate changelog updates for release tags
- feat(recipes): overhaul multilingual translation flow
- feat(ui): give recipes app a cozy visual refresh

## [0.5.2] — 2026-04-12

_App release_

- feat(recipes): overhaul multilingual translation flow
- feat(ui): give recipes app a cozy visual refresh

## [0.5.1] — 2026-04-12

_App release_

- feat(recipes): add image upload controls for create and edit
- fix(scraper): use browser-like headers for blocked sites

## [0.5.0] — 2026-04-12

_App release_

- feat(cook-this-week): add weekly meal planning
- fix(recipe-detail): prevent mobile header overflow

## [0.4.1] — 2026-04-11

_App release_

- fix(recipe-detail): prevent mobile header overflow

## [0.4.0] — 2026-04-11

_App release_

- feat(sharing): add recipe sharing with in-app notifications
- fix(docker): chown runner-stage files for Next.js cache writes

## [0.3.1] — 2026-04-10

_App release_

- fix(ci): restore release workflow registry step id broken by rebase
- feat(logging): add structured JSON logs for Loki
- Revert "chore: bump chart to 0.3.0 [skip ci]"
- ci: lowercase GHCR image and chart paths

## [0.3.0] — 2026-04-10

_App release_

- feat: add recipe view toggle and theme customization
- feat: add persistent list view for recipe lists

## [0.2.3] — 2026-04-10

_App release_

- fix: serve runtime media in standalone deployments
- Changed favicon and logo in navbar

## [0.2.2] — 2026-04-10

_App release_

- fix: pass DATABASE_URL directly to migrator db push

## [0.2.1] — 2026-04-10

_App release_

- fix: remove unsupported Prisma db push flag

## [0.2.0] — 2026-04-09

_App release_

- fix: move Prisma schema init to a dedicated migrator image
- fix: fail fast on schema init and tune pod DNS

## [0.1.2] — 2026-04-09

_App release_

- fix: start Google OAuth from the client on login

## [0.1.1] — 2026-04-09

_App release_

- fix: trust auth.js host headers behind reverse proxies

## [0.1.0] — 2026-04-09

_App release_

- fix: lowercase GHCR registry paths in release workflows
- fix: ensure Docker builder creates public directory
- ci: ignore generated Prisma files in lint
- test: add Vitest suite and CI checks
- ci: automate GHCR image and Helm chart releases
- feat: restrict new registrations with an email allowlist
- build: override @auth/core to patch next-auth CVE
- feat: let users manage profile pictures in settings
- feat: move account actions into avatar menu
- feat: add configurable recipe translation controls
- updated agents
- feat: add recipe favorites and configurable Gemini output
- feat: bootstrap recipes app with AI import and deployment stack
- Initial commit from Create Next App
- first commit


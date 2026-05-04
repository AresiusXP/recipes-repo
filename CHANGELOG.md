# Changelog

All notable changes to this project will be documented in this file.

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


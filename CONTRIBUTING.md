# Contributing

## Prerequisites

- Node.js 24.19.0
- npm 11.17.0
- Windows, macOS, or Linux with Git available

Use the versions pinned in `package.json`, `.nvmrc`, and `.node-version`.

## Installation

Install the exact dependency tree from the lockfile:

```powershell
npm.cmd ci
```

Use `npm` instead of mixing package managers so workspace links and the lockfile remain consistent.

## Development commands

```powershell
npm.cmd run dev
npm.cmd run dev:web
npm.cmd run dev:api
```

`npm.cmd run dev` starts the web and API processes together. The individual commands are useful when working within one boundary.

Local development defaults to PGlite and uses the ignored `.ajani-data` directory. External PostgreSQL work must set `AJANI_DATA_MODE=postgres` and `DATABASE_URL`; it never falls back to the local mode.

## Database commands

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:reset:preview
npm.cmd run db:verify
```

Migrations and seed data must remain valid in PGlite and external PostgreSQL modes. The preview reset is intentionally PGlite-only. Never commit local database directories, credentials, or environment files.

## Test and verification commands

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:web
npm.cmd run test:api
npm.cmd run test:database
npm.cmd run test:e2e
npm.cmd run test:e2e:accessibility
npm.cmd run build:web
npm.cmd run build:api
npm.cmd run check:bundle
npm.cmd run verify
```

Run `npm.cmd run verify` before requesting review.

Install Chromium once with `npx playwright install chromium`. Browser tests build the production web and API bundles, start them on isolated ports against a migrated and seeded in-memory PGlite database, use bounded readiness polling, and clean up every process after success or failure. Set `AJANI_POSTGRES_TEST_URL` and run `npm.cmd run test:postgres` only against an isolated PostgreSQL database that can be discarded.

## Coding standards

- Keep TypeScript strict and preserve the repository's checked compiler options.
- Use runtime validation for data crossing process or workspace boundaries.
- Keep browser, server, and shared concerns within their existing workspace boundaries.
- Prefer clear product and domain language over premature abstractions.
- Use comments only when a domain, security, architecture, or accessibility decision is not evident from the code.
- Keep test examples and seed records unmistakably synthetic.
- Keep HTTP handlers thin and database access behind the typed repository boundary.
- Update runtime contracts, inferred types, implementation, and tests together.

## Migration expectations

- Migrate an existing behavior and its tests together.
- Add a reviewed SQL migration for every database shape change; do not use runtime schema synchronisation.
- Preserve deterministic identifiers and idempotent seed behaviour.
- Remove obsolete files only after their replacement is verified.
- Keep workspace scripts operable from the repository root.

## Accessibility expectations

- Use semantic HTML and a logical heading hierarchy.
- Preserve keyboard access, visible focus, skip navigation, reduced-motion behavior, and text labels that do not rely on color alone.
- Include an automated accessibility check for material interface additions.
- Verify responsive layouts and keyboard order manually.
- Treat automated axe results as a gate that supplements, rather than replaces, assistive-technology, zoom, contrast, and physical-device review.

## Review guidance

- Keep changes focused on one coherent outcome.
- Describe current behavior, verification performed, limitations, and follow-up work separately.
- Give particular attention to public contracts, error disclosure, environment changes, accessibility, and unsupported product claims.
- Confirm generated build output, local environment files, secrets, and real personal data are not included.

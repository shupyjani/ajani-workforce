# Public preview deployment: Netlify frontend, Render API, and Neon PostgreSQL

## Scope

This document describes the zero-cost topology for the public Ajani Workforce preview: Netlify Free hosts the static React build, Render Free hosts the Fastify API as a separate Node service, and Neon Free hosts a small PostgreSQL database holding only the synthetic preview data. It complements, and does not replace, the [hosting-neutral delivery contract](hosting-contract.md), which remains the provider-independent source of truth for commands, environment variables, health behaviour, and storage topology.

Render Free web services run with a 512 MiB memory limit. An earlier version of this configuration ran the API's PGlite engine directly inside that hosted process; PGlite reached application startup but then exceeded that limit under real use. This document now describes the corrected topology: the hosted API uses external PostgreSQL (Neon) instead of PGlite. PGlite remains exactly where it already worked well — local development and the repository's automated tests (see "PGlite stays local and CI-only" below).

This preview is not a live healthcare deployment. No real patient, workforce, or client data may be entered at any point. Ajani Healthcare is a genuine operating business; the organisations, personas, and records inside this preview are fictional and synthetic, and the application is not used for live healthcare operations.

This corrected topology was connected and verified successfully for the public preview on 2026-09-04, superseding the earlier failed attempt described above — see "Verified deployment" immediately below for the confirmed URLs and checks.

## Verified deployment

The topology described in this document was connected in the order set out in "Safe provider-connection order" below and verified successfully:

- Verification date: 2026-09-04
- Custom frontend: [https://workforce.ajanihealthcare.com](https://workforce.ajanihealthcare.com)
- Netlify provider frontend: [https://ajani-workforce-preview.netlify.app](https://ajani-workforce-preview.netlify.app)
- Render API: [https://ajani-workforce-api.onrender.com](https://ajani-workforce-api.onrender.com)
- Database: Neon Free PostgreSQL, with no connection string recorded in this repository or any document
- Netlify DNS confirmed for the custom subdomain
- HTTPS enabled using the existing Let's Encrypt wildcard certificate
- Render deployment from `main` commit `900900a` succeeded
- `GET /live` returned `200` with status `ok`
- `GET /ready` returned `200` with status `ready`, confirming database-backed readiness
- `GET /health` returned `200` with status `ok`
- Worker, Manager, and Administrator previews loaded successfully through the custom domain
- Direct refresh/navigation on a preview route succeeded through the SPA fallback
- The Netlify branding badge was disabled through the project setting
- No paid upgrade was selected on any provider

This is a public pre-production preview, not a live healthcare deployment, and contains synthetic preview data only — see "Scope" above.

## Netlify (frontend)

Configuration lives in the root `netlify.toml`.

| Setting | Value |
| --- | --- |
| Build command | `npm run build:web` |
| Publish directory | `apps/web/dist` |
| Base directory | Repository root |
| Install | Netlify automatically runs `npm install` before the build command, using the root `package.json` and the committed `package-lock.json` (the existing `postinstall` script builds `@ajani/contracts` and `@ajani/database` as part of that install, before `npm run build:web` runs). The Netlify build command itself stays `npm run build:web` — it deliberately does not run a second install. |
| Node version | Read from the repository's `.node-version` / `.nvmrc` (`24.19.0`); no separate Netlify setting needed |
| SPA fallback | `/*` rewrites to `/index.html` with a `200` status, so direct navigation and refreshes on React Router routes resolve correctly |

Required Netlify build-time environment variable:

```
VITE_API_BASE_URL=<actual Render API origin>
```

This is a **build-time** variable: it is compiled into the static bundle, so changing it requires a rebuild. `/api`, `/health`, `/live`, and `/ready` are never routed through a Netlify proxy or redirect — the browser calls the configured Render origin directly, exactly as `apps/web/src/api/client.ts` and the landing page's wake-up request already resolve it.

## Render (API)

Configuration lives in the root `render.yaml` as a Blueprint with one free web service, `ajani-workforce-api`.

| Setting | Value |
| --- | --- |
| Runtime | `node` |
| Plan | `free` |
| Region | `frankfurt` |
| Auto-deploy trigger | `checksPass` |
| Build context | Repository root (no `rootDir` override) |
| Build command | `npm ci --include=dev && npm run build:api` |
| Start command | `npm run start:api` |
| Health check path | `/ready` |
| Persistent disk | None |
| Render-managed database | None — the database is Neon, not a Render PostgreSQL resource (see "Neon (database)" below) |

Render's current Blueprint spec renamed the language-selection key from `env` to `runtime`; `render.yaml` uses the current `runtime: node` form.

**Build command and `--include=dev`.** The Render runtime and build environment both keep `NODE_ENV=production` (see the environment-variable table below) — that does not change. The application's own build compiles TypeScript: the root `postinstall` script builds `@ajani/contracts` and `@ajani/database` with `tsc`, and `npm run build:api` then does the same for `@ajani/api`. With `NODE_ENV=production` set, npm's default is to omit `devDependencies` during `npm ci`, which is exactly where this repository's TypeScript compiler and `@types/node` are declared (correctly — they are build tooling, not application runtime dependencies). Without them, the `postinstall` build fails with `error TS2688: Cannot find type definition file for 'node'`. Adding `--include=dev` explicitly overrides that default for this one install, so the TypeScript compiler and Node type definitions are present for the build; it does not add anything to, or change, the compiled application's runtime dependencies or its `NODE_ENV=production` runtime mode.

**Region.** Render's supported regions are `oregon` (the default if `region` is omitted), `ohio`, `virginia`, `frankfurt`, and `singapore`; a service's region cannot be changed after creation. `render.yaml` sets `region: frankfurt` because Ajani Healthcare and the preview's principal expected audience are UK-based, and Frankfurt is the closest currently supported Render region — choosing it now avoids creating the service in the wrong region and having to recreate it later. This is a proximity choice only: it does not guarantee any particular latency or service level.

**Auto-deploy trigger.** `render.yaml` sets `autoDeployTrigger: checksPass`, the current Blueprint field (it replaces the deprecated boolean `autoDeploy` field and takes precedence if both were present). With this value, Render deploys a new commit on the linked branch only after that commit's GitHub checks (this repository's `Quality gates` workflow) report success, rather than deploying immediately on push. This governs *subsequent* deploys only — the service's first deployment still happens as part of creating it from the Blueprint, before any check-gated redeploy behaviour applies.

Render-supplied runtime variables (set by Render itself, not the Blueprint):

- `PORT` — Render assigns this; the API already reads `PORT` from its environment and must not hard-code it.

Blueprint-declared environment variables:

| Variable | Value | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | |
| `HOST` | `0.0.0.0` | Required so Render's router can reach the process; local development keeps the safer `127.0.0.1` default. |
| `NODE_VERSION` | `24.19.0` | Render Blueprints have no dedicated "pinned Node version" key; setting `NODE_VERSION` is the current supported equivalent so the build uses the same Node version as everywhere else in the repository. |
| `AJANI_DATA_MODE` | `postgres` | Selects the existing external-PostgreSQL path (`packages/database`) instead of PGlite. See "Neon (database)" below. |
| `AJANI_HOSTED_PREVIEW_RESET` | `synthetic-preview-only` | Authorises this specific hosted installation to migrate, clear, and reseed only the Ajani synthetic preview dataset on every startup — see "Startup behaviour" below. Any other value, or its absence, leaves this disabled; it fails closed. |

Not declared in the Blueprint — added manually, as a secret, directly in the Render dashboard:

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | The Neon connection string | A secret. Never committed to `render.yaml`, source code, GitHub, or any document in this repository — see "Neon (database)" and "Provider-connection order" below for exactly how it is added. |

`CORS_ALLOWED_ORIGINS` is **not declared in the Blueprint at all** — not even as a `sync: false` placeholder. Render's Blueprint creation flow prompts the owner for a value for every `sync: false` variable *during that initial creation*, which would force a real-looking value before any Netlify origin exists; omitting the key entirely avoids that prompt. While the variable is absent, the API's own production default applies — an empty CORS allow-list, i.e. no cross-origin browser access at all — which is exactly the safe starting state for a freshly created service with no frontend origin yet. See "CORS configuration" below for how it is added manually once the real Netlify origin is known, and why that manual addition is not lost on a later Blueprint sync.

No secrets, account identifiers, or generated provider URLs are present in either configuration file.

## Neon (database)

Render's own free managed PostgreSQL offering is deliberately **not** used: it has a fixed database-expiry date, which is not suitable for an ongoing public preview. Neon Free PostgreSQL is used instead. As with every free tier mentioned in this document, "free" describes Neon's *current, ongoing* offering, not a permanent guarantee — provider limits and pricing can change; it is not fixed-expiry the way Render's free PostgreSQL is today.

- Create one Neon project and database for this preview, in a region close to Render's `frankfurt` region where Neon offers one (a European region), so the API and database are not routing across continents for every query.
- Copy Neon's supplied connection string directly into Render's `DATABASE_URL` environment variable (see "Provider-connection order" below) — never into chat, source code, a GitHub PR, or any document in this repository.
- The existing failed Render service (`ajani-workforce-api`, already Blueprint-managed) does not need to be deleted or recreated for this change — it is reused as-is, only its environment configuration and code change.

### PGlite stays local and CI-only

PGlite is not used inside the hosted API process at all, in any mode. It is a local, in-process, WASM-based engine; running it as the datastore for a live public process — even one that reached startup successfully — grew past Render Free's 512 MiB memory limit under real use. PGlite remains exactly where it already worked well: the default for local development (`npm run dev`) and every automated test (`npm run test:database`, `npm run test:e2e`, `npm run db:verify`). Nothing about local development or CI changes.

The hosted API's own code also no longer *loads* the PGlite runtime at all when running in PostgreSQL mode — not merely refrains from using it. `packages/database`'s connection and migration modules import the PGlite engine lazily, only on the branch that actually selects `AJANI_DATA_MODE=pglite`, so a PostgreSQL-mode process never pulls that WASM engine into memory even as dead weight.

### Startup behaviour: what runs automatically, and when

Three distinct startup behaviours exist, controlled by `AJANI_DATA_MODE` and the new `AJANI_HOSTED_PREVIEW_RESET` setting:

| Configuration | What happens at every API startup |
| --- | --- |
| `AJANI_DATA_MODE=pglite` (local development, tests) | Migrates and seeds automatically. Unchanged from before — this is the existing, already-safe local behaviour. |
| `AJANI_DATA_MODE=postgres`, `AJANI_HOSTED_PREVIEW_RESET` absent or not exactly `synthetic-preview-only` | Connects only. No migration, no reset, no seed. This is the safe default for any ordinary external PostgreSQL use — nothing destructive happens just because Postgres mode is selected. |
| `AJANI_DATA_MODE=postgres`, `AJANI_HOSTED_PREVIEW_RESET=synthetic-preview-only` (this hosted preview) | Migrates, then removes only the known synthetic-preview organisation's records (including anything a visitor created or changed), then reseeds the deterministic dataset — all inside one transaction, and all completed before the API starts listening. |

This third row is what runs on Render. Setting `AJANI_HOSTED_PREVIEW_RESET` to the wrong mode (for example, alongside `AJANI_DATA_MODE=pglite`) is treated as a configuration error and refuses to start, rather than silently doing nothing or silently running somewhere unsafe.

### Expected shared and reset behaviour

- All preview data (organisations, personas, shifts, assignments, compliance records, timesheets) is synthetic and shared across every visitor of the deployed preview — there is no per-visitor isolation.
- Any visitor's mutation (a shift request, a timesheet submission, a compliance decision) is visible to every other visitor until the next API restart.
- Unlike PGlite's own ephemeral filesystem, the Neon database itself is persistent storage — it does not lose data just because the API process restarts. The reset described above is the API *choosing* to clear and reseed its own known synthetic-preview scope every time it starts, not a side effect of losing a disk. Anything outside that scope (there should be nothing else in this database) is left alone.
- Data resets to the deterministic synthetic seed whenever the API process starts: on every redeploy, on a manual restart, and whenever Render's free-tier service spins down after inactivity and is later woken back up.
- This is expected and intentional, not a defect. Do not rely on preview mutations persisting between sessions, and never enter real workforce, patient, or client data — the preview is publicly reachable and its state is not private.

### Render cold-start limitation

Render's free web services spin down after a period of inactivity and take roughly up to a minute to restart on the next request. The application sends a non-blocking, best-effort wake-up request (`GET /live`, see `apps/web/src/hooks/useApiWakeUp.ts`) from every browser entry point — the landing page, each role workspace, and any direct or deep-link entry — so the restart begins as early as possible rather than only when the landing page is opened, and the landing page's cold-start note sets the same expectation for visitors. Inside a workspace, the status bar reports startup from bounded, non-overlapping `/ready` checks (see `apps/web/src/hooks/useServiceReadiness.ts`) and reloads the active preview queries automatically once readiness returns. `/ready` and interactive API calls may still be slow or fail during that restart window; this is a known, accepted limitation of the free tier, not an application defect.

Neon's free tier can independently suspend its own compute after its own inactivity period and resume it on the next connection, adding its own brief delay on top of Render's — most noticeable the very first time a woken-up Render process connects to a Neon branch that has also gone to sleep. `/ready` (which performs a real database query) is the honest signal for this combined cold start; `/live` intentionally does not query the database and will not reflect it.

## CORS configuration

`CORS_ALLOWED_ORIGINS` must contain the exact origin(s) allowed to call the API, comma-separated, with no paths, credentials, or wildcards. It does not appear anywhere in `render.yaml`, so Render never prompts for it and the service is created with no cross-origin browser access allowed at all — the correct safe default until a real frontend origin exists.

**After Netlify supplies its temporary production URL** (for example, an origin such as `https://<netlify-site-name>.netlify.app` — the exact value is assigned by Netlify and is not known in advance):

1. Open the Render service's Environment settings.
2. Add a new environment variable `CORS_ALLOWED_ORIGINS` and set it to that exact origin.
3. Redeploy or restart the Render service so the new value takes effect.

Because `CORS_ALLOWED_ORIGINS` is never declared in `render.yaml`, this manually-added value is not a "conflict" with anything the Blueprint manages — Render's Blueprint sync only reconciles variables the Blueprint itself declares, and documents that a resource "retains any existing environment variable values that aren't overwritten by the Blueprint." A later Blueprint sync (for example, triggered by a new commit once `autoDeployTrigger: checksPass` allows a deploy) will not remove or reset it.

**Later, once `workforce.ajanihealthcare.com` is connected** in Netlify's domain settings:

1. Add the custom origin to the same variable as a second comma-separated value, for example: `https://<netlify-site-name>.netlify.app,https://workforce.ajanihealthcare.com` (keep the temporary Netlify origin until the custom domain is verified end-to-end, then remove it once it is no longer needed).
2. Redeploy or restart the Render service again.

**Currently verified value.** `CORS_ALLOWED_ORIGINS` on the live Render service is currently set to:

```
https://ajani-workforce-preview.netlify.app,https://workforce.ajanihealthcare.com
```

Both exact origins are currently retained — the temporary Netlify origin has not been removed — with no wildcard.

No wildcard origin is ever appropriate for this API.

## Safe provider-connection order

This sequence was followed successfully for the initial public deployment, completed and verified on 2026-09-04 (see "Verified deployment" above). It remains the reusable runbook for reconnecting or recreating this topology.

1. Review and commit this code on its own branch (no provider is touched yet).
2. Create a Neon Free PostgreSQL project — this can happen at any point up to step 5; it does not depend on Render or Netlify.
3. Copy the secure connection string directly from Neon into Render's `DATABASE_URL` environment variable, on the existing `ajani-workforce-api` service — directly in the Render dashboard, never into chat, source code, GitHub, or any document in this repository.
4. Leave the existing Render service on the Free plan — it is reused as-is; nothing about its plan changes.
5. Confirm `DATABASE_URL` is actually present on the Render service **before** merging the pull request that switches `AJANI_DATA_MODE` to `postgres`. If the code merges and deploys first with no `DATABASE_URL` present, the API fails to start with a configuration error (safe, but an avoidable failed deploy) rather than falling back to anything unsafe.
6. Merge the pull request only after its GitHub checks pass.
7. Allow the Render Blueprint sync and deployment to proceed from the merged branch (`autoDeployTrigger: checksPass` means this waits for the checks in step 6 rather than racing them).
8. Verify `GET /live`, `GET /ready`, and `GET /health` against the Render service's own URL, then a representative data journey (for example, the Worker overview) to confirm the Neon-backed reset produced real, connected data.
9. Configure Netlify only after the API is confirmed healthy: create the Netlify frontend project from the same repository, supplying the real Render origin as the `VITE_API_BASE_URL` build variable, and obtain the temporary Netlify production URL.
10. Add that exact Netlify origin to Render's `CORS_ALLOWED_ORIGINS` (see "CORS configuration" above), redeploy or restart the Render service, and verify the complete browser experience end-to-end.
11. Only afterward, add `workforce.ajanihealthcare.com` in Netlify's domain settings and add that final custom origin to `CORS_ALLOWED_ORIGINS`, verifying both the temporary provider URLs and the custom domain before sharing the preview publicly.

## Verification

Before and after connecting providers, verify:

- `GET /live` on the Render origin returns `200` with a request ID (liveness only, no database query).
- `GET /ready` on the Render origin returns `200 ready` after Render finishes any cold start (allow up to about a minute on a sleeping service, plus the time for migrate-reset-seed against Neon to complete before the API starts listening).
- `GET /health` retains the established liveness contract.
- A representative preview journey succeeds end-to-end from the deployed Netlify frontend against the deployed Render API — for example, loading the Worker overview, browsing shifts, or reviewing Manager coverage — confirming real, Neon-backed data rather than a stale or empty response.
- Direct navigation to a React Router route (not just client-side navigation) returns the application rather than a 404, confirming the Netlify SPA fallback is active.
- Restarting the Render service (manually, or by letting it sleep and wake) returns the preview to its deterministic seed, confirming the hosted reset ran again on that restart.

## Rollback

If a deployment misbehaves:

1. On Render, redeploy the previous known-good build (or roll back to the prior deploy from the service's deploy history) rather than debugging live against public traffic.
2. On Netlify, restore the previous production deploy from its deploy history if the frontend build is implicated.
3. Re-verify `/live`, `/ready`, and a representative preview journey after rollback, exactly as in "Verification" above.
4. Because preview data is scoped and deliberately reset on every start, no data migration or backup restoration is needed as part of a preview rollback — restarting the Render service already returns it to the deterministic seed.
5. Rolling back to a Render deploy from *before* this Neon change would expect `AJANI_DATA_MODE=pglite` and no `DATABASE_URL` again — only relevant if rolling back that far; ordinary rollbacks (to another Neon-backed build) need no environment changes.

This mirrors the general rollback guidance in the [hosting-neutral delivery contract](hosting-contract.md#rollback), specialised for this topology.

## Removing Neon

If this topology is abandoned or replaced later:

1. Remove `AJANI_DATA_MODE`, `AJANI_HOSTED_PREVIEW_RESET`, and `DATABASE_URL` from the Render service (or replace them with whatever the new topology requires).
2. Delete the Neon project once nothing depends on it — it holds only synthetic preview data, so there is nothing to back up or migrate out first.
3. Update `render.yaml` and this document to describe whatever storage mode replaces it, following the same pattern used here.

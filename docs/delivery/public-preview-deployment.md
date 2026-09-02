# Public preview deployment: Netlify frontend, Render API

## Scope

This document describes the initial zero-cost topology for the public Ajani Workforce preview: Netlify Free hosts the static React build, and Render Free hosts the Fastify API as a separate Node service with ephemeral PGlite storage. It complements, and does not replace, the [hosting-neutral delivery contract](hosting-contract.md), which remains the provider-independent source of truth for commands, environment variables, health behaviour, and storage topology.

This preview is not a live healthcare deployment. No real patient, workforce, or client data may be entered at any point. Ajani Healthcare is a genuine operating business; the organisations, personas, and records inside this preview are fictional and synthetic, and the application is not used for live healthcare operations.

No deployment exists yet. This document prepares the configuration; it does not record a completed deployment or a live URL.

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
| Persistent disk | None (deliberately) |
| Database | None (deliberately — no managed PostgreSQL for this preview) |

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
| `AJANI_DATA_MODE` | `pglite` | See below. |
| `AJANI_PGLITE_DATA_DIR` | `/tmp/ajani-pglite` | An explicit, writable, ephemeral path. Render's own filesystem is already ephemeral per deploy/restart; `/tmp` makes that explicit rather than relying on an implicit working directory. |

`CORS_ALLOWED_ORIGINS` is **not declared in the Blueprint at all** — not even as a `sync: false` placeholder. Render's Blueprint creation flow prompts the owner for a value for every `sync: false` variable *during that initial creation*, which would force a real-looking value before any Netlify origin exists; omitting the key entirely avoids that prompt. While the variable is absent, the API's own production default applies — an empty CORS allow-list, i.e. no cross-origin browser access at all — which is exactly the safe starting state for a freshly created service with no frontend origin yet. See "CORS configuration" below for how it is added manually once the real Netlify origin is known, and why that manual addition is not lost on a later Blueprint sync.

No secrets, account identifiers, or generated provider URLs are present in either configuration file.

### Why PGlite storage is deliberately ephemeral

This preview intentionally uses `AJANI_DATA_MODE=pglite` with a `/tmp`-based data directory rather than a managed PostgreSQL database or a Render persistent disk. This is a deliberate choice for a zero-cost, single-writer, source-available preview:

- It keeps the preview at zero infrastructure cost and avoids provisioning or securing a managed database for fictional data.
- It matches the repository's existing local-development default, so the same migration and seed path is exercised in local development, CI, and preview.
- It avoids implying an operational data-retention commitment for a pre-production, synthetic-only preview.

### Expected shared and reset behaviour

- All preview data (organisations, personas, shifts, assignments, compliance records, timesheets) is synthetic and shared across every visitor of the deployed preview — there is no per-visitor isolation.
- Any visitor's mutation (a shift request, a timesheet submission, a compliance decision) is visible to every other visitor until the data resets.
- Data resets to the deterministic synthetic seed whenever the API process restarts: on every redeploy, on a manual restart, and whenever Render's free-tier service spins down after inactivity and is later woken back up.
- This is expected and intentional, not a defect. Do not rely on preview mutations persisting between sessions, and never enter real workforce or patient data — the preview is publicly reachable and its state is not private.

### Render cold-start limitation

Render's free web services spin down after a period of inactivity and take roughly up to a minute to restart on the next request. The landing page's non-blocking wake-up request (`GET /live`, see `apps/web/src/hooks/useApiWakeUp.ts`) starts that restart as soon as the static page opens, and the landing page's cold-start note sets the same expectation for visitors. `/ready` and interactive API calls may still be slow or fail during that restart window; this is a known, accepted limitation of the free tier, not an application defect.

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

No wildcard origin is ever appropriate for this API.

## Safe provider-connection order

1. Merge the reviewed deployment-preparation pull request.
2. Create the Render API service from the public repository (Render reads `render.yaml`) — it starts with no `CORS_ALLOWED_ORIGINS` configured, so it allows no cross-origin browser access yet.
3. Confirm `GET /live` and `GET /ready` succeed against the Render service's own URL.
4. Create the Netlify frontend project from the same repository, supplying the real Render origin as the `VITE_API_BASE_URL` build variable.
5. Obtain the temporary Netlify production URL.
6. Add that exact Netlify origin manually in the Render dashboard as `CORS_ALLOWED_ORIGINS`, then redeploy or restart the Render service so it takes effect.
7. Verify the temporary provider URLs together: load the Netlify URL, confirm the landing page's wake-up request reaches the Render API, and confirm a representative preview journey (for example, the Worker overview) loads real API data.
8. Only afterward, add `workforce.ajanihealthcare.com` in Netlify's domain settings.
9. Add the final custom origin to Render's `CORS_ALLOWED_ORIGINS` (alongside or in place of the temporary Netlify origin, per the CORS section above).
10. Verify both the provider URLs and the custom domain before sharing the preview publicly.

## Verification

Before and after connecting providers, verify:

- `GET /live` on the Render origin returns `200` with a request ID (liveness only, no database query).
- `GET /ready` on the Render origin returns `200 ready` after Render finishes any cold start (allow up to about a minute on a sleeping service).
- A representative preview journey succeeds end-to-end from the deployed Netlify frontend against the deployed Render API — for example, loading the Worker overview, browsing shifts, or reviewing Manager coverage.
- Direct navigation to a React Router route (not just client-side navigation) returns the application rather than a 404, confirming the Netlify SPA fallback is active.

## Rollback

If a deployment misbehaves:

1. On Render, redeploy the previous known-good build (or roll back to the prior deploy from the service's deploy history) rather than debugging live against public traffic.
2. On Netlify, restore the previous production deploy from its deploy history if the frontend build is implicated.
3. Re-verify `/live`, `/ready`, and a representative preview journey after rollback, exactly as in "Verification" above.
4. Because preview data is ephemeral and synthetic, no data migration or backup restoration is needed as part of a preview rollback — restarting either service already returns it to the deterministic seed.

This mirrors the general rollback guidance in the [hosting-neutral delivery contract](hosting-contract.md#rollback), specialised for this zero-cost, ephemeral-data topology.

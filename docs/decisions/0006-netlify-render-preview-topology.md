# ADR 0006: Netlify static frontend and separate Render API for the initial public preview

Date: 2026-09-02
Status: accepted

## Context

The portfolio preview needs a real, publicly reachable deployment to show alongside its source, without incurring hosting cost, without committing to a database with real operational guarantees, and without weakening the honest pre-production framing established by ADR 0005. The web and API are already separate runtime concerns with a hosting-neutral delivery contract (`docs/delivery/hosting-contract.md`): a static frontend build, a Fastify API reachable over HTTP, and an explicit `VITE_API_BASE_URL` seam for cross-origin deployment. The chosen topology must fit entirely within free tiers, must not require a managed database or persistent disk, and must not fold the API into serving the frontend build.

## Decision

Use Netlify Free to host the Vite/React frontend as a static site, and Render Free to host the Fastify API as an independent Node web service. The two communicate only over HTTP, using the existing `VITE_API_BASE_URL` build-time configuration and the existing CORS allow-list — no same-origin proxy, and no `@fastify/static` or equivalent folded into the API.

The Render service runs with `AJANI_DATA_MODE=pglite` and an explicit ephemeral data directory under `/tmp`. No managed PostgreSQL database and no Render persistent disk are provisioned for this initial preview. `render.yaml` and `netlify.toml` at the repository root capture this as Blueprint/static-site configuration; neither file contains a live URL, secret, or account-specific identifier. `CORS_ALLOWED_ORIGINS` is deliberately omitted from the Blueprint entirely, rather than declared as a `sync: false` placeholder: Render prompts the owner for every `sync: false` variable during the Blueprint's *initial* creation, which would force a value before any Netlify origin exists. Omitting the key means the service starts with the API's own safe production default — no cross-origin access — and the real origin is added by hand once Netlify assigns it, a manual addition that a later Blueprint sync does not disturb because the Blueprint never declares that key.

Render's Blueprint spec renamed its language-selection key from `env` to `runtime`; `render.yaml` uses the current `runtime: node` key. Render Blueprints have no dedicated key for pinning a Node version, so the current supported equivalent — a `NODE_VERSION` environment variable matching the repository's pinned version — is used instead. `render.yaml` also sets `region: frankfurt` — Ajani Healthcare and this preview's principal expected audience are UK-based, and Frankfurt is the closest currently supported Render region; a service's region cannot be changed after creation, so it is chosen deliberately up front rather than defaulting to Render's Oregon default. This is a proximity choice, not a latency or service-level guarantee. It also sets `autoDeployTrigger: checksPass` (the current field, superseding the deprecated `autoDeploy` boolean) so that deploys after the first one only proceed once the linked commit's CI checks pass.

## Consequences

- Zero hosting cost for the initial public preview, at the cost of a Render free-service cold start of up to roughly a minute after inactivity. The landing page's non-blocking wake-up request and its cold-start explanation set this expectation honestly rather than hiding it.
- Preview data is shared across all visitors and resets to the deterministic synthetic seed on every Render restart, redeploy, or free-tier sleep/wake cycle. This is acceptable for a synthetic, fictional preview and is documented in `docs/delivery/public-preview-deployment.md`; it would not be acceptable for any deployment handling real data.
- Cross-origin calls require an explicit, exact-origin CORS configuration on Render rather than same-origin simplicity. This is manual, ordered work (Netlify origin first, then the custom subdomain later) rather than a wildcard shortcut, preserving the existing strict CORS posture.
- No managed database, backup, high-availability, or production-hosting claim is made by this decision. It selects a topology for a public preview, not a production healthcare-hosting approval.
- A later move to an always-on service tier, a managed database, or a single-origin topology (for example, the API serving the built frontend) remains possible without changing the application code, because the split already depends only on `VITE_API_BASE_URL` and `CORS_ALLOWED_ORIGINS` rather than a same-origin assumption baked into either app.

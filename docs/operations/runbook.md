# Synthetic preview operational runbook

## Start and verify

Install with `npm ci`, run `npm run build`, apply the configured migrations, and start the API with `npm run start:api`. A same-origin static runtime serves `apps/web/dist` with SPA fallback while proxying API and operational routes to Fastify.

Verify in order:

1. `GET /live` returns `200` and a request ID.
2. `GET /ready` returns `200 ready` after its database query.
3. `GET /health` retains the established contract.
4. A representative preview collection returns `200` with `source: synthetic-preview`.
5. A valid idempotent mutation succeeds, its replay returns the stored result, and an invalid or conflicting request returns a safe 4xx envelope.

Never place secrets, raw request bodies, evidence notes, database URLs, or local paths in public diagnostics. Structured application logs include method, route template, status, request ID, and safe error category; configured redaction covers common authorization, cookie, password, token, and connection fields.

## Readiness failure

A `503 not_ready` means the process is alive but its required database query failed. Correlate the response request ID with logs, then check storage availability, write permissions, migration state, and configured data mode. The response intentionally provides no internal cause. Do not route preview traffic until readiness recovers.

## PGlite corruption or interrupted storage

1. Stop the API so no process has the embedded directory open.
2. Confirm the exact configured `AJANI_PGLITE_DATA_DIR`; never delete a parent or workspace root.
3. Preserve a copy for diagnosis if its contents matter.
4. Restore the last known-good complete directory, or move the damaged directory aside and start with a new empty directory.
5. Run migrations and `npm run db:seed`, then check `/ready` and representative journeys.

For a disposable local preview only, `npm run db:reset:preview` safely resets known synthetic rows. It is not a general database repair command and it refuses PostgreSQL mode.

## Rate limiting and CORS

Tune rate limits only from measured preview traffic. A rejected request returns `429 RATE_LIMITED`, a request ID, draft-standard rate headers, and `retry-after`. Health/readiness probes remain available. Configure only exact web origins; production has no default cross-origin grant. `TRUST_PROXY=loopback` is appropriate only when a trusted local proxy supplies the client address.

## Graceful shutdown

Send `SIGTERM` for a normal release or rollback. Fastify stops, active connections close, and then the database connection closes. If the bounded timeout expires, remaining connections are force-closed and the process records a failed exit. Investigate repeated forced shutdowns before returning the release to service.

## Backup, reset, and recovery ownership

A persistent preview needs an owner-defined schedule and retention policy for complete, stopped PGlite directory copies or reviewed provider snapshots. Exercise restoration before relying on it. An ephemeral preview deliberately loses mutations on restart. Never operate multiple PGlite writers over one directory.

## Incident boundary

This repository has no authenticated users, customer data, patient data, or real workforce records. If any such data is accidentally supplied, stop processing it, preserve only the minimum evidence required for response, notify the repository owner privately, and remove it through an owner-approved procedure. Do not copy sensitive material into issues or logs.

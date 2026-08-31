# Architecture overview

## Purpose

Ajani is a modular monolith with a browser application, a Fastify API, shared runtime contracts, and a PostgreSQL data workspace. The implementation includes persistent synthetic Worker shifts and timesheets, Manager assignment/shift/timesheet decisions, and Administrator compliance review inside the preview namespace. It does not imply authentication, authorization, payroll, or production workforce transactions.

## System context

```text
Browser / React Router
        |
        | TanStack Query + validated JSON
        v
Fastify preview routes ---- packages/contracts
        |
        | services + typed repository interface
        v
packages/database
        |
        +---- PGlite local/test
        |
        +---- postgres.js external PostgreSQL
```

Vite proxies `/api`, `/health`, `/live`, and `/ready` to Fastify during local development and production preview testing. Both data modes use the same Drizzle schema, reviewed SQL migration, repository mappings, and deterministic seed definitions.

## Workspace boundaries

### `apps/web`

- Owns browser routing, role-preview state, rendering, accessibility behaviour, and request-state presentation.
- Uses one query-client policy and typed query keys.
- Validates every API response against shared contracts and does not import persisted-domain fixtures.

### `apps/api`

- Owns HTTP validation, versioned routes, response envelopes, correlation IDs, safe errors, explicit CORS, bounded request sizes/timeouts, preview rate limiting, redacted structured logs, health/readiness, and process lifecycle.
- Keeps route handlers thin; services translate repository absence and cursor errors into transport behaviour.
- Starts local PGlite safely, while external PostgreSQL migrations and seed remain explicit operations.

### `packages/contracts`

- Owns Zod request, query, header, mutation response, pagination, status, and error schemas.
- Exports inferred TypeScript types so compile-time and runtime boundaries remain aligned.

### `packages/database`

- Owns configuration, connections, Drizzle schema, reviewed migrations, deterministic seed, cursor encoding, domain mapping, and repository implementation.
- Uses joined and batched aggregate queries for bounded collections, plus transactions with consistent actor, shift, assignment, compliance-record, and timesheet row locks.

## Request lifecycle

Fastify validates parameters, query strings, bodies, and idempotency headers, invokes a service, and validates the response envelope before sending it. The repository scopes persona and organisation queries, maps snake_case database values to contract types, and returns opaque cursors for growing collections. Expected 400, 404, 409, 422, and 503 conditions use safe error codes; unexpected failures return a generic 500 without SQL, paths, or configuration.

The browser passes cancellation signals to queries, retries only bounded transient reads, does not automatically retry mutations, and validates mutation results. A secure browser UUID supplies each operations idempotency key. Successful changes invalidate only connected operations, compliance, timesheet, readiness, schedule, coverage, and notification query families without fabricating optimistic success. Conflict handling announces the stale state and refreshes affected server data. A role-preview change selects the matching deterministic persona identifier and query key. It does not confer access.

## Operational consistency

Manager assignment approval and Worker shift request both lock the affected shift before capacity is counted. Manager decisions additionally check the assignment version and revalidate active status, organisation, role, effective readiness, time, and overlap. Shift cancellation updates the shift, all active assignments, Worker notifications, and activity as one unit.

Compliance review records a bounded note and immutable history event, updates the linked competency, derives the Worker profile's effective readiness from all mandatory records, and adds generic activity/notification text without logging evidence or note contents. Manager assignment decisions consume that same derived readiness value.

Timesheet creation is restricted to a completed confirmed assignment under the fixed preview clock. One assignment has one timesheet. Submission and Manager decisions lock and version-check the row; approved entries are terminal, while rejected entries can be corrected and resubmitted. Administrator oversight remains read-only and no financial value is derived.

Every operations mutation runs under an actor-scoped UUID idempotency key. The repository stores a fingerprint and successful contract response for replay. Contradictory key reuse and optimistic-version conflicts are safe `409` results. See [ADR 0004](../decisions/0004-operational-lifecycles-and-concurrency.md).

## Configuration and lifecycle

The API validates listener, proxy trust, exact CORS origins, body size, timeouts, shutdown bounds, rate limits, and log level before listening. Database mode validation is separate: PGlite is the documented local default; `postgres` requires a valid `DATABASE_URL` and never falls back. `SIGINT` and `SIGTERM` close Fastify and the database connection, while fatal process events are logged and close the runtime with a failed exit. Application construction remains independent for injection-based API tests.

`/health` and `/live` prove process liveness. `/ready` executes a required database query and returns only `ready` or `not_ready`. Operational routes are not rate limited; versioned preview routes use a bounded, process-local limit. Production grants no cross-origin access unless exact HTTP(S) origins are configured.

## Quality boundaries

Strict TypeScript and type-aware ESLint cover source, tests, configuration, and Playwright. PGlite tests run with one worker on Windows. Integration tests apply migrations to isolated databases, seed twice, check constraints, and validate repository output with the same schemas used at the HTTP boundary. A delivery verifier compares first-seed, second-seed, and post-reset snapshots in a temporary PGlite directory.

The browser runner starts built API and web processes on isolated ports against a migrated and seeded in-memory PGlite database, waits on bounded readiness checks, rejects browser console/page errors, and cleans up every process. Representative role pages run axe WCAG A/AA checks, with separate keyboard, focus, reduced-motion, mobile overflow, and route-movement assertions. CI also runs one actual PostgreSQL last-place race; this provides server-scheduler evidence without treating PGlite as equivalent.

Worker shift and cross-role operational pages are grouped into lazy route chunks. A stable accessible loading surface preserves focus and layout while the chunk loads. The production budget limits entry and individual JavaScript chunks to 480,000 bytes and total JavaScript to 550,000 bytes.

The API injects `2026-08-28T12:00:00.000Z` for deterministic future/completed rules. Authentication, authorization, uploads, payroll, messaging, production notifications, deployment, and operational PostgreSQL administration remain outside the current boundary.

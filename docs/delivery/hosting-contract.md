# Hosting-neutral delivery contract

## Scope

This contract describes a future deployment of the synthetic Ajani preview. It does not record a live deployment or select a hosting provider. The web and API are separate runtime concerns; the API remains a single modular monolith with one configured database writer.

## Build and start contract

| Concern | Command | Result |
| --- | --- | --- |
| Install | `npm ci` | Exact dependency tree from `package-lock.json`. |
| Web | `npm run build:web` | Static assets in `apps/web/dist`. |
| API | `npm run build:api` | Node.js output in `apps/api/dist` plus built workspace dependencies. |
| API start | `npm run start:api` | Fastify listens on validated `HOST` and `PORT`. |
| Browser gate | `npm run test:e2e` | Production bundles plus isolated Chromium journeys and accessibility checks. |

The static host must rewrite unknown application paths to `index.html` so direct React Router URLs load correctly. `/api`, `/health`, `/live`, and `/ready` must reach the API instead of the SPA fallback. If the web and API use different origins, set `VITE_API_BASE_URL` when building the web bundle and allow that exact web origin through `CORS_ALLOWED_ORIGINS`.

## API environment

| Variable | Requirement and behavior |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production`; defaults to `development`. |
| `HOST` / `PORT` | Valid listener hostname and port; defaults to `127.0.0.1:3000`. A public runtime normally supplies `0.0.0.0` intentionally. |
| `LOG_LEVEL` | Pino level; defaults to `info`. Logs are structured and redact common credential-bearing fields. |
| `TRUST_PROXY` | `false` or `loopback`; defaults to `false`. Enable only when the runtime topology matches. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated exact HTTP(S) origins without paths or credentials. Production defaults to no cross-origin access. |
| `BODY_LIMIT_BYTES` | 1,024 to 1,048,576; defaults to 65,536. |
| `CONNECTION_TIMEOUT_MS` | 1,000 to 120,000; defaults to 10,000. |
| `KEEP_ALIVE_TIMEOUT_MS` | 1,000 to 120,000; defaults to 5,000. |
| `REQUEST_TIMEOUT_MS` | 1,000 to 120,000; defaults to 15,000. |
| `SHUTDOWN_TIMEOUT_MS` | 1,000 to 60,000; defaults to 10,000. |
| `RATE_LIMIT_MAX` | 1 to 10,000 preview API requests per window and process; defaults to 120. |
| `RATE_LIMIT_WINDOW_MS` | 1,000 to 3,600,000; defaults to 60,000. |
| `AJANI_DATA_MODE` | `pglite` or `postgres`; defaults to `pglite`. |
| `AJANI_PGLITE_DATA_DIR` | Explicit absolute writable persistent path recommended for hosted PGlite. |
| `DATABASE_URL` | Required only for `AJANI_DATA_MODE=postgres`; must use `postgres://` or `postgresql://`. |
| `VITE_API_BASE_URL` | Web build-time API origin. Leave empty for same-origin routing. |

Invalid configuration fails startup; it never silently changes database mode or broadens proxy/CORS trust.

## Health and lifecycle

- `GET /health` preserves the established liveness contract.
- `GET /live` is the explicit liveness alias and does not query the database.
- `GET /ready` performs a bounded database query and returns `200 ready` or `503 not_ready` without connection details.
- Every response carries `x-request-id`. Errors omit stack traces, SQL, environment values, and paths.
- `SIGINT` and `SIGTERM` stop accepting work, close Fastify, and close the database. A bounded shutdown fallback closes remaining connections and records failure.

Health endpoints are excluded from preview rate limiting so an orchestrator can assess the process. Rate limiting is process-local and protects the public synthetic preview from casual request bursts; it is not a distributed abuse-prevention system.

## Storage topology

PGlite requires one writable persistent directory. A persistent deployment must mount that directory outside the immutable application release and define backup, restore, and reset ownership. An ephemeral filesystem resets the preview when the runtime restarts.

Do not horizontally scale multiple API writers over one embedded PGlite directory. Use one API writer, or design and verify a separate server-database topology using the existing PostgreSQL adapter. The CI PostgreSQL job verifies a bounded concurrency case; it does not establish production operations, high availability, backup, or horizontal scalability.

## Migration, seed, reset, backup, and recovery

1. Back up persistent data before changing the release or applying a new migration.
2. Run `npm run db:migrate` against the intended configured database.
3. Run `npm run db:seed` only when deterministic fictional preview records are desired.
4. Verify `/ready`, then representative read and mutation responses.
5. Use `npm run db:reset:preview` only for an explicitly configured PGlite preview. It removes and recreates known synthetic records; it is rejected for PostgreSQL.

For a PGlite backup, stop the API, copy the complete configured data directory atomically, and restart. Recovery restores the complete directory while the API is stopped, then checks `/ready`. A provider-specific snapshot may replace the copy only after its consistency guarantees are reviewed.

## Rollback

Stop traffic to the failing API release, shut it down gracefully, restore the last compatible application artifact, and restore the pre-release database backup if the migration is not backward compatible. Start one writer, verify `/live` and `/ready`, exercise a representative read, valid mutation, invalid request, and conflict, then restore traffic. Never treat deterministic reseeding as a substitute for preserving intentionally persistent preview mutations.

## Preview boundary

All supplied data is fictional. Role switching is not authentication or authorization. The preview must not accept patient, employee, client, payroll, credential, or compliance-evidence data. No deployment, availability objective, certification, customer use, or clinical integration is claimed.

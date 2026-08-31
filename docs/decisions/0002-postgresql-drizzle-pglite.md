# ADR 0002: Use one PostgreSQL model across local and external data modes

- Status: Accepted
- Date: 2026-08-25

## Context

Checkpoint 3 moves the synthetic product scenarios from browser-owned fixtures to a relational data foundation. The worker, manager, and administrator previews need genuine joins, constraints, migrations, deterministic seed data, and API-level integration tests. Local contributors and automated checks must be able to use that foundation without Docker or a separately installed database.

The implementation also needs a clear route to an externally operated PostgreSQL service. Local convenience must not create an implicit fallback that could hide an invalid external configuration or direct preview-reset operations at an external database.

## Decision

Add `packages/database` as the owner of the Ajani relational schema, reviewed SQL migrations, database configuration, deterministic synthetic seed, and Drizzle repository implementation.

Use PostgreSQL as the single database dialect and Drizzle ORM as the typed schema and query layer. Use Drizzle Kit to review and maintain SQL migrations rather than synchronising the schema at application runtime.

Support two explicit data modes through `AJANI_DATA_MODE`:

- `pglite` is the default for local development and automated tests. It runs the PostgreSQL-compatible migration and seed against an ignored local data directory or an isolated in-memory test database.
- `postgres` uses postgres.js and requires `DATABASE_URL`. Invalid or incomplete external configuration stops startup; it never falls back to PGlite.

Both modes use the same Drizzle schema, SQL migrations, deterministic identifiers, application-facing domain mapping, and repository interface. The API depends on that interface rather than on route-level database calls.

The preview reset command is deliberately named `db:reset:preview` and is restricted to PGlite. External PostgreSQL databases may be migrated and explicitly seeded, but are never reset automatically.

## Rationale

One PostgreSQL model prevents local tests from exercising a different SQL dialect from the external runtime. PGlite keeps the normal development path self-contained while retaining PostgreSQL types, foreign keys, checks, indexes, and transaction behaviour. Drizzle keeps schema and query types close to the SQL model without introducing a broader application framework.

The repository boundary keeps Fastify handlers focused on HTTP concerns and allows API tests to inject controlled success, not-found, and failure behaviour. It also provides a replaceable seam if connection infrastructure changes later without changing the versioned preview contracts.

## Consequences

- Database changes require a reviewed SQL migration and matching schema update.
- Deterministic seed operations are idempotent and all seeded scenarios remain explicitly synthetic.
- Local database files stay outside version control.
- The PGlite engine is single-process and intended for local preview and test use, not production-scale claims.
- External PostgreSQL lifecycle, backups, credentials, pooling limits, and operational monitoring remain deployment responsibilities outside this checkpoint.
- Authentication and transactional workforce workflows can later call the same service and repository boundaries, but neither is implemented or implied by this decision.

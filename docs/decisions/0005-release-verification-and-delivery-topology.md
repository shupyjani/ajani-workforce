# ADR 0005: Verify releases without selecting a hosting provider

Date: 2026-08-29
Status: accepted

## Context

The portfolio preview needs repeatable release evidence, browser-level journey coverage, a real PostgreSQL concurrency check, and an honest future-hosting boundary. It must remain provider-neutral and must not imply that a local embedded database is horizontally scalable or that the preview has authentication.

## Decision

Use one least-privilege GitHub Actions workflow for pushes to `main` and pull requests. The primary job installs the lockfile under the pinned Node version, runs lint and every typecheck/unit suite, verifies a clean migration plus deterministic seed/reset, builds production bundles, enforces the web budget, runs Chromium journeys and axe checks against an in-memory PGlite database, and audits production dependencies. Superseded runs are cancelled and browser diagnostics are retained only after failure.

Use a separate PostgreSQL 17 service job for bounded contention scenarios through the existing postgres.js/Drizzle adapter: last-place contention for a shift, readiness/approval linearization between an Administrator compliance decision and a Manager assignment approval for the same Worker, and Manager/Worker cancellation racing for the same shift and assignment. This verifies independent server clients and the repository's row-lock behavior without pretending that PGlite exposes PostgreSQL's independent deadlock scheduler.

The canonical lock order remains:

1. Actor row where actor serialization applies.
2. Worker profile for readiness-sensitive operations.
3. Shift.
4. Assignment rows in stable identifier order.
5. Compliance record after the Worker profile.

Use grouped route-level lazy loading for Worker shift and cross-role operational workflows. Enforce uncompressed production JavaScript budgets of 480,000 bytes for the entry and any single chunk, and 550,000 bytes in total. These budgets preserve headroom while preventing return to the former 525.91 kB entry chunk.

Define hosting by commands, paths, environment variables, health behavior, lifecycle, and storage topology rather than provider configuration. PGlite hosting is single-writer only. External PostgreSQL support is an adapter and migration path that receives bounded CI coverage, not a claim of complete production operations.

## Consequences

- Pull requests and `main` pushes have deterministic quality gates without secrets, AI review, deployment, or generated repository comments.
- Playwright failure output remains outside tracked paths and can be retained briefly by CI.
- Automated axe checks supplement rather than replace manual screen-reader, contrast, zoom, keyboard, and physical-device testing.
- The PostgreSQL job increases CI time but supplies evidence unavailable from PGlite alone.
- No container or provider artifact is added because neither is necessary to express or verify the current runtime contract.
- Authentication, distributed rate limiting, high availability, production observability, backup automation, provider selection, and deployment remain future work.

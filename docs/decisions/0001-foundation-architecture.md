# ADR 0001: Establish the TypeScript workspace foundation

- Status: Accepted
- Date: 2026-08-25

## Context

Ajani Workforce Platform needs a credible product entry point and an engineering foundation that can grow into worker, manager, and administrator journeys. The current scope contains one browser experience and one health endpoint. The architecture should make responsibilities clear without creating speculative services or generic packages.

## Decision

Use an npm workspace with three packages:

- `apps/web` for the React and Vite browser application.
- `apps/api` for the Fastify server application.
- `packages/contracts` for runtime schemas and transport types consumed by both applications.

Use TypeScript throughout with strict, runtime-specific compiler configurations. React provides a component model suited to the planned role-based journeys, while Vite provides a focused browser development and production-build pipeline.

Use Fastify for HTTP routing, request lifecycle hooks, logging integration, and injection-based testing. Keep application construction separate from process startup.

Use Zod schemas in the contracts package for payloads that currently cross the browser and API boundary. Infer transport types from the runtime schemas rather than maintaining duplicate interfaces.

Evolve the backend as a modular monolith. PostgreSQL is the planned relational data store and Drizzle is the planned schema and query layer when persistence enters scope. They are directions, not current dependencies or capabilities.

## Rationale

The workspace creates clear ownership while retaining one installation, lockfile, verification command, and review surface. A small shared-contract boundary is justified because both current applications validate the health payload. A general configuration package is not justified because configuration does not yet have multiple consumers.

React and TypeScript make state and interface contracts explicit at the product boundary. Fastify supplies the server behavior needed now without imposing a larger application framework. The modular-monolith direction allows domain modules to develop with strong boundaries while transactions, local development, and operational ownership remain straightforward.

Service decomposition is intentionally avoided. The current system has no demonstrated independent scaling, deployment, security, or ownership boundary that would outweigh distributed-system complexity.

## Consequences

- All workspaces share one Node.js and npm toolchain and one dependency lockfile.
- Shared contracts must remain transport-focused and must have more than one real consumer.
- Browser-only and server-only APIs are checked by separate TypeScript configurations.
- API modules can be extracted later if operational evidence establishes a genuine boundary.
- Persistence decisions will require a later record covering schema ownership, migrations, transactions, and local development.

# ADR 0003: Protect worker shift mutations with transactions and idempotency

- Status: Accepted
- Date: 2026-08-27

## Context

Checkpoint 4 adds the first persistent preview mutations: a worker can request a synthetic shift and cancel a future assignment. Capacity, schedule overlap, readiness, assignment history, activity, and notifications must remain coherent when requests overlap, a connection is retried, or a worker reuses a previously cancelled assignment.

Client-side disabled controls are useful feedback but cannot protect shared capacity. Retrying an ambiguous network result must not create duplicate side effects. The design must remain usable in both PGlite and external PostgreSQL modes without runtime schema synchronisation.

## Decision

Run request and cancellation commands in database transactions behind the typed repository boundary. The request locks the target shift row before evaluating current assignments and reserved capacity. Confirmed and under-review assignments reserve capacity; cancellation preserves assignment history and reopens a covered shift when a place is released.

Require a validated `Idempotency-Key` header on both mutation routes. Scope each key to a worker profile and operation, and store a compact material-request fingerprint with the successful status and response payload. A matching replay returns the stored outcome. Reusing a key for a different shift or assignment returns `IDEMPOTENCY_CONFLICT`. Records have a 30-day retention window and are replaced only after expiry.

The browser generates a secure UUID per confirmation and does not automatically retry mutations. After success it invalidates every affected worker, manager, and notification query; it does not render optimistic assignment success.

## Rationale

The row lock serialises contenders for the last place using database behaviour rather than process-local state. One transaction makes assignment, capacity status, activity, notification, and replay outcome atomic. Operation-scoped keys allow the same textual key to be used independently for request and cancellation while preventing material payload changes within an operation.

## Consequences

- Mutation callers must provide an idempotency key between 8 and 128 safe characters.
- Fully ready workers confirm; reviewing workers enter under review; action-due workers receive a readiness-required response.
- Expected concurrency and eligibility failures use stable 409 or 422 errors and create no partial side effects.
- Cancelled assignments remain queryable history and may be restored by a later valid request.
- PGlite provides mandatory integration coverage, including concurrent last-place requests; production-scale load characteristics are not claimed.
- A future manager workflow may build on the under-review state, but no approval interface or authorization boundary is introduced here.

Checkpoint 5 implements the Manager transition under [ADR 0004](0004-operational-lifecycles-and-concurrency.md) and generalises the physical idempotency scope to actor member plus operation. The Worker request/cancellation contract and the absence of an authorization boundary remain unchanged.

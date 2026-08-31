# ADR 0004: Operational lifecycles and concurrency

- Status: Accepted
- Date: 2026-08-28

## Context

Checkpoint 5 introduces Manager assignment decisions and shift authoring, Administrator compliance decisions, and Worker-to-Manager timesheets. These actions affect several connected views and can be repeated, submitted from stale browser state, or race for limited capacity. The local PGlite preview and external PostgreSQL mode must use the same rules and schema.

The application still has no authentication or authorization. Persona identifiers select deterministic synthetic scope only; they are not security credentials.

## Decision

Use explicit persisted lifecycles with database constraints, version-checked writes, actor-scoped UUID idempotency keys, and short transactions that lock affected rows in a consistent order.

The canonical row-lock order is:

1. Lock the acting persona row when the workflow uses actor serialization, then resolve idempotent replay.
2. For a readiness-sensitive operation, lock the affected Worker profile as the eligibility serialization row.
3. Lock the shift before any assignment belonging to that shift.
4. Lock assignments in stable identifier order when a shift operation affects more than one assignment.
5. For a compliance decision, lock the compliance record after the affected Worker profile.

A non-locking identifier lookup may precede these locks when the target shift or Worker profile cannot otherwise be discovered. The transaction then locks rows in the canonical order and reloads every authoritative lifecycle, version, scope and eligibility value before writing. A changed relationship or version is treated as a safe domain conflict. Any future workflow that changes Worker identity fields used by eligibility must also use the Worker profile as its serialization row before changing those fields.

- Assignment decisions lock the Manager actor and, for approval, the target Worker profile before locking the shift and assignment. Approval reloads and revalidates lifecycle, version, future time, capacity, active worker status, organisation, role, effective readiness, and overlap only after those locks are held. Capacity is counted after the shift lock. A decline uses the same shift-before-assignment order without taking the readiness lock it does not depend on.
- Worker shift requests lock the Worker profile before the shift and any reusable cancelled assignment. Worker assignment cancellation performs a preliminary shift lookup, then locks the shift before the assignment and reloads the terminal state before changing capacity.
- Manager shifts use `draft`, `open`, `covered`, `cancelled`, and derived `completed` states. Only future drafts are editable or publishable. Cancellation locks the shift, locks active assignments in stable identifier order, reloads authoritative state, cancels the remaining active assignments, and writes notifications and activity in the same transaction.
- Compliance records use `current`, `due_soon`, `action_due`, `reviewing`, `information_required`, and `rejected`. A decision locks the affected Worker profile before the compliance record, then writes immutable review history, updates the related competency, derives effective Worker readiness from mandatory records, and writes connected activity and notification rows transactionally.
- Timesheets use `draft`, `submitted`, `rejected`, and `approved`. A unique assignment relationship prevents duplicates. Database checks enforce time ordering, the 24-hour interval bound, non-negative breaks shorter than the interval, calculated minutes, lifecycle timestamps, reviewer presence, versions, and note bounds.
- Approved timesheets are terminal in Checkpoint 5. Submitted entries are Worker read-only; rejected entries may be corrected and resubmitted.
- Mutations store a compact request fingerprint and contract-valid response for 30 days. Matching replays return the stored result; contradictory key reuse returns `IDEMPOTENCY_CONFLICT`.
- Every concurrent write supplies an expected positive version. Stale writes return a safe `VERSION_CONFLICT` response and the browser refreshes the affected query families.
- Read endpoints use joined and aggregate queries with bounded cursor pagination. Mutation responses are server-confirmed; the browser does not use optimistic success or automatic mutation retries.

The deterministic runtime clock is `2026-08-28T12:00:00.000Z`. It makes future-shift and completed-assignment rules repeatable independently of the machine wall clock.

## Consequences

- Connected coverage, schedule, readiness, timesheet, notification, and activity state commits or rolls back together.
- Concurrent contenders cannot both consume the last assignment place.
- An assignment approval and compliance decision for the same Worker have a single order at the Worker-profile lock. A compliance action that commits first prevents a later approval; an approval that commits first remains confirmed if a later compliance action changes readiness because Checkpoint 5 does not retroactively cancel confirmed work.
- Manager and Worker cancellation cannot form a shift/assignment lock cycle. The operation that obtains the shift lock first establishes the assignment outcome, and the follower either applies a compatible shift outcome or receives the existing lifecycle conflict.
- PGlite exercises the same reviewed SQL and transaction paths as PostgreSQL, while external PostgreSQL operation still requires owner-managed configuration and verification.
- Actor locking deliberately serializes mutations made by the same preview persona. This is proportionate for the deterministic portfolio workload and simplifies idempotency races.
- Future authentication can provide the authenticated member and organisation scope to the same commands. Until that work exists, no route or role-preview control is an authorization boundary.
- Payroll, invoicing, document evidence, uploads, production messaging, and clinical information remain outside the data model.

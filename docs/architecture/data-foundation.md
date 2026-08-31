# Data foundation

## Entity relationships

```mermaid
erDiagram
  organisations ||--o{ locations : contains
  organisations ||--o{ workforce_members : includes
  organisations ||--o{ competencies : defines
  organisations ||--o{ compliance_requirements : defines
  organisations ||--o{ shifts : schedules
  organisations ||--o{ activity_events : records
  locations ||--o{ workforce_members : home_location
  locations ||--o{ shifts : hosts
  workforce_members ||--o| worker_profiles : has
  workforce_members ||--o{ notifications : receives
  workforce_members o|--o{ activity_events : subject_or_actor
  worker_profiles ||--o{ worker_competencies : holds
  competencies ||--o{ worker_competencies : classifies
  competencies o|--o{ compliance_requirements : supports
  worker_profiles ||--o{ compliance_records : holds
  compliance_requirements ||--o{ compliance_records : evaluates
  compliance_records ||--o{ compliance_review_events : records
  workforce_members ||--o{ compliance_review_events : decides
  shifts ||--o{ shift_assignments : has
  worker_profiles ||--o{ shift_assignments : receives
  shift_assignments ||--o| timesheets : records
  worker_profiles ||--o{ timesheets : submits
  workforce_members o|--o{ timesheets : reviews
  workforce_members ||--o{ idempotency_records : scopes
  shifts o|--o{ activity_events : concerns
```

All tables use UUID primary keys, snake_case names, and timezone-aware audit timestamps. Foreign keys declare restrictive, cascading, or nullifying deletion according to record ownership. Unique constraints protect slugs, preview references, one profile per worker, one competency or requirement per profile, duplicate shift assignments, one timesheet per assignment, and actor-operation idempotency keys. Checks constrain status values, positive counts, shift and worked-time ordering, 1â€“24-hour durations, break and calculated-minute invariants, cancellation/review metadata, lifecycle timestamps, note lengths, versions, idempotency operations, and retention windows. Query indexes cover organisation, persona type, readiness, shift windows, assignments, compliance history, timesheet queues, idempotency lookup/expiry, notifications, and activity ordering.

The database deliberately contains no patient, clinical-record, payroll, booking, upload, or messaging tables.

## Modes and lifecycle

`AJANI_DATA_MODE=pglite` is the local and test default. Its ignored on-disk directory is `.ajani-data/pglite`; automated tests use isolated `memory://` databases. The API applies the reviewed migration and idempotent seed during local PGlite startup so the complete preview runs without Docker.

`AJANI_DATA_MODE=postgres` uses postgres.js and requires `DATABASE_URL`. Configuration failure stops startup without changing modes. External migrations and seeds are explicit owner operations:

```powershell
$env:AJANI_DATA_MODE = 'postgres'
$env:DATABASE_URL = 'postgresql://user:password@host/database'
npm.cmd run db:migrate
npm.cmd run db:seed
```

The example URL is a placeholder. Do not commit credentials or environment files. `db:reset:preview` checks the active mode before connecting and is restricted to PGlite.

## Migration and seed

The Drizzle schema is the typed source mapping; `packages/database/migrations` contains the reviewed SQL applied in both modes. Migration `0001_worker_shift_journey.sql` adds the Worker request/cancellation journey. Migration `0002_operations_compliance_timesheets.sql` upgrades that exact Checkpoint 4 schema with shift/review versions and lifecycle metadata, compliance decisions/history, actor-scoped idempotency, expanded activity types, and constrained timesheets. Both clean migration and an upgrade from migrations `0000` + `0001` are tested. Runtime schema synchronisation is not used.

Seed identifiers, dates, names, relationships, statuses, and counts are stable. Inserts run in dependency order inside a transaction and ignore conflicts on deterministic primary keys, making repeated seed runs idempotent. Reset removes runtime activity, notifications, idempotency records, and assignments belonging to known preview identities before rebuilding the deterministic scenario.

## Worker assignment rules

- Only an active worker in the same organisation and with the exact shift role may request a shift.
- `confirmed` and internal `review` assignments reserve capacity; cancelled history does not.
- A shift is available only when it is future-facing under the injected reference clock, open, and has positive `required_workers - reserved_workers` capacity.
- Discovery `From` and `To` boundaries are inclusive and compare the shift start date after converting `starts_at` into the shift location's timezone. The end date of an overnight shift does not determine discovery inclusion.
- Any intersecting confirmed or under-review assignment blocks the request. A duplicate active worker/shift assignment is rejected.
- `ready` workers confirm deterministically. `reviewing` workers create an under-review assignment that reserves capacity. `action_due` workers are blocked with a readiness explanation.
- A previously cancelled worker/shift row is restored for an otherwise valid request, clearing cancellation metadata and incrementing its version.
- Only future confirmed or under-review assignments may be cancelled. Cancellation preserves the row, timestamp, reason, and version history; if capacity is released from a covered shift, that shift reopens.

The request transaction locks the target shift before recalculating rules and capacity, so concurrent contenders cannot both consume the last place. Request and cancellation each write the assignment, shift status where needed, notification, activity event, and idempotency outcome in one transaction or roll back together.

Idempotency keys are scoped to actor member and operation and stored with a compact request fingerprint plus the successful response. Operations HTTP mutations require UUID keys; the preserved worker shift endpoints retain their established validated key contract. A matching replay returns the original outcome without duplicate side effects; a changed payload conflicts. Records expire after 30 days and an expired record is removed when its key is reused.

## Manager operations rules

- An assignment is reviewable only while its state is internal `review`, the shift is future and `open` or `covered`, and the supplied assignment version is current.
- Approval rechecks active Worker status, organisation and exact role compatibility, effective readiness, available confirmed capacity, and overlap with all confirmed or under-review assignments.
- The shift is locked before capacity is counted; concurrent last-place approvals therefore have one valid winner. Decline is terminal, preserves a bounded reason, and releases reserved capacity.
- New shifts use an existing organisation location and supported workforce role. The start must be future and inside the 90-day preview horizon; duration is 1â€“24 hours and required capacity is 1â€“50.
- Only future drafts may be edited and published. Published shifts with assignments are not editable. Cancellation requires a 12â€“240-character reason and transactionally cancels active assignments with generic notifications and activity.

## Compliance and effective readiness

Compliance review states are `current`, `due_soon`, `action_due`, `reviewing`, `information_required`, and `rejected`. Only `reviewing` records accept an Administrator decision in this release. Decisions are `approved_current`, `further_information_required`, and `rejected`; each writes a 1â€“500-character note to review history, with at least 12 characters for non-approval outcomes.

Effective readiness is derived after every decision. A missing mandatory record, expired due date, `action_due`, `information_required`, or `rejected` record yields `action_due`. Otherwise, a `reviewing` record yields `reviewing`; only a complete remaining set yields `ready`. The linked competency and stored profile projection are updated in the same transaction so Worker readiness and Manager approval use one coherent result.

## Timesheet rules

- A Worker can create one timesheet only for their confirmed assignment after its shift ends under the fixed `2026-08-28T12:00:00.000Z` preview clock.
- Worked times may vary by at most 12 hours outside the scheduled boundary, must be ordered, and may span no more than 24 hours. Breaks are 0â€“360 minutes and shorter than the interval; `worked_minutes` is database-checked against interval minus break.
- `draft` may be edited and submitted. `submitted` is Worker read-only. Manager rejection requires a useful note and returns the entry to correction; a rejected entry remains visibly rejected while edited, then can be resubmitted. `approved` is terminal.
- Submission and review decisions are idempotent, lock the timesheet, and check its positive version. Lifecycle timestamps and reviewer references are enforced by database checks.
- Administrator queries provide status counts and related Worker/shift/facility context but no mutation authority. No pay or other financial value is stored or calculated.

## API envelopes

Successful item responses use:

```json
{
  "data": {},
  "meta": {
    "requestId": "78420e18-2a11-4d8a-bd07-baa4cc7b736f",
    "generatedAt": "2026-08-25T10:30:00.000Z",
    "source": "synthetic-preview"
  }
}
```

Paginated collections add `meta.pagination.limit` and `meta.pagination.nextCursor`. Cursors are opaque, collection-specific base64url values and use stable compound ordering. Invalid or cross-collection cursors return `INVALID_REQUEST`.

Errors use a stable code, user-safe message, request ID, and optional field details. They never include stacks, SQL, file paths, records, connection strings, or environment values.

## Current boundary

The fixed preview reference date and injected clock make time-sensitive portfolio scenarios deterministic. Persona and organisation checks are domain scoping for a fictional preview, not authorization. Future authentication can supply a verified actor and scope to the existing service commands without changing the lifecycles; it is not present now.

The canonical transactional lock order is actor where actor serialization applies, Worker profile for readiness-sensitive operations, shift, assignments in stable identifier order, then compliance record after its Worker profile. PGlite regression tests cover lock-order outcomes and idempotency. A separate CI job executes one bounded last-place race through actual PostgreSQL clients; PGlite is not claimed to reproduce PostgreSQL's independent deadlock scheduler.

No further schema change is required, so no nominal migration is added. `npm run db:verify` applies the existing migration chain to an empty temporary PGlite directory, seeds twice, resets known preview data, compares complete deterministic snapshots, closes the connection, and removes the directory.

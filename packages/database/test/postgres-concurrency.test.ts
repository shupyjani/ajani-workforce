import { count, eq, sql, type SQL } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  connectDatabase,
  createDrizzlePreviewRepository,
  migrateDatabase,
  previewIdentifiers,
  previewPersonaIds,
  seedSyntheticPreview,
  syntheticPreviewReferenceAt,
  type DatabaseConnection,
} from '../src/index.js'
import * as schema from '../src/schema.js'

const rawDatabaseUrl = process.env['AJANI_POSTGRES_TEST_URL']

if (rawDatabaseUrl === undefined) {
  throw new Error(
    'AJANI_POSTGRES_TEST_URL is required for the PostgreSQL concurrency suite.',
  )
}

const databaseUrl: string = rawDatabaseUrl

function requireRow<T>(rows: readonly T[]): T {
  const row = rows[0]
  if (row === undefined) {
    throw new Error('Expected at least one row from a synthetic coordination query.')
  }
  return row
}

/**
 * Immediately wraps a promise so its eventual outcome is captured with a
 * handler attached in the same synchronous turn it was created. This must
 * happen before any `await` that could throw (for example a lock-wait
 * timeout), otherwise a losing side's expected rejection — produced later,
 * once a released blocker lets it proceed — would have no attached handler
 * and would surface as an unhandled rejection instead of a normal test
 * assertion.
 */
function captureSettlement<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value): PromiseSettledResult<T> => ({ status: 'fulfilled', value }),
    (reason: unknown): PromiseSettledResult<T> => ({ status: 'rejected', reason }),
  )
}

/**
 * A synthetic backend session that holds a `for update` row lock until
 * explicitly released, so a test can prove another session actually queued
 * behind it (via `pg_blocking_pids`) before ever letting it proceed.
 */
interface RowBlocker {
  readonly pid: number
  readonly release: () => void
  readonly settled: Promise<void>
}

class BlockerReleased extends Error {}

async function openRowBlocker(lockQuery: SQL): Promise<RowBlocker> {
  const client = postgres(databaseUrl, { max: 1, prepare: false })
  const db = drizzle(client, { schema })
  let markLocked!: () => void
  const locked = new Promise<void>((resolve) => {
    markLocked = resolve
  })
  let triggerRelease!: () => void
  const releaseGate = new Promise<void>((resolve) => {
    triggerRelease = resolve
  })
  let pid = 0
  const settled = db
    .transaction(async (tx) => {
      const backendPidRow = requireRow(
        await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`),
      )
      pid = backendPidRow.pid
      await tx.execute(lockQuery)
      markLocked()
      await releaseGate
      throw new BlockerReleased()
    })
    .catch((error: unknown) => {
      if (!(error instanceof BlockerReleased)) throw error
    })
    .finally(async () => {
      await client.end({ timeout: 5 })
    })
  await locked
  return {
    pid,
    release: () => {
      triggerRelease()
    },
    settled,
  }
}

async function openDedicatedActor() {
  const client = postgres(databaseUrl, { max: 1, prepare: false })
  const db = drizzle(client, { schema })
  const close = async () => {
    await client.end({ timeout: 5 })
  }
  const connection: DatabaseConnection = { close, db, mode: 'postgres' }
  const backendPidRow = requireRow(
    await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`),
  )
  return {
    close,
    pid: backendPidRow.pid,
    repository: createDrizzlePreviewRepository(connection),
  }
}

/**
 * Polls `pg_blocking_pids`. Confirmed empirically against PostgreSQL 17 (a
 * CI run observed exactly this): the function reports only the session(s) a
 * backend is DIRECTLY queued behind for a lock, not the full transitive
 * chain of every session queued ahead of it. When a third backend queues
 * behind a second backend which is itself queued behind the original
 * holder, `pg_blocking_pids` for the third backend returns only the second
 * backend's PID — the original holder is not "simultaneously" blocking it
 * in the reported sense, even though it is transitively responsible.
 *
 * Proving a multi-link queue therefore requires checking each direct link
 * separately (one call per phase, expecting exactly the immediate blocker),
 * never a single call expecting more than one PID to appear at once.
 */
async function waitUntilBlockedBy(
  monitor: PostgresJsDatabase<typeof schema>,
  pid: number,
  expectedBlockerPid: number,
  timeoutMs: number,
): Promise<number[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const rows = await monitor.execute<{ blockers: number[] }>(
      sql`select pg_blocking_pids(${pid}) as blockers`,
    )
    const blockers = rows[0]?.blockers ?? []
    if (blockers.includes(expectedBlockerPid)) {
      return blockers
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out after ${String(timeoutMs)}ms waiting for backend ${String(pid)} to be blocked by ${String(expectedBlockerPid)}; observed blockers ${JSON.stringify(blockers)}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const lockWaitTimeoutMs = 5_000

describe('PostgreSQL concurrency delivery boundary', () => {
  let connection: DatabaseConnection

  function monitor(): PostgresJsDatabase<typeof schema> {
    return connection.db as PostgresJsDatabase<typeof schema>
  }

  beforeAll(async () => {
    connection = await connectDatabase({ databaseUrl, mode: 'postgres' })
    await migrateDatabase(connection)
    await seedSyntheticPreview(connection)
  })

  afterAll(async () => {
    await connection.close()
  })

  it('serializes two independent clients competing for the final shift place', async () => {
    const repository = createDrizzlePreviewRepository(connection)
    const results = await Promise.allSettled([
      repository.requestWorkerShift({
        idempotencyKey: 'postgres-concurrent-leila-0001',
        occurredAt: syntheticPreviewReferenceAt,
        shiftId: previewIdentifiers.shifts.harbourlightCedarNight,
        workerId: previewPersonaIds.worker,
      }),
      repository.requestWorkerShift({
        idempotencyKey: 'postgres-concurrent-sofia-0001',
        occurredAt: syntheticPreviewReferenceAt,
        shiftId: previewIdentifiers.shifts.harbourlightCedarNight,
        workerId: previewIdentifiers.members.sofiaBello,
      }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const assignments = await connection.db
      .select()
      .from(schema.shiftAssignments)
      .where(
        eq(
          schema.shiftAssignments.shiftId,
          previewIdentifiers.shifts.harbourlightCedarNight,
        ),
      )
    expect(assignments).toHaveLength(1)
  })

  it('deterministically linearizes a compliance decision and an assignment approval around the Worker-profile lock in both orders', async () => {
    const recordId = 'd0000000-0000-4000-8000-000000000012'
    const minaProfileId = previewIdentifiers.profiles.minaOkoro
    const workerProfileLock = sql`select ${schema.workerProfiles.id} from ${schema.workerProfiles} where ${schema.workerProfiles.id} = ${minaProfileId} for update`

    await connection.db
      .update(schema.shifts)
      .set({ status: 'open' })
      .where(eq(schema.shifts.id, previewIdentifiers.shifts.managerDraft))

    // Phase A: the compliance decision is queued ahead of the approval at the
    // Worker-profile lock, so it must linearize first. If Manager approval
    // stopped locking and revalidating the Worker profile before relying on
    // readiness, it would confirm this assignment despite the compliance
    // decision that already committed action_due underneath it — the
    // `approvalResult.status === 'rejected'` assertion below is exactly what
    // would fail under that regression.
    {
      const assignmentId = 'a1000000-0000-4000-8000-000000000001'
      await connection.db.insert(schema.shiftAssignments).values({
        assignedAt: syntheticPreviewReferenceAt,
        id: assignmentId,
        shiftId: previewIdentifiers.shifts.managerDraft,
        status: 'review',
        workerProfileId: minaProfileId,
      })

      const blocker = await openRowBlocker(workerProfileLock)
      const complianceActor = await openDedicatedActor()
      const approvalActor = await openDedicatedActor()
      expect(new Set([blocker.pid, complianceActor.pid, approvalActor.pid]).size).toBe(3)

      let complianceSettlement:
        | Promise<PromiseSettledResult<Awaited<ReturnType<typeof complianceActor.repository.decideAdministratorCompliance>>>>
        | undefined
      let approvalSettlement:
        | Promise<PromiseSettledResult<Awaited<ReturnType<typeof approvalActor.repository.decideManagerAssignment>>>>
        | undefined

      try {
        const compliancePromise = complianceActor.repository.decideAdministratorCompliance({
          administratorId: previewPersonaIds.administrator,
          body: {
            decision: 'further_information_required',
            expectedVersion: 1,
            note: 'Please confirm the synthetic role requirement renewal evidence.',
          },
          idempotencyKey: 'a1000000-0000-4000-8000-000000000010',
          occurredAt: syntheticPreviewReferenceAt,
          recordId,
        })
        // Attach the outcome handler in the same turn the promise is
        // created, before any await that could throw (a lock-wait timeout),
        // so an eventual rejection can never become unhandled.
        complianceSettlement = captureSettlement(compliancePromise)
        // Prove compliance is genuinely queued directly behind the blocker
        // before the approval is even started.
        await waitUntilBlockedBy(monitor(), complianceActor.pid, blocker.pid, lockWaitTimeoutMs)

        const approvalPromise = approvalActor.repository.decideManagerAssignment({
          assignmentId,
          body: { decision: 'approve', expectedVersion: 1 },
          idempotencyKey: 'a1000000-0000-4000-8000-000000000011',
          managerId: previewPersonaIds.manager,
          occurredAt: syntheticPreviewReferenceAt,
        })
        approvalSettlement = captureSettlement(approvalPromise)
        // Prove approval is queued directly behind the already-waiting
        // compliance decision — not behind the blocker, since compliance
        // holds the queue position immediately ahead of it — establishing
        // compliance-first order before anything is allowed to proceed.
        await waitUntilBlockedBy(monitor(), approvalActor.pid, complianceActor.pid, lockWaitTimeoutMs)

        blocker.release()
        const [complianceResult, approvalResult] = await Promise.all([
          complianceSettlement,
          approvalSettlement,
        ])
        await blocker.settled

        expect(complianceResult.status).toBe('fulfilled')
        if (complianceResult.status !== 'fulfilled') throw new Error('unreachable')
        expect(complianceResult.value).toMatchObject({
          record: { status: 'information_required' },
          workerReadiness: 'action_due',
        })
        expect(approvalResult.status).toBe('rejected')
        if (approvalResult.status !== 'rejected') throw new Error('unreachable')
        expect(approvalResult.reason).not.toMatchObject({ code: '40P01' })
        expect(approvalResult.reason).toMatchObject({ code: 'ASSIGNMENT_NOT_REVIEWABLE' })

        const readinessRows = await connection.db
          .select({ status: schema.workerProfiles.overallReadinessStatus })
          .from(schema.workerProfiles)
          .where(eq(schema.workerProfiles.id, minaProfileId))
        expect(readinessRows[0]?.status).toBe('action_due')

        const assignmentRows = await connection.db
          .select({ status: schema.shiftAssignments.status })
          .from(schema.shiftAssignments)
          .where(eq(schema.shiftAssignments.id, assignmentId))
        expect(assignmentRows[0]?.status).toBe('review')

        const capacityRows = await connection.db
          .select({ count: count() })
          .from(schema.shiftAssignments)
          .where(
            sql`${schema.shiftAssignments.shiftId} = ${previewIdentifiers.shifts.managerDraft} and ${schema.shiftAssignments.status} = 'confirmed'`,
          )
        expect(capacityRows[0]?.count).toBe(0)

        const complianceActivity = await connection.db
          .select({ count: count() })
          .from(schema.activityEvents)
          .where(
            sql`${schema.activityEvents.subjectMemberId} = ${previewIdentifiers.members.minaOkoro} and ${schema.activityEvents.eventType} = 'compliance_decided'`,
          )
        expect(complianceActivity[0]?.count).toBe(1)

        const notificationRows = await connection.db
          .select({ count: count() })
          .from(schema.notifications)
          .where(
            sql`${schema.notifications.recipientMemberId} = ${previewIdentifiers.members.minaOkoro} and ${schema.notifications.title} = 'Compliance action required'`,
          )
        expect(notificationRows[0]?.count).toBe(1)

        const replayRepository = createDrizzlePreviewRepository(connection)
        const replay = await replayRepository.decideAdministratorCompliance({
          administratorId: previewPersonaIds.administrator,
          body: {
            decision: 'further_information_required',
            expectedVersion: 1,
            note: 'Please confirm the synthetic role requirement renewal evidence.',
          },
          idempotencyKey: 'a1000000-0000-4000-8000-000000000010',
          occurredAt: syntheticPreviewReferenceAt,
          recordId,
        })
        expect(replay).toMatchObject({ idempotentReplay: true })

        const staleRepository = createDrizzlePreviewRepository(connection)
        await expect(
          staleRepository.decideAdministratorCompliance({
            administratorId: previewPersonaIds.administrator,
            body: {
              decision: 'rejected',
              expectedVersion: 1,
              note: 'A deliberately stale synthetic review cannot overwrite the result.',
            },
            idempotencyKey: 'a1000000-0000-4000-8000-000000000012',
            occurredAt: syntheticPreviewReferenceAt,
            recordId,
          }),
        ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
      } finally {
        // Release unconditionally and wait for every settlement already
        // captured above (guarded, since a timeout may have thrown before
        // one of them was created) before closing the dedicated clients —
        // never close a client while its own in-flight transaction promise
        // is still pending.
        blocker.release()
        await blocker.settled
        if (complianceSettlement !== undefined) await complianceSettlement
        if (approvalSettlement !== undefined) await approvalSettlement
        await complianceActor.close()
        await approvalActor.close()
      }
    }

    // Reset the shared Mina fixtures to their pre-phase-A state so phase B
    // exercises the opposite order from a clean, reviewable baseline.
    await connection.db
      .update(schema.complianceRecords)
      .set({ status: 'reviewing', version: 1 })
      .where(eq(schema.complianceRecords.id, recordId))
    await connection.db
      .update(schema.workerProfiles)
      .set({ overallReadinessStatus: 'reviewing' })
      .where(eq(schema.workerProfiles.id, minaProfileId))

    // Phase B: the approval is queued ahead of the compliance decision at the
    // Worker-profile lock, so it must linearize first and genuinely confirm.
    // The later compliance decision must not retroactively cancel that
    // confirmed work — the `assignmentRows[0]?.status === 'confirmed'`
    // assertion after compliance commits is what would fail under a
    // regression that let a later compliance action undo confirmed approval.
    //
    // Phase A's assignment is left in place afterward (its rejected outcome
    // never confirms, cancels or declines it, so it stays 'review'
    // permanently), and `shift_assignments_shift_worker_unique` is a genuine,
    // unconditional production constraint on (shift_id, worker_profile_id) —
    // not something this test may loosen. A second assignment for the same
    // Worker on the SAME shift would collide with that still-present row
    // regardless of its own id, so phase B builds a completely independent
    // shift (via the real create/publish repository path, mirroring the
    // cancellation test below) rather than reusing `managerDraft`.
    {
      const setupRepository = createDrizzlePreviewRepository(connection)
      const phaseBShiftCreated = await setupRepository.createManagerShift({
        body: {
          arrivalNote: 'Use the synthetic reception entrance.',
          areaName: 'Cedar Ward',
          endsAt: '2026-09-11T15:00:00.000Z',
          locationId: previewIdentifiers.locations.willowmere,
          requiredWorkers: 1,
          roleTitle: 'Registered nurse',
          startsAt: '2026-09-11T07:00:00.000Z',
        },
        idempotencyKey: 'a1000000-0000-4000-8000-000000000030',
        managerId: previewPersonaIds.manager,
        occurredAt: syntheticPreviewReferenceAt,
      })
      if (phaseBShiftCreated === null) throw new Error('Expected a draft shift for phase B.')
      const phaseBShiftPublished = await setupRepository.publishManagerShift({
        expectedVersion: phaseBShiftCreated.shift.version,
        idempotencyKey: 'a1000000-0000-4000-8000-000000000031',
        managerId: previewPersonaIds.manager,
        occurredAt: syntheticPreviewReferenceAt,
        shiftId: phaseBShiftCreated.shift.id,
      })
      if (phaseBShiftPublished === null) throw new Error('Expected a published shift for phase B.')
      const phaseBShiftId = phaseBShiftCreated.shift.id

      const assignmentId = 'a1000000-0000-4000-8000-000000000002'
      await connection.db.insert(schema.shiftAssignments).values({
        assignedAt: syntheticPreviewReferenceAt,
        id: assignmentId,
        shiftId: phaseBShiftId,
        status: 'review',
        workerProfileId: minaProfileId,
      })

      const blocker = await openRowBlocker(workerProfileLock)
      const complianceActor = await openDedicatedActor()
      const approvalActor = await openDedicatedActor()
      expect(new Set([blocker.pid, complianceActor.pid, approvalActor.pid]).size).toBe(3)

      let approvalSettlement:
        | Promise<PromiseSettledResult<Awaited<ReturnType<typeof approvalActor.repository.decideManagerAssignment>>>>
        | undefined
      let complianceSettlement:
        | Promise<PromiseSettledResult<Awaited<ReturnType<typeof complianceActor.repository.decideAdministratorCompliance>>>>
        | undefined

      try {
        const approvalPromise = approvalActor.repository.decideManagerAssignment({
          assignmentId,
          body: { decision: 'approve', expectedVersion: 1 },
          idempotencyKey: 'a1000000-0000-4000-8000-000000000020',
          managerId: previewPersonaIds.manager,
          occurredAt: syntheticPreviewReferenceAt,
        })
        approvalSettlement = captureSettlement(approvalPromise)
        await waitUntilBlockedBy(monitor(), approvalActor.pid, blocker.pid, lockWaitTimeoutMs)

        const compliancePromise = complianceActor.repository.decideAdministratorCompliance({
          administratorId: previewPersonaIds.administrator,
          body: {
            decision: 'further_information_required',
            expectedVersion: 1,
            note: 'Please confirm the synthetic role requirement renewal evidence.',
          },
          idempotencyKey: 'a1000000-0000-4000-8000-000000000021',
          occurredAt: syntheticPreviewReferenceAt,
          recordId,
        })
        complianceSettlement = captureSettlement(compliancePromise)
        // Compliance is queued directly behind approval (not the blocker),
        // since approval holds the queue position immediately ahead of it.
        await waitUntilBlockedBy(monitor(), complianceActor.pid, approvalActor.pid, lockWaitTimeoutMs)

        blocker.release()
        const [approvalResult, complianceResult] = await Promise.all([
          approvalSettlement,
          complianceSettlement,
        ])
        await blocker.settled

        expect(approvalResult.status).toBe('fulfilled')
        if (approvalResult.status !== 'fulfilled') throw new Error('unreachable')
        expect(approvalResult.value).toMatchObject({ status: 'confirmed' })
        expect(complianceResult.status).toBe('fulfilled')
        if (complianceResult.status !== 'fulfilled') throw new Error('unreachable')
        expect(complianceResult.value).toMatchObject({ workerReadiness: 'action_due' })

        const assignmentRows = await connection.db
          .select({ status: schema.shiftAssignments.status })
          .from(schema.shiftAssignments)
          .where(eq(schema.shiftAssignments.id, assignmentId))
        expect(assignmentRows[0]?.status).toBe('confirmed')

        const readinessRows = await connection.db
          .select({ status: schema.workerProfiles.overallReadinessStatus })
          .from(schema.workerProfiles)
          .where(eq(schema.workerProfiles.id, minaProfileId))
        expect(readinessRows[0]?.status).toBe('action_due')

        const capacityRows = await connection.db
          .select({ count: count() })
          .from(schema.shiftAssignments)
          .where(
            sql`${schema.shiftAssignments.shiftId} = ${phaseBShiftId} and ${schema.shiftAssignments.status} = 'confirmed'`,
          )
        expect(capacityRows[0]?.count).toBe(1)

        const complianceActivity = await connection.db
          .select({ count: count() })
          .from(schema.activityEvents)
          .where(
            sql`${schema.activityEvents.subjectMemberId} = ${previewIdentifiers.members.minaOkoro} and ${schema.activityEvents.eventType} = 'compliance_decided'`,
          )
        expect(complianceActivity[0]?.count).toBe(2)

        const replayRepository = createDrizzlePreviewRepository(connection)
        const replay = await replayRepository.decideAdministratorCompliance({
          administratorId: previewPersonaIds.administrator,
          body: {
            decision: 'further_information_required',
            expectedVersion: 1,
            note: 'Please confirm the synthetic role requirement renewal evidence.',
          },
          idempotencyKey: 'a1000000-0000-4000-8000-000000000021',
          occurredAt: syntheticPreviewReferenceAt,
          recordId,
        })
        expect(replay).toMatchObject({ idempotentReplay: true })

        const staleRepository = createDrizzlePreviewRepository(connection)
        await expect(
          staleRepository.decideAdministratorCompliance({
            administratorId: previewPersonaIds.administrator,
            body: {
              decision: 'rejected',
              expectedVersion: 1,
              note: 'A deliberately stale synthetic review cannot overwrite the result.',
            },
            idempotencyKey: 'a1000000-0000-4000-8000-000000000022',
            occurredAt: syntheticPreviewReferenceAt,
            recordId,
          }),
        ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
      } finally {
        blocker.release()
        await blocker.settled
        if (approvalSettlement !== undefined) await approvalSettlement
        if (complianceSettlement !== undefined) await complianceSettlement
        await complianceActor.close()
        await approvalActor.close()
      }
    }
  })

  it('serializes Manager shift cancellation and Worker assignment cancellation on the canonical shift-before-assignment order', async () => {
    const repository = createDrizzlePreviewRepository(connection)
    const created = await repository.createManagerShift({
      body: {
        arrivalNote: 'Use the synthetic reception entrance.',
        areaName: 'River Room',
        endsAt: '2026-09-09T15:00:00.000Z',
        locationId: previewIdentifiers.locations.willowmere,
        requiredWorkers: 1,
        roleTitle: 'Registered nurse',
        startsAt: '2026-09-09T07:00:00.000Z',
      },
      idempotencyKey: 'a2000000-0000-4000-8000-000000000001',
      managerId: previewPersonaIds.manager,
      occurredAt: syntheticPreviewReferenceAt,
    })
    if (created === null) throw new Error('Expected a draft shift.')
    const published = await repository.publishManagerShift({
      expectedVersion: created.shift.version,
      idempotencyKey: 'a2000000-0000-4000-8000-000000000002',
      managerId: previewPersonaIds.manager,
      occurredAt: syntheticPreviewReferenceAt,
      shiftId: created.shift.id,
    })
    if (published === null) throw new Error('Expected a published shift.')

    const assignmentId = 'a2000000-0000-4000-8000-000000000099'
    await connection.db.insert(schema.shiftAssignments).values({
      assignedAt: syntheticPreviewReferenceAt,
      id: assignmentId,
      shiftId: created.shift.id,
      status: 'confirmed',
      workerProfileId: previewIdentifiers.profiles.leilaMensah,
    })

    const managerCommand = {
      expectedVersion: published.shift.version,
      idempotencyKey: 'a2000000-0000-4000-8000-000000000010',
      managerId: previewPersonaIds.manager,
      occurredAt: syntheticPreviewReferenceAt,
      reason: 'The synthetic service requirement has changed.',
      shiftId: created.shift.id,
    }
    const workerCommand = {
      assignmentId,
      idempotencyKey: 'a2000000-0000-4000-8000-000000000011',
      occurredAt: syntheticPreviewReferenceAt,
      workerId: previewPersonaIds.worker,
    }

    const shiftLock = sql`select ${schema.shifts.id} from ${schema.shifts} where ${schema.shifts.id} = ${created.shift.id} for update`
    const blocker = await openRowBlocker(shiftLock)
    const managerActor = await openDedicatedActor()
    const workerActor = await openDedicatedActor()
    expect(new Set([blocker.pid, managerActor.pid, workerActor.pid]).size).toBe(3)

    let managerSettlement:
      | Promise<PromiseSettledResult<Awaited<ReturnType<typeof managerActor.repository.cancelManagerShift>>>>
      | undefined
    let workerSettlement:
      | Promise<PromiseSettledResult<Awaited<ReturnType<typeof workerActor.repository.cancelWorkerAssignment>>>>
      | undefined

    try {
      const managerPromise = managerActor.repository.cancelManagerShift(managerCommand)
      managerSettlement = captureSettlement(managerPromise)
      // Prove the Manager cancellation is genuinely waiting at the shift-lock
      // boundary before the Worker cancellation is ever introduced.
      await waitUntilBlockedBy(monitor(), managerActor.pid, blocker.pid, lockWaitTimeoutMs)

      const workerPromise = workerActor.repository.cancelWorkerAssignment(workerCommand)
      workerSettlement = captureSettlement(workerPromise)
      // Prove the Worker cancellation queues directly behind the
      // already-waiting Manager cancellation on the SAME shift row — not
      // behind the blocker, since Manager holds the queue position
      // immediately ahead of it. This still establishes the full chain
      // (blocker -> manager -> worker) because the Manager link was already
      // confirmed above. Under the former buggy ordering — Worker locking
      // the assignment before the shift — releasing the blocker here would
      // recreate the assignment-vs-shift lock cycle and PostgreSQL would
      // abort one side with `40P01` instead of letting both settle cleanly;
      // the `not.toMatchObject({code: '40P01'})` assertions below are
      // exactly what would fail under that regression.
      await waitUntilBlockedBy(monitor(), workerActor.pid, managerActor.pid, lockWaitTimeoutMs)

      blocker.release()
      const [managerResult, workerResult] = await Promise.all([
        managerSettlement,
        workerSettlement,
      ])
      await blocker.settled

      expect(managerResult.status).toBe('fulfilled')
      if (managerResult.status === 'rejected') {
        expect(managerResult.reason).not.toMatchObject({ code: '40P01' })
      }
      expect(workerResult.status).toBe('rejected')
      if (workerResult.status !== 'rejected') throw new Error('unreachable')
      // The follower of the shift-then-assignment lock order receives the
      // established safe domain conflict, never a raw PostgreSQL error.
      expect(workerResult.reason).not.toMatchObject({ code: '40P01' })
      expect(workerResult.reason).toMatchObject({ code: 'CANCELLATION_NOT_ALLOWED' })

      const shiftRows = await connection.db
        .select({ status: schema.shifts.status })
        .from(schema.shifts)
        .where(eq(schema.shifts.id, created.shift.id))
      const assignmentRows = await connection.db
        .select({
          cancellationReason: schema.shiftAssignments.cancellationReason,
          status: schema.shiftAssignments.status,
        })
        .from(schema.shiftAssignments)
        .where(eq(schema.shiftAssignments.id, assignmentId))
      expect(shiftRows[0]?.status).toBe('cancelled')
      expect(assignmentRows[0]).toMatchObject({
        cancellationReason: 'manager_cancelled_shift',
        status: 'cancelled',
      })

      const activeRows = await connection.db
        .select({ count: count() })
        .from(schema.shiftAssignments)
        .where(
          sql`${schema.shiftAssignments.shiftId} = ${created.shift.id} and ${schema.shiftAssignments.status} in ('confirmed', 'review')`,
        )
      expect(activeRows[0]?.count).toBe(0)

      const cancellationNotifications = await connection.db
        .select({ title: schema.notifications.title })
        .from(schema.notifications)
        .where(
          sql`${schema.notifications.recipientMemberId} = ${previewPersonaIds.worker} and ${schema.notifications.title} in ('Assignment cancelled', 'Shift cancelled by Manager')`,
        )
      expect(cancellationNotifications).toHaveLength(1)

      const managerActivity = await connection.db
        .select({ count: count() })
        .from(schema.activityEvents)
        .where(
          sql`${schema.activityEvents.shiftId} = ${created.shift.id} and ${schema.activityEvents.eventType} = 'shift_manager_cancelled'`,
        )
      expect(managerActivity[0]?.count).toBe(1)

      const replayRepository = createDrizzlePreviewRepository(connection)
      const replayed = await replayRepository.cancelManagerShift(managerCommand)
      expect(replayed).toMatchObject({ idempotentReplay: true, shift: { status: 'cancelled' } })
      await expect(
        replayRepository.cancelManagerShift({
          ...managerCommand,
          reason: 'A contradictory synthetic cancellation reason.',
        }),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    } finally {
      blocker.release()
      await blocker.settled
      if (managerSettlement !== undefined) await managerSettlement
      if (workerSettlement !== undefined) await workerSettlement
      await managerActor.close()
      await workerActor.close()
    }
  })
})

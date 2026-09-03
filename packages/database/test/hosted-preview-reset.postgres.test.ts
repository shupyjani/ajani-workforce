import { count, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  connectDatabase,
  migrateDatabase,
  previewIdentifiers,
  previewPersonaIds,
  resetHostedSyntheticPreviewPostgres,
  syntheticPreviewReferenceAt,
  syntheticPreviewSeedSummary,
  createDrizzlePreviewRepository,
  type DatabaseConnection,
} from '../src/index.js'
import * as schema from '../src/schema.js'

const rawDatabaseUrl = process.env['AJANI_POSTGRES_TEST_URL']

if (rawDatabaseUrl === undefined) {
  throw new Error(
    'AJANI_POSTGRES_TEST_URL is required for the hosted synthetic-preview reset suite.',
  )
}

const databaseUrl: string = rawDatabaseUrl
const unrelatedOrganisationId = 'c0000000-0000-4000-8000-000000000001'

describe('hosted synthetic-preview PostgreSQL reset', () => {
  let connection: DatabaseConnection

  beforeAll(async () => {
    connection = await connectDatabase({ databaseUrl, mode: 'postgres' })
    await migrateDatabase(connection)
  })

  afterAll(async () => {
    await connection.close()
  })

  it('applies migrations and completes a fresh seed on an empty database', async () => {
    await resetHostedSyntheticPreviewPostgres(connection)

    const memberCount = await connection.db
      .select({ count: count() })
      .from(schema.workforceMembers)
    expect(memberCount[0]?.count).toBe(syntheticPreviewSeedSummary.workforceMembers)
  })

  it('removes visitor-created preview records and restores the deterministic seed', async () => {
    await resetHostedSyntheticPreviewPostgres(connection)
    const repository = createDrizzlePreviewRepository(connection)

    // Simulate a visitor mutation: a fresh shift request for the Worker
    // persona, exactly the kind of record a real cold-start reset must clear.
    await repository.requestWorkerShift({
      idempotencyKey: 'hosted-reset-visitor-request-0001',
      occurredAt: syntheticPreviewReferenceAt,
      shiftId: previewIdentifiers.shifts.harbourlightCedarNight,
      workerId: previewPersonaIds.worker,
    })
    const beforeReset = await connection.db
      .select({ count: count() })
      .from(schema.shiftAssignments)
      .where(eq(schema.shiftAssignments.shiftId, previewIdentifiers.shifts.harbourlightCedarNight))
    expect(beforeReset[0]?.count).toBeGreaterThan(0)
    const idempotencyBeforeReset = await connection.db
      .select({ count: count() })
      .from(schema.idempotencyRecords)
    expect(idempotencyBeforeReset[0]?.count).toBeGreaterThan(0)

    await resetHostedSyntheticPreviewPostgres(connection)

    const afterReset = await connection.db
      .select({ count: count() })
      .from(schema.shiftAssignments)
      .where(eq(schema.shiftAssignments.shiftId, previewIdentifiers.shifts.harbourlightCedarNight))
    expect(afterReset[0]?.count).toBe(0)
    const idempotencyAfterReset = await connection.db
      .select({ count: count() })
      .from(schema.idempotencyRecords)
    expect(idempotencyAfterReset[0]?.count).toBe(0)
    const memberCount = await connection.db
      .select({ count: count() })
      .from(schema.workforceMembers)
    expect(memberCount[0]?.count).toBe(syntheticPreviewSeedSummary.workforceMembers)
  })

  it('preserves an unrelated organisation outside the synthetic preview scope', async () => {
    await resetHostedSyntheticPreviewPostgres(connection)
    await connection.db.insert(schema.organisations).values({
      id: unrelatedOrganisationId,
      name: 'Unrelated non-preview organisation',
      slug: 'unrelated-non-preview-organisation',
      status: 'active',
    })

    await resetHostedSyntheticPreviewPostgres(connection)

    const unrelatedRows = await connection.db
      .select({ id: schema.organisations.id })
      .from(schema.organisations)
      .where(eq(schema.organisations.id, unrelatedOrganisationId))
    expect(unrelatedRows).toHaveLength(1)

    // Clean up so this test is repeatable against a persistent Neon branch.
    await connection.db
      .delete(schema.organisations)
      .where(eq(schema.organisations.id, unrelatedOrganisationId))
  })

  it('relies on a transaction mechanism that rolls back completely on failure', async () => {
    // resetHostedSyntheticPreviewPostgres wraps delete-then-reseed in exactly
    // one `connection.db.transaction(...)` call. This proves that mechanism
    // itself is all-or-nothing against this real database: a failure partway
    // through a same-shaped transaction leaves the prior state completely
    // intact, never a half-deleted database.
    await resetHostedSyntheticPreviewPostgres(connection)
    const beforeCount = await connection.db
      .select({ count: count() })
      .from(schema.workforceMembers)

    await expect(
      connection.db.transaction(async (transaction) => {
        // Deletes through `transaction`, not the outer `connection.db` — a
        // delete issued on the outer handle would run on its own separate,
        // already-committed connection and defeat the point of this test.
        await transaction.delete(schema.workforceMembers)
        throw new Error('Simulated mid-reset failure.')
      }),
    ).rejects.toThrow('Simulated mid-reset failure.')

    const afterCount = await connection.db
      .select({ count: count() })
      .from(schema.workforceMembers)
    expect(afterCount[0]?.count).toBe(beforeCount[0]?.count)
  })
})

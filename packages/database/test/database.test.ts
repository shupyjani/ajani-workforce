import {
  administratorComplianceDataSchema,
  administratorComplianceRecordDataSchema,
  administratorComplianceRecordsDataSchema,
  administratorTimesheetsDataSchema,
  administratorRecordsDataSchema,
  managerCoverageDataSchema,
  managerAssignmentRequestsDataSchema,
  managerOperationsDataSchema,
  managerShiftsDataSchema,
  managerTimesheetsDataSchema,
  notificationsDataSchema,
  previewPersonaIds,
  workerAssignmentMutationSchema,
  workerOverviewDataSchema,
  workerReadinessDataSchema,
  workerScheduleDataSchema,
  workerShiftDetailDataSchema,
  workerShiftsDataSchema,
  workerTimesheetDetailDataSchema,
  workerTimesheetsDataSchema,
} from '@ajani/contracts'
import { count, eq, sql } from 'drizzle-orm'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DatabaseConfigurationError,
  createDrizzlePreviewRepository,
  createInMemoryDatabase,
  migrateDatabase,
  migrationsFolder,
  parseDatabaseConfig,
  previewIdentifiers,
  resetSyntheticPreview,
  seedSyntheticPreview,
  syntheticPreviewSeedSummary,
  WorkerJourneyRuleError,
  type PgliteDatabaseConnection,
} from '../src/index.js'
import * as schema from '../src/schema.js'

const connections: PgliteDatabaseConnection[] = []

async function createMigratedDatabase() {
  const connection = await createInMemoryDatabase()
  connections.push(connection)
  await migrateDatabase(connection)
  return connection
}

afterEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.close()))
})

describe('database configuration', () => {
  it('defaults explicitly to local PGlite mode', () => {
    expect(parseDatabaseConfig({})).toMatchObject({ mode: 'pglite' })
  })

  it('preserves explicit in-memory PGlite mode for isolated verification', () => {
    expect(
      parseDatabaseConfig({ AJANI_PGLITE_DATA_DIR: 'memory://' }),
    ).toEqual({ dataDirectory: 'memory://', mode: 'pglite' })
  })

  it('requires a valid URL when PostgreSQL mode is selected', () => {
    expect(() => parseDatabaseConfig({ AJANI_DATA_MODE: 'postgres' })).toThrow(
      DatabaseConfigurationError,
    )
    expect(
      parseDatabaseConfig({
        AJANI_DATA_MODE: 'postgres',
        DATABASE_URL: 'postgresql://example.invalid/ajani',
      }),
    ).toEqual({
      databaseUrl: 'postgresql://example.invalid/ajani',
      mode: 'postgres',
    })
  })
})

describe('migrations and synthetic seed', () => {
  it('applies the reviewed migration to a clean PGlite database', async () => {
    const connection = await createMigratedDatabase()
    const result = await connection.db
      .select({ count: count() })
      .from(schema.organisations)

    expect(result[0]?.count).toBe(0)
  })

  it('upgrades an existing Checkpoint 4 schema through the Checkpoint 5 migration', async () => {
    const connection = await createInMemoryDatabase()
    connections.push(connection)
    const checkpointFourFolder = await mkdtemp(join(tmpdir(), 'ajani-c4-migration-'))

    try {
      await mkdir(join(checkpointFourFolder, 'meta'))
      await copyFile(
        join(migrationsFolder, '0000_checkpoint_3_data_foundation.sql'),
        join(checkpointFourFolder, '0000_checkpoint_3_data_foundation.sql'),
      )
      await copyFile(
        join(migrationsFolder, '0001_worker_shift_journey.sql'),
        join(checkpointFourFolder, '0001_worker_shift_journey.sql'),
      )
      const journal = JSON.parse(
        await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
      ) as { entries: unknown[] }
      await writeFile(
        join(checkpointFourFolder, 'meta', '_journal.json'),
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }),
      )

      await migratePglite(connection.db, {
        migrationsFolder: checkpointFourFolder,
      })
      await migrateDatabase(connection)

      const columns = await connection.db.execute<{ column_name: string }>(
        sql`select column_name from information_schema.columns where table_name = 'shift_assignments'`,
      )
      const tables = await connection.db.execute<{ table_name: string }>(
        sql`select table_name from information_schema.tables where table_name = 'timesheets'`,
      )
      expect(columns.rows.map((row) => row.column_name)).toContain('cancelled_at')
      expect(tables.rows[0]?.table_name).toBe('timesheets')
    } finally {
      await rm(checkpointFourFolder, { force: true, recursive: true })
    }
  })

  it('seeds linked synthetic rows idempotently', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    await seedSyntheticPreview(connection)

    const memberCount = await connection.db
      .select({ count: count() })
      .from(schema.workforceMembers)
    const assignmentCount = await connection.db
      .select({ count: count() })
      .from(schema.shiftAssignments)
    const complianceCount = await connection.db
      .select({ count: count() })
      .from(schema.complianceRecords)
    const timesheetCount = await connection.db
      .select({ count: count() })
      .from(schema.timesheets)

    expect(memberCount[0]?.count).toBe(
      syntheticPreviewSeedSummary.workforceMembers,
    )
    expect(assignmentCount[0]?.count).toBe(
      syntheticPreviewSeedSummary.shiftAssignments,
    )
    expect(complianceCount[0]?.count).toBe(
      syntheticPreviewSeedSummary.complianceRecords,
    )
    expect(timesheetCount[0]?.count).toBe(syntheticPreviewSeedSummary.timesheets)
  })

  it('enforces representative foreign-key and uniqueness constraints', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)

    await expect(
      connection.db.insert(schema.locations).values({
        id: '20000000-0000-4000-8000-000000000099',
        name: 'Synthetic invalid location',
        organisationId: '10000000-0000-4000-8000-000000000099',
        slug: 'synthetic-invalid-location',
        status: 'active',
        timezone: 'Europe/London',
      }),
    ).rejects.toThrow()

    await expect(
      connection.db.insert(schema.organisations).values({
        id: '10000000-0000-4000-8000-000000000099',
        name: 'Asterbridge Workforce Cooperative',
        slug: 'another-synthetic-slug',
        status: 'active',
      }),
    ).rejects.toThrow()

    await expect(
      connection.db.insert(schema.idempotencyRecords).values({
        actorMemberId: previewIdentifiers.members.leilaMensah,
        expiresAt: '2026-09-25T10:30:00.000Z',
        id: 'a0000000-0000-4000-8000-000000000099',
        idempotencyKey: 'short',
        operation: 'request_shift',
        requestFingerprint: 'shift:test',
        responsePayload: '{}',
        responseStatus: 201,
        workerProfileId: previewIdentifiers.profiles.leilaMensah,
      }),
    ).rejects.toThrow()
  })

  it('resets only the local synthetic preview rows', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    await resetSyntheticPreview(connection, { confirmPreviewReset: true })

    const result = await connection.db
      .select({ count: count() })
      .from(schema.workforceMembers)
    expect(result[0]?.count).toBe(
      syntheticPreviewSeedSummary.workforceMembers,
    )
  })
})

describe('preview repository', () => {
  it('returns contract-valid worker, manager, administrator, and notification views', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)

    workerOverviewDataSchema.parse(
      await repository.getWorkerOverview(previewPersonaIds.worker),
    )
    workerReadinessDataSchema.parse(
      await repository.getWorkerReadiness(previewPersonaIds.worker),
    )
    managerOperationsDataSchema.parse(
      await repository.getManagerOperations(previewPersonaIds.manager),
    )
    managerCoverageDataSchema.parse(
      await repository.getManagerCoverage(previewPersonaIds.manager),
    )
    const compliance = await repository.getAdministratorCompliance({
      administratorId: previewPersonaIds.administrator,
      limit: 20,
    })
    const records = await repository.getAdministratorRecords({
      administratorId: previewPersonaIds.administrator,
      limit: 20,
    })
    const notifications = await repository.getNotifications({
      limit: 20,
      recipientId: previewPersonaIds.worker,
    })

    if (compliance === null || records === null || notifications === null) {
      throw new Error('Expected the seeded preview personas to be available.')
    }
    const { nextCursor: complianceCursor, ...complianceData } = compliance
    const { nextCursor: recordsCursor, ...recordsData } = records
    const { nextCursor: notificationsCursor, ...notificationsData } =
      notifications
    administratorComplianceDataSchema.parse(complianceData)
    administratorRecordsDataSchema.parse(recordsData)
    notificationsDataSchema.parse(notificationsData)
    expect(complianceCursor).toBeNull()
    expect(recordsCursor).toBeNull()
    expect(notificationsCursor).toBeNull()
    expect(compliance.items).toHaveLength(6)
    expect(records.items).toHaveLength(6)
    expect(notifications.unreadCount).toBe(2)
  })

  it('uses stable cursor ordering without duplicating collection rows', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)

    const first = await repository.getAdministratorCompliance({
      administratorId: previewPersonaIds.administrator,
      limit: 2,
    })
    expect(first?.nextCursor).not.toBeNull()
    const second = await repository.getAdministratorCompliance({
      administratorId: previewPersonaIds.administrator,
      cursor: first?.nextCursor ?? undefined,
      limit: 2,
    })

    expect(first?.items.map((item) => item.workerId)).not.toEqual(
      second?.items.map((item) => item.workerId),
    )
    expect(
      new Set([
        ...(first?.items.map((item) => item.workerId) ?? []),
        ...(second?.items.map((item) => item.workerId) ?? []),
      ]).size,
    ).toBe(4)
  })

  it('distinguishes repeated care-area names with relational facility data', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)

    const coverage = await repository.getManagerCoverage(
      previewPersonaIds.manager,
    )
    if (coverage === null) throw new Error('Expected manager coverage.')
    const shortStayAreas = coverage.items.filter(
      (item) => item.location.area === 'Short stay unit',
    )

    expect(shortStayAreas).toHaveLength(2)
    expect(shortStayAreas.map((item) => item.location.name)).toEqual(
      expect.arrayContaining([
        'Willowmere Community Hospital',
        'Harbourlight Care Centre',
      ]),
    )
    expect(new Set(shortStayAreas.map((item) => item.requiredWorkers)).size).toBe(2)
  })

  it('returns null for identifiers outside each preview persona type', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)

    await expect(
      repository.getWorkerOverview(previewPersonaIds.manager),
    ).resolves.toBeNull()
    await expect(
      repository.getManagerCoverage(previewPersonaIds.worker),
    ).resolves.toBeNull()
  })
})

describe('Operations repository workflows', () => {
  const referenceAt = '2026-08-28T12:00:00.000Z'

  it('returns joined, contract-valid operations, compliance and timesheet views', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)

    const assignments = await repository.getManagerAssignmentRequests({
      limit: 20,
      managerId: previewPersonaIds.manager,
    })
    const shifts = await repository.getManagerShifts({
      limit: 20,
      managerId: previewPersonaIds.manager,
      referenceAt,
    })
    const compliance = await repository.getAdministratorComplianceRecords({
      administratorId: previewPersonaIds.administrator,
      limit: 20,
    })
    const complianceDetail = await repository.getAdministratorComplianceRecord({
      administratorId: previewPersonaIds.administrator,
      recordId: 'd0000000-0000-4000-8000-000000000012',
    })
    const workerTimesheets = await repository.getWorkerTimesheets({
      limit: 20,
      referenceAt,
      workerId: previewPersonaIds.worker,
    })
    const workerTimesheet = await repository.getWorkerTimesheetDetail({
      timesheetId: previewIdentifiers.timesheets.leilaRejected,
      workerId: previewPersonaIds.worker,
    })
    const managerTimesheets = await repository.getManagerTimesheets({
      limit: 20,
      managerId: previewPersonaIds.manager,
    })
    const administratorTimesheets = await repository.getAdministratorTimesheets({
      administratorId: previewPersonaIds.administrator,
      limit: 20,
    })

    if (
      assignments === null || shifts === null || compliance === null ||
      complianceDetail === null || workerTimesheets === null ||
      workerTimesheet === null || managerTimesheets === null ||
      administratorTimesheets === null
    ) throw new Error('Expected the seeded operations views.')

    const { nextCursor: assignmentCursor, ...assignmentData } = assignments
    const { nextCursor: shiftCursor, ...shiftData } = shifts
    const { nextCursor: complianceCursor, ...complianceData } = compliance
    const { nextCursor: workerCursor, ...workerData } = workerTimesheets
    const { nextCursor: managerCursor, ...managerData } = managerTimesheets
    const { nextCursor: administratorCursor, ...administratorData } = administratorTimesheets
    void assignmentCursor
    void shiftCursor
    void complianceCursor
    void workerCursor
    void managerCursor
    void administratorCursor

    managerAssignmentRequestsDataSchema.parse(assignmentData)
    managerShiftsDataSchema.parse(shiftData)
    administratorComplianceRecordsDataSchema.parse(complianceData)
    administratorComplianceRecordDataSchema.parse(complianceDetail)
    workerTimesheetsDataSchema.parse(workerData)
    workerTimesheetDetailDataSchema.parse(workerTimesheet)
    managerTimesheetsDataSchema.parse(managerData)
    administratorTimesheetsDataSchema.parse(administratorData)
    expect(workerData.eligibleAssignments.map((item) => item.assignmentId)).toContain(
      previewIdentifiers.assignments.leilaPastLate,
    )
  })

  it('allows only one concurrent Manager approval for the last place and rolls back the loser', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    await connection.db
      .update(schema.shifts)
      .set({ requiredWorkers: 4 })
      .where(eq(schema.shifts.id, previewIdentifiers.shifts.willowmereBirch))
    await connection.db
      .update(schema.workerProfiles)
      .set({ overallReadinessStatus: 'reviewing' })
      .where(
        sql`${schema.workerProfiles.id} in (${previewIdentifiers.profiles.theoAdeyemi}, ${previewIdentifiers.profiles.ariKone})`,
      )

    const results = await Promise.allSettled([
      repository.decideManagerAssignment({
        assignmentId: '80000000-0000-4000-8000-000000000013',
        body: { decision: 'approve', expectedVersion: 1 },
        idempotencyKey: 'f1000000-0000-4000-8000-000000000001',
        managerId: previewPersonaIds.manager,
        occurredAt: referenceAt,
      }),
      repository.decideManagerAssignment({
        assignmentId: '80000000-0000-4000-8000-000000000014',
        body: { decision: 'approve', expectedVersion: 1 },
        idempotencyKey: 'f1000000-0000-4000-8000-000000000002',
        managerId: previewPersonaIds.manager,
        occurredAt: referenceAt,
      }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected).toMatchObject({ reason: { code: 'ASSIGNMENT_NOT_REVIEWABLE' } })
    const statuses = await connection.db
      .select({ status: schema.shiftAssignments.status })
      .from(schema.shiftAssignments)
      .where(sql`${schema.shiftAssignments.id} in ('80000000-0000-4000-8000-000000000013', '80000000-0000-4000-8000-000000000014')`)
    expect(statuses.filter((row) => row.status === 'confirmed')).toHaveLength(1)
    expect(statuses.filter((row) => row.status === 'review')).toHaveLength(1)
  })

  it.each(['active status', 'organisation', 'role', 'readiness'] as const)(
    'revalidates worker %s before confirming a loaded assignment request',
    async (eligibilityField) => {
      const connection = await createMigratedDatabase()
      await seedSyntheticPreview(connection)
      const repository = createDrizzlePreviewRepository(connection)
      const assignmentId = '80000000-0000-4000-8000-000000000013'
      await connection.db
        .update(schema.workerProfiles)
        .set({ overallReadinessStatus: 'reviewing' })
        .where(eq(schema.workerProfiles.id, previewIdentifiers.profiles.theoAdeyemi))
      const loaded = await repository.getManagerAssignmentRequests({
        limit: 20,
        managerId: previewPersonaIds.manager,
      })
      expect(loaded?.items.some((request) => request.assignmentId === assignmentId)).toBe(true)

      if (eligibilityField === 'active status') {
        await connection.db
          .update(schema.workforceMembers)
          .set({ status: 'inactive' })
          .where(eq(schema.workforceMembers.id, previewIdentifiers.members.theoAdeyemi))
      } else if (eligibilityField === 'organisation') {
        const otherOrganisationId = 'f1000000-0000-4000-8000-000000000099'
        await connection.db.insert(schema.organisations).values({
          id: otherOrganisationId,
          name: 'Synthetic Alternate Workforce',
          slug: 'synthetic-alternate-workforce',
          status: 'active',
        })
        await connection.db
          .update(schema.workforceMembers)
          .set({ organisationId: otherOrganisationId })
          .where(eq(schema.workforceMembers.id, previewIdentifiers.members.theoAdeyemi))
      } else if (eligibilityField === 'role') {
        await connection.db
          .update(schema.workforceMembers)
          .set({ roleTitle: 'Registered nurse' })
          .where(eq(schema.workforceMembers.id, previewIdentifiers.members.theoAdeyemi))
      } else {
        await connection.db
          .update(schema.workerProfiles)
          .set({ overallReadinessStatus: 'action_due' })
          .where(eq(schema.workerProfiles.id, previewIdentifiers.profiles.theoAdeyemi))
      }

      await expect(repository.decideManagerAssignment({
        assignmentId,
        body: { decision: 'approve', expectedVersion: 1 },
        idempotencyKey: `f1000000-0000-4000-8000-${eligibilityField === 'active status' ? '000000000011' : eligibilityField === 'organisation' ? '000000000012' : eligibilityField === 'role' ? '000000000013' : '000000000014'}`,
        managerId: previewPersonaIds.manager,
        occurredAt: referenceAt,
      })).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_REVIEWABLE' })
      const assignmentRows = await connection.db
        .select({ status: schema.shiftAssignments.status })
        .from(schema.shiftAssignments)
        .where(eq(schema.shiftAssignments.id, assignmentId))
      expect(assignmentRows[0]?.status).toBe('review')
    },
  )

  it('enforces the shift lifecycle, stale versions, replay semantics and transactional cancellation', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    const body = {
      arrivalNote: 'Use the synthetic reception entrance.',
      areaName: 'River Room',
      endsAt: '2026-09-08T15:00:00.000Z',
      locationId: previewIdentifiers.locations.willowmere,
      requiredWorkers: 2,
      roleTitle: 'Registered nurse',
      startsAt: '2026-09-08T07:00:00.000Z',
    }
    const created = await repository.createManagerShift({
      body,
      idempotencyKey: 'f2000000-0000-4000-8000-000000000001',
      managerId: previewPersonaIds.manager,
      occurredAt: referenceAt,
    })
    if (created === null) throw new Error('Expected a draft shift.')
    const replayed = await repository.createManagerShift({
      body,
      idempotencyKey: 'f2000000-0000-4000-8000-000000000001',
      managerId: previewPersonaIds.manager,
      occurredAt: referenceAt,
    })
    expect(replayed).toMatchObject({ idempotentReplay: true, shift: { id: created.shift.id } })
    await expect(repository.createManagerShift({
      body: { ...body, areaName: 'Different Room' },
      idempotencyKey: 'f2000000-0000-4000-8000-000000000001',
      managerId: previewPersonaIds.manager,
      occurredAt: referenceAt,
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })

    const published = await repository.publishManagerShift({
      expectedVersion: created.shift.version,
      idempotencyKey: 'f2000000-0000-4000-8000-000000000002',
      managerId: previewPersonaIds.manager,
      occurredAt: referenceAt,
      shiftId: created.shift.id,
    })
    if (published === null) throw new Error('Expected a published shift.')
    await expect(repository.publishManagerShift({
      expectedVersion: created.shift.version,
      idempotencyKey: 'f2000000-0000-4000-8000-000000000003',
      managerId: previewPersonaIds.manager,
      occurredAt: referenceAt,
      shiftId: created.shift.id,
    })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })

    const assignmentId = 'f2000000-0000-4000-8000-000000000099'
    await connection.db.insert(schema.shiftAssignments).values({
      assignedAt: referenceAt,
      id: assignmentId,
      shiftId: created.shift.id,
      status: 'confirmed',
      workerProfileId: previewIdentifiers.profiles.leilaMensah,
    })
    const cancelled = await repository.cancelManagerShift({
      expectedVersion: published.shift.version,
      idempotencyKey: 'f2000000-0000-4000-8000-000000000004',
      managerId: previewPersonaIds.manager,
      occurredAt: referenceAt,
      reason: 'The synthetic service requirement has changed.',
      shiftId: created.shift.id,
    })
    expect(cancelled?.shift.status).toBe('cancelled')
    const assignment = await connection.db
      .select({ cancellationReason: schema.shiftAssignments.cancellationReason, status: schema.shiftAssignments.status })
      .from(schema.shiftAssignments)
      .where(eq(schema.shiftAssignments.id, assignmentId))
    expect(assignment[0]).toEqual({ cancellationReason: 'manager_cancelled_shift', status: 'cancelled' })
  })

  it('serializes Manager and Worker cancellation without deadlock and retains one assignment outcome', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    const assignmentId = 'f2000000-0000-4000-8000-000000000098'
    await connection.db
      .update(schema.shifts)
      .set({ status: 'open' })
      .where(eq(schema.shifts.id, previewIdentifiers.shifts.managerDraft))
    await connection.db.insert(schema.shiftAssignments).values({
      assignedAt: referenceAt,
      id: assignmentId,
      shiftId: previewIdentifiers.shifts.managerDraft,
      status: 'confirmed',
      workerProfileId: previewIdentifiers.profiles.leilaMensah,
    })
    const managerCommand = {
      expectedVersion: 1,
      idempotencyKey: 'f2000000-0000-4000-8000-000000000010',
      managerId: previewPersonaIds.manager,
      occurredAt: referenceAt,
      reason: 'The synthetic service requirement has changed.',
      shiftId: previewIdentifiers.shifts.managerDraft,
    }
    const workerCommand = {
      assignmentId,
      idempotencyKey: 'f2000000-0000-4000-8000-000000000011',
      occurredAt: referenceAt,
      workerId: previewPersonaIds.worker,
    }

    const [managerResult, workerResult] = await Promise.allSettled([
      repository.cancelManagerShift(managerCommand),
      repository.cancelWorkerAssignment(workerCommand),
    ])

    expect(managerResult.status).toBe('fulfilled')
    if (workerResult.status === 'rejected') {
      expect(workerResult.reason).toMatchObject({ code: 'CANCELLATION_NOT_ALLOWED' })
    } else {
      expect(workerResult.value).toMatchObject({ outcome: 'cancelled' })
    }
    const shiftRows = await connection.db
      .select({ status: schema.shifts.status })
      .from(schema.shifts)
      .where(eq(schema.shifts.id, previewIdentifiers.shifts.managerDraft))
    const assignmentRows = await connection.db
      .select({ cancellationReason: schema.shiftAssignments.cancellationReason, status: schema.shiftAssignments.status })
      .from(schema.shiftAssignments)
      .where(eq(schema.shiftAssignments.id, assignmentId))
    expect(shiftRows[0]?.status).toBe('cancelled')
    expect(assignmentRows[0]).toMatchObject({ status: 'cancelled' })
    expect(['manager_cancelled_shift', 'worker_requested']).toContain(assignmentRows[0]?.cancellationReason)
    const activeRows = await connection.db
      .select({ count: count() })
      .from(schema.shiftAssignments)
      .where(sql`${schema.shiftAssignments.shiftId} = ${previewIdentifiers.shifts.managerDraft} and ${schema.shiftAssignments.status} in ('confirmed', 'review')`)
    expect(activeRows[0]?.count).toBe(0)

    const cancellationNotifications = await connection.db
      .select({ title: schema.notifications.title })
      .from(schema.notifications)
      .where(sql`${schema.notifications.recipientMemberId} = ${previewPersonaIds.worker} and ${schema.notifications.title} in ('Assignment cancelled', 'Shift cancelled by Manager')`)
    expect(cancellationNotifications).toHaveLength(1)
    const managerActivity = await connection.db
      .select({ count: count() })
      .from(schema.activityEvents)
      .where(sql`${schema.activityEvents.shiftId} = ${previewIdentifiers.shifts.managerDraft} and ${schema.activityEvents.eventType} = 'shift_manager_cancelled'`)
    expect(managerActivity[0]?.count).toBe(1)

    const replayed = await repository.cancelManagerShift(managerCommand)
    expect(replayed).toMatchObject({ idempotentReplay: true, shift: { status: 'cancelled' } })
    await expect(repository.cancelManagerShift({
      ...managerCommand,
      reason: 'A contradictory synthetic cancellation reason.',
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })

  it('derives readiness from compliance decisions and retains a review history', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    const recordId = 'd0000000-0000-4000-8000-000000000012'
    const result = await repository.decideAdministratorCompliance({
      administratorId: previewPersonaIds.administrator,
      body: {
        decision: 'approved_current',
        expectedVersion: 1,
        note: 'The synthetic requirement review is complete.',
      },
      idempotencyKey: 'f3000000-0000-4000-8000-000000000001',
      occurredAt: referenceAt,
      recordId,
    })
    expect(result).toMatchObject({ record: { status: 'current', version: 2 }, workerReadiness: 'ready' })
    const detail = await repository.getAdministratorComplianceRecord({
      administratorId: previewPersonaIds.administrator,
      recordId,
    })
    expect(detail?.history[0]).toMatchObject({ decision: 'approved_current' })
    const readiness = await connection.db
      .select({ status: schema.workerProfiles.overallReadinessStatus })
      .from(schema.workerProfiles)
      .where(eq(schema.workerProfiles.id, previewIdentifiers.profiles.minaOkoro))
    expect(readiness[0]?.status).toBe('ready')
    await expect(repository.decideAdministratorCompliance({
      administratorId: previewPersonaIds.administrator,
      body: { decision: 'rejected', expectedVersion: 1, note: 'This deliberately stale review cannot overwrite the result.' },
      idempotencyKey: 'f3000000-0000-4000-8000-000000000002',
      occurredAt: referenceAt,
      recordId,
    })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  })

  it('connects Mina compliance action to readiness, notification, activity and Manager approval eligibility', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    const recordId = 'd0000000-0000-4000-8000-000000000012'
    const assignmentId = 'f3000000-0000-4000-8000-000000000099'
    await connection.db
      .update(schema.shifts)
      .set({ status: 'open' })
      .where(eq(schema.shifts.id, previewIdentifiers.shifts.managerDraft))
    await connection.db.insert(schema.shiftAssignments).values({
      assignedAt: referenceAt,
      id: assignmentId,
      shiftId: previewIdentifiers.shifts.managerDraft,
      status: 'review',
      workerProfileId: previewIdentifiers.profiles.minaOkoro,
    })

    const result = await repository.decideAdministratorCompliance({
      administratorId: previewPersonaIds.administrator,
      body: {
        decision: 'further_information_required',
        expectedVersion: 1,
        note: 'Please confirm the synthetic role requirement renewal evidence.',
      },
      idempotencyKey: 'f3000000-0000-4000-8000-000000000003',
      occurredAt: referenceAt,
      recordId,
    })

    expect(result).toMatchObject({ record: { status: 'information_required', version: 2 }, workerReadiness: 'action_due' })
    const readiness = await connection.db
      .select({ status: schema.workerProfiles.overallReadinessStatus })
      .from(schema.workerProfiles)
      .where(eq(schema.workerProfiles.id, previewIdentifiers.profiles.minaOkoro))
    expect(readiness[0]?.status).toBe('action_due')

    const notificationRows = await connection.db
      .select({ detail: schema.notifications.detail, recipientMemberId: schema.notifications.recipientMemberId, title: schema.notifications.title })
      .from(schema.notifications)
      .where(eq(schema.notifications.recipientMemberId, previewIdentifiers.members.minaOkoro))
    expect(notificationRows).toContainEqual({
      detail: 'A synthetic compliance record needs action before readiness can be restored.',
      recipientMemberId: previewIdentifiers.members.minaOkoro,
      title: 'Compliance action required',
    })

    const activityRows = await connection.db
      .select({ actorMemberId: schema.activityEvents.actorMemberId, eventType: schema.activityEvents.eventType, subjectMemberId: schema.activityEvents.subjectMemberId, title: schema.activityEvents.title })
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.subjectMemberId, previewIdentifiers.members.minaOkoro))
    expect(activityRows).toContainEqual({
      actorMemberId: previewPersonaIds.administrator,
      eventType: 'compliance_decided',
      subjectMemberId: previewIdentifiers.members.minaOkoro,
      title: 'Compliance review decided',
    })

    const requests = await repository.getManagerAssignmentRequests({
      limit: 20,
      managerId: previewPersonaIds.manager,
    })
    expect(requests?.items.find((request) => request.assignmentId === assignmentId)).toMatchObject({
      worker: { displayName: 'Mina Okoro', readinessStatus: 'action_due' },
    })
    await expect(repository.decideManagerAssignment({
      assignmentId,
      body: { decision: 'approve', expectedVersion: 1 },
      idempotencyKey: 'f3000000-0000-4000-8000-000000000004',
      managerId: previewPersonaIds.manager,
      occurredAt: referenceAt,
    })).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_REVIEWABLE' })
    const assignmentRows = await connection.db
      .select({ status: schema.shiftAssignments.status })
      .from(schema.shiftAssignments)
      .where(eq(schema.shiftAssignments.id, assignmentId))
    expect(assignmentRows[0]?.status).toBe('review')
  })

  it('linearizes concurrent compliance action and assignment approval around Mina readiness', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    const recordId = 'd0000000-0000-4000-8000-000000000012'
    const assignmentId = 'f3000000-0000-4000-8000-000000000098'
    await connection.db
      .update(schema.shifts)
      .set({ status: 'open' })
      .where(eq(schema.shifts.id, previewIdentifiers.shifts.managerDraft))
    await connection.db.insert(schema.shiftAssignments).values({
      assignedAt: referenceAt,
      id: assignmentId,
      shiftId: previewIdentifiers.shifts.managerDraft,
      status: 'review',
      workerProfileId: previewIdentifiers.profiles.minaOkoro,
    })

    const [complianceResult, approvalResult] = await Promise.allSettled([
      repository.decideAdministratorCompliance({
        administratorId: previewPersonaIds.administrator,
        body: {
          decision: 'further_information_required',
          expectedVersion: 1,
          note: 'Please confirm the synthetic role requirement renewal evidence.',
        },
        idempotencyKey: 'f3000000-0000-4000-8000-000000000010',
        occurredAt: referenceAt,
        recordId,
      }),
      repository.decideManagerAssignment({
        assignmentId,
        body: { decision: 'approve', expectedVersion: 1 },
        idempotencyKey: 'f3000000-0000-4000-8000-000000000011',
        managerId: previewPersonaIds.manager,
        occurredAt: referenceAt,
      }),
    ])

    expect(complianceResult.status).toBe('fulfilled')
    const readinessRows = await connection.db
      .select({ status: schema.workerProfiles.overallReadinessStatus })
      .from(schema.workerProfiles)
      .where(eq(schema.workerProfiles.id, previewIdentifiers.profiles.minaOkoro))
    const assignmentRows = await connection.db
      .select({ status: schema.shiftAssignments.status })
      .from(schema.shiftAssignments)
      .where(eq(schema.shiftAssignments.id, assignmentId))
    expect(readinessRows[0]?.status).toBe('action_due')
    if (approvalResult.status === 'rejected') {
      expect(approvalResult.reason).toMatchObject({ code: 'ASSIGNMENT_NOT_REVIEWABLE' })
      expect(assignmentRows[0]?.status).toBe('review')
    } else {
      expect(approvalResult.value).toMatchObject({ status: 'confirmed' })
      expect(assignmentRows[0]?.status).toBe('confirmed')
    }
    const complianceActivity = await connection.db
      .select({ count: count() })
      .from(schema.activityEvents)
      .where(sql`${schema.activityEvents.subjectMemberId} = ${previewIdentifiers.members.minaOkoro} and ${schema.activityEvents.eventType} = 'compliance_decided'`)
    expect(complianceActivity[0]?.count).toBe(1)
  })

  it('enforces timesheet constraints and the complete correction lifecycle', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    const created = await repository.createWorkerTimesheet({
      body: {
        assignmentId: previewIdentifiers.assignments.leilaPastLate,
        breakMinutes: 30,
        workedEnd: '2026-08-21T22:00:00.000Z',
        workedStart: '2026-08-21T14:00:00.000Z',
        workerNote: 'Synthetic shift recorded.',
      },
      idempotencyKey: 'f4000000-0000-4000-8000-000000000001',
      occurredAt: referenceAt,
      workerId: previewPersonaIds.worker,
    })
    if (created === null) throw new Error('Expected a timesheet draft.')
    const submitted = await repository.submitWorkerTimesheet({
      expectedVersion: created.timesheet.version,
      idempotencyKey: 'f4000000-0000-4000-8000-000000000002',
      occurredAt: referenceAt,
      timesheetId: created.timesheet.id,
      workerId: previewPersonaIds.worker,
    })
    if (submitted === null) throw new Error('Expected a submitted timesheet.')
    const rejected = await repository.decideManagerTimesheet({
      body: { decision: 'reject', expectedVersion: submitted.timesheet.version, reviewNote: 'Please confirm the synthetic break duration.' },
      idempotencyKey: 'f4000000-0000-4000-8000-000000000003',
      managerId: previewPersonaIds.manager,
      occurredAt: referenceAt,
      timesheetId: created.timesheet.id,
    })
    if (rejected === null) throw new Error('Expected a rejected timesheet.')
    const corrected = await repository.updateWorkerTimesheet({
      body: {
        breakMinutes: 35,
        expectedVersion: rejected.timesheet.version,
        workedEnd: rejected.timesheet.workedEnd,
        workedStart: rejected.timesheet.workedStart,
        workerNote: 'Synthetic break duration confirmed.',
      },
      idempotencyKey: 'f4000000-0000-4000-8000-000000000004',
      occurredAt: referenceAt,
      timesheetId: created.timesheet.id,
      workerId: previewPersonaIds.worker,
    })
    if (corrected === null) throw new Error('Expected a corrected timesheet.')
    const resubmitted = await repository.submitWorkerTimesheet({
      expectedVersion: corrected.timesheet.version,
      idempotencyKey: 'f4000000-0000-4000-8000-000000000005',
      occurredAt: referenceAt,
      timesheetId: created.timesheet.id,
      workerId: previewPersonaIds.worker,
    })
    if (resubmitted === null) throw new Error('Expected a resubmitted timesheet.')
    const approved = await repository.decideManagerTimesheet({
      body: { decision: 'approve', expectedVersion: resubmitted.timesheet.version, reviewNote: 'Synthetic time reviewed.' },
      idempotencyKey: 'f4000000-0000-4000-8000-000000000006',
      managerId: previewPersonaIds.manager,
      occurredAt: referenceAt,
      timesheetId: created.timesheet.id,
    })
    expect(approved?.timesheet).toMatchObject({ breakMinutes: 35, status: 'approved' })
    await expect(repository.updateWorkerTimesheet({
      body: {
        breakMinutes: 30,
        expectedVersion: approved?.timesheet.version ?? 1,
        workedEnd: '2026-08-21T22:00:00.000Z',
        workedStart: '2026-08-21T14:00:00.000Z',
        workerNote: null,
      },
      idempotencyKey: 'f4000000-0000-4000-8000-000000000007',
      occurredAt: referenceAt,
      timesheetId: created.timesheet.id,
      workerId: previewPersonaIds.worker,
    })).rejects.toMatchObject({ code: 'TIMESHEET_LIFECYCLE_CONFLICT' })

    await expect(connection.db.insert(schema.timesheets).values({
      assignmentId: '80000000-0000-4000-8000-000000000015',
      breakMinutes: 480,
      id: 'f4000000-0000-4000-8000-000000000099',
      organisationId: previewIdentifiers.organisation,
      shiftId: previewIdentifiers.shifts.harbourlightShortStay,
      status: 'draft',
      workedEnd: '2026-08-29T19:00:00.000Z',
      workedMinutes: 1,
      workedStart: '2026-08-29T11:00:00.000Z',
      workerProfileId: previewIdentifiers.profiles.leilaMensah,
    })).rejects.toThrow()
  })
})

describe('worker shift journey repository', () => {
  const referenceAt = '2026-08-25T10:30:00.000Z'

  it('filters and paginates available shifts with stable ordering', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)

    const first = await repository.getWorkerShifts({
      availability: 'available',
      limit: 2,
      referenceAt,
      workerId: previewPersonaIds.worker,
    })
    if (first === null) throw new Error('Expected worker shifts.')
    const { nextCursor, ...data } = first
    workerShiftsDataSchema.parse(data)
    expect(data.items).toHaveLength(2)
    expect(nextCursor).not.toBeNull()

    const second = await repository.getWorkerShifts({
      availability: 'available',
      cursor: nextCursor ?? undefined,
      limit: 2,
      locationId: previewIdentifiers.locations.willowmere,
      referenceAt,
      workerId: previewPersonaIds.worker,
    })
    expect(second?.items.map((item) => item.id)).not.toEqual(
      first.items.map((item) => item.id),
    )
  })

  it('uses inclusive location-local shift start dates for discovery boundaries', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)

    const range = await repository.getWorkerShifts({
      availability: 'all',
      from: '2026-08-29',
      limit: 100,
      referenceAt,
      to: '2026-08-30',
      workerId: previewPersonaIds.worker,
    })
    if (range === null) throw new Error('Expected worker shifts.')
    const ids = range.items.map((item) => item.id)

    expect(ids).toEqual(
      expect.arrayContaining([
        previewIdentifiers.shifts.harbourlightShortStay,
        previewIdentifiers.shifts.harbourlightCedarNight,
        previewIdentifiers.shifts.willowmereLakeMorning,
        previewIdentifiers.shifts.harbourlightReview,
      ]),
    )
    expect(ids).not.toContain(previewIdentifiers.shifts.willowmereBirch)
    expect(ids).not.toContain(previewIdentifiers.shifts.willowmereOakEvening)

    const empty = await repository.getWorkerShifts({
      availability: 'all',
      from: '2026-10-01',
      limit: 100,
      referenceAt,
      to: '2026-10-02',
      workerId: previewPersonaIds.worker,
    })
    expect(empty?.items).toHaveLength(0)
  })

  it('returns contract-valid shift detail and worker schedule data', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)

    workerShiftDetailDataSchema.parse(
      await repository.getWorkerShiftDetail({
        referenceAt,
        shiftId: previewIdentifiers.shifts.harbourlightCedarNight,
        workerId: previewPersonaIds.worker,
      }),
    )
    const schedule = await repository.getWorkerSchedule({
      limit: 20,
      referenceAt,
      workerId: previewPersonaIds.worker,
    })
    if (schedule === null) throw new Error('Expected worker schedule.')
    workerScheduleDataSchema.parse({
      asOfDate: schedule.asOfDate,
      items: schedule.items,
      worker: schedule.worker,
    })
    expect(schedule.items.map((item) => item.status)).toEqual(
      expect.arrayContaining(['confirmed', 'under_review', 'cancelled']),
    )
  })

  it('confirms an eligible request atomically and supports stable replay', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    const command = {
      idempotencyKey: 'eligible-request-0001',
      occurredAt: referenceAt,
      shiftId: previewIdentifiers.shifts.harbourlightCedarNight,
      workerId: previewPersonaIds.worker,
    }

    const created = workerAssignmentMutationSchema.parse(
      await repository.requestWorkerShift(command),
    )
    const replayed = workerAssignmentMutationSchema.parse(
      await repository.requestWorkerShift(command),
    )

    expect(created.outcome).toBe('confirmed')
    expect(created.assignment.shift.availability.status).toBe('covered')
    expect(replayed.assignment.id).toBe(created.assignment.id)
    expect(replayed.idempotentReplay).toBe(true)
  })

  it('places a readiness-reviewing worker under review', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)

    const result = await repository.requestWorkerShift({
      idempotencyKey: 'review-request-0001',
      occurredAt: referenceAt,
      shiftId: previewIdentifiers.shifts.harbourlightCedarNight,
      workerId: previewIdentifiers.members.minaOkoro,
    })

    expect(result?.outcome).toBe('under_review')
    expect(result?.assignment.status).toBe('under_review')
  })

  it.each([
    {
      code: 'READINESS_REQUIRED',
      shiftId: previewIdentifiers.shifts.willowmereBirch,
      workerId: previewIdentifiers.members.theoAdeyemi,
    },
    {
      code: 'SHIFT_UNAVAILABLE',
      shiftId: previewIdentifiers.shifts.willowmereBirch,
      workerId: previewPersonaIds.worker,
    },
    {
      code: 'SCHEDULE_OVERLAP',
      shiftId: previewIdentifiers.shifts.willowmereOverlap,
      workerId: previewPersonaIds.worker,
    },
    {
      code: 'SHIFT_FULL',
      shiftId: previewIdentifiers.shifts.willowmereCovered,
      workerId: previewPersonaIds.worker,
    },
  ])('rejects a $code request without partial events', async ({ code, shiftId, workerId }) => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    const before = await connection.db
      .select({ count: count() })
      .from(schema.activityEvents)

    await expect(
      repository.requestWorkerShift({
        idempotencyKey: `rejected-${code.toLowerCase()}`,
        occurredAt: referenceAt,
        shiftId,
        workerId,
      }),
    ).rejects.toMatchObject({ code })
    const after = await connection.db
      .select({ count: count() })
      .from(schema.activityEvents)
    expect(after).toEqual(before)
  })

  it('rejects an idempotency key reused for another shift', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    const idempotencyKey = 'conflicting-request-key'
    await repository.requestWorkerShift({
      idempotencyKey,
      occurredAt: referenceAt,
      shiftId: previewIdentifiers.shifts.harbourlightCedarNight,
      workerId: previewPersonaIds.worker,
    })

    await expect(
      repository.requestWorkerShift({
        idempotencyKey,
        occurredAt: referenceAt,
        shiftId: previewIdentifiers.shifts.willowmereLakeMorning,
        workerId: previewPersonaIds.worker,
      }),
    ).rejects.toBeInstanceOf(WorkerJourneyRuleError)
  })

  it('allows only one concurrent request for the last place', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    const results = await Promise.allSettled([
      repository.requestWorkerShift({
        idempotencyKey: 'concurrent-leila-0001',
        occurredAt: referenceAt,
        shiftId: previewIdentifiers.shifts.harbourlightCedarNight,
        workerId: previewPersonaIds.worker,
      }),
      repository.requestWorkerShift({
        idempotencyKey: 'concurrent-sofia-0001',
        occurredAt: referenceAt,
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

  it('cancels a future assignment, reopens capacity and replays safely', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    const requested = await repository.requestWorkerShift({
      idempotencyKey: 'cancel-setup-request',
      occurredAt: referenceAt,
      shiftId: previewIdentifiers.shifts.harbourlightCedarNight,
      workerId: previewPersonaIds.worker,
    })
    if (requested === null) throw new Error('Expected assignment request.')
    const command = {
      assignmentId: requested.assignment.id,
      idempotencyKey: 'cancel-assignment-0001',
      occurredAt: referenceAt,
      workerId: previewPersonaIds.worker,
    }

    const cancelled = await repository.cancelWorkerAssignment(command)
    const replayed = await repository.cancelWorkerAssignment(command)
    expect(cancelled?.outcome).toBe('cancelled')
    expect(cancelled?.assignment.shift.availability.status).toBe('open')
    expect(replayed?.assignment.id).toBe(cancelled?.assignment.id)
    expect(replayed?.idempotentReplay).toBe(true)
  })

  it('rejects cancellation of past and already-cancelled assignments', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)

    await expect(
      repository.cancelWorkerAssignment({
        assignmentId: '80000000-0000-4000-8000-000000000019',
        idempotencyKey: 'cancel-past-assignment',
        occurredAt: referenceAt,
        workerId: previewPersonaIds.worker,
      }),
    ).rejects.toMatchObject({ code: 'CANCELLATION_NOT_ALLOWED' })
    await expect(
      repository.cancelWorkerAssignment({
        assignmentId: '80000000-0000-4000-8000-000000000017',
        idempotencyKey: 'cancel-already-cancelled',
        occurredAt: referenceAt,
        workerId: previewPersonaIds.worker,
      }),
    ).rejects.toMatchObject({ code: 'CANCELLATION_NOT_ALLOWED' })
  })

  it('preview reset removes mutation records and restores deterministic seed', async () => {
    const connection = await createMigratedDatabase()
    await seedSyntheticPreview(connection)
    const repository = createDrizzlePreviewRepository(connection)
    await repository.requestWorkerShift({
      idempotencyKey: 'reset-request-0001',
      occurredAt: referenceAt,
      shiftId: previewIdentifiers.shifts.harbourlightCedarNight,
      workerId: previewPersonaIds.worker,
    })

    await resetSyntheticPreview(connection, { confirmPreviewReset: true })
    const idempotencyRows = await connection.db
      .select({ count: count() })
      .from(schema.idempotencyRecords)
    const cedarAssignments = await connection.db
      .select({ count: count() })
      .from(schema.shiftAssignments)
      .where(
        eq(
          schema.shiftAssignments.shiftId,
          previewIdentifiers.shifts.harbourlightCedarNight,
        ),
      )
    expect(idempotencyRows[0]?.count).toBe(0)
    expect(cedarAssignments[0]?.count).toBe(0)
  })
})

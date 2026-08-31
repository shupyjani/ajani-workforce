import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  connectDatabase,
  type PgliteDatabaseConnection,
} from './connection.js'
import { migrateDatabase } from './migrate.js'
import { resetSyntheticPreview, seedSyntheticPreview } from './seed.js'
import * as schema from './schema.js'

export interface DatabaseDeliveryVerification {
  readonly digest: string
  readonly rows: number
  readonly tables: number
}

async function previewSnapshot(
  connection: Awaited<ReturnType<typeof connectDatabase>> & { readonly mode: 'pglite' },
) {
  const db = connection.db
  return {
    activityEvents: await db.select().from(schema.activityEvents).orderBy(schema.activityEvents.id),
    complianceRecords: await db.select().from(schema.complianceRecords).orderBy(schema.complianceRecords.id),
    complianceRequirements: await db.select().from(schema.complianceRequirements).orderBy(schema.complianceRequirements.id),
    complianceReviewEvents: await db.select().from(schema.complianceReviewEvents).orderBy(schema.complianceReviewEvents.id),
    competencies: await db.select().from(schema.competencies).orderBy(schema.competencies.id),
    idempotencyRecords: await db.select().from(schema.idempotencyRecords).orderBy(schema.idempotencyRecords.id),
    locations: await db.select().from(schema.locations).orderBy(schema.locations.id),
    notifications: await db.select().from(schema.notifications).orderBy(schema.notifications.id),
    organisations: await db.select().from(schema.organisations).orderBy(schema.organisations.id),
    shiftAssignments: await db.select().from(schema.shiftAssignments).orderBy(schema.shiftAssignments.id),
    shifts: await db.select().from(schema.shifts).orderBy(schema.shifts.id),
    timesheets: await db.select().from(schema.timesheets).orderBy(schema.timesheets.id),
    workerCompetencies: await db.select().from(schema.workerCompetencies).orderBy(schema.workerCompetencies.id),
    workerProfiles: await db.select().from(schema.workerProfiles).orderBy(schema.workerProfiles.id),
    workforceMembers: await db.select().from(schema.workforceMembers).orderBy(schema.workforceMembers.id),
  }
}

function snapshotDigest(snapshot: Awaited<ReturnType<typeof previewSnapshot>>): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

export async function verifyDatabaseDelivery(): Promise<DatabaseDeliveryVerification> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'ajani-db-verify-'))
  const resolvedTemporaryRoot = resolve(temporaryRoot)
  let connection: PgliteDatabaseConnection | undefined

  try {
    const activeConnection = await connectDatabase({
      dataDirectory: join(resolvedTemporaryRoot, 'pglite'),
      mode: 'pglite',
    })
    if (activeConnection.mode !== 'pglite') {
      throw new Error('Database delivery verification requires PGlite mode.')
    }
    connection = activeConnection
    await migrateDatabase(activeConnection)
    await seedSyntheticPreview(activeConnection)
    const firstSnapshot = await previewSnapshot(activeConnection)
    await seedSyntheticPreview(activeConnection)
    const secondSnapshot = await previewSnapshot(activeConnection)
    await resetSyntheticPreview(activeConnection, { confirmPreviewReset: true })
    const resetSnapshot = await previewSnapshot(activeConnection)

    const digest = snapshotDigest(firstSnapshot)
    if (
      snapshotDigest(secondSnapshot) !== digest ||
      snapshotDigest(resetSnapshot) !== digest
    ) {
      throw new Error('Synthetic preview seed or reset was not deterministic.')
    }

    const collections = Object.values(firstSnapshot)
    return {
      digest,
      rows: collections.reduce((total, rows) => total + rows.length, 0),
      tables: collections.length,
    }
  } finally {
    await connection?.close()
    await rm(resolvedTemporaryRoot, { force: true, recursive: true })
  }
}

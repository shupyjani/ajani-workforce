import { eq, inArray } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type { DatabaseConnection } from './connection.js'
import {
  previewActivityEvents,
  previewComplianceRecords,
  previewComplianceReviewEvents,
  previewComplianceRequirements,
  previewCompetencies,
  previewLocations,
  previewNotifications,
  previewOrganisations,
  previewShiftAssignments,
  previewShifts,
  previewTimesheets,
  previewWorkerCompetencies,
  previewWorkerProfiles,
  previewWorkforceMembers,
} from './preview-data.js'
import * as schema from './schema.js'

export interface SyntheticPreviewSeedSummary {
  readonly activityEvents: number
  readonly complianceRecords: number
  readonly complianceRequirements: number
  readonly complianceReviewEvents: number
  readonly competencies: number
  readonly idempotencyRecords: number
  readonly locations: number
  readonly notifications: number
  readonly organisations: number
  readonly shiftAssignments: number
  readonly shifts: number
  readonly timesheets: number
  readonly workforceMembers: number
  readonly workerCompetencies: number
  readonly workerProfiles: number
}

export class PreviewResetNotAllowedError extends Error {
  public override readonly name = 'PreviewResetNotAllowedError'
}

export const syntheticPreviewSeedSummary: SyntheticPreviewSeedSummary = {
  activityEvents: previewActivityEvents.length,
  complianceRecords: previewComplianceRecords.length,
  complianceRequirements: previewComplianceRequirements.length,
  complianceReviewEvents: previewComplianceReviewEvents.length,
  competencies: previewCompetencies.length,
  idempotencyRecords: 0,
  locations: previewLocations.length,
  notifications: previewNotifications.length,
  organisations: previewOrganisations.length,
  shiftAssignments: previewShiftAssignments.length,
  shifts: previewShifts.length,
  timesheets: previewTimesheets.length,
  workforceMembers: previewWorkforceMembers.length,
  workerCompetencies: previewWorkerCompetencies.length,
  workerProfiles: previewWorkerProfiles.length,
}

async function seedRowsWithTransaction<TQueryResult extends PgQueryResultHKT>(
  transaction: PgDatabase<TQueryResult, typeof schema>,
): Promise<void> {
  await transaction
    .insert(schema.organisations)
    .values([...previewOrganisations])
    .onConflictDoNothing({ target: schema.organisations.id })
  await transaction
    .insert(schema.locations)
    .values([...previewLocations])
    .onConflictDoNothing({ target: schema.locations.id })
  await transaction
    .insert(schema.workforceMembers)
    .values([...previewWorkforceMembers])
    .onConflictDoNothing({ target: schema.workforceMembers.id })
  await transaction
    .insert(schema.workerProfiles)
    .values([...previewWorkerProfiles])
    .onConflictDoNothing({ target: schema.workerProfiles.id })
  await transaction
    .insert(schema.competencies)
    .values([...previewCompetencies])
    .onConflictDoNothing({ target: schema.competencies.id })
  await transaction
    .insert(schema.workerCompetencies)
    .values(previewWorkerCompetencies)
    .onConflictDoNothing({ target: schema.workerCompetencies.id })
  await transaction
    .insert(schema.complianceRequirements)
    .values(previewComplianceRequirements)
    .onConflictDoNothing({ target: schema.complianceRequirements.id })
  await transaction
    .insert(schema.complianceRecords)
    .values(previewComplianceRecords)
    .onConflictDoNothing({ target: schema.complianceRecords.id })
  await transaction
    .insert(schema.complianceReviewEvents)
    .values([...previewComplianceReviewEvents])
    .onConflictDoNothing({ target: schema.complianceReviewEvents.id })
  await transaction
    .insert(schema.shifts)
    .values([...previewShifts])
    .onConflictDoNothing({ target: schema.shifts.id })
  await transaction
    .insert(schema.shiftAssignments)
    .values(previewShiftAssignments)
    .onConflictDoNothing({ target: schema.shiftAssignments.id })
  await transaction
    .insert(schema.timesheets)
    .values([...previewTimesheets])
    .onConflictDoNothing({ target: schema.timesheets.id })
  await transaction
    .insert(schema.notifications)
    .values([...previewNotifications])
    .onConflictDoNothing({ target: schema.notifications.id })
  await transaction
    .insert(schema.activityEvents)
    .values(previewActivityEvents)
    .onConflictDoNothing({ target: schema.activityEvents.id })
}

async function seedWithDatabase<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult, typeof schema>,
): Promise<void> {
  await db.transaction(seedRowsWithTransaction)
}

export async function seedSyntheticPreview(
  connection: DatabaseConnection,
): Promise<SyntheticPreviewSeedSummary> {
  if (connection.mode === 'pglite') {
    await seedWithDatabase(connection.db)
  } else {
    await seedWithDatabase(connection.db)
  }
  return syntheticPreviewSeedSummary
}

async function deletePreviewRowsWithTransaction<TQueryResult extends PgQueryResultHKT>(
  transaction: PgDatabase<TQueryResult, typeof schema>,
): Promise<void> {
  const previewMemberIds = previewWorkforceMembers.map((member) => member.id)
  const previewProfileIds = previewWorkerProfiles.map((profile) => profile.id)

  await transaction
    .delete(schema.activityEvents)
    .where(eq(schema.activityEvents.organisationId, previewOrganisations[0].id))
  await transaction.delete(schema.notifications).where(
    inArray(
      schema.notifications.recipientMemberId,
      previewMemberIds,
    ),
  )
  await transaction.delete(schema.idempotencyRecords).where(
    inArray(schema.idempotencyRecords.actorMemberId, previewMemberIds),
  )
  await transaction.delete(schema.timesheets).where(
    inArray(schema.timesheets.workerProfileId, previewProfileIds),
  )
  await transaction.delete(schema.shiftAssignments).where(
    inArray(
      schema.shiftAssignments.workerProfileId,
      previewProfileIds,
    ),
  )
  // Scoped by organisation, not the static seeded shift IDs: a manager can create
  // a new future shift in the synthetic organisation (a fresh ID, never in
  // `previewShifts`), and `locations`/`organisations` below are `onDelete:
  // 'restrict'` for shifts, so any such shift left behind would block this
  // transaction. Every shift in this preview universe belongs to the one
  // synthetic organisation, so this remains an exact, non-destructive scope.
  await transaction
    .delete(schema.shifts)
    .where(eq(schema.shifts.organisationId, previewOrganisations[0].id))
  await transaction.delete(schema.complianceRecords).where(
    inArray(
      schema.complianceRecords.id,
      previewComplianceRecords.map((record) => record.id),
    ),
  )
  await transaction.delete(schema.workerCompetencies).where(
    inArray(
      schema.workerCompetencies.id,
      previewWorkerCompetencies.map((record) => record.id),
    ),
  )
  await transaction.delete(schema.complianceRequirements).where(
    inArray(
      schema.complianceRequirements.id,
      previewComplianceRequirements.map((requirement) => requirement.id),
    ),
  )
  await transaction.delete(schema.competencies).where(
    inArray(
      schema.competencies.id,
      previewCompetencies.map((competency) => competency.id),
    ),
  )
  await transaction.delete(schema.workerProfiles).where(
    inArray(
      schema.workerProfiles.id,
      previewWorkerProfiles.map((profile) => profile.id),
    ),
  )
  await transaction.delete(schema.workforceMembers).where(
    inArray(
      schema.workforceMembers.id,
      previewWorkforceMembers.map((member) => member.id),
    ),
  )
  await transaction.delete(schema.locations).where(
    inArray(
      schema.locations.id,
      previewLocations.map((location) => location.id),
    ),
  )
  await transaction.delete(schema.organisations).where(
    inArray(
      schema.organisations.id,
      previewOrganisations.map((organisation) => organisation.id),
    ),
  )
}

async function deletePreviewRows<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult, typeof schema>,
): Promise<void> {
  await db.transaction(deletePreviewRowsWithTransaction)
}

export async function resetSyntheticPreview(
  connection: DatabaseConnection,
  options: { readonly confirmPreviewReset: boolean },
): Promise<SyntheticPreviewSeedSummary> {
  if (!options.confirmPreviewReset || connection.mode !== 'pglite') {
    throw new PreviewResetNotAllowedError(
      'Synthetic preview reset is restricted to explicit PGlite use.',
    )
  }

  await deletePreviewRows(connection.db)
  return seedSyntheticPreview(connection)
}

/**
 * The dedicated hosted-preview counterpart to `resetSyntheticPreview` above.
 * Deliberately a separate function rather than a relaxed guard on the
 * PGlite-only one: `resetSyntheticPreview` must stay refusable for anything
 * but explicit PGlite use, and this function must stay refusable for
 * anything but explicit PostgreSQL use. Callers decide which one applies —
 * see `assertHostedPreviewResetCompatible` in config.ts for the startup-time
 * check that `AJANI_HOSTED_PREVIEW_RESET` and `AJANI_DATA_MODE` agree before
 * either connects to a database.
 *
 * Deletes and reseeds inside one transaction (stronger than the two
 * sequential transactions `resetSyntheticPreview` uses), so a hosted cold
 * start never leaves the database mid-reset — either the previous cycle's
 * synthetic rows remain untouched, or the fresh deterministic seed is fully
 * in place.
 */
export async function resetHostedSyntheticPreviewPostgres(
  connection: DatabaseConnection,
): Promise<SyntheticPreviewSeedSummary> {
  if (connection.mode !== 'postgres') {
    throw new PreviewResetNotAllowedError(
      'The hosted synthetic-preview reset is restricted to explicit PostgreSQL use.',
    )
  }

  await connection.db.transaction(async (transaction) => {
    await deletePreviewRowsWithTransaction(transaction)
    await seedRowsWithTransaction(transaction)
  })
  return syntheticPreviewSeedSummary
}

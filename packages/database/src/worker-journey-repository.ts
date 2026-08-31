import { randomUUID } from 'node:crypto'
import {
  workerAssignmentMutationSchema,
  type WorkerAssignmentMutation,
  type WorkerAssignmentStatus,
  type WorkerScheduleAssignment,
  type WorkerShiftDetail,
  type WorkerShiftEligibility,
} from '@ajani/contracts'
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  or,
  sql,
} from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import {
  decodeWorkerScheduleCursor,
  decodeWorkerShiftsCursor,
  encodeWorkerScheduleCursor,
  encodeWorkerShiftsCursor,
} from './cursor.js'
import type {
  WorkerAssignmentCancellationCommand,
  WorkerScheduleLookup,
  WorkerShiftDetailLookup,
  WorkerShiftRequestCommand,
  WorkerShiftsLookup,
} from './repository-types.js'
import { WorkerJourneyRuleError } from './repository-types.js'
import * as schema from './schema.js'

const capacityStatuses = ['confirmed', 'review'] as const
const idempotencyRetentionMilliseconds = 30 * 24 * 60 * 60 * 1_000

type DatabaseTransaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult, typeof schema>['transaction']>[0]
>[0]

interface WorkerContext {
  readonly familyName: string
  readonly givenName: string
  readonly id: string
  readonly organisationId: string
  readonly profileId: string
  readonly readinessStatus: typeof schema.workerProfiles.$inferSelect.overallReadinessStatus
  readonly roleTitle: string
}

interface ShiftViewRow {
  readonly areaName: string
  readonly arrivalNote: string | null
  readonly endsAt: string
  readonly id: string
  readonly locationId: string
  readonly locationName: string
  readonly organisationId: string
  readonly organisationName: string
  readonly requiredWorkers: number
  readonly reservedWorkers: number
  readonly roleTitle: string
  readonly startsAt: string
  readonly status: typeof schema.shifts.$inferSelect.status
  readonly timezone: string
}

interface AssignmentWindow {
  readonly id: string
  readonly shiftId: string
  readonly startsAt: string
  readonly endsAt: string
  readonly status: typeof schema.shiftAssignments.$inferSelect.status
}

function isoDateTime(value: string): string {
  return new Date(value).toISOString()
}

function displayName(worker: WorkerContext): string {
  return `${worker.givenName} ${worker.familyName}`
}

function transportAssignmentStatus(
  value: typeof schema.shiftAssignments.$inferSelect.status,
): WorkerAssignmentStatus {
  return value === 'review' ? 'under_review' : value
}

function transportShiftStatus(
  value: typeof schema.shifts.$inferSelect.status,
): 'open' | 'covered' | 'cancelled' {
  return value === 'open' || value === 'covered' ? value : 'cancelled'
}

function remainingPlaces(shift: ShiftViewRow): number {
  return Math.max(shift.requiredWorkers - shift.reservedWorkers, 0)
}

function overlaps(
  shift: ShiftViewRow,
  assignments: readonly AssignmentWindow[],
): boolean {
  return assignments.some(
    (assignment) =>
      assignment.shiftId !== shift.id &&
      assignment.status !== 'cancelled' &&
      Date.parse(assignment.startsAt) < Date.parse(shift.endsAt) &&
      Date.parse(assignment.endsAt) > Date.parse(shift.startsAt),
  )
}

function eligibilityFor(
  worker: WorkerContext,
  shift: ShiftViewRow,
  assignments: readonly AssignmentWindow[],
): WorkerShiftEligibility {
  const existing = assignments.find((assignment) => assignment.shiftId === shift.id)

  if (existing !== undefined && existing.status !== 'cancelled') {
    return {
      detail: 'This shift is already present in your synthetic preview schedule.',
      outcome: 'already_assigned',
      title: 'Already in your schedule',
    }
  }
  if (shift.status === 'cancelled') {
    return {
      detail: 'This synthetic shift has been cancelled and cannot accept requests.',
      outcome: 'unavailable',
      title: 'Shift cancelled',
    }
  }
  if (shift.organisationId !== worker.organisationId) {
    return {
      detail: 'This shift belongs to a different synthetic organisation.',
      outcome: 'blocked',
      title: 'Outside your organisation',
    }
  }
  if (shift.roleTitle !== worker.roleTitle) {
    return {
      detail: `This shift requires the ${shift.roleTitle} role.`,
      outcome: 'blocked',
      title: 'Role does not match',
    }
  }
  if (worker.readinessStatus === 'action_due') {
    return {
      detail: 'A readiness action must be resolved before this shift can be requested.',
      outcome: 'blocked',
      title: 'Readiness action required',
    }
  }
  if (overlaps(shift, assignments)) {
    return {
      detail: 'This time overlaps another confirmed or under-review assignment.',
      outcome: 'blocked',
      title: 'Schedule overlap',
    }
  }
  if (shift.status === 'covered' || remainingPlaces(shift) === 0) {
    return {
      detail: 'Every place on this synthetic shift is currently reserved.',
      outcome: 'unavailable',
      title: 'No places remaining',
    }
  }
  if (worker.readinessStatus === 'reviewing') {
    return {
      detail: 'Your readiness review allows a request, which will remain under review.',
      outcome: 'under_review',
      title: 'Request will be reviewed',
    }
  }
  return {
    detail: 'Your active status, organisation, role and readiness match this shift.',
    outcome: 'eligible',
    title: 'Ready to request',
  }
}

function shiftDetail(
  worker: WorkerContext,
  shift: ShiftViewRow,
  assignments: readonly AssignmentWindow[],
): WorkerShiftDetail {
  const existing = assignments.find((assignment) => assignment.shiftId === shift.id)
  return {
    arrivalNote: shift.arrivalNote,
    availability: {
      remainingPlaces: remainingPlaces(shift),
      requiredWorkers: shift.requiredWorkers,
      reservedWorkers: shift.reservedWorkers,
      status: transportShiftStatus(shift.status),
    },
    durationMinutes: Math.round(
      (new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) /
        60_000,
    ),
    eligibility: eligibilityFor(worker, shift, assignments),
    endsAt: isoDateTime(shift.endsAt),
    existingAssignmentId: existing?.id ?? null,
    id: shift.id,
    location: {
      area: shift.areaName,
      id: shift.locationId,
      name: shift.locationName,
      timezone: shift.timezone,
    },
    organisation: {
      id: shift.organisationId,
      name: shift.organisationName,
    },
    roleTitle: shift.roleTitle,
    startsAt: isoDateTime(shift.startsAt),
  }
}

function assignmentMutationMessage(
  outcome: WorkerAssignmentMutation['outcome'],
): string {
  if (outcome === 'confirmed') {
    return 'The shift is confirmed in your synthetic preview schedule.'
  }
  if (outcome === 'under_review') {
    return 'The request is under review in your synthetic preview schedule.'
  }
  return 'The assignment was cancelled and its reserved place was released.'
}

export class WorkerJourneyRepository<TQueryResult extends PgQueryResultHKT> {
  public constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  private async lockWorkerProfile(
    transaction: DatabaseTransaction<TQueryResult>,
    workerProfileId: string,
  ): Promise<void> {
    await transaction.execute(
      sql`select ${schema.workerProfiles.id} from ${schema.workerProfiles} where ${schema.workerProfiles.id} = ${workerProfileId} for update`,
    )
  }

  private async lockShift(
    transaction: DatabaseTransaction<TQueryResult>,
    shiftId: string,
  ): Promise<void> {
    await transaction.execute(
      sql`select ${schema.shifts.id} from ${schema.shifts} where ${schema.shifts.id} = ${shiftId} for update`,
    )
  }

  private async lockAssignment(
    transaction: DatabaseTransaction<TQueryResult>,
    assignmentId: string,
  ): Promise<void> {
    await transaction.execute(
      sql`select ${schema.shiftAssignments.id} from ${schema.shiftAssignments} where ${schema.shiftAssignments.id} = ${assignmentId} for update`,
    )
  }

  private async workerContext(
    transaction: Parameters<
      Parameters<PgDatabase<TQueryResult, typeof schema>['transaction']>[0]
    >[0],
    workerId: string,
  ): Promise<WorkerContext | null> {
    const rows = await transaction
      .select({
        familyName: schema.workforceMembers.familyName,
        givenName: schema.workforceMembers.givenName,
        id: schema.workforceMembers.id,
        memberStatus: schema.workforceMembers.status,
        organisationId: schema.workforceMembers.organisationId,
        profileId: schema.workerProfiles.id,
        readinessStatus: schema.workerProfiles.overallReadinessStatus,
        roleTitle: schema.workforceMembers.roleTitle,
      })
      .from(schema.workforceMembers)
      .innerJoin(
        schema.workerProfiles,
        eq(schema.workerProfiles.workforceMemberId, schema.workforceMembers.id),
      )
      .where(
        and(
          eq(schema.workforceMembers.id, workerId),
          eq(schema.workforceMembers.memberType, 'worker'),
        ),
      )
      .limit(1)
    const worker = rows[0]
    if (worker?.memberStatus !== 'active') return null
    return worker
  }

  private async assignmentWindows(
    transaction: Parameters<
      Parameters<PgDatabase<TQueryResult, typeof schema>['transaction']>[0]
    >[0],
    profileId: string,
  ): Promise<readonly AssignmentWindow[]> {
    return transaction
      .select({
        endsAt: schema.shifts.endsAt,
        id: schema.shiftAssignments.id,
        shiftId: schema.shiftAssignments.shiftId,
        startsAt: schema.shifts.startsAt,
        status: schema.shiftAssignments.status,
      })
      .from(schema.shiftAssignments)
      .innerJoin(schema.shifts, eq(schema.shiftAssignments.shiftId, schema.shifts.id))
      .where(eq(schema.shiftAssignments.workerProfileId, profileId))
  }

  private async shiftRows(
    transaction: Parameters<
      Parameters<PgDatabase<TQueryResult, typeof schema>['transaction']>[0]
    >[0],
    predicate: ReturnType<typeof and>,
    limit: number,
  ): Promise<readonly ShiftViewRow[]> {
    return transaction
      .select({
        areaName: schema.shifts.areaName,
        arrivalNote: schema.shifts.arrivalNote,
        endsAt: schema.shifts.endsAt,
        id: schema.shifts.id,
        locationId: schema.locations.id,
        locationName: schema.locations.name,
        organisationId: schema.organisations.id,
        organisationName: schema.organisations.name,
        requiredWorkers: schema.shifts.requiredWorkers,
        reservedWorkers: sql<number>`count(*) filter (where ${schema.shiftAssignments.status} in ('confirmed', 'review'))::int`.mapWith(Number),
        roleTitle: schema.shifts.roleTitle,
        startsAt: schema.shifts.startsAt,
        status: schema.shifts.status,
        timezone: schema.locations.timezone,
      })
      .from(schema.shifts)
      .innerJoin(schema.locations, eq(schema.shifts.locationId, schema.locations.id))
      .innerJoin(
        schema.organisations,
        eq(schema.shifts.organisationId, schema.organisations.id),
      )
      .leftJoin(
        schema.shiftAssignments,
        eq(schema.shiftAssignments.shiftId, schema.shifts.id),
      )
      .where(predicate)
      .groupBy(schema.shifts.id, schema.locations.id, schema.organisations.id)
      .orderBy(asc(schema.shifts.startsAt), asc(schema.shifts.id))
      .limit(limit)
  }

  public async getWorkerShifts(query: WorkerShiftsLookup) {
    return this.db.transaction(async (transaction) => {
      const worker = await this.workerContext(transaction, query.workerId)
      if (worker === null) return null
      const assignments = await this.assignmentWindows(transaction, worker.profileId)
      const cursor =
        query.cursor === undefined
          ? undefined
          : decodeWorkerShiftsCursor(query.cursor)
      const rows = await this.shiftRows(
        transaction,
        and(
          eq(schema.shifts.organisationId, worker.organisationId),
          inArray(schema.shifts.status, ['open', 'covered']),
          gt(schema.shifts.endsAt, query.referenceAt),
          query.locationId === undefined
            ? undefined
            : eq(schema.shifts.locationId, query.locationId),
          query.from === undefined
            ? undefined
            : sql`(${schema.shifts.startsAt} at time zone ${schema.locations.timezone})::date >= ${query.from}`,
          query.to === undefined
            ? undefined
            : sql`(${schema.shifts.startsAt} at time zone ${schema.locations.timezone})::date <= ${query.to}`,
          cursor === undefined
            ? undefined
            : or(
                gt(schema.shifts.startsAt, cursor.startsAt),
                and(
                  eq(schema.shifts.startsAt, cursor.startsAt),
                  gt(schema.shifts.id, cursor.id),
                ),
              ),
        ),
        101,
      )
      const evaluated = rows.map((shift) => ({
        detail: shiftDetail(worker, shift, assignments),
        row: shift,
      }))
      const visible =
        query.availability === 'available'
          ? evaluated.filter(({ detail }) =>
              ['eligible', 'under_review'].includes(detail.eligibility.outcome),
            )
          : evaluated
      const hasMore = visible.length > query.limit
      const page = visible.slice(0, query.limit)
      const last = page.at(-1)?.row
      const locationRows = await transaction
        .select({ id: schema.locations.id, name: schema.locations.name })
        .from(schema.locations)
        .where(
          and(
            eq(schema.locations.organisationId, worker.organisationId),
            eq(schema.locations.status, 'active'),
          ),
        )
        .orderBy(asc(schema.locations.name), asc(schema.locations.id))

      return {
        asOfDate: query.referenceAt.slice(0, 10),
        items: page.map(({ detail }) => {
          const { arrivalNote, ...summary } = detail
          void arrivalNote
          return summary
        }),
        locations: locationRows,
        nextCursor:
          hasMore && last !== undefined
            ? encodeWorkerShiftsCursor(isoDateTime(last.startsAt), last.id)
            : null,
        worker: {
          displayName: displayName(worker),
          id: worker.id,
          roleTitle: worker.roleTitle,
        },
      }
    })
  }

  public async getWorkerShiftDetail(query: WorkerShiftDetailLookup) {
    return this.db.transaction(async (transaction) => {
      const worker = await this.workerContext(transaction, query.workerId)
      if (worker === null) return null
      const rows = await this.shiftRows(
        transaction,
        and(
          eq(schema.shifts.id, query.shiftId),
          eq(schema.shifts.organisationId, worker.organisationId),
          inArray(schema.shifts.status, ['open', 'covered']),
        ),
        1,
      )
      const shift = rows[0]
      if (shift === undefined) return null
      const assignments = await this.assignmentWindows(transaction, worker.profileId)
      return {
        asOfDate: query.referenceAt.slice(0, 10),
        shift: shiftDetail(worker, shift, assignments),
        worker: {
          displayName: displayName(worker),
          id: worker.id,
          roleTitle: worker.roleTitle,
        },
      }
    })
  }

  public async getWorkerSchedule(query: WorkerScheduleLookup) {
    return this.db.transaction(async (transaction) => {
      const worker = await this.workerContext(transaction, query.workerId)
      if (worker === null) return null
      const cursor =
        query.cursor === undefined
          ? undefined
          : decodeWorkerScheduleCursor(query.cursor)
      const internalStatus =
        query.status === 'under_review' ? 'review' : query.status
      const assignmentRows = await transaction
        .select({
          assignedAt: schema.shiftAssignments.assignedAt,
          assignmentId: schema.shiftAssignments.id,
          assignmentStatus: schema.shiftAssignments.status,
          cancelledAt: schema.shiftAssignments.cancelledAt,
          cancellationReason: schema.shiftAssignments.cancellationReason,
          shiftId: schema.shifts.id,
          startsAt: schema.shifts.startsAt,
        })
        .from(schema.shiftAssignments)
        .innerJoin(schema.shifts, eq(schema.shiftAssignments.shiftId, schema.shifts.id))
        .where(
          and(
            eq(schema.shiftAssignments.workerProfileId, worker.profileId),
            gt(schema.shifts.endsAt, query.referenceAt),
            internalStatus === undefined
              ? undefined
              : eq(schema.shiftAssignments.status, internalStatus),
            cursor === undefined
              ? undefined
              : or(
                  gt(schema.shifts.startsAt, cursor.startsAt),
                  and(
                    eq(schema.shifts.startsAt, cursor.startsAt),
                    gt(schema.shiftAssignments.id, cursor.id),
                  ),
                ),
          ),
        )
        .orderBy(asc(schema.shifts.startsAt), asc(schema.shiftAssignments.id))
        .limit(query.limit + 1)
      const hasMore = assignmentRows.length > query.limit
      const page = assignmentRows.slice(0, query.limit)
      const shiftIds = page.map((assignment) => assignment.shiftId)
      const shifts =
        shiftIds.length === 0
          ? []
          : await this.shiftRows(
              transaction,
              and(inArray(schema.shifts.id, shiftIds)),
              shiftIds.length,
            )
      const shiftsById = new Map(shifts.map((shift) => [shift.id, shift]))
      const windows = await this.assignmentWindows(transaction, worker.profileId)
      const items = page.flatMap((assignment): WorkerScheduleAssignment[] => {
        const shift = shiftsById.get(assignment.shiftId)
        if (shift === undefined) return []
        return [
          {
            cancelledAt:
              assignment.cancelledAt === null
                ? null
                : isoDateTime(assignment.cancelledAt),
            cancellationReason: assignment.cancellationReason,
            id: assignment.assignmentId,
            requestedAt: isoDateTime(assignment.assignedAt),
            shift: shiftDetail(worker, shift, windows),
            status: transportAssignmentStatus(assignment.assignmentStatus),
          },
        ]
      })
      const last = page.at(-1)
      return {
        asOfDate: query.referenceAt.slice(0, 10),
        items,
        nextCursor:
          hasMore && last !== undefined
            ? encodeWorkerScheduleCursor(
                isoDateTime(last.startsAt),
                last.assignmentId,
              )
            : null,
        worker: {
          displayName: displayName(worker),
          id: worker.id,
          roleTitle: worker.roleTitle,
        },
      }
    })
  }

  private async readIdempotentResult(
    transaction: Parameters<
      Parameters<PgDatabase<TQueryResult, typeof schema>['transaction']>[0]
    >[0],
    options: {
      readonly actorMemberId: string
      readonly fingerprint: string
      readonly idempotencyKey: string
      readonly occurredAt: string
      readonly operation: typeof schema.idempotencyRecords.$inferInsert.operation
    },
  ): Promise<WorkerAssignmentMutation | null> {
    const rows = await transaction
      .select()
      .from(schema.idempotencyRecords)
      .where(
        and(
          eq(schema.idempotencyRecords.actorMemberId, options.actorMemberId),
          eq(schema.idempotencyRecords.operation, options.operation),
          eq(schema.idempotencyRecords.idempotencyKey, options.idempotencyKey),
        ),
      )
      .limit(1)
    const record = rows[0]
    if (record === undefined) return null
    if (Date.parse(record.expiresAt) <= Date.parse(options.occurredAt)) {
      await transaction
        .delete(schema.idempotencyRecords)
        .where(eq(schema.idempotencyRecords.id, record.id))
      return null
    }
    if (record.requestFingerprint !== options.fingerprint) {
      throw new WorkerJourneyRuleError(
        'IDEMPOTENCY_CONFLICT',
        'This idempotency key was already used for a different request.',
      )
    }
    const stored = workerAssignmentMutationSchema.parse(
      JSON.parse(record.responsePayload) as unknown,
    )
    return { ...stored, idempotentReplay: true }
  }

  private async storeIdempotentResult(
    transaction: Parameters<
      Parameters<PgDatabase<TQueryResult, typeof schema>['transaction']>[0]
    >[0],
    options: {
      readonly fingerprint: string
      readonly actorMemberId: string
      readonly idempotencyKey: string
      readonly occurredAt: string
      readonly operation: typeof schema.idempotencyRecords.$inferInsert.operation
      readonly responseStatus: number
      readonly result: WorkerAssignmentMutation
      readonly workerProfileId: string
    },
  ): Promise<void> {
    await transaction.insert(schema.idempotencyRecords).values({
      actorMemberId: options.actorMemberId,
      createdAt: options.occurredAt,
      expiresAt: new Date(
        new Date(options.occurredAt).getTime() + idempotencyRetentionMilliseconds,
      ).toISOString(),
      id: randomUUID(),
      idempotencyKey: options.idempotencyKey,
      operation: options.operation,
      requestFingerprint: options.fingerprint,
      responsePayload: JSON.stringify(options.result),
      responseStatus: options.responseStatus,
      updatedAt: options.occurredAt,
      workerProfileId: options.workerProfileId,
    })
  }

  private async assignmentResult(
    transaction: Parameters<
      Parameters<PgDatabase<TQueryResult, typeof schema>['transaction']>[0]
    >[0],
    worker: WorkerContext,
    assignmentId: string,
    outcome: WorkerAssignmentMutation['outcome'],
  ): Promise<WorkerAssignmentMutation> {
    const assignmentRows = await transaction
      .select({
        assignedAt: schema.shiftAssignments.assignedAt,
        cancelledAt: schema.shiftAssignments.cancelledAt,
        cancellationReason: schema.shiftAssignments.cancellationReason,
        shiftId: schema.shiftAssignments.shiftId,
        status: schema.shiftAssignments.status,
      })
      .from(schema.shiftAssignments)
      .where(eq(schema.shiftAssignments.id, assignmentId))
      .limit(1)
    const assignment = assignmentRows[0]
    if (assignment === undefined) {
      throw new Error('The assignment transaction did not produce a result.')
    }
    const shifts = await this.shiftRows(
      transaction,
      and(eq(schema.shifts.id, assignment.shiftId)),
      1,
    )
    const shift = shifts[0]
    if (shift === undefined) {
      throw new Error('The assignment shift was not available after mutation.')
    }
    const windows = await this.assignmentWindows(transaction, worker.profileId)
    return {
      assignment: {
        cancelledAt:
          assignment.cancelledAt === null
            ? null
            : isoDateTime(assignment.cancelledAt),
        cancellationReason: assignment.cancellationReason,
        id: assignmentId,
        requestedAt: isoDateTime(assignment.assignedAt),
        shift: shiftDetail(worker, shift, windows),
        status: transportAssignmentStatus(assignment.status),
      },
      idempotentReplay: false,
      message: assignmentMutationMessage(outcome),
      outcome,
    }
  }

  public async requestWorkerShift(command: WorkerShiftRequestCommand) {
    return this.db.transaction(async (transaction) => {
      let worker = await this.workerContext(transaction, command.workerId)
      if (worker === null) return null
      const fingerprint = `request-shift:${command.shiftId}`
      const replay = await this.readIdempotentResult(transaction, {
        actorMemberId: worker.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'request_shift',
      })
      if (replay !== null) return replay

      const initialWorkerProfileId = worker.profileId
      await this.lockWorkerProfile(transaction, initialWorkerProfileId)
      await this.lockShift(transaction, command.shiftId)
      const lockedWorker = await this.workerContext(transaction, command.workerId)
      if (lockedWorker?.profileId !== initialWorkerProfileId) {
        throw new WorkerJourneyRuleError(
          'SHIFT_UNAVAILABLE',
          'The shift is not available to this worker preview.',
        )
      }
      worker = lockedWorker
      const shifts = await this.shiftRows(
        transaction,
        and(eq(schema.shifts.id, command.shiftId)),
        1,
      )
      const shift = shifts[0]
      if (shift?.organisationId !== worker.organisationId) {
        throw new WorkerJourneyRuleError(
          'SHIFT_UNAVAILABLE',
          'The shift is not available to this worker preview.',
        )
      }
      if (shift.roleTitle !== worker.roleTitle) {
        throw new WorkerJourneyRuleError(
          'SHIFT_UNAVAILABLE',
          'The worker role does not match this shift.',
        )
      }
      if (worker.readinessStatus === 'action_due') {
        throw new WorkerJourneyRuleError(
          'READINESS_REQUIRED',
          'A readiness action must be resolved before requesting this shift.',
        )
      }
      if (
        Date.parse(shift.endsAt) <= Date.parse(command.occurredAt) ||
        !['open', 'covered'].includes(shift.status)
      ) {
        throw new WorkerJourneyRuleError(
          'SHIFT_UNAVAILABLE',
          'This shift is no longer available for requests.',
        )
      }
      const windows = await this.assignmentWindows(transaction, worker.profileId)
      const existing = windows.find((assignment) => assignment.shiftId === shift.id)
      if (existing !== undefined && existing.status !== 'cancelled') {
        throw new WorkerJourneyRuleError(
          'ASSIGNMENT_ALREADY_ACTIVE',
          'This shift is already active in the worker schedule.',
        )
      }
      if (overlaps(shift, windows)) {
        throw new WorkerJourneyRuleError(
          'SCHEDULE_OVERLAP',
          'This shift overlaps another confirmed or under-review assignment.',
        )
      }
      if (shift.status === 'covered' || remainingPlaces(shift) === 0) {
        throw new WorkerJourneyRuleError(
          'SHIFT_FULL',
          'This shift has no remaining places.',
        )
      }

      const internalStatus =
        worker.readinessStatus === 'reviewing' ? 'review' : 'confirmed'
      const assignmentId = existing?.id ?? randomUUID()
      if (existing === undefined) {
        await transaction.insert(schema.shiftAssignments).values({
          assignedAt: command.occurredAt,
          id: assignmentId,
          shiftId: shift.id,
          status: internalStatus,
          updatedAt: command.occurredAt,
          workerProfileId: worker.profileId,
        })
      } else {
        await this.lockAssignment(transaction, assignmentId)
        await transaction
          .update(schema.shiftAssignments)
          .set({
            assignedAt: command.occurredAt,
            cancelledAt: null,
            cancellationReason: null,
            status: internalStatus,
            updatedAt: command.occurredAt,
            version: sql`${schema.shiftAssignments.version} + 1`,
          })
          .where(eq(schema.shiftAssignments.id, assignmentId))
      }

      if (remainingPlaces(shift) === 1) {
        await transaction
          .update(schema.shifts)
          .set({ status: 'covered', updatedAt: command.occurredAt })
          .where(eq(schema.shifts.id, shift.id))
      }
      const isReview = internalStatus === 'review'
      await transaction.insert(schema.notifications).values({
        detail: isReview
          ? 'Your synthetic shift request is under review.'
          : 'Your synthetic shift request is confirmed.',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        recipientMemberId: worker.id,
        title: isReview ? 'Shift request under review' : 'Shift confirmed',
        tone: isReview ? 'information' : 'success',
        updatedAt: command.occurredAt,
      })
      await transaction.insert(schema.activityEvents).values({
        actorMemberId: worker.id,
        detail: isReview
          ? 'A synthetic shift request was placed under review.'
          : 'A synthetic shift request was confirmed.',
        eventType: isReview ? 'shift_request_review' : 'shift_requested',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        organisationId: worker.organisationId,
        shiftId: shift.id,
        subjectMemberId: worker.id,
        title: isReview ? 'Shift request under review' : 'Shift confirmed',
        updatedAt: command.occurredAt,
      })
      const outcome = isReview ? 'under_review' : 'confirmed'
      const result = await this.assignmentResult(
        transaction,
        worker,
        assignmentId,
        outcome,
      )
      await this.storeIdempotentResult(transaction, {
        actorMemberId: worker.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'request_shift',
        responseStatus: 201,
        result,
        workerProfileId: worker.profileId,
      })
      return result
    })
  }

  public async cancelWorkerAssignment(
    command: WorkerAssignmentCancellationCommand,
  ) {
    return this.db.transaction(async (transaction) => {
      const worker = await this.workerContext(transaction, command.workerId)
      if (worker === null) return null
      const fingerprint = `cancel-assignment:${command.assignmentId}`
      const replay = await this.readIdempotentResult(transaction, {
        actorMemberId: worker.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'cancel_assignment',
      })
      if (replay !== null) return replay

      const initialRows = await transaction
        .select({
          shiftId: schema.shiftAssignments.shiftId,
          workerProfileId: schema.shiftAssignments.workerProfileId,
        })
        .from(schema.shiftAssignments)
        .where(eq(schema.shiftAssignments.id, command.assignmentId))
        .limit(1)
      const initial = initialRows[0]
      if (initial?.workerProfileId !== worker.profileId) {
        return null
      }
      await this.lockShift(transaction, initial.shiftId)
      await this.lockAssignment(transaction, command.assignmentId)
      const rows = await transaction
        .select({
          assignmentId: schema.shiftAssignments.id,
          assignmentStatus: schema.shiftAssignments.status,
          shiftId: schema.shifts.id,
          shiftStatus: schema.shifts.status,
          startsAt: schema.shifts.startsAt,
        })
        .from(schema.shiftAssignments)
        .innerJoin(schema.shifts, eq(schema.shiftAssignments.shiftId, schema.shifts.id))
        .where(
          and(
            eq(schema.shiftAssignments.id, command.assignmentId),
            eq(schema.shiftAssignments.workerProfileId, worker.profileId),
          ),
        )
        .limit(1)
      const assignment = rows[0]
      if (assignment === undefined) return null
      if (assignment.shiftId !== initial.shiftId) {
        throw new WorkerJourneyRuleError(
          'CANCELLATION_NOT_ALLOWED',
          'Only future confirmed or under-review assignments can be cancelled.',
        )
      }
      if (
        !capacityStatuses.some(
          (status) => status === assignment.assignmentStatus,
        ) ||
        Date.parse(assignment.startsAt) <= Date.parse(command.occurredAt)
      ) {
        throw new WorkerJourneyRuleError(
          'CANCELLATION_NOT_ALLOWED',
          'Only future confirmed or under-review assignments can be cancelled.',
        )
      }

      await transaction
        .update(schema.shiftAssignments)
        .set({
          cancellationReason: 'worker_requested',
          cancelledAt: command.occurredAt,
          status: 'cancelled',
          updatedAt: command.occurredAt,
          version: sql`${schema.shiftAssignments.version} + 1`,
        })
        .where(eq(schema.shiftAssignments.id, assignment.assignmentId))

      const reservedRows = await transaction
        .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
        .from(schema.shiftAssignments)
        .where(
          and(
            eq(schema.shiftAssignments.shiftId, assignment.shiftId),
            inArray(schema.shiftAssignments.status, capacityStatuses),
          ),
        )
      const requiredRows = await transaction
        .select({ requiredWorkers: schema.shifts.requiredWorkers })
        .from(schema.shifts)
        .where(eq(schema.shifts.id, assignment.shiftId))
        .limit(1)
      if (
        assignment.shiftStatus === 'covered' &&
        (reservedRows[0]?.count ?? 0) < (requiredRows[0]?.requiredWorkers ?? 0)
      ) {
        await transaction
          .update(schema.shifts)
          .set({ status: 'open', updatedAt: command.occurredAt })
          .where(eq(schema.shifts.id, assignment.shiftId))
      }
      await transaction.insert(schema.notifications).values({
        detail: 'Your synthetic assignment was cancelled and its place was released.',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        recipientMemberId: worker.id,
        title: 'Assignment cancelled',
        tone: 'information',
        updatedAt: command.occurredAt,
      })
      await transaction.insert(schema.activityEvents).values({
        actorMemberId: worker.id,
        detail: 'A synthetic assignment was cancelled and capacity was released.',
        eventType: 'shift_cancelled',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        organisationId: worker.organisationId,
        shiftId: assignment.shiftId,
        subjectMemberId: worker.id,
        title: 'Assignment cancelled',
        updatedAt: command.occurredAt,
      })
      const result = await this.assignmentResult(
        transaction,
        worker,
        assignment.assignmentId,
        'cancelled',
      )
      await this.storeIdempotentResult(transaction, {
        actorMemberId: worker.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'cancel_assignment',
        responseStatus: 200,
        result,
        workerProfileId: worker.profileId,
      })
      return result
    })
  }
}

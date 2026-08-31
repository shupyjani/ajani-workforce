import { randomUUID } from 'node:crypto'
import {
  administratorComplianceDecisionDataSchema,
  managerAssignmentDecisionDataSchema,
  managerShiftMutationDataSchema,
  workerTimesheetMutationDataSchema,
  type AdministratorComplianceDecisionData,
  type ComplianceRecordReviewStatus,
  type ManagerAssignmentDecisionData,
  type ManagerShift,
  type ManagerShiftMutationData,
  type ReadinessStatus,
  type Timesheet,
  type WorkerTimesheetMutationData,
} from '@ajani/contracts'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { alias } from 'drizzle-orm/pg-core'
import {
  decodeOperationsCursor,
  encodeOperationsCursor,
} from './cursor.js'
import {
  OperationsRuleError,
  type AdministratorComplianceDecisionCommand,
  type AdministratorComplianceRecordLookup,
  type AdministratorComplianceRecordsLookup,
  type AdministratorTimesheetsLookup,
  type ManagerAssignmentDecisionCommand,
  type ManagerAssignmentRequestsLookup,
  type ManagerShiftCancelCommand,
  type ManagerShiftCreateCommand,
  type ManagerShiftDetailLookup,
  type ManagerShiftsLookup,
  type ManagerShiftUpdateCommand,
  type ManagerShiftVersionCommand,
  type ManagerTimesheetDecisionCommand,
  type ManagerTimesheetsLookup,
  type WorkerTimesheetCreateCommand,
  type WorkerTimesheetDetailLookup,
  type WorkerTimesheetsLookup,
  type WorkerTimesheetSubmitCommand,
  type WorkerTimesheetUpdateCommand,
} from './repository-types.js'
import * as schema from './schema.js'

const idempotencyRetentionMilliseconds = 30 * 24 * 60 * 60 * 1_000
const shiftPreviewHorizonMilliseconds = 90 * 24 * 60 * 60 * 1_000
const timesheetBoundaryToleranceMilliseconds = 12 * 60 * 60 * 1_000
const activeAssignmentStatuses = ['confirmed', 'review'] as const
const blockedComplianceStatuses = [
  'action_due',
  'information_required',
  'rejected',
] as const

type DatabaseTransaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult, typeof schema>['transaction']>[0]
>[0]

interface PersonaContext {
  readonly familyName: string
  readonly givenName: string
  readonly id: string
  readonly organisationId: string
  readonly organisationName: string
  readonly roleTitle: string
}

interface WorkerContext extends PersonaContext {
  readonly profileId: string
  readonly readinessStatus: typeof schema.workerProfiles.$inferSelect.overallReadinessStatus
}

interface RuntimeSchema<T> {
  readonly parse: (value: unknown) => T
}

interface ReplayableResult {
  readonly idempotentReplay: boolean
}

function displayName(person: Pick<PersonaContext, 'givenName' | 'familyName'>): string {
  return `${person.givenName} ${person.familyName}`
}

function isoDateTime(value: string): string {
  return new Date(value).toISOString()
}

function normalizeNote(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function workedMinutes(
  workedStart: string,
  workedEnd: string,
  breakMinutes: number,
): number {
  return (
    Math.floor((Date.parse(workedEnd) - Date.parse(workedStart)) / 60_000) -
    breakMinutes
  )
}

export class OperationsRepository<
  TQueryResult extends PgQueryResultHKT,
> {
  public constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  private async personaContext(
    transaction: DatabaseTransaction<TQueryResult>,
    memberId: string,
    memberType: 'manager' | 'administrator',
  ): Promise<PersonaContext | null> {
    const rows = await transaction
      .select({
        familyName: schema.workforceMembers.familyName,
        givenName: schema.workforceMembers.givenName,
        id: schema.workforceMembers.id,
        organisationId: schema.organisations.id,
        organisationName: schema.organisations.name,
        roleTitle: schema.workforceMembers.roleTitle,
      })
      .from(schema.workforceMembers)
      .innerJoin(
        schema.organisations,
        eq(schema.workforceMembers.organisationId, schema.organisations.id),
      )
      .where(
        and(
          eq(schema.workforceMembers.id, memberId),
          eq(schema.workforceMembers.memberType, memberType),
          eq(schema.workforceMembers.status, 'active'),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  private async workerContext(
    transaction: DatabaseTransaction<TQueryResult>,
    workerId: string,
  ): Promise<WorkerContext | null> {
    const rows = await transaction
      .select({
        familyName: schema.workforceMembers.familyName,
        givenName: schema.workforceMembers.givenName,
        id: schema.workforceMembers.id,
        organisationId: schema.organisations.id,
        organisationName: schema.organisations.name,
        profileId: schema.workerProfiles.id,
        readinessStatus: schema.workerProfiles.overallReadinessStatus,
        roleTitle: schema.workforceMembers.roleTitle,
      })
      .from(schema.workforceMembers)
      .innerJoin(
        schema.workerProfiles,
        eq(schema.workerProfiles.workforceMemberId, schema.workforceMembers.id),
      )
      .innerJoin(
        schema.organisations,
        eq(schema.workforceMembers.organisationId, schema.organisations.id),
      )
      .where(
        and(
          eq(schema.workforceMembers.id, workerId),
          eq(schema.workforceMembers.memberType, 'worker'),
          eq(schema.workforceMembers.status, 'active'),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  private personaSummary(person: PersonaContext) {
    return {
      displayName: displayName(person),
      id: person.id,
      roleTitle: person.roleTitle,
    }
  }

  private async lockActor(
    transaction: DatabaseTransaction<TQueryResult>,
    actorMemberId: string,
  ): Promise<void> {
    await transaction.execute(
      sql`select ${schema.workforceMembers.id} from ${schema.workforceMembers} where ${schema.workforceMembers.id} = ${actorMemberId} for update`,
    )
  }

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

  private async lockActiveShiftAssignments(
    transaction: DatabaseTransaction<TQueryResult>,
    shiftId: string,
  ): Promise<void> {
    await transaction.execute(
      sql`select ${schema.shiftAssignments.id} from ${schema.shiftAssignments} where ${schema.shiftAssignments.shiftId} = ${shiftId} and ${schema.shiftAssignments.status} in ('confirmed', 'review') order by ${schema.shiftAssignments.id} for update`,
    )
  }

  private async readIdempotentResult<T extends ReplayableResult>(
    transaction: DatabaseTransaction<TQueryResult>,
    options: {
      readonly actorMemberId: string
      readonly fingerprint: string
      readonly idempotencyKey: string
      readonly occurredAt: string
      readonly operation: schema.IdempotencyOperation
      readonly resultSchema: RuntimeSchema<T>
    },
  ): Promise<T | null> {
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
      throw new OperationsRuleError(
        'IDEMPOTENCY_CONFLICT',
        'This idempotency key was already used for a different request.',
      )
    }
    const result = options.resultSchema.parse(
      JSON.parse(record.responsePayload) as unknown,
    )
    return { ...result, idempotentReplay: true }
  }

  private async storeIdempotentResult(
    transaction: DatabaseTransaction<TQueryResult>,
    options: {
      readonly actorMemberId: string
      readonly fingerprint: string
      readonly idempotencyKey: string
      readonly occurredAt: string
      readonly operation: schema.IdempotencyOperation
      readonly responseStatus: number
      readonly result: ReplayableResult
      readonly workerProfileId?: string
    },
  ): Promise<void> {
    await transaction.insert(schema.idempotencyRecords).values({
      actorMemberId: options.actorMemberId,
      createdAt: options.occurredAt,
      expiresAt: new Date(
        Date.parse(options.occurredAt) + idempotencyRetentionMilliseconds,
      ).toISOString(),
      id: randomUUID(),
      idempotencyKey: options.idempotencyKey,
      operation: options.operation,
      requestFingerprint: options.fingerprint,
      responsePayload: JSON.stringify(options.result),
      responseStatus: options.responseStatus,
      updatedAt: options.occurredAt,
      workerProfileId: options.workerProfileId ?? null,
    })
  }

  private async managerShiftRows(
    transaction: DatabaseTransaction<TQueryResult>,
    predicate: ReturnType<typeof and>,
    referenceAt: string,
    limit: number,
  ): Promise<readonly ManagerShift[]> {
    const rows = await transaction
      .select({
        areaName: schema.shifts.areaName,
        arrivalNote: schema.shifts.arrivalNote,
        cancellationReason: schema.shifts.cancellationReason,
        cancelledAt: schema.shifts.cancelledAt,
        confirmedWorkers: sql<number>`count(*) filter (where ${schema.shiftAssignments.status} = 'confirmed')::int`.mapWith(Number),
        endsAt: schema.shifts.endsAt,
        id: schema.shifts.id,
        locationId: schema.locations.id,
        locationName: schema.locations.name,
        organisationId: schema.organisations.id,
        organisationName: schema.organisations.name,
        requiredWorkers: schema.shifts.requiredWorkers,
        reviewWorkers: sql<number>`count(*) filter (where ${schema.shiftAssignments.status} = 'review')::int`.mapWith(Number),
        roleTitle: schema.shifts.roleTitle,
        startsAt: schema.shifts.startsAt,
        status: schema.shifts.status,
        timezone: schema.locations.timezone,
        version: schema.shifts.version,
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

    return rows.map((row) => ({
      arrivalNote: row.arrivalNote,
      cancellationReason: row.cancellationReason,
      cancelledAt:
        row.cancelledAt === null ? null : isoDateTime(row.cancelledAt),
      confirmedWorkers: row.confirmedWorkers,
      endsAt: isoDateTime(row.endsAt),
      id: row.id,
      location: {
        area: row.areaName,
        id: row.locationId,
        name: row.locationName,
        timezone: row.timezone,
      },
      organisation: {
        id: row.organisationId,
        name: row.organisationName,
      },
      requiredWorkers: row.requiredWorkers,
      reviewWorkers: row.reviewWorkers,
      roleTitle: row.roleTitle,
      startsAt: isoDateTime(row.startsAt),
      status:
        Date.parse(row.endsAt) <= Date.parse(referenceAt) &&
        (row.status === 'open' || row.status === 'covered')
          ? 'completed'
          : row.status,
      version: row.version,
    }))
  }

  private async organisationOptions(
    transaction: DatabaseTransaction<TQueryResult>,
    organisationId: string,
  ) {
    const [locations, roles] = await Promise.all([
      transaction
        .select({
          id: schema.locations.id,
          name: schema.locations.name,
          timezone: schema.locations.timezone,
        })
        .from(schema.locations)
        .where(
          and(
            eq(schema.locations.organisationId, organisationId),
            eq(schema.locations.status, 'active'),
          ),
        )
        .orderBy(asc(schema.locations.name), asc(schema.locations.id)),
      transaction
        .selectDistinct({ roleTitle: schema.workforceMembers.roleTitle })
        .from(schema.workforceMembers)
        .where(
          and(
            eq(schema.workforceMembers.organisationId, organisationId),
            eq(schema.workforceMembers.memberType, 'worker'),
            eq(schema.workforceMembers.status, 'active'),
          ),
        )
        .orderBy(asc(schema.workforceMembers.roleTitle)),
    ])
    return { locations, roleTitles: roles.map((role) => role.roleTitle) }
  }

  private async validateShiftFields(
    transaction: DatabaseTransaction<TQueryResult>,
    organisationId: string,
    fields: {
      readonly endsAt: string
      readonly locationId: string
      readonly roleTitle: string
      readonly startsAt: string
    },
    referenceAt: string,
  ): Promise<void> {
    const [locationRows, roleRows] = await Promise.all([
      transaction
        .select({ id: schema.locations.id })
        .from(schema.locations)
        .where(
          and(
            eq(schema.locations.id, fields.locationId),
            eq(schema.locations.organisationId, organisationId),
            eq(schema.locations.status, 'active'),
          ),
        )
        .limit(1),
      transaction
        .select({ roleTitle: schema.workforceMembers.roleTitle })
        .from(schema.workforceMembers)
        .where(
          and(
            eq(schema.workforceMembers.organisationId, organisationId),
            eq(schema.workforceMembers.memberType, 'worker'),
            eq(schema.workforceMembers.status, 'active'),
            eq(schema.workforceMembers.roleTitle, fields.roleTitle),
          ),
        )
        .limit(1),
    ])
    if (locationRows[0] === undefined || roleRows[0] === undefined) {
      throw new OperationsRuleError(
        'ORGANISATION_SCOPE_MISMATCH',
        'The selected location or role is outside this Manager preview scope.',
      )
    }
    const start = Date.parse(fields.startsAt)
    const end = Date.parse(fields.endsAt)
    const reference = Date.parse(referenceAt)
    if (
      start <= reference ||
      end <= start ||
      start > reference + shiftPreviewHorizonMilliseconds
    ) {
      throw new OperationsRuleError(
        'SHIFT_LIFECYCLE_CONFLICT',
        'The shift must be future-dated within the 90-day preview horizon.',
      )
    }
  }

  public async getManagerAssignmentRequests(
    query: ManagerAssignmentRequestsLookup,
  ) {
    return this.db.transaction(async (transaction) => {
      const manager = await this.personaContext(
        transaction,
        query.managerId,
        'manager',
      )
      if (manager === null) return null
      const cursor =
        query.cursor === undefined
          ? undefined
          : decodeOperationsCursor(
              query.cursor,
              'manager-assignment-requests',
            )
      const rows = await transaction
        .select({
          areaName: schema.shifts.areaName,
          assignmentId: schema.shiftAssignments.id,
          endsAt: schema.shifts.endsAt,
          locationId: schema.locations.id,
          locationName: schema.locations.name,
          requestedAt: schema.shiftAssignments.assignedAt,
          requiredWorkers: schema.shifts.requiredWorkers,
          shiftId: schema.shifts.id,
          startsAt: schema.shifts.startsAt,
          shiftRoleTitle: schema.shifts.roleTitle,
          timezone: schema.locations.timezone,
          version: schema.shiftAssignments.version,
          workerFamilyName: schema.workforceMembers.familyName,
          workerGivenName: schema.workforceMembers.givenName,
          workerId: schema.workforceMembers.id,
          workerOrganisationId: schema.workforceMembers.organisationId,
          workerReadiness: schema.workerProfiles.overallReadinessStatus,
          workerRoleTitle: schema.workforceMembers.roleTitle,
          workerStatus: schema.workforceMembers.status,
        })
        .from(schema.shiftAssignments)
        .innerJoin(
          schema.shifts,
          eq(schema.shiftAssignments.shiftId, schema.shifts.id),
        )
        .innerJoin(
          schema.workerProfiles,
          eq(
            schema.shiftAssignments.workerProfileId,
            schema.workerProfiles.id,
          ),
        )
        .innerJoin(
          schema.workforceMembers,
          eq(
            schema.workerProfiles.workforceMemberId,
            schema.workforceMembers.id,
          ),
        )
        .innerJoin(
          schema.locations,
          eq(schema.shifts.locationId, schema.locations.id),
        )
        .where(
          and(
            eq(schema.shifts.organisationId, manager.organisationId),
            eq(schema.shiftAssignments.status, 'review'),
            cursor === undefined
              ? undefined
              : or(
                  gt(schema.shiftAssignments.assignedAt, cursor.sortAt),
                  and(
                    eq(schema.shiftAssignments.assignedAt, cursor.sortAt),
                    gt(schema.shiftAssignments.id, cursor.id),
                  ),
                ),
          ),
        )
        .orderBy(
          asc(schema.shiftAssignments.assignedAt),
          asc(schema.shiftAssignments.id),
        )
        .limit(query.limit + 1)
      const hasMore = rows.length > query.limit
      const page = rows.slice(0, query.limit)
      const shiftIds = [...new Set(page.map((row) => row.shiftId))]
      const capacityRows =
        shiftIds.length === 0
          ? []
          : await transaction
              .select({
                confirmedWorkers: sql<number>`count(*) filter (where ${schema.shiftAssignments.status} = 'confirmed')::int`.mapWith(Number),
                reviewWorkers: sql<number>`count(*) filter (where ${schema.shiftAssignments.status} = 'review')::int`.mapWith(Number),
                shiftId: schema.shiftAssignments.shiftId,
              })
              .from(schema.shiftAssignments)
              .where(inArray(schema.shiftAssignments.shiftId, shiftIds))
              .groupBy(schema.shiftAssignments.shiftId)
      const capacityByShift = new Map(
        capacityRows.map((row) => [row.shiftId, row]),
      )
      const last = page.at(-1)
      return {
        items: page.map((row) => {
          const capacity = capacityByShift.get(row.shiftId) ?? {
            confirmedWorkers: 0,
            reviewWorkers: 0,
          }
          return {
            assignmentId: row.assignmentId,
            requestedAt: isoDateTime(row.requestedAt),
            shift: {
              confirmedWorkers: capacity.confirmedWorkers,
              endsAt: isoDateTime(row.endsAt),
              id: row.shiftId,
              location: {
                area: row.areaName,
                id: row.locationId,
                name: row.locationName,
                timezone: row.timezone,
              },
              requiredWorkers: row.requiredWorkers,
              reviewWorkers: capacity.reviewWorkers,
              roleTitle: row.shiftRoleTitle,
              startsAt: isoDateTime(row.startsAt),
            },
            version: row.version,
            worker: {
              displayName: `${row.workerGivenName} ${row.workerFamilyName}`,
              id: row.workerId,
              organisationId: row.workerOrganisationId,
              readinessStatus: row.workerReadiness,
              roleTitle: row.workerRoleTitle,
              status: row.workerStatus,
            },
          }
        }),
        manager: this.personaSummary(manager),
        nextCursor:
          hasMore && last !== undefined
            ? encodeOperationsCursor(
                'manager-assignment-requests',
                isoDateTime(last.requestedAt),
                last.assignmentId,
              )
            : null,
        organisation: {
          id: manager.organisationId,
          name: manager.organisationName,
        },
      }
    })
  }

  public async decideManagerAssignment(
    command: ManagerAssignmentDecisionCommand,
  ): Promise<ManagerAssignmentDecisionData | null> {
    return this.db.transaction(async (transaction) => {
      const manager = await this.personaContext(
        transaction,
        command.managerId,
        'manager',
      )
      if (manager === null) return null
      await this.lockActor(transaction, manager.id)
      const fingerprint = `assignment:${command.assignmentId}:${JSON.stringify(command.body)}`
      const replay = await this.readIdempotentResult(transaction, {
        actorMemberId: manager.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'manager_assignment_decision',
        resultSchema: managerAssignmentDecisionDataSchema,
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
      if (initial === undefined) return null
      if (command.body.decision === 'approve') {
        await this.lockWorkerProfile(transaction, initial.workerProfileId)
      }
      await this.lockShift(transaction, initial.shiftId)
      await this.lockAssignment(transaction, command.assignmentId)
      const rows = await transaction
        .select({
          assignmentStatus: schema.shiftAssignments.status,
          assignmentVersion: schema.shiftAssignments.version,
          endsAt: schema.shifts.endsAt,
          organisationId: schema.shifts.organisationId,
          requiredWorkers: schema.shifts.requiredWorkers,
          shiftId: schema.shifts.id,
          shiftRoleTitle: schema.shifts.roleTitle,
          shiftStatus: schema.shifts.status,
          startsAt: schema.shifts.startsAt,
          workerId: schema.workforceMembers.id,
          workerOrganisationId: schema.workforceMembers.organisationId,
          workerProfileId: schema.workerProfiles.id,
          workerReadiness: schema.workerProfiles.overallReadinessStatus,
          workerRoleTitle: schema.workforceMembers.roleTitle,
          workerStatus: schema.workforceMembers.status,
        })
        .from(schema.shiftAssignments)
        .innerJoin(
          schema.shifts,
          eq(schema.shiftAssignments.shiftId, schema.shifts.id),
        )
        .innerJoin(
          schema.workerProfiles,
          eq(
            schema.shiftAssignments.workerProfileId,
            schema.workerProfiles.id,
          ),
        )
        .innerJoin(
          schema.workforceMembers,
          eq(
            schema.workerProfiles.workforceMemberId,
            schema.workforceMembers.id,
          ),
        )
        .where(eq(schema.shiftAssignments.id, command.assignmentId))
        .limit(1)
      const assignment = rows[0]
      if (assignment === undefined) return null
      if (
        assignment.shiftId !== initial.shiftId ||
        assignment.workerProfileId !== initial.workerProfileId
      ) {
        throw new OperationsRuleError(
          'VERSION_CONFLICT',
          'The assignment changed since it was loaded. Refresh and review it again.',
        )
      }
      if (assignment.organisationId !== manager.organisationId) {
        throw new OperationsRuleError(
          'ORGANISATION_SCOPE_MISMATCH',
          'The assignment is outside this Manager preview scope.',
        )
      }
      if (assignment.assignmentVersion !== command.body.expectedVersion) {
        throw new OperationsRuleError(
          'VERSION_CONFLICT',
          'The assignment changed since it was loaded. Refresh and review it again.',
        )
      }
      if (
        assignment.assignmentStatus !== 'review' ||
        Date.parse(assignment.startsAt) <= Date.parse(command.occurredAt) ||
        !['open', 'covered'].includes(assignment.shiftStatus)
      ) {
        throw new OperationsRuleError(
          'ASSIGNMENT_NOT_REVIEWABLE',
          'This assignment is no longer available for review.',
        )
      }

      let status: 'confirmed' | 'declined'
      let reason: string | null
      if (command.body.decision === 'approve') {
        if (
          assignment.workerStatus !== 'active' ||
          assignment.workerOrganisationId !== assignment.organisationId ||
          assignment.workerRoleTitle !== assignment.shiftRoleTitle ||
          assignment.workerReadiness === 'action_due'
        ) {
          throw new OperationsRuleError(
            'ASSIGNMENT_NOT_REVIEWABLE',
            'The worker no longer meets the active organisation, role or readiness rules.',
          )
        }
        const [capacityRows, overlapRows] = await Promise.all([
          transaction
            .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
            .from(schema.shiftAssignments)
            .where(
              and(
                eq(schema.shiftAssignments.shiftId, assignment.shiftId),
                eq(schema.shiftAssignments.status, 'confirmed'),
                ne(schema.shiftAssignments.id, command.assignmentId),
              ),
            ),
          transaction
            .select({ id: schema.shiftAssignments.id })
            .from(schema.shiftAssignments)
            .innerJoin(
              schema.shifts,
              eq(schema.shiftAssignments.shiftId, schema.shifts.id),
            )
            .where(
              and(
                eq(
                  schema.shiftAssignments.workerProfileId,
                  assignment.workerProfileId,
                ),
                inArray(
                  schema.shiftAssignments.status,
                  activeAssignmentStatuses,
                ),
                ne(schema.shiftAssignments.id, command.assignmentId),
                lt(schema.shifts.startsAt, assignment.endsAt),
                gt(schema.shifts.endsAt, assignment.startsAt),
              ),
            )
            .limit(1),
        ])
        if ((capacityRows[0]?.count ?? 0) >= assignment.requiredWorkers) {
          throw new OperationsRuleError(
            'ASSIGNMENT_NOT_REVIEWABLE',
            'The last available place has already been confirmed.',
          )
        }
        if (overlapRows[0] !== undefined) {
          throw new OperationsRuleError(
            'ASSIGNMENT_NOT_REVIEWABLE',
            'The worker now has an overlapping confirmed or under-review assignment.',
          )
        }
        status = 'confirmed'
        reason = null
      } else {
        status = 'declined'
        reason = command.body.reason
      }

      await transaction
        .update(schema.shiftAssignments)
        .set({
          reviewReason:
            reason ?? 'Manager approved the synthetic assignment review.',
          reviewedAt: command.occurredAt,
          reviewedByMemberId: manager.id,
          status,
          updatedAt: command.occurredAt,
          version: sql`${schema.shiftAssignments.version} + 1`,
        })
        .where(eq(schema.shiftAssignments.id, command.assignmentId))

      const activeRows = await transaction
        .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
        .from(schema.shiftAssignments)
        .where(
          and(
            eq(schema.shiftAssignments.shiftId, assignment.shiftId),
            inArray(schema.shiftAssignments.status, activeAssignmentStatuses),
          ),
        )
      await transaction
        .update(schema.shifts)
        .set({
          status:
            (activeRows[0]?.count ?? 0) >= assignment.requiredWorkers
              ? 'covered'
              : 'open',
          updatedAt: command.occurredAt,
          version: sql`${schema.shifts.version} + 1`,
        })
        .where(eq(schema.shifts.id, assignment.shiftId))
      await transaction.insert(schema.notifications).values({
        detail:
          status === 'confirmed'
            ? 'Your synthetic assignment review was approved.'
            : 'Your synthetic assignment request was declined. Review your schedule for the updated status.',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        recipientMemberId: assignment.workerId,
        title:
          status === 'confirmed'
            ? 'Assignment approved'
            : 'Assignment request declined',
        tone: status === 'confirmed' ? 'success' : 'information',
        updatedAt: command.occurredAt,
      })
      await transaction.insert(schema.activityEvents).values({
        actorMemberId: manager.id,
        detail:
          status === 'confirmed'
            ? 'A synthetic assignment review was approved.'
            : 'A synthetic assignment review was declined.',
        eventType:
          status === 'confirmed' ? 'assignment_approved' : 'assignment_declined',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        organisationId: manager.organisationId,
        shiftId: assignment.shiftId,
        subjectMemberId: assignment.workerId,
        title:
          status === 'confirmed'
            ? 'Assignment approved'
            : 'Assignment declined',
        updatedAt: command.occurredAt,
      })
      const result: ManagerAssignmentDecisionData = {
        assignmentId: command.assignmentId,
        decidedAt: command.occurredAt,
        idempotentReplay: false,
        message:
          status === 'confirmed'
            ? 'The assignment is confirmed and connected preview views were updated.'
            : 'The assignment was declined and its reserved place was released.',
        reason,
        status,
        version: assignment.assignmentVersion + 1,
      }
      await this.storeIdempotentResult(transaction, {
        actorMemberId: manager.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'manager_assignment_decision',
        responseStatus: 200,
        result,
      })
      return result
    })
  }

  public async getManagerShifts(query: ManagerShiftsLookup) {
    return this.db.transaction(async (transaction) => {
      const manager = await this.personaContext(
        transaction,
        query.managerId,
        'manager',
      )
      if (manager === null) return null
      const cursor =
        query.cursor === undefined
          ? undefined
          : decodeOperationsCursor(query.cursor, 'manager-shifts')
      const statusPredicate =
        query.status === undefined
          ? undefined
          : query.status === 'completed'
            ? or(
                eq(schema.shifts.status, 'completed'),
                and(
                  inArray(schema.shifts.status, ['open', 'covered']),
                  lt(schema.shifts.endsAt, query.referenceAt),
                ),
              )
            : and(
                eq(schema.shifts.status, query.status),
                query.status === 'open' || query.status === 'covered'
                  ? gt(schema.shifts.endsAt, query.referenceAt)
                  : undefined,
              )
      const items = await this.managerShiftRows(
        transaction,
        and(
          eq(schema.shifts.organisationId, manager.organisationId),
          statusPredicate,
          cursor === undefined
            ? undefined
            : or(
                gt(schema.shifts.startsAt, cursor.sortAt),
                and(
                  eq(schema.shifts.startsAt, cursor.sortAt),
                  gt(schema.shifts.id, cursor.id),
                ),
              ),
        ),
        query.referenceAt,
        query.limit + 1,
      )
      const hasMore = items.length > query.limit
      const page = items.slice(0, query.limit)
      const last = page.at(-1)
      const options = await this.organisationOptions(
        transaction,
        manager.organisationId,
      )
      return {
        items: page,
        locations: options.locations,
        manager: this.personaSummary(manager),
        nextCursor:
          hasMore && last !== undefined
            ? encodeOperationsCursor(
                'manager-shifts',
                last.startsAt,
                last.id,
              )
            : null,
        organisation: {
          id: manager.organisationId,
          name: manager.organisationName,
        },
        roleTitles: options.roleTitles,
      }
    })
  }

  public async getManagerShiftDetail(query: ManagerShiftDetailLookup) {
    return this.db.transaction(async (transaction) => {
      const manager = await this.personaContext(
        transaction,
        query.managerId,
        'manager',
      )
      if (manager === null) return null
      const shifts = await this.managerShiftRows(
        transaction,
        and(
          eq(schema.shifts.id, query.shiftId),
          eq(schema.shifts.organisationId, manager.organisationId),
        ),
        query.referenceAt,
        1,
      )
      const shift = shifts[0]
      return shift === undefined
        ? null
        : { manager: this.personaSummary(manager), shift }
    })
  }

  private async shiftMutationResult(
    transaction: DatabaseTransaction<TQueryResult>,
    manager: PersonaContext,
    shiftId: string,
    occurredAt: string,
    message: string,
  ): Promise<ManagerShiftMutationData> {
    const shifts = await this.managerShiftRows(
      transaction,
      and(
        eq(schema.shifts.id, shiftId),
        eq(schema.shifts.organisationId, manager.organisationId),
      ),
      occurredAt,
      1,
    )
    const shift = shifts[0]
    if (shift === undefined) {
      throw new Error('The shift mutation did not produce a result.')
    }
    return { idempotentReplay: false, message, shift }
  }

  public async createManagerShift(command: ManagerShiftCreateCommand) {
    return this.db.transaction(async (transaction) => {
      const manager = await this.personaContext(
        transaction,
        command.managerId,
        'manager',
      )
      if (manager === null) return null
      await this.lockActor(transaction, manager.id)
      const fingerprint = `create-shift:${JSON.stringify(command.body)}`
      const replay = await this.readIdempotentResult(transaction, {
        actorMemberId: manager.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'create_shift',
        resultSchema: managerShiftMutationDataSchema,
      })
      if (replay !== null) return replay
      await this.validateShiftFields(
        transaction,
        manager.organisationId,
        command.body,
        command.occurredAt,
      )
      const shiftId = randomUUID()
      await transaction.insert(schema.shifts).values({
        areaName: command.body.areaName,
        arrivalNote: normalizeNote(command.body.arrivalNote),
        createdAt: command.occurredAt,
        createdByMemberId: manager.id,
        endsAt: command.body.endsAt,
        id: shiftId,
        locationId: command.body.locationId,
        organisationId: manager.organisationId,
        requiredWorkers: command.body.requiredWorkers,
        roleTitle: command.body.roleTitle,
        startsAt: command.body.startsAt,
        status: 'draft',
        updatedAt: command.occurredAt,
      })
      await transaction.insert(schema.activityEvents).values({
        actorMemberId: manager.id,
        detail: 'A future synthetic draft shift was created.',
        eventType: 'shift_created',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        organisationId: manager.organisationId,
        shiftId,
        subjectMemberId: manager.id,
        title: 'Draft shift created',
        updatedAt: command.occurredAt,
      })
      const result = await this.shiftMutationResult(
        transaction,
        manager,
        shiftId,
        command.occurredAt,
        'The future shift was saved as a draft.',
      )
      await this.storeIdempotentResult(transaction, {
        actorMemberId: manager.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'create_shift',
        responseStatus: 201,
        result,
      })
      return result
    })
  }

  public async updateManagerShift(command: ManagerShiftUpdateCommand) {
    return this.db.transaction(async (transaction) => {
      const manager = await this.personaContext(
        transaction,
        command.managerId,
        'manager',
      )
      if (manager === null) return null
      await this.lockActor(transaction, manager.id)
      const fingerprint = `update-shift:${command.shiftId}:${JSON.stringify(command.body)}`
      const replay = await this.readIdempotentResult(transaction, {
        actorMemberId: manager.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'update_shift',
        resultSchema: managerShiftMutationDataSchema,
      })
      if (replay !== null) return replay
      await this.lockShift(transaction, command.shiftId)
      const rows = await transaction
        .select({
          organisationId: schema.shifts.organisationId,
          startsAt: schema.shifts.startsAt,
          status: schema.shifts.status,
          version: schema.shifts.version,
        })
        .from(schema.shifts)
        .where(eq(schema.shifts.id, command.shiftId))
        .limit(1)
      const shift = rows[0]
      if (shift === undefined) return null
      if (shift.organisationId !== manager.organisationId) {
        throw new OperationsRuleError(
          'ORGANISATION_SCOPE_MISMATCH',
          'The shift is outside this Manager preview scope.',
        )
      }
      if (shift.version !== command.body.expectedVersion) {
        throw new OperationsRuleError(
          'VERSION_CONFLICT',
          'The shift changed since it was loaded. Refresh before editing again.',
        )
      }
      if (
        shift.status !== 'draft' ||
        Date.parse(shift.startsAt) <= Date.parse(command.occurredAt)
      ) {
        throw new OperationsRuleError(
          'SHIFT_LIFECYCLE_CONFLICT',
          'Only a future draft shift can be edited.',
        )
      }
      await this.validateShiftFields(
        transaction,
        manager.organisationId,
        command.body,
        command.occurredAt,
      )
      await transaction
        .update(schema.shifts)
        .set({
          areaName: command.body.areaName,
          arrivalNote: normalizeNote(command.body.arrivalNote),
          endsAt: command.body.endsAt,
          locationId: command.body.locationId,
          requiredWorkers: command.body.requiredWorkers,
          roleTitle: command.body.roleTitle,
          startsAt: command.body.startsAt,
          updatedAt: command.occurredAt,
          version: sql`${schema.shifts.version} + 1`,
        })
        .where(eq(schema.shifts.id, command.shiftId))
      const result = await this.shiftMutationResult(
        transaction,
        manager,
        command.shiftId,
        command.occurredAt,
        'The draft shift was updated.',
      )
      await this.storeIdempotentResult(transaction, {
        actorMemberId: manager.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'update_shift',
        responseStatus: 200,
        result,
      })
      return result
    })
  }

  public async publishManagerShift(command: ManagerShiftVersionCommand) {
    return this.db.transaction(async (transaction) => {
      const manager = await this.personaContext(
        transaction,
        command.managerId,
        'manager',
      )
      if (manager === null) return null
      await this.lockActor(transaction, manager.id)
      const fingerprint = `publish-shift:${command.shiftId}:${String(command.expectedVersion)}`
      const replay = await this.readIdempotentResult(transaction, {
        actorMemberId: manager.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'publish_shift',
        resultSchema: managerShiftMutationDataSchema,
      })
      if (replay !== null) return replay
      await this.lockShift(transaction, command.shiftId)
      const rows = await transaction
        .select()
        .from(schema.shifts)
        .where(eq(schema.shifts.id, command.shiftId))
        .limit(1)
      const shift = rows[0]
      if (shift === undefined) return null
      if (shift.organisationId !== manager.organisationId) {
        throw new OperationsRuleError(
          'ORGANISATION_SCOPE_MISMATCH',
          'The shift is outside this Manager preview scope.',
        )
      }
      if (shift.version !== command.expectedVersion) {
        throw new OperationsRuleError(
          'VERSION_CONFLICT',
          'The shift changed since it was loaded. Refresh before publishing.',
        )
      }
      if (
        shift.status !== 'draft' ||
        Date.parse(shift.startsAt) <= Date.parse(command.occurredAt)
      ) {
        throw new OperationsRuleError(
          'SHIFT_LIFECYCLE_CONFLICT',
          'Only a complete future draft shift can be published.',
        )
      }
      await this.validateShiftFields(
        transaction,
        manager.organisationId,
        shift,
        command.occurredAt,
      )
      await transaction
        .update(schema.shifts)
        .set({
          status: 'open',
          updatedAt: command.occurredAt,
          version: sql`${schema.shifts.version} + 1`,
        })
        .where(eq(schema.shifts.id, command.shiftId))
      await transaction.insert(schema.activityEvents).values({
        actorMemberId: manager.id,
        detail: 'A future synthetic draft shift was published.',
        eventType: 'shift_published',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        organisationId: manager.organisationId,
        shiftId: command.shiftId,
        subjectMemberId: manager.id,
        title: 'Shift published',
        updatedAt: command.occurredAt,
      })
      const result = await this.shiftMutationResult(
        transaction,
        manager,
        command.shiftId,
        command.occurredAt,
        'The draft shift is published and open for matching workers.',
      )
      await this.storeIdempotentResult(transaction, {
        actorMemberId: manager.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'publish_shift',
        responseStatus: 200,
        result,
      })
      return result
    })
  }

  public async cancelManagerShift(command: ManagerShiftCancelCommand) {
    return this.db.transaction(async (transaction) => {
      const manager = await this.personaContext(
        transaction,
        command.managerId,
        'manager',
      )
      if (manager === null) return null
      await this.lockActor(transaction, manager.id)
      const fingerprint = `cancel-shift:${command.shiftId}:${String(command.expectedVersion)}:${command.reason}`
      const replay = await this.readIdempotentResult(transaction, {
        actorMemberId: manager.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'cancel_shift',
        resultSchema: managerShiftMutationDataSchema,
      })
      if (replay !== null) return replay
      await this.lockShift(transaction, command.shiftId)
      await this.lockActiveShiftAssignments(transaction, command.shiftId)
      const rows = await transaction
        .select({
          organisationId: schema.shifts.organisationId,
          startsAt: schema.shifts.startsAt,
          status: schema.shifts.status,
          version: schema.shifts.version,
        })
        .from(schema.shifts)
        .where(eq(schema.shifts.id, command.shiftId))
        .limit(1)
      const shift = rows[0]
      if (shift === undefined) return null
      if (shift.organisationId !== manager.organisationId) {
        throw new OperationsRuleError(
          'ORGANISATION_SCOPE_MISMATCH',
          'The shift is outside this Manager preview scope.',
        )
      }
      if (shift.version !== command.expectedVersion) {
        throw new OperationsRuleError(
          'VERSION_CONFLICT',
          'The shift changed since it was loaded. Refresh before cancelling.',
        )
      }
      if (
        Date.parse(shift.startsAt) <= Date.parse(command.occurredAt) ||
        shift.status === 'cancelled' ||
        shift.status === 'completed'
      ) {
        throw new OperationsRuleError(
          'SHIFT_LIFECYCLE_CONFLICT',
          'Past, completed or already-cancelled shifts cannot be cancelled.',
        )
      }
      const affectedWorkers = await transaction
        .select({
          assignmentId: schema.shiftAssignments.id,
          workerId: schema.workforceMembers.id,
        })
        .from(schema.shiftAssignments)
        .innerJoin(
          schema.workerProfiles,
          eq(
            schema.shiftAssignments.workerProfileId,
            schema.workerProfiles.id,
          ),
        )
        .innerJoin(
          schema.workforceMembers,
          eq(
            schema.workerProfiles.workforceMemberId,
            schema.workforceMembers.id,
          ),
        )
        .where(
          and(
            eq(schema.shiftAssignments.shiftId, command.shiftId),
            inArray(
              schema.shiftAssignments.status,
              activeAssignmentStatuses,
            ),
          ),
        )
      await transaction
        .update(schema.shiftAssignments)
        .set({
          cancellationReason: 'manager_cancelled_shift',
          cancelledAt: command.occurredAt,
          status: 'cancelled',
          updatedAt: command.occurredAt,
          version: sql`${schema.shiftAssignments.version} + 1`,
        })
        .where(
          and(
            eq(schema.shiftAssignments.shiftId, command.shiftId),
            inArray(
              schema.shiftAssignments.status,
              activeAssignmentStatuses,
            ),
          ),
        )
      await transaction
        .update(schema.shifts)
        .set({
          cancellationReason: command.reason,
          cancelledAt: command.occurredAt,
          status: 'cancelled',
          updatedAt: command.occurredAt,
          version: sql`${schema.shifts.version} + 1`,
        })
        .where(eq(schema.shifts.id, command.shiftId))
      if (affectedWorkers.length > 0) {
        await transaction.insert(schema.notifications).values(
          affectedWorkers.map((worker) => ({
            detail:
              'A future synthetic shift was cancelled and removed from your active schedule.',
            id: randomUUID(),
            occurredAt: command.occurredAt,
            recipientMemberId: worker.workerId,
            title: 'Shift cancelled by Manager',
            tone: 'warning' as const,
            updatedAt: command.occurredAt,
          })),
        )
      }
      await transaction.insert(schema.activityEvents).values({
        actorMemberId: manager.id,
        detail: `A future synthetic shift was cancelled and ${String(affectedWorkers.length)} active assignments were updated.`,
        eventType: 'shift_manager_cancelled',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        organisationId: manager.organisationId,
        shiftId: command.shiftId,
        subjectMemberId: manager.id,
        title: 'Shift cancelled',
        updatedAt: command.occurredAt,
      })
      const result = await this.shiftMutationResult(
        transaction,
        manager,
        command.shiftId,
        command.occurredAt,
        'The shift and its active assignments were cancelled transactionally.',
      )
      await this.storeIdempotentResult(transaction, {
        actorMemberId: manager.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'cancel_shift',
        responseStatus: 200,
        result,
      })
      return result
    })
  }

  private async complianceRecordRows(
    transaction: DatabaseTransaction<TQueryResult>,
    predicate: ReturnType<typeof and>,
    limit: number,
  ) {
    return transaction
      .select({
        areaName: schema.workforceMembers.homeAreaName,
        dueOn: schema.complianceRecords.dueOn,
        locationId: schema.locations.id,
        locationName: schema.locations.name,
        previewId: schema.workforceMembers.previewReference,
        recordId: schema.complianceRecords.id,
        requirementDescription: schema.complianceRequirements.description,
        requirementId: schema.complianceRequirements.id,
        requirementName: schema.complianceRequirements.name,
        reviewedOn: schema.complianceRecords.reviewedOn,
        status: schema.complianceRecords.status,
        timezone: schema.locations.timezone,
        updatedAt: schema.complianceRecords.updatedAt,
        version: schema.complianceRecords.version,
        workerFamilyName: schema.workforceMembers.familyName,
        workerGivenName: schema.workforceMembers.givenName,
        workerId: schema.workforceMembers.id,
        workerRoleTitle: schema.workforceMembers.roleTitle,
      })
      .from(schema.complianceRecords)
      .innerJoin(
        schema.complianceRequirements,
        eq(
          schema.complianceRecords.requirementId,
          schema.complianceRequirements.id,
        ),
      )
      .innerJoin(
        schema.workerProfiles,
        eq(schema.complianceRecords.workerProfileId, schema.workerProfiles.id),
      )
      .innerJoin(
        schema.workforceMembers,
        eq(schema.workerProfiles.workforceMemberId, schema.workforceMembers.id),
      )
      .leftJoin(
        schema.locations,
        eq(schema.workforceMembers.homeLocationId, schema.locations.id),
      )
      .where(predicate)
      .orderBy(
        desc(schema.complianceRecords.updatedAt),
        desc(schema.complianceRecords.id),
      )
      .limit(limit)
  }

  private complianceRecordSummary(
    row: Awaited<ReturnType<OperationsRepository<TQueryResult>['complianceRecordRows']>>[number],
  ) {
    return {
      dueOn: row.dueOn,
      id: row.recordId,
      previewId: row.previewId,
      primaryLocation:
        row.locationId === null ||
        row.locationName === null ||
        row.timezone === null
          ? null
          : {
              area: row.areaName ?? 'Preview area',
              id: row.locationId,
              name: row.locationName,
              timezone: row.timezone,
            },
      requirement: {
        description: row.requirementDescription,
        id: row.requirementId,
        name: row.requirementName,
      },
      reviewedOn: row.reviewedOn,
      status: row.status,
      updatedAt: isoDateTime(row.updatedAt),
      version: row.version,
      worker: {
        displayName: `${row.workerGivenName} ${row.workerFamilyName}`,
        id: row.workerId,
        roleTitle: row.workerRoleTitle,
      },
    }
  }

  public async getAdministratorComplianceRecords(
    query: AdministratorComplianceRecordsLookup,
  ) {
    return this.db.transaction(async (transaction) => {
      const administrator = await this.personaContext(
        transaction,
        query.administratorId,
        'administrator',
      )
      if (administrator === null) return null
      const cursor =
        query.cursor === undefined
          ? undefined
          : decodeOperationsCursor(query.cursor, 'compliance-records')
      const [rows, summaryRows] = await Promise.all([
        this.complianceRecordRows(
          transaction,
          and(
            eq(
              schema.complianceRequirements.organisationId,
              administrator.organisationId,
            ),
            query.status === undefined
              ? undefined
              : eq(schema.complianceRecords.status, query.status),
            cursor === undefined
              ? undefined
              : or(
                  lt(schema.complianceRecords.updatedAt, cursor.sortAt),
                  and(
                    eq(schema.complianceRecords.updatedAt, cursor.sortAt),
                    lt(schema.complianceRecords.id, cursor.id),
                  ),
                ),
          ),
          query.limit + 1,
        ),
        transaction
          .select({
            actionDue: sql<number>`count(*) filter (where ${schema.complianceRecords.status} in ('action_due', 'information_required', 'rejected'))::int`.mapWith(Number),
            current: sql<number>`count(*) filter (where ${schema.complianceRecords.status} in ('current', 'due_soon'))::int`.mapWith(Number),
            reviewing: sql<number>`count(*) filter (where ${schema.complianceRecords.status} = 'reviewing')::int`.mapWith(Number),
            total: sql<number>`count(*)::int`.mapWith(Number),
          })
          .from(schema.complianceRecords)
          .innerJoin(
            schema.complianceRequirements,
            eq(
              schema.complianceRecords.requirementId,
              schema.complianceRequirements.id,
            ),
          )
          .where(
            eq(
              schema.complianceRequirements.organisationId,
              administrator.organisationId,
            ),
          ),
      ])
      const hasMore = rows.length > query.limit
      const page = rows.slice(0, query.limit)
      const last = page.at(-1)
      return {
        administrator: this.personaSummary(administrator),
        items: page.map((row) => this.complianceRecordSummary(row)),
        nextCursor:
          hasMore && last !== undefined
            ? encodeOperationsCursor(
                'compliance-records',
                isoDateTime(last.updatedAt),
                last.recordId,
              )
            : null,
        summary: summaryRows[0] ?? {
          actionDue: 0,
          current: 0,
          reviewing: 0,
          total: 0,
        },
      }
    })
  }

  public async getAdministratorComplianceRecord(
    query: AdministratorComplianceRecordLookup,
  ) {
    return this.db.transaction(async (transaction) => {
      const administrator = await this.personaContext(
        transaction,
        query.administratorId,
        'administrator',
      )
      if (administrator === null) return null
      const rows = await this.complianceRecordRows(
        transaction,
        and(
          eq(schema.complianceRecords.id, query.recordId),
          eq(
            schema.complianceRequirements.organisationId,
            administrator.organisationId,
          ),
        ),
        1,
      )
      const record = rows[0]
      if (record === undefined) return null
      const [readinessRows, historyRows] = await Promise.all([
        transaction
          .select({ readiness: schema.workerProfiles.overallReadinessStatus })
          .from(schema.workerProfiles)
          .innerJoin(
            schema.complianceRecords,
            eq(
              schema.workerProfiles.id,
              schema.complianceRecords.workerProfileId,
            ),
          )
          .where(eq(schema.complianceRecords.id, query.recordId))
          .limit(1),
        transaction
          .select({
            administratorFamilyName: schema.workforceMembers.familyName,
            administratorGivenName: schema.workforceMembers.givenName,
            administratorId: schema.workforceMembers.id,
            administratorRoleTitle: schema.workforceMembers.roleTitle,
            decision: schema.complianceReviewEvents.decision,
            id: schema.complianceReviewEvents.id,
            note: schema.complianceReviewEvents.note,
            occurredAt: schema.complianceReviewEvents.occurredAt,
          })
          .from(schema.complianceReviewEvents)
          .innerJoin(
            schema.workforceMembers,
            eq(
              schema.complianceReviewEvents.administratorMemberId,
              schema.workforceMembers.id,
            ),
          )
          .where(
            eq(
              schema.complianceReviewEvents.complianceRecordId,
              query.recordId,
            ),
          )
          .orderBy(
            desc(schema.complianceReviewEvents.occurredAt),
            desc(schema.complianceReviewEvents.id),
          ),
      ])
      return {
        administrator: this.personaSummary(administrator),
        history: historyRows.map((history) => ({
          administrator: {
            displayName: `${history.administratorGivenName} ${history.administratorFamilyName}`,
            id: history.administratorId,
            roleTitle: history.administratorRoleTitle,
          },
          decision: history.decision,
          id: history.id,
          note: history.note,
          occurredAt: isoDateTime(history.occurredAt),
        })),
        record: this.complianceRecordSummary(record),
        workerReadiness: readinessRows[0]?.readiness ?? 'action_due',
      }
    })
  }

  private async deriveReadiness(
    transaction: DatabaseTransaction<TQueryResult>,
    workerProfileId: string,
    organisationId: string,
    referenceAt: string,
  ): Promise<ReadinessStatus> {
    const [requirementRows, recordRows] = await Promise.all([
      transaction
        .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
        .from(schema.complianceRequirements)
        .where(eq(schema.complianceRequirements.organisationId, organisationId)),
      transaction
        .select({ dueOn: schema.complianceRecords.dueOn, status: schema.complianceRecords.status })
        .from(schema.complianceRecords)
        .where(eq(schema.complianceRecords.workerProfileId, workerProfileId)),
    ])
    if (recordRows.length < (requirementRows[0]?.count ?? 0)) return 'action_due'
    const referenceDate = referenceAt.slice(0, 10)
    if (
      recordRows.some(
        (record) =>
          blockedComplianceStatuses.includes(
            record.status as (typeof blockedComplianceStatuses)[number],
          ) ||
          (record.dueOn !== null && record.dueOn < referenceDate),
      )
    ) {
      return 'action_due'
    }
    if (recordRows.some((record) => record.status === 'reviewing')) {
      return 'reviewing'
    }
    return 'ready'
  }

  public async decideAdministratorCompliance(
    command: AdministratorComplianceDecisionCommand,
  ): Promise<AdministratorComplianceDecisionData | null> {
    return this.db.transaction(async (transaction) => {
      const administrator = await this.personaContext(
        transaction,
        command.administratorId,
        'administrator',
      )
      if (administrator === null) return null
      await this.lockActor(transaction, administrator.id)
      const fingerprint = `compliance:${command.recordId}:${JSON.stringify(command.body)}`
      const replay = await this.readIdempotentResult(transaction, {
        actorMemberId: administrator.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'compliance_decision',
        resultSchema: administratorComplianceDecisionDataSchema,
      })
      if (replay !== null) return replay
      const initialRows = await transaction
        .select({ workerProfileId: schema.complianceRecords.workerProfileId })
        .from(schema.complianceRecords)
        .where(eq(schema.complianceRecords.id, command.recordId))
        .limit(1)
      const initial = initialRows[0]
      if (initial === undefined) return null
      await this.lockWorkerProfile(transaction, initial.workerProfileId)
      await transaction.execute(
        sql`select ${schema.complianceRecords.id} from ${schema.complianceRecords} where ${schema.complianceRecords.id} = ${command.recordId} for update`,
      )
      const rows = await transaction
        .select({
          competencyId: schema.complianceRequirements.competencyId,
          organisationId: schema.complianceRequirements.organisationId,
          status: schema.complianceRecords.status,
          version: schema.complianceRecords.version,
          workerId: schema.workforceMembers.id,
          workerProfileId: schema.workerProfiles.id,
        })
        .from(schema.complianceRecords)
        .innerJoin(
          schema.complianceRequirements,
          eq(
            schema.complianceRecords.requirementId,
            schema.complianceRequirements.id,
          ),
        )
        .innerJoin(
          schema.workerProfiles,
          eq(schema.complianceRecords.workerProfileId, schema.workerProfiles.id),
        )
        .innerJoin(
          schema.workforceMembers,
          eq(schema.workerProfiles.workforceMemberId, schema.workforceMembers.id),
        )
        .where(eq(schema.complianceRecords.id, command.recordId))
        .limit(1)
      const record = rows[0]
      if (record === undefined) return null
      if (record.workerProfileId !== initial.workerProfileId) {
        throw new OperationsRuleError(
          'VERSION_CONFLICT',
          'The compliance record changed since it was loaded. Refresh before deciding.',
        )
      }
      if (record.organisationId !== administrator.organisationId) {
        throw new OperationsRuleError(
          'ORGANISATION_SCOPE_MISMATCH',
          'The compliance record is outside this Administrator preview scope.',
        )
      }
      if (record.version !== command.body.expectedVersion) {
        throw new OperationsRuleError(
          'VERSION_CONFLICT',
          'The compliance record changed since it was loaded. Refresh before deciding.',
        )
      }
      if (record.status !== 'reviewing') {
        throw new OperationsRuleError(
          'COMPLIANCE_NOT_REVIEWABLE',
          'Only a compliance record awaiting review can receive a decision.',
        )
      }
      const nextStatus: ComplianceRecordReviewStatus =
        command.body.decision === 'approved_current'
          ? 'current'
          : command.body.decision === 'further_information_required'
            ? 'information_required'
            : 'rejected'
      const referenceDate = command.occurredAt.slice(0, 10)
      await transaction
        .update(schema.complianceRecords)
        .set({
          reviewNote: command.body.note,
          reviewedByMemberId: administrator.id,
          reviewedOn: referenceDate,
          status: nextStatus,
          updatedAt: command.occurredAt,
          version: sql`${schema.complianceRecords.version} + 1`,
        })
        .where(eq(schema.complianceRecords.id, command.recordId))
      if (record.competencyId !== null) {
        await transaction
          .update(schema.workerCompetencies)
          .set({
            status:
              command.body.decision === 'approved_current'
                ? 'current'
                : 'expired',
            updatedAt: command.occurredAt,
            verifiedOn:
              command.body.decision === 'approved_current'
                ? referenceDate
                : undefined,
          })
          .where(
            and(
              eq(
                schema.workerCompetencies.workerProfileId,
                record.workerProfileId,
              ),
              eq(schema.workerCompetencies.competencyId, record.competencyId),
            ),
          )
      }
      await transaction.insert(schema.complianceReviewEvents).values({
        administratorMemberId: administrator.id,
        complianceRecordId: command.recordId,
        createdAt: command.occurredAt,
        decision: command.body.decision,
        id: randomUUID(),
        note: command.body.note,
        occurredAt: command.occurredAt,
        updatedAt: command.occurredAt,
      })
      const workerReadiness = await this.deriveReadiness(
        transaction,
        record.workerProfileId,
        record.organisationId,
        command.occurredAt,
      )
      await transaction
        .update(schema.workerProfiles)
        .set({
          overallReadinessStatus: workerReadiness,
          updatedAt: command.occurredAt,
        })
        .where(eq(schema.workerProfiles.id, record.workerProfileId))
      await transaction.insert(schema.notifications).values({
        detail:
          command.body.decision === 'approved_current'
            ? 'A synthetic compliance record was approved as current.'
            : 'A synthetic compliance record needs action before readiness can be restored.',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        recipientMemberId: record.workerId,
        title:
          command.body.decision === 'approved_current'
            ? 'Compliance review approved'
            : 'Compliance action required',
        tone:
          command.body.decision === 'approved_current' ? 'success' : 'warning',
        updatedAt: command.occurredAt,
      })
      await transaction.insert(schema.activityEvents).values({
        actorMemberId: administrator.id,
        detail:
          'A synthetic compliance decision changed the effective readiness calculation.',
        eventType: 'compliance_decided',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        organisationId: administrator.organisationId,
        shiftId: null,
        subjectMemberId: record.workerId,
        title: 'Compliance review decided',
        updatedAt: command.occurredAt,
      })
      const detail = await this.getComplianceSummaryInsideTransaction(
        transaction,
        command.recordId,
        administrator.organisationId,
      )
      if (detail === null) {
        throw new Error('The compliance decision did not produce a result.')
      }
      const result: AdministratorComplianceDecisionData = {
        idempotentReplay: false,
        message:
          command.body.decision === 'approved_current'
            ? 'The compliance record is current and readiness was recalculated.'
            : 'The compliance outcome was recorded and readiness now shows action due.',
        record: detail,
        workerReadiness,
      }
      await this.storeIdempotentResult(transaction, {
        actorMemberId: administrator.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'compliance_decision',
        responseStatus: 200,
        result,
      })
      return result
    })
  }

  private async getComplianceSummaryInsideTransaction(
    transaction: DatabaseTransaction<TQueryResult>,
    recordId: string,
    organisationId: string,
  ) {
    const rows = await this.complianceRecordRows(
      transaction,
      and(
        eq(schema.complianceRecords.id, recordId),
        eq(schema.complianceRequirements.organisationId, organisationId),
      ),
      1,
    )
    const row = rows[0]
    return row === undefined ? null : this.complianceRecordSummary(row)
  }

  private async timesheetRows(
    transaction: DatabaseTransaction<TQueryResult>,
    predicate: ReturnType<typeof and>,
    limit: number,
  ): Promise<readonly Timesheet[]> {
    const reviewers = alias(schema.workforceMembers, 'timesheet_reviewers')
    const rows = await transaction
      .select({
        approvedAt: schema.timesheets.approvedAt,
        areaName: schema.shifts.areaName,
        assignmentId: schema.timesheets.assignmentId,
        breakMinutes: schema.timesheets.breakMinutes,
        createdAt: schema.timesheets.createdAt,
        endsAt: schema.shifts.endsAt,
        id: schema.timesheets.id,
        locationId: schema.locations.id,
        locationName: schema.locations.name,
        managerReviewNote: schema.timesheets.managerReviewNote,
        organisationId: schema.organisations.id,
        organisationName: schema.organisations.name,
        rejectedAt: schema.timesheets.rejectedAt,
        reviewerFamilyName: reviewers.familyName,
        reviewerGivenName: reviewers.givenName,
        reviewerId: reviewers.id,
        reviewerRoleTitle: reviewers.roleTitle,
        roleTitle: schema.shifts.roleTitle,
        shiftId: schema.shifts.id,
        startsAt: schema.shifts.startsAt,
        status: schema.timesheets.status,
        submittedAt: schema.timesheets.submittedAt,
        timezone: schema.locations.timezone,
        updatedAt: schema.timesheets.updatedAt,
        version: schema.timesheets.version,
        workedEnd: schema.timesheets.workedEnd,
        workedMinutes: schema.timesheets.workedMinutes,
        workedStart: schema.timesheets.workedStart,
        workerFamilyName: schema.workforceMembers.familyName,
        workerGivenName: schema.workforceMembers.givenName,
        workerId: schema.workforceMembers.id,
        workerNote: schema.timesheets.workerNote,
        workerRoleTitle: schema.workforceMembers.roleTitle,
      })
      .from(schema.timesheets)
      .innerJoin(
        schema.workerProfiles,
        eq(schema.timesheets.workerProfileId, schema.workerProfiles.id),
      )
      .innerJoin(
        schema.workforceMembers,
        eq(schema.workerProfiles.workforceMemberId, schema.workforceMembers.id),
      )
      .innerJoin(schema.shifts, eq(schema.timesheets.shiftId, schema.shifts.id))
      .innerJoin(
        schema.locations,
        eq(schema.shifts.locationId, schema.locations.id),
      )
      .innerJoin(
        schema.organisations,
        eq(schema.timesheets.organisationId, schema.organisations.id),
      )
      .leftJoin(
        reviewers,
        eq(schema.timesheets.reviewedByMemberId, reviewers.id),
      )
      .where(predicate)
      .orderBy(desc(schema.timesheets.updatedAt), desc(schema.timesheets.id))
      .limit(limit)
    return rows.map((row) => ({
      approvedAt: row.approvedAt === null ? null : isoDateTime(row.approvedAt),
      assignmentId: row.assignmentId,
      breakMinutes: row.breakMinutes,
      createdAt: isoDateTime(row.createdAt),
      id: row.id,
      managerReviewNote: row.managerReviewNote,
      organisation: {
        id: row.organisationId,
        name: row.organisationName,
      },
      rejectedAt: row.rejectedAt === null ? null : isoDateTime(row.rejectedAt),
      reviewedBy:
        row.reviewerId === null ||
        row.reviewerGivenName === null ||
        row.reviewerFamilyName === null ||
        row.reviewerRoleTitle === null
          ? null
          : {
              displayName: `${row.reviewerGivenName} ${row.reviewerFamilyName}`,
              id: row.reviewerId,
              roleTitle: row.reviewerRoleTitle,
            },
      shift: {
        endsAt: isoDateTime(row.endsAt),
        id: row.shiftId,
        location: {
          area: row.areaName,
          id: row.locationId,
          name: row.locationName,
          timezone: row.timezone,
        },
        roleTitle: row.roleTitle,
        startsAt: isoDateTime(row.startsAt),
      },
      status: row.status,
      submittedAt:
        row.submittedAt === null ? null : isoDateTime(row.submittedAt),
      updatedAt: isoDateTime(row.updatedAt),
      version: row.version,
      workedEnd: isoDateTime(row.workedEnd),
      workedMinutes: row.workedMinutes,
      workedStart: isoDateTime(row.workedStart),
      worker: {
        displayName: `${row.workerGivenName} ${row.workerFamilyName}`,
        id: row.workerId,
        roleTitle: row.workerRoleTitle,
      },
      workerNote: row.workerNote,
    }))
  }

  private async eligibleTimesheetAssignments(
    transaction: DatabaseTransaction<TQueryResult>,
    workerProfileId: string,
    referenceAt: string,
  ) {
    return transaction
      .select({
        areaName: schema.shifts.areaName,
        assignmentId: schema.shiftAssignments.id,
        endsAt: schema.shifts.endsAt,
        locationId: schema.locations.id,
        locationName: schema.locations.name,
        roleTitle: schema.shifts.roleTitle,
        shiftId: schema.shifts.id,
        startsAt: schema.shifts.startsAt,
        timezone: schema.locations.timezone,
      })
      .from(schema.shiftAssignments)
      .innerJoin(
        schema.shifts,
        eq(schema.shiftAssignments.shiftId, schema.shifts.id),
      )
      .innerJoin(
        schema.locations,
        eq(schema.shifts.locationId, schema.locations.id),
      )
      .leftJoin(
        schema.timesheets,
        eq(schema.timesheets.assignmentId, schema.shiftAssignments.id),
      )
      .where(
        and(
          eq(schema.shiftAssignments.workerProfileId, workerProfileId),
          eq(schema.shiftAssignments.status, 'confirmed'),
          lt(schema.shifts.endsAt, referenceAt),
          sql`${schema.timesheets.id} is null`,
        ),
      )
      .orderBy(desc(schema.shifts.endsAt), desc(schema.shiftAssignments.id))
  }

  public async getWorkerTimesheets(query: WorkerTimesheetsLookup) {
    return this.db.transaction(async (transaction) => {
      const worker = await this.workerContext(transaction, query.workerId)
      if (worker === null) return null
      const cursor =
        query.cursor === undefined
          ? undefined
          : decodeOperationsCursor(query.cursor, 'timesheets')
      const [items, eligibleAssignments] = await Promise.all([
        this.timesheetRows(
          transaction,
          and(
            eq(schema.timesheets.workerProfileId, worker.profileId),
            query.status === undefined
              ? undefined
              : eq(schema.timesheets.status, query.status),
            cursor === undefined
              ? undefined
              : or(
                  lt(schema.timesheets.updatedAt, cursor.sortAt),
                  and(
                    eq(schema.timesheets.updatedAt, cursor.sortAt),
                    lt(schema.timesheets.id, cursor.id),
                  ),
                ),
          ),
          query.limit + 1,
        ),
        this.eligibleTimesheetAssignments(
          transaction,
          worker.profileId,
          query.referenceAt,
        ),
      ])
      const hasMore = items.length > query.limit
      const page = items.slice(0, query.limit)
      const last = page.at(-1)
      return {
        asOfDate: query.referenceAt.slice(0, 10),
        eligibleAssignments: eligibleAssignments.map((assignment) => ({
          assignmentId: assignment.assignmentId,
          endsAt: isoDateTime(assignment.endsAt),
          location: {
            area: assignment.areaName,
            id: assignment.locationId,
            name: assignment.locationName,
            timezone: assignment.timezone,
          },
          roleTitle: assignment.roleTitle,
          shiftId: assignment.shiftId,
          startsAt: isoDateTime(assignment.startsAt),
        })),
        items: page,
        nextCursor:
          hasMore && last !== undefined
            ? encodeOperationsCursor(
                'timesheets',
                last.updatedAt,
                last.id,
              )
            : null,
        worker: this.personaSummary(worker),
      }
    })
  }

  public async getWorkerTimesheetDetail(query: WorkerTimesheetDetailLookup) {
    return this.db.transaction(async (transaction) => {
      const worker = await this.workerContext(transaction, query.workerId)
      if (worker === null) return null
      const rows = await this.timesheetRows(
        transaction,
        and(
          eq(schema.timesheets.id, query.timesheetId),
          eq(schema.timesheets.workerProfileId, worker.profileId),
        ),
        1,
      )
      const timesheet = rows[0]
      return timesheet === undefined
        ? null
        : { timesheet, worker: this.personaSummary(worker) }
    })
  }

  private validateWorkedWindow(
    workedStart: string,
    workedEnd: string,
    shiftStartsAt: string,
    shiftEndsAt: string,
  ): void {
    if (
      Date.parse(workedStart) <
        Date.parse(shiftStartsAt) - timesheetBoundaryToleranceMilliseconds ||
      Date.parse(workedEnd) >
        Date.parse(shiftEndsAt) + timesheetBoundaryToleranceMilliseconds
    ) {
      throw new OperationsRuleError(
        'TIMESHEET_NOT_ELIGIBLE',
        'Worked times must remain within 12 hours of the assigned shift window.',
      )
    }
  }

  private async timesheetMutationResult(
    transaction: DatabaseTransaction<TQueryResult>,
    timesheetId: string,
    message: string,
  ): Promise<WorkerTimesheetMutationData> {
    const rows = await this.timesheetRows(
      transaction,
      and(eq(schema.timesheets.id, timesheetId)),
      1,
    )
    const timesheet = rows[0]
    if (timesheet === undefined) {
      throw new Error('The timesheet mutation did not produce a result.')
    }
    return { idempotentReplay: false, message, timesheet }
  }

  public async createWorkerTimesheet(command: WorkerTimesheetCreateCommand) {
    return this.db.transaction(async (transaction) => {
      const worker = await this.workerContext(transaction, command.workerId)
      if (worker === null) return null
      await this.lockActor(transaction, worker.id)
      const fingerprint = `create-timesheet:${JSON.stringify(command.body)}`
      const replay = await this.readIdempotentResult(transaction, {
        actorMemberId: worker.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'create_timesheet',
        resultSchema: workerTimesheetMutationDataSchema,
      })
      if (replay !== null) return replay
      await transaction.execute(
        sql`select ${schema.shiftAssignments.id} from ${schema.shiftAssignments} where ${schema.shiftAssignments.id} = ${command.body.assignmentId} for update`,
      )
      const rows = await transaction
        .select({
          assignmentStatus: schema.shiftAssignments.status,
          endsAt: schema.shifts.endsAt,
          organisationId: schema.shifts.organisationId,
          shiftId: schema.shifts.id,
          startsAt: schema.shifts.startsAt,
          workerProfileId: schema.shiftAssignments.workerProfileId,
        })
        .from(schema.shiftAssignments)
        .innerJoin(
          schema.shifts,
          eq(schema.shiftAssignments.shiftId, schema.shifts.id),
        )
        .where(eq(schema.shiftAssignments.id, command.body.assignmentId))
        .limit(1)
      const assignment = rows[0]
      if (assignment === undefined) return null
      if (
        assignment.workerProfileId !== worker.profileId ||
        assignment.assignmentStatus !== 'confirmed' ||
        Date.parse(assignment.endsAt) > Date.parse(command.occurredAt)
      ) {
        throw new OperationsRuleError(
          'TIMESHEET_NOT_ELIGIBLE',
          'A timesheet can be prepared only for a completed confirmed assignment.',
        )
      }
      this.validateWorkedWindow(
        command.body.workedStart,
        command.body.workedEnd,
        assignment.startsAt,
        assignment.endsAt,
      )
      const existingTimesheets = await transaction
        .select({ id: schema.timesheets.id })
        .from(schema.timesheets)
        .where(eq(schema.timesheets.assignmentId, command.body.assignmentId))
        .limit(1)
      if (existingTimesheets[0] !== undefined) {
        throw new OperationsRuleError(
          'TIMESHEET_LIFECYCLE_CONFLICT',
          'A timesheet already exists for this assignment.',
        )
      }
      const timesheetId = randomUUID()
      await transaction.insert(schema.timesheets).values({
        assignmentId: command.body.assignmentId,
        breakMinutes: command.body.breakMinutes,
        createdAt: command.occurredAt,
        id: timesheetId,
        organisationId: assignment.organisationId,
        shiftId: assignment.shiftId,
        status: 'draft',
        updatedAt: command.occurredAt,
        workedEnd: command.body.workedEnd,
        workedMinutes: workedMinutes(
          command.body.workedStart,
          command.body.workedEnd,
          command.body.breakMinutes,
        ),
        workedStart: command.body.workedStart,
        workerNote: normalizeNote(command.body.workerNote),
        workerProfileId: worker.profileId,
      })
      await transaction.insert(schema.activityEvents).values({
        actorMemberId: worker.id,
        detail: 'A synthetic timesheet draft was saved.',
        eventType: 'timesheet_saved',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        organisationId: worker.organisationId,
        shiftId: assignment.shiftId,
        subjectMemberId: worker.id,
        title: 'Timesheet draft saved',
        updatedAt: command.occurredAt,
      })
      const result = await this.timesheetMutationResult(
        transaction,
        timesheetId,
        'The timesheet was saved as a draft.',
      )
      await this.storeIdempotentResult(transaction, {
        actorMemberId: worker.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'create_timesheet',
        responseStatus: 201,
        result,
        workerProfileId: worker.profileId,
      })
      return result
    })
  }

  public async updateWorkerTimesheet(command: WorkerTimesheetUpdateCommand) {
    return this.db.transaction(async (transaction) => {
      const worker = await this.workerContext(transaction, command.workerId)
      if (worker === null) return null
      await this.lockActor(transaction, worker.id)
      const fingerprint = `update-timesheet:${command.timesheetId}:${JSON.stringify(command.body)}`
      const replay = await this.readIdempotentResult(transaction, {
        actorMemberId: worker.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'update_timesheet',
        resultSchema: workerTimesheetMutationDataSchema,
      })
      if (replay !== null) return replay
      await transaction.execute(
        sql`select ${schema.timesheets.id} from ${schema.timesheets} where ${schema.timesheets.id} = ${command.timesheetId} for update`,
      )
      const rows = await transaction
        .select({
          endsAt: schema.shifts.endsAt,
          shiftId: schema.shifts.id,
          startsAt: schema.shifts.startsAt,
          status: schema.timesheets.status,
          version: schema.timesheets.version,
          workerProfileId: schema.timesheets.workerProfileId,
        })
        .from(schema.timesheets)
        .innerJoin(schema.shifts, eq(schema.timesheets.shiftId, schema.shifts.id))
        .where(eq(schema.timesheets.id, command.timesheetId))
        .limit(1)
      const timesheet = rows[0]
      if (timesheet === undefined) return null
      if (timesheet.workerProfileId !== worker.profileId) {
        throw new OperationsRuleError(
          'ORGANISATION_SCOPE_MISMATCH',
          'The timesheet is outside this Worker preview scope.',
        )
      }
      if (timesheet.version !== command.body.expectedVersion) {
        throw new OperationsRuleError(
          'VERSION_CONFLICT',
          'The timesheet changed since it was loaded. Refresh before saving.',
        )
      }
      if (timesheet.status !== 'draft' && timesheet.status !== 'rejected') {
        throw new OperationsRuleError(
          'TIMESHEET_LIFECYCLE_CONFLICT',
          'Submitted and approved timesheets are read-only to the Worker.',
        )
      }
      this.validateWorkedWindow(
        command.body.workedStart,
        command.body.workedEnd,
        timesheet.startsAt,
        timesheet.endsAt,
      )
      await transaction
        .update(schema.timesheets)
        .set({
          breakMinutes: command.body.breakMinutes,
          updatedAt: command.occurredAt,
          version: sql`${schema.timesheets.version} + 1`,
          workedEnd: command.body.workedEnd,
          workedMinutes: workedMinutes(
            command.body.workedStart,
            command.body.workedEnd,
            command.body.breakMinutes,
          ),
          workedStart: command.body.workedStart,
          workerNote: normalizeNote(command.body.workerNote),
        })
        .where(eq(schema.timesheets.id, command.timesheetId))
      await transaction.insert(schema.activityEvents).values({
        actorMemberId: worker.id,
        detail: 'A synthetic timesheet draft or correction was saved.',
        eventType: 'timesheet_saved',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        organisationId: worker.organisationId,
        shiftId: timesheet.shiftId,
        subjectMemberId: worker.id,
        title: 'Timesheet changes saved',
        updatedAt: command.occurredAt,
      })
      const result = await this.timesheetMutationResult(
        transaction,
        command.timesheetId,
        timesheet.status === 'rejected'
          ? 'The rejected timesheet correction was saved and remains ready to resubmit.'
          : 'The timesheet draft was updated.',
      )
      await this.storeIdempotentResult(transaction, {
        actorMemberId: worker.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'update_timesheet',
        responseStatus: 200,
        result,
        workerProfileId: worker.profileId,
      })
      return result
    })
  }

  public async submitWorkerTimesheet(command: WorkerTimesheetSubmitCommand) {
    return this.db.transaction(async (transaction) => {
      const worker = await this.workerContext(transaction, command.workerId)
      if (worker === null) return null
      await this.lockActor(transaction, worker.id)
      const fingerprint = `submit-timesheet:${command.timesheetId}:${String(command.expectedVersion)}`
      const replay = await this.readIdempotentResult(transaction, {
        actorMemberId: worker.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'submit_timesheet',
        resultSchema: workerTimesheetMutationDataSchema,
      })
      if (replay !== null) return replay
      await transaction.execute(
        sql`select ${schema.timesheets.id} from ${schema.timesheets} where ${schema.timesheets.id} = ${command.timesheetId} for update`,
      )
      const rows = await transaction
        .select({
          assignmentStatus: schema.shiftAssignments.status,
          endsAt: schema.shifts.endsAt,
          organisationId: schema.timesheets.organisationId,
          shiftId: schema.timesheets.shiftId,
          status: schema.timesheets.status,
          version: schema.timesheets.version,
          workerProfileId: schema.timesheets.workerProfileId,
        })
        .from(schema.timesheets)
        .innerJoin(
          schema.shiftAssignments,
          eq(schema.timesheets.assignmentId, schema.shiftAssignments.id),
        )
        .innerJoin(schema.shifts, eq(schema.timesheets.shiftId, schema.shifts.id))
        .where(eq(schema.timesheets.id, command.timesheetId))
        .limit(1)
      const timesheet = rows[0]
      if (timesheet === undefined) return null
      if (timesheet.workerProfileId !== worker.profileId) {
        throw new OperationsRuleError(
          'ORGANISATION_SCOPE_MISMATCH',
          'The timesheet is outside this Worker preview scope.',
        )
      }
      if (timesheet.version !== command.expectedVersion) {
        throw new OperationsRuleError(
          'VERSION_CONFLICT',
          'The timesheet changed since it was loaded. Refresh before submitting.',
        )
      }
      if (
        (timesheet.status !== 'draft' && timesheet.status !== 'rejected') ||
        timesheet.assignmentStatus !== 'confirmed' ||
        Date.parse(timesheet.endsAt) > Date.parse(command.occurredAt)
      ) {
        throw new OperationsRuleError(
          'TIMESHEET_LIFECYCLE_CONFLICT',
          'Only a draft or corrected rejected timesheet for a completed confirmed assignment can be submitted.',
        )
      }
      await transaction
        .update(schema.timesheets)
        .set({
          approvedAt: null,
          managerReviewNote: null,
          rejectedAt: null,
          reviewedByMemberId: null,
          status: 'submitted',
          submittedAt: command.occurredAt,
          updatedAt: command.occurredAt,
          version: sql`${schema.timesheets.version} + 1`,
        })
        .where(eq(schema.timesheets.id, command.timesheetId))
      const managers = await transaction
        .select({ id: schema.workforceMembers.id })
        .from(schema.workforceMembers)
        .where(
          and(
            eq(
              schema.workforceMembers.organisationId,
              timesheet.organisationId,
            ),
            eq(schema.workforceMembers.memberType, 'manager'),
            eq(schema.workforceMembers.status, 'active'),
          ),
        )
      if (managers.length > 0) {
        await transaction.insert(schema.notifications).values(
          managers.map((manager) => ({
            detail: 'A synthetic timesheet is ready for Manager review.',
            id: randomUUID(),
            occurredAt: command.occurredAt,
            recipientMemberId: manager.id,
            title: 'Timesheet submitted',
            tone: 'information' as const,
            updatedAt: command.occurredAt,
          })),
        )
      }
      await transaction.insert(schema.notifications).values({
        detail: 'Your synthetic timesheet was submitted for Manager review.',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        recipientMemberId: worker.id,
        title: 'Timesheet submitted',
        tone: 'success',
        updatedAt: command.occurredAt,
      })
      await transaction.insert(schema.activityEvents).values({
        actorMemberId: worker.id,
        detail: 'A synthetic timesheet was submitted for Manager review.',
        eventType: 'timesheet_submitted',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        organisationId: worker.organisationId,
        shiftId: timesheet.shiftId,
        subjectMemberId: worker.id,
        title: 'Timesheet submitted',
        updatedAt: command.occurredAt,
      })
      const result = await this.timesheetMutationResult(
        transaction,
        command.timesheetId,
        'The timesheet was submitted and is now read-only pending Manager review.',
      )
      await this.storeIdempotentResult(transaction, {
        actorMemberId: worker.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'submit_timesheet',
        responseStatus: 200,
        result,
        workerProfileId: worker.profileId,
      })
      return result
    })
  }

  public async getManagerTimesheets(query: ManagerTimesheetsLookup) {
    return this.db.transaction(async (transaction) => {
      const manager = await this.personaContext(
        transaction,
        query.managerId,
        'manager',
      )
      if (manager === null) return null
      const cursor =
        query.cursor === undefined
          ? undefined
          : decodeOperationsCursor(query.cursor, 'timesheets')
      const items = await this.timesheetRows(
        transaction,
        and(
          eq(schema.timesheets.organisationId, manager.organisationId),
          query.status === undefined
            ? undefined
            : eq(schema.timesheets.status, query.status),
          cursor === undefined
            ? undefined
            : or(
                lt(schema.timesheets.updatedAt, cursor.sortAt),
                and(
                  eq(schema.timesheets.updatedAt, cursor.sortAt),
                  lt(schema.timesheets.id, cursor.id),
                ),
              ),
        ),
        query.limit + 1,
      )
      const hasMore = items.length > query.limit
      const page = items.slice(0, query.limit)
      const last = page.at(-1)
      return {
        items: page,
        manager: this.personaSummary(manager),
        nextCursor:
          hasMore && last !== undefined
            ? encodeOperationsCursor(
                'timesheets',
                last.updatedAt,
                last.id,
              )
            : null,
      }
    })
  }

  public async decideManagerTimesheet(
    command: ManagerTimesheetDecisionCommand,
  ): Promise<WorkerTimesheetMutationData | null> {
    return this.db.transaction(async (transaction) => {
      const manager = await this.personaContext(
        transaction,
        command.managerId,
        'manager',
      )
      if (manager === null) return null
      await this.lockActor(transaction, manager.id)
      const fingerprint = `timesheet-decision:${command.timesheetId}:${JSON.stringify(command.body)}`
      const replay = await this.readIdempotentResult(transaction, {
        actorMemberId: manager.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'timesheet_decision',
        resultSchema: workerTimesheetMutationDataSchema,
      })
      if (replay !== null) return replay
      await transaction.execute(
        sql`select ${schema.timesheets.id} from ${schema.timesheets} where ${schema.timesheets.id} = ${command.timesheetId} for update`,
      )
      const rows = await transaction
        .select({
          organisationId: schema.timesheets.organisationId,
          shiftId: schema.timesheets.shiftId,
          status: schema.timesheets.status,
          version: schema.timesheets.version,
          workerId: schema.workforceMembers.id,
        })
        .from(schema.timesheets)
        .innerJoin(
          schema.workerProfiles,
          eq(schema.timesheets.workerProfileId, schema.workerProfiles.id),
        )
        .innerJoin(
          schema.workforceMembers,
          eq(schema.workerProfiles.workforceMemberId, schema.workforceMembers.id),
        )
        .where(eq(schema.timesheets.id, command.timesheetId))
        .limit(1)
      const timesheet = rows[0]
      if (timesheet === undefined) return null
      if (timesheet.organisationId !== manager.organisationId) {
        throw new OperationsRuleError(
          'ORGANISATION_SCOPE_MISMATCH',
          'The timesheet is outside this Manager preview scope.',
        )
      }
      if (timesheet.version !== command.body.expectedVersion) {
        throw new OperationsRuleError(
          'VERSION_CONFLICT',
          'The timesheet changed since it was loaded. Refresh before deciding.',
        )
      }
      if (timesheet.status !== 'submitted') {
        throw new OperationsRuleError(
          'TIMESHEET_LIFECYCLE_CONFLICT',
          'Only a submitted timesheet can receive a Manager decision.',
        )
      }
      const approved = command.body.decision === 'approve'
      await transaction
        .update(schema.timesheets)
        .set({
          approvedAt: approved ? command.occurredAt : null,
          managerReviewNote: normalizeNote(command.body.reviewNote),
          rejectedAt: approved ? null : command.occurredAt,
          reviewedByMemberId: manager.id,
          status: approved ? 'approved' : 'rejected',
          updatedAt: command.occurredAt,
          version: sql`${schema.timesheets.version} + 1`,
        })
        .where(eq(schema.timesheets.id, command.timesheetId))
      await transaction.insert(schema.notifications).values({
        detail: approved
          ? 'Your synthetic timesheet was approved.'
          : 'Your synthetic timesheet was returned for correction.',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        recipientMemberId: timesheet.workerId,
        title: approved ? 'Timesheet approved' : 'Timesheet needs correction',
        tone: approved ? 'success' : 'warning',
        updatedAt: command.occurredAt,
      })
      await transaction.insert(schema.activityEvents).values({
        actorMemberId: manager.id,
        detail: approved
          ? 'A synthetic timesheet was approved.'
          : 'A synthetic timesheet was returned for correction.',
        eventType: approved ? 'timesheet_approved' : 'timesheet_rejected',
        id: randomUUID(),
        occurredAt: command.occurredAt,
        organisationId: manager.organisationId,
        shiftId: timesheet.shiftId,
        subjectMemberId: timesheet.workerId,
        title: approved ? 'Timesheet approved' : 'Timesheet rejected',
        updatedAt: command.occurredAt,
      })
      const result = await this.timesheetMutationResult(
        transaction,
        command.timesheetId,
        approved
          ? 'The timesheet is approved and terminal.'
          : 'The timesheet was returned to the Worker for correction and resubmission.',
      )
      await this.storeIdempotentResult(transaction, {
        actorMemberId: manager.id,
        fingerprint,
        idempotencyKey: command.idempotencyKey,
        occurredAt: command.occurredAt,
        operation: 'timesheet_decision',
        responseStatus: 200,
        result,
      })
      return result
    })
  }

  public async getAdministratorTimesheets(
    query: AdministratorTimesheetsLookup,
  ) {
    return this.db.transaction(async (transaction) => {
      const administrator = await this.personaContext(
        transaction,
        query.administratorId,
        'administrator',
      )
      if (administrator === null) return null
      const cursor =
        query.cursor === undefined
          ? undefined
          : decodeOperationsCursor(query.cursor, 'timesheets')
      const [items, summaryRows] = await Promise.all([
        this.timesheetRows(
          transaction,
          and(
            eq(
              schema.timesheets.organisationId,
              administrator.organisationId,
            ),
            query.status === undefined
              ? undefined
              : eq(schema.timesheets.status, query.status),
            cursor === undefined
              ? undefined
              : or(
                  lt(schema.timesheets.updatedAt, cursor.sortAt),
                  and(
                    eq(schema.timesheets.updatedAt, cursor.sortAt),
                    lt(schema.timesheets.id, cursor.id),
                  ),
                ),
          ),
          query.limit + 1,
        ),
        transaction
          .select({
            approved: sql<number>`count(*) filter (where ${schema.timesheets.status} = 'approved')::int`.mapWith(Number),
            draft: sql<number>`count(*) filter (where ${schema.timesheets.status} = 'draft')::int`.mapWith(Number),
            rejected: sql<number>`count(*) filter (where ${schema.timesheets.status} = 'rejected')::int`.mapWith(Number),
            submitted: sql<number>`count(*) filter (where ${schema.timesheets.status} = 'submitted')::int`.mapWith(Number),
            total: sql<number>`count(*)::int`.mapWith(Number),
          })
          .from(schema.timesheets)
          .where(
            eq(
              schema.timesheets.organisationId,
              administrator.organisationId,
            ),
          ),
      ])
      const hasMore = items.length > query.limit
      const page = items.slice(0, query.limit)
      const last = page.at(-1)
      return {
        administrator: this.personaSummary(administrator),
        items: page,
        nextCursor:
          hasMore && last !== undefined
            ? encodeOperationsCursor(
                'timesheets',
                last.updatedAt,
                last.id,
              )
            : null,
        summary: summaryRows[0] ?? {
          approved: 0,
          draft: 0,
          rejected: 0,
          submitted: 0,
          total: 0,
        },
      }
    })
  }
}

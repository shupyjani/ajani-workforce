import type {
  CoverageItem,
  ReadinessStatus,
  RequirementStatus,
} from '@ajani/contracts'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  lt,
  or,
  sql,
} from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type { DatabaseConnection } from './connection.js'
import {
  decodeComplianceCursor,
  decodeNotificationsCursor,
  decodeRecordsCursor,
  encodeComplianceCursor,
  encodeNotificationsCursor,
  encodeRecordsCursor,
} from './cursor.js'
import type {
  AdministratorComplianceLookup,
  AdministratorRecordsLookup,
  PaginatedRepositoryResult,
  PreviewRepository,
} from './repository-types.js'
import * as schema from './schema.js'
import { OperationsRepository } from './operations-repository.js'
import { WorkerJourneyRepository } from './worker-journey-repository.js'

export const syntheticPreviewAsOfDate = '2026-08-25'
export const syntheticCoverageWindow = {
  endsAt: '2026-08-30T00:00:00.000Z',
  startsAt: '2026-08-25T00:00:00.000Z',
} as const

function displayName(givenName: string, familyName: string): string {
  return `${givenName} ${familyName}`
}

function isoDateTime(value: string): string {
  return new Date(value).toISOString()
}

function requirementStatus(
  status: typeof schema.complianceRecords.$inferSelect.status,
): RequirementStatus {
  return status === 'action_due' ||
    status === 'information_required' ||
    status === 'rejected'
    ? 'overdue'
    : status
}

function coverageStatus(openPositions: number): 'covered' | 'open' {
  return openPositions === 0 ? 'covered' : 'open'
}

class DrizzlePreviewRepository<TQueryResult extends PgQueryResultHKT>
  implements PreviewRepository
{
  private readonly workerJourney: WorkerJourneyRepository<TQueryResult>
  private readonly operations: OperationsRepository<TQueryResult>

  public constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {
    this.workerJourney = new WorkerJourneyRepository(this.db)
    this.operations = new OperationsRepository(this.db)
  }

  public getManagerAssignmentRequests(
    query: Parameters<PreviewRepository['getManagerAssignmentRequests']>[0],
  ) {
    return this.operations.getManagerAssignmentRequests(query)
  }

  public decideManagerAssignment(
    command: Parameters<PreviewRepository['decideManagerAssignment']>[0],
  ) {
    return this.operations.decideManagerAssignment(command)
  }

  public getManagerShifts(
    query: Parameters<PreviewRepository['getManagerShifts']>[0],
  ) {
    return this.operations.getManagerShifts(query)
  }

  public getManagerShiftDetail(
    query: Parameters<PreviewRepository['getManagerShiftDetail']>[0],
  ) {
    return this.operations.getManagerShiftDetail(query)
  }

  public createManagerShift(
    command: Parameters<PreviewRepository['createManagerShift']>[0],
  ) {
    return this.operations.createManagerShift(command)
  }

  public updateManagerShift(
    command: Parameters<PreviewRepository['updateManagerShift']>[0],
  ) {
    return this.operations.updateManagerShift(command)
  }

  public publishManagerShift(
    command: Parameters<PreviewRepository['publishManagerShift']>[0],
  ) {
    return this.operations.publishManagerShift(command)
  }

  public cancelManagerShift(
    command: Parameters<PreviewRepository['cancelManagerShift']>[0],
  ) {
    return this.operations.cancelManagerShift(command)
  }

  public getAdministratorComplianceRecords(
    query: Parameters<PreviewRepository['getAdministratorComplianceRecords']>[0],
  ) {
    return this.operations.getAdministratorComplianceRecords(query)
  }

  public getAdministratorComplianceRecord(
    query: Parameters<PreviewRepository['getAdministratorComplianceRecord']>[0],
  ) {
    return this.operations.getAdministratorComplianceRecord(query)
  }

  public decideAdministratorCompliance(
    command: Parameters<PreviewRepository['decideAdministratorCompliance']>[0],
  ) {
    return this.operations.decideAdministratorCompliance(command)
  }

  public getWorkerTimesheets(
    query: Parameters<PreviewRepository['getWorkerTimesheets']>[0],
  ) {
    return this.operations.getWorkerTimesheets(query)
  }

  public getWorkerTimesheetDetail(
    query: Parameters<PreviewRepository['getWorkerTimesheetDetail']>[0],
  ) {
    return this.operations.getWorkerTimesheetDetail(query)
  }

  public createWorkerTimesheet(
    command: Parameters<PreviewRepository['createWorkerTimesheet']>[0],
  ) {
    return this.operations.createWorkerTimesheet(command)
  }

  public updateWorkerTimesheet(
    command: Parameters<PreviewRepository['updateWorkerTimesheet']>[0],
  ) {
    return this.operations.updateWorkerTimesheet(command)
  }

  public submitWorkerTimesheet(
    command: Parameters<PreviewRepository['submitWorkerTimesheet']>[0],
  ) {
    return this.operations.submitWorkerTimesheet(command)
  }

  public getManagerTimesheets(
    query: Parameters<PreviewRepository['getManagerTimesheets']>[0],
  ) {
    return this.operations.getManagerTimesheets(query)
  }

  public decideManagerTimesheet(
    command: Parameters<PreviewRepository['decideManagerTimesheet']>[0],
  ) {
    return this.operations.decideManagerTimesheet(command)
  }

  public getAdministratorTimesheets(
    query: Parameters<PreviewRepository['getAdministratorTimesheets']>[0],
  ) {
    return this.operations.getAdministratorTimesheets(query)
  }

  public getWorkerShifts(
    query: Parameters<PreviewRepository['getWorkerShifts']>[0],
  ) {
    return this.workerJourney.getWorkerShifts(query)
  }

  public getWorkerShiftDetail(
    query: Parameters<PreviewRepository['getWorkerShiftDetail']>[0],
  ) {
    return this.workerJourney.getWorkerShiftDetail(query)
  }

  public getWorkerSchedule(
    query: Parameters<PreviewRepository['getWorkerSchedule']>[0],
  ) {
    return this.workerJourney.getWorkerSchedule(query)
  }

  public requestWorkerShift(
    command: Parameters<PreviewRepository['requestWorkerShift']>[0],
  ) {
    return this.workerJourney.requestWorkerShift(command)
  }

  public cancelWorkerAssignment(
    command: Parameters<PreviewRepository['cancelWorkerAssignment']>[0],
  ) {
    return this.workerJourney.cancelWorkerAssignment(command)
  }

  public async getWorkerOverview(workerId: string) {
    return this.db.transaction(async (transaction) => {
      const workerRows = await transaction
        .select({
          familyName: schema.workforceMembers.familyName,
          givenName: schema.workforceMembers.givenName,
          id: schema.workforceMembers.id,
          profileId: schema.workerProfiles.id,
          readinessStatus: schema.workerProfiles.overallReadinessStatus,
          roleTitle: schema.workforceMembers.roleTitle,
        })
        .from(schema.workforceMembers)
        .innerJoin(
          schema.workerProfiles,
          eq(
            schema.workerProfiles.workforceMemberId,
            schema.workforceMembers.id,
          ),
        )
        .where(
          and(
            eq(schema.workforceMembers.id, workerId),
            eq(schema.workforceMembers.memberType, 'worker'),
            eq(schema.workforceMembers.status, 'active'),
          ),
        )
        .limit(1)
      const worker = workerRows[0]
      if (worker === undefined) return null

      const readinessRows = await transaction
        .select({
          current: sql<number>`count(*) filter (where ${schema.complianceRecords.status} = 'current')::int`.mapWith(Number),
          total: sql<number>`count(*)::int`.mapWith(Number),
        })
        .from(schema.complianceRecords)
        .where(eq(schema.complianceRecords.workerProfileId, worker.profileId))
      const readiness = readinessRows[0] ?? { current: 0, total: 0 }

      const shiftRows = await transaction
        .select({
          areaName: schema.shifts.areaName,
          arrivalNote: schema.shifts.arrivalNote,
          assignmentStatus: schema.shiftAssignments.status,
          endsAt: schema.shifts.endsAt,
          id: schema.shifts.id,
          locationId: schema.locations.id,
          locationName: schema.locations.name,
          organisationId: schema.organisations.id,
          organisationName: schema.organisations.name,
          roleTitle: schema.shifts.roleTitle,
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
        .innerJoin(
          schema.organisations,
          eq(schema.shifts.organisationId, schema.organisations.id),
        )
        .where(
          and(
            eq(schema.shiftAssignments.workerProfileId, worker.profileId),
            inArray(schema.shiftAssignments.status, ['confirmed', 'review']),
            gt(schema.shifts.startsAt, syntheticCoverageWindow.startsAt),
          ),
        )
        .orderBy(asc(schema.shifts.startsAt), asc(schema.shifts.id))

      const activityRows = await transaction
        .select({
          description: schema.activityEvents.detail,
          id: schema.activityEvents.id,
          occurredAt: schema.activityEvents.occurredAt,
          title: schema.activityEvents.title,
        })
        .from(schema.activityEvents)
        .where(eq(schema.activityEvents.subjectMemberId, worker.id))
        .orderBy(
          desc(schema.activityEvents.occurredAt),
          desc(schema.activityEvents.id),
        )
        .limit(5)

      return {
        asOfDate: syntheticPreviewAsOfDate,
        readiness: {
          currentRequirements: readiness.current,
          status: worker.readinessStatus,
          totalRequirements: readiness.total,
        },
        recentActivity: activityRows.map((activity) => ({
          ...activity,
          occurredAt: isoDateTime(activity.occurredAt),
        })),
        upcomingShifts: shiftRows.map((shift) => ({
          arrivalNote: shift.arrivalNote,
          endsAt: isoDateTime(shift.endsAt),
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
          status:
            shift.assignmentStatus === 'confirmed'
              ? ('confirmed' as const)
              : ('needs_review' as const),
        })),
        worker: {
          displayName: displayName(worker.givenName, worker.familyName),
          id: worker.id,
          roleTitle: worker.roleTitle,
        },
      }
    })
  }

  public async getWorkerReadiness(workerId: string) {
    return this.db.transaction(async (transaction) => {
      const workerRows = await transaction
        .select({
          familyName: schema.workforceMembers.familyName,
          givenName: schema.workforceMembers.givenName,
          id: schema.workforceMembers.id,
          profileId: schema.workerProfiles.id,
          readinessStatus: schema.workerProfiles.overallReadinessStatus,
          roleTitle: schema.workforceMembers.roleTitle,
        })
        .from(schema.workforceMembers)
        .innerJoin(
          schema.workerProfiles,
          eq(
            schema.workerProfiles.workforceMemberId,
            schema.workforceMembers.id,
          ),
        )
        .where(
          and(
            eq(schema.workforceMembers.id, workerId),
            eq(schema.workforceMembers.memberType, 'worker'),
            eq(schema.workforceMembers.status, 'active'),
          ),
        )
        .limit(1)
      const worker = workerRows[0]
      if (worker === undefined) return null

      const records = await transaction
        .select({
          detail: schema.complianceRecords.detail,
          dueDate: schema.complianceRecords.dueOn,
          id: schema.complianceRequirements.id,
          name: schema.complianceRequirements.name,
          reviewedOn: schema.complianceRecords.reviewedOn,
          status: schema.complianceRecords.status,
        })
        .from(schema.complianceRecords)
        .innerJoin(
          schema.complianceRequirements,
          eq(
            schema.complianceRecords.requirementId,
            schema.complianceRequirements.id,
          ),
        )
        .where(eq(schema.complianceRecords.workerProfileId, worker.profileId))
        .orderBy(
          asc(schema.complianceRequirements.sortOrder),
          asc(schema.complianceRequirements.id),
        )

      const dueDates = records
        .map((record) => record.dueDate)
        .filter((value): value is string => value !== null)

      return {
        asOfDate: syntheticPreviewAsOfDate,
        currentRequirements: records.filter(
          (record) => record.status === 'current',
        ).length,
        nextReviewDate: dueDates.sort()[0] ?? null,
        requirements: records.map((record) => ({
          dueDate: record.dueDate,
          id: record.id,
          name: record.name,
          reviewedAt:
            record.reviewedOn === null
              ? null
              : `${record.reviewedOn}T00:00:00.000Z`,
          status: requirementStatus(record.status),
          summary: record.detail,
        })),
        status: worker.readinessStatus,
        totalRequirements: records.length,
        worker: {
          displayName: displayName(worker.givenName, worker.familyName),
          id: worker.id,
          roleTitle: worker.roleTitle,
        },
      }
    })
  }

  public async getManagerOperations(managerId: string) {
    return this.db.transaction(async (transaction) => {
      const managerRows = await transaction
        .select({
          familyName: schema.workforceMembers.familyName,
          givenName: schema.workforceMembers.givenName,
          homeAreaName: schema.workforceMembers.homeAreaName,
          id: schema.workforceMembers.id,
          organisationId: schema.organisations.id,
          organisationName: schema.organisations.name,
          roleTitle: schema.workforceMembers.roleTitle,
        })
        .from(schema.workforceMembers)
        .innerJoin(
          schema.organisations,
          eq(
            schema.workforceMembers.organisationId,
            schema.organisations.id,
          ),
        )
        .where(
          and(
            eq(schema.workforceMembers.id, managerId),
            eq(schema.workforceMembers.memberType, 'manager'),
            eq(schema.workforceMembers.status, 'active'),
          ),
        )
        .limit(1)
      const manager = managerRows[0]
      if (manager === undefined) return null

      const coverageRows = await transaction
        .select({
          areaName: schema.shifts.areaName,
          confirmedWorkers: sql<number>`count(*) filter (where ${schema.shiftAssignments.status} = 'confirmed')::int`.mapWith(Number),
          endsAt: schema.shifts.endsAt,
          locationId: schema.locations.id,
          locationName: schema.locations.name,
          requiredWorkers: schema.shifts.requiredWorkers,
          shiftId: schema.shifts.id,
          startsAt: schema.shifts.startsAt,
          timezone: schema.locations.timezone,
        })
        .from(schema.shifts)
        .innerJoin(
          schema.locations,
          eq(schema.shifts.locationId, schema.locations.id),
        )
        .leftJoin(
          schema.shiftAssignments,
          eq(schema.shiftAssignments.shiftId, schema.shifts.id),
        )
        .where(
          and(
            eq(schema.shifts.organisationId, manager.organisationId),
            gt(schema.shifts.startsAt, syntheticCoverageWindow.startsAt),
            lt(schema.shifts.startsAt, syntheticCoverageWindow.endsAt),
            inArray(schema.shifts.status, ['open', 'covered']),
          ),
        )
        .groupBy(schema.shifts.id, schema.locations.id)
        .orderBy(asc(schema.shifts.startsAt), asc(schema.shifts.id))

      const coverage: CoverageItem[] = coverageRows.map((shift) => {
        const openPositions = Math.max(
          shift.requiredWorkers - shift.confirmedWorkers,
          0,
        )
        return {
          confirmedWorkers: shift.confirmedWorkers,
          endsAt: isoDateTime(shift.endsAt),
          location: {
            area: shift.areaName,
            id: shift.locationId,
            name: shift.locationName,
            timezone: shift.timezone,
          },
          openPositions,
          requiredWorkers: shift.requiredWorkers,
          shiftId: shift.shiftId,
          startsAt: isoDateTime(shift.startsAt),
          status: coverageStatus(openPositions),
        }
      })

      const assignmentRows = await transaction
        .select({
          confirmedWorkers: sql<number>`count(distinct ${schema.shiftAssignments.workerProfileId}) filter (where ${schema.shiftAssignments.status} = 'confirmed')::int`.mapWith(Number),
          pendingArrivalChecks: sql<number>`count(*) filter (where ${schema.shiftAssignments.status} = 'review')::int`.mapWith(Number),
        })
        .from(schema.shiftAssignments)
        .innerJoin(
          schema.shifts,
          eq(schema.shiftAssignments.shiftId, schema.shifts.id),
        )
        .where(
          and(
            eq(schema.shifts.organisationId, manager.organisationId),
            gt(schema.shifts.startsAt, syntheticCoverageWindow.startsAt),
            lt(schema.shifts.startsAt, syntheticCoverageWindow.endsAt),
          ),
        )

      const actionRows = await transaction
        .select({
          actionsDue: sql<number>`count(*)::int`.mapWith(Number),
        })
        .from(schema.workerProfiles)
        .innerJoin(
          schema.workforceMembers,
          eq(
            schema.workerProfiles.workforceMemberId,
            schema.workforceMembers.id,
          ),
        )
        .where(
          and(
            eq(
              schema.workforceMembers.organisationId,
              manager.organisationId,
            ),
            eq(schema.workerProfiles.overallReadinessStatus, 'action_due'),
          ),
        )

      const alertRows = await transaction
        .select({
          description: schema.notifications.detail,
          id: schema.notifications.id,
          title: schema.notifications.title,
        })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.recipientMemberId, manager.id),
            eq(schema.notifications.tone, 'warning'),
          ),
        )
        .orderBy(desc(schema.notifications.occurredAt))
        .limit(5)

      const confirmedAssignments = coverage.reduce(
        (total, item) => total + item.confirmedWorkers,
        0,
      )
      const requiredPositions = coverage.reduce(
        (total, item) => total + item.requiredWorkers,
        0,
      )
      const openPositions = coverage.reduce(
        (total, item) => total + item.openPositions,
        0,
      )
      const assignmentMetrics = assignmentRows[0] ?? {
        confirmedWorkers: 0,
        pendingArrivalChecks: 0,
      }

      return {
        alerts: alertRows,
        asOfDate: syntheticPreviewAsOfDate,
        coverage,
        manager: {
          displayName: displayName(manager.givenName, manager.familyName),
          id: manager.id,
          roleTitle: manager.roleTitle,
        },
        metrics: {
          actionsDue: actionRows[0]?.actionsDue ?? 0,
          affectedAreas: coverage.filter((item) => item.openPositions > 0)
            .length,
          confirmedAssignments,
          confirmedWorkers: assignmentMetrics.confirmedWorkers,
          openPositions,
          pendingArrivalChecks: assignmentMetrics.pendingArrivalChecks,
          requiredPositions,
        },
        organisation: {
          id: manager.organisationId,
          name: manager.organisationName,
        },
        regionName: manager.homeAreaName ?? 'Preview region',
      }
    })
  }

  public async getManagerCoverage(managerId: string) {
    return this.db.transaction(async (transaction) => {
      const managerRows = await transaction
        .select({
          familyName: schema.workforceMembers.familyName,
          givenName: schema.workforceMembers.givenName,
          id: schema.workforceMembers.id,
          organisationId: schema.workforceMembers.organisationId,
          roleTitle: schema.workforceMembers.roleTitle,
        })
        .from(schema.workforceMembers)
        .where(
          and(
            eq(schema.workforceMembers.id, managerId),
            eq(schema.workforceMembers.memberType, 'manager'),
            eq(schema.workforceMembers.status, 'active'),
          ),
        )
        .limit(1)
      const manager = managerRows[0]
      if (manager === undefined) return null

      const rows = await transaction
        .select({
          areaName: schema.shifts.areaName,
          confirmedWorkers: sql<number>`count(*) filter (where ${schema.shiftAssignments.status} = 'confirmed')::int`.mapWith(Number),
          endsAt: schema.shifts.endsAt,
          locationId: schema.locations.id,
          locationName: schema.locations.name,
          requiredWorkers: schema.shifts.requiredWorkers,
          shiftId: schema.shifts.id,
          startsAt: schema.shifts.startsAt,
          timezone: schema.locations.timezone,
        })
        .from(schema.shifts)
        .innerJoin(
          schema.locations,
          eq(schema.shifts.locationId, schema.locations.id),
        )
        .leftJoin(
          schema.shiftAssignments,
          eq(schema.shiftAssignments.shiftId, schema.shifts.id),
        )
        .where(
          and(
            eq(schema.shifts.organisationId, manager.organisationId),
            gt(schema.shifts.startsAt, syntheticCoverageWindow.startsAt),
            lt(schema.shifts.startsAt, syntheticCoverageWindow.endsAt),
            inArray(schema.shifts.status, ['open', 'covered']),
          ),
        )
        .groupBy(schema.shifts.id, schema.locations.id)
        .orderBy(asc(schema.shifts.startsAt), asc(schema.shifts.id))

      return {
        asOfDate: syntheticPreviewAsOfDate,
        items: rows.map((shift) => {
          const openPositions = Math.max(
            shift.requiredWorkers - shift.confirmedWorkers,
            0,
          )
          return {
            confirmedWorkers: shift.confirmedWorkers,
            endsAt: isoDateTime(shift.endsAt),
            location: {
              area: shift.areaName,
              id: shift.locationId,
              name: shift.locationName,
              timezone: shift.timezone,
            },
            openPositions,
            requiredWorkers: shift.requiredWorkers,
            shiftId: shift.shiftId,
            startsAt: isoDateTime(shift.startsAt),
            status: coverageStatus(openPositions),
          }
        }),
        manager: {
          displayName: displayName(manager.givenName, manager.familyName),
          id: manager.id,
          roleTitle: manager.roleTitle,
        },
        window: syntheticCoverageWindow,
      }
    })
  }

  public async getAdministratorCompliance(
    query: AdministratorComplianceLookup,
  ) {
    return this.db.transaction(async (transaction) => {
      const administratorRows = await transaction
        .select({
          familyName: schema.workforceMembers.familyName,
          givenName: schema.workforceMembers.givenName,
          id: schema.workforceMembers.id,
          organisationId: schema.workforceMembers.organisationId,
          roleTitle: schema.workforceMembers.roleTitle,
        })
        .from(schema.workforceMembers)
        .where(
          and(
            eq(schema.workforceMembers.id, query.administratorId),
            eq(schema.workforceMembers.memberType, 'administrator'),
            eq(schema.workforceMembers.status, 'active'),
          ),
        )
        .limit(1)
      const administrator = administratorRows[0]
      if (administrator === undefined) return null

      const summaryRows = await transaction
        .select({
          actionDue: sql<number>`count(*) filter (where ${schema.workerProfiles.overallReadinessStatus} = 'action_due')::int`.mapWith(Number),
          ready: sql<number>`count(*) filter (where ${schema.workerProfiles.overallReadinessStatus} = 'ready')::int`.mapWith(Number),
          reviewing: sql<number>`count(*) filter (where ${schema.workerProfiles.overallReadinessStatus} = 'reviewing')::int`.mapWith(Number),
          total: sql<number>`count(*)::int`.mapWith(Number),
        })
        .from(schema.workerProfiles)
        .innerJoin(
          schema.workforceMembers,
          eq(
            schema.workerProfiles.workforceMemberId,
            schema.workforceMembers.id,
          ),
        )
        .where(
          and(
            eq(
              schema.workforceMembers.organisationId,
              administrator.organisationId,
            ),
            eq(schema.workforceMembers.memberType, 'worker'),
            eq(schema.workforceMembers.status, 'active'),
          ),
        )

      const cursor =
        query.cursor === undefined
          ? undefined
          : decodeComplianceCursor(query.cursor)
      const cursorPredicate =
        cursor === undefined
          ? undefined
          : or(
              gt(schema.workforceMembers.previewReference, cursor.previewId),
              and(
                eq(
                  schema.workforceMembers.previewReference,
                  cursor.previewId,
                ),
                gt(schema.workforceMembers.id, cursor.id),
              ),
            )

      const rows = await transaction
        .select({
          displayFamilyName: schema.workforceMembers.familyName,
          displayGivenName: schema.workforceMembers.givenName,
          nextReviewDate: sql<string | null>`min(${schema.complianceRecords.dueOn})`,
          previewId: schema.workforceMembers.previewReference,
          readinessStatus: schema.workerProfiles.overallReadinessStatus,
          roleTitle: schema.workforceMembers.roleTitle,
          workerId: schema.workforceMembers.id,
        })
        .from(schema.workforceMembers)
        .innerJoin(
          schema.workerProfiles,
          eq(
            schema.workerProfiles.workforceMemberId,
            schema.workforceMembers.id,
          ),
        )
        .leftJoin(
          schema.complianceRecords,
          eq(
            schema.complianceRecords.workerProfileId,
            schema.workerProfiles.id,
          ),
        )
        .where(
          and(
            eq(
              schema.workforceMembers.organisationId,
              administrator.organisationId,
            ),
            eq(schema.workforceMembers.memberType, 'worker'),
            eq(schema.workforceMembers.status, 'active'),
            query.status === undefined
              ? undefined
              : eq(
                  schema.workerProfiles.overallReadinessStatus,
                  query.status,
                ),
            cursorPredicate,
          ),
        )
        .groupBy(schema.workforceMembers.id, schema.workerProfiles.id)
        .orderBy(
          asc(schema.workforceMembers.previewReference),
          asc(schema.workforceMembers.id),
        )
        .limit(query.limit + 1)

      const hasMore = rows.length > query.limit
      const page = rows.slice(0, query.limit)
      const last = page.at(-1)
      const summary = summaryRows[0] ?? {
        actionDue: 0,
        ready: 0,
        reviewing: 0,
        total: 0,
      }

      return {
        administrator: {
          displayName: displayName(
            administrator.givenName,
            administrator.familyName,
          ),
          id: administrator.id,
          roleTitle: administrator.roleTitle,
        },
        items: page.map((item) => ({
          displayName: displayName(
            item.displayGivenName,
            item.displayFamilyName,
          ),
          nextReviewDate: item.nextReviewDate,
          previewId: item.previewId,
          readinessStatus: item.readinessStatus,
          roleTitle: item.roleTitle,
          workerId: item.workerId,
        })),
        nextCursor:
          hasMore && last !== undefined
            ? encodeComplianceCursor(last.previewId, last.workerId)
            : null,
        summary,
      }
    })
  }

  public async getAdministratorRecords(query: AdministratorRecordsLookup) {
    return this.db.transaction(async (transaction) => {
      const administratorRows = await transaction
        .select({
          familyName: schema.workforceMembers.familyName,
          givenName: schema.workforceMembers.givenName,
          id: schema.workforceMembers.id,
          organisationId: schema.workforceMembers.organisationId,
          roleTitle: schema.workforceMembers.roleTitle,
        })
        .from(schema.workforceMembers)
        .where(
          and(
            eq(schema.workforceMembers.id, query.administratorId),
            eq(schema.workforceMembers.memberType, 'administrator'),
            eq(schema.workforceMembers.status, 'active'),
          ),
        )
        .limit(1)
      const administrator = administratorRows[0]
      if (administrator === undefined) return null

      const cursor =
        query.cursor === undefined ? undefined : decodeRecordsCursor(query.cursor)
      const cursorPredicate =
        cursor === undefined
          ? undefined
          : or(
              gt(schema.workforceMembers.previewReference, cursor.previewId),
              and(
                eq(
                  schema.workforceMembers.previewReference,
                  cursor.previewId,
                ),
                gt(schema.workforceMembers.id, cursor.id),
              ),
            )

      const rows = await transaction
        .select({
          area: schema.workforceMembers.homeAreaName,
          familyName: schema.workforceMembers.familyName,
          givenName: schema.workforceMembers.givenName,
          locationId: schema.locations.id,
          locationName: schema.locations.name,
          previewId: schema.workforceMembers.previewReference,
          profileId: schema.workerProfiles.id,
          readinessStatus: schema.workerProfiles.overallReadinessStatus,
          roleTitle: schema.workforceMembers.roleTitle,
          timezone: schema.locations.timezone,
          workerId: schema.workforceMembers.id,
        })
        .from(schema.workforceMembers)
        .innerJoin(
          schema.workerProfiles,
          eq(
            schema.workerProfiles.workforceMemberId,
            schema.workforceMembers.id,
          ),
        )
        .leftJoin(
          schema.locations,
          eq(schema.workforceMembers.homeLocationId, schema.locations.id),
        )
        .where(
          and(
            eq(
              schema.workforceMembers.organisationId,
              administrator.organisationId,
            ),
            eq(schema.workforceMembers.memberType, 'worker'),
            eq(schema.workforceMembers.status, 'active'),
            cursorPredicate,
          ),
        )
        .orderBy(
          asc(schema.workforceMembers.previewReference),
          asc(schema.workforceMembers.id),
        )
        .limit(query.limit + 1)

      const hasMore = rows.length > query.limit
      const page = rows.slice(0, query.limit)
      const profileIds = page.map((item) => item.profileId)
      const workerIds = page.map((item) => item.workerId)
      const requirementRows =
        profileIds.length === 0
          ? []
          : await transaction
              .select({
                attention: sql<number>`count(*) filter (where ${schema.complianceRecords.status} <> 'current')::int`.mapWith(Number),
                current: sql<number>`count(*) filter (where ${schema.complianceRecords.status} = 'current')::int`.mapWith(Number),
                profileId: schema.complianceRecords.workerProfileId,
                total: sql<number>`count(*)::int`.mapWith(Number),
              })
              .from(schema.complianceRecords)
              .where(
                inArray(schema.complianceRecords.workerProfileId, profileIds),
              )
              .groupBy(schema.complianceRecords.workerProfileId)
      const activityRows =
        workerIds.length === 0
          ? []
          : await transaction
              .select({
                lastActivityAt: sql<string | null>`max(${schema.activityEvents.occurredAt})`,
                workerId: schema.activityEvents.subjectMemberId,
              })
              .from(schema.activityEvents)
              .where(inArray(schema.activityEvents.subjectMemberId, workerIds))
              .groupBy(schema.activityEvents.subjectMemberId)
      const requirementsByProfile = new Map(
        requirementRows.map((item) => [item.profileId, item]),
      )
      const activityByWorker = new Map(
        activityRows.map((item) => [item.workerId, item.lastActivityAt]),
      )
      const last = page.at(-1)

      return {
        administrator: {
          displayName: displayName(
            administrator.givenName,
            administrator.familyName,
          ),
          id: administrator.id,
          roleTitle: administrator.roleTitle,
        },
        items: page.map((item) => {
          const requirement = requirementsByProfile.get(item.profileId) ?? {
            attention: 0,
            current: 0,
            total: 0,
          }
          const lastActivityAt = activityByWorker.get(item.workerId) ?? null
          return {
            displayName: displayName(item.givenName, item.familyName),
            lastActivityAt:
              lastActivityAt === null ? null : isoDateTime(lastActivityAt),
            previewId: item.previewId,
            primaryLocation:
              item.locationId === null ||
              item.locationName === null ||
              item.timezone === null
                ? null
                : {
                    area: item.area ?? 'Preview area',
                    id: item.locationId,
                    name: item.locationName,
                    timezone: item.timezone,
                  },
            readinessStatus: item.readinessStatus,
            requirements: {
              attention: requirement.attention,
              current: requirement.current,
              total: requirement.total,
            },
            roleTitle: item.roleTitle,
            workerId: item.workerId,
          }
        }),
        nextCursor:
          hasMore && last !== undefined
            ? encodeRecordsCursor(last.previewId, last.workerId)
            : null,
      }
    })
  }

  public async getNotifications(query: {
    readonly cursor?: string
    readonly limit: number
    readonly recipientId: string
    readonly unread?: boolean
  }) {
    return this.db.transaction(async (transaction) => {
      const recipientRows = await transaction
        .select({ id: schema.workforceMembers.id })
        .from(schema.workforceMembers)
        .where(
          and(
            eq(schema.workforceMembers.id, query.recipientId),
            eq(schema.workforceMembers.status, 'active'),
          ),
        )
        .limit(1)
      if (recipientRows[0] === undefined) return null

      const cursor =
        query.cursor === undefined
          ? undefined
          : decodeNotificationsCursor(query.cursor)
      const cursorPredicate =
        cursor === undefined
          ? undefined
          : or(
              lt(schema.notifications.occurredAt, cursor.createdAt),
              and(
                eq(schema.notifications.occurredAt, cursor.createdAt),
                lt(schema.notifications.id, cursor.id),
              ),
            )
      const unreadPredicate =
        query.unread === true
          ? sql`${schema.notifications.readAt} is null`
          : query.unread === false
            ? sql`${schema.notifications.readAt} is not null`
            : undefined

      const unreadRows = await transaction
        .select({
          count: sql<number>`count(*) filter (where ${schema.notifications.readAt} is null)::int`.mapWith(Number),
        })
        .from(schema.notifications)
        .where(eq(schema.notifications.recipientMemberId, query.recipientId))

      const rows = await transaction
        .select({
          createdAt: schema.notifications.occurredAt,
          detail: schema.notifications.detail,
          id: schema.notifications.id,
          readAt: schema.notifications.readAt,
          recipientId: schema.notifications.recipientMemberId,
          title: schema.notifications.title,
          tone: schema.notifications.tone,
        })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.recipientMemberId, query.recipientId),
            unreadPredicate,
            cursorPredicate,
          ),
        )
        .orderBy(
          desc(schema.notifications.occurredAt),
          desc(schema.notifications.id),
        )
        .limit(query.limit + 1)

      const hasMore = rows.length > query.limit
      const page = rows.slice(0, query.limit)
      const last = page.at(-1)
      return {
        items: page.map((notification) => ({
          ...notification,
          createdAt: isoDateTime(notification.createdAt),
          readAt:
            notification.readAt === null
              ? null
              : isoDateTime(notification.readAt),
        })),
        nextCursor:
          hasMore && last !== undefined
            ? encodeNotificationsCursor(
                isoDateTime(last.createdAt),
                last.id,
              )
            : null,
        unreadCount: unreadRows[0]?.count ?? 0,
      }
    })
  }
}

export function createDrizzlePreviewRepository(
  connection: DatabaseConnection,
): PreviewRepository {
  if (connection.mode === 'pglite') {
    return new DrizzlePreviewRepository(connection.db)
  }
  return new DrizzlePreviewRepository(connection.db)
}

export type { PaginatedRepositoryResult, ReadinessStatus }

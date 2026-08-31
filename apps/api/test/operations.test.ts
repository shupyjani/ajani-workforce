import {
  administratorComplianceDecisionResponseSchema,
  administratorComplianceRecordResponseSchema,
  administratorComplianceRecordsResponseSchema,
  administratorTimesheetsResponseSchema,
  operationsRoutes,
  errorResponseSchema,
  managerAssignmentDecisionResponseSchema,
  managerAssignmentRequestsResponseSchema,
  managerShiftDetailResponseSchema,
  managerShiftMutationResponseSchema,
  managerShiftsResponseSchema,
  managerTimesheetsResponseSchema,
  previewPersonaIds,
  requestIdHeaderName,
  workerTimesheetDetailResponseSchema,
  workerTimesheetMutationResponseSchema,
  workerTimesheetsResponseSchema,
} from '@ajani/contracts'
import {
  createDrizzlePreviewRepository,
  createInMemoryDatabase,
  migrateDatabase,
  previewIdentifiers,
  seedSyntheticPreview,
  type PgliteDatabaseConnection,
} from '@ajani/database'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApplication } from '../src/app.js'

const generatedAt = '2026-08-28T12:00:00.000Z'
const requestId = 'f5000000-0000-4000-8000-000000000001'
const unknownId = 'f5000000-0000-4000-8000-000000000099'
const assignmentUnderReview = '80000000-0000-4000-8000-000000000015'
const complianceUnderReview = 'd0000000-0000-4000-8000-000000000012'
const eligibleAssignment = previewIdentifiers.assignments.leilaPastLate

function mutationKey(sequence: number): string {
  return `f5000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
}

let application: FastifyInstance
let connection: PgliteDatabaseConnection

beforeAll(async () => {
  connection = await createInMemoryDatabase()
  await migrateDatabase(connection)
  await seedSyntheticPreview(connection)
  application = buildApplication({
    clock: () => new Date(generatedAt),
    logger: false,
    previewRepository: createDrizzlePreviewRepository(connection),
  })
})

afterAll(async () => {
  await application.close()
  await connection.close()
})

describe('Operations preview API', () => {
  it('returns contract-valid paginated and detail resources with request IDs', async () => {
    const cases = [
      [`${operationsRoutes.managerAssignmentRequests(previewPersonaIds.manager)}?limit=20`, managerAssignmentRequestsResponseSchema],
      [`${operationsRoutes.managerShifts(previewPersonaIds.manager)}?limit=20`, managerShiftsResponseSchema],
      [operationsRoutes.managerShiftDetail(previewPersonaIds.manager, previewIdentifiers.shifts.managerDraft), managerShiftDetailResponseSchema],
      [`${operationsRoutes.administratorComplianceRecords(previewPersonaIds.administrator)}?limit=20`, administratorComplianceRecordsResponseSchema],
      [operationsRoutes.administratorComplianceRecord(previewPersonaIds.administrator, complianceUnderReview), administratorComplianceRecordResponseSchema],
      [`${operationsRoutes.workerTimesheets(previewPersonaIds.worker)}?limit=20`, workerTimesheetsResponseSchema],
      [operationsRoutes.workerTimesheetDetail(previewPersonaIds.worker, previewIdentifiers.timesheets.leilaRejected), workerTimesheetDetailResponseSchema],
      [`${operationsRoutes.managerTimesheets(previewPersonaIds.manager)}?limit=20`, managerTimesheetsResponseSchema],
      [`${operationsRoutes.administratorTimesheets(previewPersonaIds.administrator)}?limit=20`, administratorTimesheetsResponseSchema],
    ] as const

    for (const [url, schema] of cases) {
      const response = await application.inject({
        headers: { [requestIdHeaderName]: requestId },
        method: 'GET',
        url,
      })
      expect(response.statusCode, url).toBe(200)
      expect(response.headers[requestIdHeaderName]).toBe(requestId)
      expect(schema.parse(response.json()).meta).toMatchObject({
        generatedAt,
        requestId,
        source: 'synthetic-preview',
      })
    }
  })

  it('rejects invalid identifiers, filters, cursors, versions and mutation keys', async () => {
    const invalidGets = [
      operationsRoutes.managerAssignmentRequests('invalid'),
      `${operationsRoutes.managerShifts(previewPersonaIds.manager)}?status=unknown`,
      `${operationsRoutes.administratorComplianceRecords(previewPersonaIds.administrator)}?cursor=not-opaque`,
      operationsRoutes.administratorComplianceRecord(previewPersonaIds.administrator, 'invalid'),
      `${operationsRoutes.workerTimesheets(previewPersonaIds.worker)}?limit=0`,
      `${operationsRoutes.managerTimesheets(previewPersonaIds.manager)}?status=unknown`,
      operationsRoutes.administratorTimesheets('invalid'),
    ]
    for (const url of invalidGets) {
      const response = await application.inject({ method: 'GET', url })
      expect(response.statusCode, url).toBe(400)
      expect(errorResponseSchema.parse(response.json()).error.code).toBe('INVALID_REQUEST')
    }

    const missingKey = await application.inject({
      method: 'POST',
      payload: { decision: 'approve', expectedVersion: 1 },
      url: operationsRoutes.managerAssignmentDecision(previewPersonaIds.manager, assignmentUnderReview),
    })
    expect(missingKey.statusCode).toBe(400)

    const invalidVersion = await application.inject({
      headers: { 'idempotency-key': mutationKey(50) },
      method: 'POST',
      payload: { decision: 'approve', expectedVersion: 0 },
      url: operationsRoutes.managerAssignmentDecision(previewPersonaIds.manager, assignmentUnderReview),
    })
    expect(invalidVersion.statusCode).toBe(400)
    expect(errorResponseSchema.parse(invalidVersion.json()).error.details).toBeDefined()
  })

  it('returns 404 for unknown personas and records without leaking persistence details', async () => {
    const urls = [
      operationsRoutes.managerShifts(unknownId),
      operationsRoutes.administratorComplianceRecord(previewPersonaIds.administrator, unknownId),
      operationsRoutes.workerTimesheetDetail(previewPersonaIds.worker, unknownId),
    ]
    for (const url of urls) {
      const response = await application.inject({ method: 'GET', url })
      expect(response.statusCode, url).toBe(404)
      expect(errorResponseSchema.parse(response.json()).error.code).toBe('NOT_FOUND')
      expect(response.body).not.toContain('select')
    }
  })

  it('approves and declines assignments with replay safety and stale conflict handling', async () => {
    const url = operationsRoutes.managerAssignmentDecision(previewPersonaIds.manager, assignmentUnderReview)
    const key = mutationKey(1)
    const request = {
      headers: { 'idempotency-key': key, [requestIdHeaderName]: requestId },
      method: 'POST' as const,
      payload: { decision: 'approve', expectedVersion: 1 },
      url,
    }
    const approved = await application.inject(request)
    expect(approved.statusCode).toBe(200)
    expect(managerAssignmentDecisionResponseSchema.parse(approved.json()).data).toMatchObject({ idempotentReplay: false, status: 'confirmed', version: 2 })

    const replay = await application.inject(request)
    expect(managerAssignmentDecisionResponseSchema.parse(replay.json()).data.idempotentReplay).toBe(true)

    const contradiction = await application.inject({ ...request, payload: { decision: 'decline', expectedVersion: 1, reason: 'The synthetic request is no longer required.' } })
    expect(contradiction.statusCode).toBe(409)
    expect(errorResponseSchema.parse(contradiction.json()).error.code).toBe('IDEMPOTENCY_CONFLICT')

    const stale = await application.inject({ ...request, headers: { 'idempotency-key': mutationKey(2) } })
    expect(stale.statusCode).toBe(409)
    expect(errorResponseSchema.parse(stale.json()).error.code).toBe('VERSION_CONFLICT')

    const declined = await application.inject({
      headers: { 'idempotency-key': mutationKey(15) },
      method: 'POST',
      payload: {
        decision: 'decline',
        expectedVersion: 1,
        reason: 'The fictional coverage request needs a different window.',
      },
      url: operationsRoutes.managerAssignmentDecision(
        previewPersonaIds.manager,
        '80000000-0000-4000-8000-000000000013',
      ),
    })
    expect(managerAssignmentDecisionResponseSchema.parse(declined.json()).data).toMatchObject({
      reason: 'The fictional coverage request needs a different window.',
      status: 'declined',
    })
  })

  it('creates, edits, publishes and transactionally cancels a future shift', async () => {
    const createdResponse = await application.inject({
      headers: { 'idempotency-key': mutationKey(3) },
      method: 'POST',
      payload: {
        arrivalNote: 'Report to the synthetic reception desk.',
        areaName: 'Willow Room',
        endsAt: '2026-09-06T15:00:00.000Z',
        locationId: previewIdentifiers.locations.willowmere,
        requiredWorkers: 2,
        roleTitle: 'Registered nurse',
        startsAt: '2026-09-06T07:00:00.000Z',
      },
      url: operationsRoutes.managerShifts(previewPersonaIds.manager),
    })
    expect(createdResponse.statusCode).toBe(201)
    const created = managerShiftMutationResponseSchema.parse(createdResponse.json()).data.shift
    expect(created.status).toBe('draft')

    const updatedResponse = await application.inject({
      headers: { 'idempotency-key': mutationKey(4) },
      method: 'PATCH',
      payload: {
        arrivalNote: 'Report to the synthetic main reception desk.',
        areaName: 'Willow Room',
        endsAt: '2026-09-06T16:00:00.000Z',
        expectedVersion: created.version,
        locationId: previewIdentifiers.locations.willowmere,
        requiredWorkers: 3,
        roleTitle: 'Registered nurse',
        startsAt: '2026-09-06T07:00:00.000Z',
      },
      url: operationsRoutes.managerShiftDetail(previewPersonaIds.manager, created.id),
    })
    const updated = managerShiftMutationResponseSchema.parse(updatedResponse.json()).data.shift
    expect(updated.version).toBe(2)

    const publishedResponse = await application.inject({
      headers: { 'idempotency-key': mutationKey(5) },
      method: 'POST',
      payload: { expectedVersion: updated.version },
      url: operationsRoutes.managerShiftPublish(previewPersonaIds.manager, created.id),
    })
    const published = managerShiftMutationResponseSchema.parse(publishedResponse.json()).data.shift
    expect(published.status).toBe('open')

    const cancelledResponse = await application.inject({
      headers: { 'idempotency-key': mutationKey(6) },
      method: 'POST',
      payload: { expectedVersion: published.version, reason: 'The fictional coverage need has changed.' },
      url: operationsRoutes.managerShiftCancel(previewPersonaIds.manager, created.id),
    })
    const cancelled = managerShiftMutationResponseSchema.parse(cancelledResponse.json()).data.shift
    expect(cancelled).toMatchObject({ cancellationReason: 'The fictional coverage need has changed.', status: 'cancelled' })
  })

  it('updates readiness from an Administrator compliance decision', async () => {
    const response = await application.inject({
      headers: { 'idempotency-key': mutationKey(7) },
      method: 'POST',
      payload: { decision: 'approved_current', expectedVersion: 1, note: 'The synthetic evidence review is complete.' },
      url: operationsRoutes.administratorComplianceDecision(previewPersonaIds.administrator, complianceUnderReview),
    })
    expect(response.statusCode).toBe(200)
    const result = administratorComplianceDecisionResponseSchema.parse(response.json()).data
    expect(result).toMatchObject({ workerReadiness: 'ready', record: { status: 'current', version: 2 } })
  })

  it('runs draft, submit, reject, correct, resubmit and approve timesheet states', async () => {
    const createdResponse = await application.inject({
      headers: { 'idempotency-key': mutationKey(8) },
      method: 'POST',
      payload: {
        assignmentId: eligibleAssignment,
        breakMinutes: 30,
        workedEnd: '2026-08-21T22:00:00.000Z',
        workedStart: '2026-08-21T14:00:00.000Z',
        workerNote: 'Synthetic shift recorded for review.',
      },
      url: operationsRoutes.workerTimesheets(previewPersonaIds.worker),
    })
    expect(createdResponse.statusCode).toBe(201)
    let timesheet = workerTimesheetMutationResponseSchema.parse(createdResponse.json()).data.timesheet
    expect(timesheet.status).toBe('draft')

    const submittedResponse = await application.inject({ headers: { 'idempotency-key': mutationKey(9) }, method: 'POST', payload: { expectedVersion: timesheet.version }, url: operationsRoutes.workerTimesheetSubmit(previewPersonaIds.worker, timesheet.id) })
    timesheet = workerTimesheetMutationResponseSchema.parse(submittedResponse.json()).data.timesheet
    expect(timesheet.status).toBe('submitted')

    const rejectedResponse = await application.inject({ headers: { 'idempotency-key': mutationKey(10) }, method: 'POST', payload: { decision: 'reject', expectedVersion: timesheet.version, reviewNote: 'Please confirm the synthetic break duration.' }, url: operationsRoutes.managerTimesheetDecision(previewPersonaIds.manager, timesheet.id) })
    timesheet = workerTimesheetMutationResponseSchema.parse(rejectedResponse.json()).data.timesheet
    expect(timesheet.status).toBe('rejected')

    const correctedResponse = await application.inject({ headers: { 'idempotency-key': mutationKey(11) }, method: 'PUT', payload: { breakMinutes: 35, expectedVersion: timesheet.version, workedEnd: timesheet.workedEnd, workedStart: timesheet.workedStart, workerNote: 'Synthetic break duration confirmed.' }, url: operationsRoutes.workerTimesheetDetail(previewPersonaIds.worker, timesheet.id) })
    timesheet = workerTimesheetMutationResponseSchema.parse(correctedResponse.json()).data.timesheet
    expect(timesheet).toMatchObject({ breakMinutes: 35, status: 'rejected' })

    const resubmittedResponse = await application.inject({ headers: { 'idempotency-key': mutationKey(12) }, method: 'POST', payload: { expectedVersion: timesheet.version }, url: operationsRoutes.workerTimesheetSubmit(previewPersonaIds.worker, timesheet.id) })
    timesheet = workerTimesheetMutationResponseSchema.parse(resubmittedResponse.json()).data.timesheet
    expect(timesheet.status).toBe('submitted')

    const approvedResponse = await application.inject({ headers: { 'idempotency-key': mutationKey(13) }, method: 'POST', payload: { decision: 'approve', expectedVersion: timesheet.version, reviewNote: 'Synthetic time reviewed.' }, url: operationsRoutes.managerTimesheetDecision(previewPersonaIds.manager, timesheet.id) })
    timesheet = workerTimesheetMutationResponseSchema.parse(approvedResponse.json()).data.timesheet
    expect(timesheet.status).toBe('approved')

    const duplicate = await application.inject({ headers: { 'idempotency-key': mutationKey(14) }, method: 'POST', payload: { assignmentId: eligibleAssignment, breakMinutes: 30, workedEnd: '2026-08-21T22:00:00.000Z', workedStart: '2026-08-21T14:00:00.000Z', workerNote: null }, url: operationsRoutes.workerTimesheets(previewPersonaIds.worker) })
    expect(duplicate.statusCode).toBe(409)
    expect(errorResponseSchema.parse(duplicate.json()).error.code).toBe('TIMESHEET_LIFECYCLE_CONFLICT')
  })
})

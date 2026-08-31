import {
  administratorComplianceResponseSchema,
  administratorRecordsResponseSchema,
  errorResponseSchema,
  managerCoverageResponseSchema,
  managerOperationsResponseSchema,
  notificationsResponseSchema,
  previewPersonaIds,
  previewRoutes,
  requestIdHeaderName,
  workerOverviewResponseSchema,
  workerReadinessResponseSchema,
  workerScheduleResponseSchema,
  workerShiftDetailResponseSchema,
  workerShiftRequestResponseSchema,
  workerAssignmentCancellationResponseSchema,
  workerShiftsResponseSchema,
  type AdministratorComplianceData,
  type AdministratorRecordsData,
  type ManagerCoverageData,
  type ManagerOperationsData,
  type NotificationsData,
  type NotificationsQuery,
  type WorkerOverviewData,
  type WorkerReadinessData,
  type WorkerScheduleData,
  type WorkerShiftDetailData,
  type WorkerShiftsData,
  type WorkerAssignmentMutation,
} from '@ajani/contracts'
import { WorkerJourneyRuleError } from '@ajani/database'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApplication } from '../src/app.js'
import {
  unavailablePreviewRepository,
  type PreviewRepository,
} from '../src/repositories/preview-repository.js'

const requestId = '78420e18-2a11-4d8a-bd07-baa4cc7b736f'
const unknownId = '30000000-0000-4000-8000-000000000099'
const generatedAt = '2026-08-25T10:30:00.000Z'
const organisation = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Willowmere Community Partnership',
} as const
const location = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Willowmere Community Hospital',
  area: 'Maple Ward',
  timezone: 'Europe/London',
} as const
const worker = {
  id: previewPersonaIds.worker,
  displayName: 'Leila Mensah',
  roleTitle: 'Registered nurse',
} as const
const manager = {
  id: previewPersonaIds.manager,
  displayName: 'Imani Dube',
  roleTitle: 'Workforce manager',
} as const
const administrator = {
  id: previewPersonaIds.administrator,
  displayName: 'Malik Adebayo',
  roleTitle: 'Workforce administrator',
} as const
const coverageItem = {
  shiftId: '40000000-0000-4000-8000-000000000001',
  location,
  startsAt: '2026-08-27T06:30:00.000Z',
  endsAt: '2026-08-27T14:30:00.000Z',
  requiredWorkers: 6,
  confirmedWorkers: 5,
  openPositions: 1,
  status: 'open',
} as const

const workerOverview: WorkerOverviewData = {
  worker,
  asOfDate: '2026-08-25',
  readiness: {
    status: 'ready',
    currentRequirements: 4,
    totalRequirements: 4,
  },
  upcomingShifts: [
    {
      id: coverageItem.shiftId,
      startsAt: coverageItem.startsAt,
      endsAt: coverageItem.endsAt,
      roleTitle: worker.roleTitle,
      organisation,
      location,
      arrivalNote: 'Use the east entrance.',
      status: 'confirmed',
    },
  ],
  recentActivity: [
    {
      id: '60000000-0000-4000-8000-000000000001',
      title: 'Arrival note updated',
      description: 'East entrance added to the Willowmere shift.',
      occurredAt: '2026-08-25T08:42:00.000Z',
    },
  ],
}

const workerReadiness: WorkerReadinessData = {
  worker,
  asOfDate: '2026-08-25',
  status: 'ready',
  currentRequirements: 4,
  totalRequirements: 4,
  nextReviewDate: '2026-09-12',
  requirements: [
    {
      id: '50000000-0000-4000-8000-000000000001',
      name: 'Manual handling',
      status: 'due_soon',
      summary: 'Review due 12 September.',
      reviewedAt: '2026-07-14T09:00:00.000Z',
      dueDate: '2026-09-12',
    },
  ],
}

const managerOperations: ManagerOperationsData = {
  manager,
  organisation,
  regionName: 'Willowmere region',
  asOfDate: '2026-08-25',
  metrics: {
    requiredPositions: 20,
    confirmedAssignments: 18,
    openPositions: 2,
    confirmedWorkers: 17,
    pendingArrivalChecks: 1,
    actionsDue: 3,
    affectedAreas: 2,
  },
  alerts: [
    {
      id: '70000000-0000-4000-8000-000000000001',
      title: 'Coverage conflict needs review',
      description: 'Two preview requests overlap for the overnight window.',
    },
  ],
  coverage: [coverageItem],
}

const managerCoverage: ManagerCoverageData = {
  manager,
  asOfDate: '2026-08-25',
  window: {
    startsAt: '2026-08-25T00:00:00.000Z',
    endsAt: '2026-08-27T23:59:59.000Z',
  },
  items: [coverageItem],
}

const administratorCompliance: AdministratorComplianceData = {
  administrator,
  summary: { ready: 4, actionDue: 2, reviewing: 1, total: 7 },
  items: [
    {
      workerId: worker.id,
      previewId: 'AJN-2041',
      displayName: worker.displayName,
      roleTitle: worker.roleTitle,
      readinessStatus: 'ready',
      nextReviewDate: '2026-09-12',
    },
  ],
}

const administratorRecords: AdministratorRecordsData = {
  administrator,
  items: [
    {
      workerId: worker.id,
      previewId: 'AJN-2041',
      displayName: worker.displayName,
      roleTitle: worker.roleTitle,
      primaryLocation: location,
      readinessStatus: 'ready',
      requirements: { current: 4, attention: 0, total: 4 },
      lastActivityAt: '2026-08-25T08:42:00.000Z',
    },
  ],
}

const notifications: NotificationsData = {
  unreadCount: 2,
  items: [
    {
      id: '80000000-0000-4000-8000-000000000001',
      recipientId: worker.id,
      title: 'Shift detail updated',
      detail: 'The arrival note for Thursday has changed.',
      createdAt: '2026-08-25T09:48:00.000Z',
      tone: 'information',
      readAt: null,
    },
  ],
}

const discoverableShift = {
  availability: {
    remainingPlaces: 1,
    requiredWorkers: 1,
    reservedWorkers: 0,
    status: 'open',
  },
  durationMinutes: 480,
  eligibility: {
    detail: 'Your active status, organisation, role and readiness match this shift.',
    outcome: 'eligible',
    title: 'Ready to request',
  },
  endsAt: '2026-08-30T04:00:00.000Z',
  existingAssignmentId: null,
  id: '70000000-0000-4000-8000-000000000005',
  location: { ...location, area: 'Cedar House' },
  organisation,
  roleTitle: worker.roleTitle,
  startsAt: '2026-08-29T20:00:00.000Z',
} as const

const workerShifts: WorkerShiftsData = {
  asOfDate: '2026-08-25',
  items: [discoverableShift],
  locations: [{ id: location.id, name: location.name }],
  worker,
}

const workerShiftDetail: WorkerShiftDetailData = {
  asOfDate: '2026-08-25',
  shift: {
    ...discoverableShift,
    arrivalNote: 'Use the courtyard entrance and report to reception.',
  },
  worker,
}

const scheduleAssignment = {
  cancelledAt: null,
  cancellationReason: null,
  id: '80000000-0000-4000-8000-000000000020',
  requestedAt: generatedAt,
  shift: workerShiftDetail.shift,
  status: 'confirmed',
} as const

const workerSchedule: WorkerScheduleData = {
  asOfDate: '2026-08-25',
  items: [scheduleAssignment],
  worker,
}

const assignmentMutation: WorkerAssignmentMutation = {
  assignment: scheduleAssignment,
  idempotentReplay: false,
  message: 'The shift is confirmed in your synthetic preview schedule.',
  outcome: 'confirmed',
}

function createPreviewRepository(
  overrides: Partial<PreviewRepository> = {},
): PreviewRepository {
  return {
    ...unavailablePreviewRepository,
    getWorkerOverview: () => Promise.resolve(workerOverview),
    getWorkerReadiness: () => Promise.resolve(workerReadiness),
    getWorkerShifts: () =>
      Promise.resolve({ ...workerShifts, nextCursor: null }),
    getWorkerShiftDetail: () => Promise.resolve(workerShiftDetail),
    getWorkerSchedule: () =>
      Promise.resolve({ ...workerSchedule, nextCursor: null }),
    requestWorkerShift: () => Promise.resolve(assignmentMutation),
    cancelWorkerAssignment: () =>
      Promise.resolve({
        ...assignmentMutation,
        assignment: {
          ...assignmentMutation.assignment,
          cancelledAt: generatedAt,
          cancellationReason: 'worker_requested',
          status: 'cancelled',
        },
        message: 'The assignment was cancelled and its reserved place was released.',
        outcome: 'cancelled',
      }),
    getManagerOperations: () => Promise.resolve(managerOperations),
    getManagerCoverage: () => Promise.resolve(managerCoverage),
    getAdministratorCompliance: () =>
      Promise.resolve({ ...administratorCompliance, nextCursor: null }),
    getAdministratorRecords: () =>
      Promise.resolve({ ...administratorRecords, nextCursor: null }),
    getNotifications: () =>
      Promise.resolve({ ...notifications, nextCursor: null }),
    ...overrides,
  }
}

const openApplications: ReturnType<typeof buildApplication>[] = []

function createApplication(repository?: PreviewRepository) {
  const application = buildApplication({
    clock: () => new Date(generatedAt),
    logger: false,
    ...(repository === undefined ? {} : { previewRepository: repository }),
  })
  openApplications.push(application)
  return application
}

afterEach(async () => {
  await Promise.all(
    openApplications.splice(0).map((application) => application.close()),
  )
})

describe('versioned preview API', () => {
  const successCases = [
    {
      name: 'worker overview',
      url: previewRoutes.workerOverview(previewPersonaIds.worker),
      schema: workerOverviewResponseSchema,
    },
    {
      name: 'worker readiness',
      url: previewRoutes.workerReadiness(previewPersonaIds.worker),
      schema: workerReadinessResponseSchema,
    },
    {
      name: 'worker shift discovery',
      url: `${previewRoutes.workerShifts(previewPersonaIds.worker)}?limit=10`,
      schema: workerShiftsResponseSchema,
    },
    {
      name: 'worker shift detail',
      url: previewRoutes.workerShiftDetail(
        previewPersonaIds.worker,
        discoverableShift.id,
      ),
      schema: workerShiftDetailResponseSchema,
    },
    {
      name: 'worker schedule',
      url: `${previewRoutes.workerSchedule(previewPersonaIds.worker)}?limit=10`,
      schema: workerScheduleResponseSchema,
    },
    {
      name: 'manager operations',
      url: previewRoutes.managerOperations(previewPersonaIds.manager),
      schema: managerOperationsResponseSchema,
    },
    {
      name: 'manager coverage',
      url: previewRoutes.managerCoverage(previewPersonaIds.manager),
      schema: managerCoverageResponseSchema,
    },
    {
      name: 'administrator compliance',
      url: `${previewRoutes.administratorCompliance(previewPersonaIds.administrator)}?limit=10`,
      schema: administratorComplianceResponseSchema,
    },
    {
      name: 'administrator records',
      url: `${previewRoutes.administratorRecords(previewPersonaIds.administrator)}?limit=10`,
      schema: administratorRecordsResponseSchema,
    },
    {
      name: 'notifications',
      url: `${previewRoutes.notifications}?recipientId=${previewPersonaIds.worker}&limit=10`,
      schema: notificationsResponseSchema,
    },
  ] as const

  it.each(successCases)(
    'returns a contract-valid $name response with correlation metadata',
    async ({ schema, url }) => {
      const response = await createApplication(createPreviewRepository()).inject({
        headers: { [requestIdHeaderName]: requestId },
        method: 'GET',
        url,
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers[requestIdHeaderName]).toBe(requestId)
      const body = schema.parse(response.json())
      expect(body.meta).toMatchObject({
        generatedAt,
        requestId,
        source: 'synthetic-preview',
      })
    },
  )

  it.each([
    previewRoutes.workerOverview('invalid'),
    previewRoutes.workerReadiness('invalid'),
    previewRoutes.workerShifts('invalid'),
    previewRoutes.workerShiftDetail(previewPersonaIds.worker, 'invalid'),
    previewRoutes.workerSchedule('invalid'),
    previewRoutes.managerOperations('invalid'),
    previewRoutes.managerCoverage('invalid'),
    previewRoutes.administratorCompliance('invalid'),
    previewRoutes.administratorRecords('invalid'),
    `${previewRoutes.notifications}?recipientId=invalid`,
  ])('rejects invalid identifiers for %s', async (url) => {
    const response = await createApplication(createPreviewRepository()).inject({
      headers: { [requestIdHeaderName]: requestId },
      method: 'GET',
      url,
    })

    expect(response.statusCode).toBe(400)
    const body = errorResponseSchema.parse(response.json())
    expect(body.error).toMatchObject({ code: 'INVALID_REQUEST', requestId })
    expect(body.error.details).toBeDefined()
  })

  it.each([
    `${previewRoutes.workerOverview(previewPersonaIds.worker)}?unsupported=true`,
    `${previewRoutes.workerReadiness(previewPersonaIds.worker)}?unsupported=true`,
    `${previewRoutes.workerShifts(previewPersonaIds.worker)}?limit=0`,
    `${previewRoutes.workerShifts(previewPersonaIds.worker)}?from=2026-09-02&to=2026-09-01`,
    `${previewRoutes.workerSchedule(previewPersonaIds.worker)}?status=pending`,
    `${previewRoutes.managerOperations(previewPersonaIds.manager)}?unsupported=true`,
    `${previewRoutes.managerCoverage(previewPersonaIds.manager)}?unsupported=true`,
    `${previewRoutes.administratorCompliance(previewPersonaIds.administrator)}?limit=0`,
    `${previewRoutes.administratorRecords(previewPersonaIds.administrator)}?cursor=not%20opaque`,
    `${previewRoutes.notifications}?recipientId=${previewPersonaIds.worker}&unread=maybe`,
  ])('rejects invalid query parameters for %s', async (url) => {
    const response = await createApplication(createPreviewRepository()).inject({
      method: 'GET',
      url,
    })

    expect(response.statusCode).toBe(400)
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      'INVALID_REQUEST',
    )
  })

  it.each([
    previewRoutes.workerOverview(unknownId),
    previewRoutes.workerReadiness(unknownId),
    previewRoutes.workerShifts(unknownId),
    previewRoutes.workerShiftDetail(unknownId, discoverableShift.id),
    previewRoutes.workerSchedule(unknownId),
    previewRoutes.managerOperations(unknownId),
    previewRoutes.managerCoverage(unknownId),
    previewRoutes.administratorCompliance(unknownId),
    previewRoutes.administratorRecords(unknownId),
    `${previewRoutes.notifications}?recipientId=${unknownId}`,
  ])('returns 404 for an unknown preview identifier at %s', async (url) => {
    const notFoundRepository = createPreviewRepository({
      getWorkerOverview: () => Promise.resolve(null),
      getWorkerReadiness: () => Promise.resolve(null),
      getWorkerShifts: () => Promise.resolve(null),
      getWorkerShiftDetail: () => Promise.resolve(null),
      getWorkerSchedule: () => Promise.resolve(null),
      getManagerOperations: () => Promise.resolve(null),
      getManagerCoverage: () => Promise.resolve(null),
      getAdministratorCompliance: () => Promise.resolve(null),
      getAdministratorRecords: () => Promise.resolve(null),
      getNotifications: () => Promise.resolve(null),
    })
    const response = await createApplication(notFoundRepository).inject({
      headers: { [requestIdHeaderName]: requestId },
      method: 'GET',
      url,
    })

    expect(response.statusCode).toBe(404)
    expect(errorResponseSchema.parse(response.json()).error).toMatchObject({
      code: 'NOT_FOUND',
      requestId,
    })
  })

  it('returns safe 500 data when a repository fails unexpectedly', async () => {
    const repository = createPreviewRepository({
      getWorkerOverview: () =>
        Promise.reject(new Error('private SQL and connection details')),
    })
    const response = await createApplication(repository).inject({
      method: 'GET',
      url: previewRoutes.workerOverview(previewPersonaIds.worker),
    })

    expect(response.statusCode).toBe(500)
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      'INTERNAL_SERVER_ERROR',
    )
    expect(response.body).not.toContain('private SQL')
    expect(response.body).not.toContain('connection')
  })

  it('returns a safe retryable 503 when preview data has not initialized', async () => {
    const response = await createApplication().inject({
      method: 'GET',
      url: previewRoutes.workerOverview(previewPersonaIds.worker),
    })

    expect(response.statusCode).toBe(503)
    expect(response.headers['retry-after']).toBe('5')
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      'SERVICE_UNAVAILABLE',
    )
  })

  it('passes decoded query values and opaque cursors for deterministic pagination', async () => {
    const queries: NotificationsQuery[] = []
    const cursor = 'eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTI1VDA5OjQ4OjAwLjAwMFoifQ'
    const getNotifications: PreviewRepository['getNotifications'] = (query) => {
      queries.push(query)
      return Promise.resolve({
        ...notifications,
        nextCursor: query.cursor === undefined ? cursor : null,
      })
    }
    const application = createApplication(
      createPreviewRepository({ getNotifications }),
    )

    const first = await application.inject({
      method: 'GET',
      url: `${previewRoutes.notifications}?recipientId=${previewPersonaIds.worker}&unread=true&limit=1`,
    })
    const firstBody = notificationsResponseSchema.parse(first.json())

    expect(firstBody.meta.pagination).toEqual({ limit: 1, nextCursor: cursor })
    expect(queries[0]).toEqual({
      limit: 1,
      recipientId: previewPersonaIds.worker,
      unread: true,
    })

    const second = await application.inject({
      method: 'GET',
      url: `${previewRoutes.notifications}?recipientId=${previewPersonaIds.worker}&unread=true&limit=1&cursor=${cursor}`,
    })
    const secondBody = notificationsResponseSchema.parse(second.json())

    expect(secondBody.meta.pagination).toEqual({ limit: 1, nextCursor: null })
    expect(queries[1]).toEqual({
      cursor,
      limit: 1,
      recipientId: previewPersonaIds.worker,
      unread: true,
    })
  })

  it('maps a well-formed cursor for the wrong collection to a safe 400', async () => {
    const cursorError = new Error('decoded cursor internals')
    cursorError.name = 'InvalidPreviewCursorError'
    const repository = createPreviewRepository({
      getNotifications: () => Promise.reject(cursorError),
    })
    const response = await createApplication(repository).inject({
      method: 'GET',
      url: `${previewRoutes.notifications}?recipientId=${previewPersonaIds.worker}&cursor=eyJ3cm9uZyI6dHJ1ZX0`,
    })

    expect(response.statusCode).toBe(400)
    const body = errorResponseSchema.parse(response.json())
    expect(body.error).toMatchObject({
      code: 'INVALID_REQUEST',
      details: [
        {
          field: 'cursor',
          message: 'Cursor is invalid or does not belong to this collection.',
        },
      ],
    })
    expect(response.body).not.toContain('decoded cursor internals')
  })

  it('creates and cancels assignments through validated mutation contracts', async () => {
    const application = createApplication(createPreviewRepository())
    const created = await application.inject({
      headers: {
        'idempotency-key': 'api-request-key-0001',
        [requestIdHeaderName]: requestId,
      },
      method: 'POST',
      payload: { shiftId: discoverableShift.id },
      url: previewRoutes.workerShiftAssignments(previewPersonaIds.worker),
    })

    expect(created.statusCode).toBe(201)
    expect(created.headers['cache-control']).toBe('no-store')
    expect(
      workerShiftRequestResponseSchema.parse(created.json()).data.outcome,
    ).toBe('confirmed')

    const cancelled = await application.inject({
      headers: {
        'idempotency-key': 'api-cancel-key-0001',
        [requestIdHeaderName]: requestId,
      },
      method: 'POST',
      payload: {},
      url: previewRoutes.workerShiftAssignmentCancellation(
        previewPersonaIds.worker,
        scheduleAssignment.id,
      ),
    })
    expect(cancelled.statusCode).toBe(200)
    expect(
      workerAssignmentCancellationResponseSchema.parse(cancelled.json()).data
        .outcome,
    ).toBe('cancelled')
  })

  it.each([
    {
      headers: {},
      payload: { shiftId: discoverableShift.id },
      name: 'missing idempotency key',
    },
    {
      headers: { 'idempotency-key': 'short' },
      payload: { shiftId: discoverableShift.id },
      name: 'invalid idempotency key',
    },
    {
      headers: { 'idempotency-key': 'valid-api-key-0001' },
      payload: { shiftId: 'invalid' },
      name: 'invalid body',
    },
    {
      headers: { 'idempotency-key': 'valid-api-key-0002' },
      payload: { shiftId: discoverableShift.id, unexpected: true },
      name: 'unknown body field',
    },
  ])('rejects a $name for assignment creation', async ({ headers, payload }) => {
    const response = await createApplication(createPreviewRepository()).inject({
      headers,
      method: 'POST',
      payload,
      url: previewRoutes.workerShiftAssignments(previewPersonaIds.worker),
    })

    expect(response.statusCode).toBe(400)
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      'INVALID_REQUEST',
    )
  })

  it.each([
    { code: 'READINESS_REQUIRED', statusCode: 422 },
    { code: 'SHIFT_FULL', statusCode: 409 },
    { code: 'SCHEDULE_OVERLAP', statusCode: 409 },
    { code: 'IDEMPOTENCY_CONFLICT', statusCode: 409 },
  ] as const)('maps $code to a safe mutation conflict', async ({ code, statusCode }) => {
    const repository = createPreviewRepository({
      requestWorkerShift: () =>
        Promise.reject(new WorkerJourneyRuleError(code, 'Safe conflict detail.')),
    })
    const response = await createApplication(repository).inject({
      headers: { 'idempotency-key': `api-${code.toLowerCase()}` },
      method: 'POST',
      payload: { shiftId: discoverableShift.id },
      url: previewRoutes.workerShiftAssignments(previewPersonaIds.worker),
    })

    expect(response.statusCode).toBe(statusCode)
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(code)
  })
})

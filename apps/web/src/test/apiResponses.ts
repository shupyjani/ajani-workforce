import { previewPersonaIds } from '@ajani/contracts'
import { vi, type MockInstance } from 'vitest'

const requestId = '78420e18-2a11-4d8a-bd07-baa4cc7b736f'
const generatedAt = '2026-08-25T10:30:00.000Z'
const organisation = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Asterbridge Workforce Cooperative',
}
const location = {
  area: 'Maple Ward',
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Willowmere Community Hospital',
  timezone: 'Europe/London',
}
const worker = {
  displayName: 'Leila Mensah',
  id: previewPersonaIds.worker,
  roleTitle: 'Registered nurse',
}
const manager = {
  displayName: 'Imani Dube',
  id: previewPersonaIds.manager,
  roleTitle: 'Workforce manager',
}
const administrator = {
  displayName: 'Malik Adebayo',
  id: previewPersonaIds.administrator,
  roleTitle: 'Workforce administrator',
}
const coverage = {
  confirmedWorkers: 5,
  endsAt: '2026-08-27T14:30:00.000Z',
  location,
  openPositions: 1,
  requiredWorkers: 6,
  shiftId: '40000000-0000-4000-8000-000000000001',
  startsAt: '2026-08-27T06:30:00.000Z',
  status: 'open',
}
const managerCoverage = [
  {
    ...coverage,
    confirmedWorkers: 4,
    location: { ...location, area: 'Short stay unit' },
    openPositions: 0,
    requiredWorkers: 4,
    status: 'covered',
  },
  {
    ...coverage,
    confirmedWorkers: 1,
    location: {
      area: 'Short stay unit',
      id: '20000000-0000-4000-8000-000000000002',
      name: 'Harbourlight Care Centre',
      timezone: 'Europe/London',
    },
    openPositions: 1,
    requiredWorkers: 2,
    shiftId: '40000000-0000-4000-8000-000000000004',
  },
]
const journeyShift = {
  availability: {
    remainingPlaces: 1,
    requiredWorkers: 2,
    reservedWorkers: 1,
    status: 'open',
  },
  durationMinutes: 480,
  eligibility: {
    detail: 'Your role and current readiness match this synthetic shift.',
    outcome: 'eligible',
    title: 'Ready to request',
  },
  endsAt: '2026-08-29T06:30:00.000Z',
  existingAssignmentId: null,
  id: '70000000-0000-4000-8000-000000000005',
  location: {
    area: 'Cedar Ward',
    id: '20000000-0000-4000-8000-000000000002',
    name: 'Harbourlight Care Centre',
    timezone: 'Europe/London',
  },
  organisation,
  roleTitle: worker.roleTitle,
  startsAt: '2026-08-28T22:30:00.000Z',
}
const journeyAssignment = {
  cancelledAt: null,
  cancellationReason: null,
  id: '90000000-0000-4000-8000-000000000020',
  requestedAt: generatedAt,
  shift: { ...journeyShift, arrivalNote: 'Use the garden entrance.' },
  status: 'confirmed',
}
const managerShift = {
  arrivalNote: 'Report to the synthetic reception desk.',
  cancellationReason: null,
  cancelledAt: null,
  confirmedWorkers: 0,
  endsAt: '2026-09-10T15:00:00.000Z',
  id: '70000000-0000-4000-8000-000000000019',
  location,
  organisation,
  requiredWorkers: 2,
  reviewWorkers: 0,
  roleTitle: worker.roleTitle,
  startsAt: '2026-09-10T07:00:00.000Z',
  status: 'draft',
  version: 1,
}
const complianceRecord = {
  dueOn: '2026-09-07',
  id: 'd0000000-0000-4000-8000-000000000012',
  previewId: 'AJN-2043',
  primaryLocation: location,
  requirement: {
    description: 'Role requirements are recorded for this synthetic profile.',
    id: '60000000-0000-4000-8000-000000000004',
    name: 'Role requirements',
  },
  reviewedOn: '2026-07-14',
  status: 'reviewing',
  updatedAt: generatedAt,
  version: 1,
  worker: { ...worker, displayName: 'Mina Okoro', id: '30000000-0000-4000-8000-000000000003' },
}
const timesheet = {
  approvedAt: null,
  assignmentId: '80000000-0000-4000-8000-000000000019',
  breakMinutes: 30,
  createdAt: generatedAt,
  id: '90000000-0000-4000-8000-000000000001',
  managerReviewNote: 'Please confirm the synthetic finish time before resubmitting.',
  organisation,
  rejectedAt: generatedAt,
  reviewedBy: manager,
  shift: {
    endsAt: '2026-08-20T15:00:00.000Z',
    id: '70000000-0000-4000-8000-000000000014',
    location,
    roleTitle: worker.roleTitle,
    startsAt: '2026-08-20T07:00:00.000Z',
  },
  status: 'rejected',
  submittedAt: '2026-08-25T09:00:00.000Z',
  updatedAt: generatedAt,
  version: 1,
  workedEnd: '2026-08-20T15:00:00.000Z',
  workedMinutes: 450,
  workedStart: '2026-08-20T07:00:00.000Z',
  worker,
  workerNote: 'Synthetic shift completed as scheduled.',
}

function envelope(data: unknown, paginated = false): object {
  return {
    data,
    meta: {
      generatedAt,
      ...(paginated
        ? { pagination: { limit: 20, nextCursor: null } }
        : {}),
      requestId,
      source: 'synthetic-preview',
    },
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
    status,
  })
}

function jsonRequestBody(init: RequestInit): unknown {
  if (typeof init.body !== 'string') {
    throw new TypeError('Expected a JSON request body.')
  }
  return JSON.parse(init.body) as unknown
}

export function previewRequestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input, 'http://localhost')
  if (input instanceof URL) return input
  return new URL(input.url, 'http://localhost')
}

export function previewApiResponse(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = previewRequestUrl(input)
  const { pathname: path } = url

  if (init?.method === 'POST' && path.endsWith('/shift-assignments')) {
    return jsonResponse(
      envelope({
        assignment: journeyAssignment,
        idempotentReplay: false,
        message: 'The shift is confirmed in your synthetic preview schedule.',
        outcome: 'confirmed',
      }),
      201,
    )
  }
  if (
    init?.method === 'POST' &&
    path.includes('/shift-assignments/') &&
    path.endsWith('/cancel')
  ) {
    return jsonResponse(
      envelope({
        assignment: {
          ...journeyAssignment,
          cancelledAt: generatedAt,
          cancellationReason: 'Cancelled by worker in preview.',
          status: 'cancelled',
        },
        idempotentReplay: false,
        message: 'The assignment was cancelled and its capacity was released.',
        outcome: 'cancelled',
      }),
    )
  }

  if (init?.method === 'POST' && path.endsWith('/assignment-requests/80000000-0000-4000-8000-000000000013/decision')) {
    const request = jsonRequestBody(init) as { decision: 'approve' | 'decline'; reason?: string }
    return jsonResponse(envelope({
      assignmentId: '80000000-0000-4000-8000-000000000013',
      decidedAt: generatedAt,
      idempotentReplay: false,
      message: request.decision === 'approve' ? 'The assignment is confirmed.' : 'The assignment was declined.',
      reason: request.reason ?? null,
      status: request.decision === 'approve' ? 'confirmed' : 'declined',
      version: 2,
    }))
  }
  if (path.includes('/managers/') && path.includes('/shifts') && init?.method !== undefined) {
    const published = path.endsWith('/publish')
    const cancelled = path.endsWith('/cancel')
    const created = init.method === 'POST' && path.endsWith('/shifts')
    return jsonResponse(
      envelope({
        idempotentReplay: false,
        message: cancelled ? 'The shift and active assignments were cancelled.' : published ? 'The shift is published.' : 'The draft shift was saved.',
        shift: {
          ...managerShift,
          cancellationReason: cancelled ? 'The synthetic service need changed.' : null,
          cancelledAt: cancelled ? generatedAt : null,
          status: cancelled ? 'cancelled' : published ? 'open' : 'draft',
          version: managerShift.version + 1,
        },
      }),
      created ? 201 : 200,
    )
  }
  if (init?.method === 'POST' && path.endsWith(`/compliance/${complianceRecord.id}/decision`)) {
    return jsonResponse(envelope({
      idempotentReplay: false,
      message: 'The compliance record is current and readiness was recalculated.',
      record: { ...complianceRecord, status: 'current', version: 2 },
      workerReadiness: 'ready',
    }))
  }
  if (path.includes('/workers/') && path.includes('/timesheets') && init?.method !== undefined) {
    const submitted = path.endsWith('/submit')
    const created = init.method === 'POST' && path.endsWith('/timesheets')
    return jsonResponse(envelope({
      idempotentReplay: false,
      message: submitted ? 'The timesheet was submitted for Manager review.' : 'The timesheet draft was saved.',
      timesheet: {
        ...timesheet,
        managerReviewNote: null,
        rejectedAt: null,
        reviewedBy: null,
        status: submitted ? 'submitted' : 'draft',
        submittedAt: submitted ? generatedAt : null,
        version: 2,
      },
    }), created ? 201 : 200)
  }
  if (init?.method === 'POST' && path.includes('/managers/') && path.includes('/timesheets/') && path.endsWith('/decision')) {
    const request = jsonRequestBody(init) as { decision: 'approve' | 'reject'; reviewNote: string | null }
    return jsonResponse(envelope({
      idempotentReplay: false,
      message: request.decision === 'approve' ? 'The timesheet was approved.' : 'The timesheet was returned for correction.',
      timesheet: {
        ...timesheet,
        approvedAt: request.decision === 'approve' ? generatedAt : null,
        managerReviewNote: request.reviewNote,
        rejectedAt: request.decision === 'reject' ? generatedAt : null,
        status: request.decision === 'approve' ? 'approved' : 'rejected',
        version: 2,
      },
    }))
  }

  if (path === '/health') {
    return jsonResponse({
      requestId,
      service: 'ajani-workforce-api',
      status: 'ok',
      timestamp: generatedAt,
    })
  }
  if (path.endsWith('/overview')) {
    return jsonResponse(
      envelope({
        asOfDate: '2026-08-25',
        readiness: {
          currentRequirements: 3,
          status: 'ready',
          totalRequirements: 4,
        },
        recentActivity: [
          {
            description: 'East entrance added to the Willowmere shift.',
            id: '60000000-0000-4000-8000-000000000001',
            occurredAt: '2026-08-25T09:42:00.000Z',
            title: 'Arrival note updated',
          },
        ],
        upcomingShifts: [
          {
            arrivalNote: 'Use the east entrance.',
            endsAt: coverage.endsAt,
            id: coverage.shiftId,
            location,
            organisation,
            roleTitle: worker.roleTitle,
            startsAt: coverage.startsAt,
            status: 'confirmed',
          },
        ],
        worker,
      }),
    )
  }
  if (path.endsWith('/readiness')) {
    return jsonResponse(
      envelope({
        asOfDate: '2026-08-25',
        currentRequirements: 3,
        nextReviewDate: '2026-09-12',
        requirements: [
          {
            dueDate: '2026-09-12',
            id: '50000000-0000-4000-8000-000000000001',
            name: 'Manual handling',
            reviewedAt: '2026-07-14T00:00:00.000Z',
            status: 'due_soon',
            summary: 'Review timing for this synthetic profile.',
          },
        ],
        status: 'ready',
        totalRequirements: 4,
        worker,
      }),
    )
  }
  if (path.endsWith(`/shifts/${journeyShift.id}`)) {
    return jsonResponse(
      envelope({
        asOfDate: '2026-08-25',
        shift: { ...journeyShift, arrivalNote: 'Use the garden entrance.' },
        worker,
      }),
    )
  }
  if (path.includes('/workers/') && path.endsWith('/shifts')) {
    const empty = url.searchParams.get('from') === '2026-12-01'
    return jsonResponse(
      envelope(
        {
          asOfDate: '2026-08-25',
          items: empty ? [] : [journeyShift],
          locations: [journeyShift.location, location].map(({ id, name }) => ({ id, name })),
          worker,
        },
        true,
      ),
    )
  }
  if (path.endsWith('/schedule')) {
    return jsonResponse(
      envelope(
        {
          asOfDate: '2026-08-25',
          items: [journeyAssignment],
          worker,
        },
        true,
      ),
    )
  }
  if (path.endsWith('/operations')) {
    return jsonResponse(
      envelope({
        alerts: [
          {
            description: 'Two synthetic requests overlap for the overnight window.',
            id: '70000000-0000-4000-8000-000000000001',
            title: 'Coverage conflict needs review',
          },
        ],
        asOfDate: '2026-08-25',
        coverage: managerCoverage,
        manager,
        metrics: {
          actionsDue: 2,
          affectedAreas: 2,
          confirmedAssignments: 5,
          confirmedWorkers: 5,
          openPositions: 1,
          pendingArrivalChecks: 1,
          requiredPositions: 6,
        },
        organisation,
        regionName: 'Willowmere region',
      }),
    )
  }
  if (path.endsWith('/coverage')) {
    return jsonResponse(
      envelope({
        asOfDate: '2026-08-25',
        items: managerCoverage,
        manager,
        window: {
          endsAt: '2026-08-30T00:00:00.000Z',
          startsAt: '2026-08-25T00:00:00.000Z',
        },
      }),
    )
  }
  if (path.endsWith('/assignment-requests')) {
    return jsonResponse(envelope({
      items: [{
        assignmentId: '80000000-0000-4000-8000-000000000013',
        requestedAt: generatedAt,
        shift: {
          confirmedWorkers: 3,
          endsAt: '2026-08-29T07:00:00.000Z',
          id: '70000000-0000-4000-8000-000000000003',
          location: { ...location, area: 'Birch Ward' },
          requiredWorkers: 5,
          reviewWorkers: 2,
          roleTitle: 'Healthcare assistant',
          startsAt: '2026-08-28T19:00:00.000Z',
        },
        version: 1,
        worker: { ...worker, displayName: 'Theo Adeyemi', organisationId: organisation.id, readinessStatus: 'reviewing', roleTitle: 'Healthcare assistant', status: 'active' },
      }],
      manager,
      organisation,
    }, true))
  }
  if (path.includes('/managers/') && path.endsWith(`/shifts/${managerShift.id}`)) {
    return jsonResponse(envelope({ manager, shift: managerShift }))
  }
  if (path.includes('/managers/') && path.endsWith('/shifts')) {
    return jsonResponse(envelope({
      items: [managerShift],
      locations: [{ id: location.id, name: location.name, timezone: location.timezone }],
      manager,
      organisation,
      roleTitles: [worker.roleTitle, 'Healthcare assistant'],
    }, true))
  }
  if (path.endsWith('/compliance-records')) {
    return jsonResponse(envelope({
      administrator,
      items: [complianceRecord],
      summary: { actionDue: 1, current: 4, reviewing: 1, total: 6 },
    }, true))
  }
  if (path.endsWith(`/compliance/${complianceRecord.id}`)) {
    return jsonResponse(envelope({
      administrator,
      history: [{ administrator, decision: 'further_information_required', id: 'e0000000-0000-4000-8000-000000000002', note: 'The synthetic review needs a clearer renewal date.', occurredAt: generatedAt }],
      record: complianceRecord,
      workerReadiness: 'reviewing',
    }))
  }
  if (path.includes('/workers/') && path.endsWith(`/timesheets/${timesheet.id}`)) {
    return jsonResponse(envelope({ timesheet, worker }))
  }
  if (path.includes('/workers/') && path.endsWith('/timesheets')) {
    return jsonResponse(envelope({
      asOfDate: '2026-08-28',
      eligibleAssignments: [{
        assignmentId: '80000000-0000-4000-8000-000000000020',
        endsAt: '2026-08-21T22:00:00.000Z',
        location,
        roleTitle: worker.roleTitle,
        shiftId: '70000000-0000-4000-8000-000000000015',
        startsAt: '2026-08-21T14:00:00.000Z',
      }],
      items: [timesheet],
      worker,
    }, true))
  }
  if (path.includes('/managers/') && path.endsWith('/timesheets')) {
    return jsonResponse(envelope({ items: [{ ...timesheet, rejectedAt: null, managerReviewNote: null, reviewedBy: null, status: 'submitted', submittedAt: generatedAt }], manager }, true))
  }
  if (path.includes('/administrators/') && path.endsWith('/timesheets')) {
    return jsonResponse(envelope({ administrator, items: [timesheet], summary: { approved: 1, draft: 1, rejected: 1, submitted: 1, total: 4 } }, true))
  }
  if (path.endsWith('/compliance')) {
    return jsonResponse(
      envelope(
        {
          administrator,
          items: [
            {
              displayName: worker.displayName,
              nextReviewDate: '2026-09-12',
              previewId: 'AJN-2041',
              readinessStatus: 'ready',
              roleTitle: worker.roleTitle,
              workerId: worker.id,
            },
          ],
          summary: { actionDue: 2, ready: 3, reviewing: 1, total: 6 },
        },
        true,
      ),
    )
  }
  if (path.endsWith('/records')) {
    return jsonResponse(
      envelope(
        {
          administrator,
          items: [
            {
              displayName: worker.displayName,
              lastActivityAt: '2026-08-25T09:42:00.000Z',
              previewId: 'AJN-2041',
              primaryLocation: location,
              readinessStatus: 'ready',
              requirements: { attention: 1, current: 3, total: 4 },
              roleTitle: worker.roleTitle,
              workerId: worker.id,
            },
          ],
        },
        true,
      ),
    )
  }
  if (path.endsWith('/notifications')) {
    const recipientId = url.searchParams.get('recipientId') ?? worker.id
    const recipientItems =
      recipientId === worker.id
        ? [
            {
              createdAt: '2026-08-25T09:48:00.000Z',
              detail: 'The arrival note for Thursday has changed.',
              id: '80000000-0000-4000-8000-000000000001',
              readAt: null,
              recipientId,
              title: 'Shift detail updated',
              tone: 'information',
            },
            {
              createdAt: '2026-08-24T10:15:00.000Z',
              detail: 'Manual handling is due for review in this preview.',
              id: '80000000-0000-4000-8000-000000000002',
              readAt: null,
              recipientId,
              title: 'Readiness review approaching',
              tone: 'warning',
            },
            {
              createdAt: '2026-08-24T08:30:00.000Z',
              detail: 'The synthetic preview profile is up to date.',
              id: '80000000-0000-4000-8000-000000000003',
              readAt: '2026-08-24T09:00:00.000Z',
              recipientId,
              title: 'Profile check complete',
              tone: 'success',
            },
          ]
        : [
            {
              createdAt: '2026-08-25T08:15:00.000Z',
              detail: 'A synthetic update needs attention for this recipient.',
              id:
                recipientId === manager.id
                  ? '80000000-0000-4000-8000-000000000004'
                  : '80000000-0000-4000-8000-000000000006',
              readAt: null,
              recipientId,
              title: 'Preview update needs review',
              tone: 'warning',
            },
          ]
    const items =
      url.searchParams.get('unread') === 'true'
        ? recipientItems.filter((notification) => notification.readAt === null)
        : recipientItems
    return jsonResponse(
      envelope(
        {
          items,
          unreadCount: recipientItems.filter(
            (notification) => notification.readAt === null,
          ).length,
        },
        true,
      ),
    )
  }

  return jsonResponse(
    { error: { code: 'NOT_FOUND', message: 'Not found.', requestId } },
    404,
  )
}

export function installPreviewApiMock(): MockInstance {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input, init) => Promise.resolve(previewApiResponse(input, init)))
}

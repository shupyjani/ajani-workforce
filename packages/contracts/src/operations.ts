import { z } from 'zod'
import {
  paginatedResponseMetaSchema,
  paginationQuerySchema,
  responseMetaSchema,
} from './common.js'
import {
  locationSummarySchema,
  organisationSummarySchema,
  personaSummarySchema,
  previewApiBaseRoute,
  readinessStatusSchema,
} from './preview.js'

const shortTextSchema = z.string().trim().min(1).max(160)
const noteSchema = z.string().trim().min(1).max(500)
const reasonSchema = z.string().trim().min(12).max(240)
const versionSchema = z.number().int().positive()
const countSchema = z.number().int().nonnegative()

export const operationsIdempotencyHeaderSchema = z.strictObject({
  idempotencyKey: z.uuid(),
})

export const operationsRouteTemplates = {
  managerAssignmentRequests: `${previewApiBaseRoute}/managers/:managerId/assignment-requests`,
  managerAssignmentDecision: `${previewApiBaseRoute}/managers/:managerId/assignment-requests/:assignmentId/decision`,
  managerShifts: `${previewApiBaseRoute}/managers/:managerId/shifts`,
  managerShiftDetail: `${previewApiBaseRoute}/managers/:managerId/shifts/:shiftId`,
  managerShiftPublish: `${previewApiBaseRoute}/managers/:managerId/shifts/:shiftId/publish`,
  managerShiftCancel: `${previewApiBaseRoute}/managers/:managerId/shifts/:shiftId/cancel`,
  managerTimesheets: `${previewApiBaseRoute}/managers/:managerId/timesheets`,
  managerTimesheetDecision: `${previewApiBaseRoute}/managers/:managerId/timesheets/:timesheetId/decision`,
  administratorComplianceRecords: `${previewApiBaseRoute}/administrators/:administratorId/compliance-records`,
  administratorComplianceRecord: `${previewApiBaseRoute}/administrators/:administratorId/compliance/:recordId`,
  administratorComplianceDecision: `${previewApiBaseRoute}/administrators/:administratorId/compliance/:recordId/decision`,
  administratorTimesheets: `${previewApiBaseRoute}/administrators/:administratorId/timesheets`,
  workerTimesheets: `${previewApiBaseRoute}/workers/:workerId/timesheets`,
  workerTimesheetDetail: `${previewApiBaseRoute}/workers/:workerId/timesheets/:timesheetId`,
  workerTimesheetSubmit: `${previewApiBaseRoute}/workers/:workerId/timesheets/:timesheetId/submit`,
} as const

export const operationsRoutes = {
  managerAssignmentRequests: (managerId: string) =>
    `${previewApiBaseRoute}/managers/${encodeURIComponent(managerId)}/assignment-requests`,
  managerAssignmentDecision: (managerId: string, assignmentId: string) =>
    `${previewApiBaseRoute}/managers/${encodeURIComponent(managerId)}/assignment-requests/${encodeURIComponent(assignmentId)}/decision`,
  managerShifts: (managerId: string) =>
    `${previewApiBaseRoute}/managers/${encodeURIComponent(managerId)}/shifts`,
  managerShiftDetail: (managerId: string, shiftId: string) =>
    `${previewApiBaseRoute}/managers/${encodeURIComponent(managerId)}/shifts/${encodeURIComponent(shiftId)}`,
  managerShiftPublish: (managerId: string, shiftId: string) =>
    `${previewApiBaseRoute}/managers/${encodeURIComponent(managerId)}/shifts/${encodeURIComponent(shiftId)}/publish`,
  managerShiftCancel: (managerId: string, shiftId: string) =>
    `${previewApiBaseRoute}/managers/${encodeURIComponent(managerId)}/shifts/${encodeURIComponent(shiftId)}/cancel`,
  managerTimesheets: (managerId: string) =>
    `${previewApiBaseRoute}/managers/${encodeURIComponent(managerId)}/timesheets`,
  managerTimesheetDecision: (managerId: string, timesheetId: string) =>
    `${previewApiBaseRoute}/managers/${encodeURIComponent(managerId)}/timesheets/${encodeURIComponent(timesheetId)}/decision`,
  administratorComplianceRecords: (administratorId: string) =>
    `${previewApiBaseRoute}/administrators/${encodeURIComponent(administratorId)}/compliance-records`,
  administratorComplianceRecord: (
    administratorId: string,
    recordId: string,
  ) =>
    `${previewApiBaseRoute}/administrators/${encodeURIComponent(administratorId)}/compliance/${encodeURIComponent(recordId)}`,
  administratorComplianceDecision: (
    administratorId: string,
    recordId: string,
  ) =>
    `${previewApiBaseRoute}/administrators/${encodeURIComponent(administratorId)}/compliance/${encodeURIComponent(recordId)}/decision`,
  administratorTimesheets: (administratorId: string) =>
    `${previewApiBaseRoute}/administrators/${encodeURIComponent(administratorId)}/timesheets`,
  workerTimesheets: (workerId: string) =>
    `${previewApiBaseRoute}/workers/${encodeURIComponent(workerId)}/timesheets`,
  workerTimesheetDetail: (workerId: string, timesheetId: string) =>
    `${previewApiBaseRoute}/workers/${encodeURIComponent(workerId)}/timesheets/${encodeURIComponent(timesheetId)}`,
  workerTimesheetSubmit: (workerId: string, timesheetId: string) =>
    `${previewApiBaseRoute}/workers/${encodeURIComponent(workerId)}/timesheets/${encodeURIComponent(timesheetId)}/submit`,
} as const

export const managerAssignmentIdParamsSchema = z.strictObject({
  managerId: z.uuid(),
  assignmentId: z.uuid(),
})

export const managerShiftIdParamsSchema = z.strictObject({
  managerId: z.uuid(),
  shiftId: z.uuid(),
})

export const managerTimesheetIdParamsSchema = z.strictObject({
  managerId: z.uuid(),
  timesheetId: z.uuid(),
})

export const administratorComplianceRecordIdParamsSchema = z.strictObject({
  administratorId: z.uuid(),
  recordId: z.uuid(),
})

export const workerTimesheetIdParamsSchema = z.strictObject({
  workerId: z.uuid(),
  timesheetId: z.uuid(),
})

export const managerAssignmentRequestsQuerySchema = paginationQuerySchema

export const managerAssignmentRequestSchema = z.strictObject({
  assignmentId: z.uuid(),
  version: versionSchema,
  requestedAt: z.iso.datetime({ offset: true }),
  worker: personaSummarySchema.extend({
    organisationId: z.uuid(),
    readinessStatus: readinessStatusSchema,
    status: z.enum(['active', 'inactive']),
  }),
  shift: z.strictObject({
    id: z.uuid(),
    location: locationSummarySchema,
    roleTitle: shortTextSchema,
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    requiredWorkers: z.number().int().positive(),
    confirmedWorkers: countSchema,
    reviewWorkers: countSchema,
  }),
})

export const managerAssignmentRequestsDataSchema = z.strictObject({
  manager: personaSummarySchema,
  organisation: organisationSummarySchema,
  items: z.array(managerAssignmentRequestSchema),
})

export const managerAssignmentRequestsResponseSchema = z.strictObject({
  data: managerAssignmentRequestsDataSchema,
  meta: paginatedResponseMetaSchema,
})

export const managerAssignmentDecisionBodySchema = z.discriminatedUnion(
  'decision',
  [
    z.strictObject({
      decision: z.literal('approve'),
      expectedVersion: versionSchema,
    }),
    z.strictObject({
      decision: z.literal('decline'),
      expectedVersion: versionSchema,
      reason: reasonSchema,
    }),
  ],
)

export const managerAssignmentDecisionDataSchema = z.strictObject({
  assignmentId: z.uuid(),
  status: z.enum(['confirmed', 'declined']),
  version: versionSchema,
  decidedAt: z.iso.datetime({ offset: true }),
  reason: shortTextSchema.nullable(),
  message: z.string().trim().min(1).max(500),
  idempotentReplay: z.boolean(),
})

export const managerAssignmentDecisionResponseSchema = z.strictObject({
  data: managerAssignmentDecisionDataSchema,
  meta: responseMetaSchema,
})

export const managerShiftStatusSchema = z.enum([
  'draft',
  'open',
  'covered',
  'cancelled',
  'completed',
])

export const managerShiftsQuerySchema = paginationQuerySchema.extend({
  status: managerShiftStatusSchema.optional(),
})

export const managerShiftSchema = z.strictObject({
  id: z.uuid(),
  organisation: organisationSummarySchema,
  location: locationSummarySchema,
  roleTitle: shortTextSchema,
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  requiredWorkers: z.number().int().min(1).max(50),
  confirmedWorkers: countSchema,
  reviewWorkers: countSchema,
  status: managerShiftStatusSchema,
  arrivalNote: z.string().trim().max(240).nullable(),
  cancelledAt: z.iso.datetime({ offset: true }).nullable(),
  cancellationReason: z.string().trim().max(240).nullable(),
  version: versionSchema,
})

export const managerShiftsDataSchema = z.strictObject({
  manager: personaSummarySchema,
  organisation: organisationSummarySchema,
  locations: z.array(locationSummarySchema.omit({ area: true })),
  roleTitles: z.array(shortTextSchema),
  items: z.array(managerShiftSchema),
})

export const managerShiftsResponseSchema = z.strictObject({
  data: managerShiftsDataSchema,
  meta: paginatedResponseMetaSchema,
})

export const managerShiftDetailDataSchema = z.strictObject({
  manager: personaSummarySchema,
  shift: managerShiftSchema,
})

export const managerShiftDetailResponseSchema = z.strictObject({
  data: managerShiftDetailDataSchema,
  meta: responseMetaSchema,
})

const shiftFieldsSchema = z.strictObject({
  locationId: z.uuid(),
  areaName: z.string().trim().min(2).max(80),
  roleTitle: shortTextSchema,
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  requiredWorkers: z.number().int().min(1).max(50),
  arrivalNote: z.string().trim().max(240).nullable().default(null),
})

function validateShiftWindow(
  value: { readonly startsAt: string; readonly endsAt: string },
  context: z.RefinementCtx,
): void {
  const duration = Date.parse(value.endsAt) - Date.parse(value.startsAt)
  if (duration <= 0) {
    context.addIssue({
      code: 'custom',
      message: 'End time must be after start time.',
      path: ['endsAt'],
    })
  } else if (duration < 60 * 60 * 1_000 || duration > 24 * 60 * 60 * 1_000) {
    context.addIssue({
      code: 'custom',
      message: 'Shift duration must be between 1 and 24 hours.',
      path: ['endsAt'],
    })
  }
}

export const managerShiftCreateBodySchema = shiftFieldsSchema.superRefine(
  validateShiftWindow,
)

export const managerShiftUpdateBodySchema = shiftFieldsSchema
  .extend({ expectedVersion: versionSchema })
  .superRefine(validateShiftWindow)

export const versionedMutationBodySchema = z.strictObject({
  expectedVersion: versionSchema,
})

export const managerShiftCancelBodySchema = z.strictObject({
  expectedVersion: versionSchema,
  reason: reasonSchema,
})

export const managerShiftMutationDataSchema = z.strictObject({
  shift: managerShiftSchema,
  message: z.string().trim().min(1).max(500),
  idempotentReplay: z.boolean(),
})

export const managerShiftMutationResponseSchema = z.strictObject({
  data: managerShiftMutationDataSchema,
  meta: responseMetaSchema,
})

export const complianceRecordReviewStatusSchema = z.enum([
  'current',
  'due_soon',
  'action_due',
  'reviewing',
  'information_required',
  'rejected',
])

export const administratorComplianceRecordsQuerySchema = paginationQuerySchema.extend({
  status: complianceRecordReviewStatusSchema.optional(),
})

export const complianceRecordSummarySchema = z.strictObject({
  id: z.uuid(),
  version: versionSchema,
  status: complianceRecordReviewStatusSchema,
  worker: personaSummarySchema,
  previewId: z.string().regex(/^AJN-\d{4}$/),
  primaryLocation: locationSummarySchema.nullable(),
  requirement: z.strictObject({
    id: z.uuid(),
    name: shortTextSchema,
    description: z.string().trim().min(1).max(500),
  }),
  reviewedOn: z.iso.date().nullable(),
  dueOn: z.iso.date().nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
})

export const administratorComplianceRecordsDataSchema = z.strictObject({
  administrator: personaSummarySchema,
  summary: z.strictObject({
    current: countSchema,
    reviewing: countSchema,
    actionDue: countSchema,
    total: countSchema,
  }),
  items: z.array(complianceRecordSummarySchema),
})

export const administratorComplianceRecordsResponseSchema = z.strictObject({
  data: administratorComplianceRecordsDataSchema,
  meta: paginatedResponseMetaSchema,
})

export const complianceDecisionSchema = z.enum([
  'approved_current',
  'further_information_required',
  'rejected',
])

export const complianceReviewHistorySchema = z.strictObject({
  id: z.uuid(),
  decision: complianceDecisionSchema,
  note: noteSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  administrator: personaSummarySchema,
})

export const administratorComplianceRecordDataSchema = z.strictObject({
  administrator: personaSummarySchema,
  record: complianceRecordSummarySchema,
  workerReadiness: readinessStatusSchema,
  history: z.array(complianceReviewHistorySchema),
})

export const administratorComplianceRecordResponseSchema = z.strictObject({
  data: administratorComplianceRecordDataSchema,
  meta: responseMetaSchema,
})

export const administratorComplianceDecisionBodySchema = z.discriminatedUnion(
  'decision',
  [
    z.strictObject({
      decision: z.literal('approved_current'),
      expectedVersion: versionSchema,
      note: z.string().trim().min(1).max(500).default('Review completed and the synthetic record is current.'),
    }),
    z.strictObject({
      decision: z.literal('further_information_required'),
      expectedVersion: versionSchema,
      note: noteSchema.min(12),
    }),
    z.strictObject({
      decision: z.literal('rejected'),
      expectedVersion: versionSchema,
      note: noteSchema.min(12),
    }),
  ],
)

export const administratorComplianceDecisionDataSchema = z.strictObject({
  record: complianceRecordSummarySchema,
  workerReadiness: readinessStatusSchema,
  message: z.string().trim().min(1).max(500),
  idempotentReplay: z.boolean(),
})

export const administratorComplianceDecisionResponseSchema = z.strictObject({
  data: administratorComplianceDecisionDataSchema,
  meta: responseMetaSchema,
})

export const timesheetStatusSchema = z.enum([
  'draft',
  'submitted',
  'rejected',
  'approved',
])

export const timesheetSchema = z.strictObject({
  id: z.uuid(),
  assignmentId: z.uuid(),
  worker: personaSummarySchema,
  organisation: organisationSummarySchema,
  shift: z.strictObject({
    id: z.uuid(),
    location: locationSummarySchema,
    roleTitle: shortTextSchema,
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  }),
  workedStart: z.iso.datetime({ offset: true }),
  workedEnd: z.iso.datetime({ offset: true }),
  breakMinutes: z.number().int().min(0).max(360),
  workedMinutes: z.number().int().positive().max(1_440),
  workerNote: z.string().trim().max(500).nullable(),
  managerReviewNote: z.string().trim().max(500).nullable(),
  status: timesheetStatusSchema,
  version: versionSchema,
  submittedAt: z.iso.datetime({ offset: true }).nullable(),
  approvedAt: z.iso.datetime({ offset: true }).nullable(),
  rejectedAt: z.iso.datetime({ offset: true }).nullable(),
  reviewedBy: personaSummarySchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
})

export const eligibleTimesheetAssignmentSchema = z.strictObject({
  assignmentId: z.uuid(),
  shiftId: z.uuid(),
  location: locationSummarySchema,
  roleTitle: shortTextSchema,
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
})

export const timesheetsQuerySchema = paginationQuerySchema.extend({
  status: timesheetStatusSchema.optional(),
})

export const workerTimesheetsDataSchema = z.strictObject({
  worker: personaSummarySchema,
  asOfDate: z.iso.date(),
  items: z.array(timesheetSchema),
  eligibleAssignments: z.array(eligibleTimesheetAssignmentSchema),
})

export const workerTimesheetsResponseSchema = z.strictObject({
  data: workerTimesheetsDataSchema,
  meta: paginatedResponseMetaSchema,
})

export const workerTimesheetDetailDataSchema = z.strictObject({
  worker: personaSummarySchema,
  timesheet: timesheetSchema,
})

export const workerTimesheetDetailResponseSchema = z.strictObject({
  data: workerTimesheetDetailDataSchema,
  meta: responseMetaSchema,
})

const timesheetFieldsSchema = z.strictObject({
  workedStart: z.iso.datetime({ offset: true }),
  workedEnd: z.iso.datetime({ offset: true }),
  breakMinutes: z.number().int().min(0).max(360),
  workerNote: z.string().trim().max(500).nullable().default(null),
})

function validateTimesheetWindow(
  value: {
    readonly workedStart: string
    readonly workedEnd: string
    readonly breakMinutes: number
  },
  context: z.RefinementCtx,
): void {
  const intervalMinutes =
    (Date.parse(value.workedEnd) - Date.parse(value.workedStart)) / 60_000
  if (intervalMinutes <= 0) {
    context.addIssue({
      code: 'custom',
      message: 'Worked end must be after worked start.',
      path: ['workedEnd'],
    })
  } else if (intervalMinutes > 24 * 60) {
    context.addIssue({
      code: 'custom',
      message: 'A worked interval cannot exceed 24 hours.',
      path: ['workedEnd'],
    })
  }
  if (value.breakMinutes >= intervalMinutes) {
    context.addIssue({
      code: 'custom',
      message: 'Break minutes must be shorter than the worked interval.',
      path: ['breakMinutes'],
    })
  }
}

export const workerTimesheetCreateBodySchema = timesheetFieldsSchema
  .extend({ assignmentId: z.uuid() })
  .superRefine(validateTimesheetWindow)

export const workerTimesheetUpdateBodySchema = timesheetFieldsSchema
  .extend({ expectedVersion: versionSchema })
  .superRefine(validateTimesheetWindow)

export const workerTimesheetSubmitBodySchema = versionedMutationBodySchema

export const workerTimesheetMutationDataSchema = z.strictObject({
  timesheet: timesheetSchema,
  message: z.string().trim().min(1).max(500),
  idempotentReplay: z.boolean(),
})

export const workerTimesheetMutationResponseSchema = z.strictObject({
  data: workerTimesheetMutationDataSchema,
  meta: responseMetaSchema,
})

export const managerTimesheetsDataSchema = z.strictObject({
  manager: personaSummarySchema,
  items: z.array(timesheetSchema),
})

export const managerTimesheetsResponseSchema = z.strictObject({
  data: managerTimesheetsDataSchema,
  meta: paginatedResponseMetaSchema,
})

export const managerTimesheetDecisionBodySchema = z.discriminatedUnion(
  'decision',
  [
    z.strictObject({
      decision: z.literal('approve'),
      expectedVersion: versionSchema,
      reviewNote: z.string().trim().max(500).nullable().default(null),
    }),
    z.strictObject({
      decision: z.literal('reject'),
      expectedVersion: versionSchema,
      reviewNote: noteSchema.min(12),
    }),
  ],
)

export const administratorTimesheetsDataSchema = z.strictObject({
  administrator: personaSummarySchema,
  summary: z.strictObject({
    draft: countSchema,
    submitted: countSchema,
    rejected: countSchema,
    approved: countSchema,
    total: countSchema,
  }),
  items: z.array(timesheetSchema),
})

export const administratorTimesheetsResponseSchema = z.strictObject({
  data: administratorTimesheetsDataSchema,
  meta: paginatedResponseMetaSchema,
})

export type AdministratorComplianceDecisionBody = z.infer<typeof administratorComplianceDecisionBodySchema>
export type AdministratorComplianceDecisionData = z.infer<typeof administratorComplianceDecisionDataSchema>
export type AdministratorComplianceRecordData = z.infer<typeof administratorComplianceRecordDataSchema>
export type AdministratorComplianceRecordsData = z.infer<typeof administratorComplianceRecordsDataSchema>
export type AdministratorComplianceRecordsQuery = z.infer<typeof administratorComplianceRecordsQuerySchema>
export type AdministratorTimesheetsData = z.infer<typeof administratorTimesheetsDataSchema>
export type ComplianceRecordReviewStatus = z.infer<typeof complianceRecordReviewStatusSchema>
export type ManagerAssignmentDecisionBody = z.infer<typeof managerAssignmentDecisionBodySchema>
export type ManagerAssignmentDecisionData = z.infer<typeof managerAssignmentDecisionDataSchema>
export type ManagerAssignmentRequest = z.infer<typeof managerAssignmentRequestSchema>
export type ManagerAssignmentRequestsData = z.infer<typeof managerAssignmentRequestsDataSchema>
export type ManagerAssignmentRequestsQuery = z.infer<typeof managerAssignmentRequestsQuerySchema>
export type ManagerShift = z.infer<typeof managerShiftSchema>
export type ManagerShiftCancelBody = z.infer<typeof managerShiftCancelBodySchema>
export type ManagerShiftCreateBody = z.infer<typeof managerShiftCreateBodySchema>
export type ManagerShiftDetailData = z.infer<typeof managerShiftDetailDataSchema>
export type ManagerShiftMutationData = z.infer<typeof managerShiftMutationDataSchema>
export type ManagerShiftsData = z.infer<typeof managerShiftsDataSchema>
export type ManagerShiftsQuery = z.infer<typeof managerShiftsQuerySchema>
export type ManagerShiftStatus = z.infer<typeof managerShiftStatusSchema>
export type ManagerShiftUpdateBody = z.infer<typeof managerShiftUpdateBodySchema>
export type ManagerTimesheetDecisionBody = z.infer<typeof managerTimesheetDecisionBodySchema>
export type ManagerTimesheetsData = z.infer<typeof managerTimesheetsDataSchema>
export type Timesheet = z.infer<typeof timesheetSchema>
export type TimesheetStatus = z.infer<typeof timesheetStatusSchema>
export type TimesheetsQuery = z.infer<typeof timesheetsQuerySchema>
export type WorkerTimesheetCreateBody = z.infer<typeof workerTimesheetCreateBodySchema>
export type WorkerTimesheetDetailData = z.infer<typeof workerTimesheetDetailDataSchema>
export type WorkerTimesheetMutationData = z.infer<typeof workerTimesheetMutationDataSchema>
export type WorkerTimesheetUpdateBody = z.infer<typeof workerTimesheetUpdateBodySchema>
export type WorkerTimesheetsData = z.infer<typeof workerTimesheetsDataSchema>

import { z } from 'zod'
import {
  paginatedResponseMetaSchema,
  paginationQuerySchema,
  responseMetaSchema,
} from './common.js'

const shortTextSchema = z.string().trim().min(1).max(160)
const descriptionSchema = z.string().trim().min(1).max(500)
const nonNegativeCountSchema = z.number().int().nonnegative()

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format()
      return true
    } catch {
      return false
    }
  }, 'Timezone must be a valid IANA timezone')

export const previewApiBaseRoute = '/api/v1/preview' as const

export const previewPersonaIds = {
  worker: '30000000-0000-4000-8000-000000000001',
  manager: '30000000-0000-4000-8000-000000000007',
  administrator: '30000000-0000-4000-8000-000000000008',
} as const

export const previewRouteTemplates = {
  workerOverview: `${previewApiBaseRoute}/workers/:workerId/overview`,
  workerReadiness: `${previewApiBaseRoute}/workers/:workerId/readiness`,
  workerShifts: `${previewApiBaseRoute}/workers/:workerId/shifts`,
  workerShiftDetail: `${previewApiBaseRoute}/workers/:workerId/shifts/:shiftId`,
  workerSchedule: `${previewApiBaseRoute}/workers/:workerId/schedule`,
  workerShiftAssignments: `${previewApiBaseRoute}/workers/:workerId/shift-assignments`,
  workerShiftAssignmentCancellation: `${previewApiBaseRoute}/workers/:workerId/shift-assignments/:assignmentId/cancel`,
  managerOperations: `${previewApiBaseRoute}/managers/:managerId/operations`,
  managerCoverage: `${previewApiBaseRoute}/managers/:managerId/coverage`,
  administratorCompliance: `${previewApiBaseRoute}/administrators/:administratorId/compliance`,
  administratorRecords: `${previewApiBaseRoute}/administrators/:administratorId/records`,
  notifications: `${previewApiBaseRoute}/notifications`,
} as const

function previewEntityRoute(
  collection: 'workers' | 'managers' | 'administrators',
  id: string,
  view:
    | 'overview'
    | 'readiness'
    | 'operations'
    | 'coverage'
    | 'compliance'
    | 'records',
): string {
  return `${previewApiBaseRoute}/${collection}/${encodeURIComponent(id)}/${view}`
}

export const previewRoutes = {
  workerOverview: (workerId: string) =>
    previewEntityRoute('workers', workerId, 'overview'),
  workerReadiness: (workerId: string) =>
    previewEntityRoute('workers', workerId, 'readiness'),
  workerShifts: (workerId: string) =>
    `${previewApiBaseRoute}/workers/${encodeURIComponent(workerId)}/shifts`,
  workerShiftDetail: (workerId: string, shiftId: string) =>
    `${previewApiBaseRoute}/workers/${encodeURIComponent(workerId)}/shifts/${encodeURIComponent(shiftId)}`,
  workerSchedule: (workerId: string) =>
    `${previewApiBaseRoute}/workers/${encodeURIComponent(workerId)}/schedule`,
  workerShiftAssignments: (workerId: string) =>
    `${previewApiBaseRoute}/workers/${encodeURIComponent(workerId)}/shift-assignments`,
  workerShiftAssignmentCancellation: (
    workerId: string,
    assignmentId: string,
  ) =>
    `${previewApiBaseRoute}/workers/${encodeURIComponent(workerId)}/shift-assignments/${encodeURIComponent(assignmentId)}/cancel`,
  managerOperations: (managerId: string) =>
    previewEntityRoute('managers', managerId, 'operations'),
  managerCoverage: (managerId: string) =>
    previewEntityRoute('managers', managerId, 'coverage'),
  administratorCompliance: (administratorId: string) =>
    previewEntityRoute('administrators', administratorId, 'compliance'),
  administratorRecords: (administratorId: string) =>
    previewEntityRoute('administrators', administratorId, 'records'),
  notifications: previewRouteTemplates.notifications,
} as const

export const workerIdParamsSchema = z.strictObject({
  workerId: z.uuid(),
})

export const workerShiftIdParamsSchema = workerIdParamsSchema.extend({
  shiftId: z.uuid(),
})

export const workerAssignmentIdParamsSchema = workerIdParamsSchema.extend({
  assignmentId: z.uuid(),
})

export const managerIdParamsSchema = z.strictObject({
  managerId: z.uuid(),
})

export const administratorIdParamsSchema = z.strictObject({
  administratorId: z.uuid(),
})

export const previewSnapshotQuerySchema = z.strictObject({})

export const readinessStatusSchema = z.enum([
  'ready',
  'action_due',
  'reviewing',
])

export const requirementStatusSchema = z.enum([
  'current',
  'due_soon',
  'overdue',
  'reviewing',
])

export const shiftPreviewStatusSchema = z.enum(['confirmed', 'needs_review'])
export const coverageStatusSchema = z.enum(['covered', 'open'])
export const notificationToneSchema = z.enum([
  'information',
  'warning',
  'success',
])

export const personaSummarySchema = z.strictObject({
  id: z.uuid(),
  displayName: shortTextSchema,
  roleTitle: shortTextSchema,
})

export const organisationSummarySchema = z.strictObject({
  id: z.uuid(),
  name: shortTextSchema,
})

export const locationSummarySchema = z.strictObject({
  id: z.uuid(),
  name: shortTextSchema,
  area: shortTextSchema,
  timezone: timeZoneSchema,
})

export const shiftPreviewSchema = z.strictObject({
  id: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  roleTitle: shortTextSchema,
  organisation: organisationSummarySchema,
  location: locationSummarySchema,
  arrivalNote: shortTextSchema.nullable(),
  status: shiftPreviewStatusSchema,
})

export const activityPreviewSchema = z.strictObject({
  id: z.uuid(),
  title: shortTextSchema,
  description: descriptionSchema,
  occurredAt: z.iso.datetime({ offset: true }),
})

export const workerOverviewDataSchema = z.strictObject({
  worker: personaSummarySchema,
  asOfDate: z.iso.date(),
  readiness: z.strictObject({
    status: readinessStatusSchema,
    currentRequirements: nonNegativeCountSchema,
    totalRequirements: nonNegativeCountSchema,
  }),
  upcomingShifts: z.array(shiftPreviewSchema),
  recentActivity: z.array(activityPreviewSchema),
})

export const workerOverviewResponseSchema = z.strictObject({
  data: workerOverviewDataSchema,
  meta: responseMetaSchema,
})

export const readinessRequirementSchema = z.strictObject({
  id: z.uuid(),
  name: shortTextSchema,
  status: requirementStatusSchema,
  summary: descriptionSchema,
  reviewedAt: z.iso.datetime({ offset: true }).nullable(),
  dueDate: z.iso.date().nullable(),
})

export const workerReadinessDataSchema = z.strictObject({
  worker: personaSummarySchema,
  asOfDate: z.iso.date(),
  status: readinessStatusSchema,
  currentRequirements: nonNegativeCountSchema,
  totalRequirements: nonNegativeCountSchema,
  nextReviewDate: z.iso.date().nullable(),
  requirements: z.array(readinessRequirementSchema),
})

export const workerReadinessResponseSchema = z.strictObject({
  data: workerReadinessDataSchema,
  meta: responseMetaSchema,
})

export const workerAssignmentStatusSchema = z.enum([
  'confirmed',
  'under_review',
  'cancelled',
  'declined',
])

export const workerShiftEligibilityOutcomeSchema = z.enum([
  'eligible',
  'under_review',
  'already_assigned',
  'blocked',
  'unavailable',
])

export const workerShiftAvailabilitySchema = z.strictObject({
  status: z.enum(['open', 'covered', 'cancelled']),
  requiredWorkers: z.number().int().positive(),
  reservedWorkers: nonNegativeCountSchema,
  remainingPlaces: nonNegativeCountSchema,
})

export const workerShiftEligibilitySchema = z.strictObject({
  outcome: workerShiftEligibilityOutcomeSchema,
  title: shortTextSchema,
  detail: descriptionSchema,
})

export const workerShiftSummarySchema = z.strictObject({
  id: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().positive(),
  roleTitle: shortTextSchema,
  organisation: organisationSummarySchema,
  location: locationSummarySchema,
  availability: workerShiftAvailabilitySchema,
  eligibility: workerShiftEligibilitySchema,
  existingAssignmentId: z.uuid().nullable(),
})

export const workerShiftDetailSchema = workerShiftSummarySchema.extend({
  arrivalNote: shortTextSchema.nullable(),
})

const workerShiftDateQuerySchema = z.iso.date()

export const workerShiftsQuerySchema = paginationQuerySchema
  .extend({
    from: workerShiftDateQuerySchema.optional(),
    to: workerShiftDateQuerySchema.optional(),
    locationId: z.uuid().optional(),
    availability: z.enum(['available', 'all']).default('available'),
  })
  .superRefine((value, context) => {
    if (value.from !== undefined && value.to !== undefined && value.to < value.from) {
      context.addIssue({
        code: 'custom',
        message: 'The end date must not be before the start date.',
        path: ['to'],
      })
    }
  })

export const workerShiftLocationFilterSchema = z.strictObject({
  id: z.uuid(),
  name: shortTextSchema,
})

export const workerShiftsDataSchema = z.strictObject({
  worker: personaSummarySchema,
  asOfDate: z.iso.date(),
  locations: z.array(workerShiftLocationFilterSchema),
  items: z.array(workerShiftSummarySchema),
})

export const workerShiftsResponseSchema = z.strictObject({
  data: workerShiftsDataSchema,
  meta: paginatedResponseMetaSchema,
})

export const workerShiftDetailDataSchema = z.strictObject({
  worker: personaSummarySchema,
  asOfDate: z.iso.date(),
  shift: workerShiftDetailSchema,
})

export const workerShiftDetailResponseSchema = z.strictObject({
  data: workerShiftDetailDataSchema,
  meta: responseMetaSchema,
})

export const workerScheduleQuerySchema = paginationQuerySchema.extend({
  status: workerAssignmentStatusSchema.optional(),
})

export const workerScheduleAssignmentSchema = z.strictObject({
  id: z.uuid(),
  status: workerAssignmentStatusSchema,
  requestedAt: z.iso.datetime({ offset: true }),
  cancelledAt: z.iso.datetime({ offset: true }).nullable(),
  cancellationReason: shortTextSchema.nullable(),
  shift: workerShiftDetailSchema,
})

export const workerScheduleDataSchema = z.strictObject({
  worker: personaSummarySchema,
  asOfDate: z.iso.date(),
  items: z.array(workerScheduleAssignmentSchema),
})

export const workerScheduleResponseSchema = z.strictObject({
  data: workerScheduleDataSchema,
  meta: paginatedResponseMetaSchema,
})

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(
    /^[A-Za-z0-9._:-]+$/,
    'Idempotency key may contain letters, numbers, dots, underscores, colons and hyphens',
  )

export const idempotencyHeaderSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
})

export const workerShiftRequestBodySchema = z.strictObject({
  shiftId: z.uuid(),
})

export const workerAssignmentCancellationBodySchema = z.strictObject({})

export const workerAssignmentMutationSchema = z.strictObject({
  assignment: workerScheduleAssignmentSchema,
  outcome: z.enum(['confirmed', 'under_review', 'cancelled']),
  message: descriptionSchema,
  idempotentReplay: z.boolean(),
})

export const workerShiftRequestResponseSchema = z.strictObject({
  data: workerAssignmentMutationSchema,
  meta: responseMetaSchema,
})

export const workerAssignmentCancellationResponseSchema = z.strictObject({
  data: workerAssignmentMutationSchema,
  meta: responseMetaSchema,
})

export const coverageItemSchema = z.strictObject({
  shiftId: z.uuid(),
  location: locationSummarySchema,
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  requiredWorkers: z.number().int().positive(),
  confirmedWorkers: nonNegativeCountSchema,
  openPositions: nonNegativeCountSchema,
  status: coverageStatusSchema,
})

export const managerOperationsDataSchema = z.strictObject({
  manager: personaSummarySchema,
  organisation: organisationSummarySchema,
  regionName: shortTextSchema,
  asOfDate: z.iso.date(),
  metrics: z.strictObject({
    requiredPositions: nonNegativeCountSchema,
    confirmedAssignments: nonNegativeCountSchema,
    openPositions: nonNegativeCountSchema,
    confirmedWorkers: nonNegativeCountSchema,
    pendingArrivalChecks: nonNegativeCountSchema,
    actionsDue: nonNegativeCountSchema,
    affectedAreas: nonNegativeCountSchema,
  }),
  alerts: z.array(
    z.strictObject({
      id: z.uuid(),
      title: shortTextSchema,
      description: descriptionSchema,
    }),
  ),
  coverage: z.array(coverageItemSchema),
})

export const managerOperationsResponseSchema = z.strictObject({
  data: managerOperationsDataSchema,
  meta: responseMetaSchema,
})

export const managerCoverageDataSchema = z.strictObject({
  manager: personaSummarySchema,
  asOfDate: z.iso.date(),
  window: z.strictObject({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  }),
  items: z.array(coverageItemSchema),
})

export const managerCoverageResponseSchema = z.strictObject({
  data: managerCoverageDataSchema,
  meta: responseMetaSchema,
})

export const complianceQuerySchema = paginationQuerySchema.extend({
  status: readinessStatusSchema.optional(),
})

export const complianceItemSchema = z.strictObject({
  workerId: z.uuid(),
  previewId: z.string().regex(/^AJN-\d{4}$/),
  displayName: shortTextSchema,
  roleTitle: shortTextSchema,
  readinessStatus: readinessStatusSchema,
  nextReviewDate: z.iso.date().nullable(),
})

export const administratorComplianceDataSchema = z.strictObject({
  administrator: personaSummarySchema,
  summary: z.strictObject({
    ready: nonNegativeCountSchema,
    actionDue: nonNegativeCountSchema,
    reviewing: nonNegativeCountSchema,
    total: nonNegativeCountSchema,
  }),
  items: z.array(complianceItemSchema),
})

export const administratorComplianceResponseSchema = z.strictObject({
  data: administratorComplianceDataSchema,
  meta: paginatedResponseMetaSchema,
})

export const administratorRecordsQuerySchema = paginationQuerySchema

export const workforceRecordSchema = z.strictObject({
  workerId: z.uuid(),
  previewId: z.string().regex(/^AJN-\d{4}$/),
  displayName: shortTextSchema,
  roleTitle: shortTextSchema,
  primaryLocation: locationSummarySchema.nullable(),
  readinessStatus: readinessStatusSchema,
  requirements: z.strictObject({
    current: nonNegativeCountSchema,
    attention: nonNegativeCountSchema,
    total: nonNegativeCountSchema,
  }),
  lastActivityAt: z.iso.datetime({ offset: true }).nullable(),
})

export const administratorRecordsDataSchema = z.strictObject({
  administrator: personaSummarySchema,
  items: z.array(workforceRecordSchema),
})

export const administratorRecordsResponseSchema = z.strictObject({
  data: administratorRecordsDataSchema,
  meta: paginatedResponseMetaSchema,
})

const booleanQueryValueSchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')

export const notificationsQuerySchema = paginationQuerySchema.extend({
  recipientId: z.uuid(),
  unread: booleanQueryValueSchema.optional(),
})

export const notificationPreviewSchema = z.strictObject({
  id: z.uuid(),
  recipientId: z.uuid(),
  title: shortTextSchema,
  detail: descriptionSchema,
  createdAt: z.iso.datetime({ offset: true }),
  tone: notificationToneSchema,
  readAt: z.iso.datetime({ offset: true }).nullable(),
})

export const notificationsDataSchema = z.strictObject({
  unreadCount: nonNegativeCountSchema,
  items: z.array(notificationPreviewSchema),
})

export const notificationsResponseSchema = z.strictObject({
  data: notificationsDataSchema,
  meta: paginatedResponseMetaSchema,
})

export type ActivityPreview = z.infer<typeof activityPreviewSchema>
export type AdministratorIdParams = z.infer<
  typeof administratorIdParamsSchema
>
export type AdministratorComplianceData = z.infer<
  typeof administratorComplianceDataSchema
>
export type AdministratorComplianceResponse = z.infer<
  typeof administratorComplianceResponseSchema
>
export type AdministratorRecordsData = z.infer<
  typeof administratorRecordsDataSchema
>
export type AdministratorRecordsResponse = z.infer<
  typeof administratorRecordsResponseSchema
>
export type AdministratorRecordsQuery = z.infer<
  typeof administratorRecordsQuerySchema
>
export type ComplianceItem = z.infer<typeof complianceItemSchema>
export type ComplianceQuery = z.infer<typeof complianceQuerySchema>
export type CoverageItem = z.infer<typeof coverageItemSchema>
export type CoverageStatus = z.infer<typeof coverageStatusSchema>
export type ManagerCoverageData = z.infer<typeof managerCoverageDataSchema>
export type ManagerCoverageResponse = z.infer<
  typeof managerCoverageResponseSchema
>
export type ManagerIdParams = z.infer<typeof managerIdParamsSchema>
export type ManagerOperationsData = z.infer<typeof managerOperationsDataSchema>
export type ManagerOperationsResponse = z.infer<
  typeof managerOperationsResponseSchema
>
export type NotificationPreview = z.infer<typeof notificationPreviewSchema>
export type NotificationsData = z.infer<typeof notificationsDataSchema>
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>
export type NotificationTone = z.infer<typeof notificationToneSchema>
export type OrganisationSummary = z.infer<typeof organisationSummarySchema>
export type PersonaSummary = z.infer<typeof personaSummarySchema>
export type PreviewSnapshotQuery = z.infer<typeof previewSnapshotQuerySchema>
export type ReadinessRequirement = z.infer<typeof readinessRequirementSchema>
export type ReadinessStatus = z.infer<typeof readinessStatusSchema>
export type RequirementStatus = z.infer<typeof requirementStatusSchema>
export type ShiftPreview = z.infer<typeof shiftPreviewSchema>
export type ShiftPreviewStatus = z.infer<typeof shiftPreviewStatusSchema>
export type TimeZone = z.infer<typeof timeZoneSchema>
export type WorkerOverviewData = z.infer<typeof workerOverviewDataSchema>
export type WorkerOverviewResponse = z.infer<typeof workerOverviewResponseSchema>
export type WorkerIdParams = z.infer<typeof workerIdParamsSchema>
export type WorkerReadinessData = z.infer<typeof workerReadinessDataSchema>
export type WorkerReadinessResponse = z.infer<typeof workerReadinessResponseSchema>
export type WorkerAssignmentCancellationBody = z.infer<
  typeof workerAssignmentCancellationBodySchema
>
export type WorkerAssignmentCancellationResponse = z.infer<
  typeof workerAssignmentCancellationResponseSchema
>
export type WorkerAssignmentIdParams = z.infer<
  typeof workerAssignmentIdParamsSchema
>
export type WorkerAssignmentMutation = z.infer<
  typeof workerAssignmentMutationSchema
>
export type WorkerAssignmentStatus = z.infer<
  typeof workerAssignmentStatusSchema
>
export type WorkerScheduleAssignment = z.infer<
  typeof workerScheduleAssignmentSchema
>
export type WorkerScheduleData = z.infer<typeof workerScheduleDataSchema>
export type WorkerScheduleQuery = z.infer<typeof workerScheduleQuerySchema>
export type WorkerScheduleResponse = z.infer<typeof workerScheduleResponseSchema>
export type WorkerShiftDetail = z.infer<typeof workerShiftDetailSchema>
export type WorkerShiftDetailData = z.infer<
  typeof workerShiftDetailDataSchema
>
export type WorkerShiftDetailResponse = z.infer<
  typeof workerShiftDetailResponseSchema
>
export type WorkerShiftEligibility = z.infer<
  typeof workerShiftEligibilitySchema
>
export type WorkerShiftEligibilityOutcome = z.infer<
  typeof workerShiftEligibilityOutcomeSchema
>
export type WorkerShiftIdParams = z.infer<typeof workerShiftIdParamsSchema>
export type WorkerShiftRequestBody = z.infer<typeof workerShiftRequestBodySchema>
export type WorkerShiftRequestResponse = z.infer<
  typeof workerShiftRequestResponseSchema
>
export type WorkerShiftsData = z.infer<typeof workerShiftsDataSchema>
export type WorkerShiftsQuery = z.infer<typeof workerShiftsQuerySchema>
export type WorkerShiftsResponse = z.infer<typeof workerShiftsResponseSchema>
export type WorkerShiftSummary = z.infer<typeof workerShiftSummarySchema>
export type WorkforceRecord = z.infer<typeof workforceRecordSchema>

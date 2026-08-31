import { z } from 'zod'

export const healthRoute = '/health' as const
export const livenessRoute = '/live' as const
export const readinessRoute = '/ready' as const
export const requestIdHeaderName = 'x-request-id' as const
export const syntheticPreviewSource = 'synthetic-preview' as const

export const healthResponseSchema = z.strictObject({
  status: z.literal('ok'),
  service: z.literal('ajani-workforce-api'),
  timestamp: z.iso.datetime({ offset: true }),
  requestId: z.string().min(1),
})

export const readinessResponseSchema = z.strictObject({
  status: z.enum(['ready', 'not_ready']),
  service: z.literal('ajani-workforce-api'),
  timestamp: z.iso.datetime({ offset: true }),
  requestId: z.string().min(1),
})

export const apiErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'NOT_FOUND',
  'SHIFT_UNAVAILABLE',
  'SHIFT_FULL',
  'ASSIGNMENT_ALREADY_ACTIVE',
  'SCHEDULE_OVERLAP',
  'READINESS_REQUIRED',
  'IDEMPOTENCY_CONFLICT',
  'CANCELLATION_NOT_ALLOWED',
  'ASSIGNMENT_NOT_REVIEWABLE',
  'VERSION_CONFLICT',
  'SHIFT_LIFECYCLE_CONFLICT',
  'COMPLIANCE_NOT_REVIEWABLE',
  'TIMESHEET_NOT_ELIGIBLE',
  'TIMESHEET_LIFECYCLE_CONFLICT',
  'ORGANISATION_SCOPE_MISMATCH',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
  'INTERNAL_SERVER_ERROR',
])

export const apiErrorDetailSchema = z.strictObject({
  field: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(240),
})

export const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: apiErrorCodeSchema,
    message: z.string().trim().min(1).max(240),
    requestId: z.string().min(1),
    details: z.array(apiErrorDetailSchema).min(1).max(20).optional(),
  }),
})

export const responseMetaSchema = z.strictObject({
  requestId: z.uuid(),
  generatedAt: z.iso.datetime({ offset: true }),
  source: z.literal(syntheticPreviewSource),
})

export const cursorSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, 'Cursor must be an opaque base64url value')

export const pageLimitSchema = z.coerce.number().int().min(1).max(50)

export const paginationQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: pageLimitSchema.default(20),
})

export const paginationMetaSchema = z.strictObject({
  limit: z.number().int().min(1).max(50),
  nextCursor: cursorSchema.nullable(),
})

export const paginatedResponseMetaSchema = z.strictObject({
  requestId: z.uuid(),
  generatedAt: z.iso.datetime({ offset: true }),
  source: z.literal(syntheticPreviewSource),
  pagination: paginationMetaSchema,
})

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>
export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>
export type ErrorResponse = z.infer<typeof errorResponseSchema>
export type HealthResponse = z.infer<typeof healthResponseSchema>
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>
export type PaginationMeta = z.infer<typeof paginationMetaSchema>
export type PaginationQuery = z.infer<typeof paginationQuerySchema>
export type ResponseMeta = z.infer<typeof responseMetaSchema>

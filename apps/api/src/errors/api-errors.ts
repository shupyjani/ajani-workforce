import type { ApiErrorCode, ApiErrorDetail } from '@ajani/contracts'

export class ApiRequestError extends Error {
  public constructor(
    public readonly statusCode: 400 | 404 | 409 | 422 | 503,
    public readonly code: ApiErrorCode,
    public readonly userMessage: string,
    public readonly details?: readonly ApiErrorDetail[],
  ) {
    super(userMessage)
    this.name = 'ApiRequestError'
  }
}

export function invalidRequestError(
  details: readonly ApiErrorDetail[],
): ApiRequestError {
  return new ApiRequestError(
    400,
    'INVALID_REQUEST',
    'The request contains invalid values.',
    details,
  )
}

export function resourceNotFoundError(message: string): ApiRequestError {
  return new ApiRequestError(404, 'NOT_FOUND', message)
}

export function previewDataUnavailableError(): ApiRequestError {
  return new ApiRequestError(
    503,
    'SERVICE_UNAVAILABLE',
    'Preview data is temporarily unavailable. Please try again.',
  )
}

export function conflictError(
  code:
    | 'SHIFT_UNAVAILABLE'
    | 'SHIFT_FULL'
    | 'ASSIGNMENT_ALREADY_ACTIVE'
    | 'SCHEDULE_OVERLAP'
    | 'IDEMPOTENCY_CONFLICT'
    | 'CANCELLATION_NOT_ALLOWED'
    | 'ASSIGNMENT_NOT_REVIEWABLE'
    | 'VERSION_CONFLICT'
    | 'SHIFT_LIFECYCLE_CONFLICT'
    | 'COMPLIANCE_NOT_REVIEWABLE'
    | 'TIMESHEET_NOT_ELIGIBLE'
    | 'TIMESHEET_LIFECYCLE_CONFLICT'
    | 'ORGANISATION_SCOPE_MISMATCH',
  message: string,
): ApiRequestError {
  return new ApiRequestError(409, code, message)
}

export function readinessRequiredError(message: string): ApiRequestError {
  return new ApiRequestError(422, 'READINESS_REQUIRED', message)
}

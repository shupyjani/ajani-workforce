import type { ApiErrorDetail } from '@ajani/contracts'
import type { z } from 'zod'
import { invalidRequestError } from '../errors/api-errors.js'

export function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)

  if (result.success) {
    return result.data
  }

  const details: ApiErrorDetail[] = result.error.issues
    .slice(0, 20)
    .map((issue) => ({
      field:
        issue.path.length === 0
          ? 'request'
          : issue.path.map((segment) => String(segment)).join('.'),
      message: issue.message.slice(0, 240),
    }))

  throw invalidRequestError(details)
}

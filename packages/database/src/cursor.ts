import { z } from 'zod'
import { InvalidPreviewCursorError } from './repository-types.js'

const complianceCursorSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal('compliance'),
  previewId: z.string().regex(/^AJN-\d{4}$/),
})

const recordsCursorSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal('records'),
  previewId: z.string().regex(/^AJN-\d{4}$/),
})

const notificationsCursorSchema = z.strictObject({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  kind: z.literal('notifications'),
})

const workerShiftsCursorSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal('worker-shifts'),
  startsAt: z.iso.datetime({ offset: true }),
})

const workerScheduleCursorSchema = z.strictObject({
  id: z.uuid(),
  kind: z.literal('worker-schedule'),
  startsAt: z.iso.datetime({ offset: true }),
})

const operationsCursorSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum([
    'manager-assignment-requests',
    'manager-shifts',
    'compliance-records',
    'timesheets',
  ]),
  sortAt: z.iso.datetime({ offset: true }),
})

export type ComplianceCursor = z.infer<typeof complianceCursorSchema>
export type RecordsCursor = z.infer<typeof recordsCursorSchema>
export type NotificationsCursor = z.infer<typeof notificationsCursorSchema>
export type WorkerShiftsCursor = z.infer<typeof workerShiftsCursorSchema>
export type WorkerScheduleCursor = z.infer<typeof workerScheduleCursorSchema>
export type OperationsCursor = z.infer<typeof operationsCursorSchema>

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decode(cursor: string): unknown {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown
  } catch {
    throw new InvalidPreviewCursorError('The preview cursor is invalid.')
  }
}

function parseCursor<T>(
  cursor: string,
  schema: z.ZodType<T>,
): T {
  const result = schema.safeParse(decode(cursor))
  if (!result.success) {
    throw new InvalidPreviewCursorError('The preview cursor is invalid.')
  }
  return result.data
}

export function encodeComplianceCursor(
  previewId: string,
  id: string,
): string {
  return encode({ id, kind: 'compliance', previewId })
}

export function decodeComplianceCursor(cursor: string): ComplianceCursor {
  return parseCursor(cursor, complianceCursorSchema)
}

export function encodeRecordsCursor(previewId: string, id: string): string {
  return encode({ id, kind: 'records', previewId })
}

export function decodeRecordsCursor(cursor: string): RecordsCursor {
  return parseCursor(cursor, recordsCursorSchema)
}

export function encodeNotificationsCursor(
  createdAt: string,
  id: string,
): string {
  return encode({ createdAt, id, kind: 'notifications' })
}

export function decodeNotificationsCursor(
  cursor: string,
): NotificationsCursor {
  return parseCursor(cursor, notificationsCursorSchema)
}

export function encodeWorkerShiftsCursor(
  startsAt: string,
  id: string,
): string {
  return encode({ id, kind: 'worker-shifts', startsAt })
}

export function decodeWorkerShiftsCursor(
  cursor: string,
): WorkerShiftsCursor {
  return parseCursor(cursor, workerShiftsCursorSchema)
}

export function encodeWorkerScheduleCursor(
  startsAt: string,
  id: string,
): string {
  return encode({ id, kind: 'worker-schedule', startsAt })
}

export function decodeWorkerScheduleCursor(
  cursor: string,
): WorkerScheduleCursor {
  return parseCursor(cursor, workerScheduleCursorSchema)
}

export function encodeOperationsCursor(
  kind: OperationsCursor['kind'],
  sortAt: string,
  id: string,
): string {
  return encode({ id, kind, sortAt })
}

export function decodeOperationsCursor(
  cursor: string,
  expectedKind: OperationsCursor['kind'],
): OperationsCursor {
  const result = parseCursor(cursor, operationsCursorSchema)
  if (result.kind !== expectedKind) {
    throw new InvalidPreviewCursorError('The preview cursor is invalid.')
  }
  return result
}

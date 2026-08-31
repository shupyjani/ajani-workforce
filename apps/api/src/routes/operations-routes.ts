import {
  administratorComplianceDecisionBodySchema,
  administratorComplianceDecisionResponseSchema,
  administratorComplianceRecordIdParamsSchema,
  administratorComplianceRecordResponseSchema,
  administratorComplianceRecordsQuerySchema,
  administratorComplianceRecordsResponseSchema,
  administratorIdParamsSchema,
  administratorTimesheetsResponseSchema,
  operationsRouteTemplates,
  operationsIdempotencyHeaderSchema,
  managerAssignmentDecisionBodySchema,
  managerAssignmentDecisionResponseSchema,
  managerAssignmentIdParamsSchema,
  managerAssignmentRequestsQuerySchema,
  managerAssignmentRequestsResponseSchema,
  managerIdParamsSchema,
  managerShiftCancelBodySchema,
  managerShiftCreateBodySchema,
  managerShiftDetailResponseSchema,
  managerShiftIdParamsSchema,
  managerShiftMutationResponseSchema,
  managerShiftsQuerySchema,
  managerShiftsResponseSchema,
  managerShiftUpdateBodySchema,
  managerTimesheetDecisionBodySchema,
  managerTimesheetIdParamsSchema,
  managerTimesheetsResponseSchema,
  previewSnapshotQuerySchema,
  syntheticPreviewSource,
  timesheetsQuerySchema,
  versionedMutationBodySchema,
  workerIdParamsSchema,
  workerTimesheetCreateBodySchema,
  workerTimesheetDetailResponseSchema,
  workerTimesheetIdParamsSchema,
  workerTimesheetMutationResponseSchema,
  workerTimesheetsResponseSchema,
  workerTimesheetSubmitBodySchema,
  workerTimesheetUpdateBodySchema,
} from '@ajani/contracts'
import type { FastifyInstance } from 'fastify'
import { parseRequest } from '../http/request-validation.js'
import type { PreviewService } from '../services/preview-service.js'

export interface OperationsRouteOptions {
  readonly clock: () => Date
  readonly service: PreviewService
}

function responseMeta(requestId: string, clock: () => Date) {
  return {
    generatedAt: clock().toISOString(),
    requestId,
    source: syntheticPreviewSource,
  }
}

function idempotencyKey(headers: Readonly<Record<string, unknown>>): string {
  return parseRequest(operationsIdempotencyHeaderSchema, {
    idempotencyKey: headers['idempotency-key'],
  }).idempotencyKey
}

export function registerOperationsRoutes(
  application: FastifyInstance,
  options: OperationsRouteOptions,
): void {
  const { clock, service } = options

  application.get(
    operationsRouteTemplates.managerAssignmentRequests,
    async (request, reply) => {
      const { managerId } = parseRequest(managerIdParamsSchema, request.params)
      const query = parseRequest(
        managerAssignmentRequestsQuerySchema,
        request.query,
      )
      const result = await service.getManagerAssignmentRequests(
        managerId,
        query,
      )
      const { nextCursor, ...data } = result
      return reply.send(
        managerAssignmentRequestsResponseSchema.parse({
          data,
          meta: {
            ...responseMeta(request.id, clock),
            pagination: { limit: query.limit, nextCursor },
          },
        }),
      )
    },
  )

  application.post(
    operationsRouteTemplates.managerAssignmentDecision,
    async (request, reply) => {
      const { assignmentId, managerId } = parseRequest(
        managerAssignmentIdParamsSchema,
        request.params,
      )
      const body = parseRequest(
        managerAssignmentDecisionBodySchema,
        request.body,
      )
      const data = await service.decideManagerAssignment({
        assignmentId,
        body,
        idempotencyKey: idempotencyKey(request.headers),
        managerId,
      })
      return reply.send(
        managerAssignmentDecisionResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.get(
    operationsRouteTemplates.managerShifts,
    async (request, reply) => {
      const { managerId } = parseRequest(managerIdParamsSchema, request.params)
      const query = parseRequest(managerShiftsQuerySchema, request.query)
      const result = await service.getManagerShifts(managerId, query)
      const { nextCursor, ...data } = result
      return reply.send(
        managerShiftsResponseSchema.parse({
          data,
          meta: {
            ...responseMeta(request.id, clock),
            pagination: { limit: query.limit, nextCursor },
          },
        }),
      )
    },
  )

  application.post(
    operationsRouteTemplates.managerShifts,
    async (request, reply) => {
      const { managerId } = parseRequest(managerIdParamsSchema, request.params)
      const body = parseRequest(managerShiftCreateBodySchema, request.body)
      const data = await service.createManagerShift({
        body,
        idempotencyKey: idempotencyKey(request.headers),
        managerId,
      })
      return reply.status(201).send(
        managerShiftMutationResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.get(
    operationsRouteTemplates.managerShiftDetail,
    async (request, reply) => {
      const { managerId, shiftId } = parseRequest(
        managerShiftIdParamsSchema,
        request.params,
      )
      parseRequest(previewSnapshotQuerySchema, request.query)
      const data = await service.getManagerShiftDetail(managerId, shiftId)
      return reply.send(
        managerShiftDetailResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.patch(
    operationsRouteTemplates.managerShiftDetail,
    async (request, reply) => {
      const { managerId, shiftId } = parseRequest(
        managerShiftIdParamsSchema,
        request.params,
      )
      const body = parseRequest(managerShiftUpdateBodySchema, request.body)
      const data = await service.updateManagerShift({
        body,
        idempotencyKey: idempotencyKey(request.headers),
        managerId,
        shiftId,
      })
      return reply.send(
        managerShiftMutationResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.post(
    operationsRouteTemplates.managerShiftPublish,
    async (request, reply) => {
      const { managerId, shiftId } = parseRequest(
        managerShiftIdParamsSchema,
        request.params,
      )
      const { expectedVersion } = parseRequest(
        versionedMutationBodySchema,
        request.body,
      )
      const data = await service.publishManagerShift({
        expectedVersion,
        idempotencyKey: idempotencyKey(request.headers),
        managerId,
        shiftId,
      })
      return reply.send(
        managerShiftMutationResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.post(
    operationsRouteTemplates.managerShiftCancel,
    async (request, reply) => {
      const { managerId, shiftId } = parseRequest(
        managerShiftIdParamsSchema,
        request.params,
      )
      const { expectedVersion, reason } = parseRequest(
        managerShiftCancelBodySchema,
        request.body,
      )
      const data = await service.cancelManagerShift({
        expectedVersion,
        idempotencyKey: idempotencyKey(request.headers),
        managerId,
        reason,
        shiftId,
      })
      return reply.send(
        managerShiftMutationResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.get(
    operationsRouteTemplates.administratorComplianceRecords,
    async (request, reply) => {
      const { administratorId } = parseRequest(
        administratorIdParamsSchema,
        request.params,
      )
      const query = parseRequest(
        administratorComplianceRecordsQuerySchema,
        request.query,
      )
      const result = await service.getAdministratorComplianceRecords(
        administratorId,
        query,
      )
      const { nextCursor, ...data } = result
      return reply.send(
        administratorComplianceRecordsResponseSchema.parse({
          data,
          meta: {
            ...responseMeta(request.id, clock),
            pagination: { limit: query.limit, nextCursor },
          },
        }),
      )
    },
  )

  application.get(
    operationsRouteTemplates.administratorComplianceRecord,
    async (request, reply) => {
      const { administratorId, recordId } = parseRequest(
        administratorComplianceRecordIdParamsSchema,
        request.params,
      )
      parseRequest(previewSnapshotQuerySchema, request.query)
      const data = await service.getAdministratorComplianceRecord(
        administratorId,
        recordId,
      )
      return reply.send(
        administratorComplianceRecordResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.post(
    operationsRouteTemplates.administratorComplianceDecision,
    async (request, reply) => {
      const { administratorId, recordId } = parseRequest(
        administratorComplianceRecordIdParamsSchema,
        request.params,
      )
      const body = parseRequest(
        administratorComplianceDecisionBodySchema,
        request.body,
      )
      const data = await service.decideAdministratorCompliance({
        administratorId,
        body,
        idempotencyKey: idempotencyKey(request.headers),
        recordId,
      })
      return reply.send(
        administratorComplianceDecisionResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.get(
    operationsRouteTemplates.workerTimesheets,
    async (request, reply) => {
      const { workerId } = parseRequest(workerIdParamsSchema, request.params)
      const query = parseRequest(timesheetsQuerySchema, request.query)
      const result = await service.getWorkerTimesheets(workerId, query)
      const { nextCursor, ...data } = result
      return reply.send(
        workerTimesheetsResponseSchema.parse({
          data,
          meta: {
            ...responseMeta(request.id, clock),
            pagination: { limit: query.limit, nextCursor },
          },
        }),
      )
    },
  )

  application.post(
    operationsRouteTemplates.workerTimesheets,
    async (request, reply) => {
      const { workerId } = parseRequest(workerIdParamsSchema, request.params)
      const body = parseRequest(workerTimesheetCreateBodySchema, request.body)
      const data = await service.createWorkerTimesheet({
        body,
        idempotencyKey: idempotencyKey(request.headers),
        workerId,
      })
      return reply.status(201).send(
        workerTimesheetMutationResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.get(
    operationsRouteTemplates.workerTimesheetDetail,
    async (request, reply) => {
      const { timesheetId, workerId } = parseRequest(
        workerTimesheetIdParamsSchema,
        request.params,
      )
      parseRequest(previewSnapshotQuerySchema, request.query)
      const data = await service.getWorkerTimesheetDetail(
        workerId,
        timesheetId,
      )
      return reply.send(
        workerTimesheetDetailResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.put(
    operationsRouteTemplates.workerTimesheetDetail,
    async (request, reply) => {
      const { timesheetId, workerId } = parseRequest(
        workerTimesheetIdParamsSchema,
        request.params,
      )
      const body = parseRequest(workerTimesheetUpdateBodySchema, request.body)
      const data = await service.updateWorkerTimesheet({
        body,
        idempotencyKey: idempotencyKey(request.headers),
        timesheetId,
        workerId,
      })
      return reply.send(
        workerTimesheetMutationResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.post(
    operationsRouteTemplates.workerTimesheetSubmit,
    async (request, reply) => {
      const { timesheetId, workerId } = parseRequest(
        workerTimesheetIdParamsSchema,
        request.params,
      )
      const { expectedVersion } = parseRequest(
        workerTimesheetSubmitBodySchema,
        request.body,
      )
      const data = await service.submitWorkerTimesheet({
        expectedVersion,
        idempotencyKey: idempotencyKey(request.headers),
        timesheetId,
        workerId,
      })
      return reply.send(
        workerTimesheetMutationResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.get(
    operationsRouteTemplates.managerTimesheets,
    async (request, reply) => {
      const { managerId } = parseRequest(managerIdParamsSchema, request.params)
      const query = parseRequest(timesheetsQuerySchema, request.query)
      const result = await service.getManagerTimesheets(managerId, query)
      const { nextCursor, ...data } = result
      return reply.send(
        managerTimesheetsResponseSchema.parse({
          data,
          meta: {
            ...responseMeta(request.id, clock),
            pagination: { limit: query.limit, nextCursor },
          },
        }),
      )
    },
  )

  application.post(
    operationsRouteTemplates.managerTimesheetDecision,
    async (request, reply) => {
      const { managerId, timesheetId } = parseRequest(
        managerTimesheetIdParamsSchema,
        request.params,
      )
      const body = parseRequest(
        managerTimesheetDecisionBodySchema,
        request.body,
      )
      const data = await service.decideManagerTimesheet({
        body,
        idempotencyKey: idempotencyKey(request.headers),
        managerId,
        timesheetId,
      })
      return reply.send(
        workerTimesheetMutationResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.get(
    operationsRouteTemplates.administratorTimesheets,
    async (request, reply) => {
      const { administratorId } = parseRequest(
        administratorIdParamsSchema,
        request.params,
      )
      const query = parseRequest(timesheetsQuerySchema, request.query)
      const result = await service.getAdministratorTimesheets(
        administratorId,
        query,
      )
      const { nextCursor, ...data } = result
      return reply.send(
        administratorTimesheetsResponseSchema.parse({
          data,
          meta: {
            ...responseMeta(request.id, clock),
            pagination: { limit: query.limit, nextCursor },
          },
        }),
      )
    },
  )
}

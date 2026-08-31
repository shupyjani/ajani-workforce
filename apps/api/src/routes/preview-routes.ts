import {
  administratorComplianceResponseSchema,
  administratorIdParamsSchema,
  administratorRecordsQuerySchema,
  administratorRecordsResponseSchema,
  complianceQuerySchema,
  managerCoverageResponseSchema,
  managerIdParamsSchema,
  managerOperationsResponseSchema,
  notificationsQuerySchema,
  notificationsResponseSchema,
  previewRouteTemplates,
  previewSnapshotQuerySchema,
  syntheticPreviewSource,
  workerIdParamsSchema,
  workerAssignmentCancellationBodySchema,
  workerAssignmentCancellationResponseSchema,
  workerAssignmentIdParamsSchema,
  workerOverviewResponseSchema,
  workerReadinessResponseSchema,
  workerScheduleQuerySchema,
  workerScheduleResponseSchema,
  workerShiftDetailResponseSchema,
  workerShiftIdParamsSchema,
  workerShiftRequestBodySchema,
  workerShiftRequestResponseSchema,
  workerShiftsQuerySchema,
  workerShiftsResponseSchema,
  idempotencyHeaderSchema,
} from '@ajani/contracts'
import type { FastifyInstance } from 'fastify'
import { parseRequest } from '../http/request-validation.js'
import type { PreviewService } from '../services/preview-service.js'
import { registerOperationsRoutes } from './operations-routes.js'

export interface PreviewRouteOptions {
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

export function registerPreviewRoutes(
  application: FastifyInstance,
  options: PreviewRouteOptions,
): void {
  const { clock, service } = options

  application.get(previewRouteTemplates.workerOverview, async (request, reply) => {
    const { workerId } = parseRequest(workerIdParamsSchema, request.params)
    parseRequest(previewSnapshotQuerySchema, request.query)
    const data = await service.getWorkerOverview(workerId)

    return reply.send(
      workerOverviewResponseSchema.parse({
        data,
        meta: responseMeta(request.id, clock),
      }),
    )
  })

  application.get(previewRouteTemplates.workerReadiness, async (request, reply) => {
    const { workerId } = parseRequest(workerIdParamsSchema, request.params)
    parseRequest(previewSnapshotQuerySchema, request.query)
    const data = await service.getWorkerReadiness(workerId)

    return reply.send(
      workerReadinessResponseSchema.parse({
        data,
        meta: responseMeta(request.id, clock),
      }),
    )
  })

  application.get(previewRouteTemplates.workerShifts, async (request, reply) => {
    const { workerId } = parseRequest(workerIdParamsSchema, request.params)
    const query = parseRequest(workerShiftsQuerySchema, request.query)
    const result = await service.getWorkerShifts(workerId, query)
    const { nextCursor, ...data } = result

    return reply.send(
      workerShiftsResponseSchema.parse({
        data,
        meta: {
          ...responseMeta(request.id, clock),
          pagination: { limit: query.limit, nextCursor },
        },
      }),
    )
  })

  application.get(
    previewRouteTemplates.workerShiftDetail,
    async (request, reply) => {
      const { shiftId, workerId } = parseRequest(
        workerShiftIdParamsSchema,
        request.params,
      )
      parseRequest(previewSnapshotQuerySchema, request.query)
      const data = await service.getWorkerShiftDetail(workerId, shiftId)

      return reply.send(
        workerShiftDetailResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.get(previewRouteTemplates.workerSchedule, async (request, reply) => {
    const { workerId } = parseRequest(workerIdParamsSchema, request.params)
    const query = parseRequest(workerScheduleQuerySchema, request.query)
    const result = await service.getWorkerSchedule(workerId, query)
    const { nextCursor, ...data } = result

    return reply.send(
      workerScheduleResponseSchema.parse({
        data,
        meta: {
          ...responseMeta(request.id, clock),
          pagination: { limit: query.limit, nextCursor },
        },
      }),
    )
  })

  application.post(
    previewRouteTemplates.workerShiftAssignments,
    async (request, reply) => {
      const { workerId } = parseRequest(workerIdParamsSchema, request.params)
      const { idempotencyKey } = parseRequest(idempotencyHeaderSchema, {
        idempotencyKey: request.headers['idempotency-key'],
      })
      const { shiftId } = parseRequest(workerShiftRequestBodySchema, request.body)
      const data = await service.requestWorkerShift({
        idempotencyKey,
        shiftId,
        workerId,
      })

      return reply.status(201).send(
        workerShiftRequestResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.post(
    previewRouteTemplates.workerShiftAssignmentCancellation,
    async (request, reply) => {
      const { assignmentId, workerId } = parseRequest(
        workerAssignmentIdParamsSchema,
        request.params,
      )
      const { idempotencyKey } = parseRequest(idempotencyHeaderSchema, {
        idempotencyKey: request.headers['idempotency-key'],
      })
      parseRequest(workerAssignmentCancellationBodySchema, request.body)
      const data = await service.cancelWorkerAssignment({
        assignmentId,
        idempotencyKey,
        workerId,
      })

      return reply.send(
        workerAssignmentCancellationResponseSchema.parse({
          data,
          meta: responseMeta(request.id, clock),
        }),
      )
    },
  )

  application.get(previewRouteTemplates.managerOperations, async (request, reply) => {
    const { managerId } = parseRequest(managerIdParamsSchema, request.params)
    parseRequest(previewSnapshotQuerySchema, request.query)
    const data = await service.getManagerOperations(managerId)

    return reply.send(
      managerOperationsResponseSchema.parse({
        data,
        meta: responseMeta(request.id, clock),
      }),
    )
  })

  application.get(previewRouteTemplates.managerCoverage, async (request, reply) => {
    const { managerId } = parseRequest(managerIdParamsSchema, request.params)
    parseRequest(previewSnapshotQuerySchema, request.query)
    const data = await service.getManagerCoverage(managerId)

    return reply.send(
      managerCoverageResponseSchema.parse({
        data,
        meta: responseMeta(request.id, clock),
      }),
    )
  })

  application.get(
    previewRouteTemplates.administratorCompliance,
    async (request, reply) => {
      const { administratorId } = parseRequest(
        administratorIdParamsSchema,
        request.params,
      )
      const query = parseRequest(complianceQuerySchema, request.query)
      const result = await service.getAdministratorCompliance({
        administratorId,
        ...query,
      })
      const { nextCursor, ...data } = result

      return reply.send(
        administratorComplianceResponseSchema.parse({
          data,
          meta: {
            ...responseMeta(request.id, clock),
            pagination: {
              limit: query.limit,
              nextCursor,
            },
          },
        }),
      )
    },
  )

  application.get(
    previewRouteTemplates.administratorRecords,
    async (request, reply) => {
      const { administratorId } = parseRequest(
        administratorIdParamsSchema,
        request.params,
      )
      const query = parseRequest(administratorRecordsQuerySchema, request.query)
      const result = await service.getAdministratorRecords({
        administratorId,
        ...query,
      })
      const { nextCursor, ...data } = result

      return reply.send(
        administratorRecordsResponseSchema.parse({
          data,
          meta: {
            ...responseMeta(request.id, clock),
            pagination: {
              limit: query.limit,
              nextCursor,
            },
          },
        }),
      )
    },
  )

  application.get(previewRouteTemplates.notifications, async (request, reply) => {
    const query = parseRequest(notificationsQuerySchema, request.query)
    const result = await service.getNotifications(query)
    const { nextCursor, ...data } = result

    return reply.send(
      notificationsResponseSchema.parse({
        data,
        meta: {
          ...responseMeta(request.id, clock),
          pagination: {
            limit: query.limit,
            nextCursor,
          },
        },
      }),
    )
  })

  registerOperationsRoutes(application, options)
}

import {
  administratorComplianceDecisionResponseSchema,
  administratorComplianceRecordResponseSchema,
  administratorComplianceRecordsResponseSchema,
  administratorTimesheetsResponseSchema,
  operationsRoutes,
  managerAssignmentDecisionResponseSchema,
  managerAssignmentRequestsResponseSchema,
  managerShiftDetailResponseSchema,
  managerShiftMutationResponseSchema,
  managerShiftsResponseSchema,
  managerTimesheetsResponseSchema,
  previewPersonaIds,
  workerTimesheetDetailResponseSchema,
  workerTimesheetMutationResponseSchema,
  workerTimesheetsResponseSchema,
  type AdministratorComplianceDecisionBody,
  type ComplianceRecordReviewStatus,
  type ManagerAssignmentDecisionBody,
  type ManagerShiftCancelBody,
  type ManagerShiftCreateBody,
  type ManagerShiftStatus,
  type ManagerShiftUpdateBody,
  type ManagerTimesheetDecisionBody,
  type TimesheetStatus,
  type WorkerTimesheetCreateBody,
  type WorkerTimesheetUpdateBody,
} from '@ajani/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getApiResponse, mutateApiResponse } from './client'
import { previewQueryKeys } from './previewQueries'

const pageSize = 20

function withSearchParams(
  path: string,
  values: Readonly<Record<string, string | undefined>>,
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, value)
  }
  const query = params.toString()
  return query.length === 0 ? path : `${path}?${query}`
}

export const operationsQueryKeys = {
  managerAssignmentRequests: (cursor?: string) =>
    [...previewQueryKeys.all, 'manager', previewPersonaIds.manager, 'assignment-requests', cursor ?? null] as const,
  managerShiftsRoot: () =>
    [...previewQueryKeys.all, 'manager', previewPersonaIds.manager, 'shifts'] as const,
  managerShifts: (status?: ManagerShiftStatus, cursor?: string) =>
    [...operationsQueryKeys.managerShiftsRoot(), { cursor: cursor ?? null, status: status ?? null }] as const,
  managerShiftDetail: (shiftId: string) =>
    [...operationsQueryKeys.managerShiftsRoot(), 'detail', shiftId] as const,
  administratorComplianceRoot: () =>
    [...previewQueryKeys.all, 'administrator', previewPersonaIds.administrator, 'compliance-records'] as const,
  administratorComplianceRecords: (status?: ComplianceRecordReviewStatus, cursor?: string) =>
    [...operationsQueryKeys.administratorComplianceRoot(), { cursor: cursor ?? null, status: status ?? null }] as const,
  administratorComplianceRecord: (recordId: string) =>
    [...operationsQueryKeys.administratorComplianceRoot(), 'detail', recordId] as const,
  workerTimesheetsRoot: () =>
    [...previewQueryKeys.all, 'worker', previewPersonaIds.worker, 'timesheets'] as const,
  workerTimesheets: (status?: TimesheetStatus, cursor?: string) =>
    [...operationsQueryKeys.workerTimesheetsRoot(), { cursor: cursor ?? null, status: status ?? null }] as const,
  workerTimesheetDetail: (timesheetId: string) =>
    [...operationsQueryKeys.workerTimesheetsRoot(), 'detail', timesheetId] as const,
  managerTimesheets: (status?: TimesheetStatus, cursor?: string) =>
    [...previewQueryKeys.all, 'manager', previewPersonaIds.manager, 'timesheets', { cursor: cursor ?? null, status: status ?? null }] as const,
  administratorTimesheets: (status?: TimesheetStatus, cursor?: string) =>
    [...previewQueryKeys.all, 'administrator', previewPersonaIds.administrator, 'timesheets', { cursor: cursor ?? null, status: status ?? null }] as const,
}

type InvalidationArea = 'compliance' | 'operations' | 'timesheets'

function usePreviewInvalidation(area: InvalidationArea) {
  const queryClient = useQueryClient()
  const managerId = previewPersonaIds.manager
  const workerId = previewPersonaIds.worker
  const administratorId = previewPersonaIds.administrator
  const keys = area === 'operations'
    ? [
        [...previewQueryKeys.all, 'manager', managerId, 'assignment-requests'],
        operationsQueryKeys.managerShiftsRoot(),
        previewQueryKeys.managerOperations(managerId),
        previewQueryKeys.managerCoverage(managerId),
        previewQueryKeys.workerOverview(workerId),
        previewQueryKeys.workerShiftsRoot(workerId),
        previewQueryKeys.workerScheduleRoot(workerId),
        [...previewQueryKeys.all, 'notifications'],
      ]
    : area === 'compliance'
      ? [
          operationsQueryKeys.administratorComplianceRoot(),
          [...previewQueryKeys.all, 'administrator', administratorId, 'compliance'],
          previewQueryKeys.workerOverview(workerId),
          previewQueryKeys.workerReadiness(workerId),
          [...previewQueryKeys.all, 'manager', managerId, 'assignment-requests'],
          [...previewQueryKeys.all, 'notifications'],
        ]
      : [
          operationsQueryKeys.workerTimesheetsRoot(),
          [...previewQueryKeys.all, 'manager', managerId, 'timesheets'],
          [...previewQueryKeys.all, 'administrator', administratorId, 'timesheets'],
          [...previewQueryKeys.all, 'notifications'],
        ]
  return async () => Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}

export function useManagerAssignmentRequestsQuery(cursor?: string) {
  const managerId = previewPersonaIds.manager
  return useQuery({
    queryFn: ({ signal }) => getApiResponse({
      path: withSearchParams(operationsRoutes.managerAssignmentRequests(managerId), { cursor, limit: String(pageSize) }),
      schema: managerAssignmentRequestsResponseSchema,
      signal,
    }),
    queryKey: operationsQueryKeys.managerAssignmentRequests(cursor),
  })
}

export function useManagerAssignmentDecisionMutation() {
  const invalidate = usePreviewInvalidation('operations')
  const managerId = previewPersonaIds.manager
  return useMutation({
    mutationFn: ({ assignmentId, body, idempotencyKey }: { assignmentId: string; body: ManagerAssignmentDecisionBody; idempotencyKey: string }) =>
      mutateApiResponse({ body, idempotencyKey, method: 'POST', path: operationsRoutes.managerAssignmentDecision(managerId, assignmentId), schema: managerAssignmentDecisionResponseSchema }),
    onSettled: invalidate,
    retry: false,
  })
}

export function useManagerShiftsQuery(status?: ManagerShiftStatus, cursor?: string) {
  const managerId = previewPersonaIds.manager
  return useQuery({
    queryFn: ({ signal }) => getApiResponse({
      path: withSearchParams(operationsRoutes.managerShifts(managerId), { cursor, limit: String(pageSize), status }),
      schema: managerShiftsResponseSchema,
      signal,
    }),
    queryKey: operationsQueryKeys.managerShifts(status, cursor),
  })
}

export function useManagerShiftDetailQuery(shiftId: string) {
  const managerId = previewPersonaIds.manager
  return useQuery({
    enabled: shiftId.length > 0,
    queryFn: ({ signal }) => getApiResponse({ path: operationsRoutes.managerShiftDetail(managerId, shiftId), schema: managerShiftDetailResponseSchema, signal }),
    queryKey: operationsQueryKeys.managerShiftDetail(shiftId),
  })
}

export function useCreateManagerShiftMutation() {
  const invalidate = usePreviewInvalidation('operations')
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: ManagerShiftCreateBody; idempotencyKey: string }) => mutateApiResponse({ body, idempotencyKey, method: 'POST', path: operationsRoutes.managerShifts(previewPersonaIds.manager), schema: managerShiftMutationResponseSchema }),
    onSettled: invalidate,
    retry: false,
  })
}

export function useUpdateManagerShiftMutation() {
  const invalidate = usePreviewInvalidation('operations')
  return useMutation({
    mutationFn: ({ body, idempotencyKey, shiftId }: { body: ManagerShiftUpdateBody; idempotencyKey: string; shiftId: string }) => mutateApiResponse({ body, idempotencyKey, method: 'PATCH', path: operationsRoutes.managerShiftDetail(previewPersonaIds.manager, shiftId), schema: managerShiftMutationResponseSchema }),
    onSettled: invalidate,
    retry: false,
  })
}

export function usePublishManagerShiftMutation() {
  const invalidate = usePreviewInvalidation('operations')
  return useMutation({
    mutationFn: ({ expectedVersion, idempotencyKey, shiftId }: { expectedVersion: number; idempotencyKey: string; shiftId: string }) => mutateApiResponse({ body: { expectedVersion }, idempotencyKey, method: 'POST', path: operationsRoutes.managerShiftPublish(previewPersonaIds.manager, shiftId), schema: managerShiftMutationResponseSchema }),
    onSettled: invalidate,
    retry: false,
  })
}

export function useCancelManagerShiftMutation() {
  const invalidate = usePreviewInvalidation('operations')
  return useMutation({
    mutationFn: ({ body, idempotencyKey, shiftId }: { body: ManagerShiftCancelBody; idempotencyKey: string; shiftId: string }) => mutateApiResponse({ body, idempotencyKey, method: 'POST', path: operationsRoutes.managerShiftCancel(previewPersonaIds.manager, shiftId), schema: managerShiftMutationResponseSchema }),
    onSettled: invalidate,
    retry: false,
  })
}

export function useAdministratorComplianceRecordsQuery(status?: ComplianceRecordReviewStatus, cursor?: string) {
  const administratorId = previewPersonaIds.administrator
  return useQuery({
    queryFn: ({ signal }) => getApiResponse({ path: withSearchParams(operationsRoutes.administratorComplianceRecords(administratorId), { cursor, limit: String(pageSize), status }), schema: administratorComplianceRecordsResponseSchema, signal }),
    queryKey: operationsQueryKeys.administratorComplianceRecords(status, cursor),
  })
}

export function useAdministratorComplianceRecordQuery(recordId: string) {
  const administratorId = previewPersonaIds.administrator
  return useQuery({
    enabled: recordId.length > 0,
    queryFn: ({ signal }) => getApiResponse({ path: operationsRoutes.administratorComplianceRecord(administratorId, recordId), schema: administratorComplianceRecordResponseSchema, signal }),
    queryKey: operationsQueryKeys.administratorComplianceRecord(recordId),
  })
}

export function useAdministratorComplianceDecisionMutation() {
  const invalidate = usePreviewInvalidation('compliance')
  return useMutation({
    mutationFn: ({ body, idempotencyKey, recordId }: { body: AdministratorComplianceDecisionBody; idempotencyKey: string; recordId: string }) => mutateApiResponse({ body, idempotencyKey, method: 'POST', path: operationsRoutes.administratorComplianceDecision(previewPersonaIds.administrator, recordId), schema: administratorComplianceDecisionResponseSchema }),
    onSettled: invalidate,
    retry: false,
  })
}

export function useWorkerTimesheetsQuery(status?: TimesheetStatus, cursor?: string) {
  const workerId = previewPersonaIds.worker
  return useQuery({
    queryFn: ({ signal }) => getApiResponse({ path: withSearchParams(operationsRoutes.workerTimesheets(workerId), { cursor, limit: String(pageSize), status }), schema: workerTimesheetsResponseSchema, signal }),
    queryKey: operationsQueryKeys.workerTimesheets(status, cursor),
  })
}

export function useWorkerTimesheetDetailQuery(timesheetId: string) {
  return useQuery({
    enabled: timesheetId.length > 0,
    queryFn: ({ signal }) => getApiResponse({ path: operationsRoutes.workerTimesheetDetail(previewPersonaIds.worker, timesheetId), schema: workerTimesheetDetailResponseSchema, signal }),
    queryKey: operationsQueryKeys.workerTimesheetDetail(timesheetId),
  })
}

export function useCreateWorkerTimesheetMutation() {
  const invalidate = usePreviewInvalidation('timesheets')
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: WorkerTimesheetCreateBody; idempotencyKey: string }) => mutateApiResponse({ body, idempotencyKey, method: 'POST', path: operationsRoutes.workerTimesheets(previewPersonaIds.worker), schema: workerTimesheetMutationResponseSchema }),
    onSettled: invalidate,
    retry: false,
  })
}

export function useUpdateWorkerTimesheetMutation() {
  const invalidate = usePreviewInvalidation('timesheets')
  return useMutation({
    mutationFn: ({ body, idempotencyKey, timesheetId }: { body: WorkerTimesheetUpdateBody; idempotencyKey: string; timesheetId: string }) => mutateApiResponse({ body, idempotencyKey, method: 'PUT', path: operationsRoutes.workerTimesheetDetail(previewPersonaIds.worker, timesheetId), schema: workerTimesheetMutationResponseSchema }),
    onSettled: invalidate,
    retry: false,
  })
}

export function useSubmitWorkerTimesheetMutation() {
  const invalidate = usePreviewInvalidation('timesheets')
  return useMutation({
    mutationFn: ({ expectedVersion, idempotencyKey, timesheetId }: { expectedVersion: number; idempotencyKey: string; timesheetId: string }) => mutateApiResponse({ body: { expectedVersion }, idempotencyKey, method: 'POST', path: operationsRoutes.workerTimesheetSubmit(previewPersonaIds.worker, timesheetId), schema: workerTimesheetMutationResponseSchema }),
    onSettled: invalidate,
    retry: false,
  })
}

export function useManagerTimesheetsQuery(status?: TimesheetStatus, cursor?: string) {
  return useQuery({
    queryFn: ({ signal }) => getApiResponse({ path: withSearchParams(operationsRoutes.managerTimesheets(previewPersonaIds.manager), { cursor, limit: String(pageSize), status }), schema: managerTimesheetsResponseSchema, signal }),
    queryKey: operationsQueryKeys.managerTimesheets(status, cursor),
  })
}

export function useManagerTimesheetDecisionMutation() {
  const invalidate = usePreviewInvalidation('timesheets')
  return useMutation({
    mutationFn: ({ body, idempotencyKey, timesheetId }: { body: ManagerTimesheetDecisionBody; idempotencyKey: string; timesheetId: string }) => mutateApiResponse({ body, idempotencyKey, method: 'POST', path: operationsRoutes.managerTimesheetDecision(previewPersonaIds.manager, timesheetId), schema: workerTimesheetMutationResponseSchema }),
    onSettled: invalidate,
    retry: false,
  })
}

export function useAdministratorTimesheetsQuery(status?: TimesheetStatus, cursor?: string) {
  return useQuery({
    queryFn: ({ signal }) => getApiResponse({ path: withSearchParams(operationsRoutes.administratorTimesheets(previewPersonaIds.administrator), { cursor, limit: String(pageSize), status }), schema: administratorTimesheetsResponseSchema, signal }),
    queryKey: operationsQueryKeys.administratorTimesheets(status, cursor),
  })
}

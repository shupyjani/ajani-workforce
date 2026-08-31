import {
  administratorComplianceResponseSchema,
  administratorRecordsResponseSchema,
  managerCoverageResponseSchema,
  managerOperationsResponseSchema,
  notificationsResponseSchema,
  previewPersonaIds,
  previewRoutes,
  workerAssignmentCancellationResponseSchema,
  workerOverviewResponseSchema,
  workerReadinessResponseSchema,
  workerScheduleResponseSchema,
  workerShiftDetailResponseSchema,
  workerShiftRequestResponseSchema,
  workerShiftsResponseSchema,
  type AdministratorComplianceResponse,
  type AdministratorRecordsResponse,
  type ManagerCoverageResponse,
  type ManagerOperationsResponse,
  type NotificationsResponse,
  type PersonaSummary,
  type ReadinessStatus,
  type WorkerOverviewResponse,
  type WorkerReadinessResponse,
  type WorkerAssignmentCancellationResponse,
  type WorkerAssignmentStatus,
  type WorkerScheduleResponse,
  type WorkerShiftDetailResponse,
  type WorkerShiftRequestResponse,
  type WorkerShiftsResponse,
} from '@ajani/contracts'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import type { RoleId } from '../types/navigation'
import { getApiResponse, postApiResponse } from './client'

const compliancePageSize = 4
const recordsPageSize = 20
const notificationsPageSize = 20
const workerJourneyPageSize = 4

export interface WorkerShiftFilters {
  readonly availability?: 'all' | 'available' | undefined
  readonly cursor?: string | undefined
  readonly from?: string | undefined
  readonly locationId?: string | undefined
  readonly to?: string | undefined
}

export const previewQueryKeys = {
  all: ['preview'] as const,
  workerOverview: (workerId: string) =>
    [...previewQueryKeys.all, 'worker', workerId, 'overview'] as const,
  workerReadiness: (workerId: string) =>
    [...previewQueryKeys.all, 'worker', workerId, 'readiness'] as const,
  workerShiftsRoot: (workerId: string) =>
    [...previewQueryKeys.all, 'worker', workerId, 'shifts'] as const,
  workerShifts: (workerId: string, filters: WorkerShiftFilters) =>
    [...previewQueryKeys.workerShiftsRoot(workerId), filters] as const,
  workerShiftDetail: (workerId: string, shiftId: string) =>
    [...previewQueryKeys.workerShiftsRoot(workerId), 'detail', shiftId] as const,
  workerScheduleRoot: (workerId: string) =>
    [...previewQueryKeys.all, 'worker', workerId, 'schedule'] as const,
  workerSchedule: (
    workerId: string,
    status: WorkerAssignmentStatus | undefined,
    cursor: string | undefined,
  ) =>
    [...previewQueryKeys.workerScheduleRoot(workerId), { cursor: cursor ?? null, status: status ?? null }] as const,
  managerOperations: (managerId: string) =>
    [...previewQueryKeys.all, 'manager', managerId, 'operations'] as const,
  managerCoverage: (managerId: string) =>
    [...previewQueryKeys.all, 'manager', managerId, 'coverage'] as const,
  administratorCompliance: (
    administratorId: string,
    status: ReadinessStatus | undefined,
    cursor: string | undefined,
  ) =>
    [
      ...previewQueryKeys.all,
      'administrator',
      administratorId,
      'compliance',
      { cursor: cursor ?? null, limit: compliancePageSize, status: status ?? null },
    ] as const,
  administratorRecords: (
    administratorId: string,
    cursor: string | undefined,
  ) =>
    [
      ...previewQueryKeys.all,
      'administrator',
      administratorId,
      'records',
      { cursor: cursor ?? null, limit: recordsPageSize },
    ] as const,
  notifications: (
    recipientId: string,
    unread: boolean | undefined,
    cursor: string | undefined,
  ) =>
    [
      ...previewQueryKeys.all,
      'notifications',
      recipientId,
      {
        cursor: cursor ?? null,
        limit: notificationsPageSize,
        unread: unread ?? null,
      },
    ] as const,
}

function withSearchParams(
  path: string,
  values: Readonly<Record<string, string | undefined>>,
): string {
  const params = new URLSearchParams()

  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) {
      params.set(name, value)
    }
  }

  const query = params.toString()
  return query.length === 0 ? path : `${path}?${query}`
}

export function useWorkerOverviewQuery(): UseQueryResult<
  WorkerOverviewResponse
> {
  const workerId = previewPersonaIds.worker
  return useQuery({
    queryFn: ({ signal }) =>
      getApiResponse({
        path: previewRoutes.workerOverview(workerId),
        schema: workerOverviewResponseSchema,
        signal,
      }),
    queryKey: previewQueryKeys.workerOverview(workerId),
  })
}

type PersonaResponse =
  | WorkerOverviewResponse
  | ManagerOperationsResponse
  | AdministratorComplianceResponse

export function useRolePersonaQuery(
  role: RoleId,
): UseQueryResult<PersonaSummary> {
  const queryKey =
    role === 'worker'
      ? previewQueryKeys.workerOverview(previewPersonaIds.worker)
      : role === 'manager'
        ? previewQueryKeys.managerOperations(previewPersonaIds.manager)
        : previewQueryKeys.administratorCompliance(
            previewPersonaIds.administrator,
            undefined,
            undefined,
          )

  return useQuery<PersonaResponse, Error, PersonaSummary>({
    queryFn: ({ signal }) => {
      if (role === 'worker') {
        return getApiResponse({
          path: previewRoutes.workerOverview(previewPersonaIds.worker),
          schema: workerOverviewResponseSchema,
          signal,
        })
      }
      if (role === 'manager') {
        return getApiResponse({
          path: previewRoutes.managerOperations(previewPersonaIds.manager),
          schema: managerOperationsResponseSchema,
          signal,
        })
      }
      return getApiResponse({
        path: withSearchParams(
          previewRoutes.administratorCompliance(previewPersonaIds.administrator),
          { limit: String(compliancePageSize) },
        ),
        schema: administratorComplianceResponseSchema,
        signal,
      })
    },
    queryKey,
    select: (response) => {
      if ('worker' in response.data) return response.data.worker
      if ('manager' in response.data) return response.data.manager
      return response.data.administrator
    },
  })
}

export function useWorkerReadinessQuery(): UseQueryResult<
  WorkerReadinessResponse
> {
  const workerId = previewPersonaIds.worker
  return useQuery({
    queryFn: ({ signal }) =>
      getApiResponse({
        path: previewRoutes.workerReadiness(workerId),
        schema: workerReadinessResponseSchema,
        signal,
      }),
    queryKey: previewQueryKeys.workerReadiness(workerId),
  })
}

export function useWorkerShiftsQuery(
  filters: WorkerShiftFilters,
): UseQueryResult<WorkerShiftsResponse> {
  const workerId = previewPersonaIds.worker
  return useQuery({
    queryFn: ({ signal }) =>
      getApiResponse({
        path: withSearchParams(previewRoutes.workerShifts(workerId), {
          availability: filters.availability,
          cursor: filters.cursor,
          from: filters.from,
          limit: String(workerJourneyPageSize),
          locationId: filters.locationId,
          to: filters.to,
        }),
        schema: workerShiftsResponseSchema,
        signal,
      }),
    queryKey: previewQueryKeys.workerShifts(workerId, filters),
  })
}

export function useWorkerShiftDetailQuery(
  shiftId: string,
): UseQueryResult<WorkerShiftDetailResponse> {
  const workerId = previewPersonaIds.worker
  return useQuery({
    enabled: shiftId.length > 0,
    queryFn: ({ signal }) =>
      getApiResponse({
        path: previewRoutes.workerShiftDetail(workerId, shiftId),
        schema: workerShiftDetailResponseSchema,
        signal,
      }),
    queryKey: previewQueryKeys.workerShiftDetail(workerId, shiftId),
  })
}

export function useWorkerScheduleQuery({
  cursor,
  status,
}: {
  readonly cursor?: string | undefined
  readonly status?: WorkerAssignmentStatus | undefined
}): UseQueryResult<WorkerScheduleResponse> {
  const workerId = previewPersonaIds.worker
  return useQuery({
    queryFn: ({ signal }) =>
      getApiResponse({
        path: withSearchParams(previewRoutes.workerSchedule(workerId), {
          cursor,
          limit: String(workerJourneyPageSize),
          status,
        }),
        schema: workerScheduleResponseSchema,
        signal,
      }),
    queryKey: previewQueryKeys.workerSchedule(workerId, status, cursor),
  })
}

async function invalidateWorkerJourney(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  const workerId = previewPersonaIds.worker
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: previewQueryKeys.workerOverview(workerId) }),
    queryClient.invalidateQueries({ queryKey: previewQueryKeys.workerShiftsRoot(workerId) }),
    queryClient.invalidateQueries({ queryKey: previewQueryKeys.workerScheduleRoot(workerId) }),
    queryClient.invalidateQueries({ queryKey: previewQueryKeys.managerOperations(previewPersonaIds.manager) }),
    queryClient.invalidateQueries({ queryKey: previewQueryKeys.managerCoverage(previewPersonaIds.manager) }),
    queryClient.invalidateQueries({ queryKey: [...previewQueryKeys.all, 'notifications'] }),
  ])
}

export function useRequestWorkerShiftMutation(): UseMutationResult<
  WorkerShiftRequestResponse,
  Error,
  { readonly idempotencyKey: string; readonly shiftId: string }
> {
  const queryClient = useQueryClient()
  const workerId = previewPersonaIds.worker
  return useMutation({
    mutationFn: ({ idempotencyKey, shiftId }) =>
      postApiResponse({
        body: { shiftId },
        idempotencyKey,
        path: previewRoutes.workerShiftAssignments(workerId),
        schema: workerShiftRequestResponseSchema,
      }),
    onSuccess: async () => invalidateWorkerJourney(queryClient),
    retry: false,
  })
}

export function useCancelWorkerAssignmentMutation(): UseMutationResult<
  WorkerAssignmentCancellationResponse,
  Error,
  { readonly assignmentId: string; readonly idempotencyKey: string }
> {
  const queryClient = useQueryClient()
  const workerId = previewPersonaIds.worker
  return useMutation({
    mutationFn: ({ assignmentId, idempotencyKey }) =>
      postApiResponse({
        body: {},
        idempotencyKey,
        path: previewRoutes.workerShiftAssignmentCancellation(workerId, assignmentId),
        schema: workerAssignmentCancellationResponseSchema,
      }),
    onSuccess: async () => invalidateWorkerJourney(queryClient),
    retry: false,
  })
}

export function useManagerOperationsQuery(): UseQueryResult<
  ManagerOperationsResponse
> {
  const managerId = previewPersonaIds.manager
  return useQuery({
    queryFn: ({ signal }) =>
      getApiResponse({
        path: previewRoutes.managerOperations(managerId),
        schema: managerOperationsResponseSchema,
        signal,
      }),
    queryKey: previewQueryKeys.managerOperations(managerId),
  })
}

export function useManagerCoverageQuery(): UseQueryResult<
  ManagerCoverageResponse
> {
  const managerId = previewPersonaIds.manager
  return useQuery({
    queryFn: ({ signal }) =>
      getApiResponse({
        path: previewRoutes.managerCoverage(managerId),
        schema: managerCoverageResponseSchema,
        signal,
      }),
    queryKey: previewQueryKeys.managerCoverage(managerId),
  })
}

export function useAdministratorComplianceQuery({
  cursor,
  status,
}: {
  readonly cursor: string | undefined
  readonly status: ReadinessStatus | undefined
}): UseQueryResult<AdministratorComplianceResponse> {
  const administratorId = previewPersonaIds.administrator
  return useQuery({
    queryFn: ({ signal }) =>
      getApiResponse({
        path: withSearchParams(
          previewRoutes.administratorCompliance(administratorId),
          {
            cursor,
            limit: String(compliancePageSize),
            status,
          },
        ),
        schema: administratorComplianceResponseSchema,
        signal,
      }),
    queryKey: previewQueryKeys.administratorCompliance(
      administratorId,
      status,
      cursor,
    ),
  })
}

export function useAdministratorRecordsQuery(
  cursor?: string,
): UseQueryResult<AdministratorRecordsResponse> {
  const administratorId = previewPersonaIds.administrator
  return useQuery({
    queryFn: ({ signal }) =>
      getApiResponse({
        path: withSearchParams(
          previewRoutes.administratorRecords(administratorId),
          { cursor, limit: String(recordsPageSize) },
        ),
        schema: administratorRecordsResponseSchema,
        signal,
      }),
    queryKey: previewQueryKeys.administratorRecords(administratorId, cursor),
  })
}

export function useNotificationsQuery({
  cursor,
  role,
  unread,
}: {
  readonly cursor: string | undefined
  readonly role: RoleId
  readonly unread: boolean | undefined
}): UseQueryResult<NotificationsResponse> {
  const recipientId = previewPersonaIds[role]
  return useQuery({
    queryFn: ({ signal }) =>
      getApiResponse({
        path: withSearchParams(previewRoutes.notifications, {
          cursor,
          limit: String(notificationsPageSize),
          recipientId,
          unread: unread === undefined ? undefined : String(unread),
        }),
        schema: notificationsResponseSchema,
        signal,
      }),
    queryKey: previewQueryKeys.notifications(recipientId, unread, cursor),
  })
}

import type {
  AdministratorComplianceDecisionBody,
  AdministratorComplianceDecisionData,
  AdministratorComplianceRecordData,
  AdministratorComplianceRecordsData,
  AdministratorComplianceRecordsQuery,
  AdministratorComplianceData,
  AdministratorRecordsData,
  AdministratorTimesheetsData,
  ManagerAssignmentDecisionBody,
  ManagerAssignmentDecisionData,
  ManagerAssignmentRequestsData,
  ManagerAssignmentRequestsQuery,
  ManagerCoverageData,
  ManagerOperationsData,
  ManagerShiftCreateBody,
  ManagerShiftDetailData,
  ManagerShiftMutationData,
  ManagerShiftsData,
  ManagerShiftsQuery,
  ManagerShiftUpdateBody,
  ManagerTimesheetDecisionBody,
  ManagerTimesheetsData,
  NotificationsData,
  NotificationsQuery,
  TimesheetsQuery,
  WorkerAssignmentMutation,
  WorkerOverviewData,
  WorkerReadinessData,
  WorkerScheduleData,
  WorkerScheduleQuery,
  WorkerShiftDetailData,
  WorkerShiftsData,
  WorkerShiftsQuery,
  WorkerTimesheetCreateBody,
  WorkerTimesheetDetailData,
  WorkerTimesheetMutationData,
  WorkerTimesheetUpdateBody,
  WorkerTimesheetsData,
} from '@ajani/contracts'
import { OperationsRuleError, WorkerJourneyRuleError } from '@ajani/database'
import {
  conflictError,
  invalidRequestError,
  readinessRequiredError,
  resourceNotFoundError,
} from '../errors/api-errors.js'
import type {
  AdministratorComplianceLookup,
  AdministratorRecordsLookup,
  PaginatedRepositoryResult,
  PreviewRepository,
  WorkerAssignmentCancellationCommand,
  WorkerShiftRequestCommand,
} from '../repositories/preview-repository.js'

async function readPaginatedResult<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Error && error.name === 'InvalidPreviewCursorError') {
      throw invalidRequestError([
        {
          field: 'cursor',
          message: 'Cursor is invalid or does not belong to this collection.',
        },
      ])
    }

    throw error
  }
}

export class PreviewService {
  public constructor(
    private readonly repository: PreviewRepository,
    private readonly clock: () => Date,
  ) {}

  private referenceAt(): string {
    return this.clock().toISOString()
  }

  private async workerJourneyOperation<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof WorkerJourneyRuleError) {
        if (error.code === 'READINESS_REQUIRED') {
          throw readinessRequiredError(error.message)
        }
        throw conflictError(error.code, error.message)
      }
      throw error
    }
  }

  private async operationsAction<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof OperationsRuleError) {
        throw conflictError(error.code, error.message)
      }
      throw error
    }
  }

  public async getWorkerOverview(workerId: string): Promise<WorkerOverviewData> {
    const data = await this.repository.getWorkerOverview(workerId)

    if (data === null) {
      throw resourceNotFoundError('The worker preview was not found.')
    }

    return data
  }

  public async getWorkerReadiness(workerId: string): Promise<WorkerReadinessData> {
    const data = await this.repository.getWorkerReadiness(workerId)

    if (data === null) {
      throw resourceNotFoundError('The worker preview was not found.')
    }

    return data
  }

  public async getWorkerShifts(
    workerId: string,
    query: WorkerShiftsQuery,
  ): Promise<PaginatedRepositoryResult<WorkerShiftsData>> {
    const result = await readPaginatedResult(() =>
      this.repository.getWorkerShifts({
        ...query,
        referenceAt: this.referenceAt(),
        workerId,
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The worker preview was not found.')
    }
    return result
  }

  public async getWorkerShiftDetail(
    workerId: string,
    shiftId: string,
  ): Promise<WorkerShiftDetailData> {
    const result = await this.repository.getWorkerShiftDetail({
      referenceAt: this.referenceAt(),
      shiftId,
      workerId,
    })
    if (result === null) {
      throw resourceNotFoundError('The shift preview was not found.')
    }
    return result
  }

  public async getWorkerSchedule(
    workerId: string,
    query: WorkerScheduleQuery,
  ): Promise<PaginatedRepositoryResult<WorkerScheduleData>> {
    const result = await readPaginatedResult(() =>
      this.repository.getWorkerSchedule({
        ...query,
        referenceAt: this.referenceAt(),
        workerId,
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The worker preview was not found.')
    }
    return result
  }

  public async requestWorkerShift(
    command: Omit<WorkerShiftRequestCommand, 'occurredAt'>,
  ): Promise<WorkerAssignmentMutation> {
    const result = await this.workerJourneyOperation(() =>
      this.repository.requestWorkerShift({
        ...command,
        occurredAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The worker preview was not found.')
    }
    return result
  }

  public async cancelWorkerAssignment(
    command: Omit<WorkerAssignmentCancellationCommand, 'occurredAt'>,
  ): Promise<WorkerAssignmentMutation> {
    const result = await this.workerJourneyOperation(() =>
      this.repository.cancelWorkerAssignment({
        ...command,
        occurredAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The assignment preview was not found.')
    }
    return result
  }

  public async getManagerOperations(
    managerId: string,
  ): Promise<ManagerOperationsData> {
    const data = await this.repository.getManagerOperations(managerId)

    if (data === null) {
      throw resourceNotFoundError('The manager preview was not found.')
    }

    return data
  }

  public async getManagerCoverage(
    managerId: string,
  ): Promise<ManagerCoverageData> {
    const data = await this.repository.getManagerCoverage(managerId)

    if (data === null) {
      throw resourceNotFoundError('The manager preview was not found.')
    }

    return data
  }

  public async getManagerAssignmentRequests(
    managerId: string,
    query: ManagerAssignmentRequestsQuery,
  ): Promise<PaginatedRepositoryResult<ManagerAssignmentRequestsData>> {
    const result = await readPaginatedResult(() =>
      this.repository.getManagerAssignmentRequests({ managerId, ...query }),
    )
    if (result === null) {
      throw resourceNotFoundError('The manager preview was not found.')
    }
    return result
  }

  public async decideManagerAssignment(options: {
    readonly assignmentId: string
    readonly body: ManagerAssignmentDecisionBody
    readonly idempotencyKey: string
    readonly managerId: string
  }): Promise<ManagerAssignmentDecisionData> {
    const result = await this.operationsAction(() =>
      this.repository.decideManagerAssignment({
        ...options,
        occurredAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The assignment review was not found.')
    }
    return result
  }

  public async getManagerShifts(
    managerId: string,
    query: ManagerShiftsQuery,
  ): Promise<PaginatedRepositoryResult<ManagerShiftsData>> {
    const result = await readPaginatedResult(() =>
      this.repository.getManagerShifts({
        ...query,
        managerId,
        referenceAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The manager preview was not found.')
    }
    return result
  }

  public async getManagerShiftDetail(
    managerId: string,
    shiftId: string,
  ): Promise<ManagerShiftDetailData> {
    const result = await this.repository.getManagerShiftDetail({
      managerId,
      referenceAt: this.referenceAt(),
      shiftId,
    })
    if (result === null) {
      throw resourceNotFoundError('The Manager shift preview was not found.')
    }
    return result
  }

  public async createManagerShift(options: {
    readonly body: ManagerShiftCreateBody
    readonly idempotencyKey: string
    readonly managerId: string
  }): Promise<ManagerShiftMutationData> {
    const result = await this.operationsAction(() =>
      this.repository.createManagerShift({
        ...options,
        occurredAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The manager preview was not found.')
    }
    return result
  }

  public async updateManagerShift(options: {
    readonly body: ManagerShiftUpdateBody
    readonly idempotencyKey: string
    readonly managerId: string
    readonly shiftId: string
  }): Promise<ManagerShiftMutationData> {
    const result = await this.operationsAction(() =>
      this.repository.updateManagerShift({
        ...options,
        occurredAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The Manager shift preview was not found.')
    }
    return result
  }

  public async publishManagerShift(options: {
    readonly expectedVersion: number
    readonly idempotencyKey: string
    readonly managerId: string
    readonly shiftId: string
  }): Promise<ManagerShiftMutationData> {
    const result = await this.operationsAction(() =>
      this.repository.publishManagerShift({
        ...options,
        occurredAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The Manager shift preview was not found.')
    }
    return result
  }

  public async cancelManagerShift(options: {
    readonly expectedVersion: number
    readonly idempotencyKey: string
    readonly managerId: string
    readonly reason: string
    readonly shiftId: string
  }): Promise<ManagerShiftMutationData> {
    const result = await this.operationsAction(() =>
      this.repository.cancelManagerShift({
        ...options,
        occurredAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The Manager shift preview was not found.')
    }
    return result
  }

  public async getAdministratorCompliance(
    query: AdministratorComplianceLookup,
  ): Promise<PaginatedRepositoryResult<AdministratorComplianceData>> {
    const result = await readPaginatedResult(() =>
      this.repository.getAdministratorCompliance(query),
    )

    if (result === null) {
      throw resourceNotFoundError('The administrator preview was not found.')
    }

    return result
  }

  public async getAdministratorRecords(
    query: AdministratorRecordsLookup,
  ): Promise<PaginatedRepositoryResult<AdministratorRecordsData>> {
    const result = await readPaginatedResult(() =>
      this.repository.getAdministratorRecords(query),
    )

    if (result === null) {
      throw resourceNotFoundError('The administrator preview was not found.')
    }

    return result
  }

  public async getAdministratorComplianceRecords(
    administratorId: string,
    query: AdministratorComplianceRecordsQuery,
  ): Promise<PaginatedRepositoryResult<AdministratorComplianceRecordsData>> {
    const result = await readPaginatedResult(() =>
      this.repository.getAdministratorComplianceRecords({
        administratorId,
        ...query,
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The administrator preview was not found.')
    }
    return result
  }

  public async getAdministratorComplianceRecord(
    administratorId: string,
    recordId: string,
  ): Promise<AdministratorComplianceRecordData> {
    const result = await this.repository.getAdministratorComplianceRecord({
      administratorId,
      recordId,
    })
    if (result === null) {
      throw resourceNotFoundError('The compliance record preview was not found.')
    }
    return result
  }

  public async decideAdministratorCompliance(options: {
    readonly administratorId: string
    readonly body: AdministratorComplianceDecisionBody
    readonly idempotencyKey: string
    readonly recordId: string
  }): Promise<AdministratorComplianceDecisionData> {
    const result = await this.operationsAction(() =>
      this.repository.decideAdministratorCompliance({
        ...options,
        occurredAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The compliance record preview was not found.')
    }
    return result
  }

  public async getWorkerTimesheets(
    workerId: string,
    query: TimesheetsQuery,
  ): Promise<PaginatedRepositoryResult<WorkerTimesheetsData>> {
    const result = await readPaginatedResult(() =>
      this.repository.getWorkerTimesheets({
        ...query,
        referenceAt: this.referenceAt(),
        workerId,
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The worker preview was not found.')
    }
    return result
  }

  public async getWorkerTimesheetDetail(
    workerId: string,
    timesheetId: string,
  ): Promise<WorkerTimesheetDetailData> {
    const result = await this.repository.getWorkerTimesheetDetail({
      timesheetId,
      workerId,
    })
    if (result === null) {
      throw resourceNotFoundError('The Worker timesheet preview was not found.')
    }
    return result
  }

  public async createWorkerTimesheet(options: {
    readonly body: WorkerTimesheetCreateBody
    readonly idempotencyKey: string
    readonly workerId: string
  }): Promise<WorkerTimesheetMutationData> {
    const result = await this.operationsAction(() =>
      this.repository.createWorkerTimesheet({
        ...options,
        occurredAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The completed assignment preview was not found.')
    }
    return result
  }

  public async updateWorkerTimesheet(options: {
    readonly body: WorkerTimesheetUpdateBody
    readonly idempotencyKey: string
    readonly timesheetId: string
    readonly workerId: string
  }): Promise<WorkerTimesheetMutationData> {
    const result = await this.operationsAction(() =>
      this.repository.updateWorkerTimesheet({
        ...options,
        occurredAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The Worker timesheet preview was not found.')
    }
    return result
  }

  public async submitWorkerTimesheet(options: {
    readonly expectedVersion: number
    readonly idempotencyKey: string
    readonly timesheetId: string
    readonly workerId: string
  }): Promise<WorkerTimesheetMutationData> {
    const result = await this.operationsAction(() =>
      this.repository.submitWorkerTimesheet({
        ...options,
        occurredAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The Worker timesheet preview was not found.')
    }
    return result
  }

  public async getManagerTimesheets(
    managerId: string,
    query: TimesheetsQuery,
  ): Promise<PaginatedRepositoryResult<ManagerTimesheetsData>> {
    const result = await readPaginatedResult(() =>
      this.repository.getManagerTimesheets({ managerId, ...query }),
    )
    if (result === null) {
      throw resourceNotFoundError('The manager preview was not found.')
    }
    return result
  }

  public async decideManagerTimesheet(options: {
    readonly body: ManagerTimesheetDecisionBody
    readonly idempotencyKey: string
    readonly managerId: string
    readonly timesheetId: string
  }): Promise<WorkerTimesheetMutationData> {
    const result = await this.operationsAction(() =>
      this.repository.decideManagerTimesheet({
        ...options,
        occurredAt: this.referenceAt(),
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The Manager timesheet preview was not found.')
    }
    return result
  }

  public async getAdministratorTimesheets(
    administratorId: string,
    query: TimesheetsQuery,
  ): Promise<PaginatedRepositoryResult<AdministratorTimesheetsData>> {
    const result = await readPaginatedResult(() =>
      this.repository.getAdministratorTimesheets({
        administratorId,
        ...query,
      }),
    )
    if (result === null) {
      throw resourceNotFoundError('The administrator preview was not found.')
    }
    return result
  }

  public async getNotifications(
    query: NotificationsQuery,
  ): Promise<PaginatedRepositoryResult<NotificationsData>> {
    const result = await readPaginatedResult(() =>
      this.repository.getNotifications(query),
    )

    if (result === null) {
      throw resourceNotFoundError('The notification recipient was not found.')
    }

    return result
  }
}

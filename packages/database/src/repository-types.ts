import type {
  AdministratorComplianceDecisionBody,
  AdministratorComplianceDecisionData,
  AdministratorComplianceRecordData,
  AdministratorComplianceRecordsData,
  AdministratorComplianceRecordsQuery,
  AdministratorComplianceData,
  AdministratorRecordsData,
  AdministratorRecordsQuery,
  ComplianceQuery,
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

export type PaginatedRepositoryResult<T> = T & {
  readonly nextCursor: string | null
}

export interface AdministratorComplianceLookup extends ComplianceQuery {
  readonly administratorId: string
}

export interface AdministratorRecordsLookup extends AdministratorRecordsQuery {
  readonly administratorId: string
}

export interface WorkerShiftsLookup extends WorkerShiftsQuery {
  readonly referenceAt: string
  readonly workerId: string
}

export interface WorkerShiftDetailLookup {
  readonly referenceAt: string
  readonly shiftId: string
  readonly workerId: string
}

export interface WorkerScheduleLookup extends WorkerScheduleQuery {
  readonly referenceAt: string
  readonly workerId: string
}

export interface WorkerShiftRequestCommand {
  readonly idempotencyKey: string
  readonly occurredAt: string
  readonly shiftId: string
  readonly workerId: string
}

export interface WorkerAssignmentCancellationCommand {
  readonly assignmentId: string
  readonly idempotencyKey: string
  readonly occurredAt: string
  readonly workerId: string
}

export interface ManagerAssignmentRequestsLookup
  extends ManagerAssignmentRequestsQuery {
  readonly managerId: string
}

export interface ManagerAssignmentDecisionCommand {
  readonly assignmentId: string
  readonly body: ManagerAssignmentDecisionBody
  readonly idempotencyKey: string
  readonly managerId: string
  readonly occurredAt: string
}

export interface ManagerShiftsLookup extends ManagerShiftsQuery {
  readonly managerId: string
  readonly referenceAt: string
}

export interface ManagerShiftDetailLookup {
  readonly managerId: string
  readonly referenceAt: string
  readonly shiftId: string
}

export interface ManagerShiftCreateCommand {
  readonly body: ManagerShiftCreateBody
  readonly idempotencyKey: string
  readonly managerId: string
  readonly occurredAt: string
}

export interface ManagerShiftUpdateCommand {
  readonly body: ManagerShiftUpdateBody
  readonly idempotencyKey: string
  readonly managerId: string
  readonly occurredAt: string
  readonly shiftId: string
}

export interface ManagerShiftVersionCommand {
  readonly expectedVersion: number
  readonly idempotencyKey: string
  readonly managerId: string
  readonly occurredAt: string
  readonly shiftId: string
}

export interface ManagerShiftCancelCommand extends ManagerShiftVersionCommand {
  readonly reason: string
}

export interface AdministratorComplianceRecordsLookup
  extends AdministratorComplianceRecordsQuery {
  readonly administratorId: string
}

export interface AdministratorComplianceRecordLookup {
  readonly administratorId: string
  readonly recordId: string
}

export interface AdministratorComplianceDecisionCommand {
  readonly administratorId: string
  readonly body: AdministratorComplianceDecisionBody
  readonly idempotencyKey: string
  readonly occurredAt: string
  readonly recordId: string
}

export interface WorkerTimesheetsLookup extends TimesheetsQuery {
  readonly referenceAt: string
  readonly workerId: string
}

export interface WorkerTimesheetDetailLookup {
  readonly timesheetId: string
  readonly workerId: string
}

export interface WorkerTimesheetCreateCommand {
  readonly body: WorkerTimesheetCreateBody
  readonly idempotencyKey: string
  readonly occurredAt: string
  readonly workerId: string
}

export interface WorkerTimesheetUpdateCommand {
  readonly body: WorkerTimesheetUpdateBody
  readonly idempotencyKey: string
  readonly occurredAt: string
  readonly timesheetId: string
  readonly workerId: string
}

export interface WorkerTimesheetSubmitCommand {
  readonly expectedVersion: number
  readonly idempotencyKey: string
  readonly occurredAt: string
  readonly timesheetId: string
  readonly workerId: string
}

export interface ManagerTimesheetsLookup extends TimesheetsQuery {
  readonly managerId: string
}

export interface ManagerTimesheetDecisionCommand {
  readonly body: ManagerTimesheetDecisionBody
  readonly idempotencyKey: string
  readonly managerId: string
  readonly occurredAt: string
  readonly timesheetId: string
}

export interface AdministratorTimesheetsLookup extends TimesheetsQuery {
  readonly administratorId: string
}

export interface PreviewRepository {
  getWorkerOverview(workerId: string): Promise<WorkerOverviewData | null>
  getWorkerReadiness(workerId: string): Promise<WorkerReadinessData | null>
  getWorkerShifts(
    query: WorkerShiftsLookup,
  ): Promise<PaginatedRepositoryResult<WorkerShiftsData> | null>
  getWorkerShiftDetail(
    query: WorkerShiftDetailLookup,
  ): Promise<WorkerShiftDetailData | null>
  getWorkerSchedule(
    query: WorkerScheduleLookup,
  ): Promise<PaginatedRepositoryResult<WorkerScheduleData> | null>
  requestWorkerShift(
    command: WorkerShiftRequestCommand,
  ): Promise<WorkerAssignmentMutation | null>
  cancelWorkerAssignment(
    command: WorkerAssignmentCancellationCommand,
  ): Promise<WorkerAssignmentMutation | null>
  getManagerOperations(managerId: string): Promise<ManagerOperationsData | null>
  getManagerCoverage(managerId: string): Promise<ManagerCoverageData | null>
  getManagerAssignmentRequests(
    query: ManagerAssignmentRequestsLookup,
  ): Promise<PaginatedRepositoryResult<ManagerAssignmentRequestsData> | null>
  decideManagerAssignment(
    command: ManagerAssignmentDecisionCommand,
  ): Promise<ManagerAssignmentDecisionData | null>
  getManagerShifts(
    query: ManagerShiftsLookup,
  ): Promise<PaginatedRepositoryResult<ManagerShiftsData> | null>
  getManagerShiftDetail(
    query: ManagerShiftDetailLookup,
  ): Promise<ManagerShiftDetailData | null>
  createManagerShift(
    command: ManagerShiftCreateCommand,
  ): Promise<ManagerShiftMutationData | null>
  updateManagerShift(
    command: ManagerShiftUpdateCommand,
  ): Promise<ManagerShiftMutationData | null>
  publishManagerShift(
    command: ManagerShiftVersionCommand,
  ): Promise<ManagerShiftMutationData | null>
  cancelManagerShift(
    command: ManagerShiftCancelCommand,
  ): Promise<ManagerShiftMutationData | null>
  getAdministratorCompliance(
    query: AdministratorComplianceLookup,
  ): Promise<PaginatedRepositoryResult<AdministratorComplianceData> | null>
  getAdministratorRecords(
    query: AdministratorRecordsLookup,
  ): Promise<PaginatedRepositoryResult<AdministratorRecordsData> | null>
  getAdministratorComplianceRecords(
    query: AdministratorComplianceRecordsLookup,
  ): Promise<PaginatedRepositoryResult<AdministratorComplianceRecordsData> | null>
  getAdministratorComplianceRecord(
    query: AdministratorComplianceRecordLookup,
  ): Promise<AdministratorComplianceRecordData | null>
  decideAdministratorCompliance(
    command: AdministratorComplianceDecisionCommand,
  ): Promise<AdministratorComplianceDecisionData | null>
  getWorkerTimesheets(
    query: WorkerTimesheetsLookup,
  ): Promise<PaginatedRepositoryResult<WorkerTimesheetsData> | null>
  getWorkerTimesheetDetail(
    query: WorkerTimesheetDetailLookup,
  ): Promise<WorkerTimesheetDetailData | null>
  createWorkerTimesheet(
    command: WorkerTimesheetCreateCommand,
  ): Promise<WorkerTimesheetMutationData | null>
  updateWorkerTimesheet(
    command: WorkerTimesheetUpdateCommand,
  ): Promise<WorkerTimesheetMutationData | null>
  submitWorkerTimesheet(
    command: WorkerTimesheetSubmitCommand,
  ): Promise<WorkerTimesheetMutationData | null>
  getManagerTimesheets(
    query: ManagerTimesheetsLookup,
  ): Promise<PaginatedRepositoryResult<ManagerTimesheetsData> | null>
  decideManagerTimesheet(
    command: ManagerTimesheetDecisionCommand,
  ): Promise<WorkerTimesheetMutationData | null>
  getAdministratorTimesheets(
    query: AdministratorTimesheetsLookup,
  ): Promise<PaginatedRepositoryResult<AdministratorTimesheetsData> | null>
  getNotifications(
    query: NotificationsQuery,
  ): Promise<PaginatedRepositoryResult<NotificationsData> | null>
}

export class InvalidPreviewCursorError extends Error {
  public override readonly name = 'InvalidPreviewCursorError'
}


export type WorkerJourneyRuleCode =
  | 'SHIFT_UNAVAILABLE'
  | 'SHIFT_FULL'
  | 'ASSIGNMENT_ALREADY_ACTIVE'
  | 'SCHEDULE_OVERLAP'
  | 'READINESS_REQUIRED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CANCELLATION_NOT_ALLOWED'

export class WorkerJourneyRuleError extends Error {
  public override readonly name = 'WorkerJourneyRuleError'

  public constructor(
    public readonly code: WorkerJourneyRuleCode,
    message: string,
  ) {
    super(message)
  }
}

export type OperationsRuleCode =
  | 'ASSIGNMENT_NOT_REVIEWABLE'
  | 'VERSION_CONFLICT'
  | 'SHIFT_LIFECYCLE_CONFLICT'
  | 'COMPLIANCE_NOT_REVIEWABLE'
  | 'TIMESHEET_NOT_ELIGIBLE'
  | 'TIMESHEET_LIFECYCLE_CONFLICT'
  | 'ORGANISATION_SCOPE_MISMATCH'
  | 'IDEMPOTENCY_CONFLICT'

export class OperationsRuleError extends Error {
  public override readonly name = 'OperationsRuleError'

  public constructor(
    public readonly code: OperationsRuleCode,
    message: string,
  ) {
    super(message)
  }
}

import type {
  AdministratorComplianceLookup,
  AdministratorRecordsLookup,
  PaginatedRepositoryResult,
  PreviewRepository,
  WorkerAssignmentCancellationCommand,
  WorkerShiftRequestCommand,
} from '@ajani/database'
import { previewDataUnavailableError } from '../errors/api-errors.js'

function unavailable(): Promise<never> {
  return Promise.reject(previewDataUnavailableError())
}

export const unavailablePreviewRepository: PreviewRepository = {
  getWorkerOverview: unavailable,
  getWorkerReadiness: unavailable,
  getWorkerShifts: unavailable,
  getWorkerShiftDetail: unavailable,
  getWorkerSchedule: unavailable,
  requestWorkerShift: unavailable,
  cancelWorkerAssignment: unavailable,
  getManagerOperations: unavailable,
  getManagerCoverage: unavailable,
  getManagerAssignmentRequests: unavailable,
  decideManagerAssignment: unavailable,
  getManagerShifts: unavailable,
  getManagerShiftDetail: unavailable,
  createManagerShift: unavailable,
  updateManagerShift: unavailable,
  publishManagerShift: unavailable,
  cancelManagerShift: unavailable,
  getAdministratorCompliance: unavailable,
  getAdministratorRecords: unavailable,
  getAdministratorComplianceRecords: unavailable,
  getAdministratorComplianceRecord: unavailable,
  decideAdministratorCompliance: unavailable,
  getWorkerTimesheets: unavailable,
  getWorkerTimesheetDetail: unavailable,
  createWorkerTimesheet: unavailable,
  updateWorkerTimesheet: unavailable,
  submitWorkerTimesheet: unavailable,
  getManagerTimesheets: unavailable,
  decideManagerTimesheet: unavailable,
  getAdministratorTimesheets: unavailable,
  getNotifications: unavailable,
}

export type {
  AdministratorComplianceLookup,
  AdministratorRecordsLookup,
  PaginatedRepositoryResult,
  PreviewRepository,
  WorkerAssignmentCancellationCommand,
  WorkerShiftRequestCommand,
}

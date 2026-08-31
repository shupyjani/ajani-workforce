import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const organisationStatusValues = ['active', 'inactive'] as const
export const memberTypeValues = [
  'worker',
  'manager',
  'administrator',
] as const
export const memberStatusValues = ['active', 'inactive'] as const
export const readinessStatusValues = [
  'ready',
  'action_due',
  'reviewing',
] as const
export const competencyStatusValues = [
  'current',
  'due_soon',
  'expired',
  'reviewing',
] as const
export const complianceRecordStatusValues = [
  'current',
  'due_soon',
  'action_due',
  'reviewing',
  'information_required',
  'rejected',
] as const
export const shiftStatusValues = [
  'draft',
  'open',
  'covered',
  'cancelled',
  'completed',
] as const
export const assignmentStatusValues = [
  'confirmed',
  'review',
  'cancelled',
  'declined',
] as const
export const timesheetStatusValues = [
  'draft',
  'submitted',
  'rejected',
  'approved',
] as const
export const complianceDecisionValues = [
  'approved_current',
  'further_information_required',
  'rejected',
] as const
export const notificationToneValues = [
  'information',
  'warning',
  'success',
] as const
export const activityEventTypeValues = [
  'shift_updated',
  'shift_confirmed',
  'shift_requested',
  'shift_request_review',
  'shift_cancelled',
  'assignment_approved',
  'assignment_declined',
  'shift_created',
  'shift_published',
  'shift_manager_cancelled',
  'compliance_decided',
  'timesheet_saved',
  'timesheet_submitted',
  'timesheet_approved',
  'timesheet_rejected',
  'readiness_updated',
  'profile_reviewed',
] as const
export const idempotencyOperationValues = [
  'request_shift',
  'cancel_assignment',
  'manager_assignment_decision',
  'create_shift',
  'update_shift',
  'publish_shift',
  'cancel_shift',
  'compliance_decision',
  'create_timesheet',
  'update_timesheet',
  'submit_timesheet',
  'timesheet_decision',
] as const

export type OrganisationStatus = (typeof organisationStatusValues)[number]
export type MemberType = (typeof memberTypeValues)[number]
export type MemberStatus = (typeof memberStatusValues)[number]
export type ReadinessStatus = (typeof readinessStatusValues)[number]
export type CompetencyStatus = (typeof competencyStatusValues)[number]
export type ComplianceRecordStatus =
  (typeof complianceRecordStatusValues)[number]
export type ShiftStatus = (typeof shiftStatusValues)[number]
export type AssignmentStatus = (typeof assignmentStatusValues)[number]
export type TimesheetStatus = (typeof timesheetStatusValues)[number]
export type ComplianceDecision = (typeof complianceDecisionValues)[number]
export type NotificationTone = (typeof notificationToneValues)[number]
export type ActivityEventType = (typeof activityEventTypeValues)[number]
export type IdempotencyOperation =
  (typeof idempotencyOperationValues)[number]

const auditColumns = {
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
    .notNull()
    .defaultNow(),
}

export const organisations = pgTable(
  'organisations',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: text('status').$type<OrganisationStatus>().notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('organisations_name_unique').on(table.name),
    uniqueIndex('organisations_slug_unique').on(table.slug),
    check(
      'organisations_status_check',
      sql`${table.status} in ('active', 'inactive')`,
    ),
  ],
)

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    timezone: text('timezone').notNull(),
    status: text('status').$type<OrganisationStatus>().notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('locations_organisation_slug_unique').on(
      table.organisationId,
      table.slug,
    ),
    index('locations_organisation_status_index').on(
      table.organisationId,
      table.status,
    ),
    check(
      'locations_status_check',
      sql`${table.status} in ('active', 'inactive')`,
    ),
  ],
)

export const workforceMembers = pgTable(
  'workforce_members',
  {
    id: uuid('id').primaryKey(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'restrict' }),
    homeLocationId: uuid('home_location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
    previewReference: text('preview_reference').notNull(),
    givenName: text('given_name').notNull(),
    familyName: text('family_name').notNull(),
    roleTitle: text('role_title').notNull(),
    homeAreaName: text('home_area_name'),
    memberType: text('member_type').$type<MemberType>().notNull(),
    status: text('status').$type<MemberStatus>().notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('workforce_members_organisation_reference_unique').on(
      table.organisationId,
      table.previewReference,
    ),
    index('workforce_members_organisation_type_status_index').on(
      table.organisationId,
      table.memberType,
      table.status,
    ),
    check(
      'workforce_members_type_check',
      sql`${table.memberType} in ('worker', 'manager', 'administrator')`,
    ),
    check(
      'workforce_members_status_check',
      sql`${table.status} in ('active', 'inactive')`,
    ),
  ],
)

export const workerProfiles = pgTable(
  'worker_profiles',
  {
    id: uuid('id').primaryKey(),
    workforceMemberId: uuid('workforce_member_id')
      .notNull()
      .references(() => workforceMembers.id, { onDelete: 'cascade' }),
    overallReadinessStatus: text('overall_readiness_status')
      .$type<ReadinessStatus>()
      .notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('worker_profiles_member_unique').on(table.workforceMemberId),
    index('worker_profiles_readiness_index').on(table.overallReadinessStatus),
    check(
      'worker_profiles_readiness_check',
      sql`${table.overallReadinessStatus} in ('ready', 'action_due', 'reviewing')`,
    ),
  ],
)

export const competencies = pgTable(
  'competencies',
  {
    id: uuid('id').primaryKey(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('competencies_organisation_code_unique').on(
      table.organisationId,
      table.code,
    ),
    index('competencies_organisation_index').on(table.organisationId),
  ],
)

export const workerCompetencies = pgTable(
  'worker_competencies',
  {
    id: uuid('id').primaryKey(),
    workerProfileId: uuid('worker_profile_id')
      .notNull()
      .references(() => workerProfiles.id, { onDelete: 'cascade' }),
    competencyId: uuid('competency_id')
      .notNull()
      .references(() => competencies.id, { onDelete: 'restrict' }),
    status: text('status').$type<CompetencyStatus>().notNull(),
    verifiedOn: date('verified_on', { mode: 'string' }),
    expiresOn: date('expires_on', { mode: 'string' }),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('worker_competencies_profile_competency_unique').on(
      table.workerProfileId,
      table.competencyId,
    ),
    index('worker_competencies_profile_status_expiry_index').on(
      table.workerProfileId,
      table.status,
      table.expiresOn,
    ),
    check(
      'worker_competencies_status_check',
      sql`${table.status} in ('current', 'due_soon', 'expired', 'reviewing')`,
    ),
    check(
      'worker_competencies_date_order_check',
      sql`${table.verifiedOn} is null or ${table.expiresOn} is null or ${table.expiresOn} >= ${table.verifiedOn}`,
    ),
  ],
)

export const complianceRequirements = pgTable(
  'compliance_requirements',
  {
    id: uuid('id').primaryKey(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'restrict' }),
    competencyId: uuid('competency_id').references(() => competencies.id, {
      onDelete: 'restrict',
    }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    sortOrder: integer('sort_order').notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('compliance_requirements_organisation_code_unique').on(
      table.organisationId,
      table.code,
    ),
    uniqueIndex('compliance_requirements_organisation_order_unique').on(
      table.organisationId,
      table.sortOrder,
    ),
    index('compliance_requirements_organisation_index').on(
      table.organisationId,
    ),
    check(
      'compliance_requirements_sort_order_check',
      sql`${table.sortOrder} > 0`,
    ),
  ],
)

export const complianceRecords = pgTable(
  'compliance_records',
  {
    id: uuid('id').primaryKey(),
    workerProfileId: uuid('worker_profile_id')
      .notNull()
      .references(() => workerProfiles.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => complianceRequirements.id, { onDelete: 'restrict' }),
    status: text('status').$type<ComplianceRecordStatus>().notNull(),
    reviewedOn: date('reviewed_on', { mode: 'string' }),
    dueOn: date('due_on', { mode: 'string' }),
    detail: text('detail').notNull(),
    version: integer('version').notNull().default(1),
    reviewNote: text('review_note'),
    reviewedByMemberId: uuid('reviewed_by_member_id').references(
      () => workforceMembers.id,
      { onDelete: 'restrict' },
    ),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('compliance_records_profile_requirement_unique').on(
      table.workerProfileId,
      table.requirementId,
    ),
    index('compliance_records_profile_status_due_index').on(
      table.workerProfileId,
      table.status,
      table.dueOn,
    ),
    index('compliance_records_requirement_index').on(table.requirementId),
    check(
      'compliance_records_status_check',
      sql`${table.status} in ('current', 'due_soon', 'action_due', 'reviewing', 'information_required', 'rejected')`,
    ),
    check(
      'compliance_records_date_order_check',
      sql`${table.reviewedOn} is null or ${table.dueOn} is null or ${table.dueOn} >= ${table.reviewedOn}`,
    ),
    check('compliance_records_version_check', sql`${table.version} > 0`),
    check(
      'compliance_records_review_note_length_check',
      sql`${table.reviewNote} is null or char_length(${table.reviewNote}) between 1 and 500`,
    ),
  ],
)

export const complianceReviewEvents = pgTable(
  'compliance_review_events',
  {
    id: uuid('id').primaryKey(),
    complianceRecordId: uuid('compliance_record_id')
      .notNull()
      .references(() => complianceRecords.id, { onDelete: 'cascade' }),
    administratorMemberId: uuid('administrator_member_id')
      .notNull()
      .references(() => workforceMembers.id, { onDelete: 'restrict' }),
    decision: text('decision').$type<ComplianceDecision>().notNull(),
    note: text('note').notNull(),
    occurredAt: timestamp('occurred_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    ...auditColumns,
  },
  (table) => [
    index('compliance_review_events_record_occurred_index').on(
      table.complianceRecordId,
      table.occurredAt,
      table.id,
    ),
    check(
      'compliance_review_events_decision_check',
      sql`${table.decision} in ('approved_current', 'further_information_required', 'rejected')`,
    ),
    check(
      'compliance_review_events_note_length_check',
      sql`char_length(${table.note}) between 1 and 500`,
    ),
  ],
)

export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id').primaryKey(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    areaName: text('area_name').notNull(),
    roleTitle: text('role_title').notNull(),
    startsAt: timestamp('starts_at', { mode: 'string', withTimezone: true })
      .notNull(),
    endsAt: timestamp('ends_at', { mode: 'string', withTimezone: true }).notNull(),
    requiredWorkers: integer('required_workers').notNull(),
    status: text('status').$type<ShiftStatus>().notNull(),
    arrivalNote: text('arrival_note'),
    cancelledAt: timestamp('cancelled_at', {
      mode: 'string',
      withTimezone: true,
    }),
    cancellationReason: text('cancellation_reason'),
    createdByMemberId: uuid('created_by_member_id').references(
      () => workforceMembers.id,
      { onDelete: 'set null' },
    ),
    version: integer('version').notNull().default(1),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('shifts_location_area_start_role_unique').on(
      table.locationId,
      table.areaName,
      table.startsAt,
      table.roleTitle,
    ),
    index('shifts_organisation_start_index').on(
      table.organisationId,
      table.startsAt,
    ),
    index('shifts_location_start_index').on(table.locationId, table.startsAt),
    index('shifts_status_start_index').on(table.status, table.startsAt),
    check('shifts_status_check', sql`${table.status} in ('draft', 'open', 'covered', 'cancelled', 'completed')`),
    check('shifts_required_workers_check', sql`${table.requiredWorkers} between 1 and 50`),
    check('shifts_time_order_check', sql`${table.endsAt} > ${table.startsAt}`),
    check(
      'shifts_duration_check',
      sql`${table.endsAt} <= ${table.startsAt} + interval '24 hours'`,
    ),
    check(
      'shifts_cancellation_check',
      sql`(${table.status} = 'cancelled' and ${table.cancelledAt} is not null and ${table.cancellationReason} is not null) or (${table.status} <> 'cancelled' and ${table.cancelledAt} is null and ${table.cancellationReason} is null)`,
    ),
    check('shifts_version_check', sql`${table.version} > 0`),
  ],
)

export const shiftAssignments = pgTable(
  'shift_assignments',
  {
    id: uuid('id').primaryKey(),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),
    workerProfileId: uuid('worker_profile_id')
      .notNull()
      .references(() => workerProfiles.id, { onDelete: 'restrict' }),
    status: text('status').$type<AssignmentStatus>().notNull(),
    assignedAt: timestamp('assigned_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    cancelledAt: timestamp('cancelled_at', {
      mode: 'string',
      withTimezone: true,
    }),
    cancellationReason: text('cancellation_reason'),
    reviewedAt: timestamp('reviewed_at', {
      mode: 'string',
      withTimezone: true,
    }),
    reviewReason: text('review_reason'),
    reviewedByMemberId: uuid('reviewed_by_member_id').references(
      () => workforceMembers.id,
      { onDelete: 'restrict' },
    ),
    version: integer('version').notNull().default(1),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('shift_assignments_shift_worker_unique').on(
      table.shiftId,
      table.workerProfileId,
    ),
    index('shift_assignments_worker_status_index').on(
      table.workerProfileId,
      table.status,
    ),
    index('shift_assignments_shift_status_index').on(
      table.shiftId,
      table.status,
    ),
    check(
      'shift_assignments_status_check',
      sql`${table.status} in ('confirmed', 'review', 'cancelled', 'declined')`,
    ),
    check(
      'shift_assignments_cancellation_check',
      sql`(${table.status} = 'cancelled' and ${table.cancelledAt} is not null and ${table.cancellationReason} is not null) or (${table.status} <> 'cancelled' and ${table.cancelledAt} is null and ${table.cancellationReason} is null)`,
    ),
    check('shift_assignments_version_check', sql`${table.version} > 0`),
    check(
      'shift_assignments_review_check',
      sql`${table.status} <> 'declined' or (${table.reviewedAt} is not null and ${table.reviewReason} is not null and ${table.reviewedByMemberId} is not null)`,
    ),
    check(
      'shift_assignments_review_reason_length_check',
      sql`${table.reviewReason} is null or char_length(${table.reviewReason}) between 1 and 240`,
    ),
  ],
)

export const timesheets = pgTable(
  'timesheets',
  {
    id: uuid('id').primaryKey(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => shiftAssignments.id, { onDelete: 'restrict' }),
    workerProfileId: uuid('worker_profile_id')
      .notNull()
      .references(() => workerProfiles.id, { onDelete: 'restrict' }),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'restrict' }),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'restrict' }),
    workedStart: timestamp('worked_start', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    workedEnd: timestamp('worked_end', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    breakMinutes: integer('break_minutes').notNull(),
    workedMinutes: integer('worked_minutes').notNull(),
    workerNote: text('worker_note'),
    managerReviewNote: text('manager_review_note'),
    status: text('status').$type<TimesheetStatus>().notNull(),
    version: integer('version').notNull().default(1),
    submittedAt: timestamp('submitted_at', {
      mode: 'string',
      withTimezone: true,
    }),
    approvedAt: timestamp('approved_at', {
      mode: 'string',
      withTimezone: true,
    }),
    rejectedAt: timestamp('rejected_at', {
      mode: 'string',
      withTimezone: true,
    }),
    reviewedByMemberId: uuid('reviewed_by_member_id').references(
      () => workforceMembers.id,
      { onDelete: 'restrict' },
    ),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('timesheets_assignment_unique').on(table.assignmentId),
    index('timesheets_worker_status_updated_index').on(
      table.workerProfileId,
      table.status,
      table.updatedAt,
      table.id,
    ),
    index('timesheets_organisation_status_updated_index').on(
      table.organisationId,
      table.status,
      table.updatedAt,
      table.id,
    ),
    check(
      'timesheets_status_check',
      sql`${table.status} in ('draft', 'submitted', 'rejected', 'approved')`,
    ),
    check('timesheets_version_check', sql`${table.version} > 0`),
    check(
      'timesheets_time_order_check',
      sql`${table.workedEnd} > ${table.workedStart}`,
    ),
    check(
      'timesheets_duration_check',
      sql`${table.workedEnd} <= ${table.workedStart} + interval '24 hours'`,
    ),
    check(
      'timesheets_break_check',
      sql`${table.breakMinutes} >= 0 and ${table.breakMinutes} < extract(epoch from (${table.workedEnd} - ${table.workedStart})) / 60`,
    ),
    check(
      'timesheets_worked_minutes_check',
      sql`${table.workedMinutes} = floor(extract(epoch from (${table.workedEnd} - ${table.workedStart})) / 60)::int - ${table.breakMinutes} and ${table.workedMinutes} between 1 and 1440`,
    ),
    check(
      'timesheets_worker_note_length_check',
      sql`${table.workerNote} is null or char_length(${table.workerNote}) <= 500`,
    ),
    check(
      'timesheets_manager_note_length_check',
      sql`${table.managerReviewNote} is null or char_length(${table.managerReviewNote}) <= 500`,
    ),
    check(
      'timesheets_lifecycle_check',
      sql`(${table.status} = 'draft' and ${table.submittedAt} is null and ${table.approvedAt} is null and ${table.rejectedAt} is null and ${table.reviewedByMemberId} is null) or (${table.status} = 'submitted' and ${table.submittedAt} is not null and ${table.approvedAt} is null and ${table.rejectedAt} is null and ${table.reviewedByMemberId} is null) or (${table.status} = 'rejected' and ${table.submittedAt} is not null and ${table.approvedAt} is null and ${table.rejectedAt} is not null and ${table.reviewedByMemberId} is not null and ${table.managerReviewNote} is not null) or (${table.status} = 'approved' and ${table.submittedAt} is not null and ${table.approvedAt} is not null and ${table.rejectedAt} is null and ${table.reviewedByMemberId} is not null)`,
    ),
  ],
)

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: uuid('id').primaryKey(),
    workerProfileId: uuid('worker_profile_id').references(
      () => workerProfiles.id,
      { onDelete: 'cascade' },
    ),
    actorMemberId: uuid('actor_member_id')
      .notNull()
      .references(() => workforceMembers.id, { onDelete: 'cascade' }),
    operation: text('operation').$type<IdempotencyOperation>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    responseStatus: integer('response_status').notNull(),
    responsePayload: text('response_payload').notNull(),
    expiresAt: timestamp('expires_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('idempotency_records_scope_key_unique').on(
      table.actorMemberId,
      table.operation,
      table.idempotencyKey,
    ),
    index('idempotency_records_expiry_index').on(table.expiresAt),
    check(
      'idempotency_records_operation_check',
      sql`${table.operation} in ('request_shift', 'cancel_assignment', 'manager_assignment_decision', 'create_shift', 'update_shift', 'publish_shift', 'cancel_shift', 'compliance_decision', 'create_timesheet', 'update_timesheet', 'submit_timesheet', 'timesheet_decision')`,
    ),
    check(
      'idempotency_records_key_length_check',
      sql`char_length(${table.idempotencyKey}) between 8 and 128`,
    ),
    check(
      'idempotency_records_response_status_check',
      sql`${table.responseStatus} between 200 and 299`,
    ),
    check(
      'idempotency_records_expiry_check',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
)

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    recipientMemberId: uuid('recipient_member_id')
      .notNull()
      .references(() => workforceMembers.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    tone: text('tone').$type<NotificationTone>().notNull(),
    occurredAt: timestamp('occurred_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    readAt: timestamp('read_at', { mode: 'string', withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    index('notifications_recipient_occurred_index').on(
      table.recipientMemberId,
      table.occurredAt,
      table.id,
    ),
    check(
      'notifications_tone_check',
      sql`${table.tone} in ('information', 'warning', 'success')`,
    ),
    check(
      'notifications_read_time_check',
      sql`${table.readAt} is null or ${table.readAt} >= ${table.occurredAt}`,
    ),
  ],
)

export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'restrict' }),
    actorMemberId: uuid('actor_member_id').references(
      () => workforceMembers.id,
      { onDelete: 'set null' },
    ),
    subjectMemberId: uuid('subject_member_id').references(
      () => workforceMembers.id,
      { onDelete: 'set null' },
    ),
    shiftId: uuid('shift_id').references(() => shifts.id, {
      onDelete: 'set null',
    }),
    eventType: text('event_type').$type<ActivityEventType>().notNull(),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    occurredAt: timestamp('occurred_at', {
      mode: 'string',
      withTimezone: true,
    }).notNull(),
    ...auditColumns,
  },
  (table) => [
    index('activity_events_subject_occurred_index').on(
      table.subjectMemberId,
      table.occurredAt,
      table.id,
    ),
    index('activity_events_organisation_occurred_index').on(
      table.organisationId,
      table.occurredAt,
    ),
    check(
      'activity_events_type_check',
      sql`${table.eventType} in ('shift_updated', 'shift_confirmed', 'shift_requested', 'shift_request_review', 'shift_cancelled', 'assignment_approved', 'assignment_declined', 'shift_created', 'shift_published', 'shift_manager_cancelled', 'compliance_decided', 'timesheet_saved', 'timesheet_submitted', 'timesheet_approved', 'timesheet_rejected', 'readiness_updated', 'profile_reviewed')`,
    ),
  ],
)

export type Organisation = typeof organisations.$inferSelect
export type Location = typeof locations.$inferSelect
export type WorkforceMember = typeof workforceMembers.$inferSelect
export type WorkerProfile = typeof workerProfiles.$inferSelect
export type Competency = typeof competencies.$inferSelect
export type WorkerCompetency = typeof workerCompetencies.$inferSelect
export type Shift = typeof shifts.$inferSelect
export type ShiftAssignment = typeof shiftAssignments.$inferSelect
export type IdempotencyRecord = typeof idempotencyRecords.$inferSelect
export type ComplianceRequirement = typeof complianceRequirements.$inferSelect
export type ComplianceRecord = typeof complianceRecords.$inferSelect
export type ComplianceReviewEvent = typeof complianceReviewEvents.$inferSelect
export type Timesheet = typeof timesheets.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type ActivityEvent = typeof activityEvents.$inferSelect

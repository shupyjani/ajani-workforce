import { previewIdentifiers } from './preview-identifiers.js'
import type {
  activityEvents,
  complianceReviewEvents,
  complianceRecords,
  complianceRequirements,
  competencies,
  locations,
  notifications,
  organisations,
  shiftAssignments,
  shifts,
  timesheets,
  workforceMembers,
  workerCompetencies,
  workerProfiles,
} from './schema.js'

type OrganisationInsert = typeof organisations.$inferInsert
type LocationInsert = typeof locations.$inferInsert
type WorkforceMemberInsert = typeof workforceMembers.$inferInsert
type WorkerProfileInsert = typeof workerProfiles.$inferInsert
type CompetencyInsert = typeof competencies.$inferInsert
type WorkerCompetencyInsert = typeof workerCompetencies.$inferInsert
type ComplianceRequirementInsert = typeof complianceRequirements.$inferInsert
type ComplianceRecordInsert = typeof complianceRecords.$inferInsert
type ShiftInsert = typeof shifts.$inferInsert
type ShiftAssignmentInsert = typeof shiftAssignments.$inferInsert
type NotificationInsert = typeof notifications.$inferInsert
type ActivityEventInsert = typeof activityEvents.$inferInsert
type ComplianceReviewEventInsert = typeof complianceReviewEvents.$inferInsert
type TimesheetInsert = typeof timesheets.$inferInsert

const auditTimestamp = '2026-08-01T09:00:00.000Z'
const audit = {
  createdAt: auditTimestamp,
  updatedAt: auditTimestamp,
} as const

function seedValue<T>(values: readonly T[], index: number): T {
  const value = values[index]
  if (value === undefined) {
    throw new Error('A deterministic preview seed definition is incomplete.')
  }
  return value
}

export const previewOrganisations = [
  {
    ...audit,
    id: previewIdentifiers.organisation,
    name: 'Asterbridge Workforce Cooperative',
    slug: 'asterbridge-workforce-cooperative',
    status: 'active',
  },
] as const satisfies readonly OrganisationInsert[]

export const previewLocations = [
  {
    ...audit,
    id: previewIdentifiers.locations.willowmere,
    name: 'Willowmere Community Hospital',
    organisationId: previewIdentifiers.organisation,
    slug: 'willowmere-community-hospital',
    status: 'active',
    timezone: 'Europe/London',
  },
  {
    ...audit,
    id: previewIdentifiers.locations.harbourlight,
    name: 'Harbourlight Care Centre',
    organisationId: previewIdentifiers.organisation,
    slug: 'harbourlight-care-centre',
    status: 'active',
    timezone: 'Europe/London',
  },
] as const satisfies readonly LocationInsert[]

export const previewWorkforceMembers = [
  {
    ...audit,
    familyName: 'Mensah',
    givenName: 'Leila',
    homeAreaName: 'Maple Ward',
    homeLocationId: previewIdentifiers.locations.willowmere,
    id: previewIdentifiers.members.leilaMensah,
    memberType: 'worker',
    organisationId: previewIdentifiers.organisation,
    previewReference: 'AJN-2041',
    roleTitle: 'Registered nurse',
    status: 'active',
  },
  {
    ...audit,
    familyName: 'Adeyemi',
    givenName: 'Theo',
    homeAreaName: 'Short stay unit',
    homeLocationId: previewIdentifiers.locations.willowmere,
    id: previewIdentifiers.members.theoAdeyemi,
    memberType: 'worker',
    organisationId: previewIdentifiers.organisation,
    previewReference: 'AJN-2088',
    roleTitle: 'Healthcare assistant',
    status: 'active',
  },
  {
    ...audit,
    familyName: 'Okoro',
    givenName: 'Mina',
    homeAreaName: 'Maple Ward',
    homeLocationId: previewIdentifiers.locations.willowmere,
    id: previewIdentifiers.members.minaOkoro,
    memberType: 'worker',
    organisationId: previewIdentifiers.organisation,
    previewReference: 'AJN-2114',
    roleTitle: 'Registered nurse',
    status: 'active',
  },
  {
    ...audit,
    familyName: 'Boateng',
    givenName: 'Noah',
    homeAreaName: 'Short stay unit',
    homeLocationId: previewIdentifiers.locations.harbourlight,
    id: previewIdentifiers.members.noahBoateng,
    memberType: 'worker',
    organisationId: previewIdentifiers.organisation,
    previewReference: 'AJN-2192',
    roleTitle: 'Support worker',
    status: 'active',
  },
  {
    ...audit,
    familyName: 'Kone',
    givenName: 'Ari',
    homeAreaName: 'Birch Ward',
    homeLocationId: previewIdentifiers.locations.willowmere,
    id: previewIdentifiers.members.ariKone,
    memberType: 'worker',
    organisationId: previewIdentifiers.organisation,
    previewReference: 'AJN-2246',
    roleTitle: 'Healthcare assistant',
    status: 'active',
  },
  {
    ...audit,
    familyName: 'Bello',
    givenName: 'Sofia',
    homeAreaName: 'Maple Ward',
    homeLocationId: previewIdentifiers.locations.willowmere,
    id: previewIdentifiers.members.sofiaBello,
    memberType: 'worker',
    organisationId: previewIdentifiers.organisation,
    previewReference: 'AJN-2281',
    roleTitle: 'Registered nurse',
    status: 'active',
  },
  {
    ...audit,
    familyName: 'Dube',
    givenName: 'Imani',
    homeAreaName: 'Willowmere region',
    homeLocationId: previewIdentifiers.locations.willowmere,
    id: previewIdentifiers.members.imaniDube,
    memberType: 'manager',
    organisationId: previewIdentifiers.organisation,
    previewReference: 'AJN-M001',
    roleTitle: 'Workforce manager',
    status: 'active',
  },
  {
    ...audit,
    familyName: 'Adebayo',
    givenName: 'Malik',
    homeAreaName: 'Willowmere region',
    homeLocationId: previewIdentifiers.locations.willowmere,
    id: previewIdentifiers.members.malikAdebayo,
    memberType: 'administrator',
    organisationId: previewIdentifiers.organisation,
    previewReference: 'AJN-A001',
    roleTitle: 'Workforce administrator',
    status: 'active',
  },
] as const satisfies readonly WorkforceMemberInsert[]

export const previewWorkerProfiles = [
  {
    ...audit,
    id: previewIdentifiers.profiles.leilaMensah,
    overallReadinessStatus: 'ready',
    workforceMemberId: previewIdentifiers.members.leilaMensah,
  },
  {
    ...audit,
    id: previewIdentifiers.profiles.theoAdeyemi,
    overallReadinessStatus: 'action_due',
    workforceMemberId: previewIdentifiers.members.theoAdeyemi,
  },
  {
    ...audit,
    id: previewIdentifiers.profiles.minaOkoro,
    overallReadinessStatus: 'reviewing',
    workforceMemberId: previewIdentifiers.members.minaOkoro,
  },
  {
    ...audit,
    id: previewIdentifiers.profiles.noahBoateng,
    overallReadinessStatus: 'ready',
    workforceMemberId: previewIdentifiers.members.noahBoateng,
  },
  {
    ...audit,
    id: previewIdentifiers.profiles.ariKone,
    overallReadinessStatus: 'action_due',
    workforceMemberId: previewIdentifiers.members.ariKone,
  },
  {
    ...audit,
    id: previewIdentifiers.profiles.sofiaBello,
    overallReadinessStatus: 'ready',
    workforceMemberId: previewIdentifiers.members.sofiaBello,
  },
] as const satisfies readonly WorkerProfileInsert[]

export const previewCompetencies = [
  {
    ...audit,
    code: 'IDENTITY_ROLE',
    description: 'Identity and role evidence for the synthetic preview.',
    id: previewIdentifiers.competencies.identityAndRole,
    name: 'Identity and role check',
    organisationId: previewIdentifiers.organisation,
  },
  {
    ...audit,
    code: 'MANUAL_HANDLING',
    description: 'Manual handling readiness for the synthetic preview.',
    id: previewIdentifiers.competencies.manualHandling,
    name: 'Manual handling',
    organisationId: previewIdentifiers.organisation,
  },
  {
    ...audit,
    code: 'CORE_LEARNING',
    description: 'Core learning modules for the synthetic preview.',
    id: previewIdentifiers.competencies.coreLearning,
    name: 'Core learning',
    organisationId: previewIdentifiers.organisation,
  },
  {
    ...audit,
    code: 'ROLE_REQUIREMENTS',
    description: 'Role-specific readiness for the synthetic preview.',
    id: previewIdentifiers.competencies.roleRequirements,
    name: 'Role requirements',
    organisationId: previewIdentifiers.organisation,
  },
] as const satisfies readonly CompetencyInsert[]

export const previewComplianceRequirements = previewCompetencies.map(
  (competency, index): ComplianceRequirementInsert => ({
    ...audit,
    code: competency.code,
    competencyId: competency.id,
    description: competency.description,
    id: seedValue(Object.values(previewIdentifiers.requirements), index),
    name: competency.name,
    organisationId: previewIdentifiers.organisation,
    sortOrder: index + 1,
  }),
)

interface ProfileRequirementState {
  readonly dueDates: readonly [string, string, string, string]
  readonly profileId: string
  readonly statuses: readonly [
    ComplianceRecordInsert['status'],
    ComplianceRecordInsert['status'],
    ComplianceRecordInsert['status'],
    ComplianceRecordInsert['status'],
  ]
}

const profileRequirementStates: readonly ProfileRequirementState[] = [
  {
    dueDates: ['2027-07-14', '2026-09-12', '2027-06-30', '2027-04-18'],
    profileId: previewIdentifiers.profiles.leilaMensah,
    statuses: ['current', 'due_soon', 'current', 'current'],
  },
  {
    dueDates: ['2027-05-12', '2026-09-02', '2027-05-12', '2027-02-20'],
    profileId: previewIdentifiers.profiles.theoAdeyemi,
    statuses: ['current', 'information_required', 'current', 'current'],
  },
  {
    dueDates: ['2027-03-08', '2027-01-16', '2027-03-08', '2026-09-07'],
    profileId: previewIdentifiers.profiles.minaOkoro,
    statuses: ['current', 'current', 'current', 'reviewing'],
  },
  {
    dueDates: ['2027-08-01', '2026-09-24', '2027-07-20', '2027-02-14'],
    profileId: previewIdentifiers.profiles.noahBoateng,
    statuses: ['current', 'current', 'current', 'current'],
  },
  {
    dueDates: ['2027-05-10', '2026-09-05', '2027-05-10', '2027-01-09'],
    profileId: previewIdentifiers.profiles.ariKone,
    statuses: ['current', 'rejected', 'current', 'current'],
  },
  {
    dueDates: ['2027-07-22', '2026-10-01', '2027-07-22', '2027-03-11'],
    profileId: previewIdentifiers.profiles.sofiaBello,
    statuses: ['current', 'current', 'current', 'current'],
  },
]

function deterministicUuid(prefix: 'c' | 'd', sequence: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
}

const requirementDetails = [
  'Identity and role evidence is recorded for this synthetic profile.',
  'Manual handling review timing is shown for this synthetic profile.',
  'Core preview learning modules are recorded for this synthetic profile.',
  'Role requirements are recorded for this synthetic profile.',
] as const

export const previewComplianceRecords = profileRequirementStates.flatMap(
  (profile, profileIndex) =>
    previewComplianceRequirements.map(
      (requirement, requirementIndex): ComplianceRecordInsert => {
        const sequence = profileIndex * previewComplianceRequirements.length + requirementIndex + 1
        return {
          ...audit,
          detail: seedValue(requirementDetails, requirementIndex),
          dueOn: seedValue(profile.dueDates, requirementIndex),
          id: deterministicUuid('d', sequence),
          requirementId: requirement.id,
          reviewedOn: '2026-07-14',
          status: seedValue(profile.statuses, requirementIndex),
          workerProfileId: profile.profileId,
        }
      },
    ),
)

function competencyStatus(
  status: ComplianceRecordInsert['status'],
): WorkerCompetencyInsert['status'] {
  if (
    status === 'action_due' ||
    status === 'information_required' ||
    status === 'rejected'
  ) {
    return 'expired'
  }
  return status
}

export const previewWorkerCompetencies = profileRequirementStates.flatMap(
  (profile, profileIndex) =>
    previewCompetencies.map(
      (competency, competencyIndex): WorkerCompetencyInsert => {
        const sequence = profileIndex * previewCompetencies.length + competencyIndex + 1
        return {
          ...audit,
          competencyId: competency.id,
          expiresOn: seedValue(profile.dueDates, competencyIndex),
          id: deterministicUuid('c', sequence),
          status: competencyStatus(seedValue(profile.statuses, competencyIndex)),
          verifiedOn: '2026-07-14',
          workerProfileId: profile.profileId,
        }
      },
    ),
)

export const previewShifts = [
  {
    ...audit,
    areaName: 'Maple Ward',
    arrivalNote: 'Use the east entrance and report to the ward coordinator.',
    endsAt: '2026-08-27T14:30:00.000Z',
    id: previewIdentifiers.shifts.willowmereMaple,
    locationId: previewIdentifiers.locations.willowmere,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 6,
    roleTitle: 'Registered nurse',
    startsAt: '2026-08-27T06:30:00.000Z',
    status: 'open',
  },
  {
    ...audit,
    areaName: 'Short stay unit',
    arrivalNote: 'Report to reception for the preview handover.',
    endsAt: '2026-08-27T19:00:00.000Z',
    id: previewIdentifiers.shifts.willowmereShortStay,
    locationId: previewIdentifiers.locations.willowmere,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 4,
    roleTitle: 'Healthcare assistant',
    startsAt: '2026-08-27T11:00:00.000Z',
    status: 'covered',
  },
  {
    ...audit,
    areaName: 'Birch Ward',
    arrivalNote: 'Use the night entrance for this synthetic shift.',
    endsAt: '2026-08-29T07:00:00.000Z',
    id: previewIdentifiers.shifts.willowmereBirch,
    locationId: previewIdentifiers.locations.willowmere,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 5,
    roleTitle: 'Healthcare assistant',
    startsAt: '2026-08-28T19:00:00.000Z',
    status: 'open',
  },
  {
    ...audit,
    areaName: 'Short stay unit',
    arrivalNote: 'Check in at reception for the preview handover.',
    endsAt: '2026-08-29T19:00:00.000Z',
    id: previewIdentifiers.shifts.harbourlightShortStay,
    locationId: previewIdentifiers.locations.harbourlight,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 2,
    roleTitle: 'Registered nurse',
    startsAt: '2026-08-29T11:00:00.000Z',
    status: 'open',
  },
  {
    ...audit,
    areaName: 'Cedar House',
    arrivalNote: 'Use the courtyard entrance and report to reception.',
    endsAt: '2026-08-30T04:00:00.000Z',
    id: previewIdentifiers.shifts.harbourlightCedarNight,
    locationId: previewIdentifiers.locations.harbourlight,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 1,
    roleTitle: 'Registered nurse',
    startsAt: '2026-08-29T20:00:00.000Z',
    status: 'open',
  },
  {
    ...audit,
    areaName: 'Lake Ward',
    arrivalNote: 'Meet the preview coordinator beside the main desk.',
    endsAt: '2026-08-30T15:00:00.000Z',
    id: previewIdentifiers.shifts.willowmereLakeMorning,
    locationId: previewIdentifiers.locations.willowmere,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 2,
    roleTitle: 'Registered nurse',
    startsAt: '2026-08-30T07:00:00.000Z',
    status: 'open',
  },
  {
    ...audit,
    areaName: 'Oak Ward',
    arrivalNote: 'Use the east entrance for the afternoon handover.',
    endsAt: '2026-08-31T22:00:00.000Z',
    id: previewIdentifiers.shifts.willowmereOakEvening,
    locationId: previewIdentifiers.locations.willowmere,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 2,
    roleTitle: 'Registered nurse',
    startsAt: '2026-08-31T14:00:00.000Z',
    status: 'open',
  },
  {
    ...audit,
    areaName: 'Garden Suite',
    arrivalNote: 'Check in at the reception desk before the handover.',
    endsAt: '2026-09-01T15:00:00.000Z',
    id: previewIdentifiers.shifts.harbourlightGarden,
    locationId: previewIdentifiers.locations.harbourlight,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 1,
    roleTitle: 'Registered nurse',
    startsAt: '2026-09-01T07:00:00.000Z',
    status: 'open',
  },
  {
    ...audit,
    areaName: 'Fern Ward',
    arrivalNote: 'Report to the main desk for the synthetic briefing.',
    endsAt: '2026-09-02T15:00:00.000Z',
    id: previewIdentifiers.shifts.willowmereCovered,
    locationId: previewIdentifiers.locations.willowmere,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 1,
    roleTitle: 'Registered nurse',
    startsAt: '2026-09-02T07:00:00.000Z',
    status: 'covered',
  },
  {
    ...audit,
    areaName: 'Maple outreach',
    arrivalNote: 'Meet the preview coordinator at the east entrance.',
    endsAt: '2026-08-27T15:00:00.000Z',
    id: previewIdentifiers.shifts.willowmereOverlap,
    locationId: previewIdentifiers.locations.willowmere,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 2,
    roleTitle: 'Registered nurse',
    startsAt: '2026-08-27T07:00:00.000Z',
    status: 'open',
  },
  {
    ...audit,
    areaName: 'Meadow Suite',
    arrivalNote: 'Use the reception entrance for the morning briefing.',
    endsAt: '2026-09-03T15:00:00.000Z',
    id: previewIdentifiers.shifts.harbourlightMeadow,
    locationId: previewIdentifiers.locations.harbourlight,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 2,
    roleTitle: 'Registered nurse',
    startsAt: '2026-09-03T07:00:00.000Z',
    status: 'open',
  },
  {
    ...audit,
    areaName: 'Willow Ward',
    arrivalNote: 'Use the night entrance and report to the main desk.',
    endsAt: '2026-09-05T07:00:00.000Z',
    id: previewIdentifiers.shifts.willowmereNight,
    locationId: previewIdentifiers.locations.willowmere,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 2,
    roleTitle: 'Registered nurse',
    startsAt: '2026-09-04T19:00:00.000Z',
    status: 'open',
  },
  {
    ...audit,
    areaName: 'Harbour Ward',
    arrivalNote: 'Report to reception for the synthetic handover.',
    endsAt: '2026-08-30T23:30:00.000Z',
    id: previewIdentifiers.shifts.harbourlightReview,
    locationId: previewIdentifiers.locations.harbourlight,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 2,
    roleTitle: 'Registered nurse',
    startsAt: '2026-08-30T15:30:00.000Z',
    status: 'open',
  },
  {
    ...audit,
    areaName: 'Maple Ward',
    arrivalNote: 'This completed synthetic shift is retained for history.',
    endsAt: '2026-08-20T15:00:00.000Z',
    id: previewIdentifiers.shifts.willowmerePast,
    locationId: previewIdentifiers.locations.willowmere,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 1,
    roleTitle: 'Registered nurse',
    startsAt: '2026-08-20T07:00:00.000Z',
    status: 'covered',
  },
  {
    ...audit,
    areaName: 'Maple late service',
    arrivalNote: 'This completed synthetic shift is available for a new timesheet.',
    endsAt: '2026-08-21T22:00:00.000Z',
    id: previewIdentifiers.shifts.willowmerePastLate,
    locationId: previewIdentifiers.locations.willowmere,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 1,
    roleTitle: 'Registered nurse',
    startsAt: '2026-08-21T14:00:00.000Z',
    status: 'completed',
  },
  {
    ...audit,
    areaName: 'Birch day service',
    arrivalNote: 'This completed synthetic shift supports a draft timesheet.',
    endsAt: '2026-08-22T15:00:00.000Z',
    id: previewIdentifiers.shifts.willowmerePastTheo,
    locationId: previewIdentifiers.locations.willowmere,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 1,
    roleTitle: 'Healthcare assistant',
    startsAt: '2026-08-22T07:00:00.000Z',
    status: 'completed',
  },
  {
    ...audit,
    areaName: 'Harbour day service',
    arrivalNote: 'This completed synthetic shift supports Manager review.',
    endsAt: '2026-08-23T15:00:00.000Z',
    id: previewIdentifiers.shifts.harbourlightPastMina,
    locationId: previewIdentifiers.locations.harbourlight,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 1,
    roleTitle: 'Registered nurse',
    startsAt: '2026-08-23T07:00:00.000Z',
    status: 'completed',
  },
  {
    ...audit,
    areaName: 'Fern day service',
    arrivalNote: 'This completed synthetic shift has an approved timesheet.',
    endsAt: '2026-08-24T15:00:00.000Z',
    id: previewIdentifiers.shifts.willowmerePastSofia,
    locationId: previewIdentifiers.locations.willowmere,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 1,
    roleTitle: 'Registered nurse',
    startsAt: '2026-08-24T07:00:00.000Z',
    status: 'completed',
  },
  {
    ...audit,
    areaName: 'Cedar day service',
    arrivalNote: 'Report to reception for the draft preview handover.',
    createdByMemberId: previewIdentifiers.members.imaniDube,
    endsAt: '2026-09-10T15:00:00.000Z',
    id: previewIdentifiers.shifts.managerDraft,
    locationId: previewIdentifiers.locations.harbourlight,
    organisationId: previewIdentifiers.organisation,
    requiredWorkers: 2,
    roleTitle: 'Registered nurse',
    startsAt: '2026-09-10T07:00:00.000Z',
    status: 'draft',
  },
] as const satisfies readonly ShiftInsert[]

interface AssignmentSeed {
  readonly cancelledAt?: string
  readonly cancellationReason?: string
  readonly shiftId: string
  readonly status: ShiftAssignmentInsert['status']
  readonly workerProfileId: string
}

const assignmentSeeds: readonly AssignmentSeed[] = [
  { shiftId: previewIdentifiers.shifts.willowmereMaple, workerProfileId: previewIdentifiers.profiles.leilaMensah, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmereMaple, workerProfileId: previewIdentifiers.profiles.theoAdeyemi, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmereMaple, workerProfileId: previewIdentifiers.profiles.minaOkoro, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmereMaple, workerProfileId: previewIdentifiers.profiles.noahBoateng, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmereMaple, workerProfileId: previewIdentifiers.profiles.sofiaBello, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmereShortStay, workerProfileId: previewIdentifiers.profiles.theoAdeyemi, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmereShortStay, workerProfileId: previewIdentifiers.profiles.minaOkoro, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmereShortStay, workerProfileId: previewIdentifiers.profiles.noahBoateng, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmereShortStay, workerProfileId: previewIdentifiers.profiles.sofiaBello, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmereBirch, workerProfileId: previewIdentifiers.profiles.minaOkoro, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmereBirch, workerProfileId: previewIdentifiers.profiles.noahBoateng, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmereBirch, workerProfileId: previewIdentifiers.profiles.sofiaBello, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmereBirch, workerProfileId: previewIdentifiers.profiles.theoAdeyemi, status: 'review' },
  { shiftId: previewIdentifiers.shifts.willowmereBirch, workerProfileId: previewIdentifiers.profiles.ariKone, status: 'review' },
  { shiftId: previewIdentifiers.shifts.harbourlightShortStay, workerProfileId: previewIdentifiers.profiles.leilaMensah, status: 'review' },
  { shiftId: previewIdentifiers.shifts.harbourlightShortStay, workerProfileId: previewIdentifiers.profiles.noahBoateng, status: 'confirmed' },
  {
    cancelledAt: '2026-08-25T08:00:00.000Z',
    cancellationReason: 'worker_requested',
    shiftId: previewIdentifiers.shifts.harbourlightGarden,
    status: 'cancelled',
    workerProfileId: previewIdentifiers.profiles.leilaMensah,
  },
  { shiftId: previewIdentifiers.shifts.willowmereCovered, workerProfileId: previewIdentifiers.profiles.sofiaBello, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmerePast, workerProfileId: previewIdentifiers.profiles.leilaMensah, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmerePastLate, workerProfileId: previewIdentifiers.profiles.leilaMensah, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmerePastTheo, workerProfileId: previewIdentifiers.profiles.theoAdeyemi, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.harbourlightPastMina, workerProfileId: previewIdentifiers.profiles.minaOkoro, status: 'confirmed' },
  { shiftId: previewIdentifiers.shifts.willowmerePastSofia, workerProfileId: previewIdentifiers.profiles.sofiaBello, status: 'confirmed' },
]

export const previewShiftAssignments = assignmentSeeds.map(
  (assignment, index): ShiftAssignmentInsert => ({
    ...audit,
    assignedAt: '2026-08-24T15:18:00.000Z',
    cancelledAt: assignment.cancelledAt ?? null,
    cancellationReason: assignment.cancellationReason ?? null,
    id: `80000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    shiftId: assignment.shiftId,
    status: assignment.status,
    version: 1,
    workerProfileId: assignment.workerProfileId,
  }),
)

export const previewComplianceReviewEvents = [
  {
    ...audit,
    administratorMemberId: previewIdentifiers.members.malikAdebayo,
    complianceRecordId: deterministicUuid('d', 1),
    decision: 'approved_current',
    id: 'e0000000-0000-4000-8000-000000000001',
    note: 'Synthetic identity and role review completed.',
    occurredAt: '2026-07-14T10:00:00.000Z',
  },
  {
    ...audit,
    administratorMemberId: previewIdentifiers.members.malikAdebayo,
    complianceRecordId: deterministicUuid('d', 6),
    decision: 'further_information_required',
    id: 'e0000000-0000-4000-8000-000000000002',
    note: 'The synthetic review needs a clearer renewal date.',
    occurredAt: '2026-08-24T10:00:00.000Z',
  },
  {
    ...audit,
    administratorMemberId: previewIdentifiers.members.malikAdebayo,
    complianceRecordId: deterministicUuid('d', 18),
    decision: 'rejected',
    id: 'e0000000-0000-4000-8000-000000000003',
    note: 'The fictional requirement does not meet the preview criteria.',
    occurredAt: '2026-08-23T10:00:00.000Z',
  },
] as const satisfies readonly ComplianceReviewEventInsert[]

export const previewTimesheets = [
  {
    ...audit,
    approvedAt: null,
    assignmentId: previewIdentifiers.assignments.leilaPast,
    breakMinutes: 30,
    id: previewIdentifiers.timesheets.leilaRejected,
    managerReviewNote: 'Please confirm the synthetic finish time before resubmitting.',
    organisationId: previewIdentifiers.organisation,
    rejectedAt: '2026-08-25T11:00:00.000Z',
    reviewedByMemberId: previewIdentifiers.members.imaniDube,
    shiftId: previewIdentifiers.shifts.willowmerePast,
    status: 'rejected',
    submittedAt: '2026-08-25T09:00:00.000Z',
    updatedAt: '2026-08-25T11:00:00.000Z',
    workedEnd: '2026-08-20T15:00:00.000Z',
    workedMinutes: 450,
    workedStart: '2026-08-20T07:00:00.000Z',
    workerNote: 'Synthetic shift completed as scheduled.',
    workerProfileId: previewIdentifiers.profiles.leilaMensah,
  },
  {
    ...audit,
    approvedAt: null,
    assignmentId: previewIdentifiers.assignments.theoPast,
    breakMinutes: 30,
    id: previewIdentifiers.timesheets.theoDraft,
    managerReviewNote: null,
    organisationId: previewIdentifiers.organisation,
    rejectedAt: null,
    reviewedByMemberId: null,
    shiftId: previewIdentifiers.shifts.willowmerePastTheo,
    status: 'draft',
    submittedAt: null,
    workedEnd: '2026-08-22T15:00:00.000Z',
    workedMinutes: 450,
    workedStart: '2026-08-22T07:00:00.000Z',
    workerNote: null,
    workerProfileId: previewIdentifiers.profiles.theoAdeyemi,
  },
  {
    ...audit,
    approvedAt: null,
    assignmentId: previewIdentifiers.assignments.minaPast,
    breakMinutes: 30,
    id: previewIdentifiers.timesheets.minaSubmitted,
    managerReviewNote: null,
    organisationId: previewIdentifiers.organisation,
    rejectedAt: null,
    reviewedByMemberId: null,
    shiftId: previewIdentifiers.shifts.harbourlightPastMina,
    status: 'submitted',
    submittedAt: '2026-08-25T09:30:00.000Z',
    updatedAt: '2026-08-25T09:30:00.000Z',
    workedEnd: '2026-08-23T15:00:00.000Z',
    workedMinutes: 450,
    workedStart: '2026-08-23T07:00:00.000Z',
    workerNote: 'Synthetic handover completed.',
    workerProfileId: previewIdentifiers.profiles.minaOkoro,
  },
  {
    ...audit,
    approvedAt: '2026-08-26T10:00:00.000Z',
    assignmentId: previewIdentifiers.assignments.sofiaPast,
    breakMinutes: 30,
    id: previewIdentifiers.timesheets.sofiaApproved,
    managerReviewNote: 'Synthetic hours reviewed and approved.',
    organisationId: previewIdentifiers.organisation,
    rejectedAt: null,
    reviewedByMemberId: previewIdentifiers.members.imaniDube,
    shiftId: previewIdentifiers.shifts.willowmerePastSofia,
    status: 'approved',
    submittedAt: '2026-08-25T10:00:00.000Z',
    updatedAt: '2026-08-26T10:00:00.000Z',
    workedEnd: '2026-08-24T15:00:00.000Z',
    workedMinutes: 450,
    workedStart: '2026-08-24T07:00:00.000Z',
    workerNote: null,
    workerProfileId: previewIdentifiers.profiles.sofiaBello,
  },
] as const satisfies readonly TimesheetInsert[]

export const previewNotifications = [
  {
    ...audit,
    detail: 'The arrival note for Thursday’s Willowmere shift has changed.',
    id: 'a0000000-0000-4000-8000-000000000001',
    occurredAt: '2026-08-25T09:42:00.000Z',
    readAt: null,
    recipientMemberId: previewIdentifiers.members.leilaMensah,
    title: 'Shift detail updated',
    tone: 'information',
  },
  {
    ...audit,
    detail: 'Manual handling is due for review in 18 preview days.',
    id: 'a0000000-0000-4000-8000-000000000002',
    occurredAt: '2026-08-24T10:15:00.000Z',
    readAt: null,
    recipientMemberId: previewIdentifiers.members.leilaMensah,
    title: 'Readiness review approaching',
    tone: 'warning',
  },
  {
    ...audit,
    detail: 'Your synthetic preview profile is up to date.',
    id: 'a0000000-0000-4000-8000-000000000003',
    occurredAt: '2026-08-24T08:30:00.000Z',
    readAt: '2026-08-24T09:00:00.000Z',
    recipientMemberId: previewIdentifiers.members.leilaMensah,
    title: 'Profile check complete',
    tone: 'success',
  },
  {
    ...audit,
    detail: 'Two synthetic requests overlap for the Birch Ward overnight window.',
    id: 'a0000000-0000-4000-8000-000000000004',
    occurredAt: '2026-08-25T08:15:00.000Z',
    readAt: null,
    recipientMemberId: previewIdentifiers.members.imaniDube,
    title: 'Coverage conflict needs review',
    tone: 'warning',
  },
  {
    ...audit,
    detail: 'The Short stay unit preview window is fully covered.',
    id: 'a0000000-0000-4000-8000-000000000005',
    occurredAt: '2026-08-24T17:10:00.000Z',
    readAt: '2026-08-24T17:45:00.000Z',
    recipientMemberId: previewIdentifiers.members.imaniDube,
    title: 'Coverage target reached',
    tone: 'success',
  },
  {
    ...audit,
    detail: 'Two fictional worker records have readiness actions due.',
    id: 'a0000000-0000-4000-8000-000000000006',
    occurredAt: '2026-08-25T07:30:00.000Z',
    readAt: null,
    recipientMemberId: previewIdentifiers.members.malikAdebayo,
    title: 'Readiness actions need attention',
    tone: 'warning',
  },
  {
    ...audit,
    detail: 'The synthetic compliance register completed its preview review.',
    id: 'a0000000-0000-4000-8000-000000000007',
    occurredAt: '2026-08-24T16:00:00.000Z',
    readAt: '2026-08-24T16:30:00.000Z',
    recipientMemberId: previewIdentifiers.members.malikAdebayo,
    title: 'Register review complete',
    tone: 'success',
  },
] as const satisfies readonly NotificationInsert[]

export const previewActivityEvents = [
  {
    ...audit,
    actorMemberId: previewIdentifiers.members.imaniDube,
    detail: 'East entrance added to your Willowmere shift.',
    eventType: 'shift_updated',
    id: 'b0000000-0000-4000-8000-000000000001',
    occurredAt: '2026-08-25T09:42:00.000Z',
    organisationId: previewIdentifiers.organisation,
    shiftId: previewIdentifiers.shifts.willowmereMaple,
    subjectMemberId: previewIdentifiers.members.leilaMensah,
    title: 'Arrival note updated',
  },
  {
    ...audit,
    actorMemberId: null,
    detail: 'Your Thursday commitment was added to this preview schedule.',
    eventType: 'shift_confirmed',
    id: 'b0000000-0000-4000-8000-000000000002',
    occurredAt: '2026-08-24T15:18:00.000Z',
    organisationId: previewIdentifiers.organisation,
    shiftId: previewIdentifiers.shifts.willowmereMaple,
    subjectMemberId: previewIdentifiers.members.leilaMensah,
    title: 'Shift confirmed',
  },
  ...([
    [previewIdentifiers.members.theoAdeyemi, '2026-08-24T12:05:00.000Z', 'Readiness action recorded'],
    [previewIdentifiers.members.minaOkoro, '2026-08-23T14:20:00.000Z', 'Role review started'],
    [previewIdentifiers.members.noahBoateng, '2026-08-22T11:10:00.000Z', 'Profile review complete'],
    [previewIdentifiers.members.ariKone, '2026-08-21T15:45:00.000Z', 'Readiness action recorded'],
    [previewIdentifiers.members.sofiaBello, '2026-08-20T09:25:00.000Z', 'Profile review complete'],
  ] as const).map(
    ([subjectMemberId, occurredAt, title], index): ActivityEventInsert => ({
      ...audit,
      actorMemberId: previewIdentifiers.members.malikAdebayo,
      detail: 'A synthetic workforce-readiness record changed.',
      eventType: 'readiness_updated',
      id: `b0000000-0000-4000-8000-${String(index + 3).padStart(12, '0')}`,
      occurredAt,
      organisationId: previewIdentifiers.organisation,
      shiftId: null,
      subjectMemberId,
      title,
    }),
  ),
] satisfies readonly ActivityEventInsert[]

export const syntheticPreviewData = {
  activityEvents: previewActivityEvents,
  complianceRecords: previewComplianceRecords,
  complianceReviewEvents: previewComplianceReviewEvents,
  complianceRequirements: previewComplianceRequirements,
  competencies: previewCompetencies,
  locations: previewLocations,
  notifications: previewNotifications,
  organisations: previewOrganisations,
  shiftAssignments: previewShiftAssignments,
  shifts: previewShifts,
  timesheets: previewTimesheets,
  workforceMembers: previewWorkforceMembers,
  workerCompetencies: previewWorkerCompetencies,
  workerProfiles: previewWorkerProfiles,
} as const

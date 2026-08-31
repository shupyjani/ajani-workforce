import { previewPersonaIds as contractPreviewPersonaIds } from '@ajani/contracts'

export const syntheticPreviewReferenceDate = '2026-08-28' as const
export const syntheticPreviewReferenceAt = '2026-08-28T12:00:00.000Z' as const

export const previewPersonaIds = contractPreviewPersonaIds

export const previewIdentifiers = {
  organisation: '10000000-0000-4000-8000-000000000001',
  locations: {
    willowmere: '20000000-0000-4000-8000-000000000001',
    harbourlight: '20000000-0000-4000-8000-000000000002',
  },
  members: {
    leilaMensah: previewPersonaIds.worker,
    theoAdeyemi: '30000000-0000-4000-8000-000000000002',
    minaOkoro: '30000000-0000-4000-8000-000000000003',
    noahBoateng: '30000000-0000-4000-8000-000000000004',
    ariKone: '30000000-0000-4000-8000-000000000005',
    sofiaBello: '30000000-0000-4000-8000-000000000006',
    imaniDube: previewPersonaIds.manager,
    malikAdebayo: previewPersonaIds.administrator,
  },
  profiles: {
    leilaMensah: '40000000-0000-4000-8000-000000000001',
    theoAdeyemi: '40000000-0000-4000-8000-000000000002',
    minaOkoro: '40000000-0000-4000-8000-000000000003',
    noahBoateng: '40000000-0000-4000-8000-000000000004',
    ariKone: '40000000-0000-4000-8000-000000000005',
    sofiaBello: '40000000-0000-4000-8000-000000000006',
  },
  competencies: {
    identityAndRole: '50000000-0000-4000-8000-000000000001',
    manualHandling: '50000000-0000-4000-8000-000000000002',
    coreLearning: '50000000-0000-4000-8000-000000000003',
    roleRequirements: '50000000-0000-4000-8000-000000000004',
  },
  requirements: {
    identityAndRole: '60000000-0000-4000-8000-000000000001',
    manualHandling: '60000000-0000-4000-8000-000000000002',
    coreLearning: '60000000-0000-4000-8000-000000000003',
    roleRequirements: '60000000-0000-4000-8000-000000000004',
  },
  shifts: {
    willowmereMaple: '70000000-0000-4000-8000-000000000001',
    willowmereShortStay: '70000000-0000-4000-8000-000000000002',
    willowmereBirch: '70000000-0000-4000-8000-000000000003',
    harbourlightShortStay: '70000000-0000-4000-8000-000000000004',
    harbourlightCedarNight: '70000000-0000-4000-8000-000000000005',
    willowmereLakeMorning: '70000000-0000-4000-8000-000000000006',
    willowmereOakEvening: '70000000-0000-4000-8000-000000000007',
    harbourlightGarden: '70000000-0000-4000-8000-000000000008',
    willowmereCovered: '70000000-0000-4000-8000-000000000009',
    willowmereOverlap: '70000000-0000-4000-8000-000000000010',
    harbourlightMeadow: '70000000-0000-4000-8000-000000000011',
    willowmereNight: '70000000-0000-4000-8000-000000000012',
    harbourlightReview: '70000000-0000-4000-8000-000000000013',
    willowmerePast: '70000000-0000-4000-8000-000000000014',
    willowmerePastLate: '70000000-0000-4000-8000-000000000015',
    willowmerePastTheo: '70000000-0000-4000-8000-000000000016',
    harbourlightPastMina: '70000000-0000-4000-8000-000000000017',
    willowmerePastSofia: '70000000-0000-4000-8000-000000000018',
    managerDraft: '70000000-0000-4000-8000-000000000019',
  },
  assignments: {
    leilaPast: '80000000-0000-4000-8000-000000000019',
    leilaPastLate: '80000000-0000-4000-8000-000000000020',
    theoPast: '80000000-0000-4000-8000-000000000021',
    minaPast: '80000000-0000-4000-8000-000000000022',
    sofiaPast: '80000000-0000-4000-8000-000000000023',
  },
  timesheets: {
    leilaRejected: '90000000-0000-4000-8000-000000000001',
    theoDraft: '90000000-0000-4000-8000-000000000002',
    minaSubmitted: '90000000-0000-4000-8000-000000000003',
    sofiaApproved: '90000000-0000-4000-8000-000000000004',
  },
} as const

import type {
  CoverageStatus,
  ReadinessStatus,
  RequirementStatus,
  ShiftPreviewStatus,
} from '@ajani/contracts'

const previewTimeZone = 'Europe/London'
const longDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
  weekday: 'long',
  year: 'numeric',
})

function dateTimeFormatter(
  options: Intl.DateTimeFormatOptions,
  timeZone = previewTimeZone,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone })
}

export function formatDateOnly(value: string): string {
  return dateTimeFormatter({ day: 'numeric', month: 'short' }, 'UTC').format(
    new Date(`${value}T00:00:00.000Z`),
  )
}

export function formatLongDate(value: string): string {
  return longDateFormatter.format(new Date(`${value}T00:00:00.000Z`))
}

export function formatDateTime(
  value: string,
  timeZone = previewTimeZone,
): string {
  const date = new Date(value)
  const datePart = dateTimeFormatter(
    { day: 'numeric', month: 'short', year: 'numeric' },
    timeZone,
  )
  const timePart = dateTimeFormatter(
    { hour: '2-digit', hour12: false, minute: '2-digit' },
    timeZone,
  )
  return `${datePart.format(date)} · ${timePart.format(date)}`
}

export function formatShiftWindow(
  startsAt: string,
  endsAt: string,
  timeZone = previewTimeZone,
): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const date = dateTimeFormatter(
    { day: 'numeric', month: 'short', weekday: 'short', year: 'numeric' },
    timeZone,
  )
  const time = dateTimeFormatter(
    { hour: '2-digit', hour12: false, minute: '2-digit' },
    timeZone,
  )
  const localDateKey = dateTimeFormatter(
    { day: '2-digit', month: '2-digit', year: 'numeric' },
    timeZone,
  )
  const startDate = date.format(start).replace(',', '')
  const endDate = date.format(end).replace(',', '')

  if (localDateKey.format(start) === localDateKey.format(end)) {
    return `${startDate}, ${time.format(start)}–${time.format(end)}`
  }

  return `${startDate}, ${time.format(start)} – ${endDate}, ${time.format(end)}`
}

export function formatWeekday(
  value: string,
  timeZone = previewTimeZone,
): string {
  return dateTimeFormatter({ weekday: 'long' }, timeZone).format(new Date(value))
}

export function dateCardParts(value: string, timeZone = previewTimeZone): {
  readonly day: string
  readonly month: string
} {
  const date = new Date(value)
  return {
    day: dateTimeFormatter({ day: 'numeric' }, timeZone).format(date),
    month: dateTimeFormatter({ month: 'short' }, timeZone).format(date),
  }
}

export function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00.000Z`)
  const to = Date.parse(`${toDate}T00:00:00.000Z`)
  return Math.max(0, Math.ceil((to - from) / 86_400_000))
}

export function readinessLabel(status: ReadinessStatus): string {
  const labels: Record<ReadinessStatus, string> = {
    action_due: 'Action due',
    ready: 'Ready',
    reviewing: 'Reviewing',
  }
  return labels[status]
}

export function requirementLabel(status: RequirementStatus): string {
  const labels: Record<RequirementStatus, string> = {
    current: 'Current',
    due_soon: 'Due soon',
    overdue: 'Overdue',
    reviewing: 'Reviewing',
  }
  return labels[status]
}

export function shiftStatusLabel(status: ShiftPreviewStatus): string {
  return status === 'confirmed' ? 'Confirmed' : 'Review'
}

export function coverageLabel(
  status: CoverageStatus,
  openPositions: number,
): string {
  return status === 'covered'
    ? 'Covered'
    : `${String(openPositions)} open`
}

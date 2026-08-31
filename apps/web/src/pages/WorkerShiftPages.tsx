import {
  type WorkerAssignmentStatus,
  type WorkerScheduleAssignment,
  type WorkerShiftEligibilityOutcome,
  type WorkerShiftSummary,
} from '@ajani/contracts'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  UsersRound,
} from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  useCancelWorkerAssignmentMutation,
  useRequestWorkerShiftMutation,
  useWorkerScheduleQuery,
  useWorkerShiftDetailQuery,
  useWorkerShiftsQuery,
} from '../api/previewQueries'
import { ApiRequestError } from '../api/client'
import { PreviewDataSource, PreviewQueryBoundary } from '../components/PreviewQueryBoundary'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Dialog } from '../components/ui/Dialog'
import { Pagination } from '../components/ui/Pagination'
import { EmptyState, ErrorState } from '../components/ui/States'
import { formatDateTime, formatShiftWindow } from '../utils/previewFormatting'
import { PageHeader } from './ProductPages'

function eligibilityTone(outcome: WorkerShiftEligibilityOutcome): BadgeTone {
  if (outcome === 'eligible' || outcome === 'already_assigned') return 'success'
  if (outcome === 'under_review') return 'information'
  if (outcome === 'blocked') return 'danger'
  return 'warning'
}

function eligibilityLabel(outcome: WorkerShiftEligibilityOutcome): string {
  const labels: Record<WorkerShiftEligibilityOutcome, string> = {
    already_assigned: 'Already assigned',
    blocked: 'Readiness blocked',
    eligible: 'Eligible',
    unavailable: 'Unavailable',
    under_review: 'Review required',
  }
  return labels[outcome]
}

function assignmentLabel(status: WorkerAssignmentStatus): string {
  const labels: Record<WorkerAssignmentStatus, string> = {
    cancelled: 'Cancelled',
    confirmed: 'Confirmed',
    declined: 'Declined',
    under_review: 'Under review',
  }
  return labels[status]
}

function assignmentTone(status: WorkerAssignmentStatus): BadgeTone {
  if (status === 'confirmed') return 'success'
  if (status === 'under_review') return 'information'
  if (status === 'declined') return 'danger'
  return 'neutral'
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder === 0
    ? `${String(hours)} hours`
    : `${String(hours)} hours ${String(remainder)} minutes`
}

function ShiftFacts({ shift }: { readonly shift: WorkerShiftSummary }) {
  return (
    <dl className="shift-facts">
      <div><dt><CalendarDays aria-hidden="true" />Date and time</dt><dd>{formatShiftWindow(shift.startsAt, shift.endsAt, shift.location.timezone)}</dd></div>
      <div><dt><MapPin aria-hidden="true" />Location</dt><dd>{shift.location.name} · {shift.location.area}</dd></div>
      <div><dt><Clock3 aria-hidden="true" />Duration</dt><dd>{durationLabel(shift.durationMinutes)}</dd></div>
      <div><dt><UsersRound aria-hidden="true" />Availability</dt><dd>{String(shift.availability.remainingPlaces)} of {String(shift.availability.requiredWorkers)} places open</dd></div>
    </dl>
  )
}

function ShiftCard({ shift }: { readonly shift: WorkerShiftSummary }) {
  return (
    <article className="shift-card">
      <div className="shift-card__heading">
        <div><p className="overline">{shift.organisation.name}</p><h2>{shift.location.area}</h2></div>
        <Badge tone={eligibilityTone(shift.eligibility.outcome)}>{eligibilityLabel(shift.eligibility.outcome)}</Badge>
      </div>
      <ShiftFacts shift={shift} />
      <p className="shift-card__eligibility"><strong>{shift.eligibility.title}</strong>{shift.eligibility.detail}</p>
      <Link className="button button--secondary" to={`/worker/shifts/${shift.id}`}>View shift details <ArrowRight aria-hidden="true" size={17} /></Link>
    </article>
  )
}

export function WorkerShiftsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const appliedFrom = searchParams.get('from') ?? ''
  const appliedTo = searchParams.get('to') ?? ''
  const appliedLocation = searchParams.get('location') ?? ''
  const appliedAvailability = searchParams.get('availability') === 'all' ? 'all' : 'available'
  const [from, setFrom] = useState(appliedFrom)
  const [to, setTo] = useState(appliedTo)
  const [locationId, setLocationId] = useState(appliedLocation)
  const [availability, setAvailability] = useState<'all' | 'available'>(appliedAvailability)
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const [filterError, setFilterError] = useState<string | null>(null)
  const query = useWorkerShiftsQuery({
    availability: appliedAvailability,
    cursor: cursors[pageIndex],
    from: appliedFrom || undefined,
    locationId: appliedLocation || undefined,
    to: appliedTo || undefined,
  })

  function applyFilters(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (from && to && to < from) {
      setFilterError('End date must be the same as or later than start date.')
      return
    }
    setFilterError(null)
    const next = new URLSearchParams()
    if (from) next.set('from', from)
    if (to) next.set('to', to)
    if (locationId) next.set('location', locationId)
    if (availability === 'all') next.set('availability', 'all')
    setCursors([undefined])
    setPageIndex(0)
    setSearchParams(next)
  }

  function clearFilters(): void {
    setFrom('')
    setTo('')
    setLocationId('')
    setAvailability('available')
    setFilterError(null)
    setCursors([undefined])
    setPageIndex(0)
    setSearchParams(new URLSearchParams())
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Worker preview · Synthetic opportunities" summary="Explore upcoming work that matches this fictional profile, with availability and eligibility explained before any request." title="Find shifts" />
      <form className="card shift-filters" noValidate onSubmit={applyFilters}>
        <div className="shift-filters__fields">
          <div className="field"><label htmlFor="shift-from">From</label><input id="shift-from" onChange={(event) => { setFrom(event.target.value) }} type="date" value={from} /></div>
          <div className="field"><label htmlFor="shift-to">To</label><input aria-describedby={filterError === null ? undefined : 'shift-filter-error'} aria-invalid={filterError !== null} id="shift-to" onChange={(event) => { setTo(event.target.value) }} type="date" value={to} /></div>
          <div className="field"><label htmlFor="shift-location">Location</label><select id="shift-location" onChange={(event) => { setLocationId(event.target.value) }} value={locationId}><option value="">All locations</option>{query.data?.data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></div>
          <div className="field"><label htmlFor="shift-availability">Availability</label><select id="shift-availability" onChange={(event) => { setAvailability(event.target.value === 'all' ? 'all' : 'available') }} value={availability}><option value="available">Available to request</option><option value="all">All shifts</option></select></div>
        </div>
        {filterError === null ? null : <p className="field__error" id="shift-filter-error" role="alert">{filterError}</p>}
        <div className="shift-filters__actions"><button className="button button--secondary" onClick={clearFilters} type="button">Clear filters</button><button className="button button--primary" type="submit">Apply filters</button></div>
      </form>
      <PreviewQueryBoundary query={query} skeletonLines={7}>
        {({ data, meta }) => (
          <>
            <PreviewDataSource generatedAt={meta.generatedAt} />
            {data.items.length === 0 ? <EmptyState action={<button className="button button--secondary" onClick={clearFilters} type="button">Clear filters</button>} description="Try widening the date range, choosing another location or including unavailable synthetic shifts." title="No shifts match these filters" /> : <div className="shift-card-grid">{data.items.map((shift) => <ShiftCard key={shift.id} shift={shift} />)}</div>}
            <Pagination currentPage={pageIndex + 1} hasNextPage={meta.pagination.nextCursor !== null} onNextPage={() => { const nextCursor = meta.pagination.nextCursor; if (nextCursor === null) return; setCursors((current) => [...current.slice(0, pageIndex + 1), nextCursor]); setPageIndex((current) => current + 1) }} onPreviousPage={() => { setPageIndex((current) => Math.max(0, current - 1)) }} />
          </>
        )}
      </PreviewQueryBoundary>
    </div>
  )
}

function RequestShiftDialog({
  onClose,
  onConfirm,
  open,
  pending,
  shift,
}: {
  readonly onClose: () => void
  readonly onConfirm: () => void
  readonly open: boolean
  readonly pending: boolean
  readonly shift: WorkerShiftSummary
}) {
  return (
    <Dialog description={`Request the ${formatShiftWindow(shift.startsAt, shift.endsAt, shift.location.timezone)} shift at ${shift.location.name}.`} onClose={pending ? () => undefined : onClose} open={open} title="Confirm shift request">
      <div className="confirmation-summary"><strong>{shift.location.area}</strong><span>{shift.roleTitle} · {shift.organisation.name}</span><span>{shift.eligibility.detail}</span></div>
      <p className="preview-persistence-note">A successful request changes synthetic preview data in the configured preview database. The preview reset command restores the starting scenario.</p>
      <div aria-live="polite" className="dialog-actions"><button className="button button--secondary" disabled={pending} onClick={onClose} type="button">Keep browsing</button><button aria-busy={pending} className="button button--primary" disabled={pending} onClick={onConfirm} type="button">{pending ? 'Requesting shift…' : 'Request shift'}</button></div>
    </Dialog>
  )
}

function MutationError({ error, onRetry, shift }: { readonly error: Error; readonly onRetry: () => void; readonly shift: WorkerShiftSummary | undefined }) {
  const conflict = error instanceof ApiRequestError && (error.status === 409 || error.status === 422)
  const window = shift === undefined ? '' : ` Shift: ${formatShiftWindow(shift.startsAt, shift.endsAt, shift.location.timezone)}.`
  return <ErrorState description={`${error.message}${window}`} onRetry={onRetry} title={conflict ? 'Shift status changed' : 'Shift request was not completed'} />
}

export function WorkerShiftDetailPage() {
  const { shiftId = '' } = useParams()
  const query = useWorkerShiftDetailQuery(shiftId)
  const mutation = useRequestWorkerShiftMutation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const shift = query.data?.data.shift

  function requestShift(): void {
    if (shift === undefined || mutation.isPending) return
    mutation.mutate(
      { idempotencyKey: crypto.randomUUID(), shiftId: shift.id },
      { onSuccess: () => { setDialogOpen(false) } },
    )
  }

  return (
    <div className="page-stack">
      <Link className="text-link back-link" to="/worker/shifts"><ArrowLeft aria-hidden="true" size={16} />Back to Find shifts</Link>
      <PageHeader eyebrow="Worker preview · Shift details" summary="Review the full synthetic shift context and your eligibility before making a request." title="Shift details" />
      {mutation.isSuccess && <div className="alert alert--success" role="status"><CheckCircle2 aria-hidden="true" /><div><strong>{mutation.data.data.outcome === 'confirmed' ? 'Shift confirmed' : 'Request under review'}</strong><span>{mutation.data.data.message} {formatShiftWindow(mutation.data.data.assignment.shift.startsAt, mutation.data.data.assignment.shift.endsAt, mutation.data.data.assignment.shift.location.timezone)}. View the result in My schedule.</span></div><Link to="/worker/schedule">My schedule</Link></div>}
      {mutation.isError && <MutationError error={mutation.error} onRetry={() => { void query.refetch(); mutation.reset() }} shift={shift} />}
      <PreviewQueryBoundary query={query} skeletonLines={7}>
        {({ data, meta }) => {
          const detail = data.shift
          const canRequest = detail.eligibility.outcome === 'eligible' || detail.eligibility.outcome === 'under_review'
          return (
            <>
              <PreviewDataSource generatedAt={meta.generatedAt} />
              <section className="card shift-detail">
                <div className="shift-detail__heading"><div><p className="overline">{detail.organisation.name}</p><h2>{detail.location.area}</h2><p>{detail.roleTitle}</p></div><Badge tone={eligibilityTone(detail.eligibility.outcome)}>{eligibilityLabel(detail.eligibility.outcome)}</Badge></div>
                <ShiftFacts shift={detail} />
                <div className={`eligibility-panel eligibility-panel--${detail.eligibility.outcome}`}><strong>{detail.eligibility.title}</strong><p>{detail.eligibility.detail}</p></div>
                <dl className="detail-list"><div><dt>Arrival information</dt><dd>{detail.arrivalNote ?? 'No special arrival instructions for this synthetic shift.'}</dd></div><div><dt>Capacity</dt><dd>{String(detail.availability.reservedWorkers)} reserved · {String(detail.availability.remainingPlaces)} remaining · {detail.availability.status}</dd></div></dl>
                <div className="shift-detail__actions">{detail.eligibility.outcome === 'already_assigned' ? <Link className="button button--primary" to="/worker/schedule">View in My schedule</Link> : <button className="button button--primary" disabled={!canRequest || mutation.isPending} onClick={() => { setDialogOpen(true) }} type="button">{detail.eligibility.outcome === 'blocked' ? 'Readiness required' : detail.eligibility.outcome === 'unavailable' ? 'Shift unavailable' : 'Request this shift'}</button>}<button className="button button--secondary" disabled={query.isFetching} onClick={() => { void query.refetch() }} type="button"><RefreshCw aria-hidden="true" className={query.isFetching ? 'spin' : undefined} size={17} />Refresh availability</button></div>
              </section>
              <RequestShiftDialog onClose={() => { setDialogOpen(false) }} onConfirm={requestShift} open={dialogOpen} pending={mutation.isPending} shift={detail} />
            </>
          )
        }}
      </PreviewQueryBoundary>
    </div>
  )
}

function CancelAssignmentDialog({ assignment, onClose, onConfirm, open, pending }: { readonly assignment: WorkerScheduleAssignment; readonly onClose: () => void; readonly onConfirm: () => void; readonly open: boolean; readonly pending: boolean }) {
  return (
    <Dialog description={`Cancel the ${formatShiftWindow(assignment.shift.startsAt, assignment.shift.endsAt, assignment.shift.location.timezone)} assignment at ${assignment.shift.location.name}.`} onClose={pending ? () => undefined : onClose} open={open} title="Cancel this assignment?">
      <div className="alert alert--warning"><AlertTriangle aria-hidden="true" /><div><strong>This releases your reserved place</strong><span>The assignment remains in synthetic history and a covered shift may reopen.</span></div></div>
      <p className="preview-persistence-note">This change affects only synthetic preview data and can be restored with the preview reset command.</p>
      <div aria-live="polite" className="dialog-actions"><button className="button button--secondary" disabled={pending} onClick={onClose} type="button">Keep assignment</button><button aria-busy={pending} className="button button--primary" disabled={pending} onClick={onConfirm} type="button">{pending ? 'Cancelling…' : 'Cancel assignment'}</button></div>
    </Dialog>
  )
}

type ScheduleFilter = 'all' | WorkerAssignmentStatus

export function WorkerSchedulePage() {
  const [filter, setFilter] = useState<ScheduleFilter>('all')
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const [selected, setSelected] = useState<WorkerScheduleAssignment | null>(null)
  const query = useWorkerScheduleQuery({ cursor: cursors[pageIndex], status: filter === 'all' ? undefined : filter })
  const mutation = useCancelWorkerAssignmentMutation()

  function updateFilter(next: ScheduleFilter): void {
    setFilter(next)
    setCursors([undefined])
    setPageIndex(0)
  }

  function cancelAssignment(): void {
    if (selected === null || mutation.isPending) return
    mutation.mutate(
      { assignmentId: selected.id, idempotencyKey: crypto.randomUUID() },
      { onSuccess: () => { setSelected(null) } },
    )
  }

  return (
    <div className="page-stack">
      <PageHeader actions={<Link className="button button--secondary" to="/worker/shifts">Find more shifts <ArrowRight aria-hidden="true" size={17} /></Link>} eyebrow="Worker preview · Synthetic schedule" summary="See confirmed work, requests under review and preserved cancellation history in one place." title="My schedule" />
      {mutation.isSuccess && <div className="alert alert--success" role="status"><CheckCircle2 aria-hidden="true" /><div><strong>Assignment cancelled</strong><span>{mutation.data.data.message} {formatShiftWindow(mutation.data.data.assignment.shift.startsAt, mutation.data.data.assignment.shift.endsAt, mutation.data.data.assignment.shift.location.timezone)}. The released capacity is now reflected across the preview.</span></div></div>}
      {mutation.isError && <ErrorState description={`${mutation.error.message}${selected === null ? '' : ` Assignment: ${formatShiftWindow(selected.shift.startsAt, selected.shift.endsAt, selected.shift.location.timezone)}.`}`} onRetry={() => { mutation.reset(); void query.refetch() }} title="Cancellation was not completed" />}
      <div aria-label="Schedule filter" className="segmented-control schedule-filter">{(['all', 'confirmed', 'under_review', 'cancelled'] as const).map((value) => <button aria-pressed={filter === value} key={value} onClick={() => { updateFilter(value) }} type="button">{value === 'all' ? 'All' : assignmentLabel(value)}</button>)}</div>
      <PreviewQueryBoundary query={query} skeletonLines={7}>
        {({ data, meta }) => (
          <>
            <PreviewDataSource generatedAt={meta.generatedAt} />
            {data.items.length === 0 ? <EmptyState action={filter === 'all' ? <Link className="button button--secondary" to="/worker/shifts">Find shifts</Link> : <button className="button button--secondary" onClick={() => { updateFilter('all') }} type="button">Show all assignments</button>} description={filter === 'all' ? 'Requested synthetic shifts will appear here after the service confirms them.' : `No ${assignmentLabel(filter).toLowerCase()} assignments match this view.`} title="No assignments in this view" /> : <div className="schedule-list">{data.items.map((assignment) => { const future = assignment.shift.startsAt > `${data.asOfDate}T00:00:00`; const canCancel = future && assignment.status !== 'cancelled'; return <article className="card schedule-card" key={assignment.id}><div className="schedule-card__heading"><div><p className="overline">{assignment.shift.organisation.name}</p><h2>{assignment.shift.location.area}</h2></div><Badge tone={assignmentTone(assignment.status)}>{assignmentLabel(assignment.status)}</Badge></div><ShiftFacts shift={assignment.shift} /><p className="schedule-card__note">Requested {formatDateTime(assignment.requestedAt)}{assignment.cancelledAt === null ? '' : ` · Cancelled ${formatDateTime(assignment.cancelledAt)}`}</p><div className="schedule-card__actions"><Link className="button button--secondary" to={`/worker/shifts/${assignment.shift.id}`}>View shift</Link>{canCancel && <button className="text-button" onClick={() => { mutation.reset(); setSelected(assignment) }} type="button">Cancel assignment</button>}</div></article> })}</div>}
            <Pagination currentPage={pageIndex + 1} hasNextPage={meta.pagination.nextCursor !== null} onNextPage={() => { const nextCursor = meta.pagination.nextCursor; if (nextCursor === null) return; setCursors((current) => [...current.slice(0, pageIndex + 1), nextCursor]); setPageIndex((current) => current + 1) }} onPreviousPage={() => { setPageIndex((current) => Math.max(0, current - 1)) }} />
          </>
        )}
      </PreviewQueryBoundary>
      {selected === null ? null : <CancelAssignmentDialog assignment={selected} onClose={() => { setSelected(null) }} onConfirm={cancelAssignment} open pending={mutation.isPending} />}
    </div>
  )
}

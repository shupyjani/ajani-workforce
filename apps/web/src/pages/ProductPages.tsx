import {
  previewPersonaIds,
  type CoverageItem,
  type ReadinessStatus,
  type RequirementStatus,
} from '@ajani/contracts'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileWarning,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { useState, type ReactNode, type SyntheticEvent } from 'react'
import { Link, useRouteError } from 'react-router-dom'
import {
  useAdministratorRecordsQuery,
  useManagerCoverageQuery,
  useManagerOperationsQuery,
  useNotificationsQuery,
  useWorkerOverviewQuery,
  useWorkerReadinessQuery,
} from '../api/previewQueries'
import { NotificationList } from '../components/NotificationList'
import { PreviewDataSource, PreviewQueryBoundary } from '../components/PreviewQueryBoundary'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Dialog } from '../components/ui/Dialog'
import { Pagination } from '../components/ui/Pagination'
import { EmptyState } from '../components/ui/States'
import { useRolePreview } from '../context/rolePreviewContextValue'
import { useNotificationSession } from '../context/notificationSessionContextValue'
import {
  coverageLabel,
  dateCardParts,
  daysBetween,
  formatDateTime,
  formatLongDate,
  formatShiftWindow,
  formatWeekday,
  readinessLabel,
  requirementLabel,
  shiftStatusLabel,
} from '../utils/previewFormatting'

export function PageHeader({ actions, eyebrow, summary, title }: {
  readonly actions?: ReactNode
  readonly eyebrow: string
  readonly summary: string
  readonly title: string
}) {
  return (
    <header className="page-header">
      <div><p className="overline">{eyebrow}</p><h1>{title}</h1><p>{summary}</p></div>
      {actions === undefined ? null : <div className="page-header__actions">{actions}</div>}
    </header>
  )
}

function readinessTone(status: ReadinessStatus): BadgeTone {
  if (status === 'ready') return 'success'
  if (status === 'action_due') return 'warning'
  return 'information'
}

function requirementTone(status: RequirementStatus): BadgeTone {
  if (status === 'current') return 'success'
  if (status === 'overdue') return 'danger'
  if (status === 'due_soon') return 'warning'
  return 'information'
}

function coverageTone(item: CoverageItem): BadgeTone {
  return item.status === 'covered' ? 'success' : 'warning'
}

function CoverageLocation({ item }: { readonly item: CoverageItem }) {
  return (
    <span className="coverage-location">
      <span className="coverage-location__area">{item.location.area}</span>
      <span className="coverage-location__facility"><span className="visually-hidden">. Facility:</span>{' '}{item.location.name}</span>
    </span>
  )
}

function Check() {
  return <CheckCircle2 aria-hidden="true" size={18} />
}

export function WorkerOverviewPage() {
  const query = useWorkerOverviewQuery()
  const workerName = query.data?.data.worker.displayName

  return (
    <div className="page-stack">
      <PageHeader
        actions={<Link className="button button--secondary" to="/worker/readiness">Review readiness <ArrowRight aria-hidden="true" size={17} /></Link>}
        eyebrow={query.data === undefined ? 'Worker preview · Synthetic schedule' : `${formatLongDate(query.data.data.asOfDate)} · Synthetic schedule`}
        summary="Your next commitments, readiness signals and useful updates in one calm view."
        title={workerName === undefined ? 'Worker overview' : `Good morning, ${workerName.split(' ')[0] ?? workerName}.`}
      />
      <PreviewQueryBoundary query={query} skeletonLines={6}>
        {({ data, meta }) => {
          const nextShift = data.upcomingShifts[0]
          const dateParts =
            nextShift === undefined
              ? undefined
              : dateCardParts(nextShift.startsAt, nextShift.location.timezone)
          const readinessStatus = readinessLabel(data.readiness.status)

          return (
            <>
              <PreviewDataSource generatedAt={meta.generatedAt} />
              {nextShift === undefined || dateParts === undefined ? (
                <EmptyState description="No upcoming commitments are included in this synthetic scenario." title="No upcoming shifts" />
              ) : (
                <section className="editorial-hero" aria-labelledby="next-shift-title">
                  <div className="editorial-hero__date" aria-hidden="true"><span>{dateParts.month}</span><strong>{dateParts.day}</strong></div>
                  <div className="editorial-hero__content">
                    <p className="overline">Your next shift · {shiftStatusLabel(nextShift.status)}</p>
                    <h2 id="next-shift-title">A clear start at {nextShift.location.name}.</h2>
                    <div className="shift-meta">
                      <span><Clock3 aria-hidden="true" size={17} />{formatShiftWindow(nextShift.startsAt, nextShift.endsAt, nextShift.location.timezone)}</span>
                      <span><MapPin aria-hidden="true" size={17} />{nextShift.location.name} · {nextShift.location.area}</span>
                    </div>
                  </div>
                  <div className="readiness-seal"><CheckCircle2 aria-hidden="true" size={22} /><span><strong>{readinessStatus}</strong>{String(data.readiness.currentRequirements)} of {String(data.readiness.totalRequirements)} preview checks current</span></div>
                </section>
              )}

              <div className="content-grid content-grid--overview">
                <section className="card" aria-labelledby="upcoming-title">
                  <div className="card__heading"><div><p className="overline">Schedule</p><h2 id="upcoming-title">Upcoming shifts</h2></div><Badge tone="neutral">{String(data.upcomingShifts.length)} {data.upcomingShifts.length === 1 ? 'shift' : 'shifts'}</Badge></div>
                  {data.upcomingShifts.length === 0 ? (
                    <EmptyState description="New synthetic commitments would appear here." title="Schedule is clear" />
                  ) : (
                    <ol className="shift-list">
                      {data.upcomingShifts.map((shift) => (
                        <li key={shift.id}>
                          <div className="shift-list__date"><span>{formatWeekday(shift.startsAt, shift.location.timezone)}</span><strong>{formatDateTime(shift.startsAt, shift.location.timezone)}</strong></div>
                          <div className="shift-list__detail"><strong>{shift.organisation.name}</strong><span>{formatShiftWindow(shift.startsAt, shift.endsAt, shift.location.timezone)} · {shift.location.name}</span></div>
                          <Badge tone={shift.status === 'confirmed' ? 'success' : 'warning'}>{shiftStatusLabel(shift.status)}</Badge>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                <section className="card card--tinted" aria-labelledby="readiness-card-title">
                  <div className="card__heading"><div><p className="overline">Work readiness</p><h2 id="readiness-card-title">{readinessStatus} for work</h2></div><span className="progress-ring" aria-label={`${String(data.readiness.currentRequirements)} of ${String(data.readiness.totalRequirements)} checks current`}>{String(data.readiness.currentRequirements)}/{String(data.readiness.totalRequirements)}</span></div>
                  <ul className="check-list">
                    <li><Check />Current requirements <Badge tone="success">{String(data.readiness.currentRequirements)}</Badge></li>
                    <li><Check />Overall readiness <Badge tone={readinessTone(data.readiness.status)}>{readinessStatus}</Badge></li>
                  </ul>
                  <Link className="text-link" to="/worker/readiness">View readiness details <ArrowRight aria-hidden="true" size={16} /></Link>
                </section>
              </div>

              <section className="card" aria-labelledby="activity-title">
                <div className="card__heading"><div><p className="overline">Recent activity</p><h2 id="activity-title">What changed</h2></div></div>
                {data.recentActivity.length === 0 ? (
                  <EmptyState description="Recent synthetic updates would appear here." title="No recent activity" />
                ) : (
                  <ol className="timeline">
                    {data.recentActivity.map((activity) => <li key={activity.id}><span aria-hidden="true" /><div><strong>{activity.title}</strong><p>{activity.description}</p><time dateTime={activity.occurredAt}>{formatDateTime(activity.occurredAt)}</time></div></li>)}
                  </ol>
                )}
              </section>
            </>
          )
        }}
      </PreviewQueryBoundary>
    </div>
  )
}

export function WorkerReadinessPage() {
  const query = useWorkerReadinessQuery()

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Worker preview" summary="Plain-language signals show what is current, what is approaching and where attention would be needed." title="Work readiness" />
      <PreviewQueryBoundary query={query}>
        {({ data, meta }) => {
          const nextReviewDays = data.nextReviewDate === null ? null : daysBetween(data.asOfDate, data.nextReviewDate)
          const overdueItems = data.requirements.filter((requirement) => requirement.status === 'overdue')
          return (
            <>
              <PreviewDataSource generatedAt={meta.generatedAt} />
              <div className="summary-strip">
                <div><span>Overall status</span><strong><Badge tone={readinessTone(data.status)}>{readinessLabel(data.status)}</Badge></strong></div>
                <div><span>Current checks</span><strong>{String(data.currentRequirements)} of {String(data.totalRequirements)}</strong></div>
                <div><span>Next review</span><strong>{nextReviewDays === null ? 'Not scheduled' : `${String(nextReviewDays)} days`}</strong></div>
              </div>
              <section className="card" aria-labelledby="requirements-title">
                <div className="card__heading"><div><p className="overline">Requirements</p><h2 id="requirements-title">Your readiness record</h2></div></div>
                {data.requirements.length === 0 ? (
                  <EmptyState description="No requirements are included in this synthetic record." title="No readiness requirements" />
                ) : (
                  <ul className="requirement-list">
                    {data.requirements.map((requirement) => <li key={requirement.id}><span className="requirement-icon"><ClipboardCheck aria-hidden="true" /></span><div><strong>{requirement.name}</strong><span>{requirement.summary}</span></div><Badge tone={requirementTone(requirement.status)}>{requirementLabel(requirement.status)}</Badge></li>)}
                  </ul>
                )}
              </section>
              {overdueItems.length === 0 ? (
                <EmptyState description="There are no overdue items in this synthetic scenario. New actions would appear here with a clear due date and route forward." title="Nothing overdue" />
              ) : (
                <div className="alert alert--warning" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>Readiness action required</strong><span>{String(overdueItems.length)} preview {overdueItems.length === 1 ? 'item is' : 'items are'} overdue.</span></div></div>
              )}
            </>
          )
        }}
      </PreviewQueryBoundary>
    </div>
  )
}

function ReviewRequestDialog({ onClose, onSuccess, open }: {
  readonly onClose: () => void
  readonly onSuccess: () => void
  readonly open: boolean
}) {
  const [brief, setBrief] = useState('')
  const [priority, setPriority] = useState('standard')
  const [error, setError] = useState<string | null>(null)

  function submitRequest(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (brief.trim().length < 12) {
      setError('Add at least 12 characters so the coverage issue is clear.')
      return
    }
    setError(null)
    onSuccess()
  }

  return (
    <Dialog description="This validates the interaction but does not send or save data." onClose={onClose} open={open} title="Request a coverage review">
      <form className="stacked-form" noValidate onSubmit={submitRequest}>
        <div className="field"><label htmlFor="review-priority">Priority</label><select id="review-priority" onChange={(event) => { setPriority(event.target.value) }} value={priority}><option value="standard">Standard review</option><option value="time-sensitive">Time-sensitive</option></select><span className="field__hint">Helps order the synthetic preview queue.</span></div>
        <div className="field"><label htmlFor="review-brief">Coverage note</label><textarea aria-describedby={error === null ? 'review-hint' : 'review-hint review-error'} aria-invalid={error !== null} id="review-brief" onChange={(event) => { setBrief(event.target.value) }} rows={4} value={brief} /><span className="field__hint" id="review-hint">Describe the area, time and decision needed.</span>{error === null ? null : <span className="field__error" id="review-error" role="alert">{error}</span>}</div>
        <div className="dialog-actions"><button className="button button--secondary" onClick={onClose} type="button">Cancel</button><button className="button button--primary" type="submit">Validate request</button></div>
      </form>
    </Dialog>
  )
}

export function ManagerOperationsPage() {
  const query = useManagerOperationsQuery()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [success, setSuccess] = useState(false)

  return (
    <div className="page-stack">
      <PageHeader actions={<button className="button button--primary" onClick={() => { setReviewOpen(true) }} type="button">Request coverage review</button>} eyebrow="Manager preview" summary="A focused view of coverage signals, handovers and decisions that need attention." title="Operations overview" />
      {success && <div className="alert alert--success" role="status"><CheckCircle2 aria-hidden="true" /><div><strong>Preview request validated</strong><span>No data was sent or saved.</span></div></div>}
      <PreviewQueryBoundary query={query}>
        {({ data, meta }) => (
          <>
            <PreviewDataSource generatedAt={meta.generatedAt} />
            <div className="metric-grid">
              <article><span>Today’s coverage</span><strong>{String(data.metrics.confirmedAssignments)} / {String(data.metrics.requiredPositions)}</strong><small>{String(data.metrics.openPositions)} open positions</small></article>
              <article><span>Confirmed workers</span><strong>{String(data.metrics.confirmedWorkers)}</strong><small>{String(data.metrics.pendingArrivalChecks)} arrival checks pending</small></article>
              <article><span>Actions due</span><strong>{String(data.metrics.actionsDue)}</strong><small>Across {String(data.metrics.affectedAreas)} care areas</small></article>
            </div>
            {data.alerts.map((alert) => <div className="alert alert--warning" key={alert.id} role="alert"><AlertTriangle aria-hidden="true" /><div><strong>{alert.title}</strong><span>{alert.description}</span></div><Link to="/manager/coverage">Review coverage</Link></div>)}
            <section className="card" aria-labelledby="coverage-snapshot-title">
              <div className="card__heading"><div><p className="overline">{data.organisation.name} · {data.regionName}</p><h2 id="coverage-snapshot-title">Coverage snapshot</h2></div><Badge tone="warning">{String(data.metrics.openPositions)} open</Badge></div>
              {data.coverage.length === 0 ? (
                <EmptyState description="No coverage windows need review in this synthetic scenario." title="Coverage is clear" />
              ) : (
                <div className="coverage-bars">
                  {data.coverage.map((item) => <div key={item.shiftId}><div className="coverage-summary"><CoverageLocation item={item} /><span className="coverage-summary__confirmed">{String(item.confirmedWorkers)} of {String(item.requiredWorkers)} confirmed</span></div><span className="coverage-track"><span style={{ width: `${String(Math.min(100, (item.confirmedWorkers / item.requiredWorkers) * 100))}%` }} /></span><Badge tone={coverageTone(item)}>{coverageLabel(item.status, item.openPositions)}</Badge></div>)}
                </div>
              )}
            </section>
          </>
        )}
      </PreviewQueryBoundary>
      <ReviewRequestDialog onClose={() => { setReviewOpen(false) }} onSuccess={() => { setReviewOpen(false); setSuccess(true) }} open={reviewOpen} />
    </div>
  )
}

export function ManagerCoveragePage() {
  const query = useManagerCoverageQuery()
  return (
    <div className="page-stack">
      <PageHeader actions={<button className="button button--secondary" disabled={query.isFetching} onClick={() => { void query.refetch() }} type="button"><RefreshCw aria-hidden="true" className={query.isFetching ? 'spin' : undefined} size={17} />{query.isFetching ? 'Refreshing view' : 'Refresh view'}</button>} eyebrow="Manager preview" summary="Compare required and confirmed numbers without implying live scheduling or booking." title="Coverage needs" />
      <PreviewQueryBoundary query={query}>
        {({ data, meta }) => (
          <>
            <PreviewDataSource generatedAt={meta.generatedAt} />
            {data.items.length === 0 ? (
              <EmptyState description="No open coverage needs are included in this synthetic window." title="No coverage needs" />
            ) : (
              <section className="card"><div className="responsive-table"><table><caption>Synthetic coverage from {formatDateTime(data.window.startsAt)} to {formatDateTime(data.window.endsAt)}</caption><thead><tr><th scope="col">Care area</th><th scope="col">Window</th><th scope="col">Required</th><th scope="col">Confirmed</th><th scope="col">Status</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.shiftId}><th data-label="Care area" scope="row"><CoverageLocation item={item} /></th><td data-label="Window">{formatShiftWindow(item.startsAt, item.endsAt, item.location.timezone)}</td><td data-label="Required">{String(item.requiredWorkers)}</td><td data-label="Confirmed">{String(item.confirmedWorkers)}</td><td data-label="Status"><Badge tone={coverageTone(item)}>{coverageLabel(item.status, item.openPositions)}</Badge></td></tr>)}</tbody></table></div></section>
            )}
          </>
        )}
      </PreviewQueryBoundary>
    </div>
  )
}

export function AdministratorRecordsPage() {
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const query = useAdministratorRecordsQuery(cursors[pageIndex])

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Administrator preview" summary="A read-only look at synthetic workforce records loaded from the preview API." title="Workforce records" />
      <div className="alert alert--warning"><ShieldAlert aria-hidden="true" /><div><strong>Record actions are unavailable</strong><span>This interface is not an authorization boundary. Editing, exports and user provisioning remain future work.</span></div></div>
      <PreviewQueryBoundary query={query}>
        {({ data, meta }) => (
          <><PreviewDataSource generatedAt={meta.generatedAt} />{data.items.length === 0 ? (
            <EmptyState description="No workforce records are included in this synthetic page." title="No workforce records" />
          ) : (
            <section className="card"><div className="card__heading"><div><p className="overline">Synthetic workforce</p><h2>Record register</h2></div><Badge tone="information">Read-only preview</Badge></div><div className="responsive-table"><table><caption className="visually-hidden">Fictional workforce records</caption><thead><tr><th scope="col">Worker</th><th scope="col">Preview ID</th><th scope="col">Role</th><th scope="col">Location</th><th scope="col">Readiness</th><th scope="col">Requirements</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.workerId}><th data-label="Worker" scope="row">{item.displayName}</th><td data-label="Preview ID">{item.previewId}</td><td data-label="Role">{item.roleTitle}</td><td data-label="Location">{item.primaryLocation?.name ?? 'Not assigned'}</td><td data-label="Readiness"><Badge tone={readinessTone(item.readinessStatus)}>{readinessLabel(item.readinessStatus)}</Badge></td><td data-label="Requirements">{String(item.requirements.current)} of {String(item.requirements.total)} current</td></tr>)}</tbody></table></div><Pagination currentPage={pageIndex + 1} hasNextPage={meta.pagination.nextCursor !== null} onNextPage={() => { const nextCursor = meta.pagination.nextCursor; if (nextCursor === null) return; setCursors((current) => [...current.slice(0, pageIndex + 1), nextCursor]); setPageIndex((current) => current + 1) }} onPreviousPage={() => { setPageIndex((current) => Math.max(0, current - 1)) }} /></section>
          )}</>
        )}
      </PreviewQueryBoundary>
    </div>
  )
}

type NotificationFilter = 'all' | 'archived' | 'unread'

export function NotificationsPage() {
  const { role } = useRolePreview()
  const { isNotificationRead } = useNotificationSession()
  const recipientId = previewPersonaIds[role]
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const query = useNotificationsQuery({ cursor: cursors[pageIndex], role, unread: filter === 'unread' ? true : undefined })

  function updateFilter(value: NotificationFilter): void {
    setFilter(value)
    setCursors([undefined])
    setPageIndex(0)
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Shared workspace" summary="Operational updates use clear labels, useful context and a route to recovery where needed." title="Notifications" />
      <div className="segmented-control" aria-label="Notification filter">{(['all', 'unread', 'archived'] as const).map((value) => <button aria-pressed={filter === value} key={value} onClick={() => { updateFilter(value) }} type="button">{value.charAt(0).toUpperCase()}{value.slice(1)}</button>)}</div>
      <PreviewQueryBoundary query={query}>
        {({ data, meta }) => {
          const visibleItems = data.items.filter((notification) => {
            const read = isNotificationRead(recipientId, notification)
            if (filter === 'unread') return !read
            if (filter === 'archived') return read
            return true
          })
          const emptyState =
            filter === 'archived'
              ? {
                  description: 'No read synthetic updates are available in this session.',
                  title: 'No archived notifications',
                }
              : filter === 'unread'
                ? {
                    description: 'No unread synthetic updates remain for this role preview.',
                    title: 'No unread notifications',
                  }
                : {
                    description: 'No synthetic updates are available for this role preview.',
                    title: 'No notifications',
                  }
          return (
            <><PreviewDataSource generatedAt={meta.generatedAt} />{visibleItems.length === 0 ? (
              <EmptyState description={emptyState.description} title={emptyState.title} />
            ) : (
              <section className="card"><NotificationList items={visibleItems} recipientId={recipientId} /><Pagination currentPage={pageIndex + 1} hasNextPage={meta.pagination.nextCursor !== null} onNextPage={() => { const nextCursor = meta.pagination.nextCursor; if (nextCursor === null) return; setCursors((current) => [...current.slice(0, pageIndex + 1), nextCursor]); setPageIndex((current) => current + 1) }} onPreviousPage={() => { setPageIndex((current) => Math.max(0, current - 1)) }} /></section>
            )}</>
          )
        }}
      </PreviewQueryBoundary>
    </div>
  )
}

export function FoundationPage() {
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Product foundation" summary="Connected operational lifecycles backed by versioned, runtime-validated synthetic preview data." title="Designed for calm, credible work." />
      <section className="foundation-intro"><div><Sparkles aria-hidden="true" /><p>Ajani brings strong editorial hierarchy to operational software: quiet surfaces, precise signals and language that never asks colour to carry meaning alone.</p></div><dl><div><dt>Current stage</dt><dd>Connected synthetic operational lifecycles</dd></div><div><dt>Data</dt><dd>Deterministic synthetic scenarios</dd></div><div><dt>Access</dt><dd>Role preview, not authentication</dd></div></dl></section>
      <div className="principle-grid"><article><span>01</span><h2>Orient before acting</h2><p>Every route leads with context, priority and a clear account of what the preview can do.</p></article><article><span>02</span><h2>Status needs words</h2><p>Badges, alerts and service signals pair restrained colour with direct language.</p></article><article><span>03</span><h2>Responsive by intent</h2><p>Navigation, tables and actions reshape for touch and narrow screens without hiding meaning.</p></article></div>
      <div className="alert alert--information"><FileWarning aria-hidden="true" /><div><strong>Current product boundary</strong><span>No authentication, authorization, document upload, payroll, production messaging or production notifications are present.</span></div></div>
    </div>
  )
}

export function NotFoundPage() {
  return <div className="not-found"><span>404</span><p className="overline">Page not found</p><h1>This route is outside the preview.</h1><p>The link may have changed, or the capability may be a planned addition not included in this pre-production preview.</p><Link className="button button--primary" to="/worker/overview">Return to overview <ArrowRight aria-hidden="true" size={17} /></Link></div>
}

export function RouteErrorPage() {
  useRouteError()
  return <div className="not-found"><CircleAlertIcon /><p className="overline">Route error</p><h1>This preview route could not be shown.</h1><p>Your navigation and synthetic data are still safe. Return to the overview and try again.</p><Link className="button button--primary" to="/worker/overview">Return to overview</Link></div>
}

function CircleAlertIcon() {
  return <span className="route-error-icon"><FileWarning aria-hidden="true" /></span>
}

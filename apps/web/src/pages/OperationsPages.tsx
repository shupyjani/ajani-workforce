import {
  type ComplianceRecordReviewStatus,
  type ManagerAssignmentRequest,
  type ManagerShift,
  type ManagerShiftStatus,
  type Timesheet,
  type TimesheetStatus,
} from '@ajani/contracts'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  MapPin,
  Plus,
  Send,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useAdministratorComplianceDecisionMutation,
  useAdministratorComplianceRecordQuery,
  useAdministratorComplianceRecordsQuery,
  useAdministratorTimesheetsQuery,
  useCancelManagerShiftMutation,
  useCreateManagerShiftMutation,
  useCreateWorkerTimesheetMutation,
  useManagerAssignmentDecisionMutation,
  useManagerAssignmentRequestsQuery,
  useManagerShiftDetailQuery,
  useManagerShiftsQuery,
  useManagerTimesheetDecisionMutation,
  useManagerTimesheetsQuery,
  usePublishManagerShiftMutation,
  useSubmitWorkerTimesheetMutation,
  useUpdateManagerShiftMutation,
  useUpdateWorkerTimesheetMutation,
  useWorkerTimesheetDetailQuery,
  useWorkerTimesheetsQuery,
} from '../api/operationsQueries'
import { ApiRequestError } from '../api/client'
import { PreviewDataSource, PreviewQueryBoundary } from '../components/PreviewQueryBoundary'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { EmptyState } from '../components/ui/States'
import { formatDateOnly, formatDateTime, formatShiftWindow } from '../utils/previewFormatting'
import { PageHeader } from './ProductPages'

function mutationError(error: Error | null): string | null {
  if (error === null) return null
  if (error instanceof ApiRequestError && error.code === 'VERSION_CONFLICT') {
    return 'This record changed after you opened it. Refresh the page before trying again.'
  }
  return error.message
}

function MutationMessage({ error, message }: { readonly error: Error | null; readonly message?: string | undefined }) {
  const messageRef = useRef<HTMLDivElement>(null)
  const detail = mutationError(error)
  useEffect(() => {
    if (detail !== null || message !== undefined) {
      messageRef.current?.focus()
    }
  }, [detail, message])
  if (detail !== null) {
    return <div className="alert alert--warning" ref={messageRef} role="alert" tabIndex={-1}><AlertTriangle aria-hidden="true" /><div><strong>Action not completed</strong><span>{detail}</span></div></div>
  }
  if (message !== undefined) {
    return <div className="alert alert--success" ref={messageRef} role="status" tabIndex={-1}><CheckCircle2 aria-hidden="true" /><div><strong>Action completed</strong><span>{message}</span></div></div>
  }
  return null
}

function statusTone(status: string): BadgeTone {
  if (['approved', 'confirmed', 'covered', 'current'].includes(status)) return 'success'
  if (['action_due', 'cancelled', 'declined', 'rejected'].includes(status)) return 'danger'
  if (['due_soon', 'information_required', 'submitted', 'under_review'].includes(status)) return 'warning'
  if (status === 'reviewing') return 'information'
  return 'neutral'
}

function labelStatus(status: string): string {
  return status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIso(value: string): string {
  return new Date(value).toISOString()
}

function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

function useCursorPage() {
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  return {
    cursor: cursors[pageIndex],
    next(nextCursor: string): void {
      setCursors((current) => [...current.slice(0, pageIndex + 1), nextCursor])
      setPageIndex((current) => current + 1)
    },
    page: pageIndex + 1,
    previous(): void { setPageIndex((current) => Math.max(0, current - 1)) },
    reset(): void { setCursors([undefined]); setPageIndex(0) },
  }
}

function CursorPagination({ nextCursor, page }: { readonly nextCursor: string | null; readonly page: ReturnType<typeof useCursorPage> }) {
  return <Pagination currentPage={page.page} hasNextPage={nextCursor !== null} onNextPage={() => { if (nextCursor !== null) page.next(nextCursor) }} onPreviousPage={() => { page.previous() }} />
}

function assignmentApprovalUnavailableReason(request: ManagerAssignmentRequest, organisationId: string): string | null {
  if (request.worker.readinessStatus === 'action_due') {
    return 'Approval is unavailable until readiness requirements are resolved.'
  }
  if (request.worker.status !== 'active') {
    return 'Approval is unavailable because this worker is not active.'
  }
  if (request.worker.organisationId !== organisationId) {
    return 'Approval is unavailable because this worker is outside the Manager organisation.'
  }
  if (request.worker.roleTitle !== request.shift.roleTitle) {
    return 'Approval is unavailable because this worker role does not match the shift role.'
  }
  return null
}

export function ManagerAssignmentRequestsPage() {
  const page = useCursorPage()
  const query = useManagerAssignmentRequestsQuery(page.cursor)
  const mutation = useManagerAssignmentDecisionMutation()
  const [declineId, setDeclineId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  function approve(assignmentId: string, expectedVersion: number): void {
    mutation.mutate({ assignmentId, body: { decision: 'approve', expectedVersion }, idempotencyKey: newIdempotencyKey() })
  }

  function decline(event: SyntheticEvent<HTMLFormElement>, assignmentId: string, expectedVersion: number): void {
    event.preventDefault()
    mutation.mutate(
      { assignmentId, body: { decision: 'decline', expectedVersion, reason }, idempotencyKey: newIdempotencyKey() },
      { onSuccess: () => { setDeclineId(null); setReason('') } },
    )
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Manager workspace" summary="Review matching, capacity and readiness before accepting or declining worker requests." title="Assignment requests" />
      <MutationMessage error={mutation.error} message={mutation.data?.data.message} />
      <PreviewQueryBoundary query={query}>
        {({ data, meta }) => <><PreviewDataSource generatedAt={meta.generatedAt} />
          {data.items.length === 0 ? <EmptyState title="No requests to review" description="New worker requests will appear here when a published shift needs a manager decision." /> :
            <div className="record-grid">{data.items.map((request) => {
              const approvalUnavailable = assignmentApprovalUnavailableReason(request, data.organisation.id)
              const approvalExplanationId = `approval-unavailable-${request.assignmentId}`
              return <article className="card decision-card" key={request.assignmentId}>
              <div className="card__heading"><div><p className="overline">{request.shift.location.name}</p><h2>{request.worker.displayName}</h2></div><Badge tone={statusTone(request.worker.readinessStatus)}>{labelStatus(request.worker.readinessStatus)}</Badge></div>
              <p>{request.worker.roleTitle} requested {request.shift.location.area}.</p>
              <dl className="detail-list"><div><dt>Shift</dt><dd>{formatShiftWindow(request.shift.startsAt, request.shift.endsAt, request.shift.location.timezone)}</dd></div><div><dt>Capacity</dt><dd>{String(request.shift.confirmedWorkers)} confirmed, {String(request.shift.reviewWorkers)} under review, {String(request.shift.requiredWorkers)} required</dd></div><div><dt>Requested</dt><dd>{formatDateTime(request.requestedAt)}</dd></div></dl>
              {declineId === request.assignmentId ? <form className="stacked-form" onSubmit={(event) => { decline(event, request.assignmentId, request.version) }}><div className="field"><label htmlFor={`decline-${request.assignmentId}`}>Reason for declining</label><textarea id={`decline-${request.assignmentId}`} minLength={12} maxLength={240} onChange={(event) => { setReason(event.target.value) }} required rows={3} value={reason} /><span className="field__hint">The worker receives this explanation.</span></div><div className="dialog-actions"><button className="button button--secondary" onClick={() => { setDeclineId(null) }} type="button">Keep request</button><button className="button button--danger" disabled={mutation.isPending} type="submit">Decline request</button></div></form> : <div className="dialog-actions"><button className="button button--secondary" onClick={() => { setDeclineId(request.assignmentId) }} type="button">Decline</button><div className="approval-action">{approvalUnavailable !== null && <p className="approval-action__explanation" id={approvalExplanationId}><AlertTriangle aria-hidden="true" size={17} /><span>{approvalUnavailable}</span></p>}<button aria-describedby={approvalUnavailable === null ? undefined : approvalExplanationId} aria-disabled={approvalUnavailable === null ? undefined : true} className="button button--primary" disabled={mutation.isPending} onClick={() => { if (approvalUnavailable === null) approve(request.assignmentId, request.version) }} type="button">Approve assignment</button></div></div>}
            </article>
            })}</div>}
          <CursorPagination nextCursor={meta.pagination.nextCursor} page={page} />
        </>}
      </PreviewQueryBoundary>
    </div>
  )
}

const shiftStatuses: readonly ManagerShiftStatus[] = ['draft', 'open', 'covered', 'cancelled', 'completed']

export function ManagerShiftsPage() {
  const [status, setStatus] = useState<ManagerShiftStatus | undefined>()
  const page = useCursorPage()
  const query = useManagerShiftsQuery(status, page.cursor)
  return <div className="page-stack">
    <PageHeader actions={<Link className="button button--primary" to="/manager/shifts/new"><Plus aria-hidden="true" size={17} />Create shift</Link>} eyebrow="Manager workspace" summary="Create, publish and maintain shifts for the synthetic organisation." title="Manage shifts" />
    <div className="field field--inline"><label htmlFor="manager-shift-status">Filter status</label><select id="manager-shift-status" onChange={(event) => { setStatus(event.target.value === 'all' ? undefined : event.target.value as ManagerShiftStatus); page.reset() }} value={status ?? 'all'}><option value="all">All statuses</option>{shiftStatuses.map((value) => <option key={value} value={value}>{labelStatus(value)}</option>)}</select></div>
    <PreviewQueryBoundary query={query}>{({ data, meta }) => <><PreviewDataSource generatedAt={meta.generatedAt} />{data.items.length === 0 ? <EmptyState title="No matching shifts" description="Change the status filter or create a draft shift." /> : <section className="card"><div className="responsive-table"><table><caption className="visually-hidden">Manager shift register</caption><thead><tr><th scope="col">Location</th><th scope="col">Window</th><th scope="col">Coverage</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{data.items.map((shift) => <tr key={shift.id}><th data-label="Location" scope="row">{shift.location.area}<small className="table-subline">{shift.roleTitle}</small></th><td data-label="Window">{formatShiftWindow(shift.startsAt, shift.endsAt, shift.location.timezone)}</td><td data-label="Coverage">{String(shift.confirmedWorkers)} / {String(shift.requiredWorkers)}</td><td data-label="Status"><Badge tone={statusTone(shift.status)}>{labelStatus(shift.status)}</Badge></td><td data-label="Action"><Link className="text-button" to={`/manager/shifts/${shift.id}`}>Review shift</Link></td></tr>)}</tbody></table></div><CursorPagination nextCursor={meta.pagination.nextCursor} page={page} /></section>}</>}</PreviewQueryBoundary>
  </div>
}

interface ShiftFormValues {
  readonly locationId: string
  readonly areaName: string
  readonly roleTitle: string
  readonly startsAt: string
  readonly endsAt: string
  readonly requiredWorkers: string
  readonly arrivalNote: string
}

type ShiftFormErrors = Partial<Record<keyof ShiftFormValues, string>>

const shiftFieldIds: Readonly<Record<keyof ShiftFormValues, string>> = {
  areaName: 'shift-area',
  arrivalNote: 'shift-arrival',
  endsAt: 'shift-end',
  locationId: 'shift-location',
  requiredWorkers: 'shift-required',
  roleTitle: 'shift-role',
  startsAt: 'shift-start',
}

function FormErrorSummary({ errors, fieldIds }: { readonly errors: Readonly<Record<string, string | undefined>>; readonly fieldIds: Readonly<Record<string, string>> }) {
  const summaryRef = useRef<HTMLDivElement>(null)
  const entries = Object.entries(errors).filter((entry): entry is [string, string] => entry[1] !== undefined)
  useEffect(() => { summaryRef.current?.focus() }, [])
  if (entries.length === 0) return null
  return <div className="error-summary" ref={summaryRef} role="alert" tabIndex={-1}><strong>Check the highlighted fields</strong><ul>{entries.map(([field, message]) => <li key={field}><a href={`#${fieldIds[field] ?? field}`}>{message}</a></li>)}</ul></div>
}

function validateShiftValues(values: ShiftFormValues): ShiftFormErrors {
  const errors: ShiftFormErrors = {}
  if (values.locationId.length === 0) errors.locationId = 'Choose a location.'
  if (values.areaName.trim().length < 2) errors.areaName = 'Enter a care area using at least 2 characters.'
  if (values.roleTitle.length === 0) errors.roleTitle = 'Choose a supported role.'
  const workers = Number(values.requiredWorkers)
  if (!Number.isInteger(workers) || workers < 1 || workers > 50) errors.requiredWorkers = 'Workers required must be a whole number from 1 to 50.'
  const start = Date.parse(values.startsAt)
  const end = Date.parse(values.endsAt)
  if (!Number.isFinite(start)) errors.startsAt = 'Enter the shift start date and time.'
  if (!Number.isFinite(end)) errors.endsAt = 'Enter the shift end date and time.'
  if (Number.isFinite(start) && Number.isFinite(end)) {
    const duration = end - start
    if (duration <= 0) errors.endsAt = 'Shift end must be after shift start.'
    else if (duration < 60 * 60 * 1_000 || duration > 24 * 60 * 60 * 1_000) errors.endsAt = 'Shift duration must be between 1 and 24 hours.'
  }
  return errors
}

function ShiftForm({ initial, locations, onSubmit, pending, roleTitles, submitLabel }: { readonly initial?: ManagerShift | undefined; readonly locations: readonly { id: string; name: string }[]; readonly onSubmit: (values: ShiftFormValues) => void; readonly pending: boolean; readonly roleTitles: readonly string[]; readonly submitLabel: string }) {
  const [values, setValues] = useState<ShiftFormValues>(() => ({
    locationId: initial?.location.id ?? locations[0]?.id ?? '',
    areaName: initial?.location.area ?? '',
    roleTitle: initial?.roleTitle ?? roleTitles[0] ?? '',
    startsAt: initial === undefined ? '' : toDatetimeLocal(initial.startsAt),
    endsAt: initial === undefined ? '' : toDatetimeLocal(initial.endsAt),
    requiredWorkers: String(initial?.requiredWorkers ?? 1),
    arrivalNote: initial?.arrivalNote ?? '',
  }))
  const [errors, setErrors] = useState<ShiftFormErrors>({})
  const [validationAttempt, setValidationAttempt] = useState(0)
  function update(name: keyof ShiftFormValues, value: string): void { setValues((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: undefined })) }
  function fieldError(name: keyof ShiftFormValues) { return errors[name] === undefined ? {} : { 'aria-describedby': `${shiftFieldIds[name]}-error`, 'aria-invalid': true as const } }
  return <form className="card stacked-form" noValidate onSubmit={(event) => { event.preventDefault(); const nextErrors = validateShiftValues(values); setErrors(nextErrors); setValidationAttempt((current) => current + 1); if (Object.keys(nextErrors).length === 0) onSubmit(values) }}>
    <FormErrorSummary errors={errors} fieldIds={shiftFieldIds} key={validationAttempt} />
    <div className="form-grid"><div className="field"><label htmlFor="shift-location">Location</label><select id="shift-location" onChange={(event) => { update('locationId', event.target.value) }} required value={values.locationId} {...fieldError('locationId')}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>{errors.locationId !== undefined && <span className="field__error" id="shift-location-error">{errors.locationId}</span>}</div><div className="field"><label htmlFor="shift-area">Care area</label><input id="shift-area" minLength={2} maxLength={80} onChange={(event) => { update('areaName', event.target.value) }} required value={values.areaName} {...fieldError('areaName')} />{errors.areaName !== undefined && <span className="field__error" id="shift-area-error">{errors.areaName}</span>}</div><div className="field"><label htmlFor="shift-role">Role</label><select id="shift-role" onChange={(event) => { update('roleTitle', event.target.value) }} required value={values.roleTitle} {...fieldError('roleTitle')}>{roleTitles.map((role) => <option key={role} value={role}>{role}</option>)}</select>{errors.roleTitle !== undefined && <span className="field__error" id="shift-role-error">{errors.roleTitle}</span>}</div><div className="field"><label htmlFor="shift-required">Workers required</label><input id="shift-required" max={50} min={1} onChange={(event) => { update('requiredWorkers', event.target.value) }} required type="number" value={values.requiredWorkers} {...fieldError('requiredWorkers')} />{errors.requiredWorkers !== undefined && <span className="field__error" id="shift-required-error">{errors.requiredWorkers}</span>}</div><div className="field"><label htmlFor="shift-start">Starts</label><input id="shift-start" onChange={(event) => { update('startsAt', event.target.value) }} required type="datetime-local" value={values.startsAt} {...fieldError('startsAt')} />{errors.startsAt !== undefined && <span className="field__error" id="shift-start-error">{errors.startsAt}</span>}</div><div className="field"><label htmlFor="shift-end">Ends</label><input id="shift-end" onChange={(event) => { update('endsAt', event.target.value) }} required type="datetime-local" value={values.endsAt} {...fieldError('endsAt')} />{errors.endsAt !== undefined && <span className="field__error" id="shift-end-error">{errors.endsAt}</span>}</div></div>
    <div className="field"><label htmlFor="shift-arrival">Arrival note <span className="optional">Optional</span></label><textarea id="shift-arrival" maxLength={240} onChange={(event) => { update('arrivalNote', event.target.value) }} rows={3} value={values.arrivalNote} /></div>
    <div className="dialog-actions"><button className="button button--primary" disabled={pending} type="submit">{pending ? 'Saving shift' : submitLabel}</button></div>
  </form>
}

function shiftBody(values: ShiftFormValues) {
  return { arrivalNote: values.arrivalNote.trim().length === 0 ? null : values.arrivalNote.trim(), areaName: values.areaName, endsAt: toIso(values.endsAt), locationId: values.locationId, requiredWorkers: Number(values.requiredWorkers), roleTitle: values.roleTitle, startsAt: toIso(values.startsAt) }
}

export function ManagerShiftCreatePage() {
  const optionsQuery = useManagerShiftsQuery()
  const mutation = useCreateManagerShiftMutation()
  const navigate = useNavigate()
  return <div className="page-stack"><Link className="back-link" to="/manager/shifts"><ArrowLeft aria-hidden="true" size={17} />Manage shifts</Link><PageHeader eyebrow="Manager workspace" summary="Save a checked draft before deciding when it is ready for workers." title="Create a shift" /><MutationMessage error={mutation.error} />
    <PreviewQueryBoundary query={optionsQuery}>{({ data }) => <ShiftForm locations={data.locations} pending={mutation.isPending} roleTitles={data.roleTitles} submitLabel="Save draft" onSubmit={(values) => { mutation.mutate({ body: shiftBody(values), idempotencyKey: newIdempotencyKey() }, { onSuccess: (response) => { void navigate(`/manager/shifts/${response.data.shift.id}`) } }) }} />}</PreviewQueryBoundary>
  </div>
}

export function ManagerShiftDetailPage() {
  const { shiftId = '' } = useParams()
  const query = useManagerShiftDetailQuery(shiftId)
  const optionsQuery = useManagerShiftsQuery()
  const update = useUpdateManagerShiftMutation()
  const publish = usePublishManagerShiftMutation()
  const cancel = useCancelManagerShiftMutation()
  const [cancelReason, setCancelReason] = useState('')
  const [cancelConfirmed, setCancelConfirmed] = useState(false)
  const activeError = update.error ?? publish.error ?? cancel.error
  const message = update.data?.data.message ?? publish.data?.data.message ?? cancel.data?.data.message
  return <div className="page-stack"><Link className="back-link" to="/manager/shifts"><ArrowLeft aria-hidden="true" size={17} />Manage shifts</Link><PageHeader eyebrow="Manager workspace" summary="Edit a draft, publish it to workers, or cancel active assignments with a clear reason." title="Shift details" /><MutationMessage error={activeError} message={message} />
    <PreviewQueryBoundary query={query}>{({ data, meta }) => <><PreviewDataSource generatedAt={meta.generatedAt} /><div className="card__heading"><div><p className="overline">{data.shift.organisation.name}</p><h2>{data.shift.location.area}</h2></div><Badge tone={statusTone(data.shift.status)}>{labelStatus(data.shift.status)}</Badge></div>
      <PreviewQueryBoundary query={optionsQuery}>{({ data: options }) => data.shift.status === 'draft' ? <ShiftForm initial={data.shift} locations={options.locations} pending={update.isPending} roleTitles={options.roleTitles} submitLabel="Save changes" onSubmit={(values) => { update.mutate({ body: { ...shiftBody(values), expectedVersion: data.shift.version }, idempotencyKey: newIdempotencyKey(), shiftId }) }} /> : <section className="card"><dl className="detail-list"><div><dt>Window</dt><dd>{formatShiftWindow(data.shift.startsAt, data.shift.endsAt, data.shift.location.timezone)}</dd></div><div><dt>Role</dt><dd>{data.shift.roleTitle}</dd></div><div><dt>Coverage</dt><dd>{String(data.shift.confirmedWorkers)} confirmed of {String(data.shift.requiredWorkers)}</dd></div><div><dt>Arrival note</dt><dd>{data.shift.arrivalNote ?? 'None provided'}</dd></div></dl></section>}</PreviewQueryBoundary>
      {data.shift.status === 'draft' && <div className="action-panel"><div><strong>Ready for workers?</strong><span>Publishing makes this shift discoverable.</span></div><button className="button button--primary" disabled={publish.isPending || update.isPending} onClick={() => { publish.mutate({ expectedVersion: data.shift.version, idempotencyKey: newIdempotencyKey(), shiftId }) }} type="button">Publish shift</button></div>}
      {['open', 'covered'].includes(data.shift.status) && <form className="card stacked-form" onSubmit={(event) => { event.preventDefault(); cancel.mutate({ body: { expectedVersion: data.shift.version, reason: cancelReason }, idempotencyKey: newIdempotencyKey(), shiftId }) }}><h2>Cancel this shift</h2><p>Confirmed and in-review assignments will be cancelled and workers will be notified.</p><div className="field"><label htmlFor="cancel-shift-reason">Cancellation reason</label><textarea id="cancel-shift-reason" minLength={12} maxLength={240} onChange={(event) => { setCancelReason(event.target.value) }} required rows={3} value={cancelReason} /></div><label className="confirmation-check"><input checked={cancelConfirmed} onChange={(event) => { setCancelConfirmed(event.target.checked) }} required type="checkbox" /><span>I understand this cancels the shift and every active assignment.</span></label><button className="button button--danger" disabled={cancel.isPending || update.isPending || !cancelConfirmed} type="submit">Cancel shift and assignments</button></form>}
    </>}</PreviewQueryBoundary>
  </div>
}

const complianceStatuses: readonly ComplianceRecordReviewStatus[] = ['current', 'due_soon', 'action_due', 'reviewing', 'information_required', 'rejected']

function complianceDecisionUnavailableContent(status: Exclude<ComplianceRecordReviewStatus, 'reviewing'>): { readonly detail: string; readonly title: string } {
  if (status === 'current') {
    return {
      detail: 'This record is current. No review action is currently required.',
      title: 'No review action required',
    }
  }
  if (status === 'information_required') {
    return {
      detail: 'Further information has already been requested. Another decision is unavailable for the current record state.',
      title: 'Further information already requested',
    }
  }
  if (status === 'rejected') {
    return {
      detail: 'This record was rejected. The decision is complete and another decision is unavailable.',
      title: 'Review decision complete',
    }
  }
  return {
    detail: `This record is ${labelStatus(status).toLowerCase()} and is not awaiting review. Another decision is unavailable for the current record state.`,
    title: 'No review action available',
  }
}

export function AdministratorComplianceReviewPage() {
  const [status, setStatus] = useState<ComplianceRecordReviewStatus | undefined>()
  const page = useCursorPage()
  const query = useAdministratorComplianceRecordsQuery(status, page.cursor)
  return <div className="page-stack"><PageHeader eyebrow="Administrator workspace" summary="Review synthetic evidence states and how each record affects workforce readiness." title="Compliance review" /><div className="field field--inline"><label htmlFor="compliance-status">Filter record status</label><select id="compliance-status" onChange={(event) => { setStatus(event.target.value === 'all' ? undefined : event.target.value as ComplianceRecordReviewStatus); page.reset() }} value={status ?? 'all'}><option value="all">All statuses</option>{complianceStatuses.map((value) => <option key={value} value={value}>{labelStatus(value)}</option>)}</select></div>
    <PreviewQueryBoundary query={query}>{({ data, meta }) => <><PreviewDataSource generatedAt={meta.generatedAt} /><div className="metric-grid"><article><span>Current</span><strong>{String(data.summary.current)}</strong><small>Requirements in date</small></article><article><span>Reviewing</span><strong>{String(data.summary.reviewing)}</strong><small>Including information requests</small></article><article><span>Action due</span><strong>{String(data.summary.actionDue)}</strong><small>Blocks readiness</small></article></div>{data.items.length === 0 ? <EmptyState title="No matching records" description="Change the status filter to review another evidence state." /> : <section className="card"><div className="responsive-table"><table><caption className="visually-hidden">Synthetic compliance records</caption><thead><tr><th scope="col">Worker</th><th scope="col">Requirement</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{data.items.map((record) => <tr key={record.id}><th data-label="Worker" scope="row">{record.worker.displayName}<small className="table-subline">{record.previewId}</small></th><td data-label="Requirement">{record.requirement.name}</td><td data-label="Due">{record.dueOn === null ? 'Not set' : formatDateOnly(record.dueOn)}</td><td data-label="Status"><Badge tone={statusTone(record.status)}>{labelStatus(record.status)}</Badge></td><td data-label="Action"><Link className="text-button" to={`/administrator/compliance/${record.id}`}>Review record</Link></td></tr>)}</tbody></table></div><CursorPagination nextCursor={meta.pagination.nextCursor} page={page} /></section>}</>}</PreviewQueryBoundary>
  </div>
}

export function AdministratorComplianceDetailPage() {
  const { recordId = '' } = useParams()
  const query = useAdministratorComplianceRecordQuery(recordId)
  const mutation = useAdministratorComplianceDecisionMutation()
  const [decision, setDecision] = useState<'approved_current' | 'further_information_required' | 'rejected'>('approved_current')
  const [note, setNote] = useState('Review completed and the synthetic record is current.')
  const [loadedRecordId, setLoadedRecordId] = useState(recordId)
  if (recordId !== loadedRecordId) {
    setLoadedRecordId(recordId)
    setDecision('approved_current')
    setNote('Review completed and the synthetic record is current.')
  }
  return <div className="page-stack"><Link className="back-link" to="/administrator/compliance"><ArrowLeft aria-hidden="true" size={17} />Compliance review</Link><PageHeader eyebrow="Administrator workspace" summary="Record a proportionate decision and see its immediate readiness effect." title="Compliance record" /><MutationMessage error={mutation.error} message={mutation.data?.data.message} />
    <PreviewQueryBoundary query={query}>{({ data, meta }) => { const unavailable = data.record.status === 'reviewing' ? null : complianceDecisionUnavailableContent(data.record.status); return <><PreviewDataSource generatedAt={meta.generatedAt} /><section className="card"><div className="card__heading"><div><p className="overline">{data.record.previewId}</p><h2>{data.record.worker.displayName}</h2></div><Badge tone={statusTone(data.record.status)}>{labelStatus(data.record.status)}</Badge></div><p>{data.record.requirement.description}</p><dl className="detail-list"><div><dt>Requirement</dt><dd>{data.record.requirement.name}</dd></div><div><dt>Worker readiness</dt><dd>{labelStatus(data.workerReadiness)}</dd></div><div><dt>Reviewed</dt><dd>{data.record.reviewedOn === null ? 'Not recorded' : formatDateOnly(data.record.reviewedOn)}</dd></div><div><dt>Due</dt><dd>{data.record.dueOn === null ? 'Not set' : formatDateOnly(data.record.dueOn)}</dd></div></dl></section>
      {unavailable === null ? <form className="card stacked-form" onSubmit={(event) => { event.preventDefault(); const body = decision === 'approved_current' ? { decision, expectedVersion: data.record.version, note } as const : { decision, expectedVersion: data.record.version, note } as const; mutation.mutate({ body, idempotencyKey: newIdempotencyKey(), recordId }) }}><h2>Record review decision</h2><fieldset className="role-options"><legend>Outcome</legend>{(['approved_current', 'further_information_required', 'rejected'] as const).map((value) => <label className="role-option" key={value}><input checked={decision === value} name="compliance-decision" onChange={() => { setDecision(value); if (value !== 'approved_current' && note.startsWith('Review completed')) setNote('') }} type="radio" /><span><strong>{labelStatus(value)}</strong></span></label>)}</fieldset><div className="field"><label htmlFor="compliance-note">Review note</label><textarea id="compliance-note" minLength={decision === 'approved_current' ? 1 : 12} maxLength={500} onChange={(event) => { setNote(event.target.value) }} required rows={4} value={note} /></div><button className="button button--primary" disabled={mutation.isPending} type="submit">Save review decision</button></form> : <section aria-labelledby="compliance-decision-unavailable-title" className="card review-action-state" tabIndex={0}><FileCheck2 aria-hidden="true" size={24} /><div><h2 id="compliance-decision-unavailable-title">{unavailable.title}</h2><p>{unavailable.detail}</p></div></section>}
      <section className="card"><h2>Review history</h2>{data.history.length === 0 ? <EmptyState title="No previous reviews" description="The first completed decision will appear here." /> : <ol className="timeline">{data.history.map((event) => <li key={event.id}><span aria-hidden="true" /><div><strong>{labelStatus(event.decision)}</strong><small>{formatDateTime(event.occurredAt)} · {event.administrator.displayName}</small><p>{event.note}</p></div></li>)}</ol>}</section>
    </> }}</PreviewQueryBoundary>
  </div>
}

function TimesheetFacts({ timesheet }: { readonly timesheet: Timesheet }) {
  const hours = Math.floor(timesheet.workedMinutes / 60)
  const minutes = timesheet.workedMinutes % 60
  return <dl className="detail-list"><div><dt>Shift</dt><dd>{timesheet.shift.location.area} · {formatShiftWindow(timesheet.shift.startsAt, timesheet.shift.endsAt, timesheet.shift.location.timezone)}</dd></div><div><dt>Worked</dt><dd>{formatDateTime(timesheet.workedStart)} to {formatDateTime(timesheet.workedEnd)}</dd></div><div><dt>Break</dt><dd>{String(timesheet.breakMinutes)} minutes</dd></div><div><dt>Recorded time</dt><dd>{String(hours)}h {String(minutes)}m</dd></div>{timesheet.managerReviewNote !== null && <div><dt>Manager note</dt><dd>{timesheet.managerReviewNote}</dd></div>}</dl>
}

interface TimesheetFormValues { readonly workedStart: string; readonly workedEnd: string; readonly breakMinutes: string; readonly workerNote: string }

type TimesheetFormErrors = Partial<Record<keyof TimesheetFormValues, string>>

const timesheetFieldIds: Readonly<Record<keyof TimesheetFormValues, string>> = {
  breakMinutes: 'break-minutes',
  workedEnd: 'worked-end',
  workedStart: 'worked-start',
  workerNote: 'worker-note',
}

function validateTimesheetValues(values: TimesheetFormValues): TimesheetFormErrors {
  const errors: TimesheetFormErrors = {}
  const start = Date.parse(values.workedStart)
  const end = Date.parse(values.workedEnd)
  if (!Number.isFinite(start)) errors.workedStart = 'Enter the worked start date and time.'
  if (!Number.isFinite(end)) errors.workedEnd = 'Enter the worked end date and time.'
  const breakMinutes = Number(values.breakMinutes)
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 360) errors.breakMinutes = 'Break minutes must be a whole number from 0 to 360.'
  if (Number.isFinite(start) && Number.isFinite(end)) {
    const intervalMinutes = (end - start) / 60_000
    if (intervalMinutes <= 0) errors.workedEnd = 'Worked end must be after worked start.'
    else if (intervalMinutes > 24 * 60) errors.workedEnd = 'A worked interval cannot exceed 24 hours.'
    if (Number.isInteger(breakMinutes) && breakMinutes >= intervalMinutes) errors.breakMinutes = 'Break minutes must be shorter than the worked interval.'
  }
  return errors
}

function TimesheetForm({ initial, onSubmit, pending, submitLabel }: { readonly initial: TimesheetFormValues; readonly onSubmit: (values: TimesheetFormValues) => void; readonly pending: boolean; readonly submitLabel: string }) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<TimesheetFormErrors>({})
  const [validationAttempt, setValidationAttempt] = useState(0)
  function update(name: keyof TimesheetFormValues, value: string): void { setValues((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: undefined })) }
  function fieldError(name: keyof TimesheetFormValues) { return errors[name] === undefined ? {} : { 'aria-describedby': `${timesheetFieldIds[name]}-error`, 'aria-invalid': true as const } }
  return <form className="stacked-form" noValidate onSubmit={(event) => { event.preventDefault(); const nextErrors = validateTimesheetValues(values); setErrors(nextErrors); setValidationAttempt((current) => current + 1); if (Object.keys(nextErrors).length === 0) onSubmit(values) }}><FormErrorSummary errors={errors} fieldIds={timesheetFieldIds} key={validationAttempt} /><div className="form-grid"><div className="field"><label htmlFor="worked-start">Worked start</label><input id="worked-start" onChange={(event) => { update('workedStart', event.target.value) }} required type="datetime-local" value={values.workedStart} {...fieldError('workedStart')} />{errors.workedStart !== undefined && <span className="field__error" id="worked-start-error">{errors.workedStart}</span>}</div><div className="field"><label htmlFor="worked-end">Worked end</label><input id="worked-end" onChange={(event) => { update('workedEnd', event.target.value) }} required type="datetime-local" value={values.workedEnd} {...fieldError('workedEnd')} />{errors.workedEnd !== undefined && <span className="field__error" id="worked-end-error">{errors.workedEnd}</span>}</div><div className="field"><label htmlFor="break-minutes">Unpaid break in minutes</label><input id="break-minutes" max={360} min={0} onChange={(event) => { update('breakMinutes', event.target.value) }} required type="number" value={values.breakMinutes} {...fieldError('breakMinutes')} />{errors.breakMinutes !== undefined && <span className="field__error" id="break-minutes-error">{errors.breakMinutes}</span>}</div></div><div className="field"><label htmlFor="worker-note">Work note <span className="optional">Optional</span></label><textarea id="worker-note" maxLength={500} onChange={(event) => { update('workerNote', event.target.value) }} rows={3} value={values.workerNote} /></div><button className="button button--primary" disabled={pending} type="submit">{pending ? 'Saving timesheet' : submitLabel}</button></form>
}

function timesheetFields(values: TimesheetFormValues) { return { breakMinutes: Number(values.breakMinutes), workedEnd: toIso(values.workedEnd), workedStart: toIso(values.workedStart), workerNote: values.workerNote.trim().length === 0 ? null : values.workerNote.trim() } }

export function WorkerTimesheetsPage() {
  const [status, setStatus] = useState<TimesheetStatus | undefined>()
  const [assignmentId, setAssignmentId] = useState<string | null>(null)
  const page = useCursorPage()
  const query = useWorkerTimesheetsQuery(status, page.cursor)
  const create = useCreateWorkerTimesheetMutation()
  const selected = query.data?.data.eligibleAssignments.find((item) => item.assignmentId === assignmentId)
  return <div className="page-stack"><PageHeader eyebrow="Worker workspace" summary="Record completed synthetic work, submit it for review and correct returned entries." title="My timesheets" /><MutationMessage error={create.error} message={create.data?.data.message} /><div className="field field--inline"><label htmlFor="worker-timesheet-status">Filter status</label><select id="worker-timesheet-status" onChange={(event) => { setStatus(event.target.value === 'all' ? undefined : event.target.value as TimesheetStatus); page.reset() }} value={status ?? 'all'}><option value="all">All statuses</option>{(['draft', 'submitted', 'rejected', 'approved'] as const).map((value) => <option key={value} value={value}>{labelStatus(value)}</option>)}</select></div>
    <PreviewQueryBoundary query={query}>{({ data, meta }) => <><PreviewDataSource generatedAt={meta.generatedAt} />{data.eligibleAssignments.length > 0 && <section className="card"><div className="card__heading"><div><p className="overline">Completed assignments</p><h2>Start a timesheet</h2></div><Badge tone="information">{String(data.eligibleAssignments.length)} eligible</Badge></div>{assignmentId === null ? <div className="record-grid">{data.eligibleAssignments.map((assignment) => <article className="inset-card" key={assignment.assignmentId}><strong>{assignment.location.area}</strong><span>{formatShiftWindow(assignment.startsAt, assignment.endsAt, assignment.location.timezone)}</span><button className="text-button" onClick={() => { setAssignmentId(assignment.assignmentId) }} type="button">Record time</button></article>)}</div> : selected !== undefined && <TimesheetForm initial={{ breakMinutes: '30', workedEnd: toDatetimeLocal(selected.endsAt), workedStart: toDatetimeLocal(selected.startsAt), workerNote: '' }} pending={create.isPending} submitLabel="Save draft" onSubmit={(values) => { create.mutate({ body: { ...timesheetFields(values), assignmentId: selected.assignmentId }, idempotencyKey: newIdempotencyKey() }, { onSuccess: () => { setAssignmentId(null) } }) }} />}</section>}
      {data.items.length === 0 ? <EmptyState title="No matching timesheets" description="Completed assignments become available above for a new draft." /> : <><div className="record-grid">{data.items.map((timesheet) => <article className="card" key={timesheet.id}><div className="card__heading"><div><p className="overline">{timesheet.shift.location.name}</p><h2>{timesheet.shift.location.area}</h2></div><Badge tone={statusTone(timesheet.status)}>{labelStatus(timesheet.status)}</Badge></div><TimesheetFacts timesheet={timesheet} /><Link className="button button--secondary" to={`/worker/timesheets/${timesheet.id}`}>{['draft', 'rejected'].includes(timesheet.status) ? 'Review and edit' : 'View timesheet'}</Link></article>)}</div><CursorPagination nextCursor={meta.pagination.nextCursor} page={page} /></>}
    </>}</PreviewQueryBoundary>
  </div>
}

export function WorkerTimesheetDetailPage() {
  const { timesheetId = '' } = useParams()
  const query = useWorkerTimesheetDetailQuery(timesheetId)
  const update = useUpdateWorkerTimesheetMutation()
  const submit = useSubmitWorkerTimesheetMutation()
  const activeError = update.error ?? submit.error
  const message = update.data?.data.message ?? submit.data?.data.message
  return <div className="page-stack"><Link className="back-link" to="/worker/timesheets"><ArrowLeft aria-hidden="true" size={17} />My timesheets</Link><PageHeader eyebrow="Worker workspace" summary="Check recorded hours before submitting or resubmitting this synthetic entry." title="Timesheet details" /><MutationMessage error={activeError} message={message} />
      <PreviewQueryBoundary query={query}>{({ data, meta }) => <><PreviewDataSource generatedAt={meta.generatedAt} /><section className="card"><div className="card__heading"><div><p className="overline">{data.timesheet.shift.location.name}</p><h2>{data.timesheet.shift.location.area}</h2></div><Badge tone={statusTone(data.timesheet.status)}>{labelStatus(data.timesheet.status)}</Badge></div>{data.timesheet.status === 'rejected' && data.timesheet.managerReviewNote !== null && <section aria-labelledby="timesheet-correction-title" className="alert alert--warning"><AlertTriangle aria-hidden="true" /><div><strong id="timesheet-correction-title">Manager correction requested</strong><span>{data.timesheet.managerReviewNote}</span></div></section>}{['draft', 'rejected'].includes(data.timesheet.status) ? <TimesheetForm initial={{ breakMinutes: String(data.timesheet.breakMinutes), workedEnd: toDatetimeLocal(data.timesheet.workedEnd), workedStart: toDatetimeLocal(data.timesheet.workedStart), workerNote: data.timesheet.workerNote ?? '' }} pending={update.isPending} submitLabel="Save correction" onSubmit={(values) => { update.mutate({ body: { ...timesheetFields(values), expectedVersion: data.timesheet.version }, idempotencyKey: newIdempotencyKey(), timesheetId }) }} /> : <TimesheetFacts timesheet={data.timesheet} />}</section>{['draft', 'rejected'].includes(data.timesheet.status) && <div className="action-panel"><div><strong>{data.timesheet.status === 'rejected' ? 'Ready to resubmit?' : 'Ready for manager review?'}</strong><span>Save any corrections before submitting.</span></div><button className="button button--primary" disabled={submit.isPending || update.isPending} onClick={() => { submit.mutate({ expectedVersion: data.timesheet.version, idempotencyKey: newIdempotencyKey(), timesheetId }) }} type="button"><Send aria-hidden="true" size={17} />{data.timesheet.status === 'rejected' ? 'Resubmit timesheet' : 'Submit timesheet'}</button></div>}</>}</PreviewQueryBoundary>
  </div>
}

export function ManagerTimesheetsPage() {
  const [status, setStatus] = useState<TimesheetStatus | undefined>('submitted')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const page = useCursorPage()
  const query = useManagerTimesheetsQuery(status, page.cursor)
  const mutation = useManagerTimesheetDecisionMutation()
  function decide(timesheet: Timesheet, decision: 'approve' | 'reject'): void {
    const reviewNote = notes[timesheet.id]?.trim() ?? ''
    const body = decision === 'approve' ? { decision, expectedVersion: timesheet.version, reviewNote: reviewNote.length === 0 ? null : reviewNote } as const : { decision, expectedVersion: timesheet.version, reviewNote } as const
    mutation.mutate({ body, idempotencyKey: newIdempotencyKey(), timesheetId: timesheet.id })
  }
  return <div className="page-stack"><PageHeader eyebrow="Manager workspace" summary="Approve submitted time or return it with a specific correction note." title="Timesheet approvals" /><MutationMessage error={mutation.error} message={mutation.data?.data.message} /><div className="field field--inline"><label htmlFor="manager-timesheet-status">Filter status</label><select id="manager-timesheet-status" onChange={(event) => { setStatus(event.target.value === 'all' ? undefined : event.target.value as TimesheetStatus); page.reset() }} value={status ?? 'all'}><option value="all">All statuses</option>{(['draft', 'submitted', 'rejected', 'approved'] as const).map((value) => <option key={value} value={value}>{labelStatus(value)}</option>)}</select></div>
    <PreviewQueryBoundary query={query}>{({ data, meta }) => <><PreviewDataSource generatedAt={meta.generatedAt} />{data.items.length === 0 ? <EmptyState title="No timesheets to review" description="Submitted worker timesheets will appear in this queue." /> : <><div className="record-grid">{data.items.map((timesheet) => <article className="card" key={timesheet.id}><div className="card__heading"><div><p className="overline">{timesheet.worker.roleTitle}</p><h2>{timesheet.worker.displayName}</h2></div><Badge tone={statusTone(timesheet.status)}>{labelStatus(timesheet.status)}</Badge></div><TimesheetFacts timesheet={timesheet} />{timesheet.status === 'submitted' && <><div className="field"><label htmlFor={`manager-note-${timesheet.id}`}>Review note <span className="optional">Required when rejecting</span></label><textarea id={`manager-note-${timesheet.id}`} maxLength={500} onChange={(event) => { setNotes((current) => ({ ...current, [timesheet.id]: event.target.value })) }} rows={3} value={notes[timesheet.id] ?? ''} /></div><div className="dialog-actions"><button className="button button--secondary" disabled={mutation.isPending || (notes[timesheet.id]?.trim().length ?? 0) < 12} onClick={() => { decide(timesheet, 'reject') }} type="button">Return for correction</button><button className="button button--primary" disabled={mutation.isPending} onClick={() => { decide(timesheet, 'approve') }} type="button">Approve timesheet</button></div></>}</article>)}</div><CursorPagination nextCursor={meta.pagination.nextCursor} page={page} /></>}</>}</PreviewQueryBoundary>
  </div>
}

export function AdministratorTimesheetsPage() {
  const [status, setStatus] = useState<TimesheetStatus | undefined>()
  const page = useCursorPage()
  const query = useAdministratorTimesheetsQuery(status, page.cursor)
  return <div className="page-stack"><PageHeader eyebrow="Administrator workspace" summary="Monitor synthetic workflow states without editing worker time or calculating pay." title="Timesheet oversight" /><div className="alert alert--information"><ShieldCheck aria-hidden="true" /><div><strong>Oversight is read-only</strong><span>Approval belongs to managers. Payroll, invoicing and financial calculation are not included in this pre-production preview.</span></div></div><div className="field field--inline"><label htmlFor="administrator-timesheet-status">Filter status</label><select id="administrator-timesheet-status" onChange={(event) => { setStatus(event.target.value === 'all' ? undefined : event.target.value as TimesheetStatus); page.reset() }} value={status ?? 'all'}><option value="all">All statuses</option>{(['draft', 'submitted', 'rejected', 'approved'] as const).map((value) => <option key={value} value={value}>{labelStatus(value)}</option>)}</select></div>
    <PreviewQueryBoundary query={query}>{({ data, meta }) => <><PreviewDataSource generatedAt={meta.generatedAt} /><div className="metric-grid"><article><span>Draft</span><strong>{String(data.summary.draft)}</strong><small>Worker owned</small></article><article><span>Submitted</span><strong>{String(data.summary.submitted)}</strong><small>Awaiting manager</small></article><article><span>Rejected</span><strong>{String(data.summary.rejected)}</strong><small>Correction needed</small></article><article><span>Approved</span><strong>{String(data.summary.approved)}</strong><small>Workflow complete</small></article></div>{data.items.length === 0 ? <EmptyState title="No matching timesheets" description="Change the status filter to inspect another workflow state." /> : <section className="card"><div className="responsive-table"><table><caption className="visually-hidden">Timesheet workflow oversight</caption><thead><tr><th scope="col">Worker</th><th scope="col">Assignment</th><th scope="col">Recorded time</th><th scope="col">Updated</th><th scope="col">Status</th></tr></thead><tbody>{data.items.map((timesheet) => <tr key={timesheet.id}><th data-label="Worker" scope="row">{timesheet.worker.displayName}<small className="table-subline">{timesheet.worker.roleTitle}</small></th><td data-label="Assignment">{timesheet.shift.location.area}</td><td data-label="Recorded time">{String(Math.floor(timesheet.workedMinutes / 60))}h {String(timesheet.workedMinutes % 60)}m</td><td data-label="Updated">{formatDateTime(timesheet.updatedAt)}</td><td data-label="Status"><Badge tone={statusTone(timesheet.status)}>{labelStatus(timesheet.status)}</Badge></td></tr>)}</tbody></table></div><CursorPagination nextCursor={meta.pagination.nextCursor} page={page} /></section>}</>}</PreviewQueryBoundary>
  </div>
}

export function OperationsFoundationSummary() {
  return <section className="card"><div className="card__heading"><div><p className="overline">Operations foundation</p><h2>Connected operational workflows</h2></div><FileCheck2 aria-hidden="true" /></div><div className="principle-grid"><article><UsersRound aria-hidden="true" /><h3>Manager decisions</h3><p>Assignment review and shift lifecycle actions revalidate coverage in transactions.</p></article><article><CalendarCheck2 aria-hidden="true" /><h3>Timesheets</h3><p>Workers draft and submit time; managers approve or return it for correction.</p></article><article><Clock3 aria-hidden="true" /><h3>Coherent state</h3><p>Notifications, activity, readiness and coverage update from the same persisted actions.</p></article><article><MapPin aria-hidden="true" /><h3>Synthetic scope</h3><p>Every scenario remains fictional and organisation-scoped.</p></article></div></section>
}

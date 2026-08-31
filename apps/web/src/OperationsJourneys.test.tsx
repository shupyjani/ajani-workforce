import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  installPreviewApiMock,
  previewApiResponse,
  previewRequestUrl,
} from './test/apiResponses'

const assignmentId = '80000000-0000-4000-8000-000000000013'
const managerShiftId = '70000000-0000-4000-8000-000000000019'
const complianceRecordId = 'd0000000-0000-4000-8000-000000000012'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Operations web journeys', () => {
  it('approves a Manager assignment request once and invalidates connected views', async () => {
    const requests: { init?: RequestInit; url: URL }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      requests.push({ ...(init === undefined ? {} : { init }), url: previewRequestUrl(input) })
      return Promise.resolve(previewApiResponse(input, init))
    })
    const user = userEvent.setup()
    render(<App initialEntries={['/manager/requests']} />)

    expect(await screen.findByRole('heading', { name: 'Theo Adeyemi' })).toBeInTheDocument()
    const approve = screen.getByRole('button', { name: /approve assignment/i })
    expect(approve).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(approve)

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/assignment is confirmed/i)
    expect(status).toHaveFocus()
    const mutation = requests.find(({ init, url }) => init?.method === 'POST' && url.pathname.endsWith(`/${assignmentId}/decision`))
    expect(new Headers(mutation?.init?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/i)
    await waitFor(() => {
      expect(requests.filter(({ url }) => url.pathname.endsWith('/operations')).length).toBeGreaterThan(1)
    })
  })

  it('prevents approval for a known action-due worker while keeping decline available', async () => {
    let approvalMutations = 0
    let declineMutations = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = previewRequestUrl(input)
      if (init?.method === 'POST' && url.pathname.endsWith(`/${assignmentId}/decision`) && typeof init.body === 'string') {
        if (init.body.includes('"decision":"approve"')) approvalMutations += 1
        if (init.body.includes('"decision":"decline"')) declineMutations += 1
      }
      const response = previewApiResponse(input, init)
      if (init?.method === undefined && url.pathname.endsWith('/assignment-requests')) {
        const payload = await response.json() as { data: { items: { worker: { readinessStatus: string } }[] } }
        const request = payload.data.items[0]
        if (request !== undefined) request.worker.readinessStatus = 'action_due'
        return new Response(JSON.stringify(payload), { headers: response.headers, status: response.status })
      }
      return response
    })
    const user = userEvent.setup()
    render(<App initialEntries={['/manager/requests']} />)

    expect(await screen.findByRole('heading', { name: 'Theo Adeyemi' })).toBeInTheDocument()
    const approve = screen.getByRole('button', { name: /approve assignment/i })
    const explanation = screen.getByText(/approval is unavailable until readiness requirements are resolved/i).closest('p')
    if (explanation === null) throw new Error('Expected an approval restriction explanation.')
    expect(approve).toHaveAttribute('aria-disabled', 'true')
    expect(approve).toHaveAttribute('aria-describedby', explanation.id)
    approve.focus()
    expect(approve).toHaveFocus()
    await user.click(approve)
    expect(approvalMutations).toBe(0)
    expect(screen.queryByText(/action not completed/i)).not.toBeInTheDocument()

    const decline = screen.getByRole('button', { name: /^decline$/i })
    expect(decline).toBeEnabled()
    await user.click(decline)
    const declineReason = screen.getByLabelText(/reason for declining/i)
    expect(declineReason).toBeRequired()
    await user.type(declineReason, 'The fictional coverage request has changed.')
    await user.click(screen.getByRole('button', { name: /decline request/i }))
    await waitFor(() => { expect(declineMutations).toBe(1) })
    expect(approvalMutations).toBe(0)
  })

  it('prevents incomplete shift authoring and submits a bounded future draft once', async () => {
    let mutationCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (init?.method === 'POST' && previewRequestUrl(input).pathname.endsWith('/shifts')) mutationCount += 1
      return Promise.resolve(previewApiResponse(input, init))
    })
    const user = userEvent.setup()
    render(<App initialEntries={['/manager/shifts/new']} />)

    await screen.findByRole('heading', { name: /create a shift/i })
    await user.click(await screen.findByRole('button', { name: /save draft/i }))
    expect(mutationCount).toBe(0)
    expect(screen.getByLabelText(/care area/i)).toBeInvalid()
    const errorSummary = screen.getByText(/check the highlighted fields/i).closest('[role="alert"]')
    expect(errorSummary).toHaveFocus()
    expect(within(errorSummary as HTMLElement).getByRole('link', { name: /care area/i })).toHaveAttribute('href', '#shift-area')

    await user.type(screen.getByLabelText(/care area/i), 'River Room')
    expect(screen.getByLabelText(/care area/i)).toHaveValue('River Room')
    await user.type(screen.getByLabelText(/^starts$/i), '2026-09-08T07:00')
    await user.type(screen.getByLabelText(/^ends$/i), '2026-09-08T15:00')
    expect(screen.getByLabelText(/^starts$/i)).toHaveValue('2026-09-08T07:00')
    expect(screen.getByLabelText(/^ends$/i)).toHaveValue('2026-09-08T15:00')
    await user.click(screen.getByRole('button', { name: /save draft/i }))
    expect(screen.queryByText(/check the highlighted fields/i)).not.toBeInTheDocument()
    await waitFor(() => { expect(mutationCount).toBe(1) })
  })

  it('publishes a draft and requires explicit confirmation before cancellation', async () => {
    const user = userEvent.setup()
    installPreviewApiMock()
    const { unmount } = render(<App initialEntries={[`/manager/shifts/${managerShiftId}`]} />)

    await user.click(await screen.findByRole('button', { name: /publish shift/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/shift is published/i)
    unmount()

    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const response = previewApiResponse(input, init)
      const url = previewRequestUrl(input)
      if (init?.method === undefined && url.pathname.endsWith(`/shifts/${managerShiftId}`)) {
        const payload = await response.json() as { data: { shift: { status: string } } }
        payload.data.shift.status = 'open'
        return new Response(JSON.stringify(payload), { headers: response.headers, status: response.status })
      }
      return response
    })
    render(<App initialEntries={[`/manager/shifts/${managerShiftId}`]} />)
    const cancelButton = await screen.findByRole('button', { name: /cancel shift and assignments/i })
    expect(cancelButton).toBeDisabled()
    await user.type(screen.getByLabelText(/cancellation reason/i), 'The synthetic service need changed.')
    await user.click(screen.getByLabelText(/i understand this cancels/i))
    expect(cancelButton).toBeEnabled()
    await user.click(cancelButton)
    expect(await screen.findByRole('status')).toHaveTextContent(/active assignments were cancelled/i)
  })

  it('filters compliance records and records a validated review decision', async () => {
    const requests: { init?: RequestInit; url: URL }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      requests.push({ ...(init === undefined ? {} : { init }), url: previewRequestUrl(input) })
      return Promise.resolve(previewApiResponse(input, init))
    })
    const user = userEvent.setup()
    const { unmount } = render(<App initialEntries={['/administrator/compliance']} />)

    expect(await screen.findByRole('heading', { name: /compliance review/i })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/filter record status/i), 'reviewing')
    await waitFor(() => {
      expect(requests.some(({ url }) => url.searchParams.get('status') === 'reviewing')).toBe(true)
    })
    unmount()

    render(<App initialEntries={[`/administrator/compliance/${complianceRecordId}`]} />)
    expect(await screen.findByText(/synthetic review needs a clearer renewal date/i)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /further information required/i }))
    const note = screen.getByLabelText(/review note/i)
    await user.clear(note)
    await user.type(note, 'Please confirm the fictional renewal date.')
    await user.click(screen.getByRole('button', { name: /save review decision/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/readiness was recalculated/i)
    expect(requests.filter(({ init, url }) => init?.method === 'POST' && url.pathname.endsWith(`/compliance/${complianceRecordId}/decision`))).toHaveLength(1)
  })

  it.each([
    {
      detail: 'This record is current. No review action is currently required.',
      status: 'current',
      title: 'No review action required',
    },
    {
      detail: 'Further information has already been requested. Another decision is unavailable for the current record state.',
      status: 'information_required',
      title: 'Further information already requested',
    },
    {
      detail: 'This record was rejected. The decision is complete and another decision is unavailable.',
      status: 'rejected',
      title: 'Review decision complete',
    },
    {
      detail: 'This record is due soon and is not awaiting review. Another decision is unavailable for the current record state.',
      status: 'due_soon',
      title: 'No review action available',
    },
    {
      detail: 'This record is action due and is not awaiting review. Another decision is unavailable for the current record state.',
      status: 'action_due',
      title: 'No review action available',
    },
  ])('does not expose or trigger another compliance decision for a $status record', async ({ detail, status, title }) => {
    let decisionMutations = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = previewRequestUrl(input)
      if (init?.method === 'POST' && url.pathname.endsWith(`/compliance/${complianceRecordId}/decision`)) decisionMutations += 1
      const response = previewApiResponse(input, init)
      if (init?.method === undefined && url.pathname.endsWith(`/compliance/${complianceRecordId}`)) {
        const payload = await response.json() as { data: { record: { status: string } } }
        payload.data.record.status = status
        return new Response(JSON.stringify(payload), { headers: response.headers, status: response.status })
      }
      return response
    })
    const user = userEvent.setup()
    render(<App initialEntries={[`/administrator/compliance/${complianceRecordId}`]} />)

    const unavailable = await screen.findByRole('region', { name: title })
    expect(unavailable).toHaveTextContent(detail)
    expect(screen.queryByRole('button', { name: /save review decision/i })).not.toBeInTheDocument()
    expect(screen.getByText(/synthetic review needs a clearer renewal date/i)).toBeInTheDocument()

    await user.click(unavailable)
    unavailable.focus()
    expect(unavailable).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(decisionMutations).toBe(0)
  })

  it('hides the decision form immediately after a reviewing record becomes information_required, with no navigation or refresh', async () => {
    const { previewPersonaIds } = await import('@ajani/contracts')
    let status = 'reviewing'
    let history: { decision: string; note: string }[] = []
    let decisionMutations = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = previewRequestUrl(input)
      if (init?.method === undefined && url.pathname.endsWith(`/compliance/${complianceRecordId}`)) {
        const response = previewApiResponse(input, init)
        const payload = await response.json() as { data: { history: unknown[]; record: { status: string; version: number } } }
        payload.data.record.status = status
        payload.data.record.version = status === 'reviewing' ? 1 : 2
        payload.data.history = history.map((entry, index) => ({
          administrator: { displayName: 'Malik Adebayo', id: previewPersonaIds.administrator, roleTitle: 'Workforce administrator' },
          decision: entry.decision,
          id: `e0000000-0000-4000-8000-00000000000${String(index + 1)}`,
          note: entry.note,
          occurredAt: '2026-08-25T10:30:00.000Z',
        }))
        return new Response(JSON.stringify(payload), { headers: response.headers, status: response.status })
      }
      if (init?.method === 'POST' && url.pathname.endsWith(`/compliance/${complianceRecordId}/decision`) && typeof init.body === 'string') {
        decisionMutations += 1
        const body = JSON.parse(init.body) as { decision: string; note: string }
        status = 'information_required'
        history = [...history, { decision: body.decision, note: body.note }]
        const response = previewApiResponse(input, init)
        const payload = await response.json() as { data: { record: { status: string; version: number } } }
        payload.data.record.status = status
        payload.data.record.version = 2
        return new Response(JSON.stringify(payload), { headers: response.headers, status: response.status })
      }
      return previewApiResponse(input, init)
    })
    const user = userEvent.setup()
    render(<App initialEntries={[`/administrator/compliance/${complianceRecordId}`]} />)

    await screen.findByRole('button', { name: /save review decision/i })
    await user.click(screen.getByRole('radio', { name: /further information required/i }))
    const note = screen.getByLabelText(/review note/i)
    await user.clear(note)
    await user.type(note, 'Please confirm the fictional renewal date.')
    await user.click(screen.getByRole('button', { name: /save review decision/i }))

    const unavailable = await screen.findByRole('region', { name: 'Further information already requested' })
    expect(unavailable).toHaveTextContent(/further information has already been requested/i)
    expect(screen.queryByRole('button', { name: /save review decision/i })).not.toBeInTheDocument()
    expect(screen.getByText('Information required')).toBeInTheDocument()
    expect(screen.getByText('Please confirm the fictional renewal date.')).toBeInTheDocument()
    expect(decisionMutations).toBe(1)

    await user.click(unavailable)
    unavailable.focus()
    expect(unavailable).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(decisionMutations).toBe(1)
  })

  it('recovers safely when a reviewing compliance record changes after loading', async () => {
    let detailLoads = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = previewRequestUrl(input)
      if (init?.method === undefined && url.pathname.endsWith(`/compliance/${complianceRecordId}`)) detailLoads += 1
      if (init?.method === 'POST' && url.pathname.endsWith(`/compliance/${complianceRecordId}/decision`)) {
        return Promise.resolve(new Response(JSON.stringify({ error: { code: 'VERSION_CONFLICT', message: 'The compliance record changed.', requestId: 'f5000000-0000-4000-8000-000000000002' } }), { headers: { 'content-type': 'application/json' }, status: 409 }))
      }
      return Promise.resolve(previewApiResponse(input, init))
    })
    const user = userEvent.setup()
    render(<App initialEntries={[`/administrator/compliance/${complianceRecordId}`]} />)

    await user.click(await screen.findByRole('button', { name: /save review decision/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/changed after you opened it/i)
    expect(alert).toHaveFocus()
    expect(screen.queryByText(/action completed/i)).not.toBeInTheDocument()
    await waitFor(() => { expect(detailLoads).toBeGreaterThan(1) })
  })

  it('saves a Worker draft and lets a Manager return submitted time with a reason', async () => {
    const requests: { init?: RequestInit; url: URL }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      requests.push({ ...(init === undefined ? {} : { init }), url: previewRequestUrl(input) })
      return Promise.resolve(previewApiResponse(input, init))
    })
    const user = userEvent.setup()
    const { unmount } = render(<App initialEntries={['/worker/timesheets']} />)

    await user.click(await screen.findByRole('button', { name: /record time/i }))
    await user.click(screen.getByRole('button', { name: /save draft/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/draft was saved/i)
    expect(requests.some(({ init, url }) => init?.method === 'POST' && url.pathname.endsWith('/timesheets'))).toBe(true)
    unmount()

    render(<App initialEntries={['/manager/timesheets']} />)
    const card = (await screen.findByRole('heading', { name: /leila mensah/i })).closest('article')
    if (card === null) throw new Error('Expected a submitted timesheet card.')
    const reject = within(card).getByRole('button', { name: /return for correction/i })
    expect(reject).toBeDisabled()
    await user.type(within(card).getByLabelText(/review note/i), 'Please confirm the fictional finish time.')
    expect(reject).toBeEnabled()
    await user.click(reject)
    expect(await screen.findByRole('status')).toHaveTextContent(/returned for correction/i)
  })

  it('shows the Manager correction note on the rejected list card and detail page, keeps it visible while correcting, and never leaks it into the editable work note', async () => {
    const requests: { init?: RequestInit; url: URL }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      requests.push({ ...(init === undefined ? {} : { init }), url: previewRequestUrl(input) })
      return Promise.resolve(previewApiResponse(input, init))
    })
    const user = userEvent.setup()
    const { unmount } = render(<App initialEntries={['/worker/timesheets']} />)

    const listCard = (await screen.findByRole('heading', { name: 'Maple Ward' })).closest('article')
    if (listCard === null) throw new Error('Expected the rejected timesheet card.')
    expect(within(listCard).getByText(/confirm the synthetic finish time/i)).toBeInTheDocument()
    await user.click(within(listCard).getByRole('link', { name: /review and edit/i }))

    const correction = await screen.findByText('Manager correction requested')
    const correctionPanel = correction.closest('section')
    if (correctionPanel === null) throw new Error('Expected a Manager correction panel.')
    expect(correctionPanel).toHaveTextContent(/confirm the synthetic finish time/i)

    const workNoteField = screen.getByLabelText<HTMLTextAreaElement>(/work note/i)
    expect(workNoteField.value).not.toMatch(/confirm the synthetic finish time/i)
    expect(workNoteField.value).toBe('Synthetic shift completed as scheduled.')

    await user.clear(workNoteField)
    await user.type(workNoteField, 'Corrected synthetic finish time noted.')
    expect(screen.getByText('Manager correction requested')).toBeInTheDocument()
    expect(screen.getByText(/confirm the synthetic finish time/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save correction/i }))
    await waitFor(() => {
      expect(requests.some(({ init, url }) => init?.method === 'PUT' && url.pathname.endsWith('/timesheets/90000000-0000-4000-8000-000000000001'))).toBe(true)
    })
    expect(screen.getByText('Manager correction requested')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /resubmit timesheet/i }))
    await waitFor(() => {
      expect(requests.some(({ init, url }) => init?.method === 'POST' && url.pathname.endsWith('/submit'))).toBe(true)
    })
    unmount()
  })

  it.each(['draft', 'approved'] as const)('does not display a misleading correction panel for a %s timesheet', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = previewRequestUrl(input)
      if (init?.method === undefined && url.pathname.includes('/workers/') && url.pathname.endsWith('/timesheets/90000000-0000-4000-8000-000000000001')) {
        const response = previewApiResponse(input, init)
        const payload = await response.json() as { data: { timesheet: { managerReviewNote: string | null; status: string } } }
        payload.data.timesheet.status = status
        payload.data.timesheet.managerReviewNote = status === 'approved' ? 'Synthetic hours reviewed and approved.' : null
        return new Response(JSON.stringify(payload), { headers: response.headers, status: response.status })
      }
      return previewApiResponse(input, init)
    })
    render(<App initialEntries={['/worker/timesheets/90000000-0000-4000-8000-000000000001']} />)

    await screen.findByRole('heading', { name: 'Timesheet details' })
    expect(screen.queryByText('Manager correction requested')).not.toBeInTheDocument()
  })

  it('refreshes stale state after a safe version conflict without showing fixture success', async () => {
    let listLoads = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = previewRequestUrl(input)
      if (url.pathname.endsWith('/assignment-requests')) listLoads += 1
      if (init?.method === 'POST' && url.pathname.endsWith(`/${assignmentId}/decision`)) {
        return Promise.resolve(new Response(JSON.stringify({ error: { code: 'VERSION_CONFLICT', message: 'The assignment changed.', requestId: 'f5000000-0000-4000-8000-000000000001' } }), { headers: { 'content-type': 'application/json' }, status: 409 }))
      }
      return Promise.resolve(previewApiResponse(input, init))
    })
    const user = userEvent.setup()
    render(<App initialEntries={['/manager/requests']} />)
    await user.click(await screen.findByRole('button', { name: /approve assignment/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/changed after you opened it/i)
    expect(alert).toHaveFocus()
    expect(screen.queryByText(/action completed/i)).not.toBeInTheDocument()
    await waitFor(() => { expect(listLoads).toBeGreaterThan(1) })
  })
})

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  installPreviewApiMock,
  previewApiResponse,
  previewRequestUrl,
} from './test/apiResponses'

const requestId = '78420e18-2a11-4d8a-bd07-baa4cc7b736f'
const shiftId = '70000000-0000-4000-8000-000000000005'

afterEach(() => {
  vi.restoreAllMocks()
})

function apiError(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: { code, message, requestId } }),
    { headers: { 'content-type': 'application/json', 'x-request-id': requestId }, status },
  )
}

describe('worker shift journey', () => {
  it('loads Find shifts through the API and keeps applied filters in the URL', async () => {
    const requestedUrls: URL[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = previewRequestUrl(input)
      requestedUrls.push(url)
      const response = previewApiResponse(input, init)
      if (url.pathname.endsWith('/shifts') && !url.searchParams.has('cursor')) {
        const payload = await response.json() as { meta: { pagination: { nextCursor: string | null } } }
        payload.meta.pagination.nextCursor = 'next-page'
        return new Response(JSON.stringify(payload), { headers: response.headers, status: response.status })
      }
      return response
    })
    const user = userEvent.setup()
    render(<App initialEntries={['/worker/shifts']} />)

    expect(await screen.findByRole('heading', { name: /find shifts/i })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /cedar ward/i })).toBeInTheDocument()
    expect(
      screen.getByText('Fri 28 Aug 2026, 23:30 – Sat 29 Aug 2026, 07:30'),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^from$/i), '2026-08-28')
    await user.selectOptions(screen.getByLabelText(/location/i), '20000000-0000-4000-8000-000000000002')
    await user.click(screen.getByRole('button', { name: /apply filters/i }))

    await waitFor(() => {
      expect(requestedUrls.some((url) => url.searchParams.get('from') === '2026-08-28' && url.searchParams.has('locationId'))).toBe(true)
    })
    await user.click(screen.getByRole('button', { name: /next page/i }))
    await waitFor(() => {
      expect(requestedUrls.some((url) => url.searchParams.get('cursor') === 'next-page')).toBe(true)
    })
    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(screen.getByLabelText(/^from$/i)).toHaveValue('')
  })

  it('shows field-level date validation and a natural empty result', async () => {
    installPreviewApiMock()
    const user = userEvent.setup()
    render(<App initialEntries={['/worker/shifts?from=2026-12-01']} />)

    expect(await screen.findByRole('heading', { name: /no shifts match/i })).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/^from$/i))
    await user.type(screen.getByLabelText(/^from$/i), '2026-09-02')
    await user.type(screen.getByLabelText(/^to$/i), '2026-09-01')
    await user.click(screen.getByRole('button', { name: /apply filters/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/end date must be/i)
    expect(screen.getByLabelText(/^to$/i)).toHaveAttribute('aria-invalid', 'true')
  })

  it('opens a direct detail route and restores focus when confirmation is dismissed', async () => {
    installPreviewApiMock()
    const user = userEvent.setup()
    render(<App initialEntries={[`/worker/shifts/${shiftId}`]} />)

    const requestButton = await screen.findByRole('button', { name: /request this shift/i })
    await user.click(requestButton)
    const dialog = screen.getByRole('dialog', { name: /confirm shift request/i })

    expect(dialog).toHaveTextContent(
      /Fri 28 Aug 2026, 23:30 – Sat 29 Aug 2026, 07:30/,
    )

    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: /close confirm/i })).toHaveFocus()
    })
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /confirm shift request/i })).not.toBeInTheDocument()
    expect(requestButton).toHaveFocus()
  })

  it('prevents duplicate submission and reports a confirmed request', async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    let mutationCount = 0
    let overviewLoads = 0
    let requestHeaders: HeadersInit | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (init?.method === 'POST') {
        mutationCount += 1
        requestHeaders = init.headers
        return new Promise<Response>((resolve) => { resolveRequest = resolve })
      }
      if (previewRequestUrl(input).pathname.endsWith('/overview')) overviewLoads += 1
      return Promise.resolve(previewApiResponse(input, init))
    })
    const user = userEvent.setup()
    render(<App initialEntries={[`/worker/shifts/${shiftId}`]} />)

    await user.click(await screen.findByRole('button', { name: /request this shift/i }))
    const confirm = screen.getByRole('button', { name: /^request shift$/i })
    await user.click(confirm)

    expect(screen.getByRole('button', { name: /requesting shift/i })).toBeDisabled()
    expect(mutationCount).toBe(1)
    expect(new Headers(requestHeaders).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/i)
    resolveRequest?.(previewApiResponse('/api/v1/preview/workers/30000000-0000-4000-8000-000000000001/shift-assignments', { method: 'POST' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/shift confirmed/i)
    expect(screen.getByRole('status')).toHaveTextContent(
      /Fri 28 Aug 2026, 23:30 – Sat 29 Aug 2026, 07:30/,
    )
    expect(screen.getAllByRole('link', { name: /my schedule/i })).toHaveLength(2)
    await waitFor(() => { expect(overviewLoads).toBeGreaterThan(1) })
  })

  it('explains a readiness block without offering a mutation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const response = previewApiResponse(input, init)
      if (!previewRequestUrl(input).pathname.endsWith(`/shifts/${shiftId}`)) return response
      const payload = await response.json() as {
        data: { shift: { eligibility: { detail: string; outcome: string; title: string } } }
      }
      payload.data.shift.eligibility = {
        detail: 'A current readiness requirement is needed before this shift can be requested.',
        outcome: 'blocked',
        title: 'Readiness action required',
      }
      return new Response(JSON.stringify(payload), { headers: response.headers, status: response.status })
    })
    render(<App initialEntries={[`/worker/shifts/${shiftId}`]} />)

    expect(await screen.findByText(/readiness action required/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /readiness required/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /request this shift/i })).not.toBeInTheDocument()
  })

  it('presents a safe conflict and recovers by refreshing availability', async () => {
    let requestAttempts = 0
    let detailLoads = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = previewRequestUrl(input)
      if (url.pathname.endsWith(`/shifts/${shiftId}`)) detailLoads += 1
      if (init?.method === 'POST' && url.pathname.endsWith('/shift-assignments')) {
        requestAttempts += 1
        return Promise.resolve(apiError('SHIFT_FULL', 'This shift no longer has an available place.', 409))
      }
      return Promise.resolve(previewApiResponse(input, init))
    })
    const user = userEvent.setup()
    render(<App initialEntries={[`/worker/shifts/${shiftId}`]} />)

    await user.click(await screen.findByRole('button', { name: /request this shift/i }))
    await user.click(screen.getByRole('button', { name: /^request shift$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer has an available place/i)
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Fri 28 Aug 2026, 23:30 – Sat 29 Aug 2026, 07:30/,
    )
    await user.click(screen.getByRole('button', { name: /try again/i }))

    await waitFor(() => { expect(detailLoads).toBeGreaterThan(1) })
    expect(requestAttempts).toBe(1)
  })

  it('loads schedule filters and cancels an assignment through the API', async () => {
    const requests: { readonly init: RequestInit | undefined; readonly url: URL }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      requests.push({ init, url: previewRequestUrl(input) })
      return Promise.resolve(previewApiResponse(input, init))
    })
    const user = userEvent.setup()
    render(<App initialEntries={['/worker/schedule']} />)

    expect(await screen.findByRole('heading', { name: /my schedule/i })).toBeInTheDocument()
    expect(
      await screen.findByText('Fri 28 Aug 2026, 23:30 – Sat 29 Aug 2026, 07:30'),
    ).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /cancel assignment/i }))
    const dialog = screen.getByRole('dialog', { name: /cancel this assignment/i })
    expect(dialog).toHaveTextContent(
      /Fri 28 Aug 2026, 23:30 – Sat 29 Aug 2026, 07:30/,
    )
    await user.click(within(dialog).getByRole('button', { name: /^cancel assignment$/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(/assignment cancelled/i)
    const cancellation = requests.find(({ url }) => url.pathname.endsWith('/cancel'))
    expect(cancellation?.init?.method).toBe('POST')
    expect(new Headers(cancellation?.init?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/i)

    await user.click(screen.getByRole('button', { name: /under review/i }))
    await waitFor(() => {
      expect(requests.some(({ url }) => url.searchParams.get('status') === 'under_review')).toBe(true)
    })
  })

  it('retries a failed discovery request and recovers without fallback data', async () => {
    let attempts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (previewRequestUrl(input).pathname.endsWith('/shifts')) {
        attempts += 1
        if (attempts === 1) return Promise.resolve(apiError('INVALID_REQUEST', 'Unavailable.', 400))
      }
      return Promise.resolve(previewApiResponse(input, init))
    })
    const user = userEvent.setup()
    render(<App initialEntries={['/worker/shifts']} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('heading', { name: /cedar ward/i })).toBeInTheDocument()
  })
})

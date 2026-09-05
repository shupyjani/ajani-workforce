import { livenessRoute, readinessRoute } from '@ajani/contracts'
import { QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { previewQueryKeys } from './api/previewQueries'
import {
  readinessPollIntervalMilliseconds,
  readinessRequestTimeoutMilliseconds,
  startupCeilingMilliseconds,
} from './hooks/useServiceReadiness'
import { previewApiResponse, previewRequestUrl } from './test/apiResponses'

const requestId = '78420e18-2a11-4d8a-bd07-baa4cc7b736f'
const generatedAt = '2026-08-25T10:30:00.000Z'

function readyResponse(status: 'ready' | 'not_ready' = 'ready'): Response {
  return new Response(
    JSON.stringify({
      requestId,
      service: 'ajani-workforce-api',
      status,
      timestamp: generatedAt,
    }),
    {
      headers: { 'content-type': 'application/json' },
      status: status === 'ready' ? 200 : 503,
    },
  )
}

/**
 * Mirrors how a real `fetch` behaves against a preview API that is still waking: the
 * connection is held open and nothing settles until the caller's own abort signal
 * fires. Without honouring the signal this would hang the test the same way an
 * unbounded request previously hung the status bar.
 */
function neverSettling(init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    })
  })
}

/**
 * Testing Library's own `findBy*` helpers poll on real timers, which never advance
 * while these tests drive the startup clock with fake ones. `vi.waitFor` advances the
 * fake clock, so every asynchronous assertion here goes through these two helpers.
 */
const advanceStepMilliseconds = 250
const advanceBudgetMilliseconds = 120_000

async function waitForText(matcher: RegExp): Promise<void> {
  let elapsed = 0
  while (screen.queryAllByText(matcher).length === 0 && elapsed < advanceBudgetMilliseconds) {
    await vi.advanceTimersByTimeAsync(advanceStepMilliseconds)
    elapsed += advanceStepMilliseconds
  }
  expect(screen.getAllByText(matcher).length).toBeGreaterThan(0)
}

function expectRecoveryNotice(): void {
  const notices = screen.getAllByRole('status')
  expect(
    notices.some((node) => /connection restored/i.test(node.textContent)),
  ).toBe(true)
}

async function waitForRetryButton(): Promise<void> {
  await waitForText(/the preview service is taking longer than expected/i)
  expect(screen.getByRole('button', { name: /retry now/i })).toBeInTheDocument()
}

function countRequests(route: string): number {
  return vi
    .mocked(globalThis.fetch)
    .mock.calls.filter(([input]) => previewRequestUrl(input).pathname === route).length
}

function serviceStatusRegion(): HTMLElement {
  return screen.getByRole('region', { name: /application service status/i })
}

/** Answers `/ready` as ready and everything else from the shared preview fixtures. */
function installReadyApiMock(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (previewRequestUrl(input).pathname === readinessRoute) {
      return Promise.resolve(readyResponse())
    }
    return Promise.resolve(previewApiResponse(input, init))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('preview API wake-up entry points', () => {
  const entryPoints = [
    ['the root landing page', '/'],
    ['a Worker workspace route', '/worker/overview'],
    ['a Manager workspace route', '/manager/operations'],
    ['an Administrator workspace route', '/administrator/compliance'],
    ['a direct deep link', '/worker/timesheets'],
  ] as const

  it.each(entryPoints)(
    'sends exactly one GET /live wake-up request when the browser enters at %s',
    async (_label, entry) => {
      installReadyApiMock()

      render(<App initialEntries={[entry]} />)

      await vi.waitFor(() => {
        expect(countRequests(livenessRoute)).toBe(1)
      })

      const wakeUpCall = vi
        .mocked(globalThis.fetch)
        .mock.calls.find(([input]) => previewRequestUrl(input).pathname === livenessRoute)
      expect(wakeUpCall?.[1]).toMatchObject({ credentials: 'omit' })
    },
  )

  it('still sends only one wake-up request from a workspace route under Strict Mode', async () => {
    installReadyApiMock()

    render(
      <StrictMode>
        <App initialEntries={['/worker/overview']} />
      </StrictMode>,
    )

    await vi.waitFor(() => {
      expect(countRequests(livenessRoute)).toBe(1)
    })
    await vi.advanceTimersByTimeAsync(readinessPollIntervalMilliseconds)
    expect(countRequests(livenessRoute)).toBe(1)
  })

  it('abandons a wake-up request that never settles without surfacing an error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let wakeUpSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const { pathname } = previewRequestUrl(input)
      if (pathname === livenessRoute) {
        wakeUpSignal = init?.signal ?? undefined
        return neverSettling(init)
      }
      if (pathname === readinessRoute) {
        return Promise.resolve(readyResponse())
      }
      return Promise.resolve(previewApiResponse(input, init))
    })

    render(<App initialEntries={['/worker/overview']} />)

    await vi.waitFor(() => {
      expect(wakeUpSignal).toBeDefined()
    })
    expect(wakeUpSignal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(20_000)

    expect(wakeUpSignal?.aborted).toBe(true)
    // A timed-out wake-up is best effort and says nothing about readiness, so the
    // status bar must not report a problem because of it.
    await waitForText(/service connected/i)
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
  })
})

describe('bounded readiness startup', () => {
  it('times out a readiness request that never settles and explains the wait', async () => {
    const readinessSignals: AbortSignal[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (previewRequestUrl(input).pathname === readinessRoute) {
        if (init?.signal) {
          readinessSignals.push(init.signal)
        }
        return neverSettling(init)
      }
      return Promise.resolve(previewApiResponse(input, init))
    })

    render(<App initialEntries={['/worker/overview']} />)

    await vi.waitFor(() => {
      expect(readinessSignals).toHaveLength(1)
    })
    // Nothing is claimed about the service until an attempt has actually failed.
    await waitForText(/connecting to preview/i)
    expect(screen.queryByText(/starting preview service/i)).not.toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(readinessRequestTimeoutMilliseconds)

    expect(readinessSignals[0]?.aborted).toBe(true)
    await waitForText(/starting preview service/i)
    await waitForText(/the first connection can take up to a minute/i)
  })

  it('never runs two readiness requests at once and spaces attempts from completion', async () => {
    const requestDurationMilliseconds = 7_000
    let inFlight = 0
    let peakInFlight = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (previewRequestUrl(input).pathname !== readinessRoute) {
        return Promise.resolve(previewApiResponse(input, init))
      }
      inFlight += 1
      peakInFlight = Math.max(peakInFlight, inFlight)
      return new Promise<Response>((resolve) => {
        window.setTimeout(() => {
          inFlight -= 1
          resolve(readyResponse('not_ready'))
        }, requestDurationMilliseconds)
      })
    })

    render(<App initialEntries={['/worker/overview']} />)
    await vi.advanceTimersByTimeAsync(40_000)

    expect(peakInFlight).toBe(1)
    // Each request outlasts the poll interval. A fixed-rate poller would have issued
    // eight attempts in this window; measuring the gap from completion keeps it to
    // the handful that actually fit.
    const attempts = countRequests(readinessRoute)
    expect(attempts).toBeGreaterThan(1)
    expect(attempts).toBeLessThanOrEqual(4)
  })

  it('reports a longer-than-expected startup with a retry once the ceiling passes', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (previewRequestUrl(input).pathname === readinessRoute) {
        return neverSettling(init)
      }
      return Promise.resolve(previewApiResponse(input, init))
    })

    render(<App initialEntries={['/worker/overview']} />)

    await waitForText(/starting preview service/i)
    expect(screen.queryByRole('button', { name: /retry now/i })).not.toBeInTheDocument()

    await waitForRetryButton()
  })

  it('restarts the bounded cycle immediately when Retry now is pressed', async () => {
    let ready = false
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (previewRequestUrl(input).pathname === readinessRoute) {
        return ready ? Promise.resolve(readyResponse()) : neverSettling(init)
      }
      return Promise.resolve(previewApiResponse(input, init))
    })
    render(<App initialEntries={['/worker/overview']} />)

    await waitForRetryButton()
    const attemptsBeforeRetry = countRequests(readinessRoute)
    ready = true
    fireEvent.click(screen.getByRole('button', { name: /retry now/i }))

    // The retry issues its own attempt rather than waiting for the next poll.
    await vi.waitFor(() => {
      expect(countRequests(readinessRoute)).toBe(attemptsBeforeRetry + 1)
    })
    await waitForText(/service connected/i)
    expect(screen.queryByRole('button', { name: /retry now/i })).not.toBeInTheDocument()
  })

  it('stops polling as soon as readiness succeeds', async () => {
    installReadyApiMock()

    render(<App initialEntries={['/worker/overview']} />)
    await waitForText(/service connected/i)

    await vi.advanceTimersByTimeAsync(startupCeilingMilliseconds * 2)

    expect(countRequests(readinessRoute)).toBe(1)
    // A first connection that simply worked is not a recovery.
    expect(screen.queryByText(/connection restored/i)).not.toBeInTheDocument()
  })

  it('stops polling and issues no further requests after unmount', async () => {
    const readinessSignals: AbortSignal[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (previewRequestUrl(input).pathname === readinessRoute) {
        if (init?.signal) {
          readinessSignals.push(init.signal)
        }
        return neverSettling(init)
      }
      return Promise.resolve(previewApiResponse(input, init))
    })

    const view = render(<App initialEntries={['/worker/overview']} />)
    await vi.waitFor(() => {
      expect(readinessSignals).toHaveLength(1)
    })
    const attemptsAtUnmount = countRequests(readinessRoute)

    view.unmount()
    await vi.advanceTimersByTimeAsync(startupCeilingMilliseconds * 2)

    expect(readinessSignals[0]?.aborted).toBe(true)
    expect(countRequests(readinessRoute)).toBe(attemptsAtUnmount)
  })
})

describe('readiness recovery and preview queries', () => {
  it('refetches the mounted preview query that failed while the service was starting', async () => {
    let serviceUp = false
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const { pathname } = previewRequestUrl(input)
      if (pathname === livenessRoute) {
        return Promise.resolve(previewApiResponse(input, init))
      }
      if (pathname === readinessRoute) {
        return serviceUp
          ? Promise.resolve(readyResponse())
          : Promise.reject(new TypeError('Failed to fetch'))
      }
      return serviceUp
        ? Promise.resolve(previewApiResponse(input, init))
        : Promise.reject(new TypeError('Failed to fetch'))
    })

    render(<App initialEntries={['/worker/overview']} />)

    // The page query exhausts its retries and settles into its error state.
    await vi.advanceTimersByTimeAsync(4_000)
    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
    })
    await waitForText(/starting preview service/i)

    serviceUp = true

    // No visitor action: readiness returning is what heals the panel.
    await waitForText(/service connected/i)
    expectRecoveryNotice()
    await vi.waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /leila/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('scopes the recovery refetch to active preview queries only', async () => {
    const refetchQueries = vi.spyOn(QueryClient.prototype, 'refetchQueries')
    let serviceUp = false
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (previewRequestUrl(input).pathname === readinessRoute) {
        return serviceUp
          ? Promise.resolve(readyResponse())
          : Promise.reject(new TypeError('Failed to fetch'))
      }
      return Promise.resolve(previewApiResponse(input, init))
    })

    render(<App initialEntries={['/worker/overview']} />)
    await waitForText(/starting preview service/i)
    expect(refetchQueries).not.toHaveBeenCalled()

    serviceUp = true
    await waitForText(/service connected/i)

    expect(refetchQueries).toHaveBeenCalledTimes(1)
    // Bounded to the preview key root and to mounted queries: unrelated keys are
    // outside the filter entirely, and inactive queries are excluded by type.
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: previewQueryKeys.all,
      type: 'active',
    })
    const filters = refetchQueries.mock.calls[0]?.[0]
    expect(filters?.queryKey).toEqual(['preview'])
    expect(filters?.type).toBe('active')
  })

  it('does not refetch anything when the first connection simply succeeds', async () => {
    const refetchQueries = vi.spyOn(QueryClient.prototype, 'refetchQueries')
    installReadyApiMock()

    render(<App initialEntries={['/worker/overview']} />)
    await waitForText(/service connected/i)
    await vi.advanceTimersByTimeAsync(readinessPollIntervalMilliseconds)

    expect(refetchQueries).not.toHaveBeenCalled()
  })
})

describe('startup offline behaviour', () => {
  it('stops polling while offline and recovers when the browser comes back online', async () => {
    let online = true
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online)
    installReadyApiMock()

    render(<App initialEntries={['/worker/overview']} />)
    await waitForText(/service connected/i)
    const attemptsWhenConnected = countRequests(readinessRoute)

    online = false
    window.dispatchEvent(new Event('offline'))

    await waitForText(/you appear to be offline/i)
    await vi.advanceTimersByTimeAsync(startupCeilingMilliseconds)
    expect(countRequests(readinessRoute)).toBe(attemptsWhenConnected)

    online = true
    window.dispatchEvent(new Event('online'))

    await waitForText(/service connected/i)
    expect(countRequests(readinessRoute)).toBe(attemptsWhenConnected + 1)
    expectRecoveryNotice()
  })

  it('keeps the offline state when an in-flight readiness request succeeds during the transition', async () => {
    const refetchQueries = vi.spyOn(QueryClient.prototype, 'refetchQueries')
    let online = true
    let settleReadiness: ((response: Response) => void) | undefined
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online)
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (previewRequestUrl(input).pathname === readinessRoute) {
        // Held open so the test controls exactly when the response lands.
        return new Promise<Response>((resolve, reject) => {
          settleReadiness = resolve
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        })
      }
      return Promise.resolve(previewApiResponse(input, init))
    })

    render(<App initialEntries={['/worker/overview']} />)
    await vi.waitFor(() => {
      expect(settleReadiness).toBeDefined()
    })
    const attemptsWhileInFlight = countRequests(readinessRoute)

    // The race: the browser drops, and the readiness response that was already on the
    // wire lands in the same scheduling window — before React can commit the state
    // change and run the effect cleanup. Nothing is awaited between these two lines.
    online = false
    window.dispatchEvent(new Event('offline'))
    settleReadiness?.(
      new Response(
        JSON.stringify({
          requestId,
          service: 'ajani-workforce-api',
          status: 'ready',
          timestamp: generatedAt,
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    )
    await vi.advanceTimersByTimeAsync(0)

    // The late success must not win.
    await waitForText(/you appear to be offline/i)
    expect(screen.queryByText(/service connected/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/connection restored/i)).not.toBeInTheDocument()
    expect(refetchQueries).not.toHaveBeenCalled()

    // It must also not have quietly scheduled more work while offline.
    await vi.advanceTimersByTimeAsync(startupCeilingMilliseconds)
    expect(countRequests(readinessRoute)).toBe(attemptsWhileInFlight)
    expect(screen.getByText(/you appear to be offline/i)).toBeInTheDocument()

    // Coming back online still starts a fresh cycle straight away.
    online = true
    settleReadiness = undefined
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)

    expect(countRequests(readinessRoute)).toBe(attemptsWhileInFlight + 1)
    expect(settleReadiness).toBeDefined()
  })
})

describe('startup accessibility', () => {
  it('carries every startup state in text through a single polite live region', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (previewRequestUrl(input).pathname === readinessRoute) {
        return neverSettling(init)
      }
      return Promise.resolve(previewApiResponse(input, init))
    })

    render(<App initialEntries={['/worker/overview']} />)

    const region = serviceStatusRegion()
    const liveRegions = region.querySelectorAll('[aria-live]')
    expect(liveRegions).toHaveLength(1)
    expect(liveRegions[0]).toHaveAttribute('aria-live', 'polite')

    // The spinner is decorative, so a reduced-motion viewer — who sees it frozen —
    // still gets the whole state from the text.
    expect(region.querySelector('.network-status__icon')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(within(region).getByText(/connecting to preview/i)).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(readinessRequestTimeoutMilliseconds)
    await vi.waitFor(() => {
      expect(within(region).getByText(/starting preview service/i)).toBeInTheDocument()
    })

    // Repeated failed polls must not re-announce the same message.
    const announced = liveRegions[0]?.textContent
    await vi.advanceTimersByTimeAsync(
      readinessPollIntervalMilliseconds + readinessRequestTimeoutMilliseconds,
    )
    expect(liveRegions[0]?.textContent).toBe(announced)
    expect(region.querySelectorAll('[aria-live]')).toHaveLength(1)
  })

  it('exposes Retry now as a keyboard-reachable button', async () => {
    let ready = false
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (previewRequestUrl(input).pathname === readinessRoute) {
        return ready ? Promise.resolve(readyResponse()) : neverSettling(init)
      }
      return Promise.resolve(previewApiResponse(input, init))
    })
    render(<App initialEntries={['/worker/overview']} />)

    await waitForRetryButton()
    const retry = screen.getByRole('button', { name: /retry now/i })

    // A native, enabled button is tab-reachable and is activated by Enter or Space by
    // the browser itself; jsdom does not synthesise that click, so activation is
    // asserted directly once focusability and button semantics are confirmed.
    expect(retry.tagName).toBe('BUTTON')
    expect(retry).toBeEnabled()
    retry.focus()
    expect(retry).toHaveFocus()

    ready = true
    fireEvent.click(retry)

    await waitForText(/service connected/i)
  })
})

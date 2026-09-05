import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readinessRoute } from '@ajani/contracts'
import App from './App'
import { readinessPollIntervalMilliseconds } from './hooks/useServiceReadiness'
import {
  installPreviewApiMock,
  previewApiResponse,
  previewRequestUrl,
} from './test/apiResponses'

afterEach(() => {
  vi.restoreAllMocks()
})

function expectNoRouterFallbackWarning(calls: readonly (readonly unknown[])[]): void {
  const warnings = calls.map((call) => String(call[0]))
  expect(warnings.some((message) => message.includes('does not have an element or Component'))).toBe(false)
  expect(warnings.some((message) => message.includes('No `HydrateFallback` element provided'))).toBe(false)
}

describe('Ajani application shell', () => {
  it('renders the public landing page at the root route instead of redirecting into a role preview', async () => {
    installPreviewApiMock()
    const consoleWarn = vi.spyOn(console, 'warn')
    render(<App initialEntries={['/']} />)

    expect(
      await screen.findByRole('heading', { level: 1, name: /a calmer view of healthcare work/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /good morning, leila/i })).not.toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveFocus()
    expect(document.body).toHaveFocus()
    expect(document.title).toBe('Ajani Workforce | Healthcare workforce operations')
    expectNoRouterFallbackWarning(consoleWarn.mock.calls)
  })

  it('loads a nested route directly without moving focus or emitting a React Router fallback warning', async () => {
    installPreviewApiMock()
    const consoleWarn = vi.spyOn(console, 'warn')
    render(<App initialEntries={['/manager/coverage']} />)

    expect(
      await screen.findByRole('heading', { name: /coverage needs/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveFocus()
    expect(document.body).toHaveFocus()
    expect(document.title).toBe('Coverage needs | Ajani Workforce')
    expectNoRouterFallbackWarning(consoleWarn.mock.calls)
  })

  it('renders the worker route and places the skip link first in keyboard order', async () => {
    installPreviewApiMock()
    const user = userEvent.setup()
    render(<App initialEntries={['/worker/overview']} />)

    expect(
      await screen.findByRole('heading', { name: /good morning, leila/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: /worker preview navigation/i }),
    ).toBeInTheDocument()

    await user.tab()

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus()
  })

  it('opens the mobile drawer and closes it with Escape while restoring focus', async () => {
    installPreviewApiMock()
    const user = userEvent.setup()
    render(<App initialEntries={['/worker/overview']} />)
    const menuButton = screen.getByRole('button', { name: /open navigation menu/i })

    await user.click(menuButton)
    const drawer = screen.getByRole('dialog', { name: /navigation/i })

    expect(drawer).toBeInTheDocument()
    await waitFor(() => {
      expect(within(drawer).getByRole('button', { name: /close navigation/i })).toHaveFocus()
    })

    within(drawer).getByRole('button', { name: /change role preview/i }).focus()
    await user.tab()
    expect(within(drawer).getByRole('button', { name: /close navigation/i })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: /navigation/i })).not.toBeInTheDocument()
    expect(menuButton).toHaveFocus()
  })

  it('changes product perspective without implying authentication', async () => {
    const requestedPaths: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      requestedPaths.push(previewRequestUrl(input).pathname)
      return Promise.resolve(previewApiResponse(input))
    })
    const user = userEvent.setup()
    render(<App initialEntries={['/worker/overview']} />)

    await user.click(
      await screen.findByRole('button', { name: /leila mensah/i }),
    )
    const dialog = screen.getByRole('dialog', { name: /choose a role preview/i })

    expect(within(dialog).getByText(/not sign-in or access control/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: /manager/i }))
    await user.click(within(dialog).getByRole('button', { name: /apply preview/i }))

    expect(
      await screen.findByRole('heading', { name: /operations overview/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: /manager preview navigation/i }),
    ).toBeInTheDocument()
    expect(
      requestedPaths.some((path) => path.includes('/managers/')),
    ).toBe(true)
  })

  it('shows unclipped decorative initials for every role-preview persona', async () => {
    installPreviewApiMock()
    const user = userEvent.setup()
    render(<App initialEntries={['/worker/overview']} />)

    async function openDialogFor(
      displayName: string,
      initials: string,
    ): Promise<HTMLElement> {
      await user.click(
        await screen.findByRole('button', {
          name: new RegExp(displayName, 'i'),
        }),
      )
      const dialog = screen.getByRole('dialog', {
        name: /choose a role preview/i,
      })
      const avatar = dialog.querySelector<HTMLElement>('.account-avatar')

      expect(avatar).not.toBeNull()
      expect(avatar).toHaveTextContent(initials)
      expect(avatar).toHaveAttribute('aria-hidden', 'true')
      expect(within(dialog).getByText(displayName)).toBeVisible()

      return dialog
    }

    let dialog = await openDialogFor('Leila Mensah', 'LM')
    await user.click(within(dialog).getByRole('radio', { name: /manager/i }))
    await user.click(within(dialog).getByRole('button', { name: /apply preview/i }))

    dialog = await openDialogFor('Imani Dube', 'ID')
    await user.click(
      within(dialog).getByRole('radio', { name: /administrator/i }),
    )
    await user.click(within(dialog).getByRole('button', { name: /apply preview/i }))

    dialog = await openDialogFor('Malik Adebayo', 'MA')
    await user.click(
      within(dialog).getByRole('button', { name: /close choose a role preview/i }),
    )
  })

  it('starts a new role route at the top and moves focus to main content', async () => {
    installPreviewApiMock()
    const consoleWarn = vi.spyOn(console, 'warn')
    const user = userEvent.setup()
    render(<App initialEntries={['/worker/overview']} />)
    const scrollContainer = document.scrollingElement ?? document.documentElement
    scrollContainer.scrollTop = 640

    await user.click(
      await screen.findByRole('button', { name: /leila mensah/i }),
    )
    const dialog = screen.getByRole('dialog', { name: /choose a role preview/i })
    await user.click(within(dialog).getByRole('radio', { name: /administrator/i }))
    await user.click(within(dialog).getByRole('button', { name: /apply preview/i }))

    expect(
      await screen.findByRole('heading', { name: /compliance review/i }),
    ).toBeInTheDocument()
    expect(document.title).toBe('Compliance review | Ajani Workforce')
    expect(scrollContainer.scrollTop).toBe(0)
    await waitFor(() => {
      expect(screen.getByRole('main')).toHaveFocus()
    })
    expectNoRouterFallbackWarning(consoleWarn.mock.calls)
  })

  it('keeps the badge, drawer and notification filters consistent after marking all as read', async () => {
    installPreviewApiMock()
    const user = userEvent.setup()
    render(<App initialEntries={['/worker/overview']} />)

    const notificationButton = await screen.findByRole('button', {
      name: /open notifications, 2 unread/i,
    })
    await user.click(notificationButton)

    const panel = screen.getByRole('dialog', { name: /notifications/i })
    expect(within(panel).getAllByText('New')).toHaveLength(2)

    await user.click(
      within(panel).getByRole('button', { name: /mark all as read/i }),
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      /notifications marked as read for this session/i,
    )
    expect(
      screen.getByRole('button', { name: /open notifications, 0 unread/i }),
    ).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { name: /no unread notifications/i })).toBeInTheDocument()
    expect(within(panel).queryByText('New')).not.toBeInTheDocument()

    await user.click(
      within(panel).getByRole('link', { name: /view notification history/i }),
    )
    expect(
      await screen.findByRole('heading', { name: /^notifications$/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Shift detail updated')).toBeInTheDocument()
    expect(screen.getByText('Readiness review approaching')).toBeInTheDocument()
    expect(screen.getByText('Profile check complete')).toBeInTheDocument()
    expect(screen.queryByText('New')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^unread$/i }))
    expect(
      await screen.findByRole('heading', { name: /no unread notifications/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^archived$/i }))
    expect(await screen.findByText('Shift detail updated')).toBeInTheDocument()
    expect(screen.getByText('Readiness review approaching')).toBeInTheDocument()
    expect(screen.getByText('Profile check complete')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /^overview/i }))
    await user.click(screen.getByRole('link', { name: /^notifications/i }))
    await user.click(screen.getByRole('button', { name: /^unread$/i }))

    expect(
      await screen.findByRole('heading', { name: /no unread notifications/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /open notifications, 0 unread/i }),
    ).toBeInTheDocument()
  })

  it('keeps session read state separate when switching synthetic recipients', async () => {
    installPreviewApiMock()
    const user = userEvent.setup()
    render(<App initialEntries={['/worker/overview']} />)

    await user.click(
      await screen.findByRole('button', {
        name: /open notifications, 2 unread/i,
      }),
    )
    await user.click(
      within(screen.getByRole('dialog', { name: /notifications/i })).getByRole(
        'button',
        { name: /mark all as read/i },
      ),
    )

    await user.click(screen.getByRole('button', { name: /leila mensah/i }))
    let dialog = screen.getByRole('dialog', { name: /choose a role preview/i })
    await user.click(within(dialog).getByRole('radio', { name: /manager/i }))
    await user.click(within(dialog).getByRole('button', { name: /apply preview/i }))

    expect(
      await screen.findByRole('button', { name: /open notifications, 1 unread/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /imani dube/i }))
    dialog = screen.getByRole('dialog', { name: /choose a role preview/i })
    await user.click(within(dialog).getByRole('radio', { name: /worker/i }))
    await user.click(within(dialog).getByRole('button', { name: /apply preview/i }))

    const workerNotificationButton = await screen.findByRole('button', {
      name: /open notifications, 0 unread/i,
    })
    await user.click(workerNotificationButton)
    expect(
      within(screen.getByRole('dialog', { name: /notifications/i })).getByRole(
        'heading',
        { name: /no unread notifications/i },
      ),
    ).toBeInTheDocument()
  })

  it('shows useful field validation and confirms a successful preview interaction', async () => {
    installPreviewApiMock()
    const user = userEvent.setup()
    render(<App initialEntries={['/manager/operations']} />)

    await user.click(screen.getByRole('button', { name: /request coverage review/i }))
    const dialog = screen.getByRole('dialog', { name: /request a coverage review/i })
    await user.click(within(dialog).getByRole('button', { name: /validate request/i }))

    const note = within(dialog).getByRole('textbox', { name: /coverage note/i })
    expect(note).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/at least 12 characters/i)

    await user.type(note, 'Review the Birch Ward overnight gap.')
    await user.click(within(dialog).getByRole('button', { name: /validate request/i }))

    expect(screen.getByRole('status')).toHaveTextContent(/preview request validated/i)
    expect(screen.queryByRole('dialog', { name: /request a coverage review/i })).not.toBeInTheDocument()
  })

  it('preserves the accessible native priority selector', async () => {
    installPreviewApiMock()
    const user = userEvent.setup()
    render(<App initialEntries={['/manager/operations']} />)

    await user.click(screen.getByRole('button', { name: /request coverage review/i }))
    const priority = within(
      screen.getByRole('dialog', { name: /request a coverage review/i }),
    ).getByRole('combobox', { name: /priority/i })

    expect(priority.tagName).toBe('SELECT')
    expect(priority).toHaveValue('standard')
    expect(within(priority).getByRole('option', { name: /standard review/i })).toBeInTheDocument()
    expect(within(priority).getByRole('option', { name: /time-sensitive/i })).toBeInTheDocument()
  })

  it('distinguishes repeated care-area names by their relational facilities', async () => {
    installPreviewApiMock()
    const operations = render(<App initialEntries={['/manager/operations']} />)
    const snapshot = await screen.findByRole('region', { name: /coverage snapshot/i })

    expect(within(snapshot).getAllByText('Short stay unit')).toHaveLength(2)
    expect(within(snapshot).getByText('Willowmere Community Hospital')).toBeInTheDocument()
    expect(within(snapshot).getByText('Harbourlight Care Centre')).toBeInTheDocument()

    operations.unmount()
    render(<App initialEntries={['/manager/coverage']} />)
    const rowHeaders = await screen.findAllByRole('rowheader')

    expect(rowHeaders).toHaveLength(2)
    expect(rowHeaders[0]).toHaveAccessibleName(
      /short stay unit\. facility: willowmere community hospital/i,
    )
    expect(rowHeaders[1]).toHaveAccessibleName(
      /short stay unit\. facility: harbourlight care centre/i,
    )
  })

  it('presents loading, error recovery and empty states in their routes', async () => {
    let coverageAttempts = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (previewRequestUrl(input).pathname.includes('/coverage')) {
        coverageAttempts += 1
        if (coverageAttempts === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: 'INVALID_REQUEST',
                  message: 'The preview request could not be completed.',
                  requestId: '78420e18-2a11-4d8a-bd07-baa4cc7b736f',
                },
              }),
              { headers: { 'content-type': 'application/json' }, status: 400 },
            ),
          )
        }
      }
      return Promise.resolve(previewApiResponse(input))
    })
    const user = userEvent.setup()
    render(<App initialEntries={['/manager/coverage']} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /temporarily unavailable/i,
    )
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findAllByText(/short stay unit/i)).toHaveLength(2)

  })

  it('presents a loading state while preview data is pending', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (previewRequestUrl(input).pathname.includes('/coverage')) {
        return new Promise<Response>(() => undefined)
      }
      return Promise.resolve(previewApiResponse(input))
    })
    render(<App initialEntries={['/manager/coverage']} />)

    expect(
      screen.getByRole('status', { name: /loading preview data/i }),
    ).toBeInTheDocument()
  })

  it('presents an offline query state without synthetic fallback data', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    installPreviewApiMock()
    render(<App initialEntries={['/manager/coverage']} />)

    expect(screen.getAllByText(/you appear to be offline/i).length).toBeGreaterThan(0)
  })

  it('renders a purposeful not-found route', () => {
    installPreviewApiMock()
    render(<App initialEntries={['/outside-preview']} />)

    expect(screen.getByRole('heading', { name: /outside the preview/i })).toBeInTheDocument()
    expect(document.title).toBe('Page not found | Ajani Workforce')
    expect(screen.getByRole('link', { name: /return to overview/i })).toHaveAttribute(
      'href',
      '/worker/overview',
    )
  })

  it('recovers from an unavailable API without logging an expected network error', async () => {
    vi.useFakeTimers()
    let readinessAttempts = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (previewRequestUrl(input).pathname === readinessRoute) {
        readinessAttempts += 1
        if (readinessAttempts === 1) {
          return Promise.reject(new TypeError('Failed to fetch'))
        }
      }
      return Promise.resolve(previewApiResponse(input))
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<App initialEntries={['/worker/overview']} />)

    // The first readiness attempt fails, so the wait is explained rather than left
    // on the opening message.
    await vi.waitFor(() => {
      expect(screen.getByText(/starting preview service/i)).toBeInTheDocument()
    })
    expect(readinessAttempts).toBe(1)

    // The bounded poll recovers on its own, with no visitor action.
    await vi.advanceTimersByTimeAsync(readinessPollIntervalMilliseconds)

    await vi.waitFor(() => {
      expect(screen.getByText(/service connected/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('status')).toHaveTextContent(/connection restored/i)
    expect(readinessAttempts).toBe(2)
    expect(fetchMock).toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

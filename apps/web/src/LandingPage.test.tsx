import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Ajani Workforce landing page', () => {
  it('presents company attribution, pre-production status and synthetic-data disclosure', () => {
    render(<App initialEntries={['/']} />)

    expect(
      screen.getByRole('heading', { level: 1, name: /a calmer view of healthcare work/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/an ajani healthcare product/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/pre-production product/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/synthetic preview data/i)).toBeInTheDocument()
    expect(
      screen.getByText(/every organisation, person and record shown in the previews below is\s*synthetic/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/does not represent a currently deployed healthcare service/i),
    ).toBeInTheDocument()
  })

  it('exposes the expected landmarks and a single top-level heading', () => {
    render(<App initialEntries={['/']} />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('links every role journey and the closing call to action to their real routes', () => {
    render(<App initialEntries={['/']} />)

    const heroRegion = screen.getByRole('region', { name: /a calmer view of healthcare work/i })
    expect(
      within(heroRegion).getByRole('link', { name: /preview the worker experience/i }),
    ).toHaveAttribute('href', '/worker/overview')

    const rolesRegion = screen.getByRole('region', { name: /one product, three ways to see it/i })
    expect(
      within(rolesRegion).getByRole('link', { name: /preview the worker experience/i }),
    ).toHaveAttribute('href', '/worker/overview')
    expect(
      within(rolesRegion).getByRole('link', { name: /preview the manager experience/i }),
    ).toHaveAttribute('href', '/manager/operations')
    expect(
      within(rolesRegion).getByRole('link', { name: /preview the administrator experience/i }),
    ).toHaveAttribute('href', '/administrator/compliance')

    const closingRegion = screen.getByRole('region', {
      name: /preview the experience for each role/i,
    })
    expect(within(closingRegion).getByRole('link', { name: /worker preview/i })).toHaveAttribute(
      'href',
      '/worker/overview',
    )
    expect(within(closingRegion).getByRole('link', { name: /manager preview/i })).toHaveAttribute(
      'href',
      '/manager/operations',
    )
    expect(
      within(closingRegion).getByRole('link', { name: /administrator preview/i }),
    ).toHaveAttribute('href', '/administrator/compliance')
  })

  it('describes genuine implemented capabilities rather than roadmap ideas', () => {
    render(<App initialEntries={['/']} />)

    expect(
      screen.getByRole('heading', { name: /genuine capability, not a roadmap slide/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Shift discovery, requests and availability')).toBeInTheDocument()
    expect(
      screen.getByText('Manager operations, capacity and assignment decisions'),
    ).toBeInTheDocument()
    expect(screen.getByText('Compliance readiness and administrative records')).toBeInTheDocument()
    expect(screen.getByText('Timesheet and activity visibility')).toBeInTheDocument()
  })

  it('places the skip link first in keyboard order', async () => {
    const user = userEvent.setup()
    render(<App initialEntries={['/']} />)

    await user.tab()

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus()
  })

  it('opens and closes the mobile menu, restoring focus to the trigger', async () => {
    const user = userEvent.setup()
    render(<App initialEntries={['/']} />)
    const menuButton = screen.getByRole('button', { name: /open menu/i })

    await user.click(menuButton)
    const menu = screen.getByRole('dialog', { name: /^menu$/i })

    expect(within(menu).getByRole('link', { name: /^product$/i })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: /^roles$/i })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: /^capabilities$/i })).toBeInTheDocument()
    await waitFor(() => {
      expect(within(menu).getByRole('button', { name: /close menu/i })).toHaveFocus()
    })

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: /^menu$/i })).not.toBeInTheDocument()
    expect(menuButton).toHaveFocus()
  })
})

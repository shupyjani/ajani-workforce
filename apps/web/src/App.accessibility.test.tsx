import { render } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { installPreviewApiMock } from './test/apiResponses'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Ajani application accessibility', () => {
  it.each([
    ['/', 'public landing page'],
    ['/worker/overview', 'worker overview'],
    ['/worker/shifts', 'worker shift discovery'],
    ['/worker/shifts/70000000-0000-4000-8000-000000000005', 'worker shift detail'],
    ['/worker/schedule', 'worker schedule'],
    ['/manager/coverage', 'responsive coverage table'],
    ['/manager/requests', 'manager assignment review'],
    ['/manager/shifts/70000000-0000-4000-8000-000000000019', 'manager shift detail'],
    ['/administrator/compliance', 'administrator compliance'],
    ['/administrator/compliance/d0000000-0000-4000-8000-000000000012', 'compliance record review'],
    ['/worker/timesheets', 'worker timesheets'],
    ['/manager/timesheets', 'manager timesheet approvals'],
    ['/administrator/timesheets', 'administrator timesheet oversight'],
  ])('has no detectable accessibility violations on the %s route', async (route) => {
    installPreviewApiMock()
    const { container } = render(<App initialEntries={[route]} />)

    await new Promise((resolve) => window.setTimeout(resolve, 0))

    const results = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    })

    expect(results.violations).toEqual([])
  })
})

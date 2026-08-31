import { expect, test as base, type Page } from '@playwright/test'

// Set by scripts/run-e2e.mjs to the same origin it starts the API on, so the port
// is defined in exactly one place. The fallback matches that script's own default
// and only applies when Playwright is invoked directly, without the wrapper.
const apiOrigin = process.env['AJANI_E2E_API_ORIGIN'] ?? 'http://127.0.0.1:43117'

// Must match apps/api/src/app.ts's `testOnlyResetPreviewRoute`. Only registered on
// the API when it runs with NODE_ENV=test against a PGlite connection.
const resetPreviewUrl = `${apiOrigin}/internal/test/reset-preview`

export async function resetSyntheticPreviewBaseline(): Promise<void> {
  let response: Response
  try {
    response = await fetch(resetPreviewUrl, { method: 'POST' })
  } catch (error) {
    throw new Error(
      `Could not reach the test-only preview reset route at ${resetPreviewUrl} before running the serial browser journey. Is the API running with NODE_ENV=test against PGlite?`,
      { cause: error },
    )
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Failed to reset the synthetic preview baseline before running the serial browser journey (status ${String(response.status)} from ${resetPreviewUrl}). ${body}`.trim(),
    )
  }
}

export const test = base.extend<{ runtimeErrorGuard: undefined }>({
  runtimeErrorGuard: [
    async ({ page }, use) => {
      const runtimeErrors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') {
          runtimeErrors.push(`console: ${message.text()}`)
        }
      })
      page.on('pageerror', (error) => {
        runtimeErrors.push(`pageerror: ${error.message}`)
      })

      await use(undefined)
      expect(runtimeErrors, 'unexpected browser runtime errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export async function expectNoDocumentOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true)
}

export async function expectMainFocused(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('main-content')
}

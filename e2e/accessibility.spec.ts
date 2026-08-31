import { AxeBuilder } from '@axe-core/playwright'
import { expect, expectNoDocumentOverflow, test } from './fixtures.js'

const representativeRoutes = [
  ['/worker/overview', 'Good morning, Leila.'],
  ['/manager/operations', 'Operations overview'],
  ['/administrator/compliance', 'Compliance review'],
] as const

for (const [route, heading] of representativeRoutes) {
  test(`${heading} passes the automated accessibility gate`, async ({ page }) => {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('navigation').first()).toBeVisible()
    await expectNoDocumentOverflow(page)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
}

test('the public landing page passes the automated accessibility gate', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: 'A calmer view of healthcare work.' }),
  ).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()
  await expectNoDocumentOverflow(page)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})

test('visible focus and reduced-motion preferences remain effective', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/worker/overview')
  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skipLink).toBeFocused()
  await expect(skipLink).toHaveCSS('outline-style', 'solid')
  expect(
    await page.evaluate(() =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  ).toBe(true)
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto')
})

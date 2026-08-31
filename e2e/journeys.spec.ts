import {
  expect,
  expectMainFocused,
  expectNoDocumentOverflow,
  resetSyntheticPreviewBaseline,
  test,
} from './fixtures.js'

test.describe.configure({ mode: 'serial' })

// This suite is one cumulative scenario: later tests act on state earlier tests
// created (e.g. a Manager test approves the assignment request an earlier Worker
// test made). `beforeAll` runs once per complete attempt at this file — including
// a fresh attempt after a CI retry of the serial group — and never between the
// individual tests within one attempt, so the baseline resets exactly once per
// attempt without disturbing the intended cumulative dependencies.
test.beforeAll(async () => {
  await resetSyntheticPreviewBaseline()
})

test('the initial homepage load and a direct deep link do not move focus, but a client-side navigation does', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: 'A calmer view of healthcare work.' }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
  await expectNoDocumentOverflow(page)

  await page.goto('/worker/overview')
  await expect(page.getByRole('heading', { level: 1, name: 'Good morning, Leila.' })).toBeVisible()
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)

  await page.goto('/manager/coverage')
  await expect(page.getByRole('heading', { level: 1, name: 'Coverage needs' })).toBeVisible()
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)

  await page.goto('/worker/overview')
  await page.getByRole('link', { name: /Find shifts/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Find shifts' })).toBeVisible()
  await expectMainFocused(page)
})

test('back and forward navigation restore the established focus and scroll behaviour', async ({
  page,
}) => {
  await page.goto('/worker/shifts')
  await expect(page.getByRole('heading', { level: 1, name: 'Find shifts' })).toBeVisible()
  await page.evaluate(() => {
    window.scrollTo(0, 200)
  })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)

  const shiftCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Cedar House' }) })
  await shiftCard.getByRole('link', { name: 'View shift' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Shift details' })).toBeVisible()
  await expectMainFocused(page)

  await page.goBack()
  await expect(page.getByRole('heading', { level: 1, name: 'Find shifts' })).toBeVisible()
  await expectMainFocused(page)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)

  await page.goForward()
  await expect(page.getByRole('heading', { level: 1, name: 'Shift details' })).toBeVisible()
  await expectMainFocused(page)
})

test('shared preview behavior supports keyboard, dialogs, roles and notifications', async ({
  page,
}) => {
  await page.goto('/worker/overview')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Good morning, Leila.' }),
  ).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Worker preview navigation' })).toBeVisible()
  await expectNoDocumentOverflow(page)

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await page.keyboard.press('Enter')

  const accountButton = page.getByRole('button', { name: /Leila Mensah.*Worker preview/i })
  await accountButton.focus()
  await page.keyboard.press('Space')
  const roleDialog = page.getByRole('dialog', { name: 'Choose a role preview' })
  await expect(roleDialog).toBeVisible()
  await expect(
    roleDialog.getByRole('button', { name: 'Close choose a role preview' }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(accountButton).toBeFocused()

  const notificationsButton = page.getByRole('button', { name: /open notifications/i })
  await notificationsButton.click()
  const notificationDialog = page.getByRole('dialog', { name: 'Notifications' })
  await notificationDialog.getByRole('button', { name: 'Mark all as read' }).click()
  await expect(page.getByRole('status')).toContainText('Notifications marked as read')
  await page.keyboard.press('Escape')
  await expect(notificationsButton).toHaveAccessibleName(/0 unread/i)

  await accountButton.click()
  await roleDialog.getByRole('radio', { name: /Manager/ }).check()
  await roleDialog.getByRole('button', { name: 'Apply preview' }).click()
  await expect(page).toHaveURL(/\/manager\/operations$/)
  await expectMainFocused(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Operations overview' })).toBeVisible()
})

test('worker discovers an inclusive date range, requests a shift and sees schedule state', async ({
  page,
}) => {
  await page.goto('/worker/shifts')
  await expect(page.getByRole('heading', { level: 1, name: 'Find shifts' })).toBeVisible()
  await page.getByLabel('From').fill('2026-08-29')
  await page.getByLabel('To').fill('2026-08-29')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page).toHaveURL(/from=2026-08-29.*to=2026-08-29/)

  const shiftCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Cedar House' }) })
  await shiftCard.getByRole('link', { name: 'View shift' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Shift details' })).toBeVisible()

  const requestButton = page.getByRole('button', { name: 'Request this shift' })
  await requestButton.click()
  const requestDialog = page.getByRole('dialog', { name: 'Confirm shift request' })
  await expect(requestDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(requestButton).toBeFocused()
  await requestButton.focus()
  await page.keyboard.press('Space')
  await requestDialog.getByRole('button', { name: 'Request shift' }).click()
  await expect(page.getByRole('link', { name: 'View in My schedule' })).toBeVisible()
  await page.getByRole('link', { name: 'View in My schedule' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'My schedule' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cedar House' })).toBeVisible()
  await expectNoDocumentOverflow(page)
})

test('worker saves and submits time and can view a returned outcome', async ({ page }) => {
  await page.goto('/worker/timesheets')
  await expect(page.getByRole('heading', { level: 1, name: 'My timesheets' })).toBeVisible()
  const lateShiftCard = page
    .getByRole('article')
    .filter({ hasText: 'Maple late service' })
  await lateShiftCard.getByRole('button', { name: 'Record time' }).click()
  await page.getByLabel('Work note').fill('Synthetic shift completed for browser verification.')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('status')).toContainText('saved as a draft')

  const draftCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Maple late service' }) })
  await draftCard.getByRole('link', { name: 'Review and edit' }).click()
  await page.getByRole('button', { name: 'Submit timesheet' }).click()
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible()

  await page.getByRole('link', { exact: true, name: 'My timesheets' }).click()
  await page.getByLabel('Filter status').selectOption({ label: 'Rejected' })
  const returnedCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Maple Ward' }) })
  await returnedCard.getByRole('link', { name: 'Review and edit' }).click()

  // Scoped to the timesheet detail card: an unscoped `getByText('Rejected')` also
  // matches the (non-visible) `<option>Rejected</option>` still present in the
  // "Filter status" select's DOM, which is a strict-mode ambiguity, not a real UI
  // ambiguity. Scoping to the card containing the "Maple Ward" heading identifies
  // only the visible status badge.
  const timesheetCard = page
    .locator('section.card')
    .filter({ has: page.getByRole('heading', { name: 'Maple Ward' }) })
  await expect(timesheetCard.getByText('Rejected', { exact: true })).toBeVisible()
  await expect(page.getByText(/confirm the synthetic finish time/i)).toBeVisible()
})

test('manager reviews operations, protects an action-due request and approves an eligible request', async ({
  page,
}) => {
  await page.goto('/manager/operations')
  await expect(page.getByRole('heading', { level: 1, name: 'Operations overview' })).toBeVisible()
  await page.getByRole('link', { name: /^Coverage / }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Coverage needs' })).toBeVisible()
  await page.getByRole('link', { name: /^Assignment requests / }).click()

  const blockedRequest = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Theo Adeyemi' }) })
  const blockedApproval = blockedRequest.getByRole('button', {
    name: 'Approve assignment',
  })
  await expect(blockedApproval).toHaveAttribute('aria-disabled', 'true')
  await blockedApproval.focus()
  await expect(blockedApproval).toBeFocused()
  await blockedApproval.press('Enter')
  await expect(blockedRequest).toBeVisible()

  const eligibleRequest = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Leila Mensah' }) })
  await eligibleRequest.getByRole('button', { name: 'Approve assignment' }).click()
  await expect(page.getByRole('status')).toContainText('assignment is confirmed')
})

test('manager rejects invalid dates, creates and publishes a valid future shift', async ({
  page,
}) => {
  await page.goto('/manager/shifts/new')
  await expect(page.getByRole('heading', { level: 1, name: 'Create a shift' })).toBeVisible()
  await page.getByLabel('Care area').fill('Release readiness ward')
  await page.getByLabel('Starts').fill('2026-09-15T15:00')
  await page.getByLabel('Ends').fill('2026-09-15T14:00')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'Check the highlighted fields' }),
  ).toContainText('Shift end must be after shift start.')

  await page.getByLabel('Ends').fill('2026-09-15T23:00')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page).toHaveURL(/\/manager\/shifts\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'Release readiness ward' })).toBeVisible()
  await page.getByRole('button', { name: 'Publish shift' }).click()
  await expect(page.getByText('Open', { exact: true })).toBeVisible()
})

test('manager completes a submitted timesheet decision', async ({ page }) => {
  await page.goto('/manager/timesheets')
  await expect(page.getByRole('heading', { level: 1, name: 'Timesheet approvals' })).toBeVisible()
  const submitted = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Mina Okoro' }) })
  await submitted.getByRole('button', { name: 'Approve timesheet' }).click()
  await expect(page.getByRole('status')).toContainText('approved and terminal')
})

test('administrator filters and decides reviewing compliance while terminal states stay read-only', async ({
  page,
}) => {
  await page.goto('/administrator/compliance')
  await expect(page.getByRole('heading', { level: 1, name: 'Compliance review' })).toBeVisible()
  const filter = page.getByLabel('Filter record status')
  await filter.selectOption('reviewing')
  await page.getByRole('link', { name: 'Review record' }).click()
  await expect(page.getByRole('heading', { name: 'Record review decision' })).toBeVisible()
  await page.getByRole('button', { name: 'Save review decision' }).click()
  await expect(page.getByRole('status')).toContainText(
    'compliance record is current and readiness was recalculated',
  )

  for (const status of ['current', 'information_required', 'rejected']) {
    await page.goto(`/administrator/compliance`)
    await page.getByLabel('Filter record status').selectOption(status)
    await page.getByRole('link', { name: 'Review record' }).first().click()
    await expect(page.getByRole('button', { name: 'Save review decision' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /review|information|action/i }).last()).toBeVisible()
  }

  await page.goto('/administrator/timesheets')
  await expect(page.getByRole('heading', { level: 1, name: 'Timesheet oversight' })).toBeVisible()
  await expect(page.getByText('Oversight is read-only')).toBeVisible()
})

test('compliance record review renders without horizontal overflow at a mobile viewport', async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 })
  await page.goto('/administrator/compliance')
  await expect(page.getByRole('heading', { level: 1, name: 'Compliance review' })).toBeVisible()
  await expectNoDocumentOverflow(page)
  await page.getByLabel('Filter record status').selectOption('information_required')
  await page.getByRole('link', { name: 'Review record' }).first().click()
  await expect(page.getByRole('button', { name: 'Save review decision' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /further information already requested/i })).toBeVisible()
  await expectNoDocumentOverflow(page)
})

test('the landing page previews each role from its real route and reflows on mobile without overflow', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: 'A calmer view of healthcare work.' }),
  ).toBeVisible()
  await expect(page.getByText('An Ajani Healthcare product').first()).toBeVisible()
  await expect(page.getByText('Pre-production product').first()).toBeVisible()

  const rolesRegion = page.getByRole('region', { name: 'One product, three ways to see it.' })
  await rolesRegion.getByRole('link', { name: 'Preview the Manager experience' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Operations overview' })).toBeVisible()

  await page.setViewportSize({ height: 844, width: 390 })
  await page.goto('/')
  await expectNoDocumentOverflow(page)

  const menuButton = page.getByRole('button', { name: 'Open menu' })
  await menuButton.click()
  const menu = page.getByRole('dialog', { name: 'Menu' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Roles' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menuButton).toBeFocused()
})

test('mobile preview reflows without horizontal overflow or route-transition movement', async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 })
  await page.goto('/worker/overview')
  await expectNoDocumentOverflow(page)
  const initialX = await page.locator('#main-content').evaluate((element) =>
    element.getBoundingClientRect().x,
  )
  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  const navigationDialog = page.getByRole('dialog', { name: 'Navigation' })
  await navigationDialog.getByRole('link', { name: /Find shifts/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Find shifts' })).toBeVisible()
  await expectMainFocused(page)
  await expectNoDocumentOverflow(page)
  const destinationX = await page.locator('#main-content').evaluate((element) =>
    element.getBoundingClientRect().x,
  )
  expect(Math.abs(destinationX - initialX)).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1)
})

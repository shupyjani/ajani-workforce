import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const webOrigin = 'http://127.0.0.1:43118'

export default defineConfig({
  expect: { timeout: 8_000 },
  forbidOnly: Boolean(process.env['CI']),
  fullyParallel: false,
  outputDir:
    process.env['PLAYWRIGHT_OUTPUT_DIR'] ??
    join(tmpdir(), 'ajani-playwright-results'),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  reporter: [['list']],
  retries: process.env['CI'] === undefined ? 0 : 1,
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: webOrigin,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  workers: 1,
})

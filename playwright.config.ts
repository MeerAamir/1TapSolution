import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests run against the full local stack started by
 * `node tests/e2e/stack/start.mjs` (see docs/TESTING.md).
 * Set E2E_CHROMIUM to use a specific Chromium binary instead of Playwright's.
 */
const executablePath = process.env.E2E_CHROMIUM || undefined
const launchOptions = executablePath ? { executablePath, args: ['--no-sandbox', '--disable-gpu'] } : {}

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8788',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions }, testIgnore: '**/mobile.spec.ts' },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions }, testMatch: '**/mobile.spec.ts' },
  ],
})

import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin } from './fixtures'

/** Scenario 20: pages render correctly on a phone-sized screen. */
const SHOTS = process.env.E2E_SCREENSHOT_DIR

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'page should not scroll sideways').toBeLessThanOrEqual(1)
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

const PUBLIC_PAGES: Array<[string, string, RegExp | string]> = [
  ['home', '/', 'Everything your business needs. One scan away.'],
  ['qr-profile', '/q/demoCafe01?preview=1', 'Chinar Leaf Café (Demo)'],
  ['qr-landing', '/q/demoStore01?preview=1', 'Loom & Thread (Demo)'],
  ['qr-card', '/q/demoCard01?preview=1', 'Aisha Rahman'],
  ['business', '/b/demo-northstar-academy', 'Northstar Academy (Demo)'],
  ['missing', '/q/doesNotExist1', 'This QR code is not recognised'],
  ['privacy', '/privacy', 'Privacy policy'],
]

for (const [name, path, heading] of PUBLIC_PAGES) {
  test(`${name} fits a phone screen`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await noHorizontalScroll(page)
    await shot(page, `mobile-${name}`)
  })
}

test('touch targets on the business page are at least 44px tall', async ({ page }) => {
  await page.goto('/q/demoCafe01?preview=1')
  const nav = page.getByRole('navigation', { name: 'Contact' })
  for (const link of await nav.getByRole('link').all()) {
    const box = await link.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
})

test('mobile navigation menu opens and links work', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Features' }).click()
  await expect(page.getByRole('heading', { name: 'A dynamic QR code is a link you control' })).toBeInViewport()
})

test('dashboard is usable on a phone', async ({ page }) => {
  await loginAsAdmin(page)
  await noHorizontalScroll(page)
  await shot(page, 'mobile-admin-overview')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('link', { name: 'Create QR code' }).first().click()
  await expect(page.getByRole('heading', { name: 'Create a QR code' })).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, 'mobile-admin-qr')
})

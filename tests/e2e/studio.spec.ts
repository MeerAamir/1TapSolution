import { expect, test, type Page } from '@playwright/test'
import { db, loginAsAdmin } from './fixtures'

/** The me-qr-style studio: pick a type, type the content, and the code is live without a save button. */

async function codeFromUrl(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/admin\/qr\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').pop()!
  const rows = await db<{ public_code: string }>(`select public_code from qr_codes where id = $1`, [id])
  return rows[0].public_code
}

test('a pasted website address is live immediately, with no business needed', async ({ page, context }) => {
  await loginAsAdmin(page)
  await page.getByRole('link', { name: 'Create QR code' }).first().click()
  await page.getByRole('button', { name: /^Website/ }).click()
  // The real code is on screen before anything is saved.
  await expect(page.getByRole('img', { name: /QR code for/ })).toBeVisible()
  const host = `e2e-${Date.now().toString(36)}.example.com`
  await page.getByLabel('Web address').fill(`${host}/hello`)

  const code = await codeFromUrl(page)
  await expect(page.getByText('Saved and live. Scan it now.')).toBeVisible()
  const res = await context.request.get(`/q/${code}?preview=1`, { maxRedirects: 0 })
  expect(res.status()).toBe(302)
  expect(res.headers()['location']).toBe(`https://${host}/hello`)

  // Named automatically, and listed on the home screen.
  await page.getByRole('link', { name: 'My QR codes' }).first().click()
  await expect(page.getByRole('link', { name: host, exact: true })).toBeVisible()

  // Edits save themselves too.
  await page.getByRole('link', { name: host, exact: true }).click()
  await page.getByLabel('Web address').fill('https://example.org/')
  await expect
    .poll(async () => (await context.request.get(`/q/${code}?preview=1`, { maxRedirects: 0 })).headers()['location'])
    .toBe('https://example.org/')
})

test('one multi-link page holds many items and shows them to visitors', async ({ page, context }) => {
  await loginAsAdmin(page)
  await page.goto('/admin/qr/new')
  await page.getByRole('button', { name: /^Multi-link page/ }).click()
  const code = await codeFromUrl(page) // an empty page is valid, so it exists straight away

  await page.getByLabel('Page title').fill('Studio Café')
  await page.getByLabel('Web address').fill('https://example.com/menu')
  await page.getByLabel('Button text').fill('Our menu')
  await page.getByRole('button', { name: 'Phone', exact: true }).click()
  await page.getByLabel('Phone number').fill('+91 98765 43210')
  await page.getByRole('button', { name: 'Contact card', exact: true }).click()
  await page.getByLabel('Full name').fill('Meer Test')
  await page.getByRole('button', { name: 'Wi-Fi', exact: true }).click()
  await page.getByLabel('Network name').fill('CafeGuest')
  await page.getByLabel('Password', { exact: true }).fill('coffee123')

  // The phone preview shows the unsaved page.
  await page.getByRole('tab', { name: 'Phone preview' }).click()
  await expect(page.getByRole('heading', { name: 'Studio Café' })).toBeVisible()

  await expect
    .poll(async () => (await db<{ n: string }>(`select count(*) n from content_blocks cb join qr_codes q on q.id = cb.qr_code_id where q.public_code = $1`, [code]))[0].n)
    .toBe('4')

  const visitor = await context.newPage()
  await visitor.goto(`/q/${code}?preview=1`)
  await expect(visitor.getByRole('heading', { name: 'Studio Café' })).toBeVisible()
  await expect(visitor.getByRole('link', { name: 'Our menu' })).toHaveAttribute('href', 'https://example.com/menu')
  await expect(visitor.getByRole('link', { name: /Call/ })).toHaveAttribute('href', 'tel:+919876543210')
  await expect(visitor.getByRole('button', { name: 'Save contact' })).toBeVisible()
  await expect(visitor.getByText('coffee123')).toBeVisible()
  // The hidden owner is never shown.
  await expect(visitor.getByText('My QR codes')).toHaveCount(0)
})

test('text codes show the text with a copy button', async ({ page, context }) => {
  await loginAsAdmin(page)
  await page.goto('/admin/qr/new')
  await page.getByRole('button', { name: /^Text/ }).click()
  await page.getByPlaceholder('Type or paste the text people will see').fill('Breakfast is served 8 to 11.\nAsk for the Wi-Fi password.')
  const code = await codeFromUrl(page)
  const visitor = await context.newPage()
  await visitor.goto(`/q/${code}?preview=1`)
  await expect(visitor.getByText('Breakfast is served 8 to 11.')).toBeVisible()
  await expect(visitor.getByRole('button', { name: 'Copy text' })).toBeVisible()
})

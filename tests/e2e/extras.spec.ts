import { expect, test, type Page } from '@playwright/test'
import { db, loginAsAdmin } from './fixtures'

/** Menus, payments, Google reviews, page styles and "valid until". */

async function codeFromUrl(page: Page): Promise<{ id: string; code: string }> {
  await expect(page).toHaveURL(/\/admin\/qr\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').pop()!
  const rows = await db<{ public_code: string }>(`select public_code from qr_codes where id = $1`, [id])
  return { id, code: rows[0].public_code }
}

async function newCode(page: Page, tile: RegExp) {
  await loginAsAdmin(page)
  await page.goto('/admin/qr/new')
  await page.getByRole('button', { name: tile }).click()
}

test('a menu code shows sections, prices and veg marks to visitors', async ({ page, context }) => {
  await newCode(page, /^Menu/)
  await page.getByLabel('Menu title').fill('Chinar Café menu')
  await page.getByLabel('Section 1 name').fill('Starters')
  await page.getByLabel('Item name').first().fill('Paneer tikka')
  await page.getByLabel('Price').first().fill('240')
  await page.getByLabel('Tag').first().selectOption('veg')
  const { code } = await codeFromUrl(page)

  const visitor = await context.newPage()
  await visitor.goto(`/q/${code}?preview=1`)
  await expect(visitor.getByRole('heading', { name: 'Chinar Café menu' })).toBeVisible()
  await expect(visitor.getByRole('heading', { name: 'Starters' })).toBeVisible()
  await expect(visitor.getByText('Paneer tikka')).toBeVisible()
  await expect(visitor.getByText('₹240')).toBeVisible()
  await expect(visitor.getByLabel('Veg')).toBeVisible()
})

test('a payment code opens UPI apps, and a plain UPI code holds the payment itself', async ({ page, context }) => {
  await newCode(page, /^Payment/)
  await page.getByLabel('UPI ID').fill('chinar.cafe@okicici')
  await page.getByLabel('Name shown to the payer').fill('Chinar Cafe')
  await page.getByLabel('Amount (₹)').fill('150')
  const { id, code } = await codeFromUrl(page)

  const visitor = await context.newPage()
  await visitor.goto(`/q/${code}?preview=1`)
  const pay = visitor.getByRole('link', { name: 'Pay with any UPI app' })
  await expect(pay).toHaveAttribute('href', /^upi:\/\/pay\?pa=chinar\.cafe@okicici&pn=Chinar%20Cafe&am=150\.00/)
  await expect(visitor.getByRole('link', { name: /PhonePe/ })).toHaveAttribute('href', /pa=chinar\.cafe@okicici/)
  await expect(visitor.getByText('chinar.cafe@okicici')).toBeVisible()

  // Plain UPI code: the QR itself is the payment request, nothing to open in between.
  await page.getByText('Print a plain UPI code').click()
  await page.getByRole('tab', { name: 'Phone preview' }).click()
  await expect(page.getByText('Opens the payment app')).toBeVisible()
  await expect.poll(async () => (await db<{ d: boolean }>(`select (destination->>'direct')::boolean d from qr_codes where id = $1`, [id]))[0]?.d).toBe(true)
})

test('a Google review code sends people straight to the review form', async ({ page, context }) => {
  await newCode(page, /^Google review/)
  await page.getByLabel('Google review link').fill('https://g.page/r/CabcDEF123/review')
  const { code } = await codeFromUrl(page)
  const res = await context.request.get(`/q/${code}?preview=1`, { maxRedirects: 0 })
  expect(res.status()).toBe(302)
  expect(res.headers()['location']).toBe('https://g.page/r/CabcDEF123/review')
})

test('multi-link pages take a review, a payment and a menu, styled with font and background', async ({ page, context }) => {
  await newCode(page, /^Multi-link page/)
  const { code } = await codeFromUrl(page)
  await page.getByLabel('Page title').fill('Style test')
  // Replace the starter link item with a Google review item.
  await page.getByRole('button', { name: 'Google review', exact: true }).click()
  await page.getByLabel('Google review link').fill('https://g.page/r/Cxyz987654/review')
  await page.getByRole('button', { name: 'Payment / UPI', exact: true }).click()
  await page.getByLabel('UPI ID').fill('style.shop@ybl')

  await page.locator('summary', { hasText: 'Page style' }).click()
  await page.getByRole('button', { name: 'Use the Bold look' }).click()
  await page.getByLabel('Font').selectOption('playfair')

  await expect
    .poll(async () => (await db<{ f: string }>(`select destination#>>'{theme,font}' f from qr_codes where public_code = $1`, [code]))[0]?.f)
    .toBe('playfair')

  const visitor = await context.newPage()
  await visitor.goto(`/q/${code}?preview=1`)
  await expect(visitor.getByRole('heading', { name: 'Style test' })).toBeVisible()
  await expect(visitor.getByRole('link', { name: /Rate us on Google/ })).toHaveAttribute('href', 'https://g.page/r/Cxyz987654/review')
  await expect(visitor.getByRole('link', { name: 'Pay with any UPI app' })).toHaveAttribute('href', /pa=style\.shop@ybl/)
  const shell = visitor.locator('.themed').first()
  await expect(shell).toHaveCSS('background-image', /linear-gradient/)
  await expect(visitor.getByRole('heading', { name: 'Style test' })).toHaveCSS('font-family', /Playfair/)
})

test('a code past its end date is blocked until renewed', async ({ page, context }) => {
  await newCode(page, /^Website/)
  await page.getByLabel('Web address').fill('https://example.com/paid')
  const { id, code } = await codeFromUrl(page)

  await page.locator('summary', { hasText: 'Valid until' }).click()
  await page.getByRole('button', { name: '7 days' }).click()
  await expect.poll(async () => (await db<{ e: string | null }>(`select expires_at e from qr_codes where id = $1`, [id]))[0].e).not.toBeNull()

  // Time runs out (simulated in the database).
  await db(`update qr_codes set expires_at = now() - interval '1 day' where id = $1`, [id])
  const blocked = await context.request.get(`/q/${code}?preview=1`, { maxRedirects: 0 })
  expect(blocked.status()).toBe(410)
  const visitor = await context.newPage()
  await visitor.goto(`/q/${code}?preview=1`)
  await expect(visitor.getByText('This QR code is not active right now')).toBeVisible()

  // The library shows it as expired and unlocks it in one tap.
  await page.goto('/admin')
  await page.getByLabel('Status').selectOption('expired')
  await expect(page.locator('li').getByText('Expired', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: /More actions for/ }).first().click()
  await page.getByRole('menuitem', { name: 'Unlock 1 month' }).click()
  await expect
    .poll(async () => (await context.request.get(`/q/${code}?preview=1`, { maxRedirects: 0 })).status())
    .toBe(302)
})

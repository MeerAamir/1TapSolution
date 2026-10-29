import { expect, test, type Page } from '@playwright/test'
import { PNG } from 'pngjs'
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

function photo(width: number, height: number): Buffer {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) << 2
      png.data[i] = (x * 255) / width
      png.data[i + 1] = (y * 255) / height
      png.data[i + 2] = 160
      png.data[i + 3] = 255
    }
  return PNG.sync.write(png)
}

test('page images can be cropped and zoomed, and are stored small', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/admin/qr/new')
  await page.getByRole('button', { name: /^Multi-link page/ }).click()
  await codeFromUrl(page)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload', exact: true }).first().click()
  await (await chooser).setFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: photo(2000, 1400) })

  const dialog = page.getByRole('dialog', { name: 'Adjust the profile image' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('slider', { name: 'Zoom' }).fill('2')
  await dialog.getByRole('button', { name: 'Use this' }).click()
  await expect(page.getByText(/Uploaded portrait/)).toBeVisible()

  const id = page.url().split('/').pop()!
  await expect
    .poll(async () => (await db<{ a: string | null }>(`select destination->>'avatar_file_id' a from qr_codes where id = $1`, [id]))[0].a)
    .toMatch(/^[0-9a-f-]{36}$/)
  const [f] = await db<{ size_bytes: string }>(`select f.size_bytes from files f join qr_codes q on f.id::text = q.destination->>'avatar_file_id' where q.id = $1`, [id])
  expect(Number(f.size_bytes)).toBeLessThan(150 * 1024)
})

test('any code can have its own logo in the centre, and Save & finish confirms', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/admin/qr/new')
  await page.getByRole('button', { name: /^Website/ }).click()
  await page.getByLabel('Web address').fill(`logo-${Date.now().toString(36)}.example.com`)
  await codeFromUrl(page)
  const id = page.url().split('/').pop()!

  await page.getByText('Customize the QR design').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload logo' }).click()
  await (await chooser).setFiles({ name: 'brand.png', mimeType: 'image/png', buffer: photo(900, 900) })
  await page.getByRole('dialog', { name: 'Adjust the logo' }).getByRole('button', { name: 'Use this' }).click()
  await expect(page.getByRole('switch', { name: 'Logo in the centre' })).toBeChecked()
  await expect
    .poll(async () => (await db<{ d: { logo?: boolean; logoFileId?: string } }>(`select design d from qr_codes where id = $1`, [id]))[0].d)
    .toMatchObject({ logo: true, logoFileId: expect.stringMatching(/^[0-9a-f-]{36}$/) })

  await page.getByRole('button', { name: 'Save & finish' }).first().click()
  await expect(page.getByText('Saved. You will find it in My QR codes.')).toBeVisible()
  await expect(page).toHaveURL(/\/admin$/)
})

test('business-page codes preview the real business page and flag sample businesses', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/admin/qr/new')
  await page.getByRole('button', { name: /^Business page/ }).click()
  await page.getByRole('combobox').first().selectOption({ label: 'Chinar Leaf Café (Demo)' })
  await expect(page.getByText(/sample business/)).toBeVisible()
  await page.getByRole('tab', { name: 'Phone preview' }).click()
  await expect(page.getByRole('heading', { name: 'Chinar Leaf Café (Demo)' })).toBeVisible()
})

test('settings offer to remove the sample content', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/admin/settings')
  await page.getByRole('button', { name: 'Remove all sample content' }).click()
  await expect(page.getByText('Remove all sample content?')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Remove all sample content?')).toHaveCount(0)
})

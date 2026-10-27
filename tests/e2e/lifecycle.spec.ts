import { readFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { expect, test, type Page } from '@playwright/test'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { db, loginAsAdmin, makePdf, stack, uid } from './fixtures'

/**
 * One realistic administrator journey, in order:
 * create business → edit → upload PDF → create document QR → scan → replace PDF
 * → pause / resume → download PNG/SVG/PDF → delete.
 */
test.describe.configure({ mode: 'serial' })

const id = uid()
const NAME = `E2E Bakery ${id}`
const SLUG = `e2e-bakery-${id}`
let businessId = ''
let qrId = ''
let code = ''

async function scanCount(c: string): Promise<number> {
  const rows = await db<{ n: string }>(
    `select count(*) n from qr_scan_events e join qr_codes q on q.id = e.qr_code_id where q.public_code = $1`,
    [c],
  )
  return Number(rows[0].n)
}

async function openQrMenu(page: Page) {
  await page.getByRole('button', { name: 'More actions' }).click()
}

test('creates a business (Scenario 4)', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/admin/businesses/new')
  await page.getByLabel('Business name').fill(NAME)
  await expect(page.getByLabel('Page address')).toHaveValue(SLUG)
  await page.getByLabel('Tagline').fill('Fresh bread every morning')
  await page.getByRole('tab', { name: 'Contact & links' }).click()
  await page.getByLabel('Phone', { exact: true }).fill('+91 98765 43210')
  await page.getByLabel('Website').fill('https://example.com')
  await page.getByRole('button', { name: 'Create business' }).click()

  await expect(page.getByText('Business created')).toBeVisible()
  await expect(page.getByRole('heading', { name: new RegExp(NAME) })).toBeVisible()
  businessId = page.url().split('/').pop()!
  expect(businessId).toMatch(/^[0-9a-f-]{36}$/)
})

test('rejects unsafe links in the business form (Scenario 16)', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`/admin/businesses/${businessId}/edit`)
  await page.getByRole('tab', { name: 'Contact & links' }).click()
  await page.getByLabel('Website').fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Publish changes' }).click()
  await expect(page.getByText('Enter a full web address starting with https://').first()).toBeVisible()
  const rows = await db<{ website_url: string }>(`select website_url from businesses where id = $1`, [businessId])
  expect(rows[0].website_url).toBe('https://example.com')
})

test('edits flow to the public page (Scenarios 5, 9)', async ({ page, context }) => {
  await loginAsAdmin(page)
  await page.goto(`/admin/businesses/${businessId}/edit`)
  await page.getByLabel('Tagline').fill('Now open on Sundays')
  // The live preview reflects unsaved changes.
  await expect(page.getByText('Now open on Sundays').first()).toBeVisible()
  await page.getByRole('button', { name: 'Publish changes' }).click()
  await expect(page.getByText('Changes published')).toBeVisible()

  const visitor = await context.newPage()
  await visitor.goto(`/b/${SLUG}`)
  await expect(visitor.getByRole('heading', { name: NAME })).toBeVisible()
  await expect(visitor.getByText('Now open on Sundays')).toBeVisible()
  await expect(visitor.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+919876543210')
  // Unset fields do not render placeholders.
  await expect(visitor.getByText('WhatsApp')).toHaveCount(0)
})

test('uploads a document (Scenario 6)', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`/admin/businesses/${businessId}`)
  await page.getByRole('tab', { name: /Files/ }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload PDF' }).click()
  await (await chooser).setFiles({ name: 'spring-menu.pdf', mimeType: 'application/pdf', buffer: makePdf('Spring menu v1') })
  await expect(page.getByText('Uploaded spring menu')).toBeVisible()
  await expect(page.getByText('spring menu', { exact: true })).toBeVisible()
})

test('refuses a disguised executable', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`/admin/businesses/${businessId}`)
  await page.getByRole('tab', { name: /Files/ }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload PDF' }).click()
  await (await chooser).setFiles({ name: 'menu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ\x90\x00 this is not a pdf at all') })
  await expect(page.getByText('The file content is not a valid PDF or image.')).toBeVisible()
})

async function choosePdf(page: Page) {
  await page.getByRole('button', { name: 'Choose from my files' }).click()
  await page.getByRole('button', { name: /spring menu/ }).click()
  await page.getByRole('button', { name: 'Use this file' }).click()
}

test('creates a dynamic document QR code that saves itself (Scenario 7)', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`/admin/qr/new?business=${businessId}`)
  await page.getByRole('button', { name: /^PDF/ }).click()
  await choosePdf(page)

  // No save button: the code is stored as soon as the content is complete.
  await expect(page).toHaveURL(/\/admin\/qr\/[0-9a-f-]{36}$/)
  await expect(page.getByText('Saved and live. Scan it now.')).toBeVisible()
  await page.getByLabel('QR code name').fill('Counter menu')
  qrId = page.url().split('/').pop()!
  await expect.poll(async () => (await db<{ name: string }>(`select name from qr_codes where id = $1`, [qrId]))[0].name).toBe('Counter menu')
  const rows = await db<{ public_code: string; business_id: string }>(`select public_code, business_id from qr_codes where id = $1`, [qrId])
  code = rows[0].public_code
  expect(rows[0].business_id).toBe(businessId)
  expect(code).toMatch(/^[A-Za-z0-9]{10}$/)
  await expect(page.getByText(`${stack.SITE.replace(/^https?:\/\//, '')}/q/${code}`)).toBeVisible()
})

test('scanning opens the document and records exactly one scan (Scenarios 8, 17, 18)', async ({ browser }) => {
  const phone = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
  const page = await phone.newPage()
  const before = await scanCount(code)
  await page.goto(`/q/${code}`)
  await expect(page.getByRole('heading', { name: 'spring menu' })).toBeVisible()
  const open = page.getByRole('link', { name: 'Open document' })
  await expect(open).toHaveAttribute('href', /\/storage\/v1\/object\/public\/public-files\/.+\.pdf\?v=1$/)
  expect(await scanCount(code)).toBe(before + 1)

  // Reloading straight away is the same visit; the page itself never records scans.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'spring menu' })).toBeVisible()
  expect(await scanCount(code)).toBe(before + 1)

  const pdf = await page.request.get((await open.getAttribute('href'))!)
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
  await phone.close()
})

test('the dashboard charts show recorded scans, even with a legacy browser time zone (Scenario 17)', async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Calcutta' })
  const page = await ctx.newPage()
  await loginAsAdmin(page)
  await page.goto('/admin/overview')
  await expect(page.getByText('No scans yet')).toHaveCount(0)
  await expect(page.locator('.recharts-area-curve').first()).toBeVisible()
  await page.goto(`/admin/qr/${qrId}`)
  await page.locator('summary', { hasText: 'Scans' }).click()
  await expect(page.locator('.recharts-area-curve').first()).toBeVisible()
  await ctx.close()
})

test('replacing the PDF serves the new file on the same QR code (Scenarios 10, 11)', async ({ page, context }) => {
  await loginAsAdmin(page)
  await page.goto(`/admin/businesses/${businessId}`)
  await page.getByRole('tab', { name: /Files/ }).click()
  await page.getByRole('button', { name: 'Actions for spring menu' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Replace file' }).click()
  await (await chooser).setFiles({ name: 'summer-menu.pdf', mimeType: 'application/pdf', buffer: makePdf('Summer menu v2 with more items') })
  await expect(page.getByText(/File replaced/)).toBeVisible()

  const visitor = await context.newPage()
  await visitor.goto(`/q/${code}?preview=1`)
  const href = await visitor.getByRole('link', { name: 'Open document' }).getAttribute('href')
  expect(href).toMatch(/\?v=2$/)
  const pdf = await visitor.request.get(href!)
  expect((await pdf.body()).toString('latin1')).toContain('Summer menu v2')

  const rows = await db<{ public_code: string }>(`select public_code from qr_codes where id = $1`, [qrId])
  expect(rows[0].public_code).toBe(code)
})

test('changing the destination keeps the printed link (Scenario 10)', async ({ page, context }) => {
  await loginAsAdmin(page)
  await page.goto(`/admin/qr/${qrId}`)
  await page.getByRole('button', { name: 'Change type' }).click()
  await page.getByRole('button', { name: /^Website/ }).click()
  await page.getByLabel('Web address').fill('javascript:alert(1)')
  await expect(page.getByText('Enter a full web address starting with https://').first()).toBeVisible()
  // Invalid content is never saved: the printed code still opens the document.
  expect((await db<{ type: string }>(`select type from qr_codes where id = $1`, [qrId]))[0].type).toBe('document')

  await page.getByLabel('Web address').fill('example.org/menu')
  await expect.poll(async () => (await db<{ type: string }>(`select type from qr_codes where id = $1`, [qrId]))[0].type).toBe('website')

  const res = await context.request.get(`/q/${code}?preview=1`, { maxRedirects: 0 })
  expect(res.status()).toBe(302)
  expect(res.headers()['location']).toBe('https://example.org/menu')

  // Back to the document for the remaining steps.
  await page.getByRole('button', { name: 'Change type' }).click()
  await page.getByRole('button', { name: /^PDF/ }).click()
  await choosePdf(page)
  await expect.poll(async () => (await db<{ type: string }>(`select type from qr_codes where id = $1`, [qrId]))[0].type).toBe('document')
})

test('deactivating shows an unavailable page; reactivating restores it (Scenarios 12, 13)', async ({ page, context }) => {
  await loginAsAdmin(page)
  await page.goto(`/admin/qr/${qrId}`)
  await openQrMenu(page)
  await page.getByRole('menuitem', { name: 'Pause' }).click()
  await expect(page.getByText(/Scans now show/).first()).toBeVisible()

  const visitor = await context.newPage()
  const res = await visitor.goto(`/q/${code}`)
  expect(res?.status()).toBe(410)
  await expect(visitor.getByRole('heading', { name: 'This QR code is currently unavailable' })).toBeVisible()
  await expect(visitor.getByText(NAME)).toHaveCount(0)

  await openQrMenu(page)
  await page.getByRole('menuitem', { name: 'Resume' }).click()
  await expect(page.getByText('Live again')).toBeVisible()
  await visitor.goto(`/q/${code}`)
  await expect(visitor.getByRole('heading', { name: 'spring menu' })).toBeVisible()
})

test('downloads real, scannable PNG, SVG and PDF files (Scenario 21)', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`/admin/qr/${qrId}`)
  const expected = `${stack.SITE}/q/${code}`

  const pngDl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  await page.getByRole('menuitem', { name: /PNG image/ }).click()
  const png = PNG.sync.read(readFileSync((await (await pngDl).path())!))
  expect(png.width).toBe(2048)
  expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe(expected)

  const svgDl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  await page.getByRole('menuitem', { name: /SVG vector/ }).click()
  const svg = readFileSync((await (await svgDl).path())!, 'utf8')
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).not.toContain('<image')
  const raster = new Resvg(svg, { fitTo: { mode: 'width', value: 800 } }).render()
  expect(jsQR(new Uint8ClampedArray(raster.pixels), raster.width, raster.height)?.data).toBe(expected)

  const pdfDl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  await page.getByRole('menuitem', { name: /PDF, ready to print/ }).click()
  const pdf = readFileSync((await (await pdfDl).path())!)
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
})

test('deleting a QR code leaves other codes working (Scenarios 14, 19)', async ({ page, context }) => {
  await loginAsAdmin(page)
  await page.goto(`/admin/qr/${qrId}`)
  await openQrMenu(page)
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)

  const visitor = await context.newPage()
  expect((await visitor.goto(`/q/${code}`))?.status()).toBe(404)
  await expect(visitor.getByRole('heading', { name: 'This QR code is not recognised' })).toBeVisible()

  await visitor.goto('/q/demoCafe01?preview=1')
  await expect(visitor.getByRole('heading', { name: 'Chinar Leaf Café (Demo)' })).toBeVisible()
  const biz = await db(`select 1 from businesses where id = $1`, [businessId])
  expect(biz).toHaveLength(1)
})

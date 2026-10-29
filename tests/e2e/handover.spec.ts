import { expect, test, type Page } from '@playwright/test'
import { unzipSync, strFromU8 } from 'fflate'
import { PNG } from 'pngjs'
import { db, loginAsAdmin } from './fixtures'

/** Grouping codes by business, multi-photo upload, the save bar, analytics and backups. */

async function newWebsite(page: Page, host: string) {
  await page.goto('/admin/qr/new')
  await page.getByRole('button', { name: /^Website/ }).click()
  await page.getByLabel('Web address').fill(`https://${host}/`)
  await expect(page).toHaveURL(/\/admin\/qr\/[0-9a-f-]{36}$/)
  return page.url().split('/').pop()!
}

function png(seed: number): Buffer {
  const p = new PNG({ width: 300, height: 200 })
  for (let i = 0; i < p.data.length; i += 4) {
    p.data[i] = (i * seed) % 255
    p.data[i + 1] = 90
    p.data[i + 2] = 160
    p.data[i + 3] = 255
  }
  return PNG.sync.write(p)
}

test('codes can be put under a new business, grouped and moved back', async ({ page }) => {
  await loginAsAdmin(page)
  const name = `Group Biz ${Date.now().toString(36)}`
  const id = await newWebsite(page, `group-${Date.now().toString(36)}.example.com`)

  await page.getByLabel('Business').first().selectOption('__new__')
  await page.getByLabel('New business name').fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect
    .poll(async () => (await db<{ n: string }>(`select b.name n from qr_codes q join businesses b on b.id = q.business_id where q.id = $1`, [id]))[0].n)
    .toBe(name)

  await page.goto('/admin')
  await page.getByRole('radio', { name: 'By business' }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  const group = page.getByRole('region', { name })
  await group.getByRole('button', { name: /More actions for/ }).first().click()
  await page.getByRole('menuitem', { name: 'Move to business…' }).click()
  await page.getByRole('dialog').getByLabel('Business').selectOption('')
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await expect
    .poll(async () => (await db<{ w: boolean }>(`select b.is_workspace w from qr_codes q join businesses b on b.id = q.business_id where q.id = $1`, [id]))[0].w)
    .toBe(true)
  await page.getByRole('radio', { name: 'All codes' }).click()
})

test('a gallery takes several photos at once and the save bar stays in view', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/admin/qr/new')
  await page.getByRole('button', { name: /^Multi-link page/ }).click()
  await expect(page).toHaveURL(/\/admin\/qr\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').pop()!
  await page.getByRole('button', { name: 'Photo gallery', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload photos' }).click()
  await (await chooser).setFiles([1, 2, 3].map((n) => ({ name: `photo-${n}.png`, mimeType: 'image/png', buffer: png(n) })))
  await expect(page.getByText('Uploaded 3 files')).toBeVisible()
  await expect
    .poll(async () => (await db<{ n: number }>(`select jsonb_array_length(data->'file_ids') n from content_blocks where qr_code_id = $1 and type = 'gallery'`, [id]))[0]?.n)
    .toBe(3)

  await page.mouse.wheel(0, 3000)
  await expect(page.getByRole('status').filter({ hasText: /Saved · live|Saving/ })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Save & finish' }).last()).toBeInViewport()
})

test('analytics shows headline figures, devices and busy times', async ({ page }) => {
  await loginAsAdmin(page)
  const id = await newWebsite(page, `stats-${Date.now().toString(36)}.example.com`)
  await db(
    `insert into qr_scan_events (qr_code_id, business_id, qr_type, device_category, browser_category, occurred_at)
     select q.id, q.business_id, q.type, d, 'chrome', now() - (n || ' hours')::interval
       from qr_codes q, unnest(array['mobile','mobile','desktop']) d, generate_series(1, 3) n where q.id = $1`,
    [id],
  )
  await page.goto('/admin/analytics')
  await expect(page.getByText('Busiest:')).toBeVisible()
  await expect(page.getByText('Most scanned QR codes')).toBeVisible()
  await expect(page.getByText('Phones, tablets and computers')).toBeVisible()
})

test('a backup ZIP holds the records, a spreadsheet and print-ready codes', async ({ page }) => {
  await loginAsAdmin(page)
  await newWebsite(page, `backup-${Date.now().toString(36)}.example.com`)
  await page.goto('/admin/backup')
  await page.getByRole('radio', { name: 'Today' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup' }).click()
  const file = await (await download).path()
  const { readFileSync } = await import('node:fs')
  const files = unzipSync(new Uint8Array(readFileSync(file)))
  const json = JSON.parse(strFromU8(files['backup.json']))
  expect(json.format).toBe('1tap-solution-backup')
  expect(json.tables.qr_codes.length).toBeGreaterThan(0)
  expect(strFromU8(files['qr-codes.csv'])).toContain('/q/')
  expect(Object.keys(files).some((k) => k.startsWith('qr-images/') && k.endsWith('.svg'))).toBe(true)
  expect(strFromU8(files['README.txt'])).toContain('public_code')
  await expect(page.getByText(/QR codes, .* businesses/).first()).toBeVisible()
})

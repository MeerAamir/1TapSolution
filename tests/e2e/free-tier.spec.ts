import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'
import { db, loginAsAdmin, stack } from './fixtures'

/** A large, detailed PNG (random noise) like an uncompressed phone photo, over the 10 MB limit. */
function bigPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height })
  randomBytes(png.data.length).copy(png.data)
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255
  return PNG.sync.write(png)
}

async function keepAlive(request: import('@playwright/test').APIRequestContext) {
  const r = await request.post(`${stack.GATEWAY}/rest/v1/rpc/keep_alive`, {
    headers: { apikey: stack.ANON_KEY, Authorization: `Bearer ${stack.ANON_KEY}`, 'Content-Type': 'application/json' },
    data: { p_source: 'e2e' },
  })
  expect(r.ok()).toBe(true)
}

test('logos with transparency stay PNG', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/admin/files')
  // A filled circle on a transparent background, larger than 1920 px.
  const png = new PNG({ width: 2400, height: 2400 })
  for (let y = 0; y < 2400; y++) {
    for (let x = 0; x < 2400; x++) {
      const i = (2400 * y + x) << 2
      const inside = (x - 1200) ** 2 + (y - 1200) ** 2 < 900 ** 2
      png.data[i] = 124
      png.data[i + 1] = 58
      png.data[i + 2] = 237
      png.data[i + 3] = inside ? 255 : 0
    }
  }
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose files' }).click()
  await (await chooser).setFiles({ name: 'logo-alpha.png', mimeType: 'image/png', buffer: PNG.sync.write(png) })
  await expect(page.getByText('1 file uploaded')).toBeVisible({ timeout: 30_000 })
  const [file] = await db<{ storage_path: string }>(`select storage_path from files where original_filename = 'logo-alpha.png' order by created_at desc limit 1`)
  expect(file.storage_path).toMatch(/\.png$/)
})

test('large photos are resized before upload to save storage and bandwidth', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto('/admin/files')
  const original = bigPng(2600, 1800)
  expect(original.length).toBeGreaterThan(10 * 1024 * 1024)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose files' }).click()
  await (await chooser).setFiles({ name: 'shop-front.png', mimeType: 'image/png', buffer: original })
  await expect(page.getByText('1 file uploaded')).toBeVisible({ timeout: 30_000 })

  const [file] = await db<{ storage_path: string; size_bytes: string }>(
    `select storage_path, size_bytes from files where original_filename = 'shop-front.png' order by created_at desc limit 1`,
  )
  expect(Number(file.size_bytes)).toBeLessThan(original.length / 2)
  // An opaque PNG photo is stored as a resized JPEG.
  expect(file.storage_path).toMatch(/\.jpg$/)
  const stored = Buffer.from(await (await page.request.get(`${stack.GATEWAY}/storage/v1/object/public/public-files/${file.storage_path}`)).body())
  expect(stored.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
  // Read the JPEG frame size (SOF marker) to confirm the resize.
  let i = 2
  while (i < stored.length && !(stored[i] === 0xff && stored[i + 1] >= 0xc0 && stored[i + 1] <= 0xc2)) i += 2 + stored.readUInt16BE(i + 2)
  const height = stored.readUInt16BE(i + 5)
  const width = stored.readUInt16BE(i + 7)
  expect(Math.max(width, height)).toBe(1920)
})

test('settings show free-plan usage and the keep-alive status', async ({ page, request }) => {
  await keepAlive(request)
  await loginAsAdmin(page)
  await page.goto('/admin/settings')
  await expect(page.getByRole('heading', { name: 'Free plan usage' })).toBeVisible()
  await expect(page.getByRole('meter', { name: 'Database' })).toBeVisible()
  await expect(page.getByRole('meter', { name: 'File storage' })).toBeVisible()
  await expect(page.getByText(/last ran .* \(e2e\)/)).toBeVisible()
})

test('the overview warns when the keep-alive has stopped', async ({ page, request }) => {
  await db(`update app_heartbeat set last_beat = now() - interval '3 days'`)
  await loginAsAdmin(page)
  await expect(page.getByText(/keep-alive job has not run/)).toBeVisible()

  await db(`update app_heartbeat set last_beat = 'epoch'`)
  await keepAlive(request)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'My QR codes' })).toBeVisible()
  await expect(page.getByText(/keep-alive job has not run/)).toHaveCount(0)
})

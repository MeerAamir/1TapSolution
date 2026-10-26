import { expect, test } from '@playwright/test'
import { login, loginAsAdmin, stack } from './fixtures'

test.describe('administrator authentication', () => {
  test('visitors who are not signed in are sent to the login page (Scenario 2)', async ({ page }) => {
    await page.goto('/admin/businesses')
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fbusinesses/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('wrong passwords show a clear error', async ({ page }) => {
    await login(page, { email: stack.ADMIN.email, password: 'not-the-password' })
    await expect(page.getByText('Email or password is incorrect.')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('signed-in users without the admin role are refused (Scenario 3)', async ({ page }) => {
    await login(page, stack.OTHER)
    await expect(page.getByText('This account does not have administrator access.')).toBeVisible()
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('an administrator can sign in, is returned to the requested page, and can sign out (Scenario 1)', async ({ page }) => {
    await page.goto('/admin/qr')
    await page.getByLabel('Email').fill(stack.ADMIN.email)
    await page.getByLabel('Password').fill(stack.ADMIN.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'QR codes' })).toBeVisible()

    // Session persists across reloads.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'QR codes' })).toBeVisible()

    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login does not redirect to other sites', async ({ page }) => {
    await page.goto('/login?next=https%3A%2F%2Fevil.example')
    await page.getByLabel('Email').fill(stack.ADMIN.email)
    await page.getByLabel('Password').fill(stack.ADMIN.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/127\.0\.0\.1:8788\/admin$/)
  })
})

test.describe('data API with the public anon key (Scenarios 3, 15)', () => {
  const headers = () => ({ apikey: stack.ANON_KEY, Authorization: `Bearer ${stack.ANON_KEY}`, 'Content-Type': 'application/json' })

  test('cannot read or write management tables', async ({ request }) => {
    for (const table of ['businesses', 'qr_codes', 'files', 'admin_users', 'qr_scan_events', 'contact_submissions']) {
      const r = await request.get(`${stack.GATEWAY}/rest/v1/${table}?select=*`, { headers: headers() })
      expect(r.status(), table).toBeGreaterThanOrEqual(401)
    }
    const w = await request.post(`${stack.GATEWAY}/rest/v1/businesses`, { headers: headers(), data: { name: 'x', slug: 'x-x' } })
    expect(w.status()).toBeGreaterThanOrEqual(401)
  })

  test('can only call the public read function, which returns published fields only', async ({ request }) => {
    const r = await request.post(`${stack.GATEWAY}/rest/v1/rpc/get_public_qr`, { headers: headers(), data: { p_code: 'demoCafe01' } })
    expect(r.ok()).toBe(true)
    const body = (await r.json()) as Record<string, unknown>
    expect(body.state).toBe('ok')
    expect(JSON.stringify(body)).not.toMatch(/created_by|admin|visitor_hash/)

    const admin = await request.post(`${stack.GATEWAY}/rest/v1/rpc/admin_overview_stats`, { headers: headers(), data: {} })
    expect(admin.status()).toBeGreaterThanOrEqual(401)
  })

  test('an admin session works end to end', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page.getByText('Businesses').first()).toBeVisible()
  })
})

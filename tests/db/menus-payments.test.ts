import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anon, asUser, createTestDb, EDGE_SECRET, runAs, superuser, type TestDb } from './helpers'

/** Migration 0008: menus, payments, Google reviews, page styles and expiry. */
let db: TestDb
let admin: ReturnType<typeof asUser>
let ws: string

beforeAll(async () => {
  db = await createTestDb()
  admin = asUser(db.adminId)
  ws = (await runAs<{ id: string }>(db, admin, `select public.admin_workspace_business() as id`)).rows[0].id
})
afterAll(async () => {
  await db?.drop()
})

const publicQr = async (code: string) =>
  (await runAs<{ p: Record<string, any> }>(db, anon, `select public.get_public_qr($1) as p`, [code])).rows[0].p
const insertQr = (code: string, type: string, destination: unknown, extra = '') =>
  runAs(db, admin, `insert into qr_codes (public_code, business_id, name, type, destination${extra ? ', expires_at' : ''}) values ($1, $2, 'T', $3, $4::jsonb${extra ? `, ${extra}` : ''})`, [
    code,
    ws,
    type,
    JSON.stringify(destination),
  ])
const ok = async (fn: string, v: unknown) =>
  (await runAs<{ ok: boolean }>(db, superuser, `select public.${fn}($1::jsonb) as ok`, [JSON.stringify(v)])).rows[0].ok

describe('payments', () => {
  it('accept UPI ids, links and bank details', async () => {
    expect(await ok('is_valid_payment', { upi_id: 'cafe.chinar@okicici', payee_name: 'Chinar Café', amount: 250 })).toBe(true)
    expect(await ok('is_valid_payment', { links: [{ label: 'Pay online', url: 'https://rzp.io/l/abc' }] })).toBe(true)
    expect(await ok('is_valid_payment', { bank: { account_number: '123456789012', ifsc: 'SBIN0001234' } })).toBe(true)
  })
  it('reject nothing to pay with, bad UPI ids, unsafe links and odd amounts', async () => {
    expect(await ok('is_valid_payment', {})).toBe(false)
    expect(await ok('is_valid_payment', { upi_id: 'not a upi' })).toBe(false)
    expect(await ok('is_valid_payment', { links: [{ label: 'x', url: 'javascript:alert(1)' }] })).toBe(false)
    expect(await ok('is_valid_payment', { upi_id: 'ab@ok', amount: -5 })).toBe(false)
    expect(await ok('is_valid_payment', { upi_id: 'ab@ok', amount: '10' })).toBe(false)
    expect(await ok('is_valid_payment', { bank: { account_number: '12AB' } })).toBe(false)
  })
})

describe('menus', () => {
  it('accept typed sections, a link, a PDF or photos', async () => {
    expect(
      await ok('is_valid_menu', {
        mode: 'items',
        sections: [{ name: 'Tea', items: [{ name: 'Kahwa', price: '₹60', tag: 'veg' }] }],
      }),
    ).toBe(true)
    expect(await ok('is_valid_menu', { mode: 'link', url: 'https://example.com/menu' })).toBe(true)
    expect(await ok('is_valid_menu', { mode: 'pdf', file_id: '00000000-0000-4000-8000-000000000000' })).toBe(true)
    expect(await ok('is_valid_menu', { mode: 'images', file_ids: ['00000000-0000-4000-8000-000000000000'] })).toBe(true)
  })
  it('reject empty or malformed menus', async () => {
    expect(await ok('is_valid_menu', { mode: 'items', sections: [] })).toBe(false)
    expect(await ok('is_valid_menu', { mode: 'items', sections: [{ name: 'x', items: [{ name: '' }] }] })).toBe(false)
    expect(await ok('is_valid_menu', { mode: 'pdf' })).toBe(false)
    expect(await ok('is_valid_menu', { mode: 'other' })).toBe(false)
  })
  it('resolve menu photos for visitors in order', async () => {
    const ids: string[] = []
    for (const n of [1, 2]) {
      const f = await runAs<{ id: string }>(
        db,
        superuser,
        `insert into files (business_id, bucket, storage_path, title, mime_type, size_bytes)
         values ($1, 'public-files', $2, 'Page', 'image/webp', 1000) returning id`,
        [ws, `menu/page-${n}.webp`],
      )
      ids.push(f.rows[0].id)
    }
    await insertQr('MenuPhotos', 'menu', { mode: 'images', title: 'Our menu', file_ids: ids })
    const p = await publicQr('MenuPhotos')
    expect(p.destination.files.map((f: { path: string }) => f.path)).toEqual(['menu/page-1.webp', 'menu/page-2.webp'])
    expect(p.destination.file_ids).toBeUndefined()
    // A photo used by a menu cannot be deleted from under it.
    await expect(runAs(db, admin, `delete from files where id = $1`, [ids[0]])).rejects.toThrow(/still used/)
  })
})

describe('Google reviews', () => {
  it('accept a review link or a Place ID only', async () => {
    expect(await ok('is_valid_review', { url: 'https://g.page/r/abc/review' })).toBe(true)
    expect(await ok('is_valid_review', { place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4' })).toBe(true)
    expect(await ok('is_valid_review', { place_id: 'bad id' })).toBe(false)
    expect(await ok('is_valid_review', {})).toBe(false)
  })
  it('work as page items', async () => {
    expect((await runAs<{ ok: boolean }>(db, superuser, `select public.is_valid_content_block('review', '{"url":"https://g.page/r/x/review"}') as ok`)).rows[0].ok).toBe(true)
    expect((await runAs<{ ok: boolean }>(db, superuser, `select public.is_valid_content_block('payment', '{"upi_id":"shop@ybl"}') as ok`)).rows[0].ok).toBe(true)
  })
})

describe('page styles', () => {
  it('accept known fonts, colours and backgrounds', async () => {
    expect(
      await ok('is_valid_theme', {
        font: 'poppins',
        accent: '#16A34A',
        title_color: '#111111',
        bg_type: 'gradient',
        bg_color: '#FDE68A',
        bg_color2: '#F59E0B',
        bg_angle: 135,
        button_style: 'soft',
        button_shape: 'pill',
      }),
    ).toBe(true)
  })
  it('reject anything that could inject styles', async () => {
    expect(await ok('is_valid_theme', { accent: 'red; background:url(https://evil)' })).toBe(false)
    expect(await ok('is_valid_theme', { font: 'Comic Sans' })).toBe(false)
    expect(await ok('is_valid_theme', { bg_angle: '90deg' })).toBe(false)
    expect(await ok('is_valid_theme', { bg_image_file_id: 'not-a-uuid' })).toBe(false)
  })
  it('apply to every page-type code and resolve the background picture', async () => {
    const f = await runAs<{ id: string }>(
      db,
      superuser,
      `insert into files (business_id, bucket, storage_path, title, mime_type, size_bytes)
       values ($1, 'public-files', 'theme/bg-1.webp', 'Bg', 'image/webp', 1000) returning id`,
      [ws],
    )
    await insertQr('ThemedText', 'text', { text: 'Hello', theme: { font: 'lora', bg_type: 'image', bg_image_file_id: f.rows[0].id } })
    const p = await publicQr('ThemedText')
    expect(p.destination.theme.font).toBe('lora')
    expect(p.destination.theme.bg_image.path).toBe('theme/bg-1.webp')
    expect(p.destination.theme.bg_image_file_id).toBeUndefined()
    await expect(insertQr('BadTheme01', 'text', { text: 'x', theme: { accent: 'blue' } })).rejects.toThrow(/qr_codes_destination_valid/)
  })
})

describe('expiry', () => {
  it('blocks a code after its end date and works again once renewed', async () => {
    await insertQr('Expiring01', 'website', { url: 'https://example.com' }, `now() - interval '1 minute'`)
    expect((await publicQr('Expiring01')).state).toBe('expired')
    // Expired codes reveal nothing and record no scans.
    const r = await runAs<{ p: { state: string; recorded: boolean } }>(
      db,
      anon,
      `select public.edge_resolve_qr($1, 'Expiring01', 'mobile', 'chrome', null, true) as p`,
      [EDGE_SECRET],
    )
    expect(r.rows[0].p).toMatchObject({ state: 'expired', recorded: false })

    await runAs(db, admin, `update qr_codes set expires_at = now() + interval '30 days' where public_code = 'Expiring01'`)
    expect((await publicQr('Expiring01')).state).toBe('ok')
    const v = await runAs<{ expires_at: string | null }>(db, admin, `select expires_at from admin_qr_overview where public_code = 'Expiring01'`)
    expect(v.rows[0].expires_at).not.toBeNull()
  })
})

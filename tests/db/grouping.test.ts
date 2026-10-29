import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, createTestDb, runAs, superuser, type TestDb } from './helpers'

/** Migration 0009: QR codes grouped by business, quick businesses, custom menu labels. */
let db: TestDb
let admin: ReturnType<typeof asUser>
let other: ReturnType<typeof asUser>
let ws: string

beforeAll(async () => {
  db = await createTestDb()
  admin = asUser(db.adminId)
  other = asUser(db.otherUserId)
  ws = (await runAs<{ id: string }>(db, admin, `select public.admin_workspace_business() as id`)).rows[0].id
})
afterAll(async () => {
  await db?.drop()
})

const quick = async (name: string) => (await runAs<{ id: string }>(db, admin, `select public.admin_quick_business($1) as id`, [name])).rows[0].id

describe('quick business', () => {
  it('creates a business from a name with a unique slug', async () => {
    const a = await quick('Hotel Park Plaza')
    const b = await quick('Hotel Park Plaza')
    const rows = (await runAs<{ id: string; slug: string; is_workspace: boolean }>(db, superuser, `select id, slug, is_workspace from businesses where id in ($1, $2) order by slug`, [a, b])).rows
    expect(rows.map((r) => r.slug)).toEqual(['hotel-park-plaza', 'hotel-park-plaza-2'])
    expect(rows.every((r) => !r.is_workspace)).toBe(true)
    expect((await runAs<{ id: string }>(db, admin, `select public.admin_quick_business('☕') as id`)).rows[0].id).toBeTruthy()
  })
  it('refuses empty names and non-admins', async () => {
    await expect(runAs(db, admin, `select public.admin_quick_business('   ')`)).rejects.toThrow(/business name/)
    await expect(runAs(db, other, `select public.admin_quick_business('X')`)).rejects.toThrow(/administrator/)
  })
})

describe('moving codes between businesses', () => {
  it('moves a multi-link page with its items and keeps its own header', async () => {
    const target = await quick('Move Target')
    const qr = (
      await runAs<{ id: string }>(db, admin, `insert into qr_codes (business_id, name, type, destination) values ($1, 'Page', 'landing_page', '{"title":"Mine"}') returning id`, [ws])
    ).rows[0].id
    await runAs(db, admin, `select public.admin_save_blocks($1, $2, $3::jsonb)`, [ws, qr, JSON.stringify([{ type: 'link', data: { label: 'Go', url: 'https://example.com' } }])])

    await runAs(db, admin, `select public.admin_move_qr($1, $2)`, [qr, target])
    const row = (await runAs<{ business_id: string; d: Record<string, unknown> }>(db, superuser, `select business_id, destination d from qr_codes where id = $1`, [qr])).rows[0]
    expect(row.business_id).toBe(target)
    expect(row.d.show_business).toBe(false)
    const blocks = (await runAs<{ business_id: string }>(db, superuser, `select business_id from content_blocks where qr_code_id = $1`, [qr])).rows
    expect(blocks).toHaveLength(1)
    expect(blocks[0].business_id).toBe(target)

    // Items can still be edited under the new owner.
    await runAs(db, admin, `select public.admin_save_blocks($1, $2, $3::jsonb)`, [target, qr, JSON.stringify([{ type: 'text', data: { text: 'Hi' } }])])

    // And back to "no business".
    await runAs(db, admin, `select public.admin_move_qr($1, null)`, [qr])
    expect((await runAs<{ business_id: string }>(db, superuser, `select business_id from qr_codes where id = $1`, [qr])).rows[0].business_id).toBe(ws)
  })
  it('keeps business-page codes on a real business and is admin-only', async () => {
    const b = await quick('Profile Biz')
    const qr = (await runAs<{ id: string }>(db, admin, `insert into qr_codes (business_id, name, type, destination) values ($1, 'P', 'business_profile', '{}') returning id`, [b])).rows[0].id
    await expect(runAs(db, admin, `select public.admin_move_qr($1, null)`, [qr])).rejects.toThrow(/needs a business/)
    await expect(runAs(db, other, `select public.admin_move_qr($1, null)`, [qr])).rejects.toThrow(/administrator/)
  })
})

describe('menu labels', () => {
  const ok = async (v: unknown) => (await runAs<{ ok: boolean }>(db, superuser, `select public.is_valid_menu($1::jsonb) as ok`, [JSON.stringify(v)])).rows[0].ok
  it('accept a short own label and refuse a long one', async () => {
    expect(await ok({ mode: 'items', sections: [{ items: [{ name: 'Wazwan', badge: 'Chef’s special' }] }] })).toBe(true)
    expect(await ok({ mode: 'items', sections: [{ items: [{ name: 'Wazwan', badge: 'x'.repeat(25) }] }] })).toBe(false)
  })
})

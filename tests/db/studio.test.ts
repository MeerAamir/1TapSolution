import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anon, asUser, createTestDb, runAs, superuser, type TestDb } from './helpers'

/** The simple QR studio (migration 0007): codes without a business, text codes, richer pages. */
let db: TestDb
let admin: ReturnType<typeof asUser>
let workspace: string

beforeAll(async () => {
  db = await createTestDb()
  admin = asUser(db.adminId)
  const r = await runAs<{ id: string }>(db, admin, `select public.admin_workspace_business() as id`)
  workspace = r.rows[0].id
})
afterAll(async () => {
  await db?.drop()
})

const publicQr = async (code: string) =>
  (await runAs<{ p: Record<string, any> }>(db, anon, `select public.get_public_qr($1) as p`, [code])).rows[0].p

describe('workspace owner', () => {
  it('is created once and reused', async () => {
    const again = await runAs<{ id: string }>(db, admin, `select public.admin_workspace_business() as id`)
    expect(again.rows[0].id).toBe(workspace)
    const count = await runAs<{ n: string }>(db, superuser, `select count(*) as n from businesses where is_workspace`)
    expect(count.rows[0].n).toBe('1')
  })

  it('is only available to administrators', async () => {
    await expect(runAs(db, anon, `select public.admin_workspace_business()`)).rejects.toThrow(/permission denied/)
    await expect(runAs(db, asUser(db.otherUserId), `select public.admin_workspace_business()`)).rejects.toThrow(/administrator access required/)
  })

  it('never appears as a business in the dashboard or publicly', async () => {
    const list = await runAs<{ n: string }>(db, admin, `select count(*) as n from admin_business_overview where id = $1`, [workspace])
    expect(list.rows[0].n).toBe('0')
    const slug = await runAs<{ slug: string }>(db, superuser, `select slug from businesses where id = $1`, [workspace])
    const page = await runAs<{ p: { state: string } }>(db, anon, `select public.get_public_business($1) as p`, [slug.rows[0].slug])
    expect(page.rows[0].p.state).toBe('not_found')
  })
})

describe('codes created in the studio', () => {
  it('accept a code chosen in the browser and resolve without revealing the owner', async () => {
    await runAs(
      db,
      admin,
      `insert into qr_codes (public_code, business_id, name, type, destination)
       values ('Studio0001', $1, 'example.com', 'website', '{"url":"https://example.com"}')`,
      [workspace],
    )
    const p = await publicQr('Studio0001')
    expect(p.state).toBe('ok')
    expect(p.destination.url).toBe('https://example.com')
    expect(p.business.is_workspace).toBe(true)
    expect(p.business.name).toBe('')
    expect(p.business.phone).toBeUndefined()
  })

  it('support text codes and validate them', async () => {
    await runAs(
      db,
      admin,
      `insert into qr_codes (public_code, business_id, name, type, destination)
       values ('StudioText', $1, 'Welcome', 'text', '{"title":"Welcome","text":"Breakfast 8–11"}')`,
      [workspace],
    )
    const p = await publicQr('StudioText')
    expect(p.type).toBe('text')
    expect(p.destination.text).toBe('Breakfast 8–11')
    await expect(
      runAs(db, admin, `insert into qr_codes (business_id, name, type, destination) values ($1, 'x', 'text', '{"text":"   "}')`, [workspace]),
    ).rejects.toThrow(/qr_codes_destination_valid/)
  })

  it('give multi-link pages their own header, images and new item types', async () => {
    const f = await runAs<{ id: string }>(
      db,
      superuser,
      `insert into files (business_id, bucket, storage_path, title, mime_type, size_bytes)
       values ($1, 'public-files', 'studio/avatar-1.png', 'Logo', 'image/png', 1000) returning id`,
      [workspace],
    )
    const q = await runAs<{ id: string }>(
      db,
      admin,
      `insert into qr_codes (public_code, business_id, name, type, destination)
       values ('StudioPage', $1, 'Page', 'landing_page', jsonb_build_object('title','Chinar','subtitle','Hello','accent','#16A34A','avatar_file_id',$2::text))
       returning id`,
      [workspace, f.rows[0].id],
    )
    await runAs(
      db,
      admin,
      `select public.admin_save_blocks($1, $2, $3::jsonb)`,
      [
        workspace,
        q.rows[0].id,
        JSON.stringify([
          { type: 'link', data: { label: 'Menu', url: 'https://example.com/menu' } },
          { type: 'email', data: { email: 'hello@example.com' } },
          { type: 'contact', data: { full_name: 'Aamir', phone: '+91 98765 43210' } },
          { type: 'wifi', data: { ssid: 'Cafe', encryption: 'WPA', password: 'secret123' } },
        ]),
      ],
    )
    const p = await publicQr('StudioPage')
    expect(p.destination.title).toBe('Chinar')
    expect(p.destination.avatar.path).toBe('studio/avatar-1.png')
    expect(p.destination.avatar_file_id).toBeUndefined()
    expect(p.business.blocks.map((b: { type: string }) => b.type)).toEqual(['link', 'email', 'contact', 'wifi'])
  })

  it('reject invalid page headers and items', async () => {
    await expect(
      runAs(db, admin, `insert into qr_codes (business_id, name, type, destination) values ($1, 'x', 'landing_page', '{"accent":"red"}')`, [workspace]),
    ).rejects.toThrow(/qr_codes_destination_valid/)
    expect(
      (await runAs<{ ok: boolean }>(db, superuser, `select public.is_valid_content_block('email', '{"email":"nope"}') as ok`)).rows[0].ok,
    ).toBe(false)
    expect(
      (await runAs<{ ok: boolean }>(db, superuser, `select public.is_valid_content_block('contact', '{"phone":"+91 98765 43210"}') as ok`)).rows[0].ok,
    ).toBe(false)
  })

  it('leave pages of real businesses unchanged', async () => {
    const p = await publicQr('demoStoreIG')
    expect(p.business?.is_workspace).toBeUndefined()
  })
})

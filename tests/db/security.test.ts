import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anon, asUser, createTestDb, runAs, superuser, type TestDb } from './helpers'

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
})
afterAll(async () => {
  await db?.drop()
})

const ADMIN_TABLES = [
  'admin_users',
  'categories',
  'businesses',
  'business_locations',
  'business_hours',
  'business_social_links',
  'files',
  'qr_codes',
  'content_blocks',
  'qr_scan_events',
  'contact_submissions',
  'audit_logs',
  'app_secrets',
  'admin_business_overview',
  'admin_qr_overview',
  'admin_file_overview',
]

describe('anonymous visitors (Scenario 3, 15)', () => {
  it.each(ADMIN_TABLES)('cannot read %s directly', async (table) => {
    await expect(runAs(db, anon, `select * from public.${table} limit 1`)).rejects.toThrow(/permission denied/)
  })

  it('cannot create a business', async () => {
    await expect(
      runAs(db, anon, `insert into public.businesses (slug, name) values ('hack', 'Hack')`),
    ).rejects.toThrow(/permission denied/)
  })

  it('cannot create, edit or delete QR codes', async () => {
    await expect(runAs(db, anon, `update public.qr_codes set name = 'x'`)).rejects.toThrow(/permission denied/)
    await expect(runAs(db, anon, `delete from public.qr_codes`)).rejects.toThrow(/permission denied/)
  })

  it('cannot call admin analytics or secret-management functions', async () => {
    await expect(runAs(db, anon, `select public.admin_overview_stats()`)).rejects.toThrow(/permission denied/)
    await expect(runAs(db, anon, `select public.check_edge_secret(repeat('a', 40))`)).rejects.toThrow(
      /permission denied/,
    )
    await expect(runAs(db, anon, `select public.generate_public_code()`)).rejects.toThrow(/permission denied/)
    await expect(runAs(db, anon, `select public.set_edge_ingest_secret(repeat('a', 40))`)).rejects.toThrow(
      /permission denied/,
    )
    await expect(runAs(db, anon, `select public.prune_scan_identifiers()`)).rejects.toThrow(/permission denied/)
    await expect(runAs(db, anon, `select public.public_business_payload(gen_random_uuid())`)).rejects.toThrow(
      /permission denied/,
    )
  })

  it('cannot upload to or list storage buckets', async () => {
    await expect(
      runAs(db, anon, `insert into storage.objects (bucket_id, name) values ('public-files', 'x/evil.pdf')`),
    ).rejects.toThrow(/row-level security/)
    const listed = await runAs(db, anon, `select * from storage.objects`)
    expect(listed.rowCount).toBe(0)
  })

  it('can read published content only through get_public_qr', async () => {
    const r = await runAs<{ p: { state: string; business: { name: string } } }>(
      db,
      anon,
      `select public.get_public_qr('demoCafe01') as p`,
    )
    expect(r.rows[0].p.state).toBe('ok')
    expect(r.rows[0].p.business.name).toBe('Chinar Leaf Café (Demo)')
  })
})

describe('signed-in users who are not administrators (Scenario 3)', () => {
  it('see no rows in management tables', async () => {
    const r = await runAs(db, asUser(db.otherUserId), `select * from public.businesses`)
    expect(r.rowCount).toBe(0)
  })

  it('cannot create businesses', async () => {
    await expect(
      runAs(db, asUser(db.otherUserId), `insert into public.businesses (slug, name) values ('nope', 'Nope')`),
    ).rejects.toThrow(/row-level security/)
  })

  it('cannot promote themselves to administrator', async () => {
    await expect(
      runAs(db, asUser(db.otherUserId), `insert into public.admin_users (user_id) values ($1)`, [db.otherUserId]),
    ).rejects.toThrow(/permission denied/)
    const check = await runAs<{ is_admin: boolean }>(db, asUser(db.otherUserId), `select public.is_admin()`)
    expect(check.rows[0].is_admin).toBe(false)
  })

  it('are refused by admin analytics', async () => {
    await expect(runAs(db, asUser(db.otherUserId), `select public.admin_overview_stats()`)).rejects.toThrow(
      /Administrator access required/,
    )
  })

  it('cannot upload files', async () => {
    await expect(
      runAs(
        db,
        asUser(db.otherUserId),
        `insert into storage.objects (bucket_id, name) values ('private-files', 'x/a.pdf')`,
      ),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('administrators', () => {
  it('are recognised by is_admin()', async () => {
    const r = await runAs<{ is_admin: boolean }>(db, asUser(db.adminId), `select public.is_admin()`)
    expect(r.rows[0].is_admin).toBe(true)
  })

  it('can upload to storage', async () => {
    const r = await runAs(
      db,
      asUser(db.adminId),
      `insert into storage.objects (bucket_id, name) values ('private-files', 'shared/a.pdf') returning id`,
    )
    expect(r.rowCount).toBe(1)
  })

  it('cannot edit admin roles through the API either', async () => {
    await expect(
      runAs(db, asUser(db.adminId), `update public.admin_users set role = 'owner'`),
    ).rejects.toThrow(/permission denied/)
  })

  it('cannot overwrite the edge ingest secret', async () => {
    await expect(
      runAs(db, asUser(db.adminId), `select public.set_edge_ingest_secret(repeat('b', 40))`),
    ).rejects.toThrow(/permission denied/)
  })

  it('cannot read stored secrets', async () => {
    await expect(runAs(db, asUser(db.adminId), `select * from public.app_secrets`)).rejects.toThrow(
      /permission denied/,
    )
  })

  it('actions are written to the audit log with the actor', async () => {
    await runAs(db, asUser(db.adminId), `update public.categories set description = 'Audited' where slug = 'events'`)
    const r = await runAs<{ actor_id: string; action: string }>(
      db,
      superuser,
      `select actor_id, action from public.audit_logs where entity_type = 'categories' order by id desc limit 1`,
    )
    expect(r.rows[0]).toEqual({ actor_id: db.adminId, action: 'update' })
  })
})

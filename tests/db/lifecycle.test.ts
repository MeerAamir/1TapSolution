import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anon, asUser, createTestDb, EDGE_SECRET, runAs, superuser, type TestDb } from './helpers'

let db: TestDb
let admin: ReturnType<typeof asUser>

type Payload = {
  state: string
  code?: string
  type?: string
  recorded?: boolean
  destination?: { url?: string; file?: { path: string; title: string } | null }
  business?: { name: string; description?: string }
}

async function publicQr(code: string): Promise<Payload> {
  const r = await runAs<{ p: Payload }>(db, anon, `select public.get_public_qr($1) as p`, [code])
  return r.rows[0].p
}

async function scan(code: string, hash: string | null, secret = EDGE_SECRET): Promise<Payload> {
  const r = await runAs<{ p: Payload }>(
    db,
    anon,
    `select public.edge_resolve_qr($1, $2, 'mobile', 'safari', $3) as p`,
    [secret, code, hash],
  )
  return r.rows[0].p
}

async function scanCount(code: string): Promise<number> {
  const r = await runAs<{ n: string }>(
    db,
    superuser,
    `select count(*) n from qr_scan_events e join qr_codes q on q.id = e.qr_code_id where q.public_code = $1`,
    [code],
  )
  return Number(r.rows[0].n)
}

const hash = (c: string) => c.repeat(64).slice(0, 64)

async function createBusiness(slug: string, name: string): Promise<string> {
  const r = await runAs<{ id: string }>(
    db,
    admin,
    `insert into public.businesses (slug, name, description) values ($1, $2, 'Original description') returning id`,
    [slug, name],
  )
  return r.rows[0].id
}

async function createQr(businessId: string, type: string, destination: object, fileId?: string) {
  const r = await runAs<{ id: string; public_code: string }>(
    db,
    admin,
    `insert into public.qr_codes (business_id, name, type, destination, file_id)
     values ($1, $2, $3, $4, $5) returning id, public_code`,
    [businessId, `${type} QR`, type, JSON.stringify(destination), fileId ?? null],
  )
  return r.rows[0]
}

beforeAll(async () => {
  db = await createTestDb()
  admin = asUser(db.adminId)
})
afterAll(async () => {
  await db?.drop()
})

describe('business management (Scenarios 4, 5, 9, 10)', () => {
  it('creates a business, generates an opaque QR code and edits flow to the public page', async () => {
    const businessId = await createBusiness('acme-bakery', 'Acme Bakery')
    const qr = await createQr(businessId, 'business_profile', {})

    expect(qr.public_code).toMatch(/^[A-Za-z0-9]{10}$/)
    expect((await publicQr(qr.public_code)).business?.description).toBe('Original description')

    await runAs(db, admin, `update public.businesses set name = 'Acme Bakery & Café', description = 'Updated' where id = $1`, [
      businessId,
    ])

    const after = await publicQr(qr.public_code)
    expect(after.business?.name).toBe('Acme Bakery & Café')
    expect(after.business?.description).toBe('Updated')

    const code = await runAs<{ public_code: string }>(db, admin, `select public_code from qr_codes where id = $1`, [qr.id])
    expect(code.rows[0].public_code).toBe(qr.public_code)
  })

  it('refuses to change a public code once issued', async () => {
    const businessId = await createBusiness('fixed-code', 'Fixed Code Ltd')
    const qr = await createQr(businessId, 'business_profile', {})
    await expect(
      runAs(db, admin, `update public.qr_codes set public_code = 'changed123' where id = $1`, [qr.id]),
    ).rejects.toThrow(/permanent/)
  })

  it('generates distinct codes', async () => {
    const r = await runAs<{ c: string }>(db, superuser, `select public.generate_public_code() c from generate_series(1, 500)`)
    expect(new Set(r.rows.map((x) => x.c)).size).toBe(500)
  })
})

describe('transactional business save', () => {
  const save = (actor: ReturnType<typeof asUser>, id: string | null, business: object, social: object[] = []) =>
    runAs<{ id: string }>(
      db,
      actor,
      `select public.admin_save_business($1, $2, $3, $4, $5) as id`,
      [
        id,
        JSON.stringify(business),
        JSON.stringify([{ day_of_week: 0, opens_at: '09:00', closes_at: '17:00' }]),
        JSON.stringify([{ label: 'Main', address: '1 Road', latitude: 10, longitude: 20 }]),
        JSON.stringify(social),
      ],
    )

  it('creates a business with hours, locations and links in one call', async () => {
    const r = await save(admin, null, { name: 'Atomic Ltd', slug: 'atomic-ltd', accent_color: '#112233' }, [
      { platform: 'instagram', url: 'https://instagram.com/x' },
    ])
    const id = r.rows[0].id
    const p = await runAs<{ p: { business: { hours: unknown[]; locations: unknown[]; social_links: unknown[] } } }>(
      db,
      anon,
      `select public.get_public_business('atomic-ltd') p`,
    )
    expect(p.rows[0].p.business.hours).toHaveLength(1)
    expect(p.rows[0].p.business.locations).toHaveLength(1)
    expect(p.rows[0].p.business.social_links).toHaveLength(1)

    // A bad link in the same save rolls back the whole edit, including the name change.
    await expect(
      save(admin, id, { name: 'Renamed', slug: 'atomic-ltd', accent_color: '#112233' }, [{ platform: 'x', url: 'javascript:alert(1)' }]),
    ).rejects.toThrow(/check constraint/)
    const after = await runAs<{ name: string; n: string }>(
      db,
      admin,
      `select b.name, (select count(*) from business_social_links s where s.business_id = b.id) n from businesses b where b.id = $1`,
      [id],
    )
    expect(after.rows[0]).toEqual({ name: 'Atomic Ltd', n: '1' })
  })

  it('is refused for non-administrators', async () => {
    await expect(save(asUser(db.otherUserId), null, { name: 'Nope', slug: 'nope-co' })).rejects.toThrow(
      /Administrator access required/,
    )
    await expect(
      runAs(db, anon, `select public.admin_save_business(null, '{}'::jsonb)`),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('documents (Scenarios 6, 11)', () => {
  it('replacing the PDF behind a document QR serves the new file on the same code', async () => {
    const businessId = await createBusiness('menu-house', 'Menu House')
    const file = await runAs<{ id: string }>(
      db,
      admin,
      `insert into public.files (business_id, bucket, storage_path, title, mime_type, size_bytes)
       values ($1, 'public-files', $2, 'Menu', 'application/pdf', 1000) returning id`,
      [businessId, `${businessId}/aaaaaaaa-1111.pdf`],
    )
    const qr = await createQr(businessId, 'document', {}, file.rows[0].id)
    expect((await publicQr(qr.public_code)).destination?.file?.path).toBe(`${businessId}/aaaaaaaa-1111.pdf`)

    await runAs(
      db,
      admin,
      `update public.files set storage_path = $2, version = version + 1, title = 'Menu (spring)' where id = $1`,
      [file.rows[0].id, `${businessId}/bbbbbbbb-2222.pdf`],
    )
    const after = await publicQr(qr.public_code)
    expect(after.destination?.file?.path).toBe(`${businessId}/bbbbbbbb-2222.pdf`)
    expect(after.destination?.file?.title).toBe('Menu (spring)')
    expect(after.code).toBe(qr.public_code)
  })

  it('blocks deleting a file that a QR code or page still uses', async () => {
    const businessId = await createBusiness('in-use', 'In Use')
    const file = await runAs<{ id: string }>(
      db,
      admin,
      `insert into public.files (business_id, bucket, storage_path, title, mime_type, size_bytes)
       values ($1, 'public-files', $2, 'Brochure', 'application/pdf', 10) returning id`,
      [businessId, `${businessId}/brochure-1.pdf`],
    )
    await createQr(businessId, 'document', {}, file.rows[0].id)
    await expect(runAs(db, admin, `delete from public.files where id = $1`, [file.rows[0].id])).rejects.toThrow(
      /still used/,
    )
  })

  it('never links private files to public pages (Scenario 15)', async () => {
    const businessId = await createBusiness('private-co', 'Private Co')
    const file = await runAs<{ id: string }>(
      db,
      admin,
      `insert into public.files (business_id, bucket, storage_path, title, mime_type, size_bytes)
       values ($1, 'private-files', $2, 'Contract', 'application/pdf', 10) returning id`,
      [businessId, `${businessId}/contract-1.pdf`],
    )
    await expect(createQr(businessId, 'document', {}, file.rows[0].id)).rejects.toThrow(/public bucket/)
    await expect(
      runAs(db, admin, `update public.businesses set logo_file_id = $1 where id = $2`, [file.rows[0].id, businessId]),
    ).rejects.toThrow(/public bucket/)
  })
})

describe('validation (Scenario 16)', () => {
  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['ftp://example.com/file'],
    ['https://'],
    ['https://exa mple.com'],
    ['//example.com'],
  ])('rejects unsafe destination URL %s', async (url) => {
    const businessId = await createBusiness(`url-${Math.random().toString(36).slice(2, 8)}`, 'URL test')
    await expect(createQr(businessId, 'website', { url })).rejects.toThrow(/qr_codes_destination_valid/)
    await expect(
      runAs(db, admin, `update public.businesses set website_url = $1 where id = $2`, [url, businessId]),
    ).rejects.toThrow(/check constraint/)
  })

  it('accepts normal https URLs', async () => {
    const businessId = await createBusiness('url-ok', 'URL OK')
    const qr = await createQr(businessId, 'website', { url: 'https://example.com/path?x=1#top' })
    expect((await publicQr(qr.public_code)).destination?.url).toBe('https://example.com/path?x=1#top')
  })
})

describe('QR lifecycle (Scenarios 12, 13, 14, 19)', () => {
  it('deactivating hides the destination and reveals nothing about the business; reactivating restores it', async () => {
    const businessId = await createBusiness('toggle-shop', 'Toggle Shop')
    const qr = await createQr(businessId, 'business_profile', {})

    await runAs(db, admin, `update public.qr_codes set status = 'inactive' where id = $1`, [qr.id])
    const off = await publicQr(qr.public_code)
    expect(off.state).toBe('unavailable')
    expect(off.business).toBeUndefined()

    await runAs(db, admin, `update public.qr_codes set status = 'active' where id = $1`, [qr.id])
    expect((await publicQr(qr.public_code)).state).toBe('ok')
  })

  it('archiving a QR code or its business makes it unavailable; restoring brings it back', async () => {
    const businessId = await createBusiness('archive-me', 'Archive Me')
    const qr = await createQr(businessId, 'business_profile', {})

    await runAs(db, admin, `update public.qr_codes set archived_at = now() where id = $1`, [qr.id])
    expect((await publicQr(qr.public_code)).state).toBe('unavailable')
    await runAs(db, admin, `update public.qr_codes set archived_at = null where id = $1`, [qr.id])

    await runAs(db, admin, `update public.businesses set archived_at = now() where id = $1`, [businessId])
    expect((await publicQr(qr.public_code)).state).toBe('unavailable')
    const bySlug = await runAs<{ p: Payload }>(db, anon, `select public.get_public_business('archive-me') p`)
    expect(bySlug.rows[0].p.state).toBe('not_found')

    await runAs(db, admin, `update public.businesses set archived_at = null where id = $1`, [businessId])
    expect((await publicQr(qr.public_code)).state).toBe('ok')

    const audit = await runAs<{ action: string }>(
      db,
      superuser,
      `select action from audit_logs where entity_id = $1 order by id`,
      [businessId],
    )
    expect(audit.rows.map((r) => r.action)).toEqual(['insert', 'archive', 'restore'])
  })

  it('deleting a QR code leaves other businesses untouched', async () => {
    const a = await createBusiness('alpha-co', 'Alpha Co')
    const b = await createBusiness('beta-co', 'Beta Co')
    const qa = await createQr(a, 'business_profile', {})
    const qb = await createQr(b, 'business_profile', {})

    await runAs(db, admin, `delete from public.qr_codes where id = $1`, [qa.id])
    expect((await publicQr(qa.public_code)).state).toBe('not_found')
    expect((await publicQr(qb.public_code)).state).toBe('ok')
    const stillThere = await runAs(db, admin, `select 1 from public.businesses where id = $1`, [a])
    expect(stillThere.rowCount).toBe(1)
  })

  it('deleting a business removes its QR codes from public view but keeps unrelated ones', async () => {
    const a = await createBusiness('gone-co', 'Gone Co')
    const b = await createBusiness('stays-co', 'Stays Co')
    const qa = await createQr(a, 'business_profile', {})
    const qb = await createQr(b, 'business_profile', {})

    await runAs(db, admin, `delete from public.businesses where id = $1`, [a])
    expect(await publicQr(qa.public_code)).toEqual({ state: 'not_found' })
    expect((await publicQr(qb.public_code)).state).toBe('ok')
  })

  it.each(['nope', 'doesNotExist99', "'; drop table qr_codes; --", '', 'a'.repeat(200)])(
    'handles missing or invalid code %j',
    async (code) => {
      expect(await publicQr(code)).toEqual({ state: 'not_found' })
    },
  )

  it('Wi-Fi codes are static and never expose credentials publicly', async () => {
    const businessId = await createBusiness('wifi-cafe', 'WiFi Café')
    const qr = await createQr(businessId, 'wifi', { ssid: 'Cafe', encryption: 'WPA', password: 'secret-pass' })
    const p = await publicQr(qr.public_code)
    expect(p.state).toBe('static')
    expect(JSON.stringify(p)).not.toContain('secret-pass')
  })
})

describe('scan analytics (Scenarios 17, 18)', () => {
  it('rejects scan ingestion without the edge secret', async () => {
    await expect(scan('demoCafe01', hash('a'), 'wrong-secret-wrong-secret-wrong-secret')).rejects.toThrow(
      /invalid ingest secret/,
    )
  })

  it('records one event per visit and ignores rapid repeats from the same visitor', async () => {
    const businessId = await createBusiness('scan-shop', 'Scan Shop')
    const qr = await createQr(businessId, 'business_profile', {})

    const first = await scan(qr.public_code, hash('1'))
    expect(first.state).toBe('ok')
    expect(first.recorded).toBe(true)

    const repeat = await scan(qr.public_code, hash('1'))
    expect(repeat.recorded).toBe(false)

    await scan(qr.public_code, hash('2'))
    expect(await scanCount(qr.public_code)).toBe(2)

    // Viewing the page (get_public_qr, what the SPA calls) never records a scan.
    await publicQr(qr.public_code)
    await publicQr(qr.public_code)
    expect(await scanCount(qr.public_code)).toBe(2)
  })

  it('does not record scans for unavailable or static codes', async () => {
    const businessId = await createBusiness('quiet-shop', 'Quiet Shop')
    const qr = await createQr(businessId, 'business_profile', {})
    await runAs(db, admin, `update public.qr_codes set status = 'inactive' where id = $1`, [qr.id])
    expect((await scan(qr.public_code, hash('3'))).recorded).toBe(false)
    expect(await scanCount(qr.public_code)).toBe(0)
  })

  it('reports scans and daily unique visitors to admins', async () => {
    const businessId = await createBusiness('stats-shop', 'Stats Shop')
    const qr = await createQr(businessId, 'website', { url: 'https://example.com' })
    await scan(qr.public_code, hash('a'))
    await scan(qr.public_code, hash('b'))
    await scan(qr.public_code, null)

    const series = await runAs<{ bucket: Date; scans: string; unique_visitors: string }>(
      db,
      admin,
      `select * from public.admin_scan_series(now() - interval '2 days', now() + interval '1 minute', 'day', 'UTC', $1)`,
      [qr.id],
    )
    const totals = series.rows.reduce(
      (acc, r) => ({ scans: acc.scans + Number(r.scans), uniq: acc.uniq + Number(r.unique_visitors) }),
      { scans: 0, uniq: 0 },
    )
    expect(totals).toEqual({ scans: 3, uniq: 2 })

    const top = await runAs<{ qr_code_id: string; scans: string }>(
      db,
      admin,
      `select * from public.admin_top_qr_codes(now() - interval '1 day', now() + interval '1 minute', 50, $1)`,
      [businessId],
    )
    expect(top.rows).toEqual([expect.objectContaining({ qr_code_id: qr.id, scans: '3' })])

    const breakdown = await runAs<{ label: string; scans: string }>(
      db,
      admin,
      `select * from public.admin_scan_breakdown('device', now() - interval '1 day', now() + interval '1 minute', $1)`,
      [qr.id],
    )
    expect(breakdown.rows).toEqual([{ label: 'mobile', scans: '3' }])
  })

  it('falls back to UTC for unknown or legacy time-zone names instead of failing', async () => {
    const r = await runAs<{ n: string }>(
      db,
      admin,
      `select count(*) n from public.admin_scan_series(now() - interval '2 days', now(), 'day', 'Not/A_Zone')`,
    )
    expect(Number(r.rows[0].n)).toBeGreaterThan(0)
  })

  it('never stores IP addresses: the schema has no column for one', async () => {
    const cols = await runAs<{ column_name: string }>(
      db,
      superuser,
      `select column_name from information_schema.columns where table_name = 'qr_scan_events'`,
    )
    expect(cols.rows.map((c) => c.column_name)).not.toContain('ip_address')
  })
})

describe('contact form', () => {
  it('accepts valid submissions and rate-limits repeats from one address', async () => {
    const submit = () =>
      runAs<{ r: string }>(
        db,
        anon,
        `select public.submit_contact_form($1, 'Sara', 'sara@example.com', null, null, 'I would like a demo please.', $2) as r`,
        [EDGE_SECRET, hash('c')],
      )
    expect((await submit()).rows[0].r).toBe('ok')
    expect((await submit()).rows[0].r).toBe('ok')
    expect((await submit()).rows[0].r).toBe('ok')
    expect((await submit()).rows[0].r).toBe('rate_limited')
  })

  it('validates the email address server-side', async () => {
    await expect(
      runAs(
        db,
        anon,
        `select public.submit_contact_form($1, 'X', 'not-an-email', null, null, 'Hello there, valid length.', null)`,
        [EDGE_SECRET],
      ),
    ).rejects.toThrow(/check constraint/)
  })
})

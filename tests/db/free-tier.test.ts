import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anon, asUser, createTestDb, runAs, superuser, type TestDb } from './helpers'

let db: TestDb
let admin: ReturnType<typeof asUser>

beforeAll(async () => {
  db = await createTestDb()
  admin = asUser(db.adminId)
})
afterAll(async () => {
  await db?.drop()
})

describe('keep-alive heartbeat', () => {
  it('can be called with the public key and writes to the database', async () => {
    const r = await runAs<{ k: { ok: boolean; beats: number } }>(db, anon, `select public.keep_alive('test') as k`)
    expect(r.rows[0].k.ok).toBe(true)
    const row = await runAs<{ beats: string; source: string }>(db, superuser, `select beats, source from app_heartbeat`)
    expect(row.rows[0]).toEqual({ beats: '1', source: 'test' })
  })

  it('writes at most once a minute however often it is called', async () => {
    for (let i = 0; i < 5; i++) await runAs(db, anon, `select public.keep_alive('spam')`)
    const row = await runAs<{ beats: string }>(db, superuser, `select beats from app_heartbeat`)
    expect(row.rows[0].beats).toBe('1')
  })

  it('exposes nothing else to the public', async () => {
    await expect(runAs(db, anon, `select * from public.app_heartbeat`)).rejects.toThrow(/permission denied/)
    await expect(runAs(db, anon, `select * from public.qr_scan_daily`)).rejects.toThrow(/permission denied/)
    await expect(runAs(db, anon, `select public.compact_scan_events(90)`)).rejects.toThrow(/permission denied/)
    await expect(runAs(db, anon, `select public.admin_usage()`)).rejects.toThrow(/permission denied/)
    await expect(runAs(db, asUser(db.otherUserId), `select public.admin_usage()`)).rejects.toThrow(/Administrator access required/)
  })
})

describe('scan compaction keeps totals while bounding database size', () => {
  it('rolls old events into daily totals without changing any figure', async () => {
    const q = await runAs<{ id: string; business_id: string }>(
      db,
      superuser,
      `select id, business_id from qr_codes where public_code = 'demoCafe01'`,
    )
    const { id, business_id } = q.rows[0]
    // 3 old days and 1 recent day of scans from two visitors on mobile/desktop.
    await runAs(
      db,
      superuser,
      `insert into qr_scan_events (qr_code_id, business_id, qr_type, occurred_at, device_category, browser_category, visitor_hash)
       select $1, $2, 'business_profile', now() - (d || ' days')::interval + (i || ' minutes')::interval,
              case when i % 2 = 0 then 'mobile' else 'desktop' end, 'chrome', repeat(case when i % 2 = 0 then 'a' else 'b' end, 64)
         from unnest(array[200, 150, 120, 5]) d, generate_series(1, 4) i`,
      [id, business_id],
    )

    const snapshot = async () => {
      const series = await runAs<{ scans: string; unique_visitors: string }>(
        db,
        admin,
        `select * from public.admin_scan_series(now() - interval '400 days', now() + interval '1 minute', 'month', 'UTC', $1)`,
        [id],
      )
      const sum = series.rows.reduce(
        (a, r) => ({ scans: a.scans + Number(r.scans), uniq: a.uniq + Number(r.unique_visitors) }),
        { scans: 0, uniq: 0 },
      )
      const top = await runAs<{ scans: string }>(
        db,
        admin,
        `select scans from public.admin_top_qr_codes(now() - interval '400 days', now() + interval '1 minute', 5, $1)`,
        [business_id],
      )
      const devices = await runAs<{ label: string; scans: string }>(
        db,
        admin,
        `select * from public.admin_scan_breakdown('device', now() - interval '400 days', now() + interval '1 minute', $1) order by label`,
        [id],
      )
      const view = await runAs<{ scan_count: string }>(db, admin, `select scan_count from admin_qr_overview where id = $1`, [id])
      const stats = await runAs<{ s: { scans_total: number } }>(db, admin, `select public.admin_overview_stats() s`)
      return { sum, top: top.rows[0].scans, devices: devices.rows, view: view.rows[0].scan_count, total: Number(stats.rows[0].s.scans_total) }
    }

    const before = await snapshot()
    expect(before.sum).toEqual({ scans: 16, uniq: 8 })

    const deleted = await runAs<{ n: number }>(db, superuser, `select public.compact_scan_events(90) n`)
    expect(deleted.rows[0].n).toBe(12)
    const remaining = await runAs<{ n: string }>(db, superuser, `select count(*) n from qr_scan_events where qr_code_id = $1`, [id])
    expect(remaining.rows[0].n).toBe('4')

    expect(await snapshot()).toEqual(before)
  })
})

describe('automatic compaction from the keep-alive', () => {
  it('runs at most once a day, without any extra scheduler', async () => {
    const q = await runAs<{ id: string; business_id: string }>(db, superuser, `select id, business_id from qr_codes where public_code = 'demoHotel01'`)
    await runAs(
      db,
      superuser,
      `insert into qr_scan_events (qr_code_id, business_id, qr_type, occurred_at) values ($1, $2, 'business_profile', now() - interval '120 days')`,
      [q.rows[0].id, q.rows[0].business_id],
    )
    await runAs(db, superuser, `update app_heartbeat set last_beat = 'epoch', last_compaction = 'epoch'`)
    const r = await runAs<{ k: { compacted: number } }>(db, anon, `select public.keep_alive('cron') k`)
    expect(r.rows[0].k.compacted).toBe(1)
    const old = await runAs<{ n: string }>(db, superuser, `select count(*) n from qr_scan_events where occurred_at < now() - interval '91 days'`)
    expect(old.rows[0].n).toBe('0')

    await runAs(db, superuser, `update app_heartbeat set last_beat = 'epoch'`)
    const again = await runAs<{ k: { compacted: number | null } }>(db, anon, `select public.keep_alive('cron') k`)
    expect(again.rows[0].k.compacted).toBeNull()
  })
})

describe('usage meter', () => {
  it('reports database and file sizes to administrators', async () => {
    const r = await runAs<{ u: { database_bytes: number; file_bytes: number; last_heartbeat: string } }>(
      db,
      admin,
      `select public.admin_usage() u`,
    )
    expect(r.rows[0].u.database_bytes).toBeGreaterThan(1_000_000)
    expect(r.rows[0].u.file_bytes).toBeGreaterThanOrEqual(0)
    expect(r.rows[0].u.last_heartbeat).toBeTruthy()
  })
})

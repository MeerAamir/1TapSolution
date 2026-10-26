import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

/**
 * Integration-test harness: builds a throw-away database from the Supabase
 * shim + real migrations + seed, then lets tests run SQL "as" anon,
 * an authenticated non-admin, or an admin — exactly how PostgREST would
 * (SET LOCAL ROLE + request.jwt.claims), so RLS and grants are exercised.
 */

const ROOT = join(__dirname, '..', '..')
const BASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/postgres'

export const EDGE_SECRET = 'test-edge-secret-0123456789abcdefghijklmnop'

export interface TestDb {
  pool: pg.Pool
  name: string
  adminId: string
  otherUserId: string
  drop: () => Promise<void>
}

function sqlFiles(): string[] {
  const migrations = readdirSync(join(ROOT, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(ROOT, 'supabase', 'migrations', f))
  return [join(ROOT, 'tests', 'db', 'supabase-shim.sql'), ...migrations, join(ROOT, 'supabase', 'seed.sql')]
}

export async function createTestDb(): Promise<TestDb> {
  const name = `onetap_it_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
  const root = new pg.Client({ connectionString: BASE_URL })
  await root.connect()
  await root.query(`create database ${name}`)
  await root.end()

  const url = new URL(BASE_URL)
  url.pathname = `/${name}`
  const pool = new pg.Pool({ connectionString: url.toString(), max: 4 })

  for (const file of sqlFiles()) {
    await pool.query(readFileSync(file, 'utf8'))
  }

  const admin = await pool.query<{ id: string }>(
    `insert into auth.users (email) values ('admin@test.local') returning id`,
  )
  const other = await pool.query<{ id: string }>(
    `insert into auth.users (email) values ('someone@test.local') returning id`,
  )
  await pool.query(`insert into public.admin_users (user_id, role) values ($1, 'owner')`, [admin.rows[0].id])
  await pool.query(`select public.set_edge_ingest_secret($1)`, [EDGE_SECRET])

  return {
    pool,
    name,
    adminId: admin.rows[0].id,
    otherUserId: other.rows[0].id,
    drop: async () => {
      await pool.end()
      const c = new pg.Client({ connectionString: BASE_URL })
      await c.connect()
      await c.query(`drop database if exists ${name} with (force)`)
      await c.end()
    },
  }
}

export type Actor = { role: 'anon' } | { role: 'authenticated'; userId: string } | { role: 'postgres' }

/** Run one statement as the given API role inside its own transaction. */
export async function runAs<T extends pg.QueryResultRow = pg.QueryResultRow>(
  db: TestDb,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const client = await db.pool.connect()
  try {
    await client.query('begin')
    if (actor.role !== 'postgres') {
      const claims = actor.role === 'authenticated' ? { sub: actor.userId, role: 'authenticated' } : { role: 'anon' }
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
      await client.query(`set local role ${actor.role}`)
    }
    const result = await client.query<T>(sql, params)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const anon: Actor = { role: 'anon' }
export const asUser = (userId: string): Actor => ({ role: 'authenticated', userId })
export const superuser: Actor = { role: 'postgres' }

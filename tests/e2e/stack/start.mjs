// Boots a complete local stack for browser tests:
//   Postgres (already running) + Supabase Auth + PostgREST + gateway
//   + the built site served by Wrangler (Cloudflare Pages runtime, incl. Functions).
// Usage: node tests/e2e/stack/start.mjs   (see docs/TESTING.md for prerequisites)
import { spawn, spawnSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const ROOT = new URL('../../../', import.meta.url).pathname
const BIN = process.env.E2E_BIN_DIR
if (!BIN) throw new Error('Set E2E_BIN_DIR to the folder holding postgrest and auth/ (see docs/TESTING.md)')
const PG_BASE = process.env.E2E_PG_URL ?? 'postgresql://postgres@127.0.0.1:54329'
const DB = 'onetap_e2e'
const JWT_SECRET = 'e2e-jwt-secret-' + 'x'.repeat(40)
const INGEST = 'e2e-ingest-secret-' + randomBytes(16).toString('hex')
const GATEWAY = 'http://127.0.0.1:54400'
const SITE = 'http://127.0.0.1:8788'
export const ADMIN = { email: 'admin@e2e.test', password: 'Correct-Horse-Battery-9' }
export const OTHER = { email: 'someone@e2e.test', password: 'Another-Long-Password-1' }

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function jwt(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ iss: 'supabase', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 * 24, ...payload })
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
const ANON_KEY = jwt({ role: 'anon' })
const SERVICE_KEY = jwt({ role: 'service_role' })

async function sql(db, text) {
  const c = new pg.Client({ connectionString: `${PG_BASE}/${db}` })
  await c.connect()
  try {
    return await c.query(text)
  } finally {
    await c.end()
  }
}

async function waitFor(url, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.status < 500) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${label} did not start (${url})`)
}

const children = []
function start(cmd, args, env, label, cwd = ROOT) {
  const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  p.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(`[${label}] ${d}`))
  p.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(`[${label}] ${d}`))
  children.push(p)
  return p
}

// 1. Database
await sql('postgres', `drop database if exists ${DB} with (force)`)
await sql('postgres', `create database ${DB}`)
await sql(DB, readFileSync(join(ROOT, 'tests/e2e/stack/prepare.sql'), 'utf8'))

// 2. Supabase Auth schema
const authEnv = {
  GOTRUE_API_HOST: '127.0.0.1',
  PORT: '9999',
  API_EXTERNAL_URL: `${GATEWAY}/auth/v1`,
  GOTRUE_DB_DRIVER: 'postgres',
  DATABASE_URL: `${PG_BASE}/${DB}?search_path=auth&sslmode=disable`,
  GOTRUE_SITE_URL: SITE,
  GOTRUE_URI_ALLOW_LIST: `${SITE}/**`,
  GOTRUE_JWT_SECRET: JWT_SECRET,
  GOTRUE_JWT_EXP: '3600',
  GOTRUE_JWT_AUD: 'authenticated',
  GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
  GOTRUE_JWT_ADMIN_ROLES: 'service_role',
  GOTRUE_DISABLE_SIGNUP: 'true',
  GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
  GOTRUE_MAILER_AUTOCONFIRM: 'true',
  GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000',
  DB_NAMESPACE: 'auth',
  GOTRUE_LOG_LEVEL: 'warn',
}
const migrate = spawnSync(join(BIN, 'auth/auth'), ['migrate'], { env: { ...process.env, ...authEnv }, cwd: join(BIN, 'auth'), encoding: 'utf8' })
if (migrate.status !== 0) throw new Error(`auth migrate failed: ${migrate.stderr || migrate.stdout}`)

// 3. Our migrations + seed + ingest secret
for (const f of readdirSync(join(ROOT, 'supabase/migrations')).sort()) {
  await sql(DB, readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'))
}
await sql(DB, readFileSync(join(ROOT, 'supabase/seed.sql'), 'utf8'))
await sql(DB, `select public.set_edge_ingest_secret('${INGEST}')`)
await sql(DB, `notify pgrst, 'reload schema'`)

// 4. Services
start(join(BIN, 'auth/auth'), ['serve'], authEnv, 'auth', join(BIN, 'auth'))
start(join(BIN, 'postgrest'), [], {
  PGRST_DB_URI: `${PG_BASE.replace('postgres@', 'authenticator@')}/${DB}`,
  PGRST_DB_SCHEMAS: 'public',
  PGRST_DB_ANON_ROLE: 'anon',
  PGRST_JWT_SECRET: JWT_SECRET,
  PGRST_SERVER_PORT: '3000',
  PGRST_SERVER_HOST: '127.0.0.1',
}, 'postgrest')
start('node', [join(ROOT, 'tests/e2e/stack/gateway.mjs')], {}, 'gateway')
await waitFor('http://127.0.0.1:9999/health', 'auth')
await waitFor('http://127.0.0.1:3000/', 'postgrest')
await waitFor(`${GATEWAY}/rest/v1/`, 'gateway')

// 5. Users: an administrator (created like the dashboard would) and a non-admin.
for (const u of [ADMIN, OTHER]) {
  const r = await fetch(`${GATEWAY}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: u.password, email_confirm: true }),
  })
  if (!r.ok) throw new Error(`create user failed: ${await r.text()}`)
}
await sql(DB, `insert into public.admin_users (user_id, role) select id, 'owner' from auth.users where email = '${ADMIN.email}'`)

// 6. Build and serve the site through the Cloudflare Pages runtime.
const build = spawnSync('npx', ['vite', 'build'], {
  cwd: ROOT,
  env: { ...process.env, VITE_SUPABASE_URL: GATEWAY, VITE_SUPABASE_ANON_KEY: ANON_KEY, VITE_PUBLIC_APP_URL: SITE, VITE_CONTACT_EMAIL: '' },
  encoding: 'utf8',
})
if (build.status !== 0) throw new Error(`build failed: ${build.stderr}`)
start('npx', [
  'wrangler', 'pages', 'dev', 'dist', '--port', '8788', '--ip', '127.0.0.1',
  '--binding', `SUPABASE_URL=${GATEWAY}`,
  '--binding', `SUPABASE_ANON_KEY=${ANON_KEY}`,
  '--binding', `EDGE_INGEST_SECRET=${INGEST}`,
  '--compatibility-date', '2026-10-01',
], { WRANGLER_SEND_METRICS: 'false', CI: '1' }, 'wrangler')
await waitFor(`${SITE}/`, 'wrangler', 120)

writeFileSync(join(ROOT, 'tests/e2e/.stack.json'), JSON.stringify({ SITE, GATEWAY, DB_URL: `${PG_BASE}/${DB}`, ADMIN, OTHER, ANON_KEY }, null, 2))
console.log(`E2E stack ready at ${SITE}`)

const stop = () => {
  children.forEach((c) => c.kill('SIGTERM'))
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

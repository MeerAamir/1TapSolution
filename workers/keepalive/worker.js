/**
 * 1 Tap Solution — keep-alive Worker (Cloudflare Workers, free plan).
 *
 * Supabase pauses Free projects after about a week without database activity.
 * This Worker runs on a schedule (see wrangler.toml, every 6 hours) and makes a
 * small database write through public.keep_alive(), so the project never looks
 * inactive. Opening the Worker's URL in a browser runs the same check and shows
 * whether the database and website are reachable.
 *
 * Required variables (Settings → Variables and secrets):
 *   SUPABASE_URL       https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY  the public anon / publishable key
 * Optional:
 *   SITE_URL           https://<your-domain>  (also checked for availability)
 */

function keyHeaders(key) {
  // New publishable keys go in `apikey` only; legacy anon keys (JWTs) also as Bearer.
  return key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key }
}

async function beat(env, source) {
  const result = { ok: false, database: 'unknown', site: 'not checked', at: new Date().toISOString() }
  try {
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/keep_alive`, {
      method: 'POST',
      headers: { ...keyHeaders(env.SUPABASE_ANON_KEY), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_source: source }),
    })
    result.database = res.ok ? 'ok' : `error ${res.status}`
    if (res.ok) result.heartbeat = await res.json()
  } catch (e) {
    result.database = `unreachable: ${e instanceof Error ? e.message : String(e)}`
  }
  if (env.SITE_URL) {
    try {
      const site = await fetch(env.SITE_URL, { method: 'GET', redirect: 'follow' })
      result.site = site.ok ? 'ok' : `error ${site.status}`
    } catch (e) {
      result.site = `unreachable: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  result.ok = result.database === 'ok' && (result.site === 'ok' || result.site === 'not checked')
  return result
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      beat(env, 'cloudflare-cron').then((r) => {
        if (!r.ok) console.error('Keep-alive problem', JSON.stringify(r))
      }),
    )
  },
  async fetch(_request, env) {
    const r = await beat(env, 'manual-check')
    return new Response(JSON.stringify(r, null, 2), {
      status: r.ok ? 200 : 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  },
}

/**
 * Edge request handlers (Cloudflare Pages Functions call these).
 * Kept free of Cloudflare-specific globals so they can be unit-tested with a
 * plain Request and a fake fetch.
 */
import { redirectUrlFor } from '../qr/destinations'
import { QR_TYPES, type QrType } from '../qr/types'
import { contactSchema } from '../validation/contact'
import { supabaseKeyHeaders } from './supabase-headers'
import { browserCategory, dailyVisitorHash, deviceCategory, ipHash, isBot } from './user-agent'

export interface EdgeEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  /** Shared with the database (public.set_edge_ingest_secret). Server-only. */
  EDGE_INGEST_SECRET?: string
  /** Optional separate secret for visitor hashing; falls back to EDGE_INGEST_SECRET. */
  VISITOR_HASH_SECRET?: string
  /** "on" to serve public files via /f/ through Cloudflare's cache. */
  FILE_PROXY?: string
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface QrPayload {
  state: 'ok' | 'not_found' | 'unavailable' | 'static'
  code?: string
  type?: QrType
  destination?: Record<string, unknown> & { file?: { path: string; version?: number } | null }
  business?: Record<string, unknown>
  recorded?: boolean
}

const NO_STORE = 'no-store, max-age=0'

function rpc(env: EdgeEnv, fetchImpl: FetchLike, fn: string, body: unknown): Promise<Response> {
  return fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...supabaseKeyHeaders(env.SUPABASE_ANON_KEY ?? ''), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
}

function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    '0.0.0.0'
  )
}

/**
 * Resolve a QR code and (for real visitors) record exactly one scan.
 * Falls back to a read-only lookup if the ingest secret is not configured, so
 * public pages keep working even when analytics are misconfigured.
 */
export async function resolveQr(
  code: string,
  request: Request,
  env: EdgeEnv,
  fetchImpl: FetchLike = fetch,
): Promise<QrPayload | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(code)) return { state: 'not_found' }

  const ua = request.headers.get('User-Agent') ?? ''
  const url = new URL(request.url)
  const record = request.method === 'GET' && !isBot(ua) && url.searchParams.get('preview') !== '1'

  try {
    if (env.EDGE_INGEST_SECRET) {
      const visitorHash = record
        ? await dailyVisitorHash(env.VISITOR_HASH_SECRET || env.EDGE_INGEST_SECRET, clientIp(request), ua)
        : null
      const res = await rpc(env, fetchImpl, 'edge_resolve_qr', {
        p_secret: env.EDGE_INGEST_SECRET,
        p_code: code,
        p_device: deviceCategory(ua),
        p_browser: browserCategory(ua),
        p_visitor_hash: visitorHash,
        p_record: record,
      })
      if (res.ok) return (await res.json()) as QrPayload
    }
    const res = await rpc(env, fetchImpl, 'get_public_qr', { p_code: code })
    return res.ok ? ((await res.json()) as QrPayload) : null
  } catch {
    return null
  }
}

/** Where to send the visitor straight away, or null to render the page. */
export function redirectTarget(payload: QrPayload, supabaseUrl: string, fileBase?: string): string | null {
  if (payload.state !== 'ok' || !payload.type || !QR_TYPES.includes(payload.type)) return null
  if (payload.type === 'document') {
    const file = payload.destination?.file
    if (payload.destination?.open_mode === 'direct' && file?.path) {
      const path = file.path.split('/').map(encodeURIComponent).join('/')
      const base = fileBase ?? `${supabaseUrl}/storage/v1/object/public/public-files`
      return `${base}/${path}${file.version ? `?v=${file.version}` : ''}`
    }
    return null
  }
  return redirectUrlFor(payload.type, payload.destination)
}

/** Embed the payload into index.html so the page renders without a second round trip. */
export function serializePayload(payload: QrPayload): string {
  const LS = String.fromCharCode(0x2028)
  const PS = String.fromCharCode(0x2029)
  return JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(LS)
    .join('\\u2028')
    .split(PS)
    .join('\\u2029')
}

export function injectPayload(html: string, payload: QrPayload): string {
  const tag = `<script id="__QR_PAYLOAD__" type="application/json">${serializePayload(payload)}</script>`
  return html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : tag + html
}

export async function handleQrRequest(
  request: Request,
  code: string,
  env: EdgeEnv,
  loadIndexHtml: () => Promise<string>,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  const payload = await resolveQr(code, request, env, fetchImpl)
  const baseHeaders = {
    'Cache-Control': NO_STORE,
    'X-Robots-Tag': 'noindex',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }

  if (payload && env.SUPABASE_URL) {
    const fileBase = env.FILE_PROXY === 'on' ? `${new URL(request.url).origin}/f` : undefined
    const target = redirectTarget(payload, env.SUPABASE_URL, fileBase)
    if (target) {
      return new Response(null, { status: 302, headers: { ...baseHeaders, Location: target } })
    }
  }

  const html = await loadIndexHtml()
  const status = payload?.state === 'not_found' ? 404 : payload?.state === 'unavailable' ? 410 : 200
  return new Response(payload ? injectPayload(html, payload) : html, {
    status,
    headers: { ...baseHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': NO_STORE },
  })
}

/** POST /api/contact — validated, same-origin only, honeypot + timing + rate limit. */
export async function handleContactRequest(request: Request, env: EdgeEnv, fetchImpl: FetchLike = fetch): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const origin = request.headers.get('Origin')
  if (!origin || new URL(origin).host !== new URL(request.url).host) {
    return json(403, { error: 'Cross-origin submissions are not accepted' })
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.EDGE_INGEST_SECRET) {
    return json(503, { error: 'The contact form is not configured yet.' })
  }

  const raw = await request.text()
  if (raw.length > 12_000) return json(413, { error: 'Message is too long' })

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return json(400, { error: 'Invalid request' })
  }

  // Bots fill hidden fields and submit instantly. Pretend success so they learn nothing.
  const elapsed = Date.now() - Number(body.startedAt ?? 0)
  if ((typeof body.website === 'string' && body.website.trim() !== '') || !Number.isFinite(elapsed) || elapsed < 3000) {
    return json(200, { ok: true })
  }

  const parsed = contactSchema.safeParse(body)
  if (!parsed.success) {
    return json(400, { error: parsed.error.issues[0]?.message ?? 'Check the form and try again' })
  }

  const v = parsed.data
  const res = await rpc(env, fetchImpl, 'submit_contact_form', {
    p_secret: env.EDGE_INGEST_SECRET,
    p_name: v.name,
    p_email: v.email,
    p_phone: v.phone || null,
    p_company: v.company || null,
    p_message: v.message,
    p_ip_hash: await ipHash(env.EDGE_INGEST_SECRET, clientIp(request)),
  })
  if (!res.ok) return json(502, { error: 'Your message could not be sent. Try again in a few minutes.' })
  const result = (await res.json()) as string
  if (result === 'rate_limited') {
    return json(429, { error: 'Too many messages from this connection. Try again in an hour.' })
  }
  return json(200, { ok: true })
}

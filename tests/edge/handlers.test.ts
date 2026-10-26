// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { handleFileRequest } from '@/lib/edge/files'
import { handleContactRequest, handleQrRequest, injectPayload, redirectTarget, type EdgeEnv, type QrPayload } from '@/lib/edge/handlers'

const ENV: EdgeEnv = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  EDGE_INGEST_SECRET: 'x'.repeat(40),
}
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const INDEX = '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>'

function fakeSupabase(payload: QrPayload | ((fn: string, body: Record<string, unknown>) => unknown)) {
  const calls: Array<{ fn: string; body: Record<string, unknown> }> = []
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const fn = url.split('/rpc/')[1]
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    calls.push({ fn, body })
    const result = typeof payload === 'function' ? payload(fn, body) : payload
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  return { fetchImpl, calls }
}

const request = (path: string, ua = IPHONE, headers: Record<string, string> = {}) =>
  new Request(`https://1tap.example${path}`, { headers: { 'User-Agent': ua, 'CF-Connecting-IP': '203.0.113.7', ...headers } })

describe('GET /q/:code (Scenarios 8, 17, 19)', () => {
  it('redirects website codes with 302 and no caching, after recording the scan server-side', async () => {
    const { fetchImpl, calls } = fakeSupabase({ state: 'ok', code: 'AbC123xyz9', type: 'website', destination: { url: 'https://example.com/menu' }, recorded: true })
    const res = await handleQrRequest(request('/q/AbC123xyz9'), 'AbC123xyz9', ENV, async () => INDEX, fetchImpl)

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://example.com/menu')
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(calls).toHaveLength(1)
    expect(calls[0].fn).toBe('edge_resolve_qr')
    expect(calls[0].body).toMatchObject({ p_code: 'AbC123xyz9', p_device: 'mobile', p_browser: 'safari', p_record: true })
    expect(calls[0].body.p_visitor_hash).toMatch(/^[0-9a-f]{64}$/)
    // The raw IP never leaves the edge.
    expect(JSON.stringify(calls[0].body)).not.toContain('203.0.113.7')
  })

  it('builds WhatsApp and Maps redirects from stored data', async () => {
    const wa = fakeSupabase({ state: 'ok', code: 'waCode123', type: 'whatsapp', destination: { phone: '+91 98765 43210', message: 'Hi there' } })
    const r1 = await handleQrRequest(request('/q/waCode123'), 'waCode123', ENV, async () => INDEX, wa.fetchImpl)
    expect(r1.headers.get('Location')).toBe('https://wa.me/919876543210?text=Hi%20there')

    const maps = fakeSupabase({ state: 'ok', code: 'mapCode12', type: 'maps', destination: { latitude: 34.08, longitude: 74.79 } })
    const r2 = await handleQrRequest(request('/q/mapCode12'), 'mapCode12', ENV, async () => INDEX, maps.fetchImpl)
    expect(r2.headers.get('Location')).toBe('https://www.google.com/maps/search/?api=1&query=34.08,74.79')
  })

  it('never redirects to unsafe schemes even if stored data were tampered with', async () => {
    const { fetchImpl } = fakeSupabase({ state: 'ok', code: 'evilCode1', type: 'website', destination: { url: 'javascript:alert(1)' } })
    const res = await handleQrRequest(request('/q/evilCode1'), 'evilCode1', ENV, async () => INDEX, fetchImpl)
    expect(res.status).toBe(200)
    expect(res.headers.get('Location')).toBeNull()
  })

  it('serves the app shell with embedded data for page types (no second request needed)', async () => {
    const payload: QrPayload = { state: 'ok', code: 'demoCafe01', type: 'business_profile', destination: {}, business: { name: 'Café </script><script>alert(1)</script>' } }
    const { fetchImpl } = fakeSupabase(payload)
    const res = await handleQrRequest(request('/q/demoCafe01'), 'demoCafe01', ENV, async () => INDEX, fetchImpl)
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(html).toContain('<script id="__QR_PAYLOAD__" type="application/json">')
    // Injection-safe: no raw "</script>" from data can close the tag.
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    const json = html.split('type="application/json">')[1].split('</script>')[0]
    expect(JSON.parse(json).business.name).toBe('Café </script><script>alert(1)</script>')
  })

  it('direct-open document codes redirect to the current file version', async () => {
    const { fetchImpl } = fakeSupabase({
      state: 'ok',
      code: 'docCode12',
      type: 'document',
      destination: { open_mode: 'direct', file: { path: 'biz/abc-123.pdf', version: 3 } },
    })
    const res = await handleQrRequest(request('/q/docCode12'), 'docCode12', ENV, async () => INDEX, fetchImpl)
    expect(res.headers.get('Location')).toBe('https://proj.supabase.co/storage/v1/object/public/public-files/biz/abc-123.pdf?v=3')
  })

  it('returns 404 for unknown codes and 410 for paused ones, with the branded page', async () => {
    const nf = fakeSupabase({ state: 'not_found' })
    expect((await handleQrRequest(request('/q/unknown99'), 'unknown99', ENV, async () => INDEX, nf.fetchImpl)).status).toBe(404)
    const un = fakeSupabase({ state: 'unavailable', code: 'paused123' })
    expect((await handleQrRequest(request('/q/paused123'), 'paused123', ENV, async () => INDEX, un.fetchImpl)).status).toBe(410)
  })

  it('rejects malformed codes without touching the database', async () => {
    const { fetchImpl } = fakeSupabase({ state: 'ok' })
    const res = await handleQrRequest(request('/q/%3Cscript%3E'), '<script>', ENV, async () => INDEX, fetchImpl)
    expect(res.status).toBe(404)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not count link-preview bots or dashboard test opens', async () => {
    const bot = fakeSupabase({ state: 'ok', code: 'AbC123xyz9', type: 'website', destination: { url: 'https://example.com' } })
    await handleQrRequest(request('/q/AbC123xyz9', 'WhatsApp/2.23.20.0 A'), 'AbC123xyz9', ENV, async () => INDEX, bot.fetchImpl)
    expect(bot.calls[0].body.p_record).toBe(false)

    const preview = fakeSupabase({ state: 'ok', code: 'AbC123xyz9', type: 'website', destination: { url: 'https://example.com' } })
    await handleQrRequest(request('/q/AbC123xyz9?preview=1'), 'AbC123xyz9', ENV, async () => INDEX, preview.fetchImpl)
    expect(preview.calls[0].body.p_record).toBe(false)
  })

  it('keeps working read-only when the ingest secret is not configured', async () => {
    const { fetchImpl, calls } = fakeSupabase({ state: 'ok', code: 'AbC123xyz9', type: 'website', destination: { url: 'https://example.com' } })
    const res = await handleQrRequest(request('/q/AbC123xyz9'), 'AbC123xyz9', { ...ENV, EDGE_INGEST_SECRET: undefined }, async () => INDEX, fetchImpl)
    expect(res.status).toBe(302)
    expect(calls.map((c) => c.fn)).toEqual(['get_public_qr'])
  })

  it('serves the shell (client fallback) if the database is unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })
    const res = await handleQrRequest(request('/q/AbC123xyz9'), 'AbC123xyz9', ENV, async () => INDEX, fetchImpl)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(INDEX)
  })
})

describe('redirectTarget', () => {
  it('returns null for page types', () => {
    for (const type of ['business_profile', 'phone', 'email', 'contact_card', 'landing_page'] as const) {
      expect(redirectTarget({ state: 'ok', type, destination: { phone: '+911234567', email: 'a@b.co' } }, ENV.SUPABASE_URL!)).toBeNull()
    }
  })
  it('injectPayload falls back when there is no head tag', () => {
    expect(injectPayload('<div></div>', { state: 'not_found' })).toContain('__QR_PAYLOAD__')
  })
})

describe('POST /api/contact', () => {
  const post = (body: unknown, origin = 'https://1tap.example') =>
    new Request('https://1tap.example/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': '198.51.100.4' },
      body: JSON.stringify(body),
    })
  const valid = { name: 'Sara', email: 'sara@example.com', message: 'Please send me pricing for 3 cafés.', startedAt: Date.now() - 10_000 }

  it('stores valid messages via the RPC', async () => {
    const { fetchImpl, calls } = fakeSupabase(() => 'ok')
    const res = await handleContactRequest(post(valid), ENV, fetchImpl)
    expect(res.status).toBe(200)
    expect(calls[0].fn).toBe('submit_contact_form')
    expect(calls[0].body.p_ip_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects cross-origin posts', async () => {
    const { fetchImpl } = fakeSupabase(() => 'ok')
    const res = await handleContactRequest(post(valid, 'https://evil.example'), ENV, fetchImpl)
    expect(res.status).toBe(403)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('silently drops honeypot and too-fast submissions', async () => {
    const { fetchImpl } = fakeSupabase(() => 'ok')
    expect((await handleContactRequest(post({ ...valid, website: 'spam.example' }), ENV, fetchImpl)).status).toBe(200)
    expect((await handleContactRequest(post({ ...valid, startedAt: Date.now() }), ENV, fetchImpl)).status).toBe(200)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('validates input server-side', async () => {
    const { fetchImpl } = fakeSupabase(() => 'ok')
    const res = await handleContactRequest(post({ ...valid, email: 'nope' }), ENV, fetchImpl)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/valid email/)
  })

  it('reports rate limiting', async () => {
    const { fetchImpl } = fakeSupabase(() => 'rate_limited')
    expect((await handleContactRequest(post(valid), ENV, fetchImpl)).status).toBe(429)
  })
})

describe('Supabase key headers', () => {
  it('sends new publishable keys only in the apikey header, legacy JWT keys also as Bearer', async () => {
    const { supabaseKeyHeaders } = await import('@/lib/edge/supabase-headers')
    expect(supabaseKeyHeaders('sb_publishable_abc')).toEqual({ apikey: 'sb_publishable_abc' })
    expect(supabaseKeyHeaders('eyJhbGciOi.x.y')).toEqual({ apikey: 'eyJhbGciOi.x.y', Authorization: 'Bearer eyJhbGciOi.x.y' })
  })
})

describe('GET /f/:path cached file delivery', () => {
  function memoryCache() {
    const store = new Map<string, Response>()
    return {
      store,
      async match(r: Request) {
        const hit = store.get(r.url)
        return hit ? hit.clone() : undefined
      },
      async put(r: Request, res: Response) {
        store.set(r.url, res.clone())
      },
    }
  }
  const PDF = Buffer.from('%PDF-1.4 test')
  const path = 'biz-1/abc-123.pdf'

  it('fetches from Supabase once, then serves from cache', async () => {
    const cache = memoryCache()
    const origin = vi.fn(async () => new Response(PDF, { status: 200, headers: { 'Content-Length': String(PDF.length) } }))
    const pending: Array<Promise<unknown>> = []
    const req = () => new Request(`https://1tap.example/f/${path}?v=2`)

    const first = await handleFileRequest(req(), path, ENV, cache, (p) => pending.push(p), origin as unknown as typeof fetch)
    await Promise.all(pending)
    expect(first.status).toBe(200)
    expect(first.headers.get('Content-Type')).toBe('application/pdf')
    expect(first.headers.get('Cache-Control')).toContain('immutable')
    expect(Buffer.from(await first.arrayBuffer()).toString()).toBe('%PDF-1.4 test')

    const second = await handleFileRequest(req(), path, ENV, cache, (p) => pending.push(p), origin as unknown as typeof fetch)
    expect(Buffer.from(await second.arrayBuffer()).toString()).toBe('%PDF-1.4 test')
    expect(origin).toHaveBeenCalledTimes(1)
    expect(origin).toHaveBeenCalledWith(`https://proj.supabase.co/storage/v1/object/public/public-files/${path}`)
  })

  it('adds a safe download filename on request', async () => {
    const origin = vi.fn(async () => new Response(PDF, { status: 200 }))
    const res = await handleFileRequest(
      new Request(`https://1tap.example/f/${path}?download=Menu%22%3B%20evil.exe`),
      path,
      ENV,
      null,
      undefined,
      origin as unknown as typeof fetch,
    )
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="Menu evil.exe.pdf"')
  })

  it('rejects anything that is not a public storage path', async () => {
    const origin = vi.fn()
    for (const bad of ['../secret.pdf', 'a/b/c.pdf', 'a/b.svg', 'A/B.pdf', 'a/b.html']) {
      const res = await handleFileRequest(new Request(`https://1tap.example/f/${bad}`), bad, ENV, null, undefined, origin as unknown as typeof fetch)
      expect(res.status, bad).toBe(404)
    }
    expect(origin).not.toHaveBeenCalled()
  })

  it('direct-open documents use the cached path when enabled', async () => {
    const { fetchImpl } = fakeSupabase({
      state: 'ok', code: 'docCode12', type: 'document',
      destination: { open_mode: 'direct', file: { path: 'biz/abc-123.pdf', version: 3 } },
    })
    const res = await handleQrRequest(request('/q/docCode12'), 'docCode12', { ...ENV, FILE_PROXY: 'on' }, async () => INDEX, fetchImpl)
    expect(res.headers.get('Location')).toBe('https://1tap.example/f/biz/abc-123.pdf?v=3')
  })
})

/**
 * GET /f/<storage path> — serves public files (menus, brochures, photos)
 * through Cloudflare's cache instead of straight from Supabase Storage.
 *
 * Why: Supabase Free includes a limited amount of monthly bandwidth (egress).
 * Every upload has a unique random path, so a cached copy never goes stale and
 * can be kept for a year. With a custom domain on Cloudflare, Supabase then
 * sends each file roughly once per Cloudflare data centre instead of once per
 * visitor. Enabled with FILE_PROXY=on (edge) + VITE_FILE_PROXY=on (build).
 */
import type { EdgeEnv } from './handlers'

const PATH = /^[a-z0-9-]+\/[a-z0-9-]+\.(pdf|png|jpg|webp|gif)$/
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

export interface CacheLike {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

function safeDownloadName(raw: string | null, ext: string): string | null {
  if (raw === null) return null
  const base = raw.replace(/[^\w .-]/g, '').trim().slice(0, 80) || 'download'
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`
}

function withDisposition(res: Response, filename: string | null): Response {
  if (!filename) return res
  const headers = new Headers(res.headers)
  headers.set('Content-Disposition', `attachment; filename="${filename}"`)
  return new Response(res.body, { status: res.status, headers })
}

export async function handleFileRequest(
  request: Request,
  path: string,
  env: EdgeEnv,
  cache: CacheLike | null,
  waitUntil: (p: Promise<unknown>) => void = () => undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!PATH.test(path) || !env.SUPABASE_URL) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  const ext = path.split('.').pop()!
  const url = new URL(request.url)
  const download = safeDownloadName(url.searchParams.get('download'), ext)
  // One cache entry per file, whatever query string was used.
  const cacheKey = new Request(`${url.origin}/f/${path}`, { method: 'GET' })

  if (cache) {
    try {
      const hit = await cache.match(cacheKey)
      if (hit) return withDisposition(hit, download)
    } catch {
      // Cache unavailable (e.g. some preview domains): fall through to origin.
    }
  }

  const origin = await fetchImpl(
    `${env.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/public-files/${path}`,
  )
  if (!origin.ok || !origin.body) {
    return new Response('Not found', { status: origin.status === 404 || origin.status === 400 ? 404 : 502, headers: { 'Cache-Control': 'no-store' } })
  }

  const headers = new Headers({
    'Content-Type': TYPES[ext],
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    // Files are data, never active content.
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox",
  })
  const length = origin.headers.get('Content-Length')
  if (length) headers.set('Content-Length', length)
  const response = new Response(origin.body, { status: 200, headers })

  if (cache) {
    try {
      waitUntil(cache.put(cacheKey, response.clone()))
    } catch {
      // ignore cache write failures
    }
  }
  return withDisposition(response, download)
}

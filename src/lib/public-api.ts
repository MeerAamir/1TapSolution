/**
 * Read-only public API used by customer-facing pages. Deliberately uses plain
 * fetch (no supabase-js) so pages opened from a QR scan stay small and fast.
 * Only the get_public_* RPCs are callable with the anon key.
 */
import { config } from '@/config'
import { supabaseKeyHeaders } from './edge/supabase-headers'
import type { PublicBusiness, PublicQrPayload } from './types'

async function rpc<T>(fn: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...supabaseKeyHeaders(config.supabaseAnonKey), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return (await res.json()) as T
}

export function fetchPublicQr(code: string, signal?: AbortSignal): Promise<PublicQrPayload> {
  return rpc<PublicQrPayload>('get_public_qr', { p_code: code }, signal)
}

export function fetchPublicBusiness(
  slug: string,
  signal?: AbortSignal,
): Promise<{ state: 'ok' | 'not_found'; business?: PublicBusiness }> {
  return rpc('get_public_business', { p_slug: slug }, signal)
}

/**
 * Data embedded by the edge function into the HTML for /q/<code>, so the page
 * renders without a second network round trip. Read once, then removed.
 */
export function takeEmbeddedQrPayload(code: string): PublicQrPayload | null {
  if (typeof document === 'undefined') return null
  const el = document.getElementById('__QR_PAYLOAD__')
  if (!el?.textContent) return null
  try {
    const payload = JSON.parse(el.textContent) as PublicQrPayload
    el.remove()
    if (payload.state === 'not_found' || payload.code === code) return payload
  } catch {
    el.remove()
  }
  return null
}

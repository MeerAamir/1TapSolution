/**
 * Coarse, privacy-friendly classification of a scan's user agent.
 * We keep only a category, never the raw user-agent string.
 */

export type DeviceCategory = 'mobile' | 'tablet' | 'desktop' | 'other'
export type BrowserCategory = 'chrome' | 'safari' | 'firefox' | 'edge' | 'samsung' | 'in_app' | 'other'

/** Link-preview bots and crawlers: still get the redirect, but are not counted as scans. */
const BOT = /bot\b|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|telegrambot|discordbot|embedly|headlesschrome|lighthouse|curl\/|wget|python-requests|go-http-client/i

export function isBot(ua: string | null | undefined): boolean {
  if (!ua) return true
  return BOT.test(ua)
}

export function deviceCategory(ua: string | null | undefined): DeviceCategory {
  if (!ua) return 'other'
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) return 'mobile'
  if (/windows nt|macintosh|x11|linux|cros/i.test(ua)) return 'desktop'
  return 'other'
}

export function browserCategory(ua: string | null | undefined): BrowserCategory {
  if (!ua) return 'other'
  if (/fban|fbav|instagram|line\/|micromessenger|snapchat|; wv\)|gsa\//i.test(ua)) return 'in_app'
  if (/samsungbrowser/i.test(ua)) return 'samsung'
  if (/edg(e|a|ios)?\//i.test(ua)) return 'edge'
  if (/firefox|fxios/i.test(ua)) return 'firefox'
  if (/chrome|crios|chromium/i.test(ua)) return 'chrome'
  if (/safari/i.test(ua) && /version\//i.test(ua)) return 'safari'
  return 'other'
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Daily-rotating visitor hash: SHA-256(secret, UTC date, IP, user agent).
 * The IP is never stored, and because the date is part of the input, the same
 * person produces unrelated hashes on different days (no long-term tracking).
 */
export async function dailyVisitorHash(secret: string, ip: string, ua: string, now = new Date()): Promise<string> {
  const day = now.toISOString().slice(0, 10)
  return sha256Hex(`${secret}|${day}|${ip}|${ua}`)
}

/** Hash for rate-limiting the contact form; not linked to scans. */
export async function ipHash(secret: string, ip: string): Promise<string> {
  return sha256Hex(`${secret}|contact|${ip}`)
}

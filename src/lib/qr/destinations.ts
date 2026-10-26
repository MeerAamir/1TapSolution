/**
 * Pure functions that turn a stored destination into a link.
 * Used by the Cloudflare edge function (server-side redirect) and by the SPA,
 * so both always agree. No DOM or Node APIs here.
 */
import type { DestinationByType, QrType } from './types'

const SAFE_URL = /^https?:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#][^\s<>"]*)?$/i

/** Same rule as public.is_safe_http_url() in the database. */
export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || !SAFE_URL.test(value)) return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** Keeps digits and a leading + for tel: links. */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim()
  const digits = trimmed.replace(/[^0-9]/g, '')
  return trimmed.startsWith('+') ? `+${digits}` : digits
}

/** WhatsApp click-to-chat needs the full international number, digits only. */
export function whatsappDigits(phone: string): string {
  return phone.replace(/[^0-9]/g, '')
}

export function telLink(phone: string): string {
  return `tel:${normalizePhone(phone)}`
}

export function whatsappLink(phone: string, message?: string): string {
  const base = `https://wa.me/${whatsappDigits(phone)}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

export function mailtoLink(email: string, subject?: string, body?: string): string {
  const params = new URLSearchParams()
  if (subject) params.set('subject', subject)
  if (body) params.set('body', body)
  const query = params.toString().replace(/\+/g, '%20')
  return `mailto:${email}${query ? `?${query}` : ''}`
}

export function mapsLink(d: { url?: string; latitude?: number; longitude?: number; address?: string }): string | null {
  if (d.url && isSafeHttpUrl(d.url)) return d.url
  if (typeof d.latitude === 'number' && typeof d.longitude === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`
  }
  if (d.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address)}`
  return null
}

/**
 * For redirect-type QR codes, the https URL to send the visitor to.
 * Returns null when the type renders a page instead, or when the stored
 * destination is not safe (we never redirect to javascript:, data:, etc.).
 */
export function redirectUrlFor(type: QrType, destination: unknown): string | null {
  const d = (destination ?? {}) as Record<string, unknown>
  switch (type) {
    case 'website':
    case 'custom_link':
    case 'social':
      return isSafeHttpUrl(d.url) ? d.url : null
    case 'whatsapp':
      return typeof d.phone === 'string' && whatsappDigits(d.phone).length >= 6
        ? whatsappLink(d.phone, typeof d.message === 'string' ? d.message : undefined)
        : null
    case 'maps':
      return mapsLink(d as DestinationByType['maps'])
    default:
      return null
  }
}

/** Escape per the de-facto WIFI: QR format (ZXing): \ ; , : " */
function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1')
}

/** Content for a static Wi-Fi QR: WIFI:T:WPA;S:name;P:pass;H:false;; */
export function wifiPayload(d: DestinationByType['wifi']): string {
  const parts = [`T:${d.encryption === 'nopass' ? 'nopass' : d.encryption}`, `S:${escapeWifi(d.ssid)}`]
  if (d.encryption !== 'nopass' && d.password) parts.push(`P:${escapeWifi(d.password)}`)
  if (d.hidden) parts.push('H:true')
  return `WIFI:${parts.join(';')};;`
}

function escapeVcard(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
}

/** vCard 3.0 text — widest support across iOS and Android contacts apps. */
export function vcardText(d: DestinationByType['contact_card']): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0']
  const name = d.full_name.trim()
  const parts = name.split(/\s+/)
  const last = parts.length > 1 ? parts.pop()! : ''
  lines.push(`N:${escapeVcard(last)};${escapeVcard(parts.join(' '))};;;`)
  lines.push(`FN:${escapeVcard(name)}`)
  if (d.organization) lines.push(`ORG:${escapeVcard(d.organization)}`)
  if (d.title) lines.push(`TITLE:${escapeVcard(d.title)}`)
  if (d.phone) lines.push(`TEL;TYPE=CELL,VOICE:${normalizePhone(d.phone)}`)
  if (d.email) lines.push(`EMAIL;TYPE=INTERNET:${d.email}`)
  if (d.website && isSafeHttpUrl(d.website)) lines.push(`URL:${d.website}`)
  if (d.address) lines.push(`ADR;TYPE=WORK:;;${escapeVcard(d.address)};;;;`)
  if (d.note) lines.push(`NOTE:${escapeVcard(d.note)}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

/** What a QR code of this type physically encodes. */
export function encodedContent(type: QrType, destination: unknown, dynamicUrl: string): string {
  if (type === 'wifi') return wifiPayload(destination as DestinationByType['wifi'])
  return dynamicUrl
}

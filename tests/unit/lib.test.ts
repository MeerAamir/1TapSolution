import { describe, expect, it } from 'vitest'
import { openState } from '@/components/public/BusinessProfile'
import { canonicalTimeZone } from '@/config'
import { browserCategory, dailyVisitorHash, deviceCategory, isBot } from '@/lib/edge/user-agent'
import { sniffMime, validateUpload } from '@/lib/files'
import { isSafeHttpUrl, mailtoLink, telLink, vcardText, whatsappLink, wifiPayload } from '@/lib/qr/destinations'
import { slugify } from '@/lib/utils'
import { businessFormSchema } from '@/lib/validation/business'
import { parseDestination } from '@/lib/validation/qr'
import { safeNext } from '@/pages/auth/AuthArea'

describe('URL safety (Scenario 16)', () => {
  it.each([
    ['https://example.com', true],
    ['http://example.com/a?b=c#d', true],
    ['https://sub.example.co.in:8443/path', true],
    ['javascript:alert(1)', false],
    ['JAVASCRIPT:alert(1)', false],
    ['data:text/html;base64,PHNjcmlwdD4=', false],
    ['vbscript:msgbox(1)', false],
    ['//example.com', false],
    ['ftp://example.com', false],
    ['https://exa mple.com', false],
    ['https://example.com/"><script>', false],
    ['', false],
  ])('%s → %s', (url, ok) => {
    expect(isSafeHttpUrl(url)).toBe(ok)
  })

  it('rejects unsafe URLs in every destination schema', () => {
    expect(parseDestination('website', { url: 'javascript:alert(1)' }).ok).toBe(false)
    expect(parseDestination('custom_link', { url: 'data:text/html,x' }).ok).toBe(false)
    expect(parseDestination('social', { platform: 'instagram', url: 'javascript:x' }).ok).toBe(false)
    expect(parseDestination('maps', { mode: 'url', url: 'javascript:x' }).ok).toBe(false)
    expect(parseDestination('contact_card', { full_name: 'A', website: 'javascript:x' }).ok).toBe(false)
    expect(parseDestination('website', { url: 'https://example.com' })).toEqual({ ok: true, value: { url: 'https://example.com' } })
  })
})

describe('destination validation', () => {
  it('requires a password for WPA Wi-Fi and drops it for open networks', () => {
    expect(parseDestination('wifi', { ssid: 'Cafe', encryption: 'WPA' }).ok).toBe(false)
    expect(parseDestination('wifi', { ssid: 'Cafe', encryption: 'WPA', password: 'short' }).ok).toBe(false)
    expect(parseDestination('wifi', { ssid: 'Cafe', encryption: 'nopass', password: 'ignored' })).toEqual({
      ok: true,
      value: { ssid: 'Cafe', encryption: 'nopass' },
    })
  })
  it('validates phone numbers and maps coordinates', () => {
    expect(parseDestination('phone', { phone: 'call me' }).ok).toBe(false)
    expect(parseDestination('phone', { phone: '+91 98765 43210' }).ok).toBe(true)
    expect(parseDestination('maps', { mode: 'coordinates', latitude: '95', longitude: '10' }).ok).toBe(false)
    expect(parseDestination('maps', { mode: 'coordinates', latitude: '34.08', longitude: '74.79' })).toEqual({
      ok: true,
      value: { latitude: 34.08, longitude: 74.79 },
    })
  })
})

describe('links', () => {
  it('builds tel, WhatsApp and mailto links', () => {
    expect(telLink('+91 (98765) 43-210')).toBe('tel:+919876543210')
    expect(whatsappLink('+91 98765 43210')).toBe('https://wa.me/919876543210')
    expect(mailtoLink('a@b.co', 'Hello there', 'Line 1')).toBe('mailto:a@b.co?subject=Hello%20there&body=Line%201')
  })
  it('escapes Wi-Fi special characters', () => {
    expect(wifiPayload({ ssid: 'My;Net', encryption: 'WPA', password: 'a:b"c\\' })).toBe('WIFI:T:WPA;S:My\\;Net;P:a\\:b\\"c\\\\;;')
    expect(wifiPayload({ ssid: 'Open', encryption: 'nopass', password: 'x', hidden: true })).toBe('WIFI:T:nopass;S:Open;H:true;;')
  })
  it('creates a valid vCard and escapes separators', () => {
    const v = vcardText({ full_name: 'Aisha Rahman', organization: 'Studio; Co', phone: '+91 00000 00005', email: 'a@example.com' })
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0')).toBe(true)
    expect(v).toContain('N:Rahman;Aisha;;;')
    expect(v).toContain('ORG:Studio\\; Co')
    expect(v).toContain('TEL;TYPE=CELL,VOICE:+910000000005')
    expect(v.endsWith('END:VCARD')).toBe(true)
  })
})

describe('upload validation (file security)', () => {
  const file = (bytes: number[], name: string) => new File([new Uint8Array([...bytes, ...new Array(32).fill(0)])], name)
  const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

  it('identifies real content by magic bytes', () => {
    expect(sniffMime(new Uint8Array(PDF))).toBe('application/pdf')
    expect(sniffMime(new Uint8Array(PNG))).toBe('image/png')
    expect(sniffMime(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull() // Windows executable
    expect(sniffMime(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
  })

  it('accepts matching files and rejects disguised or executable ones', async () => {
    await expect(validateUpload(file(PDF, 'menu.pdf'))).resolves.toMatchObject({ mime: 'application/pdf', ext: 'pdf' })
    await expect(validateUpload(file([0x4d, 0x5a], 'menu.pdf'))).rejects.toThrow(/not a valid PDF or image/)
    await expect(validateUpload(file(PNG, 'photo.pdf'))).rejects.toThrow(/does not match/)
    await expect(validateUpload(file(PDF, 'setup.exe'))).rejects.toThrow(/Only PDF/)
    await expect(validateUpload(file(PDF, 'logo.svg'))).rejects.toThrow(/Only PDF/)
    await expect(validateUpload(file(PDF, 'menu.pdf'), { imagesOnly: true })).rejects.toThrow(/image file/)
    await expect(validateUpload(new File([], 'empty.pdf'))).rejects.toThrow(/empty/)
  })
})

describe('analytics helpers', () => {
  it('classifies devices and browsers coarsely', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
    const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
    const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'
    const insta = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0'
    expect([deviceCategory(iphone), browserCategory(iphone)]).toEqual(['mobile', 'safari'])
    expect([deviceCategory(android), browserCategory(android)]).toEqual(['mobile', 'chrome'])
    expect(deviceCategory(ipad)).toBe('tablet')
    expect([deviceCategory(desktop), browserCategory(desktop)]).toEqual(['desktop', 'edge'])
    expect(browserCategory(insta)).toBe('in_app')
  })

  it('detects bots without flagging normal phones', () => {
    expect(isBot('facebookexternalhit/1.1')).toBe(true)
    expect(isBot('WhatsApp/2.23.20.0 A')).toBe(true)
    expect(isBot('Googlebot/2.1')).toBe(true)
    expect(isBot('')).toBe(true)
    expect(isBot('Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36')).toBe(false)
  })

  it('visitor hashes rotate daily and never contain the IP', async () => {
    const d1 = new Date('2026-10-26T10:00:00Z')
    const d2 = new Date('2026-10-27T10:00:00Z')
    const a = await dailyVisitorHash('secret', '203.0.113.7', 'UA', d1)
    const b = await dailyVisitorHash('secret', '203.0.113.7', 'UA', d1)
    const c = await dailyVisitorHash('secret', '203.0.113.7', 'UA', d2)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).not.toContain('203')
  })
})

describe('misc', () => {
  it('maps legacy browser time zones to current names', () => {
    expect(canonicalTimeZone('Asia/Calcutta')).toBe('Asia/Kolkata')
    expect(canonicalTimeZone('Europe/London')).toBe('Europe/London')
  })

  it('slugify', () => {
    expect(slugify('Chinar Leaf Café & Bakery!')).toBe('chinar-leaf-cafe-and-bakery')
    expect(slugify('  --A  B--  ')).toBe('a-b')
  })

  it('only redirects to dashboard paths after login (no open redirect)', () => {
    expect(safeNext('/admin/qr')).toBe('/admin/qr')
    expect(safeNext(encodeURIComponent('/admin/qr?x=1'))).toBe('/admin/qr?x=1')
    expect(safeNext('https://evil.example')).toBe('/admin')
    expect(safeNext('//evil.example/admin')).toBe('/admin')
    expect(safeNext(null)).toBe('/admin')
  })

  it('computes opening state, including past midnight', () => {
    const hours = [
      { day: 0, opens: '09:00', closes: '17:00' },
      { day: 4, opens: '18:00', closes: '02:00' },
    ]
    // Monday 26 Oct 2026, 10:00 local
    expect(openState(hours, new Date(2026, 9, 26, 10, 0))).toEqual({ open: true, label: 'Open until 17:00' })
    expect(openState(hours, new Date(2026, 9, 26, 8, 0))).toEqual({ open: false, label: 'Closed, opens at 09:00' })
    // Saturday 1:00 is still Friday's late shift
    expect(openState(hours, new Date(2026, 9, 31, 1, 0))).toEqual({ open: true, label: 'Open until 02:00' })
    expect(openState([], new Date())).toBeNull()
  })

  it('business form schema converts empty strings to null and rejects bad links', () => {
    const base = {
      name: 'Acme', slug: 'acme', category_id: '', tagline: '', description: '', phone: '', whatsapp: '', email: '',
      website_url: '', google_business_url: '', accent_color: '#112233', hours_note: '', status: 'active',
      logo_file_id: null, cover_file_id: null, custom_fields: [], hours: [], locations: [], social_links: [],
    }
    const ok = businessFormSchema.parse(base)
    expect(ok.website_url).toBeNull()
    expect(ok.category_id).toBeNull()
    expect(businessFormSchema.safeParse({ ...base, website_url: 'javascript:alert(1)' }).success).toBe(false)
    expect(businessFormSchema.safeParse({ ...base, slug: 'Bad Slug' }).success).toBe(false)
    expect(
      businessFormSchema.safeParse({ ...base, hours: [{ day_of_week: 0, opens_at: '09:00', closes_at: '09:00' }] }).success,
    ).toBe(false)
  })
})

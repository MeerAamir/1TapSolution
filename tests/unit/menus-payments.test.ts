// @vitest-environment node
import jsQR from 'jsqr'
import { Resvg } from '@resvg/resvg-js'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DESIGN } from '@/lib/qr/design'
import { encodedContent, isStaticQr, redirectUrlFor, reviewUrl, upiLink } from '@/lib/qr/destinations'
import { endOfDay, expiryInfo, extendExpiry } from '@/lib/qr/expiry'
import { renderSvg } from '@/lib/qr/render'
import { tint } from '@/lib/image'
import { parseDestination } from '@/lib/validation/qr'

describe('UPI payments', () => {
  it('builds a UPI link with the @ kept readable and optional fields', () => {
    const link = upiLink({ upi_id: 'chinar.cafe@okicici', payee_name: 'Chinar Café', amount: 250, note: 'Table 4' })!
    expect(link.startsWith('upi://pay?pa=chinar.cafe@okicici')).toBe(true)
    const params = new URL(link.replace('upi://pay', 'https://x.test/')).searchParams
    expect(params.get('pn')).toBe('Chinar Café')
    expect(params.get('am')).toBe('250.00')
    expect(params.get('cu')).toBe('INR')
    expect(params.get('tn')).toBe('Table 4')
  })

  it('refuses invalid UPI IDs', () => {
    expect(upiLink({ upi_id: 'not-an-id' })).toBeNull()
    expect(upiLink({ upi_id: 'a@b' })).toBeNull()
  })

  it('validates payment details', () => {
    expect(parseDestination('payment', {}).ok).toBe(false)
    expect(parseDestination('payment', { upi_id: 'bad id@x' }).ok).toBe(false)
    expect(parseDestination('payment', { upi_id: 'shop@ybl', amount: '0' }).ok).toBe(false)
    const ok = parseDestination('payment', { upi_id: 'shop@ybl', amount: '199.50', bank: { account_number: '', ifsc: '' } })
    expect(ok.ok && ok.value).toEqual({ upi_id: 'shop@ybl', amount: 199.5 })
    expect(parseDestination('payment', { links: [{ label: 'Pay online', url: 'https://rzp.io/l/abc' }] }).ok).toBe(true)
    expect(parseDestination('payment', { links: [{ label: 'x', url: 'javascript:alert(1)' }] }).ok).toBe(false)
    expect(parseDestination('payment', { bank: { account_number: '12345678', ifsc: 'sbin0001234' } }).ok).toBe(true)
  })

  it('a plain UPI code holds the payment itself and scans as a UPI link', () => {
    const d = { upi_id: 'shop@ybl', payee_name: 'Shop', direct: true }
    expect(isStaticQr('payment', d)).toBe(true)
    expect(isStaticQr('payment', { ...d, direct: false })).toBe(false)
    expect(isStaticQr('wifi', {})).toBe(true)
    const content = encodedContent('payment', d, 'https://1tapsolution.pages.dev/q/abc')
    expect(content).toBe(upiLink(d))
    const png = new Resvg(renderSvg(content, DEFAULT_DESIGN), { fitTo: { mode: 'width', value: 600 }, background: 'white' }).render()
    expect(jsQR(new Uint8ClampedArray(png.pixels), png.width, png.height)?.data).toBe(content)
    // A payment page code points at the dynamic link instead.
    expect(encodedContent('payment', { ...d, direct: false }, 'https://1tapsolution.pages.dev/q/abc')).toBe('https://1tapsolution.pages.dev/q/abc')
  })
})

describe('Google review', () => {
  it('uses the pasted link, or builds one from a Place ID', () => {
    expect(reviewUrl({ url: 'https://g.page/r/abc/review' })).toBe('https://g.page/r/abc/review')
    expect(reviewUrl({ place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4' })).toBe('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4')
    expect(redirectUrlFor('review', { url: 'https://g.page/r/abc/review' })).toBe('https://g.page/r/abc/review')
    expect(parseDestination('review', {}).ok).toBe(false)
    expect(parseDestination('review', { place_id: 'short' }).ok).toBe(false)
  })
})

describe('Menus', () => {
  it('keeps only what the chosen kind of menu needs and ignores blank rows', () => {
    const r = parseDestination('menu', {
      mode: 'items',
      currency: '₹',
      file_id: '00000000-0000-4000-8000-000000000000',
      sections: [
        { name: 'Starters', items: [{ name: 'Paneer tikka', price: '240', tag: 'veg' }, { name: '', price: '', tag: '' }] },
        { name: 'Empty', items: [] },
      ],
    })
    expect(r.ok && r.value).toEqual({ mode: 'items', currency: '₹', sections: [{ name: 'Starters', items: [{ name: 'Paneer tikka', price: '240', tag: 'veg' }] }] })
  })

  it('requires the content of each kind', () => {
    expect(parseDestination('menu', { mode: 'items', sections: [{ items: [] }] }).ok).toBe(false)
    expect(parseDestination('menu', { mode: 'pdf' }).ok).toBe(false)
    expect(parseDestination('menu', { mode: 'images', file_ids: [] }).ok).toBe(false)
    expect(parseDestination('menu', { mode: 'link', url: 'menu.example.com' }).ok).toBe(false)
    expect(redirectUrlFor('menu', { mode: 'link', url: 'https://menu.example.com' })).toBe('https://menu.example.com')
    expect(redirectUrlFor('menu', { mode: 'items' })).toBeNull()
  })

  it('rejects an item with a price but no name', () => {
    expect(parseDestination('menu', { mode: 'items', sections: [{ items: [{ name: '', price: '90' }] }] }).ok).toBe(false)
  })
})

describe('Page style', () => {
  it('accepts a full theme and rejects unsafe values', () => {
    const theme = { font: 'poppins', accent: '#7C3AED', bg_type: 'gradient', bg_color: '#EDE9FE', bg_color2: '#FFFFFF', bg_angle: 160, button_style: 'solid', button_shape: 'pill' }
    expect(parseDestination('text', { text: 'Hi', theme }).ok).toBe(true)
    expect(parseDestination('text', { text: 'Hi', theme: { ...theme, accent: 'red;background:url(x)' } }).ok).toBe(false)
    expect(parseDestination('text', { text: 'Hi', theme: { ...theme, font: 'comic-sans' } }).ok).toBe(false)
    expect(parseDestination('text', { text: 'Hi', theme: { bg_overlay: 1.5 } }).ok).toBe(false)
  })

  it('tints colours towards white', () => {
    expect(tint('#000000', 0.5)).toBe('#808080')
    expect(tint('#2563EB', 0)).toBe('#2563EB')
    expect(tint('#2563EB', 1)).toBe('#FFFFFF')
  })
})

describe('Valid until', () => {
  const now = new Date(2026, 0, 31, 10, 0, 0)

  it('starts from today for a new or expired code', () => {
    const end = new Date(extendExpiry(null, { label: '7 days', days: 7 }, now))
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours()]).toEqual([2026, 1, 7, 23])
    const expired = new Date(2025, 11, 1).toISOString()
    expect(new Date(extendExpiry(expired, { label: '1 month', months: 1 }, now)).getMonth()).toBe(1)
  })

  it('adds to the current end date when renewing early, and clamps month ends', () => {
    const end = new Date(extendExpiry(null, { label: '1 month', months: 1 }, now))
    expect([end.getMonth(), end.getDate()]).toEqual([1, 28]) // 31 Jan + 1 month → 28 Feb
    const renewed = new Date(extendExpiry(end.toISOString(), { label: '1 year', months: 12 }, now))
    expect([renewed.getFullYear(), renewed.getMonth(), renewed.getDate()]).toEqual([2027, 1, 28])
  })

  it('describes the state', () => {
    expect(expiryInfo(null).kind).toBe('none')
    expect(expiryInfo(new Date(2026, 0, 30).toISOString(), now).kind).toBe('expired')
    const soon = expiryInfo(new Date(2026, 1, 3, 23).toISOString(), now)
    expect(soon.kind === 'active' && soon.soon && soon.daysLeft).toBe(4)
    expect(endOfDay('2026-13-01')).toBeNull()
    expect(new Date(endOfDay('2026-03-05')!).getDate()).toBe(5)
  })

  it('validates themes on every page type with a theme', () => {
    expect(parseDestination('contact_card', { full_name: 'A', theme: { accent: '#123456' } }).ok).toBe(true)
  })
})

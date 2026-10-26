// @vitest-environment node
import { Resvg } from '@resvg/resvg-js'
import jsQR from 'jsqr'
import QRCode from 'qrcode'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DESIGN, designWarnings, effectiveEcl, qrDesignSchema, type QrDesign } from '@/lib/qr/design'
import { wifiPayload } from '@/lib/qr/destinations'
import { alignmentCentres, buildGeometry, QUIET_ZONE, renderSvg } from '@/lib/qr/render'

/** Rasterise our SVG exactly as an export would be printed, then decode it. */
function decode(svg: string, width = 600): string | null {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'white' }).render()
  const result = jsQR(new Uint8ClampedArray(png.pixels), png.width, png.height)
  return result?.data ?? null
}

// A tiny 1x1 PNG so the logo variant has real image content in the middle.
const LOGO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const URL_TEXT = 'https://1tap.example/q/AbC123xyz9'
const design = (patch: Partial<QrDesign>): QrDesign => qrDesignSchema.parse({ ...DEFAULT_DESIGN, ...patch })

describe('QR rendering decodes back to the encoded URL (Scenarios 8, 21)', () => {
  const variants: Array<[string, Partial<QrDesign>]> = [
    ['default high contrast', {}],
    ['rounded modules & eyes', { dots: 'rounded', eyes: 'rounded' }],
    ['dot modules & circle eyes', { dots: 'dots', eyes: 'circle', ecl: 'Q' }],
    ['brand colours', { fg: '#1E3A8A', bg: '#F8FAFC', eyeColor: '#7C3AED' }],
    ['with centre logo', { logo: true, logoScale: 0.2, dots: 'rounded', eyes: 'rounded' }],
    ['with frame, CTA and name', { frame: true, cta: 'Scan for menu', showName: true }],
    ['with border', { border: true, ecl: 'H' }],
    ['low error correction', { ecl: 'L' }],
  ]

  it.each(variants)('%s', (_label, patch) => {
    const svg = renderSvg(URL_TEXT, design(patch), { businessName: 'Chinar Leaf Café', logoDataUrl: LOGO })
    expect(decode(svg)).toBe(URL_TEXT)
  })

  const styles: Array<[QrDesign['dots'], QrDesign['eyes']]> = [
    ['square', 'square'],
    ['rounded', 'rounded'],
    ['dots', 'square'],
    ['dots', 'circle'],
    ['rounded', 'circle'],
  ]
  it.each(styles.flatMap(([d, e]) => [300, 600, 1200].map((w) => [d, e, w] as const)))(
    'style %s/%s decodes at %ipx',
    (dots, eyes, width) => {
      expect(decode(renderSvg(URL_TEXT, design({ dots, eyes })), width)).toBe(URL_TEXT)
    },
  )

  it('decodes a long URL at a small print size', () => {
    const long = `https://1tap.example/q/${'x'.repeat(32)}`
    expect(decode(renderSvg(long, DEFAULT_DESIGN), 300)).toBe(long)
  })

  it('decodes a static Wi-Fi payload with special characters', () => {
    const payload = wifiPayload({ ssid: 'Café;Guest', encryption: 'WPA', password: 'p@ss:"word"' })
    expect(decode(renderSvg(payload, DEFAULT_DESIGN))).toBe(payload)
  })
})

describe('alignment markers', () => {
  it('are placed exactly where the QR matrix has them (versions 2–15)', () => {
    for (let len = 20; len <= 400; len += 12) {
      const text = `https://1tap.example/q/${'a'.repeat(len)}`
      const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
      const size = qr.modules.size
      for (const [r, c] of alignmentCentres(qr.version, size)) {
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const ring = Math.max(Math.abs(dr), Math.abs(dc))
            expect(Boolean(qr.modules.get(r + dr, c + dc))).toBe(ring !== 1)
          }
        }
      }
      if (qr.version > 15) break
    }
  })
})

describe('SVG export is valid vector artwork', () => {
  it('is a single well-formed SVG with no raster image unless a logo is embedded', () => {
    const svg = renderSvg(URL_TEXT, design({ frame: true, cta: 'Scan <me> & "go"' }))
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).not.toContain('<image')
    expect(svg).toContain('<path d="M')
    expect(svg).toContain('Scan &lt;me&gt; &amp; &quot;go&quot;')
    // resvg is a strict parser: it throws on malformed markup.
    expect(() => new Resvg(svg).render()).not.toThrow()
  })

  it('keeps the full quiet zone and a square aspect for the code area', () => {
    const geo = buildGeometry(URL_TEXT, DEFAULT_DESIGN)
    expect(geo.extent).toBe(geo.size + 2 * QUIET_ZONE)
    const svg = renderSvg(URL_TEXT, DEFAULT_DESIGN)
    const [, , w, h] = svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number)
    expect(w).toBe(h)
    expect(w).toBe(geo.extent)
  })

  it('only embeds safe data: URLs as logos', () => {
    const svg = renderSvg(URL_TEXT, design({ logo: true }), { logoDataUrl: 'javascript:alert(1)' })
    expect(svg).not.toContain('javascript:')
  })
})

describe('design guidance', () => {
  it('raises error correction to Q when a logo is used', () => {
    expect(effectiveEcl(design({ logo: true, ecl: 'L' }))).toBe('Q')
    expect(effectiveEcl(design({ logo: true, ecl: 'H' }))).toBe('H')
    expect(buildGeometry(URL_TEXT, design({ logo: true, ecl: 'M' })).ecl).toBe('Q')
  })

  it('warns about low contrast and inverted colours', () => {
    const w = designWarnings(design({ fg: '#CCCCCC', bg: '#FFFFFF' }))
    expect(w.some((x) => x.level === 'danger')).toBe(true)
    expect(designWarnings(design({ fg: '#FFFFFF', bg: '#000000' })).map((x) => x.message).join(' ')).toMatch(/inverted/)
    expect(designWarnings(DEFAULT_DESIGN)).toEqual([])
  })
})

/**
 * QR rendering. We build the module matrix with the `qrcode` library and draw
 * it ourselves so SVG and PDF exports are true vector artwork with styled
 * modules and corner markers. Works in the browser and in Node (tests).
 */
import QRCode from 'qrcode'
import { effectiveEcl, type QrDesign } from './design'

/** Required quiet zone around the symbol, in modules (ISO/IEC 18004). */
export const QUIET_ZONE = 4

export type Shape =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r: number; fill: string }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string }

export interface QrGeometry {
  /** Modules per side of the symbol (without quiet zone). */
  size: number
  version: number
  ecl: QrDesign['ecl']
  /** Side length of the square QR area including quiet zone, in module units. */
  extent: number
  shapes: Shape[]
  /** Where to place the logo, in module units (already cleared of modules). */
  logoBox: { x: number; y: number; size: number } | null
}

function isFinder(row: number, col: number, size: number): boolean {
  const inBox = (r0: number, c0: number) => row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7
  return inBox(0, 0) || inBox(0, size - 7) || inBox(size - 7, 0)
}

/**
 * Centre coordinates of alignment patterns (ISO/IEC 18004 Annex E), per version.
 * Decoders rely on these 5x5 markers, so we always draw them solid — never as
 * loose dots — whatever module style is chosen.
 */
const ALIGNMENT_TABLE: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78],
  [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
]

export function alignmentCentres(version: number, size: number): Array<[number, number]> {
  const coords = ALIGNMENT_TABLE[version] ?? []
  const centres: Array<[number, number]> = []
  for (const r of coords) {
    for (const c of coords) {
      // Skip the three positions that collide with finder patterns.
      if ((r < 9 && c < 9) || (r < 9 && c > size - 10) || (r > size - 10 && c < 9)) continue
      centres.push([r, c])
    }
  }
  return centres
}

export function buildGeometry(text: string, design: QrDesign): QrGeometry {
  const ecl = effectiveEcl(design)
  const qr = QRCode.create(text, { errorCorrectionLevel: ecl })
  const size = qr.modules.size
  const q = QUIET_ZONE
  const shapes: Shape[] = []

  // Background including the quiet zone.
  shapes.push({ t: 'rect', x: 0, y: 0, w: size + 2 * q, h: size + 2 * q, r: 0, fill: design.bg })

  // Logo area: centred square, rounded to whole modules, cleared of data modules.
  let logoBox: QrGeometry['logoBox'] = null
  let clear = (_r: number, _c: number) => false
  if (design.logo) {
    let span = Math.round(size * design.logoScale)
    if (span % 2 !== size % 2) span += 1 // keep it centred on the module grid
    const start = (size - span) / 2
    logoBox = { x: q + start, y: q + start, size: span }
    clear = (r, c) => r >= start - 0.5 && r < start + span + 0.5 && c >= start - 0.5 && c < start + span + 0.5
  }

  const alignments = alignmentCentres(qr.version, size)
  const inAlignment = (r: number, c: number) =>
    alignments.some(([ar, ac]) => Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2)

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!qr.modules.get(r, c) || isFinder(r, c, size) || clear(r, c) || inAlignment(r, c)) continue
      const x = q + c
      const y = q + r
      if (design.dots === 'dots') {
        shapes.push({ t: 'circle', cx: x + 0.5, cy: y + 0.5, r: 0.46, fill: design.fg })
      } else {
        shapes.push({ t: 'rect', x, y, w: 1, h: 1, r: design.dots === 'rounded' ? 0.32 : 0, fill: design.fg })
      }
    }
  }

  // Alignment markers: solid 5x5 ring + centre module (unless hidden behind the logo).
  const roundAlign = design.dots !== 'square'
  for (const [r, c] of alignments) {
    if (clear(r, c)) continue
    const x = q + c - 2
    const y = q + r - 2
    shapes.push({ t: 'rect', x, y, w: 5, h: 5, r: roundAlign ? 1.2 : 0, fill: design.fg })
    shapes.push({ t: 'rect', x: x + 1, y: y + 1, w: 3, h: 3, r: roundAlign ? 0.7 : 0, fill: design.bg })
    shapes.push({ t: 'rect', x: x + 2, y: y + 2, w: 1, h: 1, r: roundAlign ? 0.3 : 0, fill: design.fg })
  }

  // Corner markers: 7x7 ring + 3x3 centre.
  const eye = design.eyeColor ?? design.fg
  const corners: Array<[number, number]> = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]
  for (const [r, c] of corners) {
    const x = q + c
    const y = q + r
    if (design.eyes === 'circle') {
      shapes.push({ t: 'circle', cx: x + 3.5, cy: y + 3.5, r: 3.5, fill: eye })
      shapes.push({ t: 'circle', cx: x + 3.5, cy: y + 3.5, r: 2.5, fill: design.bg })
      shapes.push({ t: 'circle', cx: x + 3.5, cy: y + 3.5, r: 1.5, fill: eye })
    } else {
      const round = design.eyes === 'rounded'
      shapes.push({ t: 'rect', x, y, w: 7, h: 7, r: round ? 2 : 0, fill: eye })
      shapes.push({ t: 'rect', x: x + 1, y: y + 1, w: 5, h: 5, r: round ? 1.4 : 0, fill: design.bg })
      shapes.push({ t: 'rect', x: x + 2, y: y + 2, w: 3, h: 3, r: round ? 0.9 : 0, fill: eye })
    }
  }

  return { size, version: qr.version, ecl, extent: size + 2 * q, shapes, logoBox }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch]!)
}

const n = (v: number) => Number(v.toFixed(3)).toString()

export interface RenderOptions {
  /** Business name shown under the code when design.showName is on. */
  businessName?: string
  /** data: URL (PNG/JPEG/WebP) for the centre logo. */
  logoDataUrl?: string
}

/** Layout of the printed card (QR + optional frame, CTA and name) in module units. */
export function cardLayout(geo: QrGeometry, design: QrDesign, opts: RenderOptions) {
  const pad = design.frame || design.border ? 2 : 0
  const ctaHeight = design.frame && design.cta ? 7 : 0
  const nameHeight = design.showName && opts.businessName ? 5 : 0
  const width = geo.extent + pad * 2
  const height = geo.extent + pad * 2 + ctaHeight + nameHeight
  return { pad, ctaHeight, nameHeight, width, height }
}

/** Full SVG document. All QR artwork is vector; only a centre logo is embedded as an image. */
export function renderSvg(text: string, design: QrDesign, opts: RenderOptions = {}): string {
  const geo = buildGeometry(text, design)
  const L = cardLayout(geo, design, opts)
  const out: string[] = []
  const font = 'font-family="Arial, Helvetica, sans-serif"'

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(L.width)} ${n(L.height)}" width="${L.width * 10}" height="${
      L.height * 10
    }" shape-rendering="${design.dots === 'square' && design.eyes === 'square' ? 'crispEdges' : 'geometricPrecision'}">`,
  )
  const cardRadius = design.frame ? 2.5 : design.border ? 1 : 0
  out.push(`<rect width="${n(L.width)}" height="${n(L.height)}" rx="${cardRadius}" fill="${design.bg}"/>`)
  if (design.frame || design.border) {
    const stroke = design.frame ? 1 : 0.5
    out.push(
      `<rect x="${stroke / 2}" y="${stroke / 2}" width="${n(L.width - stroke)}" height="${n(L.height - stroke)}" rx="${n(
        Math.max(cardRadius - stroke / 2, 0),
      )}" fill="none" stroke="${design.fg}" stroke-width="${stroke}"/>`,
    )
  }

  out.push(`<g transform="translate(${L.pad} ${L.pad})">`)
  const rects: string[] = []
  for (const s of geo.shapes) {
    if (s.t === 'rect') {
      if (s.r === 0 && s.fill === design.fg && s.w === 1 && s.h === 1) {
        rects.push(`M${s.x} ${s.y}h1v1h-1z`)
      } else {
        out.push(
          `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}"${s.r ? ` rx="${n(s.r)}"` : ''} fill="${s.fill}"/>`,
        )
      }
    } else {
      out.push(`<circle cx="${n(s.cx)}" cy="${n(s.cy)}" r="${n(s.r)}" fill="${s.fill}"/>`)
    }
  }
  // Square data modules merged into one path (much smaller file).
  if (rects.length) out.push(`<path d="${rects.join('')}" fill="${design.fg}"/>`)

  if (geo.logoBox) {
    const b = geo.logoBox
    out.push(`<rect x="${n(b.x - 0.5)}" y="${n(b.y - 0.5)}" width="${n(b.size + 1)}" height="${n(b.size + 1)}" rx="1.2" fill="${design.bg}"/>`)
    if (opts.logoDataUrl && /^data:image\/(png|jpeg|webp|gif);base64,/.test(opts.logoDataUrl)) {
      out.push(
        `<image href="${opts.logoDataUrl}" x="${n(b.x + 0.4)}" y="${n(b.y + 0.4)}" width="${n(b.size - 0.8)}" height="${n(
          b.size - 0.8,
        )}" preserveAspectRatio="xMidYMid meet"/>`,
      )
    }
  }
  out.push('</g>')

  let y = L.pad * 2 + geo.extent
  if (L.ctaHeight) {
    const w = L.width - 4
    out.push(`<rect x="2" y="${n(y)}" width="${n(w)}" height="${L.ctaHeight - 1.5}" rx="1.6" fill="${design.fg}"/>`)
    out.push(
      `<text x="${n(L.width / 2)}" y="${n(y + (L.ctaHeight - 1.5) / 2)}" ${font} font-size="2.6" font-weight="700" fill="${
        design.bg
      }" text-anchor="middle" dominant-baseline="central">${escapeXml(design.cta ?? '')}</text>`,
    )
    y += L.ctaHeight
  }
  if (L.nameHeight) {
    out.push(
      `<text x="${n(L.width / 2)}" y="${n(y + L.nameHeight / 2 - 0.6)}" ${font} font-size="2.2" font-weight="600" fill="${
        design.fg
      }" text-anchor="middle" dominant-baseline="central">${escapeXml(opts.businessName ?? '')}</text>`,
    )
  }
  out.push('</svg>')
  return out.join('')
}

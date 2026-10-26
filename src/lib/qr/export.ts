/**
 * Browser-side QR downloads: SVG (vector), PNG (high resolution) and a
 * print-ready PDF where the code itself is drawn as vector shapes.
 */
import type { QrDesign } from './design'
import { buildGeometry, cardLayout, renderSvg, type RenderOptions } from './render'

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFilename(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60) || 'qr-code'
  )
}

export function downloadSvg(text: string, design: QrDesign, opts: RenderOptions, filename: string) {
  const svg = renderSvg(text, design, opts)
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${filename}.svg`)
}

/** Rasterise our SVG onto a canvas. width is in pixels (default 2048 ≈ 17 cm at 300 dpi). */
export async function svgToPngBlob(svg: string, width = 2048): Promise<Blob> {
  const img = new Image()
  img.decoding = 'async'
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    img.src = url
    await img.decode()
    const ratio = img.naturalHeight / img.naturalWidth || 1
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.round(width * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available in this browser')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function downloadPng(text: string, design: QrDesign, opts: RenderOptions, filename: string, width = 2048) {
  const blob = await svgToPngBlob(renderSvg(text, design, opts), width)
  downloadBlob(blob, `${filename}.png`)
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

export interface PdfOptions extends RenderOptions {
  /** Short line printed under the code. */
  instruction?: string
  /** Width of the QR area on paper, in millimetres. */
  qrWidthMm?: number
}

/**
 * A5 portrait sheet with the code centred, the business name above and a scan
 * instruction below. The QR modules are vector rectangles/circles, so it prints
 * sharply at any size.
 */
export async function downloadPdf(text: string, design: QrDesign, opts: PdfOptions, filename: string) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })
  const pageW = doc.internal.pageSize.getWidth()
  const geo = buildGeometry(text, design)
  const layout = cardLayout(geo, design, { ...opts, businessName: undefined })
  const qrMm = opts.qrWidthMm ?? 90
  const unit = qrMm / layout.width
  const left = (pageW - qrMm) / 2
  let top = 30

  if (opts.businessName) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(15, 23, 42)
    doc.text(opts.businessName, pageW / 2, 22, { align: 'center', maxWidth: pageW - 24 })
    top = 32
  }

  const offset = layout.pad * unit
  // Card background and optional frame.
  doc.setFillColor(...hexToRgb(design.bg))
  doc.rect(left, top, qrMm, layout.height * unit, 'F')
  if (design.frame || design.border) {
    doc.setDrawColor(...hexToRgb(design.fg))
    doc.setLineWidth((design.frame ? 1 : 0.5) * unit)
    doc.roundedRect(left, top, qrMm, layout.height * unit, (design.frame ? 2.5 : 1) * unit, (design.frame ? 2.5 : 1) * unit, 'S')
  }

  for (const s of geo.shapes) {
    doc.setFillColor(...hexToRgb(s.fill))
    if (s.t === 'rect') {
      const x = left + offset + s.x * unit
      const y = top + offset + s.y * unit
      // Tiny overlap avoids hairline seams between neighbouring square modules in some PDF viewers.
      const bleed = s.r === 0 && s.w === 1 ? 0.02 * unit : 0
      if (s.r > 0) doc.roundedRect(x, y, s.w * unit, s.h * unit, s.r * unit, s.r * unit, 'F')
      else doc.rect(x - bleed, y - bleed, s.w * unit + bleed * 2, s.h * unit + bleed * 2, 'F')
    } else {
      doc.circle(left + offset + s.cx * unit, top + offset + s.cy * unit, s.r * unit, 'F')
    }
  }

  if (geo.logoBox) {
    const b = geo.logoBox
    doc.setFillColor(...hexToRgb(design.bg))
    doc.roundedRect(left + offset + (b.x - 0.5) * unit, top + offset + (b.y - 0.5) * unit, (b.size + 1) * unit, (b.size + 1) * unit, 1.2 * unit, 1.2 * unit, 'F')
    if (opts.logoDataUrl) {
      const fmt = opts.logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      try {
        doc.addImage(opts.logoDataUrl, fmt, left + offset + (b.x + 0.4) * unit, top + offset + (b.y + 0.4) * unit, (b.size - 0.8) * unit, (b.size - 0.8) * unit)
      } catch {
        // Unsupported logo format (e.g. WebP in jsPDF): the cleared area stays blank, the code still scans.
      }
    }
  }

  let y = top + (layout.pad * 2 + geo.extent) * unit
  if (layout.ctaHeight) {
    doc.setFillColor(...hexToRgb(design.fg))
    doc.roundedRect(left + 2 * unit, y, qrMm - 4 * unit, (layout.ctaHeight - 1.5) * unit, 1.6 * unit, 1.6 * unit, 'F')
    doc.setTextColor(...hexToRgb(design.bg))
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(Math.max(10, 2.6 * unit * 2.83))
    doc.text(design.cta ?? '', pageW / 2, y + ((layout.ctaHeight - 1.5) * unit) / 2, { align: 'center', baseline: 'middle' })
    y += layout.ctaHeight * unit
  }

  doc.setTextColor(71, 85, 105)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(opts.instruction ?? 'Point your phone camera at the code to open it.', pageW / 2, y + 12, {
    align: 'center',
    maxWidth: pageW - 24,
  })
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text(text.startsWith('http') ? text : '', pageW / 2, y + 19, { align: 'center' })

  doc.save(`${filename}.pdf`)
}

/** Fetch an image (e.g. the business logo) and return a data: URL for embedding. */
export async function imageUrlToDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return undefined
    const blob = await res.blob()
    if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) return undefined
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined)
      reader.onerror = () => resolve(undefined)
      reader.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

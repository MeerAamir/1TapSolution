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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/**
 * Opens a clean print view (the code at about 9 cm, the title above and the
 * link below) and starts printing. No scripts run in the new window.
 */
export function printQr(text: string, design: QrDesign, opts: RenderOptions, title: string) {
  const svg = renderSvg(text, design, opts).replace(/ width="[\d.]+" height="[\d.]+"/, ' width="100%" height="100%"')
  const w = window.open('', '_blank', 'width=720,height=900')
  if (!w) throw new Error('Allow pop-ups for this site to print.')
  const link = text.startsWith('http') ? `<p class="link">${escapeHtml(text)}</p>` : ''
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { margin: 16mm; }
  html, body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0f172a; }
  main { display: flex; min-height: 90vh; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  h1 { font-size: 22pt; margin: 0 0 8mm; }
  .qr { width: 90mm; }
  .hint { margin: 7mm 0 0; font-size: 12pt; color: #475569; }
  .link { margin: 2mm 0 0; font-size: 9pt; color: #94a3b8; }
</style></head><body><main>
  ${title ? `<h1>${escapeHtml(title)}</h1>` : ''}
  <div class="qr">${svg}</div>
  <p class="hint">Scan with your phone camera</p>${link}
</main></body></html>`)
  w.document.close()
  w.focus()
  // Give the browser a moment to lay out the SVG before opening the dialog.
  setTimeout(() => {
    w.print()
  }, 250)
}

export type ShareResult = 'shared' | 'copied' | 'failed'

/** Native share sheet (phone) with the QR image attached where supported, else copies the link. */
export async function shareQr(text: string, design: QrDesign, opts: RenderOptions, title: string, url?: string): Promise<ShareResult> {
  if (navigator.share) {
    try {
      const blob = await svgToPngBlob(renderSvg(text, design, opts), 1024)
      const file = new File([blob], `${safeFilename(title)}.png`, { type: 'image/png' })
      const data: ShareData = { title, text: url ? `${title}\n${url}` : title, url }
      if (navigator.canShare?.({ files: [file] })) data.files = [file]
      await navigator.share(data)
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared'
    }
  }
  try {
    await navigator.clipboard.writeText(url ?? text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

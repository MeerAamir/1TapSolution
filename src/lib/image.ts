/**
 * Browser-side image processing: crop, resize and re-encode before upload, so a
 * 10 MB phone photo becomes a sharp ~100–300 KB file. Saves storage and
 * bandwidth on the free plans and makes visitor pages fast on mobile data.
 */

export interface PixelArea {
  x: number
  y: number
  width: number
  height: number
}

/** What each kind of image is used for decides its final size. */
export const IMAGE_PRESETS = {
  /** Round profile picture or logo on a page, or the logo in a QR code. */
  avatar: { aspect: 1, maxSide: 512, round: true },
  logo: { aspect: 1, maxSide: 512, round: false },
  /** Wide banner at the top of a page. */
  cover: { aspect: 3, maxSide: 1500, round: false },
  /** Pictures inside a page. */
  content: { aspect: undefined, maxSide: 1600, round: false },
} as const

let webpSupport: boolean | null = null
async function canEncodeWebp(): Promise<boolean> {
  if (webpSupport !== null) return webpSupport
  const c = document.createElement('canvas')
  c.width = c.height = 2
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.8))
  webpSupport = blob?.type === 'image/webp'
  return webpSupport
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true
  return false
}

async function encode(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<{ blob: Blob; ext: string }> {
  const toBlob = (type: string, q?: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q))
  if (await canEncodeWebp()) {
    const b = await toBlob('image/webp', 0.8)
    if (b) return { blob: b, ext: 'webp' }
  }
  // Older Safari: PNG keeps transparency (logos), JPEG for everything else.
  if (hasTransparency(ctx, canvas.width, canvas.height)) {
    const b = await toBlob('image/png')
    if (b) return { blob: b, ext: 'png' }
  }
  const b = await toBlob('image/jpeg', 0.82)
  if (!b) throw new Error('This browser could not process the image.')
  return { blob: b, ext: 'jpg' }
}

/**
 * Crops (optional) and scales an image so its longest side is at most maxSide,
 * then re-encodes it (WebP where supported). Never enlarges.
 */
export async function processImage(file: File, opts: { area?: PixelArea | null; maxSide: number }): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const src = opts.area ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
    const scale = Math.min(1, opts.maxSide / Math.max(src.width, src.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(src.width * scale))
    canvas.height = Math.max(1, Math.round(src.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser could not process the image.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, src.x, src.y, src.width, src.height, 0, 0, canvas.width, canvas.height)
    const { blob, ext } = await encode(canvas, ctx)
    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    return new File([blob], `${base}.${ext}`, { type: blob.type })
  } finally {
    bitmap.close()
  }
}

export function formatKb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

const toHex = (n: number) => n.toString(16).padStart(2, '0')

/**
 * The main colours of a picture (for "match my banner/logo"): strongest,
 * reasonably saturated colours first, then a darker and a lighter fallback.
 */
export async function dominantColors(url: string, count = 3): Promise<string[]> {
  const blob = await (await fetch(url, { mode: 'cors' })).blob()
  const bmp = await createImageBitmap(blob)
  const size = 48
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(bmp, 0, 0, size, size)
  bmp.close()
  const data = ctx.getImageData(0, 0, size, size).data
  const buckets = new Map<string, { r: number; g: number; b: number; n: number; score: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max === 0 ? 0 : (max - min) / max
    const light = (max + min) / 510
    if (light > 0.94 || light < 0.06) continue // ignore paper-white and pure black
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`
    const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, score: 0 }
    e.r += r
    e.g += g
    e.b += b
    e.n += 1
    e.score += 0.35 + sat
    buckets.set(key, e)
  }
  const sorted = [...buckets.values()].sort((a, b) => b.score - a.score)
  const out: string[] = []
  for (const e of sorted) {
    const hex = `#${toHex(Math.round(e.r / e.n))}${toHex(Math.round(e.g / e.n))}${toHex(Math.round(e.b / e.n))}`.toUpperCase()
    // Skip colours too close to one already picked.
    const near = out.some((o) => {
      const d = [1, 3, 5].reduce((s, k) => s + Math.abs(parseInt(o.slice(k, k + 2), 16) - parseInt(hex.slice(k, k + 2), 16)), 0)
      return d < 90
    })
    if (!near) out.push(hex)
    if (out.length >= count) break
  }
  return out
}

/** Mix a colour with white (amount 0–1), for soft backgrounds. */
export function tint(hex: string, amount: number): string {
  const ch = (k: number) => {
    const v = parseInt(hex.slice(k, k + 2), 16)
    return toHex(Math.round(v + (255 - v) * amount))
  }
  return `#${ch(1)}${ch(3)}${ch(5)}`.toUpperCase()
}

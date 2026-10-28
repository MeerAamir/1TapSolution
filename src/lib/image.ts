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

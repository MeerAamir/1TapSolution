/**
 * File uploads to Supabase Storage with defence in depth:
 *  1. extension allow-list, 2. size limit, 3. magic-byte sniffing of the actual
 *  content (the browser-supplied MIME type is ignored), 4. bucket-level MIME and
 *  size limits enforced by Supabase, 5. random storage paths.
 * SVG/HTML and anything executable are rejected.
 */
import { config } from '@/config'
import { getSupabase } from './supabase'
import type { FileBucket, FileRecord } from './types'

export const ALLOWED: Record<string, { mime: string; ext: string }> = {
  pdf: { mime: 'application/pdf', ext: 'pdf' },
  png: { mime: 'image/png', ext: 'png' },
  jpg: { mime: 'image/jpeg', ext: 'jpg' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  webp: { mime: 'image/webp', ext: 'webp' },
  gif: { mime: 'image/gif', ext: 'gif' },
}

export const ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/png,image/jpeg,image/webp,image/gif'
export const ACCEPT_IMAGES = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'

/** Identify the real file type from its first bytes. */
export function sniffMime(bytes: Uint8Array): string | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b)
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf' // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (starts([0x47, 0x49, 0x46, 0x38])) return 'image/gif' // GIF8
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp' // RIFF....WEBP
  return null
}

export interface ValidatedFile {
  file: File
  mime: string
  ext: string
}

/** Photos may be larger before compression; the size limit applies to the optimised result. */
const MAX_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024

export async function validateUpload(file: File, opts: { imagesOnly?: boolean } = {}): Promise<ValidatedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const allowed = ALLOWED[ext]
  if (!allowed) throw new Error('Only PDF, PNG, JPG, WebP and GIF files can be uploaded.')
  if (file.size === 0) throw new Error('This file is empty.')
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const sniffed = sniffMime(head)
  if (!sniffed) throw new Error('The file content is not a valid PDF or image.')
  if (sniffed !== allowed.mime) throw new Error(`The file extension .${ext} does not match its content.`)
  if (opts.imagesOnly && sniffed === 'application/pdf') throw new Error('Choose an image file (PNG, JPG or WebP).')
  const compressible = sniffed !== 'application/pdf' && sniffed !== 'image/gif'
  const maxBytes = compressible ? Math.max(MAX_IMAGE_SOURCE_BYTES, maxUploadBytes()) : maxUploadBytes()
  if (file.size > maxBytes) throw new Error(`This file is larger than ${Math.round(maxBytes / 1048576)} MB.`)
  return { file, mime: sniffed, ext: allowed.ext }
}

function maxUploadBytes(): number {
  return config.maxUploadMb * 1024 * 1024
}

/** Validates, optimises images, then enforces the final size limit. */
export async function prepareUpload(file: File, opts: { imagesOnly?: boolean } = {}): Promise<ValidatedFile> {
  const v = await optimizeImage(await validateUpload(file, opts))
  if (v.file.size > maxUploadBytes()) {
    throw new Error(`This file is larger than ${config.maxUploadMb} MB${v.mime.startsWith('image/') ? ' even after compression' : ''}.`)
  }
  return v
}

/** Longest side of uploaded photos after optimisation, in pixels. */
const MAX_IMAGE_SIDE = 1920
/** PDFs above this size get a warning: slow on mobile data and costly in bandwidth. */
export const LARGE_PDF_BYTES = 3 * 1024 * 1024

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Shrinks large photos before upload (longest side 1920 px, re-encoded).
 * Saves storage and bandwidth on the free plans and makes pages load faster on
 * phones. PNGs stay PNG (keeps transparency for logos); JPEG/WebP become JPEG.
 * Animated GIFs and already-small images are left untouched. Never returns a
 * larger file than the original.
 */
export async function optimizeImage(v: ValidatedFile): Promise<ValidatedFile> {
  if (!v.mime.startsWith('image/') || v.mime === 'image/gif') return v
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return v
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(v.file)
  } catch {
    return v
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && v.file.size < 300 * 1024) {
    bitmap.close()
    return v
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return v
  }
  const keepPng = v.mime === 'image/png'
  if (!keepPng) {
    ctx.fillStyle = '#FFFFFF' // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  let asPng = keepPng
  let blob = await canvasToBlob(canvas, keepPng ? 'image/png' : 'image/jpeg', keepPng ? undefined : 0.82)
  // Large PNG photos/screenshots without transparency are much smaller as JPEG.
  if (keepPng && blob && blob.size > 1024 * 1024 && isOpaque(ctx, canvas.width, canvas.height)) {
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.82)
    if (jpeg && jpeg.size < blob.size) {
      blob = jpeg
      asPng = false
    }
  }
  if (!blob || blob.size >= v.file.size) return v
  const mime = asPng ? 'image/png' : 'image/jpeg'
  const ext = asPng ? 'png' : 'jpg'
  const name = v.file.name.replace(/\.[^.]+$/, '') + '.' + ext
  return { file: new File([blob], name, { type: mime }), mime, ext }
}

function isOpaque(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const data = ctx.getImageData(0, 0, width, height).data
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return false
  }
  return true
}

function storagePath(businessId: string | null, ext: string): string {
  return `${businessId ?? 'shared'}/${crypto.randomUUID()}.${ext}`
}

async function uploadObject(bucket: FileBucket, path: string, v: ValidatedFile, onProgress?: (pct: number) => void) {
  onProgress?.(10)
  // Every upload gets a new random path, so the object never changes: let
  // browsers and the CDN cache it for a year (saves bandwidth on free plans).
  const { error } = await getSupabase().storage.from(bucket).upload(path, v.file, {
    contentType: v.mime,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw new Error(error.message)
  onProgress?.(100)
}

function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 160) || 'Untitled'
}

export async function uploadFile(
  file: File,
  opts: {
    businessId: string | null
    bucket?: FileBucket
    title?: string
    description?: string
    showOnProfile?: boolean
    imagesOnly?: boolean
    onProgress?: (pct: number) => void
  },
): Promise<FileRecord> {
  const v = await prepareUpload(file, { imagesOnly: opts.imagesOnly })
  const bucket = opts.bucket ?? 'public-files'
  const path = storagePath(opts.businessId, v.ext)
  await uploadObject(bucket, path, v, opts.onProgress)
  const { data, error } = await getSupabase()
    .from('files')
    .insert({
      business_id: opts.businessId,
      bucket,
      storage_path: path,
      title: opts.title?.trim() || titleFromName(file.name),
      description: opts.description?.trim() || null,
      original_filename: file.name.slice(0, 255),
      mime_type: v.mime,
      size_bytes: v.file.size,
      show_on_profile: opts.showOnProfile ?? false,
    })
    .select()
    .single()
  if (error) {
    await getSupabase().storage.from(bucket).remove([path]) // don't leave an orphan behind
    throw error
  }
  return data as FileRecord
}

/**
 * Replace the content of an existing file record. Every QR code and page that
 * points to this record serves the new file immediately; the old object is
 * removed only after the database points to the new one.
 */
export async function replaceFile(record: FileRecord, file: File, onProgress?: (pct: number) => void): Promise<FileRecord> {
  const v = await prepareUpload(file, { imagesOnly: record.kind === 'image' })
  if ((v.mime === 'application/pdf') !== (record.kind === 'document')) {
    throw new Error(record.kind === 'document' ? 'Replace a document with another PDF.' : 'Replace an image with another image.')
  }
  const path = storagePath(record.business_id, v.ext)
  await uploadObject(record.bucket, path, v, onProgress)
  const { data, error } = await getSupabase()
    .from('files')
    .update({
      storage_path: path,
      mime_type: v.mime,
      size_bytes: v.file.size,
      original_filename: file.name.slice(0, 255),
      version: record.version + 1,
    })
    .eq('id', record.id)
    .select()
    .single()
  if (error) {
    await getSupabase().storage.from(record.bucket).remove([path])
    throw error
  }
  // Best effort: an orphaned old object is harmless (unreferenced, random path).
  await getSupabase().storage.from(record.bucket).remove([record.storage_path])
  return data as FileRecord
}

/** Deletes the record first (the database refuses if anything still uses it), then the object. */
export async function deleteFile(record: FileRecord): Promise<void> {
  const { error } = await getSupabase().from('files').delete().eq('id', record.id)
  if (error) throw error
  await getSupabase().storage.from(record.bucket).remove([record.storage_path])
}

/** Short-lived link for private files (admins only). */
export async function signedUrl(record: FileRecord, seconds = 300): Promise<string> {
  const { data, error } = await getSupabase().storage.from(record.bucket).createSignedUrl(record.storage_path, seconds)
  if (error || !data) throw error ?? new Error('Could not create a link')
  return data.signedUrl
}

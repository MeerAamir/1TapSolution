/**
 * Backup: everything needed to rebuild the service elsewhere, as one ZIP.
 *
 *   backup.json       all records (businesses, QR codes, page items, files…)
 *   qr-codes.csv      one row per code, opens in Excel / Google Sheets
 *   scans.csv         scan history (optional)
 *   qr-images/*.svg   every code, print-ready (PNG too if asked)
 *   files/…           uploaded pictures and PDFs (optional)
 *   README.txt        what is inside and how to restore
 *
 * The permanent public_code of each QR code is the key fact: any new website
 * that answers /q/<public_code> keeps every printed code working.
 */
import { strToU8, zip, type Zippable } from 'fflate'
import { config, qrPublicUrl, storagePublicUrl } from '@/config'
import { parseDesign } from '@/lib/qr/design'
import { encodedContent } from '@/lib/qr/destinations'
import { imageUrlToDataUrl, safeFilename, svgToPngBlob } from '@/lib/qr/export'
import { renderSvg } from '@/lib/qr/render'
import { getSupabase } from '@/lib/supabase'

export type BackupPeriod = 'all' | 'today' | 'month' | '30d' | 'custom'

export interface BackupOptions {
  period: BackupPeriod
  /** yyyy-mm-dd, for custom */
  from?: string
  to?: string
  /** '' = every business */
  businessId: string
  qrImages: boolean
  pngImages: boolean
  uploadedFiles: boolean
  scans: boolean
}

export interface BackupResult {
  blob: Blob
  filename: string
  counts: { businesses: number; qr: number; blocks: number; files: number; scans: number; missing: number }
}

type Row = Record<string, unknown>
// Supabase query builders, chained loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any
const sb = () => getSupabase()
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

export function periodRange(o: Pick<BackupOptions, 'period' | 'from' | 'to'>, now = new Date()): { from: Date | null; to: Date | null } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  switch (o.period) {
    case 'today':
      return { from: start, to: null }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null }
    case '30d':
      start.setDate(start.getDate() - 29)
      return { from: start, to: null }
    case 'custom': {
      const f = o.from ? new Date(`${o.from}T00:00:00`) : null
      const t = o.to ? new Date(`${o.to}T23:59:59.999`) : null
      return { from: f && !isNaN(+f) ? f : null, to: t && !isNaN(+t) ? t : null }
    }
    default:
      return { from: null, to: null }
  }
}

async function all(table: string, build: (q: Q) => Q = (q) => q): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = (await build(sb().from(table).select('*')).order('id').range(from, from + 999)) as { data: Row[] | null; error: unknown }
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

function csv(rows: Row[], cols: string[]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // BOM so Excel reads names in any language correctly.
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n')
}

const README = (exportedAt: string, scope: string) => `1 TAP SOLUTION — BACKUP
Exported: ${exportedAt}
Scope: ${scope}
Website: ${config.publicAppUrl}

WHAT IS INSIDE
  backup.json      Every record: businesses (with hours, locations, social links),
                   categories, QR codes, page items (content_blocks) and file details.
                   Same field names as the database tables.
  qr-codes.csv     One line per QR code: name, type, business, permanent link, status.
  scans.csv        Scan history (if chosen): time, code, device, browser.
  qr-images/       Every QR code as a print-ready SVG (and PNG if chosen).
  files/           Uploaded pictures and PDFs (if chosen), in their storage folders.

THE MOST IMPORTANT THING
  Every printed QR code contains a permanent link:  <website>/q/<public_code>
  Keep the public_code values. A new website (or this one, restored) that answers
  /q/<public_code> with the same content keeps every printed code working.

TO RESTORE INTO A NEW SUPABASE PROJECT
  1. Run supabase/setup-all.sql from the project's GitHub repository (without the
     demo data) in the new project's SQL editor.
  2. Insert the rows from backup.json into the tables of the same names, in this
     order: categories, businesses, business_hours, business_locations,
     business_social_links, files, qr_codes, content_blocks.
  3. Upload the files/ folder to the storage buckets: the first folder name of each
     path is the bucket (public-files or private-files).
  4. Deploy the website and point it at the new project. Codes work again at once.
`

/** Builds the backup ZIP in the browser. Progress messages go to onStep. */
export async function buildBackup(o: BackupOptions, onStep: (msg: string) => void = () => {}): Promise<BackupResult> {
  const { from, to } = periodRange(o)
  const inPeriod = (q: Q): Q => {
    let x = q
    if (from) x = x.or(`created_at.gte.${from.toISOString()},updated_at.gte.${from.toISOString()}`)
    if (to) x = x.lte('created_at', to.toISOString())
    return x
  }

  onStep('Reading businesses…')
  const businesses = await all('businesses', (q) => (o.businessId ? q.eq('id', o.businessId) : q))
  const bizIds = businesses.map((b) => b.id as string)
  const byBiz = (q: Q): Q => (o.businessId ? q.in('business_id', bizIds) : q)
  const [categories, hours, locations, social] = await Promise.all([
    all('categories'),
    all('business_hours', byBiz),
    all('business_locations', byBiz),
    all('business_social_links', byBiz),
  ])

  onStep('Reading QR codes…')
  const qr = await all('qr_codes', (q) => inPeriod(byBiz(q)))
  const qrIds = new Set(qr.map((r) => r.id as string))
  const blocksAll = await all('content_blocks', byBiz)
  // Page items of the chosen codes, plus business-page items when the whole business is included.
  const blocks = blocksAll.filter((b) => (b.qr_code_id ? qrIds.has(b.qr_code_id as string) : !from && !to))

  onStep('Reading file details…')
  const referenced = new Set((JSON.stringify([qr, blocks, businesses]).match(UUID) ?? []).map((s) => s.toLowerCase()))
  const filesAll = await all('files')
  const files = filesAll.filter((f) => referenced.has(String(f.id)) || (!from && !to && (!o.businessId || f.business_id === o.businessId)))

  let scans: Row[] = []
  if (o.scans) {
    onStep('Reading scan history…')
    scans = await all('qr_scan_events', (q) => {
      let x = byBiz(q.eq('is_simulated', false))
      if (from) x = x.gte('occurred_at', from.toISOString())
      if (to) x = x.lte('occurred_at', to.toISOString())
      return x.order('occurred_at', { ascending: false })
    })
  }

  const exportedAt = new Date().toISOString()
  const bizName = new Map(businesses.map((b) => [b.id as string, b.is_workspace ? '' : (b.name as string)]))
  const scope = `${o.businessId ? `Business: ${bizName.get(o.businessId) || 'No business'}` : 'All businesses'}; ${
    from ? `changed from ${from.toLocaleDateString()}` : 'all time'
  }${to ? ` to ${to.toLocaleDateString()}` : ''}`

  const out: Zippable = {
    'README.txt': strToU8(README(exportedAt, scope)),
    'backup.json': strToU8(
      JSON.stringify(
        {
          format: '1tap-solution-backup',
          version: 1,
          exported_at: exportedAt,
          site: config.publicAppUrl,
          scope,
          tables: { categories, businesses, business_hours: hours, business_locations: locations, business_social_links: social, files, qr_codes: qr, content_blocks: blocks },
        },
        null,
        2,
      ),
    ),
    'qr-codes.csv': strToU8(
      csv(
        qr.map((r) => ({
          ...r,
          business: bizName.get(r.business_id as string) ?? '',
          link: qrPublicUrl(r.public_code as string),
          destination: r.destination,
        })),
        ['name', 'type', 'business', 'public_code', 'link', 'status', 'archived_at', 'expires_at', 'created_at', 'updated_at', 'description', 'destination'],
      ),
    ),
  }
  if (o.scans) {
    const qrName = new Map(qr.map((r) => [r.id as string, r.name as string]))
    out['scans.csv'] = strToU8(
      csv(
        scans.map((s) => ({ ...s, qr_name: qrName.get(s.qr_code_id as string) ?? '' })),
        ['occurred_at', 'qr_name', 'qr_code_id', 'qr_type', 'device_category', 'browser_category'],
      ),
    )
  }

  let missing = 0
  if (o.qrImages) {
    const images: Record<string, Uint8Array> = {}
    const fileById = new Map(filesAll.map((f) => [f.id as string, f]))
    const logos = new Map<string, Promise<string | undefined>>()
    const used = new Set<string>()
    for (const [i, r] of qr.entries()) {
      onStep(`Drawing QR codes ${i + 1} of ${qr.length}…`)
      const design = parseDesign(r.design)
      let logoDataUrl: string | undefined
      const logoId = design.logo ? design.logoFileId : undefined
      const lf = logoId ? fileById.get(logoId) : undefined
      if (lf) {
        if (!logos.has(logoId!)) logos.set(logoId!, imageUrlToDataUrl(storagePublicUrl(lf.storage_path as string, lf.version as number)).catch(() => undefined))
        logoDataUrl = await logos.get(logoId!)
      }
      const name = r.type === 'business_profile' && bizName.get(r.business_id as string) ? bizName.get(r.business_id as string)! : (r.name as string)
      const text = encodedContent(r.type as never, r.destination as never, qrPublicUrl(r.public_code as string))
      const svg = renderSvg(text, design, { logoDataUrl, businessName: name })
      let base = `${safeFilename(r.name as string)}-${r.public_code}`
      while (used.has(base)) base += '-x'
      used.add(base)
      images[`${base}.svg`] = strToU8(svg)
      if (o.pngImages) {
        try {
          images[`${base}.png`] = new Uint8Array(await (await svgToPngBlob(svg, 1200)).arrayBuffer())
        } catch {
          missing++
        }
      }
    }
    out['qr-images'] = images
  }

  if (o.uploadedFiles) {
    const store: Record<string, Uint8Array> = {}
    for (const [i, f] of files.entries()) {
      onStep(`Downloading files ${i + 1} of ${files.length}…`)
      const { data, error } = await sb().storage.from(f.bucket as string).download(f.storage_path as string)
      if (error || !data) {
        missing++
        continue
      }
      store[`${f.bucket}/${f.storage_path}`] = new Uint8Array(await data.arrayBuffer())
    }
    out.files = store
  }

  onStep('Packing the ZIP…')
  const zipped = await new Promise<Uint8Array>((resolve, reject) =>
    // Pictures and PDFs are already compressed: store them, squeeze only text.
    zip(out, { level: 6, mem: 8 }, (err, data) => (err ? reject(err) : resolve(data))),
  )
  const stamp = exportedAt.slice(0, 10)
  const who = o.businessId ? safeFilename(bizName.get(o.businessId) || 'no-business') : 'all'
  return {
    blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
    filename: `1tap-backup-${who}-${o.period === 'all' ? 'all-time' : o.period}-${stamp}.zip`,
    counts: { businesses: businesses.filter((b) => !b.is_workspace).length, qr: qr.length, blocks: blocks.length, files: files.length, scans: scans.length, missing },
  }
}

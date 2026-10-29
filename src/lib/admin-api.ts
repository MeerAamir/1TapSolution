/**
 * Data access for the dashboard. All calls run with the signed-in user's JWT;
 * the database decides what is allowed (RLS + is_admin()).
 */
import { getSupabase } from './supabase'
import type {
  AuditLog,
  Business,
  BusinessHour,
  BusinessLocation,
  BusinessOverview,
  Category,
  ContactSubmission,
  ContentBlock,
  FileOverview,
  FileRecord,
  PublicBusiness,
  QrCodeRecord,
  QrOverview,
  SocialLink,
} from './types'
import { unwrap } from './use-query'
import type { BusinessFormValues } from './validation/business'

const sb = () => getSupabase()

export type LifecycleFilter = 'live' | 'active' | 'inactive' | 'archived' | 'all' | 'expired' | 'expiring'

/** PostgREST "ilike" pattern with wildcard characters escaped. */
function likePattern(term: string): string {
  return `%${term.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()]/g, ' ')}%`
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export async function listCategories(): Promise<Category[]> {
  return unwrap(await sb().from('categories').select('*').order('name'))
}

export async function saveCategory(input: { id?: string; name: string; slug: string; description: string | null }) {
  if (input.id) {
    const { id, ...rest } = input
    return unwrap(await sb().from('categories').update(rest).eq('id', id).select().single()) as Category
  }
  return unwrap(await sb().from('categories').insert(input).select().single()) as Category
}

export async function deleteCategory(id: string) {
  unwrap(await sb().from('categories').delete().eq('id', id))
}

export async function categoryUsage(): Promise<Record<string, number>> {
  const rows = unwrap(await sb().from('businesses').select('category_id')) as Array<{ category_id: string | null }>
  return rows.reduce<Record<string, number>>((acc, r) => {
    if (r.category_id) acc[r.category_id] = (acc[r.category_id] ?? 0) + 1
    return acc
  }, {})
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------
export interface BusinessListParams {
  search: string
  categoryId: string
  lifecycle: LifecycleFilter
  sort: 'name' | 'created_at' | 'scan_count' | 'updated_at'
  ascending: boolean
  page: number
  pageSize: number
}

export async function listBusinesses(p: BusinessListParams): Promise<{ rows: BusinessOverview[]; total: number }> {
  let q = sb().from('admin_business_overview').select('*', { count: 'exact' })
  if (p.search.trim()) q = q.or(`name.ilike.${likePattern(p.search.trim())},slug.ilike.${likePattern(p.search.trim())}`)
  if (p.categoryId) q = q.eq('category_id', p.categoryId)
  if (p.lifecycle === 'live') q = q.is('archived_at', null)
  if (p.lifecycle === 'active') q = q.is('archived_at', null).eq('status', 'active')
  if (p.lifecycle === 'inactive') q = q.is('archived_at', null).eq('status', 'inactive')
  if (p.lifecycle === 'archived') q = q.not('archived_at', 'is', null)
  if (p.lifecycle === 'expired') q = q.is('archived_at', null).lte('expires_at', new Date().toISOString())
  if (p.lifecycle === 'expiring')
    q = q
      .is('archived_at', null)
      .gt('expires_at', new Date().toISOString())
      .lte('expires_at', new Date(Date.now() + 30 * 86_400_000).toISOString())
  q = q.order(p.sort, { ascending: p.ascending, nullsFirst: false }).order('id')
  const from = p.page * p.pageSize
  const { data, error, count } = await q.range(from, from + p.pageSize - 1)
  if (error) throw error
  return { rows: (data ?? []) as BusinessOverview[], total: count ?? 0 }
}

export async function listBusinessOptions(): Promise<
  Array<Pick<Business, 'id' | 'name' | 'slug' | 'status' | 'archived_at' | 'logo_file_id' | 'is_demo'>>
> {
  return unwrap(
    await sb().from('businesses').select('id, name, slug, status, archived_at, logo_file_id, is_demo').eq('is_workspace', false).order('name'),
  )
}

let workspaceId: Promise<string> | null = null
/** The hidden owner of QR codes that are not linked to a business (created on first use). */
export function workspaceBusinessId(): Promise<string> {
  workspaceId ??= Promise.resolve(sb().rpc('admin_workspace_business')).then(({ data, error }) => {
    if (error) {
      workspaceId = null
      throw error
    }
    return data as string
  })
  return workspaceId
}

export interface BusinessBundle {
  business: Business
  hours: BusinessHour[]
  locations: BusinessLocation[]
  social: SocialLink[]
  blocks: ContentBlock[]
  files: FileRecord[]
  categoryName: string | null
}

export async function getBusinessBundle(id: string): Promise<BusinessBundle> {
  const [business, hours, locations, social, blocks, files] = await Promise.all([
    sb().from('businesses').select('*, categories(name)').eq('id', id).single(),
    sb().from('business_hours').select('*').eq('business_id', id).order('day_of_week').order('opens_at'),
    sb().from('business_locations').select('*').eq('business_id', id).order('position'),
    sb().from('business_social_links').select('*').eq('business_id', id).order('position'),
    sb().from('content_blocks').select('*').eq('business_id', id).is('qr_code_id', null).order('position'),
    sb().from('files').select('*').eq('business_id', id).order('position').order('created_at'),
  ])
  const b = unwrap(business) as Business & { categories: { name: string } | null }
  const { categories, ...rest } = b
  return {
    business: rest,
    categoryName: categories?.name ?? null,
    hours: unwrap(hours) as BusinessHour[],
    locations: unwrap(locations) as BusinessLocation[],
    social: unwrap(social) as SocialLink[],
    blocks: unwrap(blocks) as ContentBlock[],
    files: unwrap(files) as FileRecord[],
  }
}

/** Saves the business and its hours, locations and links in one database transaction. */
export async function saveBusiness(values: BusinessFormValues, id?: string): Promise<string> {
  const { hours, locations, social_links, ...core } = values
  return unwrap(
    await sb().rpc('admin_save_business', {
      p_id: id ?? null,
      p_business: core,
      p_hours: hours,
      p_locations: locations,
      p_social: social_links,
    }),
  ) as string
}

export async function setBusinessLifecycle(id: string, patch: Partial<Pick<Business, 'status' | 'archived_at'>>) {
  return unwrap(await sb().from('businesses').update(patch).eq('id', id).select().single()) as Business
}

export async function deleteBusiness(id: string) {
  unwrap(await sb().from('businesses').delete().eq('id', id))
}

export async function isSlugTaken(slug: string, exceptId?: string): Promise<boolean> {
  let q = sb().from('businesses').select('id').eq('slug', slug)
  if (exceptId) q = q.neq('id', exceptId)
  const rows = unwrap(await q.limit(1)) as unknown[]
  return rows.length > 0
}

/** Builds the same shape the public page receives, from unsaved form state. */
export function previewPayload(
  values: Partial<BusinessFormValues> & { name: string; accent_color: string },
  files: FileRecord[],
  blocks: ContentBlock[],
  categoryName?: string | null,
): PublicBusiness {
  const pub = (id: string | null | undefined) => {
    const f = files.find((x) => x.id === id && x.bucket === 'public-files')
    return f ? { id: f.id, title: f.title, path: f.storage_path, mime_type: f.mime_type, size_bytes: f.size_bytes, kind: f.kind, version: f.version } : undefined
  }
  const visible = files.filter((f) => f.bucket === 'public-files' && f.show_on_profile)
  return {
    name: values.name || 'Business name',
    slug: values.slug ?? '',
    tagline: values.tagline ?? undefined,
    description: values.description ?? undefined,
    category: categoryName ?? undefined,
    accent_color: /^#[0-9a-fA-F]{6}$/.test(values.accent_color) ? values.accent_color : '#2563EB',
    logo: pub(values.logo_file_id),
    cover: pub(values.cover_file_id),
    phone: values.phone ?? undefined,
    whatsapp: values.whatsapp ?? undefined,
    email: values.email ?? undefined,
    website_url: values.website_url ?? undefined,
    google_business_url: values.google_business_url ?? undefined,
    hours_note: values.hours_note ?? undefined,
    custom_fields: values.custom_fields?.length ? values.custom_fields : undefined,
    hours: values.hours?.map((h) => ({ day: h.day_of_week, opens: h.opens_at.slice(0, 5), closes: h.closes_at.slice(0, 5) })),
    locations: values.locations?.map((l) => ({
      label: l.label,
      address: l.address ?? undefined,
      latitude: l.latitude ?? undefined,
      longitude: l.longitude ?? undefined,
      maps_url: l.maps_url ?? undefined,
    })),
    social_links: values.social_links?.map((s) => ({ platform: s.platform, label: s.label ?? undefined, url: s.url })),
    documents: visible.filter((f) => f.kind === 'document').map((f) => pub(f.id)!),
    gallery: visible
      .filter((f) => f.kind === 'image' && f.id !== values.logo_file_id && f.id !== values.cover_file_id)
      .map((f) => pub(f.id)!),
    blocks: blocks.map((b) => ({ id: b.id, type: b.type, data: resolveBlockFiles(b.data, files) })),
  }
}

function resolveBlockFiles(data: Record<string, unknown>, files: FileRecord[]) {
  const toPublic = (id: unknown) => {
    const f = files.find((x) => x.id === id && x.bucket === 'public-files')
    return f ? { id: f.id, title: f.title, path: f.storage_path, mime_type: f.mime_type, size_bytes: f.size_bytes, kind: f.kind, version: f.version } : undefined
  }
  const out: Record<string, unknown> = { ...data }
  if (data.file_id) out.file = toPublic(data.file_id)
  if (Array.isArray(data.file_ids)) out.files = data.file_ids.map(toPublic).filter(Boolean)
  return out
}

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------
export async function listBlocks(businessId: string, qrCodeId: string | null): Promise<ContentBlock[]> {
  let q = sb().from('content_blocks').select('*').eq('business_id', businessId)
  q = qrCodeId ? q.eq('qr_code_id', qrCodeId) : q.is('qr_code_id', null)
  return unwrap(await q.order('position')) as ContentBlock[]
}

/** Replaces the blocks of a profile (qrCodeId null) or landing page atomically. */
export async function saveBlocks(businessId: string, qrCodeId: string | null, blocks: Array<Pick<ContentBlock, 'type' | 'data'>>) {
  unwrap(
    await sb().rpc('admin_save_blocks', {
      p_business_id: businessId,
      p_qr_code_id: qrCodeId,
      p_blocks: blocks.map((b) => ({ type: b.type, data: b.data })),
    }),
  )
}

// ---------------------------------------------------------------------------
// QR codes
// ---------------------------------------------------------------------------
export interface QrListParams {
  search: string
  businessId: string
  type: string
  lifecycle: LifecycleFilter
  sort: 'name' | 'created_at' | 'scan_count' | 'updated_at'
  ascending: boolean
  page: number
  pageSize: number
}

export async function listQrCodes(p: QrListParams): Promise<{ rows: QrOverview[]; total: number }> {
  let q = sb().from('admin_qr_overview').select('*', { count: 'exact' })
  const term = p.search.trim()
  if (term) q = q.or(`name.ilike.${likePattern(term)},business_name.ilike.${likePattern(term)},public_code.ilike.${likePattern(term)}`)
  if (p.businessId) q = q.eq('business_id', p.businessId)
  if (p.type) q = q.eq('type', p.type)
  if (p.lifecycle === 'live') q = q.is('archived_at', null)
  if (p.lifecycle === 'active') q = q.is('archived_at', null).eq('status', 'active')
  if (p.lifecycle === 'inactive') q = q.is('archived_at', null).eq('status', 'inactive')
  if (p.lifecycle === 'archived') q = q.not('archived_at', 'is', null)
  if (p.lifecycle === 'expired') q = q.is('archived_at', null).lte('expires_at', new Date().toISOString())
  if (p.lifecycle === 'expiring')
    q = q
      .is('archived_at', null)
      .gt('expires_at', new Date().toISOString())
      .lte('expires_at', new Date(Date.now() + 30 * 86_400_000).toISOString())
  q = q.order(p.sort, { ascending: p.ascending, nullsFirst: false }).order('id')
  const from = p.page * p.pageSize
  const { data, error, count } = await q.range(from, from + p.pageSize - 1)
  if (error) throw error
  return { rows: (data ?? []) as QrOverview[], total: count ?? 0 }
}

export async function getQr(id: string): Promise<QrOverview> {
  return unwrap(await sb().from('admin_qr_overview').select('*').eq('id', id).single()) as QrOverview
}

export type QrInput = Pick<QrCodeRecord, 'business_id' | 'name' | 'description' | 'type' | 'destination' | 'file_id' | 'design'> & {
  /** Chosen in the browser so the code can be shown (and printed) before the first save. */
  public_code?: string
  /** After this moment scans show "not active"; null = no end date. */
  expires_at?: string | null
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
/** A random 10-character permanent code, same shape as the database default. */
export function newPublicCode(length = 10): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

export async function createQr(input: QrInput): Promise<QrCodeRecord> {
  return unwrap(await sb().from('qr_codes').insert(input).select().single()) as QrCodeRecord
}

export async function updateQr(id: string, patch: Partial<QrInput> & Partial<Pick<QrCodeRecord, 'status' | 'archived_at'>>) {
  return unwrap(await sb().from('qr_codes').update(patch).eq('id', id).select().single()) as QrCodeRecord
}

export async function deleteQr(id: string) {
  unwrap(await sb().from('qr_codes').delete().eq('id', id))
}

/** Copies configuration (and landing-page blocks) into a new code with a new public link. */
export async function duplicateQr(source: QrCodeRecord): Promise<QrCodeRecord> {
  const copy = await createQr({
    business_id: source.business_id,
    name: `${source.name} (copy)`.slice(0, 120),
    description: source.description,
    type: source.type,
    destination: source.destination,
    file_id: source.file_id,
    design: source.design,
    expires_at: source.expires_at ?? null,
  })
  if (source.type === 'landing_page') {
    const blocks = await listBlocks(source.business_id, source.id)
    await saveBlocks(source.business_id, copy.id, blocks)
  }
  return copy
}

export async function listQrForBusiness(businessId: string): Promise<QrOverview[]> {
  return unwrap(await sb().from('admin_qr_overview').select('*').eq('business_id', businessId).order('created_at', { ascending: false })) as QrOverview[]
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
export interface FileListParams {
  search: string
  businessId: string
  kind: '' | 'document' | 'image'
  visibility: '' | 'public-files' | 'private-files'
  page: number
  pageSize: number
}

export async function listFiles(p: FileListParams): Promise<{ rows: FileOverview[]; total: number }> {
  let q = sb().from('admin_file_overview').select('*', { count: 'exact' })
  const term = p.search.trim()
  if (term) q = q.or(`title.ilike.${likePattern(term)},original_filename.ilike.${likePattern(term)}`)
  if (p.businessId === 'shared') q = q.is('business_id', null)
  else if (p.businessId) q = q.eq('business_id', p.businessId)
  if (p.kind) q = q.eq('kind', p.kind)
  if (p.visibility) q = q.eq('bucket', p.visibility)
  const from = p.page * p.pageSize
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, from + p.pageSize - 1)
  if (error) throw error
  return { rows: (data ?? []) as FileOverview[], total: count ?? 0 }
}

export async function listFilesForPicker(businessId: string | null, kind?: 'document' | 'image'): Promise<FileRecord[]> {
  let q = sb().from('files').select('*').eq('bucket', 'public-files')
  q = businessId ? q.or(`business_id.eq.${businessId},business_id.is.null`) : q
  if (kind) q = q.eq('kind', kind)
  return unwrap(await q.order('created_at', { ascending: false }).limit(200)) as FileRecord[]
}

export async function updateFileMeta(
  id: string,
  patch: Partial<Pick<FileRecord, 'title' | 'description' | 'business_id' | 'show_on_profile' | 'position'>>,
) {
  return unwrap(await sb().from('files').update(patch).eq('id', id).select().single()) as FileRecord
}

export async function fileUsage(id: string): Promise<Array<{ usage_type: string; entity_id: string; entity_name: string }>> {
  return unwrap(await sb().rpc('file_usage', { p_file_id: id }))
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
export interface OverviewStats {
  businesses_total: number
  businesses_active: number
  businesses_archived: number
  qr_total: number
  qr_active: number
  qr_inactive: number
  qr_archived: number
  scans_total: number
  scans_30d: number
  unique_visitors_30d: number
  files_total: number
  messages_new: number
}

export async function overviewStats(): Promise<OverviewStats> {
  return unwrap(await sb().rpc('admin_overview_stats')) as OverviewStats
}

export interface SeriesPoint {
  bucket: string
  scans: number
  unique_visitors: number
}

export async function scanSeries(params: {
  from: Date
  to: Date
  interval: 'day' | 'month'
  tz: string
  qrCodeId?: string
  businessId?: string
}): Promise<SeriesPoint[]> {
  const rows = unwrap(
    await sb().rpc('admin_scan_series', {
      p_from: params.from.toISOString(),
      p_to: params.to.toISOString(),
      p_interval: params.interval,
      p_tz: params.tz,
      p_qr_code_id: params.qrCodeId ?? null,
      p_business_id: params.businessId ?? null,
    }),
  ) as Array<{ bucket: string; scans: number | string; unique_visitors: number | string }>
  return rows.map((r) => ({ bucket: r.bucket, scans: Number(r.scans), unique_visitors: Number(r.unique_visitors) }))
}

export async function topQrCodes(from: Date, to: Date, limit = 10, businessId?: string) {
  const rows = unwrap(
    await sb().rpc('admin_top_qr_codes', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_limit: limit,
      p_business_id: businessId ?? null,
    }),
  ) as Array<{ qr_code_id: string; name: string; business_name: string; type: string; status: string; scans: number | string }>
  return rows.map((r) => ({ ...r, scans: Number(r.scans) }))
}

export async function scanBreakdown(dimension: 'device' | 'browser' | 'qr_type', from: Date, to: Date, filter: { qrCodeId?: string; businessId?: string } = {}) {
  const rows = unwrap(
    await sb().rpc('admin_scan_breakdown', {
      p_dimension: dimension,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_qr_code_id: filter.qrCodeId ?? null,
      p_business_id: filter.businessId ?? null,
    }),
  ) as Array<{ label: string; scans: number | string }>
  return rows.map((r) => ({ label: r.label, scans: Number(r.scans) }))
}

export async function recentScans(filter: { qrCodeId?: string; businessId?: string }, limit = 20) {
  let q = sb()
    .from('qr_scan_events')
    .select('id, occurred_at, device_category, browser_category, qr_type, qr_code_id, qr_codes(name), businesses(name)')
    .eq('is_simulated', false)
  if (filter.qrCodeId) q = q.eq('qr_code_id', filter.qrCodeId)
  if (filter.businessId) q = q.eq('business_id', filter.businessId)
  return unwrap(await q.order('occurred_at', { ascending: false }).limit(limit)) as unknown as Array<{
    id: number
    occurred_at: string
    device_category: string
    browser_category: string
    qr_type: string
    qr_code_id: string | null
    qr_codes: { name: string } | null
    businesses: { name: string } | null
  }>
}

// ---------------------------------------------------------------------------
// Activity, messages
// ---------------------------------------------------------------------------
export async function recentActivity(limit = 15, entityId?: string): Promise<AuditLog[]> {
  let q = sb().from('audit_logs').select('*')
  if (entityId) q = q.eq('entity_id', entityId)
  return unwrap(await q.order('created_at', { ascending: false }).limit(limit)) as AuditLog[]
}

export async function listMessages(status: ContactSubmission['status'] | 'all', page: number, pageSize: number) {
  let q = sb().from('contact_submissions').select('*', { count: 'exact' })
  if (status !== 'all') q = q.eq('status', status)
  const from = page * pageSize
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, from + pageSize - 1)
  if (error) throw error
  return { rows: (data ?? []) as ContactSubmission[], total: count ?? 0 }
}

export async function setMessageStatus(id: string, status: ContactSubmission['status']) {
  unwrap(await sb().from('contact_submissions').update({ status }).eq('id', id))
}

export async function deleteMessage(id: string) {
  unwrap(await sb().from('contact_submissions').delete().eq('id', id))
}

// ---------------------------------------------------------------------------
// Free-plan usage
// ---------------------------------------------------------------------------
export interface UsageInfo {
  database_bytes: number
  file_bytes: number
  file_count: number
  raw_scan_rows: number
  daily_scan_rows: number
  last_heartbeat: string | null
  heartbeat_source: string | null
}

export async function adminUsage(): Promise<UsageInfo> {
  return unwrap(await sb().rpc('admin_usage')) as UsageInfo
}

// ---------------------------------------------------------------------------
// Sample content
// ---------------------------------------------------------------------------
export async function demoContentCounts(): Promise<{ businesses: number; qr: number }> {
  const [b, q] = await Promise.all([
    sb().from('businesses').select('id', { count: 'exact', head: true }).eq('is_demo', true),
    sb().from('qr_codes').select('id', { count: 'exact', head: true }).eq('is_demo', true),
  ])
  if (b.error) throw b.error
  if (q.error) throw q.error
  return { businesses: b.count ?? 0, qr: q.count ?? 0 }
}

/** Deletes the sample businesses and codes that come with a new installation. Real content is never touched. */
export async function removeDemoContent(): Promise<void> {
  unwrap(await sb().from('qr_codes').delete().eq('is_demo', true))
  unwrap(await sb().from('businesses').delete().eq('is_demo', true))
}

export async function getFile(id: string): Promise<FileRecord | null> {
  const { data, error } = await sb().from('files').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as FileRecord | null) ?? null
}

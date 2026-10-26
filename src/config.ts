/**
 * Public, build-time configuration. Everything here ends up in the browser
 * bundle, so it must never contain secrets (service-role keys etc.).
 */

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

const env = import.meta.env

/**
 * Browsers sometimes report legacy IANA names (Chrome on Indian systems reports
 * "Asia/Calcutta"). Map them to current names that every database recognises.
 */
const LEGACY_ZONES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Dacca': 'Asia/Dhaka',
  'Asia/Thimbu': 'Asia/Thimphu',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
}

export function canonicalTimeZone(zone: string): string {
  return LEGACY_ZONES[zone] ?? zone
}

export const config = {
  supabaseUrl: (env.VITE_SUPABASE_URL as string | undefined) ?? '',
  supabaseAnonKey: (env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  /**
   * Canonical public origin, e.g. https://1tap.example.com.
   * Every QR code encodes `${publicAppUrl}/q/<code>`, so set this to the final
   * production domain BEFORE printing codes.
   */
  publicAppUrl: trimSlash(
    (env.VITE_PUBLIC_APP_URL as string | undefined) ||
      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'),
  ),
  demoQrCode: (env.VITE_DEMO_QR_CODE as string | undefined) || 'demoCafe01',
  maxUploadMb: Number(env.VITE_MAX_UPLOAD_MB ?? 10) || 10,
  contact: {
    email: (env.VITE_CONTACT_EMAIL as string | undefined) || '',
    phone: (env.VITE_CONTACT_PHONE as string | undefined) || '',
    whatsapp: (env.VITE_CONTACT_WHATSAPP as string | undefined) || '',
  },
  /** Time zone used for analytics buckets in the dashboard. */
  analyticsTimeZone: canonicalTimeZone(
    (env.VITE_ANALYTICS_TIMEZONE as string | undefined) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  ),
} as const

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey)

export function qrPublicUrl(publicCode: string): string {
  return `${config.publicAppUrl}/q/${encodeURIComponent(publicCode)}`
}

export function businessPublicUrl(slug: string): string {
  return `${config.publicAppUrl}/b/${encodeURIComponent(slug)}`
}

/**
 * Public file URL. With VITE_FILE_PROXY=on, files are served from this site's
 * /f/ path through Cloudflare's cache (saves Supabase bandwidth); otherwise
 * directly from Supabase Storage.
 */
export function storagePublicUrl(path: string, version?: number): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  const base =
    import.meta.env.VITE_FILE_PROXY === 'on'
      ? `${config.publicAppUrl}/f/${encoded}`
      : `${config.supabaseUrl}/storage/v1/object/public/public-files/${encoded}`
  return version ? `${base}?v=${version}` : base
}

import type { QrType, SocialPlatform } from './qr/types'

export type RecordStatus = 'active' | 'inactive'

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface CustomField {
  label: string
  value: string
}

export interface Business {
  id: string
  slug: string
  name: string
  category_id: string | null
  tagline: string | null
  description: string | null
  logo_file_id: string | null
  cover_file_id: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website_url: string | null
  google_business_url: string | null
  accent_color: string
  hours_note: string | null
  custom_fields: CustomField[]
  status: RecordStatus
  archived_at: string | null
  is_demo: boolean
  created_at: string
  updated_at: string
  is_workspace?: boolean
}

export interface BusinessOverview extends Business {
  category_name: string | null
  qr_count: number
  scan_count: number
  last_scan_at: string | null
}

export interface BusinessLocation {
  id: string
  business_id: string
  label: string
  address: string | null
  latitude: number | null
  longitude: number | null
  maps_url: string | null
  position: number
}

export interface BusinessHour {
  id: string
  business_id: string
  day_of_week: number
  opens_at: string
  closes_at: string
}

export interface SocialLink {
  id: string
  business_id: string
  platform: SocialPlatform | 'website'
  label: string | null
  url: string
  position: number
}

export type FileBucket = 'public-files' | 'private-files'

export interface FileRecord {
  id: string
  business_id: string | null
  bucket: FileBucket
  storage_path: string
  title: string
  description: string | null
  original_filename: string | null
  mime_type: string
  size_bytes: number
  kind: 'document' | 'image'
  show_on_profile: boolean
  position: number
  version: number
  created_at: string
  updated_at: string
}

export interface FileOverview extends FileRecord {
  business_name: string | null
  usage_count: number
}

export interface QrCodeRecord {
  id: string
  /** After this moment the code shows "not active" until it is renewed. */
  expires_at?: string | null
  public_code: string
  business_id: string
  name: string
  description: string | null
  type: QrType
  destination: Record<string, unknown>
  file_id: string | null
  design: Record<string, unknown>
  status: RecordStatus
  archived_at: string | null
  is_demo: boolean
  created_at: string
  updated_at: string
}

export interface QrOverview extends QrCodeRecord {
  /** Null for codes owned by the hidden workspace (no business). */
  business_name: string | null
  business_is_workspace: boolean
  business_slug: string
  business_status: RecordStatus
  business_archived_at: string | null
  file_title: string | null
  scan_count: number
  last_scan_at: string | null
}

export type BlockType =
  | 'heading'
  | 'text'
  | 'image'
  | 'gallery'
  | 'document'
  | 'button'
  | 'link'
  | 'phone'
  | 'whatsapp'
  | 'social'
  | 'map'
  | 'email'
  | 'contact'
  | 'wifi'
  | 'menu'
  | 'payment'
  | 'review'

export interface ContentBlock {
  id: string
  business_id: string
  qr_code_id: string | null
  position: number
  type: BlockType
  data: Record<string, unknown>
}

export interface ContactSubmission {
  id: string
  name: string
  email: string
  phone: string | null
  company: string | null
  message: string
  status: 'new' | 'read' | 'archived'
  created_at: string
}

export interface AuditLog {
  id: number
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  summary: string | null
  details: { changed?: string[] }
  created_at: string
}

// ---------------------------------------------------------------------------
// Public payloads (shape returned by get_public_qr / get_public_business)
// ---------------------------------------------------------------------------
export interface PublicFile {
  id: string
  title: string
  description?: string | null
  path: string
  mime_type: string
  size_bytes: number
  kind: 'document' | 'image'
  version: number
  updated_at?: string
}

export interface PublicBlock {
  id: string
  type: BlockType
  data: Record<string, unknown> & { file?: PublicFile; files?: PublicFile[] }
}

export interface PublicBusiness {
  name: string
  slug: string
  tagline?: string
  description?: string
  category?: string
  accent_color: string
  logo?: PublicFile
  cover?: PublicFile
  phone?: string
  whatsapp?: string
  email?: string
  website_url?: string
  google_business_url?: string
  hours_note?: string
  is_demo?: boolean
  /** True for codes created without a business: the owner is never shown. */
  is_workspace?: boolean
  custom_fields?: CustomField[]
  hours?: Array<{ day: number; opens: string; closes: string }>
  locations?: Array<{ label: string; address?: string; latitude?: number; longitude?: number; maps_url?: string }>
  social_links?: Array<{ platform: SocialPlatform | 'website'; label?: string; url: string }>
  documents?: PublicFile[]
  gallery?: PublicFile[]
  blocks?: PublicBlock[]
}

export interface PublicQrPayload {
  state: 'ok' | 'not_found' | 'unavailable' | 'expired' | 'static'
  code?: string
  type?: QrType
  destination?: Record<string, unknown> & { file?: PublicFile | null; avatar?: PublicFile | null; cover?: PublicFile | null }
  business?: PublicBusiness
}

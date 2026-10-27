import {
  Building2,
  FileText,
  Globe,
  LayoutList,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  Type,
  UserSquare,
  Wifi,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { SOCIAL_LABELS, type QrType, type SocialPlatform } from '@/lib/qr/types'
import type { FileRecord, PublicFile } from '@/lib/types'

export interface TypeTile {
  type: QrType
  label: string
  hint: string
  icon: ReactNode
}

/** The types offered when creating a code, most common first. */
export const TYPE_TILES: TypeTile[] = [
  { type: 'website', label: 'Website', hint: 'Open a link', icon: <Globe /> },
  { type: 'landing_page', label: 'Multi-link page', hint: 'Links, PDFs, contacts and more on one page', icon: <LayoutList /> },
  { type: 'document', label: 'PDF', hint: 'Menu, brochure or price list', icon: <FileText /> },
  { type: 'contact_card', label: 'Contact card', hint: 'vCard with “Save contact”', icon: <UserSquare /> },
  { type: 'text', label: 'Text', hint: 'A message or instructions', icon: <Type /> },
  { type: 'whatsapp', label: 'WhatsApp', hint: 'Start a chat', icon: <MessageCircle /> },
  { type: 'phone', label: 'Phone call', hint: 'Call a number', icon: <Phone /> },
  { type: 'email', label: 'Email', hint: 'Write an email', icon: <Mail /> },
  { type: 'maps', label: 'Location', hint: 'Google Maps directions', icon: <MapPin /> },
  { type: 'social', label: 'Social media', hint: 'Instagram, Facebook, YouTube…', icon: <Share2 /> },
  { type: 'wifi', label: 'Wi-Fi', hint: 'Join a network', icon: <Wifi /> },
  { type: 'business_profile', label: 'Business page', hint: 'A business you manage under Advanced', icon: <Building2 /> },
]

export const TYPE_LABEL: Record<QrType, string> = {
  ...(Object.fromEntries(TYPE_TILES.map((t) => [t.type, t.label])) as Record<QrType, string>),
  custom_link: 'Website',
}

export function typeIcon(type: QrType): ReactNode {
  return TYPE_TILES.find((t) => t.type === type)?.icon ?? <Link2 />
}

/** Initial content for a freshly chosen type. */
export function defaultDestination(type: QrType): Record<string, unknown> {
  switch (type) {
    case 'landing_page':
      return { title: '', subtitle: '', accent: '#2563EB' }
    case 'social':
      return { platform: 'instagram' }
    case 'wifi':
      return { encryption: 'WPA' }
    case 'maps':
      return { mode: 'url' }
    case 'document':
      return { open_mode: 'page' }
    default:
      return {}
  }
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** A sensible name from the content, used until the admin types their own. */
export function autoName(type: QrType, d: Record<string, unknown>, extra: { fileTitle?: string; businessName?: string } = {}): string {
  const clip = (v: string) => (v.length > 60 ? `${v.slice(0, 57)}…` : v)
  switch (type) {
    case 'website':
    case 'custom_link':
      try {
        return new URL(s(d.url)).hostname.replace(/^www\./, '') || 'Website'
      } catch {
        return 'Website'
      }
    case 'landing_page':
      return clip(s(d.title)) || 'Multi-link page'
    case 'text':
      return clip(s(d.title) || s(d.text).split('\n')[0]) || 'Text'
    case 'contact_card':
      return clip(s(d.full_name)) || 'Contact card'
    case 'phone':
      return s(d.phone) ? `Call ${s(d.phone)}` : 'Phone call'
    case 'whatsapp':
      return s(d.phone) ? `WhatsApp ${s(d.phone)}` : 'WhatsApp'
    case 'email':
      return s(d.email) || 'Email'
    case 'maps':
      return clip(s(d.label)) || 'Location'
    case 'social':
      return SOCIAL_LABELS[(s(d.platform) || 'other') as SocialPlatform] ?? 'Social media'
    case 'wifi':
      return s(d.ssid) ? `Wi-Fi ${s(d.ssid)}` : 'Wi-Fi'
    case 'document':
      return clip(extra.fileTitle ?? '') || 'PDF'
    case 'business_profile':
      return extra.businessName || 'Business page'
  }
}

export function toPublicFile(f: FileRecord): PublicFile {
  return {
    id: f.id,
    title: f.title,
    description: f.description,
    path: f.storage_path,
    mime_type: f.mime_type,
    size_bytes: f.size_bytes,
    kind: f.kind,
    version: f.version,
    updated_at: f.updated_at,
  }
}

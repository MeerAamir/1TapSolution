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
  Star,
  Type,
  UtensilsCrossed,
  Wallet,
  UserSquare,
  Wifi,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { SOCIAL_LABELS, type QrType, type SocialPlatform } from '@/lib/qr/types'
import type { FileRecord, PublicFile } from '@/lib/types'
import { DEFAULT_MENU } from './ExtraFields'

export interface TypeTile {
  type: QrType
  label: string
  hint: string
  icon: ReactNode
  /** Icon colour, so each type is recognisable at a glance. */
  color: string
}

/** The types offered when creating a code, most common first. */
export const TYPE_TILES: TypeTile[] = [
  { type: 'website', label: 'Website', hint: 'Open a link', icon: <Globe />, color: '#2563EB' },
  { type: 'landing_page', label: 'Multi-link page', hint: 'Links, menu, payments, PDFs and more on one page', icon: <LayoutList />, color: '#7C3AED' },
  { type: 'menu', label: 'Menu', hint: 'Food menu with prices, photos or a PDF', icon: <UtensilsCrossed />, color: '#EA580C' },
  { type: 'payment', label: 'Payment / UPI', hint: 'GPay, PhonePe, Paytm, any UPI app', icon: <Wallet />, color: '#16A34A' },
  { type: 'review', label: 'Google review', hint: 'Ask customers for a review', icon: <Star />, color: '#F59E0B' },
  { type: 'document', label: 'PDF', hint: 'Brochure, price list or catalogue', icon: <FileText />, color: '#DC2626' },
  { type: 'contact_card', label: 'Contact card', hint: 'vCard with “Save contact”', icon: <UserSquare />, color: '#0891B2' },
  { type: 'whatsapp', label: 'WhatsApp', hint: 'Start a chat', icon: <MessageCircle />, color: '#22A75A' },
  { type: 'text', label: 'Text', hint: 'A message or instructions', icon: <Type />, color: '#475569' },
  { type: 'phone', label: 'Phone call', hint: 'Call a number', icon: <Phone />, color: '#0D9488' },
  { type: 'email', label: 'Email', hint: 'Write an email', icon: <Mail />, color: '#DB2777' },
  { type: 'maps', label: 'Location', hint: 'Google Maps directions', icon: <MapPin />, color: '#E11D48' },
  { type: 'social', label: 'Social media', hint: 'Instagram, Facebook, YouTube…', icon: <Share2 />, color: '#C026D3' },
  { type: 'wifi', label: 'Wi-Fi', hint: 'Join a network', icon: <Wifi />, color: '#0284C7' },
  { type: 'business_profile', label: 'Business page', hint: 'A business you manage under Advanced', icon: <Building2 />, color: '#334155' },
]

export const TYPE_LABEL: Record<QrType, string> = {
  ...(Object.fromEntries(TYPE_TILES.map((t) => [t.type, t.label])) as Record<QrType, string>),
  custom_link: 'Website',
}

export function typeIcon(type: QrType): ReactNode {
  return TYPE_TILES.find((t) => t.type === type)?.icon ?? <Link2 />
}

export function typeColor(type: QrType): string {
  return TYPE_TILES.find((t) => t.type === type)?.color ?? '#2563EB'
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
    case 'menu':
      return structuredClone(DEFAULT_MENU) as unknown as Record<string, unknown>
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
    case 'menu':
      return clip(s(d.title)) || 'Menu'
    case 'payment':
      return s(d.payee_name) ? `Pay ${clip(s(d.payee_name))}` : s(d.upi_id) || 'Payment'
    case 'review':
      return clip(s(d.title)) || 'Google review'
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

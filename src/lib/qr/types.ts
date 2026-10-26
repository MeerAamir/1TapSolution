/**
 * QR code types and their destination configuration.
 * Shared by the dashboard, the public pages and the edge function, and kept in
 * step with public.is_valid_qr_destination() in the database.
 */

export const QR_TYPES = [
  'business_profile',
  'document',
  'website',
  'phone',
  'whatsapp',
  'email',
  'maps',
  'social',
  'wifi',
  'contact_card',
  'custom_link',
  'landing_page',
] as const

export type QrType = (typeof QR_TYPES)[number]

export const SOCIAL_PLATFORMS = [
  'instagram',
  'facebook',
  'youtube',
  'linkedin',
  'x',
  'tiktok',
  'pinterest',
  'threads',
  'telegram',
  'google_business',
  'other',
] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

export const SOCIAL_LABELS: Record<SocialPlatform | 'website', string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  x: 'X',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  threads: 'Threads',
  telegram: 'Telegram',
  google_business: 'Google Business Profile',
  website: 'Website',
  other: 'Link',
}

export interface QrTypeInfo {
  label: string
  description: string
  /** 'dynamic' QRs encode /q/<code> and can be edited; 'static' QRs encode content directly. */
  mode: 'dynamic' | 'static'
  /** How the edge handles a scan: redirect straight away, or show a page. */
  delivery: 'redirect' | 'page'
}

export const QR_TYPE_INFO: Record<QrType, QrTypeInfo> = {
  business_profile: {
    label: 'Business profile',
    description: 'A mobile page with contact buttons, location, hours, documents and links.',
    mode: 'dynamic',
    delivery: 'page',
  },
  document: {
    label: 'PDF / document',
    description: 'A menu, brochure or price list. Replace the file any time; the QR stays the same.',
    mode: 'dynamic',
    delivery: 'page',
  },
  website: {
    label: 'Website',
    description: 'Sends visitors to a web address.',
    mode: 'dynamic',
    delivery: 'redirect',
  },
  phone: {
    label: 'Phone call',
    description: 'Shows a call button for a phone number.',
    mode: 'dynamic',
    delivery: 'page',
  },
  whatsapp: {
    label: 'WhatsApp',
    description: 'Opens a WhatsApp chat, optionally with a prefilled message.',
    mode: 'dynamic',
    delivery: 'redirect',
  },
  email: {
    label: 'Email',
    description: 'Opens the visitor’s email app with an address and subject filled in.',
    mode: 'dynamic',
    delivery: 'page',
  },
  maps: {
    label: 'Google Maps',
    description: 'Opens a location in Google Maps for directions.',
    mode: 'dynamic',
    delivery: 'redirect',
  },
  social: {
    label: 'Social media',
    description: 'Sends visitors to an Instagram, Facebook, YouTube or other profile.',
    mode: 'dynamic',
    delivery: 'redirect',
  },
  wifi: {
    label: 'Wi-Fi',
    description: 'Lets phones join a network. The password is stored inside the printed code.',
    mode: 'static',
    delivery: 'page',
  },
  contact_card: {
    label: 'Contact card',
    description: 'A digital business card with a “Save contact” button.',
    mode: 'dynamic',
    delivery: 'page',
  },
  custom_link: {
    label: 'Custom link',
    description: 'Any validated web address, for campaigns or tracking links.',
    mode: 'dynamic',
    delivery: 'redirect',
  },
  landing_page: {
    label: 'Landing page',
    description: 'A page you compose from headings, text, images, buttons and documents.',
    mode: 'dynamic',
    delivery: 'page',
  },
}

export type WifiEncryption = 'WPA' | 'WEP' | 'nopass'

export interface DestinationByType {
  business_profile: Record<string, never>
  document: { open_mode?: 'page' | 'direct' }
  website: { url: string }
  custom_link: { url: string }
  phone: { phone: string; label?: string }
  whatsapp: { phone: string; message?: string }
  email: { email: string; subject?: string; body?: string }
  maps: { url?: string; latitude?: number; longitude?: number; label?: string }
  social: { platform: SocialPlatform; url: string }
  wifi: { ssid: string; encryption: WifiEncryption; password?: string; hidden?: boolean }
  contact_card: {
    full_name: string
    title?: string
    organization?: string
    phone?: string
    email?: string
    website?: string
    address?: string
    note?: string
  }
  landing_page: { title?: string }
}

export type AnyDestination = DestinationByType[QrType]

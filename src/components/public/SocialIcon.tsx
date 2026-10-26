import { Globe, Link2, MapPinned, Send } from 'lucide-react'
import type { SocialPlatform } from '@/lib/qr/types'

/**
 * Simple monochrome glyphs for social platforms. Drawn as plain geometric
 * shapes (not the companies' trademarked logos) and always paired with a
 * visible text label.
 */
export function SocialIcon({ platform, className = 'size-5' }: { platform: SocialPlatform | 'website'; className?: string }) {
  const common = { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true } as const
  switch (platform) {
    case 'instagram':
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'facebook':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M13.2 20.8V13h2.4l.4-2.8h-2.8V8.6c0-.8.3-1.4 1.4-1.4H16V4.8a19 19 0 0 0-2.1-.1c-2.1 0-3.5 1.3-3.5 3.6v1.9H8V13h2.4v7.8" />
        </svg>
      )
    case 'youtube':
      return (
        <svg {...common}>
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
          <path d="M10.2 9.3v5.4l4.6-2.7z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'linkedin':
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
          <path d="M8 10.5V16M8 7.6v.1M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.3-2.6s2.2.8 2.2 2.6V16" />
        </svg>
      )
    case 'x':
      return (
        <svg {...common}>
          <path d="M4.5 4.5l15 15M19.5 4.5l-15 15" />
        </svg>
      )
    case 'tiktok':
      return (
        <svg {...common}>
          <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5M14 4c.4 2.3 2 4 4.5 4.2" />
        </svg>
      )
    case 'pinterest':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M11 9.5c0-1.5 1.1-2.3 2.4-2.3 1.6 0 2.6 1.2 2.6 2.8 0 2.2-1.3 3.8-3 3.8-.9 0-1.6-.5-1.5-1.3M11.2 12l-1.7 7.5" />
        </svg>
      )
    case 'threads':
      return (
        <svg {...common}>
          <path d="M16.5 8.5C15.8 6 14 5 12 5 8.5 5 6.5 7.6 6.5 12s2 7 5.5 7c3 0 5-1.6 5-4.2 0-2.6-2.4-3.6-4.6-3.6-2 0-3.2 1-3.2 2.4 0 1.2 1 2 2.3 2 2.2 0 3.3-2 3-5.6" />
        </svg>
      )
    case 'telegram':
      return <Send className={className} aria-hidden />
    case 'google_business':
      return <MapPinned className={className} aria-hidden />
    case 'website':
      return <Globe className={className} aria-hidden />
    case 'other':
    default:
      return <Link2 className={className} aria-hidden />
  }
}

import { Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { storagePublicUrl } from '@/config'
import type { PublicBlock, PublicFile } from '@/lib/types'
import { copyText } from './actions'
import { BlockList } from './Blocks'
import { safeAccent, ThemeShell, type PublicTheme } from './PageTheme'
import { DemoRibbon, PoweredBy } from './primitives'

export interface LandingHeader {
  title?: string
  subtitle?: string
  accent?: string
  avatar?: PublicFile | null
  cover?: PublicFile | null
  theme?: PublicTheme | null
}

export const DEFAULT_LANDING_ACCENT = '#2563EB'

function ShareButton({ title }: { title?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label="Share this page"
      onClick={async () => {
        const url = window.location.href.replace(/[?&]preview=1/, '')
        if (navigator.share) {
          try {
            await navigator.share({ title: title || document.title, url })
            return
          } catch {
            // Cancelled or unsupported: fall back to copying.
          }
        }
        if (await copyText(url)) {
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        }
      }}
      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/90 px-3.5 text-sm font-semibold text-ink shadow-sm ring-1 ring-black/5 backdrop-blur"
    >
      <Share2 className="size-4" /> {copied ? 'Link copied' : 'Share'}
    </button>
  )
}

/**
 * The visitor page of a multi-link QR code: a header (cover, image, title,
 * subtitle) followed by the items in order. Also used as the live preview in
 * the dashboard, so both always look the same.
 */
export function LandingView({
  header,
  blocks,
  isDemo,
  preview,
}: {
  header: LandingHeader
  blocks: PublicBlock[]
  isDemo?: boolean
  /** In the dashboard preview: no share button, no page title changes. */
  preview?: boolean
}) {
  const accent = header.theme?.accent || header.accent || DEFAULT_LANDING_ACCENT
  const strong = safeAccent(header.theme, accent)
  // A styled background already frames the page; the plain colour band is only for the default look.
  const styledBg = Boolean(header.theme?.bg_type && header.theme.bg_type !== 'soft')
  const title = header.title?.trim()

  useEffect(() => {
    if (!preview && title) document.title = title
  }, [preview, title])

  const initials = (title || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <ThemeShell theme={header.theme} accent={accent}>
      {isDemo && <DemoRibbon />}
      <main className="mx-auto w-full max-w-md px-4 pb-4 pt-4">
        <div className="relative">
          {header.cover ? (
            <img
              src={storagePublicUrl(header.cover.path, header.cover.version)}
              alt=""
              className="h-40 w-full rounded-3xl object-cover"
            />
          ) : styledBg ? (
            <div className="h-16 w-full" />
          ) : (
            <div className="h-28 w-full rounded-3xl" style={{ background: `linear-gradient(135deg, ${strong}, ${strong}B3)` }} />
          )}
          {!preview && (
            <div className="absolute right-3 top-3">
              <ShareButton title={title} />
            </div>
          )}
        </div>
        <div className="relative z-10 -mt-12 flex flex-col items-center px-2 text-center">
          {header.avatar ? (
            <img
              src={storagePublicUrl(header.avatar.path, header.avatar.version)}
              alt=""
              className="h-24 w-24 rounded-full bg-white object-cover shadow-raise ring-4 ring-white"
            />
          ) : (
            <div
              className="grid h-24 w-24 place-items-center rounded-full bg-white text-2xl font-bold shadow-raise ring-4 ring-white"
              style={{ color: strong }}
            >
              {initials}
            </div>
          )}
          {title && <h1 className="t-title mt-4 text-2xl font-bold tracking-[-0.02em] text-ink">{title}</h1>}
          {header.subtitle?.trim() && <p className="t-text mt-1.5 whitespace-pre-line text-[0.97rem] leading-relaxed text-ink/70">{header.subtitle}</p>}
        </div>
        <div className="mt-6">
          {blocks.length ? (
            <BlockList blocks={blocks} accent={strong} />
          ) : (
            <p className="t-text rounded-2xl border border-dashed border-current/30 px-4 py-8 text-center text-sm">Nothing here yet.</p>
          )}
        </div>
      </main>
      <PoweredBy />
    </ThemeShell>
  )
}

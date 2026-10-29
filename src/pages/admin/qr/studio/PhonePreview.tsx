import { ExternalLink, Wallet, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BusinessProfile } from '@/components/public/BusinessProfile'
import { fetchPublicBusiness } from '@/lib/public-api'
import type { DraftBlock } from '@/components/admin/BlockEditor'
import { cleanBlockData, validateBlock } from '@/components/admin/BlockEditor'
import { LandingView } from '@/components/public/LandingView'
import { QrDestinationView } from '@/components/public/QrDestinationView'
import { redirectUrlFor } from '@/lib/qr/destinations'
import type { QrType } from '@/lib/qr/types'
import type { FileRecord, PublicBlock, PublicBusiness, PublicQrPayload } from '@/lib/types'
import type { PublicTheme } from '@/components/public/PageTheme'
import { isStaticQr, upiLink } from '@/lib/qr/destinations'
import { toPublicFile } from './typeTiles'

/** Editor theme (file id) to what visitors receive (resolved file). */
export function previewTheme(theme: unknown, files: Map<string, FileRecord>): PublicTheme | undefined {
  if (!theme || typeof theme !== 'object') return undefined
  const { bg_image_file_id, ...rest } = theme as Record<string, unknown>
  const f = typeof bg_image_file_id === 'string' ? files.get(bg_image_file_id) : undefined
  return { ...rest, bg_image: f ? toPublicFile(f) : null } as PublicTheme
}

/** Menu data with its file ids resolved, as visitors receive it. */
function resolveMenu(d: Record<string, unknown>, files: Map<string, FileRecord>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...d }
  if (typeof d.file_id === 'string') {
    const f = files.get(d.file_id)
    out.file = f ? toPublicFile(f) : null
  }
  if (Array.isArray(d.file_ids)) {
    out.files = (d.file_ids as string[]).map((id) => files.get(id)).filter(Boolean).map((f) => toPublicFile(f!))
  }
  delete out.file_id
  delete out.file_ids
  return out
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[20rem] rounded-[2.2rem] bg-midnight p-2.5 shadow-raise">
      <div className="relative h-[34rem] overflow-y-auto overflow-x-hidden rounded-[1.7rem] bg-surface [&_.min-h-dvh]:min-h-full">
        {children}
      </div>
    </div>
  )
}

function Explain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <div className="text-sm text-muted">{children}</div>
    </div>
  )
}

/** The live business page, exactly as visitors see it. */
function BusinessPreview({ slug }: { slug?: string }) {
  const [state, setState] = useState<{ slug?: string; business?: PublicBusiness | null }>({})
  useEffect(() => {
    if (!slug) return
    const c = new AbortController()
    fetchPublicBusiness(slug, c.signal)
      .then((r) => setState({ slug, business: r.state === 'ok' ? r.business : null }))
      .catch(() => setState({ slug, business: null }))
    return () => c.abort()
  }, [slug])
  if (!slug) return <Explain title="Preview">Choose a business to see its page.</Explain>
  if (state.slug !== slug) return <Explain title="Loading…">Getting the business page.</Explain>
  if (!state.business)
    return <Explain title="Business page unavailable">This business is paused or archived, so visitors would see “currently unavailable”.</Explain>
  return <BusinessProfile business={state.business} />
}

/** Converts editor state to the blocks visitors see (incomplete items are left out, as on the live page). */
export function previewBlocks(blocks: DraftBlock[], files: Map<string, FileRecord>): PublicBlock[] {
  const out: PublicBlock[] = []
  for (const b of blocks) {
    if (Object.keys(validateBlock(b)).length) continue
    const data: PublicBlock['data'] = { ...cleanBlockData(b) }
    if (b.type === 'image' || b.type === 'document') {
      const f = files.get(String(b.data.file_id))
      if (!f) continue
      data.file = toPublicFile(f)
    }
    if (b.type === 'menu') {
      const m = resolveMenu(data, files)
      if ((m.mode === 'pdf' && !m.file) || (m.mode === 'images' && !(m.files as unknown[]).length)) continue
      out.push({ id: b.key, type: b.type, data: m })
      continue
    }
    if (b.type === 'gallery') {
      data.files = ((b.data.file_ids as string[] | undefined) ?? []).map((id) => files.get(id)).filter(Boolean).map((f) => toPublicFile(f!))
    }
    out.push({ id: b.key, type: b.type, data })
  }
  return out
}

/** What a visitor sees after scanning, rendered from the unsaved editor state. */
export function PhonePreview({
  type,
  destination,
  valid,
  blocks,
  files,
  fileId,
  businessSlug,
}: {
  type: QrType
  /** Parsed destination when valid, raw otherwise. */
  destination: Record<string, unknown>
  valid: boolean
  blocks: DraftBlock[]
  files: Map<string, FileRecord>
  fileId: string | null
  /** For business-page codes: which business to show. */
  businessSlug?: string
}) {
  if (type === 'landing_page') {
    const file = (id: unknown) => (typeof id === 'string' && files.get(id) ? toPublicFile(files.get(id)!) : null)
    return (
      <Frame>
        <LandingView
          preview
          header={{
            title: destination.title as string | undefined,
            subtitle: destination.subtitle as string | undefined,
            accent: destination.accent as string | undefined,
            avatar: file(destination.avatar_file_id),
            cover: file(destination.cover_file_id),
            theme: previewTheme(destination.theme, files),
          }}
          blocks={previewBlocks(blocks, files)}
        />
      </Frame>
    )
  }

  if (!valid) {
    return (
      <Frame>
        <Explain title="Preview">Fill in the details on the left to see what people will see.</Explain>
      </Frame>
    )
  }

  if (type === 'wifi') {
    return (
      <Frame>
        <Explain title="Joins the Wi-Fi network">
          <Wifi className="mx-auto mb-2 size-8 text-signal" />
          Phones show a “Join network” prompt for <strong className="text-ink">{String(destination.ssid ?? '')}</strong>.
        </Explain>
      </Frame>
    )
  }

  if (type === 'business_profile') {
    return (
      <Frame>
        <BusinessPreview slug={businessSlug} />
      </Frame>
    )
  }

  if (isStaticQr(type, destination)) {
    return (
      <Frame>
        <Explain title="Opens the payment app">
          <Wallet className="mx-auto mb-2 size-8 text-signal" />
          Scanning with GPay, PhonePe, Paytm or any UPI app opens the payment to{' '}
          <strong className="break-all text-ink">{String(destination.upi_id ?? '')}</strong> straight away.
          <span className="mt-2 block break-all font-mono text-xs">{upiLink(destination)}</span>
        </Explain>
      </Frame>
    )
  }

  const redirect = redirectUrlFor(type, destination)
  const file = fileId ? files.get(fileId) : undefined
  if (redirect || (type === 'document' && destination.open_mode === 'direct')) {
    const href = redirect
    return (
      <Frame>
        <Explain title="Opens straight away">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 break-all font-medium text-signal hover:underline">
              {href.length > 80 ? `${href.slice(0, 77)}…` : href} <ExternalLink className="size-3.5 shrink-0" />
            </a>
          ) : (
            'The PDF opens directly in the phone’s viewer.'
          )}
        </Explain>
      </Frame>
    )
  }

  if (type === 'document' && !file) {
    return (
      <Frame>
        <Explain title="Preview">Upload or choose a PDF.</Explain>
      </Frame>
    )
  }

  const payload: PublicQrPayload = {
    state: 'ok',
    type,
    destination: {
      ...(type === 'menu' ? resolveMenu(destination, files) : destination),
      ...(type === 'document' ? { file: file ? toPublicFile(file) : undefined } : {}),
      theme: previewTheme(destination.theme, files),
    },
    business: { name: '', slug: '', accent_color: '#2563EB', is_workspace: true },
  }
  return (
    <Frame>
      <div className="pointer-events-auto">
        <QrDestinationView payload={payload} />
      </div>
    </Frame>
  )
}

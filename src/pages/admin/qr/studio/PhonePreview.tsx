import { ExternalLink, Wifi } from 'lucide-react'
import type { DraftBlock } from '@/components/admin/BlockEditor'
import { cleanBlockData, validateBlock } from '@/components/admin/BlockEditor'
import { LandingView } from '@/components/public/LandingView'
import { QrDestinationView } from '@/components/public/QrDestinationView'
import { redirectUrlFor } from '@/lib/qr/destinations'
import type { QrType } from '@/lib/qr/types'
import type { FileRecord, PublicBlock, PublicQrPayload } from '@/lib/types'
import { toPublicFile } from './typeTiles'

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
}: {
  type: QrType
  /** Parsed destination when valid, raw otherwise. */
  destination: Record<string, unknown>
  valid: boolean
  blocks: DraftBlock[]
  files: Map<string, FileRecord>
  fileId: string | null
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
        <Explain title="Opens the business page">Edit what it shows under Advanced → Businesses.</Explain>
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
    destination: { ...destination, file: file ? toPublicFile(file) : undefined },
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

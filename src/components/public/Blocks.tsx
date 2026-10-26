import { FileText, Globe, MapPin, MessageCircle, Phone } from 'lucide-react'
import { storagePublicUrl } from '@/config'
import { mapsLink, telLink, whatsappLink } from '@/lib/qr/destinations'
import { SOCIAL_LABELS, type SocialPlatform } from '@/lib/qr/types'
import type { PublicBlock, PublicFile } from '@/lib/types'
import { formatBytes } from '@/lib/utils'
import { ActionLink } from './primitives'
import { SocialIcon } from './SocialIcon'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Renders structured content blocks. Text is always rendered as text, never as HTML. */
export function BlockList({ blocks, accent }: { blocks: PublicBlock[]; accent: string }) {
  return (
    <div className="grid gap-4">
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} accent={accent} />
      ))}
    </div>
  )
}

function BlockView({ block, accent }: { block: PublicBlock; accent: string }) {
  const d = block.data
  switch (block.type) {
    case 'heading':
      return <h2 className="pt-2 text-xl font-bold tracking-[-0.01em] text-ink">{str(d.text)}</h2>
    case 'text':
      return <p className="whitespace-pre-line text-[0.97rem] leading-relaxed text-ink/85">{str(d.text)}</p>
    case 'image':
      return d.file ? (
        <figure className="overflow-hidden rounded-xl bg-line/40">
          <img
            src={storagePublicUrl(d.file.path, d.file.version)}
            alt={str(d.alt) || str(d.caption) || d.file.title}
            loading="lazy"
            decoding="async"
            className="h-auto w-full"
          />
          {str(d.caption) && <figcaption className="px-3 py-2 text-sm text-muted">{str(d.caption)}</figcaption>}
        </figure>
      ) : null
    case 'gallery':
      return <Gallery files={d.files ?? []} />
    case 'document':
      return d.file ? <DocumentRow file={d.file} label={str(d.label)} accent={accent} /> : null
    case 'button':
    case 'link':
      return (
        <ActionLink href={str(d.url)} accent={accent} external variant={block.type === 'button' ? 'solid' : 'outline'}>
          <Globe /> {str(d.label)}
        </ActionLink>
      )
    case 'phone':
      return (
        <ActionLink href={telLink(str(d.phone))} accent={accent} variant="outline">
          <Phone /> {str(d.label) || `Call ${str(d.phone)}`}
        </ActionLink>
      )
    case 'whatsapp':
      return (
        <ActionLink href={whatsappLink(str(d.phone), str(d.message) || undefined)} accent={accent} external variant="outline">
          <MessageCircle /> {str(d.label) || 'Chat on WhatsApp'}
        </ActionLink>
      )
    case 'social': {
      const platform = (str(d.platform) || 'other') as SocialPlatform
      return (
        <ActionLink href={str(d.url)} accent={accent} external variant="outline">
          <SocialIcon platform={platform} className="size-4" /> {str(d.label) || SOCIAL_LABELS[platform] || 'Open link'}
        </ActionLink>
      )
    }
    case 'map': {
      const href = mapsLink(d as { url?: string; latitude?: number; longitude?: number })
      return href ? (
        <ActionLink href={href} accent={accent} external variant="outline">
          <MapPin /> {str(d.label) || 'Get directions'}
        </ActionLink>
      ) : null
    }
    default:
      return null
  }
}

export function Gallery({ files }: { files: PublicFile[] }) {
  if (!files.length) return null
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {files.map((f) => (
        <a
          key={f.id}
          href={storagePublicUrl(f.path, f.version)}
          target="_blank"
          rel="noopener noreferrer"
          className="block aspect-square overflow-hidden rounded-lg bg-line/40"
        >
          <img
            src={storagePublicUrl(f.path, f.version)}
            alt={f.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
          />
        </a>
      ))}
    </div>
  )
}

export function documentUrls(file: PublicFile) {
  const view = storagePublicUrl(file.path, file.version)
  const name = `${file.title.replace(/[^\w\s.-]/g, '').trim() || 'document'}.pdf`
  return { view, download: `${view}${view.includes('?') ? '&' : '?'}download=${encodeURIComponent(name)}` }
}

export function DocumentRow({ file, label, accent }: { file: PublicFile; label?: string; accent: string }) {
  const { view } = documentUrls(file)
  return (
    <a
      href={view}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-xl border border-line bg-white p-3.5 transition-colors hover:border-line-strong"
    >
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg"
        style={{ backgroundColor: `${accent}14`, color: accent }}
      >
        <FileText className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink">{label || file.title}</span>
        <span className="block text-xs text-muted">PDF · {formatBytes(file.size_bytes)}</span>
      </span>
      <span className="text-sm font-semibold" style={{ color: accent }}>
        Open
      </span>
    </a>
  )
}

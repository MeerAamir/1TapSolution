import {
  ArrowDown,
  ArrowUp,
  FileText,
  GalleryHorizontal,
  Globe,
  Heading,
  ImageIcon,
  Link2,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Share2,
  Trash2,
  Type,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/overlay'
import { storagePublicUrl } from '@/config'
import { isSafeHttpUrl } from '@/lib/qr/destinations'
import { SOCIAL_LABELS, SOCIAL_PLATFORMS } from '@/lib/qr/types'
import type { BlockType, FileRecord } from '@/lib/types'
import { FilePickerDialog } from './FilePicker'

export interface DraftBlock {
  key: string
  type: BlockType
  data: Record<string, unknown>
}

export const BLOCK_TYPES: Array<{ type: BlockType; label: string; icon: ReactNode }> = [
  { type: 'heading', label: 'Heading', icon: <Heading /> },
  { type: 'text', label: 'Text', icon: <Type /> },
  { type: 'image', label: 'Image', icon: <ImageIcon /> },
  { type: 'gallery', label: 'Gallery', icon: <GalleryHorizontal /> },
  { type: 'document', label: 'PDF document', icon: <FileText /> },
  { type: 'button', label: 'Button', icon: <Globe /> },
  { type: 'link', label: 'Website link', icon: <Link2 /> },
  { type: 'phone', label: 'Phone call', icon: <Phone /> },
  { type: 'whatsapp', label: 'WhatsApp chat', icon: <MessageCircle /> },
  { type: 'social', label: 'Social media link', icon: <Share2 /> },
  { type: 'map', label: 'Map / directions', icon: <MapPin /> },
]

const phoneOk = (v: unknown) => typeof v === 'string' && /^\+?[0-9 ().-]{6,24}$/.test(v) && v.replace(/\D/g, '').length >= 6

/** Mirrors public.is_valid_content_block(); returns field → message. */
export function validateBlock(b: DraftBlock): Record<string, string> {
  const d = b.data
  const e: Record<string, string> = {}
  const text = (k: string) => (typeof d[k] === 'string' ? (d[k] as string).trim() : '')
  switch (b.type) {
    case 'heading':
      if (!text('text')) e.text = 'Enter a heading'
      else if (text('text').length > 160) e.text = 'Use 160 characters or fewer'
      break
    case 'text':
      if (!text('text')) e.text = 'Enter some text'
      else if (text('text').length > 4000) e.text = 'Use 4,000 characters or fewer'
      break
    case 'image':
    case 'document':
      if (!d.file_id) e.file_id = 'Choose a file'
      break
    case 'gallery':
      if (!Array.isArray(d.file_ids) || !d.file_ids.length) e.file_ids = 'Choose at least one image'
      break
    case 'button':
    case 'link':
      if (!text('label')) e.label = 'Enter a label'
      if (!isSafeHttpUrl(text('url'))) e.url = 'Enter a full web address starting with https://'
      break
    case 'phone':
    case 'whatsapp':
      if (!phoneOk(text('phone'))) e.phone = 'Enter a phone number with country code'
      break
    case 'social':
      if (!isSafeHttpUrl(text('url'))) e.url = 'Enter a full web address starting with https://'
      break
    case 'map':
      if (!isSafeHttpUrl(text('url'))) e.url = 'Paste a Google Maps link starting with https://'
      break
  }
  return e
}

/** Removes empty optional strings before saving. */
export function cleanBlockData(b: DraftBlock): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(b.data)
      .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
      .filter(([, v]) => v !== '' && v !== undefined && v !== null),
  )
}

let counter = 0
export const newKey = () => `b${Date.now().toString(36)}${(counter++).toString(36)}`

function BlockFields({
  block,
  errors,
  onChange,
  files,
  businessId,
  onFilesAdded,
}: {
  block: DraftBlock
  errors: Record<string, string>
  onChange: (data: Record<string, unknown>) => void
  files: FileRecord[]
  businessId: string | null
  onFilesAdded: (f: FileRecord[]) => void
}) {
  const [picker, setPicker] = useState(false)
  const d = block.data
  const set = (k: string, v: unknown) => onChange({ ...d, [k]: v })
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '')
  const fileById = (id: unknown) => files.find((f) => f.id === id)

  switch (block.type) {
    case 'heading':
      return (
        <Field label="Heading" error={errors.text}>
          {(p) => <Input {...p} value={str('text')} maxLength={160} onChange={(e) => set('text', e.target.value)} />}
        </Field>
      )
    case 'text':
      return (
        <Field label="Text" hint="Line breaks are kept. Formatting and HTML are not supported." error={errors.text}>
          {(p) => <Textarea {...p} rows={4} value={str('text')} maxLength={4000} onChange={(e) => set('text', e.target.value)} />}
        </Field>
      )
    case 'image':
    case 'document':
    case 'gallery': {
      const isGallery = block.type === 'gallery'
      const ids = isGallery ? ((d.file_ids as string[] | undefined) ?? []) : d.file_id ? [d.file_id as string] : []
      const chosen = ids.map(fileById).filter((f): f is FileRecord => Boolean(f))
      return (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {chosen.map((f) =>
              f.kind === 'image' ? (
                <img key={f.id} src={storagePublicUrl(f.storage_path, f.version)} alt={f.title} className="h-16 w-16 rounded-lg object-cover ring-1 ring-line" />
              ) : (
                <span key={f.id} className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-line">
                  <FileText className="size-4 text-muted" /> {f.title}
                </span>
              ),
            )}
            <Button type="button" variant="secondary" size="sm" onClick={() => setPicker(true)}>
              {chosen.length ? 'Change' : isGallery ? 'Choose images' : block.type === 'image' ? 'Choose image' : 'Choose PDF'}
            </Button>
          </div>
          {(errors.file_id || errors.file_ids) && <p className="text-xs font-medium text-danger">{errors.file_id || errors.file_ids}</p>}
          {block.type === 'image' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Caption">{(p) => <Input {...p} value={str('caption')} maxLength={200} onChange={(e) => set('caption', e.target.value)} />}</Field>
              <Field label="Alt text" hint="Describes the image for screen readers.">
                {(p) => <Input {...p} value={str('alt')} maxLength={200} onChange={(e) => set('alt', e.target.value)} />}
              </Field>
            </div>
          )}
          {block.type === 'document' && (
            <Field label="Label" hint="Optional. Defaults to the file title.">
              {(p) => <Input {...p} value={str('label')} maxLength={80} onChange={(e) => set('label', e.target.value)} />}
            </Field>
          )}
          <FilePickerDialog
            open={picker}
            onOpenChange={setPicker}
            businessId={businessId}
            kind={block.type === 'document' ? 'document' : 'image'}
            multiple={isGallery}
            selected={ids}
            onSelect={(picked) => {
              onFilesAdded(picked)
              if (isGallery) set('file_ids', picked.map((f) => f.id).slice(0, 24))
              else set('file_id', picked[0]?.id)
            }}
          />
        </div>
      )
    }
    case 'button':
    case 'link':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Label" error={errors.label}>
            {(p) => <Input {...p} value={str('label')} maxLength={80} onChange={(e) => set('label', e.target.value)} />}
          </Field>
          <Field label="Web address" error={errors.url}>
            {(p) => <Input {...p} type="url" placeholder="https://" value={str('url')} onChange={(e) => set('url', e.target.value)} />}
          </Field>
        </div>
      )
    case 'phone':
    case 'whatsapp':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone number" error={errors.phone}>
            {(p) => <Input {...p} type="tel" placeholder="+91 98765 43210" value={str('phone')} onChange={(e) => set('phone', e.target.value)} />}
          </Field>
          <Field label="Button label" hint="Optional">
            {(p) => <Input {...p} value={str('label')} maxLength={80} onChange={(e) => set('label', e.target.value)} />}
          </Field>
          {block.type === 'whatsapp' && (
            <Field label="Prefilled message" hint="Optional" className="sm:col-span-2">
              {(p) => <Textarea {...p} rows={2} value={str('message')} maxLength={500} onChange={(e) => set('message', e.target.value)} />}
            </Field>
          )}
        </div>
      )
    case 'social':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Platform">
            {(p) => (
              <Select {...p} value={str('platform') || 'instagram'} onChange={(e) => set('platform', e.target.value)}>
                {SOCIAL_PLATFORMS.map((s) => (
                  <option key={s} value={s}>
                    {SOCIAL_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Profile address" error={errors.url} className="sm:col-span-2">
            {(p) => <Input {...p} type="url" placeholder="https://" value={str('url')} onChange={(e) => set('url', e.target.value)} />}
          </Field>
          <Field label="Label" hint="Optional" className="sm:col-span-3">
            {(p) => <Input {...p} value={str('label')} maxLength={80} onChange={(e) => set('label', e.target.value)} />}
          </Field>
        </div>
      )
    case 'map':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Google Maps link" error={errors.url}>
            {(p) => <Input {...p} type="url" placeholder="https://maps.app.goo.gl/…" value={str('url')} onChange={(e) => set('url', e.target.value)} />}
          </Field>
          <Field label="Button label" hint="Optional">
            {(p) => <Input {...p} value={str('label')} maxLength={80} onChange={(e) => set('label', e.target.value)} />}
          </Field>
        </div>
      )
    default:
      return null
  }
}

/** Ordered list of structured content blocks (no free HTML). */
export function BlockEditor({
  blocks,
  onChange,
  errors,
  files,
  businessId,
  onFilesAdded,
}: {
  blocks: DraftBlock[]
  onChange: (blocks: DraftBlock[]) => void
  errors: Record<string, Record<string, string>>
  files: FileRecord[]
  businessId: string | null
  onFilesAdded: (f: FileRecord[]) => void
}) {
  const move = (i: number, dir: -1 | 1) => {
    const next = [...blocks]
    const [item] = next.splice(i, 1)
    next.splice(i + dir, 0, item)
    onChange(next)
  }
  const add = (type: BlockType) =>
    onChange([...blocks, { key: newKey(), type, data: type === 'social' ? { platform: 'instagram' } : {} }])

  return (
    <div className="grid gap-3">
      {blocks.length === 0 && (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
          No content blocks yet. Add headings, text, images, documents or buttons.
        </p>
      )}
      {blocks.map((b, i) => {
        const meta = BLOCK_TYPES.find((t) => t.type === b.type)
        return (
          <div key={b.key} className="rounded-xl border border-line bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <span className="inline-flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-muted">
                {meta?.icon} {meta?.label}
              </span>
              <div className="flex items-center">
                <Button type="button" variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Move down" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove block"
                  className="text-danger hover:bg-danger-soft"
                  onClick={() => onChange(blocks.filter((x) => x.key !== b.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="p-3">
              <BlockFields
                block={b}
                errors={errors[b.key] ?? {}}
                files={files}
                businessId={businessId}
                onFilesAdded={onFilesAdded}
                onChange={(data) => onChange(blocks.map((x) => (x.key === b.key ? { ...x, data } : x)))}
              />
            </div>
          </div>
        )
      })}
      <Menu>
        <MenuTrigger asChild>
          <Button type="button" variant="secondary" className="justify-self-start">
            <Plus /> Add block
          </Button>
        </MenuTrigger>
        <MenuContent align="start">
          {BLOCK_TYPES.map((t) => (
            <MenuItem key={t.type} onSelect={() => add(t.type)}>
              {t.icon} {t.label}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </div>
  )
}

import { X } from 'lucide-react'
import { UploadButton } from '@/components/admin/FilePicker'
import { Field, Input, Switch, Textarea } from '@/components/ui/form'
import { storagePublicUrl } from '@/config'
import { IMAGE_PRESETS } from '@/lib/image'
import type { FileRecord } from '@/lib/types'
import { cn } from '@/lib/utils'

function ImageSlot({
  label,
  file,
  businessId,
  onChange,
  round,
}: {
  label: string
  file?: FileRecord
  businessId: string | null
  onChange: (f: FileRecord | null) => void
  round?: boolean
}) {
  const crop = round ? { ...IMAGE_PRESETS.avatar, label: 'Adjust the profile image' } : { ...IMAGE_PRESETS.cover, label: 'Adjust the cover image' }
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3">
        {file ? (
          <span className="relative">
            <img
              src={storagePublicUrl(file.storage_path, file.version)}
              alt=""
              className={cn('h-16 object-cover ring-1 ring-line', round ? 'w-16 rounded-full' : 'w-28 rounded-lg')}
            />
            <button
              type="button"
              aria-label={`Remove ${label.toLowerCase()}`}
              onClick={() => onChange(null)}
              className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-white text-muted shadow ring-1 ring-line hover:text-danger"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ) : (
          <span className={cn('grid h-16 place-items-center bg-surface text-xs text-muted ring-1 ring-dashed ring-line-strong', round ? 'w-16 rounded-full' : 'w-28 rounded-lg')}>
            None
          </span>
        )}
        <UploadButton businessId={businessId} kind="image" label={file ? 'Change' : 'Upload'} crop={crop} onUploaded={onChange} />
      </div>
    </div>
  )
}

/** Title, subtitle and images at the top of a multi-link page. */
export function LandingHeaderFields({
  value,
  onChange,
  errors,
  files,
  businessId,
  onFileAdded,
  canShowBusiness,
}: {
  value: Record<string, unknown>
  onChange: (v: Record<string, unknown>) => void
  errors: Record<string, string>
  files: Map<string, FileRecord>
  businessId: string | null
  onFileAdded: (f: FileRecord) => void
  /** Codes linked to a real business can show its header instead. */
  canShowBusiness: boolean
}) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v })
  const str = (k: string) => (typeof value[k] === 'string' ? (value[k] as string) : '')
  const showBusiness = canShowBusiness && value.show_business !== false

  return (
    <div className="grid gap-4">
      {canShowBusiness && (
        <Switch
          checked={showBusiness}
          onCheckedChange={(v) => set('show_business', v)}
          label="Use the business header"
          description="Show the business name, logo and contact buttons at the top instead of the fields below."
        />
      )}
      {!showBusiness && (
        <>
          <Field label="Page title" error={errors.title}>
            {(p) => <Input {...p} maxLength={160} placeholder="e.g. Chinar Café" value={str('title')} onChange={(e) => set('title', e.target.value)} />}
          </Field>
          <Field label="Short description" hint="Optional. Shown under the title." error={errors.subtitle}>
            {(p) => <Textarea {...p} rows={2} maxLength={300} value={str('subtitle')} onChange={(e) => set('subtitle', e.target.value)} />}
          </Field>
          <details className="group" open>
            <summary className="cursor-pointer text-sm font-medium text-signal">Logo or profile picture</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <ImageSlot
                label="Logo or profile picture"
                round
                businessId={businessId}
                file={files.get(str('avatar_file_id'))}
                onChange={(f) => {
                  if (f) onFileAdded(f)
                  set('avatar_file_id', f?.id)
                }}
              />
            </div>
          </details>
        </>
      )}
    </div>
  )
}

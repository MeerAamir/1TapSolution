import { Check, FileText, ImageIcon, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState, Skeleton } from '@/components/ui/feedback'
import { Dialog } from '@/components/ui/overlay'
import { config, storagePublicUrl } from '@/config'
import { listFilesForPicker } from '@/lib/admin-api'
import { ACCEPT_ATTR, ACCEPT_IMAGES, uploadFile } from '@/lib/files'
import { friendlyError } from '@/lib/supabase'
import { warnIfLargePdf } from './uploadNotices'
import type { FileRecord } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { cn, formatBytes } from '@/lib/utils'

export function UploadButton({
  businessId,
  kind,
  onUploaded,
  label = 'Upload',
  variant = 'secondary',
  showOnProfile,
}: {
  businessId: string | null
  kind?: 'document' | 'image'
  onUploaded: (file: FileRecord) => void
  label?: string
  variant?: 'secondary' | 'primary'
  showOnProfile?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={kind === 'image' ? ACCEPT_IMAGES : kind === 'document' ? '.pdf,application/pdf' : ACCEPT_ATTR}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          if (kind === 'document' && !file.name.toLowerCase().endsWith('.pdf')) {
            toast.error('Choose a PDF file.')
            return
          }
          setProgress(5)
          try {
            const rec = await uploadFile(file, {
              businessId,
              imagesOnly: kind === 'image',
              showOnProfile,
              onProgress: setProgress,
            })
            toast.success(`Uploaded ${rec.title}`)
            warnIfLargePdf(rec)
            onUploaded(rec)
          } catch (err) {
            toast.error(friendlyError(err))
          } finally {
            setProgress(null)
          }
        }}
      />
      <Button type="button" variant={variant} onClick={() => input.current?.click()} loading={progress !== null}>
        {progress === null && <Upload />}
        {progress !== null ? `Uploading ${progress}%` : label}
      </Button>
    </>
  )
}

/** Choose one (or several) public files, or upload a new one. */
export function FilePickerDialog({
  open,
  onOpenChange,
  businessId,
  kind,
  multiple,
  selected,
  onSelect,
  title,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  businessId: string | null
  kind?: 'document' | 'image'
  multiple?: boolean
  selected?: string[]
  onSelect: (files: FileRecord[]) => void
  title?: string
}) {
  const files = useQuery(() => (open ? listFilesForPicker(businessId, kind) : Promise.resolve([])), [open, businessId, kind])
  const [picked, setPicked] = useState<string[]>(selected ?? [])

  const toggle = (id: string) =>
    setPicked((cur) => (multiple ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]))

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setPicked(selected ?? [])
        onOpenChange(v)
      }}
      title={title ?? (kind === 'image' ? 'Choose an image' : kind === 'document' ? 'Choose a document' : 'Choose a file')}
      description={`Public files only. Up to ${config.maxUploadMb} MB per upload.`}
      className="max-w-2xl"
      footer={
        <>
          <UploadButton
            businessId={businessId}
            kind={kind}
            onUploaded={(rec) => {
              files.setData((cur) => [rec, ...(cur ?? [])])
              setPicked((cur) => (multiple ? [...cur, rec.id] : [rec.id]))
            }}
            label="Upload new"
          />
          <Button
            disabled={!picked.length}
            onClick={() => {
              const all = files.data ?? []
              onSelect(picked.map((id) => all.find((f) => f.id === id)).filter((f): f is FileRecord => Boolean(f)))
              onOpenChange(false)
            }}
          >
            {multiple ? `Use ${picked.length || ''} selected` : 'Use this file'}
          </Button>
        </>
      }
    >
      {files.loading && !files.data ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : !files.data?.length ? (
        <EmptyState
          icon={kind === 'document' ? <FileText /> : <ImageIcon />}
          title="No files yet"
          description="Upload a file to use it here."
          className="py-8"
        />
      ) : (
        <ul className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto p-0.5 sm:grid-cols-3">
          {files.data.map((f) => {
            const isPicked = picked.includes(f.id)
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => toggle(f.id)}
                  aria-pressed={isPicked}
                  className={cn(
                    'relative w-full overflow-hidden rounded-lg border text-left transition-shadow',
                    isPicked ? 'border-signal ring-2 ring-signal/30' : 'border-line hover:border-line-strong',
                  )}
                >
                  <div className="grid aspect-[4/3] place-items-center bg-surface">
                    {f.kind === 'image' ? (
                      <img src={storagePublicUrl(f.storage_path, f.version)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <FileText className="size-8 text-muted" />
                    )}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-medium">{f.title}</p>
                    <p className="text-[0.7rem] text-muted">{formatBytes(f.size_bytes)}</p>
                  </div>
                  {isPicked && (
                    <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-signal text-white">
                      <Check className="size-3.5" />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}

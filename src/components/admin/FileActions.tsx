import { Download, Eye, Lock, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Switch, Textarea } from '@/components/ui/form'
import { ConfirmDialog, Dialog, MenuItem } from '@/components/ui/overlay'
import { storagePublicUrl } from '@/config'
import { fileUsage, updateFileMeta } from '@/lib/admin-api'
import { ACCEPT_IMAGES, deleteFile, replaceFile, signedUrl } from '@/lib/files'
import { friendlyError } from '@/lib/supabase'
import type { FileRecord } from '@/lib/types'

const USAGE_LABEL: Record<string, string> = {
  qr_code: 'QR code',
  business_logo: 'Logo of',
  business_cover: 'Cover image of',
  content_block: 'Content block on',
}

/** Rename/describe, replace, preview and delete a file — with usage checks. */
export function useFileActions(onChanged: (f?: FileRecord) => void) {
  const [editing, setEditing] = useState<FileRecord | null>(null)
  const [deleting, setDeleting] = useState<{ file: FileRecord; usage: Array<{ usage_type: string; entity_name: string }> } | null>(null)
  const [busy, setBusy] = useState(false)
  const replaceInput = useRef<HTMLInputElement>(null)
  const replacing = useRef<FileRecord | null>(null)
  const [draft, setDraft] = useState({ title: '', description: '', show: false })

  const open = async (f: FileRecord) => {
    try {
      const url = f.bucket === 'public-files' ? storagePublicUrl(f.storage_path, f.version) : await signedUrl(f)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const startReplace = (f: FileRecord) => {
    replacing.current = f
    if (replaceInput.current) {
      replaceInput.current.accept = f.kind === 'document' ? '.pdf,application/pdf' : ACCEPT_IMAGES
      replaceInput.current.click()
    }
  }

  const startDelete = async (f: FileRecord) => {
    try {
      const usage = await fileUsage(f.id)
      setDeleting({ file: f, usage })
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const menuItems = (f: FileRecord) => (
    <>
      <MenuItem onSelect={() => void open(f)}>
        {f.bucket === 'private-files' ? <Lock /> : <Eye />} Open
      </MenuItem>
      <MenuItem
        onSelect={() => {
          setDraft({ title: f.title, description: f.description ?? '', show: f.show_on_profile })
          setEditing(f)
        }}
      >
        <Pencil /> Edit details
      </MenuItem>
      <MenuItem onSelect={() => startReplace(f)}>
        <RefreshCw /> Replace file
      </MenuItem>
      {f.bucket === 'public-files' && (
        <MenuItem onSelect={() => window.open(`${storagePublicUrl(f.storage_path)}?download=`, '_blank', 'noopener')}>
          <Download /> Download
        </MenuItem>
      )}
      <MenuItem destructive onSelect={() => void startDelete(f)}>
        <Trash2 /> Delete
      </MenuItem>
    </>
  )

  const dialogs = (
    <>
      <input
        ref={replaceInput}
        type="file"
        className="sr-only"
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          const target = replacing.current
          if (!file || !target) return
          const t = toast.loading(`Replacing ${target.title}…`)
          try {
            const updated = await replaceFile(target, file)
            toast.success('File replaced. Every QR code and page using it now shows the new version.', { id: t })
            onChanged(updated)
          } catch (err) {
            toast.error(friendlyError(err), { id: t })
          }
        }}
      />
      <Dialog
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        title="File details"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!draft.title.trim()}
              onClick={async () => {
                if (!editing) return
                setBusy(true)
                try {
                  const updated = await updateFileMeta(editing.id, {
                    title: draft.title.trim(),
                    description: draft.description.trim() || null,
                    show_on_profile: draft.show,
                  })
                  toast.success('File details saved')
                  setEditing(null)
                  onChanged(updated)
                } catch (e) {
                  toast.error(friendlyError(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              Save details
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Display title" required>
            {(p) => <Input {...p} value={draft.title} maxLength={160} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />}
          </Field>
          <Field label="Description">
            {(p) => <Textarea {...p} rows={3} value={draft.description} maxLength={1000} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />}
          </Field>
          {editing?.bucket === 'public-files' && editing.business_id && (
            <Switch
              checked={draft.show}
              onCheckedChange={(v) => setDraft({ ...draft, show: v })}
              label={editing.kind === 'document' ? 'Show in the Documents list' : 'Show in the Photos gallery'}
              description="On this business’s public page."
            />
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        loading={busy}
        destructive={!deleting?.usage.length}
        title={deleting?.usage.length ? 'This file is still in use' : `Delete ${deleting?.file.title}?`}
        description={
          deleting?.usage.length ? (
            <>
              <p>Remove it from these places first, or replace the file instead of deleting it:</p>
              <ul className="mt-2 list-disc pl-5">
                {deleting.usage.map((u, i) => (
                  <li key={i}>
                    {USAGE_LABEL[u.usage_type] ?? u.usage_type} <strong className="text-ink">{u.entity_name}</strong>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>The file is removed from storage. This cannot be undone.</p>
          )
        }
        confirmLabel={deleting?.usage.length ? 'Got it' : 'Delete file'}
        onConfirm={async () => {
          if (!deleting) return
          if (deleting.usage.length) {
            setDeleting(null)
            return
          }
          setBusy(true)
          try {
            await deleteFile(deleting.file)
            toast.success('File deleted')
            setDeleting(null)
            onChanged()
          } catch (e) {
            toast.error(friendlyError(e))
          } finally {
            setBusy(false)
          }
        }}
      />
    </>
  )

  return { menuItems, dialogs }
}

export { USAGE_LABEL }

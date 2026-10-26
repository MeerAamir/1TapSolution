import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/overlay'
import { deleteBusiness, setBusinessLifecycle } from '@/lib/admin-api'
import { friendlyError } from '@/lib/supabase'
import type { Business } from '@/lib/types'

type Target = Pick<Business, 'id' | 'name' | 'status' | 'archived_at'>

/** Lifecycle actions (activate, deactivate, archive, restore, delete) with confirmations. */
export function useBusinessActions(onChanged: () => void, onDeleted?: () => void) {
  const [pending, setPending] = useState<{ kind: 'archive' | 'delete'; target: Target } | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(success)
      onChanged()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const actions = {
    toggleStatus: (t: Target) =>
      run(
        () => setBusinessLifecycle(t.id, { status: t.status === 'active' ? 'inactive' : 'active' }),
        t.status === 'active' ? `${t.name} deactivated` : `${t.name} activated`,
      ),
    restore: (t: Target) => run(() => setBusinessLifecycle(t.id, { archived_at: null }), `${t.name} restored`),
    archive: (t: Target) => setPending({ kind: 'archive', target: t }),
    remove: (t: Target) => setPending({ kind: 'delete', target: t }),
  }

  const dialog = pending ? (
    <ConfirmDialog
      open
      onOpenChange={(v) => !v && setPending(null)}
      loading={busy}
      destructive={pending.kind === 'delete'}
      title={pending.kind === 'archive' ? `Archive ${pending.target.name}?` : `Delete ${pending.target.name}?`}
      description={
        pending.kind === 'archive' ? (
          <p>
            The business page and all its QR codes will show “currently unavailable” until you restore it. Nothing is
            deleted.
          </p>
        ) : (
          <>
            <p>
              This permanently deletes the business, its QR codes, opening hours, locations and content blocks. Printed QR
              codes will show “not recognised”. Uploaded files are kept in Files &amp; documents.
            </p>
            <p className="mt-2 font-medium text-ink">This cannot be undone.</p>
          </>
        )
      }
      confirmLabel={pending.kind === 'archive' ? 'Archive business' : 'Delete permanently'}
      requireText={pending.kind === 'delete' ? pending.target.name : undefined}
      onConfirm={async () => {
        const t = pending.target
        if (pending.kind === 'archive') {
          await run(() => setBusinessLifecycle(t.id, { archived_at: new Date().toISOString() }), `${t.name} archived`)
        } else {
          setBusy(true)
          try {
            await deleteBusiness(t.id)
            toast.success(`${t.name} deleted`)
            if (onDeleted) onDeleted()
            else onChanged()
          } catch (e) {
            toast.error(friendlyError(e))
          } finally {
            setBusy(false)
          }
        }
        setPending(null)
      }}
    />
  ) : null

  return { actions, dialog }
}

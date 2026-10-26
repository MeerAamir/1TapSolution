import { Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, PageHeader, Table, Td, Th } from '@/components/ui/data'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/form'
import { ConfirmDialog, Dialog } from '@/components/ui/overlay'
import { categoryUsage, deleteCategory, listCategories, saveCategory } from '@/lib/admin-api'
import { friendlyError } from '@/lib/supabase'
import type { Category } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { slugify } from '@/lib/utils'

export default function CategoriesPage() {
  const list = useQuery(listCategories, [])
  const usage = useQuery(categoryUsage, [])
  const [editing, setEditing] = useState<Partial<Category> | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!editing) return
    const name = (editing.name ?? '').trim()
    if (!name) {
      setError('Enter a name')
      return
    }
    const slug = slugify(name)
    if (!slug) {
      setError('Use letters or numbers in the name')
      return
    }
    setBusy(true)
    try {
      await saveCategory({ id: editing.id, name, slug, description: editing.description?.trim() || null })
      toast.success(editing.id ? 'Category updated' : 'Category added')
      setEditing(null)
      list.reload()
    } catch (e) {
      setError(friendlyError(e).replace('A record with the same unique value already exists.', 'A category with this name already exists.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Categories"
        description="Group businesses for filtering. The category name is also shown on the public page."
        actions={
          <Button
            onClick={() => {
              setError(null)
              setEditing({ name: '', description: '' })
            }}
          >
            <Plus /> Add category
          </Button>
        }
      />
      <Card>
        {list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : !list.data ? (
          <TableSkeleton cols={3} />
        ) : !list.data.length ? (
          <EmptyState icon={<Tags />} title="No categories yet" description="Add categories such as Restaurants or Hotels." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="hidden md:table-cell">Description</Th>
                <Th className="text-right">Businesses</Th>
                <Th className="w-24">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id}>
                  <Td className="font-semibold">{c.name}</Td>
                  <Td className="hidden text-muted md:table-cell">{c.description ?? '—'}</Td>
                  <Td className="text-right tabular">{usage.data?.[c.id] ?? 0}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${c.name}`}
                        onClick={() => {
                          setError(null)
                          setEditing(c)
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${c.name}`} className="text-danger hover:bg-danger-soft" onClick={() => setDeleting(c)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Dialog
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing?.id ? 'Edit category' : 'Add category'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void submit()}>
              {editing?.id ? 'Save category' : 'Add category'}
            </Button>
          </>
        }
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label="Name" required error={error ?? undefined}>
            {(p) => <Input {...p} autoFocus maxLength={80} value={editing?.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}
          </Field>
          <Field label="Description">
            {(p) => <Textarea {...p} rows={2} maxLength={500} value={editing?.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />}
          </Field>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        destructive
        loading={busy}
        title={`Delete ${deleting?.name}?`}
        description={
          <p>
            {usage.data?.[deleting?.id ?? ''] ? `${usage.data[deleting!.id]} business(es) use this category and will become uncategorised.` : 'No businesses use this category.'}
          </p>
        }
        confirmLabel="Delete category"
        onConfirm={async () => {
          if (!deleting) return
          setBusy(true)
          try {
            await deleteCategory(deleting.id)
            toast.success('Category deleted')
            setDeleting(null)
            list.reload()
            usage.reload()
          } catch (e) {
            toast.error(friendlyError(e))
          } finally {
            setBusy(false)
          }
        }}
      />
    </>
  )
}

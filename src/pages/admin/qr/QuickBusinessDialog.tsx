import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Dialog } from '@/components/ui/overlay'
import { isSlugTaken, listCategories, saveBusiness } from '@/lib/admin-api'
import { friendlyError } from '@/lib/supabase'
import { useQuery } from '@/lib/use-query'
import { slugify } from '@/lib/utils'
import { businessFormSchema } from '@/lib/validation/business'

/** Create a business without leaving the QR editor. Details can be completed later. */
export function QuickBusinessDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (b: { id: string; name: string }) => void
}) {
  const categories = useQuery(() => (open ? listCategories() : Promise.resolve([])), [open])
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError(null)
    const slug = slugify(name)
    const parsed = businessFormSchema.safeParse({
      name,
      slug,
      category_id: categoryId,
      tagline: '',
      description: '',
      phone: '',
      whatsapp: '',
      email: '',
      website_url: '',
      google_business_url: '',
      accent_color: '#2563EB',
      hours_note: '',
      status: 'active',
      logo_file_id: null,
      cover_file_id: null,
      custom_fields: [],
      hours: [],
      locations: [],
      social_links: [],
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the name')
      return
    }
    setBusy(true)
    try {
      let finalSlug = parsed.data.slug
      for (let n = 2; await isSlugTaken(finalSlug); n++) finalSlug = `${parsed.data.slug}-${n}`.slice(0, 80)
      const id = await saveBusiness({ ...parsed.data, slug: finalSlug })
      toast.success(`${parsed.data.name} created. Complete its profile any time.`)
      onCreated({ id, name: parsed.data.name })
      setName('')
      setCategoryId('')
      onOpenChange(false)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New business"
      description="Start with a name. Add contact details, hours and branding from the business page later."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Create business
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
        <Field label="Business name" required error={error ?? undefined}>
          {(p) => <Input {...p} autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Category">
          {(p) => (
            <Select {...p} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">No category</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  )
}

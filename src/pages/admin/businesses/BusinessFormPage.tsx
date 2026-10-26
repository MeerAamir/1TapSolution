import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Copy, Eye, ImageIcon, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm, useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { BlockEditor, cleanBlockData, newKey, validateBlock, type DraftBlock } from '@/components/admin/BlockEditor'
import { FilePickerDialog } from '@/components/admin/FilePicker'
import { PhonePreview } from '@/components/admin/PhonePreview'
import { BusinessProfile } from '@/components/public/BusinessProfile'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/data'
import { ErrorState, Notice, Spinner } from '@/components/ui/feedback'
import { ColorInput, Field, Input, Select, Textarea } from '@/components/ui/form'
import { ConfirmDialog, Dialog } from '@/components/ui/overlay'
import { storagePublicUrl } from '@/config'
import {
  getBusinessBundle,
  isSlugTaken,
  listCategories,
  previewPayload,
  saveBlocks,
  saveBusiness,
  updateFileMeta,
} from '@/lib/admin-api'
import { SOCIAL_LABELS, SOCIAL_PLATFORMS } from '@/lib/qr/types'
import { friendlyError } from '@/lib/supabase'
import type { FileRecord } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { DAY_NAMES, slugify } from '@/lib/utils'
import { businessFormSchema, type BusinessFormInput, type BusinessFormValues } from '@/lib/validation/business'

const EMPTY: BusinessFormInput = {
  name: '',
  slug: '',
  category_id: '',
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
}

function MediaSlot({
  label,
  hint,
  file,
  onPick,
  onClear,
  wide,
}: {
  label: string
  hint: string
  file?: FileRecord
  onPick: () => void
  onClear: () => void
  wide?: boolean
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3">
        <div className={`grid shrink-0 place-items-center overflow-hidden rounded-xl bg-surface ring-1 ring-line ${wide ? 'h-20 w-36' : 'h-20 w-20'}`}>
          {file ? (
            <img src={storagePublicUrl(file.storage_path, file.version)} alt="" className={`h-full w-full ${wide ? 'object-cover' : 'object-contain p-1'}`} />
          ) : (
            <ImageIcon className="size-6 text-muted" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onPick}>
            {file ? 'Replace' : 'Choose or upload'}
          </Button>
          {file && (
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              <X /> Remove
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  )
}

function HoursEditor({
  control,
  register,
  errors,
}: {
  control: Control<BusinessFormInput, unknown, BusinessFormValues>
  register: UseFormRegister<BusinessFormInput>
  errors: unknown
}) {
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'hours' })
  const hours = useWatch({ control, name: 'hours' }) ?? []
  const errs = (errors as { hours?: Array<{ closes_at?: { message?: string }; opens_at?: { message?: string } }> })?.hours

  const copyMondayToWeekdays = () => {
    const monday = hours.filter((h) => h.day_of_week === 0)
    if (!monday.length) {
      toast.error('Add Monday’s hours first.')
      return
    }
    const rest = hours.filter((h) => h.day_of_week === 5 || h.day_of_week === 6)
    const copies = [1, 2, 3, 4].flatMap((d) => monday.map((h) => ({ ...h, day_of_week: d })))
    replace([...monday, ...copies, ...rest])
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Days without hours show as “Closed”. Add two ranges for split shifts.</p>
        <Button type="button" variant="secondary" size="sm" onClick={copyMondayToWeekdays}>
          <Copy /> Copy Monday to Tue–Fri
        </Button>
      </div>
      <div className="divide-y divide-line rounded-xl border border-line">
        {DAY_NAMES.map((day, d) => {
          const rows = fields.map((f, i) => ({ f, i })).filter(({ i }) => hours[i]?.day_of_week === d)
          return (
            <div key={day} className="grid gap-2 px-4 py-3 sm:grid-cols-[8rem_1fr] sm:items-start">
              <span className="pt-2 text-sm font-medium">{day}</span>
              <div className="grid gap-2">
                {rows.length === 0 && <span className="pt-2 text-sm text-muted">Closed</span>}
                {rows.map(({ f, i }) => (
                  <div key={f.id} className="flex flex-wrap items-center gap-2">
                    <Input type="time" aria-label={`${day} opens`} className="w-32" {...register(`hours.${i}.opens_at`)} />
                    <span className="text-sm text-muted">to</span>
                    <Input type="time" aria-label={`${day} closes`} className="w-32" {...register(`hours.${i}.closes_at`)} />
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${day} hours`} onClick={() => remove(i)}>
                      <X />
                    </Button>
                    {(errs?.[i]?.closes_at?.message || errs?.[i]?.opens_at?.message) && (
                      <span className="w-full text-xs font-medium text-danger">{errs?.[i]?.closes_at?.message || errs?.[i]?.opens_at?.message}</span>
                    )}
                  </div>
                ))}
                {rows.length < 3 && (
                  <button
                    type="button"
                    className="justify-self-start text-sm font-medium text-signal hover:underline"
                    onClick={() => append({ day_of_week: d, opens_at: '09:00', closes_at: '18:00' })}
                  >
                    {rows.length ? 'Add another range' : 'Add hours'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function BusinessFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const categories = useQuery(listCategories, [])
  const bundle = useQuery(() => (id ? getBusinessBundle(id) : Promise.resolve(null)), [id])
  const [files, setFiles] = useState<FileRecord[]>([])
  const [blocks, setBlocks] = useState<DraftBlock[]>([])
  const [blockErrors, setBlockErrors] = useState<Record<string, Record<string, string>>>({})
  const [blocksDirty, setBlocksDirty] = useState(false)
  const [picker, setPicker] = useState<'logo' | 'cover' | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [tab, setTab] = useState('details')
  const slugTouched = useRef(isEdit)
  const uploadedHere = useRef<Set<string>>(new Set())
  const saved = useRef(false)

  const form = useForm<BusinessFormInput, unknown, BusinessFormValues>({
    resolver: zodResolver(businessFormSchema),
    defaultValues: EMPTY,
    mode: 'onTouched',
  })
  const { register, control, formState, setValue, handleSubmit, reset, setError } = form
  const errors = formState.errors

  // Load existing business into the form.
  useEffect(() => {
    const b = bundle.data
    if (!b) return
    reset({
      name: b.business.name,
      slug: b.business.slug,
      category_id: b.business.category_id ?? '',
      tagline: b.business.tagline ?? '',
      description: b.business.description ?? '',
      phone: b.business.phone ?? '',
      whatsapp: b.business.whatsapp ?? '',
      email: b.business.email ?? '',
      website_url: b.business.website_url ?? '',
      google_business_url: b.business.google_business_url ?? '',
      accent_color: b.business.accent_color,
      hours_note: b.business.hours_note ?? '',
      status: b.business.status,
      logo_file_id: b.business.logo_file_id,
      cover_file_id: b.business.cover_file_id,
      custom_fields: b.business.custom_fields ?? [],
      hours: b.hours.map((h) => ({ day_of_week: h.day_of_week, opens_at: h.opens_at.slice(0, 5), closes_at: h.closes_at.slice(0, 5) })),
      locations: b.locations.map((l) => ({
        label: l.label,
        address: l.address ?? '',
        latitude: l.latitude,
        longitude: l.longitude,
        maps_url: l.maps_url ?? '',
      })),
      social_links: b.social.filter((s) => s.platform !== 'website').map((s) => ({ platform: s.platform as (typeof SOCIAL_PLATFORMS)[number], label: s.label ?? '', url: s.url })),
    })
    setFiles(b.files)
    setBlocks(b.blocks.map((x) => ({ key: newKey(), type: x.type, data: x.data })))
  }, [bundle.data, reset])

  const locations = useFieldArray({ control, name: 'locations' })
  const social = useFieldArray({ control, name: 'social_links' })
  const custom = useFieldArray({ control, name: 'custom_fields' })
  const watched = useWatch({ control }) as BusinessFormInput

  // Auto-generate the slug from the name until the admin edits it.
  const name = watched.name
  useEffect(() => {
    if (!slugTouched.current) setValue('slug', slugify(name ?? ''), { shouldValidate: false })
  }, [name, setValue])

  const dirty = formState.isDirty || blocksDirty
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && !saved.current && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const categoryName = categories.data?.find((c) => c.id === watched.category_id)?.name ?? null
  const preview = useMemo(
    () =>
      previewPayload(
        {
          ...(watched as unknown as Partial<BusinessFormValues>),
          name: watched.name ?? '',
          accent_color: watched.accent_color ?? '#2563EB',
          // Treat empty strings as absent, as the database would.
          tagline: watched.tagline || null,
          description: watched.description || null,
          phone: watched.phone || null,
          whatsapp: watched.whatsapp || null,
          email: watched.email || null,
          website_url: watched.website_url || null,
          google_business_url: watched.google_business_url || null,
          hours_note: watched.hours_note || null,
          locations: (watched.locations ?? []).map((l) => ({
            label: l.label,
            address: l.address || null,
            latitude: typeof l.latitude === 'number' && !Number.isNaN(l.latitude) ? l.latitude : null,
            longitude: typeof l.longitude === 'number' && !Number.isNaN(l.longitude) ? l.longitude : null,
            maps_url: l.maps_url || null,
          })),
          social_links: (watched.social_links ?? []).filter((s) => s.url).map((s) => ({ ...s, label: s.label || null })),
        },
        files,
        blocks.map((b, i) => ({ id: b.key, business_id: id ?? '', qr_code_id: null, position: i, type: b.type, data: b.data })),
        categoryName,
      ),
    [watched, files, blocks, categoryName, id],
  )

  const fileById = (fid: string | null | undefined) => files.find((f) => f.id === fid)
  const addFiles = (more: FileRecord[]) => {
    more.forEach((f) => !f.business_id && uploadedHere.current.add(f.id))
    setFiles((cur) => [...cur, ...more.filter((m) => !cur.some((c) => c.id === m.id))])
  }

  async function onSubmit(values: BusinessFormValues) {
    // Validate content blocks too.
    const be: Record<string, Record<string, string>> = {}
    blocks.forEach((b) => {
      const e = validateBlock(b)
      if (Object.keys(e).length) be[b.key] = e
    })
    setBlockErrors(be)
    if (Object.keys(be).length) {
      setTab('content')
      toast.error('Some content blocks need attention.')
      return
    }
    if (await isSlugTaken(values.slug, id)) {
      setError('slug', { message: 'Another business already uses this slug' })
      setTab('details')
      return
    }
    try {
      const businessId = await saveBusiness(values, id)
      await saveBlocks(
        businessId,
        null,
        blocks.map((b) => ({ type: b.type, data: cleanBlockData(b) })),
      )
      // Files uploaded before the business existed: attach them to it now.
      await Promise.all(
        [...uploadedHere.current].map((fid) => updateFileMeta(fid, { business_id: businessId }).catch(() => undefined)),
      )
      saved.current = true
      toast.success(isEdit ? 'Changes published' : 'Business created')
      navigate(`/admin/businesses/${businessId}`)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const onInvalid = (errs: Record<string, unknown>) => {
    const first = Object.keys(errs)[0]
    const tabFor: Record<string, string> = {
      name: 'details', slug: 'details', category_id: 'details', tagline: 'details', description: 'details', status: 'details', custom_fields: 'details',
      phone: 'contact', whatsapp: 'contact', email: 'contact', website_url: 'contact', google_business_url: 'contact', social_links: 'contact',
      accent_color: 'branding', hours: 'hours', hours_note: 'hours', locations: 'locations',
    }
    setTab(tabFor[first] ?? 'details')
    toast.error('Check the highlighted fields.')
  }

  if (bundle.error) return <ErrorState message={bundle.error} onRetry={bundle.reload} />
  if (isEdit && !bundle.data) return <Spinner />

  const previewNode = <BusinessProfile business={preview} />

  return (
    <>
      <PageHeader
        back={
          <Link to={id ? `/admin/businesses/${id}` : '/admin/businesses'} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> {id ? 'Back to business' : 'Businesses'}
          </Link>
        }
        title={isEdit ? `Edit ${bundle.data?.business.name}` : 'Add business'}
        description={
          isEdit
            ? 'Changes go live on the public page, and on every QR code that opens it, as soon as you publish.'
            : 'Fill in what you have. Only completed fields appear on the public page.'
        }
        actions={
          <>
            <Button type="button" variant="secondary" className="xl:hidden" onClick={() => setPreviewOpen(true)}>
              <Eye /> Preview
            </Button>
            <Button type="submit" form="business-form" loading={formState.isSubmitting}>
              {isEdit ? 'Publish changes' : 'Create business'}
            </Button>
          </>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <form id="business-form" noValidate onSubmit={handleSubmit(onSubmit, onInvalid)}>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-5">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="contact">Contact &amp; links</TabsTrigger>
              <TabsTrigger value="branding">Branding</TabsTrigger>
              <TabsTrigger value="hours">Hours</TabsTrigger>
              <TabsTrigger value="locations">Locations</TabsTrigger>
              <TabsTrigger value="content">Page content</TabsTrigger>
            </TabsList>

            <TabsContent value="details" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <div className="grid gap-5 p-5 sm:grid-cols-2">
                  <Field label="Business name" required error={errors.name?.message} className="sm:col-span-2">
                    {(p) => <Input {...p} {...register('name')} maxLength={120} />}
                  </Field>
                  <Field label="Page address" required hint="Used in /b/your-slug. Changing it breaks old /b/ links but not QR codes." error={errors.slug?.message}>
                    {(p) => (
                      <Input
                        {...p}
                        {...register('slug', {
                          onChange: (e: { target: { value: string } }) => {
                            slugTouched.current = true
                            setValue('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                          },
                        })}
                        maxLength={80}
                        spellCheck={false}
                      />
                    )}
                  </Field>
                  <Field label="Category" error={errors.category_id?.message}>
                    {(p) => (
                      <Select {...p} {...register('category_id')}>
                        <option value="">No category</option>
                        {categories.data?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Tagline" hint="One short line under the name." error={errors.tagline?.message} className="sm:col-span-2">
                    {(p) => <Input {...p} {...register('tagline')} maxLength={160} />}
                  </Field>
                  <Field label="Description" error={errors.description?.message} className="sm:col-span-2">
                    {(p) => <Textarea {...p} rows={5} {...register('description')} maxLength={4000} />}
                  </Field>
                  <Field label="Status" hint="Inactive businesses and their QR codes show a “currently unavailable” page." className="sm:col-span-2">
                    {(p) => (
                      <Select {...p} {...register('status')} className="max-w-xs">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </Select>
                    )}
                  </Field>
                </div>
              </Card>
              <Card className="mt-5">
                <CardHeader title="Extra details" description="Short facts shown under “Good to know”, such as parking, Wi-Fi or payment options." />
                <div className="grid gap-3 p-5">
                  {custom.fields.map((f, i) => (
                    <div key={f.id} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-start">
                      <Input aria-label="Label" placeholder="Label" {...register(`custom_fields.${i}.label`)} maxLength={60} aria-invalid={Boolean(errors.custom_fields?.[i]?.label)} />
                      <Input aria-label="Value" placeholder="Value" {...register(`custom_fields.${i}.value`)} maxLength={500} aria-invalid={Boolean(errors.custom_fields?.[i]?.value)} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove detail" onClick={() => custom.remove(i)}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  {custom.fields.length < 20 && (
                    <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => custom.append({ label: '', value: '' })}>
                      <Plus /> Add detail
                    </Button>
                  )}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="contact" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <div className="grid gap-5 p-5 sm:grid-cols-2">
                  <Field label="Phone" hint="Include the country code." error={errors.phone?.message}>
                    {(p) => <Input {...p} type="tel" placeholder="+91 98765 43210" {...register('phone')} />}
                  </Field>
                  <Field label="WhatsApp number" hint="Full international number." error={errors.whatsapp?.message}>
                    {(p) => <Input {...p} type="tel" placeholder="+91 98765 43210" {...register('whatsapp')} />}
                  </Field>
                  <Field label="Email" error={errors.email?.message}>
                    {(p) => <Input {...p} type="email" {...register('email')} />}
                  </Field>
                  <Field label="Website" error={errors.website_url?.message}>
                    {(p) => <Input {...p} type="url" placeholder="https://" {...register('website_url')} />}
                  </Field>
                  <Field label="Google Business Profile link" error={errors.google_business_url?.message} className="sm:col-span-2">
                    {(p) => <Input {...p} type="url" placeholder="https://g.page/…" {...register('google_business_url')} />}
                  </Field>
                </div>
              </Card>
              <Card className="mt-5">
                <CardHeader title="Social media and other links" />
                <div className="grid gap-3 p-5">
                  {social.fields.map((f, i) => (
                    <div key={f.id} className="grid gap-2 sm:grid-cols-[11rem_1fr_10rem_auto] sm:items-start">
                      <Select aria-label="Platform" {...register(`social_links.${i}.platform`)}>
                        {SOCIAL_PLATFORMS.map((s) => (
                          <option key={s} value={s}>
                            {SOCIAL_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                      <div>
                        <Input aria-label="Link" type="url" placeholder="https://" {...register(`social_links.${i}.url`)} aria-invalid={Boolean(errors.social_links?.[i]?.url)} />
                        {errors.social_links?.[i]?.url && <p className="mt-1 text-xs font-medium text-danger">{errors.social_links[i]?.url?.message}</p>}
                      </div>
                      <Input aria-label="Label (optional)" placeholder="Label (optional)" {...register(`social_links.${i}.label`)} maxLength={60} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove link" onClick={() => social.remove(i)}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => social.append({ platform: 'instagram', url: '', label: '' })}>
                    <Plus /> Add link
                  </Button>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="branding" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <div className="grid gap-6 p-5">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <MediaSlot
                      label="Logo"
                      hint="Square PNG or JPG, at least 256 × 256 px."
                      file={fileById(watched.logo_file_id)}
                      onPick={() => setPicker('logo')}
                      onClear={() => setValue('logo_file_id', null, { shouldDirty: true })}
                    />
                    <MediaSlot
                      label="Cover image"
                      hint="Wide photo, about 1200 × 500 px."
                      wide
                      file={fileById(watched.cover_file_id)}
                      onPick={() => setPicker('cover')}
                      onClear={() => setValue('cover_file_id', null, { shouldDirty: true })}
                    />
                  </div>
                  <Field label="Accent colour" hint="Used for buttons and highlights on the public page." error={errors.accent_color?.message}>
                    {(p) => <ColorInput {...p} value={watched.accent_color ?? ''} onChange={(v) => setValue('accent_color', v, { shouldDirty: true, shouldValidate: true })} />}
                  </Field>
                  <Notice tone="info">
                    Photos for the gallery and PDFs for the documents list are managed on the business page after saving, under
                    Files.
                  </Notice>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="hours" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <div className="grid gap-5 p-5">
                  <HoursEditor control={control} register={register} errors={errors} />
                  <Field label="Note" hint="For example holiday closures or kitchen hours." error={errors.hours_note?.message}>
                    {(p) => <Input {...p} {...register('hours_note')} maxLength={200} />}
                  </Field>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="locations" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <div className="grid gap-4 p-5">
                  {locations.fields.length === 0 && <p className="text-sm text-muted">No locations yet. The first location is used for the Directions button.</p>}
                  {locations.fields.map((f, i) => {
                    const le = errors.locations?.[i]
                    return (
                      <fieldset key={f.id} className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
                        <legend className="px-1 text-sm font-semibold">{i === 0 ? 'Primary location' : `Location ${i + 1}`}</legend>
                        <Field label="Name" error={le?.label?.message}>
                          {(p) => <Input {...p} {...register(`locations.${i}.label`)} maxLength={80} />}
                        </Field>
                        <Field label="Address" error={le?.address?.message}>
                          {(p) => <Input {...p} {...register(`locations.${i}.address`)} maxLength={400} />}
                        </Field>
                        <Field label="Google Maps link" hint="Optional. Used for directions if set." error={le?.maps_url?.message} className="sm:col-span-2">
                          {(p) => <Input {...p} type="url" placeholder="https://maps.app.goo.gl/…" {...register(`locations.${i}.maps_url`)} />}
                        </Field>
                        <Field label="Latitude" error={le?.latitude?.message}>
                          {(p) => <Input {...p} inputMode="decimal" placeholder="34.0837" {...register(`locations.${i}.latitude`, { setValueAs: (v) => (v === '' || v === null ? null : Number(v)) })} />}
                        </Field>
                        <Field label="Longitude" error={le?.longitude?.message}>
                          {(p) => <Input {...p} inputMode="decimal" placeholder="74.7973" {...register(`locations.${i}.longitude`, { setValueAs: (v) => (v === '' || v === null ? null : Number(v)) })} />}
                        </Field>
                        <div className="sm:col-span-2">
                          <Button type="button" variant="danger-outline" size="sm" onClick={() => locations.remove(i)}>
                            <Trash2 /> Remove location
                          </Button>
                        </div>
                      </fieldset>
                    )
                  })}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="justify-self-start"
                    onClick={() => locations.append({ label: locations.fields.length ? 'Branch' : 'Main location', address: '', latitude: null, longitude: null, maps_url: '' })}
                  >
                    <Plus /> Add location
                  </Button>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="content" forceMount className="data-[state=inactive]:hidden">
              <Card>
                <CardHeader title="Page content" description="Extra blocks shown on the business page, such as specials, announcements or buttons." />
                <div className="p-5">
                  <BlockEditor
                    blocks={blocks}
                    onChange={(b) => {
                      setBlocks(b)
                      setBlocksDirty(true)
                    }}
                    errors={blockErrors}
                    files={files}
                    businessId={id ?? null}
                    onFilesAdded={addFiles}
                  />
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </form>

        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <PhonePreview label="Live preview of unsaved changes">{previewNode}</PhonePreview>
          </div>
        </aside>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen} title="Preview" description="Unsaved changes are included." className="max-w-md bg-surface">
        <PhonePreview label="Live preview">{previewNode}</PhonePreview>
      </Dialog>

      <FilePickerDialog
        open={picker !== null}
        onOpenChange={(v) => !v && setPicker(null)}
        businessId={id ?? null}
        kind="image"
        title={picker === 'logo' ? 'Choose a logo' : 'Choose a cover image'}
        onSelect={([f]) => {
          if (!f) return
          addFiles([f])
          setValue(picker === 'logo' ? 'logo_file_id' : 'cover_file_id', f.id, { shouldDirty: true })
        }}
      />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(v) => !v && blocker.reset?.()}
        title="Leave without publishing?"
        description="Your changes have not been saved."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  )
}

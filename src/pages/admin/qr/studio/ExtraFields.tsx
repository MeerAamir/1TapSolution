import { ArrowDown, ArrowUp, ImageIcon, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { FilePickerDialog, UploadButton } from '@/components/admin/FilePicker'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Switch } from '@/components/ui/form'
import { storagePublicUrl } from '@/config'
import { IMAGE_PRESETS } from '@/lib/image'
import type { MenuItem } from '@/lib/qr/types'
import type { FileRecord } from '@/lib/types'
import { cn, formatBytes } from '@/lib/utils'

type Data = Record<string, unknown>
type Errors = Record<string, string>

export function valueAt(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

/** Only complain about fields that have something typed in them. */
export function visibleErrors(errors: Errors, data: unknown): Errors {
  return Object.fromEntries(
    Object.entries(errors).filter(([k]) => {
      const v = valueAt(data, k)
      return v !== undefined && v !== null && String(v).trim() !== '' && !(Array.isArray(v) && v.length === 0)
    }),
  )
}

const str = (d: Data, k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '')

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-xl bg-surface p-1 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            value === o.value ? 'bg-white text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Menu
// -----------------------------------------------------------------------------
type Section = { name?: string; items: MenuItem[] }
const TAG_OPTIONS = [
  ['', 'No tag'],
  ['veg', 'Veg'],
  ['non_veg', 'Non-veg'],
  ['vegan', 'Vegan'],
  ['spicy', 'Spicy'],
  ['new', 'New'],
  ['popular', 'Popular'],
] as const

export const DEFAULT_MENU: Data = { mode: 'items', currency: '₹', sections: [{ name: '', items: [{ name: '', price: '' }] }] }

export function MenuFields({
  value,
  onChange,
  errors,
  businessId,
  files,
  onFilesAdded,
  inBlock,
}: {
  value: Data
  onChange: (v: Data) => void
  errors: Errors
  businessId: string | null
  files: Map<string, FileRecord>
  onFilesAdded: (f: FileRecord[]) => void
  inBlock?: boolean
}) {
  const [picker, setPicker] = useState<'pdf' | 'images' | null>(null)
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v })
  const mode = (str(value, 'mode') || 'items') as 'items' | 'pdf' | 'images' | 'link'
  const sections = (Array.isArray(value.sections) ? value.sections : [{ name: '', items: [] }]) as Section[]
  const setSections = (s: Section[]) => set('sections', s)
  const photoIds = (Array.isArray(value.file_ids) ? value.file_ids : []) as string[]
  const pdf = typeof value.file_id === 'string' ? files.get(value.file_id) : undefined

  const updateItem = (si: number, ii: number, patch: Partial<MenuItem>) =>
    setSections(sections.map((s, i) => (i !== si ? s : { ...s, items: s.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) })))
  const moveItem = (si: number, ii: number, dir: -1 | 1) =>
    setSections(
      sections.map((s, i) => {
        if (i !== si) return s
        const items = [...s.items]
        const [it] = items.splice(ii, 1)
        items.splice(ii + dir, 0, it)
        return { ...s, items }
      }),
    )

  return (
    <div className="grid gap-4">
      <Segmented
        label="How to show the menu"
        value={mode}
        onChange={(m) => set('mode', m)}
        options={[
          { value: 'items', label: 'Type it' },
          { value: 'images', label: 'Photos' },
          { value: 'pdf', label: 'PDF' },
          { value: 'link', label: 'Link' },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={inBlock ? 'Button text' : 'Menu title'} hint="Optional">
          {(p) => (
            <Input
              {...p}
              maxLength={inBlock ? 80 : 120}
              placeholder={inBlock ? 'See our menu' : 'Our menu'}
              value={str(value, inBlock ? 'label' : 'title')}
              onChange={(e) => set(inBlock ? 'label' : 'title', e.target.value)}
            />
          )}
        </Field>
        <Field label="Short note" hint="Optional, e.g. “Prices include GST”.">
          {(p) => <Input {...p} maxLength={300} value={str(value, 'note')} onChange={(e) => set('note', e.target.value)} />}
        </Field>
      </div>

      {mode === 'items' && (
        <div className="grid gap-4">
          {errors.sections && <p className="text-sm font-medium text-danger">{errors.sections}</p>}
          {sections.map((s, si) => (
            <div key={si} className="grid gap-3 rounded-xl border border-line bg-surface/50 p-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Section ${si + 1} name`}
                  placeholder="Section, e.g. Starters (optional)"
                  value={s.name ?? ''}
                  maxLength={80}
                  onChange={(e) => setSections(sections.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)))}
                  className="font-semibold"
                />
                {sections.length > 1 && (
                  <Button variant="ghost" size="icon" aria-label="Remove section" className="text-danger" onClick={() => setSections(sections.filter((_, i) => i !== si))}>
                    <Trash2 />
                  </Button>
                )}
              </div>
              <ul className="grid gap-2">
                {s.items.map((it, ii) => (
                  <li key={ii} className="grid gap-2 rounded-lg bg-white p-2.5 ring-1 ring-line">
                    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
                      <Input
                        aria-label="Item name"
                        placeholder="Item, e.g. Kashmiri Kahwa"
                        maxLength={120}
                        value={it.name}
                        aria-invalid={Boolean(errors[`sections.${si}.items.${ii}.name`]) || undefined}
                        onChange={(e) => updateItem(si, ii, { name: e.target.value })}
                      />
                      <Input aria-label="Price" placeholder="Price" maxLength={30} value={it.price ?? ''} onChange={(e) => updateItem(si, ii, { price: e.target.value })} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <Input
                        aria-label="Description"
                        placeholder="Description (optional)"
                        maxLength={300}
                        value={it.description ?? ''}
                        onChange={(e) => updateItem(si, ii, { description: e.target.value })}
                      />
                      <div className="flex items-center justify-end">
                        <Select aria-label="Tag" value={it.tag ?? ''} onChange={(e) => updateItem(si, ii, { tag: (e.target.value || undefined) as MenuItem['tag'] })} className="h-10 w-28">
                          {TAG_OPTIONS.map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </Select>
                        <Button variant="ghost" size="icon" aria-label="Move item up" disabled={ii === 0} onClick={() => moveItem(si, ii, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Move item down" disabled={ii === s.items.length - 1} onClick={() => moveItem(si, ii, 1)}>
                          <ArrowDown />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove item"
                          className="text-danger"
                          onClick={() => setSections(sections.map((x, i) => (i === si ? { ...x, items: x.items.filter((_, j) => j !== ii) } : x)))}
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <Button
                variant="secondary"
                size="sm"
                className="justify-self-start"
                onClick={() => setSections(sections.map((x, i) => (i === si ? { ...x, items: [...x.items, { name: '', price: '' }] } : x)))}
              >
                <Plus /> Add item
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setSections([...sections, { name: '', items: [{ name: '', price: '' }] }])}>
              <Plus /> Add section
            </Button>
            <Field label="Currency" className="w-28">
              {(p) => <Input {...p} maxLength={8} value={str(value, 'currency')} placeholder="₹" onChange={(e) => set('currency', e.target.value)} />}
            </Field>
          </div>
        </div>
      )}

      {mode === 'images' && (
        <div className="grid gap-3">
          <p className="text-sm text-muted">Add a clear photo of each page of your menu, in order. Photos are resized and compressed automatically.</p>
          <div className="flex flex-wrap gap-2">
            {photoIds.map((id, i) => {
              const f = files.get(id)
              return (
                <span key={id} className="relative">
                  {f ? (
                    <img src={storagePublicUrl(f.storage_path, f.version)} alt={`Menu page ${i + 1}`} className="h-24 w-20 rounded-lg object-cover ring-1 ring-line" />
                  ) : (
                    <span className="grid h-24 w-20 place-items-center rounded-lg bg-surface ring-1 ring-line">
                      <ImageIcon className="size-5 text-muted" />
                    </span>
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[0.65rem] font-semibold text-white">{i + 1}</span>
                  <button
                    type="button"
                    aria-label={`Remove page ${i + 1}`}
                    onClick={() => set('file_ids', photoIds.filter((x) => x !== id))}
                    className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-white text-muted shadow ring-1 ring-line hover:text-danger"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <UploadButton
              businessId={businessId}
              kind="image"
              variant={photoIds.length ? 'secondary' : 'primary'}
              label={photoIds.length ? 'Add another page' : 'Upload menu photo'}
              crop={{ maxSide: IMAGE_PRESETS.content.maxSide, label: 'Adjust the menu photo' }}
              onUploaded={(f) => {
                onFilesAdded([f])
                set('file_ids', [...photoIds, f.id].slice(0, 30))
              }}
            />
            <Button variant="ghost" size="sm" onClick={() => setPicker('images')}>
              Choose from my files
            </Button>
          </div>
          {errors.file_ids && <p className="text-xs font-medium text-danger">{errors.file_ids}</p>}
        </div>
      )}

      {mode === 'pdf' && (
        <div className="flex flex-wrap items-center gap-3">
          {pdf && (
            <span className="rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-line">
              <span className="font-medium">{pdf.title}</span> <span className="text-muted">{formatBytes(pdf.size_bytes)}</span>
            </span>
          )}
          <UploadButton
            businessId={businessId}
            kind="document"
            variant={pdf ? 'secondary' : 'primary'}
            label={pdf ? 'Upload a new PDF' : 'Upload menu PDF'}
            onUploaded={(f) => {
              onFilesAdded([f])
              set('file_id', f.id)
            }}
          />
          <Button variant="ghost" size="sm" onClick={() => setPicker('pdf')}>
            Choose from my files
          </Button>
        </div>
      )}

      {mode === 'link' && (
        <Field label="Menu link" hint="For example a Zomato, Swiggy or website menu page." error={errors.url}>
          {(p) => <Input {...p} type="url" placeholder="https://" value={str(value, 'url')} onChange={(e) => set('url', e.target.value)} />}
        </Field>
      )}

      <FilePickerDialog
        open={picker !== null}
        onOpenChange={(v) => !v && setPicker(null)}
        businessId={businessId}
        kind={picker === 'pdf' ? 'document' : 'image'}
        multiple={picker === 'images'}
        selected={picker === 'images' ? photoIds : typeof value.file_id === 'string' ? [value.file_id] : []}
        onSelect={(picked) => {
          onFilesAdded(picked)
          if (picker === 'images') set('file_ids', picked.map((f) => f.id).slice(0, 30))
          else if (picked[0]) set('file_id', picked[0].id)
        }}
      />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Payment
// -----------------------------------------------------------------------------
export function PaymentFields({
  value,
  onChange,
  errors,
  allowDirect,
  inBlock,
}: {
  value: Data
  onChange: (v: Data) => void
  errors: Errors
  /** Payment QR codes can print a plain UPI code. */
  allowDirect?: boolean
  inBlock?: boolean
}) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v })
  const links = (Array.isArray(value.links) ? value.links : []) as Array<{ label: string; url: string }>
  const bank = (value.bank && typeof value.bank === 'object' ? value.bank : {}) as Record<string, string>
  const setBank = (k: string, v: string) => set('bank', { ...bank, [k]: v })
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="UPI ID" hint="In your UPI app: Profile → UPI ID. Works with GPay, PhonePe, Paytm, CRED, BHIM and bank apps." error={errors.upi_id}>
          {(p) => <Input {...p} autoComplete="off" spellCheck={false} placeholder="yourname@okicici" value={str(value, 'upi_id')} onChange={(e) => set('upi_id', e.target.value.trim())} />}
        </Field>
        <Field label="Name shown to the payer" hint="Optional" error={errors.payee_name}>
          {(p) => <Input {...p} maxLength={100} value={str(value, 'payee_name')} onChange={(e) => set('payee_name', e.target.value)} />}
        </Field>
        <Field label="Amount (₹)" hint="Optional. Leave empty to let the customer enter it." error={errors.amount}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              value={value.amount === undefined || value.amount === null ? '' : String(value.amount)}
              onChange={(e) => set('amount', e.target.value.replace(/[^0-9.]/g, ''))}
            />
          )}
        </Field>
        <Field label="Payment note" hint="Optional, e.g. “Table 4” or “Order 123”." error={errors.note}>
          {(p) => <Input {...p} maxLength={80} value={str(value, 'note')} onChange={(e) => set('note', e.target.value)} />}
        </Field>
        {inBlock && (
          <Field label="Button text" hint="Optional" className="sm:col-span-2">
            {(p) => <Input {...p} maxLength={80} placeholder="Pay us" value={str(value, 'label')} onChange={(e) => set('label', e.target.value)} />}
          </Field>
        )}
      </div>
      {allowDirect && (
        <Switch
          checked={value.direct === true}
          onCheckedChange={(v) => set('direct', v)}
          label="Print a plain UPI code"
          description="For a shop counter: customers scan it straight from GPay, PhonePe or Paytm. It cannot be edited after printing and scans are not counted. Leave off to open a payment page with all the options, which you can change any time."
        />
      )}
      <div className="grid gap-2">
        <p className="text-sm font-medium">Payment links</p>
        <p className="text-xs text-muted">Optional. Razorpay, PayPal, Instamojo, a WhatsApp catalogue or any other pay page.</p>
        {links.map((l, i) => (
          <div key={i} className="grid grid-cols-[8rem_minmax(0,1fr)_auto] gap-2">
            <Input aria-label="Link name" placeholder="Pay online" maxLength={60} value={l.label} onChange={(e) => set('links', links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <Input
              aria-label="Link address"
              type="url"
              placeholder="https://"
              value={l.url}
              aria-invalid={Boolean(errors[`links.${i}.url`]) || undefined}
              onChange={(e) => set('links', links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
            />
            <Button variant="ghost" size="icon" aria-label="Remove link" className="text-danger" onClick={() => set('links', links.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </div>
        ))}
        {links.length < 6 && (
          <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => set('links', [...links, { label: '', url: '' }])}>
            <Plus /> Add payment link
          </Button>
        )}
      </div>
      <details className="rounded-xl border border-line p-3" open={Boolean(bank.account_number)}>
        <summary className="cursor-pointer text-sm font-medium">Bank transfer details (optional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Account holder name">{(p) => <Input {...p} maxLength={100} value={bank.account_name ?? ''} onChange={(e) => setBank('account_name', e.target.value)} />}</Field>
          <Field label="Account number" error={errors['bank.account_number']}>
            {(p) => <Input {...p} inputMode="numeric" autoComplete="off" value={bank.account_number ?? ''} onChange={(e) => setBank('account_number', e.target.value.replace(/\s/g, ''))} />}
          </Field>
          <Field label="IFSC" error={errors['bank.ifsc']}>
            {(p) => <Input {...p} autoComplete="off" value={bank.ifsc ?? ''} onChange={(e) => setBank('ifsc', e.target.value.toUpperCase())} />}
          </Field>
          <Field label="Bank name">{(p) => <Input {...p} maxLength={100} value={bank.bank_name ?? ''} onChange={(e) => setBank('bank_name', e.target.value)} />}</Field>
        </div>
      </details>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Google review
// -----------------------------------------------------------------------------
export function ReviewFields({ value, onChange, errors, inBlock }: { value: Data; onChange: (v: Data) => void; errors: Errors; inBlock?: boolean }) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v })
  return (
    <div className="grid gap-4">
      <Field
        label="Google review link"
        hint="Google Business Profile → “Ask for reviews” (or “Get more reviews”) → copy the link. It looks like g.page/r/…/review."
        error={errors.url}
      >
        {(p) => <Input {...p} type="url" placeholder="https://g.page/r/…/review" value={str(value, 'url')} onChange={(e) => set('url', e.target.value)} />}
      </Field>
      {inBlock ? (
        <Field label="Button text" hint="Optional">
          {(p) => <Input {...p} maxLength={80} placeholder="Rate us on Google" value={str(value, 'label')} onChange={(e) => set('label', e.target.value)} />}
        </Field>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-signal">Have a Place ID instead?</summary>
        <Field label="Google Place ID" hint="Used only when no review link is given." error={errors.place_id} className="mt-3">
          {(p) => <Input {...p} spellCheck={false} placeholder="ChIJ…" value={str(value, 'place_id')} onChange={(e) => set('place_id', e.target.value.trim())} />}
        </Field>
      </details>
    </div>
  )
}

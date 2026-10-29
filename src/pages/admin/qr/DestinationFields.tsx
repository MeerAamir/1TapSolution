import { AlertTriangle, FileText } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePickerDialog } from '@/components/admin/FilePicker'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/feedback'
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form'
import { socialPickerLabel, SOCIAL_PLATFORMS, type QrType } from '@/lib/qr/types'
import type { FileRecord } from '@/lib/types'
import { formatBytes } from '@/lib/utils'

type Draft = Record<string, unknown>

export function DestinationFields({
  type,
  value,
  onChange,
  errors,
  businessId,
  fileId,
  file,
  onFileChange,
}: {
  type: QrType
  value: Draft
  onChange: (v: Draft) => void
  errors: Record<string, string>
  businessId: string | null
  fileId: string | null
  file?: FileRecord | null
  onFileChange: (f: FileRecord | null) => void
}) {
  const [picker, setPicker] = useState(false)
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v })
  const str = (k: string) => (value[k] === undefined || value[k] === null ? '' : String(value[k]))

  switch (type) {
    case 'business_profile':
      return (
        <Notice tone="info">
          Opens the business page. Everything on it, from contact details to hours and documents, is edited on the{' '}
          {businessId ? (
            <Link to={`/admin/businesses/${businessId}/edit`} className="font-semibold text-signal hover:underline">
              business profile
            </Link>
          ) : (
            'business profile'
          )}{' '}
          and appears here automatically.
        </Notice>
      )

    case 'document':
      return (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="text-sm font-medium">
              PDF document<span className="ml-0.5 text-danger">*</span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {file ? (
                <span className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-line">
                  <FileText className="size-4 text-muted" />
                  <span className="font-medium">{file.title}</span>
                  <span className="text-muted">{formatBytes(file.size_bytes)}</span>
                </span>
              ) : (
                <span className="text-sm text-muted">No document chosen</span>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={() => setPicker(true)}>
                {fileId ? 'Choose a different file' : 'Choose or upload PDF'}
              </Button>
            </div>
            {errors.file_id && <p className="text-xs font-medium text-danger">{errors.file_id}</p>}
            <p className="text-xs text-muted">
              To update the menu or brochure later, use “Replace file” in Files. This code will serve the new version
              automatically.
            </p>
          </div>
          <Field label="When scanned">
            {(p) => (
              <Select {...p} value={str('open_mode') || 'page'} onChange={(e) => set('open_mode', e.target.value)}>
                <option value="page">Show a page with Open and Download buttons</option>
                <option value="direct">Open the PDF directly</option>
              </Select>
            )}
          </Field>
          <FilePickerDialog
            open={picker}
            onOpenChange={setPicker}
            businessId={businessId}
            kind="document"
            selected={fileId ? [fileId] : []}
            onSelect={([f]) => onFileChange(f ?? null)}
          />
        </div>
      )

    case 'website':
    case 'custom_link':
      return (
        <Field
          label="Web address"
          required
          hint={type === 'custom_link' ? 'Any https link, for example a campaign page with tracking parameters.' : undefined}
          error={errors.url}
        >
          {(p) => <Input {...p} type="url" placeholder="https://" value={str('url')} onChange={(e) => set('url', e.target.value)} />}
        </Field>
      )

    case 'social':
      return (
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <Field label="Platform" required>
            {(p) => (
              <Select {...p} value={str('platform') || 'instagram'} onChange={(e) => set('platform', e.target.value)}>
                {SOCIAL_PLATFORMS.map((s) => (
                  <option key={s} value={s}>
                    {socialPickerLabel(s)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Profile address" required error={errors.url}>
            {(p) => <Input {...p} type="url" placeholder="https://www.instagram.com/yourbusiness" value={str('url')} onChange={(e) => set('url', e.target.value)} />}
          </Field>
        </div>
      )

    case 'phone':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number" required hint="Include the country code." error={errors.phone}>
            {(p) => <Input {...p} type="tel" placeholder="+91 98765 43210" value={str('phone')} onChange={(e) => set('phone', e.target.value)} />}
          </Field>
          <Field label="Heading" hint="Optional, e.g. “Call reception”." error={errors.label}>
            {(p) => <Input {...p} value={str('label')} maxLength={80} onChange={(e) => set('label', e.target.value)} />}
          </Field>
        </div>
      )

    case 'whatsapp':
      return (
        <div className="grid gap-4">
          <Field label="WhatsApp number" required hint="Full international number, e.g. +91 98765 43210." error={errors.phone}>
            {(p) => <Input {...p} type="tel" value={str('phone')} onChange={(e) => set('phone', e.target.value)} />}
          </Field>
          <Field label="Prefilled message" hint="Optional. The visitor can edit it before sending." error={errors.message}>
            {(p) => <Textarea {...p} rows={3} maxLength={500} value={str('message')} onChange={(e) => set('message', e.target.value)} />}
          </Field>
        </div>
      )

    case 'email':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email address" required error={errors.email}>
            {(p) => <Input {...p} type="email" value={str('email')} onChange={(e) => set('email', e.target.value)} />}
          </Field>
          <Field label="Subject" hint="Optional" error={errors.subject}>
            {(p) => <Input {...p} maxLength={200} value={str('subject')} onChange={(e) => set('subject', e.target.value)} />}
          </Field>
          <Field label="Message" hint="Optional" error={errors.body} className="sm:col-span-2">
            {(p) => <Textarea {...p} rows={3} maxLength={1000} value={str('body')} onChange={(e) => set('body', e.target.value)} />}
          </Field>
        </div>
      )

    case 'maps': {
      const mode = str('mode') || (value.latitude !== undefined ? 'coordinates' : 'url')
      return (
        <div className="grid gap-4">
          <Field label="Location from">
            {(p) => (
              <Select {...p} value={mode} onChange={(e) => onChange({ ...value, mode: e.target.value })}>
                <option value="url">A Google Maps link</option>
                <option value="coordinates">Latitude and longitude</option>
              </Select>
            )}
          </Field>
          {mode === 'url' ? (
            <Field label="Google Maps link" required hint="In Google Maps, tap Share and copy the link." error={errors.url}>
              {(p) => <Input {...p} type="url" placeholder="https://maps.app.goo.gl/…" value={str('url')} onChange={(e) => set('url', e.target.value)} />}
            </Field>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Latitude" required error={errors.latitude}>
                {(p) => <Input {...p} inputMode="decimal" placeholder="34.0837" value={str('latitude')} onChange={(e) => set('latitude', e.target.value)} />}
              </Field>
              <Field label="Longitude" required error={errors.longitude}>
                {(p) => <Input {...p} inputMode="decimal" placeholder="74.7973" value={str('longitude')} onChange={(e) => set('longitude', e.target.value)} />}
              </Field>
            </div>
          )}
        </div>
      )
    }

    case 'wifi':
      return (
        <div className="grid gap-4">
          <Notice tone="warning" icon={<AlertTriangle />}>
            <strong className="font-semibold">Wi-Fi codes are static.</strong> Phones read the network name and password
            directly from the printed pattern, so anyone who can see the code can get the password, and changing the password
            means printing a new code. These scans are not counted in analytics.
          </Notice>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Network name (SSID)" required error={errors.ssid}>
              {(p) => <Input {...p} maxLength={32} autoComplete="off" value={str('ssid')} onChange={(e) => set('ssid', e.target.value)} />}
            </Field>
            <Field label="Security">
              {(p) => (
                <Select {...p} value={str('encryption') || 'WPA'} onChange={(e) => set('encryption', e.target.value)}>
                  <option value="WPA">WPA / WPA2 / WPA3</option>
                  <option value="WEP">WEP (legacy)</option>
                  <option value="nopass">Open network, no password</option>
                </Select>
              )}
            </Field>
            {str('encryption') !== 'nopass' && (
              <Field label="Password" required error={errors.password}>
                {(p) => <Input {...p} type="text" autoComplete="off" spellCheck={false} maxLength={63} value={str('password')} onChange={(e) => set('password', e.target.value)} />}
              </Field>
            )}
          </div>
          <Switch checked={Boolean(value.hidden)} onCheckedChange={(v) => set('hidden', v)} label="Hidden network" description="Turn on if the network does not broadcast its name." />
        </div>
      )

    case 'contact_card':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.full_name}>
            {(p) => <Input {...p} autoComplete="off" value={str('full_name')} onChange={(e) => set('full_name', e.target.value)} />}
          </Field>
          <Field label="Job title" error={errors.title}>
            {(p) => <Input {...p} value={str('title')} onChange={(e) => set('title', e.target.value)} />}
          </Field>
          <Field label="Organisation" error={errors.organization}>
            {(p) => <Input {...p} value={str('organization')} onChange={(e) => set('organization', e.target.value)} />}
          </Field>
          <Field label="Phone" error={errors.phone}>
            {(p) => <Input {...p} type="tel" value={str('phone')} onChange={(e) => set('phone', e.target.value)} />}
          </Field>
          <Field label="Email" error={errors.email}>
            {(p) => <Input {...p} type="email" value={str('email')} onChange={(e) => set('email', e.target.value)} />}
          </Field>
          <Field label="Website" error={errors.website}>
            {(p) => <Input {...p} type="url" placeholder="https://" value={str('website')} onChange={(e) => set('website', e.target.value)} />}
          </Field>
          <Field label="Address" error={errors.address} className="sm:col-span-2">
            {(p) => <Input {...p} value={str('address')} onChange={(e) => set('address', e.target.value)} />}
          </Field>
          <Field label="Note" error={errors.note} className="sm:col-span-2">
            {(p) => <Input {...p} value={str('note')} maxLength={300} onChange={(e) => set('note', e.target.value)} />}
          </Field>
          <p className="text-xs text-muted sm:col-span-2">
            This is a dynamic card: edit these details any time and the printed code shows the new version. Visitors tap
            “Save contact” to add it to their phone.
          </p>
        </div>
      )

    case 'landing_page':
      return (
        <Field label="Page title" hint="Shown in the browser tab. Build the page with blocks below." error={errors.title}>
          {(p) => <Input {...p} maxLength={160} value={str('title')} onChange={(e) => set('title', e.target.value)} />}
        </Field>
      )
  }
}

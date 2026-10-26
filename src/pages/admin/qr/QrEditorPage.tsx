import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CopyPlus,
  Info,
  MoreHorizontal,
  Plus,
  Power,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { BlockEditor, cleanBlockData, newKey, validateBlock, type DraftBlock } from '@/components/admin/BlockEditor'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, PageHeader, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/data'
import { ErrorState, Notice, Spinner } from '@/components/ui/feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { ConfirmDialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/overlay'
import { qrPublicUrl, storagePublicUrl } from '@/config'
import {
  createQr,
  deleteQr,
  duplicateQr,
  getBusinessBundle,
  getQr,
  listBlocks,
  listBusinessOptions,
  saveBlocks,
  updateQr,
  type BusinessBundle,
} from '@/lib/admin-api'
import { DEFAULT_DESIGN, parseDesign, type QrDesign } from '@/lib/qr/design'
import { encodedContent } from '@/lib/qr/destinations'
import { QR_TYPE_INFO, QR_TYPES, type QrType } from '@/lib/qr/types'
import { friendlyError } from '@/lib/supabase'
import type { FileRecord, QrOverview } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { relativeTime } from '@/lib/utils'
import { parseDestination, qrMetaSchema } from '@/lib/validation/qr'
import { DesignPanel } from './DesignPanel'
import { DestinationFields } from './DestinationFields'
import { QrPreviewPanel } from './QrPreviewPanel'
import { QrScansPanel } from './QrScansPanel'
import { QuickBusinessDialog } from './QuickBusinessDialog'

type Draft = Record<string, unknown>

function initialDestination(type: QrType, stored: Draft): Draft {
  if (type === 'maps') return { ...stored, mode: stored.latitude !== undefined ? 'coordinates' : 'url' }
  if (type === 'wifi') return { encryption: 'WPA', ...stored }
  if (type === 'social') return { platform: 'instagram', ...stored }
  return { ...stored }
}

const EXPLAINER = [
  ['Permanent link', 'The /q/ address printed in the code. It never changes, so printed codes keep working.'],
  ['Destination', 'What the link opens right now. Edit it here and the next scan goes to the new place.'],
  ['Design', 'Colours and style of the downloadable image. Changing it only affects new downloads.'],
  ['Business content', 'Details shown on profile pages. They are edited on the business and update everywhere.'],
]

export default function QrEditorPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const qr = useQuery<QrOverview | null>(() => (id ? getQr(id) : Promise.resolve(null)), [id])
  const businesses = useQuery(listBusinessOptions, [])

  const [businessId, setBusinessId] = useState(params.get('business') ?? '')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<QrType>('business_profile')
  const [destination, setDestination] = useState<Draft>({})
  const [fileId, setFileId] = useState<string | null>(null)
  const [pickedFile, setPickedFile] = useState<FileRecord | null>(null)
  const [design, setDesign] = useState<QrDesign>(DEFAULT_DESIGN)
  const [blocks, setBlocks] = useState<DraftBlock[]>([])
  const [blockErrors, setBlockErrors] = useState<Record<string, Record<string, string>>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedDesign, setSavedDesign] = useState<string>(JSON.stringify(DEFAULT_DESIGN))
  const [quickBiz, setQuickBiz] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'archive' | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('configure')
  const allowLeave = useRef(false)

  // Load an existing code.
  useEffect(() => {
    const q = qr.data
    if (!q) return
    setBusinessId(q.business_id)
    setName(q.name)
    setDescription(q.description ?? '')
    setType(q.type)
    setDestination(initialDestination(q.type, q.destination))
    setFileId(q.file_id)
    const d = parseDesign(q.design)
    setDesign(d)
    setSavedDesign(JSON.stringify(d))
    setDirty(false)
    if (q.type === 'landing_page') {
      listBlocks(q.business_id, q.id).then((bs) => setBlocks(bs.map((b) => ({ key: newKey(), type: b.type, data: b.data }))))
    }
  }, [qr.data])

  const bundle = useQuery<BusinessBundle | null>(() => (businessId ? getBusinessBundle(businessId) : Promise.resolve(null)), [businessId])
  const files = useMemo(() => {
    const all = [...(bundle.data?.files ?? [])]
    if (pickedFile && !all.some((f) => f.id === pickedFile.id)) all.push(pickedFile)
    return all
  }, [bundle.data, pickedFile])
  const logo = files.find((f) => f.id === bundle.data?.business.logo_file_id)
  const currentFile = files.find((f) => f.id === fileId) ?? (fileId && pickedFile?.id === fileId ? pickedFile : null)

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && !allowLeave.current && currentLocation.pathname !== nextLocation.pathname,
  )

  const touch = () => setDirty(true)
  const isStatic = QR_TYPE_INFO[type].mode === 'static'
  const publicUrl = qr.data ? qrPublicUrl(qr.data.public_code) : undefined
  const content = encodedContent(type, destination, publicUrl ?? qrPublicUrl('preview00'))
  const wifiReady = type !== 'wifi' || Boolean(destination.ssid)

  async function save() {
    setErrors({})
    const meta = qrMetaSchema.safeParse({ name, description, business_id: businessId })
    const dest = parseDestination(type, destination)
    const errs: Record<string, string> = {}
    if (!meta.success) for (const i of meta.error.issues) errs[i.path.join('.')] ??= i.message
    if (!dest.ok) Object.assign(errs, dest.errors)
    if (type === 'document' && !fileId) errs.file_id = 'Choose a PDF document'
    const be: Record<string, Record<string, string>> = {}
    if (type === 'landing_page') {
      blocks.forEach((b) => {
        const e = validateBlock(b)
        if (Object.keys(e).length) be[b.key] = e
      })
      if (!blocks.length) errs.blocks = 'Add at least one block to the landing page'
    }
    setBlockErrors(be)
    if (Object.keys(errs).length || Object.keys(be).length || !meta.success || !dest.ok) {
      setErrors(errs)
      setTab('configure')
      toast.error('Check the highlighted fields.')
      return
    }

    setSaving(true)
    try {
      const input = {
        business_id: meta.data.business_id,
        name: meta.data.name,
        description: meta.data.description,
        type,
        destination: dest.value,
        file_id: type === 'document' ? fileId : null,
        design: design as unknown as Record<string, unknown>,
      }
      const savedQr = isNew ? await createQr(input) : await updateQr(id!, input)
      if (type === 'landing_page') {
        await saveBlocks(savedQr.business_id, savedQr.id, blocks.map((b) => ({ type: b.type, data: cleanBlockData(b) })))
      }
      setDirty(false)
      setSavedDesign(JSON.stringify(design))
      if (isNew) {
        allowLeave.current = true
        toast.success('QR code created. You can download it now.')
        navigate(`/admin/qr/${savedQr.id}`, { replace: true })
      } else {
        toast.success('Changes are live. The printed code now opens the updated destination.')
        qr.reload()
      }
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  async function lifecycle(patch: { status?: 'active' | 'inactive'; archived_at?: string | null }, message: string) {
    if (!id) return
    setBusy(true)
    try {
      await updateQr(id, patch)
      toast.success(message)
      qr.reload()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  if (qr.error) return <ErrorState message={qr.error} onRetry={qr.reload} />
  if (!isNew && !qr.data) return <Spinner />
  const q = qr.data

  const typeLocked = !isNew && (q?.type === 'wifi' || type === 'wifi')

  const configure = (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-6">
        {!isNew && (
          <details className="group rounded-xl border border-signal/20 bg-signal-soft/60 px-4 py-3 text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
              <Info className="size-4 text-signal" /> What changes when you edit this code?
            </summary>
            <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {EXPLAINER.map(([t, d]) => (
                <div key={t}>
                  <dt className="font-semibold">{t}</dt>
                  <dd className="text-ink/70">{d}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}

        <Card>
          <CardHeader title="Basics" />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="Business" required error={errors.business_id}>
              {(p) => (
                <div className="flex gap-2">
                  <Select
                    {...p}
                    value={businessId}
                    onChange={(e) => {
                      setBusinessId(e.target.value)
                      setFileId(null)
                      touch()
                    }}
                    disabled={!isNew}
                  >
                    <option value="">Choose a business</option>
                    {businesses.data?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.archived_at ? ' (archived)' : b.status === 'inactive' ? ' (inactive)' : ''}
                      </option>
                    ))}
                  </Select>
                  {isNew && (
                    <Button type="button" variant="secondary" size="icon" aria-label="Create a new business" onClick={() => setQuickBiz(true)}>
                      <Plus />
                    </Button>
                  )}
                </div>
              )}
            </Field>
            <Field label="Name" required hint="For your reference, e.g. “Table 04” or “Menu poster”." error={errors.name}>
              {(p) => (
                <Input
                  {...p}
                  value={name}
                  maxLength={120}
                  onChange={(e) => {
                    setName(e.target.value)
                    touch()
                  }}
                />
              )}
            </Field>
            <Field label="Internal note" hint="Only visible in the dashboard." className="sm:col-span-2">
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={description}
                  maxLength={1000}
                  onChange={(e) => {
                    setDescription(e.target.value)
                    touch()
                  }}
                />
              )}
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="What should the code open?" description={typeLocked ? 'Wi-Fi codes cannot change type because the network details are printed in the code.' : undefined} />
          <div className="grid gap-5 p-5">
            <div role="radiogroup" aria-label="QR code type" className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {QR_TYPES.map((t) => {
                const info = QR_TYPE_INFO[t]
                const disabled = typeLocked && t !== type
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={type === t}
                    disabled={disabled || (!isNew && t === 'wifi' && type !== 'wifi')}
                    onClick={() => {
                      setType(t)
                      setDestination(initialDestination(t, {}))
                      setErrors({})
                      touch()
                    }}
                    className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      type === t ? 'border-signal bg-signal-soft/60 ring-1 ring-signal' : 'border-line hover:border-line-strong'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {info.label}
                      {info.mode === 'static' && <Badge tone="warning">Static</Badge>}
                    </span>
                    <span className="mt-1 block text-xs leading-snug text-muted">{info.description}</span>
                  </button>
                )
              })}
            </div>
            {!isNew && q && type !== q.type && (
              <Notice tone="warning">
                You are changing this code from {QR_TYPE_INFO[q.type].label} to {QR_TYPE_INFO[type].label}. Printed copies will
                open the new destination after you save.
              </Notice>
            )}
            <DestinationFields
              type={type}
              value={destination}
              onChange={(v) => {
                setDestination(v)
                touch()
              }}
              errors={errors}
              businessId={businessId || null}
              fileId={fileId}
              file={currentFile}
              onFileChange={(f) => {
                setPickedFile(f)
                setFileId(f?.id ?? null)
                touch()
              }}
            />
          </div>
        </Card>

        {type === 'landing_page' && (
          <Card>
            <CardHeader title="Landing page content" description="Shown below the business header. Business contact buttons stay at the top." />
            <div className="grid gap-3 p-5">
              {errors.blocks && <p className="text-sm font-medium text-danger">{errors.blocks}</p>}
              <BlockEditor
                blocks={blocks}
                onChange={(b) => {
                  setBlocks(b)
                  touch()
                }}
                errors={blockErrors}
                files={files}
                businessId={businessId || null}
                onFilesAdded={(fs) => setPickedFile(fs[0] ?? null)}
              />
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Design" description="Changes to the design apply to new downloads. Already printed codes are not affected." />
          <div className="p-5">
            <DesignPanel
              design={design}
              onChange={(d) => {
                setDesign(d)
                touch()
              }}
              hasLogo={Boolean(logo)}
            />
          </div>
        </Card>
      </div>

      <aside className="xl:sticky xl:top-24 xl:self-start">
        {wifiReady ? (
          <QrPreviewPanel
            content={content}
            design={design}
            businessName={bundle.data?.business.name}
            logoUrl={logo ? storagePublicUrl(logo.storage_path, logo.version) : undefined}
            publicUrl={isStatic ? undefined : publicUrl}
            saved={!isNew}
            isStatic={isStatic}
            filename={`${bundle.data?.business.name ?? 'qr'} ${name}`}
            unsavedDesign={JSON.stringify(design) !== savedDesign}
          />
        ) : (
          <Card>
            <p className="p-6 text-center text-sm text-muted">Enter the network name to preview the Wi-Fi code.</p>
          </Card>
        )}
      </aside>
    </div>
  )

  return (
    <>
      <PageHeader
        back={
          <Link to="/admin/qr" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> QR codes
          </Link>
        }
        title={
          isNew ? (
            'New QR code'
          ) : (
            <span className="flex flex-wrap items-center gap-3">
              {q!.name}
              <StatusBadge status={q!.status} archivedAt={q!.archived_at} />
            </span>
          )
        }
        description={
          isNew
            ? 'Choose a business, decide what the code opens, then style and download it.'
            : `${q!.business_name}. ${QR_TYPE_INFO[q!.type].label}. Updated ${relativeTime(q!.updated_at)}.`
        }
        actions={
          <>
            {!isNew && q && (
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem
                    onSelect={async () => {
                      try {
                        const copy = await duplicateQr(q)
                        allowLeave.current = true
                        toast.success('Duplicated with a new permanent link')
                        navigate(`/admin/qr/${copy.id}`)
                      } catch (e) {
                        toast.error(friendlyError(e))
                      }
                    }}
                  >
                    <CopyPlus /> Duplicate
                  </MenuItem>
                  {!q.archived_at && (
                    <MenuItem
                      disabled={busy}
                      onSelect={() =>
                        lifecycle(
                          { status: q.status === 'active' ? 'inactive' : 'active' },
                          q.status === 'active' ? 'QR code deactivated. Scans now show “unavailable”.' : 'QR code reactivated',
                        )
                      }
                    >
                      <Power /> {q.status === 'active' ? 'Deactivate' : 'Reactivate'}
                    </MenuItem>
                  )}
                  {q.archived_at ? (
                    <MenuItem onSelect={() => lifecycle({ archived_at: null }, 'QR code restored')}>
                      <ArchiveRestore /> Restore
                    </MenuItem>
                  ) : (
                    <MenuItem onSelect={() => setConfirm('archive')}>
                      <Archive /> Archive
                    </MenuItem>
                  )}
                  <MenuSeparator />
                  <MenuItem destructive onSelect={() => setConfirm('delete')}>
                    <Trash2 /> Delete
                  </MenuItem>
                </MenuContent>
              </Menu>
            )}
            <Button onClick={() => void save()} loading={saving} disabled={!isNew && !dirty}>
              {isNew ? 'Create QR code' : 'Save changes'}
            </Button>
          </>
        }
      />

      {q && (q.archived_at || q.status !== 'active') && (
        <Notice tone="warning" className="mb-6">
          This code is {q.archived_at ? 'archived' : 'inactive'}. People who scan it see a “currently unavailable” page.{' '}
          <button
            type="button"
            className="font-semibold text-signal hover:underline"
            onClick={() => lifecycle(q.archived_at ? { archived_at: null } : { status: 'active' }, q.archived_at ? 'QR code restored' : 'QR code reactivated')}
          >
            {q.archived_at ? 'Restore it' : 'Reactivate it'}
          </button>
        </Notice>
      )}
      {q && !q.archived_at && q.status === 'active' && (q.business_archived_at || q.business_status !== 'active') && (
        <Notice tone="warning" className="mb-6">
          The business “{q.business_name}” is {q.business_archived_at ? 'archived' : 'inactive'}, so this code currently shows “unavailable”.
        </Notice>
      )}

      {isNew ? (
        configure
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="configure">Configure</TabsTrigger>
            <TabsTrigger value="scans">Scans ({q?.scan_count ?? 0})</TabsTrigger>
          </TabsList>
          <TabsContent value="configure">{configure}</TabsContent>
          <TabsContent value="scans">{q && <QrScansPanel qrCodeId={q.id} totalScans={Number(q.scan_count)} isStatic={q.type === 'wifi'} />}</TabsContent>
        </Tabs>
      )}

      <QuickBusinessDialog
        open={quickBiz}
        onOpenChange={setQuickBiz}
        onCreated={(b) => {
          businesses.setData((cur) => [...(cur ?? []), { id: b.id, name: b.name, slug: '', status: 'active' as const, archived_at: null }].sort((a, c) => a.name.localeCompare(c.name)))
          setBusinessId(b.id)
          touch()
        }}
      />

      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(v) => !v && setConfirm(null)}
        loading={busy}
        title="Archive this QR code?"
        description={<p>People who scan it will see “currently unavailable”. You can restore it at any time; nothing is deleted.</p>}
        confirmLabel="Archive"
        onConfirm={() => lifecycle({ archived_at: new Date().toISOString() }, 'QR code archived')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(v) => !v && setConfirm(null)}
        loading={busy}
        destructive
        title="Delete this QR code permanently?"
        description={
          <>
            <p>
              Printed copies will show “not recognised” and the link <strong className="text-ink">/q/{q?.public_code}</strong> can never be
              restored. Scan history is kept in totals but no longer linked to a code.
            </p>
            <p className="mt-2">If you might need it again, archive it instead.</p>
          </>
        }
        confirmLabel="Delete permanently"
        requireText="DELETE"
        onConfirm={async () => {
          if (!id) return
          setBusy(true)
          try {
            await deleteQr(id)
            toast.success('QR code deleted')
            allowLeave.current = true
            navigate('/admin/qr', { replace: true })
          } catch (e) {
            toast.error(friendlyError(e))
          } finally {
            setBusy(false)
          }
        }}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(v) => !v && blocker.reset?.()}
        title="Leave without saving?"
        description="Your changes to this QR code have not been saved."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  )
}

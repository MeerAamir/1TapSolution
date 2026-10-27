import { ArrowLeft, ArrowLeftRight, BarChart3, CopyPlus, FileText, MoreHorizontal, Palette, Pause, Play, Settings2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { BlockEditor, cleanBlockData, newKey, validateBlock, type DraftBlock } from '@/components/admin/BlockEditor'
import { FilePickerDialog, UploadButton } from '@/components/admin/FilePicker'
import { Button } from '@/components/ui/button'
import { ErrorState, Notice, Spinner } from '@/components/ui/feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { ConfirmDialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/overlay'
import { qrPublicUrl, storagePublicUrl } from '@/config'
import {
  createQr,
  deleteQr,
  duplicateQr,
  getQr,
  listBlocks,
  listBusinessOptions,
  listFilesForPicker,
  newPublicCode,
  saveBlocks,
  updateQr,
  workspaceBusinessId,
} from '@/lib/admin-api'
import { DEFAULT_DESIGN, parseDesign, type QrDesign } from '@/lib/qr/design'
import { encodedContent } from '@/lib/qr/destinations'
import { QR_TYPE_INFO, type QrType } from '@/lib/qr/types'
import { friendlyError } from '@/lib/supabase'
import type { FileRecord, QrCodeRecord } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { cn, formatBytes } from '@/lib/utils'
import { parseDestination } from '@/lib/validation/qr'
import { DesignPanel } from '../DesignPanel'
import { DestinationFields } from '../DestinationFields'
import { QrScansPanel } from '../QrScansPanel'
import { LandingHeaderFields } from './LandingHeaderFields'
import { PhonePreview } from './PhonePreview'
import { StudioQrCard, type LiveState } from './StudioQrCard'
import { autoName, defaultDestination, TYPE_LABEL, TYPE_TILES, typeIcon } from './typeTiles'

type Draft = Record<string, unknown>
type BlockPayload = Array<{ type: DraftBlock['type']; data: Record<string, unknown> }>

const URL_KEYS = ['url', 'website']

/** Lets people paste "example.com" without typing https://. */
function withScheme(d: Draft): Draft {
  const out = { ...d }
  for (const k of URL_KEYS) {
    const v = typeof out[k] === 'string' ? (out[k] as string).trim() : ''
    if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v) && /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(v)) out[k] = `https://${v}`
  }
  return out
}

function initialFromStored(type: QrType, stored: Draft): Draft {
  if (type === 'maps') return { ...stored, mode: stored.latitude !== undefined ? 'coordinates' : 'url' }
  return { ...defaultDestination(type), ...stored }
}

const blockPayload = (blocks: DraftBlock[]): BlockPayload =>
  blocks.filter((b) => !Object.keys(validateBlock(b)).length).map((b) => ({ type: b.type, data: cleanBlockData(b) }))

function Section({ icon, title, children, defaultOpen = true }: { icon: ReactNode; title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-line bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-[0.95rem] font-semibold [&::-webkit-details-marker]:hidden [&_svg]:size-4 [&_svg]:text-signal">
        {icon} {title}
        <span className="ml-auto text-xs font-medium text-muted group-open:hidden">Show</span>
      </summary>
      <div className="border-t border-line p-5">{children}</div>
    </details>
  )
}

function TypePicker({ onPick, current }: { onPick: (t: QrType) => void; current?: QrType | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {TYPE_TILES.map((t) => (
        <button
          key={t.type}
          type="button"
          onClick={() => onPick(t.type)}
          aria-pressed={current === t.type}
          className={cn(
            'group flex min-h-[7.5rem] flex-col items-start gap-2 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-signal/50 hover:shadow-raise',
            current === t.type ? 'border-signal ring-2 ring-signal/30' : 'border-line',
          )}
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-signal-soft text-signal [&_svg]:size-5">{t.icon}</span>
          <span className="font-semibold">{t.label}</span>
          <span className="text-xs leading-snug text-muted">{t.hint}</span>
        </button>
      ))}
    </div>
  )
}

export default function QrStudio() {
  const { id = 'new' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  // Saved record and the editable draft.
  const [rec, setRec] = useState<QrCodeRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(id !== 'new')
  const [code, setCode] = useState('')
  const [type, setType] = useState<QrType | null>(null)
  const [destination, setDestination] = useState<Draft>({})
  const [fileId, setFileId] = useState<string | null>(null)
  const [design, setDesign] = useState<QrDesign>(DEFAULT_DESIGN)
  const [blocks, setBlocks] = useState<DraftBlock[]>([])
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [isWorkspace, setIsWorkspace] = useState(true)
  const [files, setFiles] = useState<Map<string, FileRecord>>(new Map())
  const [changingType, setChangingType] = useState(false)
  const [view, setView] = useState<'qr' | 'phone'>('qr')
  const [pdfPicker, setPdfPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [scanCount, setScanCount] = useState(0)

  // Autosave bookkeeping.
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const recRef = useRef<QrCodeRecord | null>(null)
  const codeRef = useRef('')
  const savedQrJson = useRef('')
  const savedBlocksJson = useRef('')
  const baseline = useRef(false)
  const inFlight = useRef(false)
  const again = useRef(false)
  const pendingRef = useRef(false)

  const businesses = useQuery(listBusinessOptions, [])

  const addFiles = (list: FileRecord[]) =>
    setFiles((cur) => {
      const next = new Map(cur)
      for (const f of list) next.set(f.id, f)
      return next
    })

  async function loadFiles(owner: string) {
    try {
      addFiles(await listFilesForPicker(owner))
    } catch {
      // Previews of images just stay empty.
    }
  }

  // ---- Load an existing code, or prepare a new one -------------------------------------------
  useEffect(() => {
    let active = true
    if (id === 'new') {
      if (recRef.current) {
        // "Create QR" pressed while editing: start over.
        recRef.current = null
        setRec(null)
      }
      setType(null)
      setLoading(false)
      setLoadError(null)
      setChangingType(false)
      const fromBusiness = params.get('business')
      ;(fromBusiness ? Promise.resolve(fromBusiness) : workspaceBusinessId())
        .then((owner) => {
          if (!active) return
          setBusinessId(owner)
          setIsWorkspace(!fromBusiness)
          void loadFiles(owner)
        })
        .catch((e) => active && setLoadError(friendlyError(e)))
      return () => {
        active = false
      }
    }
    if (recRef.current?.id === id) return // we just created it; keep editing
    setLoading(true)
    getQr(id)
      .then(async (q) => {
        if (!active) return
        recRef.current = q
        setRec(q)
        setScanCount(Number(q.scan_count ?? 0))
        codeRef.current = q.public_code
        setCode(q.public_code)
        setType(q.type)
        setDestination(initialFromStored(q.type, q.destination))
        setFileId(q.file_id)
        setDesign(parseDesign(q.design))
        setName(q.name)
        setNameTouched(true)
        setDescription(q.description ?? '')
        setBusinessId(q.business_id)
        setIsWorkspace(Boolean(q.business_is_workspace))
        void loadFiles(q.business_id)
        let loadedBlocks: DraftBlock[] = []
        if (q.type === 'landing_page') {
          loadedBlocks = (await listBlocks(q.business_id, q.id)).map((b) => ({ key: newKey(), type: b.type, data: b.data }))
        }
        if (!active) return
        setBlocks(loadedBlocks)
        baseline.current = true // the first computed snapshot is "already saved"
        setLoading(false)
      })
      .catch((e) => {
        if (active) {
          setLoadError(friendlyError(e))
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ---- Derived state --------------------------------------------------------------------------
  const normalized = useMemo(() => withScheme(destination), [destination])
  const parsed = useMemo(() => (type ? parseDestination(type, normalized) : null), [type, normalized])
  const file = fileId ? files.get(fileId) : undefined
  const businessName = !isWorkspace ? businesses.data?.find((b) => b.id === businessId)?.name : undefined
  const finalName = (nameTouched && name.trim()) || (type ? autoName(type, normalized, { fileTitle: file?.title, businessName }) : '')

  let missing: string | null = null
  if (type && parsed && !parsed.ok) missing = Object.values(parsed.errors)[0] ?? 'Fill in the details'
  else if (type === 'document' && !fileId) missing = 'Upload or choose a PDF to make it live'
  else if (type === 'business_profile' && (isWorkspace || !businessId)) missing = 'Choose a business'
  else if (!businessId) missing = 'Getting ready…'

  // Only show a field's error once something has been typed in it.
  const shownErrors = useMemo(() => {
    if (!parsed || parsed.ok) return {}
    return Object.fromEntries(Object.entries(parsed.errors).filter(([k]) => String(destination[k] ?? '').trim() !== ''))
  }, [parsed, destination])

  const snapshot = useMemo(() => {
    if (!type || !parsed?.ok || missing || !businessId) return null
    return {
      qr: {
        business_id: businessId,
        name: finalName.slice(0, 120),
        description: description.trim() || null,
        type,
        destination: parsed.value,
        file_id: type === 'document' ? fileId : null,
        design: design as unknown as Record<string, unknown>,
      },
      blocks: type === 'landing_page' ? blockPayload(blocks) : null,
    }
  }, [type, parsed, missing, businessId, finalName, description, fileId, design, blocks])

  const latest = useRef(snapshot)
  latest.current = snapshot

  // ---- Autosave -------------------------------------------------------------------------------
  async function flush() {
    if (inFlight.current) {
      again.current = true
      return
    }
    const snap = latest.current
    if (!snap) return
    inFlight.current = true
    setSaving(true)
    try {
      const qrJson = JSON.stringify(snap.qr)
      let r = recRef.current
      if (!r) {
        try {
          r = await createQr({ ...snap.qr, public_code: codeRef.current })
        } catch (e) {
          // Astronomically unlikely clash of the random code: pick another and retry once.
          if ((e as { code?: string }).code !== '23505') throw e
          codeRef.current = newPublicCode()
          setCode(codeRef.current)
          r = await createQr({ ...snap.qr, public_code: codeRef.current })
        }
        recRef.current = r
        setRec(r)
        savedQrJson.current = qrJson
        navigate(`/admin/qr/${r.id}`, { replace: true })
      } else if (qrJson !== savedQrJson.current) {
        r = await updateQr(r.id, snap.qr)
        recRef.current = r
        setRec(r)
        savedQrJson.current = qrJson
      }
      if (snap.blocks) {
        const bJson = JSON.stringify(snap.blocks)
        if (bJson !== savedBlocksJson.current) {
          await saveBlocks(r.business_id, r.id, snap.blocks)
          savedBlocksJson.current = bJson
        }
      }
      setSaveError(null)
    } catch (e) {
      setSaveError(friendlyError(e))
    } finally {
      inFlight.current = false
      pendingRef.current = false
      setSaving(false)
      if (again.current) {
        again.current = false
        void flush()
      }
    }
  }

  const snapshotKey = snapshot ? JSON.stringify(snapshot) : ''
  useEffect(() => {
    if (!snapshot) return
    if (baseline.current) {
      baseline.current = false
      savedQrJson.current = JSON.stringify(snapshot.qr)
      savedBlocksJson.current = JSON.stringify(snapshot.blocks)
      return
    }
    const unchanged =
      recRef.current && JSON.stringify(snapshot.qr) === savedQrJson.current && JSON.stringify(snapshot.blocks) === savedBlocksJson.current
    if (unchanged) return
    pendingRef.current = true
    const t = setTimeout(() => void flush(), recRef.current ? 700 : 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotKey])

  // Save straight away when leaving the page, and warn if the browser is closed mid-save.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pendingRef.current || inFlight.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (pendingRef.current) void flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Actions --------------------------------------------------------------------------------
  function pickType(t: QrType) {
    if (!codeRef.current) {
      codeRef.current = newPublicCode()
      setCode(codeRef.current)
    }
    setType(t)
    setDestination(defaultDestination(t))
    setFileId(null)
    setChangingType(false)
    if (t === 'business_profile' && isWorkspace) setBusinessId(null)
    if (t === 'landing_page' && !blocks.length) setBlocks([{ key: newKey(), type: 'link', data: {} }])
  }

  async function lifecycle(patch: { status?: 'active' | 'inactive' }, message: string) {
    if (!recRef.current) return
    setBusy(true)
    try {
      const r = await updateQr(recRef.current.id, patch)
      recRef.current = r
      setRec(r)
      toast.success(message)
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  // ---- Render ---------------------------------------------------------------------------------
  if (loadError) return <ErrorState message={loadError} onRetry={() => window.location.reload()} />
  if (loading) return <Spinner />

  if (!type) {
    return (
      <div className="mx-auto max-w-5xl">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> My QR codes
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-[-0.02em]">Create a QR code</h1>
        <p className="mt-1 text-muted">What should happen when someone scans it?</p>
        <div className="mt-6">
          <TypePicker onPick={pickType} />
        </div>
      </div>
    )
  }

  const info = QR_TYPE_INFO[type]
  const isStatic = info.mode === 'static'
  const publicUrl = code ? qrPublicUrl(code) : ''
  const content = (() => {
    try {
      return encodedContent(type, parsed?.ok ? parsed.value : normalized, publicUrl)
    } catch {
      return publicUrl
    }
  })()
  const wifiIncomplete = type === 'wifi' && !parsed?.ok

  const avatar = type === 'landing_page' && typeof destination.avatar_file_id === 'string' ? files.get(destination.avatar_file_id) : undefined
  const logoFile = avatar
  const liveState: LiveState = saveError
    ? { kind: 'error', message: `Not saved: ${saveError}` }
    : missing
      ? { kind: 'incomplete', message: rec ? `Not saved: ${missing}` : missing }
      : saving || pendingRef.current || !rec
        ? { kind: 'saving' }
        : rec.status !== 'active' || rec.archived_at
          ? { kind: 'paused', message: 'Paused. Scans show “currently unavailable”.' }
          : { kind: 'live' }

  const canChangeType = !rec || (rec.type !== 'wifi' && type !== 'wifi')

  const contentFields = (() => {
    switch (type) {
      case 'landing_page':
        return (
          <div className="grid gap-6">
            <LandingHeaderFields
              value={destination}
              onChange={setDestination}
              errors={shownErrors}
              files={files}
              businessId={businessId}
              onFileAdded={(f) => addFiles([f])}
              canShowBusiness={!isWorkspace}
            />
            <div className="grid gap-3">
              <div>
                <h3 className="font-semibold">Items on the page</h3>
                <p className="text-sm text-muted">Add as many as you like. Use the arrows to change the order. Items appear once they are complete.</p>
              </div>
              <BlockEditor
                blocks={blocks}
                onChange={setBlocks}
                errors={Object.fromEntries(
                  blocks.map((b) => {
                    const e = validateBlock(b)
                    // Only complain about fields that have something in them.
                    return [b.key, Object.fromEntries(Object.entries(e).filter(([k]) => String(b.data[k] ?? '').trim() !== ''))]
                  }),
                )}
                files={[...files.values()]}
                businessId={businessId}
                onFilesAdded={addFiles}
              />
            </div>
          </div>
        )
      case 'text':
        return (
          <div className="grid gap-4">
            <Field label="Title" hint="Optional">
              {(p) => <Input {...p} maxLength={160} value={String(destination.title ?? '')} onChange={(e) => setDestination({ ...destination, title: e.target.value })} />}
            </Field>
            <Field label="Text" required error={shownErrors.text}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={7}
                  maxLength={4000}
                  placeholder="Type or paste the text people will see"
                  value={String(destination.text ?? '')}
                  onChange={(e) => setDestination({ ...destination, text: e.target.value })}
                />
              )}
            </Field>
          </div>
        )
      case 'document':
        return (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {file ? (
                <span className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-line">
                  <FileText className="size-4 text-muted" />
                  <span className="font-medium">{file.title}</span>
                  <span className="text-muted">{formatBytes(file.size_bytes)}</span>
                </span>
              ) : null}
              <UploadButton
                businessId={businessId}
                kind="document"
                variant={file ? 'secondary' : 'primary'}
                label={file ? 'Upload a new PDF' : 'Upload PDF'}
                onUploaded={(f) => {
                  addFiles([f])
                  setFileId(f.id)
                }}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => setPdfPicker(true)}>
                Choose from my files
              </Button>
            </div>
            <Field label="When scanned">
              {(p) => (
                <Select {...p} value={String(destination.open_mode ?? 'page')} onChange={(e) => setDestination({ ...destination, open_mode: e.target.value })}>
                  <option value="page">Show a page with Open and Download buttons</option>
                  <option value="direct">Open the PDF directly</option>
                </Select>
              )}
            </Field>
            <FilePickerDialog
              open={pdfPicker}
              onOpenChange={setPdfPicker}
              businessId={businessId}
              kind="document"
              selected={fileId ? [fileId] : []}
              onSelect={([f]) => {
                if (f) {
                  addFiles([f])
                  setFileId(f.id)
                }
              }}
            />
          </div>
        )
      case 'business_profile':
        return (
          <div className="grid gap-4">
            {!rec && (
              <Field label="Business" required>
                {(p) => (
                  <Select
                    {...p}
                    value={isWorkspace ? '' : (businessId ?? '')}
                    onChange={(e) => {
                      setBusinessId(e.target.value || null)
                      setIsWorkspace(false)
                      if (e.target.value) void loadFiles(e.target.value)
                    }}
                  >
                    <option value="">Choose a business</option>
                    {businesses.data?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {!businesses.data?.length && (
              <Notice tone="info">
                No businesses yet. Add one under{' '}
                <Link to="/admin/businesses/new" className="font-semibold text-signal hover:underline">
                  Advanced → Businesses
                </Link>
                .
              </Notice>
            )}
            {!isWorkspace && businessId && (
              <DestinationFields type={type} value={destination} onChange={setDestination} errors={{}} businessId={businessId} fileId={null} onFileChange={() => {}} />
            )}
          </div>
        )
      default:
        return (
          <DestinationFields
            type={type}
            value={destination}
            onChange={setDestination}
            errors={shownErrors}
            businessId={businessId}
            fileId={fileId}
            file={file}
            onFileChange={(f) => {
              if (f) addFiles([f])
              setFileId(f?.id ?? null)
            }}
          />
        )
    }
  })()

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> My QR codes
        </Link>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-signal-soft text-signal [&_svg]:size-5">{typeIcon(type)}</span>
        <div className="min-w-0 flex-1">
          <input
            aria-label="QR code name"
            value={nameTouched ? name : finalName}
            placeholder={finalName}
            maxLength={120}
            onChange={(e) => {
              setName(e.target.value)
              setNameTouched(true)
            }}
            onBlur={() => {
              if (!name.trim()) setNameTouched(false)
            }}
            className="w-full rounded-md bg-transparent px-1 py-0.5 text-2xl font-bold tracking-[-0.02em] outline-none ring-signal/40 hover:bg-white focus:bg-white focus:ring-2"
          />
          <p className="px-1 text-sm text-muted">
            {TYPE_LABEL[type]}
            {!isWorkspace && businessName ? ` · ${businessName}` : ''}
            {rec ? ' · changes save automatically' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canChangeType && (
            <Button variant="secondary" size="sm" onClick={() => setChangingType((v) => !v)}>
              <ArrowLeftRight /> Change type
            </Button>
          )}
          {rec && (
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
                      const copy = await duplicateQr(rec)
                      toast.success('Copied. The copy has its own new QR code.')
                      navigate(`/admin/qr/${copy.id}`)
                    } catch (e) {
                      toast.error(friendlyError(e))
                    }
                  }}
                >
                  <CopyPlus /> Duplicate
                </MenuItem>
                {rec.status === 'active' ? (
                  <MenuItem disabled={busy} onSelect={() => lifecycle({ status: 'inactive' }, 'Paused. Scans now show “currently unavailable”.')}>
                    <Pause /> Pause
                  </MenuItem>
                ) : (
                  <MenuItem disabled={busy} onSelect={() => lifecycle({ status: 'active' }, 'Live again')}>
                    <Play /> Resume
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem destructive onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete
                </MenuItem>
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>

      {changingType && (
        <div className="mb-6 rounded-2xl border border-signal/30 bg-signal-soft/40 p-4">
          <p className="mb-3 text-sm font-medium">
            Pick a new type. {rec ? 'The printed code stays the same and will open the new content.' : ''}
          </p>
          <TypePicker onPick={pickType} current={type} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-5">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-[0.95rem] font-semibold">{type === 'landing_page' ? 'Your page' : 'Content'}</h2>
            <p className="mb-4 text-sm text-muted">{info.description}</p>
            {contentFields}
          </section>

          <Section icon={<Palette />} title="Customize the QR design" defaultOpen={false}>
            <DesignPanel design={design} onChange={setDesign} hasLogo={Boolean(logoFile)} />
            {!logoFile && (
              <p className="mt-3 text-xs text-muted">
                {type === 'landing_page' ? 'Add a profile image to the page to put it in the middle of the code.' : 'Logos in the code are available for multi-link pages with a profile image.'}
              </p>
            )}
          </Section>

          <Section icon={<Settings2 />} title="Details" defaultOpen={false}>
            <div className="grid gap-4">
              <Field label="Private note" hint="Only you see this, e.g. where the code is printed.">
                {(p) => <Textarea {...p} rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />}
              </Field>
              {rec && (
                <p className="text-xs text-muted">
                  Permanent code: <code className="rounded bg-surface px-1.5 py-0.5">{rec.public_code}</code>. The printed QR always points here, so you can change
                  everything else at any time.
                </p>
              )}
            </div>
          </Section>

          {rec && !isStatic && (
            <Section icon={<BarChart3 />} title="Scans" defaultOpen={false}>
              <QrScansPanel qrCodeId={rec.id} totalScans={scanCount} isStatic={false} />
            </Section>
          )}
        </div>

        <aside className="order-first grid content-start gap-3 lg:sticky lg:top-24 lg:order-none lg:self-start">
          <div role="tablist" aria-label="Preview" className="grid grid-cols-2 rounded-xl bg-white p-1 ring-1 ring-line">
            {(['qr', 'phone'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn('rounded-lg py-1.5 text-sm font-semibold transition-colors', view === v ? 'bg-signal text-white' : 'text-muted hover:text-ink')}
              >
                {v === 'qr' ? 'QR code' : 'Phone preview'}
              </button>
            ))}
          </div>
          {view === 'qr' ? (
            wifiIncomplete ? (
              <div className="rounded-2xl border border-line bg-white p-6 text-center text-sm text-muted">
                Enter the network name and password. Wi-Fi codes contain the details themselves, so the code appears once they are filled in.
              </div>
            ) : (
              <StudioQrCard
                content={content}
                design={design}
                name={finalName}
                publicUrl={isStatic ? undefined : publicUrl}
                isStatic={isStatic}
                state={liveState}
                logoUrl={logoFile ? storagePublicUrl(logoFile.storage_path, logoFile.version) : undefined}
              />
            )
          ) : (
            <PhonePreview type={type} destination={parsed?.ok ? parsed.value : normalized} valid={Boolean(parsed?.ok)} blocks={blocks} files={files} fileId={fileId} />
          )}
          {saveError && (
            <Button variant="secondary" size="sm" onClick={() => void flush()}>
              Try saving again
            </Button>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        loading={busy}
        destructive
        title="Delete this QR code?"
        description={
          <>
            <p>Printed copies will stop working and show “not recognised”. This cannot be undone.</p>
            <p className="mt-2">To stop it only for a while, use Pause instead.</p>
          </>
        }
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!rec) return
          setBusy(true)
          try {
            pendingRef.current = false
            await deleteQr(rec.id)
            recRef.current = null
            toast.success('QR code deleted')
            navigate('/admin', { replace: true })
          } catch (e) {
            toast.error(friendlyError(e))
          } finally {
            setBusy(false)
            setConfirmDelete(false)
          }
        }}
      />
    </div>
  )
}

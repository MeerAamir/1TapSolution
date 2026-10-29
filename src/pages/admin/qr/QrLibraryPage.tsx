import { Archive, ArchiveRestore, Building2, CalendarClock, CalendarPlus, Copy, FolderInput, LayoutGrid, Rows3, CopyPlus, Download, ExternalLink, MoreHorizontal, Pause, Play, Plus, Printer, QrCode, Share2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { BusinessSelect } from '@/components/admin/BusinessSelect'
import { UsageWarning } from '@/components/admin/UsagePanel'
import { QrSvg } from '@/components/qr/QrSvg'
import { Button } from '@/components/ui/button'
import { Pagination, SearchInput } from '@/components/ui/data'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Select } from '@/components/ui/form'
import { ConfirmDialog, Dialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/overlay'
import { qrPublicUrl, storagePublicUrl } from '@/config'
import { deleteQr, duplicateQr, getFile, listBusinessOptions, listQrCodes, moveQr, updateQr, workspaceBusinessId, type LifecycleFilter } from '@/lib/admin-api'
import { parseDesign } from '@/lib/qr/design'
import { encodedContent, isStaticQr } from '@/lib/qr/destinations'
import { expiryInfo, expiryLabel, extendExpiry } from '@/lib/qr/expiry'
import { downloadPng, imageUrlToDataUrl, printQr, safeFilename, shareQr } from '@/lib/qr/export'
import { friendlyError } from '@/lib/supabase'
import type { QrOverview } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { cn, formatNumber, relativeTime } from '@/lib/utils'
import { TYPE_LABEL, TYPE_TILES, typeColor, typeIcon } from './studio/typeTiles'

const PAGE_SIZE = 24

const logoCache = new Map<string, Promise<string | undefined>>()
/** The centre logo of a code as a data URL, so thumbnails and downloads match the studio. */
function useLogoDataUrl(fileId: string | undefined, enabled: boolean): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!enabled || !fileId) {
      setUrl(undefined)
      return
    }
    let active = true
    let p = logoCache.get(fileId)
    if (!p) {
      p = getFile(fileId).then((f) => (f ? imageUrlToDataUrl(storagePublicUrl(f.storage_path, f.version)) : undefined)).catch(() => undefined)
      logoCache.set(fileId, p)
    }
    p.then((u) => active && setUrl(u))
    return () => {
      active = false
    }
  }, [fileId, enabled])
  return url
}

function QrCard({ q, onChanged, onDelete, onMove }: { q: QrOverview; onChanged: () => void; onDelete: (q: QrOverview) => void; onMove: (q: QrOverview) => void }) {
  const navigate = useNavigate()
  const url = qrPublicUrl(q.public_code)
  const design = parseDesign(q.design)
  const content = encodedContent(q.type, q.destination, url)
  const isStatic = isStaticQr(q.type, q.destination)
  const expiry = isStatic ? ({ kind: 'none' } as const) : expiryInfo(q.expires_at)
  const paused = q.status !== 'active' || q.archived_at || expiry.kind === 'expired'
  const logoDataUrl = useLogoDataUrl(design.logoFileId, design.logo)
  const opts = { logoDataUrl, businessName: q.type === 'business_profile' && q.business_name ? q.business_name : q.name }

  async function act(fn: () => Promise<unknown>, message: string) {
    try {
      await fn()
      toast.success(message)
      onChanged()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <li className="group grid grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition-shadow hover:shadow-raise sm:flex sm:flex-col">
      <Link to={`/admin/qr/${q.id}`} className="relative block bg-surface p-3 sm:p-5" aria-label={`Edit ${q.name}`}>
        <div className={cn('mx-auto w-full sm:w-36', paused && 'opacity-40')}>
          <QrSvg text={content} design={design} logoDataUrl={logoDataUrl} businessName={opts.businessName} label="" />
        </div>
        {paused ? (
          <span
            className={cn(
              'absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-xs font-semibold sm:left-3 sm:top-3',
              expiry.kind === 'expired' && !q.archived_at ? 'bg-danger/10 text-danger' : 'bg-warning-soft text-warning',
            )}
          >
            {q.archived_at ? 'Archived' : expiry.kind === 'expired' ? 'Expired' : 'Paused'}
          </span>
        ) : expiry.kind === 'active' && expiry.daysLeft <= 30 ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 sm:left-3 sm:top-3">
            {expiryLabel(expiry)}
          </span>
        ) : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3 sm:gap-3 sm:p-4">
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg [&_svg]:size-3.5"
            style={{ backgroundColor: `${typeColor(q.type)}16`, color: typeColor(q.type) }}
          >
            {typeIcon(q.type)}
          </span>
          <div className="min-w-0 flex-1">
            <Link to={`/admin/qr/${q.id}`} className="block truncate font-semibold hover:text-signal">
              {q.name}
            </Link>
            <p className="truncate text-xs text-muted">
              {TYPE_LABEL[q.type]}
              {q.business_name ? ` · ${q.business_name}` : ''}
              {!isStatic && ` · ${formatNumber(q.scan_count)} scans`}
            </p>
            {expiry.kind !== 'none' && (
              <p className={cn('mt-0.5 flex items-center gap-1 text-xs', expiry.kind === 'expired' ? 'font-medium text-danger' : 'text-muted')}>
                <CalendarClock className="size-3" />
                {expiry.kind === 'expired' ? `Expired ${expiry.date}` : `Valid until ${expiry.date}`}
              </p>
            )}
          </div>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`More actions for ${q.name}`}>
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {!isStatic && (
                <>
                  <MenuItem onSelect={() => window.open(`${url}?preview=1`, '_blank', 'noopener')}>
                    <ExternalLink /> Open
                  </MenuItem>
                  <MenuItem
                    onSelect={async () => {
                      await navigator.clipboard.writeText(url)
                      toast.success('Link copied')
                    }}
                  >
                    <Copy /> Copy link
                  </MenuItem>
                </>
              )}
              {!isStatic && (
                <>
                  <MenuSeparator />
                  {(
                    [
                      ['1 month', 1],
                      ['3 months', 3],
                      ['1 year', 12],
                    ] as const
                  ).map(([label, months]) => (
                    <MenuItem
                      key={label}
                      onSelect={() => {
                        const until = extendExpiry(q.expires_at, { label, months })
                        void act(() => updateQr(q.id, { expires_at: until }), `${expiry.kind === 'expired' ? 'Unlocked' : 'Valid'} until ${expiryInfo(until).kind === 'active' ? (expiryInfo(until) as { date: string }).date : ''}`)
                      }}
                    >
                      <CalendarPlus /> {expiry.kind === 'expired' ? 'Unlock' : expiry.kind === 'none' ? 'Valid for' : 'Add'} {label}
                    </MenuItem>
                  ))}
                  {q.expires_at && (
                    <MenuItem onSelect={() => act(() => updateQr(q.id, { expires_at: null }), 'No end date')}>
                      <CalendarClock /> Remove end date
                    </MenuItem>
                  )}
                  <MenuSeparator />
                </>
              )}
              {q.type !== 'business_profile' && (
                <MenuItem onSelect={() => onMove(q)}>
                  <FolderInput /> Move to business…
                </MenuItem>
              )}
              <MenuItem
                onSelect={async () => {
                  try {
                    const copy = await duplicateQr(q)
                    navigate(`/admin/qr/${copy.id}`)
                  } catch (e) {
                    toast.error(friendlyError(e))
                  }
                }}
              >
                <CopyPlus /> Duplicate
              </MenuItem>
              {!q.archived_at &&
                (q.status === 'active' ? (
                  <MenuItem onSelect={() => act(() => updateQr(q.id, { status: 'inactive' }), 'Paused')}>
                    <Pause /> Pause
                  </MenuItem>
                ) : (
                  <MenuItem onSelect={() => act(() => updateQr(q.id, { status: 'active' }), 'Live again')}>
                    <Play /> Resume
                  </MenuItem>
                ))}
              {q.archived_at ? (
                <MenuItem onSelect={() => act(() => updateQr(q.id, { archived_at: null }), 'Restored')}>
                  <ArchiveRestore /> Restore
                </MenuItem>
              ) : (
                <MenuItem onSelect={() => act(() => updateQr(q.id, { archived_at: new Date().toISOString() }), 'Archived')}>
                  <Archive /> Archive
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem destructive onSelect={() => onDelete(q)}>
                <Trash2 /> Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
        <div className="mt-auto grid grid-cols-4 gap-1.5">
          <Button asChild size="sm" className="col-span-1 px-0">
            <Link to={`/admin/qr/${q.id}`}>Edit</Link>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="px-0"
            aria-label="Download PNG"
            title="Download PNG"
            onClick={() => downloadPng(content, design, opts, safeFilename(q.name), 2048).catch((e) => toast.error((e as Error).message))}
          >
            <Download />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="px-0"
            aria-label="Share"
            title="Share"
            onClick={async () => {
              const r = await shareQr(content, design, opts, q.name, isStatic ? undefined : url)
              if (r === 'copied') toast.success('Link copied')
            }}
          >
            <Share2 />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="px-0"
            aria-label="Print"
            title="Print"
            onClick={() => {
              try {
                printQr(content, design, opts, q.name)
              } catch (e) {
                toast.error((e as Error).message)
              }
            }}
          >
            <Printer />
          </Button>
        </div>
        <p className="text-[0.7rem] text-muted">Updated {relativeTime(q.updated_at)}</p>
      </div>
    </li>
  )
}

type View = 'grid' | 'business'

function readView(): View {
  try {
    return localStorage.getItem('qr-library-view') === 'business' ? 'business' : 'grid'
  } catch {
    return 'grid'
  }
}

function MoveDialog({ q, onClose, onMoved }: { q: QrOverview | null; onClose: () => void; onMoved: () => void }) {
  const businesses = useQuery(listBusinessOptions, [])
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (q) setTarget(q.business_is_workspace ? null : q.business_id)
  }, [q])
  return (
    <Dialog
      open={Boolean(q)}
      onOpenChange={(v) => !v && onClose()}
      title={`Move “${q?.name ?? ''}”`}
      description="Group this code under a business. The printed code keeps working exactly as before."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!q || (q.business_is_workspace ? target === null : target === q.business_id)}
            onClick={async () => {
              if (!q) return
              setBusy(true)
              try {
                await moveQr(q.id, target)
                toast.success(target ? `Moved to ${businesses.data?.find((b) => b.id === target)?.name ?? 'the business'}` : 'Moved to No business')
                onMoved()
                onClose()
              } catch (e) {
                toast.error(friendlyError(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            Move
          </Button>
        </>
      }
    >
      <BusinessSelect value={target} onChange={setTarget} businesses={businesses.data ?? []} onCreated={() => businesses.reload()} />
    </Dialog>
  )
}

export default function QrLibraryPage() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>('live')
  const [business, setBusiness] = useState('') // '' all, 'none', or a business id
  const [view, setViewState] = useState<View>(readView)
  const [page, setPage] = useState(0)
  const [toDelete, setToDelete] = useState<QrOverview | null>(null)
  const [toMove, setToMove] = useState<QrOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const businesses = useQuery(listBusinessOptions, [])

  const setView = (v: View) => {
    setViewState(v)
    setPage(0)
    try {
      localStorage.setItem('qr-library-view', v)
    } catch {
      // only a convenience
    }
  }

  const list = useQuery(async () => {
    const businessId = business === 'none' ? await workspaceBusinessId() : business
    const grouped = view === 'business'
    return listQrCodes({
      search,
      businessId,
      type,
      lifecycle,
      sort: grouped ? 'name' : 'updated_at',
      ascending: grouped,
      page: grouped ? 0 : page,
      pageSize: grouped ? 1000 : PAGE_SIZE,
    })
  }, [search, type, lifecycle, page, business, view])
  const onSearch = useCallback((v: string) => {
    setSearch(v)
    setPage(0)
  }, [])
  const filtered = Boolean(search || type || business || lifecycle !== 'live')

  const groups = useMemo(() => {
    if (view !== 'business' || !list.data) return []
    const map = new Map<string, { key: string; name: string; businessId: string | null; rows: QrOverview[] }>()
    for (const q of list.data.rows) {
      const key = q.business_is_workspace ? '' : q.business_id
      const g = map.get(key) ?? { key, name: q.business_is_workspace ? 'No business' : (q.business_name ?? 'Business'), businessId: q.business_is_workspace ? null : q.business_id, rows: [] }
      g.rows.push(q)
      map.set(key, g)
    }
    // Businesses A–Z, codes without a business last.
    return [...map.values()].sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.name.localeCompare(b.name)))
  }, [list.data, view])

  const grid = (rows: QrOverview[]) => (
    <ul className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', list.loading && 'opacity-60')}>
      {rows.map((q) => (
        <QrCard key={q.id} q={q} onChanged={list.reload} onDelete={setToDelete} onMove={setToMove} />
      ))}
    </ul>
  )

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em]">My QR codes</h1>
          <p className="mt-1 text-muted">Edit any code at any time. Printed codes keep working and show the new content.</p>
        </div>
        <Button asChild size="lg">
          <Link to={business && business !== 'none' ? `/admin/qr/new?business=${business}` : '/admin/qr/new'}>
            <Plus /> Create QR code
          </Link>
        </Button>
      </div>

      <UsageWarning />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={onSearch} placeholder="Search by name, business or code" className="min-w-56 flex-1" />
        <Select aria-label="Business" value={business} onChange={(e) => { setBusiness(e.target.value); setPage(0) }} className="w-auto min-w-44">
          <option value="">All businesses</option>
          <option value="none">No business</option>
          {businesses.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(0) }} className="w-auto min-w-40">
          <option value="">All types</option>
          {TYPE_TILES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={lifecycle} onChange={(e) => { setLifecycle(e.target.value as LifecycleFilter); setPage(0) }} className="w-auto min-w-36">
          <option value="live">Live and paused</option>
          <option value="active">Live</option>
          <option value="inactive">Paused</option>
          <option value="expiring">Ending within 30 days</option>
          <option value="expired">Expired</option>
          <option value="archived">Archived</option>
          <option value="all">Everything</option>
        </Select>
        <div role="radiogroup" aria-label="Layout" className="flex rounded-xl bg-white p-1 ring-1 ring-line">
          {(
            [
              ['grid', 'All codes', <LayoutGrid key="g" />],
              ['business', 'By business', <Rows3 key="b" />],
            ] as const
          ).map(([v, label, icon]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium [&_svg]:size-4', view === v ? 'bg-signal text-white' : 'text-muted hover:text-ink')}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : !list.data?.rows.length ? (
        filtered ? (
          <EmptyState title="Nothing matches" description="Try a different search or clear the filters." />
        ) : (
          <div className="rounded-2xl border border-dashed border-line-strong bg-white">
            <EmptyState
              icon={<QrCode />}
              title="Create your first QR code"
              description="Pick a type, paste your link or add your content. The code is ready to scan straight away."
              action={
                <Button asChild size="lg">
                  <Link to="/admin/qr/new">
                    <Plus /> Create QR code
                  </Link>
                </Button>
              }
            />
          </div>
        )
      ) : view === 'business' ? (
        <div className="grid gap-8">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.name}>
              <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-line pb-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-signal-soft text-signal">
                  <Building2 className="size-4" />
                </span>
                <h2 className="text-lg font-semibold">{g.name}</h2>
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted ring-1 ring-line">
                  {g.rows.length} {g.rows.length === 1 ? 'code' : 'codes'}
                </span>
                <Button asChild variant="ghost" size="sm" className="ml-auto">
                  <Link to={g.businessId ? `/admin/qr/new?business=${g.businessId}` : '/admin/qr/new'}>
                    <Plus /> Add a code
                  </Link>
                </Button>
              </div>
              {grid(g.rows)}
            </section>
          ))}
        </div>
      ) : (
        <>
          {grid(list.data.rows)}
          {list.data.total > PAGE_SIZE && (
            <div className="mt-4 rounded-xl bg-white ring-1 ring-line">
              <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

      <MoveDialog q={toMove} onClose={() => setToMove(null)} onMoved={list.reload} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(v) => !v && setToDelete(null)}
        loading={busy}
        destructive
        title={`Delete “${toDelete?.name}”?`}
        description={<p>Printed copies will stop working and show “not recognised”. This cannot be undone. Use Pause to stop it for a while.</p>}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!toDelete) return
          setBusy(true)
          try {
            await deleteQr(toDelete.id)
            toast.success('Deleted')
            list.reload()
          } catch (e) {
            toast.error(friendlyError(e))
          } finally {
            setBusy(false)
            setToDelete(null)
          }
        }}
      />
    </div>
  )
}

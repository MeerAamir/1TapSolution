import { Archive, ArchiveRestore, Copy, CopyPlus, Download, ExternalLink, MoreHorizontal, Pause, Play, Plus, Printer, QrCode, Share2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { UsageWarning } from '@/components/admin/UsagePanel'
import { QrSvg } from '@/components/qr/QrSvg'
import { Button } from '@/components/ui/button'
import { Pagination, SearchInput } from '@/components/ui/data'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Select } from '@/components/ui/form'
import { ConfirmDialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/overlay'
import { qrPublicUrl, storagePublicUrl } from '@/config'
import { deleteQr, duplicateQr, getFile, listQrCodes, updateQr, type LifecycleFilter } from '@/lib/admin-api'
import { parseDesign } from '@/lib/qr/design'
import { encodedContent } from '@/lib/qr/destinations'
import { downloadPng, imageUrlToDataUrl, printQr, safeFilename, shareQr } from '@/lib/qr/export'
import { friendlyError } from '@/lib/supabase'
import type { QrOverview } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { cn, formatNumber, relativeTime } from '@/lib/utils'
import { TYPE_LABEL, TYPE_TILES, typeIcon } from './studio/typeTiles'

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

function QrCard({ q, onChanged, onDelete }: { q: QrOverview; onChanged: () => void; onDelete: (q: QrOverview) => void }) {
  const navigate = useNavigate()
  const url = qrPublicUrl(q.public_code)
  const design = parseDesign(q.design)
  const content = encodedContent(q.type, q.destination, url)
  const isStatic = q.type === 'wifi'
  const paused = q.status !== 'active' || q.archived_at
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
        {paused && (
          <span className="absolute left-1.5 top-1.5 rounded-full sm:left-3 sm:top-3 bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
            {q.archived_at ? 'Archived' : 'Paused'}
          </span>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3 sm:gap-3 sm:p-4">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-signal-soft text-signal [&_svg]:size-3.5">{typeIcon(q.type)}</span>
          <div className="min-w-0 flex-1">
            <Link to={`/admin/qr/${q.id}`} className="block truncate font-semibold hover:text-signal">
              {q.name}
            </Link>
            <p className="truncate text-xs text-muted">
              {TYPE_LABEL[q.type]}
              {q.business_name ? ` · ${q.business_name}` : ''}
              {!isStatic && ` · ${formatNumber(q.scan_count)} scans`}
            </p>
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

export default function QrLibraryPage() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>('live')
  const [page, setPage] = useState(0)
  const [toDelete, setToDelete] = useState<QrOverview | null>(null)
  const [busy, setBusy] = useState(false)

  const list = useQuery(
    () => listQrCodes({ search, businessId: '', type, lifecycle, sort: 'updated_at', ascending: false, page, pageSize: PAGE_SIZE }),
    [search, type, lifecycle, page],
  )
  const onSearch = useCallback((v: string) => {
    setSearch(v)
    setPage(0)
  }, [])
  const filtered = Boolean(search || type || lifecycle !== 'live')

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em]">My QR codes</h1>
          <p className="mt-1 text-muted">Edit any code at any time. Printed codes keep working and show the new content.</p>
        </div>
        <Button asChild size="lg">
          <Link to="/admin/qr/new">
            <Plus /> Create QR code
          </Link>
        </Button>
      </div>

      <UsageWarning />

      <div className="mb-5 flex flex-wrap gap-3">
        <SearchInput value={search} onChange={onSearch} placeholder="Search by name or code" className="min-w-56 flex-1" />
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
          <option value="archived">Archived</option>
          <option value="all">Everything</option>
        </Select>
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
      ) : (
        <>
          <ul className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', list.loading && 'opacity-60')}>
            {list.data.rows.map((q) => (
              <QrCard key={q.id} q={q} onChanged={list.reload} onDelete={setToDelete} />
            ))}
          </ul>
          {list.data.total > PAGE_SIZE && (
            <div className="mt-4 rounded-xl bg-white ring-1 ring-line">
              <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

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

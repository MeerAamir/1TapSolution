import { Archive, ArchiveRestore, Copy, CopyPlus, ExternalLink, MoreHorizontal, Pencil, Plus, Power, QrCode, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { QrSvg } from '@/components/qr/QrSvg'
import { Button } from '@/components/ui/button'
import { Card, PageHeader, Pagination, SearchInput, StatusBadge, Table, Td, Th } from '@/components/ui/data'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback'
import { Select } from '@/components/ui/form'
import { ConfirmDialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/overlay'
import { qrPublicUrl } from '@/config'
import { deleteQr, duplicateQr, listBusinessOptions, listQrCodes, updateQr, type LifecycleFilter, type QrListParams } from '@/lib/admin-api'
import { DEFAULT_DESIGN } from '@/lib/qr/design'
import { encodedContent } from '@/lib/qr/destinations'
import { QR_TYPE_INFO, QR_TYPES } from '@/lib/qr/types'
import { friendlyError } from '@/lib/supabase'
import type { QrOverview } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { formatNumber, relativeTime } from '@/lib/utils'

const PAGE_SIZE = 20
const SORTS: Array<{ value: string; label: string; sort: QrListParams['sort']; asc: boolean }> = [
  { value: 'created-desc', label: 'Newest first', sort: 'created_at', asc: false },
  { value: 'name-asc', label: 'Name, A–Z', sort: 'name', asc: true },
  { value: 'scans-desc', label: 'Most scanned', sort: 'scan_count', asc: false },
  { value: 'updated-desc', label: 'Recently updated', sort: 'updated_at', asc: false },
]

export default function QrListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [businessId, setBusinessId] = useState('')
  const [type, setType] = useState('')
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>('live')
  const [sortKey, setSortKey] = useState('created-desc')
  const [page, setPage] = useState(0)
  const [pending, setPending] = useState<{ kind: 'delete' | 'archive'; qr: QrOverview } | null>(null)
  const [busy, setBusy] = useState(false)
  const sort = SORTS.find((s) => s.value === sortKey)!

  const businesses = useQuery(listBusinessOptions, [])
  const list = useQuery(
    () => listQrCodes({ search, businessId, type, lifecycle, sort: sort.sort, ascending: sort.asc, page, pageSize: PAGE_SIZE }),
    [search, businessId, type, lifecycle, sortKey, page],
  )
  const onSearch = useCallback((v: string) => {
    setSearch(v)
    setPage(0)
  }, [])

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(message)
      list.reload()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  const filtered = Boolean(search || businessId || type || lifecycle !== 'live')

  return (
    <>
      <PageHeader
        title="QR codes"
        description="Every code has a permanent link. Edit a code to change what it opens without reprinting it."
        actions={
          <Button asChild>
            <Link to="/admin/qr/new">
              <Plus /> New QR code
            </Link>
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <SearchInput value={search} onChange={onSearch} placeholder="Search name, business or code" className="min-w-56 flex-1" />
          <Select aria-label="Business" value={businessId} onChange={(e) => { setBusinessId(e.target.value); setPage(0) }} className="w-auto min-w-44">
            <option value="">All businesses</option>
            {businesses.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(0) }} className="w-auto min-w-40">
            <option value="">All types</option>
            {QR_TYPES.map((t) => (
              <option key={t} value={t}>
                {QR_TYPE_INFO[t].label}
              </option>
            ))}
          </Select>
          <Select aria-label="Status" value={lifecycle} onChange={(e) => { setLifecycle(e.target.value as LifecycleFilter); setPage(0) }} className="w-auto min-w-40">
            <option value="live">Active and inactive</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
            <option value="all">All, including archived</option>
          </Select>
          <Select aria-label="Sort" value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        {list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <TableSkeleton cols={5} />
        ) : !list.data?.rows.length ? (
          filtered ? (
            <EmptyState title="No QR codes match" description="Try a different search or clear the filters." />
          ) : (
            <EmptyState
              icon={<QrCode />}
              title="No QR codes yet"
              description="Create a code for a business profile, a menu PDF, a location or anything else."
              action={
                <Button asChild>
                  <Link to="/admin/qr/new">
                    <Plus /> New QR code
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th className="w-16">
                    <span className="sr-only">Code</span>
                  </Th>
                  <Th>Name</Th>
                  <Th className="hidden md:table-cell">Business</Th>
                  <Th className="hidden lg:table-cell">Type</Th>
                  <Th>Status</Th>
                  <Th className="hidden text-right sm:table-cell">Scans</Th>
                  <Th className="hidden xl:table-cell">Last scan</Th>
                  <Th className="w-12">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody className={list.loading ? 'opacity-60' : undefined}>
                {list.data.rows.map((q) => {
                  const url = qrPublicUrl(q.public_code)
                  return (
                    <tr key={q.id} className="hover:bg-surface/60">
                      <Td>
                        <Link to={`/admin/qr/${q.id}`} aria-label={`Open ${q.name}`} className="block w-11 rounded bg-white p-0.5 ring-1 ring-line">
                          <QrSvg text={encodedContent(q.type, q.destination, url)} design={DEFAULT_DESIGN} label="" />
                        </Link>
                      </Td>
                      <Td>
                        <Link to={`/admin/qr/${q.id}`} className="font-semibold hover:text-signal">
                          {q.name}
                        </Link>
                        <span className="block text-xs text-muted">{q.type === 'wifi' ? 'Static Wi-Fi code' : `/q/${q.public_code}`}</span>
                      </Td>
                      <Td className="hidden md:table-cell">
                        <Link to={`/admin/businesses/${q.business_id}`} className="text-muted hover:text-signal">
                          {q.business_name}
                        </Link>
                      </Td>
                      <Td className="hidden text-muted lg:table-cell">{QR_TYPE_INFO[q.type].label}</Td>
                      <Td>
                        <StatusBadge status={q.status} archivedAt={q.archived_at} />
                      </Td>
                      <Td className="hidden text-right tabular sm:table-cell">{q.type === 'wifi' ? '—' : formatNumber(q.scan_count)}</Td>
                      <Td className="hidden text-muted xl:table-cell">{q.type === 'wifi' ? '—' : relativeTime(q.last_scan_at)}</Td>
                      <Td>
                        <Menu>
                          <MenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${q.name}`}>
                              <MoreHorizontal />
                            </Button>
                          </MenuTrigger>
                          <MenuContent>
                            <MenuItem onSelect={() => navigate(`/admin/qr/${q.id}`)}>
                              <Pencil /> Edit and download
                            </MenuItem>
                            {q.type !== 'wifi' && (
                              <>
                                <MenuItem onSelect={() => window.open(`${url}?preview=1`, '_blank', 'noopener')}>
                                  <ExternalLink /> Test link
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
                            <MenuItem onSelect={() => run(() => duplicateQr(q), 'Duplicated with a new permanent link')}>
                              <CopyPlus /> Duplicate
                            </MenuItem>
                            {!q.archived_at && (
                              <MenuItem
                                disabled={busy}
                                onSelect={() =>
                                  run(
                                    () => updateQr(q.id, { status: q.status === 'active' ? 'inactive' : 'active' }),
                                    q.status === 'active' ? 'QR code deactivated' : 'QR code reactivated',
                                  )
                                }
                              >
                                <Power /> {q.status === 'active' ? 'Deactivate' : 'Reactivate'}
                              </MenuItem>
                            )}
                            {q.archived_at ? (
                              <MenuItem onSelect={() => run(() => updateQr(q.id, { archived_at: null }), 'QR code restored')}>
                                <ArchiveRestore /> Restore
                              </MenuItem>
                            ) : (
                              <MenuItem onSelect={() => setPending({ kind: 'archive', qr: q })}>
                                <Archive /> Archive
                              </MenuItem>
                            )}
                            <MenuSeparator />
                            <MenuItem destructive onSelect={() => setPending({ kind: 'delete', qr: q })}>
                              <Trash2 /> Delete
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={pending?.kind === 'archive'}
        onOpenChange={(v) => !v && setPending(null)}
        loading={busy}
        title={`Archive “${pending?.qr.name}”?`}
        description={<p>Scans will show “currently unavailable” until you restore it. Nothing is deleted.</p>}
        confirmLabel="Archive"
        onConfirm={() => run(() => updateQr(pending!.qr.id, { archived_at: new Date().toISOString() }), 'QR code archived')}
      />
      <ConfirmDialog
        open={pending?.kind === 'delete'}
        onOpenChange={(v) => !v && setPending(null)}
        loading={busy}
        destructive
        title={`Delete “${pending?.qr.name}” permanently?`}
        description={<p>Printed copies will show “not recognised”. This cannot be undone. Archive it instead if you might need it again.</p>}
        confirmLabel="Delete permanently"
        requireText="DELETE"
        onConfirm={() => run(() => deleteQr(pending!.qr.id), 'QR code deleted')}
      />
    </>
  )
}

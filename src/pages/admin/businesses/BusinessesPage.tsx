import { Archive, ArchiveRestore, Building2, ExternalLink, MoreHorizontal, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge, Card, PageHeader, Pagination, SearchInput, StatusBadge, Table, Td, Th } from '@/components/ui/data'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback'
import { Select } from '@/components/ui/form'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/overlay'
import { businessPublicUrl } from '@/config'
import { listBusinesses, listCategories, type BusinessListParams, type LifecycleFilter } from '@/lib/admin-api'
import { useQuery } from '@/lib/use-query'
import { formatNumber, relativeTime } from '@/lib/utils'
import { useBusinessActions } from './useBusinessActions'

const PAGE_SIZE = 20

const SORTS: Array<{ value: string; label: string; sort: BusinessListParams['sort']; asc: boolean }> = [
  { value: 'name-asc', label: 'Name, A–Z', sort: 'name', asc: true },
  { value: 'name-desc', label: 'Name, Z–A', sort: 'name', asc: false },
  { value: 'created-desc', label: 'Newest first', sort: 'created_at', asc: false },
  { value: 'created-asc', label: 'Oldest first', sort: 'created_at', asc: true },
  { value: 'scans-desc', label: 'Most scanned', sort: 'scan_count', asc: false },
  { value: 'updated-desc', label: 'Recently updated', sort: 'updated_at', asc: false },
]

export default function BusinessesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>('live')
  const [sortKey, setSortKey] = useState('created-desc')
  const [page, setPage] = useState(0)
  const sort = SORTS.find((s) => s.value === sortKey)!

  const categories = useQuery(listCategories, [])
  const list = useQuery(
    () => listBusinesses({ search, categoryId, lifecycle, sort: sort.sort, ascending: sort.asc, page, pageSize: PAGE_SIZE }),
    [search, categoryId, lifecycle, sortKey, page],
  )
  const { actions, dialog } = useBusinessActions(list.reload)
  const onSearch = useCallback((v: string) => {
    setSearch(v)
    setPage(0)
  }, [])

  const filtered = Boolean(search || categoryId || lifecycle !== 'live')

  return (
    <>
      <PageHeader
        title="Businesses"
        description="Each business has its own page, QR codes, files and statistics."
        actions={
          <Button asChild>
            <Link to="/admin/businesses/new">
              <Plus /> Add business
            </Link>
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <SearchInput value={search} onChange={onSearch} placeholder="Search by name or slug" className="min-w-56 flex-1" />
          <Select
            aria-label="Filter by category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setPage(0)
            }}
            className="w-auto min-w-44"
          >
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by status"
            value={lifecycle}
            onChange={(e) => {
              setLifecycle(e.target.value as LifecycleFilter)
              setPage(0)
            }}
            className="w-auto min-w-40"
          >
            <option value="live">Active and inactive</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
            <option value="all">All, including archived</option>
          </Select>
          <Select aria-label="Sort" value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto min-w-44">
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
        ) : list.data?.rows.length === 0 ? (
          filtered ? (
            <EmptyState title="No businesses match" description="Try a different search or clear the filters." />
          ) : (
            <EmptyState
              icon={<Building2 />}
              title="No businesses yet"
              description="Add a business to create its page and QR codes."
              action={
                <Button asChild>
                  <Link to="/admin/businesses/new">
                    <Plus /> Add business
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
                  <Th>Business</Th>
                  <Th className="hidden md:table-cell">Category</Th>
                  <Th>Status</Th>
                  <Th className="hidden text-right sm:table-cell">QR codes</Th>
                  <Th className="hidden text-right sm:table-cell">Scans</Th>
                  <Th className="hidden lg:table-cell">Updated</Th>
                  <Th className="w-12">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody className={list.loading ? 'opacity-60' : undefined}>
                {list.data?.rows.map((b) => (
                  <tr key={b.id} className="hover:bg-surface/60">
                    <Td>
                      <Link to={`/admin/businesses/${b.id}`} className="group flex items-center gap-3">
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold text-white"
                          style={{ backgroundColor: b.accent_color }}
                          aria-hidden
                        >
                          {b.name.charAt(0)}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 font-semibold group-hover:text-signal">
                            <span className="truncate">{b.name}</span>
                            {b.is_demo && <Badge tone="violet">Demo</Badge>}
                          </span>
                          <span className="block truncate text-xs text-muted">/b/{b.slug}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td className="hidden text-muted md:table-cell">{b.category_name ?? '—'}</Td>
                    <Td>
                      <StatusBadge status={b.status} archivedAt={b.archived_at} />
                    </Td>
                    <Td className="hidden text-right tabular sm:table-cell">{formatNumber(b.qr_count)}</Td>
                    <Td className="hidden text-right tabular sm:table-cell">{formatNumber(b.scan_count)}</Td>
                    <Td className="hidden text-muted lg:table-cell">{relativeTime(b.updated_at)}</Td>
                    <Td>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${b.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem onSelect={() => navigate(`/admin/businesses/${b.id}/edit`)}>
                            <Pencil /> Edit
                          </MenuItem>
                          <MenuItem onSelect={() => window.open(businessPublicUrl(b.slug), '_blank', 'noopener')}>
                            <ExternalLink /> Open public page
                          </MenuItem>
                          {!b.archived_at && (
                            <MenuItem onSelect={() => actions.toggleStatus(b)}>
                              <Power /> {b.status === 'active' ? 'Deactivate' : 'Activate'}
                            </MenuItem>
                          )}
                          {b.archived_at ? (
                            <MenuItem onSelect={() => actions.restore(b)}>
                              <ArchiveRestore /> Restore
                            </MenuItem>
                          ) : (
                            <MenuItem onSelect={() => actions.archive(b)}>
                              <Archive /> Archive
                            </MenuItem>
                          )}
                          <MenuSeparator />
                          <MenuItem destructive onSelect={() => actions.remove(b)}>
                            <Trash2 /> Delete
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </Card>
      {dialog}
    </>
  )
}

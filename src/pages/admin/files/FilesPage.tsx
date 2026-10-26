import { FileText, FolderOpen, ImageIcon, Link2, Lock, MoreHorizontal, Upload } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useFileActions, USAGE_LABEL } from '@/components/admin/FileActions'
import { warnIfLargePdf } from '@/components/admin/uploadNotices'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, PageHeader, Pagination, SearchInput, Table, Td, Th } from '@/components/ui/data'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback'
import { Field, Select } from '@/components/ui/form'
import { Dialog, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/overlay'
import { config, storagePublicUrl } from '@/config'
import { fileUsage, listBusinessOptions, listFiles, type FileListParams } from '@/lib/admin-api'
import { ACCEPT_ATTR, uploadFile } from '@/lib/files'
import { friendlyError } from '@/lib/supabase'
import type { FileBucket, FileOverview } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { formatBytes, relativeTime } from '@/lib/utils'

const PAGE_SIZE = 25

export default function FilesPage() {
  const [search, setSearch] = useState('')
  const [businessId, setBusinessId] = useState('')
  const [kind, setKind] = useState<FileListParams['kind']>('')
  const [visibility, setVisibility] = useState<FileListParams['visibility']>('')
  const [page, setPage] = useState(0)
  const [uploadBusiness, setUploadBusiness] = useState('')
  const [uploadBucket, setUploadBucket] = useState<FileBucket>('public-files')
  const [progress, setProgress] = useState<{ done: number; total: number; pct: number } | null>(null)
  const [usage, setUsage] = useState<{ file: FileOverview; rows: Array<{ usage_type: string; entity_id: string; entity_name: string }> } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const businesses = useQuery(listBusinessOptions, [])
  const list = useQuery(() => listFiles({ search, businessId, kind, visibility, page, pageSize: PAGE_SIZE }), [search, businessId, kind, visibility, page])
  const actions = useFileActions(() => list.reload())
  const onSearch = useCallback((v: string) => {
    setSearch(v)
    setPage(0)
  }, [])

  async function uploadMany(files: FileList) {
    const arr = Array.from(files)
    let ok = 0
    for (let i = 0; i < arr.length; i++) {
      setProgress({ done: i, total: arr.length, pct: 0 })
      try {
        const rec = await uploadFile(arr[i], {
          businessId: uploadBusiness || null,
          bucket: uploadBucket,
          onProgress: (pct) => setProgress({ done: i, total: arr.length, pct }),
        })
        warnIfLargePdf(rec)
        ok++
      } catch (e) {
        toast.error(`${arr[i].name}: ${friendlyError(e)}`)
      }
    }
    setProgress(null)
    if (ok) toast.success(`${ok} file${ok > 1 ? 's' : ''} uploaded`)
    list.reload()
  }

  async function showUsage(f: FileOverview) {
    try {
      setUsage({ file: f, rows: await fileUsage(f.id) })
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const usageHref = (u: { usage_type: string; entity_id: string }) => {
    if (u.usage_type === 'qr_code') return `/admin/qr/${u.entity_id}`
    if (u.usage_type === 'business_logo' || u.usage_type === 'business_cover') return `/admin/businesses/${u.entity_id}`
    return null
  }

  return (
    <>
      <PageHeader title="Files & documents" description={`PDFs and images up to ${config.maxUploadMb} MB. SVG, HTML and executable files are not accepted.`} />

      <Card className="mb-6">
        <CardHeader title="Upload" />
        <div
          className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (e.dataTransfer.files.length) void uploadMany(e.dataTransfer.files)
          }}
        >
          <Field label="Business">
            {(p) => (
              <Select {...p} value={uploadBusiness} onChange={(e) => setUploadBusiness(e.target.value)}>
                <option value="">Shared (no business)</option>
                {businesses.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Visibility" hint={uploadBucket === 'public-files' ? 'Anyone with the link can open it. Use for menus, brochures and photos.' : 'Only administrators can open it. Cannot be shown on public pages.'}>
            {(p) => (
              <Select {...p} value={uploadBucket} onChange={(e) => setUploadBucket(e.target.value as FileBucket)}>
                <option value="public-files">Public</option>
                <option value="private-files">Private (admins only)</option>
              </Select>
            )}
          </Field>
          <div>
            <input
              ref={input}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.files?.length) void uploadMany(e.target.files)
                e.target.value = ''
              }}
            />
            <Button onClick={() => input.current?.click()} loading={progress !== null} className="w-full md:w-auto">
              {!progress && <Upload />}
              {progress ? `Uploading ${progress.done + 1} of ${progress.total}` : 'Choose files'}
            </Button>
          </div>
          {progress && (
            <div className="md:col-span-3" role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-signal transition-[width]" style={{ width: `${((progress.done + progress.pct / 100) / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
          <p className="text-xs text-muted md:col-span-3">You can also drag files onto this panel.</p>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <SearchInput value={search} onChange={onSearch} placeholder="Search by title or file name" className="min-w-56 flex-1" />
          <Select aria-label="Business" value={businessId} onChange={(e) => { setBusinessId(e.target.value); setPage(0) }} className="w-auto min-w-44">
            <option value="">All businesses</option>
            <option value="shared">Shared files</option>
            {businesses.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Type" value={kind} onChange={(e) => { setKind(e.target.value as FileListParams['kind']); setPage(0) }} className="w-auto">
            <option value="">All types</option>
            <option value="document">PDF documents</option>
            <option value="image">Images</option>
          </Select>
          <Select aria-label="Visibility" value={visibility} onChange={(e) => { setVisibility(e.target.value as FileListParams['visibility']); setPage(0) }} className="w-auto">
            <option value="">Public and private</option>
            <option value="public-files">Public</option>
            <option value="private-files">Private</option>
          </Select>
        </div>
        {list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <TableSkeleton cols={5} />
        ) : !list.data?.rows.length ? (
          <EmptyState icon={<FolderOpen />} title={search || businessId || kind || visibility ? 'No files match' : 'No files yet'} description="Upload menus, brochures, price lists and photos above." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>File</Th>
                  <Th className="hidden md:table-cell">Business</Th>
                  <Th className="hidden sm:table-cell">Size</Th>
                  <Th>Used in</Th>
                  <Th className="hidden lg:table-cell">Updated</Th>
                  <Th className="w-12">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody className={list.loading ? 'opacity-60' : undefined}>
                {list.data.rows.map((f) => (
                  <tr key={f.id}>
                    <Td>
                      <span className="flex items-center gap-3">
                        {f.kind === 'image' && f.bucket === 'public-files' ? (
                          <img src={storagePublicUrl(f.storage_path, f.version)} alt="" className="h-10 w-10 rounded-md object-cover ring-1 ring-line" loading="lazy" />
                        ) : (
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-surface ring-1 ring-line">
                            {f.kind === 'document' ? <FileText className="size-4 text-muted" /> : <ImageIcon className="size-4 text-muted" />}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium">{f.title}</span>
                            {f.bucket === 'private-files' && (
                              <Badge tone="neutral">
                                <Lock className="size-3" /> Private
                              </Badge>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {f.original_filename}
                            {f.version > 1 && `, version ${f.version}`}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td className="hidden text-muted md:table-cell">
                      {f.business_id ? (
                        <Link to={`/admin/businesses/${f.business_id}`} className="hover:text-signal">
                          {f.business_name}
                        </Link>
                      ) : (
                        'Shared'
                      )}
                    </Td>
                    <Td className="hidden text-muted sm:table-cell tabular">{formatBytes(f.size_bytes)}</Td>
                    <Td>
                      {Number(f.usage_count) > 0 ? (
                        <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-signal hover:underline" onClick={() => void showUsage(f)}>
                          <Link2 className="size-3.5" /> {f.usage_count} place{Number(f.usage_count) > 1 ? 's' : ''}
                        </button>
                      ) : (
                        <span className="text-sm text-muted">{f.show_on_profile ? 'Business page' : 'Not used'}</span>
                      )}
                    </Td>
                    <Td className="hidden text-muted lg:table-cell">{relativeTime(f.updated_at)}</Td>
                    <Td>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${f.title}`}>
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem onSelect={() => void showUsage(f)}>
                            <Link2 /> Where it is used
                          </MenuItem>
                          {actions.menuItems(f)}
                        </MenuContent>
                      </Menu>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <Dialog open={usage !== null} onOpenChange={(v) => !v && setUsage(null)} title={`Where “${usage?.file.title}” is used`}>
        {usage?.rows.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {usage.rows.map((u, i) => {
              const href = usageHref(u)
              return (
                <li key={i} className="flex justify-between gap-3 px-4 py-3 text-sm">
                  <span className="text-muted">{USAGE_LABEL[u.usage_type] ?? u.usage_type}</span>
                  {href ? (
                    <Link to={href} className="font-medium hover:text-signal" onClick={() => setUsage(null)}>
                      {u.entity_name}
                    </Link>
                  ) : (
                    <span className="font-medium">{u.entity_name}</span>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Not referenced by any QR code, logo, cover or content block.
            {usage?.file.show_on_profile && ' It is listed on its business page because “Show on page” is on.'}
          </p>
        )}
      </Dialog>
      {actions.dialogs}
    </>
  )
}

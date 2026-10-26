import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ExternalLink,
  FileText,
  ImageIcon,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  QrCode,
  Trash2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ActivityList } from '@/components/admin/ActivityList'
import { useFileActions } from '@/components/admin/FileActions'
import { UploadButton } from '@/components/admin/FilePicker'
import { rangeDates } from '@/components/admin/labels'
import { PhonePreview } from '@/components/admin/PhonePreview'
import { ChartLegend, ScanChart } from '@/components/admin/ScanChart'
import { BusinessProfile } from '@/components/public/BusinessProfile'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, PageHeader, StatTile, StatusBadge, Table, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th } from '@/components/ui/data'
import { EmptyState, ErrorState, Notice, Spinner } from '@/components/ui/feedback'
import { Menu, MenuContent, MenuItem as MenuItemButton, MenuTrigger } from '@/components/ui/overlay'
import { businessPublicUrl, config, storagePublicUrl } from '@/config'
import { getBusinessBundle, listQrForBusiness, previewPayload, recentActivity, scanSeries } from '@/lib/admin-api'
import { QR_TYPE_INFO } from '@/lib/qr/types'
import type { FileRecord } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { formatBytes, formatDate, formatNumber, relativeTime } from '@/lib/utils'
import { useBusinessActions } from './useBusinessActions'

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{value}</dd>
    </div>
  )
}

export default function BusinessDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const bundle = useQuery(() => getBusinessBundle(id), [id])
  const qrs = useQuery(() => listQrForBusiness(id), [id])
  const range = rangeDates(30)
  const series = useQuery(() => scanSeries({ ...range, tz: config.analyticsTimeZone, businessId: id }), [id])
  const activity = useQuery(() => recentActivity(12, id), [id])
  const [tab, setTab] = useState('overview')
  const { actions, dialog } = useBusinessActions(bundle.reload, () => navigate('/admin/businesses'))
  const fileActions = useFileActions(() => bundle.reload())

  if (bundle.error) return <ErrorState message={bundle.error} onRetry={bundle.reload} />
  if (!bundle.data) return <Spinner />

  const { business: b, files, hours, locations, social, blocks, categoryName } = bundle.data
  const preview = previewPayload(
    {
      ...b,
      hours: hours.map((h) => ({ day_of_week: h.day_of_week, opens_at: h.opens_at, closes_at: h.closes_at })),
      locations: locations.map((l) => ({ label: l.label, address: l.address, latitude: l.latitude, longitude: l.longitude, maps_url: l.maps_url })),
      social_links: social.filter((s) => s.platform !== 'website').map((s) => ({ platform: s.platform as never, label: s.label, url: s.url })),
      category_id: b.category_id,
    },
    files,
    blocks,
    categoryName,
  )
  const totalScans = series.data?.reduce((s, p) => s + p.scans, 0) ?? 0
  const unavailable = b.archived_at || b.status !== 'active'

  return (
    <>
      <PageHeader
        back={
          <Link to="/admin/businesses" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Businesses
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {b.name}
            <StatusBadge status={b.status} archivedAt={b.archived_at} />
            {b.is_demo && <Badge tone="violet">Demo</Badge>}
          </span>
        }
        description={[categoryName, `Updated ${relativeTime(b.updated_at)}`].filter(Boolean).join('. ')}
        actions={
          <>
            <Button asChild variant="secondary">
              <a href={businessPublicUrl(b.slug)} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Public page
              </a>
            </Button>
            <Button asChild>
              <Link to={`/admin/businesses/${b.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                {!b.archived_at && (
                  <MenuItemButton onSelect={() => actions.toggleStatus(b)}>
                    <Power /> {b.status === 'active' ? 'Deactivate' : 'Activate'}
                  </MenuItemButton>
                )}
                {b.archived_at ? (
                  <MenuItemButton onSelect={() => actions.restore(b)}>
                    <ArchiveRestore /> Restore
                  </MenuItemButton>
                ) : (
                  <MenuItemButton onSelect={() => actions.archive(b)}>
                    <Archive /> Archive
                  </MenuItemButton>
                )}
                <MenuItemButton destructive onSelect={() => actions.remove(b)}>
                  <Trash2 /> Delete
                </MenuItemButton>
              </MenuContent>
            </Menu>
          </>
        }
      />

      {unavailable && (
        <Notice tone="warning" className="mb-6">
          {b.archived_at ? 'This business is archived.' : 'This business is inactive.'} Its public page and all its QR codes
          currently show “unavailable”. {b.archived_at ? 'Restore it' : 'Activate it'} to bring them back.
        </Notice>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="qr">QR codes ({qrs.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <div className="grid gap-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile label="QR codes" value={formatNumber(qrs.data?.length ?? 0)} />
                <StatTile label="Scans, 30 days" value={formatNumber(totalScans)} />
                <StatTile label="All-time scans" value={formatNumber(qrs.data?.reduce((s, q) => s + Number(q.scan_count), 0) ?? 0)} />
              </div>
              <Card>
                <CardHeader title="Scans, last 30 days" action={<ChartLegend />} />
                <div className="p-4">
                  {series.error ? (
                    <ErrorState title="Chart unavailable" message={series.error} onRetry={series.reload} />
                  ) : series.data && totalScans > 0 ? (
                    <ScanChart data={series.data} height={220} />
                  ) : (
                    <p className="py-12 text-center text-sm text-muted">No scans in the last 30 days.</p>
                  )}
                </div>
              </Card>
              <Card>
                <CardHeader title="Business information" />
                <dl className="divide-y divide-line px-5">
                  <InfoRow label="Page address" value={<a className="text-signal hover:underline" href={businessPublicUrl(b.slug)} target="_blank" rel="noopener noreferrer">/b/{b.slug}</a>} />
                  <InfoRow label="Tagline" value={b.tagline} />
                  <InfoRow label="Phone" value={b.phone} />
                  <InfoRow label="WhatsApp" value={b.whatsapp} />
                  <InfoRow label="Email" value={b.email} />
                  <InfoRow label="Website" value={b.website_url} />
                  <InfoRow label="Google Business" value={b.google_business_url} />
                  <InfoRow label="Locations" value={locations.map((l) => l.label + (l.address ? ` (${l.address})` : '')).join('; ')} />
                  <InfoRow label="Opening hours" value={hours.length ? `${new Set(hours.map((h) => h.day_of_week)).size} days configured` : null} />
                  <InfoRow label="Social links" value={social.length ? `${social.length} link${social.length > 1 ? 's' : ''}` : null} />
                  <InfoRow
                    label="Accent colour"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 rounded" style={{ backgroundColor: b.accent_color }} /> {b.accent_color}
                      </span>
                    }
                  />
                  <InfoRow label="Created" value={formatDate(b.created_at)} />
                </dl>
              </Card>
            </div>
            <Card className="self-start">
              <CardHeader title="Recent activity" />
              <ActivityList logs={activity.data ?? []} />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="qr">
          <Card>
            <CardHeader
              title="QR codes"
              description="Every code keeps its printed link. Edit a code to change what it opens."
              action={
                <Button asChild size="sm">
                  <Link to={`/admin/qr/new?business=${b.id}`}>
                    <Plus /> New QR code
                  </Link>
                </Button>
              }
            />
            {qrs.data?.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th className="hidden sm:table-cell">Type</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Scans</Th>
                    <Th className="hidden md:table-cell">Last scan</Th>
                  </tr>
                </thead>
                <tbody>
                  {qrs.data.map((q) => (
                    <tr key={q.id} className="hover:bg-surface/60">
                      <Td>
                        <Link to={`/admin/qr/${q.id}`} className="font-semibold hover:text-signal">
                          {q.name}
                        </Link>
                        <span className="block text-xs text-muted">/q/{q.public_code}</span>
                      </Td>
                      <Td className="hidden text-muted sm:table-cell">{QR_TYPE_INFO[q.type].label}</Td>
                      <Td>
                        <StatusBadge status={q.status} archivedAt={q.archived_at} />
                      </Td>
                      <Td className="text-right tabular">{formatNumber(q.scan_count)}</Td>
                      <Td className="hidden text-muted md:table-cell">{relativeTime(q.last_scan_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState
                icon={<QrCode />}
                title="No QR codes for this business"
                description="Create one for the business profile, a menu, a location or anything else."
                action={
                  <Button asChild>
                    <Link to={`/admin/qr/new?business=${b.id}`}>
                      <Plus /> New QR code
                    </Link>
                  </Button>
                }
              />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="files">
          <Card>
            <CardHeader
              title="Files"
              description="PDFs and images for this business. Toggle “On page” to show them in the Documents list or Photos gallery."
              action={
                <div className="flex gap-2">
                  <UploadButton businessId={b.id} kind="document" label="Upload PDF" onUploaded={() => bundle.reload()} showOnProfile />
                  <UploadButton businessId={b.id} kind="image" label="Upload image" onUploaded={() => bundle.reload()} />
                </div>
              }
            />
            {files.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>File</Th>
                    <Th className="hidden sm:table-cell">Size</Th>
                    <Th>On page</Th>
                    <Th className="hidden md:table-cell">Updated</Th>
                    <Th className="w-12">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f: FileRecord) => (
                    <tr key={f.id}>
                      <Td>
                        <span className="flex items-center gap-3">
                          {f.kind === 'image' && f.bucket === 'public-files' ? (
                            <img src={storagePublicUrl(f.storage_path, f.version)} alt="" className="h-10 w-10 rounded-md object-cover ring-1 ring-line" loading="lazy" />
                          ) : (
                            <span className="grid h-10 w-10 place-items-center rounded-md bg-surface ring-1 ring-line">
                              {f.bucket === 'private-files' ? <Lock className="size-4 text-muted" /> : f.kind === 'document' ? <FileText className="size-4 text-muted" /> : <ImageIcon className="size-4 text-muted" />}
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{f.title}</span>
                            <span className="block text-xs text-muted">
                              {f.kind === 'document' ? 'PDF' : 'Image'}
                              {f.version > 1 && `, version ${f.version}`}
                              {f.id === b.logo_file_id && ', logo'}
                              {f.id === b.cover_file_id && ', cover'}
                            </span>
                          </span>
                        </span>
                      </Td>
                      <Td className="hidden text-muted sm:table-cell">{formatBytes(f.size_bytes)}</Td>
                      <Td>{f.show_on_profile ? <Badge tone="success">Shown</Badge> : <span className="text-sm text-muted">Hidden</span>}</Td>
                      <Td className="hidden text-muted md:table-cell">{relativeTime(f.updated_at)}</Td>
                      <Td>
                        <Menu>
                          <MenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${f.title}`}>
                              <MoreHorizontal />
                            </Button>
                          </MenuTrigger>
                          <MenuContent>{fileActions.menuItems(f)}</MenuContent>
                        </Menu>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={<FileText />} title="No files yet" description="Upload a menu, brochure, price list or photos." />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
            <div className="max-w-md">
              <h2 className="text-lg font-semibold">Published page</h2>
              <p className="mt-1 text-sm text-muted">
                This is what visitors see at /b/{b.slug} and on profile QR codes. To check changes before publishing, open Edit:
                the live preview there includes unsaved changes.
              </p>
              {unavailable && (
                <Notice tone="warning" className="mt-4">
                  Visitors currently see an “unavailable” page instead.
                </Notice>
              )}
            </div>
            <PhonePreview label={`/b/${b.slug}`}>
              <BusinessProfile business={preview} />
            </PhonePreview>
          </div>
        </TabsContent>
      </Tabs>
      {dialog}
      {fileActions.dialogs}
    </>
  )
}


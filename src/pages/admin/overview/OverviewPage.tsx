import { Building2, Eye, Plus, QrCode, ScanLine } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActivityList } from '@/components/admin/ActivityList'
import { rangeDates } from '@/components/admin/labels'
import { ChartLegend, ScanChart } from '@/components/admin/ScanChart'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, PageHeader, StatTile, StatusBadge } from '@/components/ui/data'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { config } from '@/config'
import {
  listBusinesses,
  listQrCodes,
  overviewStats,
  recentActivity,
  scanSeries,
  topQrCodes,
} from '@/lib/admin-api'
import { QR_TYPE_INFO } from '@/lib/qr/types'
import { useQuery } from '@/lib/use-query'
import { formatNumber, relativeTime } from '@/lib/utils'

export default function OverviewPage() {
  const stats = useQuery(overviewStats, [])
  const range = rangeDates(30)
  const series = useQuery(() => scanSeries({ ...range, tz: config.analyticsTimeZone }), [])
  const top = useQuery(() => topQrCodes(range.from, range.to, 5), [])
  const recentBiz = useQuery(
    () => listBusinesses({ search: '', categoryId: '', lifecycle: 'live', sort: 'created_at', ascending: false, page: 0, pageSize: 5 }),
    [],
  )
  const recentQr = useQuery(
    () => listQrCodes({ search: '', businessId: '', type: '', lifecycle: 'live', sort: 'created_at', ascending: false, page: 0, pageSize: 5 }),
    [],
  )
  const activity = useQuery(() => recentActivity(10), [])

  if (stats.error) return <ErrorState message={stats.error} onRetry={stats.reload} />
  const s = stats.data
  const isEmpty = s && s.businesses_total === 0 && s.businesses_archived === 0

  return (
    <>
      <PageHeader title="Overview" description="Everything happening across your businesses and QR codes." />

      {isEmpty ? (
        <Card>
          <EmptyState
            icon={<Building2 />}
            title="Add your first business"
            description="Create a business profile, then generate QR codes for it. Statistics appear here once codes are scanned."
            action={
              <Button asChild>
                <Link to="/admin/businesses/new">
                  <Plus /> Add business
                </Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {!s ? (
              Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[6.5rem] rounded-xl" />)
            ) : (
              <>
                <StatTile label="Businesses" icon={<Building2 />} value={formatNumber(s.businesses_total)} hint={`${formatNumber(s.businesses_active)} active`} />
                <StatTile label="QR codes" icon={<QrCode />} value={formatNumber(s.qr_total)} hint={`${formatNumber(s.qr_archived)} archived`} />
                <StatTile
                  label="Active / inactive"
                  value={
                    <span>
                      {formatNumber(s.qr_active)}
                      <span className="text-muted"> / {formatNumber(s.qr_inactive)}</span>
                    </span>
                  }
                  hint="Codes not archived"
                />
                <StatTile label="Total scans" icon={<ScanLine />} value={formatNumber(s.scans_total)} hint={`${formatNumber(s.scans_30d)} in the last 30 days`} />
                <StatTile
                  label="Unique visitors"
                  icon={<Eye />}
                  value={formatNumber(s.unique_visitors_30d)}
                  hint="Last 30 days, daily estimate"
                />
              </>
            )}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader title="Scans, last 30 days" action={<ChartLegend />} />
              <div className="p-4">
                {series.error ? (
                  <ErrorState title="Chart unavailable" message={series.error} onRetry={series.reload} />
                ) : series.loading && !series.data ? (
                  <Skeleton className="h-[260px]" />
                ) : series.data && series.data.some((d) => d.scans > 0) ? (
                  <ScanChart data={series.data} />
                ) : (
                  <EmptyState
                    icon={<ScanLine />}
                    title="No scans yet"
                    description="Scans are recorded when someone opens a code with their phone. Admin previews are not counted."
                  />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Most scanned" description="Last 30 days" />
              {top.data?.length ? (
                <ol className="divide-y divide-line">
                  {top.data.map((q, i) => (
                    <li key={q.qr_code_id} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-5 text-sm font-semibold text-muted tabular">{i + 1}</span>
                      <Link to={`/admin/qr/${q.qr_code_id}`} className="min-w-0 flex-1 hover:text-signal">
                        <span className="block truncate text-sm font-medium">{q.name}</span>
                        <span className="block truncate text-xs text-muted">{q.business_name}</span>
                      </Link>
                      <span className="text-sm font-semibold tabular">{formatNumber(q.scans)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-5 py-10 text-center text-sm text-muted">{top.loading ? 'Loading…' : 'No scans in the last 30 days.'}</p>
              )}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader
                title="Recent businesses"
                action={
                  <Link to="/admin/businesses" className="text-sm font-medium text-signal hover:underline">
                    View all
                  </Link>
                }
              />
              <ul className="divide-y divide-line">
                {recentBiz.data?.rows.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <Link to={`/admin/businesses/${b.id}`} className="min-w-0 hover:text-signal">
                      <span className="block truncate text-sm font-medium">{b.name}</span>
                      <span className="block text-xs text-muted">Added {relativeTime(b.created_at)}</span>
                    </Link>
                    {b.is_demo ? <Badge tone="violet">Demo</Badge> : <StatusBadge status={b.status} archivedAt={b.archived_at} />}
                  </li>
                ))}
                {recentBiz.data?.rows.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">No businesses yet.</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader
                title="Recent QR codes"
                action={
                  <Link to="/admin/qr" className="text-sm font-medium text-signal hover:underline">
                    View all
                  </Link>
                }
              />
              <ul className="divide-y divide-line">
                {recentQr.data?.rows.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <Link to={`/admin/qr/${q.id}`} className="min-w-0 hover:text-signal">
                      <span className="block truncate text-sm font-medium">{q.name}</span>
                      <span className="block text-xs text-muted">{QR_TYPE_INFO[q.type].label}</span>
                    </Link>
                    <StatusBadge status={q.status} archivedAt={q.archived_at} />
                  </li>
                ))}
                {recentQr.data?.rows.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">No QR codes yet.</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Recent activity" />
              <ActivityList logs={activity.data ?? []} />
            </Card>
          </div>
        </>
      )}
    </>
  )
}

import { Info } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BROWSER_LABELS, DEVICE_LABELS, RANGE_OPTIONS, rangeDates } from '@/components/admin/labels'
import { BreakdownBars, ChartLegend, ScanChart } from '@/components/admin/ScanChart'
import { Card, CardHeader, PageHeader, StatTile, Table, Td, Th } from '@/components/ui/data'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Select } from '@/components/ui/form'
import { config } from '@/config'
import { listBusinessOptions, recentScans, scanBreakdown, scanSeries, topQrCodes } from '@/lib/admin-api'
import { QR_TYPE_INFO, type QrType } from '@/lib/qr/types'
import { useQuery } from '@/lib/use-query'
import { formatDateTime, formatNumber } from '@/lib/utils'

const TYPE_LABELS = Object.fromEntries(Object.entries(QR_TYPE_INFO).map(([k, v]) => [k, v.label])) as Record<QrType, string>

export default function AnalyticsPage() {
  const [days, setDays] = useState('30')
  const [businessId, setBusinessId] = useState('')
  const [monthly, setMonthly] = useState(false)
  const range = rangeDates(Number(days))
  const interval = monthly ? 'month' : range.interval
  const filter = { businessId: businessId || undefined }
  const deps = [days, businessId, monthly]

  const businesses = useQuery(listBusinessOptions, [])
  const series = useQuery(() => scanSeries({ from: range.from, to: range.to, interval, tz: config.analyticsTimeZone, ...filter }), deps)
  const top = useQuery(() => topQrCodes(range.from, range.to, 10, filter.businessId), deps)
  const devices = useQuery(() => scanBreakdown('device', range.from, range.to, filter), deps)
  const browsers = useQuery(() => scanBreakdown('browser', range.from, range.to, filter), deps)
  const types = useQuery(() => scanBreakdown('qr_type', range.from, range.to, filter), deps)
  const recent = useQuery(() => recentScans(filter, 15), [businessId])

  const total = series.data?.reduce((s, p) => s + p.scans, 0) ?? 0
  const uniq = series.data?.reduce((s, p) => s + p.unique_visitors, 0) ?? 0
  const peak = series.data?.reduce((m, p) => (p.scans > m.scans ? p : m), { bucket: '', scans: 0, unique_visitors: 0 })

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Real scan events recorded when someone opens a dynamic QR code. Test links and link-preview bots are not counted."
        actions={
          <>
            <Select aria-label="Business" value={businessId} onChange={(e) => setBusinessId(e.target.value)} className="w-auto min-w-44">
              <option value="">All businesses</option>
              {businesses.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Period" value={days} onChange={(e) => setDays(e.target.value)} className="w-auto">
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Select aria-label="Group by" value={monthly ? 'month' : 'day'} onChange={(e) => setMonthly(e.target.value === 'month')} className="w-auto">
              <option value="day">Daily</option>
              <option value="month">Monthly</option>
            </Select>
          </>
        }
      />

      {series.error ? (
        <ErrorState message={series.error} onRetry={series.reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Scans" value={series.data ? formatNumber(total) : '…'} hint={RANGE_OPTIONS.find((o) => o.value === days)?.label} />
            <StatTile label="Unique visitors" value={series.data ? formatNumber(uniq) : '…'} hint="Daily estimates, summed" />
            <StatTile label="Average per day" value={series.data ? (total / Number(days)).toFixed(1) : '…'} />
            <StatTile label={monthly ? 'Busiest month' : 'Busiest day'} value={peak?.scans ? formatNumber(peak.scans) : '—'} hint={peak?.scans ? peak.bucket : 'No scans yet'} />
          </div>

          <Card className="mt-6">
            <CardHeader title="Scans over time" description={`Times in ${config.analyticsTimeZone}`} action={<ChartLegend />} />
            <div className="p-4">
              {!series.data ? (
                <Skeleton className="h-[300px]" />
              ) : total ? (
                <ScanChart data={series.data} interval={interval} height={300} />
              ) : (
                <EmptyState title="No scans in this period" description="As soon as someone scans one of your codes, it shows up here." />
              )}
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="Devices" />
              <div className="p-5">{devices.data ? <BreakdownBars rows={devices.data} labels={DEVICE_LABELS} /> : <Skeleton className="h-32" />}</div>
            </Card>
            <Card>
              <CardHeader title="Browsers" />
              <div className="p-5">{browsers.data ? <BreakdownBars rows={browsers.data} labels={BROWSER_LABELS} /> : <Skeleton className="h-32" />}</div>
            </Card>
            <Card>
              <CardHeader title="Destination types" />
              <div className="p-5">{types.data ? <BreakdownBars rows={types.data} labels={TYPE_LABELS} /> : <Skeleton className="h-32" />}</div>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Most scanned QR codes" />
              {top.data?.length ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>QR code</Th>
                      <Th className="hidden sm:table-cell">Type</Th>
                      <Th className="text-right">Scans</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.data.map((q) => (
                      <tr key={q.qr_code_id}>
                        <Td>
                          <Link to={`/admin/qr/${q.qr_code_id}`} className="font-medium hover:text-signal">
                            {q.name}
                          </Link>
                          <span className="block text-xs text-muted">{q.business_name}</span>
                        </Td>
                        <Td className="hidden text-muted sm:table-cell">{TYPE_LABELS[q.type as QrType] ?? q.type}</Td>
                        <Td className="text-right tabular font-semibold">{formatNumber(q.scans)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <p className="px-5 py-10 text-center text-sm text-muted">{top.loading ? 'Loading…' : 'No scans in this period.'}</p>
              )}
            </Card>
            <Card>
              <CardHeader title="Recent scans" />
              {recent.data?.length ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>Time</Th>
                      <Th>QR code</Th>
                      <Th className="hidden sm:table-cell">Device</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.data.map((s) => (
                      <tr key={s.id}>
                        <Td className="whitespace-nowrap tabular text-muted">{formatDateTime(s.occurred_at)}</Td>
                        <Td>
                          {s.qr_code_id ? (
                            <Link to={`/admin/qr/${s.qr_code_id}`} className="font-medium hover:text-signal">
                              {s.qr_codes?.name}
                            </Link>
                          ) : (
                            <span className="text-muted">Deleted code</span>
                          )}
                          <span className="block text-xs text-muted">{s.businesses?.name}</span>
                        </Td>
                        <Td className="hidden text-muted sm:table-cell">{DEVICE_LABELS[s.device_category]}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <p className="px-5 py-10 text-center text-sm text-muted">{recent.loading ? 'Loading…' : 'No scans recorded yet.'}</p>
              )}
            </Card>
          </div>

          <details className="mt-6 rounded-xl border border-line bg-white p-5 text-sm leading-relaxed text-ink/75">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <Info className="size-4 text-signal" /> How these numbers are measured
            </summary>
            <ul className="mt-3 grid list-disc gap-1.5 pl-5">
              <li>One scan is recorded each time a dynamic code’s link is opened, on our server, before the visitor is redirected or the page is shown. The page itself never records a second scan.</li>
              <li>Repeat opens of the same code from the same visitor within 30 seconds count once. Link-preview bots and “Test link” opens from the dashboard are not counted.</li>
              <li>Unique visitors are estimated from an anonymous identifier that changes every day. The same person on two different days counts twice; people sharing a network and device type may count once.</li>
              <li>No IP addresses are stored. Wi-Fi codes are read directly by phones and cannot be counted.</li>
            </ul>
          </details>
        </>
      )}
    </>
  )
}

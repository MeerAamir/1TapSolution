import { useState } from 'react'
import { BROWSER_LABELS, DEVICE_LABELS, RANGE_OPTIONS, rangeDates } from '@/components/admin/labels'
import { BreakdownBars, ChartLegend, ScanChart } from '@/components/admin/ScanChart'
import { Card, CardHeader, StatTile, Table, Td, Th } from '@/components/ui/data'
import { ErrorState, Skeleton } from '@/components/ui/feedback'
import { Select } from '@/components/ui/form'
import { config } from '@/config'
import { recentScans, scanBreakdown, scanSeries } from '@/lib/admin-api'
import { useQuery } from '@/lib/use-query'
import { formatDateTime, formatNumber } from '@/lib/utils'

export function QrScansPanel({ qrCodeId, totalScans, isStatic }: { qrCodeId: string; totalScans: number; isStatic: boolean }) {
  const [days, setDays] = useState('30')
  const range = rangeDates(Number(days))
  const series = useQuery(() => scanSeries({ ...range, tz: config.analyticsTimeZone, qrCodeId }), [qrCodeId, days])
  const devices = useQuery(() => scanBreakdown('device', range.from, range.to, { qrCodeId }), [qrCodeId, days])
  const recent = useQuery(() => recentScans({ qrCodeId }, 25), [qrCodeId])

  if (isStatic) {
    return (
      <Card>
        <p className="px-5 py-12 text-center text-sm text-muted">
          Wi-Fi codes are read directly by the phone without visiting our server, so scans cannot be counted.
        </p>
      </Card>
    )
  }
  if (series.error) return <ErrorState message={series.error} onRetry={series.reload} />
  const periodScans = series.data?.reduce((s, p) => s + p.scans, 0) ?? 0
  const periodUnique = series.data?.reduce((s, p) => s + p.unique_visitors, 0) ?? 0

  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <Select aria-label="Period" value={days} onChange={(e) => setDays(e.target.value)} className="w-auto">
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="All-time scans" value={formatNumber(totalScans)} />
        <StatTile label="Scans in period" value={series.data ? formatNumber(periodScans) : '…'} />
        <StatTile label="Unique visitors" value={series.data ? formatNumber(periodUnique) : '…'} hint="Daily estimate, summed" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Scans over time" action={<ChartLegend />} />
          <div className="p-4">
            {!series.data ? <Skeleton className="h-[240px]" /> : periodScans ? <ScanChart data={series.data} interval={range.interval} height={240} /> : <p className="py-16 text-center text-sm text-muted">No scans in this period.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Devices" />
          <div className="p-5">{devices.data && <BreakdownBars rows={devices.data} labels={DEVICE_LABELS} />}</div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Recent scans" description="Most recent first. No personal data is stored." />
        {recent.data?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Device</Th>
                <Th>Browser</Th>
              </tr>
            </thead>
            <tbody>
              {recent.data.map((s) => (
                <tr key={s.id}>
                  <Td className="tabular">{formatDateTime(s.occurred_at)}</Td>
                  <Td>{DEVICE_LABELS[s.device_category] ?? s.device_category}</Td>
                  <Td>{BROWSER_LABELS[s.browser_category] ?? s.browser_category}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted">{recent.loading ? 'Loading…' : 'No scans recorded yet.'}</p>
        )}
      </Card>
    </div>
  )
}

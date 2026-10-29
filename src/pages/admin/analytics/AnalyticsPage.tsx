import { Activity, AppWindow, CalendarDays, Clock, Flame, Globe, Info, ScanLine, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BROWSER_LABELS, DEVICE_LABELS, RANGE_OPTIONS, rangeDates } from '@/components/admin/labels'
import { DEVICE_COLORS, DEVICE_ICONS, DeviceDonut, IconBars, KpiCard, ScanHeatmap, TopCodes } from '@/components/admin/AnalyticsViz'
import { ChartLegend, ScanChart } from '@/components/admin/ScanChart'
import { Card, CardHeader, PageHeader } from '@/components/ui/data'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback'
import { Select } from '@/components/ui/form'
import { config } from '@/config'
import { listBusinessOptions, recentScans, scanBreakdown, scanSeries, scanTimes, topQrCodes } from '@/lib/admin-api'
import { QR_TYPE_INFO, type QrType } from '@/lib/qr/types'
import { useQuery } from '@/lib/use-query'
import { formatDateTime, formatNumber, relativeTime } from '@/lib/utils'
import { typeColor, typeIcon, TYPE_LABEL } from '../qr/studio/typeTiles'

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
  const recent = useQuery(() => recentScans(filter, 12), [businessId])
  const times = useQuery(() => scanTimes(range.from, range.to, filter), deps)
  // The same length of time just before, for the change figures.
  const prev = useQuery(() => {
    const span = range.to.getTime() - range.from.getTime()
    return scanSeries({ from: new Date(range.from.getTime() - span), to: range.from, interval: 'month', tz: config.analyticsTimeZone, ...filter })
  }, deps)

  const total = series.data?.reduce((s, p) => s + p.scans, 0) ?? 0
  const uniq = series.data?.reduce((s, p) => s + p.unique_visitors, 0) ?? 0
  const peak = series.data?.reduce((m, p) => (p.scans > m.scans ? p : m), { bucket: '', scans: 0, unique_visitors: 0 })
  const prevTotal = prev.data?.reduce((s, p) => s + p.scans, 0)
  const prevUniq = prev.data?.reduce((s, p) => s + p.unique_visitors, 0)
  const change = (now: number, before: number | undefined) => (before === undefined ? undefined : before === 0 ? (now ? null : 0) : (now - before) / before)
  const periodLabel = RANGE_OPTIONS.find((o) => o.value === days)?.label ?? ''
  const peakLabel = peak?.scans ? new Date(`${peak.bucket}T00:00:00`).toLocaleDateString(undefined, monthly ? { month: 'long', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' }) : 'No scans yet'

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How often your QR codes are scanned, when, and on which phones."
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
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Scans" icon={<ScanLine />} tint="#2563EB" value={series.data ? formatNumber(total) : '…'} change={change(total, prevTotal)} hint={`vs previous ${periodLabel.replace('Last ', '').toLowerCase()}`} />
            <KpiCard label="Unique visitors" icon={<Users />} tint="#7C3AED" value={series.data ? formatNumber(uniq) : '…'} change={change(uniq, prevUniq)} hint="daily estimate" />
            <KpiCard label="Average per day" icon={<Activity />} tint="#0D9488" value={series.data ? (total / Number(days)).toFixed(1) : '…'} hint={periodLabel} />
            <KpiCard label={monthly ? 'Busiest month' : 'Busiest day'} icon={<Flame />} tint="#EA580C" value={peak?.scans ? formatNumber(peak.scans) : '—'} hint={peakLabel} />
          </div>

          <Card className="mt-6">
            <CardHeader title="Scans over time" description={`${periodLabel} · times in ${config.analyticsTimeZone}`} action={<ChartLegend />} />
            <div className="p-4">
              {!series.data ? (
                <Skeleton className="h-[300px]" />
              ) : total ? (
                <ScanChart data={series.data} interval={interval} height={300} />
              ) : (
                <EmptyState icon={<ScanLine />} title="No scans in this period" description="As soon as someone scans one of your codes, it shows up here." />
              )}
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader title="Most scanned QR codes" description={periodLabel} />
              <div className="p-3">
                {top.data?.length ? (
                  <TopCodes rows={top.data.map((q) => ({ ...q, business_name: q.business_name === 'My QR codes' ? null : q.business_name }))} icon={(t) => typeIcon(t as QrType)} color={(t) => typeColor(t as QrType)} typeLabel={(t) => TYPE_LABEL[t as QrType] ?? TYPE_LABELS[t as QrType] ?? t} />
                ) : (
                  <p className="px-5 py-10 text-center text-sm text-muted">{top.loading ? 'Loading…' : 'No scans in this period.'}</p>
                )}
              </div>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Devices" description="Phones, tablets and computers" />
              <div className="p-5">{devices.data ? <DeviceDonut rows={devices.data} labels={DEVICE_LABELS} /> : <Skeleton className="h-40" />}</div>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader title="When people scan" description="Day of the week and hour of the day, in your time" action={<CalendarDays className="size-4 text-muted" />} />
            <div className="p-5">{times.data ? <ScanHeatmap times={times.data} /> : <Skeleton className="h-40" />}</div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="Browsers" />
              <div className="p-5">
                {browsers.data ? <IconBars rows={browsers.data} labels={BROWSER_LABELS} icon={(l) => (l === 'in_app' ? <AppWindow /> : <Globe />)} /> : <Skeleton className="h-32" />}
              </div>
            </Card>
            <Card>
              <CardHeader title="Code types" />
              <div className="p-5">
                {types.data ? (
                  <IconBars rows={types.data} labels={{ ...TYPE_LABELS, ...TYPE_LABEL }} icon={(l) => <span style={{ color: typeColor(l as QrType) }}>{typeIcon(l as QrType)}</span>} />
                ) : (
                  <Skeleton className="h-32" />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Latest scans" action={<Clock className="size-4 text-muted" />} />
              {recent.data?.length ? (
                <ul className="divide-y divide-line">
                  {recent.data.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-5 py-2.5">
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full [&_svg]:size-4"
                        style={{ backgroundColor: `${DEVICE_COLORS[s.device_category] ?? DEVICE_COLORS.other}1A`, color: DEVICE_COLORS[s.device_category] ?? DEVICE_COLORS.other }}
                        title={DEVICE_LABELS[s.device_category]}
                      >
                        {DEVICE_ICONS[s.device_category] ?? DEVICE_ICONS.other}
                      </span>
                      <span className="min-w-0 flex-1">
                        {s.qr_code_id ? (
                          <Link to={`/admin/qr/${s.qr_code_id}`} className="block truncate text-sm font-medium hover:text-signal">
                            {s.qr_codes?.name}
                          </Link>
                        ) : (
                          <span className="block text-sm text-muted">Deleted code</span>
                        )}
                        <span className="block truncate text-xs text-muted">{s.businesses?.name && !/^My QR codes$/.test(s.businesses.name) ? s.businesses.name : DEVICE_LABELS[s.device_category]}</span>
                      </span>
                      <time dateTime={s.occurred_at} title={formatDateTime(s.occurred_at)} className="shrink-0 text-xs text-muted">
                        {relativeTime(s.occurred_at)}
                      </time>
                    </li>
                  ))}
                </ul>
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

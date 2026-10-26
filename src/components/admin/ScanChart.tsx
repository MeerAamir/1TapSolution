import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SeriesPoint } from '@/lib/admin-api'
import { formatNumber } from '@/lib/utils'

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' })
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

function label(bucket: string, interval: 'day' | 'month') {
  const d = new Date(`${bucket}T00:00:00`)
  return interval === 'month' ? monthFmt.format(d) : dayFmt.format(d)
}

/** Scans (and daily unique visitors) over time — real stored events only. */
export function ScanChart({
  data,
  interval = 'day',
  height = 260,
  showUnique = true,
}: {
  data: SeriesPoint[]
  interval?: 'day' | 'month'
  height?: number
  showUnique?: boolean
}) {
  const rows = data.map((d) => ({ ...d, label: label(d.bucket, interval) }))
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="scanFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748B' }} minTickGap={24} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748B' }} width={44} />
          <Tooltip
            cursor={{ stroke: '#CBD5E1' }}
            contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13, boxShadow: '0 8px 24px -12px rgba(15,23,42,.25)' }}
            formatter={(value, name) => [formatNumber(Number(value)), name === 'scans' ? 'Scans' : 'Unique visitors (daily)']}
          />
          <Area type="monotone" dataKey="scans" stroke="#2563EB" strokeWidth={2} fill="url(#scanFill)" />
          {showUnique && (
            <Area type="monotone" dataKey="unique_visitors" stroke="#7C3AED" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ChartLegend({ showUnique = true }: { showUnique?: boolean }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded bg-signal" /> Scans
      </span>
      {showUnique && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-[1.5px] border-dashed border-violet" /> Unique visitors (daily estimate)
        </span>
      )}
    </div>
  )
}

/** Simple horizontal bars for small categorical breakdowns. */
export function BreakdownBars({ rows, labels }: { rows: Array<{ label: string; scans: number }>; labels?: Record<string, string> }) {
  const total = rows.reduce((s, r) => s + r.scans, 0)
  if (!total) return <p className="py-6 text-center text-sm text-muted">No scans in this period.</p>
  return (
    <ul className="grid gap-3">
      {rows.map((r) => {
        const pct = Math.round((r.scans / total) * 100)
        return (
          <li key={r.label}>
            <div className="mb-1 flex justify-between text-sm">
              <span>{labels?.[r.label] ?? r.label}</span>
              <span className="tabular text-muted">
                {formatNumber(r.scans)} <span className="text-xs">({pct}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-line/70">
              <div className="h-2 rounded-full bg-signal" style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

import { ArrowDownRight, ArrowUpRight, Minus, Monitor, Smartphone, Tablet, HelpCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { cn, formatNumber } from '@/lib/utils'

/** Fixed colour per device, so a device keeps its colour whatever the filter. */
export const DEVICE_COLORS: Record<string, string> = {
  mobile: '#2a78d6',
  tablet: '#eb6834',
  desktop: '#1baf7a',
  other: '#94A3B8',
}

export const DEVICE_ICONS: Record<string, ReactNode> = {
  mobile: <Smartphone />,
  tablet: <Tablet />,
  desktop: <Monitor />,
  other: <HelpCircle />,
}

/** Headline number with an icon and the change against the previous period. */
export function KpiCard({
  label,
  value,
  icon,
  tint,
  change,
  hint,
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  tint: string
  /** Fraction, e.g. 0.12 for +12%. null = no earlier data to compare. */
  change?: number | null
  hint?: ReactNode
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.08]" style={{ backgroundColor: tint }} aria-hidden />
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5" style={{ backgroundColor: `${tint}18`, color: tint }}>
          {icon}
        </span>
        <span className="text-sm font-medium text-muted">{label}</span>
      </div>
      <div className="mt-3 text-[1.9rem] font-bold leading-none tracking-[-0.03em] tabular">{value}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {change !== undefined &&
          (change === null ? (
            <span className="inline-flex items-center gap-0.5 font-medium">
              <Minus className="size-3.5" /> No earlier data
            </span>
          ) : (
            <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold', change > 0 ? 'bg-success/10 text-success' : change < 0 ? 'bg-danger/10 text-danger' : 'bg-surface text-muted')}>
              {change > 0 ? <ArrowUpRight className="size-3.5" /> : change < 0 ? <ArrowDownRight className="size-3.5" /> : <Minus className="size-3.5" />}
              {change === 0 ? 'Same' : `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`}
            </span>
          ))}
        {hint}
      </div>
    </div>
  )
}

/** Share of scans per device as a donut with the total in the middle. */
export function DeviceDonut({ rows, labels }: { rows: Array<{ label: string; scans: number }>; labels: Record<string, string> }) {
  const total = rows.reduce((s, r) => s + r.scans, 0)
  if (!total) return <p className="py-10 text-center text-sm text-muted">No scans in this period.</p>
  const data = rows.filter((r) => r.scans > 0)
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="relative mx-auto h-40 w-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="scans" nameKey="label" innerRadius="66%" outerRadius="100%" paddingAngle={data.length > 1 ? 2 : 0} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {data.map((r) => (
                <Cell key={r.label} fill={DEVICE_COLORS[r.label] ?? DEVICE_COLORS.other} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13 }}
              formatter={(v, n) => [`${formatNumber(Number(v))} (${Math.round((Number(v) / total) * 100)}%)`, labels[String(n)] ?? String(n)]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-xl font-bold tabular">{formatNumber(total)}</div>
            <div className="text-[0.7rem] text-muted">scans</div>
          </div>
        </div>
      </div>
      <ul className="grid gap-2.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 text-sm">
            <span className="grid h-7 w-7 place-items-center rounded-lg [&_svg]:size-3.5" style={{ backgroundColor: `${DEVICE_COLORS[r.label] ?? DEVICE_COLORS.other}1A`, color: DEVICE_COLORS[r.label] ?? DEVICE_COLORS.other }}>
              {DEVICE_ICONS[r.label] ?? DEVICE_ICONS.other}
            </span>
            <span className="flex-1">{labels[r.label] ?? r.label}</span>
            <span className="tabular font-semibold">{Math.round((r.scans / total) * 100)}%</span>
            <span className="w-12 text-right tabular text-xs text-muted">{formatNumber(r.scans)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Bars with a small icon per row (browsers, code types). One colour: length carries the meaning. */
export function IconBars({
  rows,
  labels,
  icon,
}: {
  rows: Array<{ label: string; scans: number }>
  labels?: Record<string, string>
  icon?: (label: string) => ReactNode
}) {
  const total = rows.reduce((s, r) => s + r.scans, 0)
  const max = Math.max(1, ...rows.map((r) => r.scans))
  if (!total) return <p className="py-10 text-center text-sm text-muted">No scans in this period.</p>
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2.5" title={`${labels?.[r.label] ?? r.label}: ${formatNumber(r.scans)} scans`}>
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface text-muted ring-1 ring-line [&_svg]:size-3.5">{icon?.(r.label)}</span>
          <div className="min-w-0">
            <div className="mb-1 flex justify-between gap-2 text-sm">
              <span className="truncate">{labels?.[r.label] ?? r.label}</span>
              <span className="shrink-0 tabular text-muted">
                <span className="font-semibold text-ink">{formatNumber(r.scans)}</span> · {Math.round((r.scans / total) * 100)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-line/60">
              <div className="h-2 rounded-full bg-[#2a78d6]" style={{ width: `${Math.max((r.scans / max) * 100, 3)}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Most scanned codes as a ranked list with a share bar. */
export function TopCodes({
  rows,
  icon,
  color,
  typeLabel,
}: {
  rows: Array<{ qr_code_id: string; name: string; business_name: string | null; type: string; scans: number }>
  icon: (type: string) => ReactNode
  color: (type: string) => string
  typeLabel: (type: string) => string
}) {
  const max = Math.max(1, ...rows.map((r) => r.scans))
  return (
    <ol className="grid gap-1">
      {rows.map((r, i) => (
        <li key={r.qr_code_id}>
          <Link to={`/admin/qr/${r.qr_code_id}`} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface">
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                i === 0 ? 'bg-amber-100 text-amber-800' : i === 1 ? 'bg-slate-200 text-slate-700' : i === 2 ? 'bg-orange-100 text-orange-800' : 'bg-surface text-muted',
              )}
            >
              {i + 1}
            </span>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4" style={{ backgroundColor: `${color(r.type)}16`, color: color(r.type) }}>
              {icon(r.type)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold group-hover:text-signal">{r.name}</span>
              <span className="block truncate text-xs text-muted">
                {typeLabel(r.type)}
                {r.business_name ? ` · ${r.business_name}` : ''}
              </span>
              <span className="mt-1 block h-1.5 rounded-full bg-line/60">
                <span className="block h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${Math.max((r.scans / max) * 100, 3)}%` }} />
              </span>
            </span>
            <span className="w-14 shrink-0 text-right">
              <span className="block text-base font-bold tabular">{formatNumber(r.scans)}</span>
              <span className="block text-[0.7rem] text-muted">scans</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** One-hue ramp, light to dark: more scans, darker cell. */
const RAMP = ['#F1F5F9', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95']

/** When people scan: weekday × hour of day, in the browser's time zone. */
export function ScanHeatmap({ times }: { times: string[] }) {
  const [hover, setHover] = useState<string | null>(null)
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  for (const t of times) {
    const d = new Date(t)
    grid[(d.getDay() + 6) % 7][d.getHours()]++
  }
  const max = Math.max(0, ...grid.flat())
  if (!max) return <p className="py-10 text-center text-sm text-muted">No scans in this period.</p>
  const level = (n: number) => (n === 0 ? 0 : 1 + Math.min(RAMP.length - 2, Math.floor((n / max) * (RAMP.length - 1) - 0.0001)))
  let best = { day: 0, hour: 0, n: 0 }
  grid.forEach((row, day) => row.forEach((n, hour) => n > best.n && (best = { day, hour, n })))
  const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })
  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Busiest: <strong className="text-ink">{DAYS[best.day]} around {hourLabel(best.hour)}</strong>
        {hover && <span className="ml-2 text-ink">· {hover}</span>}
      </p>
      <div className="overflow-x-auto">
        <div className="grid min-w-[34rem] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-[3px]" onMouseLeave={() => setHover(null)}>
          {grid.map((row, day) => (
            <div key={day} className="contents">
              <span className="pr-1 text-right text-[0.7rem] leading-5 text-muted">{DAYS[day]}</span>
              {row.map((n, hour) => (
                <span
                  key={hour}
                  className="h-5 rounded-[4px]"
                  style={{ backgroundColor: RAMP[level(n)] }}
                  title={`${DAYS[day]} ${hourLabel(hour)}: ${n} scans`}
                  onMouseEnter={() => setHover(`${DAYS[day]} ${hourLabel(hour)}: ${n} ${n === 1 ? 'scan' : 'scans'}`)}
                />
              ))}
            </div>
          ))}
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center text-[0.65rem] text-muted">
              {h % 3 === 0 ? h : ''}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[0.7rem] text-muted">
        Fewer
        {RAMP.map((c) => (
          <span key={c} className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: c }} />
        ))}
        More
      </div>
    </div>
  )
}

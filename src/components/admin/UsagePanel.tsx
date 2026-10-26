import { AlertTriangle, CheckCircle2, HeartPulse } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/data'
import { Notice, Skeleton } from '@/components/ui/feedback'
import { adminUsage, type UsageInfo } from '@/lib/admin-api'
import { useQuery } from '@/lib/use-query'
import { cn, formatBytes, formatNumber, relativeTime } from '@/lib/utils'

/** Supabase Free plan limits (checked October 2026). */
export const FREE_LIMITS = {
  databaseBytes: 500 * 1024 * 1024,
  fileBytes: 1024 * 1024 * 1024,
}

/** The keep-alive job runs every 6 hours; more than 2 days of silence means it is not set up. */
const HEARTBEAT_STALE_MS = 2 * 24 * 60 * 60 * 1000

export interface UsageStatus {
  dbPct: number
  filePct: number
  heartbeatStale: boolean
  level: 'ok' | 'warning' | 'danger'
}

export function usageStatus(u: UsageInfo, now = Date.now()): UsageStatus {
  const dbPct = (u.database_bytes / FREE_LIMITS.databaseBytes) * 100
  const filePct = (u.file_bytes / FREE_LIMITS.fileBytes) * 100
  const heartbeatStale = !u.last_heartbeat || now - new Date(u.last_heartbeat).getTime() > HEARTBEAT_STALE_MS
  const top = Math.max(dbPct, filePct)
  const level = top >= 90 ? 'danger' : top >= 70 || heartbeatStale ? 'warning' : 'ok'
  return { dbPct, filePct, heartbeatStale, level }
}

function Meter({ label, used, limit, pct, hint }: { label: string; used: number; limit: number; pct: number; hint: string }) {
  const tone = pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-success'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted">
          {formatBytes(used)} of {formatBytes(limit)} ({pct < 1 ? '<1' : Math.round(pct)}%)
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-line"
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.min(100, Math.max(pct, 1))}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  )
}

export function UsagePanel() {
  const usage = useQuery(adminUsage, [])
  const u = usage.data
  const s = u ? usageStatus(u) : null
  return (
    <Card>
      <CardHeader title="Free plan usage" description="Stay inside these limits and nothing is restricted." />
      <div className="grid gap-5 p-5">
        {!u || !s ? (
          <Skeleton className="h-28" />
        ) : (
          <>
            <Meter
              label="Database"
              used={u.database_bytes}
              limit={FREE_LIMITS.databaseBytes}
              pct={s.dbPct}
              hint={`${formatNumber(u.raw_scan_rows)} recent scan records. Scans older than 90 days are combined into daily totals automatically.`}
            />
            <Meter
              label="File storage"
              used={u.file_bytes}
              limit={FREE_LIMITS.fileBytes}
              pct={s.filePct}
              hint={`${formatNumber(u.file_count)} files. Delete files you no longer use to free space.`}
            />
            <div className="flex items-start gap-3 rounded-lg bg-surface px-3.5 py-3 text-sm">
              {s.heartbeatStale ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              ) : (
                <HeartPulse className="mt-0.5 size-4 shrink-0 text-success" />
              )}
              <p>
                <span className="font-medium">Keep-alive: </span>
                {s.heartbeatStale ? (
                  <>
                    not running. Free projects pause after a week without activity. Set up the keep-alive job in{' '}
                    <code className="text-xs">docs/FREE_HOSTING.md</code>.
                  </>
                ) : (
                  <>
                    last ran {relativeTime(u.last_heartbeat)} ({u.heartbeat_source ?? 'unknown'}). The project will not be
                    paused.
                  </>
                )}
              </p>
            </div>
            <p className="text-xs text-muted">
              Monthly bandwidth (5 GB) is not visible here. Check it under Supabase → Usage. Compressed images and the
              optional file cache keep it low.
            </p>
          </>
        )}
      </div>
    </Card>
  )
}

/** Short banner for the overview page; renders nothing while all is well. */
export function UsageWarning() {
  const usage = useQuery(adminUsage, [])
  if (!usage.data) return null
  const s = usageStatus(usage.data)
  if (s.level === 'ok') return null
  const top = Math.max(s.dbPct, s.filePct)
  return (
    <Notice tone={s.level === 'danger' ? 'danger' : 'warning'} icon={s.level === 'danger' ? <AlertTriangle /> : <CheckCircle2 />} className="mb-6">
      {top >= 70
        ? `Free plan storage is ${Math.round(top)}% full. `
        : 'The keep-alive job has not run in the last two days, so the database could be paused after a week of inactivity. '}
      <Link to="/admin/settings" className="font-semibold text-signal hover:underline">
        See usage
      </Link>
    </Notice>
  )
}

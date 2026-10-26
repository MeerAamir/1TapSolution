import { History } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AuditLog } from '@/lib/types'
import { relativeTime } from '@/lib/utils'
import { auditLink, describeAudit } from './labels'

export function ActivityList({ logs }: { logs: AuditLog[] }) {
  if (!logs.length) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center text-sm text-muted">
        <History className="mb-2 size-5" />
        Changes made in the dashboard will appear here.
      </div>
    )
  }
  return (
    <ul className="divide-y divide-line">
      {logs.map((log) => {
        const href = auditLink(log)
        const text = describeAudit(log)
        return (
          <li key={log.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
            {href ? (
              <Link to={href} className="min-w-0 hover:text-signal">
                {text}
              </Link>
            ) : (
              <span className="min-w-0">{text}</span>
            )}
            <time dateTime={log.created_at} className="shrink-0 text-xs text-muted">
              {relativeTime(log.created_at)}
            </time>
          </li>
        )
      })}
    </ul>
  )
}

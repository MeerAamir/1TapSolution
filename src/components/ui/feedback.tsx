import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-line/70', className)} aria-hidden />
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-line" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-6 px-4 py-4">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-1/3' : 'w-1/6')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-signal-soft text-signal [&_svg]:size-6">
        {icon ?? <Inbox />}
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: {
  title?: string
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)} role="alert">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-danger-soft text-danger">
        <AlertTriangle className="size-6" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  )
}

export function Notice({
  tone = 'info',
  children,
  className,
  icon,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  children: ReactNode
  className?: string
  icon?: ReactNode
}) {
  const tones = {
    info: 'bg-signal-soft text-ink border-signal/20',
    warning: 'bg-warning-soft text-ink border-warning/25',
    danger: 'bg-danger-soft text-ink border-danger/25',
    success: 'bg-success-soft text-ink border-success/25',
  }
  return (
    <div className={cn('flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-relaxed', tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status" aria-label={label}>
      <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-line border-t-signal" />
    </div>
  )
}

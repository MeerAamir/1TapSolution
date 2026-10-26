import * as TabsPrimitive from '@radix-ui/react-tabs'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useEffect, useState, type ReactNode, type ThHTMLAttributes, type TdHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-xl border border-line bg-white', className)}>{children}</section>
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[0.95rem] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet'

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-ink/[0.06] text-ink/80',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-signal-soft text-signal-dark',
    violet: 'bg-violet/10 text-violet',
  }
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Lifecycle badge shared by businesses and QR codes. */
export function StatusBadge({ status, archivedAt }: { status: 'active' | 'inactive'; archivedAt?: string | null }) {
  if (archivedAt) return <Badge tone="neutral">Archived</Badge>
  return status === 'active' ? (
    <Badge tone="success">
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      Active
    </Badge>
  ) : (
    <Badge tone="warning">Inactive</Badge>
  )
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)}>{children}</table>
    </div>
  )
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'border-b border-line bg-surface/60 px-4 py-2.5 text-left text-xs font-semibold text-muted whitespace-nowrap',
        className,
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-line px-4 py-3 align-middle', className)} {...props} />
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const from = page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  return (
    <nav className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted" aria-label="Pagination">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => onPageChange(page - 1)} disabled={page === 0} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="tabular px-2">
          Page {page + 1} of {pages}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages - 1}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  )
}

/** Search box with built-in debounce. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  delay = 300,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  delay?: number
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (draft === value) return
    const t = setTimeout(() => onChange(draft), delay)
    return () => clearTimeout(t)
  }, [draft, value, delay, onChange])
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-md border border-line-strong bg-white pl-9 pr-9 text-sm placeholder:text-muted/70 focus:border-signal focus:outline-none focus:ring-3 focus:ring-signal/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft('')
            onChange('')
          }}
          className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted hover:bg-ink/5"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export const Tabs = TabsPrimitive.Root

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.List className={cn('flex gap-1 overflow-x-auto border-b border-line', className)}>
      {children}
    </TabsPrimitive.List>
  )
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink data-[state=active]:border-signal data-[state=active]:text-ink"
    >
      {children}
    </TabsPrimitive.Trigger>
  )
}

export const TabsContent = TabsPrimitive.Content

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  back?: ReactNode
}) {
  return (
    <header className="mb-6">
      {back && <div className="mb-3">{back}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.015em] text-ink">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function StatTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>{label}</span>
        {icon && <span className="text-muted/70 [&_svg]:size-4">{icon}</span>}
      </div>
      <div className="mt-2 text-[1.65rem] font-bold leading-none tracking-[-0.02em] tabular">{value}</div>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </div>
  )
}

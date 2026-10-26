import type { ReactNode } from 'react'
import { LogoMark } from '@/components/brand/Logo'
import { cn, readableOn } from '@/lib/utils'

/** Large, touch-friendly action button tinted with the business accent colour. */
export function ActionLink({
  href,
  accent,
  children,
  external,
  variant = 'solid',
  className,
  download,
}: {
  href: string
  accent: string
  children: ReactNode
  external?: boolean
  variant?: 'solid' | 'outline' | 'tile'
  className?: string
  download?: boolean
}) {
  const style =
    variant === 'solid'
      ? { backgroundColor: accent, color: readableOn(accent) }
      : variant === 'tile'
        ? { color: accent }
        : { color: accent, boxShadow: `inset 0 0 0 1.5px ${accent}40` }
  return (
    <a
      href={href}
      style={style}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      download={download || undefined}
      className={cn(
        'flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[0.95rem] font-semibold transition-[filter,transform] active:scale-[0.99] hover:brightness-95 [&_svg]:size-[1.15rem] [&_svg]:shrink-0',
        variant === 'outline' && 'bg-white',
        variant === 'tile' && 'min-h-[4.5rem] flex-col gap-1.5 bg-white text-[0.8rem] ring-1 ring-line',
        className,
      )}
    >
      {children}
    </a>
  )
}

export function Section({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('grid gap-3', className)}>
      {title && <h2 className="text-[0.95rem] font-semibold text-ink">{title}</h2>}
      {children}
    </section>
  )
}

export function PoweredBy() {
  return (
    <footer className="flex items-center justify-center gap-2 py-8 text-xs text-muted">
      <a href="/" className="inline-flex items-center gap-1.5 rounded hover:text-ink">
        <LogoMark className="size-4" /> Powered by 1 Tap Solution
      </a>
    </footer>
  )
}

export function DemoRibbon() {
  return (
    <div className="bg-midnight px-4 py-2 text-center text-xs font-medium text-white/85">
      Demonstration page with sample content. Not a real business.
    </div>
  )
}

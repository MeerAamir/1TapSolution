import type { ReactNode } from 'react'
import { LogoMark } from '@/components/brand/Logo'
import { cn, readableOn } from '@/lib/utils'
import { SHAPE_CLASS, usePageTheme } from './PageTheme'

type ActionVariant = 'solid' | 'outline' | 'tile'

/** Shared look of page buttons: follows the page style when there is one. */
function useActionLook(accent: string, variant: ActionVariant, className?: string) {
  const theme = usePageTheme()
  // On a styled page every button follows the page's button style and colour.
  const look = theme && variant !== 'tile' ? (variant === 'solid' ? 'solid' : theme.buttonStyle) : null
  const fill = theme ? theme.buttonColor : accent
  const style = look
    ? look === 'solid'
      ? { backgroundColor: fill, color: theme!.buttonTextColor }
      : look === 'soft'
        ? { backgroundColor: theme!.dark ? 'rgba(255,255,255,0.14)' : `${fill}1A`, color: fill }
        : { backgroundColor: theme!.dark ? 'rgba(255,255,255,0.06)' : '#FFFFFF', color: fill, boxShadow: `inset 0 0 0 1.5px ${fill}${theme!.dark ? '99' : '40'}` }
    : variant === 'solid'
      ? { backgroundColor: accent, color: readableOn(accent) }
      : variant === 'tile'
        ? { color: accent }
        : { color: accent, boxShadow: `inset 0 0 0 1.5px ${accent}40` }
  return {
    style,
    className: cn(
      'flex min-h-12 w-full items-center justify-center gap-2 px-4 text-[0.95rem] font-semibold transition-[filter,transform] active:scale-[0.99] hover:brightness-95 [&_svg]:size-[1.15rem] [&_svg]:shrink-0',
      theme && variant !== 'tile' ? SHAPE_CLASS[theme.buttonShape] : 'rounded-xl',
      variant === 'outline' && !look && 'bg-white',
      variant === 'tile' && 'min-h-[4.5rem] flex-col gap-1.5 bg-white text-[0.8rem] ring-1 ring-line',
      className,
    ),
  }
}

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
  variant?: ActionVariant
  className?: string
  download?: boolean
}) {
  const look = useActionLook(accent, variant, className)
  return (
    <a
      href={href}
      style={look.style}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      download={download || undefined}
      className={look.className}
    >
      {children}
    </a>
  )
}

/** Same look as ActionLink for actions that are not links (expand, copy, save). */
export function ActionButton({
  accent,
  children,
  variant = 'solid',
  className,
  onClick,
  ...aria
}: {
  accent: string
  children: ReactNode
  variant?: ActionVariant
  className?: string
  onClick: () => void
  'aria-expanded'?: boolean
}) {
  const look = useActionLook(accent, variant, className)
  return (
    <button type="button" onClick={onClick} style={look.style} className={look.className} {...aria}>
      {children}
    </button>
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
    <footer className="t-text flex items-center justify-center gap-2 py-8 text-xs text-muted opacity-80">
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

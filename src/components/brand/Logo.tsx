import { cn } from '@/lib/utils'

/**
 * 1 TAP SOLUTION mark: a QR finder pattern (the corner square every scanner
 * locks onto) with a violet "tap" point breaking out of its corner, separated
 * by a knockout gap: scan, tap, connected.
 */
export function LogoMark({
  className,
  tone = 'dark',
  title = '1 TAP SOLUTION',
}: {
  className?: string
  tone?: 'dark' | 'light'
  title?: string
}) {
  const ink = tone === 'dark' ? 'var(--color-midnight)' : '#FFFFFF'
  const gap = tone === 'dark' ? 'var(--logo-gap, #FFFFFF)' : 'var(--logo-gap, var(--color-midnight))'
  return (
    <svg viewBox="0 0 40 40" className={cn('h-8 w-8 shrink-0', className)} role="img" aria-label={title}>
      <rect x="3" y="3" width="24" height="24" rx="7" fill="none" stroke={ink} strokeWidth="5" />
      <rect x="11" y="11" width="8" height="8" rx="2.2" fill={ink} />
      <circle cx="30" cy="30" r="9.5" fill={gap} />
      <circle cx="30" cy="30" r="6.5" fill="var(--color-violet)" />
    </svg>
  )
}

export function Logo({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark tone={tone} />
      <span
        className={cn(
          'text-[1.05rem] font-bold leading-none tracking-[-0.01em]',
          tone === 'dark' ? 'text-midnight' : 'text-white',
        )}
      >
        1 Tap Solution
      </span>
    </span>
  )
}

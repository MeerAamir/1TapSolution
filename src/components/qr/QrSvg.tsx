import { useMemo } from 'react'
import type { QrDesign } from '@/lib/qr/design'
import { DEFAULT_DESIGN } from '@/lib/qr/design'
import { renderSvg } from '@/lib/qr/render'
import { cn } from '@/lib/utils'

/**
 * Renders a real, scannable QR code inline. The SVG markup is generated
 * locally by our renderer (all text is XML-escaped), never from user HTML.
 */
export function QrSvg({
  text,
  design = DEFAULT_DESIGN,
  businessName,
  logoDataUrl,
  className,
  label,
}: {
  text: string
  design?: QrDesign
  businessName?: string
  logoDataUrl?: string
  className?: string
  label?: string
}) {
  const svg = useMemo(() => {
    try {
      return renderSvg(text, design, { businessName, logoDataUrl }).replace(/ width="[\d.]+" height="[\d.]+"/, ' width="100%" height="100%"')
    } catch {
      return null
    }
  }, [text, design, businessName, logoDataUrl])

  if (!svg) {
    return (
      <div className={cn('grid aspect-square place-items-center rounded-lg bg-danger-soft text-center text-xs text-danger', className)}>
        This content is too long for a QR code.
      </div>
    )
  }
  return (
    <div
      role="img"
      aria-label={label ?? `QR code for ${text}`}
      className={cn('[&>svg]:block [&>svg]:h-auto [&>svg]:w-full', className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

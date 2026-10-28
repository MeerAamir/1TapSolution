import { z } from 'zod'

/** Visual design of a QR code. Stored in qr_codes.design (jsonb). */
export const qrDesignSchema = z.object({
  fg: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0B1020'),
  bg: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#FFFFFF'),
  eyeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  dots: z.enum(['square', 'rounded', 'dots']).default('square'),
  eyes: z.enum(['square', 'rounded', 'circle']).default('square'),
  ecl: z.enum(['L', 'M', 'Q', 'H']).default('M'),
  logo: z.boolean().default(false),
  /** The image used as the centre logo (a public file). */
  logoFileId: z.string().uuid().optional(),
  logoScale: z.number().min(0.12).max(0.26).default(0.2),
  frame: z.boolean().default(false),
  cta: z.string().max(32).optional(),
  showName: z.boolean().default(false),
  border: z.boolean().default(false),
})

export type QrDesign = z.infer<typeof qrDesignSchema>

export const DEFAULT_DESIGN: QrDesign = qrDesignSchema.parse({})

/** Tolerant parse of whatever is stored in the database. */
export function parseDesign(raw: unknown): QrDesign {
  const result = qrDesignSchema.safeParse(raw ?? {})
  return result.success ? result.data : DEFAULT_DESIGN
}

/** The error-correction level actually used: a centre logo always gets at least Q. */
export function effectiveEcl(design: QrDesign): QrDesign['ecl'] {
  if (design.logo && (design.ecl === 'L' || design.ecl === 'M')) return 'Q'
  return design.ecl
}

function channel(hex: string, i: number): number {
  const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2)
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export interface DesignWarning {
  level: 'warning' | 'danger'
  message: string
}

/** Scan-reliability checks shown next to the preview. */
export function designWarnings(design: QrDesign): DesignWarning[] {
  const warnings: DesignWarning[] = []
  const ratio = contrastRatio(design.fg, design.bg)
  if (ratio < 3) {
    warnings.push({
      level: 'danger',
      message: `Contrast is very low (${ratio.toFixed(1)}:1). Many phones will not read this code. Aim for 7:1 or more.`,
    })
  } else if (ratio < 7) {
    warnings.push({
      level: 'warning',
      message: `Contrast is ${ratio.toFixed(1)}:1. Dark modules on a light background at 7:1 or more scan most reliably.`,
    })
  }
  if (luminance(design.fg) > luminance(design.bg)) {
    warnings.push({
      level: 'warning',
      message: 'Light code on a dark background (inverted) is not supported by some older scanners.',
    })
  }
  if (design.eyeColor && contrastRatio(design.eyeColor, design.bg) < 3) {
    warnings.push({ level: 'danger', message: 'The corner markers do not stand out from the background.' })
  }
  if (design.logo && design.logoScale > 0.22) {
    warnings.push({ level: 'warning', message: 'A large logo hides more of the code. Keep it small and test before printing.' })
  }
  if (design.logo && (design.ecl === 'L' || design.ecl === 'M')) {
    warnings.push({
      level: 'warning',
      message: 'Error correction was raised to Q because the code has a logo in the centre.',
    })
  }
  if (design.dots === 'dots' && design.logo) {
    warnings.push({ level: 'warning', message: 'Round dots with a logo reduce the margin for error. Print a test first.' })
  }
  return warnings
}

import { createContext, useContext, useEffect, type CSSProperties, type ReactNode } from 'react'
import { storagePublicUrl } from '@/config'
import { luminance } from '@/lib/qr/design'
import type { PageFont, PageTheme } from '@/lib/qr/types'
import type { PublicFile } from '@/lib/types'
import { cn, readableOn } from '@/lib/utils'

/** The theme as visitors receive it: the background picture is resolved to a file. */
export type PublicTheme = Omit<PageTheme, 'bg_image_file_id'> & { bg_image?: PublicFile | null }

export const PAGE_FONTS: Record<PageFont, { label: string; family: string; google?: string; headingsOnly?: boolean }> = {
  inter: { label: 'Clean (default)', family: 'var(--font-sans)' },
  poppins: { label: 'Poppins', family: "'Poppins', sans-serif", google: 'Poppins:wght@400;500;600;700' },
  montserrat: { label: 'Montserrat', family: "'Montserrat', sans-serif", google: 'Montserrat:wght@400;500;600;700' },
  nunito: { label: 'Nunito (friendly)', family: "'Nunito', sans-serif", google: 'Nunito:wght@400;600;700;800' },
  playfair: { label: 'Playfair (elegant)', family: "'Playfair Display', serif", google: 'Playfair+Display:wght@400;600;700' },
  lora: { label: 'Lora (classic)', family: "'Lora', serif", google: 'Lora:wght@400;600;700' },
  merriweather: { label: 'Merriweather', family: "'Merriweather', serif", google: 'Merriweather:wght@400;700' },
  'roboto-slab': { label: 'Roboto Slab', family: "'Roboto Slab', serif", google: 'Roboto+Slab:wght@400;600;700' },
  oswald: { label: 'Oswald (bold titles)', family: "'Oswald', sans-serif", google: 'Oswald:wght@500;600;700', headingsOnly: true },
  dancing: { label: 'Dancing Script (handwritten titles)', family: "'Dancing Script', cursive", google: 'Dancing+Script:wght@600;700', headingsOnly: true },
}

const loaded = new Set<string>()
function useGoogleFont(font: PageFont | undefined) {
  useEffect(() => {
    const f = font ? PAGE_FONTS[font] : undefined
    if (!f?.google || loaded.has(f.google)) return
    loaded.add(f.google)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`
    document.head.appendChild(link)
  }, [font])
}

export interface ResolvedTheme {
  accent: string
  /** Accent that stays readable inside white cards (a white accent is not). */
  cardAccent: string
  dark: boolean
  buttonStyle: 'solid' | 'outline' | 'soft'
  buttonShape: 'rounded' | 'pill' | 'square'
  buttonColor: string
  buttonTextColor: string
}

export const PageThemeContext = createContext<ResolvedTheme | null>(null)
export const usePageTheme = () => useContext(PageThemeContext)

export const SHAPE_CLASS = { rounded: 'rounded-xl', pill: 'rounded-full', square: 'rounded-md' } as const

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

/** The page colour for text and buttons on white cards: never too pale to read. */
export function safeAccent(theme: PublicTheme | null | undefined, accent: string): string {
  const a = isHex(theme?.accent) ? theme!.accent! : accent
  if (luminance(a) <= 0.6) return a
  for (const c of [theme?.button_text_color, theme?.title_color, theme?.bg_color, theme?.bg_color2]) if (isHex(c) && luminance(c) < 0.4) return c
  return '#0F172A'
}

/**
 * Inside a white card the page's button look (e.g. white buttons on a dark
 * gradient) would vanish, so cards use plain buttons in the card accent.
 */
export function CardScope({ children }: { children: ReactNode }) {
  return <PageThemeContext.Provider value={null}>{children}</PageThemeContext.Provider>
}

export function useCardAccent(accent: string): string {
  return usePageTheme()?.cardAccent ?? accent
}

function background(t: PublicTheme, accent: string): { style: CSSProperties; dark: boolean } {
  switch (t.bg_type) {
    case 'solid': {
      const c = isHex(t.bg_color) ? t.bg_color : '#F8FAFC'
      return { style: { backgroundColor: c }, dark: luminance(c) < 0.3 }
    }
    case 'gradient': {
      const a = isHex(t.bg_color) ? t.bg_color : accent
      const b = isHex(t.bg_color2) ? t.bg_color2 : '#F8FAFC'
      const angle = typeof t.bg_angle === 'number' ? t.bg_angle : 160
      return { style: { backgroundImage: `linear-gradient(${angle}deg, ${a}, ${b})` }, dark: (luminance(a) + luminance(b)) / 2 < 0.3 }
    }
    case 'image': {
      if (t.bg_image?.path) {
        const o = typeof t.bg_overlay === 'number' ? t.bg_overlay : 0.35
        const url = encodeURI(storagePublicUrl(t.bg_image.path, t.bg_image.version))
        return {
          style: {
            backgroundColor: '#0F172A',
            backgroundImage: `linear-gradient(rgba(0,0,0,${o}), rgba(0,0,0,${o})), url("${url}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          },
          dark: o >= 0.3,
        }
      }
      break
    }
  }
  return { style: { backgroundColor: '#F8FAFC', backgroundImage: `linear-gradient(180deg, ${accent}1F 0, transparent 22rem)` }, dark: false }
}

/**
 * Applies a page style: background (soft tint, colour, gradient or picture),
 * fonts, title/text colours and button look. Text colours default to readable
 * ones for the background chosen.
 */
export function ThemeShell({
  theme,
  accent: fallbackAccent,
  children,
  className,
}: {
  theme?: PublicTheme | null
  accent: string
  children: ReactNode
  className?: string
}) {
  const t = theme ?? {}
  const accent = isHex(t.accent) ? t.accent : fallbackAccent
  useGoogleFont(t.font)
  const bg = background(t, accent)
  const font = PAGE_FONTS[t.font ?? 'inter'] ?? PAGE_FONTS.inter
  const buttonColor = isHex(t.button_color) ? t.button_color : bg.dark && t.button_style !== 'solid' ? '#FFFFFF' : accent
  const resolved: ResolvedTheme = {
    accent,
    cardAccent: safeAccent(t, accent),
    dark: bg.dark,
    buttonStyle: t.button_style ?? 'outline',
    buttonShape: t.button_shape ?? 'rounded',
    buttonColor,
    buttonTextColor: isHex(t.button_text_color) ? t.button_text_color : readableOn(buttonColor),
  }
  const vars = {
    '--page-title': isHex(t.title_color) ? t.title_color : bg.dark ? '#FFFFFF' : '#0F172A',
    '--page-text': isHex(t.text_color) ? t.text_color : bg.dark ? 'rgba(255,255,255,0.86)' : 'rgba(15,23,42,0.78)',
    '--page-font': font.headingsOnly ? 'var(--font-sans)' : font.family,
    '--page-title-font': font.family,
    '--page-accent': accent,
  } as CSSProperties
  return (
    <PageThemeContext.Provider value={resolved}>
      <div className={cn('themed min-h-full', className)} style={{ ...bg.style, ...vars }}>
        {children}
      </div>
    </PageThemeContext.Provider>
  )
}

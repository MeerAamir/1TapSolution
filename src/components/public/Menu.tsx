import { ChevronDown, ExternalLink, FileText, Flame, Leaf, Sparkles, Star, UtensilsCrossed } from 'lucide-react'
import { useState } from 'react'
import { storagePublicUrl } from '@/config'
import type { MenuItem, MenuTag } from '@/lib/qr/types'
import type { PublicFile } from '@/lib/types'
import { cn } from '@/lib/utils'
import { documentUrls } from './Blocks'
import { useCardAccent } from './PageTheme'
import { ActionButton, ActionLink } from './primitives'

/** Menu data as visitors receive it (file ids resolved to files). */
export interface PublicMenu {
  mode: 'items' | 'pdf' | 'images' | 'link'
  title?: string
  note?: string
  currency?: string
  label?: string
  sections?: Array<{ name?: string; items: MenuItem[] }>
  file?: PublicFile | null
  files?: PublicFile[]
  url?: string
}

const TAGS: Record<MenuTag, { label: string; className: string; icon?: typeof Leaf }> = {
  veg: { label: 'Veg', className: 'border-green-600 text-green-700' },
  non_veg: { label: 'Non-veg', className: 'border-red-600 text-red-700' },
  vegan: { label: 'Vegan', className: 'border-emerald-600 text-emerald-700', icon: Leaf },
  spicy: { label: 'Spicy', className: 'border-orange-500 text-orange-600', icon: Flame },
  new: { label: 'New', className: 'border-sky-600 text-sky-700', icon: Sparkles },
  popular: { label: 'Popular', className: 'border-amber-500 text-amber-700', icon: Star },
}

function TagBadge({ tag }: { tag: MenuTag }) {
  const t = TAGS[tag]
  if (!t) return null
  if (tag === 'veg' || tag === 'non_veg') {
    // The familiar Indian food mark: a dot in a square, green for veg, red for non-veg.
    return (
      <span title={t.label} aria-label={t.label} className={cn('inline-grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border-[1.5px]', t.className)}>
        <span className={cn('h-1.5 w-1.5 rounded-full', tag === 'veg' ? 'bg-green-600' : 'bg-red-600')} />
      </span>
    )
  }
  const Icon = t.icon
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full border px-1.5 text-[0.68rem] font-semibold', t.className)}>
      {Icon && <Icon className="size-3" />} {t.label}
    </span>
  )
}

function price(p: string | undefined, currency?: string) {
  if (!p) return ''
  return /^[0-9.,\s]+$/.test(p) ? `${currency || '₹'}${p.trim()}` : p
}

function ItemsMenu({ menu, accent: pageAccent, compact }: { menu: PublicMenu; accent: string; compact?: boolean }) {
  const accent = useCardAccent(pageAccent)
  const sections = menu.sections ?? []
  return (
    <div className="grid gap-5">
      {!compact && sections.length > 1 && (
        <nav aria-label="Menu sections" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {sections.map((s, i) =>
            s.name ? (
              <a
                key={i}
                href={`#menu-${i}`}
                className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-semibold ring-1 ring-line"
                style={{ color: accent }}
              >
                {s.name}
              </a>
            ) : null,
          )}
        </nav>
      )}
      {sections.map((s, i) => (
        <section key={i} id={`menu-${i}`} className="scroll-mt-4">
          {s.name && <h3 className="t-title mb-2 text-lg font-bold">{s.name}</h3>}
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
            {s.items.map((item, j) => (
              <li key={j} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                    {item.tag && <TagBadge tag={item.tag} />}
                    <span>{item.name}</span>
                  </p>
                  {item.description && <p className="mt-0.5 text-sm leading-snug text-muted">{item.description}</p>}
                </div>
                {item.price && (
                  <span className="shrink-0 font-semibold tabular" style={{ color: accent }}>
                    {price(item.price, menu.currency)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function PhotoMenu({ files }: { files: PublicFile[] }) {
  return (
    <div className="grid gap-3">
      {files.map((f, i) => (
        <a key={f.id} href={storagePublicUrl(f.path, f.version)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl bg-white ring-1 ring-line">
          <img src={storagePublicUrl(f.path, f.version)} alt={`Menu page ${i + 1}`} loading={i ? 'lazy' : 'eager'} decoding="async" className="h-auto w-full" />
        </a>
      ))}
    </div>
  )
}

/** A full menu page (a menu QR code) or the expanded menu inside a page item. */
export function MenuContent({ menu, accent, compact }: { menu: PublicMenu; accent: string; compact?: boolean }) {
  switch (menu.mode) {
    case 'items':
      return <ItemsMenu menu={menu} accent={accent} compact={compact} />
    case 'images':
      return menu.files?.length ? <PhotoMenu files={menu.files} /> : null
    case 'pdf': {
      if (!menu.file) return null
      const urls = documentUrls(menu.file)
      return (
        <div className="grid gap-3">
          <ActionLink href={urls.view} accent={accent} external variant="solid">
            <FileText /> Open the menu (PDF)
          </ActionLink>
          {!compact && (
            <div className="hidden overflow-hidden rounded-2xl border border-line bg-white md:block">
              <iframe src={urls.view} title={menu.title || 'Menu'} className="h-[75vh] w-full" loading="lazy" />
            </div>
          )}
        </div>
      )
    }
    case 'link':
      return menu.url ? (
        <ActionLink href={menu.url} accent={accent} external variant="solid">
          <ExternalLink /> Open the menu
        </ActionLink>
      ) : null
  }
}

/** Menu as an item on a multi-link page: a button that opens the menu in place. */
export function MenuBlock({ menu, accent }: { menu: PublicMenu; accent: string }) {
  const [open, setOpen] = useState(false)
  const label = menu.label || menu.title || 'Menu'
  if (menu.mode === 'link' && menu.url) {
    return (
      <ActionLink href={menu.url} accent={accent} external variant="outline">
        <UtensilsCrossed /> {label}
      </ActionLink>
    )
  }
  if (menu.mode === 'pdf' && menu.file) {
    return (
      <ActionLink href={documentUrls(menu.file).view} accent={accent} external variant="outline">
        <UtensilsCrossed /> {label}
      </ActionLink>
    )
  }
  return (
    <div className="grid gap-3">
      <ActionButton accent={accent} variant="outline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <UtensilsCrossed /> {label}
        <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
      </ActionButton>
      {open && (
        <div className="grid gap-3">
          {menu.note && <p className="t-text text-sm">{menu.note}</p>}
          <MenuContent menu={menu} accent={accent} compact />
        </div>
      )}
    </div>
  )
}

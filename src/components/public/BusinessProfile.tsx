import { Clock, Globe, Mail, MapPin, MessageCircle, Navigation, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import { storagePublicUrl } from '@/config'
import { mailtoLink, mapsLink, telLink, whatsappLink } from '@/lib/qr/destinations'
import { SOCIAL_LABELS } from '@/lib/qr/types'
import type { PublicBusiness } from '@/lib/types'
import { DAY_NAMES, isoWeekday } from '@/lib/utils'
import { BlockList, DocumentRow, Gallery } from './Blocks'
import { ActionLink, DemoRibbon, PoweredBy, Section } from './primitives'
import { SocialIcon } from './SocialIcon'

/** Opening state in the visitor's local time (visitors are usually on site). */
export function openState(hours: PublicBusiness['hours'], now = new Date()): { open: boolean; label: string } | null {
  if (!hours?.length) return null
  const day = isoWeekday(now)
  const minutes = now.getHours() * 60 + now.getMinutes()
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  for (const h of hours.filter((x) => x.day === day)) {
    const o = toMin(h.opens)
    let c = toMin(h.closes)
    if (c <= o) c += 24 * 60 // closes after midnight
    if (minutes >= o && minutes < c) return { open: true, label: `Open until ${h.closes}` }
  }
  // Still open from yesterday's late shift?
  for (const h of hours.filter((x) => x.day === (day + 6) % 7)) {
    if (toMin(h.closes) <= toMin(h.opens) && minutes < toMin(h.closes)) return { open: true, label: `Open until ${h.closes}` }
  }
  const later = hours.filter((x) => x.day === day && toMin(x.opens) > minutes).sort((a, b) => a.opens.localeCompare(b.opens))[0]
  return { open: false, label: later ? `Closed, opens at ${later.opens}` : 'Closed today' }
}

function HoursTable({ hours, note }: { hours: NonNullable<PublicBusiness['hours']>; note?: string }) {
  const today = isoWeekday(new Date())
  return (
    <div className="rounded-xl border border-line bg-white">
      <dl className="divide-y divide-line text-sm">
        {DAY_NAMES.map((name, day) => {
          const slots = hours.filter((h) => h.day === day)
          return (
            <div key={name} className={`flex justify-between gap-4 px-4 py-2.5 ${day === today ? 'font-semibold text-ink' : 'text-ink/80'}`}>
              <dt>{name}</dt>
              <dd className="tabular text-right">{slots.length ? slots.map((s) => `${s.opens}–${s.closes}`).join(', ') : 'Closed'}</dd>
            </div>
          )
        })}
      </dl>
      {note && <p className="border-t border-line px-4 py-2.5 text-xs text-muted">{note}</p>}
    </div>
  )
}

/**
 * The customer-facing business page. Only configured fields are shown; nothing
 * renders a placeholder for missing data. Used by /q/<code>, /b/<slug> and the
 * dashboard preview.
 */
export function BusinessProfile({
  business,
  children,
  hideProfileBlocks,
}: {
  business: PublicBusiness
  /** Extra content (e.g. landing-page blocks) shown above the profile details. */
  children?: ReactNode
  hideProfileBlocks?: boolean
}) {
  const accent = business.accent_color || '#2563EB'
  const primaryLocation = business.locations?.[0]
  const directions = primaryLocation ? mapsLink(primaryLocation) : null
  const status = openState(business.hours)

  const actions: ReactNode[] = []
  if (business.phone)
    actions.push(
      <ActionLink key="call" href={telLink(business.phone)} accent={accent} variant="tile">
        <Phone /> Call
      </ActionLink>,
    )
  if (business.whatsapp)
    actions.push(
      <ActionLink key="wa" href={whatsappLink(business.whatsapp)} accent={accent} variant="tile" external>
        <MessageCircle /> WhatsApp
      </ActionLink>,
    )
  if (directions)
    actions.push(
      <ActionLink key="dir" href={directions} accent={accent} variant="tile" external>
        <Navigation /> Directions
      </ActionLink>,
    )
  if (business.website_url)
    actions.push(
      <ActionLink key="web" href={business.website_url} accent={accent} variant="tile" external>
        <Globe /> Website
      </ActionLink>,
    )
  if (business.email && actions.length < 4)
    actions.push(
      <ActionLink key="mail" href={mailtoLink(business.email)} accent={accent} variant="tile">
        <Mail /> Email
      </ActionLink>,
    )

  const social = [
    ...(business.social_links ?? []),
    ...(business.google_business_url && !business.social_links?.some((s) => s.platform === 'google_business')
      ? [{ platform: 'google_business' as const, url: business.google_business_url, label: undefined }]
      : []),
  ]

  return (
    <div className="min-h-dvh bg-surface">
      {business.is_demo && <DemoRibbon />}
      <div className="mx-auto max-w-xl">
        {/* Header */}
        <header className="relative">
          {business.cover ? (
            <img
              src={storagePublicUrl(business.cover.path, business.cover.version)}
              alt=""
              className="h-44 w-full object-cover sm:h-52 sm:rounded-b-2xl"
              fetchPriority="high"
            />
          ) : (
            <div
              className="h-28 w-full sm:rounded-b-2xl"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}CC)` }}
              aria-hidden
            />
          )}
          <div className="px-5">
            <div className="-mt-10 flex items-end gap-4">
              {business.logo ? (
                <img
                  src={storagePublicUrl(business.logo.path, business.logo.version)}
                  alt={`${business.name} logo`}
                  className="h-20 w-20 rounded-2xl bg-white object-contain p-1.5 shadow-raise ring-4 ring-surface"
                />
              ) : (
                <div
                  className="grid h-20 w-20 place-items-center rounded-2xl text-2xl font-bold shadow-raise ring-4 ring-surface"
                  style={{ backgroundColor: '#fff', color: accent }}
                  aria-hidden
                >
                  {business.name.replace(/\(demo\)/i, '').trim().charAt(0)}
                </div>
              )}
            </div>
            <h1 className="mt-4 text-[1.65rem] font-bold leading-tight tracking-[-0.02em] text-ink">{business.name}</h1>
            {business.tagline && <p className="mt-1 text-[0.97rem] text-ink/70">{business.tagline}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              {business.category && <span className="text-muted">{business.category}</span>}
              {status && (
                <span className={`inline-flex items-center gap-1.5 font-medium ${status.open ? 'text-success' : 'text-muted'}`}>
                  <Clock className="size-3.5" /> {status.label}
                </span>
              )}
            </div>
          </div>
        </header>

        <main className="grid gap-7 px-5 pt-6">
          {actions.length > 0 && (
            <nav aria-label="Contact" className={`grid gap-2 ${actions.length >= 4 ? 'grid-cols-4' : actions.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {actions.slice(0, 4)}
            </nav>
          )}

          {children}

          {business.description && (
            <Section title="About">
              <p className="whitespace-pre-line text-[0.97rem] leading-relaxed text-ink/85">{business.description}</p>
            </Section>
          )}

          {!!business.documents?.length && (
            <Section title="Documents">
              <div className="grid gap-2">
                {business.documents.map((f) => (
                  <DocumentRow key={f.id} file={f} accent={accent} />
                ))}
              </div>
            </Section>
          )}

          {!hideProfileBlocks && !!business.blocks?.length && <BlockList blocks={business.blocks} accent={accent} />}

          {!!business.hours?.length && (
            <Section title="Opening hours">
              <HoursTable hours={business.hours} note={business.hours_note} />
            </Section>
          )}
          {!business.hours?.length && business.hours_note && (
            <Section title="Opening hours">
              <p className="text-sm text-ink/80">{business.hours_note}</p>
            </Section>
          )}

          {!!business.locations?.length && (
            <Section title={business.locations.length > 1 ? 'Locations' : 'Location'}>
              <div className="grid gap-2">
                {business.locations.map((loc, i) => {
                  const href = mapsLink(loc)
                  return (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-line bg-white p-3.5">
                      <MapPin className="mt-0.5 size-5 shrink-0" style={{ color: accent }} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{loc.label}</p>
                        {loc.address && <p className="text-sm text-muted">{loc.address}</p>}
                      </div>
                      {href && (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-sm font-semibold" style={{ color: accent }}>
                          Directions
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {!!business.gallery?.length && (
            <Section title="Photos">
              <Gallery files={business.gallery} />
            </Section>
          )}

          {!!business.custom_fields?.length && (
            <Section title="Good to know">
              <dl className="divide-y divide-line rounded-xl border border-line bg-white text-sm">
                {business.custom_fields.map((f, i) => (
                  <div key={i} className="flex justify-between gap-4 px-4 py-2.5">
                    <dt className="text-muted">{f.label}</dt>
                    <dd className="text-right font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {social.length > 0 && (
            <Section title="Follow">
              <div className="flex flex-wrap gap-2">
                {social.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-line hover:ring-line-strong"
                  >
                    <SocialIcon platform={s.platform} className="size-[1.1rem]" />
                    {s.label || SOCIAL_LABELS[s.platform]}
                  </a>
                ))}
              </div>
            </Section>
          )}

          {(business.email || business.phone) && (
            <Section title="Contact">
              <div className="grid gap-1 text-sm">
                {business.phone && (
                  <a href={telLink(business.phone)} className="font-medium hover:underline">
                    {business.phone}
                  </a>
                )}
                {business.email && (
                  <a href={mailtoLink(business.email)} className="font-medium hover:underline">
                    {business.email}
                  </a>
                )}
              </div>
            </Section>
          )}
        </main>
        <PoweredBy />
      </div>
    </div>
  )
}

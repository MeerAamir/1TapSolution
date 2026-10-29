import { Download, ExternalLink, FileText, Mail, MessageCircle, Phone, UserPlus, UtensilsCrossed, Wifi } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { LogoMark } from '@/components/brand/Logo'
import { storagePublicUrl } from '@/config'
import { mailtoLink, redirectUrlFor, telLink, whatsappLink } from '@/lib/qr/destinations'
import { CopyButton, downloadVcard } from './actions'
import type { DestinationByType, PaymentData } from '@/lib/qr/types'
import type { PublicBusiness, PublicFile, PublicQrPayload } from '@/lib/types'
import { formatBytes, formatDate } from '@/lib/utils'
import { BlockList, documentUrls } from './Blocks'
import { BusinessProfile } from './BusinessProfile'
import { LandingView } from './LandingView'
import { MenuContent, type PublicMenu } from './Menu'
import { safeAccent, ThemeShell, type PublicTheme } from './PageTheme'
import { PaymentCard } from './Payment'
import { ActionLink, DemoRibbon, PoweredBy } from './primitives'

/** Small branded shell for single-purpose QR pages (call, email, document, card). */
function FocusShell({
  business,
  theme,
  accent,
  children,
}: {
  business?: PublicBusiness
  theme?: PublicTheme | null
  accent: string
  children: ReactNode
}) {
  return (
    <ThemeShell theme={theme} accent={accent}>
      <div className="flex min-h-dvh flex-col">
        {business?.is_demo && <DemoRibbon />}
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">{children}</main>
        <PoweredBy />
      </div>
    </ThemeShell>
  )
}

function BusinessMini({ business }: { business: PublicBusiness }) {
  if (business.is_workspace || !business.name) return null
  return (
    <div className="mb-6 flex items-center gap-3">
      {business.logo ? (
        <img
          src={storagePublicUrl(business.logo.path, business.logo.version)}
          alt=""
          className="h-12 w-12 rounded-xl bg-white object-contain p-1 ring-1 ring-line"
        />
      ) : (
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-white text-lg font-bold ring-1 ring-line" style={{ color: business.accent_color }}>
          {business.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0">
        <p className="t-title truncate font-semibold">{business.name}</p>
        {business.tagline && <p className="t-text truncate text-sm text-muted">{business.tagline}</p>}
      </div>
    </div>
  )
}

export function StatusScreen({
  title,
  message,
  icon,
  children,
}: {
  title: string
  message: ReactNode
  icon?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-white ring-1 ring-line">
          {icon ?? <LogoMark className="size-8" />}
        </div>
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{title}</h1>
        <div className="mt-2 text-[0.95rem] leading-relaxed text-muted">{message}</div>
        {children}
      </main>
      <PoweredBy />
    </div>
  )
}

function DocumentView({ file, business, theme }: { file: PublicFile; business: PublicBusiness; theme?: PublicTheme }) {
  const accent = safeAccent(theme, business.accent_color)
  const urls = documentUrls(file)
  return (
    <ThemeShell theme={theme} accent={accent}>
    <div className="min-h-dvh">
      {business.is_demo && <DemoRibbon />}
      <main className="mx-auto max-w-3xl px-5 py-8">
        <BusinessMini business={business} />
        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${accent}14`, color: accent }}>
              <FileText className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-[-0.01em]">{file.title}</h1>
              <p className="mt-0.5 text-sm text-muted">
                PDF, {formatBytes(file.size_bytes)}
                {file.updated_at && `, updated ${formatDate(file.updated_at)}`}
              </p>
            </div>
          </div>
          {file.description && <p className="mt-4 text-[0.95rem] leading-relaxed text-ink/80">{file.description}</p>}
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <ActionLink href={urls.view} accent={accent} external>
              <ExternalLink /> Open document
            </ActionLink>
            <ActionLink href={urls.download} accent={accent} variant="outline">
              <Download /> Download
            </ActionLink>
          </div>
        </div>
        {/* Inline preview where browsers support it well (desktop/tablet). */}
        <div className="mt-6 hidden overflow-hidden rounded-2xl border border-line bg-white md:block">
          <iframe src={urls.view} title={file.title} className="h-[78vh] w-full" loading="lazy" />
        </div>
      </main>
      <PoweredBy />
    </div>
    </ThemeShell>
  )
}

function ContactCardView({ card, business, theme }: { card: DestinationByType['contact_card']; business: PublicBusiness; theme?: PublicTheme }) {
  const accent = safeAccent(theme, business.accent_color)
  return (
    <FocusShell business={business} theme={theme} accent={accent}>
      <div className="overflow-hidden rounded-3xl bg-white shadow-raise ring-1 ring-line">
        <div className="h-20" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}BB)` }} />
        <div className="px-6 pb-6">
          <div className="-mt-9 grid h-[4.5rem] w-[4.5rem] place-items-center rounded-2xl bg-white text-2xl font-bold shadow-raise" style={{ color: accent }}>
            {card.full_name
              .split(/\s+/)
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-[-0.02em]">{card.full_name}</h1>
          {(card.title || card.organization) && (
            <p className="mt-0.5 text-ink/70">{[card.title, card.organization].filter(Boolean).join(', ')}</p>
          )}
          <button
            type="button"
            onClick={() => downloadVcard(card)}
            className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            <UserPlus className="size-5" /> Save contact
          </button>
          <div className="mt-3 grid gap-2">
            {card.phone && (
              <ActionLink href={telLink(card.phone)} accent={accent} variant="outline">
                <Phone /> {card.phone}
              </ActionLink>
            )}
            {card.email && (
              <ActionLink href={mailtoLink(card.email)} accent={accent} variant="outline">
                <Mail /> {card.email}
              </ActionLink>
            )}
            {card.website && (
              <ActionLink href={card.website} accent={accent} variant="outline" external>
                <ExternalLink /> {card.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </ActionLink>
            )}
          </div>
          {card.address && <p className="mt-4 text-sm text-muted">{card.address}</p>}
          {card.note && <p className="mt-2 text-sm text-muted">{card.note}</p>}
        </div>
      </div>
    </FocusShell>
  )
}

/** Fallback for redirect types when the edge function did not redirect (e.g. local dev). */
function RedirectView({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href)
  }, [href])
  return (
    <StatusScreen title="Opening…" message="You are being taken to the destination.">
      <a href={href} rel="noopener noreferrer" className="mt-5 text-sm font-semibold text-signal underline-offset-4 hover:underline">
        Continue manually
      </a>
    </StatusScreen>
  )
}

export function QrDestinationView({ payload }: { payload: PublicQrPayload }) {
  if (payload.state === 'not_found') {
    return (
      <StatusScreen
        title="This QR code is not recognised"
        message="The code may have been mistyped or removed. If you scanned it from a printed sign, ask the business for an updated link."
      />
    )
  }
  if (payload.state === 'unavailable') {
    return (
      <StatusScreen
        title="This QR code is currently unavailable"
        message="The business has paused this code. It may be back soon. You can try again later or contact the business directly."
      />
    )
  }
  if (payload.state === 'expired') {
    return (
      <StatusScreen
        title="This QR code is not active right now"
        message="Its plan has ended. If this is your code, contact us to renew it and it will work again straight away."
      >
        <a href="/#contact" className="mt-5 text-sm font-semibold text-signal underline-offset-4 hover:underline">
          Contact 1 Tap Solution
        </a>
      </StatusScreen>
    )
  }
  if (payload.state === 'static') {
    return (
      <StatusScreen
        icon={<Wifi className="size-7 text-signal" />}
        title="Scan this code with your camera app"
        message="This is a Wi-Fi code. Point your phone's camera at the printed code and tap the prompt to join the network."
      />
    )
  }

  const business = payload.business
  const type = payload.type
  const d = (payload.destination ?? {}) as Record<string, unknown>
  if (!business || !type) {
    return <StatusScreen title="This page could not be loaded" message="Try scanning the code again in a moment." />
  }

  const redirect = redirectUrlFor(type, d)
  if (redirect) return <RedirectView href={redirect} />

  const theme = (d.theme as PublicTheme | undefined) ?? undefined
  const accent = safeAccent(theme, business.accent_color)
  switch (type) {
    case 'document': {
      const file = d.file as PublicFile | null | undefined
      if (!file) return <StatusScreen title="Document unavailable" message="The document behind this code could not be found." />
      if (d.open_mode === 'direct') return <RedirectView href={documentUrls(file).view} />
      return <DocumentView file={file} business={business} theme={theme} />
    }
    case 'phone':
      return (
        <FocusShell business={business} theme={theme} accent={accent}>
          <BusinessMini business={business} />
          <h1 className="t-title text-2xl font-bold tracking-[-0.02em]">{(d.label as string) || 'Give us a call'}</h1>
          <p className="t-text mt-1 text-lg text-ink/70 tabular">{d.phone as string}</p>
          <ActionLink href={telLink(d.phone as string)} accent={accent} className="mt-6 min-h-14 text-base">
            <Phone /> Call now
          </ActionLink>
        </FocusShell>
      )
    case 'email':
      return (
        <FocusShell business={business} theme={theme} accent={accent}>
          <BusinessMini business={business} />
          <h1 className="t-title text-2xl font-bold tracking-[-0.02em]">Send us an email</h1>
          <p className="t-text mt-1 text-ink/70">{d.email as string}</p>
          {typeof d.subject === 'string' && d.subject && <p className="t-text mt-1 text-sm text-muted">Subject: {d.subject}</p>}
          <ActionLink
            href={mailtoLink(d.email as string, d.subject as string | undefined, d.body as string | undefined)}
            accent={accent}
            className="mt-6 min-h-14 text-base"
          >
            <Mail /> Write email
          </ActionLink>
        </FocusShell>
      )
    case 'whatsapp':
      // Only reached if the number is invalid for a redirect; show a helpful page.
      return (
        <FocusShell business={business} theme={theme} accent={accent}>
          <BusinessMini business={business} />
          <ActionLink href={whatsappLink(String(d.phone ?? ''), d.message as string | undefined)} accent={accent} external>
            <MessageCircle /> Open WhatsApp
          </ActionLink>
        </FocusShell>
      )
    case 'contact_card':
      return <ContactCardView card={d as unknown as DestinationByType['contact_card']} business={business} theme={theme} />
    case 'text':
      return (
        <FocusShell business={business} theme={theme} accent={accent}>
          <BusinessMini business={business} />
          {typeof d.title === 'string' && d.title && <h1 className="t-title mb-3 text-2xl font-bold tracking-[-0.02em]">{d.title}</h1>}
          <div className="rounded-2xl border border-line bg-white p-5">
            <p className="whitespace-pre-line break-words text-[1.02rem] leading-relaxed text-ink">{String(d.text ?? '')}</p>
          </div>
          <div className="mt-4">
            <CopyButton text={String(d.text ?? '')} label="Copy text" accent={accent} />
          </div>
        </FocusShell>
      )
    case 'menu': {
      const menu = d as unknown as PublicMenu
      return (
        <ThemeShell theme={theme} accent={accent}>
          <div className="min-h-dvh">
            {business.is_demo && <DemoRibbon />}
            <main className="mx-auto w-full max-w-2xl px-4 py-8">
              <BusinessMini business={business} />
              <div className="mb-5 flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-line" style={{ color: accent }}>
                  <UtensilsCrossed className="size-6" />
                </span>
                <div className="min-w-0">
                  <h1 className="t-title text-2xl font-bold tracking-[-0.02em]">{menu.title || 'Menu'}</h1>
                  {menu.note && <p className="t-text mt-0.5 text-sm">{menu.note}</p>}
                </div>
              </div>
              <MenuContent menu={menu} accent={accent} />
            </main>
            <PoweredBy />
          </div>
        </ThemeShell>
      )
    }
    case 'payment':
      return (
        <FocusShell business={business} theme={theme} accent={accent}>
          <BusinessMini business={business} />
          <PaymentCard data={d as unknown as PaymentData} accent={accent} />
        </FocusShell>
      )
    case 'landing_page':
      if (business.is_workspace || d.show_business === false) {
        return (
          <LandingView
            header={{
              title: d.title as string | undefined,
              subtitle: d.subtitle as string | undefined,
              accent: (d.accent as string | undefined) || undefined,
              avatar: payload.destination?.avatar,
              cover: payload.destination?.cover,
              theme,
            }}
            blocks={business.blocks ?? []}
            isDemo={business.is_demo}
          />
        )
      }
      return (
        <BusinessProfile business={business} hideProfileBlocks>
          {business.blocks?.length ? (
            <BlockList blocks={business.blocks} accent={accent} />
          ) : null}
        </BusinessProfile>
      )
    case 'business_profile':
    default:
      return <BusinessProfile business={business} />
  }
}

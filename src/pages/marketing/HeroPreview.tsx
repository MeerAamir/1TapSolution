import { FileText, MapPin, MessageCircle, Navigation } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { QrSvg } from '@/components/qr/QrSvg'
import { config, qrPublicUrl } from '@/config'
import { qrDesignSchema } from '@/lib/qr/design'
import { cn } from '@/lib/utils'

const DESTINATIONS = [
  { id: 'menu', label: 'Menu PDF', detail: 'menu-spring.pdf', icon: FileText },
  { id: 'map', label: 'Directions', detail: 'Google Maps', icon: MapPin },
  { id: 'chat', label: 'WhatsApp', detail: 'Prefilled message', icon: MessageCircle },
] as const

type DestinationId = (typeof DESTINATIONS)[number]['id']

const ACCENT = '#B45309'

function PhoneScreen({ active }: { active: DestinationId }) {
  return (
    <div className="relative h-full overflow-hidden bg-surface">
      {/* Menu */}
      <div className={cn('absolute inset-0 p-4 transition-opacity duration-500', active === 'menu' ? 'opacity-100' : 'opacity-0')} aria-hidden={active !== 'menu'}>
        <p className="text-[0.7rem] font-semibold text-muted">Chinar Leaf Café</p>
        <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-line">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ backgroundColor: `${ACCENT}18`, color: ACCENT }}>
              <FileText className="size-4" />
            </span>
            <div>
              <p className="text-[0.8rem] font-bold leading-tight">Spring menu</p>
              <p className="text-[0.65rem] text-muted">PDF, 1.2 MB</p>
            </div>
          </div>
          <div className="mt-3 rounded-lg py-2 text-center text-[0.72rem] font-semibold text-white" style={{ backgroundColor: ACCENT }}>
            Open document
          </div>
        </div>
        <div className="mt-3 grid gap-1.5" aria-hidden>
          {['Saffron kahwa', 'Walnut brownie', 'Seasonal fruit tart', 'Garden breakfast'].map((item, i) => (
            <div key={item} className="flex justify-between rounded-lg bg-white px-3 py-2 text-[0.68rem] ring-1 ring-line">
              <span>{item}</span>
              <span className="text-muted">{['₹180', '₹220', '₹260', '₹340'][i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className={cn('absolute inset-0 transition-opacity duration-500', active === 'map' ? 'opacity-100' : 'opacity-0')} aria-hidden={active !== 'map'}>
        <svg viewBox="0 0 200 260" className="h-[62%] w-full" preserveAspectRatio="xMidYMid slice">
          <rect width="200" height="260" fill="#EEF2F6" />
          <path d="M-10 70 L210 40 M-10 170 L210 150 M60 -10 L80 270 M140 -10 L130 270" stroke="#fff" strokeWidth="14" />
          <path d="M-10 115 Q100 95 210 120" stroke="#fff" strokeWidth="8" fill="none" />
          <rect x="88" y="62" width="34" height="26" rx="3" fill="#DDE4EC" />
          <rect x="20" y="180" width="30" height="40" rx="3" fill="#DDE4EC" />
          <rect x="150" y="70" width="36" height="30" rx="3" fill="#D7EED9" />
          <path d="M100 100 c0-12 18-12 18 0 c0 9-9 18-9 18 s-9-9-9-18z" fill={ACCENT} />
          <circle cx="109" cy="100" r="3.2" fill="#fff" />
        </svg>
        <div className="absolute inset-x-3 bottom-3 rounded-xl bg-white p-3 shadow-raise ring-1 ring-line">
          <p className="text-[0.78rem] font-bold">Chinar Leaf Café</p>
          <p className="text-[0.65rem] text-muted">12 Example Street</p>
          <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[0.72rem] font-semibold text-white" style={{ backgroundColor: ACCENT }}>
            <Navigation className="size-3" /> Start directions
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className={cn('absolute inset-0 flex flex-col bg-[#ECE5DD] transition-opacity duration-500', active === 'chat' ? 'opacity-100' : 'opacity-0')} aria-hidden={active !== 'chat'}>
        <div className="flex items-center gap-2 bg-[#075E54] px-3 py-2.5 text-white">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-[0.65rem] font-bold">C</span>
          <span className="text-[0.75rem] font-semibold">Chinar Leaf Café</span>
        </div>
        <div className="flex-1 p-3">
          <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-[#DCF8C6] px-2.5 py-1.5 text-[0.7rem] shadow-sm">
            Hi! Is there a table free for two this evening?
          </div>
        </div>
        <div className="m-2 rounded-full bg-white px-3 py-2 text-[0.65rem] text-muted">Type a message</div>
      </div>
    </div>
  )
}

/**
 * The hero's product preview. The QR code is real and opens the live demo; the
 * destination list shows the core idea: the printed code never changes while
 * what it opens does.
 */
export function HeroPreview() {
  const [active, setActive] = useState<DestinationId>('menu')
  const [paused, setPaused] = useState(false)
  const demoUrl = qrPublicUrl(config.demoQrCode)
  const design = useMemo(() => qrDesignSchema.parse({ fg: '#0B1020', dots: 'rounded', eyes: 'rounded', ecl: 'Q' }), [])

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      setActive((cur) => DESTINATIONS[(DESTINATIONS.findIndex((d) => d.id === cur) + 1) % DESTINATIONS.length].id)
    }, 3200)
    return () => clearInterval(t)
  }, [paused])

  return (
    <div
      className="relative mx-auto w-full max-w-[34rem] lg:mx-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Dashboard panel */}
      <div className="rounded-2xl bg-midnight p-5 text-white shadow-float sm:p-6 sm:pr-44">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.8rem] text-white/55">QR code</p>
            <p className="font-semibold">Chinar Leaf Café, table 04</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/20 px-2.5 py-1 text-xs font-semibold text-[#4ADE80]">
            <span className="h-1.5 w-1.5 rounded-full bg-current" /> Active
          </span>
        </div>

        <div className="mt-5 flex items-start gap-4">
          <div className="w-28 shrink-0 rounded-xl bg-white p-1.5 sm:w-32">
            <QrSvg text={demoUrl} design={design} label="Live demo QR code: scan to open the demo business page" />
          </div>
          <div className="min-w-0 text-sm">
            <p className="text-white/55">Printed link, never changes</p>
            <p className="mt-0.5 truncate font-semibold tabular">/q/{config.demoQrCode}</p>
            <p className="mt-3 text-[0.8rem] leading-snug text-white/60">Scan it with your phone to open the live demo page.</p>
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-[0.8rem] text-white/55">Opens</legend>
          <div className="mt-2 grid gap-1.5">
            {DESTINATIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setActive(d.id)}
                aria-pressed={active === d.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                  active === d.id ? 'bg-white text-ink' : 'bg-white/5 text-white/75 hover:bg-white/10',
                )}
              >
                <d.icon className={cn('size-4', active === d.id ? 'text-violet' : 'text-white/50')} />
                <span className="font-semibold">{d.label}</span>
                <span className={cn('ml-auto text-xs', active === d.id ? 'text-muted' : 'text-white/40')}>{d.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {/* Phone */}
      <div className="relative mx-auto -mt-8 w-[11.5rem] sm:absolute sm:-right-4 sm:top-10 sm:mt-0 lg:-right-10">
        <div className="rounded-[2rem] bg-[#1b2033] p-2 shadow-float ring-1 ring-white/10">
          <div className="relative h-[21rem] overflow-hidden rounded-[1.55rem] bg-white">
            <div className="absolute left-1/2 top-1.5 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-[#1b2033]" aria-hidden />
            <div className="h-full pt-7">
              <PhoneScreen active={active} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

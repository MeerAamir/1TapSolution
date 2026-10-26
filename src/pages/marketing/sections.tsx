import {
  BarChart3,
  Building2,
  CalendarDays,
  Contact,
  Factory,
  FileText,
  GraduationCap,
  Hotel,
  Layers,
  MapPin,
  MessageCircle,
  Palette,
  PencilLine,
  Printer,
  QrCode,
  RefreshCw,
  Scissors,
  Share2,
  ShoppingBag,
  Stethoscope,
  User,
  UtensilsCrossed,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { QrSvg } from '@/components/qr/QrSvg'
import { Button } from '@/components/ui/button'
import { config, qrPublicUrl } from '@/config'
import { qrDesignSchema } from '@/lib/qr/design'
import { cn } from '@/lib/utils'

export function SectionHeading({ id, title, intro }: { id?: string; title: string; intro?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 id={id} className="text-[1.9rem] font-bold leading-[1.15] tracking-[-0.025em] text-ink sm:text-[2.25rem]">
        {title}
      </h2>
      {intro && <p className="mt-3 text-[1.05rem] leading-relaxed text-ink/65">{intro}</p>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    title: 'Create your business profile',
    body: 'Add your logo, contact numbers, location, opening hours, menus, brochures and social links once.',
    art: (
      <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden>
        <rect x="8" y="8" width="104" height="64" rx="8" fill="#fff" stroke="#E2E8F0" />
        <rect x="18" y="18" width="18" height="18" rx="5" fill="#E8EFFF" />
        <rect x="42" y="20" width="44" height="5" rx="2.5" fill="#0F172A" />
        <rect x="42" y="30" width="30" height="4" rx="2" fill="#CBD5E1" />
        <rect x="18" y="46" width="84" height="5" rx="2.5" fill="#E2E8F0" />
        <rect x="18" y="56" width="60" height="5" rx="2.5" fill="#E2E8F0">
          <animate attributeName="width" values="20;60;60" dur="3s" repeatCount="indefinite" />
        </rect>
      </svg>
    ),
  },
  {
    title: 'Generate and share your QR code',
    body: 'Download print-ready PNG, SVG or PDF files for tables, posters, packaging and visiting cards.',
    art: (
      <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden>
        <rect x="38" y="8" width="44" height="64" rx="6" fill="#fff" stroke="#E2E8F0" />
        <rect x="46" y="16" width="28" height="28" rx="3" fill="#0B1020" />
        <rect x="50" y="20" width="8" height="8" rx="2" fill="#fff" />
        <rect x="62" y="20" width="8" height="8" rx="2" fill="#fff" />
        <rect x="50" y="32" width="8" height="8" rx="2" fill="#fff" />
        <rect x="63" y="33" width="3" height="3" fill="#fff" />
        <rect x="46" y="52" width="28" height="6" rx="3" fill="#2563EB" />
        <rect x="46" y="62" width="20" height="3" rx="1.5" fill="#CBD5E1" />
      </svg>
    ),
  },
  {
    title: 'Update everything anytime',
    body: 'Change a price list, swap a menu or move to a new address. The printed code keeps working.',
    art: (
      <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden>
        <rect x="14" y="20" width="36" height="40" rx="5" fill="#fff" stroke="#E2E8F0" />
        <rect x="20" y="28" width="24" height="3" rx="1.5" fill="#CBD5E1" />
        <rect x="20" y="35" width="18" height="3" rx="1.5" fill="#CBD5E1" />
        <rect x="70" y="20" width="36" height="40" rx="5" fill="#fff" stroke="#2563EB" strokeWidth="1.5" />
        <rect x="76" y="28" width="24" height="3" rx="1.5" fill="#0F172A" />
        <rect x="76" y="35" width="18" height="3" rx="1.5" fill="#2563EB" />
        <path d="M54 40 h12 m-4 -4 l4 4 l-4 4" stroke="#7C3AED" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <animate attributeName="opacity" values="0.3;1;0.3" dur="2.4s" repeatCount="indefinite" />
        </path>
      </svg>
    ),
  },
]

export function HowItWorks() {
  return (
    <section className="border-y border-line bg-white py-20 sm:py-24" aria-labelledby="how-it-works">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading id="how-it-works" title="Three steps, then it runs itself" intro="Set it up once. After that, updates take seconds and nobody needs to reprint anything." />
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl bg-surface p-6">
              <div className="mb-5 h-24">{s.art}</div>
              <span className="text-sm font-bold text-signal tabular">Step {i + 1}</span>
              <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/65">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

const FEATURE_GROUPS = [
  {
    title: 'What a scan can open',
    items: [
      { icon: Building2, name: 'Business profiles', body: 'A fast mobile page with your details, hours and actions.' },
      { icon: FileText, name: 'PDF and document sharing', body: 'Menus, brochures, catalogues and price lists.' },
      { icon: Contact, name: 'Digital business cards', body: 'One tap saves your details to the visitor’s contacts.' },
      { icon: MessageCircle, name: 'Calls and WhatsApp', body: 'Start a call or a chat with a prefilled message.' },
      { icon: MapPin, name: 'Google Maps directions', body: 'Turn-by-turn directions to any of your locations.' },
      { icon: Share2, name: 'Social media links', body: 'Instagram, Facebook, YouTube, LinkedIn and more.' },
    ],
  },
  {
    title: 'How you run it',
    items: [
      { icon: Layers, name: 'Multiple QR codes', body: 'One per table, product, poster or campaign.' },
      { icon: PencilLine, name: 'Easy content updates', body: 'Edit in the dashboard; changes are live on the next scan.' },
      { icon: Palette, name: 'Custom branding', body: 'Your colours, logo and call to action on every code.' },
      { icon: Printer, name: 'Print-ready downloads', body: 'Vector SVG and PDF, high-resolution PNG.' },
      { icon: BarChart3, name: 'QR analytics', body: 'Scans over time, by code and by device type.' },
    ],
  },
]

export function Features() {
  return (
    <section className="py-20 sm:py-28" aria-labelledby="features">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading
              id="features"
              title="A dynamic QR code is a link you control"
              intro="A static code bakes its content into the pattern, so any change means printing again. Ours point to a permanent address on our platform, and you decide what that address opens, today and next year."
            />
            <div className="mt-8 flex items-center gap-4 rounded-2xl border border-line bg-white p-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-signal-soft text-signal">
                <RefreshCw className="size-5" />
              </span>
              <p className="text-sm leading-relaxed text-ink/75">
                <strong className="font-semibold text-ink">Same code, new content.</strong> Swap the destination, replace a
                PDF or pause a code at any time from the dashboard.
              </p>
            </div>
          </div>
          <div className="grid gap-10">
            {FEATURE_GROUPS.map((g) => (
              <div key={g.title}>
                <h3 className="border-b border-line pb-3 text-sm font-semibold text-muted">{g.title}</h3>
                <ul className="grid gap-x-8 sm:grid-cols-2">
                  {g.items.map((f) => (
                    <li key={f.name} className="flex gap-3.5 border-b border-line py-4">
                      <f.icon className="mt-0.5 size-5 shrink-0 text-signal" aria-hidden />
                      <div>
                        <p className="font-semibold">{f.name}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-ink/60">{f.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

const SOLUTIONS = [
  { icon: UtensilsCrossed, name: 'Restaurants and cafés', uses: ['A code on every table that opens today’s menu', 'Update prices or specials without reprinting', 'WhatsApp for takeaway orders'] },
  { icon: ShoppingBag, name: 'Retail shops', uses: ['Window posters that open your new collection', 'Shopping-bag tags linking to Instagram', 'Store location and hours for walk-ins'] },
  { icon: Hotel, name: 'Hotels and guest houses', uses: ['Room cards with services and a WhatsApp concierge', 'Directions on booking confirmations', 'Wi-Fi codes at reception'] },
  { icon: GraduationCap, name: 'Educational institutions', uses: ['Admission brochures that are always the current edition', 'Campus maps and contact details', 'Event notices on noticeboards'] },
  { icon: Stethoscope, name: 'Clinics and professional offices', uses: ['Visiting hours and appointment numbers', 'Downloadable forms and price lists', 'Directions for first-time patients'] },
  { icon: Building2, name: 'Real estate', uses: ['Signboards that open floor plans and brochures', 'One code per property or project', 'Call or WhatsApp the agent in one tap'] },
  { icon: CalendarDays, name: 'Event organisers', uses: ['Schedules that can change on the day', 'Venue maps and parking directions', 'Sponsor and ticket links'] },
  { icon: Scissors, name: 'Salons and service providers', uses: ['Service menus and price lists', 'Booking by WhatsApp', 'Reviews on your Google Business Profile'] },
  { icon: Factory, name: 'Manufacturers and packaging', uses: ['Product manuals and care instructions on the box', 'Certificates and specification sheets', 'Support contacts that stay current'] },
  { icon: User, name: 'Individual professionals', uses: ['A digital visiting card people can save', 'Portfolio, LinkedIn and website in one place', 'Update your details without new cards'] },
]

export function Solutions() {
  const [active, setActive] = useState(0)
  const current = SOLUTIONS[active]
  return (
    <section className="bg-midnight py-20 text-white sm:py-28" aria-labelledby="solutions">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <h2 id="solutions" className="text-[1.9rem] font-bold leading-[1.15] tracking-[-0.025em] sm:text-[2.25rem]">
            Built for businesses people visit
          </h2>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-white/60">
            Wherever there is a counter, a table, a sign or a box, a code can connect the physical place to everything online.
          </p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <div role="tablist" aria-label="Industries" aria-orientation="vertical" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 lg:mx-0 lg:grid lg:gap-1 lg:overflow-visible lg:px-0">
            {SOLUTIONS.map((s, i) => (
              <button
                key={s.name}
                role="tab"
                id={`sol-tab-${i}`}
                aria-selected={i === active}
                aria-controls="sol-panel"
                onClick={() => setActive(i)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                    e.preventDefault()
                    setActive((i + 1) % SOLUTIONS.length)
                  }
                  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    e.preventDefault()
                    setActive((i - 1 + SOLUTIONS.length) % SOLUTIONS.length)
                  }
                }}
                tabIndex={i === active ? 0 : -1}
                className={cn(
                  'flex shrink-0 items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium transition-colors',
                  i === active ? 'bg-white text-ink' : 'text-white/65 hover:bg-white/8 hover:text-white',
                )}
              >
                <s.icon className={cn('size-4', i === active ? 'text-violet' : 'text-white/40')} />
                {s.name}
              </button>
            ))}
          </div>
          <div id="sol-panel" role="tabpanel" aria-labelledby={`sol-tab-${active}`} className="rounded-2xl bg-white/[0.04] p-6 ring-1 ring-white/10 sm:p-8">
            <current.icon className="size-8 text-violet-light" aria-hidden />
            <h3 className="mt-4 text-2xl font-bold tracking-[-0.015em]">{current.name}</h3>
            <ul className="mt-6 grid gap-4">
              {current.uses.map((u) => (
                <li key={u} className="flex gap-3 text-[1.02rem] text-white/80">
                  <QrCode className="mt-1 size-4 shrink-0 text-white/35" aria-hidden />
                  {u}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

const OTHER_DEMOS = [
  { code: 'demoHotel01', label: 'Hotel profile' },
  { code: 'demoStore01', label: 'Shop landing page' },
  { code: 'demoCard01', label: 'Digital business card' },
  { code: 'demoAcademy1', label: 'School admissions' },
]

export function DemoSection() {
  const url = qrPublicUrl(config.demoQrCode)
  const design = useMemo(
    () => qrDesignSchema.parse({ fg: '#1C1917', dots: 'rounded', eyes: 'rounded', frame: true, cta: 'Scan for menu', ecl: 'Q' }),
    [],
  )
  return (
    <section className="py-20 sm:py-28" aria-labelledby="demo">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-[1fr_auto]">
        <div>
          <SectionHeading
            id="demo"
            title="Try it with your phone"
            intro="Point your camera at the code. It opens the page for Chinar Leaf Café, a demonstration business with sample content."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href={url} target="_blank" rel="noopener noreferrer">
                Open the demo page
              </a>
            </Button>
          </div>
          <div className="mt-10">
            <p className="text-sm font-semibold text-muted">More demonstration codes</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {OTHER_DEMOS.map((d) => (
                <li key={d.code}>
                  <a
                    href={qrPublicUrl(d.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-medium ring-1 ring-line hover:ring-line-strong"
                  >
                    {d.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mx-auto w-64 rounded-3xl bg-white p-5 shadow-raise ring-1 ring-line sm:w-72">
          <QrSvg text={url} design={design} label="Demo QR code. Scan to open the demonstration café page." />
          <p className="mt-3 text-center text-xs text-muted">Demonstration content</p>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

const FAQS = [
  {
    q: 'What is the difference between a dynamic and a static QR code?',
    a: 'A static code stores its content (a web address, a phone number) inside the pattern itself, so changing anything means printing a new code. A dynamic code stores a short permanent address on our platform. We look up what it should open every time it is scanned, so you can change the destination without reprinting.',
  },
  {
    q: 'Can I edit business information after the code is printed?',
    a: 'Yes. Edit the profile, swap a document or change the destination in the dashboard, and the next scan shows the new version. The code itself never changes. The exception is Wi-Fi codes: phones read network details directly from the pattern, so changing a Wi-Fi password needs a new code.',
  },
  {
    q: 'Can I upload PDFs such as menus and brochures?',
    a: `Yes. PDFs and common image formats are supported, up to ${config.maxUploadMb} MB per file. You can replace a document later and every code that points to it serves the new version automatically.`,
  },
  {
    q: 'Which download formats are available?',
    a: 'PNG for screens and general use, SVG for professional printing at any size, and an A5 print-ready PDF with your business name and a short scan instruction. We recommend printing a test copy and scanning it with a few phones before a large print run.',
  },
  {
    q: 'What do the analytics show?',
    a: 'How many times each code was scanned, trends by day and month, the most popular codes and broad device types. We do not store IP addresses and do not try to identify individual people. Visitor counts are estimates based on a daily anonymous identifier.',
  },
  {
    q: 'Do the QR codes expire?',
    a: 'Codes do not have a built-in expiry date. A code stops working only if it is paused, archived or deleted in the dashboard, or if the service itself is discontinued. Paused codes show a clear “currently unavailable” page instead of an error.',
  },
  {
    q: 'How is my information protected?',
    a: 'Only signed-in administrators can change anything. Every database table is protected by row-level security, visitors can only read the published parts of active pages, and private files are never exposed to the public.',
  },
  {
    q: 'How much does it cost?',
    a: 'Pricing depends on how many businesses and codes you need. Send us a message and we will put together a plan. Self-service subscription plans may be added later.',
  },
]

export function Faq() {
  return (
    <section className="border-t border-line bg-white py-20 sm:py-28" aria-labelledby="faq">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHeading id="faq" title="Questions, answered" intro="Still unsure about something? Ask us in the contact form below." />
        <div className="divide-y divide-line border-y border-line">
          {FAQS.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[1.02rem] font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface text-muted transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="pb-5 pr-10 text-[0.97rem] leading-relaxed text-ink/70">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

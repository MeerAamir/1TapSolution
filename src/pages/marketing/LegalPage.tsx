import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { config } from '@/config'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

const LAST_UPDATED = '26 October 2026'

function contactLine(): ReactNode {
  return config.contact.email ? (
    <a className="text-signal underline underline-offset-2" href={`mailto:${config.contact.email}`}>
      {config.contact.email}
    </a>
  ) : (
    'the contact form on our home page'
  )
}

function Privacy() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p>
        This policy explains what information 1 Tap Solution (“we”) handles when you visit our website, scan a QR code
        managed on our platform, or contact us.
      </p>
      <h2>When you scan a QR code</h2>
      <p>To count scans and protect the service from abuse, we record for each scan:</p>
      <ul>
        <li>which code was scanned and when;</li>
        <li>a broad device type (mobile, tablet, desktop) and browser family;</li>
        <li>
          an anonymous identifier calculated from your IP address and browser details together with a secret that
          changes every day. It lets us estimate daily unique visitors. It cannot be reversed into your IP address, and
          identifiers from different days cannot be linked to each other.
        </li>
      </ul>
      <p>
        We do not store your IP address, do not use advertising cookies, and do not attempt to identify you. Anonymous
        identifiers are removed after 90 days; aggregated counts are kept.
      </p>
      <h2>Business pages</h2>
      <p>
        Business pages show information that each business has chosen to publish. Links on those pages (for example to
        WhatsApp, Google Maps or social networks) take you to third-party services with their own privacy policies.
      </p>
      <h2>When you contact us</h2>
      <p>
        If you use our contact form we store your name, email address, optional phone number and business name, and your
        message, so we can reply. To limit spam we keep an anonymous hash of your connection for 30 days.
      </p>
      <h2>Administrator accounts</h2>
      <p>
        Administrator sign-in is provided by our authentication provider. Passwords are never stored by us in readable
        form.
      </p>
      <h2>Service providers</h2>
      <p>
        We use Supabase for database, authentication and file storage, and Cloudflare for hosting and delivery. They
        process data on our behalf.
      </p>
      <h2>Your choices</h2>
      <p>
        You can ask us what information we hold about you, or ask us to correct or delete it, by writing to {contactLine()}.
      </p>
    </>
  )
}

function Terms() {
  return (
    <>
      <h1>Terms of service</h1>
      <p>These terms apply to the 1 Tap Solution website, dashboard and the pages served through our QR codes.</p>
      <h2>The service</h2>
      <p>
        1 Tap Solution lets administrators create dynamic QR codes and business pages. We aim to keep the service
        available and accurate but do not guarantee uninterrupted availability. Free hosting tiers used by the service
        have usage limits.
      </p>
      <h2>Content</h2>
      <p>
        Businesses are responsible for the content they publish, including documents, links and contact details, and for
        having the right to publish it. We may disable codes or pages that are unlawful, misleading or harmful, or that
        link to malicious websites.
      </p>
      <h2>Printing and scanning</h2>
      <p>
        Whether a printed code scans depends on print size, materials, contrast and lighting. Always test a printed proof
        with several phones before a large print run. Wi-Fi codes are static and contain network credentials; anyone who
        can see the code can read them.
      </p>
      <h2>Availability of codes</h2>
      <p>
        A dynamic code works for as long as it is active on the platform. Paused, archived or deleted codes show an
        unavailable page. If the service is discontinued we will give reasonable notice where possible.
      </p>
      <h2>Liability</h2>
      <p>
        To the extent permitted by law, we are not liable for indirect losses, or for losses caused by third-party
        services linked from business pages.
      </p>
      <h2>Contact</h2>
      <p>Questions about these terms can be sent to {contactLine()}.</p>
    </>
  )
}

export default function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-14">
        <div className="mb-10 flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            <strong className="font-semibold">Draft for review.</strong> This text is a starting point and must be
            reviewed by a qualified legal adviser, and completed with the operating company’s details, before commercial
            launch.
          </p>
        </div>
        <article className="[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-[-0.02em] [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-ink/80 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-ink/80">
          {kind === 'privacy' ? <Privacy /> : <Terms />}
          <p className="text-sm text-muted">Last updated {LAST_UPDATED}.</p>
        </article>
      </main>
      <SiteFooter />
    </>
  )
}

import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { config } from '@/config'
import { NAV_LINKS } from './SiteHeader'

export const TAGLINE = 'Your Business. One Tap Away.'

export function SiteFooter() {
  const { email, phone } = config.contact
  return (
    <footer className="bg-midnight text-white/70">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo tone="light" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">
            {TAGLINE} Dynamic QR codes and business pages you can update without reprinting.
          </p>
        </div>
        <nav aria-label="Footer">
          <h2 className="text-sm font-semibold text-white">Explore</h2>
          <ul className="mt-3 grid gap-2 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="hover:text-white">
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <Link to="/login" className="hover:text-white">
                Administrator login
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-semibold text-white">Contact</h2>
          <ul className="mt-3 grid gap-2 text-sm">
            {email && (
              <li>
                <a href={`mailto:${email}`} className="hover:text-white">
                  {email}
                </a>
              </li>
            )}
            {phone && (
              <li>
                <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="hover:text-white">
                  {phone}
                </a>
              </li>
            )}
            <li>
              <a href="/#contact" className="hover:text-white">
                Send us a message
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs">
          <span>© {new Date().getFullYear()} 1 Tap Solution</span>
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-white">
              Privacy policy
            </Link>
            <Link to="/terms" className="hover:text-white">
              Terms of service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

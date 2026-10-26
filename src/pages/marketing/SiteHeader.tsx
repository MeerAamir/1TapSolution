import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const NAV_LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#solutions', label: 'Solutions' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#contact', label: 'Contact' },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-colors',
        scrolled || open ? 'border-line bg-white/92 backdrop-blur-md' : 'border-transparent bg-surface',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
        <Link to="/" aria-label="1 Tap Solution home" onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <a href="/" className="rounded-md px-3 py-2 text-sm font-medium text-ink/75 hover:text-ink">
            Home
          </a>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm font-medium text-ink/75 hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Administrator login</Link>
          </Button>
          <Button asChild size="sm">
            <a href="/#contact">Get started</a>
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X /> : <Menu />}
        </Button>
      </div>
      {open && (
        <nav id="mobile-nav" className="h-[calc(100dvh-4rem)] border-t border-line bg-white px-5 py-4 md:hidden" aria-label="Mobile">
          <ul className="grid gap-1">
            {[{ href: '/', label: 'Home' }, ...NAV_LINKS].map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 text-base font-medium hover:bg-surface">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-2">
            <Button asChild size="lg">
              <a href="/#contact" onClick={() => setOpen(false)}>
                Get started
              </a>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/login">Administrator login</Link>
            </Button>
          </div>
        </nav>
      )}
    </header>
  )
}

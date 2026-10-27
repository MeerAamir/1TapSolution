import {
  BarChart3,
  Building2,
  ExternalLink,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  PlusCircle,
  QrCode,
  Settings,
  Tags,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Menu as DropMenu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/overlay'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/admin', label: 'My QR codes', icon: QrCode, end: true },
  { to: '/admin/qr/new', label: 'Create QR code', icon: PlusCircle, end: true },
  { to: '/admin/analytics', label: 'Scans & analytics', icon: BarChart3 },
  { to: '/admin/messages', label: 'Messages', icon: Mail },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

const ADVANCED = [
  { to: '/admin/overview', label: 'Dashboard stats', icon: LayoutDashboard },
  { to: '/admin/businesses', label: 'Businesses', icon: Building2 },
  { to: '/admin/files', label: 'Files & documents', icon: FolderOpen },
  { to: '/admin/categories', label: 'Categories', icon: Tags },
]

function NavItem({ item, onNavigate, small }: { item: (typeof NAV)[number]; onNavigate?: () => void; small?: boolean }) {
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-lg px-3 font-medium transition-colors',
            small ? 'py-2 text-[0.8125rem]' : 'py-2.5 text-sm',
            isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white',
          )
        }
      >
        {({ isActive }) => (
          <>
            <item.icon className={cn('size-[1.1rem]', isActive ? 'text-violet-light' : 'text-white/40')} />
            {item.label}
          </>
        )}
      </NavLink>
    </li>
  )
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link to="/admin" onClick={onNavigate} aria-label="Dashboard home">
          <Logo tone="light" />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Dashboard">
        <ul className="grid gap-0.5">
          {NAV.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </ul>
        <details className="group mt-6">
          <summary className="cursor-pointer list-none px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/35 hover:text-white/60 [&::-webkit-details-marker]:hidden">
            Advanced <span className="group-open:hidden">+</span>
          </summary>
          <ul className="mt-1 grid gap-0.5">
            {ADVANCED.map((item) => (
              <NavItem key={item.to} item={{ ...item, end: false }} onNavigate={onNavigate} small />
            ))}
          </ul>
        </details>
      </nav>
      <div className="border-t border-white/10 p-3">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 hover:bg-white/5 hover:text-white"
        >
          <ExternalLink className="size-[1.1rem] text-white/40" /> View public website
        </a>
        <button
          type="button"
          onClick={async () => {
            await signOut()
            navigate('/login', { replace: true })
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="size-[1.1rem] text-white/40" /> Sign out
        </button>
      </div>
    </div>
  )
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    document.title = 'Dashboard — 1 Tap Solution'
  }, [])

  const initials = (user?.email ?? '?').slice(0, 1).toUpperCase()

  return (
    <div className="min-h-dvh bg-surface">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-midnight lg:block">
        <SidebarNav />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-midnight/50" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-fade-in bg-midnight">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-md text-white/70 hover:bg-white/10"
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </button>
            <SidebarNav onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-white/90 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
              <Menu />
            </Button>
            <Link to="/admin" className="lg:hidden" aria-label="Dashboard home">
              <Logo />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link to="/admin/qr/new">
                <PlusCircle /> Create QR code
              </Link>
            </Button>
            <DropMenu>
              <MenuTrigger asChild>
                <button
                  className="grid h-9 w-9 place-items-center rounded-full bg-midnight text-sm font-semibold text-white"
                  aria-label="Account menu"
                >
                  {initials}
                </button>
              </MenuTrigger>
              <MenuContent>
                <div className="px-2.5 py-2 text-xs text-muted">
                  Signed in as
                  <div className="truncate text-sm font-medium text-ink">{user?.email}</div>
                </div>
                <MenuSeparator />
                <MenuItem onSelect={() => navigate('/admin/settings')}>
                  <Settings /> Settings
                </MenuItem>
                <MenuItem
                  onSelect={async () => {
                    await signOut()
                    navigate('/login', { replace: true })
                  }}
                >
                  <LogOut /> Sign out
                </MenuItem>
              </MenuContent>
            </DropMenu>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  )
}

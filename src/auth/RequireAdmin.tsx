import { ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/feedback'
import { isSupabaseConfigured } from '@/config'
import { useAuth } from './AuthProvider'
import { SetupRequired } from './SetupRequired'

/**
 * UX guard for dashboard routes. Real enforcement happens in the database
 * (RLS + is_admin()), so even a bypassed guard exposes nothing.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, isAdmin, loading, signOut } = useAuth()
  const location = useLocation()

  if (!isSupabaseConfigured) return <SetupRequired />
  if (loading) return <Spinner label="Checking your session" />
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (!isAdmin) {
    return (
      <main className="grid min-h-dvh place-items-center bg-surface px-6">
        <div className="max-w-sm text-center">
          <Logo className="mb-8" />
          <ShieldAlert className="mx-auto mb-3 size-8 text-danger" />
          <h1 className="text-lg font-semibold">No administrator access</h1>
          <p className="mt-2 text-sm text-muted">
            You are signed in as {session.user.email}, but this account is not an administrator. Ask the owner to grant
            access.
          </p>
          <Button className="mt-6" variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </main>
    )
  }
  return <>{children}</>
}

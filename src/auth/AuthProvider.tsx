import type { Session, User } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { isSupabaseConfigured } from '@/config'
import { getSupabase } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  /** Server-verified (public.is_admin()), not a client-side flag. */
  isAdmin: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshAdmin: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function checkAdmin(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('is_admin')
  return !error && data === true
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const signingOut = useRef(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const supabase = getSupabase()
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      setIsAdmin(data.session ? await checkAdmin() : false)
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession((prev) => {
        // Session ended without the user pressing "Sign out": tell them why.
        if (event === 'SIGNED_OUT' && prev && !signingOut.current) {
          toast.error('Your session has ended. Sign in again to continue.')
        }
        return next
      })
      if (event === 'SIGNED_OUT') setIsAdmin(false)
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // Defer: Supabase recommends not awaiting other calls inside this callback.
        setTimeout(() => {
          checkAdmin().then((v) => active && setIsAdmin(v))
        }, 0)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (/invalid login credentials/i.test(error.message)) return { error: 'Email or password is incorrect.' }
      if (/email not confirmed/i.test(error.message)) return { error: 'Confirm your email address before signing in.' }
      if (error.status === 429) return { error: 'Too many attempts. Wait a minute and try again.' }
      return { error: error.message }
    }
    const admin = await checkAdmin()
    setSession(data.session)
    setIsAdmin(admin)
    if (!admin) {
      signingOut.current = true
      await supabase.auth.signOut()
      signingOut.current = false
      return { error: 'This account does not have administrator access.' }
    }
    return {}
  }, [])

  const signOut = useCallback(async () => {
    signingOut.current = true
    await getSupabase().auth.signOut()
    signingOut.current = false
    setSession(null)
    setIsAdmin(false)
  }, [])

  const refreshAdmin = useCallback(async () => setIsAdmin(await checkAdmin()), [])

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, isAdmin, loading, signIn, signOut, refreshAdmin }),
    [session, isAdmin, loading, signIn, signOut, refreshAdmin],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

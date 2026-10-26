import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { SetupRequired } from '@/auth/SetupRequired'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Notice, Spinner } from '@/components/ui/feedback'
import { Toaster } from '@/components/ui/toaster'
import { Field, Input } from '@/components/ui/form'
import { config, isSupabaseConfigured } from '@/config'
import { getSupabase } from '@/lib/supabase'

/** Only allow in-app dashboard paths after login (prevents open redirects). */
export function safeNext(next: string | null): string {
  if (!next) return '/admin'
  try {
    const decoded = decodeURIComponent(next)
    if (decoded.startsWith('/admin') && !decoded.startsWith('//')) return decoded
  } catch {
    // ignore malformed input
  }
  return '/admin'
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <main className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/" className="self-start" aria-label="1 Tap Solution home">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-bold tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
      <aside className="relative hidden overflow-hidden bg-midnight lg:block" aria-hidden>
        <div className="absolute inset-0 grid grid-cols-12 gap-3 p-10 opacity-[0.07]">
          {Array.from({ length: 144 }, (_, i) => (
            <div key={i} className={`aspect-square rounded-[3px] ${(i * 7919) % 5 < 2 ? 'bg-white' : ''}`} />
          ))}
        </div>
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <p className="max-w-sm text-2xl font-semibold leading-snug tracking-[-0.015em]">
            Every printed code keeps working while you change what it opens.
          </p>
          <p className="mt-3 text-sm text-white/55">Administrator dashboard</p>
        </div>
      </aside>
    </div>
  )
}

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

function LoginView() {
  const { signIn, session, isAdmin, loading } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })
  const next = safeNext(params.get('next'))

  if (loading) return <Spinner />
  if (session && isAdmin) return <Navigate to={next} replace />

  return (
    <AuthShell title="Sign in" subtitle="Administrator access to businesses, QR codes and analytics.">
      <form
        noValidate
        className="grid gap-5"
        onSubmit={form.handleSubmit(async (v) => {
          setError(null)
          const result = await signIn(v.email, v.password)
          if (result.error) setError(result.error)
          else navigate(next, { replace: true })
        })}
      >
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="username" autoFocus {...form.register('email')} />}
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" {...form.register('password')} />}
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
        <Link to="/forgot-password" className="justify-self-start text-sm font-medium text-signal hover:underline">
          Forgot your password?
        </Link>
      </form>
    </AuthShell>
  )
}

function ForgotView() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<{ email: string }>({
    resolver: zodResolver(z.object({ email: z.string().trim().email('Enter a valid email address') })),
    defaultValues: { email: '' },
  })

  if (sent) {
    return (
      <AuthShell title="Check your email">
        <div className="flex gap-3">
          <CheckCircle2 className="size-5 shrink-0 text-success" />
          <p className="text-sm leading-relaxed text-ink/80">
            If an account exists for that address, we have sent a link to choose a new password. The link expires after a
            short time.
          </p>
        </div>
        <Button asChild variant="secondary" className="mt-8">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter your administrator email and we will send you a reset link.">
      <form
        noValidate
        className="grid gap-5"
        onSubmit={form.handleSubmit(async ({ email }) => {
          setError(null)
          const { error: err } = await getSupabase().auth.resetPasswordForEmail(email, {
            redirectTo: `${config.publicAppUrl}/reset-password`,
          })
          // Do not reveal whether the account exists; only surface rate limits/outages.
          if (err && err.status === 429) setError('Too many requests. Wait a few minutes and try again.')
          else if (err && err.status && err.status >= 500) setError('The email could not be sent. Try again later.')
          else setSent(true)
        })}
      >
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" autoFocus {...form.register('email')} />}
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
          Send reset link
        </Button>
        <Link to="/login" className="justify-self-start text-sm font-medium text-signal hover:underline">
          Back to sign in
        </Link>
      </form>
    </AuthShell>
  )
}

const resetSchema = z
  .object({
    password: z
      .string()
      .min(12, 'Use at least 12 characters')
      .max(72, 'Use 72 characters or fewer'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })

function ResetView() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [waited, setWaited] = useState(false)
  const form = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } })

  // The recovery link signs the user in; give the SDK a moment to exchange the code.
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500)
    return () => clearTimeout(t)
  }, [])

  if (loading || (!session && !waited)) return <Spinner label="Verifying reset link" />
  if (!session) {
    return (
      <AuthShell title="This link has expired" subtitle="Password reset links work once and expire after a short time.">
        <Button asChild>
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Choose a new password" subtitle={`For ${session.user.email}`}>
      <form
        noValidate
        className="grid gap-5"
        onSubmit={form.handleSubmit(async ({ password }) => {
          setError(null)
          const { error: err } = await getSupabase().auth.updateUser({ password })
          if (err) setError(err.message)
          else navigate('/admin', { replace: true })
        })}
      >
        <Field label="New password" hint="At least 12 characters." error={form.formState.errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" autoFocus {...form.register('password')} />}
        </Field>
        <Field label="Confirm new password" error={form.formState.errors.confirm?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register('confirm')} />}
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
          Save new password
        </Button>
      </form>
    </AuthShell>
  )
}

export default function AuthArea({ view }: { view: 'login' | 'forgot' | 'reset' }) {
  if (!isSupabaseConfigured) return <SetupRequired />
  return (
    <AuthProvider>
      {view === 'login' && <LoginView />}
      {view === 'forgot' && <ForgotView />}
      {view === 'reset' && <ResetView />}
      <Toaster />
    </AuthProvider>
  )
}

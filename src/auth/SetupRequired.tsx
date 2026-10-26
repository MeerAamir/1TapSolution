import { Logo } from '@/components/brand/Logo'

/** Shown when the build has no Supabase configuration, instead of a crash. */
export function SetupRequired() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-6">
      <div className="max-w-md">
        <Logo className="mb-8" />
        <h1 className="text-xl font-semibold">Connect a Supabase project</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This build has no database connection. Add <code className="font-semibold text-ink">VITE_SUPABASE_URL</code>{' '}
          and <code className="font-semibold text-ink">VITE_SUPABASE_ANON_KEY</code> to the environment and rebuild. The
          deployment guide in <code className="font-semibold text-ink">docs/DEPLOYMENT.md</code> walks through it.
        </p>
      </div>
    </main>
  )
}

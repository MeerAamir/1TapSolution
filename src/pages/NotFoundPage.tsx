import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-6">
      <div className="max-w-sm text-center">
        <Link to="/" aria-label="Home">
          <Logo className="mb-10" />
        </Link>
        <h1 className="text-xl font-semibold">This page does not exist</h1>
        <p className="mt-2 text-sm text-muted">Check the address, or go back to the home page.</p>
        <Button asChild className="mt-6">
          <Link to="/">Go to home page</Link>
        </Button>
      </div>
    </main>
  )
}

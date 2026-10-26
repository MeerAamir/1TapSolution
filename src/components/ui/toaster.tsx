import { Toaster as Sonner } from 'sonner'

/** Toast container for the dashboard and sign-in screens (kept out of public pages). */
export function Toaster() {
  return <Sonner position="top-right" richColors closeButton toastOptions={{ duration: 4000 }} />
}

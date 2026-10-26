import type { ReactNode } from 'react'

/** Phone-sized frame for previewing customer-facing pages inside the dashboard. */
export function PhonePreview({ children, label = 'Preview' }: { children: ReactNode; label?: string }) {
  return (
    <figure className="mx-auto w-full max-w-[22rem]">
      <div className="rounded-[2.2rem] bg-midnight p-2.5 shadow-float">
        <div className="relative h-[40rem] overflow-y-auto overflow-x-hidden rounded-[1.75rem] bg-surface [scrollbar-width:thin]">
          {children}
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted">{label}</figcaption>
    </figure>
  )
}

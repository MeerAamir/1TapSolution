import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Input } from './form'

const overlayClass = 'fixed inset-0 z-50 bg-midnight/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in'
const panelClass =
  'fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-6 shadow-float focus:outline-none data-[state=open]:animate-fade-in'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClass} />
        <DialogPrimitive.Content className={cn(panelClass, 'max-w-lg', className)}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
          {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * Confirmation for consequential actions. Destructive variant can require the
 * user to type a word (e.g. the business name) before the button enables.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive,
  requireText,
  loading,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void | Promise<void>
  destructive?: boolean
  requireText?: string
  loading?: boolean
}) {
  const [typed, setTyped] = useState('')
  const blocked = Boolean(requireText) && typed.trim() !== requireText
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) setTyped('')
        onOpenChange(v)
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content className={cn(panelClass, 'max-w-md')}>
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-sm leading-relaxed text-muted">{description}</div>
          </AlertDialog.Description>
          {requireText && (
            <div className="mt-4 grid gap-1.5">
              <label htmlFor="confirm-text" className="text-sm">
                Type <strong className="font-semibold text-ink">{requireText}</strong> to confirm
              </label>
              <Input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={loading}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              disabled={blocked}
              loading={loading}
              onClick={async () => {
                await onConfirm()
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

export const Menu = Dropdown.Root
export const MenuTrigger = Dropdown.Trigger

export function MenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        align={align}
        sideOffset={6}
        className="z-50 min-w-48 rounded-lg border border-line bg-white p-1 shadow-raise data-[state=open]:animate-fade-in"
      >
        {children}
      </Dropdown.Content>
    </Dropdown.Portal>
  )
}

export function MenuItem({
  children,
  onSelect,
  destructive,
  disabled,
}: {
  children: ReactNode
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}) {
  return (
    <Dropdown.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface [&_svg]:size-4 [&_svg]:text-muted',
        destructive && 'text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger',
      )}
    >
      {children}
    </Dropdown.Item>
  )
}

export function MenuSeparator() {
  return <Dropdown.Separator className="my-1 h-px bg-line" />
}

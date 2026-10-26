import * as LabelPrimitive from '@radix-ui/react-label'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full rounded-md border border-line-strong bg-white px-3 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-signal focus:outline-none focus:ring-3 focus:ring-signal/15 disabled:bg-surface disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...props} />
))
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(fieldBase, 'min-h-20 py-2 leading-relaxed', className)} {...props} />
  ),
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        'h-10 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20d%3D%22M4%206l4%204%204-4%22%20fill%3D%22none%22%20stroke%3D%22%2364748B%22%20stroke-width%3D%221.6%22/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)
Select.displayName = 'Select'

export function Label({ className, ...props }: LabelPrimitive.LabelProps) {
  return <LabelPrimitive.Root className={cn('text-sm font-medium text-ink', className)} {...props} />
}

export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string
  required?: boolean
  className?: string
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode
}

/** Label + control + hint/error, wired with ids for screen readers. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative mt-0.5 inline-flex h-5.5 w-10 shrink-0 cursor-pointer items-center rounded-full bg-line-strong transition-colors data-[state=checked]:bg-signal disabled:opacity-50"
      >
        <SwitchPrimitive.Thumb className="block h-4.5 w-4.5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[1.15rem]" />
      </SwitchPrimitive.Root>
    </div>
  )
}

export function ColorInput({
  value,
  onChange,
  id,
  ...aria
}: {
  value: string
  onChange: (v: string) => void
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-10 w-12 cursor-pointer rounded-md border border-line-strong bg-white p-1"
        aria-label="Pick colour"
      />
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 font-medium uppercase tabular"
        maxLength={7}
        spellCheck={false}
        {...aria}
      />
    </div>
  )
}

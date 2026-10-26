import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-signal text-white hover:bg-signal-dark',
        dark: 'bg-midnight text-white hover:bg-midnight-3',
        secondary: 'bg-white text-ink ring-1 ring-inset ring-line-strong hover:bg-surface',
        ghost: 'text-ink hover:bg-ink/5',
        danger: 'bg-danger text-white hover:bg-red-700',
        'danger-outline': 'bg-white text-danger ring-1 ring-inset ring-danger/40 hover:bg-danger-soft',
        link: 'text-signal underline-offset-4 hover:underline px-0',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-[0.8125rem]',
        md: 'h-10 rounded-md px-4 text-sm',
        lg: 'h-12 rounded-lg px-6 text-[0.95rem]',
        icon: 'h-9 w-9 rounded-md',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, type, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      )
    }
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden />}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'

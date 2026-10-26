import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { ThinkingOrb } from 'thinking-orbs'
import { cn } from '@/utils/cn'

type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: React.ReactNode
}

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  accent: 'btn-accent',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn btn-danger',
}

const sizeClass: Record<Size, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-4 text-base',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(variantClass[variant], sizeClass[size], className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <ThinkingOrb state="working" size={20} color="#C9471B" aria-hidden="true" /> : icon}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'

export default Button

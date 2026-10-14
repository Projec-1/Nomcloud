import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: ReactNode
  endAdornment?: ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, hint, icon, endAdornment, className, id, ...props }, ref) => {
  const generatedId = useId()
  const inputId = id || props.name || generatedId
  const hasIcon = Boolean(icon)
  const hasEndAdornment = Boolean(endAdornment)
  const describedBy = [
    props['aria-describedby'],
    hint ? `${inputId}-hint` : null,
    error ? `${inputId}-error` : null,
  ].filter(Boolean).join(' ') || undefined

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
          {props.required && <span className="text-brand"> *</span>}
        </label>
      )}
      <div className="relative">
        {hasIcon && <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-graphite">{icon}</div>}
        <input
          ref={ref}
          id={inputId}
          className={cn('input', hasIcon && 'pl-11', hasEndAdornment && 'pr-12', error && 'border-red-400 focus:ring-red-300 focus:border-red-400', className)}
          {...props}
          aria-describedby={describedBy}
          aria-invalid={error ? true : props['aria-invalid']}
        />
        {endAdornment && <div className="absolute right-2 top-1/2 -translate-y-1/2">{endAdornment}</div>}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs font-medium text-red-500">{error}</p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-graphite">{hint}</p>
      ) : null}
    </div>
  )
})
Input.displayName = 'Input'

export default Input

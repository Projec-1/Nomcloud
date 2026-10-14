import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import { CaretDown as ChevronDown } from '@phosphor-icons/react'
import { cn } from '@/utils/cn'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  children: React.ReactNode
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, error, className, id, children, ...props }, ref) => {
  const generatedId = useId()
  const selectId = id || props.name || generatedId
  const describedBy = [props['aria-describedby'], error ? `${selectId}-error` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="label">
          {label}
          {props.required && <span className="text-brand"> *</span>}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn('input appearance-none pr-10', error && 'border-red-400', className)}
          {...props}
          aria-describedby={describedBy}
          aria-invalid={error ? true : props['aria-invalid']}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
      </div>
      {error && <p id={`${selectId}-error`} className="mt-1.5 text-xs font-medium text-red-500">{error}</p>}
    </div>
  )
})
Select.displayName = 'Select'

export default Select

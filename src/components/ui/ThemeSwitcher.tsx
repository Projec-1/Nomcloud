import { useEffect, useId, useRef, useState } from 'react'
import { Check, CaretDown, Monitor, Moon, Sun } from '@phosphor-icons/react'
import { useTheme, type ThemeMode } from '@/context/ThemeContext'
import { cn } from '@/utils/cn'

const OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun; hint: string }> = [
  { value: 'light', label: 'Light', icon: Sun, hint: 'Always use the light theme' },
  { value: 'dark', label: 'Dark', icon: Moon, hint: 'Always use the dark theme' },
  { value: 'system', label: 'System', icon: Monitor, hint: 'Follow your device appearance' },
]

export default function ThemeSwitcher({ className }: { className?: string }) {
  const { mode, setMode, theme } = useTheme()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const activeOption = OPTIONS.find((option) => option.value === mode) ?? OPTIONS[0]
  const ActiveIcon = activeOption.icon

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={containerRef} className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Theme: ${activeOption.label}`}
        aria-expanded={open}
        aria-controls={menuId}
        title={`${activeOption.label} theme${mode === 'system' ? ` (${theme})` : ''}`}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ink/[0.10] bg-[var(--nc-surface)] px-3 text-xs font-semibold text-[var(--nc-text)] hover:bg-ink/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:hover:bg-white/[0.06]"
      >
        <ActiveIcon className="h-4 w-4" aria-hidden="true" />
        <span>{activeOption.label}</span>
        <CaretDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          aria-label="Theme options"
          className="absolute right-0 top-full z-50 mt-2 min-w-44 rounded-xl border border-[var(--nc-line)] bg-[var(--nc-surface)] p-1.5"
        >
          {OPTIONS.map((option) => {
            const Icon = option.icon
            const selected = mode === option.value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                title={option.hint}
                onClick={() => {
                  setMode(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                  selected
                    ? 'bg-ink/[0.06] font-semibold text-[var(--nc-text)] dark:bg-white/[0.08]'
                    : 'text-graphite hover:bg-ink/[0.04] hover:text-[var(--nc-text)] dark:hover:bg-white/[0.06]',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="flex-1">{option.label}</span>
                {selected && <Check className="h-4 w-4 text-brand" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {`Appearance: ${mode === 'system' ? `system (${theme})` : mode}`}
      </span>
    </div>
  )
}

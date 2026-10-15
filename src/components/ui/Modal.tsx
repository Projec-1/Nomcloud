import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { cn } from '@/utils/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
}

const sizeClass: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export default function Modal({ open, onClose, title, description, children, size = 'md', footer }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descriptionId = useId()

  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow

    const focusableElements = () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((element) => element.getAttribute('aria-hidden') !== 'true')

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return

      const elements = focusableElements()
      if (elements.length === 0) {
        e.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const first = elements[0]
      const last = elements[elements.length - 1]
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => {
      const firstField = dialogRef.current?.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
      )
      const focusTarget = firstField ?? focusableElements()[0] ?? dialogRef.current
      focusTarget?.focus()
    })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-ink/50 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        className={cn(
          'modal-content relative w-full max-w-full overflow-hidden rounded-[var(--nc-radius)] border border-ink/10 bg-[var(--nc-surface)] dark:border-white/10 animate-fade-up max-h-[90vh] flex flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
          sizeClass[size],
        )}
        role="dialog"
        aria-modal="true"
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 border-b border-ink/5 dark:border-white/10 px-4 py-4 sm:px-8 sm:py-5">
            <div>
              {title && <h3 id={titleId} className="text-lg font-semibold text-ink dark:text-white">{title}</h3>}
              {description && <p id={descriptionId} className="mt-1 text-sm text-graphite">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 min-w-11 rounded-full p-2 text-graphite hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="min-w-0 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-3 border-t border-ink/5 px-4 py-4 dark:border-white/10 sm:px-8">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

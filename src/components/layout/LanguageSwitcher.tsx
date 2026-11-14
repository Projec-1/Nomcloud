import { useEffect, useId, useRef, useState } from 'react'
import { Globe, Check } from '@phosphor-icons/react'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGES } from '@/data/translations'
import { cn } from '@/utils/cn'

export default function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, dir, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!open || e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const current = LANGUAGES.find((l) => l.code === lang)!

  const focusOption = (index: number) => {
    const options = ref.current?.querySelectorAll<HTMLButtonElement>('.language-switcher-option')
    options?.[index]?.focus()
  }

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          setOpen(true)
          window.requestAnimationFrame(() => focusOption(event.key === 'ArrowDown' ? 0 : LANGUAGES.length - 1))
        }}
        aria-label={t('dash.profile.language')}
        aria-expanded={open}
        aria-controls={menuId}
        className="language-switcher-trigger flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-graphite transition-colors hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
      >
        <Globe className="h-3.5 w-3.5" />
        {current.nativeLabel}
      </button>
      {open && (
        <div id={menuId} dir={dir} className="interaction-menu language-switcher-menu absolute end-0 top-11 z-50 w-40 overflow-hidden rounded-2xl border border-[var(--nc-line)] bg-[var(--nc-surface)] p-1.5 text-[var(--nc-text)] shadow-floaty animate-fade-up">
          {LANGUAGES.map((l, index) => (
            <button
              key={l.code}
              type="button"
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  const direction = event.key === 'ArrowDown' ? 1 : -1
                  focusOption((index + direction + LANGUAGES.length) % LANGUAGES.length)
                } else if (event.key === 'Home' || event.key === 'End') {
                  event.preventDefault()
                  focusOption(event.key === 'Home' ? 0 : LANGUAGES.length - 1)
                }
              }}
              onClick={() => {
                setLang(l.code)
                setOpen(false)
                triggerRef.current?.focus()
              }}
              aria-pressed={l.code === lang}
              className={cn(
                'language-switcher-option flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-[var(--nc-text)] hover:bg-[var(--nc-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand',
                l.code === lang && 'bg-[var(--nc-accent-soft)]',
              )}
            >
              {l.nativeLabel}
              {l.code === lang && <Check className="h-3.5 w-3.5 text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

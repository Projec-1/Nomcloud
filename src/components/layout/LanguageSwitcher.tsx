import { useEffect, useRef, useState } from 'react'
import { Globe, Check } from '@phosphor-icons/react'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGES } from '@/data/translations'
import { cn } from '@/utils/cn'

export default function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, dir, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const current = LANGUAGES.find((l) => l.code === lang)!

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t('dash.profile.language')}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-graphite transition-colors hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
      >
        <Globe className="h-3.5 w-3.5" />
        {current.nativeLabel}
      </button>
      {open && (
        <div dir={dir} className="absolute start-0 top-11 z-50 w-40 overflow-hidden rounded-2xl border border-ink/5 bg-white p-1.5 shadow-floaty animate-fade-up dark:border-white/10 dark:bg-[#161618]">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLang(l.code)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-ink/5 dark:text-white dark:hover:bg-white/10"
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

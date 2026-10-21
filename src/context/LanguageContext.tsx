import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { LANGUAGES, translations, type Lang } from '@/data/translations'

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  dir: 'ltr' | 'rtl'
  t: (key: string, values?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)
const STORAGE_KEY = 'nomcloud_lang'

function getInitialLang(): Lang {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'so' || stored === 'ar') return stored
  return 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang)
  const dir = LANGUAGES.find((l) => l.code === lang)?.dir ?? 'ltr'

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const setLang = (l: Lang) => setLangState(l)

  const t = (key: string, values?: Record<string, string | number>): string => {
    const message = translations[lang][key] ?? translations.en[key] ?? key
    return values
      ? message.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder))
      : message
  }

  return <LanguageContext.Provider value={{ lang, setLang, dir, t }}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}

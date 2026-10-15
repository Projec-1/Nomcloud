import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * The theme preference is what the operator chose: light, dark, or "follow the
 * operating system". `theme` stays the resolved light/dark value that every
 * `dark:` variant in the app keys off, so existing callers (`useTheme().theme`,
 * `toggleTheme`, `setTheme`) keep working unchanged.
 */
export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  /** Resolved theme actually applied to <html class="dark">. */
  theme: ResolvedTheme
  /** The stored preference, which may be "system". */
  mode: ThemeMode
  setTheme: (theme: ResolvedTheme | ThemeMode) => void
  setMode: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
const STORAGE_KEY = 'nomcloud_theme'
const DARK_CLASS = 'dark'

const SYSTEM_QUERY = '(prefers-color-scheme: dark)'

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia(SYSTEM_QUERY).matches ? 'dark' : 'light'
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function getInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (isThemeMode(stored)) return stored
  // Nothing stored yet: follow the operating system rather than forcing light.
  return 'system'
}

function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? systemTheme() : mode
}

function applyTheme(theme: ResolvedTheme) {
  const root = window.document.documentElement
  if (theme === 'dark') root.classList.add(DARK_CLASS)
  else root.classList.remove(DARK_CLASS)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode)
  const [systemResolved, setSystemResolved] = useState<ResolvedTheme>(() => resolve(getInitialMode()))

  const theme: ResolvedTheme = mode === 'system' ? systemResolved : mode

  // Apply the resolved theme and persist the preference. The preference — not
  // the resolved value — is what is stored, so "system" keeps following the OS
  // across reloads instead of being frozen into a light or dark choice.
  useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(STORAGE_KEY, mode)
  }, [theme, mode])

  // While following the system, react to the OS changing its scheme.
  useEffect(() => {
    if (mode !== 'system' || !window.matchMedia) return
    const media = window.matchMedia(SYSTEM_QUERY)
    const onChange = (event: MediaQueryListEvent) => setSystemResolved(event.matches ? 'dark' : 'light')
    setSystemResolved(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => setModeState(next), [])

  const setTheme = useCallback((next: ResolvedTheme | ThemeMode) => {
    if (isThemeMode(next)) setModeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setModeState((current) => {
      const currentResolved = resolve(current)
      return currentResolved === 'dark' ? 'light' : 'dark'
    })
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, setTheme, setMode, toggleTheme }),
    [theme, mode, setTheme, setMode, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}

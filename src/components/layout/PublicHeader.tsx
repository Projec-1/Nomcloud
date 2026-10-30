import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Moon, Sun } from '@phosphor-icons/react'
import Logo from '@/components/layout/Logo'
import LanguageSwitcher from '@/components/layout/LanguageSwitcher'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { cn } from '@/utils/cn'

const NAV_LINKS = [
  { to: '/solutions', key: 'nav.solutions' },
  { to: '/features', key: 'nav.features' },
  { to: '/pricing', key: 'nav.pricing' },
  { to: '/security', key: 'nav.security' },
  { to: '/about', key: 'nav.about' },
  { to: '/contact', key: 'nav.contact' },
]

export default function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuPanelRef = useRef<HTMLDivElement>(null)
  const { theme, toggleTheme } = useTheme()
  const { profile, activeRole } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  useEffect(() => {
    const panel = menuPanelRef.current
    if (menuOpen) panel?.removeAttribute('inert')
    else panel?.setAttribute('inert', '')

    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  return (
    <header className="public-header sticky top-0 z-50 border-b border-ink/5 dark:border-white/10">
      <div className="container flex h-[68px] items-center justify-between">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }: { isActive: boolean }) =>
                cn(
                  'flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                  isActive ? 'text-ink dark:text-white' : 'text-graphite hover:text-ink dark:hover:text-white',
                )
              }
            >
              {t(link.key)}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-1 lg:flex">
          <LanguageSwitcher />
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="mr-1 rounded-xl p-2.5 text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {profile && activeRole ? (
            <button onClick={() => navigate(`/app/${activeRole}`)} className="btn-ghost px-4 py-2 text-sm">
              {t('nav.dashboard')}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <Link to="/login" className="btn-ghost px-4 py-2 text-sm">
                Sign In
              </Link>
              <Link to="/signup" className="btn-accent px-4 py-2 text-sm">
                Get Started
              </Link>
            </div>
          )}
        </div>

        <button
          ref={menuButtonRef}
          className="flex h-11 w-11 items-center justify-center rounded-full p-0 text-ink dark:text-white lg:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="public-mobile-navigation"
        >
          <span className={`menu-morph ${menuOpen ? 'is-open' : ''}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      <div
        ref={menuPanelRef}
        id="public-mobile-navigation"
        className="nc-nav-panel border-t border-ink/5 bg-white px-3 pb-5 pt-2 dark:border-white/10 dark:bg-[#171917] sm:px-6 lg:hidden"
        data-open={menuOpen}
        aria-hidden={!menuOpen}
      >
        <nav className="flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }: { isActive: boolean }) =>
                cn('rounded-xl px-4 py-3 text-sm font-medium', isActive ? 'bg-ink/5 dark:bg-white/10 text-ink dark:text-white' : 'text-graphite')
              }
            >
              {t(link.key)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink/5 pt-4 dark:border-white/10 sm:gap-3">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-graphite hover:bg-ink/5 dark:hover:bg-white/10"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} Theme
          </button>
          {profile && activeRole ? (
            <button onClick={() => navigate(`/app/${activeRole}`)} className="btn-ghost flex-1 justify-center py-2.5 text-sm">
              {t('nav.dashboard')}
            </button>
          ) : (
            <>
              <Link to="/login" className="btn-ghost flex-1 justify-center py-2.5 text-sm">
                Sign In
              </Link>
              <Link to="/signup" className="btn-accent flex-1 justify-center py-2.5 text-sm">
                Get Started
              </Link>
            </>
          )}
        </div>
        <div className="mt-4 flex items-center justify-center border-t border-ink/5 pt-4 dark:border-white/10">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  )
}

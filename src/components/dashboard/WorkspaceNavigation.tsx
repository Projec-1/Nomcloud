import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CaretDown, DotsThree } from '@phosphor-icons/react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { navByRole, roleLabelKey, type NavItem } from '@/components/dashboard/navConfig'
import { cn } from '@/utils/cn'
import type { Role } from '@/types'

const primaryPaths = new Set([
  '/app/admin',
  '/app/admin/students',
  '/app/admin/teachers',
  '/app/admin/classes',
  '/app/admin/attendance',
  '/app/admin/fees',
  '/app/admin/reports',
  '/app/admin/settings',
])

function NavigationLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { t } = useLanguage()
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'admin-nav-link inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors',
          isActive && 'is-active',
        )
      }
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {t(item.labelKey)}
    </NavLink>
  )
}

export default function WorkspaceNavigation({ role }: { role: Role }) {
  const { activeMembership } = useAuth()
  const { lang, t } = useLanguage()
  const [moreOpen, setMoreOpen] = useState(false)
  const [visiblePaths, setVisiblePaths] = useState<string[]>(() =>
    role === 'admin' ? [...primaryPaths] : [],
  )
  const menuId = useId()
  const navigationRef = useRef<HTMLElement>(null)
  const linksRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const billingOnly = role === 'admin' && ['owner', 'director'].includes(activeMembership?.role ?? '')
  const items = useMemo(
    () => billingOnly ? navByRole.admin.filter((item) => item.to === '/app/billing') : navByRole[role],
    [billingOnly, role],
  )
  const visiblePathSet = new Set(visiblePaths)
  const primaryItems = items.filter((item) => visiblePathSet.has(item.to))
  const additionalItems = items.filter((item) => !visiblePathSet.has(item.to))

  useEffect(() => {
    if (billingOnly) return
    const links = linksRef.current
    const measure = measureRef.current
    if (!links || !measure) return

    let cancelled = false
    const updateVisibleItems = () => {
      if (cancelled) return
      const widths = new Map(
        Array.from(measure.querySelectorAll<HTMLElement>('[data-nav-path]')).map((element) => [
          element.dataset.navPath ?? '',
          element.getBoundingClientRect().width,
        ]),
      )
      const availableWidth = links.clientWidth
      const nextPaths: string[] = []
      let occupiedWidth = 0

      for (const item of items) {
        const itemWidth = widths.get(item.to) ?? 0
        const nextWidth = occupiedWidth + (nextPaths.length ? 3 : 0) + itemWidth
        if (nextWidth > availableWidth) break
        nextPaths.push(item.to)
        occupiedWidth = nextWidth
      }

      setVisiblePaths((current) =>
        current.length === nextPaths.length && current.every((path, index) => path === nextPaths[index])
          ? current
          : nextPaths,
      )
    }

    updateVisibleItems()
    const observer = new ResizeObserver(updateVisibleItems)
    observer.observe(links)
    document.fonts?.ready.then(updateVisibleItems)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [billingOnly, items, lang])

  useEffect(() => {
    if (!moreOpen) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !navigationRef.current?.contains(event.target)) {
        setMoreOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMoreOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [moreOpen])

  if (billingOnly) {
    return (
      <nav ref={navigationRef} className="admin-navigation" aria-label={`${t(roleLabelKey[role])} navigation`}>
        <div className="admin-navigation__capsule">
          {items.map((item) => <NavigationLink key={item.to} item={item} />)}
        </div>
      </nav>
    )
  }

  return (
    <nav ref={navigationRef} className="admin-navigation" aria-label={`${t(roleLabelKey[role])} navigation`}>
      <div className="admin-navigation__capsule">
        <div ref={linksRef} className="admin-navigation__links">
          {primaryItems.map((item) => <NavigationLink key={item.to} item={item} />)}
        </div>
        {additionalItems.length > 0 && (
          <div className="admin-navigation__more">
            <button
              ref={triggerRef}
              type="button"
              aria-expanded={moreOpen}
              aria-controls={menuId}
              onClick={() => setMoreOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
                event.preventDefault()
                setMoreOpen(true)
                window.requestAnimationFrame(() => {
                  const links = menuRef.current?.querySelectorAll<HTMLAnchorElement>('a[href]')
                  const target = event.key === 'ArrowDown' ? links?.[0] : links?.[links.length - 1]
                  target?.focus()
                })
              }}
              className="admin-nav-link inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors"
            >
              <DotsThree aria-hidden="true" className="h-4 w-4" />
              {t('dash.nav.more')}
              <CaretDown aria-hidden="true" className={cn('h-3 w-3 transition-transform', moreOpen && 'rotate-180')} />
            </button>
            {moreOpen && (
              <div id={menuId} ref={menuRef} className="admin-navigation__menu">
                {additionalItems.map((item) => (
                  <NavigationLink key={item.to} item={item} onNavigate={() => setMoreOpen(false)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div ref={measureRef} className="admin-navigation__measure" aria-hidden="true">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <span
              key={item.to}
              data-nav-path={item.to}
              className="admin-nav-link admin-navigation__measure-item inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
              {t(item.labelKey)}
            </span>
          )
        })}
      </div>
    </nav>
  )
}

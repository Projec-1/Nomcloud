import { NavLink } from 'react-router-dom'
import { X, SignOut as LogOut, UserCircle, CreditCard } from '@phosphor-icons/react'
import SchoolBrandLogo from '@/components/dashboard/SchoolBrandLogo'
import { navByRole, roleLabelKey } from '@/components/dashboard/navConfig'
import type { Role } from '@/types'
import { cn } from '@/utils/cn'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import SignOutButton from '@/components/ui/SignOutButton'

interface SidebarProps {
  role: Role
  mobileOpen: boolean
  onClose: () => void
}

export default function Sidebar({ role, mobileOpen, onClose }: SidebarProps) {
  const { t } = useLanguage()
  const { activeMembership } = useAuth()
  const billingOnly = role === 'admin' && ['owner', 'director'].includes(activeMembership?.role ?? '')
  const items = billingOnly
    ? [{ to: '/app/billing', labelKey: 'dash.nav.subscriptionBilling', icon: CreditCard }]
    : navByRole[role]

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-5">
        <SchoolBrandLogo to={billingOnly ? '/app/billing' : `/app/${role}`} />
        <button onClick={onClose} className="rounded-full p-1.5 text-graphite hover:bg-ink/5 dark:hover:bg-white/10 lg:hidden" aria-label="Close menu">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-graphite/70">
        {billingOnly ? t('billing.workspace') : t(roleLabelKey[role])} {t('dash.workspace')}
      </p>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 [scrollbar-gutter:stable]">
        {items.map((item, index) => (
          <div key={item.to}>
            {item.group && (index === 0 || items[index - 1].group !== item.group) && (
              <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-graphite/60">
                {t(item.group === 'Account' ? 'dash.group.account' : item.group)}
              </p>
            )}
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }: { isActive: boolean }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200',
                  isActive
                    ? 'bg-brand/10 text-brand'
                    : 'text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white',
                )
              }
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {t(item.labelKey)}
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="space-y-1 border-t border-ink/5 px-3 py-4 dark:border-white/10">
        {/* Phase 8 batch 8. "Reset Demo Data" is removed. It restored the
            client-side prototype store (removed in Phase 8 batch 8), which no longer
            exists. It was never connected to the demo SCHOOL (schools.is_demo,
            batch 0), which is real data in the real database and is untouched:
            resetting that tenant would be a server-side operation, recorded as
            open question H.11. */}
        {role === 'teacher' ? (
          <NavLink
            to="/app/teacher/profile"
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand/10 text-brand'
                  : 'text-graphite hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white',
              )
            }
          >
            <UserCircle className="h-4 w-4" />
            {t('dash.nav.profile')}
          </NavLink>
        ) : (
          <SignOutButton
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" /> {t('dash.topbar.signOut')}
          </SignOutButton>
        )}
      </div>
    </div>
  )

  return (
    <>
      <aside className="dashboard-sidebar sticky top-0 hidden h-screen w-64 flex-shrink-0 overflow-hidden border-r border-ink/5 bg-white dark:border-[#343A41] dark:bg-[#202328] lg:block">
        {content}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="nc-drawer-scrim absolute inset-0 border-0 bg-ink/40 p-0" onClick={onClose} aria-label="Close navigation" />
          <aside className="nc-drawer-panel dashboard-sidebar absolute inset-y-0 left-0 h-screen w-72 overflow-hidden bg-white shadow-floaty dark:bg-[#202328]">{content}</aside>
        </div>
      )}
    </>
  )
}

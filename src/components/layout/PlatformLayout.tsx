import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SignOut as LogOut, ShieldCheck } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import SignOutButton from '@/components/ui/SignOutButton'

export default function PlatformLayout() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  if (!location.pathname.startsWith('/platform/applications')) {
    return <Outlet />
  }

  return (
    <div className="dark min-h-screen bg-[#202328] text-white">
      <a
        href="#platform-applications-content"
        className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to application content
      </a>
      <header className="border-b border-[#343A41] bg-[#17191C]">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-8">
          <button onClick={() => navigate('/platform')} className="flex items-center gap-3 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white"><ShieldCheck className="h-5 w-5" /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">Nom Cloud Platform</span><span className="block truncate text-xs text-slate-400">Operator workspace</span></span>
          </button>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-300 sm:block">{profile?.full_name}</span>
            <SignOutButton className="flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white sm:px-3"><LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span></SignOutButton>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-3 py-5 sm:px-8 sm:py-8">
        <main id="platform-applications-content" tabIndex={-1} className="min-w-0"><Outlet /></main>
      </div>
    </div>
  )
}

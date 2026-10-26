import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { PageLoader } from '@/components/ui/Loader'
import { mustChangePassword } from '@/services/accountService'
import SignOutButton from '@/components/ui/SignOutButton'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { authState, authUser } = useAuth()
  const location = useLocation()

  if (authState === 'initialising' || authState === 'loading_profile') {
    return <PageLoader />
  }

  if (authState === 'signed_out') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (authState === 'error') {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div>
          <h1 className="text-lg font-semibold text-ink dark:text-white">We could not load your workspace</h1>
          <p className="mt-1 max-w-md text-sm text-graphite">
            Please try again. If the problem continues, sign out and contact your administrator.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
          >
            Try again
          </button>
          <SignOutButton
            className="rounded-xl border border-ink/10 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
          >
            Sign out
          </SignOutButton>
        </div>
      </div>
    )
  }

  // Provisioned with a temporary password and has not replaced it yet: no
  // workspace, whatever was asked for, until they have.
  if (authState === 'ready' && mustChangePassword(authUser)) {
    return <Navigate to="/first-login" replace />
  }

  if (authState === 'ready') return <>{children}</>

  return <PageLoader />
}

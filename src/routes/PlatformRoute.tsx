import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { PageLoader } from '@/components/ui/Loader'
import Button from '@/components/ui/Button'
import { mustChangePassword } from '@/services/accountService'

export default function PlatformRoute({ children }: { children: ReactNode }) {
  const { authState, authUser, platformAdmin } = useAuth()
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
        <p className="max-w-md text-sm text-red-500">We could not verify your platform access. Please try again.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Try again</Button>
      </div>
    )
  }

  // Same requirement for the platform workspace. See ProtectedRoute.
  if (authState === 'ready' && mustChangePassword(authUser)) {
    return <Navigate to="/first-login" replace />
  }

  if (platformAdmin) {
    // This guard is navigation convenience only; Phase 7 RLS must independently verify platform-admin status.
    return <>{children}</>
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold text-ink dark:text-white">Platform access required</h1>
      <p className="max-w-md text-sm text-graphite">This account is not an active platform administrator. School workspaces are available through the school dashboard.</p>
      <Navigate to="/login" replace state={{ reason: 'not-platform-admin' }} />
    </div>
  )
}

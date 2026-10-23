import type { ReactNode } from 'react'
import AccessDenied from '@/components/ui/AccessDenied'
import { useAuth } from '@/context/AuthContext'

// Billing is intentionally restricted to active owner/director memberships.
// The database helper and checkout policy both deny administrator access to
// subscription billing, so the UI must not silently widen that boundary.
const SUBSCRIPTION_ROLES = new Set(['owner', 'director'])

export default function SubscriptionRoleRoute({ children }: { children: ReactNode }) {
  const { authState, school, memberships } = useAuth()

  if (authState !== 'ready') return null

  const canManageSubscription =
    school !== null &&
    memberships.some(
      (membership) =>
        membership.school_id === school.id &&
        membership.status === 'active' &&
        SUBSCRIPTION_ROLES.has(membership.role),
    )

  if (!canManageSubscription) {
    return <AccessDenied hint="Subscription access is limited to active school owners and directors." />
  }

  return <>{children}</>
}

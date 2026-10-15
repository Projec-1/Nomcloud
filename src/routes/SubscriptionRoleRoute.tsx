import type { ReactNode } from 'react'
import AccessDenied from '@/components/ui/AccessDenied'
import { useAuth } from '@/context/AuthContext'

const SUBSCRIPTION_ROLES = new Set(['owner', 'director', 'administrator'])

export default function SubscriptionRoleRoute({ children }: { children: ReactNode }) {
  const { authState, school, memberships } = useAuth()

  if (authState !== 'ready') return null

  const canManageSubscription =
    school !== null &&
    memberships.some(
      (membership) =>
        membership.school_id === school.id && SUBSCRIPTION_ROLES.has(membership.role),
    )

  if (!canManageSubscription) {
    return <AccessDenied hint="Subscription access is limited to school owners, directors, and administrators." />
  }

  return <>{children}</>
}

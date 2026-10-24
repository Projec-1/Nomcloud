import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Role } from '@/types'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { workspaceForMembershipRole, workspacesForMembershipRoles } from '@/lib/roles'
import {
  fetchActiveMemberships,
  fetchPlatformAdminStatus,
  fetchProfileByAuthUserId,
  fetchSchoolById,
} from '@/services/identityService'
import type { AuthSessionUser, AuthState, MembershipRow, ProfileRow, SchoolRow } from '@/types/auth'

const ACTIVE_ROLE_KEY = 'nomcloud_active_role'
const AUTH_INITIALIZATION_TIMEOUT_MS = 15_000

interface AuthContextValue {
  isLoading: boolean
  logout: () => Promise<void>
  authUser: AuthSessionUser | null
  platformAdmin: boolean
  profile: ProfileRow | null
  memberships: MembershipRow[]
  workspaces: Role[]
  activeMembership: MembershipRow | null
  school: SchoolRow | null
  /** Replace the cached school row after an in-app edit (Phase 8 batch 1). */
  refreshSchool: (next: SchoolRow) => void
  /** Replace the cached profile row after an in-app edit (file storage: avatar). */
  refreshProfile: (next: ProfileRow) => void
  /**
   * Re-read profile, memberships and school from the database. Needed when a
   * membership appears outside this context — activation claiming an invitation
   * is the first such case.
   */
  refreshIdentity: () => void
  displayName: string
  authState: AuthState
  activeRole: Role | null
  setActiveRole: (role: Role) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [authUser, setAuthUser] = useState<AuthSessionUser | null>(null)
  const [platformAdmin, setPlatformAdmin] = useState(false)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [school, setSchool] = useState<SchoolRow | null>(null)
  const [authState, setAuthState] = useState<AuthState>('initialising')
  const [activeRole, setActiveRoleState] = useState<Role | null>(null)
  const supabaseUserRef = useRef<AuthSessionUser | null>(null)
  const identityRequestRef = useRef(0)
  const [identityNonce, setIdentityNonce] = useState(0)

  useEffect(() => {
    window.localStorage.removeItem('nomcloud_auth_users')
    window.localStorage.removeItem('nomcloud_auth_session')
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!isSupabaseConfigured) {
      setAuthState('error')
      setIsLoading(false)
      return
    }

    const clearIdentity = () => {
      if (cancelled) return
      identityRequestRef.current += 1
      supabaseUserRef.current = null
      setAuthUser(null)
      setPlatformAdmin(false)
      setProfile(null)
      setMemberships([])
      setSchool(null)
      setActiveRoleState(null)
      setAuthState('signed_out')
      setIsLoading(false)
    }

    const loadIdentity = async (sessionUser: AuthSessionUser, showLoading: boolean) => {
      if (cancelled) return
      const requestId = ++identityRequestRef.current
      if (showLoading) {
        setAuthState('loading_profile')
        setIsLoading(true)
      }
      supabaseUserRef.current = sessionUser

      try {
        const nextProfile = await fetchProfileByAuthUserId(sessionUser.id)
        if (!nextProfile) throw new Error('Authenticated user has no profile.')
        const nextMemberships = await fetchActiveMemberships(sessionUser.id)
        const nextSchool = nextProfile.school_id ? await fetchSchoolById(nextProfile.school_id) : null
        // An unrevoked platform_admins row is the sole determinant of platform
        // authority; a null school_id never grants it (AUTH_DESIGN.md section 1).
        const nextPlatformAdmin = await fetchPlatformAdminStatus(sessionUser.id)
        if (cancelled || requestId !== identityRequestRef.current) return

        setAuthUser(sessionUser)
        setPlatformAdmin(nextPlatformAdmin)
        setProfile(nextProfile)
        setMemberships(nextMemberships)
        setSchool(nextSchool)
        const storedRole = window.localStorage.getItem(ACTIVE_ROLE_KEY) as Role | null
        const nextWorkspaces = workspacesForMembershipRoles(nextMemberships.map((membership) => membership.role))
        const nextActiveRole = nextWorkspaces.includes(storedRole as Role) ? storedRole : nextWorkspaces[0] ?? null
        setActiveRoleState(nextActiveRole)
        setAuthState('ready')
        setIsLoading(false)
      } catch {
        if (cancelled || requestId !== identityRequestRef.current) return
        supabaseUserRef.current = null
        setAuthUser(null)
        setPlatformAdmin(false)
        setProfile(null)
        setMemberships([])
        setSchool(null)
        setActiveRoleState(null)
        setAuthState('error')
        setIsLoading(false)
      }
    }

    const initialise = async () => {
      let unsubscribeAuth: (() => void) | undefined
      let authEventObserved = false
      try {
        const { data: authStateData } = supabase.auth.onAuthStateChange((event, session) => {
          authEventObserved = true
          if (event === 'SIGNED_OUT' || !session?.user) {
            clearIdentity()
            return
          }
          if (event !== 'TOKEN_REFRESHED' || supabaseUserRef.current?.id !== session.user.id) {
            void loadIdentity(session.user, event !== 'TOKEN_REFRESHED')
          }
        })
        unsubscribeAuth = authStateData.subscription.unsubscribe

        const { data: sessionData, error } = await supabase.auth.getSession()
        if (error) throw error
        if (cancelled) return unsubscribeAuth

        if (!authEventObserved) {
          if (sessionData.session?.user) await loadIdentity(sessionData.session.user, true)
          else clearIdentity()
        }
        if (cancelled) return unsubscribeAuth
        return unsubscribeAuth
      } catch {
        unsubscribeAuth?.()
        if (!cancelled) {
          identityRequestRef.current += 1
          setAuthState('error')
          setIsLoading(false)
        }
        return undefined
      }
    }

    let unsubscribe: (() => void) | undefined
    const initializationTimeout = window.setTimeout(() => {
      if (cancelled) return
      setAuthState('error')
      setIsLoading(false)
    }, AUTH_INITIALIZATION_TIMEOUT_MS)

    void initialise().then((cleanup) => {
      window.clearTimeout(initializationTimeout)
      if (cancelled) {
        cleanup?.()
      } else {
        unsubscribe = cleanup
      }
    })

    return () => {
      cancelled = true
      window.clearTimeout(initializationTimeout)
      unsubscribe?.()
    }
  }, [identityNonce])

  const logout = async () => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    }
    supabaseUserRef.current = null
    setAuthUser(null)
    setPlatformAdmin(false)
    setProfile(null)
    setMemberships([])
    setSchool(null)
    setActiveRoleState(null)
    window.localStorage.removeItem(ACTIVE_ROLE_KEY)
    setAuthState('signed_out')
    setIsLoading(false)
  }

  const workspaces = workspacesForMembershipRoles(memberships.map((membership) => membership.role))

  const setActiveRole = (role: Role) => {
    if (!workspaces.includes(role)) return
    setActiveRoleState(role)
    window.localStorage.setItem(ACTIVE_ROLE_KEY, role)
  }

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        logout,
        authUser,
        platformAdmin,
        profile,
        memberships,
        workspaces,
        activeMembership:
          memberships.find((membership) => workspaceForMembershipRole(membership.role) === activeRole) ??
          memberships[0] ??
          null,
        school,
        refreshSchool: setSchool,
        refreshProfile: setProfile,
        refreshIdentity: () => setIdentityNonce((n) => n + 1),
        displayName: profile?.full_name ?? '',
        authState,
        activeRole,
        setActiveRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

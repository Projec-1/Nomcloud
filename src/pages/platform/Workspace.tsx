import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Pulse as Activity,
  Warning as AlertTriangle,
  ArrowUpRight,
  Buildings as Building2,
  Check,
  CaretRight as ChevronRight,
  ClipboardText as ClipboardCheck,
  Clock as Clock3,
  FileText,
  Key as KeyRound,
  Layout as LayoutDashboard,
  LockKey as LockKeyhole,
  SignOut as LogOut,
  List as Menu,
  DotsThree as MoreHorizontal,
  MagnifyingGlass as Search,
  Gear as Settings2,
  Shield,
  Users,
  X,
  Wrench,
  ChartBar as BarChart3,
  Globe as Globe2,
  Prohibit as Ban,
  Megaphone,
  Database,
  HardDrives,
  PlugsConnected,
  Sliders,
  CreditCard,
  UserCircle,
  Briefcase,
} from '@phosphor-icons/react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useAuth } from '@/context/AuthContext'
import type { Request, RequestStatus, School, SchoolStatus } from './types'
import SchoolProfileModal from './SchoolProfileModal'
import RequestReviewModal from './RequestReviewModal'
import PlatformApprovalPanel from './ApprovalPanel'
import {
  fetchPlatformAuditLogs,
  fetchPlatformOperators,
  fetchPendingPlatformApplicationCount,
  fetchPlatformSchools,
  fetchPlatformContactMessages,
  markPlatformContactMessageHandled,
  updatePlatformSchoolStatus,
  type PlatformAuditRecord,
  type PlatformOperatorRecord,
} from '@/services/platformService'
import { errorMessage } from '@/utils/errorMessage'
import ThemeSwitcher from '@/components/ui/ThemeSwitcher'
import Status from './StatusPill'
import OverviewSection, { type OverviewAlert } from './operator/OverviewSection'
import ActionCenterSection from './operator/ActionCenterSection'
import RequestsSection from './operator/RequestsSection'
import SettingsSection from './operator/SettingsSection'
import { SectionHeader } from './operator/PrototypeKit'
import AnalyticsSection from './operator/AnalyticsSection'
import ActivitySection from './operator/ActivitySection'
import AuditSection from './operator/AuditSection'
import HealthSection from './operator/HealthSection'
import MaintenanceSection from './operator/MaintenanceSection'
import SecuritySection from './operator/SecuritySection'
import PermissionsSection from './operator/PermissionsSection'
import OperatorsSection from './operator/OperatorsSection'
import FeaturesSection from './operator/FeaturesSection'
import IntegrationsSection from './operator/IntegrationsSection'
import BillingSection from './operator/BillingSection'
import BackupsSection from './operator/BackupsSection'
import DataSection from './operator/DataSection'
import PeopleSection from './operator/PeopleSection'
import CommunicationsSection from './operator/CommunicationsSection'
import OperationsView from './OperationsView'
import IncidentCommand from './IncidentCommand'
import { fetchPlatformCaseWorkload, type PlatformCase } from '@/services/platformOperationsService'

// Alert counts the sidebar shows next to the sections that own them.
const navBadges: Record<string, number | undefined> = {
  'System Health': undefined,
  Activity: undefined,
  Security: undefined,
  'Action Center': undefined,
  Billing: undefined,
  Integrations: undefined,
}

const navGroups = [
  {
    label: 'Workspace',
    items: [
      { label: 'Overview', path: '/platform', icon: LayoutDashboard },
      { label: 'Action Center', path: '/platform/actions', icon: AlertTriangle },
    ],
  },
  {
    label: 'Network',
    items: [
      { label: 'Schools', path: '/platform/schools', icon: Building2 },
      { label: 'People', path: '/platform/people', icon: UserCircle },
      { label: 'Requests & Reviews', path: '/platform/requests', icon: ClipboardCheck },
      { label: 'School Applications', path: '/platform/applications', icon: FileText },
      { label: 'Communications', path: '/platform/communications', icon: Megaphone },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Operations Queue', path: '/platform/operations', icon: Briefcase },
      { label: 'Analytics', path: '/platform/analytics', icon: BarChart3 },
      { label: 'Activity', path: '/platform/activity', icon: Activity },
      { label: 'Audit Logs', path: '/platform/audit', icon: FileText },
      { label: 'System Health', path: '/platform/health', icon: Activity },
      { label: 'Maintenance', path: '/platform/maintenance', icon: Wrench },
    ],
  },
  {
    label: 'Security',
    items: [
      { label: 'Security', path: '/platform/security', icon: Shield },
      { label: 'Permissions', path: '/platform/permissions', icon: KeyRound },
      { label: 'Operators', path: '/platform/operators', icon: Users },
    ],
  },
  {
    label: 'Platform',
    items: [
      { label: 'Features', path: '/platform/features', icon: Sliders },
      { label: 'Integrations', path: '/platform/integrations', icon: PlugsConnected },
      { label: 'Billing', path: '/platform/billing', icon: CreditCard },
      { label: 'Data', path: '/platform/data', icon: Database },
      { label: 'Backups & Recovery', path: '/platform/backups', icon: HardDrives },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Settings', path: '/platform/settings', icon: Settings2 },
    ],
  },
]

const nav = navGroups.flatMap((group) => group.items)

export default function PlatformWorkspace() {
  const location = useLocation()
  const navigate = useNavigate()
  const { authUser, platformAdmin, profile, logout } = useAuth()
  const [mobileNav, setMobileNav] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const [school, setSchool] = useState<School | null>(null)
  const [request, setRequest] = useState<Request | null>(null)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signOutPending, setSignOutPending] = useState(false)
  const [query, setQuery] = useState('')
  const [schoolFilter, setSchoolFilter] = useState<'All' | SchoolStatus>('All')
  const [toast, setToast] = useState('')
  const [globalQuery, setGlobalQuery] = useState('')
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [emergencyOpen, setEmergencyOpen] = useState(false)
  const [schoolRecords, setSchoolRecords] = useState<School[]>([])
  const [requestRecords, setRequestRecords] = useState<Request[]>([])
  const [auditRecords, setAuditRecords] = useState<string[][]>([])
  const [auditEntries, setAuditEntries] = useState<PlatformAuditRecord[]>([])
  const [operatorRecords, setOperatorRecords] = useState<PlatformOperatorRecord[]>([])
  const [pendingApplicationCount, setPendingApplicationCount] = useState(0)
  const [platformRecordsLoading, setPlatformRecordsLoading] = useState(true)
  const [platformRecordsError, setPlatformRecordsError] = useState<string | null>(null)
  const [platformRecordsNonce, setPlatformRecordsNonce] = useState(0)
  const [schoolActionBusy, setSchoolActionBusy] = useState(false)
  const currentPath = location.pathname

  useEffect(() => {
    if (!profileMenuOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [profileMenuOpen])

  useEffect(() => {
    if (!authUser) return
    let cancelled = false
    setPlatformRecordsLoading(true)
    setPlatformRecordsError(null)
    Promise.all([
      fetchPlatformSchools(),
      fetchPlatformAuditLogs(),
      fetchPlatformOperators(),
      fetchPendingPlatformApplicationCount(),
      fetchPlatformContactMessages(),
    ])
      .then(([schoolRows, auditRows, operators, applicationsCount, contactMessages]) => {
        if (cancelled) return
        const schoolNameById = new Map(schoolRows.map((row) => [row.id, row.name]))
        setSchoolRecords(schoolRows.map((row) => ({
          id: row.id,
          code: row.shortcode,
          name: row.name,
          location: [row.address, row.country].filter(Boolean).join(', ') || 'Location not set',
          admin: row.administratorName ?? 'Not assigned',
          email: row.administratorEmail ?? row.email ?? '—',
          phone: row.phone ?? '—',
          status: row.status === 'active' ? 'Active' : row.status === 'suspended' ? 'Suspended' : 'Closed',
          plan: row.planName ?? 'No subscription',
          students: row.studentCount,
          teachers: row.teacherCount,
          registered: new Date(row.createdAt).toLocaleDateString(),
          activity: row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleString() : 'No recorded activity',
        })))
        setAuditRecords(auditRows.map((row) => [
          row.action,
          row.actorEmail ?? 'System',
          row.schoolId ? schoolNameById.get(row.schoolId) ?? `${row.entityType} · ${row.entityId ?? '—'}` : `${row.entityType} · ${row.entityId ?? '—'}`,
          new Date(row.createdAt).toLocaleString(),
          'Recorded',
        ]))
        setAuditEntries(auditRows)
        setRequestRecords(contactMessages.map((row) => ({
          id: row.id,
          type: 'Contact message',
          school: 'Nom Cloud',
          submittedBy: row.name,
          submitted: new Date(row.createdAt).toLocaleString(),
          status: row.status === 'handled' ? 'Resolved' : 'Open',
          summary: row.message,
          details: [
            { label: 'Email', value: row.email },
            { label: 'Topic', value: row.topic },
          ],
          source: 'contact-message',
        })))
        setOperatorRecords(operators)
        setPendingApplicationCount(applicationsCount)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setPlatformRecordsError(errorMessage(cause, 'Could not load platform records.'))
        setSchoolRecords([])
        setRequestRecords([])
        setAuditRecords([])
        setAuditEntries([])
        setOperatorRecords([])
        setPendingApplicationCount(0)
        setSchool(null)
        setRequest(null)
      })
      .finally(() => {
        if (!cancelled) setPlatformRecordsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authUser, platformRecordsNonce])
  const section = currentPath === '/platform'
    ? 'Overview'
    : [...nav]
        .sort((a, b) => b.path.length - a.path.length)
        .find((item) => currentPath === item.path || currentPath.startsWith(`${item.path}/`))?.label ?? 'Overview'

  const filteredSchools = useMemo(() => schoolRecords.filter((item) => (schoolFilter === 'All' || item.status === schoolFilter) && `${item.name} ${item.id} ${item.location}`.toLowerCase().includes(query.toLowerCase())), [query, schoolFilter, schoolRecords])
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2800) }
  const handleLogout = async () => {
    if (signOutPending) return
    setSignOutPending(true)
    try {
      await logout()
      setSignOutOpen(false)
      setProfileMenuOpen(false)
      navigate('/login', { replace: true })
    } catch {
      notify('Could not sign out. Check your connection and try again.')
    } finally {
      setSignOutPending(false)
    }
  }
  const metadataName = authUser?.user_metadata?.full_name
  const displayName = profile?.full_name || (typeof metadataName === 'string' ? metadataName : '')
  const displayEmail = authUser?.email || profile?.email || ''
  const displayInitial = (displayName || displayEmail || '?').charAt(0).toUpperCase()
  const operatorRole = platformAdmin ? 'Platform administrator' : 'Not authenticated'
  const activeOperators = operatorRecords.filter((row) => row.revokedAt === null).length
  const totalStudents = schoolRecords.reduce((sum, school) => sum + school.students, 0)
  const totalTeachers = schoolRecords.reduce((sum, school) => sum + school.teachers, 0)

  // Overview alerts are derived only from platform records loaded above.
  const overviewAlerts = useMemo<OverviewAlert[]>(() => {
    const alerts: OverviewAlert[] = []
    if (pendingApplicationCount > 0) {
      alerts.push({
        id: 'alerts-applications',
        title: `${pendingApplicationCount} school application${pendingApplicationCount === 1 ? '' : 's'} pending`,
        detail: 'Submitted schools are waiting for a decision.',
        path: '/platform/applications',
      })
    }
    const openRequests = requestRecords.filter((request) => request.status !== 'Resolved').length
    if (openRequests > 0) {
      alerts.push({
        id: 'alerts-requests',
        title: `${openRequests} open request${openRequests === 1 ? '' : 's'} among the newest 500 loaded messages`,
        detail: 'Contact messages from schools and the public form.',
        path: '/platform/requests',
      })
    }
    const suspended = schoolRecords.filter((school) => school.status === 'Suspended').length
    if (suspended > 0) {
      alerts.push({
        id: 'alerts-suspended',
        title: `${suspended} school account${suspended === 1 ? '' : 's'} suspended`,
        detail: 'Confirm each suspension still has a reason and an owner.',
        path: '/platform/schools',
      })
    }
    // Alert counts come from the sections themselves now that they report their own
    // unavailable state. No sample data is used here.
    return alerts
  }, [pendingApplicationCount, requestRecords, schoolRecords])

  const updateSchool = async (id: string, status: SchoolStatus, message: string) => {
    if (status !== 'Active' && status !== 'Suspended') {
      notify('That school status cannot be changed from this action.')
      return
    }
    setSchoolActionBusy(true)
    try {
      await updatePlatformSchoolStatus(id, status === 'Active' ? 'active' : 'suspended', status === 'Suspended' ? 'Suspended by platform operator' : null)
      setSchool(null)
      setPlatformRecordsNonce((value) => value + 1)
      notify(message)
    } catch (cause: unknown) {
      notify(`School status was not changed: ${errorMessage(cause)}`)
    } finally {
      setSchoolActionBusy(false)
    }
  }
  const updateRequest = async (id: string, status: RequestStatus, message: string) => {
    const selected = requestRecords.find((item) => item.id === id)
    if (!selected || selected.source !== 'contact-message' || status !== 'Resolved' || !authUser) {
      notify('This action is not supported for this request.')
      return
    }
    try {
      await markPlatformContactMessageHandled(id, authUser.id)
      setRequest(null)
      setPlatformRecordsNonce((value) => value + 1)
      notify(message)
    } catch (cause: unknown) {
      notify(`Request was not updated: ${errorMessage(cause)}`)
    }
  }
  const searchResults = [
    ...schoolRecords.map((item) => ({ type: 'School', title: item.name, detail: `${item.code ?? item.id} · ${item.location} · ${item.status}`, path: '/platform/schools' })),
    ...operatorRecords.map((item) => ({ type: 'Operator', title: item.fullName, detail: item.email, path: '/platform/operators' })),
  ].filter((result) => `${result.type} ${result.title} ${result.detail}`.toLowerCase().includes(globalQuery.toLowerCase()))

  return (
    <div className="min-h-screen bg-[var(--nc-canvas)] text-[var(--nc-text)]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-64 flex-col overflow-hidden border-r border-[var(--nc-line)] bg-[var(--nc-surface)] px-3 py-5 transition-transform lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-start justify-between px-3">
          <button type="button" onClick={() => navigate('/platform')} className="flex items-center gap-3 text-left">
            <img src="/logo-512.png" alt="Nom Cloud" className="h-10 w-10 rounded-xl object-contain" />
            <span className="min-w-0"><span className="block text-[15px] font-bold tracking-tight">Nom Cloud</span><span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">Control Center</span></span>
          </button>
          <button type="button" aria-label="Close navigation" className="ml-auto min-h-11 min-w-11 rounded-lg p-2 text-graphite focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand lg:hidden" onClick={() => setMobileNav(false)}><X className="h-4 w-4" /></button>
        </div>
        <nav className="mt-8 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
          {navGroups.map((group) => <section key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-graphite/70">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => { const Icon = item.icon; const active = section === item.label; const count = item.label === 'School Applications' ? pendingApplicationCount : navBadges[item.label]; return <button key={item.path} aria-current={active ? 'page' : undefined} onClick={() => { navigate(item.path); setMobileNav(false) }} className={`group flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${active ? 'border-brand/20 bg-brand/10 text-brand' : 'border-transparent text-graphite hover:bg-ink/[0.05] hover:text-ink dark:hover:bg-white/[0.06] dark:hover:text-white'}`}><Icon className="h-[17px] w-[17px]" /><span className="flex-1">{item.label}</span>{count ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-brand text-white' : 'bg-brand/10 text-brand'}`}>{count}</span> : null}</button> })}
            </div>
          </section>)}
        </nav>
        <div className="mt-auto">
          <div className="mb-3 rounded-2xl border border-ink/[0.07] bg-ink/[0.025] p-3 dark:border-white/[0.08] dark:bg-white/[0.03]"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-xs font-semibold">{platformRecordsLoading ? 'Checking platform records' : platformRecordsError ? 'Platform data unavailable' : 'Platform data connected'}</span></div><p className="mt-1 pl-4 text-[11px] text-graphite">{platformRecordsLoading ? 'Loading current records' : `${schoolRecords.length} registered schools`}</p></div>
          <button onClick={() => navigate('/platform/settings')} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-ink/[0.05] dark:hover:bg-white/[0.06]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white">{displayInitial}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{displayName || displayEmail || 'Platform operator'}</span><span className="block text-xs text-graphite">{operatorRole}</span></span><MoreHorizontal className="h-4 w-4 text-graphite" /></button>
          <button onClick={() => setSignOutOpen(true)} className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-graphite hover:bg-red-500/10 hover:text-red-600"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </aside>
      {mobileNav && <button className="fixed inset-0 z-30 bg-ink/60 lg:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      <a
        href="#platform-main-content"
        className="sr-only z-50 rounded-lg bg-[var(--nc-surface)] px-4 py-3 font-semibold text-[var(--nc-text)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to workspace content
      </a>
      <main id="platform-main-content" className="platform-main lg:pl-64">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--nc-line)] bg-[var(--nc-canvas)] px-4 py-2 sm:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button type="button" aria-label="Open navigation" aria-expanded={mobileNav} className="min-h-11 min-w-11 shrink-0 rounded-xl p-2 hover:bg-ink/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand lg:hidden" onClick={() => setMobileNav(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <span className="hidden text-sm font-semibold text-graphite xl:block">Platform /</span>
            <span className="truncate text-sm font-semibold">{section}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeSwitcher className="shrink-0" />
            <button type="button" aria-label="Open platform settings" onClick={() => navigate('/platform/settings')} className="hidden min-h-11 min-w-11 shrink-0 rounded-xl p-2 text-graphite hover:bg-ink/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand xl:inline-flex xl:items-center xl:justify-center">
              <Settings2 className="h-4 w-4" />
            </button>
            <div ref={profileMenuRef} className="relative shrink-0">
              <button
                type="button"
                aria-label="Open operator profile"
                aria-expanded={profileMenuOpen}
                aria-controls="operator-profile-menu"
                onClick={() => setProfileMenuOpen((current) => !current)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {displayInitial}
              </button>
              {profileMenuOpen && (
                <div id="operator-profile-menu" className="interaction-menu absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-[var(--nc-line)] bg-[var(--nc-surface)] p-4">
                  <div className="border-b border-[var(--nc-line)] pb-3">
                    <p className="truncate text-sm font-semibold">{displayName || 'Name not available'}</p>
                    <p className="mt-1 break-all text-xs text-graphite">{displayEmail || 'Email not available'}</p>
                    <p className="mt-2 text-xs font-medium text-graphite">{operatorRole}</p>
                    {authUser?.created_at && (
                      <p className="mt-1 text-xs text-graphite">
                        Account since {new Date(authUser.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false)
                      navigate('/platform/settings')
                    }}
                    className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-medium hover:bg-ink/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/[0.06]"
                  >
                    <UserCircle className="h-4 w-4" aria-hidden="true" />
                    Profile &amp; account settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false)
                      setSignOutOpen(true)
                    }}
                    className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-semibold text-red-700 hover:bg-red-500/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 dark:text-red-300 dark:hover:bg-red-500/[0.10]"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="relative order-3 basis-full min-w-0 xl:order-none xl:basis-auto xl:flex-1 xl:max-w-sm">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
            <input aria-label="Search schools and platform operators" value={globalQuery} onFocus={() => setGlobalSearchOpen(true)} onChange={(event) => { setGlobalQuery(event.target.value); setGlobalSearchOpen(true) }} placeholder="Search schools and platform operators…" className="input h-11 w-full bg-[var(--nc-surface)] pl-10 pr-12" />
            {globalSearchOpen && globalQuery && <div className="interaction-menu absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-[var(--nc-line)] bg-[var(--nc-surface)] p-2 shadow-card">{platformRecordsError ? <p className="p-3 text-sm text-graphite">Platform records are unavailable. Retry the load before searching.</p> : searchResults.length ? searchResults.map((result) => <button key={result.type + '-' + result.title} onClick={() => { navigate(result.path); setGlobalSearchOpen(false); setGlobalQuery('') }} className="flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-ink/[0.05] dark:hover:bg-white/[0.06]"><span className="mt-0.5 rounded-lg bg-brand/10 p-2 text-brand"><Search className="h-3.5 w-3.5" /></span><span><span className="block text-[10px] font-bold uppercase tracking-wider text-brand">{result.type}</span><span className="block text-sm font-semibold">{result.title}</span><span className="block text-xs text-graphite">{result.detail}</span></span></button>) : <p className="p-3 text-sm text-graphite">No matching platform records.</p>}</div>}
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8">
          {platformRecordsError && <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4 text-sm text-red-700 dark:text-red-300"><span>Could not load platform records: {platformRecordsError}</span><Button variant="outline" size="sm" onClick={() => setPlatformRecordsNonce((value) => value + 1)}>Retry</Button></div>}
          {section === 'Overview' && !platformRecordsError && <OverviewSection onSchool={setSchool} onRequest={setRequest} navigate={navigate} notify={notify} schools={schoolRecords} requests={requestRecords} auditRows={auditRecords} pendingApplicationCount={pendingApplicationCount} operatorCount={activeOperators} alerts={overviewAlerts} loading={platformRecordsLoading} />}
          {section === 'Action Center' && !platformRecordsError && <ActionCenterSection onSchool={setSchool} onRequest={setRequest} navigate={navigate} schools={schoolRecords} requests={requestRecords} pendingApplicationCount={pendingApplicationCount} loading={platformRecordsLoading} />}
          {section === 'Schools' && !platformRecordsError && (platformRecordsLoading ? <p className="py-12 text-center text-sm text-graphite">Loading schools…</p> : <SchoolsView schools={filteredSchools} query={query} setQuery={setQuery} filter={schoolFilter} setFilter={setSchoolFilter} onSchool={setSchool} onNotify={() => navigate('/platform/applications')} />)}
          {section === 'School Applications' && <PlatformApprovalPanel />}
          {section === 'People' && !platformRecordsError && <PeopleSection schools={schoolRecords} loading={platformRecordsLoading} onSchool={setSchool} />}
          {section === 'Communications' && <CommunicationsSection />}
          {section === 'Requests & Reviews' && !platformRecordsError && <RequestsSection requests={requestRecords} loading={platformRecordsLoading} onOpenRequest={setRequest} />}
          {section === 'Operations Queue' && authUser && !platformRecordsError && <OperationsView currentPath={currentPath} authUserId={authUser.id} schools={schoolRecords} operators={operatorRecords} navigate={navigate} notify={notify} />}
          {section === 'Operators' && !platformRecordsError && (platformRecordsLoading ? <p className="py-12 text-center text-sm text-graphite">Loading operators…</p> : <OperatorsSection operators={operatorRecords} onNotify={notify} />)}
          {section === 'Permissions' && !platformRecordsError && <PermissionsSection operators={operatorRecords} loading={platformRecordsLoading} />}
          {section === 'Audit Logs' && !platformRecordsError && (platformRecordsLoading ? <p className="py-12 text-center text-sm text-graphite">Loading audit logs…</p> : <AuditSection rows={auditEntries} notify={notify} />)}
          {section === 'Security' && <SecuritySection />}
          {section === 'Maintenance' && <MaintenanceSection />}
          {section === 'Backups & Recovery' && <BackupsSection />}
          {section === 'Analytics' && !platformRecordsError && <AnalyticsSection schools={schoolRecords} requests={requestRecords} pendingApplicationCount={pendingApplicationCount} operatorCount={activeOperators} loading={platformRecordsLoading} />}
          {section === 'Activity' && !platformRecordsError && <ActivitySection rows={auditEntries} loading={platformRecordsLoading} />}
          {section === 'System Health' && authUser && !platformRecordsError && <SystemHealthWithIncidents operators={operatorRecords} authUserId={authUser.id} onNotify={notify} />}
          {section === 'Features' && <FeaturesSection />}
          {section === 'Integrations' && <IntegrationsSection />}
          {section === 'Billing' && !platformRecordsError && <BillingSection schools={schoolRecords} loading={platformRecordsLoading} />}
          {section === 'Data' && <DataSection />}
          {section === 'Settings' && <SettingsSection onEmergency={() => setEmergencyOpen(true)} onSignOut={() => setSignOutOpen(true)} notify={notify} fullName={displayName} email={displayEmail} role={operatorRole} provider={(authUser?.app_metadata?.provider as string | undefined) ?? null} accountCreatedAt={authUser?.created_at ?? null} lastSignInAt={(authUser as { last_sign_in_at?: string } | null)?.last_sign_in_at ?? null} platform={{ schoolCount: schoolRecords.length, studentCount: totalStudents, teacherCount: totalTeachers, pendingApplications: pendingApplicationCount, operatorCount: activeOperators, requestCount: requestRecords.length, connected: !platformRecordsLoading && !platformRecordsError, error: platformRecordsError }} />}
        </div>
      </main>
      {toast && <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-xl dark:bg-white dark:text-ink"><Check className="h-4 w-4 text-emerald-400" />{toast}</div>}
      <SchoolProfileModal
        school={school}
        requests={requestRecords}
        auditEntries={auditEntries}
        onClose={() => setSchool(null)}
        onOpenRequest={(item) => { setSchool(null); setRequest(item) }}
        onStatusChange={async (...args) => {
          if (schoolActionBusy) return
          await updateSchool(...args)
        }}
        statusChangePending={schoolActionBusy}
      />
      <RequestReviewModal
        request={request}
        schools={schoolRecords}
        onClose={() => setRequest(null)}
        onDecision={updateRequest}
        onOpenSchool={(item) => { setRequest(null); setSchool(item) }}
      />
      <Modal open={emergencyOpen} onClose={() => setEmergencyOpen(false)} title="Emergency controls" description="Unavailable: these controls are not connected to live access changes or audit logging." size="md" footer={<Button variant="outline" onClick={() => setEmergencyOpen(false)}>Close</Button>}><div className="space-y-2">{['Suspend a school account', 'Revoke all sessions for a user', 'Restrict an operator account', 'Put platform into maintenance mode'].map((item) => <button key={item} type="button" disabled className="flex w-full cursor-not-allowed items-center gap-3 rounded-2xl border border-red-500/15 p-4 text-left text-sm font-semibold text-red-700 opacity-60 dark:text-red-300"><Ban className="h-4 w-4" />{item}<ChevronRight className="ml-auto h-4 w-4" /></button>)}</div></Modal>
      <Modal open={signOutOpen} onClose={() => { if (!signOutPending) setSignOutOpen(false) }} title="Sign out?" description="Are you sure you want to sign out of Nom Cloud?" size="sm" footer={<><Button variant="outline" disabled={signOutPending} onClick={() => setSignOutOpen(false)}>Cancel</Button><Button variant="danger" disabled={signOutPending} onClick={() => void handleLogout()}>{signOutPending ? 'Signing out…' : 'Sign Out'}</Button></>}><div /></Modal>
    </div>
  )
}



function SchoolsView({ schools: list, query, setQuery, filter, setFilter, onSchool, onNotify }: { schools: School[]; query: string; setQuery: (v: string) => void; filter: 'All' | SchoolStatus; setFilter: (v: 'All' | SchoolStatus) => void; onSchool: (school: School) => void; onNotify: (message: string) => void }) {
  return <>
    <SectionHeader eyebrow="Organization directory" title="Schools" description="Registered schools, their current account status, and available organization records." action={<Button variant="outline" size="sm" onClick={() => onNotify('New schools must be submitted through the public application form.')}><Building2 className="h-4 w-4" /> School applications</Button>} />
    <div className="mb-5 flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search schools, IDs, or locations…" className="input pl-10" /></div>
      <div className="flex gap-2 overflow-x-auto">{(['All', 'Active', 'Pending', 'Under review', 'Suspended', 'Closed'] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold ${filter === item ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white text-graphite dark:bg-white/[0.06]'}`}>{item}</button>)}</div>
    </div>
    <div className="overflow-hidden rounded-3xl border border-ink/[0.07] bg-white shadow-soft dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="hidden grid-cols-[2fr_1.4fr_1fr_1fr_1fr_auto] gap-4 border-b border-ink/[0.06] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-graphite dark:border-white/[0.08] md:grid"><span>School</span><span>Administrator</span><span>Plan</span><span>Students</span><span>Status</span><span /></div>
      {list.length ? list.map((item) => <button key={item.id} onClick={() => onSchool(item)} className="grid w-full gap-3 border-b border-ink/[0.06] px-5 py-4 text-left transition last:border-0 hover:bg-ink/[0.025] dark:border-white/[0.08] md:grid-cols-[2fr_1.4fr_1fr_1fr_1fr_auto] md:items-center md:gap-4"><span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 font-bold text-brand">{item.name.charAt(0)}</span><span><span className="block text-sm font-semibold">{item.name}</span><span className="block text-xs text-graphite">{item.code ?? item.id} · {item.location}</span></span></span><span className="text-sm text-graphite">{item.admin}<span className="block text-xs">{item.email}</span></span><span className="text-sm font-medium">{item.plan}</span><span className="text-sm font-medium">{item.students.toLocaleString()}<span className="block text-xs text-graphite">{item.teachers} teachers</span></span><Status value={item.status} /><ChevronRight className="hidden h-4 w-4 text-graphite md:block" /></button>) : <p className="p-8 text-center text-sm text-graphite">No schools match this search or status.</p>}
    </div>
  </>
}


function SystemHealthWithIncidents({
  onNotify,
  operators,
  authUserId,
}: {
  onNotify: (message: string) => void
  operators: PlatformOperatorRecord[]
  authUserId: string
}) {
  const [cases, setCases] = useState<PlatformCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPlatformCaseWorkload()
      .then((rows) => {
        if (!cancelled) setCases(rows)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setCases([])
          setError(errorMessage(cause, 'Could not load incident case context.'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  return (
    <>
      <HealthSection />
      {error && (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-red-500/30 p-4 text-sm text-red-800 dark:text-red-300">
          <span>Could not load incident case context: {error}</span>
          <Button size="sm" variant="outline" onClick={() => setRefresh((value) => value + 1)}>Retry</Button>
        </div>
      )}
      {loading
        ? <p role="status" className="py-6 text-sm text-graphite">Loading incident context…</p>
        : !error && <IncidentCommand operators={operators} cases={cases} authUserId={authUserId} notify={onNotify} />}
    </>
  )
}

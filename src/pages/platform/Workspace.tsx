import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Pulse as Activity,
  Warning as AlertTriangle,
  Buildings as Building2,
  Check,
  CaretRight as ChevronRight,
  ClipboardText as ClipboardCheck,
  Clock as Clock3,
  CaretDown as ChevronDown,
  FileText,
  Layout as LayoutDashboard,
  LockKey as LockKeyhole,
  SignOut as LogOut,
  MagnifyingGlass as Search,
  Gear as Settings2,
  Users,
  Eye,
  ChartBar as BarChart3,
  Prohibit as Ban,
  ArrowCounterClockwise as RotateCcw,
  Megaphone,
  Database,
  Sliders,
  CreditCard,
  UserCircle,
  Briefcase,
} from '@phosphor-icons/react'
import Modal, { OperatorModalProvider } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { InlineLoader } from '@/components/ui/Loader'
import Select from '@/components/ui/Select'
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
import ActionCenterSection, { type InboxState } from './operator/ActionCenterSection'
import RequestsSection, { type RequestWorkMap } from './operator/RequestsSection'
import SettingsSection from './operator/SettingsSection'
import { SectionHeader } from './operator/PrototypeKit'
import AnalyticsSection from './operator/AnalyticsSection'
import ActivitySection from './operator/ActivitySection'
import OperatorsSection from './operator/OperatorsSection'
import FeaturesSection from './operator/FeaturesSection'
import BillingSection from './operator/BillingSection'
import DataSection from './operator/DataSection'
import PeopleSection from './operator/PeopleSection'
import CommunicationsSection from './operator/CommunicationsSection'
import { billingInvoices, billingPayments } from './operator/prototypeData'
import OperationsView from './OperationsView'

// Alert counts the sidebar shows next to the sections that own them.
const navBadges: Record<string, number | undefined> = {
  Activity: 0,
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
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Operators', path: '/platform/operators', icon: Users },
    ],
  },
  {
    label: 'Platform',
    items: [
      { label: 'Features', path: '/platform/features', icon: Sliders },
      { label: 'Billing', path: '/platform/billing', icon: CreditCard },
      { label: 'Data', path: '/platform/data', icon: Database },
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
const primaryNavGroups = navGroups.slice(0, 3).map((group) => ({
  ...group,
  items: group.items.filter((item) => item.path !== '/platform/communications'),
}))
const primaryNavPaths = new Set(primaryNavGroups.flatMap((group) => group.items.map((item) => item.path)))
const moreNavGroups = navGroups
  .map((group) => ({
    ...group,
    items: group.items.filter((item) => !primaryNavPaths.has(item.path)),
  }))
  .filter((group) => group.items.length > 0)

const schoolTimeline = [
  ['Today, 09:42', 'School approval completed', 'Leila Hassan approved the organization application.'],
  ['Sep 22, 14:18', '3 teachers added', 'Roster import completed by Amina Yusuf.'],
  ['Sep 20, 11:05', 'Attendance activated', 'Attendance workspace enabled for all campuses.'],
  ['Sep 18, 08:30', 'Administrator verified', 'Identity and organization records verified.'],
  ['Sep 15, 16:12', 'Application submitted', 'School application received by Nom Cloud.'],
]

export default function PlatformWorkspace() {
  const location = useLocation()
  const navigate = useNavigate()
  const { authUser, platformAdmin, profile, logout } = useAuth()
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const navMenuRef = useRef<HTMLDivElement>(null)
  const navMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  const sectionNavRef = useRef<HTMLDivElement>(null)
  const activeSectionNavRef = useRef<HTMLButtonElement>(null)
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
  const [operator, setOperator] = useState<PlatformOperatorRecord | null>(null)
  const [schoolRecords, setSchoolRecords] = useState<School[]>([])
  const [requestRecords, setRequestRecords] = useState<Request[]>([])
  const [auditRecords, setAuditRecords] = useState<string[][]>([])
  const [auditEntries, setAuditEntries] = useState<PlatformAuditRecord[]>([])
  const [operatorRecords, setOperatorRecords] = useState<PlatformOperatorRecord[]>([])
  const [selectedOperator, setSelectedOperator] = useState<PlatformOperatorRecord | null>(null)
  const [pendingApplicationCount, setPendingApplicationCount] = useState(0)
  const [platformRecordsLoading, setPlatformRecordsLoading] = useState(true)
  const [platformRecordsError, setPlatformRecordsError] = useState<string | null>(null)
  const [platformRecordsNonce, setPlatformRecordsNonce] = useState(0)
  // Operator workflow state (who owns an inbox item, what happened to a
  // request). It lives here rather than inside the sections so the assignment
  // and the decision history survive moving between screens.
  const [inboxState, setInboxState] = useState<InboxState>({})
  const [requestWork, setRequestWork] = useState<RequestWorkMap>({})
  const [schoolActionBusy, setSchoolActionBusy] = useState(false)
  const [requestActionBusy, setRequestActionBusy] = useState<string | null>(null)
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
    if (!navMenuOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !navMenuRef.current?.contains(event.target)) setNavMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setNavMenuOpen(false)
      navMenuTriggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [navMenuOpen])

  useEffect(() => {
    if (!authUser) {
      setPlatformRecordsLoading(false)
      setPlatformRecordsError('Sign in to load platform records.')
      setSchoolRecords([])
      setRequestRecords([])
      setAuditRecords([])
      setAuditEntries([])
      setOperatorRecords([])
      setPendingApplicationCount(0)
      return
    }
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
        setSelectedOperator((current) => current ? operators.find((row) => row.id === current.id) ?? null : null)
        setPendingApplicationCount(applicationsCount)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setPlatformRecordsError(cause instanceof Error ? cause.message : String(cause))
        setSchoolRecords([])
        setAuditRecords([])
        setAuditEntries([])
        setOperatorRecords([])
        setPendingApplicationCount(0)
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
  const moreSectionActive = moreNavGroups.some((group) => group.items.some((item) => item.label === section))

  useEffect(() => {
    const navElement = sectionNavRef.current
    const activeItem = activeSectionNavRef.current
    if (!navElement || !activeItem) return
    const navBounds = navElement.getBoundingClientRect()
    const itemBounds = activeItem.getBoundingClientRect()
    if (itemBounds.left < navBounds.left || itemBounds.right > navBounds.right) {
      navElement.scrollLeft += itemBounds.left - navBounds.left - (navElement.clientWidth - activeItem.offsetWidth) / 2
    }
  }, [section])

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

  // Overview alerts. Schools, requests and applications come from the
  // database; billing signals are labelled as sample data wherever shown.
  const overviewAlerts = useMemo<OverviewAlert[]>(() => {
    const alerts: OverviewAlert[] = []
    if (pendingApplicationCount > 0) {
      alerts.push({
        id: 'alerts-applications',
        title: `${pendingApplicationCount} school application${pendingApplicationCount === 1 ? '' : 's'} pending`,
        detail: 'Submitted schools are waiting for a decision.',
        path: '/platform/applications',
        sample: false,
      })
    }
    const openRequests = requestRecords.filter((request) => request.status !== 'Resolved').length
    if (openRequests > 0) {
      alerts.push({
        id: 'alerts-requests',
        title: `${openRequests} request${openRequests === 1 ? '' : 's'} need a decision`,
        detail: 'Contact messages from schools and the public form.',
        path: '/platform/requests',
        sample: false,
      })
    }
    const suspended = schoolRecords.filter((school) => school.status === 'Suspended').length
    if (suspended > 0) {
      alerts.push({
        id: 'alerts-suspended',
        title: `${suspended} school account${suspended === 1 ? '' : 's'} suspended`,
        detail: 'Confirm each suspension still has a reason and an owner.',
        path: '/platform/schools',
        sample: false,
      })
    }
    const billingProblems = billingInvoices.filter((invoice) => invoice.status === 'Overdue').length
      + billingPayments.filter((payment) => payment.status === 'Failed').length
    if (billingProblems > 0) {
      alerts.push({
        id: 'alerts-billing',
        title: `${billingProblems} billing problem${billingProblems === 1 ? '' : 's'}`,
        detail: 'Overdue invoices and payments that failed.',
        path: '/platform/billing',
        sample: true,
      })
    }
    return alerts
  }, [pendingApplicationCount, requestRecords, schoolRecords])

  const action = (message: string) => { setRequest(null); setSchool(null); notify(message) }
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
    if (requestActionBusy) return
    const selected = requestRecords.find((item) => item.id === id)
    if (!selected || selected.source !== 'contact-message' || status !== 'Resolved' || !authUser) {
      notify('This action is not supported for this request.')
      return
    }
    setRequestActionBusy(message)
    try {
      await markPlatformContactMessageHandled(id, authUser.id)
      setRequest(null)
      setPlatformRecordsNonce((value) => value + 1)
      notify(message)
    } catch (cause: unknown) {
      notify(`Request was not updated: ${errorMessage(cause)}`)
    } finally {
      setRequestActionBusy(null)
    }
  }
  const searchResults = [
    ...schoolRecords.map((item) => ({ type: 'School', title: item.name, detail: `${item.code ?? item.id} · ${item.location} · ${item.status}`, path: '/platform/schools' })),
    ...operatorRecords.map((item) => ({ type: 'Operator', title: item.fullName, detail: item.email, path: '/platform/operators' })),
  ].filter((result) => `${result.type} ${result.title} ${result.detail}`.toLowerCase().includes(globalQuery.toLowerCase()))

  return (
    <OperatorModalProvider>
    <div className="operator-liquid min-h-screen bg-[var(--nc-canvas)] text-[var(--nc-text)]">
      <a
        href="#platform-main-content"
        className="sr-only z-50 rounded-lg bg-[var(--nc-surface)] px-4 py-3 font-semibold text-[var(--nc-text)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to workspace content
      </a>
      <main id="platform-main-content" className="platform-main min-h-screen">
        <header className="operator-topbar sticky top-2 z-30 px-4 pt-3 sm:px-7">
          <div className="operator-topbar-frame mx-auto max-w-[1640px] rounded-2xl border px-3 sm:px-4">
          <div className="operator-topbar-main mx-auto flex min-h-14 max-w-[1640px] flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" aria-label="Nom Cloud Operator Center home" onClick={() => navigate('/platform')} className="flex shrink-0 items-center gap-2.5 text-left">
              <img src="/logo-512.png" alt="" className="h-9 w-9 rounded-xl object-contain" />
              <span className="hidden min-[440px]:block">
                <span className="block text-sm font-bold tracking-tight">Nom Cloud</span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-graphite">Operator Center</span>
              </span>
            </button>
            <div className="hidden min-w-0 items-center gap-2 border-l border-[var(--nc-line)] pl-4 md:flex">
              <span className="truncate text-sm font-semibold">{section}</span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${platformRecordsLoading ? 'animate-pulse bg-amber-400' : platformRecordsError ? 'bg-red-500' : 'bg-emerald-500'}`} />
              <span className="hidden text-xs text-graphite lg:inline">{platformRecordsLoading ? 'Connecting' : platformRecordsError ? 'Data unavailable' : 'Connected'}</span>
            </div>
            <div className="relative order-3 min-w-0 basis-full xl:order-none xl:ml-auto xl:basis-auto xl:flex-1 xl:max-w-sm">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
              <input aria-label="Search schools and platform operators" value={globalQuery} onFocus={() => setGlobalSearchOpen(true)} onChange={(event) => { setGlobalQuery(event.target.value); setGlobalSearchOpen(true) }} placeholder="Search schools and operators…" className="input h-10 w-full bg-[var(--nc-surface)] pl-10 pr-12" />
              {globalSearchOpen && globalQuery && <div className="interaction-menu absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-[var(--nc-line)] bg-[var(--nc-surface)] p-2 shadow-card">{searchResults.length ? searchResults.map((result) => <button key={result.type + '-' + result.title} onClick={() => { navigate(result.path); setGlobalSearchOpen(false); setGlobalQuery('') }} className="flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-ink/[0.05] dark:hover:bg-white/[0.06]"><span className="mt-0.5 rounded-lg bg-brand/10 p-2 text-brand"><Search className="h-3.5 w-3.5" /></span><span><span className="block text-[10px] font-bold uppercase tracking-wider text-brand">{result.type}</span><span className="block text-sm font-semibold">{result.title}</span><span className="block text-xs text-graphite">{result.detail}</span></span></button>) : <p className="p-3 text-sm text-graphite">No matching platform records.</p>}</div>}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ThemeSwitcher className="shrink-0" />
              <button type="button" aria-label="Open platform settings" onClick={() => navigate('/platform/settings')} className="hidden min-h-10 min-w-10 shrink-0 rounded-xl p-2 text-graphite hover:bg-ink/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand sm:inline-flex sm:items-center sm:justify-center">
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
          </div>
          <nav className="operator-section-nav relative mx-auto flex max-w-[1640px] items-center" aria-label="Operator center sections">
            <div ref={sectionNavRef} tabIndex={0} className="operator-section-nav-scroll min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
              <div className="flex min-w-max items-center gap-1 py-2">
                {primaryNavGroups.map((group) => (
                  <div key={group.label} role="group" aria-label={`${group.label} sections`} className="operator-nav-group flex shrink-0 items-center gap-1">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const active = section === item.label
                      const count = item.label === 'School Applications' ? pendingApplicationCount : navBadges[item.label]
                      const label = item.label === 'School Applications' ? 'Applications' : item.label === 'Requests & Reviews' ? 'Requests' : item.label === 'Operations Queue' ? 'Ops queue' : item.label
                      return (
                        <button
                          key={item.path}
                          type="button"
                          ref={active ? activeSectionNavRef : undefined}
                          aria-label={item.label}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => navigate(item.path)}
                          className={`operator-nav-item group relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${active ? 'is-active border-brand/30 bg-brand/10 text-brand' : 'border-transparent text-graphite hover:border-[var(--nc-line)] hover:bg-white/[0.06] hover:text-[var(--nc-text)]'}`}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{label}</span>
                          {count ? <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] leading-none text-brand">{count}</span> : null}
                        </button>
                      )
                    })}
                    {group.label !== 'System' && <span className="operator-nav-divider mx-1 h-5 w-px shrink-0" aria-hidden="true" />}
                  </div>
                ))}
              </div>
            </div>
            <div ref={navMenuRef} className="operator-nav-more relative shrink-0">
              <button
                ref={navMenuTriggerRef}
                type="button"
                aria-label={moreSectionActive ? `More sections, current section ${section}` : 'More sections'}
                aria-expanded={navMenuOpen}
                aria-controls="operator-more-sections"
                aria-current={moreSectionActive ? 'page' : undefined}
                onClick={() => setNavMenuOpen((current) => !current)}
                className={`operator-nav-item inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${moreSectionActive ? 'is-active border-brand/30 bg-brand/10 text-brand' : 'border-transparent text-graphite hover:border-[var(--nc-line)] hover:bg-white/[0.06] hover:text-[var(--nc-text)]'}`}
              >
                More
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${navMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {navMenuOpen && (
                <div
                  id="operator-more-sections"
                  className="interaction-menu absolute right-0 top-full z-50 mt-2 max-h-[min(70vh,32rem)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-[var(--nc-line)] p-2"
                >
                  {moreNavGroups.map((group) => (
                    <div key={group.label} role="group" aria-label={`${group.label} sections`} className="py-1">
                      <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-graphite">{group.label}</p>
                      {group.items.map((item) => {
                        const Icon = item.icon
                        const active = section === item.label
                        const count = item.label === 'School Applications' ? pendingApplicationCount : navBadges[item.label]
                        return (
                          <button
                            key={item.path}
                            type="button"
                            aria-current={active ? 'page' : undefined}
                            onClick={() => {
                              navigate(item.path)
                              setNavMenuOpen(false)
                            }}
                            className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${active ? 'bg-brand/10 text-brand' : 'text-graphite hover:bg-ink/[0.05] hover:text-[var(--nc-text)] dark:hover:bg-white/[0.06]'}`}
                          >
                            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="flex-1">{item.label}</span>
                            {count ? <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] leading-none text-brand">{count}</span> : null}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </nav>
          </div>
        </header>
        <div className="operator-content mx-auto max-w-[1500px] px-5 py-8 sm:px-8">
          {platformRecordsError && <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4 text-sm text-red-700 dark:text-red-300"><span>Could not load platform records: {platformRecordsError}</span>{authUser ? <Button variant="outline" size="sm" onClick={() => setPlatformRecordsNonce((value) => value + 1)}>Retry</Button> : <Button variant="outline" size="sm" onClick={() => navigate('/login')}>Sign in</Button>}</div>}
          {section === 'Overview' && <OverviewSection onSchool={setSchool} onRequest={setRequest} navigate={navigate} notify={notify} schools={schoolRecords} requests={requestRecords} auditRows={auditRecords} pendingApplicationCount={pendingApplicationCount} operatorCount={activeOperators} alerts={overviewAlerts} loading={platformRecordsLoading} />}
          {section === 'Action Center' && <ActionCenterSection onSchool={setSchool} onRequest={setRequest} navigate={navigate} schools={schoolRecords} requests={requestRecords} pendingApplicationCount={pendingApplicationCount} operators={operatorRecords} state={inboxState} onStateChange={setInboxState} notify={notify} operator={displayName} loading={platformRecordsLoading} />}
          {section === 'Schools' && (platformRecordsLoading ? <div className="py-12 text-center"><InlineLoader label="Loading schools" state="searching" /></div> : <SchoolsView schools={filteredSchools} query={query} setQuery={setQuery} filter={schoolFilter} setFilter={setSchoolFilter} onSchool={setSchool} onNotify={() => navigate('/platform/applications')} />)}
          {section === 'School Applications' && <PlatformApprovalPanel />}
          {section === 'People' && <PeopleSection onNotify={notify} operator={displayName} />}
          {section === 'Communications' && <CommunicationsSection onNotify={notify} operator={displayName} />}
          {section === 'Requests & Reviews' && <RequestsSection requests={requestRecords} operators={operatorRecords} work={requestWork} onWorkChange={setRequestWork} onResolve={updateRequest} onOpenSchool={(name) => { const match = schoolRecords.find((item) => item.name === name); if (match) setSchool(match); else notify('That school is not registered on the platform, so no record can be opened.') }} notify={notify} operator={displayName} />}
          {section === 'Operations Queue' && authUser && <OperationsView currentPath={currentPath} authUserId={authUser.id} schools={schoolRecords} operators={operatorRecords} navigate={navigate} notify={notify} />}
          {section === 'Operators' && (platformRecordsLoading ? <div className="py-12 text-center"><InlineLoader label="Loading operators" state="searching" /></div> : <OperatorsSection operators={operatorRecords} onNotify={notify} operator={displayName} />)}
          {section === 'Analytics' && <AnalyticsSection onNotify={notify} onNavigate={navigate} operator={displayName} />}
          {section === 'Activity' && <ActivitySection onNotify={notify} onNavigate={navigate} operator={displayName} />}
          {section === 'Features' && <FeaturesSection onNotify={notify} operator={displayName} />}
          {section === 'Billing' && <BillingSection onNotify={notify} operator={displayName} />}
          {section === 'Data' && <DataSection onNotify={notify} operator={displayName} />}
          {section === 'Settings' && <SettingsSection onEmergency={() => setEmergencyOpen(true)} onSignOut={() => setSignOutOpen(true)} notify={notify} fullName={displayName} email={displayEmail} role={operatorRole} provider={(authUser?.app_metadata?.provider as string | undefined) ?? null} accountCreatedAt={authUser?.created_at ?? null} lastSignInAt={(authUser as { last_sign_in_at?: string } | null)?.last_sign_in_at ?? null} platform={{ schoolCount: schoolRecords.length, studentCount: totalStudents, teacherCount: totalTeachers, pendingApplications: pendingApplicationCount, operatorCount: activeOperators, requestCount: requestRecords.length, connected: !platformRecordsLoading && !platformRecordsError, error: platformRecordsError }} />}
        </div>
      </main>
      {toast && <div className="operator-toast fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-xl dark:bg-white dark:text-ink"><Check className="h-4 w-4 text-emerald-400" />{toast}</div>}
      <SchoolProfileModal
        school={school}
        requests={requestRecords}
        auditEntries={auditEntries}
        busy={schoolActionBusy}
        onClose={() => setSchool(null)}
        onOpenRequest={(item) => { setSchool(null); setRequest(item) }}
        onStatusChange={(...args) => {
          if (schoolActionBusy) return
          void updateSchool(...args)
        }}
      />
      <RequestReviewModal
        request={request}
        schools={schoolRecords}
        decisionBusy={requestActionBusy}
        onClose={() => { if (!requestActionBusy) setRequest(null) }}
        onDecision={updateRequest}
        onNoteSaved={notify}
        onOpenSchool={(item) => { setRequest(null); setSchool(item) }}
      />
      <OperatorModal operator={selectedOperator ?? operator} onClose={() => { setOperator(null); setSelectedOperator(null) }} onAction={notify} />
      <Modal open={emergencyOpen} onClose={() => setEmergencyOpen(false)} title="Emergency controls" description="Unavailable: these controls are not connected to live access changes or audit logging." size="md" footer={<Button variant="outline" onClick={() => setEmergencyOpen(false)}>Close</Button>}><div className="space-y-2">{['Suspend a school account', 'Revoke all sessions for a user', 'Restrict an operator account', 'Put platform into maintenance mode'].map((item) => <button key={item} type="button" disabled className="flex w-full cursor-not-allowed items-center gap-3 rounded-2xl border border-red-500/15 p-4 text-left text-sm font-semibold text-red-700 opacity-60 dark:text-red-300"><Ban className="h-4 w-4" />{item}<ChevronRight className="ml-auto h-4 w-4" /></button>)}</div></Modal>
      <Modal open={signOutOpen} onClose={() => { if (!signOutPending) setSignOutOpen(false) }} title="Sign out?" description="Are you sure you want to sign out of Nom Cloud?" size="sm" footer={<><Button variant="outline" disabled={signOutPending} onClick={() => setSignOutOpen(false)}>Cancel</Button><Button variant="danger" loading={signOutPending} onClick={() => void handleLogout()}>{signOutPending ? 'Signing out…' : 'Sign Out'}</Button></>}><div /></Modal>
    </div>
    </OperatorModalProvider>
  )
}



function SchoolsView({ schools: list, query, setQuery, filter, setFilter, onSchool, onNotify }: { schools: School[]; query: string; setQuery: (v: string) => void; filter: 'All' | SchoolStatus; setFilter: (v: 'All' | SchoolStatus) => void; onSchool: (school: School) => void; onNotify: (message: string) => void }) {
  return <>
    <SectionHeader eyebrow="Organization directory" title="Schools" description="Registered schools, their current account status, and available organization records." action={<Button variant="outline" size="sm" onClick={() => onNotify('New schools must be submitted through the public application form.')}><Building2 className="h-4 w-4" /> School applications</Button>} />
    <div className="mb-5 flex flex-col gap-3 sm:flex-row">
      <div className="relative min-w-0 flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search schools, IDs, or locations…" className="input pl-10" /></div>
      <div role="group" aria-label="Filter schools by status" className="flex min-w-0 gap-2 overflow-x-auto">{(['All', 'Active', 'Pending', 'Under review', 'Suspended', 'Closed'] as const).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold ${filter === item ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white text-graphite dark:bg-white/[0.06]'}`}>{item}</button>)}</div>
    </div>
    <div className="overflow-hidden rounded-3xl border border-ink/[0.07] bg-white shadow-soft dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="hidden grid-cols-[2fr_1.4fr_1fr_1fr_1fr_auto] gap-4 border-b border-ink/[0.06] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-graphite dark:border-white/[0.08] xl:grid"><span>School</span><span>Administrator</span><span>Plan</span><span>Students</span><span>Status</span><span /></div>
      {list.length ? list.map((item) => <button key={item.id} onClick={() => onSchool(item)} className="grid min-w-0 w-full gap-3 border-b border-ink/[0.06] px-5 py-4 text-left transition last:border-0 hover:bg-ink/[0.025] dark:border-white/[0.08] xl:grid-cols-[2fr_1.4fr_1fr_1fr_1fr_auto] xl:items-center xl:gap-4"><span className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 font-bold text-brand">{item.name.charAt(0)}</span><span className="min-w-0"><span className="block break-words text-sm font-semibold">{item.name}</span><span className="block break-words text-xs text-graphite">{item.code ?? item.id} · {item.location}</span></span></span><span className="min-w-0 break-words text-sm text-graphite">{item.admin}<span className="block break-words text-xs">{item.email}</span></span><span className="break-words text-sm font-medium">{item.plan}</span><span className="break-words text-sm font-medium">{item.students.toLocaleString()}<span className="block text-xs text-graphite">{item.teachers} teachers</span></span><Status value={item.status} /><ChevronRight className="hidden h-4 w-4 text-graphite xl:block" /></button>) : <p className="p-8 text-center text-sm text-graphite">No schools match this search or status.</p>}
    </div>
  </>
}


function OperatorsView({ operators, onNotify, onOperator }: { operators: PlatformOperatorRecord[]; onNotify: (message: string) => void; onOperator: (operator: PlatformOperatorRecord) => void }) {
  return <><SectionHeader eyebrow="People & access" title="Operators" description="Platform access grants recorded in Nom Cloud." /><div className="overflow-hidden rounded-3xl border border-ink/[0.07] bg-white shadow-soft dark:border-white/[0.08] dark:bg-white/[0.04]"><div className="hidden grid-cols-[1.5fr_1.2fr_1fr_1fr_auto] gap-4 border-b border-ink/[0.06] px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-graphite dark:border-white/[0.08] xl:grid"><span>Operator</span><span>Role</span><span>Access granted</span><span>Status</span><span>Actions</span></div>{operators.length ? operators.map((item) => {
    const active = item.revokedAt === null
    return <div key={item.id} className="grid min-w-0 gap-3 border-b border-ink/[0.06] px-5 py-4 last:border-0 dark:border-white/[0.08] xl:grid-cols-[1.5fr_1.2fr_1fr_1fr_auto] xl:items-center xl:gap-4"><span className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{item.fullName.charAt(0)}</span><span className="min-w-0"><span className="block break-words text-sm font-semibold">{item.fullName}</span><span className="block break-words text-xs text-graphite">{item.email}</span></span></span><span className="break-words text-sm text-graphite">Platform administrator</span><span className="break-words text-xs text-graphite">{new Date(item.grantedAt).toLocaleString()}</span><Status value={active ? 'Active' : 'Revoked'} /><span className="flex flex-wrap gap-2"><button onClick={() => onOperator(item)} className="rounded-xl border border-ink/10 px-3 py-2 text-xs font-semibold dark:border-white/10">View</button>{active && <button onClick={() => onNotify('Operator access revocation is not available from this client.')} className="rounded-xl bg-ink/[0.05] p-2 dark:bg-white/[0.08]" title="Manage operator access" aria-label={`Manage access for ${item.fullName}`}><RotateCcw className="h-3.5 w-3.5" /></button>}</span></div>
  }) : <p className="p-6 text-sm text-graphite">No operator access records were found.</p>}</div></>
}

function OperatorModal({ operator, onClose, onAction }: { operator: PlatformOperatorRecord | null; onClose: () => void; onAction: (message: string) => void }) {
  // Only what platform_admins actually stores: who they are and when the grant
  // was made. The previous version showed a fixed creation date, "last active"
  // time, device count and a sentence of invented recent actions.
  return (
    <Modal
      open={Boolean(operator)}
      onClose={onClose}
      size="lg"
      title={operator?.fullName ?? ''}
      description="Operator record"
      footer={operator ? <Button variant="outline" onClick={() => onAction('Operator changes are not available yet.')}>Manage access</Button> : null}
    >
      {operator && (
        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-2xl bg-ink/[0.035] p-4 dark:bg-white/[0.05]">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
              {operator.fullName.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="font-semibold">{operator.fullName}</p>
              <p className="break-words text-sm text-graphite">{operator.email}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink/10 p-4 dark:border-white/10">
              <p className="text-xs text-graphite">Access granted</p>
              <p className="mt-2 text-sm font-semibold">{new Date(operator.grantedAt).toLocaleDateString()}</p>
            </div>
            <div className="rounded-2xl border border-ink/10 p-4 dark:border-white/10">
              <p className="text-xs text-graphite">Status</p>
              <p className="mt-2 text-sm font-semibold">{operator.revokedAt ? 'Revoked' : 'Active'}</p>
            </div>
          </div>
          <p className="text-xs text-graphite">
            Sign-in history and per-operator permissions are not recorded yet, so nothing more is shown here.
          </p>
        </div>
      )}
    </Modal>
  )
}



function SchoolModal({ school, onClose, onAction, onStatusChange }: { school: School | null; onClose: () => void; onAction: (message: string) => void; onStatusChange: (id: string, status: SchoolStatus, message: string) => void }) {
  const [tab, setTab] = useState('Overview')
  useEffect(() => { if (school) setTab('Overview') }, [school])
  return <Modal open={Boolean(school)} onClose={onClose} size="xl" title={school?.name} description={school ? `${school.id} · ${school.location}` : ''} footer={school ? <><Button variant="outline" onClick={() => onAction('School marked for review')}>Request changes</Button>{school.status === 'Suspended' ? <Button variant="accent" onClick={() => onStatusChange(school.id, 'Active', 'School reactivated')}>Reactivate school</Button> : <Button variant="danger" onClick={() => onStatusChange(school.id, 'Suspended', 'School suspended')}>Suspend school</Button>}{school.status === 'Pending' && <Button variant="accent" onClick={() => onStatusChange(school.id, 'Active', 'School approved')}>Approve school</Button>}</> : null}>{school && <><div className="flex gap-1 overflow-x-auto border-b border-ink/[0.07] pb-3 dark:border-white/[0.08]">{['Overview', 'School Information', 'Users', 'Activity', 'Requests', 'Documents', 'Billing', 'Permissions', 'Audit History'].map((item) => <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${tab === item ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'text-graphite hover:bg-ink/[0.05]'}`}>{item}</button>)}</div>{tab === 'Overview' && <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2 rounded-2xl border border-brand/15 bg-brand/[0.05] p-4"><p className="text-xs font-semibold uppercase tracking-wider text-brand">Primary contact</p><p className="mt-2 text-sm font-semibold">{school.admin}</p>  <p className="mt-1 break-words text-xs text-graphite">{school.email} · {school.phone}</p></div>{[['Account status', <Status value={school.status} />], ['Subscription', school.plan], ['Students', school.students.toLocaleString()], ['Teachers', school.teachers], ['Registered', school.registered], ['Last activity', school.activity]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-ink/[0.035] p-4 dark:bg-white/[0.05]"><p className="text-xs text-graphite">{label}</p><div className="mt-2 text-sm font-semibold">{value}</div></div>)}<div className="sm:col-span-2 rounded-2xl border border-ink/10 p-4 dark:border-white/10"><div className="flex items-center justify-between"><p className="font-semibold">Internal operator note</p><span className="text-[10px] font-bold uppercase tracking-wider text-brand">Private</span></div><p className="mt-2 text-sm text-graphite">School requested an administrator change. Waiting for verification documents.</p></div></div>}{tab === 'Activity' && <div className="mt-6 space-y-5">{schoolTimeline.map((event) => <div key={event[0]} className="relative flex gap-4 pl-1"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand ring-4 ring-brand/10" /><div><p className="text-xs font-semibold text-graphite">{event[0]}</p><p className="mt-1 text-sm font-semibold">{event[1]}</p><p className="mt-1 text-xs leading-5 text-graphite">{event[2]}</p></div></div>)}</div>}{tab === 'Documents' && <div className="mt-6 space-y-3">{['Organization registration.pdf', 'Administrator identity.pdf', 'School verification photos.zip'].map((document) => <div key={document} className="flex items-center gap-3 rounded-2xl border border-ink/10 p-4 dark:border-white/10"><FileText className="h-4 w-4 text-brand" /><span className="flex-1 text-sm font-semibold">{document}<span className="block text-xs font-normal text-graphite">Uploaded Sep 18, 2026 · Verification record</span></span><button onClick={() => onAction(`${document} preview opened`)} className="rounded-xl border border-ink/10 px-3 py-2 text-xs font-semibold dark:border-white/10">Preview</button></div>)}</div>}{tab === 'Billing' && <div className="mt-6 grid gap-4 sm:grid-cols-2">{[['Current plan', school.plan], ['Renewal date', 'Oct 08, 2026'], ['Billing status', 'Paid'], ['Usage', '72% of plan limits']].map(([label, value]) => <div key={label} className="rounded-2xl bg-ink/[0.035] p-4 dark:bg-white/[0.05]"><p className="text-xs text-graphite">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>)}</div>}{tab !== 'Overview' && tab !== 'Activity' && tab !== 'Documents' && tab !== 'Billing' && <div className="mt-6 rounded-2xl bg-ink/[0.035] p-6 text-sm text-graphite dark:bg-white/[0.05]"><p className="font-semibold text-ink dark:text-white">{tab}</p><p className="mt-2">Mock {tab.toLowerCase()} for {school.name} is ready for backend connection.</p></div>}</>}</Modal>
}

function RequestModal({ request, onClose, onAction, onDecision, onSchool }: { request: Request | null; onClose: () => void; onAction: (message: string) => void; onDecision: (id: string, status: RequestStatus, message: string) => void; onSchool: (name: string) => void }) {
  return <Modal open={Boolean(request)} onClose={onClose} size="lg" title={request?.type} description={request ? `${request.id} · ${request.school}` : ''} footer={request ? <><Button variant="outline" onClick={() => onDecision(request.id, 'In review', 'Changes requested from school')}>Request changes</Button><Button variant="danger" onClick={() => onDecision(request.id, 'Resolved', 'Request rejected')}>Reject</Button><Button variant="accent" onClick={() => onDecision(request.id, 'Resolved', 'Request approved')}>Approve</Button></> : null}>{request && <div className="space-y-5"><div className="rounded-2xl border border-brand/15 bg-brand/[0.06] p-4"><p className="text-sm font-semibold">{request.summary}</p><p className="mt-2 text-xs text-graphite">Submitted by {request.submittedBy} · {request.submitted}</p></div><div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-semibold text-graphite">School context</p><button onClick={() => onSchool(request.school)} className="mt-2 flex w-full items-center justify-between rounded-2xl border border-ink/10 p-4 text-left text-sm font-semibold hover:bg-ink/[0.03] dark:border-white/10 dark:hover:bg-white/[0.05]">Open {request.school}<Eye className="h-4 w-4 text-graphite" /></button></div><div><p className="text-xs font-semibold text-graphite">Current status</p><div className="mt-2 rounded-2xl border border-ink/10 p-4 dark:border-white/10"><Status value={request.status} /></div></div></div><div><p className="text-xs font-semibold text-graphite">Operator notes</p><textarea placeholder="Add context for the next operator…" className="input mt-2 min-h-24 resize-none" /></div><div className="rounded-2xl bg-ink/[0.035] p-4 text-sm dark:bg-white/[0.05]"><p className="font-semibold">Previous actions</p><p className="mt-2 text-xs text-graphite">No previous actions recorded. All decisions will be added to the audit log.</p></div></div>}</Modal>
}

import {
  ArrowUpRight,
  Buildings as Building2,
  CaretRight as ChevronRight,
  ClipboardText as ClipboardCheck,
  Clock as Clock3,
  FileText,
  Megaphone,
  Pulse as Activity,
  ShieldWarning,
  UserCircle,
  Users,
  Warning as AlertTriangle,
} from '@phosphor-icons/react'
import Button from '@/components/ui/Button'
import { InlineLoader, Skeleton } from '@/components/ui/Loader'
import Status from '@/pages/platform/StatusPill'
import type { Request, School } from '@/pages/platform/types'
import { downloadCsv, KpiTile, Panel, PrototypeNotice, SectionHeader, SampleTag } from './PrototypeKit'

/**
 * Overview: the screen an operator lands on.
 *
 * Everything it reports comes from records the platform actually loaded —
 * schools, students, contact requests, pending applications, operators and the
 * audit log. The only sampled figures are the two alert counts taken from the
 * health and security prototypes, and those are labelled as sample data rather
 * than presented as live monitoring.
 */

export interface OverviewAlert {
  id: string
  title: string
  detail: string
  path: string
  sample: boolean
}

interface OverviewSectionProps {
  schools: School[]
  requests: Request[]
  auditRows: string[][]
  pendingApplicationCount: number
  operatorCount: number
  alerts: OverviewAlert[]
  onSchool: (school: School) => void
  onRequest: (request: Request) => void
  navigate: (path: string) => void
  notify: (message: string) => void
  loading?: boolean
}

interface Task {
  id: string
  label: string
  detail: string
  path: string
  icon: typeof Activity
  tone: 'warning' | 'danger' | 'info'
}

export default function OverviewSection({
  schools,
  requests,
  auditRows,
  pendingApplicationCount,
  operatorCount,
  alerts,
  onSchool,
  onRequest,
  navigate,
  notify,
  loading = false,
}: OverviewSectionProps) {
  const totalStudents = schools.reduce((sum, school) => sum + school.students, 0)
  const totalTeachers = schools.reduce((sum, school) => sum + school.teachers, 0)
  const activeSchools = schools.filter((school) => school.status === 'Active').length
  const suspendedSchools = schools.filter((school) => school.status === 'Suspended')
  const openRequests = requests.filter((request) => request.status !== 'Resolved')
  const attentionSchools = schools.filter((school) => school.status !== 'Active').slice(0, 5)

  const tasks: Task[] = [
    ...(pendingApplicationCount > 0
      ? [{
          id: 'applications',
          label: `${pendingApplicationCount} school application${pendingApplicationCount === 1 ? '' : 's'} awaiting a decision`,
          detail: 'Review, verify and approve or reject each submission.',
          path: '/platform/applications',
          icon: FileText,
          tone: 'warning' as const,
        }]
      : []),
    ...(openRequests.length > 0
      ? [{
          id: 'requests',
          label: `${openRequests.length} contact request${openRequests.length === 1 ? '' : 's'} unanswered`,
          detail: 'Assigned reviewers can reply, escalate or close each one.',
          path: '/platform/requests',
          icon: ClipboardCheck,
          tone: 'info' as const,
        }]
      : []),
    ...(suspendedSchools.length > 0
      ? [{
          id: 'suspended',
          label: `${suspendedSchools.length} school account${suspendedSchools.length === 1 ? '' : 's'} suspended`,
          detail: 'Confirm each suspension still has a reason and an owner.',
          path: '/platform/schools',
          icon: Building2,
          tone: 'danger' as const,
        }]
      : []),
    ...(alerts.length > 0
      ? [{
          id: 'alerts',
          label: `${alerts.length} alert${alerts.length === 1 ? '' : 's'} across health, security and billing`,
          detail: 'Open the action centre to assign and resolve them.',
          path: '/platform/actions',
          icon: AlertTriangle,
          tone: 'danger' as const,
        }]
      : []),
  ]

  const exportReport = () => {
    if (schools.length === 0 && requests.length === 0) {
      notify('There are no platform records to export yet.')
      return
    }
    downloadCsv('platform-overview.csv', [
      ['Section', 'Item', 'Value', 'Detail'],
      ['KPI', 'Registered schools', schools.length, `${activeSchools} active`],
      ['KPI', 'Active students', totalStudents, 'Across registered schools'],
      ['KPI', 'Teachers', totalTeachers, 'Across registered schools'],
      ['KPI', 'Open requests', openRequests.length, `${pendingApplicationCount} school applications pending`],
      ['KPI', 'Operators with platform access', operatorCount, 'From platform_admins'],
      ...schools.map((school) => ['School', school.name, school.status, `${school.code ?? school.id} · ${school.plan} · ${school.students} students`]),
      ...requests.map((request) => ['Request', request.id, request.status, `${request.type} · ${request.school}`]),
    ])
    notify('Platform overview exported as CSV.')
  }

  const quickActions: Array<{ label: string; detail: string; path: string; icon: typeof Activity }> = [
    { label: 'Review applications', detail: `${pendingApplicationCount} pending`, path: '/platform/applications', icon: FileText },
    { label: 'Open request queue', detail: `${openRequests.length} open`, path: '/platform/requests', icon: ClipboardCheck },
    { label: 'Find a school', detail: `${schools.length} registered`, path: '/platform/schools', icon: Building2 },
    { label: 'Invite an operator', detail: `${operatorCount} with access`, path: '/platform/operators', icon: UserCircle },
    { label: 'Announce to schools', detail: 'Communications', path: '/platform/communications', icon: Megaphone },
    { label: 'Check the audit log', detail: `${auditRows.length} events`, path: '/platform/audit', icon: Activity },
  ]

  return (
    <div>
      <SectionHeader
        eyebrow="Platform overview"
        title="Platform overview"
        description="Platform-wide numbers, what needs operator attention, and the fastest route into every task."
        action={<Button variant="outline" size="sm" onClick={exportReport}><ArrowUpRight className="h-4 w-4" /> Export report</Button>}
      />

      <PrototypeNotice
        scope="Trend, health and billing alerts"
        detail="School, student, teacher, request and operator counts are read from the database. Alert counts marked as sample data come from the health, security and billing prototypes until those sources are connected."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Registered schools" value={loading ? <Skeleton className="h-8 w-24" /> : schools.length.toLocaleString()} detail={!loading ? `${activeSchools} active${suspendedSchools.length ? ` · ${suspendedSchools.length} suspended` : ''}` : undefined} icon={Building2} />
        <KpiTile label="Active students" value={loading ? <Skeleton className="h-8 w-24" /> : totalStudents.toLocaleString()} detail={!loading ? `${totalTeachers.toLocaleString()} teachers across registered schools` : undefined} icon={Users} />
        <KpiTile label="Open requests" value={loading ? <Skeleton className="h-8 w-24" /> : openRequests.length.toLocaleString()} detail={!loading ? `${pendingApplicationCount} school applications pending` : undefined} icon={ClipboardCheck} tone={openRequests.length > 0 ? 'warning' : 'success'} />
        <KpiTile label="Platform operators" value={loading ? <Skeleton className="h-8 w-24" /> : operatorCount.toLocaleString()} detail={!loading ? 'Holding active platform access' : undefined} icon={ShieldWarning} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel
            title="Pending tasks"
            description="Ordered by what blocks schools first."
            action={<button onClick={() => navigate('/platform/actions')} className="text-xs font-semibold text-brand">Open action centre <ArrowUpRight className="inline h-3.5 w-3.5" /></button>}
          >
            {loading ? (
              <div className="py-6"><InlineLoader label="Loading platform records" state="searching" /></div>
            ) : tasks.length ? (
              <ul className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
                {tasks.map((task) => {
                  const Icon = task.icon
                  const tint = task.tone === 'danger'
                    ? 'bg-red-500/10 text-red-600 dark:text-red-300'
                    : task.tone === 'warning'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                      : 'bg-blue-500/10 text-blue-600 dark:text-blue-300'
                  return (
                    <li key={task.id}>
                      <button onClick={() => navigate(task.path)} className="flex w-full items-center gap-3 py-3.5 text-left hover:bg-ink/[0.02] dark:hover:bg-white/[0.03]">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{task.label}</span>
                          <span className="mt-0.5 block text-xs text-graphite">{task.detail}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-graphite" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="py-6 text-sm text-graphite">Nothing is waiting. New applications, requests and alerts appear here as soon as they arrive.</p>
            )}
          </Panel>

          <Panel
            title="Alerts"
            description="Health, security and billing signals that need a decision."
            action={<button onClick={() => navigate('/platform/actions')} className="text-xs font-semibold text-brand">Triage all <ArrowUpRight className="inline h-3.5 w-3.5" /></button>}
          >
            {alerts.length === 0 ? (
              <p className="py-6 text-sm text-graphite">No open alerts.</p>
            ) : (
              <ul className="space-y-3">
                {alerts.map((alert) => (
                  <li key={alert.id}>
                    <button onClick={() => navigate(alert.path)} className="flex w-full items-start gap-3 rounded-xl border border-ink/[0.07] p-3.5 text-left hover:bg-ink/[0.025] dark:border-white/[0.08] dark:hover:bg-white/[0.03]">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-300"><AlertTriangle className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{alert.title}</span>
                          {alert.sample && <SampleTag />}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-graphite">{alert.detail}</span>
                      </span>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-graphite" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Schools needing attention"
            description="Exceptions before they become blockers."
            action={<button onClick={() => navigate('/platform/schools')} className="text-xs font-semibold text-brand">View all <ChevronRight className="inline h-3.5 w-3.5" /></button>}
          >
            {attentionSchools.length ? (
              <div className="-mx-2 divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
                {attentionSchools.map((item) => (
                  <button key={item.id} onClick={() => onSchool(item)} className="flex w-full flex-wrap items-center gap-3 px-2 py-3.5 text-left hover:bg-ink/[0.02] dark:hover:bg-white/[0.03]">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink/[0.05] text-sm font-bold text-graphite dark:bg-white/[0.08] dark:text-white">{item.name.charAt(0)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold">{item.name}</span>
                      <span className="block break-words text-xs text-graphite">{item.location} · {item.code ?? item.id}</span>
                    </span>
                    <Status value={item.status} />
                    <ChevronRight className="h-4 w-4 shrink-0 text-graphite" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-6 text-sm text-graphite">All registered schools are active.</p>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Quick actions" description="The routes operators take most often.">
            <div className="grid gap-3 sm:grid-cols-2">
              {quickActions.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.label}
                    onClick={() => navigate(action.path)}
                    className="rounded-xl border border-ink/[0.07] p-3.5 text-left transition hover:border-brand/40 hover:bg-brand/[0.04] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><Icon className="h-4 w-4" /></span>
                    <span className="mt-3 block text-sm font-semibold">{action.label}</span>
                    <span className="mt-0.5 block text-xs text-graphite">{action.detail}</span>
                  </button>
                )
              })}
            </div>
          </Panel>

          <Panel
            title="Requests waiting on an operator"
            description="Newest contact messages from the database."
            action={<span className="text-xs font-semibold text-brand">{openRequests.length} open</span>}
          >
            {openRequests.length ? (
              <div className="-mx-2 divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
                {openRequests.slice(0, 4).map((item) => (
                  <button key={item.id} onClick={() => onRequest(item)} className="flex w-full flex-wrap items-center gap-3 px-2 py-3 text-left hover:bg-ink/[0.02] dark:hover:bg-white/[0.03]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><FileText className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold">{item.type}</span>
                      <span className="block break-words text-xs text-graphite">{item.school} · {item.submittedBy}</span>
                    </span>
                    <Status value={item.status} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-6 text-sm text-graphite">Every request has been answered.</p>
            )}
            <button onClick={() => navigate('/platform/requests')} className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-brand">
              Open request centre <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </Panel>

          <Panel title="Action queue" description="Live counts of everything awaiting a decision.">
            <ul className="space-y-2 text-sm">
              {[
                { label: 'School applications', value: pendingApplicationCount, path: '/platform/applications' },
                { label: 'Open contact requests', value: openRequests.length, path: '/platform/requests' },
                { label: 'Schools needing attention', value: attentionSchools.length, path: '/platform/schools' },
                { label: 'Audit events recorded', value: auditRows.length, path: '/platform/audit' },
              ].map((row) => (
                <li key={row.label}>
                  <button onClick={() => navigate(row.path)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-ink/[0.035] dark:hover:bg-white/[0.05]">
                    <span className="min-w-0 break-words text-left text-graphite">{row.label}</span>
                    <span className="flex shrink-0 items-center gap-2 text-sm font-semibold">{row.value.toLocaleString()}<ChevronRight className="h-4 w-4 text-graphite" /></span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Recent platform activity"
          description="Read-only events from the audit log."
          action={<button onClick={() => navigate('/platform/audit')} className="text-xs font-semibold text-brand">Audit logs <ArrowUpRight className="inline h-3.5 w-3.5" /></button>}
        >
          {auditRows.length ? (
            <div className="divide-y divide-ink/[0.06] dark:divide-white/[0.08]">
              {auditRows.slice(0, 5).map((row) => (
                <div key={`${row[0]}-${row[3]}`} className="grid gap-2 py-3.5 text-sm sm:grid-cols-[1.3fr_1fr_1.5fr_1fr_auto] sm:items-center">
                  <span className="flex items-center gap-2 font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-500" />{row[0]}</span>
                  <span className="min-w-0 break-words text-graphite">{row[1]}</span>
                  <span className="min-w-0 break-words text-graphite">{row[2]}</span>
                  <span className="text-xs text-graphite">{row[3]}</span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{row[4]}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-sm text-graphite">No audit events have been recorded yet.</p>
          )}
        </Panel>

        <Panel title="Recent decisions" description="What operators did on this platform recently.">
          {auditRows.length ? (
            <ol className="space-y-4">
              {auditRows.slice(0, 4).map((row, index) => (
                <li key={`${row[0]}-${row[3]}-${index}`} className="relative flex gap-3 pl-1">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand ring-4 ring-brand/10" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-graphite">{row[3]}</p>
                    <p className="mt-1 text-sm font-semibold">{row[0]}</p>
                    <p className="mt-1 text-xs leading-5 text-graphite">{row[2]} · {row[1]}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-6 text-sm text-graphite">Decision history appears here once operators start acting.</p>
          )}
        </Panel>
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-graphite">
        <Clock3 className="h-3.5 w-3.5" /> Counts refresh whenever the Operator Control Center reloads platform records.
      </p>
    </div>
  )
}

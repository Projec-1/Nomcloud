import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Pulse as Activity,
  BookOpen,
  CalendarCheck,
  ClipboardText,
  FolderSimple,
  UserCircle,
} from '@phosphor-icons/react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import SignOutButton from '@/components/ui/SignOutButton'
import ResourceGate from '@/components/ui/ResourceGate'
import { useAuth } from '@/context/AuthContext'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import { useNotifications } from '@/hooks/useCommunications'
import { markNotificationsRead } from '@/services/communicationService'
import { fetchExams, type ExamView } from '@/services/teachingRecordsService'
import { deriveResourceState } from '@/lib/resourceState'
import { toError } from '@/utils/errorMessage'

// ---------------------------------------------------------------------------
// The teacher workspace sections that are not a page of their own.
//
// FOUR ROUTES REACH THIS FILE: /resources, /profile, /notifications and /exams.
// Everything else under /app/teacher has its own connected page, so the
// unreachable sections that used to live here — an overview, a timetable, a
// student list, assignments, lessons, class performance — have been removed.
// They existed only to render invented rows, and the routes that would have
// shown them point elsewhere.
//
// WHAT IS REAL AND WHAT IS NOT. Notifications and exams read the live
// notifications and exams tables, scoped by RLS to this teacher. The profile
// section shows the identity the session actually holds. Teaching resources has
// no table behind it at all, so it says so rather than listing files that do not
// exist. The layout, Header/Shell wrapper and card styling are unchanged.
// ---------------------------------------------------------------------------

export default function TeacherWorkspace() {
  const location = useLocation()
  const section = location.pathname.split('/').pop() ?? 'teacher'

  if (section === 'resources') return <ResourceView />
  if (section === 'profile') return <ProfileView />
  if (section === 'exams') return <ExamsView />
  return <NotificationsView />
}

function Header({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-graphite">{description}</p>
      </div>
      {action}
    </div>
  )
}

function Shell({ children, title, description, action }: { children: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div>
      <Header eyebrow="Teacher workspace" title={title} description={description} action={action} />
      {children}
    </div>
  )
}

/** A section the product does not have a data source for yet. Never invented numbers. */
function NotAvailable({ icon, title, description }: { icon: typeof BookOpen; title: string; description: string }) {
  return <EmptyState icon={icon} title={title} description={description} />
}

function ResourceView() {
  return (
    <Shell title="Teaching Resources" description="Find, organize, and reuse resources for your classes.">
      <NotAvailable
        icon={FolderSimple}
        title="Teaching resources are not available yet"
        description="Nom Cloud does not store lesson resources yet, so there is nothing to show here. Your classes, timetable, attendance, grades and homework are all live in the other sections."
      />
    </Shell>
  )
}

function ProfileView() {
  const { authUser, profile, school, memberships } = useAuth()
  const roles = memberships.map((membership) => membership.role)

  return (
    <Shell title="Teacher Profile" description="Your details as the school has recorded them.">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
              {(profile?.full_name ?? authUser?.email ?? '?').trim().charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="font-semibold">{profile?.full_name ?? '—'}</h2>
              <p className="text-sm text-graphite">
                {roles.includes('teacher') ? 'Teacher' : roles[0] ?? 'Staff'}
                {school?.name ? ` · ${school.name}` : ''}
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-3 text-sm">
            <Field label="Full name" value={profile?.full_name} />
            <Field label="Email" value={authUser?.email} />
            <Field label="Phone" value={profile?.phone} />
            <Field label="School" value={school?.name} />
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Security &amp; preferences</h2>
          <p className="mt-3 text-sm text-graphite">
            Editing your own details and notification preferences is not available yet — ask your school to correct
            anything that is wrong. You can change your password from the sign-in page using &ldquo;Forgot
            password?&rdquo;.
          </p>
          <SignOutButton className="btn-outline mt-5 inline-flex items-center gap-2 border-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400">
            Sign out
          </SignOutButton>
        </div>
      </div>
    </Shell>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink/5 pb-2.5 last:border-b-0 dark:border-white/10">
      <span className="text-graphite">{label}</span>
      <span className="text-right font-medium text-ink dark:text-white">{value?.trim() ? value : '—'}</span>
    </div>
  )
}

function NotificationsView() {
  const { state, notifications, schoolId, userId, reload } = useNotifications()

  // Opening the page is the acknowledgement, which is how the rest of the
  // product treats a notification list.
  useEffect(() => {
    const unread = notifications.filter((item) => !item.readAt).map((item) => item.id)
    if (!schoolId || !userId || unread.length === 0) return
    void markNotificationsRead(schoolId, userId, unread).then(reload).catch(() => {
      // Not fatal: the list is still correct, it just stays marked unread.
    })
  }, [notifications, schoolId, userId, reload])

  return (
    <Shell title="Notifications" description="Updates from administration and activity in your assigned classes.">
      <ResourceGate
        state={state}
        empty={{
          icon: Activity,
          title: 'No notifications yet',
          description: 'School updates and activity in your classes will appear here.',
        }}
        deniedHint="Notifications are available to signed-in staff."
      >
        {(rows) => (
          <div className="card divide-y divide-ink/5">
            {rows.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-5">
                <Activity className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{item.title}</p>
                  {item.body && <p className="mt-1 text-sm text-graphite">{item.body}</p>}
                </div>
                {!item.readAt && <Badge tone="brand">New</Badge>}
              </div>
            ))}
          </div>
        )}
      </ResourceGate>
    </Shell>
  )
}

function ExamsView() {
  const { school } = useAuth()
  const schoolId = school?.id ?? null
  const { state: classState, classes } = useTeacherClasses()
  const [exams, setExams] = useState<ExamView[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)
  const classIds = useMemo(() => classes.map((item) => item.id), [classes])
  // ExamView carries classId, not a class name, so the name comes from the
  // teacher's own classes rather than a field the service does not return.
  const classNameById = useMemo(() => new Map(classes.map((item) => [item.id, item.name])), [classes])

  useEffect(() => {
    let cancelled = false
    if (classState.status !== 'ready' || !schoolId) return
    if (classIds.length === 0) {
      setExams([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    fetchExams(schoolId, classIds)
      .then((rows) => {
        if (!cancelled) setExams(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toError(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, classIds, classState.status, nonce])

  const state = deriveResourceState<ExamView[]>({
    isLoading: classState.status === 'loading' || isLoading,
    canAccess: schoolId !== null,
    error: error ?? (classState.status === 'error' ? classState.error : null),
    data: exams,
    retry: () => setNonce((n) => n + 1),
  })

  return (
    <Shell title="Exams" description="Assessments scheduled for the classes you teach.">
      <ResourceGate
        state={state}
        empty={{
          icon: ClipboardText,
          title: 'No exams scheduled yet',
          description: 'Assessments your school schedules for your classes will appear here.',
        }}
        deniedHint="Exams are available to assigned teaching staff."
      >
        {(rows) => (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((exam) => (
              <div key={exam.id} className="card p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-brand">{classNameById.get(exam.classId) ?? 'Class'}</p>
                <h2 className="mt-3 text-lg font-semibold">{exam.name}</h2>
                <p className="mt-2 text-sm text-graphite">
                  {[exam.subjectName, exam.examDate].filter(Boolean).join(' · ') || 'No date set'}
                </p>
                {exam.maxScore !== null && exam.maxScore !== undefined && (
                  <Badge className="mt-5" tone="neutral">
                    Out of {exam.maxScore}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </ResourceGate>
    </Shell>
  )
}

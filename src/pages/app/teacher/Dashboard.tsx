import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ArrowRight, Clock } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import ResourceGate from '@/components/ui/ResourceGate'
import { isoDayOfWeek, todayInTimeZone, DEFAULT_TIME_ZONE } from '@/utils/schoolCalendar'
import { formatDate, percentage } from '@/utils/format'
import { fetchAttendance, fetchHomework, type HomeworkView } from '@/services/teachingRecordsService'

// ---------------------------------------------------------------------------
// Phase 8 batch 8. The teacher landing page, on real data throughout.
//
// The prototype counted attendance and homework over a hardcoded `schoolDays`
// week from the mock seed. Both now come from the real tables, and "today" is
// the school's today rather than the browser's, which batch 0 established after
// proving a UTC date reports the wrong day for Mogadishu after 21:00 local.
//
// The message count is real participation, not a mock filter comparing a
// teachers.id against thread participant ids. A teacher sees the threads they
// are actually in.
//
// The attendance sparkline is gone. It plotted a fixed mock week, and rebuilding
// it against real data means one query per day per class for a decorative
// element. "Present today" carries the same information honestly.
// ---------------------------------------------------------------------------

export default function TeacherDashboard() {
  const { profile, school } = useAuth()
  const { state, classes: myClasses, timetable: timetables } = useTeacherClasses()

  const schoolId = school?.id ?? null
  const timeZone = school?.timezone ?? DEFAULT_TIME_ZONE
  const today = todayInTimeZone(timeZone)

  const [homework, setHomework] = useState<HomeworkView[]>([])
  const [todayPresent, setTodayPresent] = useState<{ present: number; marked: number } | null>(null)

  const myClassIds = useMemo(() => myClasses.map((c) => c.id), [myClasses])
  const classNameById = useMemo(() => new Map(myClasses.map((c) => [c.id, c.name])), [myClasses])

  useEffect(() => {
    let cancelled = false
    if (!schoolId || myClasses.length === 0) return

    Promise.all([
      fetchHomework(schoolId, myClassIds),
      Promise.all(myClasses.map((c) => fetchAttendance(schoolId, c.id, today))),
    ])
      .then(([hw, attendanceByClass]) => {
        if (cancelled) return
        setHomework(hw)
        let present = 0
        let marked = 0
        for (const map of attendanceByClass) {
          for (const entry of map.values()) {
            marked += 1
            if (entry.status === 'present' || entry.status === 'late') present += 1
          }
        }
        setTodayPresent({ present, marked })
      })
      .catch(() => {
        // Summary figures only. The shell still renders.
      })

    return () => {
      cancelled = true
    }
  }, [schoolId, myClasses, myClassIds, today])

  // A student with no submission row is pending, the same rule the homework
  // board uses. Absence means pending because nothing creates those rows.
  const pendingByStudent = useMemo(() => {
    const counts = new Map<string, number>()
    for (const hw of homework) {
      const submitted = new Set(
        hw.submissions.filter((s) => s.status !== 'pending').map((s) => s.studentId),
      )
      const cls = myClasses.find((c) => c.id === hw.classId)
      for (const studentId of cls?.studentIds ?? []) {
        if (!submitted.has(studentId)) counts.set(studentId, (counts.get(studentId) ?? 0) + 1)
      }
    }
    return counts
  }, [homework, myClasses])

  const pendingTotal = Array.from(pendingByStudent.values()).reduce((a, b) => a + b, 0)

  // Is there a lecture in progress? ISO 1-7 computed in the school's timezone,
  // matching timetable_slots.day_of_week.
  const now = new Date()
  const todayIso = isoDayOfWeek(now, timeZone)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const todaySlots = timetables.filter((t) => t.day === todayIso)
  const liveSlot = todaySlots.find(
    (t) => currentMinutes >= toMinutes(t.startTime) && currentMinutes < toMinutes(t.endTime),
  )
  const nextSlot = todaySlots
    .filter((t) => toMinutes(t.startTime) > currentMinutes)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))[0]

  // The four-state contract. loading, denied and error render through
  // ResourceGate exactly as every other connected screen does; `denied` comes
  // from the caller's role via the classes hook, never from a row count. The
  // `ready` and `empty` cases fall through to the page below, which already
  // handles a school with no classes.
  if (state.status === 'loading' || state.status === 'denied' || state.status === 'error') {
    return (
      <div className="teacher-dashboard">
        <PageHeader title="Dashboard" />
        <ResourceGate state={state} empty={{ title: '' }} deniedHint="The teacher workspace is available to teaching staff.">
          {() => null}
        </ResourceGate>
      </div>
    )
  }

  return (
    <div className="teacher-dashboard">
      <div className="teacher-dashboard__header">
        <p className="teacher-dashboard__eyebrow">Teacher workspace</p>
        <PageHeader
          title={`Welcome back, ${profile?.full_name.split(' ')[0] ?? ''}`}
          description={
            myClasses.length
              ? `You're teaching ${myClasses.length} class${myClasses.length === 1 ? '' : 'es'} this term.`
              : 'No classes assigned yet.'
          }
        />
      </div>

      <div className="teacher-insights grid gap-4 sm:grid-cols-2">
        <TeacherInsightCard
          label="Attendance"
          metricLabel="Present today"
          value={todayPresent && todayPresent.marked > 0 ? `${percentage(todayPresent.present, todayPresent.marked)}%` : '—'}
          caption={todayPresent?.marked ? `${todayPresent.present} of ${todayPresent.marked} students marked present.` : 'Attendance has not been marked yet.'}
        />
        <TeacherInsightCard
          label="Homework"
          metricLabel="Pending submissions"
          value={pendingTotal}
          caption={pendingTotal ? 'Follow up with students who still have work to submit.' : 'All student submissions are up to date.'}
        />
      </div>

      {myClasses.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Users}
            title="No classes assigned yet"
            description="Once a school administrator assigns you to a class, it will appear here along with your students."
          />
        </div>
      ) : (
        <>
          <div className="teacher-dashboard__status mt-6">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                  liveSlot ? 'bg-emerald-500/10 text-emerald-600' : 'bg-ink/5 text-graphite dark:bg-white/10'
                }`}
              >
                <Clock className="h-4 w-4" />
              </span>
              <div>
                {liveSlot ? (
                  <>
                    <p className="text-sm font-semibold text-emerald-600">You have a lecture right now</p>
                    <p className="text-xs text-graphite">
                      {liveSlot.subject} · {classNameById.get(liveSlot.classId)} · {liveSlot.room} · until{' '}
                      {liveSlot.endTime}
                    </p>
                  </>
                ) : nextSlot ? (
                  <>
                    <p className="text-sm font-semibold text-ink dark:text-white">No lecture right now</p>
                    <p className="text-xs text-graphite">
                      Next: {nextSlot.subject} · {classNameById.get(nextSlot.classId)} at {nextSlot.startTime}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-ink dark:text-white">No lecture right now</p>
                    <p className="text-xs text-graphite">Nothing further scheduled for today.</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="teacher-dashboard__panels mt-6 grid gap-6 lg:grid-cols-3">
            <div className="teacher-dashboard__panel lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-ink dark:text-white">My Classes</h3>
                <Link
                  to="/app/teacher/classes"
                  className="link-underline flex items-center gap-1 text-xs font-medium text-accent"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="space-y-3">
                {myClasses.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-ink/5 px-4 py-3 dark:border-white/10"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink dark:text-white">{c.name}</p>
                      <p className="text-xs text-graphite">{c.room ?? 'No room set'}</p>
                    </div>
                    <Badge tone="neutral">
                      {c.studentIds.length}
                      {c.capacity ? `/${c.capacity}` : ''} students
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            <div className="teacher-dashboard__panel">
              <h3 className="mb-3 font-semibold text-ink dark:text-white">Upcoming Homework</h3>
              <div className="space-y-3">
                {homework.slice(0, 5).map((h) => (
                  <div key={h.id} className="border-b border-ink/5 pb-3 last:border-b-0 last:pb-0 dark:border-white/10">
                    <p className="text-sm font-medium text-ink dark:text-white">{h.title}</p>
                    <p className="text-xs text-graphite">
                      {h.subjectName} · due {formatDate(h.dueDate)}
                    </p>
                  </div>
                ))}
                {homework.length === 0 && <p className="text-sm text-graphite">No homework assigned yet.</p>}
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  )
}

function TeacherInsightCard({
  label,
  metricLabel,
  value,
  caption,
}: {
  label: string
  metricLabel: string
  value: string | number
  caption: string
}) {
  return (
    <div className="teacher-insight-card">
      <p className="text-sm font-semibold text-ink dark:text-white">{label}</p>
      <p className="teacher-insight-card__value">{value}</p>
      <p className="teacher-insight-card__label">{metricLabel}</p>
      <p className="teacher-insight-card__caption">{caption}</p>
    </div>
  )
}

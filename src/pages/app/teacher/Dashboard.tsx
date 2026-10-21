import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ArrowRight, Clock } from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
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
  const { t } = useLanguage()
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
        <PageHeader title={t('teacher.dashboard.title')} />
        <ResourceGate state={state} empty={{ title: '' }} deniedHint={t('teacher.dashboard.access')}>
          {() => null}
        </ResourceGate>
      </div>
    )
  }

  return (
    <div className="teacher-dashboard">
      <div className="teacher-dashboard__header">
        <p className="teacher-dashboard__eyebrow">{t('teacher.dashboard.eyebrow')}</p>
        <PageHeader
          title={t('teacher.dashboard.welcome', { name: profile?.full_name.split(' ')[0] ?? '' })}
          description={
            myClasses.length
              ? t(myClasses.length === 1 ? 'teacher.dashboard.teachingOne' : 'teacher.dashboard.teachingMany', { count: myClasses.length })
              : t('teacher.dashboard.noClassesTerm')
          }
        />
      </div>

      <div className="teacher-insights grid gap-4 sm:grid-cols-2">
        <TeacherInsightCard
          label={t('teacher.dashboard.attendance')}
          metricLabel={t('teacher.dashboard.presentToday')}
          value={todayPresent && todayPresent.marked > 0 ? `${percentage(todayPresent.present, todayPresent.marked)}%` : '—'}
          caption={todayPresent?.marked
            ? t('teacher.dashboard.attendanceMarked', { present: todayPresent.present, marked: todayPresent.marked })
            : t('teacher.dashboard.notMarked')}
        />
        <TeacherInsightCard
          label={t('teacher.dashboard.homework')}
          metricLabel={t('teacher.dashboard.pendingSubmissions')}
          value={pendingTotal}
          caption={pendingTotal ? t('teacher.dashboard.followUp') : t('teacher.dashboard.submissionsUpToDate')}
        />
      </div>

      {myClasses.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Users}
            title={t('teacher.dashboard.noClasses')}
            description={t('teacher.dashboard.assignedDescription')}
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
                    <p className="text-sm font-semibold text-emerald-600">{t('teacher.dashboard.liveLecture')}</p>
                    <p className="text-xs text-graphite">
                      {liveSlot.subject} · {classNameById.get(liveSlot.classId)} · {liveSlot.room} · {t('teacher.dashboard.until', { time: liveSlot.endTime })}
                    </p>
                  </>
                ) : nextSlot ? (
                  <>
                    <p className="text-sm font-semibold text-ink dark:text-white">{t('teacher.dashboard.noLecture')}</p>
                    <p className="text-xs text-graphite">
                      {t('teacher.dashboard.nextClass', { subject: nextSlot.subject, className: classNameById.get(nextSlot.classId) ?? '', time: nextSlot.startTime })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-ink dark:text-white">{t('teacher.dashboard.noLecture')}</p>
                    <p className="text-xs text-graphite">{t('teacher.dashboard.nothingScheduled')}</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="teacher-dashboard__panels mt-6 grid gap-6 lg:grid-cols-3">
            <div className="teacher-dashboard__panel lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-ink dark:text-white">{t('teacher.dashboard.myClasses')}</h3>
                <Link
                  to="/app/teacher/classes"
                  className="link-underline flex items-center gap-1 text-xs font-medium text-accent"
                >
                  {t('teacher.dashboard.viewAll')} <ArrowRight className="h-3 w-3" />
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
                      <p className="text-xs text-graphite">{c.room ?? t('teacher.dashboard.noRoom')}</p>
                    </div>
                    <Badge tone="neutral">
                      {c.studentIds.length}
                      {t('teacher.dashboard.studentRoster', {
                        count: c.studentIds.length,
                        capacity: c.capacity ? `/${c.capacity}` : '',
                      })}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            <div className="teacher-dashboard__panel">
              <h3 className="mb-3 font-semibold text-ink dark:text-white">{t('teacher.dashboard.upcomingHomework')}</h3>
              <div className="space-y-3">
                {homework.slice(0, 5).map((h) => (
                  <div key={h.id} className="border-b border-ink/5 pb-3 last:border-b-0 last:pb-0 dark:border-white/10">
                    <p className="text-sm font-medium text-ink dark:text-white">{h.title}</p>
                    <p className="text-xs text-graphite">
                      {t('teacher.dashboard.homeworkDue', { subject: h.subjectName, date: formatDate(h.dueDate) })}
                    </p>
                  </div>
                ))}
                {homework.length === 0 && <p className="text-sm text-graphite">{t('teacher.dashboard.noHomework')}</p>}
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
